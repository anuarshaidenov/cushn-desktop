/**
 * The MCP seam: how a tool definition becomes an MCP tool (listing,
 * annotations), how its outcome becomes a tool result, and when the renderer
 * is told to refetch. The tools here are throwaway; real tools have their own
 * tests under `tools/`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CushnError } from "@shared/errors";
import { id } from "../ipc/schemas";
import { insertLabel } from "../repositories/budgets.fixtures";
import * as labels from "../repositories/labels";
import { CUSHN_INSTRUCTIONS } from "./server";
import { type McpHarness, connectMcp } from "./testing";
import { defineTool } from "./tool";
import { cushnTools } from "./tools";

const boom = new Error("SQLITE_CORRUPT: /Users/someone/cushn.db");

const renameLabel = defineTool({
  kind: "write",
  name: "rename_label",
  description: "Renames a label.",
  input: z.object({
    labelId: id("budgetLabels").describe("The label to rename."),
    name: z.string().describe("Its new name."),
  }),
  idempotent: true,
  changes: ["labels", "budgets"],
  run: ({ db }, args) => labels.updateName(db, args),
});

const explode = defineTool({
  kind: "read",
  name: "explode",
  description: "Fails like a bug would.",
  input: z.object({}),
  run: () => {
    throw boom;
  },
});

const refuse = defineTool({
  kind: "read",
  name: "refuse",
  description: "Fails like a repository would.",
  input: z.object({}),
  run: () => {
    throw new CushnError("FORBIDDEN", "Built-in templates cannot be edited");
  },
});

const testTools = [renameLabel, explode, refuse];

let mcp: McpHarness;

afterEach(async () => {
  await mcp.close();
  vi.restoreAllMocks();
});

describe("initialize", () => {
  it("gives clients the instructions for the model's context", async () => {
    mcp = await connectMcp();

    expect(mcp.client.getInstructions()).toBe(CUSHN_INSTRUCTIONS);
  });
});

describe("tools/list", () => {
  it("lists each tool with its description, JSON Schema input and derived annotations", async () => {
    mcp = await connectMcp({ tools: testTools });

    const { tools } = await mcp.client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual(["rename_label", "explode", "refuse"]);
    expect(tools[0]).toMatchObject({
      description: "Renames a label.",
      inputSchema: {
        type: "object",
        properties: {
          labelId: { type: "string", minLength: 1, description: "The label to rename." },
          name: { type: "string", description: "Its new name." },
        },
        required: ["labelId", "name"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    });
    expect(tools[1].annotations).toEqual({ readOnlyHint: true });
  });

  it("describes every Cushn tool and every one of its input fields for the model", async () => {
    mcp = await connectMcp();

    const { tools } = await mcp.client.listTools();

    expect(tools.length).toBe(cushnTools.length);
    for (const tool of tools) {
      expect(tool.description, tool.name).toBeTruthy();
      for (const [field, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
        expect(
          (schema as { description?: string }).description,
          `${tool.name}.${field}`,
        ).toBeTruthy();
      }
    }
  });

  it("offers only these tools: reads, and writes that can be undone", async () => {
    mcp = await connectMcp();
    const { tools } = await mcp.client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(cushnTools.map((tool) => tool.name));

    const catalog = cushnTools.map((tool) =>
      tool.kind === "read"
        ? tool.name
        : `${tool.name} ${tool.idempotent ? "idempotent" : "once"} ${tool.changes.join(",")}`,
    );

    expect(catalog).toEqual([
      "get_home_summary",
      "list_budgets",
      "list_archived_budgets",
      "list_trashed_budgets",
      "get_budget",
      "list_icons",
      "create_budget once budgets,home",
      "update_budget idempotent budgets,expenses,home",
      "archive_budgets idempotent budgets,home",
      "unarchive_budgets idempotent budgets,home",
      "trash_budgets once budgets,home",
      "restore_budgets once budgets,home",
      "set_budget_label idempotent budgets",
      "set_budget_view idempotent budgets",
      "set_budget_icon idempotent budgets",
      "duplicate_budget once budgets,home",
      "list_expenses",
      "create_expenses once expenses,home",
      "update_expense idempotent expenses,home",
      "duplicate_expense once expenses,home",
      "delete_expenses once expenses,home",
      "restore_expenses once expenses,home",
      "reorder_expenses idempotent expenses",
      "list_labels",
      "create_label once labels",
      "rename_label idempotent labels,budgets",
      "set_label_color idempotent labels,budgets",
      "list_templates",
      "get_template",
      "list_views",
      "get_settings",
      "get_exchange_rates",
    ]);
  });
});

describe("tools/call", () => {
  it("answers a success with the result as one JSON text block", async () => {
    mcp = await connectMcp({ tools: testTools });
    const label = insertLabel(mcp.db, "Monthly");

    const result = await mcp.client.callTool({
      name: "rename_label",
      arguments: { labelId: label.id, name: "Weekly" },
    });

    expect(result).toEqual({ content: [{ type: "text", text: '{"success":true}' }] });
    expect(labels.list(mcp.db).labels[0].name).toBe("Weekly");
  });

  it("answers a CushnError as an error result with its code and message", async () => {
    mcp = await connectMcp({ tools: testTools });

    const missing = await mcp.client.callTool({
      name: "rename_label",
      arguments: { labelId: "missing", name: "Weekly" },
    });

    expect(missing).toEqual({
      content: [{ type: "text", text: "NOT_FOUND: Label not found" }],
      isError: true,
    });
    expect(await mcp.call("refuse")).toEqual({
      ok: false,
      error: "FORBIDDEN: Built-in templates cannot be edited",
    });
  });

  it("rejects args that fail the input schema without running the tool", async () => {
    mcp = await connectMcp({ tools: testTools });
    const label = insertLabel(mcp.db, "Monthly");

    const outcome = await mcp.call("rename_label", { labelId: label.id, name: 42 });

    expect(outcome).toMatchObject({ ok: false });
    expect(!outcome.ok && outcome.error).toMatch(/Invalid arguments for tool rename_label/);
    expect(labels.list(mcp.db).labels[0].name).toBe("Monthly");
  });

  it("answers an unexpected error with 'Internal error', logging it but never returning it", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mcp = await connectMcp({ tools: testTools });

    const result = await mcp.client.callTool({ name: "explode", arguments: {} });

    expect(result).toEqual({
      content: [{ type: "text", text: "INTERNAL: Internal error" }],
      isError: true,
    });
    expect(JSON.stringify(result)).not.toMatch(/SQLITE|Users|at /);
    expect(consoleError).toHaveBeenCalledWith("[mcp] explode failed", boom);
  });
});

describe("notifyChanged", () => {
  it("passes a write's roots after it succeeds, and nothing when it fails", async () => {
    mcp = await connectMcp({ tools: testTools });
    const label = insertLabel(mcp.db, "Monthly");

    await mcp.call("rename_label", { labelId: "missing", name: "Weekly" });
    await mcp.call("rename_label", { labelId: label.id, name: 42 });
    expect(mcp.changes).toEqual([]);

    await mcp.call("rename_label", { labelId: label.id, name: "Weekly" });
    expect(mcp.changes).toEqual([["labels", "budgets"]]);
  });

  it("is never called for a read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mcp = await connectMcp({ tools: testTools });

    await mcp.call("refuse");
    await mcp.call("explode");

    expect(mcp.changes).toEqual([]);
  });

  it("still answers a write's result when the notification fails, since the write happened", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("Object has been destroyed");
    mcp = await connectMcp({
      tools: testTools,
      notifyChanged: () => {
        throw failure;
      },
    });
    const label = insertLabel(mcp.db, "Monthly");

    expect(await mcp.call("rename_label", { labelId: label.id, name: "Weekly" })).toEqual({
      ok: true,
      data: { success: true },
    });
    expect(consoleError).toHaveBeenCalledWith("[mcp] rename_label: notifyChanged failed", failure);
  });
});
