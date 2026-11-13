/**
 * Opens the app's SQLite database: pragmas, migrations, first-run seed.
 *
 * Electron-free on purpose: the caller passes the file path and the migrations
 * folder, so Vitest can open `':memory:'` in plain Node. The Electron side
 * (`src/main/index.ts`) resolves both from `app`.
 */
import Database from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { copyBeforeMigrating } from "./migrationCopy";
import * as schema from "./schema";
import { seedDatabase } from "./seed";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export interface OpenDatabaseOptions {
  /** Folder holding drizzle-kit output (`*.sql` + `meta/_journal.json`). */
  migrationsFolder: string;
  /** Run first-run seeding (default true). Tests may turn it off. */
  seed?: boolean;
}

export interface DatabaseHandle {
  db: AppDatabase;
  /** The raw connection, for pragmas and SQL Drizzle can't express. */
  sqlite: Database.Database;
  close(): void;
}

/** Opens (creating if needed) and migrates the database at `filePath` (or `':memory:'`). */
export function openDatabase(filePath: string, options: OpenDatabaseOptions): DatabaseHandle {
  const sqlite = new Database(filePath);
  try {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("synchronous = NORMAL");
    sqlite.pragma("busy_timeout = 5000");

    const db = drizzle(sqlite, { schema });
    const copyPath = copyBeforeMigrating(sqlite, filePath, options.migrationsFolder);

    // Migrations run with foreign keys off: SQLite can only change many column
    // definitions by rebuilding the table, which would otherwise cascade
    // deletes into child tables. The pragma is a no-op inside a transaction,
    // so it is set around `migrate()` (which runs in one), then checked.
    sqlite.pragma("foreign_keys = OFF");
    try {
      migrate(db, { migrationsFolder: options.migrationsFolder });
      const violations = sqlite.pragma("foreign_key_check") as unknown[];
      if (violations.length > 0) {
        throw new Error(`Migrations left ${violations.length} foreign key violation(s)`);
      }
    } catch (error) {
      if (copyPath === null) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      const message = `${reason}\n\nA copy of the database from before the update is at ${copyPath}`;
      throw new Error(message, { cause: error });
    }
    sqlite.pragma("foreign_keys = ON");

    if (options.seed ?? true) seedDatabase(db);

    return {
      db,
      sqlite,
      close: () => {
        if (!sqlite.open) return;
        try {
          // Refreshes the query planner's statistics where they went stale; bounded work.
          sqlite.pragma("optimize");
        } catch (error) {
          console.error("Failed to optimize the database", error);
        }
        sqlite.close();
      },
    };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
