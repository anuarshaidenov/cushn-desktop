// The Markdown export and `files.reveal` with a fake save dialog and file manager, writing to a temp dir.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asId } from "@shared/domain";
import type { DatabaseHandle } from "../db";
import { insertBudget, openTestDatabase } from "../repositories/budgets.fixtures";
import { createBudgetHandlers } from "./budgets";
import { type FileDependencies, createFiles } from "./files";
import { invokeHandler } from "./handler";

let handle: DatabaseHandle;
let dir: string;

beforeEach(() => {
  handle = openTestDatabase();
  dir = mkdtempSync(join(tmpdir(), "cushn-files-test-"));
});

afterEach(() => {
  handle.close();
  rmSync(dir, { recursive: true, force: true });
});

function setup(overrides: Partial<FileDependencies> = {}) {
  const deps = {
    chooseMarkdownPath: vi.fn<FileDependencies["chooseMarkdownPath"]>(async (name) =>
      join(dir, name),
    ),
    showItemInFolder: vi.fn<FileDependencies["showItemInFolder"]>(),
    ...overrides,
  };
  const files = createFiles(deps);
  const budgets = createBudgetHandlers(files);
  return {
    deps,
    exportMarkdown: (input: unknown) =>
      invokeHandler(
        budgets.exportMarkdown,
        { db: handle.db },
        input,
        "cushn:budgets.exportMarkdown",
      ),
    reveal: (input: unknown) =>
      invokeHandler(files.handlers.reveal, { db: handle.db }, input, "cushn:files.reveal"),
  };
}

describe("budgets.exportMarkdown", () => {
  it("suggests the rendered file name and saves the Markdown where the user chose", async () => {
    const budget = insertBudget(handle.db, {
      title: "June budget",
      createdAt: Date.UTC(2025, 5, 1),
    });
    const { deps, exportMarkdown } = setup();

    const result = await exportMarkdown({ budgetId: budget.id });

    const filePath = join(dir, "june-budget-2025-06-01.md");
    expect(deps.chooseMarkdownPath).toHaveBeenCalledWith("june-budget-2025-06-01.md");
    expect(result).toEqual({ ok: true, data: { status: "saved", filePath } });
    expect(readFileSync(filePath, "utf8")).toContain('title: "June budget"');
  });

  it("writes nothing and resolves canceled when the dialog is closed", async () => {
    const budget = insertBudget(handle.db, { createdAt: 1 });
    const { exportMarkdown } = setup({ chooseMarkdownPath: async () => null });

    expect(await exportMarkdown({ budgetId: budget.id })).toEqual({
      ok: true,
      data: { status: "canceled" },
    });
  });

  it("answers NOT_FOUND for a missing budget without opening the dialog", async () => {
    const { deps, exportMarkdown } = setup();

    expect(await exportMarkdown({ budgetId: asId<"budgets">("missing") })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND", message: "Budget not found" },
    });
    expect(deps.chooseMarkdownPath).not.toHaveBeenCalled();
  });

  it("answers INTERNAL when the file can't be written", async () => {
    const budget = insertBudget(handle.db, { createdAt: 1 });
    const filePath = join(dir, "missing-folder", "budget.md");
    const { exportMarkdown } = setup({ chooseMarkdownPath: async () => filePath });

    expect(await exportMarkdown({ budgetId: budget.id })).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: "Could not save the file." },
    });
    expect(existsSync(filePath)).toBe(false);
  });
});

describe("files.reveal", () => {
  it("shows a file this session exported", async () => {
    const budget = insertBudget(handle.db, { createdAt: 1 });
    const { deps, exportMarkdown, reveal } = setup();
    const exported = await exportMarkdown({ budgetId: budget.id });
    if (!exported.ok || exported.data.status !== "saved") throw new Error("export failed");

    expect(await reveal({ filePath: exported.data.filePath })).toEqual({
      ok: true,
      data: { success: true },
    });
    expect(deps.showItemInFolder).toHaveBeenCalledWith(exported.data.filePath);
  });

  it("refuses any other path", async () => {
    const { deps, reveal } = setup();

    expect(await reveal({ filePath: "\\\\server\\share\\budget.md" })).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "File not found" },
    });
    expect(deps.showItemInFolder).not.toHaveBeenCalled();
  });
});
