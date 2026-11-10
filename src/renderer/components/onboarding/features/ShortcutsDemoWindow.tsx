import { Fragment } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Add01Icon,
  Archive02Icon,
  BookOpen02Icon,
  Cancel01Icon,
  Delete02Icon,
  Grid3x3Icon,
  Home01Icon,
  KeyboardIcon,
  Layers01Icon,
  ListFilterIcon,
  ListIcon,
  MoreVerticalCircle01Icon,
  Search01Icon,
  Settings05Icon,
  SidebarLeftIcon,
  Sun03Icon,
  Tag01Icon,
  WalletCardsIcon,
} from "@hugeicons/core-free-icons";
import { isHotkeySequence, type Hotkey } from "@tanstack/react-hotkeys";
import { BudgetIconGlyph } from "@/components/BudgetIcon";
import { HotkeyKeys } from "@/components/ShortcutKeys";
import { buttonVariants } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { appHotkeys, hotkeyKeyLabels } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";

/*
  The Budgets grid under the ⌘K palette, from the landing's PaletteAppHtml.
  Its sm:/md: are container queries on the window, and the `dark:` classes
  that show at rest follow the window's data-theme, not the modal's `.dark`.
*/

export const QUERY = "light";

// cmdk's filter in spirit: every typed letter, in order, somewhere in the value.
export const matches = (value: string, text: string) => {
  let at = 0;
  const hay = value.toLowerCase();
  for (const ch of text.toLowerCase()) {
    at = hay.indexOf(ch, at) + 1;
    if (!at) return false;
  }
  return true;
};

// prettier-ignore
const budgets = [
  { name: "Home office", icon: "home", date: "Oct 31, 2026", amount: "1 500 $", template: "75/10/15", label: "Yearly", color: "rgb(16, 185, 129)" },
  { name: "Tokyo trip", icon: "flights", date: "Oct 31, 2026", amount: "320 000 ¥", template: "Travel", label: "One-time", color: "rgb(139, 92, 246)" },
  { name: "September budget", icon: "calendar", date: "Oct 31, 2026", amount: "4 800 $", template: "50/30/20", label: "Monthly", color: "rgb(249, 115, 22)" },
  { name: "October budget", icon: "calendar", date: "Oct 24, 2026", amount: "5 000 $", template: "50/30/20", label: "Monthly", color: "rgb(249, 115, 22)" },
  { name: "Freelance income", icon: "work", date: "Oct 10, 2026", amount: "2 400 $", template: "75/10/15", label: "Monthly", color: "rgb(249, 115, 22)" },
  { name: "Lisbon trip", icon: "luggage", date: "Oct 1, 2026", amount: "2 000 €", template: "Travel", label: "One-time", color: "rgb(139, 92, 246)" },
  { name: "August budget", icon: "calendar", date: "Sep 28, 2026", amount: "4 600 $", template: "50/30/20", label: "Monthly", color: "rgb(249, 115, 22)" },
  { name: "July budget", icon: "calendar", date: "Aug 30, 2026", amount: "4 600 $", template: "50/30/20", label: "Monthly", color: "rgb(249, 115, 22)" },
];

type Command = {
  label: string;
  /** A budget's icon name, or an interface glyph. */
  icon: string | IconSvgElement;
  keywords?: string;
  /** The declared default, which the demo's story presses. */
  hotkey?: Hotkey;
};

// The app's list, less Backup and Agents, which sit past the list's foot.
// prettier-ignore
const groups: { heading: string; commands: Command[] }[] = [
  {
    heading: "Budgets",
    commands: budgets.map((b) => ({ label: b.name, icon: b.icon })),
  },
  {
    heading: "General",
    commands: [
      { label: "Create budget", icon: Add01Icon, keywords: "new create add", hotkey: appHotkeys["budget.create"].defaultHotkey },
      { label: "Home", icon: Home01Icon, hotkey: appHotkeys["nav.home"].defaultHotkey },
      { label: "Budgets", icon: WalletCardsIcon, hotkey: appHotkeys["nav.budgets"].defaultHotkey },
      { label: "Views", icon: Layers01Icon, keywords: "saved views", hotkey: appHotkeys["nav.views"].defaultHotkey },
      { label: "Keyboard shortcuts", icon: KeyboardIcon, keywords: "hotkeys keybindings help", hotkey: appHotkeys["help.shortcuts"].defaultHotkey },
    ],
  },
  {
    heading: "Settings",
    commands: [
      { label: "Preferences", icon: Settings05Icon, hotkey: appHotkeys["nav.preferences"].defaultHotkey },
      { label: "Switch to light mode", icon: Sun03Icon, keywords: "theme", hotkey: appHotkeys["theme.toggle"].defaultHotkey },
      { label: "Templates", icon: BookOpen02Icon, hotkey: appHotkeys["nav.templates"].defaultHotkey },
      { label: "Labels", icon: Tag01Icon, hotkey: appHotkeys["nav.labels"].defaultHotkey },
      { label: "Archived Budgets", icon: Archive02Icon, hotkey: appHotkeys["nav.archive"].defaultHotkey },
      { label: "Trash", icon: Delete02Icon, hotkey: appHotkeys["nav.trash"].defaultHotkey },
    ],
  },
];

const keysText = (hotkey: Hotkey) =>
  isHotkeySequence(hotkey)
    ? hotkey.map((step) => hotkeyKeyLabels(step).join("")).join("then")
    : hotkeyKeyLabels(hotkey).join("");

// cmdk's value is the row's text: its label, sr-only keywords and keys.
const valueOf = (c: Command) =>
  c.label + (c.keywords ?? "") + (c.hotkey ? keysText(c.hotkey) : "");

const commands = groups.flatMap((g) => g.commands);
const found = commands.find((c) => matches(valueOf(c), QUERY));

const darkInput = "[.dark_.sc-window:not([data-theme=light])_&]:bg-input/30";
const item =
  "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-hidden select-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";
const group =
  "text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium";

/** `still`: the palette open with QUERY typed, filtered and highlighted. */
export const ShortcutsDemoWindow = ({ still }: { still: boolean }) => {
  const selected = still ? found : commands[0];
  return (
    <div className="sc-window relative h-full rounded-xl after:pointer-events-none after:absolute after:inset-0 after:rounded-xl after:shadow-(--custom-shadow-chrome)">
      <div className="@container pointer-events-none relative h-full overflow-hidden rounded-xl select-none">
        <div className="absolute top-[22px] left-[18px] z-20 flex gap-2">
          <span className="size-3 rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.2)]" />
          <span className="size-3 rounded-full bg-[#febc2e] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.2)]" />
          <span className="size-3 rounded-full bg-[#28c840] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.2)]" />
        </div>
        <div className="flex h-full w-full bg-sidebar p-1">
          <div className="relative h-full min-w-0 flex-1 overflow-hidden rounded-xl bg-background shadow-(--custom-shadow-raised)">
            <div className="flex h-full flex-col">
              <header className="sticky top-0 z-10 flex h-12 items-center rounded-t-xl border-b bg-background px-4 py-2 pl-20">
                <div
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "icon" }),
                    "relative mr-2 size-7 after:absolute after:-inset-0.5",
                  )}
                >
                  <HugeiconsIcon icon={SidebarLeftIcon} strokeWidth={2} />
                </div>
                <div className="flex w-full min-w-0 items-center justify-between">
                  <div className="flex flex-1 items-center justify-between gap-4 @min-[480px]:justify-start">
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "xs" }),
                        )}
                      >
                        <HugeiconsIcon icon={ListFilterIcon} strokeWidth={2} />
                        Filter
                      </div>
                    </div>
                    <ButtonGroup>
                      <div
                        className={cn(
                          buttonVariants({ variant: "secondary", size: "xs" }),
                          "@max-[480px]:pr-1.5",
                        )}
                      >
                        <HugeiconsIcon icon={Grid3x3Icon} strokeWidth={2} />
                        <span className="hidden @min-[480px]:block">
                          Grid view
                        </span>
                      </div>
                      <div
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "xs" }),
                          "@max-[480px]:pr-1.5",
                        )}
                      >
                        <HugeiconsIcon icon={ListIcon} strokeWidth={2} />
                        <span className="hidden @min-[480px]:block">
                          List view
                        </span>
                      </div>
                    </ButtonGroup>
                  </div>
                  <div
                    className={cn(
                      "group/input-group relative hidden h-6 w-full max-w-38 min-w-0 items-center rounded-full text-xs shadow-(--custom-shadow-control) outline-none @min-[480px]:flex",
                      darkInput,
                    )}
                  >
                    <div className="h-6 w-full min-w-0 flex-1 content-center truncate rounded-none bg-transparent px-2 py-1 text-xs text-muted-foreground">
                      Search...
                    </div>
                    <div className="order-first flex h-auto items-center justify-center gap-2 py-1.5 pl-1.5 text-sm font-medium text-muted-foreground select-none">
                      <HugeiconsIcon
                        icon={Search01Icon}
                        strokeWidth={2}
                        className="size-4"
                      />
                    </div>
                  </div>
                </div>
              </header>
              <div className="mx-auto h-full w-full flex-1 overflow-hidden p-4 pb-20 @min-[480px]:p-10 @min-[480px]:pt-6">
                <div className="grid gap-4 pb-10 @min-[480px]:grid-cols-2">
                  {budgets.map((b) => (
                    <div key={b.name} className="group relative h-full">
                      <Card className="h-full gap-3 p-4">
                        <CardHeader className="px-0">
                          <CardTitle className="flex min-w-0 items-center gap-2 text-sm leading-loose">
                            <BudgetIconGlyph icon={b.icon} />
                            <span className="truncate">{b.name}</span>
                          </CardTitle>
                          <CardDescription className="px-0 text-xs">
                            {b.date}
                          </CardDescription>
                          <CardAction className="relative z-10 mt-1">
                            <div className="inline-flex size-5 shrink-0 items-center justify-center rounded-full [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 [&_svg:not([class*='text-'])]:text-muted-foreground">
                              <HugeiconsIcon
                                icon={MoreVerticalCircle01Icon}
                                strokeWidth={2}
                              />
                            </div>
                          </CardAction>
                        </CardHeader>
                        <CardFooter className="px-0">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {b.amount}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {b.template}
                            </span>
                            <div className="relative z-10">
                              <div
                                className={cn(
                                  "relative flex h-5 w-[100px] items-center gap-2 rounded-full bg-transparent px-2 py-1 text-xs whitespace-nowrap shadow-(--custom-shadow-control)",
                                  darkInput,
                                )}
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  <span
                                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                                    style={{ backgroundColor: b.color }}
                                  />
                                  <span className="truncate">{b.label}</span>
                                </span>
                              </div>
                            </div>
                          </div>
                        </CardFooter>
                      </Card>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          data-scrim=""
          hidden={!still}
          className="absolute inset-0 z-10 bg-black/50"
        />
        {/* Pinned by its top, so it doesn't jump as the list shortens, and high, so the keycaps fit under its full list. */}
        <div
          data-palette=""
          hidden={!still}
          className="absolute top-18 left-1/2 z-10 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 gap-4 overflow-hidden rounded-xl bg-popover p-0 text-popover-foreground shadow-(--custom-shadow-overlay) outline-none @min-[480px]:max-w-lg"
        >
          <div
            cmdk-root=""
            className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:rounded-sm [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3"
          >
            <div className="flex h-12 items-center gap-2 border-b px-4">
              <HugeiconsIcon
                icon={Search01Icon}
                strokeWidth={2}
                className="size-4 shrink-0 opacity-50"
              />
              <div
                cmdk-input=""
                className="flex h-10 w-full items-center rounded-full bg-transparent py-3 text-sm whitespace-pre outline-hidden"
              >
                <span data-query="">{still ? QUERY : ""}</span>
                {!still && <span className="sc-caret" />}
                <span
                  data-placeholder=""
                  hidden={still}
                  className="text-muted-foreground"
                >
                  Type a command or search...
                </span>
              </div>
            </div>
            <div cmdk-list="" className="max-h-[300px] overflow-hidden">
              {groups.map((g, i) => {
                const shown = g.commands.filter(
                  (c) => !still || matches(valueOf(c), QUERY),
                );
                return (
                  <Fragment key={g.heading}>
                    {i === 1 && (
                      <div
                        cmdk-separator=""
                        hidden={still}
                        className="-mx-1 h-px bg-border"
                      />
                    )}
                    <div cmdk-group="" hidden={!shown.length} className={group}>
                      <div cmdk-group-heading="">{g.heading}</div>
                      {g.commands.map((c) => (
                        <div
                          key={c.label}
                          cmdk-item=""
                          data-slot="command-item"
                          data-value={valueOf(c)}
                          data-selected={String(c === selected)}
                          hidden={!shown.includes(c)}
                          className={item}
                        >
                          {typeof c.icon === "string" ? (
                            <BudgetIconGlyph icon={c.icon} />
                          ) : (
                            <HugeiconsIcon icon={c.icon} strokeWidth={2} />
                          )}
                          {c.label}
                          {c.hotkey && (
                            <HotkeyKeys hotkey={c.hotkey} className="ml-auto" />
                          )}
                        </div>
                      ))}
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </div>
          <div className="absolute top-4 right-4 rounded-full opacity-70 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </div>
        </div>
      </div>
    </div>
  );
};
