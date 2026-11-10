import { EditTemplateForm, TemplateReadonly } from "@/components/TemplateForm";
import { Button } from "@/components/ui/button";
import { DashboardContainer } from "@/components/ui/dashboard-container";
import { DashboardHeaderWrapper } from "@/components/ui/dashboard-header-wrapper";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { Id } from "@shared/domain";
import { templateQueries, useSuspenseTemplate } from "@/data/templates";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";

export const Route = createFileRoute("/settings/template/$templateId")({
  component: RouteComponent,
  loader: ({ context, params }) =>
    context.queryClient
      .ensureQueryData(
        templateQueries.detail(params.templateId as Id<"templates">),
      )
      .catch(() => undefined),
});

function RouteComponent() {
  const templateId = Route.useParams().templateId as Id<"templates">;
  const { data } = useSuspenseTemplate(templateId);

  return (
    <>
      <DashboardHeaderWrapper className="md:hidden">
        <Button
          render={<Link to="/settings/templates" />}
          variant="ghost"
          size="xs"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} /> Back to templates
        </Button>
      </DashboardHeaderWrapper>
      <DashboardContainer size="sm" className="h-full">
        <div className="mb-10 hidden md:block">
          <Link
            className="text-muted-foreground relative flex items-center gap-2 text-xs after:absolute after:-inset-2"
            to="/settings/templates"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} className="size-3" /> Back to templates
          </Link>
        </div>
        <h1 className="mb-8 text-2xl">Edit template</h1>
        {data.template.isDefault ? (
          <TemplateReadonly template={data.template} />
        ) : (
          <EditTemplateForm template={data.template} />
        )}
      </DashboardContainer>
    </>
  );
}
