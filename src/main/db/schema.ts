/**
 * SQLite schema (Drizzle), ported from the web app's schema.
 *
 * Mapping rules:
 * - One local user: no `userId` columns; the web app's built-in rows (templates
 *   and labels with no owner) become `templates.isDefault` / plain labels.
 * - IDs are UUID text keys; creation time is `createdAt` (epoch ms).
 *   No `updatedAt`: the web app never tracked updates on these tables.
 * - Money and percentages are REAL in major units, as the web app stored them.
 * - Every per-user index keeps its tail plus `createdAt`, so ordered scans stay
 *   indexed.
 *
 * Not expressible in Drizzle, so it lives in hand-written SQL (latest in
 * `drizzle/0005_budgets_fts_rowids.sql`): the `budgets_fts` FTS5 table, its
 * `budgets_fts_rowids` key table and the triggers that keep both in sync with
 * `budgets.title`. SQLite drops triggers with their table, so a future
 * migration that rebuilds `budgets` (drizzle-kit does that for most column
 * changes) must recreate those triggers.
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
// Relative, not `@shared/*`: drizzle-kit loads this file without tsconfig paths.
import { BUDGET_LAYOUTS, BUDGET_STATUSES, type Id, type TableName } from "../../shared/domain";

/** Primary key: a UUID, typed as the table's branded `Id`. */
const id = <T extends TableName>() =>
  text("id")
    .primaryKey()
    .$type<Id<T>>()
    .$defaultFn(() => randomUUID() as Id<T>);

/** A text column holding an id of table `T` (foreign keys). */
const idRef = <T extends TableName>(name: string) => text(name).$type<Id<T>>();

const createdAt = () =>
  integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now());

export const templates = sqliteTable(
  "templates",
  {
    id: id<"templates">(),
    name: text("name").notNull(),
    description: text("description"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("templates_is_default_idx").on(t.isDefault)],
);

export const templateCategories = sqliteTable(
  "template_categories",
  {
    id: id<"templateCategories">(),
    templateId: idRef<"templates">("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    percentage: real("percentage").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    description: text("description"),
    editable: integer("editable", { mode: "boolean" }).notNull(),
  },
  (t) => [index("template_categories_template_idx").on(t.templateId, t.sortOrder)],
);

export const budgetLabels = sqliteTable(
  "budget_labels",
  {
    id: id<"budgetLabels">(),
    name: text("name").notNull(),
    color: text("color").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("budget_labels_name_idx").on(t.name),
    index("budget_labels_created_at_idx").on(t.createdAt),
  ],
);

export const budgetViews = sqliteTable(
  "budget_views",
  {
    id: id<"budgetViews">(),
    title: text("title").notNull(),
    description: text("description"),
    isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("budget_views_created_at_idx").on(t.createdAt),
    index("budget_views_favorite_idx").on(t.isFavorite, t.createdAt),
  ],
);

export const budgets = sqliteTable(
  "budgets",
  {
    id: id<"budgets">(),
    title: text("title").notNull(),
    description: text("description"),
    templateId: idRef<"templates">("template_id").references(() => templates.id, {
      onDelete: "set null",
    }),
    income: real("income").notNull().default(0),
    status: text("status", { enum: BUDGET_STATUSES }).notNull().default("active"),
    currency: text("currency").notNull(),
    labelId: idRef<"budgetLabels">("label_id").references(() => budgetLabels.id, {
      onDelete: "set null",
    }),
    viewId: idRef<"budgetViews">("view_id").references(() => budgetViews.id, {
      onDelete: "set null",
    }),
    icon: text("icon"),
    createdAt: createdAt(),
    /** Set while the budget is in the trash; `status` is kept for restore. */
    deletedAt: integer("deleted_at"),
  },
  (t) => [
    check("budgets_status_check", sql`${t.status} in ('active', 'archived')`),
    // Dashboard list: status (+ view), sorted by createdAt or income.
    index("budgets_status_created_idx").on(t.status, t.createdAt),
    index("budgets_status_income_idx").on(t.status, t.income, t.createdAt),
    index("budgets_status_view_created_idx").on(t.status, t.viewId, t.createdAt),
    index("budgets_status_view_income_idx").on(
      t.status,
      t.viewId,
      t.income,
      t.createdAt,
    ),
    // Foreign keys: lookups and ON DELETE SET NULL.
    index("budgets_view_idx").on(t.viewId, t.createdAt),
    index("budgets_label_idx").on(t.labelId),
    index("budgets_template_idx").on(t.templateId),
    index("budgets_deleted_idx").on(t.deletedAt),
    // The newest budget, which new budgets are stamped after.
    index("budgets_created_idx").on(t.createdAt),
  ],
);

export const budgetAllocations = sqliteTable(
  "budget_allocations",
  {
    id: id<"budgetAllocations">(),
    budgetId: idRef<"budgets">("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    categoryName: text("category_name").notNull(),
    percentage: real("percentage").notNull(),
    amount: real("amount").notNull(),
    description: text("description"),
    editable: integer("editable", { mode: "boolean" }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("budget_allocations_budget_idx").on(t.budgetId, t.sortOrder)],
);

export const expenses = sqliteTable(
  "expenses",
  {
    id: id<"expenses">(),
    budgetId: idRef<"budgets">("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    allocationId: idRef<"budgetAllocations">("allocation_id")
      .notNull()
      .references(() => budgetAllocations.id, { onDelete: "cascade" }),
    amount: real("amount").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    order: integer("sort_order").notNull(),
    checked: integer("checked", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    // Its `budgetId` prefix also serves lookups by budget.
    index("expenses_budget_allocation_idx").on(t.budgetId, t.allocationId, t.order),
    index("expenses_allocation_idx").on(t.allocationId),
  ],
);

/** Single row (`id = 1`): the local user's settings. */
export const userSettings = sqliteTable(
  "user_settings",
  {
    id: integer("id").primaryKey().default(1),
    currency: text("currency").notNull().default("usd"),
    budgetView: text("budget_view", { enum: BUDGET_LAYOUTS }).notNull().default("grid"),
    language: text("language"),
    darkMode: integer("dark_mode", { mode: "boolean" }),
  },
  (t) => [
    check("user_settings_single_row", sql`${t.id} = 1`),
    check("user_settings_budget_view_check", sql`${t.budgetView} in ('grid', 'list')`),
  ],
);

/** Internal key/value flags for the app itself (e.g. when first-run seeding ran). */
export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type TemplateRow = typeof templates.$inferSelect;
export type NewTemplateRow = typeof templates.$inferInsert;
export type TemplateCategoryRow = typeof templateCategories.$inferSelect;
export type NewTemplateCategoryRow = typeof templateCategories.$inferInsert;
export type BudgetLabelRow = typeof budgetLabels.$inferSelect;
export type NewBudgetLabelRow = typeof budgetLabels.$inferInsert;
export type BudgetViewRow = typeof budgetViews.$inferSelect;
export type NewBudgetViewRow = typeof budgetViews.$inferInsert;
export type BudgetRow = typeof budgets.$inferSelect;
export type NewBudgetRow = typeof budgets.$inferInsert;
export type BudgetAllocationRow = typeof budgetAllocations.$inferSelect;
export type NewBudgetAllocationRow = typeof budgetAllocations.$inferInsert;
export type ExpenseRow = typeof expenses.$inferSelect;
export type NewExpenseRow = typeof expenses.$inferInsert;
export type UserSettingsRow = typeof userSettings.$inferSelect;
export type NewUserSettingsRow = typeof userSettings.$inferInsert;
export type AppMetaRow = typeof appMeta.$inferSelect;
