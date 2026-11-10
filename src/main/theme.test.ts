import { describe, expect, it } from "vitest";
import { windowTheme } from "./theme";

describe("windowTheme", () => {
  it("maps the stored theme to nativeTheme and the --background of styles.css", () => {
    // styles.css: :root --background oklch(0.985 0.01 275), .dark oklch(14.614% 0.0059 275.824)
    expect(windowTheme("light")).toEqual({ themeSource: "light", backgroundColor: "#f8fafe" });
    expect(windowTheme("dark")).toEqual({ themeSource: "dark", backgroundColor: "#090a0c" });
  });
});
