/**
 * Updates from the release host in `electron-builder.yml`'s `publish`. A packaged build checks
 * once a window opens and every `intervalMs` after, and downloads what it finds in the background.
 * Once a download finishes, `status()` is `ready` and the sidebar shows Update, which restarts into
 * it; quitting installs it anyway. Failures (offline, an unsigned macOS build) are logged and
 * change nothing. Electron-free: `index.ts` passes electron-updater's `autoUpdater`.
 */
import type { UpdateStatus } from "@shared/api";
import { CushnError } from "@shared/errors";

export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** The part of electron-updater's `AppUpdater` this needs. */
export interface UpdaterBackend {
  on(event: "update-downloaded", listener: (info: { version: string }) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(): void;
}

export interface UpdaterOptions {
  backend: UpdaterBackend;
  /** Packaged builds only: a dev build has no `app-update.yml` to check against. */
  enabled: boolean;
  intervalMs: number;
  onStatusChanged(): void;
  logError(message: string, error: unknown): void;
}

export interface Updater {
  /** Starts checking; later calls do nothing. */
  start(): void;
  status(): UpdateStatus;
  /** Quits and restarts into the downloaded update; CONFLICT when none is ready. */
  install(): void;
}

export function createUpdater({
  backend,
  enabled,
  intervalMs,
  onStatusChanged,
  logError,
}: UpdaterOptions): Updater {
  let status: UpdateStatus = { state: "none" };
  let started = false;

  backend.on("update-downloaded", ({ version }) => {
    status = { state: "ready", version };
    onStatusChanged();
  });
  backend.on("error", (error) => logError("Update failed", error));

  function check(): void {
    backend.checkForUpdates().catch((error: unknown) => logError("Update check failed", error));
  }

  return {
    start() {
      if (!enabled || started) return;
      started = true;
      check();
      setInterval(check, intervalMs);
    },
    status: () => status,
    install() {
      if (status.state !== "ready") {
        throw new CushnError("CONFLICT", "No update is ready to install");
      }
      backend.quitAndInstall();
    },
  };
}
