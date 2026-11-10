/**
 * When Cushn quits. It runs while a window is open or an agent is connected. An agent's relay
 * starts it with `BACKGROUND_FLAG` (no window, no dock icon), and it quits `idleMs` after the last
 * agent leaves, so one that reconnects soon still finds it. On Windows and Linux, closing the last
 * window quits at once, as it always has, unless an agent is still connected. A macOS app the user
 * opened stays running without windows until they quit it, as Mac apps do. Electron-free:
 * `index.ts` reports windows and connections and passes `app.quit`.
 */
export const BACKGROUND_FLAG = "--background";

export const IDLE_QUIT_MS = 60_000;

export interface LifetimeOptions {
  /** Started with `BACKGROUND_FLAG`. */
  background: boolean;
  platform: NodeJS.Platform;
  idleMs: number;
  quit(): void;
}

export interface Lifetime {
  windowOpened(): void;
  windowClosed(): void;
  connectionsChanged(count: number): void;
}

export function createLifetime({ background, platform, idleMs, quit }: LifetimeOptions): Lifetime {
  let staysOpen = platform === "darwin" && !background;
  let windows = 0;
  let connections = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function settle(delayMs: number): void {
    clearTimeout(timer);
    timer = undefined;
    if (staysOpen || windows > 0 || connections > 0) return;
    timer = setTimeout(quit, delayMs);
  }

  // Started windowless, it waits for the relay that started it to connect.
  settle(idleMs);

  return {
    windowOpened() {
      windows++;
      if (platform === "darwin") staysOpen = true;
      settle(idleMs);
    },
    windowClosed() {
      windows--;
      settle(0);
    },
    connectionsChanged(count) {
      connections = count;
      settle(idleMs);
    },
  };
}
