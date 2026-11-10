// Drives the paginated engine through TanStack's own observer (what `useInfiniteQuery` wraps).
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Page, PageArgs } from "@shared/api";
import { type PaginatedQueryResult, pagedQueryOptions, toPaginatedResult } from "./pagination";

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

/** A page source over the items 0…count-1; `hold()` parks fetches until its returned release is called. */
function pager(count: number) {
  const calls: PageArgs[] = [];
  const items = range(0, count);
  let gate: Promise<void> | undefined;
  const fetchPage = async ({ cursor, numItems }: PageArgs): Promise<Page<number>> => {
    calls.push({ cursor, numItems });
    await gate;
    const after = items.findIndex((item) => item > Number(cursor));
    const start = cursor === null ? 0 : after === -1 ? items.length : after;
    const page = items.slice(start, start + numItems);
    const isDone = start + numItems >= items.length;
    return { page, continueCursor: isDone ? null : String(page.at(-1)), isDone };
  };
  const hold = () => {
    let release = () => {};
    gate = new Promise((resolve) => (release = resolve));
    return () => {
      gate = undefined;
      release();
    };
  };
  return { calls, items, fetchPage, hold };
}

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
});

function observe(count: number, pageSize: number) {
  const source = pager(count);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const observer = new InfiniteQueryObserver(
    client,
    pagedQueryOptions({
      queryKey: ["budgets", "active", {}, { pageSize }],
      fetchPage: source.fetchPage,
      pageSize,
    }),
  );
  const unsubscribe = observer.subscribe(() => {});
  cleanup = () => {
    unsubscribe();
    client.clear();
  };
  const current = (): PaginatedQueryResult<number> =>
    toPaginatedResult(observer.getCurrentResult());
  return { source, client, current };
}

describe("paginated budget hooks", () => {
  it("starts in LoadingFirstPage, then shows the first page with CanLoadMore", async () => {
    const { source, current } = observe(60, 25);

    expect(current()).toMatchObject({ results: [], status: "LoadingFirstPage", isLoading: true });

    await vi.waitFor(() => expect(current().status).toBe("CanLoadMore"));
    expect(current()).toMatchObject({ results: range(0, 25), isLoading: false });
    expect(source.calls).toEqual([{ cursor: null, numItems: 25 }]);
  });

  it("loadMore fetches the next page after the previous continueCursor until Exhausted", async () => {
    const { source, current } = observe(60, 25);
    await vi.waitFor(() => expect(current().status).toBe("CanLoadMore"));

    current().loadMore(25);
    expect(current()).toMatchObject({ status: "LoadingMore", isLoading: true });
    await vi.waitFor(() => expect(current().results).toHaveLength(50));
    expect(current().status).toBe("CanLoadMore");

    current().loadMore(25);
    await vi.waitFor(() => expect(current().status).toBe("Exhausted"));
    expect(current()).toMatchObject({ results: range(0, 60), isLoading: false });
    expect(source.calls).toEqual([
      { cursor: null, numItems: 25 },
      { cursor: "24", numItems: 25 },
      { cursor: "49", numItems: 25 },
    ]);
  });

  it("ignores loadMore while a page is loading or once exhausted", async () => {
    const { source, current } = observe(30, 25);
    await vi.waitFor(() => expect(current().status).toBe("CanLoadMore"));

    current().loadMore(25);
    current().loadMore(25);
    await vi.waitFor(() => expect(current().status).toBe("Exhausted"));
    current().loadMore(25);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(source.calls).toHaveLength(2);
    expect(current().results).toEqual(range(0, 30));
  });

  it("ignores loadMore during a refetch, so the refetch's fresh pages replace the stale ones", async () => {
    const { source, client, current } = observe(60, 25);
    await vi.waitFor(() => expect(current().status).toBe("CanLoadMore"));

    source.items.shift(); // e.g. the first budget was archived
    const release = source.hold();
    void client.invalidateQueries();
    await vi.waitFor(() => expect(client.isFetching()).toBe(1));
    current().loadMore(25);
    release();
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));

    expect(current().results).toEqual(range(1, 26));
  });

  it("is Exhausted straight away when everything fits on the first page", async () => {
    const { current } = observe(3, 25);
    await vi.waitFor(() => expect(current().status).toBe("Exhausted"));
    expect(current().results).toEqual([0, 1, 2]);
  });
});
