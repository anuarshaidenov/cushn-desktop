import { ManageLabels } from "@/components/ManageLabels";
import { Button } from "@/components/ui/button";
import { DashboardContainer } from "@/components/ui/dashboard-container";
import { DashboardHeaderWrapper } from "@/components/ui/dashboard-header-wrapper";
import { createFileRoute, Link } from "@tanstack/react-router";
import { labelQueries, useSuspenseLabels } from "@/data/labels";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";

export const Route = createFileRoute("/settings/labels")({
  component: RouteComponent,
  loader: ({ context }) =>
    context.queryClient
      .ensureQueryData(labelQueries.list())
      .catch(() => undefined),
});

function RouteComponent() {
  useSuspenseLabels();

  return (
    <>
      <DashboardHeaderWrapper className="md:hidden">
        <Button render={<Link to="/dashboard" />} variant="ghost" size="xs">
          <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} /> Back to
          Dashboard
        </Button>
      </DashboardHeaderWrapper>
      <DashboardContainer size="sm">
        <h1 className="mb-8 text-2xl">Labels</h1>
        <div className="flex flex-col gap-4">
          <ManageLabels />
        </div>
      </DashboardContainer>
    </>
  );
}
