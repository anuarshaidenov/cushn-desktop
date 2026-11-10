import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

type Props = CheckboxPrimitive.Root.Props & {
  children?: React.ReactNode;
};

function Checkbox({ className, ...props }: Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // Hover draws a primary ring over the hairline; a ring is its own
        // shadow layer, so the resting drop stays put underneath it.
        "peer dark:bg-input/30 data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary data-checked:shadow-(--custom-shadow-control-solid) focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:shadow-(--custom-shadow-control-invalid) hover:ring-1 hover:ring-primary relative size-4 shrink-0 rounded shadow-(--custom-shadow-control) transition-shadow outline-none after:absolute after:-inset-2 focus-visible:ring-[3px] data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        {props?.children ? (
          props.children
        ) : (
          <HugeiconsIcon
            icon={Tick02Icon}
            strokeWidth={2}
            className="size-3.5"
          />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
