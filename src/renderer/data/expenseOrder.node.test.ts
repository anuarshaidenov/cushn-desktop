import { describe, expect, it } from "vitest";
import type { ExpenseItem, ResultOf } from "@shared/api";
import type { Id } from "@shared/domain";
import { reorderCachedExpenses } from "./expenseOrder";
import { queryKeys } from "./keys";
import { createQueryClient } from "./queryClient";

type GroupedExpenses = ResultOf<"expenses", "listGrouped">;

const budgetId = "b1" as Id<"budgets">;
const needs = "a1" as Id<"budgetAllocations">;
const wants = "a2" as Id<"budgetAllocations">;

function expense(
  id: string,
  allocationId: Id<"budgetAllocations">,
): ExpenseItem {
  return {
    id: id as Id<"expenses">,
    budgetId,
    allocationId,
    amount: 10,
    description: null,
    title: id,
    createdAt: 0,
    currency: "USD",
    checked: false,
  };
}

function cached() {
  const client = createQueryClient();
  const queryKey = queryKeys.expenses.grouped(budgetId);
  const data: GroupedExpenses = {
    expensesByAllocation: {
      [needs]: [
        expense("e1", needs),
        expense("e2", needs),
        expense("e3", needs),
      ],
      [wants]: [expense("e4", wants)],
    },
  };
  client.setQueryData(queryKey, data);
  const ids = (allocationId: Id<"budgetAllocations">) =>
    client
      .getQueryData<GroupedExpenses>(queryKey)
      ?.expensesByAllocation[allocationId]?.map((item) => item.id);
  return { client, queryKey, data, ids };
}

const order = (...ids: string[]) => ids as Id<"expenses">[];

describe("reorderCachedExpenses", () => {
  it("puts the allocation in the new order and keeps the others", async () => {
    const { client, queryKey, data, ids } = cached();

    await reorderCachedExpenses(client, order("e3", "e1", "e2"));

    expect(ids(needs)).toEqual(["e3", "e1", "e2"]);
    expect(
      client.getQueryData<GroupedExpenses>(queryKey)?.expensesByAllocation[
        wants
      ],
    ).toBe(data.expensesByAllocation[wants]);
    client.clear();
  });

  it("rolls back to the cached order", async () => {
    const { client, ids } = cached();

    const rollback = await reorderCachedExpenses(
      client,
      order("e2", "e3", "e1"),
    );
    rollback();

    expect(ids(needs)).toEqual(["e1", "e2", "e3"]);
    client.clear();
  });

  it("leaves the cache alone for ids that are not one allocation's full list", async () => {
    const { client, data, queryKey } = cached();

    await reorderCachedExpenses(client, order("e2", "e1"));
    await reorderCachedExpenses(client, order("e1", "e2", "e4"));
    await reorderCachedExpenses(client, order("x1", "x2", "x3"));

    expect(client.getQueryData(queryKey)).toBe(data);
    client.clear();
  });
});
