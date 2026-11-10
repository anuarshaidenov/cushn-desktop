/**
 * Cursor-paged `useInfiniteQuery`, shaped like the web app's paginated query
 * so ported call sites barely change.
 */
import {
  type InfiniteData,
  type InfiniteQueryObserverResult,
  type QueryKey,
  infiniteQueryOptions,
  useInfiniteQuery,
} from "@tanstack/react-query";
import type { Page, PageArgs } from "@shared/api";
import type { CushnError } from "@shared/errors";

export type PaginationStatus = "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";

/** The web app's paginated query result. */
export interface PaginatedQueryResult<T> {
  /** Every loaded page, concatenated. */
  results: T[];
  status: PaginationStatus;
  /** A no-op unless `status` is "CanLoadMore"; the argument is ignored, the page size is fixed per hook. */
  loadMore: (numItems: number) => void;
  /** "LoadingFirstPage" or "LoadingMore". */
  isLoading: boolean;
}

type Cursor = string | null;

/** Each page asks for the previous page's `continueCursor` (`null` first), until one says `isDone`. */
export function pagedQueryOptions<T, TKey extends QueryKey>({
  queryKey,
  fetchPage,
  pageSize,
}: {
  queryKey: TKey;
  fetchPage: (args: PageArgs) => Promise<Page<T>>;
  pageSize: number;
}) {
  return infiniteQueryOptions<Page<T>, CushnError, InfiniteData<Page<T>, Cursor>, TKey, Cursor>({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage({ cursor: pageParam, numItems: pageSize }),
    initialPageParam: null,
    getNextPageParam: (last) => (last.isDone ? undefined : (last.continueCursor ?? undefined)),
  });
}

/** Maps an infinite query's state onto the `usePaginatedQuery` shape. */
export function toPaginatedResult<T>(
  query: InfiniteQueryObserverResult<InfiniteData<Page<T>, Cursor>, CushnError>,
): PaginatedQueryResult<T> {
  const status: PaginationStatus = query.isPending
    ? "LoadingFirstPage"
    : query.isFetchingNextPage
      ? "LoadingMore"
      : query.hasNextPage
        ? "CanLoadMore"
        : "Exhausted";
  return {
    results: query.data?.pages.flatMap((page) => page.page) ?? [],
    status,
    loadMore: () => {
      // fetchNextPage would cancel an in-flight refetch and keep stale pages.
      if (query.hasNextPage && !query.isFetching) void query.fetchNextPage();
    },
    isLoading: status === "LoadingFirstPage" || status === "LoadingMore",
  };
}

/** Errors go to the nearest error boundary: the result shape has no error field. */
export function usePaginatedQuery<T, TKey extends QueryKey>(
  options: ReturnType<typeof pagedQueryOptions<T, TKey>>,
): PaginatedQueryResult<T> {
  return toPaginatedResult(useInfiniteQuery({ ...options, throwOnError: true }));
}
