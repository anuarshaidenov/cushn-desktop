import {
  type ComponentType,
  type CSSProperties,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/shallow";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { toast } from "@/components/ui/toast";
import { agentsQueries } from "@/data/agents";
import { useCompleteOnboarding, useOnboarding } from "@/data/onboarding";
import { cn } from "@/lib/utils";
import { useOnboardingStore } from "@/stores/useOnboardingStore";
import { OnboardingAgents } from "./OnboardingAgents";
import { OnboardingTemplates } from "./OnboardingTemplates";
import { type StageKeyHandler, StageKeysContext } from "./stageKeys";
import type { StepProps } from "./StepLayout";

// The wave field weighs ~440 KB, so it loads only when onboarding opens.
const OnboardingWelcome = lazy(() =>
  import("./OnboardingWelcome").then((module) => ({
    default: module.OnboardingWelcome,
  })),
);
// Fetched as soon as onboarding opens, so it is ready by the time Welcome hands over.
const loadFeatures = () => import("./OnboardingFeatures");
const OnboardingFeatures = lazy(() =>
  loadFeatures().then((module) => ({
    default: module.OnboardingFeatures,
  })),
);

type Step = { id: string; Content: ComponentType<StepProps>; action: string };

const steps: Step[] = [
  { id: "welcome", Content: OnboardingWelcome, action: "Get started" },
  { id: "features", Content: OnboardingFeatures, action: "Continue" },
  { id: "agents", Content: OnboardingAgents, action: "Continue" },
  { id: "templates", Content: OnboardingTemplates, action: "Done" },
];

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const Onboarding = () => {
  const { data } = useOnboarding();
  const { mutateAsync } = useCompleteOnboarding();
  const { isOpen, openDialog, closeDialog } = useOnboardingStore(
    useShallow((state) => ({
      isOpen: state.isOpen,
      openDialog: state.openDialog,
      closeDialog: state.closeDialog,
    })),
  );
  const completedAt = data?.completedAt;

  useEffect(() => {
    if (completedAt === null) openDialog();
  }, [completedAt, openDialog]);

  // However it closes, onboarding is over. The stage unmounts on close, so the mutation runs here.
  const finish = async () => {
    closeDialog();
    try {
      await mutateAsync();
    } catch (error) {
      toast.add({
        type: "error",
        title: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) void finish();
      }}
      disablePointerDismissal
    >
      <DialogPortal>
        {/* Clicking it does nothing, so it moves the window instead: the modal covers the title bar rows. */}
        <DialogOverlay className="app-drag" />
        {/* Opacity only: the wave field caches its screen position, so the stage must not move or scale in. */}
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className="dark fixed top-1/2 left-1/2 z-50 h-[min(600px,calc(100dvh-112px))] w-[min(960px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-background text-foreground shadow-(--custom-shadow-overlay) duration-200 ease-out-quint outline-none data-closed:animate-out data-closed:duration-150 data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0"
        >
          <OnboardingStage onFinish={finish} />
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
};

const OnboardingStage = ({ onFinish }: { onFinish: () => void }) => {
  // The step being left stays mounted until its exit has played, so the next one arrives on the same stage.
  // `back`: the current step was reached by going back, so steps leave downward and arrive from above.
  const [stage, setStage] = useState<{
    index: number;
    leaving: number | null;
    back: boolean;
  }>({ index: 0, leaving: null, back: false });
  const queryClient = useQueryClient();
  const stepKeys = useRef<StageKeyHandler | null>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const step = steps[stage.index];
  const go = (index: number) =>
    setStage({
      index,
      leaving: reducedMotion() ? null : stage.index,
      back: index < stage.index,
    });
  const advance = () => {
    if (stage.index === steps.length - 1) return onFinish();
    go(stage.index + 1);
  };
  const back = () => {
    if (stage.index === 0) return;
    // The first step has no Back button, so focus moves on before this one unmounts.
    if (stage.index === 1) actionRef.current?.focus();
    go(stage.index - 1);
  };

  useEffect(() => {
    void loadFeatures();
    // Detecting agents starts their CLIs and takes a moment, so it runs while the first steps play.
    void queryClient.prefetchQuery(agentsQueries.list());
  }, [queryClient]);

  return (
    <StageKeysContext value={stepKeys}>
      <div
        className="absolute inset-0"
        style={{ "--stage-direction": stage.back ? -1 : 1 } as CSSProperties}
        onKeyDown={(event) => {
          if (!event.defaultPrevented) stepKeys.current?.(event);
          if (
            event.key !== "Enter" ||
            event.defaultPrevented ||
            event.repeat ||
            event.nativeEvent.isComposing ||
            (event.target instanceof HTMLButtonElement &&
              event.target !== actionRef.current)
          )
            return;
          event.preventDefault();
          advance();
        }}
      >
        <DialogTitle className="sr-only">Welcome to Cushn</DialogTitle>
        {steps.map((item, itemIndex) => {
          const leaving = itemIndex === stage.leaving;
          if (itemIndex !== stage.index && !leaving) return null;
          return (
            <div
              key={item.id}
              inert={leaving}
              className={cn(
                "absolute inset-0",
                leaving
                  ? "onboarding-leave"
                  : "transition-opacity duration-300 ease-out-quint starting:opacity-0",
              )}
              onAnimationEnd={(event) => {
                if (leaving && event.target === event.currentTarget)
                  setStage((current) => ({ ...current, leaving: null }));
              }}
            >
              <Suspense fallback={null}>
                <item.Content onFinish={onFinish} returning={stage.back} />
              </Suspense>
            </div>
          );
        })}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-5">
          <div
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={stage.index + 1}
            className="flex gap-1.5"
          >
            {steps.map((item, itemIndex) => (
              <span
                key={item.id}
                className="h-1 w-6 overflow-hidden rounded-full bg-foreground/15"
              >
                <span
                  className={cn(
                    "block size-full origin-left rounded-full bg-foreground transition-transform duration-500 ease-out-quint",
                    itemIndex > stage.index && "scale-x-0",
                  )}
                />
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {stage.index > 0 && (
              <Button
                variant="ghost"
                size="lg"
                // Clicking leaves focus on the action, so Enter still continues.
                onMouseDown={(event) => event.preventDefault()}
                onClick={back}
                className="starting:opacity-0"
              >
                Back
              </Button>
            )}
            <Button
              ref={actionRef}
              size="lg"
              aria-keyshortcuts="Enter"
              onClick={advance}
              className="pr-2"
            >
              {step.action}
              <Kbd className="bg-background/10 text-background/60">↵</Kbd>
            </Button>
          </div>
        </div>
      </div>
    </StageKeysContext>
  );
};
