import { queryOptions, useQuery } from "@tanstack/react-query";
import { cushn } from "./client";
import { queryKeys } from "./keys";
import { useInvalidatingMutation } from "./mutation";

/** Query option factories, for route loaders. */
export const settingsQueries = {
  get: () =>
    queryOptions({
      queryKey: queryKeys.settings.get(),
      queryFn: () => cushn.settings.get(),
    }),
};

/** `{ settings: { currency, budgetView, theme } }` */
export function useSettings() {
  return useQuery(settingsQueries.get());
}

/** Patches only the given fields: `mutate({ theme: "dark" })`. */
export function useUpdateSettings() {
  return useInvalidatingMutation(cushn.settings.update, ["settings"]);
}
