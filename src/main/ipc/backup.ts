/**
 * The backup handlers. Electron-free: the dialogs, the
 * safety-copy folder, the app version and the clock are injected, so tests
 * drive them with fakes; `src/main/backupDialogs.ts` is the Electron side.
 *
 * Import takes two calls, so the renderer's own dialog can ask how to import.
 * `open`: open dialog → read → `parseBackupText` (a bad file is rejected here)
 * → hold the file under a new token and answer its summary; nothing is
 * written. `import` with that token and a mode: safety copy of the current
 * data → add or replace → forget the file. Main holds one file at most: every
 * `open` forgets the previous one (canceled or rejected too), so a token that
 * was imported or superseded answers NOT_FOUND.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { z } from "zod";
import { IMPORT_MODES } from "@shared/api";
import {
  type Backup,
  backupCounts,
  backupFileName,
  parseBackupText,
  serializeBackup,
} from "@shared/backup";
import { CushnError } from "@shared/errors";
import type { AppDatabase } from "../db";
import * as backup from "../repositories/backup";
import { type CushnHandlers, noArgs } from "./handler";

export const SAFETY_COPIES_KEPT = 5;
const SAFETY_COPY_PATTERN = /^pre-import-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/;

export interface BackupDialogs {
  /** The chosen path, or `null` when the user cancels. */
  chooseExportPath(defaultFileName: string): Promise<string | null>;
  /** The chosen path, or `null` when the user cancels. */
  chooseImportPath(): Promise<string | null>;
}

export interface BackupDependencies {
  dialogs: BackupDialogs;
  /** Where pre-import safety copies go (`<userData>/backups`). */
  safetyCopyDir: string;
  appVersion: string;
  now(): number;
}

export function createBackupHandlers({
  dialogs,
  safetyCopyDir,
  appVersion,
  now,
}: BackupDependencies): CushnHandlers["backup"] {
  let opened: { token: string; backup: Backup } | null = null;

  const exportText = (db: AppDatabase) =>
    serializeBackup(backup.exportAll(db, { exportedAt: now(), appVersion }));

  // Synchronous on purpose: no IPC write may land between the snapshot and the import.
  function writeSafetyCopy(db: AppDatabase): string {
    const name = `pre-import-${new Date(now()).toISOString().replace(/[:.]/g, "-")}.json`;
    const filePath = join(safetyCopyDir, name);
    try {
      mkdirSync(safetyCopyDir, { recursive: true });
      writeFileSync(filePath, exportText(db));
    } catch {
      throw new CushnError(
        "INTERNAL",
        "Could not save a safety copy of your current data, so nothing was imported.",
      );
    }
    return filePath;
  }

  return {
    export: {
      args: noArgs,
      run: async ({ db }) => {
        const filePath = await dialogs.chooseExportPath(backupFileName(new Date(now())));
        if (filePath === null) return { status: "canceled" };
        const text = exportText(db);
        try {
          await writeFile(filePath, text);
        } catch {
          throw new CushnError("INTERNAL", "Could not save the backup file.");
        }
        return { status: "saved", filePath };
      },
    },
    open: {
      args: noArgs,
      run: async () => {
        opened = null;
        const filePath = await dialogs.chooseImportPath();
        if (filePath === null) return { status: "canceled" };
        let text: string;
        try {
          text = await readFile(filePath, "utf8");
        } catch {
          throw new CushnError("INTERNAL", "Could not read the backup file.");
        }
        const parsed = parseBackupText(text);
        const token = randomUUID();
        opened = { token, backup: parsed };
        const summary = {
          fileName: basename(filePath),
          exportedAt: parsed.exportedAt,
          counts: backupCounts(parsed.data),
        };
        return { status: "opened", token, summary };
      },
    },
    import: {
      args: z.object({ token: z.string(), mode: z.enum(IMPORT_MODES) }),
      run: async ({ db }, { token, mode }) => {
        if (opened?.token !== token) {
          throw new CushnError("NOT_FOUND", "That backup file is no longer open. Choose it again.");
        }
        const parsed = opened.backup;
        const safetyCopyPath = writeSafetyCopy(db);
        const counts = mode === "add" ? backup.addAll(db, parsed) : backup.importAll(db, parsed);
        // Before the first await, so a second call with this token can't import the file again.
        opened = null;
        await pruneSafetyCopies(safetyCopyDir, basename(safetyCopyPath));
        return { counts, safetyCopyPath };
      },
    },
  };
}

/** Keeps `keep` and the newest others, `SAFETY_COPIES_KEPT` in all. */
async function pruneSafetyCopies(dir: string, keep: string): Promise<void> {
  try {
    const others = (await readdir(dir))
      .filter((name) => name !== keep && SAFETY_COPY_PATTERN.test(name))
      .sort();
    const stale = others.slice(0, Math.max(0, others.length - (SAFETY_COPIES_KEPT - 1)));
    await Promise.all(stale.map((name) => rm(join(dir, name), { force: true })));
  } catch (error) {
    // Housekeeping only: a copy that won't delete must not block the import.
    console.warn("[backup] could not prune old safety copies", error);
  }
}
