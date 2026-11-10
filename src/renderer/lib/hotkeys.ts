import {
  defineAppHotkeys,
  formatForDisplay,
  type CustomHotkeys,
  type FormatDisplayOptions,
  type Hotkey,
  type HotkeyChord,
  type HotkeyPlatform,
} from "@tanstack/react-hotkeys";
import { platform } from "@/data/platform";

/**
 * Hotkey scopes that a `HotkeysProvider` turns on for one part of the app. App hotkeys declared in a
 * scope fire only while a provider with that scope is mounted, and may share keys with other scopes.
 */
export const hotkeyScopes = {
  /** `/dashboard`, the budgets grid and list. */
  budgetsList: "budgets-list",
  /** `/dashboard/$budgetId`, one budget with its allocations and expenses. */
  budget: "budget",
} as const;

/**
 * Every shortcut in the app, in cheat-sheet order. The ids key the user's saved rebindings
 * (`custom_hotkeys` in localStorage), so renaming one drops their customization.
 */
export const appHotkeys = defineAppHotkeys({
  // General
  "palette.open": {
    hotkey: "Mod+K",
    meta: { name: "Command palette", group: "General" },
    options: { requireReset: true },
  },
  "help.shortcuts": {
    hotkey: "?",
    meta: { name: "Keyboard shortcuts", group: "General" },
    options: { requireReset: true },
  },
  "budget.create": {
    hotkey: "C",
    meta: { name: "Create budget", group: "General" },
  },
  "theme.toggle": {
    hotkey: "T",
    meta: { name: "Toggle light / dark", group: "General" },
    options: { requireReset: true },
  },
  "sidebar.toggle": {
    hotkey: "[BracketLeft]",
    meta: { name: "Toggle sidebar", group: "General" },
    options: { requireReset: true },
  },
  "edit.undo": {
    hotkey: "Mod+Z",
    meta: { name: "Undo", group: "General" },
  },
  "edit.redo": {
    hotkey: "Mod+Shift+Z",
    meta: { name: "Redo", group: "General" },
  },
  "form.submit": {
    hotkey: "Mod+Enter",
    meta: { name: "Save form", group: "General" },
    options: { requireReset: true },
  },

  // Go to
  "nav.home": { hotkey: "H", meta: { name: "Home", group: "Go to" } },
  "nav.budgets": { hotkey: "B", meta: { name: "Budgets", group: "Go to" } },
  "nav.views": { hotkey: "V", meta: { name: "Views", group: "Go to" } },
  "nav.preferences": {
    hotkey: ["G", "S"],
    meta: { name: "Preferences", group: "Go to" },
  },
  "nav.shortcuts": {
    hotkey: ["G", "K"],
    meta: { name: "Shortcut settings", group: "Go to" },
  },
  "nav.templates": {
    hotkey: ["G", "T"],
    meta: { name: "Templates", group: "Go to" },
  },
  "nav.labels": {
    hotkey: ["G", "L"],
    meta: { name: "Labels", group: "Go to" },
  },
  "nav.archive": {
    hotkey: ["G", "A"],
    meta: { name: "Archived budgets", group: "Go to" },
  },
  "nav.trash": { hotkey: ["G", "D"], meta: { name: "Trash", group: "Go to" } },
  "nav.backup": {
    hotkey: ["G", "B"],
    meta: { name: "Backup", group: "Go to" },
  },
  "nav.agents": {
    hotkey: ["G", "I"],
    meta: { name: "Agents", group: "Go to" },
  },
  "nav.back": {
    hotkey: "Mod+[BracketLeft]",
    meta: { name: "Back", group: "Go to" },
    options: { requireReset: true },
  },
  "nav.forward": {
    hotkey: "Mod+[BracketRight]",
    meta: { name: "Forward", group: "Go to" },
    options: { requireReset: true },
  },

  // Budgets list
  "budgets.search": {
    hotkey: "Mod+F",
    meta: { name: "Search budgets", group: "Budgets list" },
    scope: hotkeyScopes.budgetsList,
  },
  "budgets.filter": {
    hotkey: "F",
    meta: { name: "Filter budgets", group: "Budgets list" },
    scope: hotkeyScopes.budgetsList,
    options: { requireReset: true },
  },
  "budgets.toggleLayout": {
    hotkey: "Mod+B",
    meta: { name: "Switch grid / list", group: "Budgets list" },
    scope: hotkeyScopes.budgetsList,
    options: { requireReset: true },
  },
  "budgets.selectAll": {
    hotkey: "Mod+A",
    meta: { name: "Select all budgets", group: "Budgets list" },
    scope: hotkeyScopes.budgetsList,
    options: { requireReset: true },
  },
  "budgets.clearSelection": {
    hotkey: "Escape",
    meta: { name: "Clear selection", group: "Budgets list" },
    scope: hotkeyScopes.budgetsList,
  },
  "budgets.archiveHovered": {
    hotkey: "E",
    meta: {
      name: "Archive hovered or selected budgets",
      group: "Budgets list",
    },
    scope: hotkeyScopes.budgetsList,
    options: { requireReset: true },
  },
  "budgets.trashHovered": {
    hotkey: "Mod+Backspace",
    meta: { name: "Delete hovered or selected budgets", group: "Budgets list" },
    scope: hotkeyScopes.budgetsList,
    options: { requireReset: true },
  },

  // Budget
  "expenses.nextInput": {
    hotkey: "Mod+E",
    meta: { name: "Next add-expense field", group: "Budget" },
    scope: hotkeyScopes.budget,
  },
  "expenses.previousInput": {
    hotkey: "Mod+Shift+E",
    meta: { name: "Previous add-expense field", group: "Budget" },
    scope: hotkeyScopes.budget,
  },
  "expenses.copy": {
    hotkey: "Mod+C",
    meta: { name: "Copy selected expenses", group: "Budget" },
    scope: hotkeyScopes.budget,
  },
  "expenses.delete": {
    hotkey: "Mod+Backspace",
    meta: { name: "Delete selected expenses", group: "Budget" },
    scope: hotkeyScopes.budget,
    options: { requireReset: true },
  },
  "expenses.selectAll": {
    hotkey: "Mod+A",
    meta: { name: "Select all expenses", group: "Budget" },
    scope: hotkeyScopes.budget,
    options: { requireReset: true },
  },
  "expenses.exitSelection": {
    hotkey: "Escape",
    meta: { name: "Exit expense selection", group: "Budget" },
    scope: hotkeyScopes.budget,
  },

  // Views
  "views.create": {
    hotkey: "Alt+V",
    meta: { name: "Create view", group: "Views" },
    options: { requireReset: true },
  },
});

declare module "@tanstack/react-hotkeys" {
  interface Register {
    appHotkeys: typeof appHotkeys;
  }
}

export const hotkeyPlatform: HotkeyPlatform =
  platform === "darwin" ? "mac" : platform === "win32" ? "windows" : "linux";

// Windows and Linux spell these out ("Ctrl+Enter"); the symbols are a macOS convention.
const keyLabels: Record<string, string> =
  hotkeyPlatform === "mac" ? {} : { Backspace: "Backspace", Enter: "Enter" };
const labelOptions = {
  platform: hotkeyPlatform,
  keyLabels,
} satisfies FormatDisplayOptions;

/** One string for text and single chips: "⌘K" on macOS, "Ctrl+K" elsewhere, "G S" for a sequence. */
export const formatHotkeyLabel = (hotkey: Hotkey): string =>
  formatForDisplay(hotkey, {
    ...labelOptions,
    separatorToken: hotkeyPlatform === "mac" ? "" : null,
  });

/** Each key's label, for one chip per key: ["⌘", "K"], ["Ctrl", "K"]. */
export const hotkeyKeyLabels = (chord: HotkeyChord): string[] =>
  formatForDisplay(chord, { ...labelOptions, parts: true });

const CUSTOM_HOTKEYS_KEY = "custom_hotkeys";

/** Only the bindings the user changed, so new defaults still reach them. Invalid entries are dropped by the provider. */
export function loadCustomHotkeys(): CustomHotkeys {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(CUSTOM_HOTKEYS_KEY) ?? "{}",
    );
    return saved && typeof saved === "object" && !Array.isArray(saved)
      ? (saved as CustomHotkeys)
      : {};
  } catch {
    return {};
  }
}

export function saveCustomHotkeys(customHotkeys: CustomHotkeys): void {
  localStorage.setItem(CUSTOM_HOTKEYS_KEY, JSON.stringify(customHotkeys));
}
