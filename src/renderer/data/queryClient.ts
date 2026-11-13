import { QueryClient } from "@tanstack/react-query";

/**
 * Data changes only through invalidation (this app's mutations and main's change event), so
 * cached data stays fresh until then; a failed IPC call would fail the same way on a retry.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        retry: false,
      },
    },
  });
}
