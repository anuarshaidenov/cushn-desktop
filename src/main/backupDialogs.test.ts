// The Electron backup dialogs, with `electron` mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  app: { getPath: vi.fn(() => "/home/me/Documents") },
  BrowserWindow: { getFocusedWindow: vi.fn(() => null) },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
}));
vi.mock("electron", () => electron);

const { electronDialogs } = await import("./backupDialogs");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("chooseExportPath", () => {
  it("asks before overwriting a file", async () => {
    electron.dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: "/tmp/a.json" });

    await electronDialogs.chooseExportPath("cushn-backup-2026-10-21.json");

    expect(electron.dialog.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: "/home/me/Documents/cushn-backup-2026-10-21.json",
        properties: ["showOverwriteConfirmation"],
      }),
    );
  });

  it.each([
    ["/tmp/backup", "/tmp/backup.json"],
    ["/tmp/backup.json", "/tmp/backup.json"],
    ["/tmp/backup.JSON", "/tmp/backup.JSON"],
  ])("turns %s into %s", async (chosen, expected) => {
    electron.dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: chosen });

    expect(await electronDialogs.chooseExportPath("x.json")).toBe(expected);
  });

  it("resolves null when canceled", async () => {
    electron.dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: "" });

    expect(await electronDialogs.chooseExportPath("x.json")).toBeNull();
  });
});

describe("chooseImportPath", () => {
  it("offers JSON files first, then all files", async () => {
    electron.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/tmp/b"] });

    expect(await electronDialogs.chooseImportPath()).toBe("/tmp/b");
    expect(electron.dialog.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [
          { name: "Cushn backup", extensions: ["json"] },
          { name: "All files", extensions: ["*"] },
        ],
      }),
    );
  });

  it("resolves null when canceled", async () => {
    electron.dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    expect(await electronDialogs.chooseImportPath()).toBeNull();
  });
});
