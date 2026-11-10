/**
 * Renderer-safe domain types: one per SQLite table, shaped like a row as the
 * main process reads it. Plain TypeScript only (no Drizzle import), so the IPC
 * contract in `api.ts` and the renderer can use them.
 *
 * Conventions:
 * - IDs are UUID strings, branded per table (`Id<"budgets">`), so mixing up
 *   ids fails type-checking; `createdAt` is epoch milliseconds.
 * - A missing optional value is `null` (SQLite NULL), not `undefined`.
 * - Money (`income`, `amount`) is a plain number in major currency units
 *   (e.g. 5000 means 5000 USD), as in the web app. Not integer minor units.
 * - Percentages are plain numbers out of 100 (e.g. 50 means 50%).
 *
 * `src/main/db/db.test.ts` asserts these stay identical to the Drizzle rows.
 */

/**
 * Table names as the web app spelled them, so ported `Id<"budgets">`
 * annotations keep compiling after an import swap. SQL table names differ
 * (`budget_labels`); this is only the type-level tag.
 */
export type TableName =
  | "templates"
  | "templateCategories"
  | "budgets"
  | "budgetViews"
  | "budgetAllocations"
  | "expenses"
  | "budgetLabels";

declare const idTable: unique symbol;

/**
 * A row id: a UUID string branded with its table. At runtime it is a plain
 * string (IPC and JSON carry it as one); only the type checker sees the brand.
 * Mint one from an untrusted string with `asId` after validating it.
 */
export type Id<T extends TableName> = string & { readonly [idTable]: T };

/** Brands a string as an id of table `T`. No runtime check: validate first. */
export function asId<T extends TableName>(value: string): Id<T> {
  return value as Id<T>;
}

export const BUDGET_STATUSES = ["active", "archived"] as const;
export type BudgetStatus = (typeof BUDGET_STATUSES)[number];

export const BUDGET_LAYOUTS = ["grid", "list"] as const;
/** How the budgets dashboard lays out its cards (`userSettings.budgetView`). */
export type BudgetLayout = (typeof BUDGET_LAYOUTS)[number];

/** A budget template: a named percentage breakdown into categories. */
export interface Template {
  id: Id<"templates">;
  name: string;
  description: string | null;
  /** Built-in (seeded) template; the user cannot edit or delete it. */
  isDefault: boolean;
  createdAt: number;
}

export interface TemplateCategory {
  id: Id<"templateCategories">;
  templateId: Id<"templates">;
  name: string;
  percentage: number;
  /** Display order within the template, ascending. */
  sortOrder: number;
  description: string | null;
  editable: boolean;
}

export interface Budget {
  id: Id<"budgets">;
  title: string;
  /** Markdown. */
  description: string | null;
  /** `null` once the template it was created from is deleted. */
  templateId: Id<"templates"> | null;
  income: number;
  status: BudgetStatus;
  /** Lowercase ISO code as entered, e.g. "usd". */
  currency: string;
  labelId: Id<"budgetLabels"> | null;
  /** Folder; a budget belongs to at most one view. */
  viewId: Id<"budgetViews"> | null;
  /** A name from the renderer's icon catalog; an unknown name shows the placeholder. */
  icon: string | null;
  createdAt: number;
  /** Epoch ms when moved to the trash; `null` when not trashed. */
  deletedAt: number | null;
}

/** A user-defined folder grouping budgets. */
export interface BudgetView {
  id: Id<"budgetViews">;
  title: string;
  description: string | null;
  isFavorite: boolean;
  createdAt: number;
}

/** A budget's snapshot of one template category, with its computed amount. */
export interface BudgetAllocation {
  id: Id<"budgetAllocations">;
  budgetId: Id<"budgets">;
  categoryName: string;
  percentage: number;
  amount: number;
  description: string | null;
  editable: boolean;
  /** Display order within the budget, ascending (copied from the template). */
  sortOrder: number;
  createdAt: number;
}

export interface Expense {
  id: Id<"expenses">;
  budgetId: Id<"budgets">;
  allocationId: Id<"budgetAllocations">;
  amount: number;
  title: string;
  description: string | null;
  /** Position within its allocation, ascending from 0. */
  order: number;
  checked: boolean;
  createdAt: number;
}

export interface BudgetLabel {
  id: Id<"budgetLabels">;
  name: string;
  /** Hex colour, e.g. "#06B6D4". */
  color: string;
  createdAt: number;
}

/** The single local user's settings (one row). */
export interface UserSettings {
  currency: string;
  budgetView: BudgetLayout;
  language: string | null;
  darkMode: boolean | null;
}
