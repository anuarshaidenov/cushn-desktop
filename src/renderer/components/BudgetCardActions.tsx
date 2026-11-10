import { HugeiconsIcon } from "@hugeicons/react";
import {
  Tick02Icon,
  CopyPlusIcon,
  MoreVerticalCircle01Icon,
  FileDownIcon,
  Add01Icon,
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "./ui/context-menu";
import type { Id } from "@shared/domain";
import { toast } from "@/components/ui/toast";
import { useBudgetActions } from "@/hooks/use-budget-actions";
import { useBudgetMarkdownExport } from "@/hooks/useBudgetMarkdownExport";
import { Spinner } from "./ui/spinner";
import { Link } from "@tanstack/react-router";
import { useDuplicateBudget, useSetBudgetView } from "@/data/budgets";
import { useViews } from "@/data/views";
import { ShortcutKeys } from "./ShortcutKeys";
import { SelectAllItem, useOptionalBudgetSelection } from "./BudgetSelection";
import {
  createContext,
  use,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";

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

type MenuAction = {
  isPending: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
};

const MenuActionContext = createContext<MenuAction | null>(null);

const useMenuAction = () => {
  const menuAction = use(MenuActionContext);
  if (!menuAction) {
    throw new Error(
      "useMenuAction must be used within a BudgetCardContextMenu",
    );
  }
  return menuAction;
};

type ContextMenuProps = ComponentProps<typeof ContextMenuTrigger> & {
  budget: Budget;
  children: ReactNode;
};

/**
 * The card's right-click menu around its trigger. It holds the pending state both menus share:
 * items unmount on click, before their action settles.
 */
export const BudgetCardContextMenu = ({
  budget,
  children,
  ...triggerProps
}: ContextMenuProps) => {
  const [isPending, setIsPending] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    setIsPending(true);
    try {
      await action();
    } finally {
      setIsPending(false);
    }
  };

  return (
    <MenuActionContext value={{ isPending, run }}>
      <ContextMenu disabled={isPending}>
        <ContextMenuTrigger {...triggerProps}>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <BudgetCardMenuItems budget={budget} />
        </ContextMenuContent>
      </ContextMenu>
    </MenuActionContext>
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

const MoveToViewItem = (props: {
  budgetId: Id<"budgets">;
  viewId: Id<"budgetViews"> | null;
}) => {
  const { run } = useMenuAction();
  const { data: viewsData } = useViews();
  // `mutateAsync`: the menu unmounts its items on click, which skips per-call `mutate` callbacks.
  const { mutateAsync, isPending, variables } = useSetBudgetView();

  const moveToView = async (viewId: Id<"budgetViews">) => {
    try {
      await mutateAsync({ budgetId: props.budgetId, viewId });
      toast.add({ type: "success", title: "Budget moved to view" });
    } catch (error) {
      console.error(error);
      toast.add({ type: "error", title: "Failed to move budget" });
    }
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        Move to view
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        sideOffset={4}
        alignOffset={-4}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {viewsData === undefined ? (
          <DropdownMenuItem disabled>
            <Spinner />
            Loading views…
          </DropdownMenuItem>
        ) : viewsData.views.length === 0 ? (
          <DropdownMenuItem render={<Link to="/dashboard/views" />}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            Create new view
          </DropdownMenuItem>
        ) : (
          viewsData.views.map((view) => (
            <DropdownMenuItem
              key={view.id}
              disabled={isPending || props.viewId === view.id}
              onClick={(e) => {
                e.stopPropagation();
                run(() => moveToView(view.id));
              }}
            >
              {isPending && variables?.viewId === view.id ? <Spinner /> : null}
              {view.title}
              {props.viewId === view.id ? (
                <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
              ) : null}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
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

const DuplicateItem = (props: { budgetId: Id<"budgets"> }) => {
  const { run } = useMenuAction();
  const { mutateAsync, isPending } = useDuplicateBudget();

  const handleDuplicate = async () => {
    try {
      await mutateAsync({ budgetId: props.budgetId });
      toast.add({ type: "success", title: "Budget duplicated" });
    } catch (error) {
      console.error(error);
      toast.add({ type: "error", title: "Failed to duplicate budget" });
    }
  };

  return (
    <DropdownMenuItem
      onClick={(e) => {
        e.stopPropagation();
        run(handleDuplicate);
      }}
      disabled={isPending}
    >
      {isPending ? (
        <Spinner />
      ) : (
        <>
          <HugeiconsIcon icon={CopyPlusIcon} strokeWidth={2} />
        </>
      )}{" "}
      Duplicate
    </DropdownMenuItem>
  );
};

const ExportItem = (props: { budgetId: Id<"budgets"> }) => {
  const { run } = useMenuAction();
  const { exportMarkdown, isPending } = useBudgetMarkdownExport(props.budgetId);

  return (
    <DropdownMenuItem
      onClick={(e) => {
        e.stopPropagation();
        run(exportMarkdown);
      }}
      disabled={isPending}
    >
      {isPending ? (
        <Spinner />
      ) : (
        <HugeiconsIcon icon={FileDownIcon} strokeWidth={2} />
      )}{" "}
      Export as .md
    </DropdownMenuItem>
  );
};
