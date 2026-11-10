/**
 * Views: user-made folders that group budgets. Ported from the web app.
 *
 * - Titles and descriptions are trimmed; an empty description is stored as NULL.
 * - Lists are newest first, ties by id (the reverse of creation order).
 */
import { type SQL, count, desc, eq } from "drizzle-orm";
import type { ArgsOf, MethodName, ResultOf } from "@shared/api";
import { MAX_BUDGET_VIEW_DESCRIPTION_LENGTH, MAX_FAVORITE_BUDGET_VIEWS } from "@shared/constants";
import type { BudgetView } from "@shared/domain";
import { CushnError } from "@shared/errors";
import type { AppDatabase } from "../db";
import { budgetViews } from "../db/schema";

type Args<M extends MethodName<"views">> = ArgsOf<"views", M>;
type Result<M extends MethodName<"views">> = ResultOf<"views", M>;

const viewColumns = {
  id: budgetViews.id,
  title: budgetViews.title,
  description: budgetViews.description,
  isFavorite: budgetViews.isFavorite,
  createdAt: budgetViews.createdAt,
};

/** Every View, newest first. */
export function list(db: AppDatabase): Result<"list"> {
  return { views: selectViews(db) };
}

/** The favorite Views (the sidebar), newest first. */
export function listFavorites(db: AppDatabase): Result<"listFavorites"> {
  return { views: selectViews(db, eq(budgetViews.isFavorite, true)) };
}

/** `{ view: null }` for a missing id (no 404). */
export function get(db: AppDatabase, { viewId }: Args<"get">): Result<"get"> {
  const view = db.select(viewColumns).from(budgetViews).where(eq(budgetViews.id, viewId)).get();
  return { view: view ?? null };
}

/** Returns the new id itself, not `{ viewId }`. */
export function create(
  db: AppDatabase,
  { title, description }: Args<"create">,
): Result<"create"> {
  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) throw badRequest("Title is required");
  const trimmedDescription = normalizeDescription(description);

  return db.transaction((tx) => {
    // Never before the newest existing View: keeps "created later, listed
    // earlier" even when the clock goes back or two inserts share a millisecond.
    const newest = tx
      .select({ createdAt: budgetViews.createdAt })
      .from(budgetViews)
      .orderBy(desc(budgetViews.createdAt))
      .limit(1)
      .get();
    const createdAt = Math.max(Date.now(), (newest?.createdAt ?? 0) + 1);
    const { viewId } = tx
      .insert(budgetViews)
      .values({ title: trimmedTitle, description: trimmedDescription, createdAt })
      .returning({ viewId: budgetViews.id })
      .get();
    return viewId;
  });
}

/** `description: null` clears it, like a blank one. Returns `null`. */
export function update(
  db: AppDatabase,
  { viewId, title, description }: Args<"update">,
): Result<"update"> {
  if (title === undefined && description === undefined) {
    throw badRequest("Provide title and/or description to update");
  }
  const values: { title?: string; description?: string | null } = {};
  if (title !== undefined) {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) throw badRequest("Title cannot be empty");
    values.title = trimmedTitle;
  }
  if (description !== undefined) values.description = normalizeDescription(description);

  return db.transaction((tx) => {
    const updated = tx.update(budgetViews).set(values).where(eq(budgetViews.id, viewId)).run();
    if (updated.changes === 0) throw viewNotFound();
    return null;
  });
}

/** Returns the new flag. Turning it on is capped at `MAX_FAVORITE_BUDGET_VIEWS`; off never is. */
export function toggleFavorite(
  db: AppDatabase,
  { viewId }: Args<"toggleFavorite">,
): Result<"toggleFavorite"> {
  return db.transaction((tx) => {
    const view = tx
      .select({ isFavorite: budgetViews.isFavorite })
      .from(budgetViews)
      .where(eq(budgetViews.id, viewId))
      .get();
    if (!view) throw viewNotFound();

    const nextFavorite = !view.isFavorite;
    if (nextFavorite) {
      const favorites = tx
        .select({ n: count() })
        .from(budgetViews)
        .where(eq(budgetViews.isFavorite, true))
        .get();
      if ((favorites?.n ?? 0) >= MAX_FAVORITE_BUDGET_VIEWS) {
        throw badRequest(`You can favorite up to ${MAX_FAVORITE_BUDGET_VIEWS} views`);
      }
    }
    tx.update(budgetViews)
      .set({ isFavorite: nextFavorite })
      .where(eq(budgetViews.id, viewId))
      .run();
    return nextFavorite;
  });
}

/** Budgets in the View, archived ones too, lose it through `ON DELETE SET NULL`. */
function remove(db: AppDatabase, { viewId }: Args<"delete">): Result<"delete"> {
  return db.transaction((tx) => {
    const deleted = tx.delete(budgetViews).where(eq(budgetViews.id, viewId)).run();
    if (deleted.changes === 0) throw viewNotFound();
    return null;
  });
}
// `delete` is a reserved word, so the function is `remove`, exported under the method name.
export { remove as delete };

function selectViews(db: AppDatabase, where?: SQL): BudgetView[] {
  return db
    .select(viewColumns)
    .from(budgetViews)
    .where(where)
    .orderBy(desc(budgetViews.createdAt), desc(budgetViews.id))
    .all();
}

/** Trims; blank or null becomes NULL; longer than the limit is a 400. */
function normalizeDescription(description: string | null | undefined): string | null {
  const trimmed = description?.trim() ?? "";
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_BUDGET_VIEW_DESCRIPTION_LENGTH) {
    throw badRequest(
      `Description must be at most ${MAX_BUDGET_VIEW_DESCRIPTION_LENGTH} characters`,
    );
  }
  return trimmed;
}

function badRequest(message: string): CushnError {
  return new CushnError("BAD_REQUEST", message);
}

function viewNotFound(): CushnError {
  return new CushnError("NOT_FOUND", "View not found");
}
