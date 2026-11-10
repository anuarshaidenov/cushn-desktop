import {
  createContext,
  type KeyboardEvent,
  type RefObject,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

export type StageKeyHandler = (event: KeyboardEvent) => void;

export const StageKeysContext =
  createContext<RefObject<StageKeyHandler | null> | null>(null);

/**
 * Hands the step every key pressed on the stage, including while focus sits on the
 * shell's button. Call `event.preventDefault()` on the keys the step uses: the shell
 * then leaves them alone, Enter included. Keys a control inside the step already
 * prevented never arrive.
 */
export const useStageKeys = (handler: StageKeyHandler) => {
  const slot = use(StageKeysContext);
  const latest = useRef(handler);

  useLayoutEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    if (!slot) return;
    const forward: StageKeyHandler = (event) => latest.current(event);
    slot.current = forward;
    return () => {
      if (slot.current === forward) slot.current = null;
    };
  }, [slot]);
};
