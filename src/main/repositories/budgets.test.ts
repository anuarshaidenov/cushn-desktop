// Everything in budgets.ts except the lists, which live in budgets.list.test.ts.
import { asc, desc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TRASH_RETENTION_DAYS } from "@shared/constants";
import { asId } from "@shared/domain";
import { CushnError } from "@shared/errors";
import type { DatabaseHandle } from "../db";
import {
  budgetAllocations,
  budgets as budgetsTable,
  expenses as expensesTable,
  templates,
} from "../db/schema";
import * as budgets from "./budgets";
import {
  expectSearchIndexInSync,
  insertAllocation,
  insertBudget,
  insertExpense,
  insertLabel,
  insertTemplate,
  insertView,
  openTestDatabase,
} from "./budgets.fixtures";

const missingId = "00000000-0000-0000-0000-000000000000";

let handle: DatabaseHandle;

beforeEach(() => {
  handle = openTestDatabase();
});

afterEach(() => {
  handle.close();
});

function expectCushnError(fn: () => unknown, code: CushnError["code"], message: string) {
  expect(fn).toThrow(new CushnError(code, message));
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(CushnError);
    expect((error as CushnError).code).toBe(code);
  }
}

function allocationsOf(budgetId: string) {
  return handle.db
    .select()
    .from(budgetAllocations)
    .where(eq(budgetAllocations.budgetId, asId<"budgets">(budgetId)))
    .orderBy(asc(budgetAllocations.sortOrder))
    .all();
}

function budgetRow(budgetId: string) {
  return handle.db
    .select()
    .from(budgetsTable)
    .where(eq(budgetsTable.id, asId<"budgets">(budgetId)))
    .get();
}

const fiftyThirtyTwenty = [
  { name: "Wants", percentage: 30, description: "Fun", editable: true, sortOrder: 2 },
  { name: "Needs", percentage: 50, description: "Rent", editable: true, sortOrder: 1 },
  { name: "Savings", percentage: 20, description: null, editable: false, sortOrder: 3 },
];

describe("budgets.create", () => {
  it("inserts an active budget and copies every category into an allocation", () => {
    // One allocation per template category.
    const { template } = insertTemplate(handle.db, { categories: fiftyThirtyTwenty });

    const { budgetId } = budgets.create(handle.db, {
      templateId: template.id,
      currency: "usd",
      title: "June",
      description: "Notes",
      income: 1000,
      icon: "piggy-bank",
    });

    expect(budgetRow(budgetId)).toMatchObject({
      title: "June",
      description: "Notes",
      templateId: template.id,
      income: 1000,
      status: "active",
      currency: "usd",
      labelId: null,
      viewId: null,
      icon: "piggy-bank",
    });
    expect(
      allocationsOf(budgetId).map(
        ({ categoryName, percentage, amount, description, editable, sortOrder }) => ({
          categoryName,
          percentage,
          amount,
          description,
          editable,
          sortOrder,
        }),
      ),
    ).toEqual([
      {
        categoryName: "Needs",
        percentage: 50,
        amount: 500,
        description: "Rent",
        editable: true,
        sortOrder: 1,
      },
      {
        categoryName: "Wants",
        percentage: 30,
        amount: 300,
        description: "Fun",
        editable: true,
        sortOrder: 2,
      },
      {
        categoryName: "Savings",
        percentage: 20,
        amount: 200,
        description: null,
        editable: false,
        sortOrder: 3,
      },
    ]);
  });
});

describe("budgets.create rules", () => {
  it("gives each allocation its own created_at tick, in sort order", () => {
    const { template } = insertTemplate(handle.db, { categories: fiftyThirtyTwenty });
    const { budgetId } = budgets.create(handle.db, {
      templateId: template.id,
      currency: "usd",
      title: "June",
    });

    const ticks = allocationsOf(budgetId).map((a) => a.createdAt);
    expect(new Set(ticks).size).toBe(3);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
  });

  it("defaults income to 0 and stores no description, label, view or icon", () => {
    const { template } = insertTemplate(handle.db, { categories: fiftyThirtyTwenty });
    const { budgetId } = budgets.create(handle.db, {
      templateId: template.id,
      currency: "kzt",
      title: "Empty",
    });

    expect(budgetRow(budgetId)).toMatchObject({
      income: 0,
      description: null,
      labelId: null,
      viewId: null,
      icon: null,
    });
    expect(allocationsOf(budgetId).map((a) => a.amount)).toEqual([0, 0, 0]);
  });

  it("rounds income and every allocation amount to cents", () => {
    const { template } = insertTemplate(handle.db, {
      categories: [
        { name: "A", percentage: 33, sortOrder: 1 },
        { name: "B", percentage: 67, sortOrder: 2 },
      ],
    });
    const { budgetId } = budgets.create(handle.db, {
      templateId: template.id,
      currency: "usd",
      title: "x",
      income: 333.33,
    });
    expect(budgetRow(budgetId)?.income).toBe(333.33);
    expect(allocationsOf(budgetId).map((a) => a.amount)).toEqual([110, 223.33]);

    const second = budgets.create(handle.db, {
      templateId: template.id,
      currency: "usd",
      title: "y",
      income: 10.006,
    });
    expect(budgetRow(second.budgetId)?.income).toBe(10.01);
    expect(allocationsOf(second.budgetId).map((a) => a.amount)).toEqual([3.3, 6.71]);
  });

  it("files the budget under an existing View and label", () => {
    const { template } = insertTemplate(handle.db);
    const view = insertView(handle.db);
    const label = insertLabel(handle.db);
    const { budgetId } = budgets.create(handle.db, {
      templateId: template.id,
      currency: "usd",
      title: "x",
      viewId: view.id,
      labelId: label.id,
    });
    expect(budgetRow(budgetId)).toMatchObject({ viewId: view.id, labelId: label.id });
  });

  it("throws NOT_FOUND 'View not found' for an unknown viewId and inserts nothing", () => {
    const { template } = insertTemplate(handle.db, { categories: fiftyThirtyTwenty });
    expectCushnError(
      () =>
        budgets.create(handle.db, {
          templateId: template.id,
          currency: "usd",
          title: "x",
          viewId: asId<"budgetViews">(missingId),
        }),
      "NOT_FOUND",
      "View not found",
    );
    expect(handle.db.select().from(budgetsTable).all()).toEqual([]);
    expect(handle.db.select().from(budgetAllocations).all()).toEqual([]);
  });

  it("throws NOT_FOUND for an unknown template or label instead of a foreign key failure", () => {
    // Otherwise the FK would fail with an opaque INTERNAL error, so the
    // repository answers 404 first.
    const { template } = insertTemplate(handle.db);
    expectCushnError(
      () =>
        budgets.create(handle.db, {
          templateId: asId<"templates">(missingId),
          currency: "usd",
          title: "x",
        }),
      "NOT_FOUND",
      "Template not found",
    );
    expectCushnError(
      () =>
        budgets.create(handle.db, {
          templateId: template.id,
          currency: "usd",
          title: "x",
          labelId: asId<"budgetLabels">(missingId),
        }),
      "NOT_FOUND",
      "Label not found",
    );
  });

  it("makes a budget created in the same millisecond newer than the previous one", () => {
    const { template } = insertTemplate(handle.db);
    const first = budgets.create(handle.db, {
      templateId: template.id,
      currency: "usd",
      title: "a",
    });
    const second = budgets.create(handle.db, {
      templateId: template.id,
      currency: "usd",
      title: "b",
    });
    expect(budgetRow(second.budgetId)!.createdAt).toBeGreaterThan(
      budgetRow(first.budgetId)!.createdAt,
    );
  });
});

describe("budgets.get", () => {
  it("returns the budget with its template and its allocations in sort order", () => {
    const { template } = insertTemplate(handle.db, { categories: fiftyThirtyTwenty });
    const label = insertLabel(handle.db);
    const view = insertView(handle.db);
    const { budgetId } = budgets.create(handle.db, {
      templateId: template.id,
      currency: "eur",
      title: "June",
      description: "Notes",
      income: 1000,
      labelId: label.id,
      viewId: view.id,
    });
    expect(budgets.get(handle.db, { budgetId }).budget?.icon).toBeNull();
    budgets.setIcon(handle.db, { budgetId, icon: "calendar" });

    const { budget, allocations } = budgets.get(handle.db, { budgetId });

    expect(budget).toEqual({
      id: budgetId,
      createdAt: budgetRow(budgetId)!.createdAt,
      templateId: template.id,
      template,
      income: 1000,
      title: "June",
      description: "Notes",
      currency: "eur",
      labelId: label.id,
      viewId: view.id,
      icon: "calendar",
      status: "active",
    });
    expect(allocations.map((a) => [a.categoryName, a.amount, a.currency])).toEqual([
      ["Needs", 500, "eur"],
      ["Wants", 300, "eur"],
      ["Savings", 200, "eur"],
    ]);
    const stored = allocationsOf(budgetId)[0];
    expect(allocations[0]).toEqual({
      id: stored.id,
      budgetId,
      createdAt: stored.createdAt,
      percentage: 50,
      amount: 500,
      categoryName: "Needs",
      description: "Rent",
      currency: "eur",
      editable: true,
    });
  });

  it("ignores status: an archived budget is still readable by id, and says so", () => {
    // getBudgetWithAllocations does not filter on status.
    const { template } = insertTemplate(handle.db);
    const archived = insertBudget(handle.db, {
      templateId: template.id,
      status: "archived",
      createdAt: 5,
    });

    expect(budgets.get(handle.db, { budgetId: archived.id }).budget).toMatchObject({
      id: archived.id,
      status: "archived",
    });
  });

  it("returns { budget: null, allocations: [] } for a missing budget", () => {
    expect(budgets.get(handle.db, { budgetId: asId<"budgets">(missingId) })).toEqual({
      budget: null,
      allocations: [],
    });
  });

  it("returns template: null once the template is deleted", () => {
    const { template } = insertTemplate(handle.db, { categories: fiftyThirtyTwenty });
    const { budgetId } = budgets.create(handle.db, {
      templateId: template.id,
      currency: "usd",
      title: "x",
    });
    handle.db.delete(templates).where(eq(templates.id, template.id)).run();

    const { budget, allocations } = budgets.get(handle.db, { budgetId });
    expect(budget).toMatchObject({ templateId: null, template: null });
    expect(allocations).toHaveLength(3);
  });
});

describe("budgets.getLatest", () => {
  it("returns the most recently created active budget as a full row, icon included", () => {
    // By creation time, archived ones skipped.
    const older = insertBudget(handle.db, { title: "Older", createdAt: 10 });
    insertBudget(handle.db, { title: "Archived", status: "archived", createdAt: 30 });
    const newest = insertBudget(handle.db, {
      title: "Newest",
      income: 5,
      icon: "rocket",
      createdAt: 20,
    });
    insertBudget(handle.db, { title: "Richer", income: 999, createdAt: 15 });

    expect(budgets.getLatest(handle.db)).toEqual({ latestBudget: newest });
    expect(budgets.getLatest(handle.db).latestBudget?.id).not.toBe(older.id);
  });

  it("returns { latestBudget: null } when no budget is active", () => {
    expect(budgets.getLatest(handle.db)).toEqual({ latestBudget: null });
    insertBudget(handle.db, { status: "archived", createdAt: 1 });
    expect(budgets.getLatest(handle.db)).toEqual({ latestBudget: null });
  });
});

describe("budgets.update", () => {
  it("patches only the given fields and returns { success: true }", () => {
    const budget = insertBudget(handle.db, {
      title: "Old",
      description: "Keep",
      income: 100,
      currency: "usd",
      createdAt: 1,
    });

    expect(budgets.update(handle.db, { budgetId: budget.id, title: "New" })).toEqual({
      success: true,
    });
    expect(budgetRow(budget.id)).toMatchObject({
      title: "New",
      description: "Keep",
      income: 100,
      currency: "usd",
    });

    budgets.update(handle.db, { budgetId: budget.id, currency: "kzt" });
    budgets.update(handle.db, { budgetId: budget.id, description: "## Plan" });
    expect(budgetRow(budget.id)).toMatchObject({
      title: "New",
      description: "## Plan",
      currency: "kzt",
    });
  });

  it("clears the description when given null", () => {
    const budget = insertBudget(handle.db, { description: "Notes", createdAt: 1 });
    budgets.update(handle.db, { budgetId: budget.id, description: null });
    expect(budgetRow(budget.id)?.description).toBeNull();
  });

  it("leaves allocation amounts alone when income is not given", () => {
    const budget = insertBudget(handle.db, { income: 100, createdAt: 1 });
    insertAllocation(handle.db, { budgetId: budget.id, percentage: 50, amount: 7, sortOrder: 1 });

    budgets.update(handle.db, { budgetId: budget.id, title: "x" });
    expect(allocationsOf(budget.id).map((a) => a.amount)).toEqual([7]);
  });

  it("recomputes every allocation when income changes, rounded to cents", () => {
    const budget = insertBudget(handle.db, { income: 100, createdAt: 1 });
    insertAllocation(handle.db, { budgetId: budget.id, percentage: 33, amount: 33, sortOrder: 1 });
    insertAllocation(handle.db, { budgetId: budget.id, percentage: 67, amount: 67, sortOrder: 2 });

    budgets.update(handle.db, { budgetId: budget.id, income: 333.334 });

    expect(budgetRow(budget.id)?.income).toBe(333.33);
    expect(allocationsOf(budget.id).map((a) => a.amount)).toEqual([110, 223.33]);
  });

  it("throws NOT_FOUND 'Budget not found' for a missing budget", () => {
    expectCushnError(
      () => budgets.update(handle.db, { budgetId: asId<"budgets">(missingId), title: "x" }),
      "NOT_FOUND",
      "Budget not found",
    );
  });
});

describe("budgets.updateIncome", () => {
  it("sets the income and recomputes every allocation, rounded to cents", () => {
    // Amount = (percentage / 100) * income.
    const budget = insertBudget(handle.db, { income: 100, createdAt: 1 });
    insertAllocation(handle.db, { budgetId: budget.id, percentage: 33, amount: 33, sortOrder: 1 });
    insertAllocation(handle.db, { budgetId: budget.id, percentage: 67, amount: 67, sortOrder: 2 });
    const other = insertBudget(handle.db, { income: 100, createdAt: 2 });
    insertAllocation(handle.db, { budgetId: other.id, percentage: 50, amount: 50, sortOrder: 1 });

    expect(budgets.updateIncome(handle.db, { budgetId: budget.id, income: 333.33 })).toEqual({
      success: true,
    });

    expect(budgetRow(budget.id)?.income).toBe(333.33);
    expect(allocationsOf(budget.id).map((a) => a.amount)).toEqual([110, 223.33]);
    expect(allocationsOf(other.id).map((a) => a.amount)).toEqual([50]);

    budgets.updateIncome(handle.db, { budgetId: budget.id, income: 0.1 + 0.2 });
    expect(budgetRow(budget.id)?.income).toBe(0.3);
    expect(allocationsOf(budget.id).map((a) => a.amount)).toEqual([0.1, 0.2]);
  });

  it("throws NOT_FOUND 'Budget not found' for a missing budget", () => {
    expectCushnError(
      () => budgets.updateIncome(handle.db, { budgetId: asId<"budgets">(missingId), income: 1 }),
      "NOT_FOUND",
      "Budget not found",
    );
  });
});

/** A budget in a View with a label, one allocation and one expense. */
function filedBudget(createdAt: number) {
  const label = insertLabel(handle.db, `Label ${createdAt}`);
  const view = insertView(handle.db, `View ${createdAt}`);
  const budget = insertBudget(handle.db, {
    labelId: label.id,
    viewId: view.id,
    income: 100,
    createdAt,
  });
  const allocation = insertAllocation(handle.db, {
    budgetId: budget.id,
    percentage: 100,
    amount: 100,
    sortOrder: 1,
  });
  const expense = insertExpense(handle.db, {
    budgetId: budget.id,
    allocationId: allocation.id,
    title: "Rent",
    amount: 60,
    order: 0,
  });
  return { budget, allocation, expense };
}

function expensesOf(budgetId: string) {
  return handle.db
    .select()
    .from(expensesTable)
    .where(eq(expensesTable.budgetId, asId<"budgets">(budgetId)))
    .orderBy(asc(expensesTable.order))
    .all();
}

describe("budgets.archive / unarchive", () => {
  it("only flips status; View, label, allocations and expenses stay", () => {
    // Nothing cascades.
    const { budget } = filedBudget(1);

    expect(budgets.archive(handle.db, { budgetId: budget.id })).toEqual({ success: true });
    expect(budgetRow(budget.id)).toEqual({ ...budget, status: "archived" });
    expect(allocationsOf(budget.id)).toHaveLength(1);
    expect(expensesOf(budget.id)).toHaveLength(1);

    expect(budgets.unarchive(handle.db, { budgetId: budget.id })).toEqual({ success: true });
    expect(budgetRow(budget.id)).toEqual(budget);
  });

  it("throws NOT_FOUND 'Budget not found' for a missing budget", () => {
    const budgetId = asId<"budgets">(missingId);
    expectCushnError(
      () => budgets.archive(handle.db, { budgetId }),
      "NOT_FOUND",
      "Budget not found",
    );
    expectCushnError(
      () => budgets.unarchive(handle.db, { budgetId }),
      "NOT_FOUND",
      "Budget not found",
    );
  });
});

describe("budgets.archiveMany", () => {
  it("archives every budget instead of deleting it", () => {
    // Only the status changes.
    const a = filedBudget(1);
    const b = filedBudget(2);
    const untouched = filedBudget(3);

    expect(
      budgets.archiveMany(handle.db, { budgetIds: [a.budget.id, b.budget.id, a.budget.id] }),
    ).toEqual({
      success: true,
    });

    expect(budgetRow(a.budget.id)).toEqual({ ...a.budget, status: "archived" });
    expect(budgetRow(b.budget.id)).toEqual({ ...b.budget, status: "archived" });
    expect(budgetRow(untouched.budget.id)?.status).toBe("active");
    expect(expensesOf(a.budget.id)).toHaveLength(1);
  });

  it("throws NOT_FOUND 'Budget not found' if any id is missing, and archives none", () => {
    // Every id is checked before any is patched.
    const { budget } = filedBudget(1);
    expectCushnError(
      () => budgets.archiveMany(handle.db, { budgetIds: [budget.id, asId<"budgets">(missingId)] }),
      "NOT_FOUND",
      "Budget not found",
    );
    expect(budgetRow(budget.id)?.status).toBe("active");
  });
});

describe("budgets.deleteMany", () => {
  it("hard-deletes the budgets; their allocations and expenses cascade", () => {
    const a = filedBudget(1);
    const b = filedBudget(2);
    const kept = filedBudget(3);

    expect(budgets.deleteMany(handle.db, { budgetIds: [a.budget.id, b.budget.id] })).toEqual({
      success: true,
    });

    expect(handle.db.select({ id: budgetsTable.id }).from(budgetsTable).all()).toEqual([
      { id: kept.budget.id },
    ]);
    expect(handle.db.select({ id: budgetAllocations.id }).from(budgetAllocations).all()).toEqual([
      { id: kept.allocation.id },
    ]);
    expect(handle.db.select({ id: expensesTable.id }).from(expensesTable).all()).toEqual([
      { id: kept.expense.id },
    ]);
  });

  it("throws NOT_FOUND 'Budget not found' if any id is missing, and deletes none", () => {
    const { budget } = filedBudget(1);
    expectCushnError(
      () => budgets.deleteMany(handle.db, { budgetIds: [budget.id, asId<"budgets">(missingId)] }),
      "NOT_FOUND",
      "Budget not found",
    );
    expect(budgetRow(budget.id)).toEqual(budget);
  });
});

describe("budgets.setLabel", () => {
  it("sets the label, and null removes it", () => {
    const budget = insertBudget(handle.db, { createdAt: 1 });
    const label = insertLabel(handle.db);

    expect(budgets.setLabel(handle.db, { budgetId: budget.id, labelId: label.id })).toEqual({
      success: true,
    });
    expect(budgetRow(budget.id)?.labelId).toBe(label.id);

    budgets.setLabel(handle.db, { budgetId: budget.id, labelId: null });
    expect(budgetRow(budget.id)?.labelId).toBeNull();
  });

  it("throws NOT_FOUND 'Budget not found', or 'Label not found' for an unknown label", () => {
    // Otherwise the FK would fail with INTERNAL, so it is a 404 instead.
    const budget = insertBudget(handle.db, { createdAt: 1 });
    const label = insertLabel(handle.db);
    expectCushnError(
      () =>
        budgets.setLabel(handle.db, { budgetId: asId<"budgets">(missingId), labelId: label.id }),
      "NOT_FOUND",
      "Budget not found",
    );
    expectCushnError(
      () =>
        budgets.setLabel(handle.db, {
          budgetId: budget.id,
          labelId: asId<"budgetLabels">(missingId),
        }),
      "NOT_FOUND",
      "Label not found",
    );
  });
});

describe("budgets.setView", () => {
  it("files the budget under the View, and null removes it from its View", () => {
    const budget = insertBudget(handle.db, { createdAt: 1 });
    const view = insertView(handle.db);

    expect(budgets.setView(handle.db, { budgetId: budget.id, viewId: view.id })).toEqual({
      success: true,
    });
    expect(budgetRow(budget.id)?.viewId).toBe(view.id);

    budgets.setView(handle.db, { budgetId: budget.id, viewId: null });
    expect(budgetRow(budget.id)?.viewId).toBeNull();
  });

  it("throws NOT_FOUND 'Budget not found' first, then 'View not found' for an unknown View", () => {
    const budget = insertBudget(handle.db, { createdAt: 1 });
    const unknownView = asId<"budgetViews">(missingId);
    expectCushnError(
      () =>
        budgets.setView(handle.db, { budgetId: asId<"budgets">(missingId), viewId: unknownView }),
      "NOT_FOUND",
      "Budget not found",
    );
    expectCushnError(
      () => budgets.setView(handle.db, { budgetId: budget.id, viewId: unknownView }),
      "NOT_FOUND",
      "View not found",
    );
    expect(budgetRow(budget.id)?.viewId).toBeNull();
  });
});

describe("budgets.setIcon", () => {
  it("sets the icon, and null clears it", () => {
    const budget = insertBudget(handle.db, { createdAt: 1 });

    expect(budgets.setIcon(handle.db, { budgetId: budget.id, icon: "piggy-bank" })).toEqual({
      success: true,
    });
    expect(budgetRow(budget.id)).toEqual({ ...budget, icon: "piggy-bank" });

    budgets.setIcon(handle.db, { budgetId: budget.id, icon: null });
    expect(budgetRow(budget.id)).toEqual(budget);
  });

  it("sets the icon of an archived budget too", () => {
    const budget = insertBudget(handle.db, { status: "archived", createdAt: 1 });
    budgets.setIcon(handle.db, { budgetId: budget.id, icon: "luggage" });
    expect(budgetRow(budget.id)?.icon).toBe("luggage");
  });

  it("throws NOT_FOUND 'Budget not found' for a missing budget", () => {
    expectCushnError(
      () => budgets.setIcon(handle.db, { budgetId: asId<"budgets">(missingId), icon: "rocket" }),
      "NOT_FOUND",
      "Budget not found",
    );
  });
});

describe("budgets.duplicate", () => {
  function archivedSource() {
    const { template } = insertTemplate(handle.db);
    const label = insertLabel(handle.db);
    const view = insertView(handle.db);
    const source = insertBudget(handle.db, {
      title: "June",
      description: "Notes",
      templateId: template.id,
      income: 100,
      status: "archived",
      currency: "eur",
      labelId: label.id,
      viewId: view.id,
      icon: "flights",
      createdAt: 10,
    });
    // Amounts deliberately stale (not 50% of 100): duplicate copies them as stored.
    const needs = insertAllocation(handle.db, {
      budgetId: source.id,
      categoryName: "Needs",
      percentage: 50,
      amount: 7,
      description: "Rent",
      sortOrder: 1,
      createdAt: 11,
    });
    const savings = insertAllocation(handle.db, {
      budgetId: source.id,
      categoryName: "Savings",
      percentage: 50,
      amount: 93,
      editable: false,
      sortOrder: 2,
      createdAt: 12,
    });
    insertExpense(handle.db, {
      budgetId: source.id,
      allocationId: needs.id,
      title: "Rent",
      amount: 60,
      description: "Flat",
      order: 0,
      checked: true,
      createdAt: 13,
    });
    insertExpense(handle.db, {
      budgetId: source.id,
      allocationId: needs.id,
      title: "Food",
      amount: 20.5,
      order: 1,
      createdAt: 14,
    });
    insertExpense(handle.db, {
      budgetId: source.id,
      allocationId: savings.id,
      title: "ETF",
      amount: 50,
      order: 0,
      createdAt: 15,
    });
    return { source, template, label, view };
  }

  it("copies the budget as an active '<title> (Copy)' with the same fields, icon included", () => {
    // Status is always "active".
    const { source, template, label, view } = archivedSource();

    const { newBudgetId } = budgets.duplicate(handle.db, { budgetId: source.id });

    expect(newBudgetId).not.toBe(source.id);
    expect(budgetRow(newBudgetId)).toMatchObject({
      title: "June (Copy)",
      description: "Notes",
      templateId: template.id,
      income: 100,
      status: "active",
      currency: "eur",
      labelId: label.id,
      viewId: view.id,
      icon: "flights",
    });
    expect(budgetRow(source.id)).toEqual(source);
    expect(budgets.getLatest(handle.db).latestBudget?.id).toBe(newBudgetId);
  });

  it("copies allocations with their stored amounts and expenses remapped to the new allocations", () => {
    const { source } = archivedSource();

    const { newBudgetId } = budgets.duplicate(handle.db, { budgetId: source.id });

    const copied = allocationsOf(newBudgetId);
    expect(
      copied.map(({ categoryName, percentage, amount, description, editable, sortOrder }) => ({
        categoryName,
        percentage,
        amount,
        description,
        editable,
        sortOrder,
      })),
    ).toEqual([
      {
        categoryName: "Needs",
        percentage: 50,
        amount: 7,
        description: "Rent",
        editable: true,
        sortOrder: 1,
      },
      {
        categoryName: "Savings",
        percentage: 50,
        amount: 93,
        description: null,
        editable: false,
        sortOrder: 2,
      },
    ]);
    const [needs, savings] = copied;
    expect(
      expensesOf(newBudgetId).map(
        ({ allocationId, title, amount, description, order, checked }) => ({
          allocationId,
          title,
          amount,
          description,
          order,
          checked,
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        {
          allocationId: needs.id,
          title: "Rent",
          amount: 60,
          description: "Flat",
          order: 0,
          checked: true,
        },
        {
          allocationId: needs.id,
          title: "Food",
          amount: 20.5,
          description: null,
          order: 1,
          checked: false,
        },
        {
          allocationId: savings.id,
          title: "ETF",
          amount: 50,
          description: null,
          order: 0,
          checked: false,
        },
      ]),
    );
    expect(expensesOf(newBudgetId)).toHaveLength(3);
    expect(expensesOf(source.id)).toHaveLength(3);
  });

  it("gives every copied row its own created_at tick", () => {
    const { source } = archivedSource();
    const { newBudgetId } = budgets.duplicate(handle.db, { budgetId: source.id });

    expect(new Set(allocationsOf(newBudgetId).map((a) => a.createdAt)).size).toBe(2);
    expect(new Set(expensesOf(newBudgetId).map((e) => e.createdAt)).size).toBe(3);
  });

  it("throws NOT_FOUND 'Budget not found' for a missing budget", () => {
    expectCushnError(
      () => budgets.duplicate(handle.db, { budgetId: asId<"budgets">(missingId) }),
      "NOT_FOUND",
      "Budget not found",
    );
  });
});

describe("budgets.exportMarkdown", () => {
  it("renders the budget with its template, label, View, allocations and expenses", () => {
    const { template } = insertTemplate(handle.db, { name: "50/30/20" });
    const label = insertLabel(handle.db, "Monthly");
    const view = insertView(handle.db, "Home");
    const budget = insertBudget(handle.db, {
      title: "June budget",
      templateId: template.id,
      labelId: label.id,
      viewId: view.id,
      income: 1000,
      status: "archived",
      createdAt: Date.UTC(2025, 5, 1),
    });
    const wants = insertAllocation(handle.db, {
      budgetId: budget.id,
      categoryName: "Wants",
      percentage: 30,
      amount: 300,
      sortOrder: 2,
    });
    const needs = insertAllocation(handle.db, {
      budgetId: budget.id,
      categoryName: "Needs",
      percentage: 70,
      amount: 700,
      sortOrder: 1,
    });
    insertExpense(handle.db, {
      budgetId: budget.id,
      allocationId: needs.id,
      title: "Rent",
      amount: 600,
      order: 0,
    });
    insertExpense(handle.db, {
      budgetId: budget.id,
      allocationId: wants.id,
      title: "Cinema",
      amount: 25.5,
      order: 0,
    });

    const result = budgets.exportMarkdown(handle.db, { budgetId: budget.id });

    expect(result.filename).toBe("june-budget-2025-06-01.md");
    expect(result.markdown).toContain('title: "June budget"\nstatus: archived');
    expect(result.markdown).toContain(
      'template: "50/30/20"\nlabel: "Monthly"\nfolder: "Home"\ncreated: 2025-06-01',
    );
    expect(result.markdown).toContain(
      "  allocated: 1000\n  unallocated: 0\n  spent: 625.5\n  remaining: 374.5",
    );
    expect(result.markdown.indexOf("| Needs | 70% |")).toBeLessThan(
      result.markdown.indexOf("| Wants | 30% |"),
    );
    expect(result.markdown).toContain("| ☐ | Cinema | $25.50 |  |");
  });

  it("throws NOT_FOUND 'Budget not found' for a missing budget", () => {
    expectCushnError(
      () => budgets.exportMarkdown(handle.db, { budgetId: asId<"budgets">(missingId) }),
      "NOT_FOUND",
      "Budget not found",
    );
  });
});

const DAY = 24 * 60 * 60 * 1000;

function trashed(createdAt: number, deletedAt: number, status: "active" | "archived" = "active") {
  return insertBudget(handle.db, { title: `Trashed ${createdAt}`, status, createdAt, deletedAt });
}

describe("budgets.trash / restore", () => {
  it("trash stamps deleted_at and keeps status, View, label, allocations and expenses", () => {
    const a = filedBudget(1);
    const b = insertBudget(handle.db, { status: "archived", createdAt: 2 });
    const untouched = filedBudget(3);

    const before = Date.now();
    expect(budgets.trash(handle.db, { budgetIds: [a.budget.id, b.id] })).toEqual({
      success: true,
    });

    const rowA = budgetRow(a.budget.id)!;
    expect(rowA).toEqual({ ...a.budget, deletedAt: rowA.deletedAt });
    expect(rowA.deletedAt).toBeGreaterThanOrEqual(before);
    expect(budgetRow(b.id)).toMatchObject({ status: "archived", deletedAt: rowA.deletedAt });
    expect(budgetRow(untouched.budget.id)?.deletedAt).toBeNull();
    expect(allocationsOf(a.budget.id)).toHaveLength(1);
    expect(expensesOf(a.budget.id)).toHaveLength(1);
  });

  it("restore puts each budget back as it was, archived ones archived", () => {
    const a = filedBudget(1);
    const b = insertBudget(handle.db, { status: "archived", createdAt: 2 });
    budgets.trash(handle.db, { budgetIds: [a.budget.id, b.id] });

    expect(budgets.restore(handle.db, { budgetIds: [a.budget.id, b.id] })).toEqual({
      success: true,
    });

    expect(budgetRow(a.budget.id)).toEqual(a.budget);
    expect(budgetRow(b.id)).toEqual(b);
  });

  it("trash throws NOT_FOUND for a missing or already trashed budget, and trashes none", () => {
    const { budget } = filedBudget(1);
    const inTrash = trashed(2, 5);
    for (const other of [asId<"budgets">(missingId), inTrash.id]) {
      expectCushnError(
        () => budgets.trash(handle.db, { budgetIds: [budget.id, other] }),
        "NOT_FOUND",
        "Budget not found",
      );
    }
    expect(budgetRow(budget.id)).toEqual(budget);
    expect(budgetRow(inTrash.id)).toEqual(inTrash);
  });

  it("restore throws NOT_FOUND unless every budget is in the trash, and restores none", () => {
    const { budget } = filedBudget(1);
    const inTrash = trashed(2, 5);
    for (const other of [asId<"budgets">(missingId), budget.id]) {
      expectCushnError(
        () => budgets.restore(handle.db, { budgetIds: [inTrash.id, other] }),
        "NOT_FOUND",
        "Budget not found",
      );
    }
    expect(budgetRow(inTrash.id)).toEqual(inTrash);
  });
});

describe("trashed budgets are invisible to normal reads and writes", () => {
  it("get reads a trashed budget as missing; getLatest skips it", () => {
    const older = insertBudget(handle.db, { title: "Older", createdAt: 1 });
    const newest = filedBudget(2);
    budgets.trash(handle.db, { budgetIds: [newest.budget.id] });

    expect(budgets.get(handle.db, { budgetId: newest.budget.id })).toEqual({
      budget: null,
      allocations: [],
    });
    expect(budgets.getLatest(handle.db)).toEqual({ latestBudget: older });
  });

  it("every write but deleteMany throws NOT_FOUND 'Budget not found' and changes nothing", () => {
    const { budget } = filedBudget(1);
    const label = insertLabel(handle.db, "Other");
    const view = insertView(handle.db, "Other");
    budgets.trash(handle.db, { budgetIds: [budget.id] });
    const inTrash = budgetRow(budget.id);
    const budgetId = budget.id;
    const budgetIds = [budget.id];

    const writes = [
      () => budgets.update(handle.db, { budgetId, title: "New" }),
      () => budgets.updateIncome(handle.db, { budgetId, income: 5 }),
      () => budgets.archive(handle.db, { budgetId }),
      () => budgets.unarchive(handle.db, { budgetId }),
      () => budgets.archiveMany(handle.db, { budgetIds }),
      () => budgets.unarchiveMany(handle.db, { budgetIds }),
      () => budgets.setLabel(handle.db, { budgetId, labelId: label.id }),
      () => budgets.setView(handle.db, { budgetId, viewId: view.id }),
      () => budgets.setIcon(handle.db, { budgetId, icon: "star" }),
      () => budgets.duplicate(handle.db, { budgetId }),
      () => budgets.exportMarkdown(handle.db, { budgetId }),
    ];
    for (const write of writes) expectCushnError(write, "NOT_FOUND", "Budget not found");

    expect(budgetRow(budget.id)).toEqual(inTrash);
    expect(handle.db.select().from(budgetsTable).all()).toHaveLength(1);
  });

  it("deleteMany hard-deletes trashed budgets too", () => {
    const a = filedBudget(1);
    const b = filedBudget(2);
    budgets.trash(handle.db, { budgetIds: [a.budget.id] });

    budgets.deleteMany(handle.db, { budgetIds: [a.budget.id, b.budget.id] });

    expect(handle.db.select().from(budgetsTable).all()).toEqual([]);
    expect(handle.db.select().from(expensesTable).all()).toEqual([]);
    expectSearchIndexInSync(handle.sqlite);
  });
});

describe("budgets.unarchiveMany", () => {
  it("makes every budget active, all or nothing", () => {
    const a = insertBudget(handle.db, { status: "archived", createdAt: 1 });
    const b = insertBudget(handle.db, { status: "archived", createdAt: 2 });

    expectCushnError(
      () => budgets.unarchiveMany(handle.db, { budgetIds: [a.id, asId<"budgets">(missingId)] }),
      "NOT_FOUND",
      "Budget not found",
    );
    expect(budgetRow(a.id)?.status).toBe("archived");

    expect(budgets.unarchiveMany(handle.db, { budgetIds: [a.id, b.id] })).toEqual({
      success: true,
    });
    expect(budgetRow(a.id)?.status).toBe("active");
    expect(budgetRow(b.id)?.status).toBe("active");
  });
});

describe("budgets.emptyTrash", () => {
  it("hard-deletes every trashed budget with its children and returns the count", () => {
    const a = filedBudget(1);
    const b = filedBudget(2);
    const kept = filedBudget(3);
    budgets.trash(handle.db, { budgetIds: [a.budget.id, b.budget.id] });

    expect(budgets.emptyTrash(handle.db)).toEqual({ deletedCount: 2 });

    expect(handle.db.select({ id: budgetsTable.id }).from(budgetsTable).all()).toEqual([
      { id: kept.budget.id },
    ]);
    expect(handle.db.select({ id: expensesTable.id }).from(expensesTable).all()).toEqual([
      { id: kept.expense.id },
    ]);
    expectSearchIndexInSync(handle.sqlite);
    expect(budgets.emptyTrash(handle.db)).toEqual({ deletedCount: 0 });
  });
});

describe("budgets.purgeTrash", () => {
  it(`hard-deletes budgets trashed at least ${TRASH_RETENTION_DAYS} days before now`, () => {
    const now = 100 * DAY;
    const limit = now - TRASH_RETENTION_DAYS * DAY;
    const expired = trashed(1, limit - 1);
    const onTheLimit = trashed(2, limit, "archived");
    const recent = trashed(3, limit + 1);
    const live = insertBudget(handle.db, { createdAt: 4 });
    insertExpense(handle.db, {
      budgetId: expired.id,
      allocationId: insertAllocation(handle.db, {
        budgetId: expired.id,
        percentage: 100,
        amount: 1,
      }).id,
      title: "Gone",
      amount: 1,
      order: 0,
    });

    expect(budgets.purgeTrash(handle.db, now)).toBe(2);

    expect(
      handle.db
        .select({ id: budgetsTable.id })
        .from(budgetsTable)
        .orderBy(budgetsTable.createdAt)
        .all(),
    ).toEqual([{ id: recent.id }, { id: live.id }]);
    expect(budgetRow(onTheLimit.id)).toBeUndefined();
    expect(handle.db.select().from(expensesTable).all()).toEqual([]);
    expectSearchIndexInSync(handle.sqlite);
  });
});

describe("budgets.listTrashed", () => {
  it("lists trashed budgets of either status, most recently deleted first, with status and deletedAt", () => {
    const { template } = insertTemplate(handle.db, { name: "50/30/20" });
    const label = insertLabel(handle.db, "Monthly", "#F97316");
    const view = insertView(handle.db, "Home");
    insertBudget(handle.db, { title: "Live", createdAt: 1 });
    const june = insertBudget(handle.db, {
      title: "June",
      description: "Notes",
      templateId: template.id,
      income: 1000,
      currency: "eur",
      labelId: label.id,
      viewId: view.id,
      icon: "calendar",
      status: "archived",
      createdAt: 2,
      deletedAt: 50,
    });
    trashed(3, 40);
    trashed(4, 60);

    const result = budgets.listTrashed(handle.db, { cursor: null, numItems: 10 });

    expect(result.page.map((b) => b.title)).toEqual(["Trashed 4", "June", "Trashed 3"]);
    expect(result.isDone).toBe(true);
    expect(result.continueCursor).toBeNull();
    expect(result.page[1]).toEqual({
      id: june.id,
      createdAt: 2,
      templateId: template.id,
      template,
      income: 1000,
      description: "Notes",
      title: "June",
      currency: "eur",
      label: { id: label.id, name: "Monthly", color: "#F97316" },
      icon: "calendar",
      status: "archived",
      deletedAt: 50,
    });
  });

  it("pages by cursor with deleted_at ties broken by id, with no duplicates or gaps", () => {
    for (let i = 0; i < 30; i++) trashed(i + 1, Math.floor(i / 3));

    const seen: string[] = [];
    let cursor: string | null = null;
    for (;;) {
      const result = budgets.listTrashed(handle.db, { cursor, numItems: 7 });
      seen.push(...result.page.map((b) => b.id));
      if (result.isDone) break;
      cursor = result.continueCursor;
    }

    const expected = handle.db
      .select({ id: budgetsTable.id })
      .from(budgetsTable)
      .orderBy(desc(budgetsTable.deletedAt), desc(budgetsTable.id))
      .all()
      .map((b) => b.id);
    expect(seen).toEqual(expected);
  });

  it("rejects a malformed cursor with BAD_REQUEST 'Invalid cursor'", () => {
    for (const cursor of ["nope", "[1]", '["a", "b"]', "[1, 2, 3]"]) {
      expectCushnError(
        () => budgets.listTrashed(handle.db, { cursor, numItems: 5 }),
        "BAD_REQUEST",
        "Invalid cursor",
      );
    }
  });
});
