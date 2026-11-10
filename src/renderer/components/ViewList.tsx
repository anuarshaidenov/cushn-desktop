import { Link } from "@tanstack/react-router";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MoreVerticalCircle01Icon,
  Layers01Icon,
  StarIcon,
  StarOffIcon,
  Delete01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { BudgetView, Id } from "@shared/domain";
import { useDeleteView, useToggleViewFavorite } from "@/data/views";
import { toast } from "@/components/ui/toast";
import { Spinner } from "./ui/spinner";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ShortcutKeys } from "./ShortcutKeys";
import { Skeleton } from "./ui/skeleton";
import { cn } from "@/lib/utils";
import { CushnError } from "@shared/errors";

export type BudgetViewSummary = BudgetView;

type Props = {
  views: BudgetViewSummary[];
};

function formatViewCreatedAt(createdAt: number): string {
  return new Date(createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const ViewList = (props: Props) => {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {props.views.map((view) => (
        <li key={view.id}>
          <ViewListItem view={view} />
        </li>
      ))}
    </ul>
  );
};

function useViewActions(viewId: Id<"budgetViews">) {
  const { mutate: runToggleFavorite, isPending: isToggleFavoritePending } =
    useToggleViewFavorite();
  const { mutate: runDeleteView, isPending: isDeletePending } = useDeleteView();
  const toggleFavorite = () =>
    runToggleFavorite(
      { viewId },
      {
        onSuccess: (nextFavorite) => {
          toast.add({
            type: "success",
            title: nextFavorite
              ? "View added to favorites"
              : "View removed from favorites",
          });
        },
        onError: (e) => {
          const msg =
            e instanceof CushnError
              ? e.message
              : "Could not update favorite status";
          toast.add({ type: "error", title: msg });
        },
      },
    );
  const deleteView = () =>
    runDeleteView(
      { viewId },
      {
        onSuccess: () => {
          toast.add({ type: "success", title: "View deleted" });
        },
        onError: (e) => {
          const msg = e instanceof Error ? e.message : "Could not delete view";
          toast.add({ type: "error", title: msg });
        },
      },
    );

  return {
    toggleFavorite,
    deleteView,
    isToggleFavoritePending,
    isDeletePending,
    isPending: isToggleFavoritePending || isDeletePending,
  };
}

type ViewActions = ReturnType<typeof useViewActions>;

const ViewListItemMenuItems = ({
  actions,
  isFavorite,
}: {
  actions: ViewActions;
  isFavorite: boolean;
}) => {
  return (
    <>
      <DropdownMenuItem
        disabled={actions.isPending}
        onClick={(e) => {
          e.stopPropagation();
          actions.toggleFavorite();
        }}
      >
        {actions.isToggleFavoritePending ? (
          <Spinner />
        ) : !isFavorite ? (
          <HugeiconsIcon icon={StarIcon} strokeWidth={2} />
        ) : (
          <HugeiconsIcon icon={StarOffIcon} strokeWidth={2} />
        )}
        {isFavorite ? "Remove favorite" : "Favorite"}
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        disabled={actions.isPending}
        onClick={(e) => {
          e.stopPropagation();
          actions.deleteView();
        }}
      >
        {actions.isDeletePending ? (
          <Spinner />
        ) : (
          <HugeiconsIcon icon={Delete01Icon} strokeWidth={2} />
        )}
        Delete
      </DropdownMenuItem>
    </>
  );
};

const ViewListItemActions = ({
  actions,
  isFavorite,
}: {
  actions: ViewActions;
  isFavorite: boolean;
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-5 after:-inset-1.5 data-popup-open:bg-accent"
            aria-label="View actions"
            disabled={actions.isPending}
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        {actions.isPending ? (
          <Spinner />
        ) : (
          <HugeiconsIcon icon={MoreVerticalCircle01Icon} strokeWidth={2} />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right">
        <ViewListItemMenuItems actions={actions} isFavorite={isFavorite} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const ViewListItem = ({ view }: { view: BudgetViewSummary }) => {
  // Lives here, not in the menus: mutate callbacks are dropped once the calling component unmounts.
  const actions = useViewActions(view.id);

  return (
    <ContextMenu disabled={actions.isPending}>
      <ContextMenuTrigger
        render={
          <Card className="relative h-full transition-colors hover:bg-muted/40 data-popup-open:bg-muted/40" />
        }
      >
        {/* An overlay link, not a wrapper: the menu button nested in an anchor navigated on click. */}
        <Link
          to="/dashboard/views/$id"
          params={{ id: view.id }}
          aria-label={view.title}
          className="absolute inset-0 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <CardHeader>
          <CardTitle className="truncate leading-loose">{view.title}</CardTitle>
          <CardDescription
            className={cn(
              "line-clamp-1",
              !view.description?.trim() && "opacity-0",
            )}
          >
            {view.description?.trim().slice(0, 100) ?? "No description"}
          </CardDescription>
          {/* mt-1.5 centres the 20px trigger on the title's 32px (leading-loose) line. */}
          <CardAction className="relative z-10 mt-1.5">
            <ViewListItemActions
              actions={actions}
              isFavorite={view.isFavorite}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground tabular-nums">
            Created {formatViewCreatedAt(view.createdAt)}
          </p>
        </CardContent>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ViewListItemMenuItems actions={actions} isFavorite={view.isFavorite} />
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const ViewListEmptyState = (props: { onAddView: () => void }) => {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>Views</EmptyTitle>
        <EmptyDescription>
          Create a view to group your budgets.{" "}
          <ShortcutKeys id="views.create" />
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm" onClick={props.onAddView}>
          Add view
        </Button>
      </EmptyContent>
    </Empty>
  );
};

export const ViewListLoadingState = () => {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {[...Array(6)].map((_, index) => (
        <li key={index}>
          <Skeleton className="h-[142px] w-full rounded-xl" />
        </li>
      ))}
    </ul>
  );
};
