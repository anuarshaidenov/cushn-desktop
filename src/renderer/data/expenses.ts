import { queryOptions, useQuery } from "@tanstack/react-query";
import type { Id } from "@shared/domain";
import { cushn } from "./client";
import { queryKeys } from "./keys";
import { useInvalidatingMutation } from "./mutation";
import { useUndoableMutation } from "./undoable";

/** Query option factories, for route loaders. */
export const expenseQueries = {
  grouped: (budgetId: Id<"budgets">) =>
    queryOptions({
      queryKey: queryKeys.expenses.grouped(budgetId),
      queryFn: () => cushn.expenses.listGrouped({ budgetId }),
    }),
  chart: (budgetId: Id<"budgets">) =>
    queryOptions({
      queryKey: queryKeys.expenses.chart(budgetId),
      queryFn: () => cushn.expenses.chartData({ budgetId }),
    }),
};

/** `{ expensesByAllocation }` in manual order; an allocation without expenses has no key, a missing budget gives `{}`. */
export function useBudgetExpenses(budgetId: Id<"budgets">) {
  return useQuery(expenseQueries.grouped(budgetId));
}

/** `{ expensesData: { name, value }[], total }`: one entry per expense of the whole budget. */
export function useExpenseChartData(budgetId: Id<"budgets">) {
  return useQuery(expenseQueries.chart(budgetId));
}

/** → `{ expenseId }`. The allocation must belong to the budget (FORBIDDEN otherwise). */
export function useCreateExpense() {
  return useInvalidatingMutation(cushn.expenses.create, ["expenses", "home"]);
}

/** → `{ expenseIds }` in input order. All or nothing. */
export function useCreateExpenses() {
  return useInvalidatingMutation(cushn.expenses.createMany, ["expenses", "home"]);
}

/** Patches only `amount` and `title`. */
export function useUpdateExpense() {
  return useInvalidatingMutation(cushn.expenses.update, ["expenses", "home"]);
}

/** → `{ newExpenseId }`, appended to the same allocation (description not copied). */
export function useDuplicateExpense() {
  return useInvalidatingMutation(cushn.expenses.duplicate, ["expenses", "home"]);
}

/** Undoable: undo re-inserts the deleted rows. One missing id fails the call and deletes nothing. */
export function useDeleteExpenses() {
  return useUndoableMutation(cushn.expenses.deleteMany, ["expenses", "home"], {
    label: (_, { deleted }) =>
      deleted.length === 1
        ? `Delete “${deleted[0].title}”`
        : `Delete ${deleted.length} expenses`,
    inverse: (_, { deleted }) => cushn.expenses.restoreMany({ expenses: deleted }),
  });
}

/** Re-inserts deleted rows under their own ids; all or nothing. */
export function useRestoreExpenses() {
  return useInvalidatingMutation(cushn.expenses.restoreMany, ["expenses", "home"]);
}

/** `orderedIds`: one allocation's full list after a drag; sets `order = index`. */
export function useReorderExpenses() {
  return useInvalidatingMutation(cushn.expenses.reorder, ["expenses"]);
}
