/**
 * The IPC contract: every `window.cushn` method, declared once.
 *
 * `cushnContract` lists each domain's methods with their args and result
 * types. Everything else derives from it:
 * - `CushnApi`: what the renderer's data layer calls (`cushn.labels.list()`),
 *   resolving to the result or rejecting with a `CushnError`;
 * - `CushnBridge`: what the preload exposes as `window.cushn` (same methods,
 *   resolving to an `IpcResult` envelope; see `errors.ts` for why);
 * - channel names, `cushn:<domain>.<method>` (`channelName`);
 * - the main-process handler map type (`src/main/ipc/handler.ts`).
 *
 * Adding a method: add one `method<Args, Result>()` line here, then implement
 * its handler in main (the compiler lists what is missing). The preload needs
 * no change. Checklist in ARCHITECTURE.md ("Adding an IPC method").
 *
 * Pure TypeScript: the preload bundles this file, so no zod, node or DOM here.
 */
import type {
  Budget,
  BudgetLabel,
  BudgetLayout,
  BudgetStatus,
  BudgetView,
  Expense,
  Id,
  Template,
} from "./domain";
import { CushnError, type IpcResult, isCushnError, unwrapResult } from "./errors";

export const CUSHN_API_KEY = "cushn";

// ---------------------------------------------------------------------------
// Shapes that differ from table rows (web app return shapes, `_id` → `id`,
// `_creationTime` → `createdAt`, `undefined` → `null`).
// ---------------------------------------------------------------------------

/** Mutations the web app answered with `{ success: true }`. */
export interface Success {
  success: true;
}

export interface TemplateCategorySummary {
  id: Id<"templateCategories">;
  name: string;
  percentage: number;
  description: string | null;
  editable: boolean;
}

export interface TemplateWithCategories extends Template {
  /** Ordered by `sortOrder`. */
  categories: TemplateCategorySummary[];
}

export interface TemplateCategoryInput {
  name: string;
  percentage: number;
  description?: string | null;
  editable: boolean;
}

export interface TemplateCategoryUpsert extends TemplateCategoryInput {
  /** Present: update that category. Absent: insert. Categories left out are deleted. */
  id?: Id<"templateCategories">;
}

export interface ExpenseItem {
  id: Id<"expenses">;
  budgetId: Id<"budgets">;
  allocationId: Id<"budgetAllocations">;
  amount: number;
  description: string | null;
  title: string;
  createdAt: number;
  /** The budget's currency. */
  currency: string;
  checked: boolean;
}

export interface NewExpenseItem {
  title: string;
  amount: number;
  description?: string | null;
}

export interface BudgetLabelSummary {
  id: Id<"budgetLabels">;
  name: string;
  color: string;
}

export interface BudgetListItem {
  id: Id<"budgets">;
  createdAt: number;
  templateId: Id<"templates"> | null;
  template: Template | null;
  income: number;
  description: string | null;
  title: string;
  currency: string;
  label: BudgetLabelSummary | null;
  viewId: Id<"budgetViews"> | null;
  icon: string | null;
}

export type ArchivedBudgetListItem = Omit<BudgetListItem, "viewId">;

export interface TrashedBudgetListItem extends ArchivedBudgetListItem {
  /** Where `restore` puts it back. */
  status: BudgetStatus;
  deletedAt: number;
}

export interface BudgetDetail {
  id: Id<"budgets">;
  createdAt: number;
  templateId: Id<"templates"> | null;
  template: Template | null;
  income: number;
  title: string;
  description: string | null;
  currency: string;
  labelId: Id<"budgetLabels"> | null;
  viewId: Id<"budgetViews"> | null;
  icon: string | null;
  status: BudgetStatus;
}

export interface BudgetAllocationItem {
  id: Id<"budgetAllocations">;
  budgetId: Id<"budgets">;
  createdAt: number;
  percentage: number;
  amount: number;
  categoryName: string;
  description: string | null;
  /** The budget's currency. */
  currency: string;
  editable: boolean;
}

export type BudgetSortBy = "createdAt" | "income";
export type SortOrder = "asc" | "desc";

/** Filters of the archived list; each is optional, all are ANDed. */
export interface BudgetListFilters {
  labelIds?: Id<"budgetLabels">[];
  templateIds?: Id<"templates">[];
  currencies?: string[];
  search?: string;
  sortBy?: BudgetSortBy;
  sortOrder?: SortOrder;
}

export interface ActiveBudgetFilters extends BudgetListFilters {
  /** Omitted or `null`: active budgets in any View or none. */
  viewId?: Id<"budgetViews"> | null;
}

export interface PageArgs {
  /** `null` for the first page, then the previous page's `continueCursor`. */
  cursor: string | null;
  numItems: number;
}

/** One page of a cursor-paged list. */
export interface Page<T> {
  page: T[];
  continueCursor: string | null;
  isDone: boolean;
}

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** The `user_settings` row in UI terms. `dark_mode` NULL (never chosen) reads as `"light"`. */
export interface Settings {
  /** Default currency for new budgets. */
  currency: string;
  /** Display mode of the budgets page. */
  budgetView: BudgetLayout;
  theme: Theme;
}

/** Row counts of a backup, for the import dialog and the success toast. */
export interface BackupCounts {
  templates: number;
  budgets: number;
  expenses: number;
  labels: number;
  views: number;
}

/** What the import dialog shows about the opened file. */
export interface BackupSummary {
  /** The chosen file's name, without its folder. */
  fileName: string;
  exportedAt: number;
  counts: BackupCounts;
}

export const IMPORT_MODES = ["add", "replace"] as const;
/** Keep the current data and add the backup's budgets, or replace all of it. */
export type ImportMode = (typeof IMPORT_MODES)[number];

export type BackupExportResult = { status: "saved"; filePath: string } | { status: "canceled" };

export type MarkdownExportResult = { status: "saved"; filePath: string } | { status: "canceled" };

export type BackupOpenResult =
  { status: "opened"; token: string; summary: BackupSummary } | { status: "canceled" };

export interface BackupImportResult {
  counts: BackupCounts;
  safetyCopyPath: string;
}

/** Money totals are in the budget's own currency, rounded with `roundMoney`; never summed across budgets. */
export interface HomeBudget {
  id: Id<"budgets">;
  title: string;
  currency: string;
  income: number;
  /** Sum of the budget's expenses. */
  spent: number;
  /** `max(createdAt, newest expense's createdAt)`: the home page's ordering. */
  lastActivityAt: number;
}

export interface HomeAllocation {
  id: Id<"budgetAllocations">;
  categoryName: string;
  /** The allocated amount. */
  amount: number;
  spent: number;
}

export interface HomeMainBudget extends HomeBudget {
  /** Every allocation, in `sortOrder`. */
  allocations: HomeAllocation[];
  /** The largest few expenses, by amount desc, then `createdAt` desc. */
  biggestExpenses: HomeExpense[];
}

/** An allocation of an active budget whose `spent` exceeds its `amount`. */
export interface HomeOverspentAllocation extends HomeAllocation {
  budgetId: Id<"budgets">;
  budgetTitle: string;
  currency: string;
}

/** An expense of the main budget, in its currency. */
export interface HomeExpense {
  id: Id<"expenses">;
  title: string;
  amount: number;
  categoryName: string;
}

/** Active budgets only. Ordered by `lastActivityAt`, newest first, unless noted. */
export interface HomeSummary {
  /** The active budget with the newest activity; `null` when none is active. */
  main: HomeMainBudget | null;
  /** The next few active budgets after `main`. */
  others: HomeBudget[];
  /** By budget activity, then the allocation's `sortOrder`. */
  overspent: HomeOverspentAllocation[];
}

/** Daily rates from open.er-api.com, cached in main; with the update check, the app's only network request. */
export interface ExchangeRates {
  /** Lowercase ISO code → units of that currency per one USD. */
  rates: Record<string, number>;
  /** ISO timestamp of the provider's last update. */
  updatedAt: string;
  /** ISO timestamp of when this app fetched them. */
  fetchedAt: string;
}

/** The provider's terms ask for this credit wherever the rates are used. */
export const RATES_ATTRIBUTION = {
  label: "Rates By Exchange Rate API",
  url: "https://www.exchangerate-api.com",
} as const;

/** The clients Cushn can connect its MCP server to. */
export const AGENT_KINDS = ["claude-code", "codex", "claude-desktop"] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

/** `unknown`: the client has no account to ask about (Claude Desktop) or the check failed. */
export type AgentAccount =
  | { status: "signed-in"; email: string | null; plan: string | null }
  | { status: "signed-out" }
  | { status: "unknown" };

export interface AgentStatus {
  kind: AgentKind;
  /** `null` when the CLI or app isn't found. `version` is `null` when it didn't say. */
  installation: { path: string; version: string | null } | null;
  account: AgentAccount;
  /** Cushn's MCP server is registered with this client, by Cushn. */
  connected: boolean;
}

/** The agent socket's state this launch; `message` is user-facing. */
export type McpSocketStatus =
  { state: "starting" } | { state: "listening" } | { state: "failed"; message: string };

/** `ready`: an update has downloaded and installs on restart. */
export type UpdateStatus = { state: "none" } | { state: "ready"; version: string };

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

declare const methodTypes: unique symbol;

/**
 * One method's args and result, carried as types only (the runtime value is
 * an empty object). `Args = void` means the method takes no argument.
 */
export interface MethodSpec<Args, Result> {
  readonly [methodTypes]?: { args: Args; result: Result };
}

function method<Args = void, Result = void>(): MethodSpec<Args, Result> {
  return {};
}

/** Domains and methods are `window.cushn.<domain>.<method>`. */
export const cushnContract = {
  labels: {
    list: method<void, { labels: BudgetLabel[] }>(),
    create: method<{ name: string; color: string }, { labelId: Id<"budgetLabels"> }>(),
    updateColor: method<{ labelId: Id<"budgetLabels">; color: string }, Success>(),
    updateName: method<{ labelId: Id<"budgetLabels">; name: string }, Success>(),
    delete: method<{ labelId: Id<"budgetLabels"> }, Success>(),
  },
  views: {
    list: method<void, { views: BudgetView[] }>(),
    listFavorites: method<void, { views: BudgetView[] }>(),
    get: method<{ viewId: Id<"budgetViews"> }, { view: BudgetView | null }>(),
    create: method<{ title: string; description?: string | null }, Id<"budgetViews">>(),
    update: method<
      { viewId: Id<"budgetViews">; title?: string; description?: string | null },
      null
    >(),
    toggleFavorite: method<{ viewId: Id<"budgetViews"> }, boolean>(),
    delete: method<{ viewId: Id<"budgetViews"> }, null>(),
  },
  templates: {
    list: method<void, { templates: Template[] }>(),
    get: method<{ templateId: Id<"templates"> }, { template: TemplateWithCategories }>(),
    create: method<
      { name: string; description?: string | null; categories: TemplateCategoryInput[] },
      Success
    >(),
    update: method<
      {
        templateId: Id<"templates">;
        name: string;
        description?: string | null;
        categories: TemplateCategoryUpsert[];
      },
      Success
    >(),
    delete: method<{ templateId: Id<"templates"> }, Success>(),
    duplicate: method<{ templateId: Id<"templates"> }, { newTemplateId: Id<"templates"> }>(),
  },
  expenses: {
    listGrouped: method<
      { budgetId: Id<"budgets"> },
      { expensesByAllocation: Partial<Record<Id<"budgetAllocations">, ExpenseItem[]>> }
    >(),
    chartData: method<
      { budgetId: Id<"budgets"> },
      { expensesData: { name: string; value: number }[]; total: number }
    >(),
    create: method<
      {
        budgetId: Id<"budgets">;
        allocationId: Id<"budgetAllocations">;
        amount: number;
        title: string;
      },
      { expenseId: Id<"expenses"> }
    >(),
    createMany: method<
      { budgetId: Id<"budgets">; allocationId: Id<"budgetAllocations">; items: NewExpenseItem[] },
      { expenseIds: Id<"expenses">[] }
    >(),
    update: method<
      { expenseId: Id<"expenses">; amount: number; title: string },
      { expenseId: Id<"expenses"> }
    >(),
    duplicate: method<{ expenseId: Id<"expenses"> }, { newExpenseId: Id<"expenses"> }>(),
    /** `deleted`: the removed rows, for `restoreMany`. */
    deleteMany: method<
      { expenseIds: Id<"expenses">[] },
      { deletedCount: number; deleted: Expense[] }
    >(),
    /** Re-inserts deleted rows under their own ids; all or nothing. */
    restoreMany: method<{ expenses: Expense[] }, Success>(),
    reorder: method<{ orderedIds: Id<"expenses">[] }, Success>(),
  },
  budgets: {
    create: method<
      {
        templateId: Id<"templates">;
        currency: string;
        title: string;
        description?: string | null;
        income?: number;
        labelId?: Id<"budgetLabels"> | null;
        viewId?: Id<"budgetViews"> | null;
        icon?: string | null;
      },
      { budgetId: Id<"budgets"> }
    >(),
    listActive: method<ActiveBudgetFilters & PageArgs, Page<BudgetListItem>>(),
    listArchived: method<BudgetListFilters & PageArgs, Page<ArchivedBudgetListItem>>(),
    /** Most recently deleted first. */
    listTrashed: method<PageArgs, Page<TrashedBudgetListItem>>(),
    get: method<
      { budgetId: Id<"budgets"> },
      { budget: BudgetDetail | null; allocations: BudgetAllocationItem[] }
    >(),
    getLatest: method<void, { latestBudget: Budget | null }>(),
    update: method<
      {
        budgetId: Id<"budgets">;
        title?: string;
        description?: string | null;
        income?: number;
        currency?: string;
      },
      Success
    >(),
    updateIncome: method<{ budgetId: Id<"budgets">; income: number }, Success>(),
    archive: method<{ budgetId: Id<"budgets"> }, Success>(),
    unarchive: method<{ budgetId: Id<"budgets"> }, Success>(),
    /** Archives (the web app's `bulkDeleteBudgets`). */
    archiveMany: method<{ budgetIds: Id<"budgets">[] }, Success>(),
    unarchiveMany: method<{ budgetIds: Id<"budgets">[] }, Success>(),
    /** Moves to the trash; purged after `TRASH_RETENTION_DAYS`. */
    trash: method<{ budgetIds: Id<"budgets">[] }, Success>(),
    /** Takes out of the trash, back to its status. */
    restore: method<{ budgetIds: Id<"budgets">[] }, Success>(),
    /** Hard-deletes every trashed budget. */
    emptyTrash: method<void, { deletedCount: number }>(),
    /** Hard delete; allocations and expenses cascade. */
    deleteMany: method<{ budgetIds: Id<"budgets">[] }, Success>(),
    setLabel: method<{ budgetId: Id<"budgets">; labelId: Id<"budgetLabels"> | null }, Success>(),
    setView: method<{ budgetId: Id<"budgets">; viewId: Id<"budgetViews"> | null }, Success>(),
    /** `icon: null` falls back to the placeholder. */
    setIcon: method<{ budgetId: Id<"budgets">; icon: string | null }, Success>(),
    duplicate: method<{ budgetId: Id<"budgets"> }, { newBudgetId: Id<"budgets"> }>(),
    /** Main shows the save dialog; "canceled" when the user closes it. */
    exportMarkdown: method<{ budgetId: Id<"budgets"> }, MarkdownExportResult>(),
  },
  home: {
    summary: method<void, HomeSummary>(),
  },
  settings: {
    get: method<void, { settings: Settings }>(),
    /** Patches only the given fields. */
    update: method<Partial<Settings>, Success>(),
  },
  onboarding: {
    /** `completedAt` in epoch ms; `null` until `complete` is called. */
    get: method<void, { completedAt: number | null }>(),
    /** Keeps the first timestamp when already completed. */
    complete: method<void, Success>(),
  },
  /** Main shows the file dialogs; the renderer's import dialog asks how to import. */
  backup: {
    export: method<void, BackupExportResult>(),
    /** Reads and validates the chosen file and holds it under `token`; writes nothing. "canceled" when the user closes the dialog. */
    open: method<void, BackupOpenResult>(),
    /** Adds the held file's budgets or replaces all data, then forgets the file; NOT_FOUND when `token` isn't the held file's. */
    import: method<{ token: string; mode: ImportMode }, BackupImportResult>(),
  },
  files: {
    /** Shows a file main saved this session in Finder, Explorer or the file manager. */
    reveal: method<{ filePath: string }, Success>(),
  },
  rates: {
    /** The cached rates, refreshed when older than 12 hours; stale or `null` while offline. */
    get: method<void, ExchangeRates | null>(),
  },
  agents: {
    /** Detects every client and its account; spawns their CLIs, so it takes a moment. */
    list: method<void, AgentStatus[]>(),
    /** Registers the `cushn-mcp` launcher with the client and installs the `cushn` skill. */
    connect: method<{ kind: AgentKind }, AgentStatus>(),
    /** Removes exactly what `connect` added. */
    disconnect: method<{ kind: AgentKind }, AgentStatus>(),
    /** Whether agents can reach this app: the MCP socket listens, or why it couldn't. */
    socket: method<void, McpSocketStatus>(),
  },
  updates: {
    /** Main's change event names the `updates` root when this changes. */
    status: method<void, UpdateStatus>(),
    /** Quits and restarts into the downloaded update; CONFLICT when none is ready. */
    install: method<void, Success>(),
  },
} as const satisfies Record<string, Record<string, MethodSpec<unknown, unknown>>>;

// ---------------------------------------------------------------------------
// Derived types
// ---------------------------------------------------------------------------

export type CushnContract = typeof cushnContract;
export type Domain = keyof CushnContract;
export type MethodName<D extends Domain> = keyof CushnContract[D] & string;

export type ArgsOf<D extends Domain, M extends MethodName<D>> =
  CushnContract[D][M] extends MethodSpec<infer A, unknown> ? A : never;
export type ResultOf<D extends Domain, M extends MethodName<D>> =
  CushnContract[D][M] extends MethodSpec<unknown, infer R> ? R : never;

/** Domains the renderer caches queries under; a mutation (or an agent's write) invalidates by root. */
export type QueryRoot = Exclude<Domain, "backup" | "files">;

/** `() => …` for `void` args, `(args) => …` otherwise. */
type Fn<Args, Return> = [Args] extends [void] ? () => Return : (args: Args) => Return;

/** The renderer-side API: resolves to the result, rejects with `CushnError`. */
export type CushnApi = {
  [D in Domain]: { [M in MethodName<D>]: Fn<ArgsOf<D, M>, Promise<ResultOf<D, M>>> };
};

/**
 * Main → renderer, the one event that flows that way: data changed outside the
 * renderer's own mutations (an agent's write through the MCP server). It names
 * query roots, not data; the renderer refetches them.
 */
export const CHANGED_CHANNEL = "cushn:changed";

export interface ChangedEvent {
  roots: QueryRoot[];
}

/** The contract's methods as the preload sends them, each resolving to main's envelope. */
export type CushnBridgeMethods = {
  [D in Domain]: { [M in MethodName<D>]: Fn<ArgsOf<D, M>, Promise<IpcResult<ResultOf<D, M>>>> };
};

/** What the preload exposes as `window.cushn`. Only `src/renderer/data/` touches it. */
export type CushnBridge = CushnBridgeMethods & {
  /** `process.platform` of the host OS, e.g. "darwin". */
  readonly platform: string;
  /** Calls `listener` with each `CHANGED_CHANNEL` event; returns the unsubscribe. */
  onChanged(listener: (event: ChangedEvent) => void): () => void;
};

export type CushnChannel = { [D in Domain]: `cushn:${D}.${MethodName<D>}` }[Domain];

export function channelName<D extends Domain, M extends MethodName<D>>(
  domain: D,
  methodName: M,
): `cushn:${D}.${M}` {
  return `cushn:${domain}.${methodName}`;
}

/** Every method as `[domain, method, channel]`, in contract order. */
export const cushnMethods: ReadonlyArray<readonly [Domain, string, CushnChannel]> = Object.entries(
  cushnContract,
).flatMap(([domain, methods]) =>
  Object.keys(methods).map(
    (name) => [domain as Domain, name, `cushn:${domain}.${name}` as CushnChannel] as const,
  ),
);

/** Builds `{ [domain]: { [method]: make(domain, method, channel) } }` over the contract. */
function mapContract(
  make: (domain: Domain, methodName: string, channel: CushnChannel) => unknown,
): Record<string, Record<string, unknown>> {
  const api: Record<string, Record<string, unknown>> = {};
  for (const [domain, name, channel] of cushnMethods) {
    (api[domain] ??= {})[name] = make(domain, name, channel);
  }
  return api;
}

/**
 * The preload's half: one function per method that sends its single args
 * object on the method's channel and resolves to main's envelope.
 */
export function createBridgeMethods(
  invoke: (channel: CushnChannel, args: unknown) => Promise<unknown>,
): CushnBridgeMethods {
  return mapContract(
    (_domain, _name, channel) => (args?: unknown) => invoke(channel, args),
  ) as unknown as CushnBridgeMethods;
}

/**
 * The renderer's half: unwraps each envelope, so callers get the result or a
 * `CushnError` created in the renderer's own realm. A rejected bridge call
 * (no handler, IPC failure) also surfaces as a `CushnError` ("INTERNAL").
 */
export function createApiClient(bridge: CushnBridgeMethods): CushnApi {
  const methods = bridge as unknown as Record<
    string,
    Record<string, (args?: unknown) => Promise<IpcResult<unknown>>>
  >;
  return mapContract((domain, name) => async (args?: unknown) => {
    let result: IpcResult<unknown>;
    try {
      result = await methods[domain][name](args);
    } catch (error) {
      if (isCushnError(error)) throw error;
      throw new CushnError("INTERNAL", error instanceof Error ? error.message : String(error));
    }
    return unwrapResult(result);
  }) as unknown as CushnApi;
}
