import type { TrashedBudgetListItem } from "@shared/api";
import { TRASH_RETENTION_DAYS } from "@shared/constants";
import { CushnError } from "@shared/errors";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete01Icon,
  Delete02Icon,
  DeletePutBackIcon,
  MoreVerticalCircle01Icon,
} from "@hugeicons/core-free-icons";
import { Spinner } from "./ui/spinner";
import { Button } from "./ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty";
import { toast } from "@/components/ui/toast";
import {
  useDeleteBudgets,
  useEmptyTrash,
  useTrashedBudgets,
} from "@/data/budgets";
import { useBudgetActions } from "@/hooks/use-budget-actions";
import { formatRelativeTime } from "@/lib/relativeTime";
import { formatTrashDaysLeft, trashDaysLeft } from "@/lib/trash";
import { cn, formatNumberWithSpaces, getCurrencySymbol } from "@/lib/utils";
import { LoadMoreButton } from "./LoadMoreButton";
import { ConfirmDialog } from "./ConfirmDialog";

const LOAD_AMOUNT = 25;
const SOON_DAYS = 3;

const errorDescription = (error: unknown) =>
  error instanceof CushnError ? error.message : undefined;

export const TrashedBudgets = () => {
  const { results, isLoading, loadMore, status } = useTrashedBudgets({
    pageSize: LOAD_AMOUNT,
  });
  const isFirstLoad = isLoading && !results.length;

  return (
    <>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl">Trash</h1>
          {results.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Deleted budgets stay here for {TRASH_RETENTION_DAYS} days, then
              they're deleted forever.
            </p>
          )}
        </div>
        <EmptyTrashButton
          count={results.length}
          hasMore={status === "CanLoadMore" || status === "LoadingMore"}
          disabled={isFirstLoad || results.length === 0}
        />
      </div>
      {isFirstLoad ? (
        <div className="flex h-72 flex-col items-center justify-center">
          <Spinner />
        </div>
      ) : results.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>Trash is empty</EmptyTitle>
            <EmptyDescription>
              Deleted budgets stay here for {TRASH_RETENTION_DAYS} days.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-4">
          <ul className="flex flex-col gap-2">
            {results.map((budget) => (
              <TrashedBudgetItem key={budget.id} budget={budget} />
            ))}
          </ul>
          <LoadMoreButton
            status={status}
            loadMore={loadMore}
            numItems={LOAD_AMOUNT}
          />
        </div>
      )}
    </>
  );
};

const TrashedBudgetItem = (props: { budget: TrashedBudgetListItem }) => {
  const daysLeft = trashDaysLeft(props.budget.deletedAt);

  return (
    <Card className="gap-3 hover:bg-accent">
      <CardHeader>
        <CardTitle>{props.budget.title}</CardTitle>
        <CardDescription className="text-xs tabular-nums">
          Deleted {formatRelativeTime(props.budget.deletedAt)} ·{" "}
          <span className={cn(daysLeft <= SOON_DAYS && "text-destructive")}>
            {formatTrashDaysLeft(daysLeft)}
          </span>
        </CardDescription>
        <CardAction className="-mt-1">
          <TrashedBudgetActions budget={props.budget} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatNumberWithSpaces(props.budget.income)}{" "}
          {getCurrencySymbol(props.budget.currency)}
        </span>
      </CardContent>
    </Card>
  );
};

const TrashedBudgetActions = (props: { budget: TrashedBudgetListItem }) => {
  const { restore, isPending: isRestoring } = useBudgetActions();
  const { mutateAsync: deleteBudgets, isPending: isDeleting } =
    useDeleteBudgets();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // `mutateAsync`: the row unmounts once the list refetches without it, which skips per-call `mutate` callbacks.
  const deleteForever = async () => {
    try {
      await deleteBudgets({ budgetIds: [props.budget.id] });
      setIsConfirmOpen(false);
      toast.add({ title: "Deleted forever", description: props.budget.title });
    } catch (error) {
      console.error(error);
      toast.add({
        type: "error",
        title: "Couldn't delete budget",
        description: errorDescription(error),
      });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size="icon-xs"
              variant="ghost"
              disabled={isRestoring || isDeleting}
            />
          }
        >
          {isRestoring ? (
            <Spinner />
          ) : (
            <HugeiconsIcon icon={MoreVerticalCircle01Icon} strokeWidth={2} />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => restore([props.budget])}>
            <HugeiconsIcon icon={DeletePutBackIcon} strokeWidth={2} />
            Restore
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setIsConfirmOpen(true)}
          >
            <HugeiconsIcon icon={Delete01Icon} strokeWidth={2} />
            Delete forever
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title={`Delete “${props.budget.title}” forever?`}
        description="Its allocations and expenses go with it. This can't be undone."
        confirmLabel="Delete forever"
        isPending={isDeleting}
        onConfirm={deleteForever}
      />
    </>
  );
};

const EmptyTrashButton = (props: {
  count: number;
  hasMore: boolean;
  disabled: boolean;
}) => {
  const { mutate, isPending } = useEmptyTrash();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const what = props.hasMore
    ? "Every budget in the trash, with its"
    : props.count === 1
      ? "The budget in the trash, with its"
      : `All ${props.count} budgets in the trash, with their`;

  const emptyTrash = () =>
    mutate(undefined, {
      onSuccess: ({ deletedCount }) => {
        setIsConfirmOpen(false);
        toast.add({
          title: "Trash emptied",
          description: `${deletedCount} budget${deletedCount === 1 ? "" : "s"} deleted forever`,
        });
      },
      onError: (error) => {
        console.error(error);
        toast.add({
          type: "error",
          title: "Couldn't empty the trash",
          description: errorDescription(error),
        });
      },
    });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="mt-0.5 shrink-0"
        disabled={props.disabled}
        onClick={() => setIsConfirmOpen(true)}
      >
        <HugeiconsIcon icon={Delete01Icon} strokeWidth={2} />
        Empty trash
      </Button>
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title="Empty trash?"
        description={`${what} allocations and expenses, will be deleted forever. This can't be undone.`}
        confirmLabel="Empty trash"
        isPending={isPending}
        onConfirm={emptyTrash}
      />
    </>
  );
};
