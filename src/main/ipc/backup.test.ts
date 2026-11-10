// The backup handlers with fake dialogs and a temp dir; the repository has its own backup.test.ts.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixtureV1 from "@shared/__fixtures__/backup-v1.json";
import type { BackupCounts } from "@shared/api";
import { BACKUP_VERSION, type Backup, parseBackupText, serializeBackup } from "@shared/backup";
import { type DatabaseHandle, openDatabase } from "../db";
import * as backupRepository from "../repositories/backup";
import * as labels from "../repositories/labels";
import { type BackupDependencies, type BackupDialogs, createBackupHandlers } from "./backup";
import { invokeHandler } from "./handler";

const migrationsFolder = resolve(import.meta.dirname, "../../../drizzle");
const now = new Date(2026, 9, 21, 23, 30, 15, 250).getTime();
const utcNow = Date.UTC(2026, 9, 21, 23, 30, 15, 250);
const safetyCopyName = "pre-import-2026-10-21T23-30-15-250Z.json";

let handle: DatabaseHandle;
let dir: string;

beforeEach(() => {
  handle = openDatabase(":memory:", { migrationsFolder });
  dir = mkdtempSync(join(tmpdir(), "cushn-backup-test-"));
});

afterEach(() => {
  handle.close();
  rmSync(dir, { recursive: true, force: true });
});

const safetyCopyDir = () => join(dir, "backups");

function fakeDialogs(overrides: Partial<BackupDialogs> = {}) {
  return {
    chooseExportPath: vi.fn<BackupDialogs["chooseExportPath"]>(async (name) => join(dir, name)),
    chooseImportPath: vi.fn<BackupDialogs["chooseImportPath"]>(async () => null),
    ...overrides,
  };
}

function handlers(dialogs: BackupDialogs, deps: Partial<BackupDependencies> = {}) {
  return createBackupHandlers({
    dialogs,
    safetyCopyDir: safetyCopyDir(),
    appVersion: "1.2.3",
    now: () => now,
    ...deps,
  });
}

function snapshot(): Backup {
  return backupRepository.exportAll(handle.db, { exportedAt: 0, appVersion: "test" });
}

function writeBackupFile(name: string, contents: string): string {
  const path = join(dir, name);
  writeFileSync(path, contents);
  return path;
}

const fixturePath = () => writeBackupFile("fixture.json", JSON.stringify(fixtureV1));
const fixtureCounts: BackupCounts = { templates: 2, budgets: 3, expenses: 5, labels: 2, views: 2 };
const notOpen = {
  ok: false,
  error: { code: "NOT_FOUND", message: "That backup file is no longer open. Choose it again." },
};

describe("backup.export", () => {
  async function exportBackup(dialogs: BackupDialogs) {
    return invokeHandler(
      handlers(dialogs).export,
      { db: handle.db },
      undefined,
      "cushn:backup.export",
    );
  }

  it("offers a dated file name and writes pretty JSON there", async () => {
    const dialogs = fakeDialogs();

    const result = await exportBackup(dialogs);

    const filePath = join(dir, "cushn-backup-2026-10-21.json");
    expect(dialogs.chooseExportPath).toHaveBeenCalledWith("cushn-backup-2026-10-21.json");
    expect(result).toEqual({ ok: true, data: { status: "saved", filePath } });
    const text = readFileSync(filePath, "utf8");
    const backup = parseBackupText(text);
    expect(text).toBe(serializeBackup(backup));
    expect(backup).toMatchObject({
      exportedAt: now,
      app: { name: "cushn-desktop", version: "1.2.3" },
    });
    expect(backup.data).toEqual(snapshot().data);
  });

  it("writes nothing when the save dialog is canceled", async () => {
    const result = await exportBackup(fakeDialogs({ chooseExportPath: async () => null }));

    expect(result).toEqual({ ok: true, data: { status: "canceled" } });
    expect(readdirSync(dir)).toEqual([]);
  });

  it("answers with a readable error when the file can't be written", async () => {
    const result = await exportBackup(
      fakeDialogs({ chooseExportPath: async () => join(dir, "missing", "backup.json") }),
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: "Could not save the backup file." },
    });
  });
});

/** `open` and `import` sharing one set of handlers, so the held file carries between calls. */
function importer(dialogs: BackupDialogs, deps: Partial<BackupDependencies> = {}) {
  const backup = handlers(dialogs, { now: () => utcNow, ...deps });
  const context = { db: handle.db };
  const open = () => invokeHandler(backup.open, context, undefined, "cushn:backup.open");
  return {
    open,
    import: (args: unknown) => invokeHandler(backup.import, context, args, "cushn:backup.import"),
    /** Opens the file the dialog picks and answers its token. */
    async token(): Promise<string> {
      const result = await open();
      if (!result.ok || result.data.status !== "opened") throw new Error("expected an opened file");
      return result.data.token;
    },
  };
}

function untouched() {
  const before = snapshot();
  return () => {
    expect(snapshot()).toEqual(before);
    expect(existsSync(safetyCopyDir())).toBe(false);
  };
}

describe("backup.open", () => {
  it("validates the chosen file and answers its summary and a token, writing nothing", async () => {
    const expectUntouched = untouched();
    const { open } = importer(fakeDialogs({ chooseImportPath: async () => fixturePath() }));

    const result = await open();

    expect(result).toEqual({
      ok: true,
      data: {
        status: "opened",
        token: expect.any(String),
        summary: {
          fileName: "fixture.json",
          exportedAt: fixtureV1.exportedAt,
          counts: fixtureCounts,
        },
      },
    });
    expectUntouched();
  });

  it("answers canceled when the open dialog is closed, writing nothing", async () => {
    const expectUntouched = untouched();

    expect(await importer(fakeDialogs()).open()).toEqual({
      ok: true,
      data: { status: "canceled" },
    });
    expectUntouched();
  });

  it.each([
    ["not JSON", "not json at all", "This file is not a Cushn backup."],
    [
      "a wrong format marker",
      JSON.stringify({ ...fixtureV1, format: "other" }),
      "This file is not a Cushn backup.",
    ],
    [
      "a newer version",
      JSON.stringify({ ...fixtureV1, version: BACKUP_VERSION + 1 }),
      "This backup comes from a newer version of Cushn. Update Cushn to import it.",
    ],
    [
      "an unknown version",
      JSON.stringify({ ...fixtureV1, version: 0 }),
      "This backup has an unknown version.",
    ],
    [
      "a schema error",
      JSON.stringify({ ...fixtureV1, data: { ...fixtureV1.data, budgets: "none" } }),
      /^This backup is damaged: data\.budgets/,
    ],
    [
      "a dangling foreign key",
      JSON.stringify({
        ...fixtureV1,
        data: {
          ...fixtureV1.data,
          expenses: [{ ...fixtureV1.data.expenses[0], allocationId: "missing" }],
        },
      }),
      'This backup is damaged: an expense ("Rent") refers to a missing allocation.',
    ],
  ])("rejects %s, writing nothing", async (_case, contents, message) => {
    const expectUntouched = untouched();
    const { open } = importer(
      fakeDialogs({ chooseImportPath: async () => writeBackupFile("bad.json", contents) }),
    );

    const result = await open();

    expect(result).toMatchObject({ ok: false, error: { code: "BAD_REQUEST" } });
    if (!result.ok) expect(result.error.message).toMatch(message);
    expectUntouched();
  });

  it("answers with a readable error when the chosen file can't be read", async () => {
    const { open } = importer(
      fakeDialogs({ chooseImportPath: async () => join(dir, "gone.json") }),
    );

    expect(await open()).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: "Could not read the backup file." },
    });
  });
});

describe("backup.import", () => {
  it("saves a safety copy of the old data, then replaces it", async () => {
    const before = snapshot();
    const backup = importer(fakeDialogs({ chooseImportPath: async () => fixturePath() }));
    const token = await backup.token();

    const result = await backup.import({ token, mode: "replace" });

    const safetyCopyPath = join(safetyCopyDir(), safetyCopyName);
    expect(result).toEqual({ ok: true, data: { counts: fixtureCounts, safetyCopyPath } });
    const safetyCopy = parseBackupText(readFileSync(safetyCopyPath, "utf8"));
    expect(safetyCopy.data).toEqual(before.data);
    expect(backupRepository.counts(handle.db)).toEqual(fixtureCounts);
  });

  it("adds to the current data in Add mode, answering with what it added", async () => {
    const before = snapshot();
    const beforeCounts = backupRepository.counts(handle.db);
    const backup = importer(fakeDialogs({ chooseImportPath: async () => fixturePath() }));
    const token = await backup.token();

    const result = await backup.import({ token, mode: "add" });

    const added = { templates: 1, budgets: 3, expenses: 5, labels: 1, views: 2 };
    const safetyCopyPath = join(safetyCopyDir(), safetyCopyName);
    expect(result).toEqual({ ok: true, data: { counts: added, safetyCopyPath } });
    expect(parseBackupText(readFileSync(safetyCopyPath, "utf8")).data).toEqual(before.data);
    const after = snapshot();
    expect(after.data.budgets).toEqual(expect.arrayContaining(before.data.budgets));
    expect(after.data.userSettings).toEqual(before.data.userSettings);
    expect(backupRepository.counts(handle.db)).toEqual({
      templates: beforeCounts.templates + added.templates,
      budgets: beforeCounts.budgets + added.budgets,
      expenses: beforeCounts.expenses + added.expenses,
      labels: beforeCounts.labels + added.labels,
      views: beforeCounts.views + added.views,
    });
  });

  it("answers NOT_FOUND for a token main doesn't hold, writing nothing, not even a safety copy", async () => {
    const expectUntouched = untouched();
    const backup = importer(fakeDialogs({ chooseImportPath: async () => fixturePath() }));

    expect(await backup.import({ token: "never-opened", mode: "replace" })).toEqual(notOpen);
    await backup.token();
    expect(await backup.import({ token: "wrong", mode: "replace" })).toEqual(notOpen);
    expectUntouched();
  });

  it("forgets the file once imported, so its token can't import it again", async () => {
    const backup = importer(fakeDialogs({ chooseImportPath: async () => fixturePath() }));
    const token = await backup.token();
    await backup.import({ token, mode: "add" });
    const once = snapshot();

    expect(await backup.import({ token, mode: "add" })).toEqual(notOpen);
    expect(snapshot()).toEqual(once);
    expect(readdirSync(safetyCopyDir())).toEqual([safetyCopyName]);
  });

  it("imports once when two calls race with the same token", async () => {
    const backup = importer(fakeDialogs({ chooseImportPath: async () => fixturePath() }));
    const token = await backup.token();
    const budgetsBefore = backupRepository.counts(handle.db).budgets;

    const results = await Promise.all([
      backup.import({ token, mode: "add" }),
      backup.import({ token, mode: "add" }),
    ]);

    expect(results[0]).toMatchObject({ ok: true });
    expect(results[1]).toEqual(notOpen);
    expect(backupRepository.counts(handle.db).budgets).toBe(budgetsBefore + fixtureCounts.budgets);
  });

  it("holds only the latest opened file: an earlier token answers NOT_FOUND", async () => {
    const noExpenses = { ...fixtureV1, data: { ...fixtureV1.data, expenses: [] } };
    const chooseImportPath = vi
      .fn<BackupDialogs["chooseImportPath"]>()
      .mockResolvedValueOnce(fixturePath())
      .mockResolvedValueOnce(writeBackupFile("no-expenses.json", JSON.stringify(noExpenses)));
    const backup = importer(fakeDialogs({ chooseImportPath }));
    const first = await backup.token();
    const second = await backup.token();
    const expectUntouched = untouched();

    expect(await backup.import({ token: first, mode: "replace" })).toEqual(notOpen);
    expectUntouched();
    expect(await backup.import({ token: second, mode: "replace" })).toMatchObject({ ok: true });
    expect(backupRepository.counts(handle.db)).toEqual({ ...fixtureCounts, expenses: 0 });
  });

  it.each([
    ["canceled", async () => null],
    ["rejected", async () => writeBackupFile("bad.json", "not json at all")],
  ])("forgets the held file when the next open is %s", async (_case, next) => {
    const chooseImportPath = vi
      .fn<BackupDialogs["chooseImportPath"]>()
      .mockResolvedValueOnce(fixturePath())
      .mockImplementationOnce(next);
    const backup = importer(fakeDialogs({ chooseImportPath }));
    const token = await backup.token();
    await backup.open();
    const expectUntouched = untouched();

    expect(await backup.import({ token, mode: "replace" })).toEqual(notOpen);
    expectUntouched();
  });

  it("rejects a mode other than add or replace, writing nothing", async () => {
    const expectUntouched = untouched();
    const backup = importer(fakeDialogs({ chooseImportPath: async () => fixturePath() }));
    const token = await backup.token();

    expect(await backup.import({ token, mode: "merge" })).toMatchObject({
      ok: false,
      error: { code: "BAD_REQUEST" },
    });
    expectUntouched();
  });

  it("keeps the 5 newest safety copies, named in UTC, ignoring other files", async () => {
    const backups = safetyCopyDir();
    const older = [
      "pre-import-2026-01-01T00-00-00-000Z.json",
      "pre-import-2026-02-01T00-00-00-000Z.json",
      "pre-import-2026-03-01T00-00-00-000Z.json",
      "pre-import-2026-04-01T00-00-00-000Z.json",
      "pre-import-2026-05-01T00-00-00-000Z.json",
      "pre-import-2026-06-01T00-00-00-000Z.json",
    ];
    const unrelated = ["notes.txt", "pre-import-notes.json", "pre-import-2026-01-01.json"];
    mkdirSync(backups);
    for (const name of [...older, ...unrelated]) writeFileSync(join(backups, name), "{}");
    const backup = importer(fakeDialogs({ chooseImportPath: async () => fixturePath() }));

    await backup.import({ token: await backup.token(), mode: "replace" });

    expect(readdirSync(backups).sort()).toEqual(
      [
        ...unrelated,
        "pre-import-2026-03-01T00-00-00-000Z.json",
        "pre-import-2026-04-01T00-00-00-000Z.json",
        "pre-import-2026-05-01T00-00-00-000Z.json",
        "pre-import-2026-06-01T00-00-00-000Z.json",
        safetyCopyName,
      ].sort(),
    );
  });

  it("never prunes the copy it just wrote, even when the clock is behind older copies", async () => {
    const backups = safetyCopyDir();
    const future = [1, 2, 3, 4, 5].map(
      (month) => `pre-import-2027-0${month}-01T00-00-00-000Z.json`,
    );
    mkdirSync(backups);
    for (const name of future) writeFileSync(join(backups, name), "{}");
    const backup = importer(fakeDialogs({ chooseImportPath: async () => fixturePath() }));

    const result = await backup.import({ token: await backup.token(), mode: "replace" });

    expect(result).toMatchObject({
      ok: true,
      data: { safetyCopyPath: join(backups, safetyCopyName) },
    });
    expect(readdirSync(backups).sort()).toEqual([...future.slice(1), safetyCopyName].sort());
  });

  it("takes the safety copy and replaces with no await in between, so no write falls in the gap", async () => {
    const created: string[] = [];
    let writing = true;
    const writeLabel = () => {
      if (!writing) return;
      const name = `late-${created.length}`;
      labels.create(handle.db, { name, color: "#000000" });
      created.push(name);
      setImmediate(writeLabel);
    };
    const backup = importer(fakeDialogs({ chooseImportPath: async () => fixturePath() }));
    const token = await backup.token();

    writeLabel();
    const result = await backup.import({ token, mode: "replace" });
    await new Promise((resolve) => setImmediate(resolve));
    writing = false;

    if (!result.ok) throw new Error("expected an import");
    const safetyCopy = parseBackupText(readFileSync(result.data.safetyCopyPath, "utf8"));
    const kept = new Set([
      ...safetyCopy.data.budgetLabels.map((label) => label.name),
      ...labels.list(handle.db).labels.map((label) => label.name),
    ]);
    expect(created.length).toBeGreaterThan(1);
    expect(created.filter((name) => !kept.has(name))).toEqual([]);
  });

  it("stops with the data untouched when the safety copy can't be written, keeping the file open to retry", async () => {
    const before = snapshot();
    const blocked = writeBackupFile("not-a-dir", "");
    const backup = importer(fakeDialogs({ chooseImportPath: async () => fixturePath() }), {
      safetyCopyDir: join(blocked, "backups"),
    });
    const token = await backup.token();

    const result = await backup.import({ token, mode: "replace" });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INTERNAL",
        message: "Could not save a safety copy of your current data, so nothing was imported.",
      },
    });
    expect(snapshot()).toEqual(before);
    rmSync(blocked);
    expect(await backup.import({ token, mode: "replace" })).toMatchObject({ ok: true });
    expect(backupRepository.counts(handle.db)).toEqual(fixtureCounts);
  });
});
