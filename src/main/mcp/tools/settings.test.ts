// The settings tool over MCP. The repository is covered in
// repositories/settings.test.ts.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userSettings } from "../../db/schema";
import { type McpHarness, connectMcp } from "../testing";

let mcp: McpHarness;

beforeEach(async () => {
  mcp = await connectMcp();
  // The harness skips seeding, which ensures this row in the app.
  mcp.db.insert(userSettings).values({ id: 1, currency: "kzt" }).run();
});

afterEach(async () => {
  await mcp.close();
});

describe("get_settings", () => {
  it("returns the default currency, layout and theme", async () => {
    expect(await mcp.call("get_settings")).toEqual({
      ok: true,
      data: { settings: { currency: "kzt", budgetView: "grid", theme: "light" } },
    });
  });
});
