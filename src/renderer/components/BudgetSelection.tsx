import {
  createContext,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { HugeiconsIcon } from "@hugeicons/react";
import { CircleArrowRight02Icon } from "@hugeicons/core-free-icons";
import type { BudgetListItem } from "@shared/api";
import type { Id } from "@shared/domain";
import {
  DropdownMenuItem,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { useBudgetActions } from "@/hooks/use-budget-actions";
import {
  MARQUEE_ITEM_ATTRIBUTE,
  useMarqueeSelection,
} from "@/hooks/use-marquee-selection";
import { appHotkeys } from "@/lib/hotkeys";
import {
  createSelectionStore,
  type SelectionStore,
} from "@/lib/selectionStore";
import { cn } from "@/lib/utils";
import { ShortcutKeys } from "./ShortcutKeys";

type BudgetSelectionValue = {
  /** Every listed budget, in list order. */
  budgets: BudgetListItem[];
  /** The selected budgets that are still listed, in list order. */
  selectedBudgets: BudgetListItem[];
  selectedIds: Id<"budgets">[];
  setSelectedIds: (ids: Id<"budgets">[]) => void;
  /** Selects every listed budget, or clears the selection when there is one. */
  toggleAll: () => void;
};

const BudgetSelectionContext = createContext<BudgetSelectionValue | null>(null);
// Stable for the provider's lifetime: cards and rows subscribe to their own id through it.
const BudgetSelectionStoreContext = createContext<SelectionStore<
  Id<"budgets">
> | null>(null);
const MarqueeSelectingContext = createContext(false);

type ProviderProps = {
  budgets: BudgetListItem[];
  children: ReactNode;
};

/** One selection for the budgets grid and list, and the list's keyboard shortcuts. */
export const BudgetSelectionProvider = ({
  budgets,
  children,
}: ProviderProps) => {
  const [store] = useState(() => createSelectionStore<Id<"budgets">>());
  const selected = useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(() => {
    store.setListed(budgets.map((budget) => budget.id));
  }, [store, budgets]);

  const selection = useMemo(() => {
    // Ids that left the list (filters changed, archived elsewhere) drop out here, and from the store on the next change.
    const selectedBudgets = budgets.filter((budget) => selected.has(budget.id));
    const selectedIds = selectedBudgets.map((budget) => budget.id);
    return {
      budgets,
      selectedBudgets,
      selectedIds,
      setSelectedIds: store.set,
      toggleAll: () =>
        store.set(
          selectedIds.length > 0 ? [] : budgets.map((budget) => budget.id),
        ),
    };
  }, [store, budgets, selected]);

  return (
    <BudgetSelectionStoreContext value={store}>
      <BudgetSelectionContext value={selection}>
        <BudgetListHotkeys />
        {children}
      </BudgetSelectionContext>
    </BudgetSelectionStoreContext>
  );
};

// Read when the key is pressed, so cards and rows don't each track hover and register the keys.
const hoveredBudgetId = () =>
  document
    .querySelector(`[${MARQUEE_ITEM_ATTRIBUTE}]:hover`)
    ?.getAttribute(MARQUEE_ITEM_ATTRIBUTE);

/** ⌘A, Esc, and E / ⌘⌫ on the selection, or on the hovered budget when nothing is selected. */
const BudgetListHotkeys = () => {
  const { budgets, selectedBudgets, setSelectedIds, toggleAll } =
    useBudgetSelection();
  const { archive, trash, isPending } = useBudgetActions();
  const hasSelection = selectedBudgets.length > 0;

  const runOnTargets = async (action: typeof archive) => {
    if (hasSelection) {
      if (await action(selectedBudgets)) setSelectedIds([]);
      return;
    }
    const hoveredId = hoveredBudgetId();
    await action(budgets.filter((budget) => budget.id === hoveredId));
  };

  useHotkey(appHotkeys["budgets.selectAll"], toggleAll, { ignoreInputs: true });
  useHotkey(appHotkeys["budgets.clearSelection"], () => setSelectedIds([]), {
    enabled: hasSelection,
    ignoreInputs: true,
  });
  useHotkey(appHotkeys["budgets.archiveHovered"], () => runOnTargets(archive), {
    enabled: !isPending,
    ignoreInputs: true,
  });
  useHotkey(appHotkeys["budgets.trashHovered"], () => runOnTargets(trash), {
    enabled: !isPending,
    ignoreInputs: true,
  });

  return null;
};

export const useBudgetSelection = () => {
  const selection = use(BudgetSelectionContext);
  if (!selection) {
    throw new Error(
      "useBudgetSelection must be used within a BudgetSelectionProvider",
    );
  }
  return selection;
};

/** `null` outside a provider: a View's page shows budget cards without selection. */
export const useOptionalBudgetSelection = () => use(BudgetSelectionContext);

const subscribeNowhere = () => () => {};

/** What a card or row needs from the selection; inert outside a provider. Re-renders only when this id's selected state flips. */
export const useSelectableBudget = (id: Id<"budgets">) => {
  const store = use(BudgetSelectionStoreContext);
  const isSelected = useSyncExternalStore(
    store?.subscribe ?? subscribeNowhere,
    () => store?.has(id) ?? false,
  );
  const isMarqueeSelecting = use(MarqueeSelectingContext);

  return {
    isSelected,
    isMarqueeSelecting,
    toggle: () => store?.toggle(id),
    /** Toggles on ⌘/Ctrl-click and returns `true`, so the caller skips its navigation. */
    toggleOnModifierClick: (event: MouseEvent) => {
      if (!store || !(event.metaKey || event.ctrlKey)) return false;
      // Also keeps a link from opening in a new window.
      event.preventDefault();
      store.toggle(id);
      return true;
    },
  };
};

type MarqueeAreaProps = {
  className?: string;
  children: ReactNode;
};

/** A scroll container where dragging over budgets (their `data-marquee-id` elements) selects them. */
export const BudgetMarqueeArea = ({
  className,
  children,
}: MarqueeAreaProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const { selectedIds, setSelectedIds } = useBudgetSelection();
  const { isSelecting, overlay } = useMarqueeSelection({
    containerRef: ref,
    selected: selectedIds,
    onSelectionChange: setSelectedIds,
  });

  return (
    <div ref={ref} className={cn("relative", className)}>
      <MarqueeSelectingContext value={isSelecting}>
        {children}
      </MarqueeSelectingContext>
      {overlay}
    </div>
  );
};

export const SelectAllItem = () => {
  const { selectedIds, toggleAll } = useBudgetSelection();

  return (
    <DropdownMenuItem
      onClick={(e) => {
        e.stopPropagation();
        toggleAll();
      }}
    >
      <HugeiconsIcon icon={CircleArrowRight02Icon} strokeWidth={2} />
      {selectedIds.length === 0 ? "Select All" : "Deselect All"}
      <DropdownMenuShortcut className="hidden md:flex">
        <ShortcutKeys id="budgets.selectAll" />
      </DropdownMenuShortcut>
    </DropdownMenuItem>
  );
};
