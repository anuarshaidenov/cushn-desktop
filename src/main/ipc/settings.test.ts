// The settings handlers' argument validation (the repository is covered in settings.test.ts there).
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DatabaseHandle, openDatabase } from "../db";
import { invokeHandler } from "./handler";
import { settingsHandlers } from "./settings";

const migrationsFolder = resolve(import.meta.dirname, "../../../drizzle");

let handle: DatabaseHandle;

beforeEach(() => {
  handle = openDatabase(":memory:", { migrationsFolder });
});

afterEach(() => {
  handle.close();
});

function update(input: unknown) {
  return invokeHandler(settingsHandlers.update, { db: handle.db }, input, "cushn:settings.update");
}

describe("settings.update args", () => {
  it("accepts a partial patch", async () => {
    expect(await update({ budgetView: "list", theme: "dark" })).toEqual({
      ok: true,
      data: { success: true },
    });
  });

  it.each([
    ["a budgetView outside BUDGET_LAYOUTS", { budgetView: "table" }],
    ["an unknown theme", { theme: "system" }],
    ["an empty currency", { currency: "" }],
  ])("rejects %s with BAD_REQUEST", async (_case, input) => {
    const result = await update(input);
    expect(result).toMatchObject({ ok: false, error: { code: "BAD_REQUEST" } });
  });
});
