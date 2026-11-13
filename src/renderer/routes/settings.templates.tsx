import { TemplatesSettings } from "@/components/TemplatesSettings";
import { Button } from "@/components/ui/button";
import { DashboardContainer } from "@/components/ui/dashboard-container";
import { DashboardHeaderWrapper } from "@/components/ui/dashboard-header-wrapper";
import {
  EmptyContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { createFileRoute, Link } from "@tanstack/react-router";
import { templateQueries, useSuspenseTemplates } from "@/data/templates";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  ArrowLeft02Icon,
  FolderOpenIcon,
} from "@hugeicons/core-free-icons";

export const Route = createFileRoute("/settings/templates")({
  component: RouteComponent,
  loader: ({ context }) =>
    context.queryClient
      .query(templateQueries.list())
      .catch(() => undefined),
});

function RouteComponent() {
  const { data: templatesData } = useSuspenseTemplates();

  if (templatesData.templates.length === 0) {
    return (
      <div className="flex h-62 w-full items-center justify-center">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={FolderOpenIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No templates found</EmptyTitle>
            <EmptyDescription>
              You don't have any templates yet.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex gap-2">
              <Button size="xs">
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                Create new template
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <>
      <DashboardHeaderWrapper className="md:hidden">
        <Button render={<Link to="/dashboard" />} variant="ghost" size="xs">
          <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} /> Back to
          Dashboard
        </Button>
      </DashboardHeaderWrapper>
      <DashboardContainer size="sm">
        <h1 className="mb-8 text-2xl">Templates</h1>
        <TemplatesSettings templates={templatesData.templates} />
      </DashboardContainer>
    </>
  );
}
