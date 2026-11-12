import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Archive02Icon,
  ArchiveArrowUpIcon,
  Delete01Icon,
  MoreHorizontalCircle01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "./ui/spinner";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  BudgetMenuActionProvider,
  DuplicateItem,
  ExportItem,
  MoveToViewItem,
  useMenuAction,
} from "./BudgetMenuItems";
import type { BudgetStatus, Id } from "@shared/domain";
import { TRASH_RETENTION_DAYS } from "@shared/constants";
import { useBudgetActions } from "@/hooks/use-budget-actions";
import { useLeaveBudgetPage } from "@/hooks/useLeaveBudgetPage";
import { cn, swapIconClass } from "@/lib/utils";

type HeaderBudget = {
  id: Id<"budgets">;
  title: string;
  viewId: Id<"budgetViews"> | null;
  status: BudgetStatus;
};

export const BudgetHeaderActions = (props: { budget: HeaderBudget }) => (
  <BudgetMenuActionProvider>
    <BudgetHeaderMenu budget={props.budget} />
  </BudgetMenuActionProvider>
);

const BudgetHeaderMenu = (props: { budget: HeaderBudget }) => {
  const { isPending, run } = useMenuAction();
  const { archive, unarchive, trash } = useBudgetActions();
  const leave = useLeaveBudgetPage();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const moveToTrash = async () => {
    if (await trash([props.budget])) setIsConfirmOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Budget options"
              className="shrink-0 data-popup-open:bg-accent"
              disabled={isPending}
            />
          }
        >
          <span className="grid *:col-start-1 *:row-start-1">
            <HugeiconsIcon
              icon={MoreHorizontalCircle01Icon}
              strokeWidth={2}
              className={cn("size-4", swapIconClass(!isPending))}
            />
            <Spinner
              aria-hidden={!isPending}
              className={cn("size-4", swapIconClass(isPending))}
            />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DuplicateItem budgetId={props.budget.id} />
          <ExportItem budgetId={props.budget.id} />
          <MoveToViewItem
            budgetId={props.budget.id}
            viewId={props.budget.viewId}
          />
          <DropdownMenuSeparator />
          {props.budget.status === "archived" ? (
            <DropdownMenuItem
              onClick={() => run(() => unarchive([props.budget]))}
            >
              <HugeiconsIcon icon={ArchiveArrowUpIcon} strokeWidth={2} />
              Unarchive
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() =>
                run(async () => {
                  if (await archive([props.budget])) leave();
                })
              }
            >
              <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />
              Archive
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setIsConfirmOpen(true)}
          >
            <HugeiconsIcon icon={Delete01Icon} strokeWidth={2} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title={`Delete “${props.budget.title}”?`}
        description={`It moves to the trash, where you can restore it for ${TRASH_RETENTION_DAYS} days.`}
        confirmLabel="Delete"
        isPending={isPending}
        onConfirm={() => run(moveToTrash)}
      />
    </>
  );
};
