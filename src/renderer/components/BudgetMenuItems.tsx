import { HugeiconsIcon } from "@hugeicons/react";
import {
  Tick02Icon,
  CopyPlusIcon,
  FileDownIcon,
  Add01Icon,
  Layers01Icon,
} from "@hugeicons/core-free-icons";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import type { Id } from "@shared/domain";
import { toast } from "@/components/ui/toast";
import { useBudgetMarkdownExport } from "@/hooks/useBudgetMarkdownExport";
import { Spinner } from "./ui/spinner";
import { Link } from "@tanstack/react-router";
import { useDuplicateBudget, useSetBudgetView } from "@/data/budgets";
import { useViews } from "@/data/views";
import { createContext, use, useState, type ReactNode } from "react";

type MenuAction = {
  isPending: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
};

const MenuActionContext = createContext<MenuAction | null>(null);

export const useMenuAction = () => {
  const menuAction = use(MenuActionContext);
  if (!menuAction) {
    throw new Error(
      "useMenuAction must be used within a BudgetMenuActionProvider",
    );
  }
  return menuAction;
};

/** Holds the pending state a budget menu shares: items unmount on click, before their action settles. */
export const BudgetMenuActionProvider = (props: { children: ReactNode }) => {
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
      {props.children}
    </MenuActionContext>
  );
};

export const MoveToViewItem = (props: {
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
        <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} />
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

export const DuplicateItem = (props: { budgetId: Id<"budgets"> }) => {
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

export const ExportItem = (props: { budgetId: Id<"budgets"> }) => {
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
