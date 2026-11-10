/** Main's `cushn:changed` event → invalidations. Pure: `mainChanges.ts` passes the bridge. */
import type { QueryClient } from "@tanstack/react-query";
import type { CushnBridge } from "@shared/api";
import { ALL_QUERY_ROOTS, type QueryRoot } from "./keys";
import { invalidateRoots } from "./mutation";

const knownRoots: ReadonlySet<string> = new Set(ALL_QUERY_ROOTS);

/** The event's known roots, once each; it crosses a process boundary, so anything else is dropped. */
export function changedRoots(event: unknown): QueryRoot[] {
  if (typeof event !== "object" || event === null) return [];
  const { roots } = event as { roots?: unknown };
  if (!Array.isArray(roots)) return [];
  const known = roots.filter(
    (root): root is QueryRoot =>
      typeof root === "string" && knownRoots.has(root),
  );
  return [...new Set(known)];
}

/** Invalidates the roots of each event on `queryClient`; returns the unsubscribe. */
export function subscribeToChanges(
  queryClient: QueryClient,
  onChanged: CushnBridge["onChanged"],
): () => void {
  return onChanged((event) => {
    const roots = changedRoots(event);
    if (roots.length > 0) void invalidateRoots(queryClient, roots);
  });
}
