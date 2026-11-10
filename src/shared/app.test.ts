import { describe, expect, it } from "vitest";
import { APP_NAME, windowTitle } from "@shared/app";

describe("windowTitle", () => {
  it("returns the app name without a page", () => {
    expect(windowTitle()).toBe(APP_NAME);
  });

  it("prefixes the page name", () => {
    expect(windowTitle("Settings")).toBe("Settings · Cushn");
  });
});
