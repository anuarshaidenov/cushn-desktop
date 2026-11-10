import { existsSync, mkdtempSync, rmSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MessageBoxReturnValue } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DONT_ASK_FILE,
  type MoveToApplicationsOptions,
  offerMoveToApplications,
} from "./applicationsFolder";

const MOVE = { response: 0, checkboxChecked: false };
const NOT_NOW = { response: 1, checkboxChecked: false };

let userData: string;
let showMessageBox: ReturnType<typeof vi.fn<MoveToApplicationsOptions["showMessageBox"]>>;
let moveToApplicationsFolder: ReturnType<typeof vi.fn<() => boolean>>;
let logError: ReturnType<typeof vi.fn<MoveToApplicationsOptions["logError"]>>;

function answer(value: MessageBoxReturnValue): void {
  showMessageBox.mockResolvedValue(value);
}

function offer(options: Partial<MoveToApplicationsOptions> = {}) {
  return offerMoveToApplications({
    platform: "darwin",
    isPackaged: true,
    background: false,
    isInApplicationsFolder: () => false,
    moveToApplicationsFolder,
    showMessageBox,
    fs: fsPromises,
    userData,
    logError,
    ...options,
  });
}

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), "cushn-applications-"));
  showMessageBox = vi.fn<MoveToApplicationsOptions["showMessageBox"]>();
  moveToApplicationsFolder = vi.fn(() => true);
  logError = vi.fn<MoveToApplicationsOptions["logError"]>();
});

afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

describe("asking", () => {
  it("asks a packaged Mac app outside Applications, and moves it on Move", async () => {
    answer(MOVE);

    expect(await offer()).toBe(true);
    expect(showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        buttons: ["Move to Applications", "Not Now"],
        checkboxLabel: "Don't ask again",
      }),
    );
    expect(moveToApplicationsFolder).toHaveBeenCalledOnce();
  });

  it("launches as usual on Not Now, and asks again next launch", async () => {
    answer(NOT_NOW);

    expect(await offer()).toBe(false);
    expect(moveToApplicationsFolder).not.toHaveBeenCalled();

    await offer();
    expect(showMessageBox).toHaveBeenCalledTimes(2);
  });

  it("never asks again once told not to", async () => {
    answer({ ...NOT_NOW, checkboxChecked: true });

    expect(await offer()).toBe(false);
    expect(existsSync(join(userData, DONT_ASK_FILE))).toBe(true);

    expect(await offer()).toBe(false);
    expect(showMessageBox).toHaveBeenCalledOnce();
  });

  it.each<[string, Partial<MoveToApplicationsOptions>]>([
    ["a development build", { isPackaged: false }],
    ["Windows", { platform: "win32" }],
    ["Linux", { platform: "linux" }],
    ["a launch by an agent's relay", { background: true }],
    ["an app already in Applications", { isInApplicationsFolder: () => true }],
  ])("never asks %s", async (_case, options) => {
    expect(await offer(options)).toBe(false);
    expect(showMessageBox).not.toHaveBeenCalled();
  });
});

describe("a move that doesn't happen", () => {
  it("launches as usual when the user cancels the authorization prompt", async () => {
    answer(MOVE);
    moveToApplicationsFolder.mockReturnValue(false);

    expect(await offer()).toBe(false);
    expect(logError).not.toHaveBeenCalled();
  });

  it("logs a failed copy and launches as usual", async () => {
    answer(MOVE);
    const failure = new Error("Failed to copy Cushn.app");
    moveToApplicationsFolder.mockImplementation(() => {
      throw failure;
    });

    expect(await offer()).toBe(false);
    expect(logError).toHaveBeenCalledWith("Failed to move to the Applications folder", failure);
  });

  it("still moves when Don't ask again can't be saved", async () => {
    answer({ ...MOVE, checkboxChecked: true });
    rmSync(userData, { recursive: true });

    expect(await offer()).toBe(true);
    expect(logError).toHaveBeenCalledWith("Failed to save Don't ask again", expect.any(Error));
  });
});
