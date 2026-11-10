// The View tools over MCP. The repository is covered in
// repositories/views.test.ts.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertView } from "../../repositories/budgets.fixtures";
import { type McpHarness, connectMcp } from "../testing";

let mcp: McpHarness;

beforeEach(async () => {
  mcp = await connectMcp();
});

afterEach(async () => {
  await mcp.close();
});

describe("list_views", () => {
  it("lists Views, newest first", async () => {
    insertView(mcp.db, "Home", 1);
    insertView(mcp.db, "Trips", 2);

    expect(await mcp.call("list_views")).toMatchObject({
      ok: true,
      data: { views: [{ title: "Trips", isFavorite: false }, { title: "Home" }] },
    });
  });
});
