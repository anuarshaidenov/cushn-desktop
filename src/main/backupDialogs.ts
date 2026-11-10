/** The Electron side of the backup handlers: native dialogs, `userData` and the app version. */
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from "electron";
import { APP_NAME } from "@shared/app";
import type { BackupDependencies, BackupDialogs } from "./ipc/backup";

const jsonFilter = { name: `${APP_NAME} backup`, extensions: ["json"] };

export function showSaveDialog(options: SaveDialogOptions) {
  const parent = BrowserWindow.getFocusedWindow();
  return parent ? dialog.showSaveDialog(parent, options) : dialog.showSaveDialog(options);
}

function showOpenDialog(options: OpenDialogOptions) {
  const parent = BrowserWindow.getFocusedWindow();
  return parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options);
}

export const electronDialogs: BackupDialogs = {
  async chooseExportPath(defaultFileName) {
    const { canceled, filePath } = await showSaveDialog({
      title: "Export backup",
      defaultPath: join(app.getPath("documents"), defaultFileName),
      filters: [jsonFilter],
      // Linux overwrites silently without it, and GTK may not append the extension.
      properties: ["showOverwriteConfirmation"],
    });
    if (canceled || !filePath) return null;
    return /\.json$/i.test(filePath) ? filePath : `${filePath}.json`;
  },
  async chooseImportPath() {
    const { canceled, filePaths } = await showOpenDialog({
      title: "Import backup",
      filters: [jsonFilter, { name: "All files", extensions: ["*"] }],
      properties: ["openFile"],
    });
    return canceled || filePaths.length === 0 ? null : filePaths[0];
  },
};

/** Call after `app` is ready (`getPath("userData")`). */
export function electronBackupDependencies(): BackupDependencies {
  return {
    dialogs: electronDialogs,
    safetyCopyDir: join(app.getPath("userData"), "backups"),
    appVersion: app.getVersion(),
    now: Date.now,
  };
}
