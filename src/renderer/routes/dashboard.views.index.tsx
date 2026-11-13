import { createFileRoute } from "@tanstack/react-router";
import { DashboardHeaderWrapper } from "@/components/ui/dashboard-header-wrapper";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { AddView } from "@/components/AddView";
import { useState } from "react";
import { DashboardContainer } from "@/components/ui/dashboard-container";
import { useCreateView, useSuspenseViews, viewQueries } from "@/data/views";
import { toast } from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHotkey } from "@tanstack/react-hotkeys";
import { appHotkeys } from "@/lib/hotkeys";
import { ShortcutKeys } from "@/components/ShortcutKeys";
import { ViewList, ViewListEmptyState } from "@/components/ViewList";

export const Route = createFileRoute("/dashboard/views/")({
  component: RouteComponent,
  loader: ({ context }) =>
    context.queryClient
      .query(viewQueries.list())
      .catch(() => undefined),
});

function RouteComponent() {
  const [isAddingView, setIsAddingView] = useState(false);
  const { data: viewsData } = useSuspenseViews();
  const { mutate, isPending } = useCreateView();

  const handleAddView = (title: string, description: string) => {
    mutate(
      {
        title,
        ...(description.trim().length > 0
          ? { description: description.trim() }
          : {}),
      },
      {
        onSuccess: () => {
          setIsAddingView(false);
          toast.add({ type: "success", title: "View created" });
        },
        onError: (e) => {
          const msg = e instanceof Error ? e.message : "Could not create view";
          toast.add({ type: "error", title: msg });
        },
      },
    );
  };

  const handleCancel = () => {
    setIsAddingView(false);
  };

  useHotkey(
    appHotkeys["views.create"],
    () => {
      setIsAddingView(true);
    },
    { enabled: !isAddingView },
  );

  return (
    <div className="flex h-full flex-col">
      <DashboardHeaderWrapper className="rounded-t-xl bg-background">
        <div className="flex w-full items-center justify-between">
          <h1 className="text-sm text-foreground">Views</h1>
          {!isAddingView && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-xs"
                    onClick={() => setIsAddingView(true)}
                  />
                }
              >
                <HugeiconsIcon
                  icon={Add01Icon}
                  strokeWidth={2}
                  className="size-3"
                />
              </TooltipTrigger>
              <TooltipContent>
                Add view <ShortcutKeys id="views.create" />
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </DashboardHeaderWrapper>

      <DashboardContainer className="h-full flex-1 overflow-auto pb-20 md:pt-6">
        {isAddingView && (
          <div className="animate-in py-2 duration-200 ease-out-quint fade-in slide-in-from-top-2 motion-reduce:slide-in-from-top-0">
            <AddView
              onAdd={handleAddView}
              onCancel={handleCancel}
              isPending={isPending}
            />
          </div>
        )}
        <ViewList views={viewsData.views} />
        {viewsData.views.length === 0 && !isAddingView && (
          <ViewListEmptyState onAddView={() => setIsAddingView(true)} />
        )}
      </DashboardContainer>
    </div>
  );
}
