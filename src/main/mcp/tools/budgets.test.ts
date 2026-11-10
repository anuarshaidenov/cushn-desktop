// The budget tools over MCP. The repository behind each is covered in
// repositories/budgets.test.ts and budgets.list.test.ts; these pin the
// tools' input, defaults, limits, `changes` and undo round trips.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BudgetDetail, BudgetListItem, Page, TrashedBudgetListItem } from "@shared/api";
import { BUDGET_ICON_GROUPS } from "@shared/budgetIcons";
import { CURRENCY_CODES } from "@shared/currencies";
import type { Id } from "@shared/domain";
import {
  insertAllocation,
  insertBudget,
  insertExpense,
  insertLabel,
  insertTemplate,
  insertView,
} from "../../repositories/budgets.fixtures";
import { type McpHarness, connectMcp } from "../testing";

let mcp: McpHarness;

beforeEach(async () => {
  mcp = await connectMcp();
});

afterEach(async () => {
  await mcp.close();
});

async function ok<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const outcome = await mcp.call(name, args);
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.data as T;
}

function listBudgets(args: Record<string, unknown> = {}) {
  return ok<Page<BudgetListItem>>("list_budgets", args);
}

function titles(page: Page<{ title: string }>): string[] {
  return page.page.map((budget) => budget.title);
}

async function getBudget(budgetId: Id<"budgets">) {
  return ok<{ budget: BudgetDetail; allocations: { categoryName: string; amount: number }[] }>(
    "get_budget",
    { budgetId },
  );
}

async function inputSchema(name: string) {
  const { tools } = await mcp.client.listTools();
  const tool = tools.find((candidate) => candidate.name === name);
  return (tool?.inputSchema.properties ?? {}) as Record<string, Record<string, unknown>>;
}

async function inputKeys(name: string): Promise<string[]> {
  return Object.keys(await inputSchema(name));
}

function budgetWithAllocations() {
  const budget = insertBudget(mcp.db, { title: "June", income: 1000, createdAt: 10 });
  const needs = insertAllocation(mcp.db, {
    budgetId: budget.id,
    categoryName: "Needs",
    percentage: 60,
    amount: 600,
    sortOrder: 1,
  });
  insertAllocation(mcp.db, {
    budgetId: budget.id,
    categoryName: "Wants",
    percentage: 40,
    amount: 400,
    sortOrder: 2,
  });
  insertExpense(mcp.db, {
    budgetId: budget.id,
    allocationId: needs.id,
    title: "Rent",
    amount: 500,
    order: 0,
  });
  return budget;
}

describe("list_budgets", () => {
  it("is listed as a read-only tool with optional filters and a bounded page size", async () => {
    const { tools } = await mcp.client.listTools();
    const tool = tools.find((candidate) => candidate.name === "list_budgets");

    expect(tool?.annotations).toEqual({ readOnlyHint: true });
    expect(tool?.inputSchema.required ?? []).toEqual([]);
    expect(Object.keys(tool?.inputSchema.properties ?? {})).toEqual([
      "search",
      "labelIds",
      "templateIds",
      "currencies",
      "sortBy",
      "sortOrder",
      "viewId",
      "cursor",
      "numItems",
    ]);
    expect(tool?.inputSchema.properties?.numItems).toMatchObject({
      type: "integer",
      minimum: 1,
      maximum: 100,
      default: 25,
    });
  });

  it("lists active budgets, newest first, leaving out archived and trashed ones", async () => {
    insertBudget(mcp.db, { title: "May", createdAt: 10 });
    insertBudget(mcp.db, { title: "June", income: 5000, currency: "eur", createdAt: 20 });
    insertBudget(mcp.db, { title: "Old", status: "archived", createdAt: 30 });
    insertBudget(mcp.db, { title: "Gone", deletedAt: 40, createdAt: 40 });

    const result = await listBudgets();

    expect(titles(result)).toEqual(["June", "May"]);
    expect(result).toMatchObject({ isDone: true, continueCursor: null });
    expect(result.page[0]).toMatchObject({ income: 5000, currency: "eur", label: null });
    expect(mcp.changes).toEqual([]);
  });

  it("filters by View and template", async () => {
    const view = insertView(mcp.db, "Home");
    const { template } = insertTemplate(mcp.db, { name: "50/30/20" });
    insertBudget(mcp.db, { title: "In view", viewId: view.id, createdAt: 10 });
    insertBudget(mcp.db, { title: "From template", templateId: template.id, createdAt: 20 });

    expect(titles(await listBudgets({ viewId: view.id }))).toEqual(["In view"]);
    expect(titles(await listBudgets({ templateIds: [template.id] }))).toEqual(["From template"]);
  });

  it("filters by search, label and currency, and sorts", async () => {
    const label = insertLabel(mcp.db, "Travel");
    insertBudget(mcp.db, { title: "Groceries", income: 300, createdAt: 10 });
    insertBudget(mcp.db, {
      title: "Trip to Rome",
      currency: "eur",
      labelId: label.id,
      createdAt: 20,
    });
    insertBudget(mcp.db, { title: "Groceries EU", income: 100, currency: "eur", createdAt: 30 });

    expect(titles(await listBudgets({ search: "groc" }))).toEqual(["Groceries EU", "Groceries"]);
    expect(titles(await listBudgets({ labelIds: [label.id] }))).toEqual(["Trip to Rome"]);
    expect(titles(await listBudgets({ currencies: ["EUR"] }))).toEqual([
      "Groceries EU",
      "Trip to Rome",
    ]);
    expect(titles(await listBudgets({ sortBy: "income", sortOrder: "asc" }))).toEqual([
      "Trip to Rome",
      "Groceries EU",
      "Groceries",
    ]);
  });

  it("pages by cursor, 25 at a time by default", async () => {
    for (let n = 1; n <= 27; n++) insertBudget(mcp.db, { createdAt: n });

    const first = await listBudgets();
    const second = await listBudgets({ cursor: first.continueCursor });
    const small = await listBudgets({ numItems: 2, cursor: null });

    expect(first.page).toHaveLength(25);
    expect(first.isDone).toBe(false);
    expect(titles(second)).toEqual(["Budget 2", "Budget 1"]);
    expect(second.isDone).toBe(true);
    expect(titles(small)).toEqual(["Budget 27", "Budget 26"]);
  });

  it("answers BAD_REQUEST for a malformed cursor", async () => {
    expect(await mcp.call("list_budgets", { cursor: "page-2" })).toEqual({
      ok: false,
      error: "BAD_REQUEST: Invalid cursor",
    });
  });

  it("rejects a page size outside 1 to 100", async () => {
    for (const numItems of [0, 101, 2.5]) {
      const outcome = await mcp.call("list_budgets", { numItems });
      expect(outcome.ok, String(numItems)).toBe(false);
      expect(!outcome.ok && outcome.error).toMatch(/Invalid arguments for tool list_budgets/);
    }
  });
});

describe("list_archived_budgets", () => {
  it("lists archived budgets with the active list's filters, without viewId", async () => {
    const view = insertView(mcp.db);
    insertBudget(mcp.db, { title: "Active", createdAt: 10 });
    insertBudget(mcp.db, { title: "Old EUR", status: "archived", currency: "eur", createdAt: 20 });
    insertBudget(mcp.db, { title: "Old", status: "archived", viewId: view.id, createdAt: 30 });

    const all = await ok<Page<BudgetListItem>>("list_archived_budgets");
    const euros = await ok<Page<BudgetListItem>>("list_archived_budgets", {
      currencies: ["EUR"],
    });

    expect(titles(all)).toEqual(["Old", "Old EUR"]);
    expect(all.page[0]).not.toHaveProperty("viewId");
    expect(titles(euros)).toEqual(["Old EUR"]);
    expect(await inputKeys("list_archived_budgets")).not.toContain("viewId");
  });
});

describe("list_trashed_budgets", () => {
  it("lists trashed budgets, most recently trashed first, with the status restore returns to", async () => {
    insertBudget(mcp.db, { title: "Live", createdAt: 10 });
    insertBudget(mcp.db, { title: "First", deletedAt: 50, createdAt: 20 });
    insertBudget(mcp.db, { title: "Second", status: "archived", deletedAt: 60, createdAt: 30 });

    const result = await ok<Page<TrashedBudgetListItem>>("list_trashed_budgets", { numItems: 1 });
    const next = await ok<Page<TrashedBudgetListItem>>("list_trashed_budgets", {
      cursor: result.continueCursor,
    });

    expect(await inputKeys("list_trashed_budgets")).toEqual(["cursor", "numItems"]);
    expect(result.page).toMatchObject([{ title: "Second", status: "archived", deletedAt: 60 }]);
    expect(titles(next)).toEqual(["First"]);
    expect(next.isDone).toBe(true);
  });
});

describe("get_budget", () => {
  it("returns an active or archived budget with its allocations in display order", async () => {
    const budget = budgetWithAllocations();
    const archived = insertBudget(mcp.db, { title: "Old", status: "archived", createdAt: 20 });

    const result = await getBudget(budget.id);

    expect(result.budget).toMatchObject({
      id: budget.id,
      title: "June",
      income: 1000,
      status: "active",
    });
    expect(result.allocations).toMatchObject([
      { categoryName: "Needs", amount: 600, currency: "usd" },
      { categoryName: "Wants", amount: 400, currency: "usd" },
    ]);
    expect((await getBudget(archived.id)).budget).toMatchObject({
      title: "Old",
      status: "archived",
    });
  });

  it("answers NOT_FOUND for a missing or trashed budget", async () => {
    const trashed = insertBudget(mcp.db, { deletedAt: 5, createdAt: 1 });

    for (const budgetId of ["missing", trashed.id]) {
      expect(await mcp.call("get_budget", { budgetId })).toEqual({
        ok: false,
        error: "NOT_FOUND: Budget not found",
      });
    }
  });
});

describe("create_budget", () => {
  it("creates an active budget from a template, lowercasing the currency; trash undoes it", async () => {
    const { template } = insertTemplate(mcp.db, {
      categories: [
        { name: "Needs", percentage: 50, sortOrder: 1 },
        { name: "Wants", percentage: 50, sortOrder: 2 },
      ],
    });

    const { budgetId } = await ok<{ budgetId: Id<"budgets"> }>("create_budget", {
      templateId: template.id,
      title: "July",
      currency: "EUR",
      income: 3000,
    });

    const created = await getBudget(budgetId);
    expect(created.budget).toMatchObject({ title: "July", currency: "eur", income: 3000 });
    expect(created.allocations.map((a) => a.amount)).toEqual([1500, 1500]);
    expect(mcp.changes).toEqual([["budgets", "home"]]);

    await ok("trash_budgets", { budgetIds: [budgetId] });
    expect(titles(await listBudgets())).toEqual([]);
  });

  it("requires a template, title and supported currency, and defaults income to 0", async () => {
    const { template } = insertTemplate(mcp.db);
    const { tools } = await mcp.client.listTools();
    const tool = tools.find((candidate) => candidate.name === "create_budget");

    expect(tool?.inputSchema.required).toEqual(["templateId", "title", "currency"]);
    expect(tool?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    });
    for (const currency of ["us", "dollars", "", "xyz"]) {
      const outcome = await mcp.call("create_budget", {
        templateId: template.id,
        title: "Bad",
        currency,
      });
      expect(outcome.ok, currency).toBe(false);
    }
    const { budgetId } = await ok<{ budgetId: Id<"budgets"> }>("create_budget", {
      templateId: template.id,
      title: "Zero",
      currency: "usd",
    });
    expect((await getBudget(budgetId)).budget.income).toBe(0);
  });
});

describe("currency inputs", () => {
  it("offer the supported codes to the model", async () => {
    expect((await inputSchema("create_budget")).currency).toMatchObject({ enum: CURRENCY_CODES });
    expect((await inputSchema("update_budget")).currency).toMatchObject({ enum: CURRENCY_CODES });
    for (const name of ["list_budgets", "list_archived_budgets"]) {
      expect((await inputSchema(name)).currencies, name).toMatchObject({
        type: "array",
        items: { enum: CURRENCY_CODES },
      });
    }
  });

  it("reject an unsupported code, naming it, and change nothing", async () => {
    const { template } = insertTemplate(mcp.db);
    const budget = insertBudget(mcp.db, { title: "June", currency: "usd", createdAt: 1 });

    const outcomes = {
      create_budget: await mcp.call("create_budget", {
        templateId: template.id,
        title: "Bad",
        currency: "XYZ",
      }),
      update_budget: await mcp.call("update_budget", { budgetId: budget.id, currency: "xyz" }),
      list_budgets: await mcp.call("list_budgets", { currencies: ["usd", "xyz"] }),
      list_archived_budgets: await mcp.call("list_archived_budgets", { currencies: ["xyz"] }),
    };

    for (const [name, outcome] of Object.entries(outcomes)) {
      expect(!outcome.ok && outcome.error, name).toMatch(/Unsupported currency "xyz"/);
    }
    expect(titles(await listBudgets())).toEqual(["June"]);
    expect((await getBudget(budget.id)).budget.currency).toBe("usd");
    expect(mcp.changes).toEqual([]);
  });
});

describe("update_budget", () => {
  it("patches the given fields, recomputes allocations on income, and refreshes expenses", async () => {
    const budget = budgetWithAllocations();

    await ok("update_budget", { budgetId: budget.id, income: 2000, currency: "KZT" });

    const updated = await getBudget(budget.id);
    expect(updated.budget).toMatchObject({ title: "June", income: 2000, currency: "kzt" });
    expect(updated.allocations.map((a) => a.amount)).toEqual([1200, 800]);
    expect(mcp.changes).toEqual([["budgets", "expenses", "home"]]);
  });

  it("clears the description with null", async () => {
    const budget = insertBudget(mcp.db, { description: "Notes", createdAt: 1 });

    await ok("update_budget", { budgetId: budget.id, description: null });

    expect((await getBudget(budget.id)).budget.description).toBeNull();
  });
});

describe("archive_budgets / unarchive_budgets", () => {
  it("round-trips budgets between the active and archived lists", async () => {
    const a = insertBudget(mcp.db, { title: "A", createdAt: 1 });
    const b = insertBudget(mcp.db, { title: "B", createdAt: 2 });

    await ok("archive_budgets", { budgetIds: [a.id, b.id] });
    expect(titles(await listBudgets())).toEqual([]);
    expect(titles(await ok("list_archived_budgets"))).toEqual(["B", "A"]);

    await ok("archive_budgets", { budgetIds: [a.id, b.id] });
    await ok("unarchive_budgets", { budgetIds: [a.id, b.id] });
    expect(titles(await listBudgets())).toEqual(["B", "A"]);
    expect(mcp.changes).toEqual([
      ["budgets", "home"],
      ["budgets", "home"],
      ["budgets", "home"],
    ]);
  });

  it("rejects an empty list", async () => {
    for (const name of [
      "archive_budgets",
      "unarchive_budgets",
      "trash_budgets",
      "restore_budgets",
    ]) {
      const outcome = await mcp.call(name, { budgetIds: [] });
      expect(outcome.ok, name).toBe(false);
    }
  });
});

describe("trash_budgets / restore_budgets", () => {
  it("round-trips budgets through the trash, back to the status they had", async () => {
    const active = insertBudget(mcp.db, { title: "Active", createdAt: 1 });
    const archived = insertBudget(mcp.db, { title: "Old", status: "archived", createdAt: 2 });

    await ok("trash_budgets", { budgetIds: [active.id, archived.id] });
    // One trash stamps one deletedAt, so the order between these two is by id.
    expect(titles(await ok("list_trashed_budgets")).sort()).toEqual(["Active", "Old"]);
    expect(await mcp.call("trash_budgets", { budgetIds: [active.id] })).toEqual({
      ok: false,
      error: "NOT_FOUND: Budget not found",
    });

    await ok("restore_budgets", { budgetIds: [active.id, archived.id] });
    expect(titles(await listBudgets())).toEqual(["Active"]);
    expect(titles(await ok("list_archived_budgets"))).toEqual(["Old"]);
    expect(mcp.changes).toEqual([
      ["budgets", "home"],
      ["budgets", "home"],
    ]);
  });
});

describe("set_budget_label / set_budget_view / set_budget_icon", () => {
  it("sets each and clears it with null", async () => {
    const budget = insertBudget(mcp.db, { createdAt: 1 });
    const label = insertLabel(mcp.db, "Travel");
    const view = insertView(mcp.db, "Trips");

    await ok("set_budget_label", { budgetId: budget.id, labelId: label.id });
    await ok("set_budget_view", { budgetId: budget.id, viewId: view.id });
    await ok("set_budget_icon", { budgetId: budget.id, icon: "wallet" });
    expect((await getBudget(budget.id)).budget).toMatchObject({
      labelId: label.id,
      viewId: view.id,
      icon: "wallet",
    });

    await ok("set_budget_label", { budgetId: budget.id, labelId: null });
    await ok("set_budget_view", { budgetId: budget.id, viewId: null });
    await ok("set_budget_icon", { budgetId: budget.id, icon: null });
    expect((await getBudget(budget.id)).budget).toMatchObject({
      labelId: null,
      viewId: null,
      icon: null,
    });
    expect(mcp.changes).toEqual(Array.from({ length: 6 }, () => ["budgets"]));
  });

  it("requires the value, so clearing is explicit", async () => {
    const budget = insertBudget(mcp.db, { createdAt: 1 });

    for (const name of ["set_budget_label", "set_budget_view", "set_budget_icon"]) {
      const outcome = await mcp.call(name, { budgetId: budget.id });
      expect(outcome.ok, name).toBe(false);
    }
  });
});

describe("list_icons", () => {
  it("is a read-only tool with no input", async () => {
    const { tools } = await mcp.client.listTools();
    const tool = tools.find((candidate) => candidate.name === "list_icons");

    expect(tool?.annotations).toEqual({ readOnlyHint: true });
    expect(Object.keys(tool?.inputSchema.properties ?? {})).toEqual([]);
  });

  it("returns the catalog's groups in order, each icon with name, label and keywords", async () => {
    const result = await ok<{ groups: typeof BUDGET_ICON_GROUPS }>("list_icons");

    expect(result).toEqual({ groups: BUDGET_ICON_GROUPS });
    expect(result.groups[0].label).toBe("Money");
    expect(result.groups[0].icons[2]).toEqual({
      name: "piggy-bank",
      label: "Piggy bank",
      keywords: "savings save",
    });
  });
});

describe("icon inputs", () => {
  it("accept catalog names only, pointing at list_icons, and change nothing", async () => {
    const { template } = insertTemplate(mcp.db);
    const budget = insertBudget(mcp.db, { title: "June", icon: "wallet", createdAt: 1 });

    const outcomes = {
      set_budget_icon: await mcp.call("set_budget_icon", { budgetId: budget.id, icon: "walet" }),
      create_budget: await mcp.call("create_budget", {
        templateId: template.id,
        title: "Bad",
        currency: "usd",
        icon: "Wallet",
      }),
    };

    for (const [name, outcome] of Object.entries(outcomes)) {
      expect(!outcome.ok && outcome.error, name).toMatch(/Unknown icon .*list_icons/);
    }
    expect(titles(await listBudgets())).toEqual(["June"]);
    expect((await getBudget(budget.id)).budget.icon).toBe("wallet");
    expect(mcp.changes).toEqual([]);
  });

  it("stores a catalog name given to create_budget", async () => {
    const { template } = insertTemplate(mcp.db);

    const { budgetId } = await ok<{ budgetId: Id<"budgets"> }>("create_budget", {
      templateId: template.id,
      title: "Savings",
      currency: "usd",
      icon: "piggy-bank",
    });

    expect((await getBudget(budgetId)).budget.icon).toBe("piggy-bank");
  });

  it("point descriptions at list_icons", async () => {
    const { tools } = await mcp.client.listTools();
    const descriptionOf = (name: string) => tools.find((tool) => tool.name === name)?.description;

    expect(descriptionOf("set_budget_icon")).toMatch(/list_icons/);
    expect((await inputSchema("create_budget")).icon.description).toMatch(/list_icons/);
  });
});

describe("a budget stored with an icon or currency outside the lists", () => {
  it("stays readable and editable; only new values are checked", async () => {
    const budget = insertBudget(mcp.db, {
      title: "Legacy",
      icon: "retired-icon",
      currency: "xyz",
      createdAt: 1,
    });

    expect((await listBudgets()).page[0]).toMatchObject({ icon: "retired-icon", currency: "xyz" });
    await ok("update_budget", { budgetId: budget.id, title: "Legacy 2", income: 10 });
    const { newBudgetId } = await ok<{ newBudgetId: Id<"budgets"> }>("duplicate_budget", {
      budgetId: budget.id,
    });

    for (const id of [budget.id, newBudgetId]) {
      expect((await getBudget(id)).budget).toMatchObject({
        icon: "retired-icon",
        currency: "xyz",
      });
    }
  });
});

describe("duplicate_budget", () => {
  it("copies the budget as an active copy; trashing the copy undoes it", async () => {
    const budget = budgetWithAllocations();

    const { newBudgetId } = await ok<{ newBudgetId: Id<"budgets"> }>("duplicate_budget", {
      budgetId: budget.id,
    });

    expect((await getBudget(newBudgetId)).budget.title).toBe("June (Copy)");
    expect(titles(await listBudgets())).toEqual(["June (Copy)", "June"]);
    expect(mcp.changes).toEqual([["budgets", "home"]]);

    await ok("trash_budgets", { budgetIds: [newBudgetId] });
    expect(titles(await listBudgets())).toEqual(["June"]);
  });
});
