import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { Route } from "@/routes/dashboard.$budgetId";
import { Link } from "@tanstack/react-router";
import type { Id } from "@shared/domain";
import { useView } from "@/data/views";
import { stripFromViewId, type BudgetListSearch } from "@/lib/budgetListSearch";

type Props = {
  currentPageTitle: string;
};

const DefaultBudgetsBreadcrumb = (props: {
  currentPageTitle: string;
  listSearch: BudgetListSearch;
}) => (
  <Breadcrumb>
    <BreadcrumbList>
      <BreadcrumbItem>
        <BreadcrumbLink
          render={<Link to="/dashboard" search={props.listSearch} />}
        >
          Budgets
        </BreadcrumbLink>
      </BreadcrumbItem>
      <BreadcrumbSeparator />
      <BreadcrumbItem className="max-w-[100px] truncate md:max-w-[290px]">
        <BreadcrumbPage className="truncate">
          {props.currentPageTitle}
        </BreadcrumbPage>
      </BreadcrumbItem>
    </BreadcrumbList>
  </Breadcrumb>
);

export const BudgetBreadcrumb = (props: Props) => {
  const currentSearch = Route.useSearch();
  const listSearch = stripFromViewId(currentSearch);
  const fromViewId = currentSearch.fromViewId;

  if (fromViewId) {
    return (
      <ViewBudgetBreadcrumb
        currentPageTitle={props.currentPageTitle}
        listSearch={listSearch}
        fromViewId={fromViewId}
      />
    );
  }

  return (
    <DefaultBudgetsBreadcrumb
      currentPageTitle={props.currentPageTitle}
      listSearch={listSearch}
    />
  );
};

const ViewBudgetBreadcrumb = (props: {
  currentPageTitle: string;
  listSearch: BudgetListSearch;
  fromViewId: string;
}) => {
  const { currentPageTitle, listSearch, fromViewId } = props;
  const { data: viewData } = useView(fromViewId as Id<"budgetViews">);

  if (viewData !== undefined && viewData.view === null) {
    return (
      <DefaultBudgetsBreadcrumb
        currentPageTitle={currentPageTitle}
        listSearch={listSearch}
      />
    );
  }

  if (viewData?.view) {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/dashboard/views" />}>
              Views
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem className="max-w-[290px] truncate py-1.5">
            <BreadcrumbLink
              render={
                <Link
                  to="/dashboard/views/$id"
                  params={{ id: fromViewId }}
                  search={listSearch}
                />
              }
            >
              {viewData.view.title}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem className="max-w-[290px] truncate">
            <BreadcrumbPage className="truncate">
              {currentPageTitle}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link to="/dashboard/views" />}>
            Views
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem className="flex min-h-6 items-center">
          <Skeleton className="h-4 w-24" />
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem className="max-w-[290px] truncate">
          <BreadcrumbPage className="truncate">
            {currentPageTitle}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
};
