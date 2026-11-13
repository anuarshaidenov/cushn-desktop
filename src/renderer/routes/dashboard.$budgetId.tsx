import { Budget } from "@/components/Budget";
import { DashboardContainer } from "@/components/ui/dashboard-container";
import { DashboardHeaderWrapper } from "@/components/ui/dashboard-header-wrapper";
import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "@shared/domain";
import { budgetQueries, useBudget } from "@/data/budgets";
import { expenseQueries, useBudgetExpenses } from "@/data/expenses";
import { Spinner } from "@/components/ui/spinner";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { HugeiconsIcon } from "@hugeicons/react";
import { FolderArchiveIcon } from "@hugeicons/core-free-icons";
import {
  BudgetPropertiesDesktop,
  BudgetPropertiesMobile,
} from "@/components/BudgetProperties";
import { BudgetBreadcrumb } from "@/components/BudgetBreadcrumb";
import { BudgetHeaderActions } from "@/components/BudgetHeaderActions";
import { useEffect, useRef } from "react";
import { budgetListSearchSchema } from "@/lib/budgetListSearch";
import { useLeaveBudgetPage } from "@/hooks/useLeaveBudgetPage";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { hotkeyScopes } from "@/lib/hotkeys";

export const Route = createFileRoute("/dashboard/$budgetId")({
  validateSearch: budgetListSearchSchema,
  component: () => (
    <HotkeysProvider scope={hotkeyScopes.budget}>
      <RouteComponent />
    </HotkeysProvider>
  ),
  remountDeps: ({ params }) => params.budgetId,
  loader: ({ context, params }) => {
    const budgetId = params.budgetId as Id<"budgets">;
    return Promise.all([
      context.queryClient.query(budgetQueries.detail(budgetId)),
      context.queryClient.query(expenseQueries.grouped(budgetId)),
      context.queryClient.query(expenseQueries.chart(budgetId)),
    ]).catch(() => undefined);
  },
});

function RouteComponent() {
  const budgetId = Route.useParams().budgetId as Id<"budgets">;
  const { data: budgetData } = useBudget(budgetId);
  const { data: expensesData } = useBudgetExpenses(budgetId);
  const leave = useLeaveBudgetPage();
  const hadBudget = useRef(false);

  // Moved to the trash (or deleted) while open, e.g. by Delete or ⇧⌘Z: go back
  // where the breadcrumb points rather than show "not found".
  useEffect(() => {
    if (budgetData?.budget) hadBudget.current = true;
    else if (budgetData && hadBudget.current) leave();
  }, [budgetData, leave]);

  useEffect(() => {
    if (budgetData?.budget?.title) {
      document.title = `${budgetData.budget.title} | Cushn`;
    }
  }, [budgetData]);

  if (!budgetData || !expensesData) {
    return (
      <div className="flex h-full flex-col">
        <DashboardHeaderWrapper>
          <BudgetBreadcrumb currentPageTitle="" />
        </DashboardHeaderWrapper>
        <div className="flex h-full w-full items-center justify-center lg:flex lg:flex-wrap">
          <div className="h-full overflow-auto lg:grow-999 lg:basis-0">
            <div className="flex h-full w-full items-center justify-center">
              <Spinner />
            </div>
          </div>
          <div className="hidden h-full rounded-br-xl border-l bg-card lg:block lg:grow lg:basis-56">
            <div className="flex h-full w-full items-center justify-center">
              <Spinner />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!budgetData.budget) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <DashboardContainer size="sm">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={FolderArchiveIcon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>Budget not found</EmptyTitle>
              <EmptyDescription>
                The budget you are looking for does not exist.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </DashboardContainer>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DashboardHeaderWrapper className="rounded-t-xl bg-background">
        <div className="flex w-full items-center justify-between gap-4">
          <BudgetBreadcrumb currentPageTitle={budgetData.budget.title} />
          <BudgetHeaderActions budget={budgetData.budget} />
        </div>
      </DashboardHeaderWrapper>

      <BudgetPropertiesMobile budget={budgetData.budget} />

      <div className="h-full min-h-0 flex-1 lg:flex lg:flex-wrap">
        <div className="h-full overflow-auto lg:grow-999 lg:basis-0">
          <div className="h-full pb-20 md:overflow-auto">
            <DashboardContainer size="sm">
              <Budget
                budget={budgetData.budget}
                allocations={budgetData.allocations}
                expensesByAllocation={expensesData.expensesByAllocation}
              />
            </DashboardContainer>
          </div>
        </div>

        <div className="hidden rounded-br-xl border-l bg-card lg:block lg:grow lg:basis-56">
          <BudgetPropertiesDesktop budget={budgetData.budget} />
        </div>
      </div>
    </div>
  );
}
