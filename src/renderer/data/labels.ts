import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { cushn } from "./client";
import { queryKeys } from "./keys";
import { useInvalidatingMutation } from "./mutation";

/** Query option factories, for route loaders. */
export const labelQueries = {
  list: () =>
    queryOptions({
      queryKey: queryKeys.labels.list(),
      queryFn: () => cushn.labels.list(),
    }),
};

/** `{ labels }` in creation order (built-in labels first). */
export function useLabels() {
  return useQuery(labelQueries.list());
}

export function useSuspenseLabels() {
  return useSuspenseQuery(labelQueries.list());
}

/** → `{ labelId }` */
export function useCreateLabel() {
  return useInvalidatingMutation(cushn.labels.create, ["labels"]);
}

/** Budgets embed their label, so budget queries refresh too. */
export function useUpdateLabelColor() {
  return useInvalidatingMutation(cushn.labels.updateColor, ["labels", "budgets"]);
}

export function useUpdateLabelName() {
  return useInvalidatingMutation(cushn.labels.updateName, ["labels", "budgets"]);
}

/** Budgets carrying the label lose it (`label_id` → NULL). */
export function useDeleteLabel() {
  return useInvalidatingMutation(cushn.labels.delete, ["labels", "budgets"]);
}
