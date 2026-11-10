import { describe, expect, it } from "vitest";
import { isFirstPageLoading, loadMoreControl } from "./loadMore";

describe("loadMoreControl", () => {
  it("is hidden while the first page loads (the list shows its own loading state)", () => {
    expect(loadMoreControl("LoadingFirstPage")).toEqual({ visible: false, loading: false });
  });

  it("shows an idle control when another page exists", () => {
    expect(loadMoreControl("CanLoadMore")).toEqual({ visible: true, loading: false });
  });

  it("stays visible and busy while the next page loads", () => {
    expect(loadMoreControl("LoadingMore")).toEqual({ visible: true, loading: true });
  });

  it("is hidden once every page is loaded", () => {
    expect(loadMoreControl("Exhausted")).toEqual({ visible: false, loading: false });
  });
});

describe("isFirstPageLoading", () => {
  // `isLoading` is also true while a later page loads; the rows must stay, not become a skeleton.
  it("is true only before the first page arrives", () => {
    expect(isFirstPageLoading("LoadingFirstPage")).toBe(true);
    expect(isFirstPageLoading("LoadingMore")).toBe(false);
    expect(isFirstPageLoading("CanLoadMore")).toBe(false);
    expect(isFirstPageLoading("Exhausted")).toBe(false);
  });
});
