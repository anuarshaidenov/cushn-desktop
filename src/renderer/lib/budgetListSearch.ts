import { z } from "zod";

export const budgetListSearchSchema = z.object({
  q: z.string().optional(),
  labelIds: z.string().optional(),
  templateIds: z.string().optional(),
  currencies: z.string().optional(),
  sortBy: z.union([z.literal("createdAt"), z.literal("income")]).optional(),
  sortOrder: z.union([z.literal("asc"), z.literal("desc")]).optional(),
  fromViewId: z.string().optional(),
});

export type BudgetListSearch = z.infer<typeof budgetListSearchSchema>;

export function stripFromViewId(search: BudgetListSearch): BudgetListSearch {
  const { fromViewId: _fromViewId, ...rest } = search;
  return rest;
}

/** Pass as the select root's `items`: otherwise Base UI's `Select.Value` renders the raw value. */
export const sortByLabels = {
  createdAt: "Created",
  income: "Income",
} satisfies Record<NonNullable<BudgetListSearch["sortBy"]>, string>;
