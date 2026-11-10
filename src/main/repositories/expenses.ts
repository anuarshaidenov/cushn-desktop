/**
 * Expenses: titled amounts filed under one Allocation of one Budget, with a
 * manual order. Ported from the web app.
 *
 * - `order` is per (budget, allocation): a new expense goes to `max(order) + 1`
 *   (0 when empty), not the count, so it stays last after deletes.
 * - Reads sort by `order`, then creation order (`created_at, id`).
 * - Expenses of a trashed budget read and write as missing.
 */
import { type SQL, and, asc, eq, getTableColumns, inArray, isNull, max } from "drizzle-orm";
import type { ArgsOf, ExpenseItem, MethodName, ResultOf } from "@shared/api";
import type { Expense, Id } from "@shared/domain";
import { CushnError } from "@shared/errors";
import { roundMoney } from "@shared/money";
import type { AppDatabase } from "../db";
import { budgetAllocations, budgets, expenses } from "../db/schema";

type Args<M extends MethodName<"expenses">> = ArgsOf<"expenses", M>;
type Result<M extends MethodName<"expenses">> = ResultOf<"expenses", M>;
/** The `tx` that `db.transaction` passes to its callback. */
type Transaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

/** `{ expensesByAllocation }`; allocations without expenses have no key, a missing budget gives `{}`. */
export function listGrouped(
  db: AppDatabase,
  { budgetId }: Args<"listGrouped">,
): Result<"listGrouped"> {
  const budget = db
    .select({ currency: budgets.currency })
    .from(budgets)
    .where(and(eq(budgets.id, budgetId), isNull(budgets.deletedAt)))
    .get();
  if (!budget) return { expensesByAllocation: {} };

  const rows = db
    .select()
    .from(expenses)
    .where(eq(expenses.budgetId, budgetId))
    .orderBy(asc(expenses.order), asc(expenses.createdAt), asc(expenses.id))
    .all();

  const expensesByAllocation: Partial<Record<Id<"budgetAllocations">, ExpenseItem[]>> = {};
  for (const row of rows) {
    (expensesByAllocation[row.allocationId] ??= []).push({
      id: row.id,
      budgetId: row.budgetId,
      allocationId: row.allocationId,
      amount: row.amount,
      description: row.description,
      title: row.title,
      createdAt: row.createdAt,
      currency: budget.currency,
      checked: row.checked,
    });
  }
  return { expensesByAllocation };
}

/**
 * The chart: one `{ name: title, value: amount }` per expense of the whole
 * budget, in creation order, plus their sum.
 * A missing or trashed budget simply has no expenses.
 */
export function chartData(db: AppDatabase, { budgetId }: Args<"chartData">): Result<"chartData"> {
  const expensesData = db
    .select({ name: expenses.title, value: expenses.amount })
    .from(expenses)
    .where(and(eq(expenses.budgetId, budgetId), inLiveBudget(db)))
    .orderBy(asc(expenses.createdAt), asc(expenses.id))
    .all();
  const total = expensesData.reduce((sum, entry) => sum + entry.value, 0);
  return { expensesData, total };
}

/** Checks the allocation belongs to the budget; rounds the amount. */
export function create(
  db: AppDatabase,
  { budgetId, allocationId, amount, title }: Args<"create">,
): Result<"create"> {
  return db.transaction((tx) => {
    assertAllocationInBudget(tx, budgetId, allocationId);
    const order = nextOrder(tx, budgetId, allocationId);
    const { expenseId } = tx
      .insert(expenses)
      .values({
        budgetId,
        allocationId,
        amount: roundMoney(amount),
        title,
        order,
        checked: false,
      })
      .returning({ expenseId: expenses.id })
      .get();
    return { expenseId };
  });
}

/**
 * Same checks as `create`, then the items get consecutive orders after the
 * existing ones, in input order. All or nothing.
 */
export function createMany(
  db: AppDatabase,
  { budgetId, allocationId, items }: Args<"createMany">,
): Result<"createMany"> {
  return db.transaction((tx) => {
    assertAllocationInBudget(tx, budgetId, allocationId);
    if (items.length === 0) return { expenseIds: [] };

    const firstOrder = nextOrder(tx, budgetId, allocationId);
    const now = Date.now();
    const rows = tx
      .insert(expenses)
      .values(
        items.map((item, i) => ({
          budgetId,
          allocationId,
          title: item.title,
          amount: roundMoney(item.amount),
          description: item.description ?? null,
          order: firstOrder + i,
          checked: false,
          // One tick per item keeps creation order equal to input order.
          createdAt: now + i,
        })),
      )
      .returning({ id: expenses.id, order: expenses.order })
      .all();
    // RETURNING does not promise row order; sort back into input order.
    return { expenseIds: rows.sort((a, b) => a.order - b.order).map((row) => row.id) };
  });
}

/** Patches only `amount` (rounded) and `title`. */
export function update(
  db: AppDatabase,
  { expenseId, amount, title }: Args<"update">,
): Result<"update"> {
  return db.transaction((tx) => {
    const updated = tx
      .update(expenses)
      .set({ amount: roundMoney(amount), title })
      .where(and(eq(expenses.id, expenseId), inLiveBudget(tx)))
      .run();
    if (updated.changes === 0) throw expenseNotFound();
    return { expenseId };
  });
}

/**
 * Copies `title`, `amount` (as stored, not re-rounded) and `checked` to the
 * end of the same allocation. `description` is not copied.
 */
export function duplicate(
  db: AppDatabase,
  { expenseId }: Args<"duplicate">,
): Result<"duplicate"> {
  return db.transaction((tx) => {
    const source = tx
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, expenseId), inLiveBudget(tx)))
      .get();
    if (!source) throw expenseNotFound();

    const { newExpenseId } = tx
      .insert(expenses)
      .values({
        budgetId: source.budgetId,
        allocationId: source.allocationId,
        title: source.title,
        amount: source.amount,
        order: nextOrder(tx, source.budgetId, source.allocationId),
        checked: source.checked,
      })
      .returning({ newExpenseId: expenses.id })
      .get();
    return { newExpenseId };
  });
}

/**
 * De-duplicates the ids; one missing id fails the whole call and deletes
 * nothing. Returns the removed rows, which `restoreMany` takes back.
 */
export function deleteMany(
  db: AppDatabase,
  { expenseIds }: Args<"deleteMany">,
): Result<"deleteMany"> {
  const uniqueIds = [...new Set(expenseIds)];
  return db.transaction((tx) => {
    const deleted: Expense[] = uniqueIds.map((expenseId) => {
      const row = tx
        .select(getTableColumns(expenses))
        .from(expenses)
        .where(and(eq(expenses.id, expenseId), inLiveBudget(tx)))
        .get();
      if (!row) throw expenseNotFound();
      return row;
    });
    for (const expenseId of uniqueIds) tx.delete(expenses).where(eq(expenses.id, expenseId)).run();
    return { deletedCount: uniqueIds.length, deleted };
  });
}

/**
 * Re-inserts rows `deleteMany` returned, under their own ids, orders and
 * timestamps, with the same checks as `create`. An id already present is
 * CONFLICT. All or nothing.
 */
export function restoreMany(
  db: AppDatabase,
  { expenses: rows }: Args<"restoreMany">,
): Result<"restoreMany"> {
  return db.transaction((tx) => {
    for (const row of rows) {
      assertAllocationInBudget(tx, row.budgetId, row.allocationId);
      const existing = tx
        .select({ id: expenses.id })
        .from(expenses)
        .where(eq(expenses.id, row.id))
        .get();
      if (existing) throw new CushnError("CONFLICT", "Expense already exists");
      tx.insert(expenses)
        .values({
          id: row.id,
          budgetId: row.budgetId,
          allocationId: row.allocationId,
          amount: roundMoney(row.amount),
          title: row.title,
          description: row.description,
          order: row.order,
          checked: row.checked,
          createdAt: row.createdAt,
        })
        .run();
    }
    return { success: true };
  });
}

/**
 * `order = index` for each id (the UI sends one allocation's full list after a
 * drag). An unknown id fails the whole call.
 */
export function reorder(db: AppDatabase, { orderedIds }: Args<"reorder">): Result<"reorder"> {
  return db.transaction((tx) => {
    orderedIds.forEach((expenseId, index) => {
      const updated = tx
        .update(expenses)
        .set({ order: index })
        .where(and(eq(expenses.id, expenseId), inLiveBudget(tx)))
        .run();
      if (updated.changes === 0) throw expenseNotFound();
    });
    return { success: true };
  });
}

/** The budget and allocation checks, shared by single and bulk create. */
function assertAllocationInBudget(
  tx: Transaction,
  budgetId: Id<"budgets">,
  allocationId: Id<"budgetAllocations">,
): void {
  const budget = tx
    .select({ id: budgets.id })
    .from(budgets)
    .where(and(eq(budgets.id, budgetId), isNull(budgets.deletedAt)))
    .get();
  if (!budget) throw new CushnError("NOT_FOUND", "Budget not found");
  const allocation = tx
    .select({ budgetId: budgetAllocations.budgetId })
    .from(budgetAllocations)
    .where(eq(budgetAllocations.id, allocationId))
    .get();
  if (!allocation) throw new CushnError("NOT_FOUND", "Allocation not found");
  if (allocation.budgetId !== budgetId) throw new CushnError("FORBIDDEN", "Forbidden");
}

/** `max(order) + 1` within (budget, allocation), 0 when it has none. */
function nextOrder(
  tx: Transaction,
  budgetId: Id<"budgets">,
  allocationId: Id<"budgetAllocations">,
): number {
  const last = tx
    .select({ order: max(expenses.order) })
    .from(expenses)
    .where(and(eq(expenses.budgetId, budgetId), eq(expenses.allocationId, allocationId)))
    .get();
  return last?.order == null ? 0 : last.order + 1;
}

/** The expense's budget is not in the trash. */
function inLiveBudget(db: Pick<AppDatabase, "select">): SQL {
  return inArray(
    expenses.budgetId,
    db.select({ id: budgets.id }).from(budgets).where(isNull(budgets.deletedAt)),
  );
}

function expenseNotFound(): CushnError {
  return new CushnError("NOT_FOUND", "Expense not found");
}
