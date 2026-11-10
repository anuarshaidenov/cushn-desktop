// The native theme follows settings.update and a backup import.
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArgsOf, Theme } from "@shared/api";
import { CushnError } from "@shared/errors";
import { type DatabaseHandle, openDatabase } from "./db";
import { type CushnHandlers, invokeHandler, noArgs } from "./ipc/handler";
import { settingsHandlers } from "./ipc/settings";
import { withThemeSync } from "./themeSync";

const migrationsFolder = resolve(import.meta.dirname, "../../drizzle");

let handle: DatabaseHandle;

beforeEach(() => {
  handle = openDatabase(":memory:", { migrationsFolder });
});

afterEach(() => {
  handle.close();
});

function backupHandlers(
  runImport: CushnHandlers["backup"]["import"]["run"] = () => {
    throw new Error("not imported");
  },
): CushnHandlers["backup"] {
  return {
    export: { args: noArgs, run: () => ({ status: "canceled" }) },
    open: { args: noArgs, run: () => ({ status: "canceled" }) },
    import: { args: { parse: (input) => input as ArgsOf<"backup", "import"> }, run: runImport },
  };
}

const importArgs = { token: "token", mode: "replace" };

function synced(backup: CushnHandlers["backup"]) {
  const apply = vi.fn<(theme: Theme) => void>();
  const handlers = withThemeSync({ settings: settingsHandlers, backup } as CushnHandlers, apply);
  return { handlers, apply };
}

describe("withThemeSync", () => {
  it("applies a theme passed to settings.update, and nothing for other fields", async () => {
    const { handlers, apply } = synced(backupHandlers());
    const context = { db: handle.db };

    await invokeHandler(
      handlers.settings.update,
      context,
      { currency: "eur" },
      "cushn:settings.update",
    );
    expect(apply).not.toHaveBeenCalled();

    await invokeHandler(
      handlers.settings.update,
      context,
      { theme: "dark" },
      "cushn:settings.update",
    );
    expect(apply).toHaveBeenCalledWith("dark");
  });

  it("applies the stored theme after an import", async () => {
    const { handlers, apply } = synced(
      backupHandlers(() => {
        handle.db.run("update user_settings set dark_mode = 1");
        return {
          counts: { templates: 0, budgets: 0, expenses: 0, labels: 0, views: 0 },
          safetyCopyPath: "/tmp/copy.json",
        };
      }),
    );

    await invokeHandler(
      handlers.backup.import,
      { db: handle.db },
      importArgs,
      "cushn:backup.import",
    );

    expect(apply).toHaveBeenCalledWith("dark");
  });

  it("leaves the theme alone when the import fails", async () => {
    const { handlers, apply } = synced(
      backupHandlers(() => {
        throw new CushnError("NOT_FOUND", "That backup file is no longer open. Choose it again.");
      }),
    );

    const result = await invokeHandler(
      handlers.backup.import,
      { db: handle.db },
      importArgs,
      "cushn:backup.import",
    );

    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(apply).not.toHaveBeenCalled();
  });
});
