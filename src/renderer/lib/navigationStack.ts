import type { HistoryLocation, RouterHistory } from "@tanstack/react-router";

export type NavigationEntry = { pathname: string };

/** Entries are indexed by the history index; `undefined` marks an entry from before the tracker started. */
export type NavigationStack = {
  entries: ReadonlyArray<NavigationEntry | undefined>;
  index: number;
};

export type NavigationChange = {
  type: "PUSH" | "REPLACE" | "BACK" | "FORWARD" | "GO";
  index: number;
  entry: NavigationEntry;
};

export type NavigationPredicate = (
  entry: NavigationEntry,
  current: NavigationEntry,
) => boolean;

export function startNavigationStack(
  index: number,
  entry: NavigationEntry,
): NavigationStack {
  return { entries: placeEntry([], index, entry), index };
}

export function reduceNavigationStack(
  stack: NavigationStack,
  change: NavigationChange,
): NavigationStack {
  const entries =
    change.type === "PUSH"
      ? stack.entries.slice(0, change.index)
      : stack.entries;
  return {
    entries: placeEntry(entries, change.index, change.entry),
    index: change.index,
  };
}

/** Steps back to the nearest earlier entry matching `predicate`; `undefined` if none is known. */
export function stepsBackTo(
  stack: NavigationStack,
  predicate: NavigationPredicate,
): number | undefined {
  const current = stack.entries[stack.index];
  if (!current) return undefined;
  for (let index = stack.index - 1; index >= 0; index--) {
    const entry = stack.entries[index];
    // What lies behind an unknown entry is unknown too.
    if (!entry) return undefined;
    if (predicate(entry, current)) return stack.index - index;
  }
  return undefined;
}

export const isOtherPage: NavigationPredicate = (entry, current) =>
  entry.pathname !== current.pathname;

function placeEntry(
  entries: ReadonlyArray<NavigationEntry | undefined>,
  index: number,
  entry: NavigationEntry,
): Array<NavigationEntry | undefined> {
  const next = Array.from(
    { length: Math.max(entries.length, index + 1) },
    (_, i) => entries[i],
  );
  next[index] = entry;
  return next;
}

export type NavigationTracker = {
  stepsBackTo: (predicate: NavigationPredicate) => number | undefined;
};

export function trackNavigation(
  history: Pick<RouterHistory, "location" | "subscribe">,
): NavigationTracker {
  let stack = startNavigationStack(
    history.location.state.__TSR_index,
    toEntry(history.location),
  );
  history.subscribe(({ location, action }) => {
    stack = reduceNavigationStack(stack, {
      type: action.type,
      index: location.state.__TSR_index,
      entry: toEntry(location),
    });
  });
  return { stepsBackTo: (predicate) => stepsBackTo(stack, predicate) };
}

function toEntry(location: HistoryLocation): NavigationEntry {
  return { pathname: location.pathname };
}
