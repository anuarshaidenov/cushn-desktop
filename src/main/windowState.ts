/**
 * The window's size, kept across launches in a file in userData rather than in the settings row:
 * a backup or an agent has no use for one machine's window size. Electron-free: `index.ts` passes
 * userData, the display's work area and the closing window's bounds.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface WindowSize {
  width: number;
  height: number;
}

export const WINDOW_STATE_FILE = "window-state.json";

export const DEFAULT_WINDOW_SIZE: WindowSize = { width: 1280, height: 820 };

export const MIN_WINDOW_SIZE: WindowSize = { width: 500, height: 560 };

/** The size to open at: the saved one, or the default, fitted to the display it opens on. */
export function restoreWindowSize(userData: string, workArea: WindowSize): WindowSize {
  const { width, height } = readWindowSize(userData) ?? DEFAULT_WINDOW_SIZE;
  return {
    width: fit(width, MIN_WINDOW_SIZE.width, workArea.width),
    height: fit(height, MIN_WINDOW_SIZE.height, workArea.height),
  };
}

/** Never throws: a size that can't be saved must not keep the window from closing. */
export function saveWindowSize(userData: string, { width, height }: WindowSize): void {
  try {
    writeFileSync(join(userData, WINDOW_STATE_FILE), JSON.stringify({ width, height }));
  } catch (error) {
    console.error("Failed to save the window size", error);
  }
}

function readWindowSize(userData: string): WindowSize | undefined {
  try {
    const saved: unknown = JSON.parse(readFileSync(join(userData, WINDOW_STATE_FILE), "utf8"));
    if (typeof saved !== "object" || saved === null) return undefined;
    const { width, height } = saved as Record<string, unknown>;
    return isLength(width) && isLength(height) ? { width, height } : undefined;
  } catch {
    return undefined;
  }
}

function isLength(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** The minimum wins on a display smaller than it. */
function fit(length: number, min: number, max: number): number {
  return Math.max(min, Math.min(Math.round(length), max));
}
