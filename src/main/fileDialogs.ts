/** The Electron side of the file handlers: the Markdown save dialog and the file manager. */
import { join } from "node:path";
import { app, shell } from "electron";
import { showSaveDialog } from "./backupDialogs";
import type { FileDependencies } from "./ipc/files";

export const electronFileDependencies: FileDependencies = {
  async chooseMarkdownPath(defaultFileName) {
    const { canceled, filePath } = await showSaveDialog({
      title: "Export budget",
      defaultPath: join(app.getPath("documents"), defaultFileName),
      filters: [{ name: "Markdown", extensions: ["md"] }],
      // Linux overwrites silently without it, and GTK may not append the extension.
      properties: ["showOverwriteConfirmation"],
    });
    if (canceled || !filePath) return null;
    return /\.(md|markdown)$/i.test(filePath) ? filePath : `${filePath}.md`;
  },
  showItemInFolder: (filePath) => shell.showItemInFolder(filePath),
};
