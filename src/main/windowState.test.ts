import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WINDOW_SIZE,
  MIN_WINDOW_SIZE,
  WINDOW_STATE_FILE,
  type WindowSize,
  restoreWindowSize,
  saveWindowSize,
} from "./windowState";

const WORK_AREA: WindowSize = { width: 2560, height: 1415 };

let userData: string;

function restore(workArea: WindowSize = WORK_AREA): WindowSize {
  return restoreWindowSize(userData, workArea);
}

function store(contents: string): void {
  writeFileSync(join(userData, WINDOW_STATE_FILE), contents);
}

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), "cushn-window-state-"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(userData, { recursive: true, force: true });
});

describe("restoring", () => {
  it("opens at the size the window was closed at", () => {
    saveWindowSize(userData, { width: 1600, height: 1000 });

    expect(restore()).toEqual({ width: 1600, height: 1000 });
  });

  it("saves only the size, whatever else the bounds carry", () => {
    saveWindowSize(userData, { x: 40, y: 60, width: 900, height: 700 } as WindowSize);

    expect(JSON.parse(readFileSync(join(userData, WINDOW_STATE_FILE), "utf8"))).toEqual({
      width: 900,
      height: 700,
    });
  });

  it("opens at the default size on a first launch", () => {
    expect(restore()).toEqual(DEFAULT_WINDOW_SIZE);
  });

  it.each<[string, string]>([
    ["unreadable JSON", "{ width: "],
    ["an empty file", ""],
    ["no object", "null"],
    ["a list", "[1600, 1000]"],
    ["a missing height", '{"width":1600}'],
    ["a size in words", '{"width":"1600","height":"1000"}'],
    ["a zero width", '{"width":0,"height":1000}'],
    ["a negative height", '{"width":1600,"height":-1000}'],
    ["a number too large to be finite", '{"width":1e999,"height":1000}'],
    ["a null height", '{"width":1600,"height":null}'],
  ])("opens at the default size when the file holds %s", (_case, contents) => {
    store(contents);

    expect(restore()).toEqual(DEFAULT_WINDOW_SIZE);
  });
});

describe("fitting the display", () => {
  it("shrinks a size saved on a larger display to the work area", () => {
    saveWindowSize(userData, { width: 2400, height: 1300 });

    expect(restore({ width: 1470, height: 919 })).toEqual({ width: 1470, height: 919 });
  });

  it("fits each side on its own", () => {
    saveWindowSize(userData, { width: 2400, height: 700 });

    expect(restore({ width: 1470, height: 919 })).toEqual({ width: 1470, height: 700 });
  });

  it("shrinks the default size on a display smaller than it", () => {
    expect(restore({ width: 1024, height: 728 })).toEqual({ width: 1024, height: 728 });
  });

  it("never opens smaller than the window's minimum", () => {
    store('{"width":120,"height":80}');

    expect(restore()).toEqual(MIN_WINDOW_SIZE);
  });

  it("keeps the minimum on a display smaller than it", () => {
    expect(restore({ width: 400, height: 300 })).toEqual(MIN_WINDOW_SIZE);
  });

  it("rounds a fractional size to whole pixels", () => {
    store('{"width":1600.4,"height":999.5}');

    expect(restore()).toEqual({ width: 1600, height: 1000 });
  });
});

describe("a size that can't be saved", () => {
  it("is logged and otherwise ignored", () => {
    rmSync(userData, { recursive: true });

    expect(() => saveWindowSize(userData, { width: 1600, height: 1000 })).not.toThrow();
    expect(console.error).toHaveBeenCalledWith("Failed to save the window size", expect.any(Error));
    expect(restore()).toEqual(DEFAULT_WINDOW_SIZE);
  });
});
