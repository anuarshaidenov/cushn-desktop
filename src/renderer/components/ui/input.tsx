import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary/25 dark:bg-input/30 h-9 w-full min-w-0 rounded-full bg-transparent px-3 py-1 text-base shadow-(--custom-shadow-control) transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "[&[type=number]]:tabular-nums",
        "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:shadow-(--custom-shadow-control-invalid)",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
