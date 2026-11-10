import { describe, expect, it } from "vitest";
import { createUndoHistory, type UndoEntry } from "./undo";

function recorder() {
  const calls: string[] = [];
  const entry = (label: string): Omit<UndoEntry, "id"> => ({
    label,
    undo: async () => {
      calls.push(`undo ${label}`);
    },
    redo: async () => {
      calls.push(`redo ${label}`);
    },
  });
  return { calls, entry };
}

const labels = (entries: UndoEntry[]) => entries.map((e) => e.label);

describe("undo history", () => {
  it("undoes the newest entry and redoes it back", async () => {
    const history = createUndoHistory();
    const { calls, entry } = recorder();
    history.push(entry("a"));
    history.push(entry("b"));

    expect(await history.undo()).toMatchObject({
      status: "done",
      entry: { label: "b" },
    });
    expect(labels(history.store.getState().past)).toEqual(["a"]);
    expect(labels(history.store.getState().future)).toEqual(["b"]);

    expect(await history.redo()).toMatchObject({
      status: "done",
      entry: { label: "b" },
    });
    expect(labels(history.store.getState().past)).toEqual(["a", "b"]);
    expect(history.store.getState().future).toEqual([]);
    expect(calls).toEqual(["undo b", "redo b"]);
  });

  it("reports empty when there is nothing to undo or redo", async () => {
    const history = createUndoHistory();
    expect(await history.undo()).toEqual({ status: "empty" });
    expect(await history.redo()).toEqual({ status: "empty" });
    expect(history.canUndo()).toBe(false);
  });

  it("drops the redo stack on push", async () => {
    const history = createUndoHistory();
    const { entry } = recorder();
    history.push(entry("a"));
    await history.undo();
    expect(history.canRedo()).toBe(true);

    history.push(entry("b"));
    expect(history.canRedo()).toBe(false);
  });

  it("undoes an older entry by id without making it redoable", async () => {
    const history = createUndoHistory();
    const { calls, entry } = recorder();
    const a = history.push(entry("a"));
    history.push(entry("b"));

    await history.undo(a.id);
    expect(calls).toEqual(["undo a"]);
    expect(labels(history.store.getState().past)).toEqual(["b"]);
    expect(history.store.getState().future).toEqual([]);
  });

  it("makes the entry redoable when the id is the newest", async () => {
    const history = createUndoHistory();
    const { entry } = recorder();
    const a = history.push(entry("a"));

    await history.undo(a.id);
    expect(labels(history.store.getState().future)).toEqual(["a"]);
  });

  it("ignores an id that already left the history", async () => {
    const history = createUndoHistory();
    const { calls, entry } = recorder();
    const a = history.push(entry("a"));
    await history.undo();

    expect(await history.undo(a.id)).toEqual({ status: "empty" });
    expect(calls).toEqual(["undo a"]);
  });

  it("ignores calls while one is running", async () => {
    const history = createUndoHistory();
    let finish = () => {};
    history.push({
      label: "slow",
      undo: () => new Promise<void>((resolve) => (finish = resolve)),
      redo: async () => {},
    });

    const first = history.undo();
    expect(await history.undo()).toEqual({ status: "busy" });
    expect(await history.redo()).toEqual({ status: "busy" });
    finish();
    expect(await first).toMatchObject({ status: "done" });
    expect(history.store.getState().busy).toBe(false);
  });

  it("drops a failing entry and rethrows its error", async () => {
    const history = createUndoHistory();
    const { entry } = recorder();
    history.push(entry("a"));
    history.push({
      label: "broken",
      undo: async () => {
        throw new Error("gone");
      },
      redo: async () => {},
    });

    await expect(history.undo()).rejects.toThrow("gone");
    expect(labels(history.store.getState().past)).toEqual(["a"]);
    expect(history.store.getState().future).toEqual([]);
    expect(history.store.getState().busy).toBe(false);
  });

  it("drops a failing redo", async () => {
    const history = createUndoHistory();
    history.push({
      label: "a",
      undo: async () => {},
      redo: async () => {
        throw new Error("gone");
      },
    });
    await history.undo();

    await expect(history.redo()).rejects.toThrow("gone");
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it("keeps the newest entries up to the limit", () => {
    const history = createUndoHistory(3);
    const { entry } = recorder();
    for (const label of ["a", "b", "c", "d"]) history.push(entry(label));

    expect(labels(history.store.getState().past)).toEqual(["b", "c", "d"]);
  });

  it("clears both stacks, even under a running undo", async () => {
    const history = createUndoHistory();
    const { entry } = recorder();
    let finish = () => {};
    history.push(entry("a"));
    history.push({
      label: "slow",
      undo: () => new Promise<void>((resolve) => (finish = resolve)),
      redo: async () => {},
    });

    const running = history.undo();
    history.clear();
    finish();
    await running;

    expect(history.store.getState().past).toEqual([]);
    expect(history.store.getState().future).toEqual([]);
  });
});
