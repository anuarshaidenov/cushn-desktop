import { useEffect, useRef, useState } from "react";
import { platform } from "@/data/platform";
import { appHotkeys, hotkeyKeyLabels } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";
import { matches, QUERY, ShortcutsDemoWindow } from "./ShortcutsDemoWindow";
import "./ShortcutsDemo.css";

/*
  The Budgets grid, driven from the keyboard alone: ⌘K opens the palette,
  "light" filters it down to Switch to light mode and its shortcut, T, and
  Return runs it. A beat later a lone T switches back. Each key shows as a
  keycap under the palette. Reduced motion gets the frame that says it all
  instead: the palette open on "light", the command and its T.
*/

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
// The app's ease-out-quint, which its overlays use.
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
const RETURN_KEY = platform === "darwin" ? "↵" : "Enter";

export const ShortcutsDemo = ({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [still] = useState(() => window.matchMedia(REDUCED_MOTION).matches);

  useEffect(
    () => () => {
      stopRef.current?.();
      stopRef.current = null;
    },
    [],
  );

  // Once started it runs to the end and holds there, whatever `active` does next.
  useEffect(() => {
    const root = rootRef.current;
    if (!active || still || stopRef.current || !root) return;
    stopRef.current = playStory(root);
  }, [active, still]);

  return (
    <div
      ref={rootRef}
      inert
      aria-hidden="true"
      className={cn("shortcuts-demo relative h-full w-full", className)}
    >
      <div className="sc-frame">
        <div className="sc-stage">
          <ShortcutsDemoWindow still={still} />
        </div>
      </div>
      <div className="sc-keys" />
    </div>
  );
};

/** Plays the story on the rendered window; returns what stops it. */
const playStory = (root: HTMLElement) => {
  const find = (selector: string) => root.querySelector<HTMLElement>(selector);
  const win = find(".sc-window");
  const scrim = find("[data-scrim]");
  const palette = find("[data-palette]");
  const typed = find("[data-query]");
  const placeholder = find("[data-placeholder]");
  const separator = find("[cmdk-separator]");
  const hud = find(".sc-keys");
  if (!win || !scrim || !palette || !typed || !placeholder) return () => {};
  if (!separator || !hud) return () => {};
  const groups = [...root.querySelectorAll<HTMLElement>("[cmdk-group]")];
  const items = [...root.querySelectorAll<HTMLElement>("[cmdk-item]")];

  const timers = new Set<number>();
  const frames = new Set<number>();
  const animations: Animation[] = [];
  const later = (ms: number, run: () => void) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      run();
    }, ms);
    timers.add(id);
    return id;
  };
  const cancel = (id: number) => {
    window.clearTimeout(id);
    timers.delete(id);
  };
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => later(ms, resolve));
  const frame = () =>
    new Promise<void>((resolve) => {
      const id = requestAnimationFrame(() => {
        frames.delete(id);
        resolve();
      });
      frames.add(id);
    });
  const animate = (
    el: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ) => {
    const animation = el.animate(keyframes, options);
    animations.push(animation);
    return animation;
  };
  // An uneven but repeatable rhythm, so it types the same way every time.
  const jitter = (i: number) => {
    const x = Math.sin(i * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  // A row of caps per keystroke: it rises in, its keys go down in the order
  // fingers press them, and the app acts on the last one's down-stroke.
  const press = async (caps: string[], act: () => void) => {
    const row = document.createElement("div");
    row.className = "sc-keys__row";
    const keys = caps.map((cap) => {
      const key = document.createElement("kbd");
      key.className = "sc-key";
      key.textContent = cap;
      return key;
    });
    row.append(...keys);
    hud.append(row);
    // Styled hidden first, so it transitions in.
    void row.offsetWidth;
    await frame();
    row.dataset.shown = "";
    await sleep(220);
    for (const [i, key] of keys.entries()) {
      if (i) await sleep(90);
      key.dataset.down = "";
    }
    act();
    await sleep(150);
    keys.forEach((key) => delete key.dataset.down);
    later(700, () => {
      delete row.dataset.shown;
      later(240, () => row.remove());
    });
  };

  // Solid while keys land; blinks again once typing pauses.
  let idle = 0;
  const keystroke = () => {
    root.dataset.typing = "";
    cancel(idle);
    idle = later(520, () => {
      delete root.dataset.typing;
    });
  };

  // The palette opens and closes at once, as the app's does; its overlay fades.
  const open = () => {
    scrim.hidden = false;
    palette.hidden = false;
    keystroke();
    animate(scrim, [{ opacity: 0 }, { opacity: 1 }], {
      duration: 200,
      easing: EASE,
    });
  };
  const close = () => {
    palette.hidden = true;
    animate(scrim, [{ opacity: 1 }, { opacity: 0 }], {
      duration: 150,
      easing: EASE,
      fill: "forwards",
    }).onfinish = () => {
      scrim.hidden = true;
    };
  };

  // A row, group or separator leaving the list folds away as its content dims;
  // marked out at once, so a letter typed mid-fold doesn't fold it again.
  const out = new Set<HTMLElement>();
  const fold = (el: HTMLElement, to = 0) => {
    out.add(el);
    const style = getComputedStyle(el);
    el.style.overflow = "hidden";
    animate(
      el,
      [
        {
          height: `${el.offsetHeight}px`,
          paddingTop: style.paddingTop,
          paddingBottom: style.paddingBottom,
        },
        { height: `${to}px`, paddingTop: "0px", paddingBottom: "0px" },
      ],
      {
        duration: 300,
        delay: 20,
        easing: "cubic-bezier(0.4, 0, 0.2, 1)",
        fill: "both",
      },
    ).onfinish = () => {
      el.hidden = true;
      el.style.overflow = "";
      el.getAnimations().forEach((animation) => animation.cancel());
    };
    animate(el, [{ opacity: 1 }, { opacity: 0 }], {
      duration: 300,
      easing: "cubic-bezier(0, 0.8, 0.5, 1)",
      fill: "forwards",
    });
  };
  const shown = (els: HTMLElement[]) =>
    els.filter((el) => !el.hidden && !out.has(el));
  const rowsOf = (group: HTMLElement) =>
    shown([...group.querySelectorAll<HTMLElement>("[cmdk-item]")]);
  const select = (row?: HTMLElement) =>
    items.forEach((el) => {
      el.dataset.selected = String(el === row);
    });

  // cmdk filters on every keystroke and highlights the first row left; the
  // separator shows only for an empty search.
  const filter = (text: string) => {
    const left = shown(items).filter((el) =>
      matches(el.dataset.value ?? "", text),
    );
    select(left[0]);
    if (!out.has(separator)) fold(separator);
    const live = shown(groups);
    for (const group of live) {
      const rows = rowsOf(group);
      const keep = rows.filter((el) => left.includes(el));
      if (keep.length) {
        rows.filter((el) => !keep.includes(el)).forEach((el) => fold(el));
        continue;
      }
      // Only the first group has the list's 4px top padding; the next takes
      // it once the first is hidden, so the first folds to 4px, not 0.
      const rest = live
        .slice(live.indexOf(group) + 1)
        .some((g) => rowsOf(g).some((el) => left.includes(el)));
      fold(group, group === live[0] && rest ? 4 : 0);
    }
  };

  const type = async (text: string, pace = 150) => {
    let query = "";
    for (const ch of text) {
      query += ch;
      typed.textContent = query;
      placeholder.hidden = true;
      keystroke();
      filter(query);
      await sleep(pace * (0.7 + 0.6 * jitter(query.length)));
    }
  };

  // While it flips, every colour and shadow in the window eases across.
  let settle = 0;
  const theme = (light: boolean) => {
    win.dataset.theming = "";
    if (light) win.dataset.theme = "light";
    else delete win.dataset.theme;
    cancel(settle);
    settle = later(480, () => {
      delete win.dataset.theming;
    });
  };

  const story = async () => {
    await sleep(700);
    await press(
      hotkeyKeyLabels(appHotkeys["palette.open"].defaultHotkey),
      open,
    );
    await sleep(700);
    await type(QUERY);
    await sleep(1100);
    await press([RETURN_KEY], () => {
      close();
      theme(true);
    });
    await sleep(1700);
    await press(hotkeyKeyLabels(appHotkeys["theme.toggle"].defaultHotkey), () =>
      theme(false),
    );
  };
  later(250, () => void story());

  return () => {
    timers.forEach((id) => window.clearTimeout(id));
    frames.forEach((id) => cancelAnimationFrame(id));
    animations.forEach((animation) => animation.cancel());
  };
};
