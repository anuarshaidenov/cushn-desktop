import { Button } from "@/components/ui/button";
import { DashboardContainer } from "@/components/ui/dashboard-container";
import { DashboardHeaderWrapper } from "@/components/ui/dashboard-header-wrapper";
import { createFileRoute, Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { NewTemplateForm } from "@/components/TemplateForm";

export const Route = createFileRoute("/settings/template/new")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <>
      <DashboardHeaderWrapper className="md:hidden">
        <Button
          render={<Link to="/settings/templates" />}
          variant="ghost"
          size="xs"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} /> Back to Templates
        </Button>
      </DashboardHeaderWrapper>
      <DashboardContainer size="sm" className="h-full overflow-scroll">
        <div className="mb-10 hidden md:block">
          <Link
            className="text-muted-foreground relative flex items-center gap-2 text-xs after:absolute after:-inset-2"
            to="/settings/templates"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} className="size-3" /> Back to templates
          </Link>
        </div>
        <h1 className="mb-8 text-2xl">Create new template</h1>
        <NewTemplateForm />
      </DashboardContainer>
    </>
  );
}
