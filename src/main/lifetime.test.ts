import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type LifetimeOptions, createLifetime } from "./lifetime";

const IDLE_MS = 60_000;

let quit: ReturnType<typeof vi.fn<() => void>>;

function lifetime(options: Pick<LifetimeOptions, "background" | "platform">) {
  return createLifetime({ ...options, idleMs: IDLE_MS, quit });
}

beforeEach(() => {
  vi.useFakeTimers();
  quit = vi.fn<() => void>();
});

afterEach(() => {
  vi.useRealTimers();
});

describe.each<NodeJS.Platform>(["darwin", "win32", "linux"])(
  "started in the background on %s",
  (platform) => {
    it("quits when no agent connects in time", () => {
      lifetime({ background: true, platform });

      vi.advanceTimersByTime(IDLE_MS - 1);
      expect(quit).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(quit).toHaveBeenCalledOnce();
    });

    it("runs while agents are connected and quits a while after the last one leaves", () => {
      const life = lifetime({ background: true, platform });
      life.connectionsChanged(1);
      life.connectionsChanged(2);
      vi.advanceTimersByTime(IDLE_MS * 10);

      life.connectionsChanged(1);
      vi.advanceTimersByTime(IDLE_MS * 10);
      life.connectionsChanged(0);
      vi.advanceTimersByTime(IDLE_MS - 1);

      expect(quit).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(quit).toHaveBeenCalledOnce();
    });

    it("stays for an agent that reconnects within the grace period", () => {
      const life = lifetime({ background: true, platform });
      life.connectionsChanged(1);
      life.connectionsChanged(0);
      vi.advanceTimersByTime(IDLE_MS - 1);

      life.connectionsChanged(1);
      vi.advanceTimersByTime(IDLE_MS * 10);

      expect(quit).not.toHaveBeenCalled();
    });

    it("stays while the user has a window open", () => {
      const life = lifetime({ background: true, platform });
      life.windowOpened();
      vi.advanceTimersByTime(IDLE_MS * 10);

      expect(quit).not.toHaveBeenCalled();
    });
  },
);

describe("macOS", () => {
  it("keeps an app the user opened running without windows", () => {
    const life = lifetime({ background: false, platform: "darwin" });
    life.windowOpened();
    life.windowClosed();
    vi.advanceTimersByTime(IDLE_MS * 10);

    expect(quit).not.toHaveBeenCalled();
  });

  it("keeps a background app running once the user opens a window", () => {
    const life = lifetime({ background: true, platform: "darwin" });
    life.connectionsChanged(1);
    life.windowOpened();
    life.windowClosed();
    life.connectionsChanged(0);
    vi.advanceTimersByTime(IDLE_MS * 10);

    expect(quit).not.toHaveBeenCalled();
  });
});

describe.each<NodeJS.Platform>(["win32", "linux"])("%s", (platform) => {
  it("quits as soon as the last window closes", () => {
    const life = lifetime({ background: false, platform });
    life.windowOpened();
    life.windowOpened();
    life.windowClosed();
    vi.advanceTimersByTime(IDLE_MS * 10);
    expect(quit).not.toHaveBeenCalled();

    life.windowClosed();
    vi.advanceTimersByTime(0);
    expect(quit).toHaveBeenCalledOnce();
  });

  it("keeps running for a connected agent after the last window closes", () => {
    const life = lifetime({ background: false, platform });
    life.windowOpened();
    life.connectionsChanged(1);
    life.windowClosed();
    vi.advanceTimersByTime(IDLE_MS * 10);
    expect(quit).not.toHaveBeenCalled();

    life.connectionsChanged(0);
    vi.advanceTimersByTime(IDLE_MS);
    expect(quit).toHaveBeenCalledOnce();
  });
});
