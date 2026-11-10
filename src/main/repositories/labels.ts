/**
 * Labels: coloured tags, zero or one per budget. Ported from the web app.
 *
 * - No validation on create or update; names are not unique.
 * - Every label is editable, the seeded ones included.
 * - Delete relies on `ON DELETE SET NULL` to unlink budgets.
 */
import { asc, desc, eq } from "drizzle-orm";
import type { ArgsOf, MethodName, ResultOf } from "@shared/api";
import type { Id } from "@shared/domain";
import { CushnError } from "@shared/errors";
import type { AppDatabase } from "../db";
import { budgetLabels } from "../db/schema";

type Args<M extends MethodName<"labels">> = ArgsOf<"labels", M>;
type Result<M extends MethodName<"labels">> = ResultOf<"labels", M>;

/** All labels in creation order (seeded ones first). */
export function list(db: AppDatabase): Result<"list"> {
  const labels = db
    .select({
      id: budgetLabels.id,
      name: budgetLabels.name,
      color: budgetLabels.color,
      createdAt: budgetLabels.createdAt,
    })
    .from(budgetLabels)
    .orderBy(asc(budgetLabels.createdAt), asc(budgetLabels.id))
    .all();
  return { labels };
}

export function create(db: AppDatabase, { name, color }: Args<"create">): Result<"create"> {
  return db.transaction((tx) => {
    // Never before the newest existing label: keeps "created later, listed
    // later" even when the clock goes back or two inserts share a millisecond.
    const newest = tx
      .select({ createdAt: budgetLabels.createdAt })
      .from(budgetLabels)
      .orderBy(desc(budgetLabels.createdAt))
      .limit(1)
      .get();
    const createdAt = Math.max(Date.now(), (newest?.createdAt ?? 0) + 1);
    const { labelId } = tx
      .insert(budgetLabels)
      .values({ name, color, createdAt })
      .returning({ labelId: budgetLabels.id })
      .get();
    return { labelId };
  });
}

export function updateColor(
  db: AppDatabase,
  { labelId, color }: Args<"updateColor">,
): Result<"updateColor"> {
  return patch(db, labelId, { color });
}

export function updateName(
  db: AppDatabase,
  { labelId, name }: Args<"updateName">,
): Result<"updateName"> {
  return patch(db, labelId, { name });
}

function remove(db: AppDatabase, { labelId }: Args<"delete">): Result<"delete"> {
  return db.transaction((tx) => {
    const deleted = tx.delete(budgetLabels).where(eq(budgetLabels.id, labelId)).run();
    if (deleted.changes === 0) throw labelNotFound();
    return { success: true };
  });
}
// `delete` is a reserved word, so the function is `remove`, exported under the method name.
export { remove as delete };

function patch(
  db: AppDatabase,
  labelId: Id<"budgetLabels">,
  values: { name?: string; color?: string },
): { success: true } {
  return db.transaction((tx) => {
    const updated = tx.update(budgetLabels).set(values).where(eq(budgetLabels.id, labelId)).run();
    if (updated.changes === 0) throw labelNotFound();
    return { success: true };
  });
}

function labelNotFound(): CushnError {
  return new CushnError("NOT_FOUND", "Label not found");
}
