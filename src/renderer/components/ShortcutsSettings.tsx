import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import {
  areHotkeysEqual,
  normalizeHotkey,
  parseKeyboardEvent,
  simplifyHotkey,
  useCustomHotkeys,
  useHotkeyRecorder,
  type AppHotkeyId,
  type Hotkey,
  type HotkeySequence,
  type RecorderRejection,
} from "@tanstack/react-hotkeys";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { toast } from "./ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import {
  HotkeyKeys,
  useAppHotkeyGroups,
  type AppHotkeyItem,
} from "./ShortcutKeys";
import { formatHotkeyLabel, hotkeyPlatform } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";

type Rejection = { message: string; steps: HotkeySequence };

/** The row whose shortcut is being changed, and why its last attempt was refused. */
type Editing = { id: AppHotkeyId | null; rejection: Rejection | null };

const notEditing: Editing = { id: null, rejection: null };

export const ShortcutsSettings = () => {
  const groups = useAppHotkeyGroups();
  const { customHotkeys, resetCustomHotkeys } = useCustomHotkeys();
  const [editing, setEditing] = useState<Editing>(notEditing);

  return (
    <>
      <div className="mb-10 flex items-start justify-between gap-6">
        <p className="text-sm text-muted-foreground">
          Click a shortcut, then press the new keys. Unassign any single-key
          shortcut you would rather turn off.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={Object.keys(customHotkeys).length === 0}
          onClick={() => {
            resetCustomHotkeys();
            setEditing(notEditing);
            toast.add({ type: "success", title: "Shortcuts reset" });
          }}
        >
          Reset all
        </Button>
      </div>
      {groups.map((group) => (
        <section key={group.title} className="mb-10">
          <h2 className="lg mb-5">{group.title}</h2>
          <Card className="py-0">
            <CardContent className="px-0 py-0">
              <ul className="flex flex-col text-sm">
                {group.items.map((item) => (
                  <ShortcutRow
                    key={item.appHotkey.id}
                    item={item}
                    isEditing={editing.id === item.appHotkey.id}
                    rejection={
                      editing.id === item.appHotkey.id
                        ? editing.rejection
                        : null
                    }
                    onEditingChange={setEditing}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      ))}
    </>
  );
};

const ShortcutRow = ({
  item,
  isEditing,
  rejection,
  onEditingChange,
}: {
  item: AppHotkeyItem;
  isEditing: boolean;
  rejection: Rejection | null;
  onEditingChange: (editing: Editing) => void;
}) => {
  const { appHotkey, isCustom } = item;
  const { id } = appHotkey;
  const { findConflicts, setCustomHotkey, resetCustomHotkey } =
    useCustomHotkeys();
  // What the last recording typed, so pressing the default keys again resets instead of customizing.
  const typedRef = useRef<Hotkey | null>(null);

  const reject = (message: string, steps: HotkeySequence) =>
    onEditingChange({ id, rejection: { message, steps } });

  const recorder = useHotkeyRecorder({
    maxSteps: Infinity,
    idleTimeoutMs: 1200,
    detectConflicts: {
      exclude: (registration) => registration.options.appHotkeyId === id,
    },
    validate: (hotkey, context) => {
      const typed = typedHotkey(
        context.kind === "chord" ? [context.event] : context.events,
      );
      typedRef.current = typed;
      const [conflict] = [
        ...findConflicts(id, hotkey),
        ...findConflicts(id, typed),
      ];
      return conflict ? usedBy(conflict.meta?.name ?? conflict.id) : true;
    },
    onReject: (rejection) =>
      reject(rejectionMessage(rejection), recorder.steps),
    onRecord: (hotkey) => {
      const { defaultHotkey } = appHotkey;
      const typed = typedRef.current;
      if (
        defaultHotkey &&
        typed &&
        areHotkeysEqual(typed, defaultHotkey, hotkeyPlatform)
      ) {
        resetCustomHotkey(id);
        onEditingChange(notEditing);
        return;
      }
      const [conflict] = setCustomHotkey(id, hotkey);
      if (conflict) reject(usedBy(conflict.meta?.name ?? conflict.id), []);
      else onEditingChange(notEditing);
    },
    onClear: () => {
      setCustomHotkey(id, null);
      onEditingChange(notEditing);
    },
    onCancel: () => onEditingChange(notEditing),
  });

  // Starting another row takes over; this one stops without saving.
  const { stopRecording, cancelRecording } = recorder;
  useEffect(() => {
    if (!isEditing) stopRecording();
  }, [isEditing, stopRecording]);

  const { isRecording, steps } = recorder;

  // A click anywhere else gives the recording up, like leaving a text field.
  const rowRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!isRecording) return;
    const cancelOutside = (event: PointerEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) cancelRecording();
    };
    document.addEventListener("pointerdown", cancelOutside);
    return () => document.removeEventListener("pointerdown", cancelOutside);
  }, [isRecording, cancelRecording]);

  // A refused recording keeps its steps; the message stays until they change.
  const message =
    rejection && (!isRecording || rejection.steps === steps)
      ? rejection.message
      : null;

  const name = appHotkey.meta?.name ?? id;
  const noteId = useId();
  // Reset and Unassign remove themselves, so focus moves to the field instead of the page.
  const fieldRef = useRef<HTMLButtonElement>(null);
  const binding = isRecording
    ? steps.length > 0
      ? simplifyHotkey(steps)
      : null
    : appHotkey.hotkey;

  return (
    <li
      ref={rowRef}
      className="group flex items-start gap-4 border-b px-4 py-2.5 last:border-b-0"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-h-7 items-center">{name}</span>
        <Note id={noteId}>
          {message ? (
            <span className="text-destructive">{message}</span>
          ) : isRecording ? (
            <span className="text-muted-foreground">
              <HotkeyKeys hotkey="Enter" /> to save,{" "}
              <HotkeyKeys hotkey="Escape" /> to cancel,{" "}
              <HotkeyKeys hotkey="Backspace" /> to clear
            </span>
          ) : null}
        </Note>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!isRecording && isCustom && (
          <Tooltip>
            <TooltipTrigger
              delay={600}
              render={
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label={`Reset ${name}`}
                  onClick={() => {
                    fieldRef.current?.focus();
                    resetCustomHotkey(id);
                    onEditingChange(notEditing);
                  }}
                />
              }
            >
              Reset
            </TooltipTrigger>
            <TooltipContent>
              {appHotkey.defaultHotkey ? (
                <>
                  Back to <HotkeyKeys hotkey={appHotkey.defaultHotkey} />
                </>
              ) : (
                "Back to unassigned"
              )}
            </TooltipContent>
          </Tooltip>
        )}
        <Button
          ref={fieldRef}
          variant={isRecording ? "outline" : "ghost"}
          size="sm"
          aria-label={`${name} shortcut: ${
            isRecording
              ? "recording"
              : appHotkey.hotkey
                ? formatHotkeyLabel(appHotkey.hotkey)
                : "unassigned"
          }`}
          aria-invalid={message ? true : undefined}
          aria-describedby={noteId}
          className={cn(
            // Corners concentric with the key chips: 10px outside, 4px inset, 6px chips.
            "min-w-28 justify-end rounded-lg px-1",
            // The ring and invalid hairline change on key presses, so they switch without a fade.
            "transition-[transform,background-color,color]",
            "[&_[data-slot=kbd]]:bg-card [&_[data-slot=kbd]]:text-foreground [&_[data-slot=kbd]]:shadow-(--custom-shadow-control) dark:[&_[data-slot=kbd]]:bg-muted",
            isRecording && "ring-[3px] ring-ring/50 focus-visible:ring-[3px]",
            "aria-invalid:shadow-(--custom-shadow-control-invalid)",
          )}
          onClick={(event) => {
            if (isRecording) {
              // The second click of a double-click would undo the first.
              if (event.detail < 2) cancelRecording();
            } else {
              onEditingChange({ id, rejection: null });
              recorder.startRecording();
            }
          }}
        >
          {binding ? (
            <HotkeyKeys hotkey={binding} />
          ) : (
            <span className="px-1.5 text-xs font-normal text-muted-foreground">
              {isRecording ? "Press keys…" : "Unassigned"}
            </span>
          )}
        </Button>
        <span className="flex size-6 shrink-0 items-center justify-center">
          {!isRecording && appHotkey.hotkey && (
            <Tooltip>
              <TooltipTrigger
                delay={600}
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Unassign ${name}`}
                    className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                    onClick={() => {
                      fieldRef.current?.focus();
                      setCustomHotkey(id, null);
                      onEditingChange(notEditing);
                    }}
                  />
                }
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </TooltipTrigger>
              <TooltipContent>Unassign</TooltipContent>
            </Tooltip>
          )}
        </span>
      </div>
    </li>
  );
};

/**
 * Unfolds so the rows below slide down instead of jumping, unless the keyboard opened it; folds at
 * once. One line height for the hint's key chips and the plain error, so swapping them holds still.
 */
const Note = ({ id, children }: { id: string; children: ReactNode }) => (
  <div
    id={id}
    aria-live="polite"
    className={cn(
      "grid text-xs leading-5",
      children
        ? "grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity] duration-200 ease-out-quint group-has-focus-visible:transition-none motion-reduce:transition-opacity"
        : "grid-rows-[0fr] opacity-0",
    )}
  >
    <div className="min-h-0 overflow-hidden">{children}</div>
  </div>
);

const usedBy = (name: string) => `Already used by “${name}”`;

function rejectionMessage(rejection: RecorderRejection): string {
  const name = rejection.conflicts?.[0]?.registration.options.meta?.name;
  return name ? usedBy(name) : rejection.message;
}

// The recorder saves key positions (`[KeyH]`), which conflict checks never match to the catalog's
// typed keys (`H`), so a recording is also checked as the keys it typed.
function typedHotkey(events: ReadonlyArray<KeyboardEvent>): Hotkey {
  const steps = events.map((event) => {
    const chord = parseKeyboardEvent(event, hotkeyPlatform);
    const key = chord.key ?? "";
    // `?` already says Shift typed it; letters and named keys keep theirs.
    const shift = chord.shift && (key.length > 1 || /\p{Letter}/u.test(key));
    return normalizeHotkey({ ...chord, shift }, hotkeyPlatform);
  });
  return simplifyHotkey(steps);
}
