/**
 * The JSON backup format. This repo is its canonical home.
 *
 * - camelCase keys; optional values are `null`, never omitted; ids preserved;
 *   unknown extra keys are dropped.
 * - `version` is bumped on any change to a backed-up table or column. Each
 *   version keeps its schema; an older backup is validated as its own version,
 *   then upgraded one step at a time (`upgradeBackup`) up to `BACKUP_VERSION`.
 * - `parseBackup` is the only way in: format marker, version, schema,
 *   referential integrity, then money rounded to cents. Every failure is
 *   a `CushnError("BAD_REQUEST")` with a user-facing message.
 * - The schema only enforces rules that every repository write enforces too,
 *   so a backup of data the app made always imports.
 *
 * Not imported by `api.ts`: the preload bundles that, and zod stays out of it.
 */
import { z } from "zod";
import type { BackupCounts } from "./api";
import { MAX_BUDGET_VIEW_DESCRIPTION_LENGTH, MAX_FAVORITE_BUDGET_VIEWS } from "./constants";
import { BUDGET_LAYOUTS, BUDGET_STATUSES, type TableName, asId } from "./domain";
import { CushnError } from "./errors";
import { roundMoney, sumsTo100 } from "./money";

export const BACKUP_FORMAT = "cushn-backup";
export const BACKUP_VERSION = 2;
export const BACKUP_APP_NAME = "cushn-desktop";

const id = <T extends TableName>() =>
  z
    .string()
    .min(1)
    .transform((value) => asId<T>(value));

const timestamp = z.number().int();

const templateSchema = z.object({
  id: id<"templates">(),
  name: z.string(),
  description: z.string().nullable(),
  isDefault: z.boolean(),
  createdAt: timestamp,
});

const templateCategorySchema = z.object({
  id: id<"templateCategories">(),
  templateId: id<"templates">(),
  name: z.string(),
  percentage: z.number(),
  sortOrder: z.number().int(),
  description: z.string().nullable(),
  editable: z.boolean(),
});

const budgetLabelSchema = z.object({
  id: id<"budgetLabels">(),
  name: z.string(),
  color: z.string(),
  createdAt: timestamp,
});

const budgetViewSchema = z.object({
  id: id<"budgetViews">(),
  title: z.string().refine((title) => title.trim().length > 0, "Title is required"),
  description: z.string().max(MAX_BUDGET_VIEW_DESCRIPTION_LENGTH).nullable(),
  isFavorite: z.boolean(),
  createdAt: timestamp,
});

const budgetV1Schema = z.object({
  id: id<"budgets">(),
  title: z.string(),
  description: z.string().nullable(),
  templateId: id<"templates">().nullable(),
  income: z.number(),
  status: z.enum(BUDGET_STATUSES),
  currency: z.string(),
  labelId: id<"budgetLabels">().nullable(),
  viewId: id<"budgetViews">().nullable(),
  createdAt: timestamp,
});

// Keys follow the table's columns, as the export writes them.
const budgetSchema = budgetV1Schema
  .omit({ createdAt: true })
  .extend({ icon: z.string().nullable(), createdAt: timestamp });

const budgetAllocationSchema = z.object({
  id: id<"budgetAllocations">(),
  budgetId: id<"budgets">(),
  categoryName: z.string(),
  percentage: z.number(),
  amount: z.number(),
  description: z.string().nullable(),
  editable: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: timestamp,
});

const expenseSchema = z.object({
  id: id<"expenses">(),
  budgetId: id<"budgets">(),
  allocationId: id<"budgetAllocations">(),
  title: z.string(),
  amount: z.number(),
  description: z.string().nullable(),
  order: z.number().int(),
  checked: z.boolean(),
  createdAt: timestamp,
});

const userSettingsSchema = z.object({
  currency: z.string().min(1),
  budgetView: z.enum(BUDGET_LAYOUTS),
  language: z.string().nullable(),
  darkMode: z.boolean().nullable(),
});

export const backupV1Schema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(1),
  exportedAt: timestamp,
  app: z.object({ name: z.string(), version: z.string() }),
  data: z.object({
    templates: z.array(templateSchema),
    templateCategories: z.array(templateCategorySchema),
    budgetLabels: z.array(budgetLabelSchema),
    budgetViews: z.array(budgetViewSchema),
    budgets: z.array(budgetV1Schema),
    budgetAllocations: z.array(budgetAllocationSchema),
    expenses: z.array(expenseSchema),
    userSettings: userSettingsSchema,
  }),
});

export const backupV2Schema = backupV1Schema.extend({
  version: z.literal(2),
  data: backupV1Schema.shape.data.extend({ budgets: z.array(budgetSchema) }),
});

const BACKUP_SCHEMAS = { 1: backupV1Schema, 2: backupV2Schema } as const;
const backupSchema = BACKUP_SCHEMAS[BACKUP_VERSION];

export type Backup = z.output<typeof backupSchema>;
export type BackupData = Backup["data"];

export interface BackupStep {
  /** The version this step upgrades from. */
  schema: z.ZodType;
  upgrade(backup: unknown): unknown;
}

/** Version n's schema and its upgrade to version n + 1, which may trust its validated input. */
export function backupStep<S extends z.ZodType>(
  schema: S,
  upgrade: (backup: z.output<S>) => unknown,
): BackupStep {
  return { schema, upgrade: (backup) => upgrade(backup as z.output<S>) };
}

export interface BackupChain<T> {
  version: number;
  schema: z.ZodType<T>;
  /** `steps[n]` upgrades a version-n backup to version n + 1. */
  steps: Partial<Record<number, BackupStep>>;
}

const BACKUP_CHAIN: BackupChain<Backup> = {
  version: BACKUP_VERSION,
  schema: backupSchema,
  steps: {
    1: backupStep(backupV1Schema, (backup) => ({
      ...backup,
      version: 2,
      data: {
        ...backup.data,
        budgets: backup.data.budgets.map((budget) => ({ ...budget, icon: null })),
      },
    })),
  },
};

export function upgradeBackup<T>(value: unknown, fromVersion: number, chain: BackupChain<T>): T {
  let current = value;
  for (let version = fromVersion; version < chain.version; version++) {
    const step = chain.steps[version];
    if (!step) throw unknownVersion();
    const valid = validate(step.schema, current);
    try {
      current = step.upgrade(valid);
    } catch {
      throw damaged("it could not be upgraded to the current format.");
    }
  }
  return validate(chain.schema, current);
}

export function parseBackupText(text: string): Backup {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw notABackup();
  }
  return parseBackup(value);
}

export function parseBackup(value: unknown): Backup {
  if (!isRecord(value) || value.format !== BACKUP_FORMAT) throw notABackup();
  const { version } = value;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw unknownVersion();
  }
  if (version > BACKUP_VERSION) {
    throw new CushnError(
      "BAD_REQUEST",
      "This backup comes from a newer version of Cushn. Update Cushn to import it.",
    );
  }

  const backup = upgradeBackup(value, version, BACKUP_CHAIN);
  checkIntegrity(backup.data);
  return { ...backup, data: roundMoneyValues(backup.data) };
}

function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const [issue] = result.error.issues;
    throw damaged(`${formatPath(issue.path)}: ${issue.message}`);
  }
  return result.data;
}

export function serializeBackup(backup: Backup): string {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

/** `cushn-backup-YYYY-MM-DD.json`, in local time. */
export function backupFileName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `cushn-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

export function backupCounts(data: BackupData): BackupCounts {
  return {
    templates: data.templates.length,
    budgets: data.budgets.length,
    expenses: data.expenses.length,
    labels: data.budgetLabels.length,
    views: data.budgetViews.length,
  };
}

function checkIntegrity(data: BackupData): void {
  const templateIds = uniqueIds(data.templates, "templates");
  uniqueIds(data.templateCategories, "template categories");
  const labelIds = uniqueIds(data.budgetLabels, "labels");
  const viewIds = uniqueIds(data.budgetViews, "views");
  const budgetIds = uniqueIds(data.budgets, "budgets");
  uniqueIds(data.budgetAllocations, "allocations");
  uniqueIds(data.expenses, "expenses");

  const percentages = new Map<string, number[]>();
  for (const category of [...data.templateCategories].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!templateIds.has(category.templateId)) {
      throw damaged(`a template category ("${category.name}") refers to a missing template.`);
    }
    percentages.set(category.templateId, [
      ...(percentages.get(category.templateId) ?? []),
      category.percentage,
    ]);
  }
  for (const template of data.templates) {
    if (!sumsTo100(percentages.get(template.id) ?? [])) {
      throw damaged(`the categories of a template ("${template.name}") don't add up to 100%.`);
    }
  }
  if (data.budgetViews.filter((view) => view.isFavorite).length > MAX_FAVORITE_BUDGET_VIEWS) {
    throw damaged(`it has more than ${MAX_FAVORITE_BUDGET_VIEWS} favorite views.`);
  }
  for (const budget of data.budgets) {
    const refs = [
      [budget.templateId, templateIds, "template"],
      [budget.labelId, labelIds, "label"],
      [budget.viewId, viewIds, "view"],
    ] as const;
    for (const [refId, ids, noun] of refs) {
      if (refId !== null && !ids.has(refId)) {
        throw damaged(`a budget ("${budget.title}") refers to a missing ${noun}.`);
      }
    }
  }
  const allocationBudgets = new Map<string, string>();
  for (const allocation of data.budgetAllocations) {
    if (!budgetIds.has(allocation.budgetId)) {
      throw damaged(`an allocation ("${allocation.categoryName}") refers to a missing budget.`);
    }
    allocationBudgets.set(allocation.id, allocation.budgetId);
  }
  for (const expense of data.expenses) {
    if (!budgetIds.has(expense.budgetId)) {
      throw damaged(`an expense ("${expense.title}") refers to a missing budget.`);
    }
    const allocationBudget = allocationBudgets.get(expense.allocationId);
    if (allocationBudget === undefined) {
      throw damaged(`an expense ("${expense.title}") refers to a missing allocation.`);
    }
    if (allocationBudget !== expense.budgetId) {
      throw damaged(
        `an expense ("${expense.title}") belongs to a different budget than its allocation.`,
      );
    }
  }
}

function uniqueIds(rows: readonly { id: string }[], noun: string): Set<string> {
  const ids = new Set<string>();
  for (const { id } of rows) {
    if (ids.has(id)) throw damaged(`two ${noun} share an id.`);
    ids.add(id);
  }
  return ids;
}

function roundMoneyValues(data: BackupData): BackupData {
  return {
    ...data,
    budgets: data.budgets.map((budget) => ({ ...budget, income: roundMoney(budget.income) })),
    budgetAllocations: data.budgetAllocations.map((allocation) => ({
      ...allocation,
      amount: roundMoney(allocation.amount),
    })),
    expenses: data.expenses.map((expense) => ({ ...expense, amount: roundMoney(expense.amount) })),
  };
}

function formatPath(path: readonly PropertyKey[]): string {
  return path
    .map((key, index) =>
      typeof key === "number" ? `[${key}]` : `${index === 0 ? "" : "."}${String(key)}`,
    )
    .join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function notABackup(): CushnError {
  return new CushnError("BAD_REQUEST", "This file is not a Cushn backup.");
}

function unknownVersion(): CushnError {
  return new CushnError("BAD_REQUEST", "This backup has an unknown version.");
}

function damaged(detail: string): CushnError {
  return new CushnError("BAD_REQUEST", `This backup is damaged: ${detail}`);
}
