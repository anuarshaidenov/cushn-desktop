/** Session undo history behind ⌘Z / ⇧⌘Z and the toasts' Undo buttons. No React, no IPC. */
import { createStore } from "zustand/vanilla";

export interface UndoEntry {
  id: string;
  /** What the action did, e.g. `Archive “Groceries”`. */
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

export type UndoOutcome =
  | { status: "done"; entry: UndoEntry }
  /** Nothing to undo or redo, or the entry already left the history. */
  | { status: "empty" }
  /** Another undo or redo is still running; this call was ignored. */
  | { status: "busy" };

interface UndoState {
  past: UndoEntry[];
  future: UndoEntry[];
  busy: boolean;
}

export const UNDO_HISTORY_LIMIT = 50;

export function createUndoHistory(limit = UNDO_HISTORY_LIMIT) {
  const store = createStore<UndoState>(() => ({
    past: [],
    future: [],
    busy: false,
  }));
  let nextId = 0;
  // Bumped by `clear`, so an undo or redo that settles afterwards leaves the history empty.
  let generation = 0;

  const without = (entries: UndoEntry[], entry: UndoEntry) =>
    entries.filter((e) => e !== entry);

  const run = async (
    entry: UndoEntry,
    action: () => Promise<void>,
    settle: (state: UndoState) => Partial<UndoState>,
  ): Promise<UndoOutcome> => {
    const startedIn = generation;
    store.setState({ busy: true });
    try {
      await action();
      if (generation === startedIn) store.setState(settle);
      return { status: "done", entry };
    } catch (error) {
      store.setState((state) => ({
        past: without(state.past, entry),
        future: without(state.future, entry),
      }));
      throw error;
    } finally {
      store.setState({ busy: false });
    }
  };

  return {
    store,

    /** Adds a just-run action as the newest entry and drops the redo stack. */
    push(entry: Omit<UndoEntry, "id">): UndoEntry {
      const full = { ...entry, id: `undo-${++nextId}` };
      store.setState((state) => ({
        past: [...state.past, full].slice(-limit),
        future: [],
      }));
      return full;
    },

    /** Undoes `id` wherever it sits in the history, or the newest entry. Only the newest becomes redoable. */
    undo(id?: string): Promise<UndoOutcome> {
      const { past, busy } = store.getState();
      if (busy) return Promise.resolve({ status: "busy" });
      const entry = id === undefined ? past.at(-1) : past.find((e) => e.id === id);
      if (!entry) return Promise.resolve({ status: "empty" });

      return run(entry, entry.undo, (state) => {
        const isNewest = state.past.at(-1) === entry;
        return {
          past: without(state.past, entry),
          future: isNewest ? [...state.future, entry] : state.future,
        };
      });
    },

    /** Redoes the most recently undone entry. */
    redo(): Promise<UndoOutcome> {
      const { future, busy } = store.getState();
      if (busy) return Promise.resolve({ status: "busy" });
      const entry = future.at(-1);
      if (!entry) return Promise.resolve({ status: "empty" });

      return run(entry, entry.redo, (state) => ({
        future: without(state.future, entry),
        past: [...state.past, entry].slice(-limit),
      }));
    },

    canUndo: () => store.getState().past.length > 0,
    canRedo: () => store.getState().future.length > 0,

    clear() {
      generation++;
      store.setState({ past: [], future: [] });
    },
  };
}

export type UndoHistory = ReturnType<typeof createUndoHistory>;

export const undoHistory = createUndoHistory();
