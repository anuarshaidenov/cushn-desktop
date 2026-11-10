import { z } from "zod";
import * as budgets from "../repositories/budgets";
import type { Files } from "./files";
import { type CushnHandlers, noArgs } from "./handler";
import { id } from "./schemas";

const budgetId = z.object({ budgetId: id("budgets") });
const budgetIds = z.object({ budgetIds: z.array(id("budgets")) });
const iconName = z.string().min(1).max(64);

const pageArgs = z.object({
  cursor: z.string().nullable(),
  numItems: z.number().int().positive(),
});

/** Filters, sort and page of the archived list; the active list adds `viewId`. */
const listArgs = pageArgs.extend({
  labelIds: z.array(id("budgetLabels")).optional(),
  templateIds: z.array(id("templates")).optional(),
  currencies: z.array(z.string()).optional(),
  search: z.string().optional(),
  sortBy: z.enum(["createdAt", "income"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const budgetHandlers: Omit<CushnHandlers["budgets"], "exportMarkdown"> = {
  create: {
    args: z.object({
      templateId: id("templates"),
      currency: z.string(),
      title: z.string(),
      description: z.string().nullish(),
      income: z.number().optional(),
      labelId: id("budgetLabels").nullish(),
      viewId: id("budgetViews").nullish(),
      icon: iconName.nullish(),
    }),
    run: ({ db }, args) => budgets.create(db, args),
  },
  listActive: {
    args: listArgs.extend({ viewId: id("budgetViews").nullish() }),
    run: ({ db }, args) => budgets.listActive(db, args),
  },
  listArchived: {
    // A stray `viewId` is stripped: the archived list spans every View.
    args: listArgs,
    run: ({ db }, args) => budgets.listArchived(db, args),
  },
  listTrashed: {
    args: pageArgs,
    run: ({ db }, args) => budgets.listTrashed(db, args),
  },
  get: {
    args: budgetId,
    run: ({ db }, args) => budgets.get(db, args),
  },
  getLatest: {
    args: noArgs,
    run: ({ db }) => budgets.getLatest(db),
  },
  update: {
    args: z.object({
      budgetId: id("budgets"),
      title: z.string().optional(),
      description: z.string().nullish(),
      income: z.number().optional(),
      currency: z.string().optional(),
    }),
    run: ({ db }, args) => budgets.update(db, args),
  },
  updateIncome: {
    args: z.object({ budgetId: id("budgets"), income: z.number() }),
    run: ({ db }, args) => budgets.updateIncome(db, args),
  },
  archive: {
    args: budgetId,
    run: ({ db }, args) => budgets.archive(db, args),
  },
  unarchive: {
    args: budgetId,
    run: ({ db }, args) => budgets.unarchive(db, args),
  },
  archiveMany: {
    args: budgetIds,
    run: ({ db }, args) => budgets.archiveMany(db, args),
  },
  unarchiveMany: {
    args: budgetIds,
    run: ({ db }, args) => budgets.unarchiveMany(db, args),
  },
  trash: {
    args: budgetIds,
    run: ({ db }, args) => budgets.trash(db, args),
  },
  restore: {
    args: budgetIds,
    run: ({ db }, args) => budgets.restore(db, args),
  },
  emptyTrash: {
    args: noArgs,
    run: ({ db }) => budgets.emptyTrash(db),
  },
  deleteMany: {
    args: budgetIds,
    run: ({ db }, args) => budgets.deleteMany(db, args),
  },
  setLabel: {
    args: z.object({ budgetId: id("budgets"), labelId: id("budgetLabels").nullable() }),
    run: ({ db }, args) => budgets.setLabel(db, args),
  },
  setView: {
    args: z.object({ budgetId: id("budgets"), viewId: id("budgetViews").nullable() }),
    run: ({ db }, args) => budgets.setView(db, args),
  },
  setIcon: {
    args: z.object({ budgetId: id("budgets"), icon: iconName.nullable() }),
    run: ({ db }, args) => budgets.setIcon(db, args),
  },
  duplicate: {
    args: budgetId,
    run: ({ db }, args) => budgets.duplicate(db, args),
  },
};

/** The budget handlers plus `exportMarkdown`, which saves through `files`. */
export function createBudgetHandlers(files: Pick<Files, "saveMarkdown">): CushnHandlers["budgets"] {
  return {
    ...budgetHandlers,
    exportMarkdown: {
      args: budgetId,
      run: ({ db }, args) => {
        const { markdown, filename } = budgets.exportMarkdown(db, args);
        return files.saveMarkdown(filename, markdown);
      },
    },
  };
}
