import { describe, expect, it } from "vitest";
import {
  autoScrollSpeed,
  clampRect,
  hasPassedThreshold,
  marqueeSelection,
  rectFromPoints,
  rectsIntersect,
  sameSelection,
} from "./marquee";

describe("hasPassedThreshold", () => {
  it("stays a click for small jitters and becomes a drag past the threshold", () => {
    const start = { x: 100, y: 100 };
    expect(hasPassedThreshold(start, { x: 102, y: 102 })).toBe(false);
    expect(hasPassedThreshold(start, { x: 104, y: 100 })).toBe(true);
    expect(hasPassedThreshold(start, { x: 97, y: 97 })).toBe(true);
  });
});

describe("rectFromPoints", () => {
  it("normalises a drag in any direction", () => {
    const rect = { left: 10, top: 20, right: 50, bottom: 80 };
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 50, y: 80 })).toEqual(rect);
    expect(rectFromPoints({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual(rect);
    expect(rectFromPoints({ x: 50, y: 20 }, { x: 10, y: 80 })).toEqual(rect);
  });
});

describe("clampRect", () => {
  it("keeps the marquee inside the content box so it never grows the scroll area", () => {
    const rect = { left: -20, top: -5, right: 900, bottom: 2000 };
    expect(clampRect(rect, { width: 800, height: 1500 })).toEqual({
      left: 0,
      top: 0,
      right: 800,
      bottom: 1500,
    });
  });

  it("leaves a rect already inside alone", () => {
    const rect = { left: 10, top: 10, right: 20, bottom: 20 };
    expect(clampRect(rect, { width: 100, height: 100 })).toEqual(rect);
  });
});

describe("rectsIntersect", () => {
  const item = { left: 100, top: 100, right: 200, bottom: 150 };

  it("covers an item the marquee overlaps, even partly", () => {
    expect(
      rectsIntersect({ left: 150, top: 0, right: 300, bottom: 120 }, item),
    ).toBe(true);
  });

  it("skips items that are apart or only touch an edge", () => {
    expect(
      rectsIntersect({ left: 0, top: 0, right: 90, bottom: 90 }, item),
    ).toBe(false);
    expect(
      rectsIntersect({ left: 0, top: 0, right: 100, bottom: 150 }, item),
    ).toBe(false);
  });

  it("covers an item crossed by a straight vertical drag", () => {
    expect(
      rectsIntersect({ left: 120, top: 0, right: 120, bottom: 300 }, item),
    ).toBe(true);
  });
});

describe("marqueeSelection", () => {
  const items = ["a", "b", "c", "d"];

  it("replaces the selection with the covered items, in document order", () => {
    expect(marqueeSelection(items, new Set(["c", "a"]))).toEqual(["a", "c"]);
  });

  it("adds the covered items to the base, without duplicates", () => {
    expect(marqueeSelection(items, new Set(["b", "c"]), ["d", "b"])).toEqual([
      "b",
      "c",
      "d",
    ]);
  });

  it("keeps base ids that aren't on screen", () => {
    expect(marqueeSelection(items, new Set(["a"]), ["z"])).toEqual(["a", "z"]);
  });

  it("clears the selection when a plain drag covers nothing", () => {
    expect(marqueeSelection(items, new Set())).toEqual([]);
  });
});

describe("sameSelection", () => {
  it("ignores order", () => {
    expect(sameSelection(["a", "b"], ["b", "a"])).toBe(true);
  });

  it("notices an added or swapped id", () => {
    expect(sameSelection(["a"], ["a", "b"])).toBe(false);
    expect(sameSelection(["a", "b"], ["a", "c"])).toBe(false);
  });
});

describe("autoScrollSpeed", () => {
  // A container from y = 100 to y = 600, with the default 40px edge zones.
  const speedAt = (y: number) => autoScrollSpeed(y, 100, 600);

  it("doesn't scroll away from the edges", () => {
    expect(speedAt(350)).toBe(0);
    expect(speedAt(140)).toBe(0);
    expect(speedAt(560)).toBe(0);
  });

  it("scrolls up near the top and down near the bottom", () => {
    expect(speedAt(120)).toBeLessThan(0);
    expect(speedAt(580)).toBeGreaterThan(0);
  });

  it("speeds up deeper into the zone and is capped past the edge", () => {
    expect(speedAt(590)).toBeGreaterThan(speedAt(570));
    expect(speedAt(600)).toBe(speedAt(900));
    expect(speedAt(0)).toBe(-speedAt(900));
  });

  it("shrinks the zones in a container too short for both", () => {
    expect(autoScrollSpeed(129, 100, 160)).toBeLessThan(0);
    expect(autoScrollSpeed(131, 100, 160)).toBeGreaterThan(0);
  });
});
