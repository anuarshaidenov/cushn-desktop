/**
 * Budgets: one plan for an amount of income, created from a template. Ported
 * from the web app.
 *
 * - Creation copies the template's categories into allocations, a snapshot
 *   that later template edits never touch.
 * - Every money write is rounded to cents (`roundMoney`), and any income
 *   change recomputes every allocation amount.
 * - Deleting moves budgets to the trash (`deleted_at` set, status kept):
 *   every other read and write treats a trashed budget as missing. Hard
 *   deletes (`deleteMany`, `emptyTrash`, `purgeTrash`) rely on the foreign
 *   keys: allocations and expenses cascade.
 */
import { and, asc, desc, eq, isNotNull, isNull, lte } from "drizzle-orm";
import type { ArgsOf, MethodName, ResultOf } from "@shared/api";
import { type BudgetMarkdownOutput, renderBudgetMarkdown } from "@shared/budgetMarkdown";
import { TRASH_RETENTION_DAYS } from "@shared/constants";
import type { BudgetStatus, Id } from "@shared/domain";
import { CushnError } from "@shared/errors";
import { roundMoney } from "@shared/money";
import type { AppDatabase } from "../db";
import {
  budgetAllocations,
  budgetLabels,
  budgetViews,
  budgets,
  expenses,
  templateCategories,
  templates,
} from "../db/schema";
import { listBudgets, listTrashedBudgets } from "./budgets.list";

type Args<M extends MethodName<"budgets">> = ArgsOf<"budgets", M>;
type Result<M extends MethodName<"budgets">> = ResultOf<"budgets", M>;
/** The database or a transaction, for helpers that only read (or also update). */
type Reader = Pick<AppDatabase, "select">;
type Writer = Pick<AppDatabase, "select" | "update">;

export function create(db: AppDatabase, args: Args<"create">): Result<"create"> {
  return db.transaction((tx) => {
    // The foreign keys would reject a missing template or label with an opaque
    // INTERNAL error, so those get a 404 like the View.
    if (args.viewId != null) assertViewExists(tx, args.viewId);
    assertTemplateExists(tx, args.templateId);
    if (args.labelId != null) assertLabelExists(tx, args.labelId);

    const income = roundMoney(args.income ?? 0);
    const categories = tx
      .select()
      .from(templateCategories)
      .where(eq(templateCategories.templateId, args.templateId))
      .orderBy(asc(templateCategories.sortOrder), asc(templateCategories.id))
      .all();

    const createdAt = nextBudgetCreatedAt(tx);
    const { budgetId } = tx
      .insert(budgets)
      .values({
        title: args.title,
        description: args.description ?? null,
        templateId: args.templateId,
        income,
        status: "active",
        currency: args.currency,
        labelId: args.labelId ?? null,
        viewId: args.viewId ?? null,
        icon: args.icon ?? null,
        createdAt,
      })
      .returning({ budgetId: budgets.id })
      .get();

    categories.forEach((category, index) => {
      tx.insert(budgetAllocations)
        .values({
          budgetId,
          categoryName: category.name,
          percentage: category.percentage,
          amount: allocationAmount(income, category.percentage),
          description: category.description,
          editable: category.editable,
          sortOrder: category.sortOrder,
          createdAt: createdAt + 1 + index,
        })
        .run();
    });

    return { budgetId };
  });
}

/** Active budgets, optionally in one View; filters, search, sort and cursor. */
export function listActive(db: AppDatabase, args: Args<"listActive">): Result<"listActive"> {
  return listBudgets(db, { ...args, status: "active", viewId: args.viewId ?? null });
}

/** Archived budgets from every View; the items carry no `viewId`. */
export function listArchived(db: AppDatabase, args: Args<"listArchived">): Result<"listArchived"> {
  const result = listBudgets(db, { ...args, status: "archived", viewId: null });
  return { ...result, page: result.page.map(({ viewId: _viewId, ...item }) => item) };
}

export function listTrashed(db: AppDatabase, args: Args<"listTrashed">): Result<"listTrashed"> {
  return listTrashedBudgets(db, args);
}

/**
 * The budget with its template and allocations, whatever its status. A
 * missing or trashed budget reads as `{ budget: null, allocations: [] }`
 * (no 404).
 */
export function get(db: AppDatabase, { budgetId }: Args<"get">): Result<"get"> {
  const row = db
    .select({ budget: budgets, template: templates })
    .from(budgets)
    .leftJoin(templates, eq(templates.id, budgets.templateId))
    .where(and(eq(budgets.id, budgetId), isNull(budgets.deletedAt)))
    .get();
  if (!row) return { budget: null, allocations: [] };

  const { budget, template } = row;
  const allocations = allocationRows(db, budgetId).map((a) => ({
    id: a.id,
    budgetId: a.budgetId,
    createdAt: a.createdAt,
    percentage: a.percentage,
    amount: a.amount,
    categoryName: a.categoryName,
    description: a.description,
    currency: budget.currency,
    editable: a.editable,
  }));
  return {
    budget: {
      id: budget.id,
      createdAt: budget.createdAt,
      templateId: budget.templateId,
      template,
      income: budget.income,
      title: budget.title,
      description: budget.description,
      currency: budget.currency,
      labelId: budget.labelId,
      viewId: budget.viewId,
      icon: budget.icon,
      status: budget.status,
    },
    allocations,
  };
}

/** The most recently created active budget, as a full row (AddBudgetDialog's defaults). */
export function getLatest(db: AppDatabase): Result<"getLatest"> {
  const latestBudget = db
    .select()
    .from(budgets)
    .where(and(eq(budgets.status, "active"), isNull(budgets.deletedAt)))
    .orderBy(desc(budgets.createdAt), desc(budgets.id))
    .limit(1)
    .get();
  return { latestBudget: latestBudget ?? null };
}

/**
 * Patches only the given fields; `description: null` clears it. A new
 * `income` also recomputes every allocation, as `updateIncome` does.
 */
export function update(
  db: AppDatabase,
  { budgetId, title, description, income, currency }: Args<"update">,
): Result<"update"> {
  return db.transaction((tx) => {
    assertBudgetExists(tx, budgetId);
    const values = {
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(currency !== undefined ? { currency } : {}),
    };
    if (Object.keys(values).length > 0) {
      tx.update(budgets).set(values).where(eq(budgets.id, budgetId)).run();
    }
    if (income !== undefined) setIncome(tx, budgetId, income);
    return { success: true };
  });
}

/** Sets the income and recomputes every allocation amount. */
export function updateIncome(
  db: AppDatabase,
  { budgetId, income }: Args<"updateIncome">,
): Result<"updateIncome"> {
  return db.transaction((tx) => {
    assertBudgetExists(tx, budgetId);
    setIncome(tx, budgetId, income);
    return { success: true };
  });
}

/** Only flips the status: View, label, allocations and expenses stay. */
export function archive(db: AppDatabase, { budgetId }: Args<"archive">): Result<"archive"> {
  return setStatus(db, [budgetId], "archived");
}

export function unarchive(db: AppDatabase, { budgetId }: Args<"unarchive">): Result<"unarchive"> {
  return setStatus(db, [budgetId], "active");
}

/** The web app's `bulkDeleteBudgets`: archives, all or nothing. */
export function archiveMany(
  db: AppDatabase,
  { budgetIds }: Args<"archiveMany">,
): Result<"archiveMany"> {
  return setStatus(db, budgetIds, "archived");
}

export function unarchiveMany(
  db: AppDatabase,
  { budgetIds }: Args<"unarchiveMany">,
): Result<"unarchiveMany"> {
  return setStatus(db, budgetIds, "active");
}

/** Moves budgets to the trash, all or nothing; one already there is 404. */
export function trash(db: AppDatabase, { budgetIds }: Args<"trash">): Result<"trash"> {
  return db.transaction((tx) => {
    for (const budgetId of budgetIds) assertBudgetExists(tx, budgetId);
    const deletedAt = Date.now();
    for (const budgetId of budgetIds) {
      tx.update(budgets).set({ deletedAt }).where(eq(budgets.id, budgetId)).run();
    }
    return { success: true };
  });
}

/** Takes budgets out of the trash with the status they had, all or nothing. */
export function restore(db: AppDatabase, { budgetIds }: Args<"restore">): Result<"restore"> {
  return db.transaction((tx) => {
    for (const budgetId of budgetIds) {
      const budget = tx
        .select({ id: budgets.id })
        .from(budgets)
        .where(and(eq(budgets.id, budgetId), isNotNull(budgets.deletedAt)))
        .get();
      if (!budget) throw budgetNotFound();
    }
    for (const budgetId of budgetIds) {
      tx.update(budgets).set({ deletedAt: null }).where(eq(budgets.id, budgetId)).run();
    }
    return { success: true };
  });
}

/**
 * Hard delete, all or nothing, trashed or not. Allocations and expenses go
 * with the budgets through `ON DELETE CASCADE`.
 */
export function deleteMany(
  db: AppDatabase,
  { budgetIds }: Args<"deleteMany">,
): Result<"deleteMany"> {
  return db.transaction((tx) => {
    for (const budgetId of budgetIds) {
      const budget = tx
        .select({ id: budgets.id })
        .from(budgets)
        .where(eq(budgets.id, budgetId))
        .get();
      if (!budget) throw budgetNotFound();
    }
    for (const budgetId of budgetIds) tx.delete(budgets).where(eq(budgets.id, budgetId)).run();
    return { success: true };
  });
}

export function emptyTrash(db: AppDatabase): Result<"emptyTrash"> {
  const { changes } = db.delete(budgets).where(isNotNull(budgets.deletedAt)).run();
  return { deletedCount: changes };
}

/** Hard-deletes budgets trashed `TRASH_RETENTION_DAYS` or more before `now`; returns how many. */
export function purgeTrash(db: AppDatabase, now: number = Date.now()): number {
  const cutoff = now - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return db.delete(budgets).where(lte(budgets.deletedAt, cutoff)).run().changes;
}

/**
 * `null` removes the label. The foreign key would fail on a missing label with
 * an opaque INTERNAL error, so it is checked first: 404 "Label not found".
 */
export function setLabel(
  db: AppDatabase,
  { budgetId, labelId }: Args<"setLabel">,
): Result<"setLabel"> {
  return db.transaction((tx) => {
    assertBudgetExists(tx, budgetId);
    if (labelId !== null) assertLabelExists(tx, labelId);
    tx.update(budgets).set({ labelId }).where(eq(budgets.id, budgetId)).run();
    return { success: true };
  });
}

/** `null` removes the budget from its View. */
export function setView(db: AppDatabase, { budgetId, viewId }: Args<"setView">): Result<"setView"> {
  return db.transaction((tx) => {
    assertBudgetExists(tx, budgetId);
    if (viewId !== null) assertViewExists(tx, viewId);
    tx.update(budgets).set({ viewId }).where(eq(budgets.id, budgetId)).run();
    return { success: true };
  });
}

/** `null` clears the icon. */
export function setIcon(db: AppDatabase, { budgetId, icon }: Args<"setIcon">): Result<"setIcon"> {
  return db.transaction((tx) => {
    assertBudgetExists(tx, budgetId);
    tx.update(budgets).set({ icon }).where(eq(budgets.id, budgetId)).run();
    return { success: true };
  });
}

/**
 * Copies the budget as "<title> (Copy)", always active, with every
 * allocation (amounts as stored, not recomputed) and every expense, each
 * expense moved to its allocation's copy.
 */
export function duplicate(db: AppDatabase, { budgetId }: Args<"duplicate">): Result<"duplicate"> {
  return db.transaction((tx) => {
    const source = tx
      .select()
      .from(budgets)
      .where(and(eq(budgets.id, budgetId), isNull(budgets.deletedAt)))
      .get();
    if (!source) throw budgetNotFound();

    // Own created_at per row, in the source's creation order.
    let tick = nextBudgetCreatedAt(tx);
    const nextCreatedAt = () => tick++;

    const { newBudgetId } = tx
      .insert(budgets)
      .values({
        title: `${source.title} (Copy)`,
        description: source.description,
        templateId: source.templateId,
        income: source.income,
        status: "active",
        currency: source.currency,
        labelId: source.labelId,
        viewId: source.viewId,
        icon: source.icon,
        createdAt: nextCreatedAt(),
      })
      .returning({ newBudgetId: budgets.id })
      .get();

    const copiedAllocationIds = new Map<Id<"budgetAllocations">, Id<"budgetAllocations">>();
    for (const allocation of allocationRows(tx, budgetId)) {
      const copy = tx
        .insert(budgetAllocations)
        .values({
          budgetId: newBudgetId,
          categoryName: allocation.categoryName,
          percentage: allocation.percentage,
          amount: allocation.amount,
          description: allocation.description,
          editable: allocation.editable,
          sortOrder: allocation.sortOrder,
          createdAt: nextCreatedAt(),
        })
        .returning({ id: budgetAllocations.id })
        .get();
      copiedAllocationIds.set(allocation.id, copy.id);
    }

    const sourceExpenses = tx
      .select()
      .from(expenses)
      .where(eq(expenses.budgetId, budgetId))
      .orderBy(asc(expenses.createdAt), asc(expenses.id))
      .all();
    for (const expense of sourceExpenses) {
      const allocationId = copiedAllocationIds.get(expense.allocationId);
      // Unreachable while expenses only point at their own budget's allocations.
      if (allocationId === undefined) continue;
      tx.insert(expenses)
        .values({
          budgetId: newBudgetId,
          allocationId,
          title: expense.title,
          amount: expense.amount,
          description: expense.description,
          order: expense.order,
          checked: expense.checked,
          createdAt: nextCreatedAt(),
        })
        .run();
    }

    return { newBudgetId };
  });
}

/**
 * The budget as a Markdown document (`renderBudgetMarkdown`), whatever its
 * status. Unlike `get`, a missing budget is 404.
 */
export function exportMarkdown(
  db: AppDatabase,
  { budgetId }: Args<"exportMarkdown">,
): BudgetMarkdownOutput {
  const budget = db
    .select()
    .from(budgets)
    .where(and(eq(budgets.id, budgetId), isNull(budgets.deletedAt)))
    .get();
  if (!budget) throw budgetNotFound();

  const template = budget.templateId
    ? db.select().from(templates).where(eq(templates.id, budget.templateId)).get()
    : undefined;
  const label = budget.labelId
    ? db.select().from(budgetLabels).where(eq(budgetLabels.id, budget.labelId)).get()
    : undefined;
  const view = budget.viewId
    ? db.select().from(budgetViews).where(eq(budgetViews.id, budget.viewId)).get()
    : undefined;
  const budgetExpenses = db
    .select()
    .from(expenses)
    .where(eq(expenses.budgetId, budgetId))
    .orderBy(asc(expenses.order), asc(expenses.createdAt), asc(expenses.id))
    .all();

  return renderBudgetMarkdown({
    budget,
    template: template ?? null,
    label: label ?? null,
    view: view ?? null,
    allocations: allocationRows(db, budgetId),
    expenses: budgetExpenses,
  });
}

/** Checks every id first (404 "Budget not found"), then sets the status of all of them. */
function setStatus(
  db: AppDatabase,
  budgetIds: Id<"budgets">[],
  status: BudgetStatus,
): { success: true } {
  return db.transaction((tx) => {
    for (const budgetId of budgetIds) assertBudgetExists(tx, budgetId);
    for (const budgetId of budgetIds) {
      tx.update(budgets).set({ status }).where(eq(budgets.id, budgetId)).run();
    }
    return { success: true };
  });
}

function setIncome(db: Writer, budgetId: Id<"budgets">, income: number): void {
  const rounded = roundMoney(income);
  db.update(budgets).set({ income: rounded }).where(eq(budgets.id, budgetId)).run();
  for (const allocation of allocationRows(db, budgetId)) {
    db.update(budgetAllocations)
      .set({ amount: allocationAmount(rounded, allocation.percentage) })
      .where(eq(budgetAllocations.id, allocation.id))
      .run();
  }
}

/** A budget's allocations in display order (`sort_order`, then creation order). */
function allocationRows(db: Reader, budgetId: Id<"budgets">) {
  return db
    .select()
    .from(budgetAllocations)
    .where(eq(budgetAllocations.budgetId, budgetId))
    .orderBy(
      asc(budgetAllocations.sortOrder),
      asc(budgetAllocations.createdAt),
      asc(budgetAllocations.id),
    )
    .all();
}

/** The one allocation formula, rounded to cents. */
function allocationAmount(income: number, percentage: number): number {
  return roundMoney((income * percentage) / 100);
}

/**
 * Never before the newest existing budget: keeps "created later, newer"
 * (`getLatest`, the default list order) even when the clock goes back or two
 * inserts share a millisecond.
 */
function nextBudgetCreatedAt(db: Reader): number {
  const newest = db
    .select({ createdAt: budgets.createdAt })
    .from(budgets)
    .orderBy(desc(budgets.createdAt))
    .limit(1)
    .get();
  return Math.max(Date.now(), (newest?.createdAt ?? 0) + 1);
}

function assertViewExists(db: Reader, viewId: Id<"budgetViews">): void {
  const view = db
    .select({ id: budgetViews.id })
    .from(budgetViews)
    .where(eq(budgetViews.id, viewId))
    .get();
  if (!view) throw new CushnError("NOT_FOUND", "View not found");
}

function assertTemplateExists(db: Reader, templateId: Id<"templates">): void {
  const template = db
    .select({ id: templates.id })
    .from(templates)
    .where(eq(templates.id, templateId))
    .get();
  if (!template) throw new CushnError("NOT_FOUND", "Template not found");
}

function assertLabelExists(db: Reader, labelId: Id<"budgetLabels">): void {
  const label = db
    .select({ id: budgetLabels.id })
    .from(budgetLabels)
    .where(eq(budgetLabels.id, labelId))
    .get();
  if (!label) throw new CushnError("NOT_FOUND", "Label not found");
}

/** A trashed budget counts as missing. */
function assertBudgetExists(db: Reader, budgetId: Id<"budgets">): void {
  const budget = db
    .select({ id: budgets.id })
    .from(budgets)
    .where(and(eq(budgets.id, budgetId), isNull(budgets.deletedAt)))
    .get();
  if (!budget) throw budgetNotFound();
}

function budgetNotFound(): CushnError {
  return new CushnError("NOT_FOUND", "Budget not found");
}
