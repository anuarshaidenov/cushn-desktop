/** Mutations invalidate by root (prefix), so `["budgets"]` covers every budget query. */
import type { ActiveBudgetFilters, BudgetListFilters, QueryRoot } from "@shared/api";
import type { Id } from "@shared/domain";

export type { QueryRoot };

export const queryKeys = {
  labels: {
    root: ["labels"] as const,
    list: () => ["labels"] as const,
  },
  views: {
    root: ["views"] as const,
    list: () => ["views", "list"] as const,
    favorites: () => ["views", "favorites"] as const,
    detail: (viewId: Id<"budgetViews">) => ["views", "detail", viewId] as const,
  },
  templates: {
    root: ["templates"] as const,
    list: () => ["templates", "list"] as const,
    detail: (templateId: Id<"templates">) => ["templates", "detail", templateId] as const,
  },
  budgets: {
    root: ["budgets"] as const,
    // Lists end in the page size, so the dashboard and the Command palette never share pages.
    active: (filters: ActiveBudgetFilters, pageSize: number) =>
      ["budgets", "active", filters, { pageSize }] as const,
    archived: (filters: BudgetListFilters, pageSize: number) =>
      ["budgets", "archived", filters, { pageSize }] as const,
    trashed: (pageSize: number) => ["budgets", "trashed", { pageSize }] as const,
    detail: (budgetId: Id<"budgets">) => ["budgets", "detail", budgetId] as const,
    latest: () => ["budgets", "latest"] as const,
  },
  home: {
    root: ["home"] as const,
    summary: () => ["home", "summary"] as const,
  },
  expenses: {
    root: ["expenses"] as const,
    grouped: (budgetId: Id<"budgets">) => ["expenses", "grouped", budgetId] as const,
    chart: (budgetId: Id<"budgets">) => ["expenses", "chart", budgetId] as const,
  },
  settings: {
    root: ["settings"] as const,
    get: () => ["settings"] as const,
  },
  onboarding: {
    root: ["onboarding"] as const,
    get: () => ["onboarding"] as const,
  },
  rates: {
    root: ["rates"] as const,
    get: () => ["rates"] as const,
  },
  agents: {
    root: ["agents"] as const,
    list: () => ["agents", "list"] as const,
    socket: () => ["agents", "socket"] as const,
  },
  updates: {
    root: ["updates"] as const,
    status: () => ["updates", "status"] as const,
  },
} satisfies { [R in QueryRoot]: { root: readonly [R] } & Record<string, unknown> };

/** Every root, for mutations that replace all data (`useImportBackup`). */
export const ALL_QUERY_ROOTS = Object.keys(queryKeys) as QueryRoot[];
