import { TrashedBudgets } from "@/components/TrashedBudgets";
import { Button } from "@/components/ui/button";
import { DashboardContainer } from "@/components/ui/dashboard-container";
import { DashboardHeaderWrapper } from "@/components/ui/dashboard-header-wrapper";
import { createFileRoute, Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";

export const Route = createFileRoute("/settings/trash")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <>
      <DashboardHeaderWrapper className="md:hidden">
        <Button render={<Link to="/dashboard" />} variant="ghost" size="xs">
          <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} /> Back to
          Dashboard
        </Button>
      </DashboardHeaderWrapper>
      <DashboardContainer size="sm">
        <TrashedBudgets />
      </DashboardContainer>
    </>
  );
}
