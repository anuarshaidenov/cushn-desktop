// Items, submenus and separators come from dropdown-menu.tsx: Base UI's ContextMenu re-exports the Menu parts.
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";

import { cn } from "@/lib/utils";
import { OverlayHotkeysScope } from "./overlay-hotkeys-scope";

function ContextMenu({ ...props }: ContextMenuPrimitive.Root.Props) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

function ContextMenuTrigger({
  onContextMenu,
  ...props
}: ContextMenuPrimitive.Trigger.Props) {
  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      onContextMenu={(event) => {
        // React events bubble out of portalled popups; ignore right-clicks that didn't land in the trigger's DOM.
        if (!event.currentTarget.contains(event.target as Node)) {
          event.preventBaseUIHandler();
        }
        onContextMenu?.(event);
      }}
      {...props}
    />
  );
}

function ContextMenuContent({
  className,
  align,
  alignOffset,
  side,
  sideOffset,
  children,
  ...props
}: ContextMenuPrimitive.Popup.Props &
  Pick<
    ContextMenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-content"
          className={cn(
            "z-50 max-h-(--available-height) min-w-[8rem] origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-xl bg-popover p-1 text-popover-foreground shadow-(--custom-shadow-popover) ease-out-quint outline-none data-closed:animate-out data-closed:duration-100 data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
            className,
          )}
          {...props}
        >
          <OverlayHotkeysScope>{children}</OverlayHotkeysScope>
        </ContextMenuPrimitive.Popup>
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

export { ContextMenu, ContextMenuContent, ContextMenuTrigger };
