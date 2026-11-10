import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Id, asId } from "@shared/domain";
import type { DatabaseHandle } from "../db";
import type { NewBudgetRow } from "../db/schema";
import {
  insertAllocation,
  insertBudget,
  insertExpense,
  openTestDatabase,
} from "./budgets.fixtures";
import * as home from "./home";

let handle: DatabaseHandle;

beforeEach(() => {
  handle = openTestDatabase();
});

afterEach(() => {
  handle.close();
});

function summary() {
  return home.summary(handle.db);
}

function budget(values: Partial<NewBudgetRow> & { createdAt: number }) {
  return insertBudget(handle.db, { income: 1000, ...values });
}

function allocation(
  budgetId: Id<"budgets">,
  { amount = 500, sortOrder = 0, createdAt = 1, categoryName = "Needs" } = {},
) {
  return insertAllocation(handle.db, {
    budgetId,
    categoryName,
    percentage: 50,
    amount,
    sortOrder,
    createdAt,
  });
}

function expense(
  allocationRow: { id: Id<"budgetAllocations">; budgetId: Id<"budgets"> },
  {
    amount = 10,
    createdAt = 1,
    title = "Coffee",
    id,
  }: {
    amount?: number;
    createdAt?: number;
    title?: string;
    id?: string;
  } = {},
) {
  return insertExpense(handle.db, {
    ...(id !== undefined ? { id: asId<"expenses">(id) } : {}),
    budgetId: allocationRow.budgetId,
    allocationId: allocationRow.id,
    amount,
    title,
    order: 0,
    createdAt,
  });
}

function mainId() {
  return summary().main?.id ?? null;
}

describe("home.summary", () => {
  it("is empty when no budget is active", () => {
    const archived = budget({ status: "archived", createdAt: 100 });
    expense(allocation(archived.id, { amount: 1 }), { amount: 50, createdAt: 200 });

    expect(summary()).toEqual({
      main: null,
      others: [],
      overspent: [],
    });
  });

  it("reports the main budget with every allocation in sortOrder, createdAt, id", () => {
    const groceries = budget({ title: "Groceries", currency: "eur", income: 1200, createdAt: 100 });
    const wants = allocation(groceries.id, { categoryName: "Wants", sortOrder: 2, amount: 360 });
    const needs = allocation(groceries.id, { categoryName: "Needs", sortOrder: 1, amount: 600 });
    const savings = allocation(groceries.id, {
      categoryName: "Savings",
      sortOrder: 2,
      createdAt: 2,
      amount: 240,
    });
    expense(needs, { amount: 100, createdAt: 150 });
    expense(needs, { amount: 25.5, createdAt: 160 });
    expense(wants, { amount: 40, createdAt: 170 });

    expect(summary().main).toEqual({
      id: groceries.id,
      title: "Groceries",
      currency: "eur",
      income: 1200,
      spent: 165.5,
      lastActivityAt: 170,
      allocations: [
        { id: needs.id, categoryName: "Needs", amount: 600, spent: 125.5 },
        { id: wants.id, categoryName: "Wants", amount: 360, spent: 40 },
        { id: savings.id, categoryName: "Savings", amount: 240, spent: 0 },
      ],
      biggestExpenses: [
        expect.objectContaining({ amount: 100 }),
        expect.objectContaining({ amount: 40 }),
        expect.objectContaining({ amount: 25.5 }),
      ],
    });
  });

  it("uses createdAt as the activity of a budget without expenses", () => {
    const empty = budget({ createdAt: 100 });

    expect(summary().main).toMatchObject({ id: empty.id, spent: 0, lastActivityAt: 100 });
  });

  it("hands main to a new budget, and back to an older one that gets a new expense", () => {
    const older = budget({ createdAt: 100 });
    const olderNeeds = allocation(older.id);
    expense(olderNeeds, { createdAt: 150 });
    expect(mainId()).toBe(older.id);

    const newer = budget({ createdAt: 200 });
    expect(mainId()).toBe(newer.id);

    expense(olderNeeds, { createdAt: 300 });
    expect(mainId()).toBe(older.id);
    expect(summary().others.map((b) => b.id)).toEqual([newer.id]);
  });

  it("breaks activity ties by createdAt desc, then id desc", () => {
    const early = budget({ createdAt: 100 });
    expense(allocation(early.id), { createdAt: 300 });
    const lowId = budget({
      id: asId<"budgets">("00000000-0000-0000-0000-00000000000a"),
      createdAt: 300,
    });
    const highId = budget({
      id: asId<"budgets">("00000000-0000-0000-0000-00000000000b"),
      createdAt: 300,
    });

    const { main, others } = summary();
    expect([main?.id, ...others.map((b) => b.id)]).toEqual([highId.id, lowId.id, early.id]);
  });

  it("lists at most 4 others after main", () => {
    const ids = [1, 2, 3, 4, 5, 6].map((n) => budget({ title: `B${n}`, createdAt: n * 100 }).id);
    budget({ status: "archived", createdAt: 1000 });

    const result = summary();
    expect(result.main?.id).toBe(ids[5]);
    expect(result.others.map((b) => b.id)).toEqual([ids[4], ids[3], ids[2], ids[1]]);
    expect(result.others[0]).toEqual({
      id: ids[4],
      title: "B5",
      currency: "usd",
      income: 1000,
      spent: 0,
      lastActivityAt: 500,
    });
  });

  it("leaves archived budgets, their allocations and expenses out of every part", () => {
    const active = budget({ title: "Active", createdAt: 100 });
    expense(allocation(active.id), { title: "Kept", createdAt: 110 });
    const archived = budget({ title: "Archived", status: "archived", createdAt: 200 });
    expense(allocation(archived.id, { amount: 1 }), {
      title: "Hidden",
      amount: 99,
      createdAt: 300,
    });

    const result = summary();
    expect(result.main?.id).toBe(active.id);
    expect(result.others).toEqual([]);
    expect(result.overspent).toEqual([]);
    expect(result.main?.biggestExpenses.map((e) => e.title)).toEqual(["Kept"]);
  });

  it("leaves trashed budgets, their allocations and expenses out of every part", () => {
    const active = budget({ title: "Active", createdAt: 100 });
    expense(allocation(active.id), { title: "Kept", createdAt: 110 });
    const trashed = budget({ title: "Trashed", createdAt: 200, deletedAt: 250 });
    expense(allocation(trashed.id, { amount: 1 }), {
      title: "Hidden",
      amount: 99,
      createdAt: 300,
    });

    const result = summary();
    expect(result.main?.id).toBe(active.id);
    expect(result.others).toEqual([]);
    expect(result.overspent).toEqual([]);
    expect(result.main?.biggestExpenses.map((e) => e.title)).toEqual(["Kept"]);
  });

  it("rounds spent with roundMoney and returns income and amounts as stored", () => {
    const b = budget({ income: 1000.5, createdAt: 100 });
    const needs = allocation(b.id, { amount: 500.25 });
    expense(needs, { amount: 0.1, createdAt: 110 });
    expense(needs, { amount: 0.2, createdAt: 120 });

    expect(summary().main).toMatchObject({
      income: 1000.5,
      spent: 0.3,
      allocations: [{ amount: 500.25, spent: 0.3 }],
    });
  });

  describe("overspent", () => {
    it("lists allocations whose rounded spent strictly exceeds the amount", () => {
      const b = budget({ title: "Main", currency: "kzt", createdAt: 100 });
      const over = allocation(b.id, { categoryName: "Over", amount: 50, sortOrder: 1 });
      const equal = allocation(b.id, { categoryName: "Equal", amount: 50, sortOrder: 2 });
      const noise = allocation(b.id, { categoryName: "Noise", amount: 0.3, sortOrder: 3 });
      expense(over, { amount: 50.01 });
      expense(equal, { amount: 30 });
      expense(equal, { amount: 20 });
      expense(noise, { amount: 0.1 });
      expense(noise, { amount: 0.2 });

      expect(summary().overspent).toEqual([
        {
          id: over.id,
          categoryName: "Over",
          amount: 50,
          spent: 50.01,
          budgetId: b.id,
          budgetTitle: "Main",
          currency: "kzt",
        },
      ]);
    });

    it("orders by budget activity, then the allocation's sortOrder, createdAt, id", () => {
      const older = budget({ title: "Older", createdAt: 100 });
      const olderOver = allocation(older.id, { categoryName: "Older over", amount: 1 });
      expense(olderOver, { amount: 2, createdAt: 110 });
      const newer = budget({ title: "Newer", createdAt: 200 });
      const second = allocation(newer.id, { categoryName: "Second", amount: 1, sortOrder: 2 });
      const first = allocation(newer.id, { categoryName: "First", amount: 1, sortOrder: 1 });
      const third = allocation(newer.id, {
        categoryName: "Third",
        amount: 1,
        sortOrder: 2,
        createdAt: 5,
      });
      for (const a of [second, first, third]) expense(a, { amount: 2, createdAt: 50 });

      expect(summary().overspent.map((a) => [a.budgetTitle, a.categoryName])).toEqual([
        ["Newer", "First"],
        ["Newer", "Second"],
        ["Newer", "Third"],
        ["Older", "Older over"],
      ]);
    });

    it("has no limit", () => {
      for (let n = 1; n <= 7; n++) {
        expense(allocation(budget({ createdAt: n * 100 }).id, { amount: 1 }), { amount: 2 });
      }

      expect(summary().overspent).toHaveLength(7);
    });
  });

  describe("biggestExpenses", () => {
    it("lists main's 5 largest by amount desc, then createdAt desc, then id desc", () => {
      const rent = budget({ title: "Rent", createdAt: 100 });
      const needs = allocation(rent.id, { categoryName: "Needs" });
      const wants = allocation(rent.id, { categoryName: "Wants", sortOrder: 1 });
      expense(needs, { title: "Smallest", amount: 1, createdAt: 110 });
      expense(needs, { title: "Big", amount: 90, createdAt: 120 });
      expense(wants, {
        title: "Tie low id",
        amount: 50,
        createdAt: 130,
        id: "00000000-0000-0000-0000-00000000000a",
      });
      const tieHighId = expense(wants, {
        title: "Tie high id",
        amount: 50,
        createdAt: 130,
        id: "00000000-0000-0000-0000-00000000000b",
      });
      expense(needs, { title: "Tie newer", amount: 50, createdAt: 140 });
      expense(needs, { title: "Small", amount: 5, createdAt: 150 });

      const biggest = summary().main?.biggestExpenses;
      expect(biggest?.map((e) => e.title)).toEqual([
        "Big",
        "Tie newer",
        "Tie high id",
        "Tie low id",
        "Small",
      ]);
      expect(biggest?.[2]).toEqual({
        id: tieHighId.id,
        title: "Tie high id",
        amount: 50,
        categoryName: "Wants",
      });
    });

    it("only covers the main budget", () => {
      const older = budget({ createdAt: 100 });
      expense(allocation(older.id), { title: "Older", amount: 999, createdAt: 110 });
      const newer = budget({ createdAt: 200 });
      expense(allocation(newer.id), { title: "Newer", amount: 1, createdAt: 210 });

      expect(summary().main?.biggestExpenses.map((e) => e.title)).toEqual(["Newer"]);
    });
  });

  it("keeps each budget's totals in its own currency, never summed across budgets", () => {
    const dollars = budget({ title: "Dollars", currency: "usd", income: 1000, createdAt: 100 });
    const tenge = budget({ title: "Tenge", currency: "kzt", income: 500000, createdAt: 200 });
    const dollarNeeds = allocation(dollars.id, { amount: 100 });
    const tengeNeeds = allocation(tenge.id, { amount: 200000 });
    expense(dollarNeeds, { amount: 150, createdAt: 300 });
    expense(tengeNeeds, { amount: 50000, createdAt: 250 });

    const result = summary();
    expect(result.main).toMatchObject({ id: dollars.id, currency: "usd", spent: 150 });
    expect(result.main?.allocations).toEqual([
      { id: dollarNeeds.id, categoryName: "Needs", amount: 100, spent: 150 },
    ]);
    expect(result.others).toEqual([
      {
        id: tenge.id,
        title: "Tenge",
        currency: "kzt",
        income: 500000,
        spent: 50000,
        lastActivityAt: 250,
      },
    ]);
    expect(result.overspent).toEqual([
      expect.objectContaining({ id: dollarNeeds.id, currency: "usd", spent: 150, amount: 100 }),
    ]);
  });
});
