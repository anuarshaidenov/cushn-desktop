import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useNavigate } from "@tanstack/react-router";
import { useActiveBudgets } from "@/data/budgets";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Spinner } from "./ui/spinner";
import { useCommandDialogStore } from "@/stores/useCommandDialogStore";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Archive02Icon,
  Delete02Icon,
  BookOpen02Icon,
  DatabaseBackupIcon,
  Cursor01Icon,
  Home01Icon,
  KeyboardIcon,
  Layers01Icon,
  Moon02Icon,
  Add01Icon,
  RepeatIcon,
  Settings05Icon,
  Sun03Icon,
  Tag01Icon,
  WalletCardsIcon,
} from "@hugeicons/core-free-icons";
import { useTheme } from "./ThemeProvider";
import { useAddBudgetDialogStore } from "@/stores/useAddBudgetDialogStore";
import { useShallow } from "zustand/shallow";
import { BudgetIconGlyph } from "./BudgetIcon";
import { ShortcutKeys } from "./ShortcutKeys";
import { appHotkeys } from "@/lib/hotkeys";
import { useShortcutsDialogStore } from "@/stores/useShortcutsDialogStore";
import { useOnboardingStore } from "@/stores/useOnboardingStore";

// Opened hundreds of times a day from the keyboard, so it appears without animating.
const instantDialog = "data-open:animate-none data-closed:animate-none";

export const Command = () => {
  const { isOpen, openDialog, closeDialog } = useCommandDialogStore(
    useShallow((state) => ({
      isOpen: state.isOpen,
      openDialog: state.openDialog,
      closeDialog: state.closeDialog,
    })),
  );
  const navigate = useNavigate();
  const openAddBudgetDialog = useAddBudgetDialogStore(
    (state) => state.openDialog,
  );

  const openShortcutsDialog = useShortcutsDialogStore(
    (state) => state.openDialog,
  );
  const openOnboarding = useOnboardingStore((state) => state.openDialog);

  useHotkey(appHotkeys["palette.open"], openDialog);

  const budgets = useActiveBudgets({}, { pageSize: 100 });

  if (!budgets) {
    return (
      <CommandDialog
        className={instantDialog}
        open={isOpen}
        onOpenChange={(open) => (open ? openDialog() : closeDialog())}
      >
        <ClosePaletteHotkey />
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <div className="flex h-32 w-full items-center justify-center">
            <Spinner />
          </div>
        </CommandList>
      </CommandDialog>
    );
  }

  return (
    <CommandDialog
      className={instantDialog}
      open={isOpen}
      onOpenChange={(open) => (open ? openDialog() : closeDialog())}
    >
      <ClosePaletteHotkey />
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <Budgets budgets={budgets} />
        <CommandSeparator />
        <CommandGroup heading="General">
          <CommandItem
            onSelect={() => {
              openAddBudgetDialog();
              closeDialog();
            }}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            Create budget
            <span className="sr-only">new create add</span>
            <ShortcutKeys id="budget.create" className="ml-auto" />
          </CommandItem>
          <CommandItem
            onSelect={() => {
              navigate({
                to: "/dashboard/home",
              });
              closeDialog();
            }}
          >
            <HugeiconsIcon icon={Home01Icon} strokeWidth={2} />
            Home
            <ShortcutKeys id="nav.home" className="ml-auto" />
          </CommandItem>
          <CommandItem
            onSelect={() => {
              navigate({
                to: "/dashboard",
              });
              closeDialog();
            }}
          >
            <HugeiconsIcon icon={WalletCardsIcon} strokeWidth={2} />
            Budgets
            <ShortcutKeys id="nav.budgets" className="ml-auto" />
          </CommandItem>
          <CommandItem
            onSelect={() => {
              navigate({
                to: "/dashboard/views",
              });
              closeDialog();
            }}
          >
            <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} />
            Views
            <span className="sr-only">saved views</span>
            <ShortcutKeys id="nav.views" className="ml-auto" />
          </CommandItem>
          <CommandItem
            onSelect={() => {
              closeDialog();
              openShortcutsDialog();
            }}
          >
            <HugeiconsIcon icon={KeyboardIcon} strokeWidth={2} />
            Keyboard shortcuts
            <span className="sr-only">hotkeys keybindings help</span>
            <ShortcutKeys id="help.shortcuts" className="ml-auto" />
          </CommandItem>
          {import.meta.env.DEV && (
            <CommandItem
              onSelect={() => {
                closeDialog();
                openOnboarding();
              }}
            >
              <HugeiconsIcon icon={RepeatIcon} strokeWidth={2} />
              Replay onboarding
              <span className="sr-only">welcome first run intro</span>
            </CommandItem>
          )}
        </CommandGroup>
        <Settings />
      </CommandList>
    </CommandDialog>
  );
};

// Lives inside the dialog: its scope suspends the opener while the palette is open.
const ClosePaletteHotkey = () => {
  const closeDialog = useCommandDialogStore((state) => state.closeDialog);

  // Holding Mod+K repeats into this fresh registration; only a new press closes.
  useHotkey(appHotkeys["palette.open"], (event) => {
    if (!event.repeat) closeDialog();
  });

  return null;
};

const Budgets = ({
  budgets,
}: {
  budgets: {
    results: { id: string; title: string; icon: string | null }[];
  };
}) => {
  const navigate = useNavigate();
  const closeDialog = useCommandDialogStore((state) => state.closeDialog);

  if (!budgets || budgets.results.length === 0) {
    return null;
  }

  return (
    <CommandGroup heading="Budgets">
      {budgets.results.map((budget) => (
        <CommandItem
          onSelect={() => {
            navigate({
              to: "/dashboard/$budgetId",
              params: { budgetId: budget.id },
            });
            closeDialog();
          }}
          key={budget.id}
        >
          <BudgetIconGlyph icon={budget.icon} />
          {budget.title}
        </CommandItem>
      ))}
    </CommandGroup>
  );
};

const Settings = () => {
  const navigate = useNavigate();
  const closeDialog = useCommandDialogStore((state) => state.closeDialog);
  const { theme, setTheme } = useTheme();

  return (
    <CommandGroup heading="Settings">
      <CommandItem
        onSelect={() => {
          navigate({ to: "/settings" });
          closeDialog();
        }}
      >
        <HugeiconsIcon icon={Settings05Icon} strokeWidth={2} />
        Preferences
        <ShortcutKeys id="nav.preferences" className="ml-auto" />
      </CommandItem>
      <CommandItem
        onSelect={() => {
          navigate({ to: "/settings/shortcuts" });
          closeDialog();
        }}
      >
        <HugeiconsIcon icon={KeyboardIcon} strokeWidth={2} />
        Customize shortcuts
        <span className="sr-only">hotkeys keybindings rebind</span>
        <ShortcutKeys id="nav.shortcuts" className="ml-auto" />
      </CommandItem>
      <CommandItem
        onSelect={() => {
          setTheme(theme === "dark" ? "light" : "dark");
        }}
      >
        {theme === "dark" ? (
          <HugeiconsIcon icon={Sun03Icon} strokeWidth={2} />
        ) : (
          <HugeiconsIcon icon={Moon02Icon} strokeWidth={2} />
        )}
        Switch to {theme === "dark" ? "light" : "dark"} mode
        <span className="sr-only">theme</span>
        <ShortcutKeys id="theme.toggle" className="ml-auto" />
      </CommandItem>
      <CommandItem
        onSelect={() => {
          navigate({
            to: "/settings/templates",
          });
          closeDialog();
        }}
      >
        <HugeiconsIcon icon={BookOpen02Icon} strokeWidth={2} />
        Templates
        <ShortcutKeys id="nav.templates" className="ml-auto" />
      </CommandItem>
      <CommandItem
        onSelect={() => {
          navigate({
            to: "/settings/labels",
          });
          closeDialog();
        }}
      >
        <HugeiconsIcon icon={Tag01Icon} strokeWidth={2} />
        Labels
        <ShortcutKeys id="nav.labels" className="ml-auto" />
      </CommandItem>
      <CommandItem
        onSelect={() => {
          navigate({
            to: "/settings/archive",
          });
          closeDialog();
        }}
      >
        <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />
        Archived Budgets
        <ShortcutKeys id="nav.archive" className="ml-auto" />
      </CommandItem>
      <CommandItem
        onSelect={() => {
          navigate({
            to: "/settings/trash",
          });
          closeDialog();
        }}
      >
        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
        Trash
        <ShortcutKeys id="nav.trash" className="ml-auto" />
      </CommandItem>
      <CommandItem
        onSelect={() => {
          navigate({
            to: "/settings/backup",
          });
          closeDialog();
        }}
      >
        <HugeiconsIcon icon={DatabaseBackupIcon} strokeWidth={2} />
        Backup
        <ShortcutKeys id="nav.backup" className="ml-auto" />
      </CommandItem>
      <CommandItem
        onSelect={() => {
          navigate({
            to: "/settings/agents",
          });
          closeDialog();
        }}
      >
        <HugeiconsIcon icon={Cursor01Icon} strokeWidth={2} />
        Agents
        <ShortcutKeys id="nav.agents" className="ml-auto" />
      </CommandItem>
    </CommandGroup>
  );
};
