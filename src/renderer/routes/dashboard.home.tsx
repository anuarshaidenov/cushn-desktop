import { createFileRoute } from "@tanstack/react-router";
import { DashboardHeaderWrapper } from "@/components/ui/dashboard-header-wrapper";
import { DashboardContainer } from "@/components/ui/dashboard-container";
import { Home, HomeSkeleton } from "@/components/Home";
import { homeQueries, useHomeSummary } from "@/data/home";

export const Route = createFileRoute("/dashboard/home")({
  component: RouteComponent,
  loader: ({ context }) =>
    context.queryClient
      .query(homeQueries.summary())
      .catch(() => undefined),
});

function RouteComponent() {
  const { data, error } = useHomeSummary();

  if (error && !data) throw error;

  return (
    <div className="flex h-full flex-col">
      <DashboardHeaderWrapper className="rounded-t-xl border-b-0 bg-background" />
      <div className="flex-1 overflow-auto">
        <DashboardContainer
          size="sm"
          className="flex min-h-full flex-col pb-20 md:pt-6"
        >
          {data ? <Home summary={data} /> : <HomeSkeleton />}
        </DashboardContainer>
      </div>
    </div>
  );
}
