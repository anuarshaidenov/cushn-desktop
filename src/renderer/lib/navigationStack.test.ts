import { describe, expect, it } from "vitest";
import { createMemoryHistory } from "@tanstack/react-router";
import {
  isOtherPage,
  reduceNavigationStack,
  startNavigationStack,
  stepsBackTo,
  trackNavigation,
  type NavigationStack,
} from "./navigationStack";

const page = (pathname: string) => ({ pathname });
const pathnames = (stack: NavigationStack) =>
  stack.entries.map((entry) => entry?.pathname);

describe("reduceNavigationStack", () => {
  const start = startNavigationStack(0, page("/dashboard/home"));

  it("appends on push", () => {
    const stack = reduceNavigationStack(start, {
      type: "PUSH",
      index: 1,
      entry: page("/dashboard/b1"),
    });
    expect(pathnames(stack)).toEqual(["/dashboard/home", "/dashboard/b1"]);
    expect(stack.index).toBe(1);
  });

  it("drops the forward entries on a push after going back", () => {
    let stack = reduceNavigationStack(start, {
      type: "PUSH",
      index: 1,
      entry: page("/a"),
    });
    stack = reduceNavigationStack(stack, {
      type: "PUSH",
      index: 2,
      entry: page("/b"),
    });
    stack = reduceNavigationStack(stack, {
      type: "BACK",
      index: 1,
      entry: page("/a"),
    });
    stack = reduceNavigationStack(stack, {
      type: "PUSH",
      index: 2,
      entry: page("/c"),
    });
    expect(pathnames(stack)).toEqual(["/dashboard/home", "/a", "/c"]);
  });

  it("overwrites the current entry on replace and keeps the forward ones", () => {
    let stack = reduceNavigationStack(start, {
      type: "PUSH",
      index: 1,
      entry: page("/a"),
    });
    stack = reduceNavigationStack(stack, {
      type: "GO",
      index: 0,
      entry: page("/dashboard/home"),
    });
    stack = reduceNavigationStack(stack, {
      type: "REPLACE",
      index: 0,
      entry: page("/dashboard"),
    });
    expect(pathnames(stack)).toEqual(["/dashboard", "/a"]);
    expect(stack.index).toBe(0);
  });

  it("only moves the index on back, forward and go", () => {
    let stack = reduceNavigationStack(start, {
      type: "PUSH",
      index: 1,
      entry: page("/a"),
    });
    stack = reduceNavigationStack(stack, {
      type: "BACK",
      index: 0,
      entry: page("/dashboard/home"),
    });
    expect(pathnames(stack)).toEqual(["/dashboard/home", "/a"]);
    expect(stack.index).toBe(0);
  });

  it("leaves entries from before the start unknown", () => {
    const stack = startNavigationStack(2, page("/dashboard/b1"));
    expect(pathnames(stack)).toEqual([undefined, undefined, "/dashboard/b1"]);
  });
});

describe("stepsBackTo", () => {
  const stackOf = (paths: Array<string | undefined>): NavigationStack => ({
    entries: paths.map((path) => (path ? page(path) : undefined)),
    index: paths.length - 1,
  });

  it("finds the nearest earlier page with another pathname", () => {
    expect(
      stepsBackTo(stackOf(["/dashboard/home", "/dashboard/b1"]), isOtherPage),
    ).toBe(1);
  });

  // Search-only changes on one page are not pages: Escape leaves the page instead of undoing a filter.
  it("skips entries with the current pathname", () => {
    expect(
      stepsBackTo(
        stackOf([
          "/dashboard/home",
          "/dashboard/b1",
          "/dashboard/b1",
          "/dashboard/b1",
        ]),
        isOtherPage,
      ),
    ).toBe(3);
  });

  it("is undefined when no earlier entry matches", () => {
    expect(
      stepsBackTo(stackOf(["/dashboard/b1"]), isOtherPage),
    ).toBeUndefined();
    expect(
      stepsBackTo(stackOf(["/dashboard/b1", "/dashboard/b1"]), isOtherPage),
    ).toBeUndefined();
  });

  it("stops at an unknown entry rather than guess past it", () => {
    expect(
      stepsBackTo(
        stackOf(["/dashboard/home", undefined, "/dashboard/b1"]),
        isOtherPage,
      ),
    ).toBeUndefined();
  });

  it("passes the current entry to the predicate", () => {
    const outsideSettings = stepsBackTo(
      stackOf(["/dashboard/b1", "/settings", "/settings/labels"]),
      (entry) => !entry.pathname.startsWith("/settings"),
    );
    expect(outsideSettings).toBe(2);
  });

  // Saving a template pushes /settings/templates, leaving the template page behind it.
  it("skips every settings entry, template pages included", () => {
    expect(
      stepsBackTo(
        stackOf([
          "/dashboard/b1",
          "/settings",
          "/settings/templates",
          "/settings/template/new",
          "/settings/templates",
          "/settings/labels",
        ]),
        (entry) => !entry.pathname.startsWith("/settings"),
      ),
    ).toBe(5);
  });
});

describe("trackNavigation", () => {
  it("follows pushes, replaces and traversals of a router history", () => {
    const history = createMemoryHistory({
      initialEntries: ["/dashboard/home"],
    });
    const tracker = trackNavigation(history);

    history.push("/dashboard/b1");
    expect(tracker.stepsBackTo(isOtherPage)).toBe(1);

    history.push("/dashboard/b1?tab=expenses");
    expect(tracker.stepsBackTo(isOtherPage)).toBe(2);

    history.go(-2);
    history.push("/dashboard");
    history.push("/dashboard?q=rent");
    history.replace("/dashboard?q=rent2");
    history.push("/dashboard/b2");
    // Back to the latest list entry, filters and all.
    expect(tracker.stepsBackTo(isOtherPage)).toBe(1);
    history.back();
    expect(tracker.stepsBackTo(isOtherPage)).toBe(2);
  });

  it("knows nothing about entries before it started", () => {
    const history = createMemoryHistory({
      initialEntries: ["/dashboard/home", "/dashboard/b1"],
      initialIndex: 1,
    });
    const tracker = trackNavigation(history);
    expect(tracker.stepsBackTo(isOtherPage)).toBeUndefined();

    history.back();
    history.forward();
    expect(tracker.stepsBackTo(isOtherPage)).toBe(1);
  });
});
