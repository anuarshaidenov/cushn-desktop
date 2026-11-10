import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { AgentKind, AgentStatus } from "@shared/api";
import type { CushnError } from "@shared/errors";
import { cushn } from "./client";
import { queryKeys } from "./keys";
import { invalidateRoots } from "./mutation";

/** Query option factories, for route loaders. */
export const agentsQueries = {
  list: () =>
    queryOptions({
      queryKey: queryKeys.agents.list(),
      queryFn: () => cushn.agents.list(),
      // Detection spawns the CLIs; sign-ins change outside the app, so refocus rechecks.
      staleTime: 30 * 1000,
      refetchOnWindowFocus: true,
    }),
  socket: () =>
    queryOptions({
      queryKey: queryKeys.agents.socket(),
      queryFn: () => cushn.agents.socket(),
      // Main starts listening as the app launches; once it listens or fails, it stays so.
      refetchInterval: (query) =>
        query.state.data?.state === "starting" ? 1000 : false,
    }),
};

/** One `AgentStatus` per client: installation, account and whether Cushn is connected. */
export function useAgents() {
  return useQuery(agentsQueries.list());
}

/** Whether connected agents can reach Cushn: `failed` carries the reason to show. */
export function useAgentSocket() {
  return useQuery(agentsQueries.socket());
}

/** Registers Cushn with each client in turn: `mutate({ kinds: ["claude-code", "claude-desktop"] })`. */
export function useConnectAgents() {
  return useEachAgentMutation(cushn.agents.connect);
}

/** Removes exactly what `connect` added, from each client in turn. */
export function useDisconnectAgents() {
  return useEachAgentMutation(cushn.agents.disconnect);
}

/**
 * Tries every kind, then rejects with the first failure. Refetches on settle, not only on
 * success, so a half-done run still shows the clients that did change.
 */
function useEachAgentMutation(
  run: (args: { kind: AgentKind }) => Promise<AgentStatus>,
) {
  const queryClient = useQueryClient();
  return useMutation<void, CushnError, { kinds: readonly AgentKind[] }>({
    mutationFn: async ({ kinds }) => {
      let failure: unknown;
      for (const kind of kinds) {
        try {
          await run({ kind });
        } catch (error) {
          failure ??= error;
        }
      }
      if (failure) throw failure;
    },
    onSettled: () => invalidateRoots(queryClient, ["agents"]),
  });
}
