import type { Rect } from "./marquee";

/** Marks the main clickable element of a card, row or nav item; arrow keys move focus between them. */
export const ARROW_NAV_ATTRIBUTE = "data-arrow-nav";

export type ArrowDirection = "up" | "down" | "left" | "right";

export const arrowKeyDirections: Partial<Record<string, ArrowDirection>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

// Neighbours that touch can overlap by a fraction of a pixel.
const EDGE_TOLERANCE = 1;

// How far `to` lies past `from`'s edge in `direction`; negative when it doesn't.
function gapPastEdge(from: Rect, to: Rect, direction: ArrowDirection): number {
  switch (direction) {
    case "up":
      return from.top - to.bottom;
    case "down":
      return to.top - from.bottom;
    case "left":
      return from.left - to.right;
    case "right":
      return to.left - from.right;
  }
}

const spanGap = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  Math.max(0, aStart - bEnd, bStart - aEnd);

/**
 * The index of the rect nearest to `from` in `direction`, or -1. A candidate counts only when it lies
 * wholly past `from`'s edge. Up and down stay in `from`'s column, so the sidebar's last item never
 * drops into the page. Left and right prefer `from`'s row, then take the nearest rect past the edge,
 * so the page and the sidebar reach each other from any row.
 */
export function nearestInDirection(
  from: Rect,
  candidates: Rect[],
  direction: ArrowDirection,
): number {
  const vertical = direction === "up" || direction === "down";
  let best = -1;
  let bestScore: [number, number, number] | undefined;

  candidates.forEach((to, index) => {
    const gap = gapPastEdge(from, to, direction);
    if (gap < -EDGE_TOLERANCE) return;
    const crossGap = vertical
      ? spanGap(from.left, from.right, to.left, to.right)
      : spanGap(from.top, from.bottom, to.top, to.bottom);
    if (vertical && crossGap > 0) return;
    const crossOffset = vertical
      ? Math.abs(from.left + from.right - to.left - to.right) / 2
      : Math.abs(from.top + from.bottom - to.top - to.bottom) / 2;
    const distance = Math.hypot(Math.max(0, gap), crossGap);
    const score: [number, number, number] = [
      crossGap > 0 ? 1 : 0,
      distance,
      crossOffset,
    ];
    if (!bestScore || isLower(score, bestScore)) {
      best = index;
      bestScore = score;
    }
  });

  return best;
}

function isLower(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}
