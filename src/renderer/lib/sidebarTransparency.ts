import { platform } from "@/data/platform";

const STORAGE_KEY = "sidebar_transparent";
/** The `vibrant-fade` transition in `styles.css`. */
const FADE_MS = 200;

/** Only the macOS window is vibrant (src/main/index.ts); elsewhere the sidebar is always solid. */
export const canMakeSidebarTransparent = platform === "darwin";

/** Off until turned on in Preferences. */
export const isSidebarTransparent = (): boolean =>
  canMakeSidebarTransparent && localStorage.getItem(STORAGE_KEY) === "true";

let fadeTimer: number | undefined;

/** `vibrant` on `<html>` lets the window's blur through the sidebar (`styles.css`). */
export function applySidebarTransparent(on: boolean, { fade = false } = {}): void {
  const root = document.documentElement;
  if (fade) {
    // Only for this switch, so theme changes stay instant.
    window.clearTimeout(fadeTimer);
    root.classList.add("vibrant-fade");
    fadeTimer = window.setTimeout(() => root.classList.remove("vibrant-fade"), FADE_MS);
  }
  root.classList.toggle("vibrant", on);
}

export function setSidebarTransparent(on: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(on));
  applySidebarTransparent(on, { fade: true });
}
