// The backup format: parsing, version handling, integrity, money rounding.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import fixtureV1 from "./__fixtures__/backup-v1.json";
import fixtureV2 from "./__fixtures__/backup-v2.json";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupCounts,
  type BackupChain,
  backupFileName,
  backupStep,
  parseBackup,
  parseBackupText,
  serializeBackup,
  upgradeBackup,
} from "./backup";
import { CushnError } from "./errors";

type Raw = typeof fixtureV2;

function rawBackup(): Raw {
  return structuredClone(fixtureV2);
}

function rejection(run: () => unknown): CushnError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(CushnError);
    expect((error as CushnError).code).toBe("BAD_REQUEST");
    return error as CushnError;
  }
  throw new Error("expected the parse to throw");
}

describe("parseBackupText", () => {
  it("parses the pretty JSON that serializeBackup writes", () => {
    const backup = parseBackup(rawBackup());
    const text = serializeBackup(backup);

    expect(text).toBe(`${JSON.stringify(backup, null, 2)}\n`);
    expect(parseBackupText(text)).toEqual(backup);
  });

  it("parses the compact JSON of a safety copy to the same backup", () => {
    const backup = parseBackup(rawBackup());
    const text = serializeBackup(backup, { compact: true });

    expect(text).toBe(`${JSON.stringify(backup)}\n`);
    expect(parseBackupText(text)).toEqual(backup);
  });

  it("ignores a UTF-8 byte order mark left by an editor", () => {
    const backup = parseBackup(rawBackup());
    expect(parseBackupText(`\uFEFF${serializeBackup(backup)}`)).toEqual(backup);
  });

  it.each([
    ["an empty file", ""],
    ["text that is not JSON", "budget,amount\nrent,600"],
    ["a JSON value that is not an object", "[1, 2, 3]"],
  ])("rejects %s as not a backup", (_case, text) => {
    expect(rejection(() => parseBackupText(text)).message).toBe("This file is not a Cushn backup.");
  });
});

describe("parseBackup: format and version", () => {
  it("accepts the v1 fixture, which must keep importing forever", () => {
    const backup = parseBackup(fixtureV1);

    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backupCounts(backup.data)).toEqual({
      templates: 2,
      budgets: 3,
      expenses: 5,
      labels: 2,
      views: 2,
    });
  });

  it("upgrades v1 to v2 by giving every budget no icon", () => {
    const { data } = parseBackup(rawBackup());

    expect(parseBackup(fixtureV1).data).toEqual({
      ...data,
      budgets: data.budgets.map((budget) => ({ ...budget, icon: null })),
    });
  });

  it("accepts the v2 fixture with its budget icons", () => {
    const { data } = parseBackup(rawBackup());
    expect(data.budgets.map((budget) => budget.icon)).toEqual(["home", "flights", null]);
  });

  it("rejects a file with another format marker", () => {
    const raw = { ...rawBackup(), format: "something-else" };
    expect(rejection(() => parseBackup(raw)).message).toBe("This file is not a Cushn backup.");
  });

  it("rejects a backup from a newer version of Cushn", () => {
    const raw = { ...rawBackup(), version: BACKUP_VERSION + 1 };
    expect(rejection(() => parseBackup(raw)).message).toMatch(/newer version of Cushn/);
  });

  it.each([
    ["missing", undefined],
    ["zero", 0],
    ["a fraction", 1.5],
    ["a string", "1"],
  ])("rejects a version that is %s as unknown", (_case, version) => {
    const raw = { ...rawBackup(), version };
    expect(rejection(() => parseBackup(raw)).message).toBe("This backup has an unknown version.");
  });
});

describe("parseBackup: schema", () => {
  it("names the first offending field", () => {
    const raw = rawBackup();
    (raw.data.expenses[1] as { amount: unknown }).amount = "212.47";

    expect(rejection(() => parseBackup(raw)).message).toMatch(
      /^This backup is damaged: data\.expenses\[1\]\.amount/,
    );
  });

  it("requires optional values as null rather than omitted", () => {
    const raw = rawBackup();
    delete (raw.data.budgets[0] as { description?: unknown }).description;

    expect(rejection(() => parseBackup(raw)).message).toMatch(/data\.budgets\[0\]\.description/);
  });

  it("rejects a budget icon that is not a string", () => {
    const raw = rawBackup();
    (raw.data.budgets[1] as { icon: unknown }).icon = 42;

    expect(rejection(() => parseBackup(raw)).message).toMatch(
      /^This backup is damaged: data\.budgets\[1\]\.icon/,
    );
  });

  it("accepts an icon name the catalog doesn't know, which shows the placeholder", () => {
    const raw = rawBackup();
    raw.data.budgets[0].icon = "retired-icon";

    expect(parseBackup(raw).data.budgets[0].icon).toBe("retired-icon");
  });

  it.each([
    [
      "a budget status",
      (raw: Raw) => ((raw.data.budgets[0] as { status: string }).status = "deleted"),
    ],
    [
      "a display mode",
      (raw: Raw) => ((raw.data.userSettings as { budgetView: string }).budgetView = "table"),
    ],
  ])("rejects an unknown enum value: %s", (_case, damage) => {
    const raw = rawBackup();
    damage(raw);
    expect(rejection(() => parseBackup(raw)).message).toMatch(/^This backup is damaged/);
  });

  it("ignores unknown extra keys", () => {
    const raw = rawBackup() as Raw & { comment?: string };
    raw.comment = "hand-edited";
    (raw.data.budgets[0] as { pinned?: boolean }).pinned = true;

    const backup = parseBackup(raw);

    expect(backup).not.toHaveProperty("comment");
    expect(backup.data.budgets[0]).not.toHaveProperty("pinned");
  });
});

describe("parseBackup: referential integrity", () => {
  const missing = "00000000-0000-4000-8000-00000000dead";

  it.each<[string, (raw: Raw) => void, RegExp]>([
    [
      "duplicate ids",
      (raw) => (raw.data.budgetLabels[1].id = raw.data.budgetLabels[0].id),
      /two labels share an id/,
    ],
    [
      "a category's template",
      (raw) => (raw.data.templateCategories[0].templateId = missing),
      /a template category \("Needs"\) refers to a missing template/,
    ],
    [
      "a budget's template",
      (raw) => (raw.data.budgets[0].templateId = missing),
      /a budget \("October at home"\) refers to a missing template/,
    ],
    [
      "a budget's label",
      (raw) => (raw.data.budgets[0].labelId = missing),
      /a budget \("October at home"\) refers to a missing label/,
    ],
    [
      "a budget's view",
      (raw) => (raw.data.budgets[0].viewId = missing),
      /a budget \("October at home"\) refers to a missing view/,
    ],
    [
      "an allocation's budget",
      (raw) => (raw.data.budgetAllocations[0].budgetId = missing),
      /an allocation \("Needs"\) refers to a missing budget/,
    ],
    [
      "an expense's budget",
      (raw) => (raw.data.expenses[0].budgetId = missing),
      /an expense \("Rent"\) refers to a missing budget/,
    ],
    [
      "an expense's allocation",
      (raw) => (raw.data.expenses[0].allocationId = missing),
      /an expense \("Rent"\) refers to a missing allocation/,
    ],
    [
      "an expense whose budget is not its allocation's",
      (raw) => (raw.data.expenses[0].budgetId = raw.data.budgets[1].id),
      /an expense \("Rent"\) belongs to a different budget than its allocation/,
    ],
  ])("rejects %s", (_case, damage, message) => {
    const raw = rawBackup();
    damage(raw);
    const error = rejection(() => parseBackup(raw));
    expect(error.message).toMatch(/^This backup is damaged: /);
    expect(error.message).toMatch(message);
  });

  it("accepts null template, label and view ids on a budget", () => {
    const backup = parseBackup(rawBackup());
    expect(backup.data.budgets[2]).toMatchObject({
      templateId: null,
      labelId: null,
      status: "archived",
    });
  });
});

describe("parseBackup: rules every repository write enforces", () => {
  it.each<[string, (raw: Raw) => void, RegExp]>([
    [
      "a blank view title",
      (raw) => (raw.data.budgetViews[0].title = "  "),
      /data\.budgetViews\[0\]\.title/,
    ],
    [
      "a view description over 280 characters",
      (raw) => (raw.data.budgetViews[0].description = "x".repeat(281)),
      /data\.budgetViews\[0\]\.description/,
    ],
    [
      "more than 20 favorite views",
      (raw) => {
        raw.data.budgetViews = Array.from({ length: 21 }, (_, n) => ({
          ...raw.data.budgetViews[0],
          id: `f1e30000-4f00-4a00-8000-1000000000${String(n).padStart(2, "0")}`,
        }));
        raw.data.budgets.forEach((budget) => (budget.viewId = null));
      },
      /more than 20 favorite views/,
    ],
    [
      "template categories not summing to 100",
      (raw) => (raw.data.templateCategories[0].percentage = 49),
      /the categories of a template \("50\/30\/20"\) don't add up to 100%/,
    ],
  ])("rejects %s", (_case, damage, message) => {
    const raw = rawBackup();
    damage(raw);
    const error = rejection(() => parseBackup(raw));
    expect(error.message).toMatch(/^This backup is damaged: /);
    expect(error.message).toMatch(message);
  });

  it("accepts a split that adds up to 100 only after rounding to cents", () => {
    const raw = rawBackup();
    raw.data.templateCategories[3].percentage = 33.4;
    raw.data.templateCategories[4].percentage = 66.6 - 1e-12;
    expect(() => parseBackup(raw)).not.toThrow();
  });

  it("accepts what the app lets a user create: empty titles, names and currency", () => {
    const raw = rawBackup();
    raw.data.templates[1].name = "";
    raw.data.templateCategories[3].name = "";
    raw.data.budgetLabels[0].name = "";
    raw.data.budgets[0].title = "";
    raw.data.budgets[0].currency = "";
    raw.data.budgetAllocations[0].categoryName = "";
    raw.data.expenses[0].title = "";
    expect(() => parseBackup(raw)).not.toThrow();
  });
});

describe("upgradeBackup: the version chain", () => {
  const v0 = z.object({ version: z.literal(0), items: z.array(z.string()) });
  const v1 = z.object({ version: z.literal(1), names: z.array(z.string().min(1)) });
  const chain: BackupChain<z.output<typeof v1>> = {
    version: 1,
    schema: v1,
    steps: {
      0: backupStep(v0, (backup) => ({
        version: 1,
        names: backup.items.map((item) => item.trim()),
      })),
    },
  };

  it("validates each version before upgrading it, then validates the result", () => {
    expect(upgradeBackup({ version: 0, items: [" a ", "b"] }, 0, chain)).toEqual({
      version: 1,
      names: ["a", "b"],
    });
    expect(upgradeBackup({ version: 1, names: ["c"] }, 1, chain)).toEqual({
      version: 1,
      names: ["c"],
    });
  });

  it("rejects a damaged old backup with its own schema's error, before the step runs", () => {
    expect(rejection(() => upgradeBackup({ version: 0, items: "a" }, 0, chain)).message).toMatch(
      /^This backup is damaged: items:/,
    );
  });

  it("rejects an upgraded backup that fails the current schema", () => {
    expect(rejection(() => upgradeBackup({ version: 0, items: [" "] }, 0, chain)).message).toMatch(
      /^This backup is damaged: names\[0\]:/,
    );
  });

  it("turns anything a step throws into a damaged-backup error", () => {
    const throwing: BackupChain<z.output<typeof v1>> = {
      ...chain,
      steps: {
        0: backupStep(v0, () => {
          throw new TypeError("Cannot read properties of undefined");
        }),
      },
    };
    expect(rejection(() => upgradeBackup({ version: 0, items: [] }, 0, throwing)).message).toBe(
      "This backup is damaged: it could not be upgraded to the current format.",
    );
  });

  it("rejects a version with no step as unknown", () => {
    expect(rejection(() => upgradeBackup({ version: -1 }, -1, chain)).message).toBe(
      "This backup has an unknown version.",
    );
  });
});

describe("parseBackup: money", () => {
  it("rounds income, allocation amounts and expense amounts to cents, keeping percentages", () => {
    const raw = rawBackup();
    raw.data.budgets[0].income = 5000.004;
    raw.data.budgetAllocations[3].amount = 111.3333333;
    raw.data.budgetAllocations[3].percentage = 33.33333;
    raw.data.expenses[1].amount = 1.005;

    const { data } = parseBackup(raw);

    expect(data.budgets[0].income).toBe(5000);
    expect(data.budgetAllocations[3].amount).toBe(111.33);
    expect(data.budgetAllocations[3].percentage).toBe(33.33333);
    expect(data.expenses[1].amount).toBe(1.01);
    expect(raw.data.budgets[0].income).toBe(5000.004);
    expect(raw.data.expenses[1].amount).toBe(1.005);
  });
});

describe("backupFileName", () => {
  it("uses the local date", () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 59))).toBe("cushn-backup-2026-01-05.json");
  });
});
