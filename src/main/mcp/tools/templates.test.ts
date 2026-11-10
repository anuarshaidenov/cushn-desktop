// The template tools over MCP. The repository is covered in
// repositories/templates.test.ts.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertTemplate } from "../../repositories/budgets.fixtures";
import { type McpHarness, connectMcp } from "../testing";

let mcp: McpHarness;

beforeEach(async () => {
  mcp = await connectMcp();
});

afterEach(async () => {
  await mcp.close();
});

describe("list_templates / get_template", () => {
  it("lists templates and returns one with its categories in order", async () => {
    const { template } = insertTemplate(mcp.db, {
      name: "Split",
      categories: [
        { name: "Wants", percentage: 40, sortOrder: 2 },
        { name: "Needs", percentage: 60, sortOrder: 1, editable: false },
      ],
    });

    expect(await mcp.call("list_templates")).toMatchObject({
      ok: true,
      data: { templates: [{ id: template.id, name: "Split", isDefault: false }] },
    });
    expect(await mcp.call("get_template", { templateId: template.id })).toMatchObject({
      ok: true,
      data: {
        template: {
          name: "Split",
          categories: [
            { name: "Needs", percentage: 60, editable: false },
            { name: "Wants", percentage: 40, editable: true },
          ],
        },
      },
    });
  });

  it("answers NOT_FOUND for an unknown template", async () => {
    expect(await mcp.call("get_template", { templateId: "missing" })).toEqual({
      ok: false,
      error: "NOT_FOUND: Template not found",
    });
  });
});
