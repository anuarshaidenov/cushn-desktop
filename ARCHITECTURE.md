# Cushn Desktop: architecture and rules

Cushn Desktop is a local-first budgeting app on Electron. All data lives in one SQLite file on the user's machine: no server, no account, no sync, no analytics (if analytics are ever added, they are opt-in). Two requests go out, neither carrying user data: the daily exchange rates from open.er-api.com, a keyless GET cached so the app works offline with the last rates it got, and the update check against GitHub Releases. Cushn itself sends nothing else; but when the user connects their own agent (Claude Code, Codex, Claude Desktop), what that agent reads through Cushn's tools goes to its model provider (Anthropic or OpenAI) on the user's own account, and Settings → Agents says so.

This file holds what the code doesn't say on its own: why the seams are where they are, the data rules, the behaviour the tests pin, and the gotchas. Shapes live in code: the schema in `src/main/db/schema.ts`, the IPC contract in `src/shared/api.ts`, query keys in `src/renderer/data/keys.ts`, the backup format in `src/shared/backup.ts`. When you change a rule described here, change this file in the same commit.

## 1. Architecture

```
renderer (src/renderer)   routes/ + components/ ──▶ data/ (domain hooks: useQuery, useMutation + invalidation)
                          data/client.ts is the only reader of window.cushn; it unwraps the envelope
        │ window.cushn.<domain>.<method>(args) → IpcResult
preload (src/preload)     contextBridge exposes the bridge generated from cushnContract
        │ ipcRenderer.invoke("cushn:<domain>.<method>")
main (src/main)           ipc/<domain>.ts: zod-parse args → repository → { ok, data } | { ok: false, error }
                          repositories/<domain>.ts: (db, args) → result, writes in db.transaction
                          db/: openDatabase (pragmas, migrations, seed), schema.ts, seed.ts, search.ts (FTS5)
shared (src/shared)       api.ts (contract), domain.ts (row types, Id<T>), errors.ts, money.ts,
                          backup.ts, budgetMarkdown.ts: pure TypeScript, no electron, node or DOM
```

Aliases: `@/*` → `src/renderer/*`, `@shared/*` → `src/shared/*`.

### Why each seam exists

- **Repositories take `db` as their first argument** and import no Electron, so tests run them against `openDatabase(":memory:", { migrationsFolder })` directly. Anything that needs Electron (dialogs, `nativeTheme`, paths) is injected from main's wiring: see `src/main/themeSync.ts`, `src/main/backupDialogs.ts` and `src/main/fileDialogs.ts`.
- **The IPC envelope.** `ipcRenderer.invoke` drops custom error properties, and an error crossing `contextBridge` loses its class. So handlers always resolve to `IpcResult` (`src/shared/errors.ts`), the preload passes it through, and `data/client.ts` rethrows failures as a renderer-side `CushnError` with `code` and `message`. Codes: `BAD_REQUEST`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `NOT_IMPLEMENTED`, `INTERNAL`. Invalid args answer `BAD_REQUEST`; any non-`CushnError` answers `INTERNAL` "Internal error" and is logged in main (the stack never crosses IPC); a call from a frame other than the app's top frame answers `FORBIDDEN`.
- **zod in main.** The renderer renders user Markdown, so every IPC argument is untrusted input.
- **The hooks layer is the only IPC client** (`src/renderer/data/layering.node.test.ts` enforces it), so query keys and invalidation live in one place.
- **The change event** (`CHANGED_CHANNEL`, `cushn:changed`): the one message from main to the renderer. The renderer's own mutations invalidate their roots, but a write made in main (an agent's, through the MCP server in `src/main/mcp/`) has no renderer mutation behind it, so the open screens would keep showing stale data. `src/main/changes.ts` sends `{ roots }` to every live window; it carries query roots, never data, so nothing new crosses IPC and the renderer refetches through the usual `invoke` path. The preload's `onChanged` hands the page only the payload; `data/changes.ts` drops unknown roots and invalidates the rest with `invalidateRoots`, subscribed once in `main.tsx`.
- **Agent tools** (`src/main/mcp/`): the user's own agent (Claude Code, Codex) works with their budgets through an MCP server in main, a thin layer over the repositories like the IPC handlers. `createCushnMcpServer` is transport- and Electron-free; tests speak real MCP to it over the SDK's in-memory transport (`testing.ts`). Each tool is a declarative object (`tool.ts`): a model-facing description, a zod input schema, one repository call, and for a write the query roots it `changes`, sent through the change event after success. Writes apply without confirmation, so **every agent tool is reversible**: budgets go to the trash (never `deleteMany`, `emptyTrash`), `delete_expenses` returns the rows `restore_expenses` takes back, and there is no tool for backup import, settings or label/View/template deletes. Agent writes are checked more strictly than IPC: a currency must be one of `CURRENCY_CODES` (`src/shared/currencies.ts`; a `z.enum`, so `tools/list` shows the codes) and an icon a name from `src/shared/budgetIcons.ts` (a refine that points at `list_icons`, which returns the catalog with labels and keywords); budgets already stored with other values stay readable. Errors mirror the envelope: a `CushnError` answers `isError` with "CODE: message", anything else "INTERNAL: Internal error", logged in main.
- **The MCP socket** (`src/main/mcp/socket.ts`): agents reach the server only through the stdio launcher `~/.cushn/bin/cushn-mcp`, which relays bytes to the running app over a local socket: `<userData>/mcp/cushn.sock` on macOS and Linux (the directory 0700, the socket 0600), a per-user named pipe on Windows. Only the user's own processes can talk to it, and those can already read `cushn.db`, so there is no HTTP server, port, token or Origin check to get wrong, and no browser page can reach it. A pipe name can be guessed, though, and another user could create it first, so **every connection opens with a handshake** (`src/relay/handshake.ts`, on all platforms): on each start the app writes a fresh random secret to `<userData>/mcp/secret` (0600, user-only), the relay sends `cushn-relay/1 <nonce>`, and the app answers HMAC-SHA256(secret, nonce). The app writes nothing before a valid hello (Everyone may read a Windows pipe), and the relay forwards nothing before a valid proof, so an impostor gets none of the agent's traffic. Each connection then gets its own `createCushnMcpServer` (an MCP server holds one client's session), sharing the app's database, rates and change notifier. A socket path over the Unix limit (103 bytes on macOS) fails with an error rather than falling back outside userData; failing to listen is logged, the app runs without agents, and Settings → Agents shows why (`agents.socket`, `describeListenError`).
- **The relay and the launcher** (`src/relay/`, `src/main/agents/launcher.ts`): clients start MCP servers as commands, so `~/.cushn/bin/cushn-mcp` is a small `sh` script (`.cmd` on Windows) that runs the app's own binary with `ELECTRON_RUN_AS_NODE=1` on `out/relay/index.js` with the socket and secret paths and the command that starts the app (`<binary> [project in dev] --background`), a dependency-free script that verifies the app and pipes stdio to the socket. When nothing answers (no secret, `ENOENT`, `ECONNREFUSED`), it starts the app with `ELECTRON_RUN_AS_NODE` removed, detached so it outlives the relay, and retries every 250 ms for up to 30 s. It starts the app again every 5 s in case a launch lost the race to a quitting instance's lock; extra launches are harmless. It reads the secret again after connecting, because a new app writes its secret before it listens and a crash leaves the old one behind. No Node install is needed, and the launcher's path stays stable when the app updates: it is rewritten on every start while a client is connected, so it follows a moved app without searching for one (no `mdfind`, which would run any bundle carrying Cushn's id). An AppImage is mounted afresh under `/tmp/.mount_*` on each launch, a path another user can claim after Cushn quits, so there the launcher runs `$APPIMAGE` itself on a copy of the relay in `~/.cushn/bin/cushn-relay.js`, never on anything inside the mount. The relay is its own bundle (`relayBundle` in `electron.vite.config.ts`), unpacked from the asar; this needs Electron's `RunAsNode` fuse left on.
- **Connecting agents** (`src/main/agents/`, `agents.*`): `detect.ts` finds `claude` and `codex` on the user's login-shell PATH (a GUI app's own PATH misses `~/.local/bin`, Homebrew, npm globals) and asks each for its account; `connections.ts` registers the launcher as the `cushn` MCP server (`claude mcp add --scope user`, a delimited block in `~/.codex/config.toml`, `mcpServers` in Claude Desktop's config) and installs the `cushn` skill (`skill.ts`). Codex's own `codex mcp add` rewrites every server table and drops comments and unknown keys, so Cushn edits that file itself. **Disconnect removes exactly what Connect added**: each write is recorded in `<userData>/agent-connections.json` before it happens, with the exact text or a hash, and anything the user changed since is kept and logged rather than overwritten. A `cushn` server Cushn has no record of answers CONFLICT. CLIs run with an allowlisted env, never `*_API_KEY`, which would switch the user's billing.
- **`src/shared/api.ts` stays free of zod** because the preload bundles it into one CommonJS file.
- **Updates** (`src/main/updater.ts`, `updates.*`): `electron-updater` against GitHub Releases (`publish` in `electron-builder.yml`). Packaged builds only, and only once a window opens: a windowless instance serves an agent's relay, and an update would replace the app under it. It checks then and every 4 hours, downloads in the background, and on `update-downloaded` reports `{ state: "ready", version }` through the change event (root `updates`); the sidebar's Update button renders only then and calls `updates.install` (`quitAndInstall`). Quitting installs a downloaded update anyway. Failures are logged and change nothing, so offline, a private repo or an unsigned macOS build (Squirrel.Mac installs only into a signed app) just never shows the button. After the restart, What's new shows the new version's notes.
- **Exchange rates** (`src/main/repositories/rates.ts`, `rates.get`): main fetches, never the renderer, so the network stays in one place behind injected `fetch` and `now` (Electron's `net.fetch` from `index.ts`; fakes in tests). A cache younger than 12 hours is served as is; otherwise one request (5 s timeout, concurrent calls share it: `index.ts` creates one `createRates` for IPC and MCP), validated with zod. Any failure answers the stale cache, or `null` with none, logged in main, never an error. The provider's terms ask for `RATES_ATTRIBUTION` to be shown wherever the rates are used.

### Electron baseline

- `contextIsolation`, `sandbox`, no `nodeIntegration`. `window.open` is denied and https links go to `shell.openExternal`; the renderer never navigates the page.
- **macOS title bar:** hidden; the traffic lights sit in the top header row (`h-14` in the sidebar, the `h-12` header 4px down in the content card) and `app-drag` makes those rows drag the window. A drag region wins over anything stacked above it, so a new popup type that can overlap a header needs its `data-slot` in the `no-drag` list in `styles.css`.
- **macOS vibrancy:** the window has `vibrancy: "sidebar"` and no `backgroundColor` (Electron would paint the page with it, over the blur). Preferences → Sidebar switches it (`lib/sidebarTransparency.ts`, `localStorage` `sidebar_transparent`, off by default, applied in `main.tsx` before React renders): on, `<html>` gets `vibrant`, which makes `html` and `body` transparent, and a surface opts in with `vibrant:bg-transparent` (the sidebar and the frame around the content card). Off, or with Reduce Transparency, every surface stays opaque over the blur. The switch crossfades the backgrounds under a short-lived `vibrant-fade` class, so theme changes stay instant.
- **Hash history** (`createHashHistory()`): the packaged app loads `file://…/index.html`, where path history breaks on reload.
- **SQLite** (`src/main/db/index.ts`): `journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout = 5000`. Migrations run with `foreign_keys = OFF` (table rebuilds would otherwise cascade deletes); afterwards `foreign_key_check` must be empty, then `foreign_keys = ON`.
- **A copy before migrating** (`src/main/db/migrationCopy.ts`): when a database that already has migrations applied has newer ones pending (an app update), `openDatabase` first saves a consistent copy next to it with `VACUUM INTO` (`cushn-pre-migration-<UTC time>-<last applied tag>.db`; the 3 newest are kept). If the copy can't be saved it doesn't migrate, and the open fails with a message saying the data is unchanged; if a migration fails after the copy, the message gives the copy's path. drizzle already rolls back a migration that throws; the copy covers one that commits and turns out wrong.
- The database is opened, migrated and seeded in `app.whenReady()` before IPC registers and before the window exists, so no call can race the migrations.
- **Move to Applications** (`src/main/applicationsFolder.ts`): run from Downloads or the disk image, macOS translocates the app to a random read-only path, where Squirrel.Mac can't update it and the `cushn-mcp` launcher would record a path that vanishes. So a packaged macOS build's own launch (never a `--background` one) outside an Applications folder asks to move itself, before the database opens, since a move quits and relaunches the app. "Don't ask again" leaves `<userData>/dont-move-to-applications`. Any failure launches as usual.
- **The application menu** (`src/main/menu.ts`) replaces Electron's default: Reload and Toggle Developer Tools only in development, About and Help point at Cushn. Every key is a role's own default, so no key moves between the menu and the page's hotkeys; a test fails on a custom accelerator.
- **Single instance** (`app.requestSingleInstanceLock()`): a second launch quits and focuses the first, so two instances never race the migrations, show each other stale data or fight over the MCP socket. A second launch with `--background` (a relay's) focuses nothing.
- **Running without a window** (`src/main/lifetime.ts`): agents don't need Cushn open. A relay that finds no app starts it with `--background`: database, IPC and socket as usual, but no window, and on macOS `app.dock.hide()`. Cushn runs while a window is open or an agent is connected (`serveMcp`'s `onConnectionsChanged`). Started in the background, it quits 60 s after the last agent leaves, or 60 s after starting if none connects. On Windows and Linux, closing the last window quits right away unless an agent is still connected. On macOS, once the user has opened a window, Cushn behaves like any Mac app and runs until they quit it. Opening Cushn yourself (`activate`, `second-instance`) shows the dock icon and a window. `window-all-closed` has an empty listener so Electron doesn't quit on its own.
- **No light/dark flash:** main reads the stored theme before creating the window and sets `nativeTheme.themeSource` and, off macOS, the window background (`src/main/theme.ts`); `withThemeSync` keeps `themeSource` in step after `settings.update` and after a backup import. `index.html` colours `<html>` inline and `main.tsx` sets the theme class before React renders.

## 2. Adding an IPC method

1. **Contract** (`src/shared/api.ts`): add `name: method<Args, Result>()` under its domain in `cushnContract`. Use branded ids (`Id<"budgets">`) and `null` for absent values; put a non-row result shape next to the contract. Channel, preload function and `CushnApi` follow automatically. A new domain also needs a root in `src/renderer/data/keys.ts` (or an exclusion from `QueryRoot`, next to the contract, if it has no queries, like `backup`).
2. **Repository** (`src/main/repositories/<domain>.ts`): tests first in `<domain>.test.ts` against an in-memory database. Signature `(db, args) => result`; writes inside `db.transaction`; expected failures throw `CushnError(code, message)` with a user-facing message. `delete` is a reserved word: implement `remove` and `export { remove as delete }`.
3. **Handler** (`src/main/ipc/<domain>.ts`): `{ args: <zod schema>, run: ({ db }, args) => repo.fn(db, args) }` (`noArgs` for no-arg methods, `id("<table>")` for ids). `pnpm typecheck` fails until every contract method has a handler whose schema matches its args.
4. **Hook** (`src/renderer/data/<domain>.ts`): queries through a `queryOptions` factory with a key from `keys.ts`; mutations through `useInvalidatingMutation(cushn.<domain>.<name>, [roots it affects])`.
5. **Agent tool**, if an agent should have it and it is reversible (`src/main/mcp/tools/<domain>.ts`): `defineTool({ kind, name, description, input, run })`, every input field `.describe()`d; a write adds `idempotent` and `changes` (the hook's roots). Add it to the file's array (a new file is spread into `cushnTools`) and test it in `tools/<domain>.test.ts` with `connectMcp()`. The description says what it returns, the scope and how to undo it; `server.test.ts` pins the whole catalog.

## 3. Data model

### Glossary

| Term | Meaning | Not to be confused with |
|---|---|---|
| **Template** | A named percentage split (e.g. "50/30/20") made of Categories that sum to 100%. Used to create Budgets. | |
| **Built-in template** | A Template shipped with the app (`isDefault`). Read-only: it can be duplicated, not edited or deleted (`FORBIDDEN`). | |
| **Category** | One line of a Template: name, percentage, description, `editable`. | Allocation |
| **Budget** | One plan for an amount of Income in one Currency, created from a Template. Status `active` or `archived`; trashed or not, independently. | |
| **Allocation** | A Budget's snapshot of one Category, with a stored `amount = income × percentage / 100`. Template edits never touch existing budgets. | Category |
| **Expense** | A titled amount filed under one Allocation of one Budget, with a manual `order`. | |
| **Editable** | "Expenses may be added here" (the add-expense input hides when false). Not "the allocation can be edited". | |
| **View** | A user-made folder of Budgets; a Budget is in zero or one View. Up to 20 Views can be Favorites (sidebar). | Display mode |
| **Display mode** (`BudgetLayout`) | Grid or list layout of the budgets page, stored in `user_settings.budget_view`. | View |
| **Label** | A coloured tag; a Budget has zero or one. | |
| **Icon** | A Budget's optional picture: a `name` from the renderer's catalog (`src/renderer/lib/iconCatalog.ts`), stored as is. An unknown name shows the placeholder; renaming a catalog entry orphans every stored copy. | The app icon (`build/`) |
| **Archive** | Setting a Budget's status to `archived`: done, kept for reference, no expiry; reversible. | Trash |
| **Trash** | A Budget with `deleted_at` set: "Delete" in the UI. Hidden from every read and write except the Trash list, `restore` and the hard delete; purged at startup `TRASH_RETENTION_DAYS` (30) after deletion. Restoring keeps its status. | Delete forever: the hard delete (`deleteMany`, `emptyTrash`), only from Settings → Trash, behind a confirmation |
| **Checked** | A stored boolean on Expense that no UI reads yet. | The transient selection checkbox in the expense list |
| **Currency** | A lowercase code from `CURRENCIES`. Expense input converts a foreign amount into the budget's currency at entry time, so stored amounts are always in the budget's currency and never re-converted. | |

### Data rules

- **Ids** are UUID text keys (portable across machines, which the backup relies on), typed as branded `Id<T>` from `@shared/domain` on both the Drizzle columns and the domain types, so mixing tables fails type-checking. Mint one from untrusted input with `asId<T>()` after validating it (main's zod helper `id("budgets")` does this).
- **Timestamps:** `created_at` in epoch ms; there are no `updated_at` columns. `template_categories` has none and orders by `sort_order`.
- **Null, never undefined**, in SQL, TypeScript and over IPC.
- **Creation order** is `ORDER BY created_at, id`, never `rowid` (text-keyed tables can renumber on `VACUUM`). When one transaction inserts rows whose relative order matters, give each its own `created_at` (`now + n`, as `seedDatabase` does). New labels, Views, templates and budgets are stamped `max(now, newest + 1)` so they always sort as newest. Rows with a position column (`sort_order`, expense `order`) sort by it.
- **Money** is `REAL` in major units (5000 means 5000 USD). Every money write (`income`, allocation `amount`, expense `amount`) goes through `roundMoney` (`src/shared/money.ts`); percentages are stored as given. Template sums are checked with `sumsTo100` (the sum rounded to cents equals 100), shared by the form and the repository.
- **Single local user:** no `userId` anywhere; "not yours" checks became "exists, else `NOT_FOUND`".
- **Budgets are soft-deleted** (`deleted_at`, epoch ms): a trashed budget reads as missing (`get` gives `budget: null`, writes on it and on its expenses answer `NOT_FOUND`). Expenses are hard-deleted; `expenses.deleteMany` returns the removed rows and `restoreMany` puts them back under their own ids, which is how undo works for them.
- **Deletes cascade or unlink through foreign keys**, so repositories never delete children by hand (they still validate first, inside a transaction). Every read tolerates a `null` template, label or View.

| Child column | Parent | On delete |
|---|---|---|
| `template_categories.template_id` | `templates` | CASCADE |
| `budget_allocations.budget_id` | `budgets` | CASCADE |
| `expenses.budget_id` | `budgets` | CASCADE |
| `expenses.allocation_id` | `budget_allocations` | CASCADE |
| `budgets.template_id` / `label_id` / `view_id` | `templates` / `budget_labels` / `budget_views` | SET NULL |

An expense's `budget_id` must equal its allocation's `budget_id`; the repositories and the backup check this, the foreign keys don't.

### Changing the schema

- `schema.ts` is the truth; `pnpm db:generate` writes the migration into `drizzle/`. `src/main/db/db.test.ts` asserts that `src/shared/domain.ts` row types match the Drizzle rows.
- **FTS hazard:** `budgets_fts` (title search) is kept in sync by three triggers on `budgets`, and SQLite drops triggers with their table. drizzle-kit rebuilds `budgets` for most column changes, so such a migration must recreate the triggers and repopulate `budgets_fts`. The `db.test.ts` test on the FTS index and triggers catches a miss.
- Anything that changes a backed-up table or column also changes the backup format: see section 6.
- `user_settings` is a single row (`id = 1`) that `seedDatabase` ensures on every open. `app_meta.seeded_at` records that first-run seeding happened; `app_meta.onboarded_at` that onboarding was completed (migration `0004` sets it on existing installs); `app_meta.exchange_rates` caches the rates as JSON. `app_meta` is not backed up.

## 4. Behaviour the tests pin

The repository tests in `src/main/repositories/*.test.ts` pin each of these; change the test with the behaviour.

**Budgets**
- Create validates the View, template and label (`NOT_FOUND`), stores the icon as given, then copies every Category of the template into an Allocation (same name, percentage, description, `editable`, `sort_order`).
- Changing `income` (create, `update`, `updateIncome`) recomputes every allocation amount with one formula: `roundMoney(income × percentage / 100)`.
- Archive and unarchive only flip `status`. Archived budgets drop out of the active list, the latest budget and search, but stay readable by id. `archiveMany` / `unarchiveMany` do the same for many.
- Trash: `trash` stamps one `deleted_at` on every given budget, all or nothing; a trashed budget is gone from both lists, search, `get`, `getLatest`, Home, duplicate and the Markdown export, and every write on it or its expenses is `NOT_FOUND`. `restore` only takes a trashed budget and keeps its status. `listTrashed` pages newest-deleted first. `deleteMany` (trashed or not) and `emptyTrash` are the hard deletes; `purgeTrash` (at startup, never fatal) removes budgets trashed `TRASH_RETENTION_DAYS` or more ago.
- Duplicate: title + " (Copy)", always active, same template, income, currency, description, label, View and icon; copies allocations (stored amounts) and expenses with remapped allocation ids.
- `getLatest` is the newest active budget; `AddBudgetDialog` takes its defaults from it, then from `settings.currency`.

**Lists and search**
- The active and archived lists share `listBudgets` (`src/main/repositories/budgets.list.ts`). Filters are ANDed; values within one filter are ORed (`labelIds` excludes unlabeled budgets).
- Sort by `createdAt` (default) or `income`, either direction; ties fall back to creation order.
- Search: every typed word must prefix-match the title (FTS5, `unicode61 remove_diacritics`, so Latin and Cyrillic case-fold), unranked, and the list's sort still applies.
- Paging is by cursor: the JSON of the last row's sort tuple, `numItems + 1` rows fetched so `isDone` is exact. A malformed cursor is `BAD_REQUEST`.

**Expenses**
- An expense's allocation must belong to its budget (`FORBIDDEN`). New expenses go last in their allocation (`max(order) + 1`), unchecked.
- `update` patches only amount and title. `duplicate` copies title, amount and `checked`, not the description. `reorder` sets `order = index` for one allocation's list, all-or-nothing. `deleteMany` de-duplicates, is all-or-nothing and returns the removed rows; `restoreMany` re-inserts them under their own id, `order` and `createdAt` with `create`'s checks, an id already present being `CONFLICT`.
- `listGrouped` has no key for an allocation without expenses; `chartData` covers the whole budget, one entry per expense.
- Totals (spent, remaining) are computed in the renderer; overspending is allowed. Descriptions are Markdown; `src/shared/budgetMarkdown.ts` renders the Markdown export.

**Home** (`home.summary`, `src/main/repositories/home.ts`)
- Active budgets only: archived budgets, their allocations and expenses appear nowhere. No active budget gives `main: null` and empty lists.
- Activity is `max(createdAt, newest expense's createdAt)`; budgets order by it desc, then creation order desc. The first is `main` (with every allocation in display order), the next 4 are `others`. A new budget takes over `main`, and a new expense on an older budget takes it back.
- Spent is the sum of expenses through `roundMoney`; income and amounts are as stored. Overspent is `spent > amount` strictly (no limit), by budget activity, then display order. `main` also carries its 5 biggest expenses: amount desc, then createdAt desc, then id desc.
- Every money value carries its own budget's currency; nothing is summed across budgets.

**Templates, labels, Views**
- Templates list user templates first, then built-ins. Categories must pass `sumsTo100` on create and update. Update deletes categories missing from the input, patches those with an id (an unknown id is `NOT_FOUND`), inserts the rest; an omitted description clears it.
- Labels: no validation, names not unique, listed in creation order.
- Views: title trimmed and required; description trimmed, at most 280 characters, empty becomes `null`; listed newest first; at most 20 favorites; deleting a View unlinks its budgets, archived ones included.

**Seeding** (`src/main/db/seed.ts` holds the data): on first run only, decided by `app_meta.seeded_at` and never by empty tables, it inserts 5 labels, the two built-in templates, and sample data that fills every Home section: a user template ("Travel"), two favorite Views and three labelled budgets with icons (this month's 50/30/20, a trip in euros with one category over, a 75/10/15 side income). Samples are backdated up to 30 days; the newest budget is the USD one, since `getLatest` feeds the new-budget defaults. Expenses go only under editable allocations. Rows the user deletes never come back.

## 5. Renderer data layer

- **Query keys** start with their domain root, and mutations invalidate by root. `invalidateRoots` uses `refetchType: "all"`: unobserved cached queries refetch too, because route loaders' `ensureQueryData` returns cached data as is, and the next screen would otherwise mount on stale data.
- **Paged lists** (`data/pagination.ts`, `components/LoadMoreButton.tsx`, `lib/loadMore.ts`): `loadMore` ignores a call while any fetch is in flight, because TanStack would cancel a running refetch and a just-archived budget would stay listed. List keys end in `{ pageSize }` so the dashboard (25) and the Command palette (100) never share pages.
- **Home** (`useHomeSummary`) aggregates budgets and expenses under its own `home` root, so every mutation that changes a budget's title, income, currency, status or existence, or any expense's amount, title or existence, also invalidates `home`.
- **Settings** (`useSettings` / `useUpdateSettings`): display mode, theme and default currency live in `user_settings`; the sidebar's open state, width and transparency, the user's rebound shortcuts and the page to reopen on (`lib/lastPage.ts`, never a Settings page) stay in localStorage. The window's size is in `<userData>/window-state.json` (`src/main/windowState.ts`). None of these belong to a backup: they describe this machine.
- **The budget detail route remounts per `budgetId`** (`remountDeps`), so local edit state never carries from one budget to another.
- **Undo history** (`src/renderer/lib/undo.ts`): one in-memory history for the session; the toast's Undo and ⌘Z / ⇧⌘Z act on the same entry. Undoable mutations go through `useUndoableMutation` (`data/undoable.ts`), which pairs each with its inverse (archive ↔ unarchive, trash ↔ restore, expense delete ↔ restore); edits are not undoable yet, and hard deletes ask for confirmation instead. ⌘Z inside an editable target stays native text undo. A backup import clears the history.
- **Hotkeys** (`@tanstack/react-hotkeys`): every shortcut is declared once in `lib/hotkeys.ts` (`defineAppHotkeys`); its ids key the user's rebindings (`custom_hotkeys` in localStorage), so renaming one drops them. Components register `appHotkeys[id]`, never a key string, so rebinding applies; labels come from `ShortcutKeys` (`formatForDisplay`). Every overlay's content (dialog, sheet, popover, menu, select) is an exclusive scope, so page hotkeys pause while it is open and a hotkey that works inside it registers in a component rendered inside it. `budget` and `budgets-list` scopes let the budget page and the budgets list reuse keys (⌘A, Esc, ⌘⌫). Escape-to-go-back stays a window listener after everything else and runs only for an Escape nobody `preventDefault`ed.
- **Backup import** is two mutations: `useOpenBackup` writes and invalidates nothing; `useImportBackup` (either mode) removes inactive queries before invalidating every root: refetching a query for a deleted row would retry `NOT_FOUND` and hold `isPending`.
- **Release notes** (`changelog/<version>.md`): frontmatter `version`, `date`, `title`, then `- ` items under `## New`, `## Improved` and `## Fixed`; anything else in the file is for cushn.org/changelog, which renders the same files. The renderer bundles them at build (`lib/currentRelease.ts`) and What's new shows the one for `package.json`'s version, or hides itself if that file is missing or malformed. `lib/changelog.node.test.ts` parses every file and fails when the version has none, so a version bump ships with its notes.
- The window title is "Cushn" from `index.html`; routes set no titles.

## 6. Backup format

`src/shared/backup.ts` is the canonical definition: `{ format: "cushn-backup", version, exportedAt, app, data: { templates, templateCategories, budgetLabels, budgetViews, budgets, budgetAllocations, expenses, userSettings } }`, camelCase, every optional value present as `null`, ids preserved. Settings → Backup drives it.

- **Compatibility rule:** a change to any backed-up table or column bumps `BACKUP_VERSION` and adds the new version's schema plus an upgrade step from the previous one (`upgradeBackup` validates each version before its step). `src/shared/__fixtures__/backup-v1.json` must keep importing forever; its test pins that.
- **Export** is one read transaction in creation order, so export → import → export is identical except `exportedAt`. Trashed budgets, with their allocations and expenses, are left out and `deleted_at` is not a backup column: the trash is local recovery, not data, so it never changed the format.
- **Import:** open dialog → parse and validate (schema, referential integrity, the repository rules that every write path enforces) → main holds the parsed file under a token (`backup.open`) and the renderer's import dialog shows the counts; the user picks Add (the default) or Replace → `backup.import` with the token → safety copy → one transaction, in FK order. A bad file is rejected before the dialog; a cancel writes nothing; the FTS triggers keep search correct either way.
- **The held file:** one at most. Every `open` forgets the previous one, even when canceled or rejected; an import forgets its own once written. A token main no longer holds answers `NOT_FOUND` with nothing written.
- **Replace** deletes every row and inserts the file's, upserts `user_settings` and sets `seeded_at`.
- **Add** (`addAll`) keeps every row and inserts the file's budgets, allocations and expenses under new ids, so adding a file twice gives two copies; `createdAt` is kept. Only the templates, labels and views those budgets use come along, each matched to a row already here, else inserted under its file id: a template by id, or a built-in by its categories (name and percentage, in order; the web app's built-ins have other names), else added as a user template; a label by id or name and colour; a view by id or title, a favorite only while under the limit. Settings are untouched. The web app's one-budget export is a whole backup file holding one budget, which is why Add exists.
- **Safety copies:** `<userData>/backups/pre-import-<UTC timestamp>.json`, written synchronously right before the add or replace; the 5 newest are kept.
- Money is rounded on import, never rejected; a leading BOM and unknown keys are ignored. The schema enforces only rules that every repository write path enforces, so a user's own export is never rejected.

## 7. Tooling notes

- **Prettier** (`pnpm format`, `pnpm format:check`): width 80 for the renderer (the copied files' style), 100 for `src/main`, `src/preload` and `src/shared`. Markdown, `drizzle/`, `out/` and `routeTree.gen.ts` are ignored. The tree is not formatted yet.
- **Icons** (the Cushn logo, see `TRADEMARKS.md`): `build/icon.icon` is the Icon Composer file for macOS, so packaging for macOS needs Xcode 26 or later (`actool`). `build/icon.png` (1024 px, edge to edge) is the Windows and Linux icon. `build/icon-padded.png` is the same art on the macOS icon grid, used for the dock in `pnpm dev` and the Linux window icon. Regenerate it after changing `icon.png`: `sips -z 824 824 build/icon.png --out /tmp/i.png && sips -p 1024 1024 /tmp/i.png --out build/icon-padded.png`.
- **Native module:** `better-sqlite3` ships N-API prebuilds, so one binary loads in both Node (Vitest) and Electron; `postinstall` still runs `electron-builder install-app-deps`, and `onlyBuiltDependencies` in `pnpm-workspace.yaml` lists the packages allowed to run install scripts. If `pnpm test` fails with "NODE_MODULE_VERSION mismatch", run Vitest under Electron's Node (`ELECTRON_RUN_AS_NODE=1 electron node_modules/vitest/vitest.mjs run`) or rebuild for Node.
- **CI** (`.github/workflows/ci.yml`, every PR and push to `main`): `check` runs typecheck, test and build on Ubuntu; `package` packages both macOS archs unsigned on `macos-26` (Xcode 26 for `actool`) and runs `.github/scripts/smoke-test-mac.sh` on each app: `drizzle/` is in Resources, and the app's own binary, run as the MCP relay runs it (`ELECTRON_RUN_AS_NODE`), loads its `better-sqlite3` (x64 under Rosetta). The DMGs are kept as workflow artifacts for 5 days; an unsigned one opens only after `xattr -cr`.
- **Packaging** (`electron-builder.yml`): macOS only for now, arm64 and x64 as two builds from one run, so `latest-mac.yml` lists both zips (Squirrel.Mac installs from the zip, not the dmg). The DMGs carry no version in their names (`Cushn-arm64.dmg`, `Cushn-x64.dmg`), so the website's `releases/latest/download/…` links always reach the newest release; renaming them breaks those links. Hardened runtime with electron-builder's default entitlements. `files` drops better-sqlite3's C sources and, on macOS, its other platforms' prebuilds.

## 8. Releasing

macOS only, signed with a Developer ID Application certificate and notarized with an App Store Connect API key, from `.github/workflows/release.yml`:

1. Bump `package.json`'s `version` and add `changelog/<version>.md` (a test fails without it). Commit, tag `v<version>`, push the tag.
2. The workflow refuses to run without the five signing secrets (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`) and unless the tag is `v` + `package.json`'s version (electron-builder names the release from `package.json`). It runs typecheck and test, then `electron-builder --mac --arm64 --x64 --publish always -c.forceCodeSigning=true`, verifies each app (codesign, `spctl` must say "Notarized Developer ID", stapler, the smoke test) and sets the release body from the changelog file without its frontmatter.
3. The release stays a **draft**, which the updater ignores: download it, test it, then publish it by hand. Installs pick it up within 4 hours.

Running the workflow by hand (`gh workflow run release.yml`) is a dry run: signed and notarized the same way, published nowhere, the builds kept as workflow artifacts for 7 days. GitHub offers it only once the workflow is on `main`. Credentials live only in the repo's Actions secrets, never in the repo.

## 9. Before shipping

Not done yet:
- **A first update, end to end:** install a published release, publish the next, and watch Update appear and install.
- **Shortcut rebinding vs the menu:** the recorder in `ShortcutsSettings.tsx` checks conflicts only among the app's own shortcuts, so a user can bind a key the menu owns (⌘W, ⌘Q, ⌘H, ⌘M, ⌃⌘F) and the menu wins. A Settings… (⌘,) item needs a main → renderer channel that doesn't exist yet.
- **Move to Applications replaces** a Cushn already there that isn't running, even a newer one (an old DMG opened after an update); the updater brings it forward again.
- **Windows and Linux builds:** nothing builds or signs them yet (Windows signing is optional).
- **Agents on Windows and Linux** are untested: the `.cmd` launcher, quoting a launcher path with spaces through a `.cmd` CLI, Claude Desktop's Store-install config path, the handshake over a real named pipe, and the AppImage launcher (`$APPIMAGE` run with `ELECTRON_RUN_AS_NODE=1` on the relay's copy).

Loose ends: `template_categories.sort_order` and `budget_allocations.sort_order` default to 0, so repositories must always set them (dropping the default would make a miss fail loudly); `budget_labels_name_idx` serves no query.
