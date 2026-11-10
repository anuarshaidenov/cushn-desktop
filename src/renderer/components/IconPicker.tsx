import { useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import {
  ICON_GROUPS,
  findIcon,
  matchesIconQuery,
  type CatalogIcon,
  type CatalogIconGroup,
} from "@/lib/iconCatalog";
import { CatalogIconPicture } from "./CatalogIconPicture";
import { Button } from "./ui/button";

const COLUMNS = 8;

const items = Combobox.createItems<CatalogIcon, string>(ICON_GROUPS, {
  getValue: (icon) => icon.name,
  getLabel: (icon) => icon.label,
});

const sizes = {
  default: { trigger: "size-8 rounded-lg", icon: "size-4", logoStrokeWidth: 2 },
  lg: { trigger: "size-12 rounded-xl", icon: "size-8", logoStrokeWidth: 1.75 },
};

type Props = {
  value: string | null;
  onValueChange: (value: string | null) => void;
  size?: keyof typeof sizes;
  className?: string;
  "aria-label"?: string;
};

export const IconPicker = ({
  value,
  onValueChange,
  size = "default",
  className,
  "aria-label": ariaLabel = "Choose an icon",
}: Props) => {
  const [state, setState] = useState({
    open: false,
    highlighted: null as string | null,
    // Keys the trigger glyph, so the swap animation plays on a pick and not on mount.
    picks: 0,
  });
  const selected = findIcon(value);
  const shown = findIcon(state.highlighted) ?? selected;

  const pick = (next: string | null) => {
    onValueChange(next);
    setState((s) => ({ ...s, picks: s.picks + 1 }));
  };

  return (
    <Combobox.Root
      items={items}
      grid
      autoHighlight
      value={value}
      onValueChange={pick}
      filter={matchesIconQuery}
      open={state.open}
      onOpenChange={(open) => setState((s) => ({ ...s, open }))}
      onItemHighlighted={(name) =>
        setState((s) => ({ ...s, highlighted: name ?? null }))
      }
    >
      <Combobox.Trigger
        aria-label={ariaLabel}
        render={
          <Button
            data-kubai-trigger
            variant="ghost"
            size="icon"
            className={cn(
              "group/icon-picker data-popup-open:bg-accent",
              sizes[size].trigger,
              className,
            )}
          />
        }
      >
        <CatalogIconPicture
          key={state.picks}
          icon={selected}
          trigger="parent"
          logoStrokeWidth={sizes[size].logoStrokeWidth}
          className={cn(
            sizes[size].icon,
            selected
              ? "text-foreground"
              : "text-muted-foreground transition-colors group-hover/icon-picker:text-foreground group-data-popup-open/icon-picker:text-foreground",
            state.picks > 0 &&
              "animate-in duration-250 ease-out-quint zoom-in-75 blur-in-2 fade-in motion-reduce:zoom-in-100 motion-reduce:blur-in-0",
          )}
        />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner
          align="start"
          sideOffset={6}
          className="isolate z-50"
        >
          <Combobox.Popup
            data-slot="icon-picker-content"
            className="flex max-h-(--available-height) w-72 max-w-(--available-width) origin-(--transform-origin) flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-(--custom-shadow-popover) outline-hidden ease-out-quint data-closed:animate-out data-closed:duration-100 data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
          >
            <label className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
              <HugeiconsIcon
                icon={Search01Icon}
                strokeWidth={2}
                className="size-4 shrink-0 text-muted-foreground"
              />
              <Combobox.Input
                aria-label="Search icons"
                placeholder="Search icons…"
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </label>
            <Combobox.Empty>
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                No icons found
              </p>
            </Combobox.Empty>
            <Combobox.List
              aria-label="Icons"
              className="max-h-80 min-h-0 scroll-py-1.5 overflow-y-auto overscroll-contain p-1.5 empty:hidden"
            >
              {(group: CatalogIconGroup) => (
                <Combobox.Group
                  key={group.label}
                  items={group.items}
                  className="not-first:pt-1.5"
                >
                  <Combobox.GroupLabel className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
                    {group.label}
                  </Combobox.GroupLabel>
                  {chunk(group.items, COLUMNS).map((row) => (
                    <Combobox.Row
                      key={row[0].name}
                      className="grid grid-cols-8"
                    >
                      {row.map((icon) => (
                        <IconPickerItem key={icon.name} icon={icon} />
                      ))}
                    </Combobox.Row>
                  ))}
                </Combobox.Group>
              )}
            </Combobox.List>
            <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-t pr-1.5 pl-3">
              <span
                aria-hidden
                className={cn(
                  "truncate text-xs",
                  state.highlighted
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {shown?.label ?? "No icon"}
              </span>
              {selected && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground"
                  onClick={() => {
                    pick(null);
                    setState((s) => ({ ...s, open: false }));
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
};

const IconPickerItem = ({ icon }: { icon: CatalogIcon }) => (
  <Combobox.Item
    value={icon.name}
    aria-label={icon.label}
    data-kubai-trigger
    className={cn(
      "flex aspect-square cursor-default items-center justify-center rounded-lg text-foreground/75 outline-none select-none",
      "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
      "data-selected:bg-primary/10 data-selected:text-primary dark:data-selected:bg-primary/20",
      "data-selected:data-highlighted:bg-primary/15 data-selected:data-highlighted:text-primary dark:data-selected:data-highlighted:bg-primary/25",
      "transition-transform duration-200 ease-out-quint active:scale-90 active:duration-100 motion-reduce:active:scale-100",
    )}
  >
    <CatalogIconPicture icon={icon} trigger="parent" className="size-4.5" />
  </Combobox.Item>
);

function chunk<T>(array: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    rows.push(array.slice(i, i + size));
  }
  return rows;
}
