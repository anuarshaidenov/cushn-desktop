import { BudgetCard } from "./BudgetCard";
import { Skeleton } from "./ui/skeleton";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { HugeiconsIcon } from "@hugeicons/react";
import { FolderArchiveIcon, ListFilterIcon } from "@hugeicons/core-free-icons";
import { DashboardContainer } from "./ui/dashboard-container";
import { Button } from "./ui/button";
import { ShortcutKeys } from "./ShortcutKeys";
import { useAddBudgetDialogStore } from "@/stores/useAddBudgetDialogStore";
import type { BudgetListItem } from "@shared/api";
import type { BudgetListSearch } from "@/lib/budgetListSearch";

export type BudgetsGridViewBudget = BudgetListItem;

type Props = {
  budgets: BudgetsGridViewBudget[];
  currentSearch: BudgetListSearch;
};

export const BudgetsGridView = ({ budgets, currentSearch }: Props) => {
  return (
    <div className="grid gap-4 pb-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {budgets.map((budget) => (
        <BudgetCard
          key={budget.id}
          budget={budget}
          currentSearch={currentSearch}
        />
      ))}
    </div>
  );
};

export const BudgetsGridViewSkeleton = () => {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {[...Array(8)].map((_, index) => (
        <Skeleton key={index} className="h-[142px] w-full rounded-xl" />
      ))}
    </div>
  );
};

export const BudgetsGridViewEmptyState = () => {
  const openDialog = useAddBudgetDialogStore((state) => state.openDialog);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <DashboardContainer>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={FolderArchiveIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>Budgets</EmptyTitle>
            <EmptyDescription>
              Create a budget to start managing your finances.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex gap-2">
              <Button size={"xs"} onClick={openDialog}>
                Create new budget <ShortcutKeys id="budget.create" />
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      </DashboardContainer>
    </div>
  );
};

export const BudgetsGridViewNoMatchingFiltersView = () => {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <DashboardContainer>
        <Empty>
          <EmptyHeader>
            <EmptyMedia className="size-24 -rotate-30 skew-x-30" variant="icon">
              <HugeiconsIcon
                icon={ListFilterIcon}
                strokeWidth={2}
                className="size-12"
              />
            </EmptyMedia>
            <EmptyTitle>No budgets matching your filter</EmptyTitle>
            <EmptyDescription>
              Try adjusting your filters or search criteria.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </DashboardContainer>
    </div>
  );
};
