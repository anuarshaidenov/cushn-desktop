import type { HistoryLocation, RouterHistory } from "@tanstack/react-router";

const STORAGE_KEY = "last_page";

type LastPageWindow = {
  location: Pick<Location, "hash">;
  history: Pick<History, "state" | "replaceState">;
  localStorage: Pick<Storage, "getItem" | "setItem">;
};

/** The page to reopen on, as path plus search; `undefined` for the index redirect and Settings. */
export function lastPageOf(
  location: Pick<HistoryLocation, "pathname" | "search">,
): string | undefined {
  return validPage(`${location.pathname}${location.search}`);
}

/** `undefined` when the app already starts on a route, or `stored` is not a page `lastPageOf` returns. */
export function hashToRestore(
  hash: string,
  stored: string | null,
): string | undefined {
  if (hash !== "" && hash !== "#" && hash !== "#/") return undefined;
  const page = validPage(stored);
  return page ? `#${page}` : undefined;
}

function validPage(page: string | null): string | undefined {
  if (!page?.startsWith("/")) return undefined;
  const pathname = page.split(/[?#]/, 1)[0];
  const isSettings =
    pathname === "/settings" || pathname.startsWith("/settings/");
  return pathname === "/" || isSettings ? undefined : page;
}

/** Call before creating the hash history, which reads its first location from the URL hash. */
export function restoreLastPage(win: LastPageWindow = window): void {
  const hash = hashToRestore(win.location.hash, readStoredPage(win));
  if (hash) win.history.replaceState(win.history.state, "", hash);
}

export function trackLastPage(
  history: Pick<RouterHistory, "location" | "subscribe">,
  win: Pick<LastPageWindow, "localStorage"> = window,
): void {
  const remember = (location: HistoryLocation) => {
    const page = lastPageOf(location);
    if (page) storePage(win, page);
  };
  remember(history.location);
  history.subscribe(({ location }) => remember(location));
}

// Storage can be unavailable or full: the app then opens on home instead of failing to start.
function readStoredPage(win: Pick<LastPageWindow, "localStorage">) {
  try {
    return win.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storePage(win: Pick<LastPageWindow, "localStorage">, page: string) {
  try {
    win.localStorage.setItem(STORAGE_KEY, page);
  } catch {}
}
