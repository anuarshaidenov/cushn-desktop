import { useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { NotesDemoWindow } from "./NotesDemoWindow";
import "./NotesDemo.css";

/*
  Someone clicks at the end of the budget's notes and types a short to-do
  list; "### " becomes a heading and "- " a bullet, as in the app's editor.
  1. The pointer rests below the notes.
  2. It moves to the end of the first line, turning into an I-beam, and clicks.
  3. Return, "### This month". The pointer hides on the first key.
  4. Return, "- " and two bullets. Each line carries the income down with it.
  5. The result holds, the caret blinking.
*/

type Story = { play: () => void; stop: () => void };
type Point = { x: number; y: number };

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

export const NotesDemo = ({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<Story | null>(null);

  // Before paint, so the finished notes never show before they're typed.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    const cursor = cursorRef.current;
    if (!root || !stage || !cursor) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const story = rewind(root, stage, cursor);
    storyRef.current = story;
    return () => {
      story?.stop();
      storyRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (active) storyRef.current?.play();
  }, [active]);

  return (
    <div
      ref={rootRef}
      inert
      aria-hidden="true"
      className={cn("notes-demo relative h-full w-full", className)}
    >
      <div ref={stageRef} className="notes-demo__stage">
        <div className="notes-demo__frame">
          <NotesDemoWindow />
        </div>
        <div ref={cursorRef} className="notes-cursor" data-kind="pointer">
          <div className="notes-cursor__press">
            <div className="notes-cursor__glyph" data-glyph="pointer">
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
            <div className="notes-cursor__glyph" data-glyph="ibeam">
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

// Takes the typed lines out of the window and returns the story that types them back.
// `stop` cancels it and puts the window back as rendered.
function rewind(
  root: HTMLElement,
  stage: HTMLElement,
  cursor: HTMLElement,
): Story | null {
  const notes = stage.querySelector<HTMLElement>("[data-notes]");
  const below = stage.querySelector<HTMLElement>("[data-after-notes]");
  const first = notes?.querySelector<HTMLElement>(":scope > p");
  const heading = notes?.querySelector<HTMLElement>(
    ":scope > [data-typed]:is(h2, h3)",
  );
  const list = notes?.querySelector<HTMLElement>(":scope > ul[data-typed]");
  const firstText = first?.lastChild;
  if (!notes || !below || !first || !heading || !list) return null;
  if (!(firstText instanceof Text)) return null;

  const marks = "#".repeat(Number(heading.tagName[1]));
  const title = (heading.textContent ?? "").trim();
  const headingNodes = [...heading.childNodes];
  const listItems = [...list.children];
  const items = listItems.map((li) => (li.textContent ?? "").trim());

  heading.remove();
  list.remove();

  const caret = document.createElement("span");
  caret.className = "notes-caret";
  const animations: Animation[] = [];
  let started = false;
  let timeout = 0;
  let idle = 0;
  let raf = 0;

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      timeout = window.setTimeout(resolve, ms);
    });
  const frame = () =>
    new Promise<void>((resolve) => {
      raf = requestAnimationFrame(() => resolve());
    });
  // An uneven but repeatable rhythm, so it types the same way every time.
  const jitter = (i: number) => {
    const x = Math.sin(i * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  // Stage pixels: the stage's own scale and any transform above it cancel out.
  const scale = () =>
    stage.getBoundingClientRect().width / stage.offsetWidth || 1;
  const local = (rect: DOMRect) => {
    const box = stage.getBoundingClientRect();
    const k = scale();
    return {
      x: (rect.left - box.left) / k,
      y: (rect.top - box.top) / k,
      w: rect.width / k,
      h: rect.height / k,
    };
  };

  let at: Point = { x: 0, y: 0 };
  const place = (point: Point) => {
    at = point;
    cursor.style.transform = `translate(${point.x}px, ${point.y}px)`;
    const n = local(notes.getBoundingClientRect());
    const over =
      point.x >= n.x &&
      point.x <= n.x + n.w &&
      point.y >= n.y &&
      point.y <= n.y + n.h;
    cursor.dataset.kind = over ? "ibeam" : "pointer";
  };
  const ease = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
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
        const t = Math.min(1, (now - t0) / ms);
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

  // Solid while keys land; blinks again once typing pauses.
  const keystroke = () => {
    root.dataset.typing = "";
    clearTimeout(idle);
    idle = window.setTimeout(() => delete root.dataset.typing, 520);
  };

  // Each line the notes gain glides what's below down from where it was (FLIP); a push that
  // lands mid-glide starts from where it is on screen. A shortcut slides the caret too.
  let glide: Animation | undefined;
  const shiftOf = (element: Element) =>
    new DOMMatrixReadOnly(getComputedStyle(element).transform).m42;
  const reflow = (change: () => void, slideCaret = false) => {
    const top = below.offsetTop;
    const caretBox = slideCaret ? caret.getBoundingClientRect() : null;
    change();
    const delta = top - below.offsetTop;
    if (delta) {
      const from = (glide ? shiftOf(below) : 0) + delta;
      glide?.cancel();
      glide = below.animate(
        [{ transform: `translateY(${from}px)` }, { transform: "none" }],
        { duration: 360, easing: EASE_OUT },
      );
      animations.push(glide);
    }
    if (caretBox && caret.isConnected) {
      const now = caret.getBoundingClientRect();
      const k = scale();
      const dx = (caretBox.left - now.left) / k;
      const dy = (caretBox.top - now.top) / k;
      if (dx || dy) {
        animations.push(
          caret.animate(
            [
              { transform: `translate(${dx}px, ${dy}px)` },
              { transform: "none" },
            ],
            { duration: 220, easing: EASE_OUT },
          ),
        );
      }
    }
  };

  let typed = 0;
  const type = async (block: HTMLElement, text: string, pace = 46) => {
    const node =
      block.firstChild instanceof Text
        ? block.firstChild
        : block.insertBefore(document.createTextNode(""), block.firstChild);
    for (const ch of text) {
      reflow(() => (node.data += ch));
      keystroke();
      typed++;
      let wait = pace * (0.7 + 0.6 * jitter(typed));
      if (ch === " ") wait += 24;
      if (ch === ",") wait += 160;
      await sleep(wait);
    }
    return node;
  };

  // The line takes its new shape in the same frame, as the editor's does, while a ghost of
  // the typed marker fades where it stood, drifting with the line if it moved.
  const shortcut = (node: Text, block: HTMLElement, change: () => void) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const spot = local(range.getBoundingClientRect());
    const line = node.parentElement ?? block;
    const before = line.getBoundingClientRect().top;
    const style = getComputedStyle(line);
    const ghost = document.createElement("span");
    ghost.className = "notes-ghost";
    ghost.textContent = node.data;
    Object.assign(ghost.style, {
      left: `${spot.x}px`,
      top: `${spot.y}px`,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: `${spot.h}px`,
      color: style.color,
    });
    stage.append(ghost);
    reflow(change, true);
    const drop = (block.getBoundingClientRect().top - before) / scale();
    const fade = ghost.animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: `translateY(${drop}px)`, filter: "blur(2px)" },
      ],
      { duration: 120, easing: "ease-out", fill: "forwards" },
    );
    fade.onfinish = () => ghost.remove();
    animations.push(fade);
  };

  const newLine = () => {
    const line = document.createElement("p");
    line.append(caret);
    return line;
  };

  const run = async () => {
    await sleep(250);

    // 1. At rest on the empty band between the notes and the income.
    const n = local(notes.getBoundingClientRect());
    const b = local(below.getBoundingClientRect());
    place({ x: n.x + n.w * 0.72, y: (n.y + n.h + b.y) / 2 + 6 });
    await frame();
    cursor.dataset.shown = "";
    await sleep(650);

    // 2. Just past the last letter, so the I-beam doesn't sit on the words, and a click.
    const last = firstText.data.trimEnd().length;
    const range = document.createRange();
    range.setStart(firstText, last - 1);
    range.setEnd(firstText, last);
    const end = local(range.getBoundingClientRect());
    await move({ x: end.x + end.w + 14, y: end.y + end.h / 2 });
    await sleep(120);
    cursor.dataset.pressed = "";
    first.append(caret);
    keystroke();
    await sleep(90);
    delete cursor.dataset.pressed;
    await sleep(460);

    // 3. Return, then the heading.
    delete cursor.dataset.shown;
    let line = newLine();
    reflow(() => first.after(line));
    keystroke();
    await sleep(320);
    let node = await type(line, `${marks} `);
    shortcut(node, heading, () => {
      heading.replaceChildren(caret);
      line.replaceWith(heading);
    });
    keystroke();
    await sleep(140);
    await type(heading, title);
    await sleep(420);

    // 4. Return, "- " and the list.
    line = newLine();
    reflow(() => heading.after(line));
    keystroke();
    await sleep(260);
    node = await type(line, "- ");
    list.replaceChildren();
    for (const [index, words] of items.entries()) {
      const li = document.createElement("li");
      const p = document.createElement("p");
      li.append(p);
      li.dataset.fresh = "";
      if (index === 0) {
        shortcut(node, p, () => {
          p.append(caret);
          list.append(li);
          line.replaceWith(list);
        });
      } else {
        reflow(() => {
          p.append(caret);
          list.append(li);
        });
      }
      keystroke();
      await sleep(index === 0 ? 160 : 300);
      await type(p, words);
      if (index < items.length - 1) await sleep(380);
    }
  };

  return {
    play: () => {
      if (started) return;
      started = true;
      void run();
    },
    stop: () => {
      clearTimeout(timeout);
      clearTimeout(idle);
      cancelAnimationFrame(raf);
      for (const animation of animations) animation.cancel();
      for (const ghost of stage.querySelectorAll(".notes-ghost"))
        ghost.remove();
      caret.remove();
      heading.replaceChildren(...headingNodes);
      list.replaceChildren(...listItems);
      notes.replaceChildren(first, heading, list);
      delete root.dataset.typing;
      cursor.style.transform = "";
      cursor.dataset.kind = "pointer";
      delete cursor.dataset.shown;
      delete cursor.dataset.pressed;
    },
  };
}
