import {
  type QueryClient,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { CushnError } from "@shared/errors";
import { type QueryRoot, queryKeys } from "./keys";

/**
 * Invalidates every query under each root and refetches the observed ones. An unobserved one
 * refetches when its route's loader runs (`queryClient.query`) or its screen mounts.
 */
export function invalidateRoots(
  queryClient: QueryClient,
  roots: readonly QueryRoot[],
): Promise<unknown> {
  return Promise.all(
    roots.map((root) => queryClient.invalidateQueries({ queryKey: queryKeys[root].root })),
  );
}

/** `useMutation` that invalidates the roots on success and resolves after the refetch, so `isPending` covers it. */
export function useInvalidatingMutation<TArgs, TResult>(
  mutationFn: (args: TArgs) => Promise<TResult>,
  invalidates: readonly QueryRoot[],
): UseMutationResult<TResult, CushnError, TArgs> {
  const queryClient = useQueryClient();
  return useMutation<TResult, CushnError, TArgs>({
    mutationFn,
    onSuccess: () => invalidateRoots(queryClient, invalidates),
  });
}
