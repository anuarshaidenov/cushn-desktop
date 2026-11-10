/**
 * The stored theme as window options, so the first paint already matches it
 * (ARCHITECTURE.md "Electron baseline"). Electron-free, so tests drive it.
 *
 * `themeSource` goes to `nativeTheme`: it themes the native chrome and makes
 * the renderer's `prefers-color-scheme` match, which `index.html` (first
 * paint) and `lib/theme.ts` (the `dark` class before React renders) read.
 */
import type { Theme } from "@shared/api";

/** `--background` of `src/renderer/styles.css` (`:root` and `.dark`), as hex. Keep in sync with `index.html`. */
const BACKGROUND: Record<Theme, string> = {
  light: "#f8fafe",
  dark: "#090a0c",
};

export function windowTheme(theme: Theme): { themeSource: Theme; backgroundColor: string } {
  return { themeSource: theme, backgroundColor: BACKGROUND[theme] };
}
