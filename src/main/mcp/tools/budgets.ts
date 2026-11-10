import { z } from "zod";
import { BUDGET_ICON_GROUPS, isBudgetIconName } from "@shared/budgetIcons";
import { CURRENCY_CODES } from "@shared/currencies";
import { CushnError } from "@shared/errors";
import { id } from "../../ipc/schemas";
import * as budgets from "../../repositories/budgets";
import { defineTool } from "../tool";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const MONEY =
  "Money is in major units of the budget's own currency (5000 means 5000 USD) and is never " +
  "converted between budgets.";

const currency = z.preprocess(
  (value) => (typeof value === "string" ? value.toLowerCase() : value),
  z.enum(CURRENCY_CODES, {
    error: (issue) =>
      `Unsupported currency ${JSON.stringify(issue.input)}: use one of ${CURRENCY_CODES.join(", ")}`,
  }),
);
const iconName = z.string().refine(isBudgetIconName, {
  error: (issue) => `Unknown icon ${JSON.stringify(issue.input)}: call list_icons for the names`,
});

const filterFields = {
  search: z
    .string()
    .optional()
    .describe(
      'Each word must match the start of a word in the title, ignoring case and accents: "gro" finds "Weekly groceries".',
    ),
  labelIds: z
    .array(id("budgetLabels"))
    .optional()
    .describe(
      "Only budgets with one of these labels (ids from list_labels). Unlabeled budgets never match.",
    ),
  templateIds: z
    .array(id("templates"))
    .optional()
    .describe("Only budgets created from one of these templates (ids from list_templates)."),
  currencies: z
    .array(currency)
    .optional()
    .describe('Only budgets in one of these currencies: ISO 4217 codes such as "usd" or "eur".'),
  sortBy: z
    .enum(["createdAt", "income"])
    .optional()
    .describe("Sort by creation time (the default) or by income. Ties keep creation order."),
  sortOrder: z
    .enum(["asc", "desc"])
    .optional()
    .describe('"desc" (the default) puts the newest or largest first.'),
};

const pageFields = {
  cursor: z
    .string()
    .nullish()
    .describe("The previous page's continueCursor. Omit it for the first page."),
  numItems: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .describe("Budgets per page."),
};

const PAGING =
  "When isDone is false, call again with the same arguments and cursor set to continueCursor " +
  "for the next page.";

const budgetId = id("budgets");
const budgetIds = z.array(budgetId).min(1);

const listBudgets = defineTool({
  kind: "read",
  name: "list_budgets",
  description:
    "Lists the user's active budgets, one page at a time, newest first unless sorted otherwise; " +
    "archived budgets (list_archived_budgets) and trashed ones (list_trashed_budgets) are left " +
    "out. A budget plans one amount of income in one currency, split into allocations " +
    "(categories with a percentage and an amount) that expenses are filed under. Each item has " +
    "the budget's id, title, income, currency, description (Markdown), label, template, viewId, " +
    "icon and createdAt (epoch ms), but not its allocations (get_budget) or expenses " +
    `(list_expenses). ${MONEY} Filters combine with AND; the values inside one filter combine ` +
    `with OR. ${PAGING}`,
  input: z.object({
    ...filterFields,
    viewId: id("budgetViews")
      .optional()
      .describe("Only budgets in this View (an id from list_views). Omit it for every View."),
    ...pageFields,
  }),
  run: ({ db }, { cursor, ...args }) => budgets.listActive(db, { ...args, cursor: cursor ?? null }),
});

const listArchivedBudgets = defineTool({
  kind: "read",
  name: "list_archived_budgets",
  description:
    "Lists the user's archived budgets (done, kept for reference), one page at a time, with " +
    "the same filters, sort and items as list_budgets, except that items carry no viewId. " +
    `unarchive_budgets makes one active again. ${MONEY} ${PAGING}`,
  input: z.object({ ...filterFields, ...pageFields }),
  run: ({ db }, { cursor, ...args }) =>
    budgets.listArchived(db, { ...args, cursor: cursor ?? null }),
});

const listTrashedBudgets = defineTool({
  kind: "read",
  name: "list_trashed_budgets",
  description:
    "Lists the budgets in the trash, most recently trashed first, one page at a time. Items " +
    "are shaped like list_archived_budgets' plus deletedAt (epoch ms) and status, the status " +
    "(active or archived) restore_budgets returns the budget to. The app purges a trashed " +
    `budget 30 days after it was trashed. ${PAGING}`,
  input: z.object(pageFields),
  run: ({ db }, { cursor, numItems }) =>
    budgets.listTrashed(db, { cursor: cursor ?? null, numItems }),
});

const getBudget = defineTool({
  kind: "read",
  name: "get_budget",
  description:
    "Returns one active or archived budget with its allocations: { budget, allocations }. The " +
    "budget has id, title, income, currency, description (Markdown), templateId and template, " +
    'labelId, viewId, icon, createdAt and status ("active" or "archived"). Allocations come ' +
    "in display order, each with id, " +
    "categoryName, percentage, amount (income × percentage / 100), description and editable " +
    "(false: the app takes no expenses there). What was spent in an allocation is the sum of " +
    `its expenses (list_expenses); overspending is allowed. ${MONEY} A trashed budget is ` +
    "NOT_FOUND.",
  input: z.object({ budgetId: budgetId.describe("The budget's id.") }),
  run: ({ db }, args) => {
    const result = budgets.get(db, args);
    if (!result.budget) throw new CushnError("NOT_FOUND", "Budget not found");
    return result;
  },
});

const listIcons = defineTool({
  kind: "read",
  name: "list_icons",
  description:
    "Returns the app's catalog of budget icons: { groups }, each group with a label (Money, " +
    "Home, Travel, …) and its icons, each with name (what create_budget and set_budget_icon " +
    "take), label and keywords. Pick the icon whose meaning fits the budget.",
  input: z.object({}),
  run: () => ({ groups: BUDGET_ICON_GROUPS }),
});

const createBudget = defineTool({
  kind: "write",
  name: "create_budget",
  description:
    "Creates an active budget from a template: each of the template's categories becomes an " +
    "allocation with amount = income × percentage / 100. Returns { budgetId }. " +
    `${MONEY} Undo with trash_budgets.`,
  input: z.object({
    templateId: id("templates").describe("The template to split the income by (list_templates)."),
    title: z.string().min(1).describe("The budget's title."),
    currency: currency.describe(
      "ISO 4217 code such as \"usd\". The user's default is get_settings' currency.",
    ),
    income: z
      .number()
      .min(0)
      .optional()
      .describe("The income to plan, in major units of currency. Defaults to 0."),
    description: z.string().nullish().describe("Notes in Markdown."),
    labelId: id("budgetLabels").nullish().describe("A label from list_labels."),
    viewId: id("budgetViews").nullish().describe("A View from list_views to put it in."),
    icon: iconName.nullish().describe("An icon name from list_icons."),
  }),
  idempotent: false,
  changes: ["budgets", "home"],
  run: ({ db }, args) => budgets.create(db, args),
});

const updateBudget = defineTool({
  kind: "write",
  name: "update_budget",
  description:
    "Changes the given fields of an active or archived budget; omitted fields stay. A new " +
    "income recomputes every allocation amount (income × percentage / 100). A new currency " +
    "only relabels the amounts: nothing is converted. Returns { success: true }. Undo by " +
    "calling it again with the previous values from get_budget.",
  input: z.object({
    budgetId: budgetId.describe("The budget to change."),
    title: z.string().min(1).optional().describe("The new title."),
    description: z.string().nullish().describe("New notes in Markdown; null clears them."),
    income: z.number().min(0).optional().describe("The new income, in major units."),
    currency: currency.optional().describe('The new ISO 4217 code such as "eur".'),
  }),
  idempotent: true,
  changes: ["budgets", "expenses", "home"],
  run: ({ db }, args) => budgets.update(db, args),
});

const archiveBudgets = defineTool({
  kind: "write",
  name: "archive_budgets",
  description:
    "Archives budgets: done, kept for reference. They leave list_budgets and the home summary " +
    "for list_archived_budgets, and keep their allocations, expenses, label and View. All or " +
    "nothing. Returns { success: true }. Undo with unarchive_budgets.",
  input: z.object({ budgetIds: budgetIds.describe("The budgets to archive.") }),
  idempotent: true,
  changes: ["budgets", "home"],
  run: ({ db }, args) => budgets.archiveMany(db, args),
});

const unarchiveBudgets = defineTool({
  kind: "write",
  name: "unarchive_budgets",
  description:
    "Makes archived budgets active again. All or nothing. Returns { success: true }. Undo with " +
    "archive_budgets.",
  input: z.object({ budgetIds: budgetIds.describe("The budgets to make active.") }),
  idempotent: true,
  changes: ["budgets", "home"],
  run: ({ db }, args) => budgets.unarchiveMany(db, args),
});

const trashBudgets = defineTool({
  kind: "write",
  name: "trash_budgets",
  description:
    "Moves active or archived budgets to the trash (the app's Delete), with their allocations " +
    "and expenses. Trashed budgets are hidden everywhere but list_trashed_budgets, and the app " +
    "purges them 30 days later. All or nothing; a budget already in the trash is NOT_FOUND. " +
    "Returns { success: true }. Undo with restore_budgets.",
  input: z.object({ budgetIds: budgetIds.describe("The budgets to trash.") }),
  idempotent: false,
  changes: ["budgets", "home"],
  run: ({ db }, args) => budgets.trash(db, args),
});

const restoreBudgets = defineTool({
  kind: "write",
  name: "restore_budgets",
  description:
    "Takes budgets out of the trash, back to the status they had (active or archived). All or " +
    "nothing; a budget not in the trash is NOT_FOUND. Returns { success: true }. Undo with " +
    "trash_budgets.",
  input: z.object({
    budgetIds: budgetIds.describe("Trashed budgets' ids, from list_trashed_budgets."),
  }),
  idempotent: false,
  changes: ["budgets", "home"],
  run: ({ db }, args) => budgets.restore(db, args),
});

const setBudgetLabel = defineTool({
  kind: "write",
  name: "set_budget_label",
  description:
    "Sets a budget's label (a budget has zero or one), or removes it with null. Returns " +
    "{ success: true }. Undo by setting the previous labelId from get_budget.",
  input: z.object({
    budgetId: budgetId.describe("The budget to label."),
    labelId: id("budgetLabels").nullable().describe("A label from list_labels, or null for none."),
  }),
  idempotent: true,
  changes: ["budgets"],
  run: ({ db }, args) => budgets.setLabel(db, args),
});

const setBudgetView = defineTool({
  kind: "write",
  name: "set_budget_view",
  description:
    "Moves a budget into a View (a folder of budgets; a budget is in zero or one), or out of " +
    "its View with null. Returns { success: true }. Undo by setting the previous viewId from " +
    "get_budget.",
  input: z.object({
    budgetId: budgetId.describe("The budget to move."),
    viewId: id("budgetViews").nullable().describe("A View from list_views, or null for none."),
  }),
  idempotent: true,
  changes: ["budgets"],
  run: ({ db }, args) => budgets.setView(db, args),
});

const setBudgetIcon = defineTool({
  kind: "write",
  name: "set_budget_icon",
  description:
    "Sets a budget's icon by name from the app's catalog (list_icons), or clears it with null. " +
    "Returns { success: true }. Undo by setting the previous icon from get_budget.",
  input: z.object({
    budgetId: budgetId.describe("The budget to change."),
    icon: iconName.nullable().describe("An icon name from list_icons, or null for none."),
  }),
  idempotent: true,
  changes: ["budgets"],
  run: ({ db }, args) => budgets.setIcon(db, args),
});

const duplicateBudget = defineTool({
  kind: "write",
  name: "duplicate_budget",
  description:
    'Copies an active or archived budget as an active "<title> (Copy)" with the same income, ' +
    "currency, description, label, View, icon, allocations (amounts as stored) and expenses. " +
    "Returns { newBudgetId }. Undo with trash_budgets on newBudgetId.",
  input: z.object({ budgetId: budgetId.describe("The budget to copy.") }),
  idempotent: false,
  changes: ["budgets", "home"],
  run: ({ db }, args) => budgets.duplicate(db, args),
});

export const budgetTools = [
  listBudgets,
  listArchivedBudgets,
  listTrashedBudgets,
  getBudget,
  listIcons,
  createBudget,
  updateBudget,
  archiveBudgets,
  unarchiveBudgets,
  trashBudgets,
  restoreBudgets,
  setBudgetLabel,
  setBudgetView,
  setBudgetIcon,
  duplicateBudget,
];
