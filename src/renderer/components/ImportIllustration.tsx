import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import type { ImportMode } from "@shared/api";
import { cn } from "@/lib/utils";

const VIEW_W = 460;
const VIEW_H = 168;
const COLS = 5;
const ROWS = 2;
const BOX_W = 64;
const BOX_H = 46;
const GAP = 12;
const STEP_X = BOX_W + GAP;
const STEP_Y = BOX_H + GAP;
const GRID_X = (VIEW_W - COLS * STEP_X + GAP) / 2;
const GRID_Y = (VIEW_H - ROWS * STEP_Y + GAP) / 2;
const POOL = 16;
const BAR_W = BOX_W - 18;
const TITLE_WIDTHS = [26, 18, 30, 22, 34, 20, 28, 24];
const PROGRESS = [0.62, 0.35, 0.8, 0.5, 0.25, 0.7, 0.45, 0.9];

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";
const EASE_DRAWER = "cubic-bezier(0.32, 0.72, 0, 1)";

const SHIFT_MS = 640;
const SHIFT_STAGGER = 35;
const ADD_START = 5;
const ADD_ARRIVALS = 3;
const REPLACE_COUNTS = [7, 5] as const;

type Scene = { count: number; tint: (slot: number) => boolean };

const SCENES: Record<ImportMode, { motion: Scene; still: Scene }> = {
  add: {
    motion: { count: ADD_START, tint: () => false },
    still: { count: ADD_START + 1, tint: (slot) => slot === 0 },
  },
  replace: {
    motion: { count: REPLACE_COUNTS[0], tint: () => false },
    still: { count: REPLACE_COUNTS[1], tint: () => true },
  },
};

type Frame = { transform: string; opacity: number; offset?: number };
type Timing = { duration: number; delay?: number; easing?: string };

const slotOrigin = (slot: number) => ({
  x: GRID_X + (slot % COLS) * STEP_X,
  y: GRID_Y + Math.floor(slot / COLS) * STEP_Y,
});

function pose(
  slot: number,
  { dx = 0, dy = 0, scale = 1, opacity = 1 } = {},
): Frame {
  const { x, y } = slotOrigin(slot);
  return {
    transform: `translate(${x + dx}px, ${y + dy}px) scale(${scale})`,
    opacity,
  };
}

/** Animates from the element's current rendered state, so any tween can interrupt another. */
function tween(el: SVGGElement, frames: Frame[], timing: Timing, from?: Frame) {
  const style = getComputedStyle(el);
  const start = from ?? {
    transform: style.transform,
    opacity: Number(style.opacity),
  };
  const end = frames[frames.length - 1];
  for (const animation of el.getAnimations()) animation.cancel();
  el.style.transform = end.transform;
  el.style.opacity = String(end.opacity);
  if (timing.duration === 0) return;
  el.animate([start, ...frames], {
    duration: timing.duration,
    delay: timing.delay ?? 0,
    easing: timing.easing ?? EASE_OUT,
    fill: "backwards",
  });
}

const fade = (el: SVGGElement, opacity: number, timing: Timing) =>
  tween(el, [{ transform: "none", opacity }], timing);

type Stage = {
  boxes: SVGGElement[];
  tints: SVGGElement[];
  slots: (number | null)[];
};

function play(
  stage: Stage,
  mode: ImportMode,
  reduced: boolean,
  instant: boolean,
) {
  const { boxes, tints, slots } = stage;
  let alive = true;
  const timers = new Set<number>();
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (alive) resolve();
      }, ms);
      timers.add(id);
    });

  const visible = () =>
    slots
      .flatMap((slot, i) => (slot === null ? [] : [i]))
      .sort((a, b) => slots[a]! - slots[b]!);

  const free = () => {
    const idle = slots.flatMap((slot, i) => (slot === null ? [i] : []));
    const clear = (i: number) =>
      Number(getComputedStyle(boxes[i]).opacity) < 0.01;
    return [...idle.filter(clear), ...idle.filter((i) => !clear(i))];
  };

  const timing = (duration: number, delay = 0, easing = EASE_OUT): Timing =>
    instant
      ? { duration: 0 }
      : reduced
        ? { duration: 200, easing: "ease" }
        : { duration, delay, easing };

  const settle = (scene: Scene) => {
    const owners = new Map<number, number>();
    for (const i of visible()) {
      const slot = slots[i]!;
      if (slot < scene.count && !owners.has(slot)) {
        owners.set(slot, i);
        tween(boxes[i], [pose(slot)], timing(520));
      } else {
        slots[i] = null;
        const { transform } = getComputedStyle(boxes[i]);
        tween(boxes[i], [{ transform, opacity: 0 }], timing(280));
      }
    }
    const spare = free();
    let entering = 0;
    for (let slot = 0; slot < scene.count; slot++) {
      const tint = scene.tint(slot) ? 1 : 0;
      const owner = owners.get(slot);
      if (owner !== undefined) {
        fade(tints[owner], tint, timing(400, 0, "ease"));
        continue;
      }
      const i = spare.shift()!;
      slots[i] = slot;
      fade(tints[i], tint, { duration: 0 });
      tween(
        boxes[i],
        [pose(slot)],
        timing(440, entering++ * 40),
        pose(slot, { scale: reduced ? 1 : 0.96, opacity: 0 }),
      );
    }
  };

  const arrive = () => {
    const movers = visible().reverse();
    const newcomer = free()[0];
    movers.forEach((i, order) => {
      const from = slots[i]!;
      const to = from + 1;
      const delay = order * SHIFT_STAGGER;
      slots[i] = to;
      fade(tints[i], 0, { duration: 700, delay, easing: "ease" });
      const frames =
        to % COLS === 0
          ? [
              { ...pose(from, { dx: STEP_X / 2, opacity: 0 }), offset: 0.5 },
              { ...pose(to, { dx: -STEP_X / 2, opacity: 0 }), offset: 0.5 },
              pose(to),
            ]
          : [pose(to)];
      tween(boxes[i], frames, {
        duration: SHIFT_MS,
        delay,
        easing: EASE_IN_OUT,
      });
    });
    slots[newcomer] = 0;
    fade(tints[newcomer], 1, { duration: 0 });
    tween(
      boxes[newcomer],
      [pose(0)],
      {
        duration: 560,
        delay: Math.max(movers.length - 1, 0) * SHIFT_STAGGER + 320,
        easing: EASE_OUT,
      },
      pose(0, { dy: -16, scale: 0.9, opacity: 0 }),
    );
  };

  const swap = (count: number) => {
    const leavers = visible();
    const spare = free();
    leavers.forEach((i, order) => {
      const slot = slots[i]!;
      slots[i] = null;
      tween(boxes[i], [pose(slot, { dy: 6, scale: 0.94, opacity: 0 })], {
        duration: 380,
        delay: order * 45,
        easing: EASE_DRAWER,
      });
    });
    const start = Math.max(leavers.length - 1, 0) * 45 + 380 + 160;
    for (let slot = 0; slot < count; slot++) {
      const i = spare[slot];
      slots[i] = slot;
      fade(tints[i], 1, { duration: 0 });
      tween(
        boxes[i],
        [pose(slot)],
        { duration: 520, delay: start + slot * 55, easing: EASE_OUT },
        pose(slot, { dy: -12, scale: 0.94, opacity: 0 }),
      );
    }
    return start + (count - 1) * 55 + 520;
  };

  const loopAdd = async () => {
    await wait(800);
    for (;;) {
      for (let n = 0; n < ADD_ARRIVALS; n++) {
        arrive();
        await wait(2400);
      }
      for (const i of visible()) {
        tween(boxes[i], [pose(slots[i]!, { opacity: 0 })], {
          duration: 420,
          easing: "ease",
        });
        slots[i] = null;
      }
      await wait(620);
      settle(SCENES.add.motion);
      await wait(1300);
    }
  };

  const loopReplace = async () => {
    await wait(700);
    for (let round = 1; ; round++) {
      const settled = swap(REPLACE_COUNTS[round % 2]);
      await wait(settled + 1400);
      visible().forEach((i, order) =>
        fade(tints[i], 0, { duration: 700, delay: order * 40, easing: "ease" }),
      );
      await wait(1700);
    }
  };

  settle(reduced ? SCENES[mode].still : SCENES[mode].motion);
  if (!reduced) void (mode === "add" ? loopAdd() : loopReplace());

  return () => {
    alive = false;
    for (const id of timers) window.clearTimeout(id);
    timers.clear();
  };
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

const subscribeReducedMotion = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

const prefersReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;

const BoxFace = (props: { index: number; primary?: boolean }) => {
  const variant = props.index % TITLE_WIDTHS.length;
  return (
    <>
      <rect
        x={0.5}
        y={0.5}
        width={BOX_W - 1}
        height={BOX_H - 1}
        rx={7.5}
        className={
          props.primary
            ? "fill-[color-mix(in_oklch,var(--primary)_12%,var(--card))] stroke-primary/50 dark:fill-[color-mix(in_oklch,var(--primary)_26%,var(--popover))]"
            : "fill-card stroke-border dark:fill-[color-mix(in_oklch,var(--muted)_70%,var(--popover))]"
        }
      />
      <rect
        x={9}
        y={9}
        width={10}
        height={10}
        rx={3}
        className={props.primary ? "fill-primary/60" : "fill-foreground/12"}
      />
      <rect
        x={24}
        y={11.5}
        width={TITLE_WIDTHS[variant]}
        height={5}
        rx={2.5}
        className={props.primary ? "fill-primary/30" : "fill-foreground/10"}
      />
      <rect
        x={9}
        y={BOX_H - 14}
        width={BAR_W}
        height={4}
        rx={2}
        className={props.primary ? "fill-primary/15" : "fill-foreground/8"}
      />
      <rect
        x={9}
        y={BOX_H - 14}
        width={BAR_W * PROGRESS[variant]}
        height={4}
        rx={2}
        className={props.primary ? "fill-primary/70" : "fill-foreground/25"}
      />
    </>
  );
};

export function ImportIllustration(props: {
  mode: ImportMode;
  className?: string;
}) {
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
  );
  const boxes = useRef<SVGGElement[]>([]);
  const tints = useRef<SVGGElement[]>([]);
  const slots = useRef<(number | null)[]>(Array(POOL).fill(null));
  const started = useRef(false);

  useLayoutEffect(() => {
    const stop = play(
      { boxes: boxes.current, tints: tints.current, slots: slots.current },
      props.mode,
      reduced,
      !started.current,
    );
    started.current = true;
    return stop;
  }, [props.mode, reduced]);

  useEffect(() => {
    const elements = [...boxes.current, ...tints.current];
    return () => {
      for (const el of elements) {
        for (const animation of el.getAnimations()) animation.cancel();
      }
    };
  }, []);

  return (
    <svg
      aria-hidden
      fill="none"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className={cn("block h-auto w-full", props.className)}
    >
      <rect
        width={VIEW_W}
        height={VIEW_H}
        rx={14}
        className="fill-muted/40 dark:fill-muted/25"
      />
      {Array.from({ length: COLS * ROWS }, (_, slot) => {
        const { x, y } = slotOrigin(slot);
        return (
          <rect
            key={slot}
            x={x + 0.5}
            y={y + 0.5}
            width={BOX_W - 1}
            height={BOX_H - 1}
            rx={7.5}
            strokeDasharray="4 4"
            className="stroke-border"
          />
        );
      })}
      {Array.from({ length: POOL }, (_, i) => (
        <g
          key={i}
          ref={(el) => {
            if (el) boxes.current[i] = el;
          }}
          className="origin-center opacity-0 transform-fill"
        >
          <BoxFace index={i} />
          <g
            ref={(el) => {
              if (el) tints.current[i] = el;
            }}
            className="opacity-0"
          >
            <BoxFace index={i} primary />
          </g>
        </g>
      ))}
    </svg>
  );
}
