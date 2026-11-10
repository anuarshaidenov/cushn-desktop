import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // `p-px` keeps the 1px inset the transparent border used to give the
        // thumb, so its travel math below still lands flush at both ends.
        "peer data-checked:bg-primary data-unchecked:bg-input focus-visible:ring-ring/50 dark:data-unchecked:bg-input/80 relative inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full p-px shadow-(--custom-shadow-control-solid) transition-[background-color,box-shadow,opacity] duration-200 ease-out-quint outline-none after:absolute after:inset-x-0 after:-inset-y-2 focus-visible:ring-[3px] data-disabled:cursor-not-allowed data-disabled:opacity-50",
        // Pressing stretches the thumb toward the side it is about to travel to.
        "[--switch-stretch:0rem] active:not-data-disabled:not-data-readonly:[--switch-stretch:0.25rem]",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          // Checked travel is measured from the track, not the thumb, so a
          // stretched thumb keeps its right edge pinned while it grows left.
          "bg-background dark:data-unchecked:bg-foreground dark:data-checked:bg-primary-foreground pointer-events-none block h-4 w-[calc(1rem+var(--switch-stretch))] rounded-full ring-0 transition-[width,translate,background-color] duration-200 ease-out-quint data-checked:translate-x-[calc(1rem-2px-var(--switch-stretch))] data-unchecked:translate-x-0 motion-reduce:transition-colors",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
