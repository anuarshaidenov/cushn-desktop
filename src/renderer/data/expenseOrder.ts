/** The optimistic side of `useReorderExpenses`. Pure, so it stays node-testable. */
import type { QueryClient } from "@tanstack/react-query";
import type { ExpenseItem, ResultOf } from "@shared/api";
import type { Id } from "@shared/domain";
import { queryKeys } from "./keys";

type GroupedExpenses = ResultOf<"expenses", "listGrouped">;

/**
 * Puts the cached allocation holding `orderedIds` in that order at once; returns the rollback.
 * Ids that are not exactly one cached allocation's list leave the cache alone.
 */
export async function reorderCachedExpenses(
  queryClient: QueryClient,
  orderedIds: readonly Id<"expenses">[],
): Promise<() => void> {
  const [queryKey] =
    queryClient
      .getQueriesData<GroupedExpenses>({
        queryKey: queryKeys.expenses.allGrouped(),
      })
      .find(([, data]) => data && reordered(data, orderedIds)) ?? [];
  if (!queryKey) return () => {};

  // An in-flight refetch would land the old order over this one.
  await queryClient.cancelQueries({ queryKey });
  const previous = queryClient.getQueryData<GroupedExpenses>(queryKey);
  const next = previous && reordered(previous, orderedIds);
  if (next) queryClient.setQueryData(queryKey, next);
  return () => queryClient.setQueryData(queryKey, previous);
}

function reordered(
  data: GroupedExpenses,
  orderedIds: readonly Id<"expenses">[],
): GroupedExpenses | undefined {
  for (const [allocationId, expenses = []] of Object.entries(
    data.expensesByAllocation,
  )) {
    if (expenses.length !== orderedIds.length) continue;
    const byId = new Map(expenses.map((expense) => [expense.id, expense]));
    const list = orderedIds.map((id) => byId.get(id));
    if (
      list.every((expense): expense is ExpenseItem => expense !== undefined)
    ) {
      return {
        expensesByAllocation: {
          ...data.expensesByAllocation,
          [allocationId]: list,
        },
      };
    }
  }
  return undefined;
}
