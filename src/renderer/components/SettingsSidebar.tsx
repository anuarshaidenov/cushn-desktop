import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Archive02Icon,
  Delete02Icon,
  ArrowLeft02Icon,
  BookOpen02Icon,
  Cursor01Icon,
  DatabaseBackupIcon,
  KeyboardIcon,
  Settings05Icon,
  Tag01Icon,
} from "@hugeicons/core-free-icons";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { Button } from "./ui/button";
import { ShortcutKeys, goToTooltip } from "./ShortcutKeys";
import type { AppHotkeyId } from "@tanstack/react-hotkeys";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const items: {
  title: string;
  url: string;
  icon: IconSvgElement;
  hotkey: AppHotkeyId;
  onClick?: () => void;
  badge?: string;
}[] = [
  {
    title: "Preferences",
    url: "/settings",
    icon: Settings05Icon,
    hotkey: "nav.preferences",
  },
  {
    title: "Keyboard shortcuts",
    url: "/settings/shortcuts",
    icon: KeyboardIcon,
    hotkey: "nav.shortcuts",
  },
  {
    title: "Backup",
    url: "/settings/backup",
    icon: DatabaseBackupIcon,
    hotkey: "nav.backup",
  },
  {
    title: "Agents",
    url: "/settings/agents",
    icon: Cursor01Icon,
    hotkey: "nav.agents",
  },
];

export const SettingsSidebar = () => {
  const { setOpenMobile } = useSidebar();

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
      <SidebarHeader className="h-14 flex-row items-center pl-[env(titlebar-area-x,0.5rem)] app-drag">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={"ghost"}
                size={"xs"}
                render={<Link to="/dashboard" />}
              />
            }
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} /> Dashboard
          </TooltipTrigger>
          <TooltipContent side="right">
            Go to Dashboard <ShortcutKeys id="nav.budgets" />
          </TooltipContent>
        </Tooltip>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    render={renderItem(item)}
                    tooltip={goToTooltip(item.title, item.hotkey)}
                    className={cn(item.badge && "pr-14")}
                  />
                  {item.badge ? (
                    <SidebarMenuBadge
                      className={
                        "rounded-full border border-sidebar-border/70 bg-muted/90 px-1.5 text-[10px] font-medium tracking-wide uppercase"
                      }
                    >
                      {item.badge}
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Budgets</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <Link
                      to="/settings/templates"
                      activeProps={{
                        className: "bg-muted",
                      }}
                      activeOptions={{
                        exact: false,
                      }}
                    />
                  }
                  tooltip={goToTooltip("Templates", "nav.templates")}
                >
                  <HugeiconsIcon icon={BookOpen02Icon} strokeWidth={2} />
                  Templates
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <Link
                      to="/settings/labels"
                      activeProps={{
                        className: "bg-muted",
                      }}
                      activeOptions={{
                        exact: false,
                      }}
                    />
                  }
                  tooltip={goToTooltip("Labels", "nav.labels")}
                >
                  <HugeiconsIcon icon={Tag01Icon} strokeWidth={2} />
                  Labels
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <Link
                      to="/settings/archive"
                      activeProps={{
                        className: "bg-muted",
                      }}
                      activeOptions={{
                        exact: false,
                      }}
                    />
                  }
                  tooltip={goToTooltip("Archive", "nav.archive")}
                >
                  <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />
                  Archive
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <Link
                      to="/settings/trash"
                      activeProps={{
                        className: "bg-muted",
                      }}
                      activeOptions={{
                        exact: false,
                      }}
                    />
                  }
                  tooltip={goToTooltip("Trash", "nav.trash")}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                  Trash
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail collapseOnDrag={false} />
    </Sidebar>
  );
};
