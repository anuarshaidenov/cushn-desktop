/**
 * Saving exports and showing them in the file manager. Electron-free: the save
 * dialog and the file manager are injected, so tests drive them with fakes;
 * `src/main/fileDialogs.ts` is the Electron side.
 */
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import type { MarkdownExportResult } from "@shared/api";
import { CushnError } from "@shared/errors";
import type { CushnHandlers } from "./handler";

export interface FileDependencies {
  /** The chosen path, or `null` when the user cancels. */
  chooseMarkdownPath(defaultFileName: string): Promise<string | null>;
  /** Selects the file in Finder, Explorer or the file manager. */
  showItemInFolder(filePath: string): void;
}

export interface Files {
  /** Asks where to save, then writes `text` there. */
  saveMarkdown(defaultFileName: string, text: string): Promise<MarkdownExportResult>;
  handlers: CushnHandlers["files"];
}

export function createFiles({ chooseMarkdownPath, showItemInFolder }: FileDependencies): Files {
  // `reveal` takes only these, so the renderer can't aim the file manager at
  // any path (a UNC path on Windows would reach out to the network).
  const saved = new Set<string>();

  return {
    async saveMarkdown(defaultFileName, text) {
      const filePath = await chooseMarkdownPath(defaultFileName);
      if (filePath === null) return { status: "canceled" };
      try {
        await writeFile(filePath, text);
      } catch {
        throw new CushnError("INTERNAL", "Could not save the file.");
      }
      saved.add(filePath);
      return { status: "saved", filePath };
    },
    handlers: {
      reveal: {
        args: z.object({ filePath: z.string() }),
        run: (_context, { filePath }) => {
          if (!saved.has(filePath)) throw new CushnError("NOT_FOUND", "File not found");
          showItemInFolder(filePath);
          return { success: true };
        },
      },
    },
  };
}
