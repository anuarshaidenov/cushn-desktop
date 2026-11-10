import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AgentChatDemoWindow, CHAT_TITLE } from "./AgentChatDemoWindow";
import "./AgentChatDemo.css";

/*
  The Claude & Codex story, ported from the landing page. A new chat; the pointer presses "Am I on
  track for October?" and its words fly up into the first bubble. Claude calls get_home_summary
  and list_expenses, streams its answer, and the chat is named. Then "Log $42 dinner with Sam to
  Wants" is typed and sent, create_expenses runs, and the reply holds with the caret blinking.
  Throughout, the thread stays pinned to its end and older turns glide up.
*/

type Phase = "idle" | "playing" | "done";
type Point = { x: number; y: number };
type Box = Point & { w: number; h: number };

const collect = (root: HTMLElement) => {
  const lost: string[] = [];
  const one = (selector: string, from: ParentNode = root) => {
    const el = from.querySelector<HTMLElement>(selector);
    if (!el) lost.push(selector);
    return el ?? root;
  };
  const all = (selector: string, from: ParentNode = root) => [
    ...from.querySelectorAll<HTMLElement>(selector),
  ];
  const turns = all("[data-turn]");
  const [ask1 = root, reply1 = root, ask2 = root, reply2 = root] = turns;
  if (turns.length !== 4) lost.push("[data-turn]");
  const ask = (el: HTMLElement) => ({
    el,
    bubble: one(".acd-bubble", el),
    text: one("[data-bubble-text]", el),
  });
  const reply = (el: HTMLElement) => ({
    el,
    avatar: one(".acd-avatar", el),
    rows: all("[data-tool]", el),
    answer: one("[data-answer]", el),
    words: all(".acd-w", el),
  });
  const parts = {
    root,
    stage: one(".acd-stage"),
    panel: one(".acd-panel"),
    inner: one("[data-thread-inner]"),
    empty: one("[data-empty]"),
    greeting: one(".acd-greeting"),
    suggestions: one(".acd-suggestions"),
    chips: all("[data-suggestion]"),
    chip: one("[data-suggestion-sent]"),
    label: one("[data-suggestion-sent] [data-label]"),
    title: one("[data-title]"),
    composer: one("[data-composer]"),
    field: one("[data-field]"),
    placeholder: one("[data-placeholder]"),
    toolbar: one(".acd-toolbar"),
    connector: one(".acd-connector"),
    provider: one(".acd-provider"),
    send: one("[data-send]"),
    cursor: one(".acd-cursor"),
    turns,
    ask1: ask(ask1),
    ask2: ask(ask2),
    first: reply(reply1),
    second: reply(reply2),
  };
  return lost.length ? null : parts;
};

type Parts = NonNullable<ReturnType<typeof collect>>;
type Ask = Parts["ask1"];
type Reply = Parts["first"];

const finish = (q: Parts) => {
  q.empty.hidden = true;
  q.title.textContent = CHAT_TITLE;
  for (const turn of q.turns) {
    turn.hidden = false;
    turn.style.visibility = "";
  }
  for (const r of [q.first, q.second]) {
    r.answer.style.height = "";
    for (const row of r.rows) {
      row.hidden = false;
      row.dataset.state = "done";
      delete row.dataset.ran;
    }
    for (const w of r.words) {
      w.dataset.on = "";
      w.closest("li")?.setAttribute("data-on", "");
    }
  }
  q.inner.style.transform = "";
  q.label.style.visibility = "";
  q.placeholder.hidden = false;
  delete q.send.dataset.ready;
  delete q.composer.dataset.focused;
  delete q.cursor.dataset.shown;
  delete q.root.dataset.typing;
  for (const el of q.root.querySelectorAll(
    ".acd-flyer, .acd-caret, .acd-typed",
  ))
    el.remove();
};

// An uneven but repeatable rhythm, so it types the same way every time.
const jitter = (i: number) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

// A CSS cubic-bezier, for motion driven frame by frame.
const bezier = (x1: number, y1: number, x2: number, y2: number) => {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const X = (u: number) => ((ax * u + bx) * u + cx) * u;
  const Y = (u: number) => ((ay * u + by) * u + cy) * u;
  return (t: number) => {
    let lo = 0;
    let hi = 1;
    let u = t;
    for (let i = 0; i < 20; i++) {
      const x = X(u);
      if (Math.abs(x - t) < 1e-5) break;
      if (x < t) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return Y(u);
  };
};

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const flightEase = bezier(0.4, 0, 0.1, 1);
const handEase = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

const play = (q: Parts, phase: { current: Phase }) => {
  const timers = new Set<number>();
  const frames = new Set<number>();
  const animations: Animation[] = [];
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };
  const clear = (id: number | undefined) => {
    if (id === undefined) return;
    clearTimeout(id);
    timers.delete(id);
  };
  const nextFrame = (fn: (now: number) => void) => {
    const id = requestAnimationFrame((now) => {
      frames.delete(id);
      fn(now);
    });
    frames.add(id);
  };
  const sleep = (ms: number) => new Promise<void>((done) => later(done, ms));
  const frame = () => new Promise<void>((done) => nextFrame(() => done()));
  const animate = (
    el: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ) => {
    const animation = el.animate(keyframes, options);
    animations.push(animation);
    return animation;
  };

  // Positions are in the stage's own (unscaled) pixels, measured from the stage, never the viewport.
  const stageFrame = () => {
    const box = q.stage.getBoundingClientRect();
    return { box, k: box.width / q.stage.offsetWidth || 1 };
  };
  const local = (rect: DOMRect, { box, k } = stageFrame()): Box => ({
    x: (rect.left - box.left) / k,
    y: (rect.top - box.top) / k,
    w: rect.width / k,
    h: rect.height / k,
  });
  const inside = (p: Point, r: Box) =>
    p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

  // The column is pinned to the viewport's foot, so new height jumps everything above it up.
  // Each frame the jump is taken back as an offset that eases to nothing: older turns glide.
  let offset = 0;
  let lastTop: number | null = null;
  let following = false;
  let then = 0;
  const sync = () => {
    const top = q.inner.offsetTop;
    if (lastTop !== null && top !== lastTop) offset += lastTop - top;
    lastTop = top;
    q.inner.style.transform = offset ? `translateY(${offset}px)` : "";
  };
  const follow = (now: number) => {
    const dt = then ? Math.min(64, now - then) : 16;
    then = now;
    sync();
    offset *= Math.exp(-dt / 150);
    if (Math.abs(offset) < 0.05) offset = 0;
    q.inner.style.transform = offset ? `translateY(${offset}px)` : "";
    if (following || offset) nextFrame(follow);
    else then = 0;
  };

  let at: Point = { x: 0, y: 0 };
  // The message box's text area: the box down to its row of buttons.
  const textArea = (f = stageFrame()): Box => {
    const c = local(q.composer.getBoundingClientRect(), f);
    const t = local(q.toolbar.getBoundingClientRect(), f);
    return { x: c.x, y: c.y, w: c.w, h: t.y - c.y };
  };
  const place = (p: Point) => {
    at = p;
    const f = stageFrame();
    q.cursor.style.transform = `translate(${p.x}px, ${p.y}px)`;
    q.cursor.dataset.kind = inside(p, textArea(f)) ? "ibeam" : "pointer";
    if (!q.empty.hidden) {
      for (const c of q.chips)
        c.toggleAttribute(
          "data-hover",
          inside(p, local(c.getBoundingClientRect(), f)),
        );
    }
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
        const e = handEase(t);
        const lift = Math.sin(Math.PI * e) * bow;
        place({
          x: from.x + (to.x - from.x) * e + nx * lift,
          y: from.y + (to.y - from.y) * e + ny * lift,
        });
        if (t < 1) nextFrame(step);
        else done();
      };
      nextFrame(step);
    });
  const press = async (target: HTMLElement | null) => {
    q.cursor.dataset.pressed = "";
    target?.setAttribute("data-pressed", "");
    await sleep(100);
    delete q.cursor.dataset.pressed;
    target?.removeAttribute("data-pressed");
  };

  // The words leave where they were and travel to where the bubble's words will sit, while the
  // bubble fills in around them. A stand-in makes the trip and swaps with the real bubble on landing.
  const fly = (ask: Ask, from: DOMRect, size: number, ms: number) => {
    ask.el.hidden = false;
    ask.el.style.visibility = "hidden";
    sync();
    const scale = size / parseFloat(getComputedStyle(ask.bubble).fontSize);
    const { k } = stageFrame();
    const p = q.panel.getBoundingClientRect();
    const b = ask.bubble.getBoundingClientRect();
    const w = ask.text.getBoundingClientRect();
    const end = { x: (b.left - p.left) / k, y: (b.top - p.top) / k - offset };
    const mid = {
      x: (w.left - b.left + w.width / 2) / k,
      y: (w.top - b.top + w.height / 2) / k,
    };
    const start = {
      x: (from.left - p.left + from.width / 2) / k - end.x - scale * mid.x,
      y: (from.top - p.top + from.height / 2) / k - end.y - scale * mid.y,
    };
    const flyer = ask.bubble.cloneNode(true) as HTMLElement;
    flyer.classList.add("acd-flyer");
    Object.assign(flyer.style, {
      left: `${end.x}px`,
      top: `${end.y}px`,
      width: `${b.width / k}px`,
      height: `${b.height / k}px`,
      transform: `translate(${start.x}px, ${start.y}px) scale(${scale})`,
    });
    const fill = getComputedStyle(ask.bubble).backgroundColor;
    q.panel.append(flyer);
    animate(
      flyer,
      [{ backgroundColor: "transparent" }, { backgroundColor: fill }],
      {
        duration: ms * 0.7,
        delay: ms * 0.15,
        easing: "ease-out",
        fill: "both",
      },
    );
    const dist = Math.hypot(start.x, start.y) || 1;
    const bow = Math.min(dist * 0.06, 18);
    const nx = start.y / dist;
    const ny = -start.x / dist;
    return new Promise<void>((done) => {
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - t0) / ms));
        const e = flightEase(t);
        const lift = Math.sin(Math.PI * e) * bow;
        const x = start.x * (1 - e) + nx * lift;
        const y = start.y * (1 - e) + ny * lift;
        const s = scale + (1 - scale) * e;
        flyer.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
        if (t < 1) return nextFrame(step);
        ask.el.style.visibility = "";
        flyer.remove();
        done();
      };
      nextFrame(step);
    });
  };

  const enter = (el: Element, delay = 0) =>
    animate(
      el,
      [
        { opacity: 0, transform: "translateY(4px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 320, delay, easing: EASE_OUT, fill: "backwards" },
    );
  // A tool call opens its row's height and comes up into it.
  const call = (row: HTMLElement) => {
    row.dataset.state = "pending";
    row.dataset.ran = "";
    row.hidden = false;
    const h = row.offsetHeight;
    animate(row, [{ height: "0px" }, { height: `${h}px` }], {
      duration: 260,
      easing: EASE_OUT,
    });
    enter(row, 60);
  };
  const begin = (r: Reply) => {
    r.el.hidden = false;
    animate(
      r.avatar,
      [
        { opacity: 0, transform: "scale(0.85)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 300, easing: EASE_OUT },
    );
  };

  // A few words at a time; the answer's height follows the line being written.
  const stream = async (r: Reply, seed: number) => {
    const top = () => r.answer.getBoundingClientRect().top;
    const lineHeight = parseFloat(getComputedStyle(r.answer).lineHeight) || 24;
    let height = 0;
    let i = 0;
    while (i < r.words.length) {
      const size = 2 + Math.floor(jitter(seed + i) * 3);
      const chunk = r.words.slice(i, i + size);
      i += chunk.length;
      chunk.forEach((w, n) => {
        later(() => {
          w.dataset.on = "";
          w.closest("li")?.setAttribute("data-on", "");
          const { k } = stageFrame();
          const box = w.getBoundingClientRect();
          const bottom =
            (box.bottom - top()) / k + (lineHeight - box.height / k) / 2;
          if (bottom > height + 1) {
            height = bottom;
            r.answer.style.height = `${Math.ceil(height)}px`;
            sync();
          }
        }, n * 22);
      });
      const last = chunk[chunk.length - 1].textContent ?? "";
      let wait = 70 + 40 * jitter(seed + i * 3);
      if (/[.:]$/.test(last)) wait += 140;
      else if (/,$/.test(last)) wait += 50;
      await sleep(wait);
    }
    await sleep(120);
    r.answer.style.height = "";
    sync();
  };

  const caret = document.createElement("span");
  caret.className = "acd-caret";
  let idle: number | undefined;
  // Solid while keys land; blinks again once typing pauses.
  const keystroke = () => {
    q.root.dataset.typing = "";
    clear(idle);
    idle = later(() => delete q.root.dataset.typing, 520);
  };
  const line = document.createElement("span");
  line.className = "acd-typed";
  const type = async (text: string, pace = 46) => {
    const node = document.createTextNode("");
    line.replaceChildren(node);
    caret.before(line);
    let i = 0;
    for (const ch of text) {
      node.data += ch;
      if (i === 0) {
        q.placeholder.hidden = true;
        q.send.dataset.ready = "";
      }
      keystroke();
      i++;
      let wait = pace * (0.7 + 0.6 * jitter(i));
      if (ch === " ") wait += 30;
      await sleep(wait);
    }
  };

  const run = async () => {
    phase.current = "playing";
    following = true;
    nextFrame(follow);

    // 1. Rest on the empty panel under the suggestions, near the one it will press.
    const c = local(q.chip.getBoundingClientRect());
    const list = local(q.suggestions.getBoundingClientRect());
    place({ x: c.x + c.w + 28, y: list.y + list.h + 30 });
    await frame();
    q.cursor.dataset.shown = "";
    await sleep(700);

    // 2. Press the suggestion; its words take off as the bubble while the new chat leaves.
    await move({ x: c.x + c.w - 10, y: c.y + c.h * 0.64 });
    await sleep(140);
    await press(q.chip);
    const from = q.label.getBoundingClientRect();
    const size = parseFloat(getComputedStyle(q.label).fontSize);
    q.label.style.visibility = "hidden";
    const leaving = [
      q.chip,
      ...q.greeting.children,
      ...q.chips.filter((x) => x !== q.chip),
    ].map((el, i) =>
      animate(
        el,
        [
          { opacity: 1, transform: "none", filter: "blur(0)" },
          {
            opacity: 0,
            transform: "translateY(-6px) scale(0.98)",
            filter: "blur(3px)",
          },
        ],
        {
          duration: i ? 260 : 160,
          delay: i ? 30 + (i - 1) * 35 : 0,
          easing: EASE_OUT,
          fill: "forwards",
        },
      ),
    );
    await fly(q.ask1, from, size, 720);
    q.empty.hidden = true;
    for (const animation of leaving) animation.cancel();
    q.label.style.visibility = "";

    // 3. Claude reads the budget, one tool call at a time, while the pointer drifts out of the way.
    const { first, second } = q;
    await sleep(320);
    begin(first);
    call(first.rows[0]);
    const a = local(q.connector.getBoundingClientRect());
    const b = local(q.provider.getBoundingClientRect());
    void move({ x: (a.x + a.w + b.x) / 2 + 12, y: a.y + a.h / 2 + 2 });
    await sleep(1000);
    first.rows[0].dataset.state = "done";
    await sleep(260);
    call(first.rows[1]);
    await sleep(820);
    first.rows[1].dataset.state = "done";
    await sleep(320);

    // 4. The answer; then the chat is named after it, the title crossfading in place.
    await stream(first, 3);
    const blurOut = animate(
      q.title,
      [
        { opacity: 1, filter: "blur(0)" },
        { opacity: 0, filter: "blur(2px)" },
      ],
      { duration: 160, easing: "ease-out" },
    );
    blurOut.onfinish = () => {
      q.title.textContent = CHAT_TITLE;
      animate(
        q.title,
        [
          { opacity: 0, filter: "blur(2px)" },
          { opacity: 1, filter: "blur(0)" },
        ],
        { duration: 240, easing: "ease-out" },
      );
    };
    await sleep(900);

    // 5. Into the message box, past its placeholder; a press focuses it, typing hides the pointer.
    const t = textArea();
    const words = local(q.placeholder.getBoundingClientRect());
    const x = Math.max(words.x + words.w + 28, t.x + t.w * 0.56);
    await move({ x: Math.min(x, t.x + t.w - 40), y: words.y + words.h / 2 });
    await sleep(120);
    await press(null);
    q.composer.dataset.focused = "";
    q.field.prepend(caret);
    keystroke();
    await sleep(460);
    delete q.cursor.dataset.shown;
    await type(q.ask2.text.textContent ?? "");
    await sleep(480);

    // Return: the line lifts out of the box into the thread.
    keystroke();
    const sent = line.getBoundingClientRect();
    const typedSize = parseFloat(getComputedStyle(line).fontSize);
    line.remove();
    delete q.send.dataset.ready;
    const flight = fly(q.ask2, sent, typedSize, 600);
    await sleep(140);
    q.placeholder.hidden = false;
    animate(q.placeholder, [{ opacity: 0 }, { opacity: 1 }], {
      duration: 200,
      easing: "ease-out",
    });
    await flight;

    await sleep(320);
    begin(second);
    call(second.rows[0]);
    await sleep(950);
    second.rows[0].dataset.state = "done";
    await sleep(320);
    await stream(second, 11);

    // 6. Hold, the caret blinking in the empty box.
    following = false;
    phase.current = "done";
  };

  later(() => void run(), 250);

  return () => {
    for (const id of timers) clearTimeout(id);
    for (const id of frames) cancelAnimationFrame(id);
    for (const animation of animations) animation.cancel();
  };
};

const Cursor = () => (
  <div className="acd-cursor" data-kind="pointer">
    <div className="acd-cursor__press">
      <div className="acd-cursor__glyph" data-glyph="pointer">
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
      <div className="acd-cursor__glyph" data-glyph="ibeam">
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
);

// Rendered once: the story drives this DOM directly, so React never reconciles it again.
const Stage = memo(() => (
  <div className="acd-stage">
    <AgentChatDemoWindow />
    <Cursor />
  </div>
));

export const AgentChatDemo = ({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const phase = useRef<Phase>("idle");
  const [started, setStarted] = useState(active);
  if (active && !started) setStarted(true);

  useLayoutEffect(() => {
    const parts = rootRef.current && collect(rootRef.current);
    if (!parts || !matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    finish(parts);
    phase.current = "done";
  }, []);

  useEffect(() => {
    const parts = rootRef.current && collect(rootRef.current);
    if (!started || !parts || phase.current !== "idle") return;
    const stop = play(parts, phase);
    return () => {
      stop();
      // Cut off mid-story: settle on the ending, so a remount of the effect never replays it.
      if (phase.current === "playing") {
        finish(parts);
        phase.current = "done";
      }
    };
  }, [started]);

  return (
    <div
      ref={rootRef}
      inert
      aria-hidden
      className={cn("agent-chat-demo relative h-full w-full", className)}
    >
      {/* The slide crops the box's right edge and fades its foot; the whole window stays in the visible part. */}
      <div className="relative h-[calc(100%-84px)] w-[calc(100%-48px)]">
        <Stage />
      </div>
    </div>
  );
};
