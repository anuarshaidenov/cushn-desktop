import * as React from "react";
import {
  autoScrollSpeed,
  clampRect,
  hasPassedThreshold,
  marqueeSelection,
  rectFromPoints,
  rectsIntersect,
  sameSelection,
  type Point,
  type Rect,
  type Size,
} from "@/lib/marquee";

/** Put on each selectable element inside the container; its value is the item's id. */
export const MARQUEE_ITEM_ATTRIBUTE = "data-marquee-id";
/** Put on any element whose presses must not start a marquee, beyond the built-in list of controls. */
export const MARQUEE_IGNORE_ATTRIBUTE = "data-marquee-ignore";

type Options<T extends string> = {
  /** The scrolling element: the gesture surface, and the marquee is drawn in its content coordinates. Give it `relative`. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** The current selection; read when a gesture starts, as the base for additive drags and for Esc to restore. */
  selected: readonly T[];
  /** Receives the whole next selection, only when it changes. */
  onSelectionChange: (ids: T[]) => void;
  enabled?: boolean;
};

export type MarqueeSelection = {
  /** True from the moment a press passes the drag threshold until it ends. */
  isSelecting: boolean;
  /** Render as a direct child of the container. */
  overlay: React.ReactNode;
};

const ITEM_SELECTOR = `[${MARQUEE_ITEM_ATTRIBUTE}]`;

// Links inside an item (the card's full-cover link) or an item that is itself a link still start a marquee.
const CONTROL_SELECTOR = [
  "button",
  `a[href]:not(${ITEM_SELECTOR}, ${ITEM_SELECTOR} a)`,
  "input",
  "textarea",
  "select",
  "label",
  "summary",
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="switch"]',
  '[role="tab"]',
  '[contenteditable]:not([contenteditable="false"])',
  `[${MARQUEE_IGNORE_ATTRIBUTE}]`,
].join(", ");

const CLICK_SWALLOW_TIMEOUT = 100;

type Item<T> = { id: T; rect: Rect };

type Gesture<T> = {
  pointerId: number;
  phase: "pending" | "dragging" | "cancelled";
  /** The container's padding-box origin in client coordinates. */
  origin: Point;
  startClient: Point;
  startContent: Point;
  lastClient: Point;
  additive: boolean;
  onBackground: boolean;
  pressSelection: T[];
  emitted: T[];
  items: Item<T>[];
  bounds: Size;
};

export function useMarqueeSelection<T extends string>({
  containerRef,
  selected,
  onSelectionChange,
  enabled = true,
}: Options<T>): MarqueeSelection {
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  const [isSelecting, setIsSelecting] = React.useState(false);
  const latest = React.useRef({ selected, onSelectionChange });
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const marqueeRef = React.useRef<Rect | null>(null);

  React.useEffect(() => {
    latest.current = { selected, onSelectionChange };
  });

  // Picks up a container that mounts after this component, e.g. once a loading state is replaced.
  React.useEffect(() => {
    setContainer(containerRef.current);
  });

  React.useEffect(() => {
    if (!enabled || !container) return;

    let gesture: Gesture<T> | null = null;
    let frame = 0;
    let lastFrameTime: number | undefined;
    let scrollCarry = { x: 0, y: 0 };
    let restoreBodyStyle: (() => void) | undefined;

    const toContent = (client: Point, origin: Point): Point => ({
      x: client.x - origin.x + container.scrollLeft,
      y: client.y - origin.y + container.scrollTop,
    });

    const showMarquee = (rect: Rect | null) => {
      marqueeRef.current = rect;
      if (rect && overlayRef.current) placeOverlay(overlayRef.current, rect);
    };

    const emit = (g: Gesture<T>, next: T[]) => {
      if (sameSelection(next, g.emitted)) return;
      g.emitted = next;
      latest.current.onSelectionChange(next);
    };

    const update = () => {
      const g = gesture;
      if (!g || g.phase !== "dragging") return;
      const pointer = toContent(g.lastClient, g.origin);
      const marquee = clampRect(
        rectFromPoints(g.startContent, pointer),
        g.bounds,
      );
      showMarquee(marquee);
      const covered = new Set(
        g.items
          .filter((item) => rectsIntersect(marquee, item.rect))
          .map((item) => item.id),
      );
      const itemIds = g.items.map((item) => item.id);
      emit(
        g,
        marqueeSelection(
          itemIds,
          covered,
          g.additive ? g.pressSelection : undefined,
        ),
      );
    };

    const scrollVelocity = (g: Gesture<T>): Point => {
      const axis = (
        pointer: number,
        start: number,
        size: number,
        scroll: number,
        scrollSize: number,
      ) => {
        const speed = autoScrollSpeed(pointer, start, start + size);
        if (speed < 0 && scroll <= 0) return 0;
        if (speed > 0 && scroll >= scrollSize - size - 1) return 0;
        return speed;
      };
      return {
        x: axis(
          g.lastClient.x,
          g.origin.x,
          container.clientWidth,
          container.scrollLeft,
          container.scrollWidth,
        ),
        y: axis(
          g.lastClient.y,
          g.origin.y,
          container.clientHeight,
          container.scrollTop,
          container.scrollHeight,
        ),
      };
    };

    const stopAutoScroll = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      lastFrameTime = undefined;
      scrollCarry = { x: 0, y: 0 };
    };

    // The resulting `scroll` event moves the marquee, as it does for wheel scrolling mid-drag.
    const autoScroll = (time: number) => {
      frame = 0;
      const g = gesture;
      if (!g || g.phase !== "dragging") return stopAutoScroll();
      const velocity = scrollVelocity(g);
      if (velocity.x === 0 && velocity.y === 0) return stopAutoScroll();
      const elapsed =
        lastFrameTime === undefined
          ? 1000 / 60
          : Math.min(50, time - lastFrameTime);
      lastFrameTime = time;
      scrollCarry.x += (velocity.x * elapsed) / 1000;
      scrollCarry.y += (velocity.y * elapsed) / 1000;
      const left = Math.trunc(scrollCarry.x);
      const top = Math.trunc(scrollCarry.y);
      scrollCarry.x -= left;
      scrollCarry.y -= top;
      if (left || top) container.scrollBy({ left, top, behavior: "instant" });
      frame = requestAnimationFrame(autoScroll);
    };

    const startAutoScroll = (g: Gesture<T>) => {
      if (frame) return;
      const velocity = scrollVelocity(g);
      if (velocity.x !== 0 || velocity.y !== 0) {
        frame = requestAnimationFrame(autoScroll);
      }
    };

    const startDrag = (g: Gesture<T>) => {
      g.phase = "dragging";
      g.bounds = {
        width: container.scrollWidth,
        height: container.scrollHeight,
      };
      const scroll = { x: container.scrollLeft, y: container.scrollTop };
      g.items = [];
      for (const element of container.querySelectorAll(ITEM_SELECTOR)) {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        const left = rect.left - g.origin.x + scroll.x;
        const top = rect.top - g.origin.y + scroll.y;
        g.items.push({
          id: element.getAttribute(MARQUEE_ITEM_ATTRIBUTE) as T,
          rect: {
            left,
            top,
            right: left + rect.width,
            bottom: top + rect.height,
          },
        });
      }
      try {
        container.setPointerCapture(g.pointerId);
      } catch {
        // The pointer is already gone; the next move or up ends the gesture.
      }
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = "none";
      restoreBodyStyle = () => {
        document.body.style.userSelect = previousUserSelect;
      };
      window.getSelection()?.removeAllRanges();
      container.addEventListener("scroll", update, { passive: true });
      container.addEventListener("lostpointercapture", onLostPointerCapture);
      window.addEventListener("keydown", onKeyDown, true);
      setIsSelecting(true);
    };

    const endGesture = (swallowClick: boolean) => {
      const g = gesture;
      if (!g) return;
      gesture = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      if (g.phase === "pending") return;
      stopAutoScroll();
      container.removeEventListener("scroll", update);
      container.removeEventListener("lostpointercapture", onLostPointerCapture);
      window.removeEventListener("keydown", onKeyDown, true);
      if (container.hasPointerCapture(g.pointerId)) {
        container.releasePointerCapture(g.pointerId);
      }
      restoreBodyStyle?.();
      restoreBodyStyle = undefined;
      showMarquee(null);
      setIsSelecting(false);
      if (swallowClick) swallowNextClick();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (gesture || event.button !== 0 || event.pointerType !== "mouse")
        return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest(CONTROL_SELECTOR);
      if (control && container.contains(control)) return;
      const box = container.getBoundingClientRect();
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      if (
        x >= container.clientLeft + container.clientWidth ||
        y >= container.clientTop + container.clientHeight
      ) {
        return;
      }
      const item = target.closest(ITEM_SELECTOR);
      const origin = {
        x: box.left + container.clientLeft,
        y: box.top + container.clientTop,
      };
      const startClient = { x: event.clientX, y: event.clientY };
      const pressSelection = [...latest.current.selected];
      gesture = {
        pointerId: event.pointerId,
        phase: "pending",
        origin,
        startClient,
        startContent: toContent(startClient, origin),
        lastClient: startClient,
        additive: event.shiftKey || event.metaKey || event.ctrlKey,
        onBackground: !item || !container.contains(item),
        pressSelection,
        emitted: pressSelection,
        items: [],
        bounds: { width: 0, height: 0 },
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
    };

    const onPointerMove = (event: PointerEvent) => {
      const g = gesture;
      if (!g || event.pointerId !== g.pointerId) return;
      // A release we never saw, e.g. over a native menu.
      if ((event.buttons & 1) === 0) return endGesture(false);
      g.lastClient = { x: event.clientX, y: event.clientY };
      if (g.phase === "cancelled") return;
      if (g.phase === "pending") {
        if (!hasPassedThreshold(g.startClient, g.lastClient)) return;
        startDrag(g);
      }
      update();
      startAutoScroll(g);
    };

    const onPointerUp = (event: PointerEvent) => {
      const g = gesture;
      if (!g || event.pointerId !== g.pointerId) return;
      if (g.phase !== "pending") return endGesture(true);
      endGesture(false);
      const { selected, onSelectionChange } = latest.current;
      if (g.onBackground && !g.additive && selected.length > 0) {
        onSelectionChange([]);
      }
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (gesture && event.pointerId === gesture.pointerId) endGesture(false);
    };

    const onLostPointerCapture = (event: PointerEvent) => {
      if (gesture && event.pointerId === gesture.pointerId) endGesture(false);
    };

    // Esc restores the press-time selection and must beat the page's own Escape bindings. The press
    // stays tracked until release, so its click can still be swallowed.
    const onKeyDown = (event: KeyboardEvent) => {
      const g = gesture;
      if (event.key !== "Escape" || !g || g.phase === "pending") return;
      event.preventDefault();
      event.stopPropagation();
      if (g.phase === "cancelled") return;
      g.phase = "cancelled";
      stopAutoScroll();
      emit(g, g.pressSelection);
      showMarquee(null);
      setIsSelecting(false);
    };

    // Card overlay links are natively draggable; an HTML5 link drag would cancel the pointer.
    const onDragStart = (event: DragEvent) => {
      if (gesture) event.preventDefault();
    };

    // Every press in the container may become a marquee, so it doesn't start a text selection.
    const onSelectStart = (event: Event) => {
      if (gesture) event.preventDefault();
    };

    // On macOS Ctrl-click opens the context menu instead.
    const onContextMenu = (event: MouseEvent) => {
      if (!gesture) return;
      if (gesture.phase === "pending") return endGesture(false);
      event.preventDefault();
      event.stopPropagation();
    };

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("dragstart", onDragStart);
    container.addEventListener("selectstart", onSelectStart);
    container.addEventListener("contextmenu", onContextMenu);
    return () => {
      endGesture(false);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("dragstart", onDragStart);
      container.removeEventListener("selectstart", onSelectStart);
      container.removeEventListener("contextmenu", onContextMenu);
    };
  }, [container, enabled]);

  const attachOverlay = React.useCallback((node: HTMLDivElement | null) => {
    overlayRef.current = node;
    if (node && marqueeRef.current) placeOverlay(node, marqueeRef.current);
  }, []);

  const overlay = isSelecting
    ? React.createElement("div", {
        ref: attachOverlay,
        "aria-hidden": true,
        className:
          "pointer-events-none absolute z-20 rounded-sm border border-primary/50 bg-primary/10",
      })
    : null;

  return { isSelecting, overlay };
}

// Positioned outside React so pointer moves don't re-render the consumer.
function placeOverlay(node: HTMLElement, rect: Rect) {
  node.style.left = `${rect.left}px`;
  node.style.top = `${rect.top}px`;
  node.style.width = `${rect.right - rect.left}px`;
  node.style.height = `${rect.bottom - rect.top}px`;
}

// After a drag the release would click the item under the pointer and navigate.
function swallowNextClick() {
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    stop();
  };
  const stop = () => {
    window.removeEventListener("click", swallow, true);
    window.clearTimeout(timeout);
  };
  window.addEventListener("click", swallow, true);
  const timeout = window.setTimeout(stop, CLICK_SWALLOW_TIMEOUT);
}
