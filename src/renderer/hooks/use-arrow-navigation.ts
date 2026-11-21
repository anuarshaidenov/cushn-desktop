import { useEffect } from "react";
import {
  ARROW_NAV_ATTRIBUTE,
  arrowKeyDirections,
  nearestInDirection,
} from "@/lib/arrowNavigation";
import { isEditableEventTarget } from "@/lib/utils";

const ITEM_SELECTOR = `[${ARROW_NAV_ATTRIBUTE}]`;

// Widgets that move focus with arrow keys themselves, and dialogs, which keep the page behind them still.
const OWNS_ARROW_KEYS = [
  "menu",
  "menubar",
  "listbox",
  "tablist",
  "radiogroup",
  "toolbar",
  "grid",
  "tree",
  "treegrid",
  "slider",
  "spinbutton",
  "combobox",
  "dialog",
  "alertdialog",
]
  .map((role) => `[role="${role}"]`)
  .concat("[cmdk-root]")
  .join(", ");

// The listener sits on the window in the bubble phase, after React handlers and document listeners
// (Base UI, TanStack Hotkeys, the shortcut recorder), so it acts only on an arrow nobody claimed.
function isUnclaimedArrow(event: KeyboardEvent): boolean {
  const { target } = event;
  return (
    !event.defaultPrevented &&
    !event.isComposing &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !isEditableEventTarget(target) &&
    !(target instanceof Element && target.closest(OWNS_ARROW_KEYS))
  );
}

// Pages never scroll sideways, so an item past the window's sides is hidden, like a collapsed sidebar's.
const isNavigable = (item: HTMLElement) => {
  const rect = item.getBoundingClientRect();
  return (
    rect.right > 0 &&
    rect.left < window.innerWidth &&
    item.checkVisibility({ visibilityProperty: true }) &&
    !item.matches(":disabled, [aria-disabled='true']") &&
    item.closest("[inert]") === null
  );
};

// With nothing focused, the first arrow lands on the hovered item, else the page's first.
function startingItem(items: HTMLElement[]): HTMLElement | undefined {
  const main = document.querySelector("main");
  return (
    items.find((item) => item.matches(":hover")) ??
    items.find((item) => main?.contains(item)) ??
    items[0]
  );
}

function focusItem(item: HTMLElement) {
  item.focus({ preventScroll: true });
  item.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function onKeyDown(event: KeyboardEvent) {
  const direction = arrowKeyDirections[event.key];
  if (!direction || !isUnclaimedArrow(event)) return;

  const items = [
    ...document.querySelectorAll<HTMLElement>(ITEM_SELECTOR),
  ].filter(isNavigable);
  const active = document.activeElement;

  if (!(active instanceof HTMLElement) || active === document.body) {
    const start = startingItem(items);
    if (!start) return;
    event.preventDefault();
    focusItem(start);
    return;
  }

  const others = items.filter((item) => item !== active);
  const index = nearestInDirection(
    active.getBoundingClientRect(),
    others.map((item) => item.getBoundingClientRect()),
    direction,
  );
  // From an item, arrows only move focus, so the page doesn't scroll past the last one.
  if (index !== -1 || active.matches(ITEM_SELECTOR)) event.preventDefault();
  if (index !== -1) focusItem(others[index]);
}

const MENU_BUTTON_ITEM = `${ITEM_SELECTOR}[aria-haspopup="menu"]`;

// Base UI opens a menu on Up and Down from its button and stops the event. An item's menu button
// (a row's only control) takes the arrow first, so it moves between rows; Enter and Space still open it.
function onMenuButtonKeyDown(event: KeyboardEvent) {
  if (!arrowKeyDirections[event.key] || !isUnclaimedArrow(event)) return;
  if (!(event.target instanceof Element)) return;
  if (!event.target.matches(MENU_BUTTON_ITEM)) return;
  event.stopPropagation();
  onKeyDown(event);
}

/** Arrow keys move focus between the page's `data-arrow-nav` items, by their position on screen. */
export function useArrowNavigation() {
  useEffect(() => {
    window.addEventListener("keydown", onMenuButtonKeyDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onMenuButtonKeyDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}
