import type { PaginationStatus } from "@/data/pagination";

/** Shows while another page exists or is loading; busy while it loads. */
export function loadMoreControl(status: PaginationStatus): {
  visible: boolean;
  loading: boolean;
} {
  return {
    visible: status === "CanLoadMore" || status === "LoadingMore",
    loading: status === "LoadingMore",
  };
}

/** Unlike the hooks' `isLoading`, false while a later page loads, so loaded rows stay put. */
export function isFirstPageLoading(status: PaginationStatus): boolean {
  return status === "LoadingFirstPage";
}
