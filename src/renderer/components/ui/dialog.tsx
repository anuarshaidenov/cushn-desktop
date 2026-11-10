import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { OverlayHotkeysScope } from "./overlay-hotkeys-scope";

/** A `transform-origin` for the centred popup that lands on the opening trigger's centre. */
const DialogOriginContext = React.createContext<string | undefined>(undefined);

function triggerOrigin(trigger: Element | undefined) {
  if (!trigger) return undefined;
  const rect = trigger.getBoundingClientRect();
  const x = rect.left + rect.width / 2 - window.innerWidth / 2;
  const y = rect.top + rect.height / 2 - window.innerHeight / 2;
  return `calc(50% + ${x}px) calc(50% + ${y}px)`;
}

/** `scaleFromTrigger` grows the popup out of the trigger that opened it; otherwise it scales from the centre. */
function Dialog({
  scaleFromTrigger = false,
  onOpenChange,
  ...props
}: DialogPrimitive.Root.Props & { scaleFromTrigger?: boolean }) {
  const [origin, setOrigin] = React.useState<string>();

  return (
    <DialogOriginContext value={origin}>
      <DialogPrimitive.Root
        data-slot="dialog"
        onOpenChange={(open, eventDetails) => {
          if (scaleFromTrigger && open) {
            setOrigin(triggerOrigin(eventDetails.trigger));
          }
          onOpenChange?.(open, eventDetails);
        }}
        {...props}
      />
    </DialogOriginContext>
  );
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        // Base UI unmounts the backdrop when the *popup's* animation ends, so
        // the overlay must not finish (and snap back, fill-mode: none) first.
        "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-50 bg-black/50 duration-200 ease-out-quint fill-mode-forwards data-closed:duration-150",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
}) {
  const origin = React.use(DialogOriginContext);

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          // Popover surface, not page background: on dark that is the lighter
          // tint, so the modal reads as the top layer without an outline.
          "bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl p-6 shadow-(--custom-shadow-overlay) duration-200 ease-out-quint outline-none data-closed:duration-150 sm:max-w-lg",
          // From a distant trigger the extra scale is what makes the origin readable.
          origin
            ? "data-closed:zoom-out-90 data-open:zoom-in-90"
            : "data-closed:zoom-out-95 data-open:zoom-in-95",
          "motion-reduce:data-closed:zoom-out-100 motion-reduce:data-open:zoom-in-100",
          className,
        )}
        style={origin ? { transformOrigin: origin } : undefined}
        {...props}
      >
        <OverlayHotkeysScope>{children}</OverlayHotkeysScope>
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus-visible:ring-ring data-open:bg-accent data-open:text-muted-foreground absolute top-5 right-5 rounded-full opacity-70 transition-opacity after:absolute after:-inset-2 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
