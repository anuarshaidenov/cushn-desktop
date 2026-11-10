import { CURRENCIES } from "@/constants";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Crossfades icons stacked in one grid cell (`grid *:col-start-1 *:row-start-1`). */
export const swapIconClass = (visible: boolean) =>
  cn(
    "transition-[opacity,scale,filter] duration-200 ease-out-quint",
    !visible &&
      "scale-75 opacity-0 blur-[2px] motion-reduce:scale-100 motion-reduce:blur-none",
  );

export const formatNumberWithSpaces = (number: number) =>
  new Intl.NumberFormat("fr-FR").format(number);

export const isTyping = (target: HTMLElement): boolean => {
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
};

export function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.closest(
      "input, textarea, select, [contenteditable='true'], [contenteditable='']",
    ) !== null
  );
}

export const isCopying = (event: KeyboardEvent): boolean => {
  return event.metaKey || event.ctrlKey;
};

export const getCurrencySymbol = (code: string): string | undefined => {
  const currency = CURRENCIES.find((c) => c.code === code);
  return currency ? currency.symbol : undefined;
};
