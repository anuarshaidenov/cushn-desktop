import { queryOptions, useQuery } from "@tanstack/react-query";
import { cushn } from "./client";
import { queryKeys } from "./keys";

/** Query option factories, for route loaders. */
export const homeQueries = {
  summary: () =>
    queryOptions({
      queryKey: queryKeys.home.summary(),
      queryFn: () => cushn.home.summary(),
    }),
};

/** `{ main, others, overspent }`, built from active budgets only. */
export function useHomeSummary() {
  return useQuery(homeQueries.summary());
}
