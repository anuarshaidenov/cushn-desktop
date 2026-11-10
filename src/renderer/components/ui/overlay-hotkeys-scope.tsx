import { useId, type ReactNode } from "react";
import { HotkeysProvider } from "@tanstack/react-hotkeys";

/**
 * While an overlay is open, only hotkeys registered inside it fire. Hooks register under the nearest
 * provider above their component, so an overlay's own hotkeys belong in a component rendered inside it.
 */
export function OverlayHotkeysScope({ children }: { children: ReactNode }) {
  return (
    <HotkeysProvider scope={`overlay-${useId()}`} exclusive>
      {children}
    </HotkeysProvider>
  );
}
