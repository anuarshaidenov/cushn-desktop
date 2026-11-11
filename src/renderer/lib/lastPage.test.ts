import { describe, expect, it } from "vitest";
import { createHashHistory } from "@tanstack/react-router";
import {
  hashToRestore,
  lastPageOf,
  restoreLastPage,
  trackLastPage,
} from "./lastPage";

const APP_URL = "file:///Applications/Cushn.app/out/renderer/index.html";

type Items = Map<string, string>;

const storageOf = (items: Items) => ({
  getItem: (key: string) => items.get(key) ?? null,
  setItem: (key: string, value: string) => void items.set(key, value),
});

const brokenStorage = {
  getItem: (): string | null => {
    throw new Error("storage is unavailable");
  },
  setItem: () => {
    throw new Error("storage is full");
  },
};

/** The parts of a window the hash history and `lastPage` use, over a real URL parser. */
function openWindow(localStorage: ReturnType<typeof storageOf>, url = APP_URL) {
  let current = new URL(url);
  const setState = (state: unknown, _unused: string, next?: string | null) => {
    win.history.state = state;
    if (next) current = new URL(next, current);
  };
  const win = {
    location: {
      get hash() {
        return current.hash;
      },
      get pathname() {
        return current.pathname;
      },
      get search() {
        return current.search;
      },
    },
    history: {
      state: null as unknown,
      length: 1,
      pushState: setState,
      replaceState: setState,
    },
    localStorage,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return win;
}

describe("lastPageOf", () => {
  it("is the path with its search string", () => {
    expect(lastPageOf({ pathname: "/dashboard/home", search: "" })).toBe(
      "/dashboard/home",
    );
    expect(
      lastPageOf({ pathname: "/dashboard", search: "?q=rent&sortBy=income" }),
    ).toBe("/dashboard?q=rent&sortBy=income");
  });

  it("skips the index redirect and every Settings page", () => {
    for (const pathname of [
      "/",
      "/settings",
      "/settings/",
      "/settings/labels",
      "/settings/template/new",
    ]) {
      expect(lastPageOf({ pathname, search: "?q=rent" })).toBeUndefined();
    }
  });
});

describe("hashToRestore", () => {
  it("restores the stored page when the app starts with no route", () => {
    for (const hash of ["", "#", "#/"]) {
      expect(hashToRestore(hash, "/dashboard/b1?q=rent")).toBe(
        "#/dashboard/b1?q=rent",
      );
    }
  });

  it("leaves a hash that names a route alone", () => {
    expect(hashToRestore("#/settings/labels", "/dashboard/b1")).toBeUndefined();
    expect(hashToRestore("#/dashboard", "/dashboard/b1")).toBeUndefined();
  });

  it("ignores a stored value that is not a remembered page", () => {
    for (const stored of [
      null,
      "",
      "/",
      "/?q=rent",
      "/settings",
      "/settings?q=rent",
      "/settings#top",
      "/settings/labels",
      "dashboard/home",
      "https://example.com/dashboard",
      '{"pathname":"/dashboard"}',
    ]) {
      expect(hashToRestore("", stored)).toBeUndefined();
    }
  });
});

describe("restoreLastPage", () => {
  it("starts the hash history on the page the last one was left on", () => {
    const items: Items = new Map();
    const first = openWindow(storageOf(items));
    restoreLastPage(first);
    const history = createHashHistory({ window: first });
    trackLastPage(history, first);
    expect(history.location.href).toBe("/");

    history.replace("/dashboard/home");
    // A string that reads as a number is quoted in the search string.
    history.push("/dashboard/views/v1?q=%222024%22&labelIds=l1%2Cl2");
    history.push("/settings");
    history.push("/settings/labels");

    const second = openWindow(storageOf(items));
    restoreLastPage(second);
    const { location } = createHashHistory({ window: second });
    expect(location.pathname).toBe("/dashboard/views/v1");
    expect(location.search).toBe("?q=%222024%22&labelIds=l1%2Cl2");
    expect(location.hash).toBe("");
  });

  it("keeps the route a reload starts on", () => {
    const items: Items = new Map([["last_page", "/dashboard/b1"]]);
    const win = openWindow(storageOf(items), `${APP_URL}#/settings/labels`);
    restoreLastPage(win);
    expect(createHashHistory({ window: win }).location.href).toBe(
      "/settings/labels",
    );
  });

  it("starts with no route when nothing valid is stored", () => {
    for (const items of [
      new Map(),
      new Map([["last_page", "/settings/labels"]]),
    ]) {
      const win = openWindow(storageOf(items));
      restoreLastPage(win);
      expect(win.location.hash).toBe("");
    }
  });

  it("starts with no route when storage throws", () => {
    const win = openWindow(brokenStorage);
    restoreLastPage(win);
    expect(win.location.hash).toBe("");
  });
});

describe("trackLastPage", () => {
  it("remembers the location it starts on", () => {
    const items: Items = new Map();
    const win = openWindow(storageOf(items), `${APP_URL}#/dashboard?q=rent`);
    trackLastPage(createHashHistory({ window: win }), win);
    expect(items.get("last_page")).toBe("/dashboard?q=rent");
  });

  it("follows pushes, replaces and search changes outside Settings", () => {
    const items: Items = new Map();
    const win = openWindow(storageOf(items));
    const history = createHashHistory({ window: win });
    trackLastPage(history, win);
    expect(items.has("last_page")).toBe(false);

    history.replace("/dashboard/home");
    expect(items.get("last_page")).toBe("/dashboard/home");

    history.push("/dashboard");
    history.replace("/dashboard?q=rent");
    expect(items.get("last_page")).toBe("/dashboard?q=rent");

    history.push("/settings/trash");
    expect(items.get("last_page")).toBe("/dashboard?q=rent");

    history.push("/dashboard/b1");
    expect(items.get("last_page")).toBe("/dashboard/b1");
  });

  it("keeps navigating when storage throws", () => {
    const win = openWindow(brokenStorage);
    const history = createHashHistory({ window: win });
    trackLastPage(history, win);
    history.push("/dashboard/b1");
    expect(history.location.pathname).toBe("/dashboard/b1");
  });
});
