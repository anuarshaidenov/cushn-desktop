/**
 * The budget list queries. `listBudgets`, behind `budgets.listActive` and
 * `budgets.listArchived`, owns everything both lists share: status, optional
 * View scoping, the filters, title search and the sort; trashed budgets never
 * show. `listTrashedBudgets` is the trash, most recently deleted first. Both
 * page the same way.
 *
 * Paging is keyset, not offset: the cursor is the JSON of the last row's sort
 * tuple (`[created_at, id]` or `[income, created_at, id]`), and the next page
 * starts strictly after it with a row-value comparison. Rows that are added,
 * archived or deleted between pages never shift a page boundary.
 */
import { type SQL, and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type {
  BudgetListFilters,
  BudgetListItem,
  BudgetSortBy,
  Page,
  PageArgs,
  SortOrder,
  TrashedBudgetListItem,
} from "@shared/api";
import type { Budget, BudgetStatus, Id, Template } from "@shared/domain";
import { CushnError } from "@shared/errors";
import type { AppDatabase } from "../db";
import { budgetLabels, budgets, templates } from "../db/schema";
import { budgetTitleMatches } from "../db/search";

export interface BudgetListQuery extends BudgetListFilters, PageArgs {
  status: BudgetStatus;
  /** `null`: budgets in any View or none. */
  viewId: Id<"budgetViews"> | null;
}

/**
 * One page of budgets with `status`, matching every given filter (ANDed;
 * values within one filter ORed), in the requested sort (default
 * `createdAt desc`), starting after `cursor`. `isDone` is true on the last
 * page, whose `continueCursor` is `null`. Throws BAD_REQUEST "Invalid cursor"
 * for a cursor this sort did not produce.
 */
export function listBudgets(db: AppDatabase, query: BudgetListQuery): Page<BudgetListItem> {
  const sortOrder: SortOrder = query.sortOrder ?? "desc";
  const sort = sorts[query.sortBy ?? "createdAt"];

  const where = and(
    isNull(budgets.deletedAt),
    eq(budgets.status, query.status),
    query.viewId !== null ? eq(budgets.viewId, query.viewId) : undefined,
    anyOf(budgets.labelId, query.labelIds),
    anyOf(budgets.templateId, query.templateIds),
    anyOf(budgets.currency, query.currencies),
    budgetTitleMatches(query.search ?? ""),
    query.cursor !== null ? after(sort, decodeCursor(query.cursor, sort), sortOrder) : undefined,
  );
  return selectPage(db, where, sort, sortOrder, query.numItems, toItem);
}

/** One page of trashed budgets of either status, most recently deleted first. */
export function listTrashedBudgets(
  db: AppDatabase,
  { cursor, numItems }: PageArgs,
): Page<TrashedBudgetListItem> {
  const where = and(
    isNotNull(budgets.deletedAt),
    cursor !== null ? after(trashSort, decodeCursor(cursor, trashSort), "desc") : undefined,
  );
  return selectPage(db, where, trashSort, "desc", numItems, (row) => {
    const { viewId: _viewId, ...item } = toItem(row);
    return { ...item, status: row.budget.status, deletedAt: row.budget.deletedAt ?? 0 };
  });
}

type ListRow = {
  budget: Budget;
  template: Template | null;
  label: BudgetListItem["label"];
};

/** Fetches one row past the page, which tells whether another page follows. */
function selectPage<T>(
  db: AppDatabase,
  where: SQL | undefined,
  sort: Sort,
  sortOrder: SortOrder,
  numItems: number,
  toPageItem: (row: ListRow) => T,
): Page<T> {
  const direction = sortOrder === "asc" ? asc : desc;
  const rows = db
    .select({
      budget: budgets,
      template: templates,
      label: { id: budgetLabels.id, name: budgetLabels.name, color: budgetLabels.color },
    })
    .from(budgets)
    .leftJoin(templates, eq(templates.id, budgets.templateId))
    .leftJoin(budgetLabels, eq(budgetLabels.id, budgets.labelId))
    .where(where)
    .orderBy(...sort.columns.map((column) => direction(column)))
    .limit(numItems + 1)
    .all();

  const isDone = rows.length <= numItems;
  const pageRows = rows.slice(0, numItems);
  const last = pageRows.at(-1);
  return {
    page: pageRows.map(toPageItem),
    continueCursor: isDone || !last ? null : JSON.stringify(sort.tuple(last.budget)),
    isDone,
  };
}

function toItem({ budget, template, label }: ListRow): BudgetListItem {
  return {
    id: budget.id,
    createdAt: budget.createdAt,
    templateId: budget.templateId,
    template,
    income: budget.income,
    description: budget.description,
    title: budget.title,
    currency: budget.currency,
    label,
    viewId: budget.viewId,
    icon: budget.icon,
  };
}

type SortTuple = (number | string)[];

interface Sort {
  /** Most significant first; always ends in `id`, so no two rows tie. */
  columns: SQLiteColumn[];
  tuple(budget: Budget): SortTuple;
}

/**
 * The columns each sort orders by. Ties fall back to creation order
 * (`created_at, id`) in the same direction. The same tuple is what a cursor
 * holds.
 */
const sorts: Record<BudgetSortBy, Sort> = {
  createdAt: {
    columns: [budgets.createdAt, budgets.id],
    tuple: (budget) => [budget.createdAt, budget.id],
  },
  income: {
    columns: [budgets.income, budgets.createdAt, budgets.id],
    tuple: (budget) => [budget.income, budget.createdAt, budget.id],
  },
};

/** Ties fall back to `id`, as for the other sorts. */
const trashSort: Sort = {
  columns: [budgets.deletedAt, budgets.id],
  tuple: (budget) => [budget.deletedAt ?? 0, budget.id],
};

/** Rows strictly after `tuple` in the sort: `(c1, c2, …) < (?, ?, …)` for `desc`, `>` for `asc`. */
function after(sort: Sort, tuple: SortTuple, sortOrder: SortOrder): SQL {
  const columns = sql.join(sort.columns, sql`, `);
  const values = sql.join(
    tuple.map((value) => sql`${value}`),
    sql`, `,
  );
  return sortOrder === "asc" ? sql`(${columns}) > (${values})` : sql`(${columns}) < (${values})`;
}

/** Parses a cursor: numbers for every key but the last, the id string last. */
function decodeCursor(cursor: string, sort: Sort): SortTuple {
  let tuple: unknown;
  try {
    tuple = JSON.parse(cursor);
  } catch {
    throw invalidCursor();
  }
  const valid =
    Array.isArray(tuple) &&
    tuple.length === sort.columns.length &&
    tuple.every((value, index) =>
      index === tuple.length - 1
        ? typeof value === "string"
        : typeof value === "number" && Number.isFinite(value),
    );
  if (!valid) throw invalidCursor();
  return tuple as SortTuple;
}

function invalidCursor(): CushnError {
  return new CushnError("BAD_REQUEST", "Invalid cursor");
}

/**
 * `column IN (values)`, or no condition for a missing or empty list. NULL
 * never matches, so a label filter excludes unlabelled budgets.
 */
function anyOf(column: SQLiteColumn, values: readonly string[] | undefined): SQL | undefined {
  return values && values.length > 0 ? inArray(column, [...values]) : undefined;
}
