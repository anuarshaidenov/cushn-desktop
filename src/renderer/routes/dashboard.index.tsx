import { createFileRoute } from "@tanstack/react-router";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { BudgetFiltersTrigger } from "@/components/BudgetFilters";
import {
  BudgetsGridView,
  BudgetsGridViewEmptyState,
  BudgetsGridViewNoMatchingFiltersView,
  BudgetsGridViewSkeleton,
} from "@/components/BudgetsGridView";
import { BudgetsListView } from "@/components/BudgetsListView";
import { DashboardHeaderWrapper } from "@/components/ui/dashboard-header-wrapper";
import { useBudgetsView } from "@/hooks/useBudgetsView";
import { BudgetsViewSwitch } from "@/components/BudgetsViewSwitch";
import { BudgetsSearch } from "@/components/BudgetsSearch";
import { BudgetAppliedFilters } from "@/components/BudgetAppliedFilters";
import { Activity } from "react";
import { AddBudgetButton } from "@/components/AddBudgetButton";
import { useSidebar } from "@/components/ui/sidebar";
import { useDebounce } from "@uidotdev/usehooks";
import type { Id } from "@shared/domain";
import { Spinner } from "@/components/ui/spinner";
import {
  budgetListSearchSchema,
  stripFromViewId,
} from "@/lib/budgetListSearch";
import { useActiveBudgets } from "@/data/budgets";
import { LoadMoreButton } from "@/components/LoadMoreButton";
import { isFirstPageLoading } from "@/lib/loadMore";
import { hotkeyScopes } from "@/lib/hotkeys";
import {
  BudgetMarqueeArea,
  BudgetSelectionProvider,
} from "@/components/BudgetSelection";

const LOAD_AMOUNT = 25;

export const Route = createFileRoute("/dashboard/")({
  component: RouteComponent,
  validateSearch: budgetListSearchSchema,
});

function RouteComponent() {
  const { view } = useBudgetsView();
  const { isMobile, setOpenMobile } = useSidebar();
  const search = Route.useSearch();
  const {
    q = "",
    labelIds,
    templateIds,
    currencies,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = Route.useSearch();
  const debouncedValue = useDebounce(q, 500);
  const {
    results: budgets,
    status,
    loadMore,
  } = useActiveBudgets(
    {
      search: debouncedValue,
      labelIds:
        labelIds?.split(",").map((id) => id as Id<"budgetLabels">) || undefined,
      templateIds: templateIds
        ? templateIds.split(",").map((id) => id as Id<"templates">)
        : undefined,
      currencies: currencies ? currencies.split(",") : undefined,
      sortBy,
      sortOrder,
    },
    { pageSize: LOAD_AMOUNT },
  );
  // Not the hook's `isLoading`: it is also true while "Load more" fetches a later page.
  const isLoading = isFirstPageLoading(status);
  const filterApplied = Boolean(
    q ||
    (labelIds && labelIds.length > 0) ||
    (templateIds && templateIds.length > 0) ||
    (currencies && currencies.length > 0),
  );

  const listSearch = stripFromViewId(search);

  return (
    <HotkeysProvider scope={hotkeyScopes.budgetsList}>
      <div className="flex h-full flex-col">
        <h1 className="sr-only">Budgets</h1>
        <DashboardHeaderWrapper className="rounded-t-xl bg-background">
          <div className="flex w-full items-center justify-between">
            <div className="flex flex-1 items-center justify-between gap-4 md:justify-start">
              <div className="flex items-center gap-4">
                <BudgetFiltersTrigger />
                {isMobile && (
                  <AddBudgetButton onClick={() => setOpenMobile(false)} />
                )}
              </div>
              <BudgetsViewSwitch />
            </div>
            <BudgetsSearch />
          </div>
        </DashboardHeaderWrapper>
        <BudgetAppliedFilters />
        <BudgetSelectionProvider budgets={budgets}>
          <Activity mode={view === "grid" ? "visible" : "hidden"}>
            {/* DashboardContainer's classes: the marquee needs the scroll container's own element. */}
            <BudgetMarqueeArea className="container mx-auto h-full flex-1 overflow-auto p-4 pb-20 md:p-10 md:pt-6">
              {isLoading ? (
                <BudgetsGridViewSkeleton />
              ) : filterApplied && !budgets?.length ? (
                <BudgetsGridViewNoMatchingFiltersView />
              ) : !budgets?.length ? (
                <BudgetsGridViewEmptyState />
              ) : (
                <>
                  <BudgetsGridView
                    budgets={budgets}
                    currentSearch={listSearch}
                  />
                  <LoadMoreButton
                    status={status}
                    loadMore={loadMore}
                    numItems={LOAD_AMOUNT}
                  />
                </>
              )}
            </BudgetMarqueeArea>
          </Activity>
          <Activity mode={view === "list" ? "visible" : "hidden"}>
            <BudgetMarqueeArea className="h-full flex-1 overflow-auto pb-20">
              {isLoading ? (
                <div className="flex h-72 flex-col items-center justify-center">
                  <Spinner />
                </div>
              ) : filterApplied && !budgets?.length ? (
                <BudgetsGridViewNoMatchingFiltersView />
              ) : !budgets?.length ? (
                <BudgetsGridViewEmptyState />
              ) : (
                <>
                  <BudgetsListView
                    budgets={budgets}
                    currentSearch={listSearch}
                  />
                  <div className="px-4 pt-4">
                    <LoadMoreButton
                      status={status}
                      loadMore={loadMore}
                      numItems={LOAD_AMOUNT}
                    />
                  </div>
                </>
              )}
            </BudgetMarqueeArea>
          </Activity>
        </BudgetSelectionProvider>
      </div>
    </HotkeysProvider>
  );
}
