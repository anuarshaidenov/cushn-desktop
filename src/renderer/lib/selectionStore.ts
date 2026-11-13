import { sameSelection } from "./marquee";

/**
 * A selection that lives outside React, so each item can subscribe to its own `has(id)` with
 * `useSyncExternalStore` and re-render only when its own selected state flips.
 */
export type SelectionStore<T> = {
  subscribe: (listener: () => void) => () => void;
  /** A new Set on every change, the same one otherwise. */
  getSnapshot: () => ReadonlySet<T>;
  has: (id: T) => boolean;
  /** Ids outside the list drop out of the selection on its next change. */
  setListed: (ids: readonly T[]) => void;
  set: (ids: Iterable<T>) => void;
  toggle: (id: T) => void;
};

export function createSelectionStore<T>(): SelectionStore<T> {
  let selected: ReadonlySet<T> = new Set();
  let listed: ReadonlySet<T> | null = null;
  const listeners = new Set<() => void>();

  const set = (ids: Iterable<T>) => {
    const next = [...ids].filter((id) => !listed || listed.has(id));
    if (sameSelection(next, [...selected])) return;
    selected = new Set(next);
    for (const listener of listeners) listener();
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => selected,
    has: (id) => selected.has(id),
    setListed: (ids) => {
      listed = new Set(ids);
    },
    set,
    toggle: (id) => {
      const rest = [...selected].filter((selectedId) => selectedId !== id);
      set(selected.has(id) ? rest : [...rest, id]);
    },
  };
}
