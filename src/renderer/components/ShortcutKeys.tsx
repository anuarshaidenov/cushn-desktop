import { Fragment, useEffect, useState } from "react";
import {
  isHotkeySequence,
  useAppHotkeyList,
  useAppHotkeys,
  useHotkeyHint,
  type AppHotkey,
  type AppHotkeyId,
  type AppHotkeys,
  type Hotkey,
} from "@tanstack/react-hotkeys";
import { formatHotkeyLabel, hotkeyKeyLabels } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";
import { Kbd, KbdGroup } from "./ui/kbd";

type HotkeyKeysProps = {
  hotkey: Hotkey | null | undefined;
  className?: string;
};

/** One chip per key in the platform's labels (⌘ K on macOS, Ctrl K elsewhere); a sequence reads "G then S". */
export const HotkeyKeys = ({ hotkey, className }: HotkeyKeysProps) => {
  if (!hotkey) return null;

  if (isHotkeySequence(hotkey)) {
    return (
      <span className={cn("inline-flex items-center gap-1", className)}>
        {hotkey.map((step, index) => (
          <Fragment key={index}>
            {index > 0 && (
              <span className="text-[11px] text-muted-foreground">then</span>
            )}
            <KbdGroup>
              {hotkeyKeyLabels(step).map((key, keyIndex) => (
                <Kbd key={keyIndex}>{key}</Kbd>
              ))}
            </KbdGroup>
          </Fragment>
        ))}
      </span>
    );
  }

  return (
    <KbdGroup className={className}>
      {hotkeyKeyLabels(hotkey).map((key, index) => (
        <Kbd key={index}>{key}</Kbd>
      ))}
    </KbdGroup>
  );
};

type ShortcutKeysProps = {
  id: AppHotkeyId;
  className?: string;
};

/** The app hotkey's current binding, the user's rebinding included; nothing while it is unbound. */
export const ShortcutKeys = ({ id, className }: ShortcutKeysProps) => {
  const { hotkey } = useAppHotkeys()[id];
  return <HotkeyKeys hotkey={hotkey} className={className} />;
};

/** The binding as one small chip ("⌘C"), for buttons and toasts; nothing while it is unbound. */
export const ShortcutChip = ({ id, className }: ShortcutKeysProps) => {
  const { hotkey } = useAppHotkeys()[id];
  if (!hotkey) return null;
  return (
    <Kbd
      className={cn("h-4 min-w-4 rounded-full px-1.5 text-[10px]", className)}
    >
      {formatHotkeyLabel(hotkey)}
    </Kbd>
  );
};

/** Held modifiers reveal hints only after this long, so a quick ⌘C or ⌘K doesn't flash every chip. */
const HINT_HOLD_DELAY = 400;

/** Hints fade in and vanish at once on release; opacity only, so it stays under reduced motion. */
export const hotkeyHintFade =
  "transition-opacity duration-150 ease-out-quint starting:opacity-0";

/** `useHotkeyHint`, once the modifiers have been held for a moment. */
export function useDelayedHotkeyHint(
  hotkey: Parameters<typeof useHotkeyHint>[0],
) {
  const held = useHotkeyHint(hotkey);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!held) return;
    const timer = window.setTimeout(() => setRevealed(true), HINT_HOLD_DELAY);
    return () => {
      window.clearTimeout(timer);
      setRevealed(false);
    };
  }, [held]);

  return held && revealed;
}

type HotkeyHintProps = (
  { id: AppHotkeyId; hotkey?: never } | { hotkey: Hotkey; id?: never }
) & { className?: string };

/** Key chips that appear while the hotkey's modifiers are held and the hotkey can fire. */
export const HotkeyHint = ({ id, hotkey, className }: HotkeyHintProps) => {
  const appHotkeys: AppHotkeys = useAppHotkeys();
  const appHotkey: AppHotkey | undefined = id ? appHotkeys[id] : undefined;
  const visible = useDelayedHotkeyHint(appHotkey ?? hotkey);
  if (!visible) return null;
  return (
    <HotkeyKeys
      hotkey={appHotkey ? appHotkey.hotkey : hotkey}
      className={cn(hotkeyHintFade, className)}
    />
  );
};

export type AppHotkeyItem = ReturnType<typeof useAppHotkeyList>[number];

/** App hotkeys grouped by `meta.group`, groups and rows in declaration order. */
export function useAppHotkeyGroups() {
  const list = useAppHotkeyList();
  const groups = new Map<string, AppHotkeyItem[]>();
  for (const item of list) {
    const title = item.appHotkey.meta?.group ?? "Other";
    groups.set(title, [...(groups.get(title) ?? []), item]);
  }
  return [...groups].map(([title, items]) => ({ title, items }));
}

/** `SidebarMenuButton` tooltip, shown even while the sidebar is expanded. */
export const goToTooltip = (page: string, id: AppHotkeyId) => ({
  hidden: false,
  children: (
    <>
      Go to {page} <ShortcutKeys id={id} />
    </>
  ),
});
