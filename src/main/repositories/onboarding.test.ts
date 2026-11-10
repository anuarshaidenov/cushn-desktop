import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DatabaseHandle, openDatabase } from "../db";
import { appMeta } from "../db/schema";
import { SEEDED_AT_KEY } from "../db/seed";
import * as onboarding from "./onboarding";
import { ONBOARDED_AT_KEY } from "./onboarding";

const migrationsFolder = resolve(import.meta.dirname, "../../../drizzle");

let handle: DatabaseHandle;

beforeEach(() => {
  handle = openDatabase(":memory:", { migrationsFolder });
});

afterEach(() => {
  handle.close();
});

function metaValue(db: DatabaseHandle["db"], key: string) {
  return db.select().from(appMeta).where(eq(appMeta.key, key)).get()?.value;
}

describe("onboarding.get", () => {
  it("answers null on a new database, though seeding ran", () => {
    expect(metaValue(handle.db, SEEDED_AT_KEY)).toBeDefined();
    expect(onboarding.get(handle.db)).toEqual({ completedAt: null });
  });
});

describe("onboarding.complete", () => {
  it("stores an ISO timestamp and reads it back in epoch ms", () => {
    const now = Date.UTC(2026, 10, 3, 9, 30);
    expect(onboarding.complete(handle.db, now)).toEqual({ success: true });
    expect(metaValue(handle.db, ONBOARDED_AT_KEY)).toBe("2026-11-03T09:30:00.000Z");
    expect(onboarding.get(handle.db)).toEqual({ completedAt: now });
  });

  it("keeps the first timestamp when called again", () => {
    onboarding.complete(handle.db, 1000);
    expect(onboarding.complete(handle.db, 2000)).toEqual({ success: true });
    expect(onboarding.get(handle.db)).toEqual({ completedAt: 1000 });
  });
});

describe("the onboarded_at migration", () => {
  it("marks an install seeded before it as onboarded, at its seed time", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "cushn-onboarding-test-"));
    try {
      const previous = resolve(dir, "drizzle");
      cpSync(migrationsFolder, previous, { recursive: true });
      const journalPath = resolve(previous, "meta/_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
        entries: { tag: string }[];
      };
      const index = journal.entries.findIndex((entry) => entry.tag.endsWith("_onboarded_at"));
      expect(index).toBeGreaterThan(0);
      journal.entries = journal.entries.slice(0, index);
      writeFileSync(journalPath, JSON.stringify(journal));

      const file = resolve(dir, "cushn.db");
      const before = openDatabase(file, { migrationsFolder: previous });
      const seededAt = metaValue(before.db, SEEDED_AT_KEY)!;
      expect(onboarding.get(before.db)).toEqual({ completedAt: null });
      before.close();

      const after = openDatabase(file, { migrationsFolder });
      expect(onboarding.get(after.db)).toEqual({ completedAt: Date.parse(seededAt) });
      after.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
