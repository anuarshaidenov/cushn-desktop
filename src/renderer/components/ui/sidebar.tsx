"use client";

import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { HugeiconsIcon } from "@hugeicons/react";
import { SidebarLeftIcon } from "@hugeicons/core-free-icons";

import { useIsMobile } from "@/hooks/use-mobile";
import {
  clampSidebarWidth,
  maxSidebarWidth,
  parseSidebarWidth,
  resolveSidebarDrag,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_KEYBOARD_STEP,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_STORAGE_KEY,
  sidebarWidthCss,
  type SidebarDrag,
} from "@/lib/sidebarWidth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHotkey } from "@tanstack/react-hotkeys";
import { appHotkeys } from "@/lib/hotkeys";
import { ShortcutKeys } from "@/components/ShortcutKeys";

const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH_MOBILE = "13rem";
const SIDEBAR_WIDTH_ICON = "3rem";

type SidebarContextProps = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
  width: number;
  setWidth: (width: number) => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);
const SidebarSideContext = React.createContext<"left" | "right" | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [_open, _setOpen] = React.useState(defaultOpen);
  const open = openProp ?? _open;
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        _setOpen(openState);
      }

      localStorage.setItem(
        SIDEBAR_COOKIE_NAME,
        openState ? "expanded" : "collapsed",
      );

      // This sets the cookie to keep the sidebar state.
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    },
    [setOpenProp, open],
  );

  const [width, _setWidth] = React.useState(() =>
    parseSidebarWidth(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)),
  );
  const setWidth = React.useCallback((value: number) => {
    _setWidth(value);
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(value));
  }, []);

  // Helper to toggle the sidebar.
  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open);
  }, [isMobile, setOpen, setOpenMobile]);

  useHotkey(appHotkeys["sidebar.toggle"], toggleSidebar);

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? "expanded" : "collapsed";

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      width,
      setWidth,
    }),
    [
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      width,
      setWidth,
    ],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delay={0}>
        <div
          data-slot="sidebar-wrapper"
          style={
            {
              "--sidebar-width": sidebarWidthCss(width),
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            "group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar",
            className,
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
}) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <SidebarSideContext.Provider value={side}>
      <div
        className="group peer hidden text-sidebar-foreground md:block"
        data-state={state}
        data-collapsible={state === "collapsed" ? collapsible : ""}
        data-variant={variant}
        data-side={side}
        data-slot="sidebar"
      >
        {/* This is what handles the sidebar gap on desktop */}
        <div
          data-slot="sidebar-gap"
          className={cn(
            "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-out-quint group-data-[resizing]/sidebar-wrapper:transition-none",
            "group-data-[collapsible=offcanvas]:w-0",
            "group-data-[side=right]:rotate-180",
            variant === "floating" || variant === "inset"
              ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
              : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
          )}
        />
        <div
          data-slot="sidebar-container"
          className={cn(
            "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-out-quint group-data-[resizing]/sidebar-wrapper:transition-none md:flex",
            side === "left"
              ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
              : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
            // Adjust the padding for floating and inset variants.
            variant === "floating" || variant === "inset"
              ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
              : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
            className,
          )}
          {...props}
        >
          <div
            data-sidebar="sidebar"
            data-slot="sidebar-inner"
            className="flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-(--custom-shadow) vibrant:bg-transparent"
          >
            {children}
          </div>
        </div>
      </div>
    </SidebarSideContext.Provider>
  );
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            data-sidebar="trigger"
            data-slot="sidebar-trigger"
            variant="ghost"
            size="icon"
            className={cn(
              "relative size-7 after:absolute after:-inset-0.5",
              className,
            )}
            onClick={(event) => {
              onClick?.(event);
              toggleSidebar();
            }}
            {...props}
          />
        }
      >
        <HugeiconsIcon icon={SidebarLeftIcon} strokeWidth={2} />
        <span className="sr-only">Toggle Sidebar</span>
      </TooltipTrigger>
      <TooltipContent side="right" align="center">
        Toggle sidebar <ShortcutKeys id="sidebar.toggle" />
      </TooltipContent>
    </Tooltip>
  );
}

type RailDrag = {
  pointerId: number;
  startX: number;
  startWidth: number;
  /** `null` while the gesture has the sidebar collapsed. */
  width: number | null;
  wrapper: HTMLElement;
  restoreWidth: string;
  cursor: string;
  cursorStyle: HTMLStyleElement;
};

function subscribeToResize(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}

const getViewportWidth = () => window.innerWidth;

function railCursor(
  width: number | null,
  viewportWidth: number,
  side: "left" | "right",
) {
  const [grow, shrink] =
    side === "left" ? ["e-resize", "w-resize"] : ["w-resize", "e-resize"];
  if (width === null || width <= SIDEBAR_WIDTH_MIN) return grow;
  if (width >= maxSidebarWidth(viewportWidth)) return shrink;
  return "col-resize";
}

// Overrides every element's cursor, so it holds wherever the pointer goes mid-drag.
const dragCursorCss = (cursor: string) =>
  `*, *::before, *::after { cursor: ${cursor} !important; user-select: none !important; }`;

function SidebarRail({
  className,
  style,
  collapseOnDrag = true,
  ...props
}: React.ComponentProps<"div"> & {
  collapseOnDrag?: boolean;
}) {
  const { state, setOpen, width, setWidth } = useSidebar();
  const side = React.useContext(SidebarSideContext);
  const viewportWidth = React.useSyncExternalStore(
    subscribeToResize,
    getViewportWidth,
  );
  const dragRef = React.useRef<RailDrag | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const shownWidth = clampSidebarWidth(width, viewportWidth);
  // Stays mounted and live through a mid-drag collapse so pointer capture holds.
  const disabled = state === "collapsed" && !dragging;
  const direction = side === "right" ? -1 : 1;

  const endDrag = React.useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (drag.width === null || drag.width === drag.startWidth) {
      drag.wrapper.style.setProperty("--sidebar-width", drag.restoreWidth);
    } else {
      setWidth(drag.width);
    }
    delete drag.wrapper.dataset.resizing;
    drag.cursorStyle.remove();
    setDragging(false);
  }, [setWidth]);

  React.useEffect(() => endDrag, [endDrag]);

  if (!side) return null;

  const cursor = railCursor(shownWidth, viewportWidth, side);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={shownWidth}
      aria-valuemin={SIDEBAR_WIDTH_MIN}
      aria-valuemax={maxSidebarWidth(viewportWidth)}
      tabIndex={disabled ? -1 : 0}
      data-sidebar="rail"
      data-slot="sidebar-rail"
      data-dragging={dragging || undefined}
      data-disabled={disabled || undefined}
      style={{ cursor, ...style }}
      onPointerDown={(event) => {
        if (disabled || dragRef.current || event.button !== 0) return;
        const wrapper = event.currentTarget.closest<HTMLElement>(
          '[data-slot="sidebar-wrapper"]',
        );
        if (!wrapper) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const cursorStyle = document.createElement("style");
        cursorStyle.textContent = dragCursorCss(cursor);
        document.head.append(cursorStyle);
        wrapper.dataset.resizing = "";
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startWidth: shownWidth,
          width: shownWidth,
          wrapper,
          restoreWidth: wrapper.style.getPropertyValue("--sidebar-width"),
          cursor,
          cursorStyle,
        };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || event.pointerId !== drag.pointerId) return;
        const pointerWidth =
          drag.startWidth + (event.clientX - drag.startX) * direction;
        const viewport = window.innerWidth;
        const next: SidebarDrag = collapseOnDrag
          ? resolveSidebarDrag(pointerWidth, viewport)
          : {
              collapsed: false,
              width: clampSidebarWidth(pointerWidth, viewport),
            };
        if (next.collapsed) {
          if (drag.width !== null) {
            drag.width = null;
            setOpen(false);
          }
        } else if (next.width !== drag.width) {
          drag.wrapper.style.setProperty(
            "--sidebar-width",
            sidebarWidthCss(next.width),
          );
          if (drag.width === null) setOpen(true);
          drag.width = next.width;
        }
        const nextCursor = railCursor(drag.width, viewport, side);
        if (nextCursor !== drag.cursor) {
          drag.cursor = nextCursor;
          drag.cursorStyle.textContent = dragCursorCss(nextCursor);
        }
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={() => {
        if (!disabled) setWidth(SIDEBAR_WIDTH_DEFAULT);
      }}
      onKeyDown={(event) => {
        if (disabled || dragRef.current) return;
        const step = SIDEBAR_WIDTH_KEYBOARD_STEP * direction;
        let next: number;
        switch (event.key) {
          case "ArrowLeft":
            next = shownWidth - step;
            break;
          case "ArrowRight":
            next = shownWidth + step;
            break;
          case "Home":
            next = SIDEBAR_WIDTH_MIN;
            break;
          case "End":
            next = maxSidebarWidth(viewportWidth);
            break;
          default:
            return;
        }
        event.preventDefault();
        setWidth(clampSidebarWidth(next, viewportWidth));
      }}
      className={cn(
        // 8px hit area centred on the 4px gutter between the sidebar and the content card.
        "absolute inset-y-0 z-20 w-2 outline-hidden",
        side === "left" ? "-right-1.5" : "-left-1.5",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:transition-colors after:duration-150",
        "hover:after:bg-sidebar-border hover:after:delay-200",
        "data-dragging:after:bg-sidebar-border data-dragging:after:delay-0",
        "focus-visible:after:bg-sidebar-ring focus-visible:after:delay-0",
        "data-disabled:pointer-events-none data-disabled:after:hidden",
        className,
      )}
      {...props}
    />
  );
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "relative flex w-full flex-1 flex-col bg-background",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-(--custom-shadow) md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className,
      )}
      {...props}
    />
  );
}

function SidebarInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn("h-8 w-full bg-background", className)}
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("mx-2 w-auto bg-sidebar-border", className)}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  );
}

function SidebarGroupLabel({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    render,
    props: mergeProps<"div">(
      {
        "data-slot": "sidebar-group-label",
        "data-sidebar": "group-label",
        className: cn(
          "text-sidebar-foreground/70 ring-sidebar-ring flex h-8 shrink-0 items-center rounded px-2 text-xs font-medium outline-hidden transition-[margin,opacity] duration-200 ease-out-quint focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
          "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
          className,
        ),
      } as React.ComponentProps<"div">,
      props,
    ),
  });
}

function SidebarGroupAction({
  className,
  render,
  ...props
}: useRender.ComponentProps<"button">) {
  return useRender({
    defaultTagName: "button",
    render,
    props: mergeProps<"button">(
      {
        "data-slot": "sidebar-group-action",
        "data-sidebar": "group-action",
        className: cn(
          "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
          // Increases the hit area of the button on mobile.
          "after:absolute after:-inset-1.5",
          "group-data-[collapsible=icon]:hidden",
          className,
        ),
      } as React.ComponentProps<"button">,
      props,
    ),
  });
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-lg p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline:
          "bg-background shadow-(--custom-shadow-control) hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function SidebarMenuButton({
  render,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: useRender.ComponentProps<"button"> & {
  isActive?: boolean;
  tooltip?: string | React.ComponentProps<typeof TooltipContent>;
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const { isMobile, state } = useSidebar();

  const button = useRender({
    defaultTagName: "button",
    render: !tooltip ? render : <TooltipTrigger render={render} />,
    props: mergeProps<"button">(
      {
        "data-slot": "sidebar-menu-button",
        "data-sidebar": "menu-button",
        "data-size": size,
        "data-active": isActive,
        className: cn(sidebarMenuButtonVariants({ variant, size }), className),
      } as React.ComponentProps<"button">,
      props,
    ),
  });

  if (!tooltip) {
    return button;
  }

  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip,
    };
  }

  return (
    <Tooltip>
      {button}
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        {...tooltip}
      />
    </Tooltip>
  );
}

function SidebarMenuAction({
  className,
  render,
  showOnHover = false,
  ...props
}: useRender.ComponentProps<"button"> & {
  showOnHover?: boolean;
}) {
  return useRender({
    defaultTagName: "button",
    render,
    props: mergeProps<"button">(
      {
        "data-slot": "sidebar-menu-action",
        "data-sidebar": "menu-action",
        className: cn(
          "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground peer-hover/menu-button:text-sidebar-accent-foreground absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-full p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
          // Increases the hit area of the button on mobile.
          "after:absolute after:-inset-1.5",
          "peer-data-[size=sm]/menu-button:top-1",
          "peer-data-[size=default]/menu-button:top-1.5",
          "peer-data-[size=lg]/menu-button:top-2.5",
          "group-data-[collapsible=icon]:hidden",
          showOnHover &&
            "peer-data-[active=true]/menu-button:text-sidebar-accent-foreground group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-popup-open:opacity-100 md:opacity-0",
          className,
        ),
      } as React.ComponentProps<"button">,
      props,
    ),
  });
}

function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none",
        "peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        className,
      )}
      {...props}
    />
  );
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<"div"> & {
  showIcon?: boolean;
}) {
  // Random width between 50 to 90%.
  const width = React.useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`;
  }, []);

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-full px-2", className)}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className="size-4 rounded-full"
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            "--skeleton-width": width,
          } as React.CSSProperties
        }
      />
    </div>
  );
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5",
        "group-data-[collapsible=icon]:hidden",
        className,
      )}
      {...props}
    />
  );
}

function SidebarMenuSubItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  );
}

function SidebarMenuSubButton({
  render,
  size = "md",
  isActive = false,
  className,
  ...props
}: useRender.ComponentProps<"a"> & {
  size?: "sm" | "md";
  isActive?: boolean;
}) {
  return useRender({
    defaultTagName: "a",
    render,
    props: mergeProps<"a">(
      {
        "data-slot": "sidebar-menu-sub-button",
        "data-sidebar": "menu-sub-button",
        "data-size": size,
        "data-active": isActive,
        className: cn(
          "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground [&>svg]:text-sidebar-accent-foreground flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-full px-2 outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
          "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
          size === "sm" && "text-xs",
          size === "md" && "text-sm",
          "group-data-[collapsible=icon]:hidden",
          className,
        ),
      } as React.ComponentProps<"a">,
      props,
    ),
  });
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
};
