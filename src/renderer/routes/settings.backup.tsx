import { BackupSettings } from "@/components/BackupSettings";
import { Button } from "@/components/ui/button";
import { DashboardContainer } from "@/components/ui/dashboard-container";
import { DashboardHeaderWrapper } from "@/components/ui/dashboard-header-wrapper";
import { createFileRoute, Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";

export const Route = createFileRoute("/settings/backup")({
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
        <h1 className="mb-8 text-2xl">Backup</h1>
        <BackupSettings />
      </DashboardContainer>
    </>
  );
}
