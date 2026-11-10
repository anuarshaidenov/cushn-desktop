import { z } from "zod";
import { CushnError } from "@shared/errors";
import { deletedExpense } from "../../ipc/expenses";
import { id } from "../../ipc/schemas";
import * as budgets from "../../repositories/budgets";
import * as expenses from "../../repositories/expenses";
import { defineTool } from "../tool";

const MONEY = "Amounts are in major units of the budget's own currency (12.5 means 12.50 USD).";

const amount = z.number();
const title = z.string().min(1);
const expenseIds = z.array(id("expenses")).min(1);

const listExpenses = defineTool({
  kind: "read",
  name: "list_expenses",
  description:
    "Lists every expense of one active or archived budget, grouped by allocation: " +
    "{ expensesByAllocation } maps an allocation id (from get_budget) to its expenses in the " +
    "order the user arranged them. An allocation without expenses has no key. Each expense has " +
    "id, budgetId, allocationId, title, amount, description, currency, checked and createdAt " +
    `(epoch ms). ${MONEY} An allocation's spent total is the sum of its amounts. A trashed ` +
    "budget is NOT_FOUND.",
  input: z.object({ budgetId: id("budgets").describe("The budget's id.") }),
  run: ({ db }, args) => {
    if (!budgets.get(db, args).budget) throw new CushnError("NOT_FOUND", "Budget not found");
    return expenses.listGrouped(db, args);
  },
});

const createExpenses = defineTool({
  kind: "write",
  name: "create_expenses",
  description:
    "Adds one or more expenses to one allocation of a budget, after the allocation's existing " +
    "expenses and in the given order. The allocation must belong to the budget (FORBIDDEN " +
    "otherwise) and should be editable (get_budget). All or nothing. Returns { expenseIds } in " +
    `input order. ${MONEY} An amount the user gives in another currency must be converted to ` +
    "the budget's first (get_exchange_rates). Undo with delete_expenses on expenseIds.",
  input: z.object({
    budgetId: id("budgets").describe("The budget to add to."),
    allocationId: id("budgetAllocations").describe("One of the budget's allocations (get_budget)."),
    items: z
      .array(
        z.object({
          title: title.describe("What the money went on."),
          amount: amount.describe("The amount, in major units of the budget's currency."),
          description: z.string().nullish().describe("Optional notes in Markdown."),
        }),
      )
      .min(1)
      .describe("The expenses to add."),
  }),
  idempotent: false,
  changes: ["expenses", "home"],
  run: ({ db }, args) => expenses.createMany(db, args),
});

const updateExpense = defineTool({
  kind: "write",
  name: "update_expense",
  description:
    "Sets an expense's title and amount (both required; read the current ones from " +
    `list_expenses). Returns { expenseId }. ${MONEY} Undo by calling it again with the ` +
    "previous title and amount.",
  input: z.object({
    expenseId: id("expenses").describe("The expense to change."),
    title: title.describe("Its title."),
    amount: amount.describe("Its amount, in major units of the budget's currency."),
  }),
  idempotent: true,
  changes: ["expenses", "home"],
  run: ({ db }, args) => expenses.update(db, args),
});

const duplicateExpense = defineTool({
  kind: "write",
  name: "duplicate_expense",
  description:
    "Copies an expense's title, amount and checked flag (not its description) to the end of " +
    "the same allocation. Returns { newExpenseId }. Undo with delete_expenses on newExpenseId.",
  input: z.object({ expenseId: id("expenses").describe("The expense to copy.") }),
  idempotent: false,
  changes: ["expenses", "home"],
  run: ({ db }, args) => expenses.duplicate(db, args),
});

const deleteExpenses = defineTool({
  kind: "write",
  name: "delete_expenses",
  description:
    "Deletes expenses, all or nothing: one unknown id deletes none. Returns { deletedCount, " +
    "deleted }, where deleted holds the full removed rows. Keep them: passing deleted to " +
    "restore_expenses as is puts the expenses back under the same ids and order (the undo).",
  input: z.object({ expenseIds: expenseIds.describe("The expenses to delete.") }),
  idempotent: false,
  changes: ["expenses", "home"],
  run: ({ db }, args) => expenses.deleteMany(db, args),
});

const restoreExpenses = defineTool({
  kind: "write",
  name: "restore_expenses",
  description:
    "Undoes delete_expenses: re-inserts the rows it returned in deleted, under their own ids, " +
    "order and createdAt. Their budget must not be in the trash and their allocation must " +
    "still exist; an id that already exists is CONFLICT. All or nothing. Returns " +
    "{ success: true }. Undo with delete_expenses on the same ids.",
  input: z.object({
    expenses: z
      .array(deletedExpense)
      .min(1)
      .describe("The deleted array from delete_expenses, unchanged."),
  }),
  idempotent: false,
  changes: ["expenses", "home"],
  run: ({ db }, args) => expenses.restoreMany(db, args),
});

const reorderExpenses = defineTool({
  kind: "write",
  name: "reorder_expenses",
  description:
    "Sets the order of one allocation's expenses: pass all of its expense ids in the new " +
    "order. All or nothing. Returns { success: true }. Undo by passing the previous order " +
    "from list_expenses.",
  input: z.object({
    orderedIds: expenseIds.describe("Every expense id of one allocation, first to last."),
  }),
  idempotent: true,
  changes: ["expenses"],
  run: ({ db }, args) => expenses.reorder(db, args),
});

export const expenseTools = [
  listExpenses,
  createExpenses,
  updateExpense,
  duplicateExpense,
  deleteExpenses,
  restoreExpenses,
  reorderExpenses,
];
