import { QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { invalidateRoots } from "./mutation";
import { createQueryClient } from "./queryClient";

function countingQuery(queryKey: string[]) {
  const query = { queryKey, queryFn: async () => ++query.calls, calls: 0 };
  return query;
}

describe("invalidateRoots", () => {
  it("refetches the observed queries under the root", async () => {
    const client = createQueryClient();
    const detail = countingQuery(["budgets", "detail", "b1"]);
    const observer = new QueryObserver(client, detail);
    const unsubscribe = observer.subscribe(() => {});
    await client.query(detail);

    await invalidateRoots(client, ["budgets"]);

    expect(client.getQueryData(detail.queryKey)).toBe(2);
    unsubscribe();
    client.clear();
  });

  it("leaves unobserved queries to the next loader, which refetches them", async () => {
    const client = createQueryClient();
    const detail = countingQuery(["budgets", "detail", "b1"]);
    await client.query(detail);

    await invalidateRoots(client, ["budgets"]);
    expect(detail.calls).toBe(1);

    expect(await client.query(detail)).toBe(2);
    expect(await client.query(detail)).toBe(2);
    client.clear();
  });

  it("leaves other roots alone", async () => {
    const client = createQueryClient();
    const labels = countingQuery(["labels"]);
    await client.query(labels);

    await invalidateRoots(client, ["budgets"]);

    expect(await client.query(labels)).toBe(1);
    expect(client.getQueryState(labels.queryKey)?.isInvalidated).toBe(false);
    client.clear();
  });
});

describe("createQueryClient", () => {
  it("serves cached data until it is invalidated", async () => {
    const client = createQueryClient();
    const home = countingQuery(["home", "summary"]);
    await client.query(home);

    const observer = new QueryObserver(client, home);
    const unsubscribe = observer.subscribe(() => {});

    expect(observer.getCurrentResult()).toMatchObject({
      data: 1,
      isStale: false,
    });
    expect(home.calls).toBe(1);
    unsubscribe();
    client.clear();
  });
});
