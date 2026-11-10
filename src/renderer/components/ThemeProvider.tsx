import { createContext, type PropsWithChildren, use, useLayoutEffect } from "react";
import { useSettings, useUpdateSettings } from "@/data/settings";
import { applyTheme, getStartupTheme, type T as Theme } from "@/lib/theme";

type ThemeContextVal = { theme: Theme; setTheme: (val: Theme) => void };
type Props = PropsWithChildren;

const ThemeContext = createContext<ThemeContextVal | null>(null);

export function ThemeProvider({ children }: Props) {
  const { data } = useSettings();
  const { mutate } = useUpdateSettings();
  // Until the settings load, the theme main started the window with.
  const theme = data?.settings.theme ?? getStartupTheme();

  useLayoutEffect(() => applyTheme(theme), [theme]);

  function setTheme(val: Theme) {
    mutate({ theme: val });
  }

  return <ThemeContext value={{ theme, setTheme }}>{children}</ThemeContext>;
}

export function useTheme() {
  const val = use(ThemeContext);
  if (!val) throw new Error("useTheme called outside of ThemeProvider!");
  return val;
}
