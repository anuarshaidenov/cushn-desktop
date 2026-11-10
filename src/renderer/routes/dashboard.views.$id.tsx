import { DashboardContainer } from "@/components/ui/dashboard-container";
import { DashboardHeaderWrapper } from "@/components/ui/dashboard-header-wrapper";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { Id } from "@shared/domain";
import { BudgetView } from "@/components/BudgetView";
import { useDebounce } from "@uidotdev/usehooks";
import {
  BudgetsGridView,
  BudgetsGridViewEmptyState,
  BudgetsGridViewNoMatchingFiltersView,
  BudgetsGridViewSkeleton,
} from "@/components/BudgetsGridView";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { HugeiconsIcon } from "@hugeicons/react";
import { FolderArchiveIcon } from "@hugeicons/core-free-icons";
import { budgetListSearchSchema } from "@/lib/budgetListSearch";
import { useActiveBudgets } from "@/data/budgets";
import { useSuspenseView, viewQueries } from "@/data/views";
import { LoadMoreButton } from "@/components/LoadMoreButton";
import { isFirstPageLoading } from "@/lib/loadMore";

const LOAD_AMOUNT = 25;

export const Route = createFileRoute("/dashboard/views/$id")({
  validateSearch: budgetListSearchSchema,
  component: RouteComponent,
  loader: ({ context, params }) =>
    context.queryClient
      .ensureQueryData(viewQueries.detail(params.id as Id<"budgetViews">))
      .catch(() => undefined),
});

function RouteComponent() {
  const { id } = Route.useParams();
  const budgetViewId = id as Id<"budgetViews">;
  const search = Route.useSearch();
  const {
    q = "",
    labelIds,
    templateIds,
    currencies,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = search;
  const debouncedValue = useDebounce(q, 500);
  const { data: viewData } = useSuspenseView(budgetViewId);
  const {
    results: budgets,
    status,
    loadMore,
  } = useActiveBudgets(
    {
      viewId: budgetViewId,
      search: debouncedValue,
      labelIds:
        labelIds?.split(",").map((labelId) => labelId as Id<"budgetLabels">) ||
        undefined,
      templateIds: templateIds
        ? templateIds
            .split(",")
            .map((templateId) => templateId as Id<"templates">)
        : undefined,
      currencies: currencies ? currencies.split(",") : undefined,
      sortBy,
      sortOrder,
    },
    { pageSize: LOAD_AMOUNT },
  );
  // Not the hook's `isLoading`: it is also true while "Load more" fetches a later page.
  const isLoading = isFirstPageLoading(status);

  const title = viewData.view?.title ?? null;
  const filterApplied = Boolean(
    q ||
      (labelIds && labelIds.length > 0) ||
      (templateIds && templateIds.length > 0) ||
      (currencies && currencies.length > 0),
  );

  return (
    <div className="flex h-full flex-col">
      <DashboardHeaderWrapper className="bg-background rounded-t-xl">
        <div className="flex w-full items-center justify-between gap-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link to="/dashboard/views" />}>
                  Views
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="max-w-[290px] truncate">
                <BreadcrumbPage className="truncate">{title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </DashboardHeaderWrapper>
      <DashboardContainer className="h-full flex-1 pb-20 overflow-auto md:pt-6">
        {!viewData.view ? (
          <div className="flex h-full items-center justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={FolderArchiveIcon} strokeWidth={2} />
                </EmptyMedia>
                <EmptyTitle>View not found</EmptyTitle>
                <EmptyDescription>
                  The budget view you are looking for does not exist.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <div className="flex h-full flex-col gap-6">
            <BudgetView
              budgetView={{
                id: viewData.view.id,
                title: viewData.view.title,
                description: viewData.view.description,
              }}
            />
            <div>
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
                    currentSearch={{ ...search, fromViewId: budgetViewId }}
                  />
                  <LoadMoreButton
                    status={status}
                    loadMore={loadMore}
                    numItems={LOAD_AMOUNT}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </DashboardContainer>
    </div>
  );
}
