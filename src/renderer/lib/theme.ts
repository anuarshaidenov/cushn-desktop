import type { Theme } from "@shared/api";

export type T = Theme;

// Main sets `nativeTheme.themeSource` before the window opens, so this matches the stored theme.
export const getStartupTheme = (): T =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

export const applyTheme = (theme: T) => {
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(theme);
};
