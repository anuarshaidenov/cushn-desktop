import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import {
  asId,
  type Budget,
  type BudgetAllocation,
  type BudgetLabel,
  type BudgetView,
  type Expense,
  type Id,
  type Template,
  type TemplateCategory,
  type UserSettings,
} from "@shared/domain";
import { type DatabaseHandle, openDatabase } from "./index";
import {
  appMeta,
  type BudgetAllocationRow,
  type BudgetLabelRow,
  type BudgetRow,
  type BudgetViewRow,
  type ExpenseRow,
  type TemplateCategoryRow,
  type TemplateRow,
  type UserSettingsRow,
  budgetAllocations,
  budgetLabels,
  budgetViews,
  budgets,
  expenses,
  templateCategories,
  templates,
  userSettings,
} from "./schema";
import { roundMoney, sumsTo100 } from "@shared/money";
import { getLatest } from "../repositories/budgets";
import { expectSearchIndexInSync } from "../repositories/budgets.fixtures";
import * as home from "../repositories/home";
import { listFavorites } from "../repositories/views";
import { budgetTitleFtsQuery, budgetTitleMatches } from "./search";
import { SEEDED_AT_KEY, seedDatabase } from "./seed";

const migrationsFolder = resolve(import.meta.dirname, "../../../drizzle");

// Expected built-ins, copied verbatim from the web app's seeds rather than
// imported from `seed.ts`, so a drift in either shows up here.
const EXPECTED_TEMPLATES = [
  {
    name: "50/30/20",
    description: "A classic budgeting rule: 50% Needs, 30% Wants, 20% Savings.",
    categories: [
      ["Needs", 50, "Essential expenses like rent, groceries, utilities, and transportation", true],
      ["Wants", 30, "Discretionary spending on entertainment, dining out, and hobbies", true],
      ["Savings", 20, "Emergency fund, retirement savings, and financial goals", false],
    ],
  },
  {
    name: "75/10/15",
    description: "A disciplined budgeting method: 75% Expenses, 10% Savings, 15% Investments.",
    categories: [
      ["Expenses", 75, "All monthly expenses including fixed and variable costs", true],
      ["Savings", 10, "Short-term savings and emergency fund contributions", false],
      [
        "Investments",
        15,
        "Long-term wealth building through stocks, bonds, and other investments",
        false,
      ],
    ],
  },
] as const;

const EXPECTED_LABELS = [
  { name: "Daily", color: "#06B6D4" },
  { name: "Weekly", color: "#EF4444" },
  { name: "Monthly", color: "#F97316" },
  { name: "Yearly", color: "#10B981" },
  { name: "One-time", color: "#8B5CF6" },
];

let handle: DatabaseHandle;

beforeEach(() => {
  handle = openDatabase(":memory:", { migrationsFolder });
});

afterEach(() => {
  handle.close();
});

function count(table: SQLiteTable) {
  return handle.db
    .select({ n: sql<number>`count(*)` })
    .from(table)
    .get()!.n;
}

describe("migrations", () => {
  it("creates every table, the FTS index and its triggers", () => {
    const names = handle.sqlite
      .prepare("select name from sqlite_master where type in ('table', 'trigger') order by name")
      .pluck()
      .all();
    expect(names).toEqual(
      expect.arrayContaining([
        "app_meta",
        "budget_allocations",
        "budget_labels",
        "budget_views",
        "budgets",
        "budgets_fts",
        "budgets_fts_after_delete",
        "budgets_fts_after_insert",
        "budgets_fts_after_update",
        "budgets_fts_rowids",
        "expenses",
        "template_categories",
        "templates",
        "user_settings",
      ]),
    );
  });

  it("turns foreign keys on and is a no-op when re-run", () => {
    expect(handle.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    const applied = handle.sqlite
      .prepare("select count(*) from __drizzle_migrations")
      .pluck()
      .get();
    expect(applied).toBeGreaterThanOrEqual(2);
  });
});

describe("seed", () => {
  // A fixed first open, in local time, so titles and backdated dates are stable.
  const NOW = new Date(2026, 9, 24, 12).getTime();

  beforeEach(() => {
    handle.close();
    handle = openDatabase(":memory:", { migrationsFolder, seed: false });
    expect(seedDatabase(handle.db, NOW)).toBe(true);
  });

  it("inserts the web app's default templates with their categories, then the sample template", () => {
    const rows = handle.db.select().from(templates).orderBy(asc(templates.createdAt)).all();
    expect(
      rows.map(({ name, description, isDefault }) => ({ name, description, isDefault })),
    ).toEqual([
      ...EXPECTED_TEMPLATES.map(({ name, description }) => ({
        name,
        description,
        isDefault: true,
      })),
      { name: "Travel", description: expect.any(String), isDefault: false },
    ]);

    const categoriesOf = (templateId: Id<"templates">) =>
      handle.db
        .select()
        .from(templateCategories)
        .where(eq(templateCategories.templateId, templateId))
        .orderBy(asc(templateCategories.sortOrder))
        .all();
    for (const [i, expected] of EXPECTED_TEMPLATES.entries()) {
      expect(
        categoriesOf(rows[i].id).map((c) => [
          c.name,
          c.percentage,
          c.description,
          c.editable,
          c.sortOrder,
        ]),
      ).toEqual(expected.categories.map((c, j) => [...c, j + 1]));
    }

    const sample = categoriesOf(rows[2].id);
    expect(sumsTo100(sample.map((c) => c.percentage))).toBe(true);
    expect(sample.map((c) => c.sortOrder)).toEqual([1, 2, 3]);
    expect(count(templateCategories)).toBe(9);
  });

  it("inserts the web app's default labels", () => {
    const rows = handle.db.select().from(budgetLabels).orderBy(asc(budgetLabels.createdAt)).all();
    expect(rows.map(({ name, color }) => ({ name, color }))).toEqual(EXPECTED_LABELS);
  });

  it("creates sample budgets with a label, an icon and a favorite View each, this month's newest", () => {
    const rows = handle.db
      .select({
        title: budgets.title,
        income: budgets.income,
        currency: budgets.currency,
        status: budgets.status,
        template: templates.name,
        label: budgetLabels.name,
        view: budgetViews.title,
        icon: budgets.icon,
        createdAt: budgets.createdAt,
      })
      .from(budgets)
      .innerJoin(templates, eq(templates.id, budgets.templateId))
      .innerJoin(budgetLabels, eq(budgetLabels.id, budgets.labelId))
      .innerJoin(budgetViews, eq(budgetViews.id, budgets.viewId))
      .orderBy(asc(budgets.createdAt))
      .all();
    expect(rows.map(({ createdAt: _, ...b }) => b)).toEqual([
      {
        title: "Lisbon trip",
        income: 2000,
        currency: "eur",
        status: "active",
        template: "Travel",
        label: "One-time",
        view: "Personal",
        icon: "luggage",
      },
      {
        title: "Freelance income",
        income: 2400,
        currency: "usd",
        status: "active",
        template: "75/10/15",
        label: "Monthly",
        view: "Work",
        icon: "work",
      },
      {
        title: "October budget",
        income: 5000,
        currency: "usd",
        status: "active",
        template: "50/30/20",
        label: "Monthly",
        view: "Personal",
        icon: "calendar",
      },
    ]);
    expect(rows.every((b) => b.createdAt < NOW)).toBe(true);
    expect(getLatest(handle.db).latestBudget).toMatchObject({
      title: "October budget",
      currency: "usd",
    });
    expect(listFavorites(handle.db).views.map((v) => v.title)).toEqual(["Personal", "Work"]);
  });

  it("copies template categories into allocations and files expenses only under editable ones", () => {
    const allocations = handle.db
      .select({
        budgetId: budgetAllocations.budgetId,
        templateId: budgets.templateId,
        income: budgets.income,
        categoryName: budgetAllocations.categoryName,
        percentage: budgetAllocations.percentage,
        amount: budgetAllocations.amount,
        sortOrder: budgetAllocations.sortOrder,
      })
      .from(budgetAllocations)
      .innerJoin(budgets, eq(budgets.id, budgetAllocations.budgetId))
      .all();
    for (const a of allocations) {
      expect(a.amount).toBe(roundMoney((a.income * a.percentage) / 100));
      const category = handle.db
        .select()
        .from(templateCategories)
        .where(
          and(
            eq(templateCategories.templateId, a.templateId!),
            eq(templateCategories.name, a.categoryName),
          ),
        )
        .get();
      expect(category).toMatchObject({ percentage: a.percentage, sortOrder: a.sortOrder });
    }

    const rows = handle.db
      .select({
        budgetId: expenses.budgetId,
        allocationBudgetId: budgetAllocations.budgetId,
        allocationId: expenses.allocationId,
        editable: budgetAllocations.editable,
        order: expenses.order,
        createdAt: expenses.createdAt,
        budgetCreatedAt: budgets.createdAt,
      })
      .from(expenses)
      .innerJoin(budgetAllocations, eq(budgetAllocations.id, expenses.allocationId))
      .innerJoin(budgets, eq(budgets.id, expenses.budgetId))
      .orderBy(asc(expenses.allocationId), asc(expenses.order))
      .all();
    expect(rows.length).toBeGreaterThan(0);
    for (const e of rows) {
      expect(e.allocationBudgetId).toBe(e.budgetId);
      expect(e.editable).toBe(true);
      expect(e.createdAt).toBeGreaterThanOrEqual(e.budgetCreatedAt);
    }
    const ordersByAllocation = new Map<string, number[]>();
    for (const e of rows) {
      ordersByAllocation.set(e.allocationId, [
        ...(ordersByAllocation.get(e.allocationId) ?? []),
        e.order,
      ]);
    }
    for (const orders of ordersByAllocation.values()) {
      expect(orders).toEqual(orders.map((_, i) => i));
    }
  });

  it("fills every Home section on first open", () => {
    const { main, others, overspent } = home.summary(handle.db);

    expect(main?.title).toBe("October budget");
    expect(main?.spent).toBeLessThan(main!.income);
    expect(main?.biggestExpenses).toHaveLength(5);
    expect(others.map((b) => b.title)).toEqual(["Lisbon trip", "Freelance income"]);
    expect(others.map((b) => b.lastActivityAt).every((at) => at < NOW)).toBe(true);
    expect(overspent).toEqual([
      expect.objectContaining({
        categoryName: "Food & fun",
        budgetTitle: "Lisbon trip",
        currency: "eur",
      }),
    ]);
  });

  it("creates the settings row with defaults and records the seed flag", () => {
    expect(handle.db.select().from(userSettings).all()).toEqual([
      { id: 1, currency: "usd", budgetView: "grid", language: null, darkMode: null },
    ]);
    expect(
      handle.db.select().from(appMeta).where(eq(appMeta.key, SEEDED_AT_KEY)).get(),
    ).toBeDefined();
  });

  it("is idempotent, and does not re-seed after the user deletes everything", () => {
    expect(seedDatabase(handle.db)).toBe(false);
    expect(count(templates)).toBe(3);
    expect(count(budgetLabels)).toBe(5);
    expect(count(budgetViews)).toBe(2);
    expect(count(budgets)).toBe(3);

    handle.db.delete(budgets).run();
    handle.db.delete(templates).run();
    handle.db.delete(budgetLabels).run();
    handle.db.delete(budgetViews).run();
    expect(seedDatabase(handle.db)).toBe(false);
    expect(count(templates) + count(budgetLabels) + count(budgetViews) + count(budgets)).toBe(0);
  });

  it("only seeds once across reopening a file database", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "cushn-db-test-"));
    try {
      const file = resolve(dir, "cushn.db");
      const first = openDatabase(file, { migrationsFolder });
      expect(first.sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
      first.close();
      const second = openDatabase(file, { migrationsFolder });
      expect(
        second.db
          .select({ n: sql<number>`count(*)` })
          .from(templates)
          .get()!.n,
      ).toBe(3);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("foreign keys", () => {
  it("deleting a budget cascades to its allocations and expenses", () => {
    const [budget] = handle.db.select().from(budgets).limit(1).all();
    const budgetsBefore = count(budgets);
    const ownExpenses = handle.db
      .select()
      .from(expenses)
      .where(eq(expenses.budgetId, budget.id))
      .all();
    const otherExpenses = count(expenses) - ownExpenses.length;
    handle.db.delete(budgets).where(eq(budgets.id, budget.id)).run();

    expect(
      handle.db
        .select()
        .from(budgetAllocations)
        .where(eq(budgetAllocations.budgetId, budget.id))
        .all(),
    ).toEqual([]);
    expect(handle.db.select().from(expenses).where(eq(expenses.budgetId, budget.id)).all()).toEqual(
      [],
    );
    expect(count(budgets)).toBe(budgetsBefore - 1);
    expect(count(expenses)).toBe(otherExpenses);
  });

  it("deleting a template cascades to its categories and unlinks its budgets", () => {
    const template = handle.db
      .select()
      .from(templates)
      .where(eq(templates.name, "50/30/20"))
      .get()!;
    const linked = handle.db
      .select()
      .from(budgets)
      .where(eq(budgets.templateId, template.id))
      .all();
    expect(linked).not.toHaveLength(0);
    handle.db.delete(templates).where(eq(templates.id, template.id)).run();

    expect(
      handle.db
        .select()
        .from(templateCategories)
        .where(eq(templateCategories.templateId, template.id))
        .all(),
    ).toEqual([]);
    for (const { id } of linked) {
      expect(
        handle.db.select().from(budgets).where(eq(budgets.id, id)).get()?.templateId,
      ).toBeNull();
    }
  });

  it("deleting a view or label unlinks budgets instead of deleting them", () => {
    const view = handle.db.insert(budgetViews).values({ title: "Home" }).returning().get();
    const [label] = handle.db.select().from(budgetLabels).limit(1).all();
    handle.db.update(budgets).set({ viewId: view.id, labelId: label.id }).run();
    const budgetsBefore = count(budgets);

    handle.db.delete(budgetViews).where(eq(budgetViews.id, view.id)).run();
    handle.db.delete(budgetLabels).where(eq(budgetLabels.id, label.id)).run();

    const rows = handle.db.select().from(budgets).all();
    expect(rows).toHaveLength(budgetsBefore);
    expect(rows.every((b) => b.viewId === null && b.labelId === null)).toBe(true);
  });

  it("rejects an expense pointing at a missing allocation", () => {
    const [budget] = handle.db.select().from(budgets).limit(1).all();
    expect(() =>
      handle.db
        .insert(expenses)
        .values({
          budgetId: budget.id,
          allocationId: asId<"budgetAllocations">("missing"),
          amount: 1,
          title: "x",
          order: 0,
        })
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });
});

describe("budget title search (FTS5)", () => {
  beforeEach(() => {
    handle.db.delete(budgets).run();
    handle.db
      .insert(budgets)
      .values([
        { title: "Your first 50/30/20", currency: "usd" },
        { title: "Your first 75/10/15", currency: "usd" },
      ])
      .run();
  });

  function search(input: string, status: "active" | "archived" = "active") {
    return handle.db
      .select({ title: budgets.title })
      .from(budgets)
      .where(and(eq(budgets.status, status), budgetTitleMatches(input)))
      .orderBy(asc(budgets.createdAt))
      .all()
      .map((b) => b.title);
  }

  it("finds a budget by a partial word, case-insensitively", () => {
    handle.db.insert(budgets).values({ title: "Groceries October", currency: "kzt" }).run();
    expect(search("groc")).toEqual(["Groceries October"]);
    expect(search("OCT")).toEqual(["Groceries October"]);
    expect(search("fir 75")).toEqual(["Your first 75/10/15"]);
    expect(search("first")).toHaveLength(2);
    expect(search("rent")).toEqual([]);
  });

  it("handles Cyrillic and diacritics", () => {
    handle.db.insert(budgets).values({ title: "Бюджет на Қазан", currency: "kzt" }).run();
    handle.db.insert(budgets).values({ title: "Café trip", currency: "eur" }).run();
    expect(search("бюдж")).toEqual(["Бюджет на Қазан"]);
    expect(search("cafe")).toEqual(["Café trip"]);
  });

  it("stays in sync on rename and delete, and filters by status", () => {
    const budget = handle.db
      .insert(budgets)
      .values({ title: "Vacation", currency: "usd" })
      .returning()
      .get();
    handle.db.update(budgets).set({ title: "Holiday fund" }).where(eq(budgets.id, budget.id)).run();
    expect(search("vac")).toEqual([]);
    expect(search("holi")).toEqual(["Holiday fund"]);

    handle.db.update(budgets).set({ status: "archived" }).where(eq(budgets.id, budget.id)).run();
    expect(search("holi")).toEqual([]);
    expect(search("holi", "archived")).toEqual(["Holiday fund"]);

    handle.db.delete(budgets).where(eq(budgets.id, budget.id)).run();
    expect(handle.sqlite.prepare("select count(*) from budgets_fts").pluck().get()).toBe(2);
    expectSearchIndexInSync(handle.sqlite);
  });

  it("keeps one index row per budget across inserts, renames and bulk deletes", () => {
    const titles = Array.from({ length: 50 }, (_, i) => `Bulk ${i}`);
    const rows = handle.db
      .insert(budgets)
      .values(titles.map((title) => ({ title, currency: "usd" })))
      .returning()
      .all();
    expectSearchIndexInSync(handle.sqlite);

    handle.db
      .update(budgets)
      .set({ title: sql`'Renamed ' || ${budgets.title}` })
      .where(inArray(budgets.id, rows.slice(0, 10).map((b) => b.id)))
      .run();
    expectSearchIndexInSync(handle.sqlite);
    expect(search("renamed")).toHaveLength(10);

    handle.db.delete(budgets).where(inArray(budgets.id, rows.slice(5, 40).map((b) => b.id))).run();
    expectSearchIndexInSync(handle.sqlite);
    expect(search("renamed")).toHaveLength(5);
    expect(search("bulk")).toHaveLength(15);

    // A freed index rowid is reused by the next budget without touching the others.
    handle.db.insert(budgets).values({ title: "Bulk again", currency: "usd" }).run();
    expectSearchIndexInSync(handle.sqlite);
    expect(search("again")).toEqual(["Bulk again"]);

    handle.db.delete(budgets).run();
    expectSearchIndexInSync(handle.sqlite);
  });

  it("stays in sync after VACUUM renumbers the budgets' rowids", () => {
    const [first] = handle.db.select().from(budgets).orderBy(asc(budgets.createdAt)).all();
    handle.db.delete(budgets).where(eq(budgets.id, first.id)).run();
    handle.db.insert(budgets).values({ title: "After the gap", currency: "usd" }).run();
    handle.sqlite.exec("VACUUM");

    for (const budget of handle.db.select().from(budgets).all()) {
      handle.db
        .update(budgets)
        .set({ title: `${budget.title} v2` })
        .where(eq(budgets.id, budget.id))
        .run();
    }
    expectSearchIndexInSync(handle.sqlite);
    expect(search("gap v2")).toEqual(["After the gap v2"]);
    handle.db.delete(budgets).where(eq(budgets.title, "After the gap v2")).run();
    expectSearchIndexInSync(handle.sqlite);
  });

  it("treats FTS syntax in user input as plain text", () => {
    expect(budgetTitleFtsQuery("  ")).toBeNull();
    expect(budgetTitleMatches("")).toBeUndefined();
    expect(budgetTitleFtsQuery('say "hi"')).toBe('"say"* """hi"""*');
    for (const input of ['"', "-", "OR", "a:b", "(x", "*", "50/30"]) {
      expect(() => search(input)).not.toThrow();
    }
    expect(search("50/30")).toEqual(["Your first 50/30/20"]);
  });
});

describe("the budgets_fts_rowids migration", () => {
  it("rebuilds the search index of an existing database from its budgets", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "cushn-fts-migration-test-"));
    try {
      const previous = resolve(dir, "drizzle");
      cpSync(migrationsFolder, previous, { recursive: true });
      const journalPath = resolve(previous, "meta/_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
        entries: { tag: string }[];
      };
      const index = journal.entries.findIndex((entry) => entry.tag.endsWith("_budgets_fts_rowids"));
      expect(index).toBeGreaterThan(0);
      journal.entries = journal.entries.slice(0, index);
      writeFileSync(journalPath, JSON.stringify(journal));

      const file = resolve(dir, "cushn.db");
      const before = openDatabase(file, { migrationsFolder: previous });
      const [renamed, removed] = before.db.select().from(budgets).orderBy(asc(budgets.id)).all();
      before.db
        .update(budgets)
        .set({ title: "Café renamed" })
        .where(eq(budgets.id, renamed.id))
        .run();
      before.db.delete(budgets).where(eq(budgets.id, removed.id)).run();
      before.db.insert(budgets).values({ title: "Added before the update", currency: "usd" }).run();
      before.close();

      const after = openDatabase(file, { migrationsFolder });
      try {
        expectSearchIndexInSync(after.sqlite);
        const titles = (input: string) =>
          after.db
            .select({ title: budgets.title })
            .from(budgets)
            .where(budgetTitleMatches(input))
            .all()
            .map((b) => b.title);
        expect(titles("cafe ren")).toEqual(["Café renamed"]);
        expect(titles("added")).toEqual(["Added before the update"]);

        after.db.delete(budgets).where(eq(budgets.id, renamed.id)).run();
        after.db.insert(budgets).values({ title: "Added after", currency: "usd" }).run();
        expectSearchIndexInSync(after.sqlite);
      } finally {
        after.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("domain types", () => {
  it("match the Drizzle rows", () => {
    expectTypeOf<TemplateRow>().toEqualTypeOf<Template>();
    expectTypeOf<TemplateCategoryRow>().toEqualTypeOf<TemplateCategory>();
    expectTypeOf<BudgetRow>().toEqualTypeOf<Budget>();
    expectTypeOf<BudgetViewRow>().toEqualTypeOf<BudgetView>();
    expectTypeOf<BudgetAllocationRow>().toEqualTypeOf<BudgetAllocation>();
    expectTypeOf<ExpenseRow>().toEqualTypeOf<Expense>();
    expectTypeOf<BudgetLabelRow>().toEqualTypeOf<BudgetLabel>();
    expectTypeOf<Omit<UserSettingsRow, "id">>().toEqualTypeOf<UserSettings>();
  });

  it("brand ids per table, so ids of different tables do not mix", () => {
    expectTypeOf<BudgetRow["labelId"]>().toEqualTypeOf<Id<"budgetLabels"> | null>();
    expectTypeOf<Id<"budgets">>().toExtend<string>();
    expectTypeOf<string>().not.toExtend<Id<"budgets">>();
    expectTypeOf<Id<"budgetLabels">>().not.toExtend<Id<"budgets">>();
  });
});
