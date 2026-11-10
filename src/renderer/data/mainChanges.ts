/** Like `platform.ts`, a direct reader of `window.cushn`, kept out of `changes.ts` so that stays node-testable. */
import type { QueryClient } from "@tanstack/react-query";
import { subscribeToChanges } from "./changes";

/** Refetches the roots main reports changed (an agent's write); returns the unsubscribe. */
export function refetchOnMainChanges(queryClient: QueryClient): () => void {
  return subscribeToChanges(queryClient, (listener) =>
    window.cushn.onChanged(listener),
  );
}
