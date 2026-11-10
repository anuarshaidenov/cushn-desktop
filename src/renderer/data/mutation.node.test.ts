import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { invalidateRoots } from "./mutation";

describe("invalidateRoots", () => {
  it("refetches cached queries under the root that no screen observes", async () => {
    const client = new QueryClient();
    let label = "Old";
    const detail = { queryKey: ["budgets", "detail", "b1"], queryFn: async () => label };
    await client.fetchQuery(detail);

    label = "New";
    await invalidateRoots(client, ["budgets"]);

    expect(client.getQueryData(detail.queryKey)).toBe("New");
    client.clear();
  });

  it("leaves other roots alone", async () => {
    const client = new QueryClient();
    let calls = 0;
    const labels = { queryKey: ["labels"], queryFn: async () => ++calls };
    await client.fetchQuery(labels);

    await invalidateRoots(client, ["budgets"]);

    expect(calls).toBe(1);
    client.clear();
  });
});
