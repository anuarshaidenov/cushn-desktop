import { useEffect, useRef, useState } from "react";
import { SHAPE_WAVES_INTRO_END, ShapeWaves } from "@/components/ShapeWaves";
import { CUSHN_ICON_MASK, CUSHN_ICON_PATHS } from "@/lib/cushnIcon";
import { LogoWordmark } from "@/components/LogoWordmark";
import { DialogDescription } from "@/components/ui/dialog";
import type { StepProps } from "./StepLayout";

// The field takes hex only. The stage is the `.dark` --background.
const STAGE_COLOR = "#090a0c";
const GLYPH_COLOR = "#2a2e3e";
const ACCENT_COLOR = "#8998e9";

const SHAPE_SIZE = 0.4;
const SHAPE_ANCHOR: [number, number] = [0.5, 0.4];
// ShapeWaves sizes the mark's 24-unit box at SHAPE_SIZE of the field's height, at most 90% of its width.
const MARK_BOX = `min(${SHAPE_SIZE * 100}cqh, 90cqw)`;
// The stroked mark's ink, round caps included, in that box. It lands on the wordmark's filled mark, the square at its left end.
const MARK_INK = { centerX: 11.98, centerY: 12.1, size: 19.87 };

const LOGO_HEIGHT = 60;
// The wordmark is drawn twice, split between mark and name (x = 686 of 2185), so each half moves on its own.
const MARK_CLIP = "inset(0 68.6% 0 0)";
const NAME_HIDDEN = "inset(0 68.6% 0 31.4%)";
const NAME_SHOWN = "inset(0 0 0 31.4%)";

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";
// Without WebGPU the intro ends at once; the stage's own fade-in goes first.
const MIN_DELAY = 350;

export const OnboardingWelcome = ({ returning }: StepProps) => {
  // Back from the next step, the logo is already formed: no intro, no morph.
  const [formed] = useState(returning);
  const fieldRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const strokeRef = useRef<SVGSVGElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const sentenceRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const field = fieldRef.current;
    const scrim = scrimRef.current;
    const stroke = strokeRef.current;
    const mark = markRef.current;
    const name = nameRef.current;
    const sentence = sentenceRef.current;
    if (!field || !scrim || !stroke || !mark || !name || !sentence) return;

    const mountedAt = performance.now();
    const animations: Animation[] = [];
    const play = (
      element: Element,
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions,
    ) =>
      animations.push(element.animate(keyframes, { fill: "both", ...options }));
    const stop = () => animations.forEach((animation) => animation.cancel());

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced || formed) {
      const fadeIn = { duration: reduced ? 200 : 560, easing: EASE_OUT };
      // Going back, it drops in from above like every step does.
      const from = reduced ? "none" : "translateY(-16px)";
      play(scrim, [{ opacity: 0 }, { opacity: 1 }], fadeIn);
      for (const element of [mark, sentence])
        play(
          element,
          [
            { opacity: 0, transform: from },
            { opacity: 1, transform: "none" },
          ],
          fadeIn,
        );
      play(
        name,
        [
          { opacity: 0, clipPath: NAME_SHOWN, transform: from },
          { opacity: 1, clipPath: NAME_SHOWN, transform: "none" },
        ],
        fadeIn,
      );
      return stop;
    }

    const morph = () => {
      const delay = Math.max(0, MIN_DELAY - (performance.now() - mountedAt));
      const box = stroke.getBoundingClientRect();
      const logo = mark.getBoundingClientRect();
      const unit = box.width / 24;
      const scale = logo.height / (MARK_INK.size * unit);
      const x =
        logo.left +
        logo.height / 2 -
        (box.left + box.width / 2) -
        scale * (MARK_INK.centerX - 12) * unit;
      const y =
        logo.top +
        logo.height / 2 -
        (box.top + box.height / 2) -
        scale * (MARK_INK.centerY - 12) * unit;

      play(
        stroke,
        [
          { opacity: 0, filter: "blur(6px)", easing: EASE_OUT },
          { opacity: 1, filter: "blur(0px)", offset: 0.36 },
          { opacity: 1, filter: "blur(0px)", offset: 0.74, easing: EASE_OUT },
          { opacity: 0, filter: "blur(2px)" },
        ],
        { duration: 1160, delay },
      );
      play(
        stroke,
        [
          { transform: "none" },
          { transform: `translate(${x}px, ${y}px) scale(${scale})` },
        ],
        { duration: 760, delay: delay + 300, easing: EASE_IN_OUT },
      );
      play(scrim, [{ opacity: 0 }, { opacity: 1 }], {
        duration: 600,
        delay: delay + 300,
        easing: EASE_OUT,
      });
      play(
        mark,
        [
          { opacity: 0, filter: "blur(2px)" },
          { opacity: 1, filter: "blur(0px)" },
        ],
        { duration: 300, delay: delay + 860, easing: EASE_OUT },
      );
      play(
        name,
        [
          { clipPath: NAME_HIDDEN, transform: "translateX(-12px)" },
          { clipPath: NAME_SHOWN, transform: "none" },
        ],
        { duration: 640, delay: delay + 900, easing: EASE_OUT },
      );
      play(
        sentence,
        [
          { opacity: 0, transform: "translateY(8px)", filter: "blur(4px)" },
          { opacity: 1, transform: "none", filter: "blur(0px)" },
        ],
        { duration: 560, delay: delay + 1040, easing: EASE_OUT },
      );
    };

    if (field.querySelector('[data-intro="done"]')) morph();
    else field.addEventListener(SHAPE_WAVES_INTRO_END, morph, { once: true });

    return () => {
      field.removeEventListener(SHAPE_WAVES_INTRO_END, morph);
      stop();
    };
  }, [formed]);

  return (
    <>
      <div ref={fieldRef} className="[container-type:size] absolute inset-0">
        <ShapeWaves
          shape={CUSHN_ICON_MASK}
          shapeSize={SHAPE_SIZE}
          shapeAnchor={SHAPE_ANCHOR}
          cellSize={8}
          intro={!formed}
          color={GLYPH_COLOR}
          hoverColor={ACCENT_COLOR}
          backgroundColor={STAGE_COLOR}
          fade={0.2}
        />
        {/* Clears the field behind the logo and the sentence, and covers the carved mark once it lifts off. */}
        <div
          ref={scrimRef}
          className="absolute inset-x-[19%] top-[7%] bottom-[15%] opacity-0"
          style={{
            background: `radial-gradient(closest-side, ${STAGE_COLOR} 60%, transparent)`,
          }}
        />
        <svg
          ref={strokeRef}
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke={ACCENT_COLOR}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute origin-center opacity-0"
          style={{
            width: MARK_BOX,
            height: MARK_BOX,
            left: `calc(${SHAPE_ANCHOR[0] * 100}% - ${MARK_BOX} / 2)`,
            top: `calc(${SHAPE_ANCHOR[1] * 100}% - ${MARK_BOX} / 2)`,
          }}
        >
          {CUSHN_ICON_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      </div>
      <div
        className="absolute inset-x-0 flex flex-col items-center px-8"
        style={{
          top: `calc(${SHAPE_ANCHOR[1] * 100}% - ${LOGO_HEIGHT / 2}px)`,
        }}
      >
        <div aria-hidden="true" className="relative flex">
          <span
            ref={markRef}
            className="flex opacity-0"
            style={{ clipPath: MARK_CLIP }}
          >
            <LogoWordmark height={LOGO_HEIGHT} />
          </span>
          <span
            ref={nameRef}
            className="absolute inset-0 flex"
            style={{ clipPath: NAME_HIDDEN }}
          >
            <LogoWordmark height={LOGO_HEIGHT} />
          </span>
        </div>
        <DialogDescription
          ref={sentenceRef}
          className="mt-8 max-w-[25rem] text-center text-[17px] leading-relaxed text-balance opacity-0"
        >
          Your budgets live on this computer, with no account and no sync.
        </DialogDescription>
      </div>
    </>
  );
};
