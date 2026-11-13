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

const numberWithSpacesFormat = new Intl.NumberFormat("fr-FR");

export const formatNumberWithSpaces = (number: number) =>
  numberWithSpacesFormat.format(number);

const shortDateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/** `Mar 4, 2026` */
export const formatShortDate = (time: number) => shortDateFormat.format(time);

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

const currencySymbols = new Map<string, string>(
  CURRENCIES.map((c) => [c.code, c.symbol]),
);

export const getCurrencySymbol = (code: string): string | undefined =>
  currencySymbols.get(code);
