import { type QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ChangedEvent } from "@shared/api";
import { changedRoots, subscribeToChanges } from "./changes";
import { createQueryClient } from "./queryClient";

function fakeBridge() {
  const listeners = new Set<(event: ChangedEvent) => void>();
  return {
    onChanged: (listener: (event: ChangedEvent) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit: (event: unknown) => {
      for (const listener of listeners) listener(event as ChangedEvent);
    },
    listeners,
  };
}

function countingQuery(queryKey: string[]) {
  const query = { queryKey, queryFn: async () => ++query.calls, calls: 0 };
  return query;
}

async function settled(client: QueryClient) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await vi.waitFor(() => expect(client.isFetching()).toBe(0));
}

describe("changedRoots", () => {
  it("keeps known roots once each, in order", () => {
    expect(changedRoots({ roots: ["home", "budgets", "home"] })).toEqual([
      "home",
      "budgets",
    ]);
  });

  it("drops unknown roots and non-strings", () => {
    expect(
      changedRoots({ roots: ["budgets", "backup", "constructor", 1, null] }),
    ).toEqual(["budgets"]);
  });

  it("answers nothing for a malformed event", () => {
    expect(changedRoots(undefined)).toEqual([]);
    expect(changedRoots(null)).toEqual([]);
    expect(changedRoots("budgets")).toEqual([]);
    expect(changedRoots({})).toEqual([]);
    expect(changedRoots({ roots: "budgets" })).toEqual([]);
  });
});

describe("subscribeToChanges", () => {
  it("refetches observed queries under each changed root and leaves the others", async () => {
    const client = createQueryClient();
    const bridge = fakeBridge();
    const budgets = countingQuery(["budgets", "detail", "b1"]);
    const home = countingQuery(["home", "summary"]);
    const labels = countingQuery(["labels"]);
    const unsubscribes = [budgets, home, labels].map((query) =>
      new QueryObserver(client, query).subscribe(() => {}),
    );
    await settled(client);
    subscribeToChanges(client, bridge.onChanged);

    bridge.emit({ roots: ["budgets", "home", "agents"] });
    await settled(client);

    expect([budgets.calls, home.calls, labels.calls]).toEqual([2, 2, 1]);
    for (const unsubscribe of unsubscribes) unsubscribe();
    client.clear();
  });

  it("marks unobserved queries for the next loader instead of refetching them", async () => {
    const client = createQueryClient();
    const bridge = fakeBridge();
    const budgets = countingQuery(["budgets", "detail", "b1"]);
    await client.query(budgets);
    subscribeToChanges(client, bridge.onChanged);

    bridge.emit({ roots: ["budgets"] });
    await settled(client);

    expect(budgets.calls).toBe(1);
    expect(client.getQueryState(budgets.queryKey)?.isInvalidated).toBe(true);
    client.clear();
  });

  it("stops after unsubscribing", async () => {
    const client = createQueryClient();
    const bridge = fakeBridge();
    const budgets = countingQuery(["budgets"]);
    await client.query(budgets);
    const unsubscribe = subscribeToChanges(client, bridge.onChanged);

    unsubscribe();
    bridge.emit({ roots: ["budgets"] });
    await settled(client);

    expect(bridge.listeners.size).toBe(0);
    expect(client.getQueryState(budgets.queryKey)?.isInvalidated).toBe(false);
    client.clear();
  });
});
