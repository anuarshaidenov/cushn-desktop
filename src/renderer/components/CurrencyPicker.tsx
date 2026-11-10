import type { ReactElement, ReactNode } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { CURRENCIES } from "@/constants";

type Currency = (typeof CURRENCIES)[number];

const items = Combobox.createItems<Currency, string>(CURRENCIES, {
  getValue: (currency) => currency.code,
  getLabel: (currency) => currency.name,
});

const matchesCurrencyQuery = (currency: Currency, query: string) => {
  const q = query.trim().toLowerCase();
  return [currency.code, currency.name, currency.symbol].some((term) =>
    term.toLowerCase().includes(q),
  );
};

type Props<Multiple extends boolean | undefined> = Omit<
  Combobox.Root.Props<string, Multiple, Currency>,
  "items" | "filter" | "children"
> & {
  trigger: ReactElement;
  children?: ReactNode;
  align?: "start" | "center" | "end";
};

export function CurrencyPicker<Multiple extends boolean | undefined = false>({
  trigger,
  children,
  align = "start",
  ...props
}: Props<Multiple>) {
  return (
    <Combobox.Root
      items={items}
      filter={matchesCurrencyQuery}
      autoHighlight
      // Keep the query while picking several currencies.
      onInputValueChange={(_, details) => {
        if (props.multiple && details.isItemPress) details.cancel();
      }}
      {...props}
    >
      <Combobox.Trigger render={trigger}>
        {children ?? (
          <Combobox.Value>
            {(code: string | null) => code?.toUpperCase()}
          </Combobox.Value>
        )}
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner
          align={align}
          sideOffset={4}
          className="isolate z-50"
        >
          <Combobox.Popup className="flex max-h-(--available-height) w-64 max-w-(--available-width) min-w-(--anchor-width) origin-(--transform-origin) flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-(--custom-shadow-popover) outline-hidden ease-out-quint data-closed:animate-out data-closed:duration-100 data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2">
            <label className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
              <HugeiconsIcon
                icon={Search01Icon}
                strokeWidth={2}
                className="size-4 shrink-0 text-muted-foreground"
              />
              <Combobox.Input
                aria-label="Search currencies"
                placeholder="Search currencies…"
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </label>
            <Combobox.Empty>
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No currencies found
              </p>
            </Combobox.Empty>
            <Combobox.List
              aria-label="Currencies"
              className="max-h-72 min-h-0 scroll-py-1 overflow-y-auto overscroll-contain p-1 empty:hidden"
            >
              {(currency: Currency) => (
                <Combobox.Item
                  key={currency.code}
                  value={currency.code}
                  className="relative flex w-full cursor-default items-center gap-2 rounded-lg py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <span className="truncate">{currency.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground uppercase">
                    {currency.code}
                  </span>
                  <Combobox.ItemIndicator className="absolute right-2 flex size-3.5 items-center justify-center">
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      strokeWidth={2}
                      className="size-4"
                    />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
