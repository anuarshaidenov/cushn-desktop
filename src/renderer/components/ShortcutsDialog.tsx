import type { ReactNode } from "react";
import { useAppHotkeys, useHotkey } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";
import { useShallow } from "zustand/shallow";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import {
  HotkeyKeys,
  ShortcutKeys,
  useAppHotkeyGroups,
  type AppHotkeyItem,
} from "./ShortcutKeys";
import { appHotkeys } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";
import { useShortcutsDialogStore } from "@/stores/useShortcutsDialogStore";

// Also opens the list from text fields, where `?` types a character.
const typingHotkey = "Mod+/";

// Shortcuts outside the catalog: Escape is a fallback listener, favorite views are plain bindings.
const extraRows: Record<string, ReactNode> = {
  General: (
    <Row name="Go back a level">
      <HotkeyKeys hotkey="Escape" />
    </Row>
  ),
  "Go to": (
    <Row name="Open favorite view 1–9">
      <span className="inline-flex items-center gap-1">
        <HotkeyKeys hotkey="Mod+[Digit1]" />
        <span className="text-[11px] text-muted-foreground">–</span>
        <HotkeyKeys hotkey="Mod+[Digit9]" />
      </span>
    </Row>
  ),
};

export const ShortcutsDialog = () => {
  const { isOpen, openDialog, closeDialog } = useShortcutsDialogStore(
    useShallow((state) => ({
      isOpen: state.isOpen,
      openDialog: state.openDialog,
      closeDialog: state.closeDialog,
    })),
  );
  const navigate = useNavigate();
  const groups = useAppHotkeyGroups();
  const helpHotkey = useAppHotkeys()["help.shortcuts"].hotkey;

  useHotkey(appHotkeys["help.shortcuts"], openDialog);
  useHotkey(typingHotkey, openDialog, {
    meta: { name: "Keyboard shortcuts" },
  });

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => (open ? openDialog() : closeDialog())}
    >
      {/* Opened from the keyboard, so it appears at once. */}
      <DialogContent className="gap-0 p-0 data-closed:animate-none data-open:animate-none sm:max-w-2xl">
        <CloseShortcutsHotkeys />
        <DialogHeader className="border-b px-6 pt-5 pb-4">
          <DialogTitle className="text-base">Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            {helpHotkey ? (
              <>
                Press <ShortcutKeys id="help.shortcuts" /> anywhere, or{" "}
                <HotkeyKeys hotkey={typingHotkey} /> while typing, to open this
                list.
              </>
            ) : (
              <>
                Press <HotkeyKeys hotkey={typingHotkey} /> to open this list.
              </>
            )}{" "}
            <Button
              variant="link"
              className="h-auto p-0 align-baseline font-normal"
              onClick={() => {
                closeDialog();
                navigate({ to: "/settings/shortcuts" });
              }}
            >
              Customize
            </Button>
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[min(70vh,36rem)] gap-x-10 overflow-y-auto px-6 py-5 sm:columns-2">
          {groups.map((group) => (
            <section
              key={group.title}
              className="mb-6 break-inside-avoid last:mb-0"
            >
              <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">
                {group.title}
              </h3>
              <ul>
                {group.items.map((item) => (
                  <AppHotkeyRow key={item.appHotkey.id} item={item} />
                ))}
                {extraRows[group.title]}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Inside the dialog's scope, so the keys that opened the list also close it.
const CloseShortcutsHotkeys = () => {
  const closeDialog = useShortcutsDialogStore((state) => state.closeDialog);
  // A held key repeats into these fresh registrations; only a new press closes.
  const close = (event: KeyboardEvent) => {
    if (!event.repeat) closeDialog();
  };

  useHotkey(appHotkeys["help.shortcuts"], close);
  useHotkey(typingHotkey, close, { meta: { name: "Keyboard shortcuts" } });

  return null;
};

const AppHotkeyRow = ({ item }: { item: AppHotkeyItem }) => {
  const { appHotkey, status, isCustom } = item;
  // Nothing on this page registers it, such as budget shortcuts in Settings.
  const unavailable = status === "inactive";

  return (
    <Row
      name={appHotkey.meta?.name ?? appHotkey.id}
      muted={unavailable}
      title={unavailable ? "Not available on this page" : undefined}
    >
      <span className="flex shrink-0 items-center gap-2">
        {isCustom && (
          <span className="text-[11px] text-muted-foreground">Custom</span>
        )}
        {appHotkey.hotkey ? (
          <HotkeyKeys hotkey={appHotkey.hotkey} />
        ) : (
          <span className="text-xs text-muted-foreground">Unassigned</span>
        )}
      </span>
    </Row>
  );
};

function Row({
  name,
  muted,
  title,
  children,
}: {
  name: string;
  muted?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <li
      title={title}
      className="flex items-center justify-between gap-4 py-1.5 text-sm"
    >
      <span className={cn(muted && "text-muted-foreground")}>{name}</span>
      {children}
    </li>
  );
}
