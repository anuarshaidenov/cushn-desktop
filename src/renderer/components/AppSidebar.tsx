import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  CogIcon,
  Home01Icon,
  Layers01Icon,
  Search01Icon,
  StarOffIcon,
  WalletCardsIcon,
} from "@hugeicons/core-free-icons";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  useHotkeys,
  type AppHotkeyId,
  type Hotkey,
} from "@tanstack/react-hotkeys";
import { AddBudgetButton } from "./AddBudgetButton";
import { WhatsNewButton } from "./ChangelogDialog";
import { UpdateButton } from "./UpdateButton";
import { useCommandDialogStore } from "@/stores/useCommandDialogStore";
import { useFavoriteViews, useToggleViewFavorite } from "@/data/views";
import type { Id } from "@shared/domain";
import { toast } from "@/components/ui/toast";
import { Spinner } from "./ui/spinner";
import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HotkeyHint, ShortcutKeys, goToTooltip } from "./ShortcutKeys";

const items: {
  title: string;
  url?: string;
  icon: IconSvgElement;
  hotkeyId: AppHotkeyId;
  onClick?: () => void;
}[] = [
  {
    title: "Home",
    url: "/dashboard/home",
    icon: Home01Icon,
    hotkeyId: "nav.home",
  },
  {
    title: "Budgets",
    url: "/dashboard",
    icon: WalletCardsIcon,
    hotkeyId: "nav.budgets",
  },
  {
    title: "Views",
    url: "/dashboard/views",
    icon: Layers01Icon,
    hotkeyId: "nav.views",
  },
];

/** Physical digit-row keys, so ⌘1…⌘9 work on any layout. They open the first nine favorites. */
const favoriteHotkeys = [
  "Mod+[Digit1]",
  "Mod+[Digit2]",
  "Mod+[Digit3]",
  "Mod+[Digit4]",
  "Mod+[Digit5]",
  "Mod+[Digit6]",
  "Mod+[Digit7]",
  "Mod+[Digit8]",
  "Mod+[Digit9]",
] as const satisfies readonly Hotkey[];

// Over the row's trailing edge, like `SidebarMenuBadge`, so showing it moves nothing.
const rowHintClassName =
  "pointer-events-none absolute top-1.5 right-1 group-data-[collapsible=icon]:hidden";

export function AppSidebar() {
  const { setOpenMobile } = useSidebar();
  const openDialog = useCommandDialogStore((state) => state.openDialog);
  const { data: favoriteViews } = useFavoriteViews();
  const isFavoriteViewsLoading = favoriteViews === undefined;
  const isFavoriteViewsEmpty = favoriteViews?.views.length === 0;
  const navigate = useNavigate();

  useHotkeys(
    (favoriteViews?.views ?? [])
      .slice(0, favoriteHotkeys.length)
      .map((view, index) => ({
        hotkey: favoriteHotkeys[index],
        callback: () =>
          navigate({ to: "/dashboard/views/$id", params: { id: view.id } }),
        options: { requireReset: true, meta: { name: `Open ${view.title}` } },
      })),
  );

  const renderItem = (item: (typeof items)[number]) => {
    if (item.onClick) {
      return (
        <button
          key={item.title}
          onClick={() => {
            item.onClick?.();
            setOpenMobile(false);
          }}
        >
          <HugeiconsIcon icon={item.icon} strokeWidth={2} />
          <span>{item.title}</span>
        </button>
      );
    }

    return (
      <Link
        to={item.url}
        key={item.title}
        activeProps={{
          className: "bg-muted",
        }}
        activeOptions={{
          exact: true,
        }}
        onClick={() => {
          setOpenMobile(false);
        }}
      >
        <HugeiconsIcon icon={item.icon} strokeWidth={2} />
        <span>{item.title}</span>
      </Link>
    );
  };

  return (
    <Sidebar>
      <SidebarHeader className="h-14 flex-row items-center justify-end pl-[env(titlebar-area-x,0.5rem)] app-drag">
        <AddBudgetButton onClick={() => setOpenMobile(false)} />
        <div className="hidden md:block">
          <SidebarTrigger />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    render={renderItem(item)}
                    tooltip={goToTooltip(item.title, item.hotkeyId)}
                  />
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={openDialog}
                  tooltip={{
                    hidden: false,
                    children: (
                      <>
                        Search <ShortcutKeys id="palette.open" />
                      </>
                    ),
                  }}
                >
                  <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
                  Search
                </SidebarMenuButton>
                <HotkeyHint id="palette.open" className={rowHintClassName} />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {!isFavoriteViewsLoading && !isFavoriteViewsEmpty && (
          <SidebarGroup>
            <SidebarGroupLabel>
              <div className="flex items-center gap-1">Favorites</div>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {favoriteViews?.views.map((view, index) => (
                  <SidebarMenuItem key={view.id}>
                    <SidebarMenuButton
                      render={
                        <Link
                          to="/dashboard/views/$id"
                          params={{ id: view.id }}
                          activeProps={{
                            className: "bg-muted",
                          }}
                          activeOptions={{
                            exact: true,
                          }}
                          onClick={() => setOpenMobile(false)}
                        />
                      }
                    >
                      <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} />
                      <span>{view.title}</span>
                    </SidebarMenuButton>
                    <RemoveFavoriteViewButton viewId={view.id} />
                    {index < favoriteHotkeys.length && (
                      <HotkeyHint
                        hotkey={favoriteHotkeys[index]}
                        className={rowHintClassName}
                      />
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="flex-row items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                render={
                  <Link to="/settings" onClick={() => setOpenMobile(false)} />
                }
              />
            }
          >
            <HugeiconsIcon icon={CogIcon} strokeWidth={2} />
            <span className="sr-only">Settings</span>
          </TooltipTrigger>
          <TooltipContent>
            Go to Settings <ShortcutKeys id="nav.preferences" />
          </TooltipContent>
        </Tooltip>
        <WhatsNewButton className="ml-auto" />
        <UpdateButton />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

const RemoveFavoriteViewButton = ({
  viewId,
}: {
  viewId: Id<"budgetViews">;
}) => {
  const { mutate: toggleFavorite, isPending: isToggleFavoritePending } =
    useToggleViewFavorite();

  return (
    <SidebarMenuAction
      showOnHover
      onClick={() =>
        toggleFavorite(
          { viewId },
          {
            onSuccess: () => {
              toast.add({
                type: "success",
                title: "View removed from favorites",
              });
            },
            onError: (e) => {
              const msg =
                e instanceof Error
                  ? e.message
                  : "Could not update favorite status";
              toast.add({ type: "error", title: msg });
            },
          },
        )
      }
      disabled={isToggleFavoritePending}
    >
      {isToggleFavoritePending ? (
        <Spinner />
      ) : (
        <HugeiconsIcon icon={StarOffIcon} strokeWidth={2} />
      )}
      <span className="sr-only">Remove favorite</span>
    </SidebarMenuAction>
  );
};
