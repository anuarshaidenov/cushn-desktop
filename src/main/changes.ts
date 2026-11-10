/**
 * Tells every open renderer which query roots changed outside its own
 * mutations (an agent's write), so its screens refetch. Electron-free:
 * `index.ts` passes the windows' `webContents`.
 */
import { CHANGED_CHANNEL, type ChangedEvent, type QueryRoot } from "@shared/api";

/** The part of `WebContents` this needs. */
export interface ChangeTarget {
  isDestroyed(): boolean;
  send(channel: typeof CHANGED_CHANNEL, event: ChangedEvent): void;
}

export function createChangeNotifier(
  targets: () => Iterable<ChangeTarget>,
): (roots: readonly QueryRoot[]) => void {
  return (roots) => {
    if (roots.length === 0) return;
    const event: ChangedEvent = { roots: [...new Set(roots)] };
    for (const target of targets()) {
      if (!target.isDestroyed()) target.send(CHANGED_CHANNEL, event);
    }
  };
}
