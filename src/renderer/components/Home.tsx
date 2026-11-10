import { HugeiconsIcon } from "@hugeicons/react";
import { FolderArchiveIcon } from "@hugeicons/core-free-icons";
import type { HomeSummary } from "@shared/api";
import { useAddBudgetDialogStore } from "@/stores/useAddBudgetDialogStore";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { ShortcutKeys } from "./ShortcutKeys";
import { HomeMainBudget } from "./HomeMainBudget";
import { HomeOtherBudgets } from "./HomeOtherBudgets";
import { HomeNeedsAttention } from "./HomeNeedsAttention";
import { HomeBiggestExpenses } from "./HomeBiggestExpenses";

type Props = {
  summary: HomeSummary;
};

export const Home = ({ summary }: Props) => {
  if (!summary.main) return <HomeEmptyState />;

  return (
    <HomeColumn>
      <HomeMainBudget budget={summary.main} />
      {summary.overspent.length > 0 && (
        <HomeNeedsAttention allocations={summary.overspent} />
      )}
      {summary.main.biggestExpenses.length > 0 && (
        <HomeBiggestExpenses budget={summary.main} />
      )}
      {summary.others.length > 0 && (
        <HomeOtherBudgets budgets={summary.others} />
      )}
    </HomeColumn>
  );
};

export const HomeSkeleton = () => {
  return (
    <HomeColumn>
      <Skeleton className="h-80 w-full" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-60 w-full" />
    </HomeColumn>
  );
};

const HomeColumn = (props: { children: React.ReactNode }) => {
  return <div className="flex min-w-0 flex-col gap-6">{props.children}</div>;
};

const HomeEmptyState = () => {
  const openDialog = useAddBudgetDialogStore((state) => state.openDialog);

  return (
    <div className="flex w-full flex-1 items-center justify-center">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={FolderArchiveIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>No active budgets</EmptyTitle>
          <EmptyDescription>
            Create a budget to see its progress here.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size={"xs"} onClick={openDialog}>
            Create new budget <ShortcutKeys id="budget.create" />
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
};
