/**
 * Templates: named percentage splits that budgets are created from. Ported
 * from the web app.
 *
 * - Built-in templates (`is_default`) are readable and duplicable, never
 *   editable or deletable (403).
 * - Every category write sets `sort_order` to its 1-based input position.
 * - Create and update require percentages summing to 100, rounded to cents
 *   (so float error passes); an `update` category id must belong to the
 *   template.
 */
import { and, asc, desc, eq, notInArray } from "drizzle-orm";
import type { ArgsOf, MethodName, ResultOf, TemplateCategoryInput } from "@shared/api";
import type { Id } from "@shared/domain";
import { CushnError } from "@shared/errors";
import { sumsTo100 } from "@shared/money";
import type { AppDatabase } from "../db";
import { templateCategories, templates } from "../db/schema";

type Args<M extends MethodName<"templates">> = ArgsOf<"templates", M>;
type Result<M extends MethodName<"templates">> = ResultOf<"templates", M>;
type Transaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

const templateColumns = {
  id: templates.id,
  name: templates.name,
  description: templates.description,
  isDefault: templates.isDefault,
  createdAt: templates.createdAt,
};

/** User templates first, then built-ins, each in creation order. */
export function list(db: AppDatabase): Result<"list"> {
  const rows = db
    .select(templateColumns)
    .from(templates)
    .orderBy(asc(templates.isDefault), asc(templates.createdAt), asc(templates.id))
    .all();
  return { templates: rows };
}

/** Built-ins too. Categories come ordered by `sort_order`. */
export function get(db: AppDatabase, { templateId }: Args<"get">): Result<"get"> {
  const template = db
    .select(templateColumns)
    .from(templates)
    .where(eq(templates.id, templateId))
    .get();
  if (!template) throw templateNotFound();

  const categories = db
    .select({
      id: templateCategories.id,
      name: templateCategories.name,
      percentage: templateCategories.percentage,
      description: templateCategories.description,
      editable: templateCategories.editable,
    })
    .from(templateCategories)
    .where(eq(templateCategories.templateId, templateId))
    .orderBy(asc(templateCategories.sortOrder), asc(templateCategories.id))
    .all();
  return { template: { ...template, categories } };
}

/** The percentages must sum to 100, rounded to cents so float error passes. */
export function create(
  db: AppDatabase,
  { name, description, categories }: Args<"create">,
): Result<"create"> {
  assertSumIs100(categories);
  return db.transaction((tx) => {
    const templateId = insertTemplate(tx, { name, description: description ?? null });
    categories.forEach((category, index) => {
      createTemplateCategory(tx, templateId, category, index + 1);
    });
    return { success: true };
  });
}

/**
 * Replaces the template's name, description and categories. Categories left
 * out are deleted, those with an `id` patched, those without inserted; the
 * input order becomes `sort_order`. An omitted description clears it.
 */
export function update(
  db: AppDatabase,
  { templateId, name, description, categories }: Args<"update">,
): Result<"update"> {
  return db.transaction((tx) => {
    assertEditable(tx, templateId);
    assertSumIs100(categories);

    const ownIds = new Set(
      tx
        .select({ id: templateCategories.id })
        .from(templateCategories)
        .where(eq(templateCategories.templateId, templateId))
        .all()
        .map((c) => c.id),
    );
    // A category id must belong to this template.
    if (categories.some((c) => c.id !== undefined && !ownIds.has(c.id))) {
      throw new CushnError("NOT_FOUND", "Category not found");
    }

    tx.update(templates)
      .set({ name, description: description ?? null })
      .where(eq(templates.id, templateId))
      .run();

    const keptIds = categories.flatMap((c) => (c.id === undefined ? [] : [c.id]));
    tx.delete(templateCategories)
      .where(
        and(
          eq(templateCategories.templateId, templateId),
          notInArray(templateCategories.id, keptIds),
        ),
      )
      .run();

    categories.forEach(({ id, ...category }, index) => {
      if (id === undefined) {
        createTemplateCategory(tx, templateId, category, index + 1);
        return;
      }
      tx.update(templateCategories)
        .set({
          name: category.name,
          percentage: category.percentage,
          description: category.description ?? null,
          editable: category.editable,
          sortOrder: index + 1,
        })
        .where(eq(templateCategories.id, id))
        .run();
    });
    return { success: true };
  });
}

/** Categories cascade and budgets keep existing with `template_id` NULL. */
function remove(db: AppDatabase, { templateId }: Args<"delete">): Result<"delete"> {
  return db.transaction((tx) => {
    assertEditable(tx, templateId);
    tx.delete(templates).where(eq(templates.id, templateId)).run();
    return { success: true };
  });
}
// `delete` is a reserved word, so the function is `remove`, exported under the method name.
export { remove as delete };

/** Any template, built-ins included. The copy is a user template named "<name> (Copy)". */
export function duplicate(db: AppDatabase, { templateId }: Args<"duplicate">): Result<"duplicate"> {
  return db.transaction((tx) => {
    const { template } = get(tx, { templateId });
    const newTemplateId = insertTemplate(tx, {
      name: `${template.name} (Copy)`,
      description: template.description,
    });
    template.categories.forEach((category, index) => {
      createTemplateCategory(tx, newTemplateId, category, index + 1);
    });
    return { newTemplateId };
  });
}

/** 404 when missing, 403 on a built-in. */
function assertEditable(tx: Transaction, templateId: Id<"templates">): void {
  const template = tx
    .select({ isDefault: templates.isDefault })
    .from(templates)
    .where(eq(templates.id, templateId))
    .get();
  if (!template) throw templateNotFound();
  if (template.isDefault) throw new CushnError("FORBIDDEN", "Forbidden");
}

/**
 * Never before the newest template: keeps "created later, listed later" even
 * when the clock goes back or two inserts share a millisecond.
 */
function insertTemplate(
  tx: Transaction,
  values: { name: string; description: string | null },
): Id<"templates"> {
  const newest = tx
    .select({ createdAt: templates.createdAt })
    .from(templates)
    .orderBy(desc(templates.createdAt))
    .limit(1)
    .get();
  const createdAt = Math.max(Date.now(), (newest?.createdAt ?? 0) + 1);
  const { templateId } = tx
    .insert(templates)
    .values({ ...values, isDefault: false, createdAt })
    .returning({ templateId: templates.id })
    .get();
  return templateId;
}

/** `sortOrder` is 1-based. */
function createTemplateCategory(
  tx: Transaction,
  templateId: Id<"templates">,
  { name, percentage, description, editable }: TemplateCategoryInput,
  sortOrder: number,
): void {
  tx.insert(templateCategories)
    .values({ templateId, name, percentage, description: description ?? null, editable, sortOrder })
    .run();
}

/** Rounds the float sum to cents, so 33.4/33.3/33.3 (99.99999999999999) passes. */
function assertSumIs100(categories: readonly TemplateCategoryInput[]): void {
  if (!sumsTo100(categories.map((category) => category.percentage))) {
    throw new CushnError("BAD_REQUEST", "Categories percentage must be 100%");
  }
}

function templateNotFound(): CushnError {
  return new CushnError("NOT_FOUND", "Template not found");
}
