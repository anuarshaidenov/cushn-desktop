import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Id, asId } from "@shared/domain";
import { CushnError, type CushnErrorCode } from "@shared/errors";
import { type DatabaseHandle, openDatabase } from "../db";
import {
  type NewExpenseRow,
  budgetAllocations,
  budgets,
  expenses as expenseRows,
} from "../db/schema";
import * as expenses from "./expenses";

const migrationsFolder = resolve(import.meta.dirname, "../../../drizzle");

let handle: DatabaseHandle;

beforeEach(() => {
  handle = openDatabase(":memory:", { migrationsFolder, seed: false });
});

afterEach(() => {
  handle.close();
});

// Budgets and allocations are inserted directly: the budgets repository is
// tested on its own.
function insertBudget(currency = "usd"): Id<"budgets"> {
  return handle.db
    .insert(budgets)
    .values({ title: "Budget", currency, income: 1000 })
    .returning({ id: budgets.id })
    .get().id;
}

function insertAllocation(budgetId: Id<"budgets">, sortOrder = 1): Id<"budgetAllocations"> {
  return handle.db
    .insert(budgetAllocations)
    .values({
      budgetId,
      categoryName: "Needs",
      percentage: 50,
      amount: 500,
      editable: true,
      sortOrder,
    })
    .returning({ id: budgetAllocations.id })
    .get().id;
}

/** A budget with one allocation. */
function setup(currency = "usd") {
  const budgetId = insertBudget(currency);
  const allocationId = insertAllocation(budgetId);
  return { budgetId, allocationId };
}

function grouped(budgetId: Id<"budgets">, allocationId: Id<"budgetAllocations">) {
  return expenses.listGrouped(handle.db, { budgetId }).expensesByAllocation[allocationId] ?? [];
}

function add(
  budgetId: Id<"budgets">,
  allocationId: Id<"budgetAllocations">,
  title: string,
  amount = 10,
): Id<"expenses"> {
  return expenses.create(handle.db, { budgetId, allocationId, amount, title }).expenseId;
}

/** For rows `create` can't make (checked, with a description). */
function insertExpense(row: NewExpenseRow): Id<"expenses"> {
  return handle.db.insert(expenseRows).values(row).returning({ id: expenseRows.id }).get().id;
}

/**
 * `[title, order]` pairs in `listGrouped` order. The DTO has no `order`, so the
 * stored values (which the backup carries) are looked up in the table.
 */
function orders(budgetId: Id<"budgets">, allocationId: Id<"budgetAllocations">) {
  return grouped(budgetId, allocationId).map((e) => [e.title, storedOrder(e.id)]);
}

function storedOrder(expenseId: Id<"expenses">) {
  return handle.db
    .select({ order: expenseRows.order })
    .from(expenseRows)
    .where(eq(expenseRows.id, expenseId))
    .get()?.order;
}

function storedRow(expenseId: Id<"expenses">) {
  return handle.db.select().from(expenseRows).where(eq(expenseRows.id, expenseId)).get();
}

function trashBudget(budgetId: Id<"budgets">) {
  handle.db.update(budgets).set({ deletedAt: 1 }).where(eq(budgets.id, budgetId)).run();
}

function expectError(fn: () => unknown, code: CushnErrorCode, message: string) {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(CushnError);
  expect(caught).toMatchObject({ code, message });
}

describe("expenses.create", () => {
  it("files the expense under the allocation, unchecked, at order 0 in an empty allocation", () => {
    const { budgetId, allocationId } = setup();

    const { expenseId } = expenses.create(handle.db, {
      budgetId,
      allocationId,
      amount: 25,
      title: "Coffee",
    });

    expect(grouped(budgetId, allocationId)).toEqual([
      expect.objectContaining({
        id: expenseId,
        budgetId,
        allocationId,
        amount: 25,
        title: "Coffee",
        description: null,
        checked: false,
      }),
    ]);
  });

  it("appends at max(order) + 1, counted per allocation", () => {
    const { budgetId, allocationId } = setup();
    const other = insertAllocation(budgetId, 2);

    add(budgetId, allocationId, "A");
    add(budgetId, other, "X");
    add(budgetId, allocationId, "B");

    expect(orders(budgetId, allocationId)).toEqual([
      ["A", 0],
      ["B", 1],
    ]);
    expect(orders(budgetId, other)).toEqual([["X", 0]]);
  });

  it("rejects a missing budget with NOT_FOUND 'Budget not found'", () => {
    // Single and bulk create run the same checks.
    const { allocationId } = setup();
    expectError(
      () => add(asId("missing-budget"), allocationId, "A"),
      "NOT_FOUND",
      "Budget not found",
    );
  });

  it("rejects a missing allocation with NOT_FOUND 'Allocation not found'", () => {
    // Single and bulk create run the same checks.
    const { budgetId } = setup();
    expectError(
      () => add(budgetId, asId("missing-allocation"), "A"),
      "NOT_FOUND",
      "Allocation not found",
    );
  });

  it("rejects another budget's allocation with FORBIDDEN and inserts nothing", () => {
    // Single and bulk create run the same checks.
    const { budgetId, allocationId } = setup();
    const other = setup();

    expectError(() => add(budgetId, other.allocationId, "A"), "FORBIDDEN", "Forbidden");
    expect(expenses.listGrouped(handle.db, { budgetId }).expensesByAllocation).toEqual({});
    expect(grouped(other.budgetId, other.allocationId)).toEqual([]);
    expect(grouped(budgetId, allocationId)).toEqual([]);
  });

  it("rounds the amount to 2 decimals", () => {
    const { budgetId, allocationId } = setup();
    add(budgetId, allocationId, "Sum", 0.1 + 0.2);
    add(budgetId, allocationId, "Half", 10.005);
    add(budgetId, allocationId, "Down", 4.444);

    expect(grouped(budgetId, allocationId).map((e) => e.amount)).toEqual([0.3, 10.01, 4.44]);
  });
});

describe("expenses.createMany", () => {
  it("appends the items consecutively after the existing ones, unchecked, in input order", () => {
    const { budgetId, allocationId } = setup();
    add(budgetId, allocationId, "Existing");

    const { expenseIds } = expenses.createMany(handle.db, {
      budgetId,
      allocationId,
      items: [
        { title: "Rent", amount: 600, description: "Monthly" },
        { title: "Food", amount: 200 },
        { title: "Gas", amount: 50, description: null },
      ],
    });

    const rows = grouped(budgetId, allocationId);
    expect(rows.map((e) => e.id).slice(1)).toEqual(expenseIds);
    expect(orders(budgetId, allocationId)).toEqual([
      ["Existing", 0],
      ["Rent", 1],
      ["Food", 2],
      ["Gas", 3],
    ]);
    expect(rows.map((e) => [e.description, e.checked])).toEqual([
      [null, false],
      ["Monthly", false],
      [null, false],
      [null, false],
    ]);
  });

  it("returns { expenseIds: [] } for no items", () => {
    const { budgetId, allocationId } = setup();
    expect(expenses.createMany(handle.db, { budgetId, allocationId, items: [] })).toEqual({
      expenseIds: [],
    });
  });

  it("checks the budget and that the allocation belongs to it, even with no items", () => {
    // These checks run before the empty-items check.
    const { budgetId, allocationId } = setup();
    const other = setup();
    const many = (b: Id<"budgets">, a: Id<"budgetAllocations">) => () =>
      expenses.createMany(handle.db, { budgetId: b, allocationId: a, items: [] });

    expectError(many(asId("missing-budget"), allocationId), "NOT_FOUND", "Budget not found");
    expectError(many(budgetId, asId("missing")), "NOT_FOUND", "Allocation not found");
    expectError(many(budgetId, other.allocationId), "FORBIDDEN", "Forbidden");
  });

  it("inserts nothing when the allocation belongs to another budget", () => {
    const { budgetId } = setup();
    const other = setup();

    expectError(
      () =>
        expenses.createMany(handle.db, {
          budgetId,
          allocationId: other.allocationId,
          items: [{ title: "A", amount: 1 }],
        }),
      "FORBIDDEN",
      "Forbidden",
    );
    expect(expenses.listGrouped(handle.db, { budgetId }).expensesByAllocation).toEqual({});
    expect(grouped(other.budgetId, other.allocationId)).toEqual([]);
  });

  it("is all-or-nothing: a failing item rolls back the ones before it", () => {
    const { budgetId, allocationId } = setup();

    expect(() =>
      expenses.createMany(handle.db, {
        budgetId,
        allocationId,
        // A NULL title violates NOT NULL on the second insert.
        items: [{ title: "Ok", amount: 1 }, { title: null as unknown as string, amount: 2 }],
      }),
    ).toThrow();
    expect(grouped(budgetId, allocationId)).toEqual([]);
  });

  it("rounds every item's amount to 2 decimals", () => {
    const { budgetId, allocationId } = setup();
    expenses.createMany(handle.db, {
      budgetId,
      allocationId,
      items: [
        { title: "Sum", amount: 0.30000000000000004 },
        { title: "Half", amount: 10.005 },
      ],
    });

    expect(grouped(budgetId, allocationId).map((e) => e.amount)).toEqual([0.3, 10.01]);
  });
});

describe("expenses.update", () => {
  it("patches only amount and title and returns { expenseId }", () => {
    const { budgetId, allocationId } = setup();
    add(budgetId, allocationId, "First");
    const expenseId = insertExpense({
      budgetId,
      allocationId,
      title: "Old",
      amount: 1,
      description: "Keep me",
      order: 1,
      checked: true,
    });
    const before = grouped(budgetId, allocationId)[1];

    expect(expenses.update(handle.db, { expenseId, amount: 42, title: "New" })).toEqual({
      expenseId,
    });

    expect(grouped(budgetId, allocationId)[1]).toEqual({ ...before, amount: 42, title: "New" });
    expect(storedOrder(expenseId)).toBe(1);
  });

  it("rounds the amount to 2 decimals", () => {
    const { budgetId, allocationId } = setup();
    const expenseId = add(budgetId, allocationId, "A");

    expenses.update(handle.db, { expenseId, amount: 0.30000000000000004, title: "A" });
    expect(grouped(budgetId, allocationId)[0].amount).toBe(0.3);
    expenses.update(handle.db, { expenseId, amount: 10.005, title: "A" });
    expect(grouped(budgetId, allocationId)[0].amount).toBe(10.01);
  });

  it("rejects a missing expense with NOT_FOUND 'Expense not found'", () => {
    expectError(
      () => expenses.update(handle.db, { expenseId: asId("missing"), amount: 1, title: "A" }),
      "NOT_FOUND",
      "Expense not found",
    );
  });
});

describe("expenses.duplicate", () => {
  it("copies title, amount and checked to the end of the same allocation, not description", () => {
    const { budgetId, allocationId } = setup();
    const source = insertExpense({
      budgetId,
      allocationId,
      title: "Rent",
      // Stored before rounding existed: copied as-is, not re-rounded.
      amount: 1.234,
      description: "Not copied",
      order: 0,
      checked: true,
    });
    add(budgetId, allocationId, "Later");

    const { newExpenseId } = expenses.duplicate(handle.db, { expenseId: source });

    expect(orders(budgetId, allocationId)).toEqual([
      ["Rent", 0],
      ["Later", 1],
      ["Rent", 2],
    ]);
    expect(grouped(budgetId, allocationId)[2]).toMatchObject({
      id: newExpenseId,
      budgetId,
      allocationId,
      title: "Rent",
      amount: 1.234,
      checked: true,
      description: null,
    });
  });

  it("rejects a missing expense with NOT_FOUND 'Expense not found'", () => {
    expectError(
      () => expenses.duplicate(handle.db, { expenseId: asId("missing") }),
      "NOT_FOUND",
      "Expense not found",
    );
  });
});

describe("expenses.deleteMany", () => {
  it("deletes the de-duplicated ids and returns { deletedCount, deleted } with the removed rows", () => {
    const { budgetId, allocationId } = setup();
    const a = add(budgetId, allocationId, "A");
    add(budgetId, allocationId, "B");
    const c = add(budgetId, allocationId, "C");
    const rowA = storedRow(a);
    const rowC = storedRow(c);

    expect(expenses.deleteMany(handle.db, { expenseIds: [a, c, a] })).toEqual({
      deletedCount: 2,
      deleted: [rowA, rowC],
    });
    expect(grouped(budgetId, allocationId).map((e) => e.title)).toEqual(["B"]);
  });

  it("returns { deletedCount: 0, deleted: [] } for no ids", () => {
    expect(expenses.deleteMany(handle.db, { expenseIds: [] })).toEqual({
      deletedCount: 0,
      deleted: [],
    });
  });

  it("throws NOT_FOUND 'Expense not found' when any id is missing, and deletes nothing", () => {
    // One transaction.
    const { budgetId, allocationId } = setup();
    const a = add(budgetId, allocationId, "A");
    const b = add(budgetId, allocationId, "B");

    expectError(
      () => expenses.deleteMany(handle.db, { expenseIds: [a, asId("missing"), b] }),
      "NOT_FOUND",
      "Expense not found",
    );
    expect(grouped(budgetId, allocationId).map((e) => e.title)).toEqual(["A", "B"]);
  });

  it("a new expense still goes last after deletes (max + 1, not count)", () => {
    // A count-based order would give 1 here and sort "D" before "C".
    const { budgetId, allocationId } = setup();
    const a = add(budgetId, allocationId, "A");
    const b = add(budgetId, allocationId, "B");
    add(budgetId, allocationId, "C");
    expenses.deleteMany(handle.db, { expenseIds: [a, b] });

    add(budgetId, allocationId, "D");

    expect(orders(budgetId, allocationId)).toEqual([
      ["C", 2],
      ["D", 3],
    ]);
  });
});

describe("expenses.reorder", () => {
  it("sets order = index for each id and returns { success: true }", () => {
    const { budgetId, allocationId } = setup();
    const a = add(budgetId, allocationId, "A");
    const b = add(budgetId, allocationId, "B");
    const c = add(budgetId, allocationId, "C");

    expect(expenses.reorder(handle.db, { orderedIds: [c, a, b] })).toEqual({ success: true });

    expect(orders(budgetId, allocationId)).toEqual([
      ["C", 0],
      ["A", 1],
      ["B", 2],
    ]);
  });

  it("rejects an unknown id with NOT_FOUND 'Expense not found' and changes nothing", () => {
    // One transaction, so nothing is half-applied.
    const { budgetId, allocationId } = setup();
    const a = add(budgetId, allocationId, "A");
    const b = add(budgetId, allocationId, "B");

    expectError(
      () => expenses.reorder(handle.db, { orderedIds: [b, asId("missing"), a] }),
      "NOT_FOUND",
      "Expense not found",
    );
    expect(orders(budgetId, allocationId)).toEqual([
      ["A", 0],
      ["B", 1],
    ]);
  });

  it("accepts an empty list", () => {
    expect(expenses.reorder(handle.db, { orderedIds: [] })).toEqual({ success: true });
  });
});

describe("expenses.listGrouped", () => {
  it("keys expenses by allocation, with no key for an allocation without expenses", () => {
    const { budgetId, allocationId } = setup("kzt");
    const empty = insertAllocation(budgetId, 2);
    const third = insertAllocation(budgetId, 3);
    const a = add(budgetId, allocationId, "A", 5);
    add(budgetId, third, "X");
    const elsewhere = setup();
    add(elsewhere.budgetId, elsewhere.allocationId, "Other budget");

    const { expensesByAllocation } = expenses.listGrouped(handle.db, { budgetId });

    expect(Object.keys(expensesByAllocation).sort()).toEqual([allocationId, third].sort());
    expect(expensesByAllocation[empty]).toBeUndefined();
    expect(expensesByAllocation[allocationId]).toEqual([
      {
        id: a,
        budgetId,
        allocationId,
        amount: 5,
        description: null,
        title: "A",
        createdAt: expect.any(Number),
        currency: "kzt",
        checked: false,
      },
    ]);
  });

  it("returns { expensesByAllocation: {} } for a missing budget", () => {
    expect(expenses.listGrouped(handle.db, { budgetId: asId("missing") })).toEqual({
      expensesByAllocation: {},
    });
  });

  it("sorts by order, then created_at, then id", () => {
    // Ties on order keep creation order.
    const { budgetId, allocationId } = setup();
    const row = { budgetId, allocationId, amount: 1 };
    insertExpense({ ...row, id: asId("e-late"), title: "Order 0, later", order: 0, createdAt: 20 });
    insertExpense({ ...row, id: asId("e-b"), title: "Order 0, tie b", order: 0, createdAt: 10 });
    insertExpense({ ...row, id: asId("e-a"), title: "Order 0, tie a", order: 0, createdAt: 10 });
    insertExpense({ ...row, id: asId("e-first"), title: "Order -1", order: -1, createdAt: 30 });
    insertExpense({ ...row, id: asId("e-last"), title: "Order 5", order: 5, createdAt: 1 });

    expect(grouped(budgetId, allocationId).map((e) => e.title)).toEqual([
      "Order -1",
      "Order 0, tie a",
      "Order 0, tie b",
      "Order 0, later",
      "Order 5",
    ]);
  });
});

describe("expenses.chartData", () => {
  it("lists every expense of the budget as { name: title, value: amount }, with the total", () => {
    // One entry per expense across all allocations
    // (by_budget index, so creation order), not grouped by title or allocation.
    const { budgetId, allocationId } = setup();
    const second = insertAllocation(budgetId, 2);
    const row = { budgetId, order: 0 };
    insertExpense({ ...row, allocationId: second, title: "Rent", amount: 600, createdAt: 1 });
    insertExpense({ ...row, allocationId, title: "Food", amount: 200.5, createdAt: 2 });
    insertExpense({ ...row, allocationId, title: "Food", amount: 50, order: 1, createdAt: 3 });
    const other = setup();
    add(other.budgetId, other.allocationId, "Not this budget", 999);

    expect(expenses.chartData(handle.db, { budgetId })).toEqual({
      expensesData: [
        { name: "Rent", value: 600 },
        { name: "Food", value: 200.5 },
        { name: "Food", value: 50 },
      ],
      total: 850.5,
    });
  });

  it("returns no entries and a zero total for a budget without expenses or a missing one", () => {
    // No budget lookup, so a missing budget is not an error.
    const { budgetId } = setup();
    const empty = { expensesData: [], total: 0 };
    expect(expenses.chartData(handle.db, { budgetId })).toEqual(empty);
    expect(expenses.chartData(handle.db, { budgetId: asId("missing") })).toEqual(empty);
  });
});

describe("expenses.restoreMany", () => {
  it("re-inserts deleted rows under their own ids and fields, amounts rounded", () => {
    const { budgetId, allocationId } = setup();
    const second = insertAllocation(budgetId, 2);
    const a = insertExpense({
      budgetId,
      allocationId,
      title: "A",
      amount: 1.234,
      description: "Notes",
      order: 3,
      checked: true,
      createdAt: 5,
    });
    const b = insertExpense({ budgetId, allocationId: second, title: "B", amount: 2, order: 0 });
    add(budgetId, allocationId, "Kept");
    const { deleted } = expenses.deleteMany(handle.db, { expenseIds: [a, b] });

    expect(expenses.restoreMany(handle.db, { expenses: deleted })).toEqual({ success: true });

    expect(storedRow(a)).toEqual({ ...deleted[0], amount: 1.23 });
    expect(storedRow(b)).toEqual(deleted[1]);
    expect(orders(budgetId, allocationId)).toEqual([
      ["A", 3],
      ["Kept", 4],
    ]);
  });

  it("accepts an empty list", () => {
    expect(expenses.restoreMany(handle.db, { expenses: [] })).toEqual({ success: true });
  });

  it("rejects a missing or trashed budget with NOT_FOUND, another budget's allocation with FORBIDDEN, a present id with CONFLICT", () => {
    const { budgetId, allocationId } = setup();
    const other = setup();
    const kept = add(budgetId, allocationId, "Kept");
    const gone = add(budgetId, allocationId, "Gone");
    const { deleted } = expenses.deleteMany(handle.db, { expenseIds: [gone] });
    const row = deleted[0];

    const cases: [typeof row, CushnErrorCode, string][] = [
      [{ ...row, budgetId: asId("missing") }, "NOT_FOUND", "Budget not found"],
      [{ ...row, allocationId: asId("missing") }, "NOT_FOUND", "Allocation not found"],
      [{ ...row, allocationId: other.allocationId }, "FORBIDDEN", "Forbidden"],
      [{ ...row, id: kept }, "CONFLICT", "Expense already exists"],
    ];
    for (const [expense, code, message] of cases) {
      expectError(
        () => expenses.restoreMany(handle.db, { expenses: [row, expense] }),
        code,
        message,
      );
      expect(storedRow(gone)).toBeUndefined();
    }
    expectError(
      () => expenses.restoreMany(handle.db, { expenses: [row, row] }),
      "CONFLICT",
      "Expense already exists",
    );
    expect(storedRow(gone)).toBeUndefined();

    trashBudget(budgetId);
    expectError(
      () => expenses.restoreMany(handle.db, { expenses: [row] }),
      "NOT_FOUND",
      "Budget not found",
    );
    expect(storedRow(gone)).toBeUndefined();
  });
});

describe("expenses of a trashed budget", () => {
  it("read like those of a missing budget", () => {
    const { budgetId, allocationId } = setup();
    add(budgetId, allocationId, "A");
    trashBudget(budgetId);

    expect(expenses.listGrouped(handle.db, { budgetId })).toEqual({ expensesByAllocation: {} });
    expect(expenses.chartData(handle.db, { budgetId })).toEqual({ expensesData: [], total: 0 });
  });

  it("reject every write with NOT_FOUND and change nothing", () => {
    const { budgetId, allocationId } = setup();
    const expenseId = add(budgetId, allocationId, "A");
    const before = storedRow(expenseId);
    trashBudget(budgetId);

    expectError(
      () => expenses.create(handle.db, { budgetId, allocationId, amount: 1, title: "B" }),
      "NOT_FOUND",
      "Budget not found",
    );
    expectError(
      () =>
        expenses.createMany(handle.db, {
          budgetId,
          allocationId,
          items: [{ title: "B", amount: 1 }],
        }),
      "NOT_FOUND",
      "Budget not found",
    );
    const expenseWrites = [
      () => expenses.update(handle.db, { expenseId, amount: 5, title: "B" }),
      () => expenses.duplicate(handle.db, { expenseId }),
      () => expenses.reorder(handle.db, { orderedIds: [expenseId] }),
      () => expenses.deleteMany(handle.db, { expenseIds: [expenseId] }),
    ];
    for (const write of expenseWrites) expectError(write, "NOT_FOUND", "Expense not found");

    expect(handle.db.select().from(expenseRows).all()).toEqual([before]);
  });
});
