// The label tools over MCP. The repository is covered in
// repositories/labels.test.ts; these pin the tools' input and `changes`.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BudgetLabel, Id } from "@shared/domain";
import { insertLabel } from "../../repositories/budgets.fixtures";
import { type McpHarness, connectMcp } from "../testing";

let mcp: McpHarness;

beforeEach(async () => {
  mcp = await connectMcp();
});

afterEach(async () => {
  await mcp.close();
});

async function labels() {
  const outcome = await mcp.call("list_labels");
  if (!outcome.ok) throw new Error(outcome.error);
  return (outcome.data as { labels: BudgetLabel[] }).labels;
}

describe("list_labels", () => {
  it("lists labels in creation order", async () => {
    insertLabel(mcp.db, "Weekly", "#EF4444", 2);
    insertLabel(mcp.db, "Daily", "#06B6D4", 1);

    expect((await labels()).map(({ name, color }) => [name, color])).toEqual([
      ["Daily", "#06B6D4"],
      ["Weekly", "#EF4444"],
    ]);
  });
});

describe("create_label / rename_label / set_label_color", () => {
  it("creates, renames and recolours a label, refreshing budgets on edits", async () => {
    const created = await mcp.call("create_label", { name: "Travel", color: "#10B981" });
    const { labelId } = (created.ok ? created.data : {}) as { labelId: Id<"budgetLabels"> };

    await mcp.call("rename_label", { labelId, name: "Trips" });
    await mcp.call("set_label_color", { labelId, color: "#8b5cf6" });

    expect(await labels()).toMatchObject([{ id: labelId, name: "Trips", color: "#8b5cf6" }]);
    expect(mcp.changes).toEqual([["labels"], ["labels", "budgets"], ["labels", "budgets"]]);
  });

  it("takes only a #rrggbb colour and a non-empty name", async () => {
    const label = insertLabel(mcp.db);

    for (const color of ["red", "#fff", "F97316"]) {
      expect((await mcp.call("create_label", { name: "Travel", color })).ok, color).toBe(false);
      expect((await mcp.call("set_label_color", { labelId: label.id, color })).ok, color).toBe(
        false,
      );
    }
    expect((await mcp.call("rename_label", { labelId: label.id, name: "" })).ok).toBe(false);
    expect(mcp.changes).toEqual([]);
  });

  it("answers NOT_FOUND for an unknown label", async () => {
    expect(await mcp.call("rename_label", { labelId: "missing", name: "Trips" })).toEqual({
      ok: false,
      error: "NOT_FOUND: Label not found",
    });
  });
});
