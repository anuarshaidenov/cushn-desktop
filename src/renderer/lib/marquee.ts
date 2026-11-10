export type Point = { x: number; y: number };
export type Rect = { left: number; top: number; right: number; bottom: number };
export type Size = { width: number; height: number };

/** How far the pointer must travel from the press before it becomes a marquee rather than a click. */
export const MARQUEE_DRAG_THRESHOLD = 4;
/** Depth of the band along the container's edges that scrolls it while dragging. */
export const MARQUEE_EDGE_ZONE = 40;
/** Auto-scroll speed in px per second, reached at the edge and kept past it. */
export const MARQUEE_MAX_SCROLL_SPEED = 1200;

export function hasPassedThreshold(
  start: Point,
  current: Point,
  threshold = MARQUEE_DRAG_THRESHOLD,
): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  };
}

export function clampRect(rect: Rect, bounds: Size): Rect {
  const clamp = (value: number, max: number) =>
    Math.min(max, Math.max(0, value));
  return {
    left: clamp(rect.left, bounds.width),
    top: clamp(rect.top, bounds.height),
    right: clamp(rect.right, bounds.width),
    bottom: clamp(rect.bottom, bounds.height),
  };
}

/** Rects that only touch along an edge don't intersect; a zero-width marquee inside a rect does. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

/**
 * The selection a marquee produces. `itemIds` is every item in document order. Without a `base`
 * the covered items replace the selection; with one they are added to it, and base ids that aren't
 * on screen are kept at the end.
 */
export function marqueeSelection<T>(
  itemIds: readonly T[],
  covered: ReadonlySet<T>,
  base?: readonly T[],
): T[] {
  const kept = new Set(base);
  const result = new Set<T>();
  for (const id of itemIds) {
    if (covered.has(id) || kept.has(id)) result.add(id);
  }
  for (const id of kept) result.add(id);
  return [...result];
}

export function sameSelection<T>(a: readonly T[], b: readonly T[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const id of setA) if (!setB.has(id)) return false;
  return true;
}

/**
 * Signed scroll speed in px per second along one axis: negative near `start`, positive near `end`,
 * zero outside both edge zones. It grows with depth into the zone and is capped past the edge.
 */
export function autoScrollSpeed(
  pointer: number,
  start: number,
  end: number,
  zone = MARQUEE_EDGE_ZONE,
  maxSpeed = MARQUEE_MAX_SCROLL_SPEED,
): number {
  const size = Math.min(zone, (end - start) / 2);
  if (size <= 0) return 0;
  const speed = (depth: number) => maxSpeed * Math.min(1, depth / size);
  if (pointer < start + size) return -speed(start + size - pointer);
  if (pointer > end - size) return speed(pointer - (end - size));
  return 0;
}
