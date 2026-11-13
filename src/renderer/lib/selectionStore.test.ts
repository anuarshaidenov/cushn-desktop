import { describe, expect, it, vi } from "vitest";
import { createSelectionStore } from "./selectionStore";

describe("createSelectionStore", () => {
  it("toggles ids and notifies on each change", () => {
    const store = createSelectionStore<string>();
    const listener = vi.fn();
    store.subscribe(listener);

    store.toggle("a");
    store.toggle("b");
    expect([...store.getSnapshot()]).toEqual(["a", "b"]);
    store.toggle("a");
    expect([...store.getSnapshot()]).toEqual(["b"]);
    expect(store.has("a")).toBe(false);
    expect(store.has("b")).toBe(true);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("keeps the same snapshot and stays quiet when a set changes nothing", () => {
    const store = createSelectionStore<string>();
    store.set(["a", "b"]);
    const snapshot = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(["b", "a"]);
    expect(store.getSnapshot()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
  });

  it("drops ids that left the list on the next change", () => {
    const store = createSelectionStore<string>();
    store.setListed(["a", "b", "c"]);
    store.set(["a", "b"]);
    store.setListed(["b", "c"]);
    expect(store.has("a")).toBe(true);

    store.toggle("c");
    expect([...store.getSnapshot()]).toEqual(["b", "c"]);
    store.set(["a", "c"]);
    expect([...store.getSnapshot()]).toEqual(["c"]);
  });

  it("stops notifying after unsubscribe", () => {
    const store = createSelectionStore<string>();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.toggle("a");
    expect(listener).not.toHaveBeenCalled();
  });
});
