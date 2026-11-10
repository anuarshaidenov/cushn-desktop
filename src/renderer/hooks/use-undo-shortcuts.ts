import { useHotkey } from "@tanstack/react-hotkeys";
import { useStore } from "zustand";
import { appHotkeys, hotkeyPlatform } from "@/lib/hotkeys";
import { undoHistory } from "@/lib/undo";
import { redo, undo } from "@/lib/undoToast";

// Text fields keep their own undo; with nothing to undo or redo, the key goes back to the browser.
const options = { ignoreInputs: true, requireReset: true } as const;

/** ⌘Z / ⇧⌘Z (and Ctrl+Y off macOS) over the session undo history. */
export const useUndoShortcuts = () => {
  const canUndo = useStore(undoHistory.store, (state) => state.past.length > 0);
  const canRedo = useStore(
    undoHistory.store,
    (state) => state.future.length > 0,
  );

  useHotkey(appHotkeys["edit.undo"], () => void undo(), {
    ...options,
    enabled: canUndo,
  });
  useHotkey(appHotkeys["edit.redo"], () => void redo(), {
    ...options,
    enabled: canRedo,
  });
  useHotkey("Control+Y", () => void redo(), {
    ...options,
    enabled: canRedo && hotkeyPlatform !== "mac",
    meta: { name: "Redo" },
  });
};
