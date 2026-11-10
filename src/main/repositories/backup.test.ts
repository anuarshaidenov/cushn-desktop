// The backup repository: export, replace-all import, add-to-data import, counts.
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fixtureV1 from "@shared/__fixtures__/backup-v1.json";
import fixtureV2 from "@shared/__fixtures__/backup-v2.json";
import {
  BACKUP_APP_NAME,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type Backup,
  type BackupData,
  parseBackup,
  parseBackupText,
  serializeBackup,
} from "@shared/backup";
import { MAX_FAVORITE_BUDGET_VIEWS } from "@shared/constants";
import { asId } from "@shared/domain";
import { type DatabaseHandle, openDatabase } from "../db";
import { appMeta, budgets as budgetsTable, userSettings } from "../db/schema";
import { SEEDED_AT_KEY, seedDatabase } from "../db/seed";
import * as backup from "./backup";
import * as budgets from "./budgets";
import * as expenses from "./expenses";
import * as labels from "./labels";
import * as settings from "./settings";
import * as templates from "./templates";
import * as views from "./views";

const migrationsFolder = resolve(import.meta.dirname, "../../../drizzle");
const exportOptions = { exportedAt: 1_761_000_000_000, appVersion: "0.1.0" };

let source: DatabaseHandle;
let target: DatabaseHandle;

beforeEach(() => {
  source = openDatabase(":memory:", { migrationsFolder });
  target = openDatabase(":memory:", { migrationsFolder });
});

afterEach(() => {
  source.close();
  target.close();
});

/** The seed plus what a real user adds: labels, views, an icon, an archived budget, a deleted template, a theme. */
function populate(db: DatabaseHandle["db"]): void {
  const builtIn = templates.list(db).templates.find((t) => t.isDefault)!;
  templates.create(db, {
    name: "Trip",
    categories: [
      { name: "Tickets", percentage: 40, editable: true },
      { name: "Stay", percentage: 60, description: "Hotels", editable: true },
    ],
  });
  const trip = templates.list(db).templates.find((t) => t.name === "Trip")!;

  const { labelId } = labels.create(db, { name: "Travel", color: "#123456" });
  const homeId = views.create(db, { title: "Home", description: "Everyday" });
  views.create(db, { title: "Later" });
  views.toggleFavorite(db, { viewId: homeId });

  const { budgetId: tripBudget } = budgets.create(db, {
    templateId: trip.id,
    currency: "eur",
    title: "Отпуск в Алматы",
    income: 1234.56,
    labelId,
    viewId: homeId,
  });
  budgets.setIcon(db, { budgetId: tripBudget, icon: "flights" });
  const { budgetId: oldBudget } = budgets.create(db, {
    templateId: builtIn.id,
    currency: "usd",
    title: "Old plan",
    description: "## Done\n\nAll paid.",
    income: 900,
  });
  budgets.archive(db, { budgetId: oldBudget });

  const [tickets] = budgets.get(db, { budgetId: tripBudget }).allocations;
  expenses.create(db, {
    budgetId: tripBudget,
    allocationId: tickets.id,
    amount: 80,
    title: "Train",
  });
  expenses.createMany(db, {
    budgetId: tripBudget,
    allocationId: tickets.id,
    items: [{ title: "Plane", amount: 320.5, description: "Return" }],
  });

  templates.delete(db, { templateId: trip.id });
  settings.update(db, { theme: "dark", budgetView: "list", currency: "kzt" });
}

function withoutExportedAt({ exportedAt: _, ...rest }: Backup) {
  return rest;
}

describe("backup.exportAll", () => {
  it("writes the format header and every table", () => {
    const exported = backup.exportAll(source.db, exportOptions);

    expect(exported).toMatchObject({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: exportOptions.exportedAt,
      app: { name: BACKUP_APP_NAME, version: "0.1.0" },
    });
    expect(Object.keys(exported.data)).toEqual([
      "templates",
      "templateCategories",
      "budgetLabels",
      "budgetViews",
      "budgets",
      "budgetAllocations",
      "expenses",
      "userSettings",
    ]);
    expect(Object.keys(exported.data.expenses[0])).toEqual([
      "id",
      "budgetId",
      "allocationId",
      "title",
      "amount",
      "description",
      "order",
      "checked",
      "createdAt",
    ]);
    expect(backup.counts(source.db)).toEqual({
      templates: 3,
      budgets: 3,
      expenses: 30,
      labels: 5,
      views: 2,
    });
  });

  it("passes its own validation", () => {
    populate(source.db);
    const exported = backup.exportAll(source.db, exportOptions);

    expect(parseBackupText(serializeBackup(exported))).toEqual(exported);
  });

  it("lists categories by template creation order, then sortOrder", () => {
    const exported = backup.exportAll(source.db, exportOptions);
    const order = exported.data.templates.flatMap((template) =>
      exported.data.templateCategories
        .filter((category) => category.templateId === template.id)
        .map((category) => category.id),
    );

    expect(exported.data.templateCategories.map((category) => category.id)).toEqual(order);
    expect(exported.data.templateCategories.map((category) => category.sortOrder)).toEqual([
      1, 2, 3, 1, 2, 3, 1, 2, 3,
    ]);
  });
});

describe("backup.exportAll: trash", () => {
  it("leaves trashed budgets, their allocations and expenses out, and writes no deletedAt", () => {
    populate(source.db);
    const before = backup.exportAll(source.db, exportOptions);
    const tripBudget = before.data.budgets.find((budget) => budget.title === "Отпуск в Алматы")!;
    const oldBudget = before.data.budgets.find((budget) => budget.title === "Old plan")!;

    budgets.trash(source.db, { budgetIds: [tripBudget.id, oldBudget.id] });
    const exported = backup.exportAll(source.db, exportOptions);

    const trashedIds = new Set([tripBudget.id, oldBudget.id]);
    expect(exported.data.budgets).toEqual(
      before.data.budgets.filter((budget) => !trashedIds.has(budget.id)),
    );
    expect(exported.data.budgetAllocations).toEqual(
      before.data.budgetAllocations.filter((allocation) => !trashedIds.has(allocation.budgetId)),
    );
    expect(exported.data.expenses).toEqual(
      before.data.expenses.filter((expense) => !trashedIds.has(expense.budgetId)),
    );
    expect(exported.data.expenses.length).toBeLessThan(before.data.expenses.length);
    expect(exported.data.templates).toEqual(before.data.templates);
    expect(exported.version).toBe(BACKUP_VERSION);
    expect(Object.keys(exported.data.budgets[0])).toEqual([
      "id",
      "title",
      "description",
      "templateId",
      "income",
      "status",
      "currency",
      "labelId",
      "viewId",
      "icon",
      "createdAt",
    ]);
  });

  it("imports with nothing in the trash: Replace wipes it, Add inserts live budgets", () => {
    const file = backup.exportAll(source.db, exportOptions);
    const [inTrash] = target.db.select().from(budgetsTable).all();
    budgets.trash(target.db, { budgetIds: [inTrash.id] });

    backup.addAll(target.db, file);
    const trashedCount = () =>
      target.db
        .select()
        .from(budgetsTable)
        .all()
        .filter((budget) => budget.deletedAt !== null).length;
    expect(trashedCount()).toBe(1);

    backup.importAll(target.db, file);
    expect(trashedCount()).toBe(0);
    expect(budgets.listTrashed(target.db, { cursor: null, numItems: 10 }).page).toEqual([]);
  });
});

describe("backup.importAll", () => {
  it("round-trips a realistic database: export → import → export is equal except exportedAt", () => {
    populate(source.db);
    const first = backup.exportAll(source.db, exportOptions);

    backup.importAll(target.db, parseBackupText(serializeBackup(first)));
    const second = backup.exportAll(target.db, { ...exportOptions, exportedAt: Date.now() });

    expect(withoutExportedAt(second)).toEqual(withoutExportedAt(first));
    expect(first.data.budgets.find((b) => b.title === "Отпуск в Алматы")).toMatchObject({
      templateId: null,
      description: null,
      icon: "flights",
    });
    expect(first.data.budgets.find((b) => b.title === "Old plan")?.status).toBe("archived");
    expect(settings.get(target.db).settings).toEqual({
      currency: "kzt",
      budgetView: "list",
      theme: "dark",
    });
  });

  it("replaces everything and returns the imported counts", () => {
    populate(target.db);

    const counts = backup.importAll(target.db, parseBackup(fixtureV1));

    expect(counts).toEqual({ templates: 2, budgets: 3, expenses: 5, labels: 2, views: 2 });
    expect(backup.counts(target.db)).toEqual(counts);
    expect(labels.list(target.db).labels.map((label) => label.name)).toEqual(["Monthly", "Trips"]);
  });

  it("imports the v1 fixture, which must keep importing forever", () => {
    backup.importAll(target.db, parseBackup(fixtureV1));
    const exported = backup.exportAll(target.db, exportOptions);

    expect(exported.data).toEqual(parseBackup(fixtureV1).data);
    expect(exported.data.budgets.map((b) => b.icon)).toEqual([null, null, null]);
  });

  it("imports the v2 fixture with its budget icons", () => {
    backup.importAll(target.db, parseBackup(fixtureV2));
    const exported = backup.exportAll(target.db, exportOptions);

    expect(exported.data).toEqual(parseBackup(fixtureV2).data);
    expect(exported.data.budgets.map((b) => b.icon)).toEqual(["home", "flights", null]);
  });

  it("indexes imported titles for the budgets search", () => {
    backup.importAll(target.db, parseBackup(fixtureV1));
    const search = (term: string) =>
      budgets
        .listActive(target.db, { search: term, cursor: null, numItems: 25 })
        .page.map((b) => b.title);

    expect(search("алматы")).toEqual(["Отпуск в Алматы"]);
    expect(search("octo")).toEqual(["October at home"]);
    expect(search("your first")).toEqual([]);
  });

  it("marks the database as seeded, so the first-run seed adds nothing", () => {
    const fresh = openDatabase(":memory:", { migrationsFolder, seed: false });
    try {
      backup.importAll(fresh.db, parseBackup(fixtureV1));

      expect(
        fresh.db.select().from(appMeta).where(eq(appMeta.key, SEEDED_AT_KEY)).get(),
      ).toBeDefined();
      expect(seedDatabase(fresh.db)).toBe(false);
      expect(backup.counts(fresh.db)).toEqual({
        templates: 2,
        budgets: 3,
        expenses: 5,
        labels: 2,
        views: 2,
      });
    } finally {
      fresh.close();
    }
  });

  it("upserts the settings row", () => {
    target.db.delete(userSettings).run();

    backup.importAll(target.db, parseBackup(fixtureV1));

    expect(target.db.select().from(userSettings).all()).toEqual([
      { id: 1, currency: "kzt", budgetView: "list", language: null, darkMode: true },
    ]);
  });

  it("stores money rounded to cents", () => {
    const raw = structuredClone(fixtureV1);
    raw.data.budgets[0].income = 5000.004;
    raw.data.expenses[0].amount = 600.125;

    backup.importAll(target.db, parseBackup(raw));

    const [budget] = target.db
      .select()
      .from(budgetsTable)
      .where(eq(budgetsTable.id, asId<"budgets">(raw.data.budgets[0].id)))
      .all();
    expect(budget.income).toBe(5000);
    expect(
      backup.exportAll(target.db, exportOptions).data.expenses.find((e) => e.title === "Rent")
        ?.amount,
    ).toBe(600.13);
  });

  it("writes nothing when an insert fails halfway", () => {
    const before = backup.exportAll(target.db, exportOptions);
    const valid = parseBackup(fixtureV1);
    // Skips parseBackup's integrity check, so the foreign keys catch it mid-transaction.
    const broken: Backup = {
      ...valid,
      data: {
        ...valid.data,
        expenses: [
          ...valid.data.expenses,
          { ...valid.data.expenses[0], id: asId("dangling"), allocationId: asId("missing") },
        ],
      },
    };

    expect(() => backup.importAll(target.db, broken)).toThrow();
    expect(backup.exportAll(target.db, exportOptions)).toEqual(before);
  });
});

/** A budget's fields, allocations and expenses, without ids. */
function budgetContents(data: BackupData, budgetId: string) {
  const {
    id: _,
    templateId: _t,
    labelId: _l,
    viewId: _v,
    ...fields
  } = data.budgets.find((budget) => budget.id === budgetId)!;
  return {
    ...fields,
    allocations: data.budgetAllocations
      .filter((allocation) => allocation.budgetId === budgetId)
      .map(({ id, budgetId: _b, ...allocation }) => ({
        ...allocation,
        expenses: data.expenses
          .filter((expense) => expense.allocationId === id)
          .map(({ id: _e, budgetId: _eb, allocationId: _a, ...expense }) => expense),
      })),
  };
}

describe("backup.addAll", () => {
  /** The budgets `addAll` added: those in `after` but not in `before`, in creation order. */
  function addedBudgets(before: Backup, after: Backup) {
    const kept = new Set(before.data.budgets.map((budget) => budget.id));
    return after.data.budgets.filter((budget) => !kept.has(budget.id));
  }

  it("keeps the current data and adds the backup's budgets under new ids", () => {
    populate(target.db);
    const before = backup.exportAll(target.db, exportOptions);
    const file = parseBackup(fixtureV2);

    backup.addAll(target.db, file);

    const after = backup.exportAll(target.db, exportOptions);
    expect(after.data.budgets).toEqual(expect.arrayContaining(before.data.budgets));
    expect(after.data.budgetAllocations).toEqual(
      expect.arrayContaining(before.data.budgetAllocations),
    );
    expect(after.data.expenses).toEqual(expect.arrayContaining(before.data.expenses));
    expect(after.data.budgetLabels).toEqual(expect.arrayContaining(before.data.budgetLabels));
    expect(after.data.userSettings).toEqual(before.data.userSettings);
    const added = addedBudgets(before, after);
    expect(added.map((budget) => budget.title)).toEqual(
      file.data.budgets.map((budget) => budget.title),
    );
    added.forEach((budget, index) => {
      const original = file.data.budgets[index];
      expect(budget.id).not.toBe(original.id);
      expect(budgetContents(after.data, budget.id)).toEqual(budgetContents(file.data, original.id));
    });
    expect(after.data.expenses.map((expense) => expense.id)).not.toEqual(
      expect.arrayContaining(file.data.expenses.map((expense) => expense.id)),
    );
  });

  it("adds the same file again as a second copy", () => {
    const file = parseBackup(fixtureV2);
    const before = backup.counts(target.db);

    backup.addAll(target.db, file);
    backup.addAll(target.db, file);

    const after = backup.counts(target.db);
    expect(after.budgets).toBe(before.budgets + 6);
    expect(after.expenses).toBe(before.expenses + 10);
  });

  it("reuses the built-in template, label and view it matches, adds the rest and counts what it added", () => {
    // As the web app exports it: its built-in 50/30/20 has another name and id.
    const raw = structuredClone(fixtureV2);
    raw.data.templates[0].name = "Balanced budget";
    const builtIn = templates.list(target.db).templates.find((t) => t.name === "50/30/20")!;
    const monthly = labels.list(target.db).labels.find((label) => label.name === "Monthly")!;
    const homeId = views.create(target.db, { title: "Home" });
    const before = backup.exportAll(target.db, exportOptions);

    const counts = backup.addAll(target.db, parseBackup(raw));

    expect(counts).toEqual({ templates: 1, budgets: 3, expenses: 5, labels: 1, views: 1 });
    const after = backup.exportAll(target.db, exportOptions);
    const [october, almaty, oldPlan] = addedBudgets(before, after);
    expect(october).toMatchObject({ templateId: builtIn.id, labelId: monthly.id, viewId: homeId });
    expect(almaty).toMatchObject({
      templateId: raw.data.templates[1].id,
      labelId: raw.data.budgetLabels[1].id,
      viewId: null,
    });
    expect(oldPlan).toMatchObject({
      templateId: null,
      labelId: null,
      viewId: raw.data.budgetViews[1].id,
    });
    expect(templates.get(target.db, { templateId: asId(raw.data.templates[1].id) })).toMatchObject({
      template: {
        name: "Travel split",
        isDefault: false,
        categories: [
          { name: "Tickets", percentage: 33.4 },
          { name: "Stay", percentage: 66.6 },
        ],
      },
    });
    expect(labels.list(target.db).labels).toContainEqual(
      expect.objectContaining({ id: raw.data.budgetLabels[1].id, name: "Trips" }),
    );
    expect(views.get(target.db, { viewId: asId(raw.data.budgetViews[1].id) }).view).toMatchObject({
      title: "Someday",
      isFavorite: false,
    });
  });

  it("adds a built-in template with no matching categories as a user template", () => {
    const raw = structuredClone(fixtureV2);
    raw.data.templateCategories[0].name = "Must-haves";

    backup.addAll(target.db, parseBackup(raw));

    expect(templates.get(target.db, { templateId: asId(raw.data.templates[0].id) })).toMatchObject({
      template: {
        name: "50/30/20",
        isDefault: false,
        categories: [{ name: "Must-haves" }, { name: "Wants" }, { name: "Savings" }],
      },
    });
  });

  it("adds only the templates, labels and views its budgets use", () => {
    const raw = structuredClone(fixtureV2);
    const oldPlan = raw.data.budgets[2];
    raw.data.budgets = [oldPlan];
    raw.data.budgetAllocations = raw.data.budgetAllocations.filter(
      (a) => a.budgetId === oldPlan.id,
    );
    raw.data.expenses = raw.data.expenses.filter((e) => e.budgetId === oldPlan.id);

    const counts = backup.addAll(target.db, parseBackup(raw));

    expect(counts).toMatchObject({ templates: 0, labels: 0, views: 1 });
    expect(templates.list(target.db).templates.map((t) => t.name)).not.toContain("Travel split");
    expect(labels.list(target.db).labels.map((label) => label.name)).not.toContain("Trips");
  });

  it("adds a favorite view as a favorite only while there is room", () => {
    const favorites = views.listFavorites(target.db).views.length;
    for (let n = favorites; n < MAX_FAVORITE_BUDGET_VIEWS; n++) {
      views.toggleFavorite(target.db, { viewId: views.create(target.db, { title: `Full ${n}` }) });
    }

    backup.addAll(target.db, parseBackup(fixtureV2));

    expect(
      views.get(target.db, { viewId: asId(fixtureV2.data.budgetViews[0].id) }).view,
    ).toMatchObject({
      title: "Home",
      isFavorite: false,
    });
  });

  it("indexes added titles for the budgets search", () => {
    backup.addAll(target.db, parseBackup(fixtureV2));

    expect(
      budgets
        .listActive(target.db, { search: "алматы", cursor: null, numItems: 25 })
        .page.map((b) => b.title),
    ).toEqual(["Отпуск в Алматы"]);
  });

  it("writes nothing when an insert fails halfway", () => {
    const before = backup.exportAll(target.db, exportOptions);
    const valid = parseBackup(fixtureV2);
    const broken: Backup = {
      ...valid,
      data: {
        ...valid.data,
        expenses: [
          ...valid.data.expenses,
          { ...valid.data.expenses[0], allocationId: asId("missing") },
        ],
      },
    };

    expect(() => backup.addAll(target.db, broken)).toThrow();
    expect(backup.exportAll(target.db, exportOptions)).toEqual(before);
  });
});
