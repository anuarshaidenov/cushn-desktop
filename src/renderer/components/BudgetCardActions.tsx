import { HugeiconsIcon } from "@hugeicons/react";
import {
  MoreVerticalCircle01Icon,
  Archive02Icon,
  Delete01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "./ui/context-menu";
import type { Id } from "@shared/domain";
import { useBudgetActions } from "@/hooks/use-budget-actions";
import { Spinner } from "./ui/spinner";
import { ShortcutKeys } from "./ShortcutKeys";
import { SelectAllItem, useOptionalBudgetSelection } from "./BudgetSelection";
import {
  BudgetMenuActionProvider,
  DuplicateItem,
  ExportItem,
  MoveToViewItem,
  useMenuAction,
} from "./BudgetMenuItems";
import type { ComponentProps, ReactNode } from "react";

type Budget = {
  id: Id<"budgets">;
  createdAt: number;
  templateId: Id<"templates"> | null;
  income: number;
  title: string;
  description?: string | null;
  currency: string;
  viewId: Id<"budgetViews"> | null;
};

type ContextMenuProps = ComponentProps<typeof ContextMenuTrigger> & {
  budget: Budget;
  children: ReactNode;
};

/** The card's right-click menu around its trigger. It provides the pending state both menus share. */
export const BudgetCardContextMenu = ({
  budget,
  children,
  ...triggerProps
}: ContextMenuProps) => {
  return (
    <BudgetMenuActionProvider>
      <BudgetCardContextMenuContent budget={budget} {...triggerProps}>
        {children}
      </BudgetCardContextMenuContent>
    </BudgetMenuActionProvider>
  );
};

const BudgetCardContextMenuContent = ({
  budget,
  children,
  ...triggerProps
}: ContextMenuProps) => {
  const { isPending } = useMenuAction();

  return (
    <ContextMenu disabled={isPending}>
      <ContextMenuTrigger {...triggerProps}>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <BudgetCardMenuItems budget={budget} />
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const BudgetCardActions = (props: { budget: Budget }) => {
  const { isPending } = useMenuAction();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            disabled={isPending}
            onClick={(e) => {
              e.stopPropagation();
            }}
            variant={"ghost"}
            className="size-5 after:-inset-1.5 data-popup-open:bg-accent"
            size={"icon-xs"}
          />
        }
      >
        {isPending ? (
          <Spinner />
        ) : (
          <HugeiconsIcon icon={MoreVerticalCircle01Icon} strokeWidth={2} />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right">
        <BudgetCardMenuItems budget={props.budget} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const BudgetCardMenuItems = (props: { budget: Budget }) => {
  const selection = useOptionalBudgetSelection();
  const hasSelection = (selection?.selectedIds.length ?? 0) > 0;

  return (
    <>
      {selection && <SelectAllItem />}
      {!hasSelection && (
        <>
          <DuplicateItem budgetId={props.budget.id} />
          <ExportItem budgetId={props.budget.id} />
          <MoveToViewItem
            budgetId={props.budget.id}
            viewId={props.budget.viewId}
          />
        </>
      )}
      <DropdownMenuSeparator />
      <StatusItems budget={props.budget} />
    </>
  );
};

/** Archive and Delete (to the trash) for this budget, or for the selection when there is one; both undoable from their toast or ⌘Z. */
const StatusItems = (props: { budget: Budget }) => {
  const { run } = useMenuAction();
  const selection = useOptionalBudgetSelection();
  const { archive, trash, isPending } = useBudgetActions();
  const selected = selection?.selectedBudgets ?? [];
  const targets = selected.length > 0 ? selected : [props.budget];
  const count = selected.length > 0 ? ` selected (${selected.length})` : "";

  const runOnTargets = (action: typeof archive) =>
    run(async () => {
      if (await action(targets)) selection?.setSelectedIds([]);
    });

  return (
    <>
      <DropdownMenuItem
        onClick={(e) => {
          e.stopPropagation();
          runOnTargets(archive);
        }}
        disabled={isPending}
      >
        <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />
        Archive{count}
        <DropdownMenuShortcut className="hidden md:flex">
          <ShortcutKeys id="budgets.archiveHovered" />
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        onClick={(e) => {
          e.stopPropagation();
          runOnTargets(trash);
        }}
        disabled={isPending}
      >
        <HugeiconsIcon icon={Delete01Icon} strokeWidth={2} />
        Delete{count}
        <DropdownMenuShortcut className="hidden md:flex">
          <ShortcutKeys id="budgets.trashHovered" />
        </DropdownMenuShortcut>
      </DropdownMenuItem>
    </>
  );
};
