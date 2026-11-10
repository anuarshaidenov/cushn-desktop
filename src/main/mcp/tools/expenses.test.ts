// The expense tools over MCP. The repository behind each is covered in
// repositories/expenses.test.ts; these pin the tools' input, `changes` and
// undo round trips.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExpenseItem } from "@shared/api";
import type { Expense, Id } from "@shared/domain";
import { insertAllocation, insertBudget, insertExpense } from "../../repositories/budgets.fixtures";
import { type McpHarness, connectMcp } from "../testing";

let mcp: McpHarness;
let budgetId: Id<"budgets">;
let needs: Id<"budgetAllocations">;
let wants: Id<"budgetAllocations">;

beforeEach(async () => {
  mcp = await connectMcp();
  budgetId = insertBudget(mcp.db, { title: "June", income: 1000, createdAt: 1 }).id;
  needs = insertAllocation(mcp.db, { budgetId, percentage: 60, amount: 600, sortOrder: 1 }).id;
  wants = insertAllocation(mcp.db, {
    budgetId,
    categoryName: "Wants",
    percentage: 40,
    amount: 400,
    sortOrder: 2,
  }).id;
});

afterEach(async () => {
  await mcp.close();
});

async function ok<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const outcome = await mcp.call(name, args);
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.data as T;
}

async function listExpenses() {
  const { expensesByAllocation } = await ok<{
    expensesByAllocation: Record<string, ExpenseItem[]>;
  }>("list_expenses", { budgetId });
  return expensesByAllocation;
}

/** Titles by allocation, in display order. */
async function titlesByAllocation() {
  const grouped = await listExpenses();
  return Object.fromEntries(
    Object.entries(grouped).map(([allocationId, items]) => [
      allocationId,
      items.map((item) => item.title),
    ]),
  );
}

function expense(allocationId: Id<"budgetAllocations">, title: string, order: number) {
  return insertExpense(mcp.db, { budgetId, allocationId, title, amount: 10, order }).id;
}

describe("list_expenses", () => {
  it("groups a budget's expenses by allocation id, in manual order", async () => {
    expense(needs, "Rent", 1);
    expense(needs, "Power", 0);
    expense(wants, "Cinema", 0);

    expect(await titlesByAllocation()).toEqual({
      [needs]: ["Power", "Rent"],
      [wants]: ["Cinema"],
    });
    expect((await listExpenses())[needs][0]).toMatchObject({ amount: 10, currency: "usd" });
  });

  it("answers NOT_FOUND for a missing or trashed budget", async () => {
    const trashed = insertBudget(mcp.db, { deletedAt: 5, createdAt: 2 });

    for (const id of ["missing", trashed.id]) {
      expect(await mcp.call("list_expenses", { budgetId: id })).toEqual({
        ok: false,
        error: "NOT_FOUND: Budget not found",
      });
    }
  });
});

describe("create_expenses", () => {
  it("appends the items in input order and returns their ids; delete_expenses undoes it", async () => {
    expense(needs, "Rent", 0);

    const { expenseIds } = await ok<{ expenseIds: Id<"expenses">[] }>("create_expenses", {
      budgetId,
      allocationId: needs,
      items: [
        { title: "Power", amount: 40.125 },
        { title: "Water", amount: 15, description: "Quarterly" },
      ],
    });

    const grouped = await listExpenses();
    expect(grouped[needs].map((item) => [item.title, item.amount])).toEqual([
      ["Rent", 10],
      ["Power", 40.13],
      ["Water", 15],
    ]);
    expect(expenseIds).toEqual(grouped[needs].slice(1).map((item) => item.id));
    expect(mcp.changes).toEqual([["expenses", "home"]]);

    await ok("delete_expenses", { expenseIds });
    expect(await titlesByAllocation()).toEqual({ [needs]: ["Rent"] });
  });

  it("requires at least one item with a title", async () => {
    for (const items of [[], [{ title: "", amount: 1 }], [{ title: "Rent" }]]) {
      const outcome = await mcp.call("create_expenses", { budgetId, allocationId: needs, items });
      expect(outcome.ok, JSON.stringify(items)).toBe(false);
    }
    expect(mcp.changes).toEqual([]);
  });

  it("answers FORBIDDEN for another budget's allocation", async () => {
    const other = insertBudget(mcp.db, { createdAt: 2 }).id;

    expect(
      await mcp.call("create_expenses", {
        budgetId: other,
        allocationId: needs,
        items: [{ title: "Rent", amount: 1 }],
      }),
    ).toEqual({ ok: false, error: "FORBIDDEN: Forbidden" });
  });
});

describe("update_expense", () => {
  it("sets the title and amount, both required", async () => {
    const expenseId = expense(needs, "Rent", 0);

    expect(await mcp.call("update_expense", { expenseId, title: "Rent" })).toMatchObject({
      ok: false,
    });
    expect(await ok("update_expense", { expenseId, title: "Mortgage", amount: 900 })).toEqual({
      expenseId,
    });
    expect((await listExpenses())[needs]).toMatchObject([{ title: "Mortgage", amount: 900 }]);
    expect(mcp.changes).toEqual([["expenses", "home"]]);
  });
});

describe("duplicate_expense", () => {
  it("appends a copy to the same allocation; delete_expenses undoes it", async () => {
    const expenseId = expense(needs, "Rent", 0);

    const { newExpenseId } = await ok<{ newExpenseId: Id<"expenses"> }>("duplicate_expense", {
      expenseId,
    });

    expect(await titlesByAllocation()).toEqual({ [needs]: ["Rent", "Rent"] });
    expect(mcp.changes).toEqual([["expenses", "home"]]);

    await ok("delete_expenses", { expenseIds: [newExpenseId] });
    expect((await listExpenses())[needs].map((item) => item.id)).toEqual([expenseId]);
  });
});

describe("delete_expenses / restore_expenses", () => {
  it("returns the removed rows, which restore_expenses puts back as they were", async () => {
    expense(needs, "Rent", 0);
    const power = expense(needs, "Power", 1);
    const cinema = expense(wants, "Cinema", 0);
    const before = await listExpenses();

    const { deletedCount, deleted } = await ok<{ deletedCount: number; deleted: Expense[] }>(
      "delete_expenses",
      { expenseIds: [power, cinema, power] },
    );

    expect(deletedCount).toBe(2);
    expect(deleted.map((row) => row.title)).toEqual(["Power", "Cinema"]);
    expect(await titlesByAllocation()).toEqual({ [needs]: ["Rent"] });

    expect(await ok("restore_expenses", { expenses: deleted })).toEqual({ success: true });
    expect(await listExpenses()).toEqual(before);
    expect(await mcp.call("restore_expenses", { expenses: deleted })).toEqual({
      ok: false,
      error: "CONFLICT: Expense already exists",
    });
    expect(mcp.changes).toEqual([
      ["expenses", "home"],
      ["expenses", "home"],
    ]);
  });

  it("deletes nothing when one id is unknown, and rejects empty lists", async () => {
    const rent = expense(needs, "Rent", 0);

    expect(await mcp.call("delete_expenses", { expenseIds: [rent, "missing"] })).toEqual({
      ok: false,
      error: "NOT_FOUND: Expense not found",
    });
    expect(await titlesByAllocation()).toEqual({ [needs]: ["Rent"] });
    expect((await mcp.call("delete_expenses", { expenseIds: [] })).ok).toBe(false);
    expect((await mcp.call("restore_expenses", { expenses: [] })).ok).toBe(false);
  });
});

describe("reorder_expenses", () => {
  it("sets one allocation's order; the previous order undoes it", async () => {
    const rent = expense(needs, "Rent", 0);
    const power = expense(needs, "Power", 1);

    await ok("reorder_expenses", { orderedIds: [power, rent] });
    expect(await titlesByAllocation()).toEqual({ [needs]: ["Power", "Rent"] });

    await ok("reorder_expenses", { orderedIds: [rent, power] });
    expect(await titlesByAllocation()).toEqual({ [needs]: ["Rent", "Power"] });
    expect(mcp.changes).toEqual([["expenses"], ["expenses"]]);
  });
});
