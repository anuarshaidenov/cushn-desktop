import type { Id } from "@shared/domain";
import type { ArchivedBudgetListItem } from "@shared/api";
import { useState } from "react";
import { Spinner } from "./ui/spinner";
import { Button } from "./ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Archive02Icon,
  ArchiveArrowUpIcon,
  MoreVerticalCircle01Icon,
  Delete01Icon,
} from "@hugeicons/core-free-icons";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  formatNumberWithSpaces,
  formatShortDate,
  getCurrencySymbol,
} from "@/lib/utils";
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
import { useArchivedBudgets } from "@/data/budgets";
import { useBudgetActions } from "@/hooks/use-budget-actions";
import { LoadMoreButton } from "./LoadMoreButton";

type Budget = ArchivedBudgetListItem;

const LOAD_AMOUNT = 25;

export const ArchivedBudgets = () => {
  // Never set: the archive page has no filter UI.
  const [filters] = useState<{
    q?: string;
    labelIds?: string;
    templateIds?: string;
    currencies?: string;
    sortBy?: "createdAt" | "income";
    sortOrder?: "asc" | "desc";
  }>({
    q: undefined,
    labelIds: undefined,
    templateIds: undefined,
    currencies: undefined,
    sortBy: undefined,
    sortOrder: undefined,
  });

  const { results, isLoading, loadMore, status } = useArchivedBudgets(
    {
      search: filters.q,
      labelIds:
        filters.labelIds?.split(",").map((id) => id as Id<"budgetLabels">) ||
        undefined,
      templateIds: filters.templateIds
        ? filters.templateIds?.split(",").map((id) => id as Id<"templates">)
        : undefined,
      currencies: filters.currencies
        ? filters.currencies?.split(",")
        : undefined,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    },
    { pageSize: LOAD_AMOUNT },
  );

  if (isLoading && !results?.length) {
    return (
      <div className="flex h-72 flex-col items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!results?.length) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>No archived budgets</EmptyTitle>
          <EmptyDescription>
            Archived budgets stay here until you unarchive them.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="flex flex-col gap-2">
        {results.map((budget) => (
          <BudgetListItem key={budget.id} budget={budget} />
        ))}
      </ul>
      <LoadMoreButton
        status={status}
        loadMore={loadMore}
        numItems={LOAD_AMOUNT}
      />
    </div>
  );
};

const BudgetListItem = (props: { budget: Budget }) => {
  return (
    <Card className="gap-3 hover:bg-accent">
      <CardHeader className="">
        <CardTitle>{props.budget.title}</CardTitle>
        <CardDescription className="truncate text-xs tabular-nums">
          {formatShortDate(props.budget.createdAt)}
        </CardDescription>
        <CardAction className="-mt-1">
          <BudgetListItemActions budget={props.budget} />
        </CardAction>
      </CardHeader>
      <CardContent className="">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatNumberWithSpaces(props.budget.income)}{" "}
            {getCurrencySymbol(props.budget.currency)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

const BudgetListItemActions = (props: { budget: Budget }) => {
  const { unarchive, trash, isPending } = useBudgetActions();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button size="icon-xs" variant="ghost" disabled={isPending} />}
      >
        {isPending ? (
          <Spinner />
        ) : (
          <HugeiconsIcon icon={MoreVerticalCircle01Icon} strokeWidth={2} />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            unarchive([props.budget]);
          }}
        >
          <HugeiconsIcon icon={ArchiveArrowUpIcon} strokeWidth={2} />
          Unarchive
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={(e) => {
            e.stopPropagation();
            trash([props.budget]);
          }}
        >
          <HugeiconsIcon icon={Delete01Icon} strokeWidth={2} />
          Move to trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
