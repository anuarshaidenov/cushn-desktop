/**
 * Saves a copy of the database before pending migrations change it, so a
 * migration that fails or goes wrong after an app update can be undone by hand.
 */
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import type Database from "better-sqlite3";

export const MIGRATION_COPIES_KEPT = 3;

interface JournalEntry {
  when: number;
  tag: string;
}

/**
 * Copies the database next to itself when it already has migrations applied and
 * `migrationsFolder` has newer ones; returns the copy's path, or null when nothing was copied.
 */
export function copyBeforeMigrating(
  sqlite: Database.Database,
  filePath: string,
  migrationsFolder: string,
): string | null {
  if (sqlite.memory) return null;
  const lastApplied = lastAppliedMigration(sqlite);
  if (lastApplied === null) return null;
  const { entries } = JSON.parse(
    readFileSync(join(migrationsFolder, "meta/_journal.json"), "utf8"),
  ) as { entries: JournalEntry[] };
  // drizzle's own rule: a migration is pending when it is newer than the last one applied.
  if (!entries.some((entry) => entry.when > lastApplied)) return null;

  const tag = entries.find((entry) => entry.when === lastApplied)?.tag;
  const prefix = `${basename(filePath, extname(filePath))}-pre-migration-`;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const copyPath = join(dirname(filePath), `${prefix}${stamp}${tag ? `-${tag}` : ""}.db`);

  try {
    // Consistent under WAL (it reads one snapshot, WAL included) and synchronous, unlike backup().
    sqlite.prepare("VACUUM INTO ?").run(copyPath);
  } catch (error) {
    try {
      rmSync(copyPath, { force: true });
    } catch {
      // Nothing of ours to remove.
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Before updating the database, a copy of it could not be saved to ${copyPath} (${reason}), so it was not updated and your data is unchanged. Check that the disk has free space, then open the app again.`,
      { cause: error },
    );
  }

  pruneCopies(dirname(filePath), prefix);
  return copyPath;
}

function lastAppliedMigration(sqlite: Database.Database): number | null {
  const hasTable = sqlite
    .prepare("select 1 from sqlite_master where type = 'table' and name = '__drizzle_migrations'")
    .get();
  if (!hasTable) return null;
  const last = sqlite.prepare("select max(created_at) from __drizzle_migrations").pluck().get();
  return last === null ? null : Number(last);
}

/** Keeps the newest copies; the ISO timestamp in the names sorts them oldest first. */
function pruneCopies(folder: string, prefix: string) {
  try {
    const names = readdirSync(folder)
      .filter((name) => name.startsWith(prefix) && name.endsWith(".db"))
      .sort();
    for (const name of names.slice(0, -MIGRATION_COPIES_KEPT)) rmSync(join(folder, name));
  } catch (error) {
    console.error("Failed to prune old database copies", error);
  }
}
