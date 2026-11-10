/**
 * Backup: every table as one `Backup` (export), and replace-all or add-to-data
 * from one (import). Format in `@shared/backup`.
 *
 * - Export reads in one transaction, every table in creation order, so the
 *   same data always exports to the same file (apart from `exportedAt`).
 *   Trashed budgets, their allocations and expenses stay out of it.
 * - Both imports trust their input: `parseBackup` has validated it, and each
 *   writes in one transaction, children after parents. Inserting budgets fires
 *   the FTS triggers, so search sees imported titles.
 * - Replace deletes every row, inserts the backup's and marks the database as
 *   seeded so the first-run seed never runs over it.
 * - Add keeps every row and inserts the backup's budgets under new ids, so
 *   the same file can be added twice. The templates, labels and views they use
 *   are matched to rows already here, else inserted. Settings stay as they are.
 */
import { randomUUID } from "node:crypto";
import { and, asc, count, eq, getTableColumns, isNull } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { BackupCounts } from "@shared/api";
import {
  BACKUP_APP_NAME,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type Backup,
  type BackupData,
  backupCounts,
} from "@shared/backup";
import { MAX_FAVORITE_BUDGET_VIEWS } from "@shared/constants";
import { type Id, type TableName, asId } from "@shared/domain";
import { CushnError } from "@shared/errors";
import type { AppDatabase } from "../db";
import {
  appMeta,
  budgetAllocations,
  budgetLabels,
  budgetViews,
  budgets,
  expenses,
  templateCategories,
  templates,
  userSettings,
} from "../db/schema";
import { SEEDED_AT_KEY } from "../db/seed";

type Transaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

const SETTINGS_ROW_ID = 1;
// Stays well under SQLite's bound-parameter limit per INSERT.
const INSERT_CHUNK = 500;

export interface ExportOptions {
  exportedAt: number;
  appVersion: string;
}

export function exportAll(db: AppDatabase, { exportedAt, appVersion }: ExportOptions): Backup {
  return db.transaction((tx) => {
    const settings = tx
      .select({
        currency: userSettings.currency,
        budgetView: userSettings.budgetView,
        language: userSettings.language,
        darkMode: userSettings.darkMode,
      })
      .from(userSettings)
      .where(eq(userSettings.id, SETTINGS_ROW_ID))
      .get();
    if (!settings) throw new CushnError("INTERNAL", "Settings are missing");

    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt,
      app: { name: BACKUP_APP_NAME, version: appVersion },
      data: {
        templates: tx
          .select()
          .from(templates)
          .orderBy(asc(templates.createdAt), asc(templates.id))
          .all(),
        templateCategories: tx
          .select({
            id: templateCategories.id,
            templateId: templateCategories.templateId,
            name: templateCategories.name,
            percentage: templateCategories.percentage,
            sortOrder: templateCategories.sortOrder,
            description: templateCategories.description,
            editable: templateCategories.editable,
          })
          .from(templateCategories)
          .innerJoin(templates, eq(templateCategories.templateId, templates.id))
          .orderBy(
            asc(templates.createdAt),
            asc(templates.id),
            asc(templateCategories.sortOrder),
            asc(templateCategories.id),
          )
          .all(),
        budgetLabels: tx
          .select()
          .from(budgetLabels)
          .orderBy(asc(budgetLabels.createdAt), asc(budgetLabels.id))
          .all(),
        budgetViews: tx
          .select()
          .from(budgetViews)
          .orderBy(asc(budgetViews.createdAt), asc(budgetViews.id))
          .all(),
        // Columns named one by one: `deleted_at` is not part of the format.
        budgets: tx
          .select({
            id: budgets.id,
            title: budgets.title,
            description: budgets.description,
            templateId: budgets.templateId,
            income: budgets.income,
            status: budgets.status,
            currency: budgets.currency,
            labelId: budgets.labelId,
            viewId: budgets.viewId,
            icon: budgets.icon,
            createdAt: budgets.createdAt,
          })
          .from(budgets)
          .where(isNull(budgets.deletedAt))
          .orderBy(asc(budgets.createdAt), asc(budgets.id))
          .all(),
        budgetAllocations: tx
          .select(getTableColumns(budgetAllocations))
          .from(budgetAllocations)
          .innerJoin(budgets, liveBudget(budgetAllocations.budgetId))
          .orderBy(asc(budgetAllocations.createdAt), asc(budgetAllocations.id))
          .all(),
        expenses: tx
          .select({
            id: expenses.id,
            budgetId: expenses.budgetId,
            allocationId: expenses.allocationId,
            title: expenses.title,
            amount: expenses.amount,
            description: expenses.description,
            order: expenses.order,
            checked: expenses.checked,
            createdAt: expenses.createdAt,
          })
          .from(expenses)
          .innerJoin(budgets, liveBudget(expenses.budgetId))
          .orderBy(asc(expenses.createdAt), asc(expenses.id))
          .all(),
        userSettings: settings,
      },
    };
  });
}

/** Replaces all data with `backup`, which must come from `parseBackup`. */
export function importAll(db: AppDatabase, backup: Backup, now: number = Date.now()): BackupCounts {
  const { data } = backup;
  db.transaction((tx) => {
    tx.delete(expenses).run();
    tx.delete(budgetAllocations).run();
    tx.delete(budgets).run();
    tx.delete(templateCategories).run();
    tx.delete(templates).run();
    tx.delete(budgetLabels).run();
    tx.delete(budgetViews).run();

    for (const rows of chunks(byCreation(data.templates))) tx.insert(templates).values(rows).run();
    for (const rows of chunks(data.templateCategories)) {
      tx.insert(templateCategories).values(rows).run();
    }
    for (const rows of chunks(byCreation(data.budgetLabels))) {
      tx.insert(budgetLabels).values(rows).run();
    }
    for (const rows of chunks(byCreation(data.budgetViews))) {
      tx.insert(budgetViews).values(rows).run();
    }
    for (const rows of chunks(byCreation(data.budgets))) tx.insert(budgets).values(rows).run();
    for (const rows of chunks(byCreation(data.budgetAllocations))) {
      tx.insert(budgetAllocations).values(rows).run();
    }
    for (const rows of chunks(byCreation(data.expenses))) tx.insert(expenses).values(rows).run();

    tx.insert(userSettings)
      .values({ id: SETTINGS_ROW_ID, ...data.userSettings })
      .onConflictDoUpdate({ target: userSettings.id, set: data.userSettings })
      .run();
    tx.insert(appMeta)
      .values({ key: SEEDED_AT_KEY, value: new Date(now).toISOString() })
      .onConflictDoNothing()
      .run();
  });
  return backupCounts(data);
}

/** Adds `backup`'s budgets, which must come from `parseBackup`, to the current data; returns what it added. */
export function addAll(db: AppDatabase, backup: Backup): BackupCounts {
  const { data } = backup;
  return db.transaction((tx) => {
    const templateIds = addTemplates(tx, data);
    const labelIds = addLabels(tx, data);
    const viewIds = addViews(tx, data);
    const budgetIds = new Map(data.budgets.map((budget) => [budget.id, newId<"budgets">()]));
    const allocationIds = new Map(
      data.budgetAllocations.map((allocation) => [allocation.id, newId<"budgetAllocations">()]),
    );
    const local = <T extends TableName>(ids: Map<string, Id<T>>, id: Id<T> | null) =>
      id === null ? null : ids.get(id)!;

    const budgetRows = byCreation(data.budgets).map((budget) => ({
      ...budget,
      id: budgetIds.get(budget.id)!,
      templateId: local(templateIds.ids, budget.templateId),
      labelId: local(labelIds.ids, budget.labelId),
      viewId: local(viewIds.ids, budget.viewId),
    }));
    for (const rows of chunks(budgetRows)) tx.insert(budgets).values(rows).run();
    const allocationRows = byCreation(data.budgetAllocations).map((allocation) => ({
      ...allocation,
      id: allocationIds.get(allocation.id)!,
      budgetId: budgetIds.get(allocation.budgetId)!,
    }));
    for (const rows of chunks(allocationRows)) tx.insert(budgetAllocations).values(rows).run();
    const expenseRows = byCreation(data.expenses).map((expense) => ({
      ...expense,
      id: newId<"expenses">(),
      budgetId: budgetIds.get(expense.budgetId)!,
      allocationId: allocationIds.get(expense.allocationId)!,
    }));
    for (const rows of chunks(expenseRows)) tx.insert(expenses).values(rows).run();

    return {
      templates: templateIds.added,
      budgets: data.budgets.length,
      expenses: data.expenses.length,
      labels: labelIds.added,
      views: viewIds.added,
    };
  });
}

interface Matched<T extends TableName> {
  /** Backup id → the id of the matching or inserted row. */
  ids: Map<string, Id<T>>;
  added: number;
}

/** Maps each row the budgets use to the local row `find` matches, else inserts it under its own id (free, as `find` checked). */
function matchOrAdd<T extends TableName, R extends { id: Id<T> }>(
  rows: readonly R[],
  used: readonly (Id<T> | null)[],
  find: (row: R) => Id<T> | undefined,
  insert: (row: R) => void,
): Matched<T> {
  const usedIds = new Set(used);
  const matched: Matched<T> = { ids: new Map(), added: 0 };
  for (const row of rows) {
    if (!usedIds.has(row.id)) continue;
    let id = find(row);
    if (id === undefined) {
      insert(row);
      id = row.id;
      matched.added++;
    }
    matched.ids.set(row.id, id);
  }
  return matched;
}

/** Same id, or for a built-in, a built-in with the same categories; else added as a user template. */
function addTemplates(tx: Transaction, data: BackupData): Matched<"templates"> {
  const localIds = new Set(
    tx
      .select({ id: templates.id })
      .from(templates)
      .all()
      .map((t) => t.id),
  );
  const builtIns = new Map<string, Id<"templates">>();
  for (const { id } of tx
    .select({ id: templates.id })
    .from(templates)
    .where(eq(templates.isDefault, true))
    .all()) {
    const categories = tx
      .select({ name: templateCategories.name, percentage: templateCategories.percentage })
      .from(templateCategories)
      .where(eq(templateCategories.templateId, id))
      .orderBy(asc(templateCategories.sortOrder))
      .all();
    builtIns.set(categoriesKey(categories), id);
  }
  const categoriesOf = (templateId: Id<"templates">) =>
    data.templateCategories
      .filter((category) => category.templateId === templateId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

  return matchOrAdd(
    byCreation(data.templates),
    data.budgets.map((budget) => budget.templateId),
    (template) => {
      if (localIds.has(template.id)) return template.id;
      return template.isDefault
        ? builtIns.get(categoriesKey(categoriesOf(template.id)))
        : undefined;
    },
    (template) => {
      tx.insert(templates)
        .values({ ...template, isDefault: false })
        .run();
      tx.insert(templateCategories)
        .values(categoriesOf(template.id).map(({ id: _, ...category }) => category))
        .run();
    },
  );
}

function categoriesKey(categories: readonly { name: string; percentage: number }[]): string {
  return JSON.stringify(categories.map(({ name, percentage }) => [name, percentage]));
}

/** Same id, or the same name and colour. */
function addLabels(tx: Transaction, data: BackupData): Matched<"budgetLabels"> {
  const local = tx.select().from(budgetLabels).all();
  return matchOrAdd(
    byCreation(data.budgetLabels),
    data.budgets.map((budget) => budget.labelId),
    (label) =>
      (
        local.find((row) => row.id === label.id) ??
        local.find(
          (row) => row.name === label.name && row.color.toLowerCase() === label.color.toLowerCase(),
        )
      )?.id,
    (label) => tx.insert(budgetLabels).values(label).run(),
  );
}

/** Same id, or the same title. A favorite stays one while there is room. */
function addViews(tx: Transaction, data: BackupData): Matched<"budgetViews"> {
  const local = tx.select({ id: budgetViews.id, title: budgetViews.title }).from(budgetViews).all();
  let favorites =
    tx.select({ n: count() }).from(budgetViews).where(eq(budgetViews.isFavorite, true)).get()?.n ??
    0;
  return matchOrAdd(
    byCreation(data.budgetViews),
    data.budgets.map((budget) => budget.viewId),
    (view) =>
      (
        local.find((row) => row.id === view.id) ??
        local.find((row) => row.title.trim() === view.title.trim())
      )?.id,
    (view) => {
      const isFavorite = view.isFavorite && favorites < MAX_FAVORITE_BUDGET_VIEWS;
      if (isFavorite) favorites++;
      tx.insert(budgetViews)
        .values({ ...view, isFavorite })
        .run();
    },
  );
}

const newId = <T extends TableName>() => asId<T>(randomUUID());

/** Join condition: the row's budget, unless it is in the trash. */
function liveBudget(budgetId: SQLiteColumn) {
  return and(eq(budgets.id, budgetId), isNull(budgets.deletedAt));
}

export function counts(db: AppDatabase): BackupCounts {
  const rows = (table: SQLiteTable) => db.select({ n: count() }).from(table).get()?.n ?? 0;
  return {
    templates: rows(templates),
    budgets: rows(budgets),
    expenses: rows(expenses),
    labels: rows(budgetLabels),
    views: rows(budgetViews),
  };
}

function byCreation<T extends { id: string; createdAt: number }>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

function* chunks<T>(rows: readonly T[]): Generator<T[]> {
  for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
    yield rows.slice(start, start + INSERT_CHUNK);
  }
}
