import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  TEMPLATE_CHOSEN,
  TEMPLATE_FROM,
  TemplatesDemoWindow,
} from "./TemplatesDemoWindow";
import "./TemplatesDemo.css";

/*
  A new Lisbon trip, 2 000 €, in the New budget dialog over Home.
  1. The pointer rests in the empty description.
  2. It presses the template chip; the menu opens, 50/30/20 checked.
  3. Down to Travel and a press: the menu closes and the chip says Travel.
  4. Over to Create budget and a press.
  5. The dialog closes onto the new budget, already split 700 / 800 / 500 €,
     its blocks rising in. The pointer fades once the page has landed.
*/

type Point = { x: number; y: number };

// The app's ease-out-quint, which its dialogs, menus and presses use.
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
const LEAD_IN = 250;

export const TemplatesDemo = ({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [finished] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  // Starts once, the first time the slide is active. Leaving before the lead-in ends waits for the next time.
  useEffect(() => {
    const stage = stageRef.current;
    if (!active || finished || !stage || stopRef.current) return;
    const timer = window.setTimeout(() => {
      stopRef.current = play(stage);
    }, LEAD_IN);
    return () => window.clearTimeout(timer);
  }, [active, finished]);

  useEffect(() => () => stopRef.current?.(), []);

  return (
    <div
      inert
      aria-hidden="true"
      className={cn("templates-demo relative h-full w-full", className)}
    >
      <div ref={stageRef} className="tpl-stage">
        <div className="tpl-fade">
          <TemplatesDemoWindow finished={finished} />
        </div>
        <div data-cursor="" className="tpl-cursor">
          <div className="tpl-cursor__press">
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
        </div>
      </div>
    </div>
  );
};

// Plays the story on the window as rendered at its start, and returns what stops it.
function play(stage: HTMLElement) {
  const pick = (selector: string) => {
    const element = stage.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`TemplatesDemo: missing ${selector}`);
    return element;
  };
  const home = pick('[data-page="home"]');
  const page = pick('[data-page="budget"]');
  const scrim = pick("[data-scrim]");
  const dialog = pick("[data-dialog]");
  const menu = pick("[data-menu]");
  const trigger = pick("[data-template-trigger]");
  const label = pick("[data-template-label]");
  const rest = pick("[data-rest]");
  const create = pick("[data-create]");
  const cursor = pick("[data-cursor]");
  const from = pick(`[data-template-item="${TEMPLATE_FROM}"]`);
  const chosen = pick(`[data-template-item="${TEMPLATE_CHOSEN}"]`);
  const items = [...menu.querySelectorAll<HTMLElement>("[data-template-item]")];
  const blocks = [...page.querySelectorAll<HTMLElement>("[data-enter]")];

  let timer = 0;
  let raf = 0;
  const animations: Animation[] = [];
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      timer = window.setTimeout(resolve, ms);
    });
  const frame = () =>
    new Promise<void>((resolve) => {
      raf = requestAnimationFrame(() => resolve());
    });
  const animate = (
    element: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
    onFinish?: () => void,
  ) => {
    const animation = element.animate(keyframes, options);
    if (onFinish) animation.onfinish = onFinish;
    animations.push(animation);
  };

  // Stage pixels: the stage's own scale and any transform above it cancel out.
  const local = (element: Element) => {
    const box = stage.getBoundingClientRect();
    const k = box.width / stage.offsetWidth || 1;
    const rect = element.getBoundingClientRect();
    return {
      x: (rect.left - box.left) / k,
      y: (rect.top - box.top) / k,
      w: rect.width / k,
      h: rect.height / k,
    };
  };
  const over = (element: Element, point: Point) => {
    const r = local(element);
    return (
      point.x >= r.x &&
      point.x <= r.x + r.w &&
      point.y >= r.y &&
      point.y <= r.y + r.h
    );
  };
  // Off a control's words, so the arrow doesn't sit on what it clicks.
  const aim = (element: Element, fx: number, fy: number) => {
    const r = local(element);
    return { x: r.x + r.w * fx, y: r.y + r.h * fy };
  };

  const select = (target: HTMLElement) =>
    items.forEach((item) =>
      item.toggleAttribute("data-selected", item === target),
    );
  const highlight = (target: HTMLElement) =>
    items.forEach((item) =>
      item.toggleAttribute("data-highlighted", item === target),
    );

  let at: Point = { x: 0, y: 0 };
  let menuOpen = false;
  // What's under the pointer answers, as in the app: the chip and the button lighten, a menu row highlights.
  const place = (point: Point) => {
    const onTrigger = over(trigger, point);
    const onCreate = over(create, point);
    const row = menuOpen ? items.find((item) => over(item, point)) : undefined;
    at = point;
    cursor.style.transform = `translate(${point.x}px, ${point.y}px)`;
    trigger.toggleAttribute("data-hover", onTrigger);
    create.toggleAttribute("data-hover", onCreate);
    if (row) highlight(row);
  };
  const easeInOut = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  // A hand travels in a shallow arc, quicker over short hops.
  const move = (to: Point) =>
    new Promise<void>((resolve) => {
      const start = at;
      const dist = Math.hypot(to.x - start.x, to.y - start.y) || 1;
      const ms = Math.min(650, Math.max(300, 260 + dist * 0.9));
      const bow = Math.min(dist * 0.08, 24);
      const nx = -(to.y - start.y) / dist;
      const ny = (to.x - start.x) / dist;
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - t0) / ms));
        const e = easeInOut(t);
        const lift = Math.sin(Math.PI * e) * bow;
        place({
          x: start.x + (to.x - start.x) * e + nx * lift,
          y: start.y + (to.y - start.y) * e + ny * lift,
        });
        if (t < 1) raf = requestAnimationFrame(step);
        else resolve();
      };
      raf = requestAnimationFrame(step);
    });
  // The pointer dips, and a button under it gives (active:scale-[0.97]).
  const down = (button?: HTMLElement) => {
    cursor.toggleAttribute("data-pressed", true);
    if (button)
      animate(button, [{ transform: "none" }, { transform: "scale(0.97)" }], {
        duration: 100,
        easing: EASE,
        fill: "forwards",
      });
  };
  const up = (button?: HTMLElement) => {
    cursor.removeAttribute("data-pressed");
    if (button)
      animate(button, [{ transform: "scale(0.97)" }, { transform: "none" }], {
        duration: 200,
        easing: EASE,
        fill: "forwards",
      });
  };

  // 4px under the chip, aligned to its start, at least as wide; it grows from the chip.
  const openMenu = () => {
    const container = local(menu.parentElement ?? stage);
    const chip = local(trigger);
    menu.style.left = `${chip.x - container.x}px`;
    menu.style.top = `${chip.y + chip.h - container.y + 4}px`;
    menu.style.minWidth = `${chip.w}px`;
    menu.style.transformOrigin = "0 -4px";
    highlight(from);
    menu.hidden = false;
    menuOpen = true;
    animate(
      menu,
      [
        { opacity: 0, transform: "translateY(-8px) scale(0.95)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 150, easing: EASE },
    );
  };
  const closeMenu = () => {
    menuOpen = false;
    animate(
      menu,
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "scale(0.95)" },
      ],
      { duration: 100, easing: EASE, fill: "forwards" },
      () => {
        menu.hidden = true;
      },
    );
  };

  // The old words blur out where they stood, the new ones blur in, and the chip eases to its new width.
  const relabel = (text: string) => {
    const before = local(trigger).w;
    const ghost = label.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("data-template-label");
    ghost.className = "tpl-ghost";
    label.textContent = text;
    trigger.append(ghost);
    const after = local(trigger).w;
    animate(trigger, [{ width: `${before}px` }, { width: `${after}px` }], {
      duration: 220,
      easing: EASE,
    });
    animate(
      ghost,
      [
        { opacity: 1, filter: "blur(0)" },
        { opacity: 0, filter: "blur(2px)" },
      ],
      { duration: 120, easing: "ease-out", fill: "forwards" },
      () => ghost.remove(),
    );
    animate(
      label,
      [
        { opacity: 0, filter: "blur(2px)" },
        { opacity: 1, filter: "blur(0)" },
      ],
      { duration: 180, delay: 40, easing: "ease-out", fill: "backwards" },
    );
  };

  // The dialog closes and its scrim lifts while the window navigates at once: Home goes, the header and
  // strip are there, and the page's blocks rise in reading order as the dialog all but disappears.
  const open = () => {
    const close: KeyframeAnimationOptions = {
      duration: 150,
      easing: EASE,
      fill: "forwards",
    };
    animate(
      dialog,
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "scale(0.95)" },
      ],
      close,
      () => {
        dialog.hidden = true;
      },
    );
    animate(scrim, [{ opacity: 1 }, { opacity: 0 }], close, () => {
      scrim.hidden = true;
    });
    home.hidden = true;
    page.style.opacity = "";
    blocks.forEach((block, index) =>
      animate(
        block,
        [
          { opacity: 0, transform: "translateY(8px)" },
          { opacity: 1, transform: "none" },
        ],
        {
          duration: 360,
          delay: 60 + index * 60,
          easing: EASE,
          fill: "backwards",
        },
      ),
    );
  };

  const run = async () => {
    place(aim(rest, 0.62, 0.55));
    await frame();
    cursor.toggleAttribute("data-shown", true);
    await sleep(650);

    // A select opens on the press.
    await move(aim(trigger, 0.93, 0.78));
    await sleep(180);
    down();
    openMenu();
    await sleep(90);
    up();
    await sleep(560);

    // A menu row picks on the release.
    await move(aim(chosen, 0.8, 0.62));
    await sleep(300);
    down();
    await sleep(90);
    up();
    select(chosen);
    closeMenu();
    relabel(TEMPLATE_CHOSEN);
    await sleep(520);

    await move(aim(create, 0.94, 0.78));
    await sleep(220);
    down(create);
    await sleep(100);
    up(create);
    await sleep(40);

    open();
    await sleep(1100);
    cursor.removeAttribute("data-shown");
  };
  void run();

  return () => {
    window.clearTimeout(timer);
    cancelAnimationFrame(raf);
    animations.forEach((animation) => animation.cancel());
  };
}
