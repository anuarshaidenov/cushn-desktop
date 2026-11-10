// The home tool over MCP. The repository is covered in
// repositories/home.test.ts.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertAllocation, insertBudget, insertExpense } from "../../repositories/budgets.fixtures";
import { type McpHarness, connectMcp } from "../testing";

let mcp: McpHarness;

beforeEach(async () => {
  mcp = await connectMcp();
});

afterEach(async () => {
  await mcp.close();
});

describe("get_home_summary", () => {
  it("summarizes the active budgets, the most recently active as main", async () => {
    const june = insertBudget(mcp.db, { title: "June", income: 1000, createdAt: 2 });
    insertBudget(mcp.db, { title: "May", createdAt: 1 });
    insertBudget(mcp.db, { title: "Old", status: "archived", createdAt: 3 });
    const needs = insertAllocation(mcp.db, {
      budgetId: june.id,
      percentage: 10,
      amount: 100,
    });
    insertExpense(mcp.db, {
      budgetId: june.id,
      allocationId: needs.id,
      title: "Rent",
      amount: 150,
      order: 0,
    });

    expect(await mcp.call("get_home_summary")).toMatchObject({
      ok: true,
      data: {
        main: { title: "June", spent: 150, allocations: [{ amount: 100, spent: 150 }] },
        others: [{ title: "May" }],
        overspent: [{ budgetTitle: "June", spent: 150 }],
      },
    });
  });

  it("gives main null with no active budget", async () => {
    expect(await mcp.call("get_home_summary")).toEqual({
      ok: true,
      data: { main: null, others: [], overspent: [] },
    });
  });
});
