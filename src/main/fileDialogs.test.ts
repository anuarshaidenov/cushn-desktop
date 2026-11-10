// The Electron file dependencies, with `electron` mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  app: { getPath: vi.fn(() => "/home/me/Documents") },
  BrowserWindow: { getFocusedWindow: vi.fn(() => null) },
  dialog: { showSaveDialog: vi.fn() },
  shell: { showItemInFolder: vi.fn() },
}));
vi.mock("electron", () => electron);

const { electronFileDependencies } = await import("./fileDialogs");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("chooseMarkdownPath", () => {
  it("starts in Documents and asks before overwriting a file", async () => {
    electron.dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: "/tmp/a.md" });

    await electronFileDependencies.chooseMarkdownPath("june-budget-2025-06-01.md");

    expect(electron.dialog.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: "/home/me/Documents/june-budget-2025-06-01.md",
        properties: ["showOverwriteConfirmation"],
      }),
    );
  });

  it.each([
    ["/tmp/budget", "/tmp/budget.md"],
    ["/tmp/budget.md", "/tmp/budget.md"],
    ["/tmp/budget.MD", "/tmp/budget.MD"],
    ["/tmp/budget.markdown", "/tmp/budget.markdown"],
  ])("turns %s into %s", async (chosen, expected) => {
    electron.dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: chosen });

    expect(await electronFileDependencies.chooseMarkdownPath("x.md")).toBe(expected);
  });

  it("resolves null when canceled", async () => {
    electron.dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: "" });

    expect(await electronFileDependencies.chooseMarkdownPath("x.md")).toBeNull();
  });
});
