import { queryOptions, useQuery } from "@tanstack/react-query";
import { cushn } from "./client";
import { queryKeys } from "./keys";

/** Query option factories, for route loaders. */
export const ratesQueries = {
  get: () =>
    queryOptions({
      queryKey: queryKeys.rates.get(),
      queryFn: () => cushn.rates.get(),
      // Main refreshes its 12-hour cache only when asked; the hour spares the IPC round trip.
      staleTime: 60 * 60 * 1000,
      refetchOnWindowFocus: true,
    }),
};

/** USD-based rates, or `null` when none were ever fetched (offline since install). */
export function useExchangeRates() {
  return useQuery(ratesQueries.get());
}
