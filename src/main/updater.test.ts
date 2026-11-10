import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CushnError } from "@shared/errors";
import { type UpdaterOptions, createUpdater } from "./updater";

const INTERVAL_MS = 60_000;

class FakeBackend extends EventEmitter {
  checkForUpdates = vi.fn(async (): Promise<unknown> => null);
  quitAndInstall = vi.fn();

  downloaded(version: string): void {
    this.emit("update-downloaded", { version, downloadedFile: "/tmp/update.zip" });
  }
}

let backend: FakeBackend;
let onStatusChanged: ReturnType<typeof vi.fn<() => void>>;
let logError: ReturnType<typeof vi.fn<UpdaterOptions["logError"]>>;

function updater(enabled = true) {
  return createUpdater({ backend, enabled, intervalMs: INTERVAL_MS, onStatusChanged, logError });
}

beforeEach(() => {
  vi.useFakeTimers();
  backend = new FakeBackend();
  onStatusChanged = vi.fn<() => void>();
  logError = vi.fn<UpdaterOptions["logError"]>();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checking", () => {
  it("checks on start and every interval after", () => {
    updater().start();
    expect(backend.checkForUpdates).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(INTERVAL_MS * 3);
    expect(backend.checkForUpdates).toHaveBeenCalledTimes(4);
  });

  it("starts once however often it is asked", () => {
    const updates = updater();
    updates.start();
    updates.start();

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(backend.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it("never checks in a dev build", () => {
    updater(false).start();

    vi.advanceTimersByTime(INTERVAL_MS * 3);
    expect(backend.checkForUpdates).not.toHaveBeenCalled();
  });

  it("logs a failed check and keeps checking", async () => {
    const offline = new Error("net::ERR_INTERNET_DISCONNECTED");
    backend.checkForUpdates.mockRejectedValueOnce(offline);
    const updates = updater();
    updates.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(logError).toHaveBeenCalledWith("Update check failed", offline);
    expect(updates.status()).toEqual({ state: "none" });

    vi.advanceTimersByTime(INTERVAL_MS);
    expect(backend.checkForUpdates).toHaveBeenCalledTimes(2);
  });
});

describe("status", () => {
  it("is none until an update has downloaded", () => {
    const updates = updater();
    updates.start();

    expect(updates.status()).toEqual({ state: "none" });
    expect(onStatusChanged).not.toHaveBeenCalled();
  });

  it("is ready with the version once one has, and tells the windows", () => {
    const updates = updater();
    updates.start();
    backend.downloaded("0.2.0");

    expect(updates.status()).toEqual({ state: "ready", version: "0.2.0" });
    expect(onStatusChanged).toHaveBeenCalledOnce();
  });

  it("moves to a newer update downloaded while one waits", () => {
    const updates = updater();
    updates.start();
    backend.downloaded("0.2.0");
    backend.downloaded("0.3.0");

    expect(updates.status()).toEqual({ state: "ready", version: "0.3.0" });
    expect(onStatusChanged).toHaveBeenCalledTimes(2);
  });

  it("stays ready after a later error", () => {
    const updates = updater();
    updates.start();
    backend.downloaded("0.2.0");
    const error = new Error("Could not get code signature");
    backend.emit("error", error);

    expect(updates.status()).toEqual({ state: "ready", version: "0.2.0" });
    expect(logError).toHaveBeenCalledWith("Update failed", error);
  });
});

describe("install", () => {
  it("quits and installs the downloaded update", () => {
    const updates = updater();
    updates.start();
    backend.downloaded("0.2.0");
    updates.install();

    expect(backend.quitAndInstall).toHaveBeenCalledOnce();
  });

  it("answers CONFLICT when no update is ready", () => {
    const updates = updater();
    updates.start();

    expect(() => updates.install()).toThrow(
      expect.objectContaining({ code: "CONFLICT" }) as CushnError,
    );
    expect(backend.quitAndInstall).not.toHaveBeenCalled();
  });
});
