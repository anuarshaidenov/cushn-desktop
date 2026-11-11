# Cushn Desktop

Cushn is a budgeting app for macOS. You pick a template such as 50/30/20, enter your income, and Cushn splits it into categories by percentage. Then you log expenses under each category.

Works with Claude Code, Claude Desktop and Codex. If one is installed on your Mac, Cushn can connect it, and the agent can read and change your budgets.

## "Where does my data go?"

Nowhere. Your budgets live in a SQLite file on your Mac. Cushn has no account, no sync and no server of its own.

Cushn makes two kinds of network request. It fetches exchange rates from [open.er-api.com](https://www.exchangerate-api.com), and it checks GitHub for a newer release. Neither one sends your budgets.

To move your data or keep a copy, open Settings and choose Backup. Export writes one JSON file, and Import reads it back. The export skips budgets in the trash.

## Installation

> [!NOTE]
> Cushn runs on macOS only for now. Nothing builds Windows or Linux installers yet.

Download the latest version from [GitHub Releases](https://github.com/anuarshaidenov/cushn-desktop/releases/latest):

- Apple silicon: [Cushn-arm64.dmg](https://github.com/anuarshaidenov/cushn-desktop/releases/latest/download/Cushn-arm64.dmg)
- Intel: [Cushn-x64.dmg](https://github.com/anuarshaidenov/cushn-desktop/releases/latest/download/Cushn-x64.dmg)

Open the DMG and move Cushn to your Applications folder. Both builds are signed and notarized.

Cushn downloads new releases in the background. When one is ready, an Update button appears in the sidebar.

## What you can do

- Create budgets from the built-in templates, or write your own percentage splits.
- Log an expense in another currency. Cushn converts it to the budget's currency when you enter it.
- Sort budgets into views, and give each one a label and an icon.
- Archive a budget you have finished with. A deleted budget stays in the trash for 30 days.
- Open the command palette with ⌘K, and rebind the keyboard shortcuts in Settings.
- Export a budget as a Markdown file.

## Connect an agent

Open Settings, choose Agents, and switch on Claude or Codex. Cushn adds itself to that client as an MCP server named `cushn` and installs a `cushn` skill. Switching it off removes what Cushn added. Restart Claude Desktop after connecting so it loads the tools.

A connected agent can list your budgets and expenses, log and edit expenses, create budgets, and archive or trash them. You can undo every change an agent makes, and no tool deletes anything for good.

Cushn doesn't need to be open. The agent's first request starts it in the background.

## Some notes

Cushn is early. Version 0.1.1 is the second release. Expect bugs.

Found one? [Open an issue](https://github.com/anuarshaidenov/cushn-desktop/issues).

## Documentation

There's no docs site yet.

- [What's new in each release](./changelog)
- [How the app is built, and why](./ARCHITECTURE.md)

## Building from source

Requires Node 24 and pnpm 10.

```sh
pnpm install     # also rebuilds native deps for Electron
pnpm dev         # run the app with hot reload
pnpm typecheck   # type-check main/preload and renderer
pnpm test        # run unit tests (Vitest)
pnpm build       # production build into out/
pnpm package     # build installers into release/ (electron-builder)
```

A pull request should fix one problem. Read [ARCHITECTURE.md](./ARCHITECTURE.md) before you change data, IPC, the schema, the backup format, dependencies or packaging.

## License

The code is licensed under the [Apache License 2.0](LICENSE).

The "Cushn" name and logo are not covered by that license. See [TRADEMARKS.md](TRADEMARKS.md).
