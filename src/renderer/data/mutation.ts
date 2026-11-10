import {
  type QueryClient,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { CushnError } from "@shared/errors";
import { type QueryRoot, queryKeys } from "./keys";

/** Invalidates every query under each root, refetching unobserved ones too so no screen mounts on stale data. */
export function invalidateRoots(
  queryClient: QueryClient,
  roots: readonly QueryRoot[],
): Promise<unknown> {
  return Promise.all(
    roots.map((root) =>
      queryClient.invalidateQueries({ queryKey: queryKeys[root].root, refetchType: "all" }),
    ),
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
