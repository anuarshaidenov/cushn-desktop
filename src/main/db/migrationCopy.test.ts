import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "./index";
import { MIGRATION_COPIES_KEPT } from "./migrationCopy";

const migrationsFolder = resolve(import.meta.dirname, "../../../drizzle");

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(resolve(tmpdir(), "cushn-migration-copy-test-"));
  file = resolve(dir, "cushn.db");
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

/** A copy of `drizzle/` whose journal is changed by `edit`, as an older or newer app would ship it. */
function migrationsWith(name: string, edit: (entries: JournalEntry[]) => JournalEntry[]) {
  const folder = resolve(dir, name);
  cpSync(migrationsFolder, folder, { recursive: true });
  const journalPath = resolve(folder, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: JournalEntry[] };
  writeFileSync(journalPath, JSON.stringify({ ...journal, entries: edit(journal.entries) }));
  return folder;
}

const olderMigrations = () => migrationsWith("migrations-old", (entries) => entries.slice(0, -1));

function brokenMigrations() {
  const folder = migrationsWith("migrations-broken", (entries) => {
    const last = entries.at(-1)!;
    return [...entries, { ...last, idx: last.idx + 1, when: last.when + 1, tag: "9999_broken" }];
  });
  writeFileSync(resolve(folder, "9999_broken.sql"), "this is not sql;");
  return folder;
}

/** A database an older app version left behind: migrated up to the previous release, with data. */
function createOlderDatabase() {
  const handle = openDatabase(file, { migrationsFolder: olderMigrations(), seed: false });
  handle.sqlite.prepare("insert into app_meta (key, value) values ('marker', 'mine')").run();
  handle.close();
}

function readOnly(path: string) {
  const sqlite = new Database(path, { readonly: true });
  try {
    return {
      applied: sqlite.prepare("select count(*) from __drizzle_migrations").pluck().get(),
      marker: sqlite.prepare("select value from app_meta where key = 'marker'").pluck().get(),
    };
  } finally {
    sqlite.close();
  }
}

const copies = () => readdirSync(dir).filter((name) => name.startsWith("cushn-pre-migration-"));

const { entries } = JSON.parse(
  readFileSync(resolve(migrationsFolder, "meta/_journal.json"), "utf8"),
) as { entries: JournalEntry[] };
const journalLength = entries.length;
const secondToLastTag = entries.at(-2)!.tag;

function freezeTime(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

describe("copy before migrating", () => {
  it("copies an existing database before applying pending migrations", () => {
    createOlderDatabase();
    freezeTime("2026-11-07T10:15:30.123Z");

    openDatabase(file, { migrationsFolder, seed: false }).close();

    const name = `cushn-pre-migration-2026-11-07T10-15-30-123Z-${secondToLastTag}.db`;
    expect(copies()).toEqual([name]);
    expect(readOnly(resolve(dir, name))).toEqual({ applied: journalLength - 1, marker: "mine" });
    expect(readOnly(file)).toEqual({ applied: journalLength, marker: "mine" });
  });

  it("makes no copy of a database it creates", () => {
    openDatabase(file, { migrationsFolder }).close();
    expect(copies()).toEqual([]);
  });

  it("makes no copy of a database that is up to date", () => {
    openDatabase(file, { migrationsFolder }).close();
    openDatabase(file, { migrationsFolder }).close();
    expect(copies()).toEqual([]);
  });

  it(`keeps only the newest ${MIGRATION_COPIES_KEPT} copies`, () => {
    createOlderDatabase();
    const old = Array.from(
      { length: MIGRATION_COPIES_KEPT + 1 },
      (_, i) => `cushn-pre-migration-2026-0${i + 1}-01T00-00-00-000Z-0000_init.db`,
    );
    for (const name of old) writeFileSync(resolve(dir, name), "");
    writeFileSync(resolve(dir, "notes.db"), "");
    freezeTime("2026-11-07T10:15:30.123Z");

    openDatabase(file, { migrationsFolder, seed: false }).close();

    expect(copies()).toEqual([
      ...old.slice(-(MIGRATION_COPIES_KEPT - 1)),
      `cushn-pre-migration-2026-11-07T10-15-30-123Z-${secondToLastTag}.db`,
    ]);
    expect(readdirSync(dir)).toEqual(expect.arrayContaining(["cushn.db", "notes.db"]));
  });

  it("refuses to migrate when the copy can't be saved, leaving the database as it was", () => {
    createOlderDatabase();
    freezeTime("2026-11-07T10:15:30.123Z");
    const path = resolve(dir, `cushn-pre-migration-2026-11-07T10-15-30-123Z-${secondToLastTag}.db`);
    mkdirSync(path);

    expect(() => openDatabase(file, { migrationsFolder, seed: false })).toThrow(
      /copy of it could not be saved.*your data is unchanged/s,
    );
    expect(() => openDatabase(file, { migrationsFolder, seed: false })).toThrow(path);
    expect(readOnly(file)).toEqual({ applied: journalLength - 1, marker: "mine" });
  });

  it("names the copy when a migration fails", () => {
    openDatabase(file, { migrationsFolder, seed: false }).close();

    let message = "";
    try {
      openDatabase(file, { migrationsFolder: brokenMigrations(), seed: false });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(copies()).toHaveLength(1);
    expect(message).toContain("this is not sql");
    expect(message).toContain(resolve(dir, copies()[0]!));
    expect(readOnly(file).applied).toBe(journalLength);
  });
});
