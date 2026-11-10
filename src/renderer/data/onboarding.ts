import { queryOptions, useQuery } from "@tanstack/react-query";
import { cushn } from "./client";
import { queryKeys } from "./keys";
import { useInvalidatingMutation } from "./mutation";

/** Query option factories, for route loaders. */
export const onboardingQueries = {
  get: () =>
    queryOptions({
      queryKey: queryKeys.onboarding.get(),
      queryFn: () => cushn.onboarding.get(),
    }),
};

/** `{ completedAt }`: epoch ms, or `null` while onboarding is due. */
export function useOnboarding() {
  return useQuery(onboardingQueries.get());
}

/** `mutate()` → `{ success: true }`; keeps the first completion time. */
export function useCompleteOnboarding() {
  return useInvalidatingMutation(cushn.onboarding.complete, ["onboarding"]);
}
