import { describe, expect, it } from "vitest";
import {
  clampSidebarWidth,
  maxSidebarWidth,
  parseSidebarWidth,
  resolveSidebarDrag,
  SIDEBAR_COLLAPSE_BELOW,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  sidebarWidthCss,
} from "./sidebarWidth";

describe("maxSidebarWidth", () => {
  it("caps at the max, then at 40% of the viewport, never below the min", () => {
    expect(maxSidebarWidth(1280)).toBe(SIDEBAR_WIDTH_MAX);
    expect(maxSidebarWidth(800)).toBe(320);
    expect(maxSidebarWidth(300)).toBe(SIDEBAR_WIDTH_MIN);
  });

  it("floors the viewport share", () => {
    expect(maxSidebarWidth(801)).toBe(320);
  });
});

describe("clampSidebarWidth", () => {
  it("rounds, then clamps to the viewport-aware range", () => {
    expect(clampSidebarWidth(250.6, 1280)).toBe(251);
    expect(clampSidebarWidth(50, 1280)).toBe(SIDEBAR_WIDTH_MIN);
    expect(clampSidebarWidth(1000, 1280)).toBe(SIDEBAR_WIDTH_MAX);
    expect(clampSidebarWidth(380, 800)).toBe(320);
  });
});

describe("parseSidebarWidth", () => {
  it("falls back to the default for missing or non-finite values", () => {
    for (const stored of [null, "", "abc", "Infinity", "NaN"]) {
      expect(parseSidebarWidth(stored)).toBe(SIDEBAR_WIDTH_DEFAULT);
    }
  });

  it("rounds and clamps without a viewport cap", () => {
    expect(parseSidebarWidth("380")).toBe(380);
    expect(parseSidebarWidth("1000")).toBe(SIDEBAR_WIDTH_MAX);
    expect(parseSidebarWidth("50")).toBe(SIDEBAR_WIDTH_MIN);
    expect(parseSidebarWidth("250.6")).toBe(251);
  });
});

describe("resolveSidebarDrag", () => {
  it("collapses strictly below the threshold", () => {
    expect(resolveSidebarDrag(SIDEBAR_COLLAPSE_BELOW - 0.1, 1280)).toEqual({
      collapsed: true,
    });
    expect(resolveSidebarDrag(SIDEBAR_COLLAPSE_BELOW, 1280)).toEqual({
      collapsed: false,
      width: SIDEBAR_WIDTH_MIN,
    });
  });

  it("clamps the width otherwise", () => {
    expect(resolveSidebarDrag(150, 1280)).toEqual({
      collapsed: false,
      width: SIDEBAR_WIDTH_MIN,
    });
    expect(resolveSidebarDrag(900, 800)).toEqual({
      collapsed: false,
      width: 320,
    });
  });
});

describe("sidebarWidthCss", () => {
  it("caps the width at 40vw", () => {
    expect(sidebarWidthCss(260)).toBe("min(260px, 40vw)");
  });
});
