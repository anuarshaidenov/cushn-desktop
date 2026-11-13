/**
 * Test fixtures for the budgets repository tests: rows inserted straight
 * through Drizzle, so the tests depend on no other repository.
 */
import { resolve } from "node:path";
import type Database from "better-sqlite3";
import { expect } from "vitest";
import { type DatabaseHandle, openDatabase } from "../db";
import {
  type NewBudgetAllocationRow,
  type NewBudgetRow,
  type NewExpenseRow,
  budgetAllocations,
  budgetLabels,
  budgetViews,
  budgets,
  expenses,
  templateCategories,
  templates,
} from "../db/schema";

const migrationsFolder = resolve(import.meta.dirname, "../../../drizzle");

/** A migrated, empty in-memory database (no first-run seed). */
export function openTestDatabase(): DatabaseHandle {
  return openDatabase(":memory:", { migrationsFolder, seed: false });
}

type Db = DatabaseHandle["db"];

export interface CategoryFixture {
  name: string;
  percentage: number;
  description?: string | null;
  editable?: boolean;
  sortOrder: number;
}

export function insertTemplate(
  db: Db,
  { name = "50/30/20", categories = [] as CategoryFixture[], createdAt = 1 } = {},
) {
  const template = db
    .insert(templates)
    .values({ name, description: `${name} template`, createdAt })
    .returning()
    .get();
  const categoryIds = categories.map(
    (category) =>
      db
        .insert(templateCategories)
        .values({
          templateId: template.id,
          name: category.name,
          percentage: category.percentage,
          description: category.description ?? null,
          editable: category.editable ?? true,
          sortOrder: category.sortOrder,
        })
        .returning()
        .get().id,
  );
  return { template, categoryIds };
}

export function insertLabel(db: Db, name = "Monthly", color = "#F97316", createdAt = 1) {
  return db.insert(budgetLabels).values({ name, color, createdAt }).returning().get();
}

export function insertView(db: Db, title = "Home", createdAt = 1) {
  return db.insert(budgetViews).values({ title, createdAt }).returning().get();
}

export function insertBudget(db: Db, values: Partial<NewBudgetRow> & { createdAt: number }) {
  return db
    .insert(budgets)
    .values({ title: `Budget ${values.createdAt}`, currency: "usd", ...values })
    .returning()
    .get();
}

export function insertAllocation(
  db: Db,
  values: Omit<NewBudgetAllocationRow, "editable" | "categoryName"> &
    Partial<Pick<NewBudgetAllocationRow, "editable" | "categoryName">>,
) {
  return db
    .insert(budgetAllocations)
    .values({ categoryName: "Needs", editable: true, ...values })
    .returning()
    .get();
}

export function insertExpense(db: Db, values: NewExpenseRow) {
  return db.insert(expenses).values(values).returning().get();
}

/**
 * The search index holds one row per budget under its current title, reached
 * through `budgets_fts_rowids` the way the triggers reach it.
 */
export function expectSearchIndexInSync(sqlite: Database.Database): void {
  const rows = (query: string) => sqlite.prepare(query).raw().all();
  const expected = rows("select id, title from budgets order by id");
  expect(
    rows(
      `select k.budget_id, f.title from budgets_fts_rowids k
       join budgets_fts f on f.rowid = k.fts_rowid and f.budget_id = k.budget_id
       order by k.budget_id`,
    ),
  ).toEqual(expected);
  expect(sqlite.prepare("select count(*) from budgets_fts").pluck().get()).toBe(expected.length);
  expect(sqlite.prepare("select count(*) from budgets_fts_rowids").pluck().get()).toBe(
    expected.length,
  );
}
