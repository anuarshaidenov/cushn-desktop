export const SIDEBAR_WIDTH_STORAGE_KEY = "sidebar_width";

export const SIDEBAR_WIDTH_DEFAULT = 224;
export const SIDEBAR_WIDTH_MIN = 200;
export const SIDEBAR_WIDTH_MAX = 400;
/** Dragging the edge narrower than this collapses the sidebar. */
export const SIDEBAR_COLLAPSE_BELOW = 120;
export const SIDEBAR_WIDTH_KEYBOARD_STEP = 16;
/** However wide it was dragged, the sidebar never takes more of the window than this. */
export const SIDEBAR_MAX_VIEWPORT_PERCENT = 40;

export type SidebarDrag =
  { collapsed: true } | { collapsed: false; width: number };

export function maxSidebarWidth(viewportWidth: number): number {
  const viewportCap = Math.floor(
    (viewportWidth * SIDEBAR_MAX_VIEWPORT_PERCENT) / 100,
  );
  return Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, viewportCap));
}

export function clampSidebarWidth(
  width: number,
  viewportWidth: number,
): number {
  return Math.min(
    maxSidebarWidth(viewportWidth),
    Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)),
  );
}

/** Not capped by the window, so a narrow window doesn't shrink the stored width. */
export function parseSidebarWidth(stored: string | null): number {
  const width = Number.parseFloat(stored ?? "");
  if (!Number.isFinite(width)) return SIDEBAR_WIDTH_DEFAULT;
  return Math.min(
    SIDEBAR_WIDTH_MAX,
    Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)),
  );
}

export function resolveSidebarDrag(
  pointerWidth: number,
  viewportWidth: number,
): SidebarDrag {
  return pointerWidth < SIDEBAR_COLLAPSE_BELOW
    ? { collapsed: true }
    : {
        collapsed: false,
        width: clampSidebarWidth(pointerWidth, viewportWidth),
      };
}

/** The `--sidebar-width` value; the viewport cap also holds when the window shrinks later. */
export function sidebarWidthCss(width: number): string {
  return `min(${width}px, ${SIDEBAR_MAX_VIEWPORT_PERCENT}vw)`;
}
