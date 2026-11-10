import { z } from "zod";
import * as expenses from "../repositories/expenses";
import type { CushnHandlers } from "./handler";
import { id } from "./schemas";

const budgetId = z.object({ budgetId: id("budgets") });

/** zod 4's `z.number()` already rejects NaN and ±Infinity. The repository rounds it. */
const amount = z.number();

/** A row `deleteMany` returned, as `restoreMany` takes it back. */
export const deletedExpense = z.object({
  id: id("expenses"),
  budgetId: id("budgets"),
  allocationId: id("budgetAllocations"),
  amount,
  title: z.string(),
  description: z.string().nullable(),
  order: z.number().int(),
  checked: z.boolean(),
  createdAt: z.number().int(),
});

export const expenseHandlers: CushnHandlers["expenses"] = {
  listGrouped: {
    args: budgetId,
    run: ({ db }, args) => expenses.listGrouped(db, args),
  },
  chartData: {
    args: budgetId,
    run: ({ db }, args) => expenses.chartData(db, args),
  },
  create: {
    args: z.object({
      budgetId: id("budgets"),
      allocationId: id("budgetAllocations"),
      amount,
      title: z.string(),
    }),
    run: ({ db }, args) => expenses.create(db, args),
  },
  createMany: {
    args: z.object({
      budgetId: id("budgets"),
      allocationId: id("budgetAllocations"),
      items: z.array(
        z.object({ title: z.string(), amount, description: z.string().nullish() }),
      ),
    }),
    run: ({ db }, args) => expenses.createMany(db, args),
  },
  update: {
    args: z.object({ expenseId: id("expenses"), amount, title: z.string() }),
    run: ({ db }, args) => expenses.update(db, args),
  },
  duplicate: {
    args: z.object({ expenseId: id("expenses") }),
    run: ({ db }, args) => expenses.duplicate(db, args),
  },
  deleteMany: {
    args: z.object({ expenseIds: z.array(id("expenses")) }),
    run: ({ db }, args) => expenses.deleteMany(db, args),
  },
  restoreMany: {
    args: z.object({ expenses: z.array(deletedExpense) }),
    run: ({ db }, args) => expenses.restoreMany(db, args),
  },
  reorder: {
    args: z.object({ orderedIds: z.array(id("expenses")) }),
    run: ({ db }, args) => expenses.reorder(db, args),
  },
};
