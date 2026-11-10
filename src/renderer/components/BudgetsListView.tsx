import { useRouter } from "@tanstack/react-router";
import { Spinner } from "./ui/spinner";
import type { Id } from "@shared/domain";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CopyPlusIcon,
  MoreVerticalCircle01Icon,
  Archive02Icon,
  Delete01Icon,
} from "@hugeicons/core-free-icons";
import { cn, formatNumberWithSpaces } from "@/lib/utils";
import { BudgetLabel } from "./BudgetLabel";
import { BudgetIconGlyph } from "./BudgetIcon";
import { Checkbox } from "./ui/checkbox";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { toast } from "@/components/ui/toast";
import { useBudgetActions } from "@/hooks/use-budget-actions";
import * as React from "react";
import type { BudgetsGridViewBudget } from "./BudgetsGridView";
import type { BudgetListSearch } from "@/lib/budgetListSearch";
import { useDuplicateBudget } from "@/data/budgets";
import {
  SelectAllItem,
  useBudgetSelection,
  useSelectableBudget,
} from "./BudgetSelection";

type Props = {
  budgets: BudgetsGridViewBudget[];
  currentSearch: BudgetListSearch;
};

export const BudgetsListView = ({ budgets, currentSearch }: Props) => {
  return (
    <div>
      <ul className="flex flex-col">
        {budgets.map((budget) => (
          <BudgetListItem
            budget={budget}
            currentSearch={currentSearch}
            key={budget.id}
          />
        ))}
      </ul>
    </div>
  );
};

const BudgetListItem = ({
  budget,
  currentSearch,
}: {
  budget: BudgetsGridViewBudget;
  currentSearch: BudgetListSearch;
}) => {
  const { isSelected, toggleOnModifierClick } = useSelectableBudget(budget.id);
  const [isMenuPending, setIsMenuPending] = React.useState(false);
  const startMenuAction = () => setIsMenuPending(true);
  const settleMenuAction = () => setIsMenuPending(false);
  const router = useRouter();

  return (
    <li className="">
      <ContextMenu disabled={isMenuPending}>
        <ContextMenuTrigger
          data-marquee-id={budget.id}
          onClick={(e) => {
            if (toggleOnModifierClick(e)) return;
            router.navigate({
              to: "/dashboard/$budgetId",
              params: {
                budgetId: budget.id,
              },
              search: currentSearch,
            });
          }}
          className={cn(
            "block w-full cursor-pointer px-4 py-3 text-sm hover:bg-accent data-popup-open:bg-accent",
            {
              "bg-accent": isSelected,
            },
          )}
        >
          <div className="flex w-full items-center gap-2">
            <BudgetListActions
              budget={budget}
              isPending={isMenuPending}
              onActionStart={startMenuAction}
              onActionSettled={settleMenuAction}
            />
            <BudgetCheckbox budgetId={budget.id} />
            <div className="flex w-full min-w-0 items-center justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <BudgetIconGlyph icon={budget.icon} />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {budget.title}
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatNumberWithSpaces(budget.income)}{" "}
                  {budget.currency.toUpperCase()}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <div
                  className="hidden md:block"
                  onClick={(e) => {
                    // Base UI commits a select on click, and portalled popups still bubble to this row.
                    e.stopPropagation();
                  }}
                >
                  <BudgetLabel
                    labelId={budget.label?.id}
                    budgetId={budget.id}
                  />
                </div>
                <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
                  {new Date(budget.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <BudgetListMenuItems
            budget={budget}
            onActionStart={startMenuAction}
            onActionSettled={settleMenuAction}
          />
        </ContextMenuContent>
      </ContextMenu>
    </li>
  );
};

const BudgetCheckbox = (props: { budgetId: Id<"budgets"> }) => {
  const { isSelected, toggle } = useBudgetSelection();

  return (
    <Checkbox
      onClick={(e) => {
        e.stopPropagation();
      }}
      checked={isSelected(props.budgetId)}
      onCheckedChange={() => toggle(props.budgetId)}
      aria-label="Select budget"
      data-budget-id={props.budgetId}
      className="after:-inset-x-1"
    />
  );
};

type BudgetListMenuItemsProps = {
  budget: BudgetsGridViewBudget;
  onActionStart: () => void;
  onActionSettled: () => void;
};

const BudgetListActions = (
  props: BudgetListMenuItemsProps & { isPending: boolean },
) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            disabled={props.isPending}
            onClick={(e) => {
              e.stopPropagation();
            }}
            variant={"ghost"}
            className="size-5 after:-inset-y-1.5 data-popup-open:bg-accent"
            size={"icon-xs"}
          />
        }
      >
        {props.isPending ? (
          <Spinner />
        ) : (
          <HugeiconsIcon icon={MoreVerticalCircle01Icon} strokeWidth={2} />
        )}{" "}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right">
        <BudgetListMenuItems
          budget={props.budget}
          onActionStart={props.onActionStart}
          onActionSettled={props.onActionSettled}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const BudgetListMenuItems = (props: BudgetListMenuItemsProps) => {
  return (
    <>
      <SelectAllItem />
      <DuplicateItem
        budgetId={props.budget.id}
        onDuplicate={props.onActionStart}
        onSettled={props.onActionSettled}
      />
      <DropdownMenuSeparator />
      <StatusItems
        budget={props.budget}
        onActionStart={props.onActionStart}
        onActionSettled={props.onActionSettled}
      />
    </>
  );
};

/** Archive and Delete for this row, or for the selection when there is one; both undoable. */
const StatusItems = (props: BudgetListMenuItemsProps) => {
  const { selectedBudgets, setSelectedIds } = useBudgetSelection();
  const { archive, trash, isPending } = useBudgetActions();
  const targets = selectedBudgets.length > 0 ? selectedBudgets : [props.budget];
  const count =
    selectedBudgets.length > 0 ? ` selected (${selectedBudgets.length})` : "";

  const run = async (action: typeof archive) => {
    props.onActionStart();
    if (await action(targets)) setSelectedIds([]);
    props.onActionSettled();
  };

  return (
    <>
      <DropdownMenuItem
        onClick={(e) => {
          e.stopPropagation();
          run(archive);
        }}
        disabled={isPending}
      >
        <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />
        Archive{count}
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        onClick={(e) => {
          e.stopPropagation();
          run(trash);
        }}
        disabled={isPending}
      >
        <HugeiconsIcon icon={Delete01Icon} strokeWidth={2} />
        Delete{count}
      </DropdownMenuItem>
    </>
  );
};

const DuplicateItem = (props: {
  budgetId: Id<"budgets">;
  onDuplicate: () => void;
  onSettled: () => void;
}) => {
  const { selectedIds } = useBudgetSelection();
  const { mutateAsync, isPending } = useDuplicateBudget();

  const handleDuplicate = async () => {
    props.onDuplicate();
    try {
      await mutateAsync({ budgetId: props.budgetId });
      toast.add({ type: "success", title: "Budget duplicated" });
    } catch (error) {
      console.error(error);
      toast.add({ type: "error", title: "Failed to duplicate budget" });
    } finally {
      props.onSettled();
    }
  };

  if (selectedIds.length > 0) {
    return null;
  }

  return (
    <DropdownMenuItem
      onClick={(e) => {
        e.stopPropagation();
        handleDuplicate();
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
