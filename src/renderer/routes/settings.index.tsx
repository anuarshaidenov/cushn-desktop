import { SidebarSettings } from "@/components/SidebarSettings";
import { ThemeSettings } from "@/components/ThemeSettings";
import { Button } from "@/components/ui/button";
import { DashboardContainer } from "@/components/ui/dashboard-container";
import { DashboardHeaderWrapper } from "@/components/ui/dashboard-header-wrapper";
import { createFileRoute, Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { canMakeSidebarTransparent } from "@/lib/sidebarTransparency";

export const Route = createFileRoute("/settings/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <>
      <DashboardHeaderWrapper className="md:hidden">
        <Button
          render={<Link to="/dashboard" className="text-sm" />}
          variant="ghost"
          size="sm"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} /> Back to
          Dashboard
        </Button>
      </DashboardHeaderWrapper>
      <DashboardContainer size="sm">
        <h1 className="mb-8 text-2xl">Preferences</h1>
        <ThemeSettings />
        {canMakeSidebarTransparent && <SidebarSettings />}
      </DashboardContainer>
    </>
  );
}
