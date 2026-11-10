import {
  type ComponentType,
  type Ref,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  CommandIcon,
  GaugeIcon,
  LayoutTemplateIcon,
  MessagesSquareIcon,
  NotebookPenIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { appHotkeys, formatHotkeyLabel } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";
import { AgentChatDemo } from "./features/AgentChatDemo";
import { NotesDemo } from "./features/NotesDemo";
import { OverspendDemo } from "./features/OverspendDemo";
import { ShortcutsDemo } from "./features/ShortcutsDemo";
import { TemplatesDemo } from "./features/TemplatesDemo";
import { useStageKeys } from "./stageKeys";
import type { StepProps } from "./StepLayout";

type DemoProps = { active: boolean; className?: string };

type Feature = {
  id: string;
  icon: IconSvgElement;
  label: string;
  title: string;
  body: string;
  Demo: ComponentType<DemoProps>;
};

const features: Feature[] = [
  {
    id: "notes",
    icon: NotebookPenIcon,
    label: "Markdown notes",
    title: "Remember why you moved that money.",
    body: "Jot down when a bill renews or what you're saving for, right under the budget's title. Notes save as you type and come along when you duplicate the budget.",
    Demo: NotesDemo,
  },
  {
    id: "templates",
    icon: LayoutTemplateIcon,
    label: "Templates",
    title: "Start every budget with the math already done.",
    body: "Pick 50/30/20 for your paycheck or Travel for a trip, and the money's split before you spend a cent. Have your own rule? Make it a template.",
    Demo: TemplatesDemo,
  },
  {
    id: "overspend",
    icon: GaugeIcon,
    label: "Overspending & currencies",
    title: "Catch the overspend, whatever currency you pay in.",
    body: "Type “115 usd” and it lands in the budget's currency, no converting in your head. Go over, and what's left turns red.",
    Demo: OverspendDemo,
  },
  {
    id: "shortcuts",
    icon: CommandIcon,
    label: "Keyboard shortcuts",
    title: "Fast enough that you'll actually keep it up.",
    body: `${formatHotkeyLabel(appHotkeys["palette.open"].defaultHotkey)} finds any budget or command and shows its shortcut, so next time it's a single key. ${formatHotkeyLabel(appHotkeys["expenses.nextInput"].defaultHotkey)} jumps to the next expense.`,
    Demo: ShortcutsDemo,
  },
  {
    id: "agents",
    icon: MessagesSquareIcon,
    label: "Claude & Codex",
    title: "Ask where your money went. Get a straight answer.",
    body: "Connect the Claude or Codex plan you already pay for. It reads your budgets, answers in plain words, and logs expenses when you ask.",
    Demo: AgentChatDemo,
  },
];

const last = features.length - 1;

const slideLabel = (index: number) =>
  `${index + 1} of ${features.length}: ${features[index].label}`;

const targetFor = (key: string, from: number) => {
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return Math.min(from + 1, last);
    case "ArrowUp":
    case "ArrowLeft":
      return Math.max(from - 1, 0);
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
};

type SnapEvent = Event & { snapTargetBlock: Element | null };

export const OnboardingFeatures = ({ returning }: StepProps) => {
  // Back from the next step, the stage opens on the slide next to it.
  const [start] = useState(returning ? last : 0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef<(HTMLElement | null)[]>([]);
  const entranceRef = useRef<HTMLDivElement>(null);
  // A key or a tick scrolls past slides on the way; their snaps shouldn't move the indicator back.
  const jumpingRef = useRef(false);
  // `current` follows the snap the scroll is heading for; `settled` is the slide at rest, whose demo plays.
  // `runs` counts each slide's departures: a demo remounts as its slide is left, so it plays again on return.
  const [{ current, settled, runs }, setPosition] = useState<{
    current: number;
    settled: number | null;
    runs: number[];
  }>({ current: start, settled: null, runs: features.map(() => 0) });

  const go = (index: number) => {
    const scroller = scrollerRef.current;
    const slide = slidesRef.current[index];
    if (!scroller || !slide) return;
    setPosition((position) => ({ ...position, current: index }));
    if (Math.round(scroller.scrollTop) === slide.offsetTop) return;
    jumpingRef.current = true;
    scroller.scrollTo({
      top: slide.offsetTop,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };

  useStageKeys((event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    const target = targetFor(event.key, current);
    if (target === null) return;
    event.preventDefault();
    if (target !== current) go(target);
  });

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const slide = slidesRef.current[start];
    if (scroller && slide) scroller.scrollTop = slide.offsetTop;
  }, [start]);

  // No demo plays until the stage's entrance has landed, so the first one measures its resting layout.
  useEffect(() => {
    let live = true;
    const animations = entranceRef.current?.getAnimations() ?? [];
    void Promise.allSettled(
      animations.map((animation) => animation.finished),
    ).then(() => {
      if (live)
        setPosition((position) => ({
          ...position,
          settled: position.current,
        }));
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const indexOf = (event: Event) =>
      slidesRef.current.findIndex(
        (slide) => slide === (event as SnapEvent).snapTargetBlock,
      );
    const onSnapChanging = (event: Event) => {
      const index = indexOf(event);
      if (index >= 0 && !jumpingRef.current)
        setPosition((position) => ({ ...position, current: index }));
    };
    const onSnapChange = (event: Event) => {
      const index = indexOf(event);
      if (index < 0) return;
      setPosition(({ settled, runs }) => ({
        current: index,
        settled: settled === null ? null : index,
        runs:
          settled === null || settled === index
            ? runs
            : runs.map((run, slide) => (slide === settled ? run + 1 : run)),
      }));
    };
    const onScrollEnd = () => {
      jumpingRef.current = false;
    };
    scroller.addEventListener("scrollsnapchanging", onSnapChanging);
    scroller.addEventListener("scrollsnapchange", onSnapChange);
    scroller.addEventListener("scrollend", onScrollEnd);
    return () => {
      scroller.removeEventListener("scrollsnapchanging", onSnapChanging);
      scroller.removeEventListener("scrollsnapchange", onSnapChange);
      scroller.removeEventListener("scrollend", onScrollEnd);
    };
  }, []);

  return (
    <div className="absolute inset-0">
      <div
        ref={scrollerRef}
        tabIndex={-1}
        role="region"
        aria-roledescription="carousel"
        aria-label="Features"
        className="absolute inset-0 snap-y snap-mandatory [scrollbar-width:none] overflow-x-hidden overflow-y-auto overscroll-contain outline-none"
      >
        {features.map((feature, index) => (
          <FeatureSlide
            key={feature.id}
            ref={(slide) => {
              slidesRef.current[index] = slide;
            }}
            demoRef={index === start ? entranceRef : undefined}
            feature={feature}
            index={index}
            entering={index === start}
            active={index === settled}
            run={runs[index]}
          />
        ))}
      </div>
      {/* Scroll edges: slides dissolve into the stage, and the bottom bar keeps a clear ground. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-linear-to-b from-background" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-background from-20%" />
      <div
        role="group"
        aria-label="Feature"
        className="onboarding-rise pointer-events-none absolute top-0 bottom-20 left-3 flex flex-col justify-center [--rise-delay:360ms] [--rise-distance:0px]"
      >
        {features.map((feature, index) => (
          <button
            key={feature.id}
            type="button"
            aria-label={feature.label}
            aria-current={index === current ? "true" : undefined}
            // Clicking leaves focus on the shell's button, so Enter still continues.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => go(index)}
            className="group pointer-events-auto flex h-6 w-8 cursor-pointer items-center rounded-sm px-2 outline-none focus-visible:ring-[1.5px] focus-visible:ring-ring/50"
          >
            <span
              className={cn(
                "h-[3px] w-4 origin-left rounded-full transition-[scale,background-color] duration-300 ease-out-quint",
                index === current
                  ? "bg-foreground"
                  : "scale-x-50 bg-foreground/25 group-hover:bg-foreground/60",
              )}
            />
          </button>
        ))}
      </div>
      <p aria-live="polite" className="sr-only">
        {settled === null
          ? ""
          : `${slideLabel(settled)}. ${features[settled].title}`}
      </p>
    </div>
  );
};

const FeatureSlide = ({
  ref,
  demoRef,
  feature,
  index,
  entering,
  active,
  run,
}: {
  ref: Ref<HTMLElement>;
  demoRef?: Ref<HTMLDivElement>;
  feature: Feature;
  index: number;
  /** The one slide on stage as the step arrives: it rises in while the step before lifts away. */
  entering: boolean;
  active: boolean;
  run: number;
}) => {
  const rise = entering && "onboarding-rise";
  return (
    <section
      ref={ref}
      role="group"
      aria-roledescription="slide"
      aria-label={slideLabel(index)}
      className="onboarding-slide relative h-full snap-start snap-always"
    >
      <div className="absolute inset-x-0 top-0 bottom-20 flex items-center pr-8 pl-20">
        <div className="onboarding-slide-copy max-w-80">
          <p
            className={cn(
              "flex items-center gap-2 text-sm font-medium text-muted-foreground [--rise-delay:120ms]",
              rise,
            )}
          >
            <HugeiconsIcon
              icon={feature.icon}
              strokeWidth={2}
              className="size-4"
              aria-hidden="true"
            />
            {feature.label}
          </p>
          <h3
            className={cn(
              "mt-4 text-[26px] leading-[1.15] font-medium tracking-[-0.015em] text-balance [--rise-delay:170ms]",
              rise,
            )}
          >
            {feature.title}
          </h3>
          <p
            className={cn(
              "mt-3 text-[15px] leading-6 text-pretty text-muted-foreground [--rise-delay:220ms]",
              rise,
            )}
          >
            {feature.body}
          </p>
        </div>
      </div>
      {/* The window bleeds off the stage's right edge and is cut at the slide's foot. The 48px gutter on the left keeps its hairline and halo. */}
      <div
        inert
        aria-hidden="true"
        className="onboarding-slide-demo absolute inset-y-0 right-0 left-[calc(max(48%,440px)-48px)] overflow-hidden pt-14 pl-12 @max-[50rem]:hidden"
      >
        <div
          ref={demoRef}
          className={cn(
            "h-[520px] w-[540px] [--rise-delay:200ms] [--rise-distance:48px]",
            rise,
          )}
        >
          <feature.Demo key={run} active={active} className="h-full w-full" />
        </div>
      </div>
    </section>
  );
};
