import type { ReactNode } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

export type StepProps = {
  onFinish: () => void;
  /** Reached by going back from the next step. Read it once, on mount. */
  returning: boolean;
};

/** A step's copy where the feature slides keep theirs, its controls where their demos stand; stacked on a narrow stage. */
export const StepLayout = (props: {
  icon: IconSvgElement;
  label: string;
  title: string;
  body: ReactNode;
  children: ReactNode;
}) => (
  <div className="@container absolute inset-x-0 top-0 bottom-20">
    <div className="flex size-full items-center-safe overflow-y-auto [scrollbar-width:none] @max-[50rem]:flex-col @max-[50rem]:items-stretch @max-[50rem]:justify-center-safe @max-[50rem]:gap-8 @max-[50rem]:px-10 @max-[50rem]:pt-10">
      <div className="w-[max(48%,440px)] shrink-0 pr-8 pl-20 @max-[50rem]:w-auto @max-[50rem]:p-0">
        <div className="max-w-80">
          <p className="onboarding-rise flex items-center gap-2 text-sm font-medium text-muted-foreground [--rise-delay:120ms]">
            <HugeiconsIcon
              icon={props.icon}
              strokeWidth={2}
              className="size-4"
              aria-hidden="true"
            />
            {props.label}
          </p>
          <h3 className="onboarding-rise mt-4 text-[26px] leading-[1.15] font-medium tracking-[-0.015em] text-balance [--rise-delay:170ms]">
            {props.title}
          </h3>
          <p className="onboarding-rise mt-3 text-[15px] leading-6 text-pretty text-muted-foreground [--rise-delay:220ms]">
            {props.body}
          </p>
        </div>
      </div>
      <div className="onboarding-rise min-w-0 flex-1 pr-14 [--rise-delay:200ms] [--rise-distance:24px] @max-[50rem]:pr-0">
        {props.children}
      </div>
    </div>
  </div>
);
