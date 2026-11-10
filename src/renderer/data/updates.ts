import { queryOptions, useQuery } from "@tanstack/react-query";
import { cushn } from "./client";
import { queryKeys } from "./keys";
import { useInvalidatingMutation } from "./mutation";

/** Query option factories, for route loaders. */
export const updatesQueries = {
  status: () =>
    queryOptions({
      queryKey: queryKeys.updates.status(),
      queryFn: () => cushn.updates.status(),
      // Main's change event refetches it once an update has downloaded.
      staleTime: Infinity,
    }),
};

/** `{ state: "ready", version }` once an update has downloaded, else `{ state: "none" }`. */
export function useUpdateStatus() {
  return useQuery(updatesQueries.status());
}

/** Quits and restarts into the downloaded update, so it stays pending until the app quits. */
export function useInstallUpdate() {
  return useInvalidatingMutation(cushn.updates.install, []);
}
