import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  LEFT,
  NEW_EXPENSE,
  OverspendDemoWindow,
  TOTAL,
  shift,
} from "./OverspendDemoWindow";
import "./OverspendDemo.css";

/*
  Food & fun has 82 € left. The pointer clicks into the add-expense field and types
  "Stadium tour 115 usd"; on the "d" the ≈ 99 € chip comes up. On Return the row lands in euros,
  the total rolls up to 517 € and what's left rolls past zero to -17 €, turning red.
*/

// The window's height that fits the box: down to the field where the expense lands, then the fade.
const VISIBLE_HEIGHT = 736;
const TYPED = `${NEW_EXPENSE.title} ${NEW_EXPENSE.paid}`;
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

type Point = { x: number; y: number };
type Column = { strip: HTMLElement; digit: number; at: number };
type Counter = { value: number; columns: Column[] };

const parts = (root: HTMLElement) => {
  const find = (selector: string) => root.querySelector<HTMLElement>(selector);
  const found = {
    stage: find(".ovs-stage"),
    cursor: find(".ovs-cursor"),
    row: find("[data-new-expense]"),
    after: find("[data-after-new]"),
    card: find("[data-after-allocation]"),
    group: find("[data-add-expense-group]"),
    field: find("[data-add-expense]"),
    placeholder: find("[data-placeholder]"),
    chip: find("[data-conversion]"),
    total: find("[data-total] [data-figure]"),
    remaining: find("[data-remaining]"),
    left: find("[data-remaining] [data-figure]"),
    sign: find("[data-remaining] [data-sign]"),
  };
  return Object.values(found).every(Boolean)
    ? (found as { [K in keyof typeof found]: HTMLElement })
    : null;
};

const counter = (figure: HTMLElement, value: number): Counter => ({
  value,
  columns: [...figure.querySelectorAll<HTMLElement>(".ovs-strip")].map(
    (strip, index) => {
      const digit = Number(String(value)[index]);
      return { strip, digit, at: 10 + digit };
    },
  ),
});

// An uneven but repeatable rhythm, so it types the same way every time.
const jitter = (i: number) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const ease = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** Plays the story once on the window's DOM; returns what stops it. */
const play = (root: HTMLElement) => {
  const el = parts(root);
  if (!el) return () => {};
  const { stage, cursor, row, after, card, group, field, placeholder, chip } =
    el;

  const timers = new Set<number>();
  const animations: Animation[] = [];
  let raf = 0;
  const later = (callback: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      callback();
    }, ms);
    timers.add(id);
    return id;
  };
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => later(resolve, ms));
  const frame = () =>
    new Promise<void>((resolve) => {
      raf = requestAnimationFrame(() => resolve());
    });
  const animate = (
    target: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ) => {
    const animation = target.animate(keyframes, options);
    animations.push(animation);
    return animation;
  };

  // Positions in the stage's own pixels, whatever scales or moves it on screen.
  const scale = () =>
    stage.getBoundingClientRect().width / stage.offsetWidth || 1;
  const local = (target: Element) => {
    const box = stage.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const k = scale();
    return {
      x: (rect.left - box.left) / k,
      y: (rect.top - box.top) / k,
      w: rect.width / k,
      h: rect.height / k,
    };
  };

  /* ---------- rolling figures ---------- */
  // Each changed digit rolls to the new one, the last digit first; a figure passing 9 carries on into 0.
  const spent = counter(el.total, TOTAL.before);
  const rest = counter(el.left, LEFT.before);
  const roll = (
    c: Counter,
    value: number,
    { delay = 0, duration = 720, stagger = 60 } = {},
  ) => {
    const digits = [...String(value)].map(Number);
    const up = value > c.value;
    c.value = value;
    [...c.columns].reverse().forEach((col, i) => {
      const d = digits[digits.length - 1 - i];
      if (d === col.digit) return;
      const from = shift(col.at);
      col.at += up ? (d - col.digit + 10) % 10 : -((col.digit - d + 10) % 10);
      col.digit = d;
      col.strip.style.transform = shift(col.at);
      animate(col.strip, [{ transform: from }, { transform: shift(col.at) }], {
        duration,
        delay: delay + i * stagger,
        easing: "cubic-bezier(0.3, 0.75, 0.1, 1)",
        fill: "backwards",
      });
    });
  };

  /* ---------- the pointer ---------- */
  let at: Point = { x: 0, y: 0 };
  const place = (p: Point) => {
    at = p;
    cursor.style.transform = `translate(${p.x}px, ${p.y}px)`;
    const f = local(group);
    const over =
      p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h;
    cursor.dataset.kind = over ? "ibeam" : "pointer";
  };
  // A hand travels in a shallow arc, quicker over short hops.
  const move = (to: Point) =>
    new Promise<void>((done) => {
      const from = at;
      const dist = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const ms = Math.min(650, Math.max(300, 260 + dist * 0.9));
      const bow = Math.min(dist * 0.08, 24);
      const nx = -(to.y - from.y) / dist;
      const ny = (to.x - from.x) / dist;
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - t0) / ms));
        const e = ease(t);
        const lift = Math.sin(Math.PI * e) * bow;
        place({
          x: from.x + (to.x - from.x) * e + nx * lift,
          y: from.y + (to.y - from.y) * e + ny * lift,
        });
        if (t < 1) raf = requestAnimationFrame(step);
        else done();
      };
      raf = requestAnimationFrame(step);
    });

  /* ---------- the field ---------- */
  const caret = document.createElement("span");
  caret.className = "ovs-caret";
  const line = document.createElement("span");
  line.className = "ovs-typed";
  let idle = 0;
  // Solid while keys land; blinks again once typing pauses, as Chromium's does.
  const keystroke = () => {
    root.dataset.typing = "";
    window.clearTimeout(idle);
    idle = later(() => delete root.dataset.typing, 520);
  };
  // The ⌘E hint shows while the field is focused and empty, as the app's does.
  const empty = (yes: boolean) => {
    placeholder.hidden = !yes;
    group.toggleAttribute("data-hint", yes);
  };
  // An input keeps its caret in view: a line longer than the field scrolls, with no animation.
  const reveal = () => {
    const over = field.scrollWidth - field.clientWidth;
    field.toggleAttribute("data-scrolled", over > 0);
    field.scrollLeft = Math.max(0, over);
  };
  const type = async (text: string, onKey: (typed: string) => void) => {
    const node = document.createTextNode("");
    line.replaceChildren(node);
    caret.before(line);
    let i = 0;
    for (const ch of text) {
      node.data += ch;
      if (i === 0) empty(false);
      keystroke();
      reveal();
      onKey(node.data);
      i++;
      let wait = 52 * (0.7 + 0.6 * jitter(i));
      if (ch === " ") wait += 40;
      await sleep(wait);
    }
  };

  // The app's ConversionPreview entrance, from its right edge. Where the line overflows, it glides
  // over as the chip takes its room instead of jumping.
  const convert = () => {
    const from = line.getBoundingClientRect().left;
    chip.hidden = false;
    reveal();
    const dx = (from - line.getBoundingClientRect().left) / scale();
    if (Math.abs(dx) > 0.5) {
      for (const target of [line, caret]) {
        animate(
          target,
          [{ transform: `translateX(${dx}px)` }, { transform: "none" }],
          { duration: 200, easing: EASE_OUT },
        );
      }
    }
    animate(
      chip,
      [
        { opacity: 0, transform: "scale(0.95)", filter: "blur(2px)" },
        { opacity: 1, transform: "none", filter: "blur(0)" },
      ],
      { duration: 200, easing: EASE_OUT },
    );
  };

  // The new row pushes the totals, the field and the card down; they glide there from where they were.
  const arrive = () => {
    const top = after.getBoundingClientRect().top;
    row.hidden = false;
    const delta = (top - after.getBoundingClientRect().top) / scale();
    for (const target of [after, card]) {
      animate(
        target,
        [{ transform: `translateY(${delta}px)` }, { transform: "none" }],
        { duration: 420, easing: EASE_OUT },
      );
    }
    animate(
      row,
      [
        { opacity: 0, transform: "translateY(10px)", filter: "blur(2px)" },
        { opacity: 1, transform: "none", filter: "blur(0)" },
      ],
      { duration: 340, delay: 110, easing: EASE_OUT, fill: "backwards" },
    );
  };

  const run = async () => {
    // The press lands past the placeholder's words and short of where the hint comes up.
    const f = local(group);
    const words = local(placeholder);
    const room = Math.max(words.x + words.w + 20, f.x + f.w * 0.55);
    const press = { x: Math.min(room, f.x + f.w - 96), y: f.y + f.h / 2 + 1 };

    // 1. Rest on the Remaining amount line, a little right of the press.
    const r = local(el.remaining);
    place({ x: press.x + 36, y: r.y + r.h / 2 });
    await frame();
    cursor.dataset.shown = "";
    await sleep(650);

    // 2. Into the field, as an I-beam. A press focuses it.
    await move(press);
    await sleep(120);
    cursor.dataset.pressed = "";
    group.dataset.focused = "";
    placeholder.before(caret);
    empty(true);
    keystroke();
    await sleep(90);
    delete cursor.dataset.pressed;
    await sleep(480);

    // 3. Typing hides the pointer. The chip comes in on the key that completes the currency.
    delete cursor.dataset.shown;
    await type(TYPED, (typed) => typed === TYPED && convert());
    await sleep(1600);

    // 4. Return: the line and the chip lift out as the row arrives above, in euros.
    keystroke();
    line.before(caret);
    const lift = [
      { opacity: 1, transform: "none", filter: "blur(0)" },
      { opacity: 0, transform: "translateY(-6px)", filter: "blur(2px)" },
    ];
    const leave = {
      duration: 160,
      easing: "ease-out",
      fill: "forwards" as const,
    };
    animate(chip, lift, leave);
    animate(line, lift, leave).finished.then(
      () => {
        line.remove();
        chip.hidden = true;
        chip.getAnimations().forEach((animation) => animation.cancel());
        field.scrollLeft = 0;
        delete field.dataset.scrolled;
        empty(true);
        animate(placeholder, [{ opacity: 0 }, { opacity: 1 }], {
          duration: 180,
          easing: "ease-out",
        });
      },
      () => {},
    );
    arrive();

    // A beat later the total takes the expense; a beat after that, what's left passes zero:
    // the minus opens in front of it and it turns red.
    roll(spent, TOTAL.after, { delay: 220 });
    await sleep(440);
    roll(rest, LEFT.after);
    await sleep(180);
    delete el.sign.dataset.closed;
    const width = el.sign.offsetWidth;
    animate(
      el.sign,
      [
        { width: "0px", opacity: 0 },
        { width: `${width}px`, opacity: 1 },
      ],
      { duration: 320, easing: EASE_OUT },
    );
    el.remaining.dataset.tone = "over";
    // 5. Hold: the caret blinks in the empty field.
  };

  later(() => void run(), 250);

  return () => {
    timers.forEach((id) => window.clearTimeout(id));
    cancelAnimationFrame(raf);
    animations.forEach((animation) => animation.cancel());
  };
};

export const OverspendDemo = ({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [reduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const fit = () => {
      const height = root.clientHeight;
      if (height > 0)
        root.style.setProperty(
          "--ovs-scale",
          String(Math.min(1, height / VISIBLE_HEIGHT)),
        );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // Once started, the story plays to its end even if the slide goes inactive.
  useEffect(() => {
    const root = rootRef.current;
    if (!active || reduced || stopRef.current || !root) return;
    stopRef.current = play(root);
  }, [active, reduced]);

  useEffect(
    () => () => {
      stopRef.current?.();
      stopRef.current = null;
    },
    [],
  );

  return (
    <div
      ref={rootRef}
      inert
      aria-hidden
      className={cn(
        "overspend-demo pointer-events-none relative h-full w-full select-none",
        className,
      )}
    >
      <div className="ovs-stage">
        <div className="ovs-fade absolute -inset-x-12 -top-12 bottom-0 px-12 pt-12">
          <OverspendDemoWindow
            finished={reduced}
            className="h-full w-[calc(100%+16px)]"
          />
        </div>
        <div className="ovs-cursor" data-kind="pointer">
          <div className="ovs-cursor__press">
            <div className="ovs-cursor__glyph" data-glyph="pointer">
              <svg height="24" width="24" viewBox="0 0 32 32" fill="none">
                <g transform="translate(10 7)">
                  <path
                    d="m6.148 18.473 1.863-1.003 1.615-.839-2.568-4.816h4.332l-11.379-11.408v16.015l3.316-3.221z"
                    fill="#fff"
                  />
                  <path
                    d="m6.431 17 1.765-.941-2.775-5.202h3.604l-8.025-8.043v11.188l2.53-2.442z"
                    fill="#000"
                  />
                </g>
              </svg>
            </div>
            <div className="ovs-cursor__glyph" data-glyph="ibeam">
              <svg
                width="10"
                height="16"
                viewBox="0 0 10 16"
                fill="none"
                overflow="visible"
              >
                <path
                  d="M3 1H7M3 15H7M5 1V15"
                  stroke="rgb(0 0 0 / 0.75)"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                />
                <path
                  d="M3 1H7M3 15H7M5 1V15"
                  stroke="#fff"
                  strokeWidth="1"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
