import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full bg-clip-padding text-sm font-medium whitespace-nowrap select-none outline-none",
    // Press feedback — the button gives under the pointer and springs back.
    // Pressing is instant; releasing gets the slower curve so it settles.
    "transition-[transform,background-color,box-shadow,color,opacity] duration-200 ease-out-quint",
    "active:scale-[0.97] active:duration-100 motion-reduce:active:scale-100",
    // Hovering in is quicker than hovering out, so pointing at things feels immediate.
    "hover:duration-150",
    "focus-visible:ring-ring/50 focus-visible:ring-[1.5px]",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        default:
          "bg-foreground text-background shadow-(--custom-shadow-control-solid) hover:bg-foreground/90",
        destructive:
          "bg-destructive text-white shadow-(--custom-shadow-control-solid) hover:bg-destructive/90 focus-visible:ring-destructive/50 dark:bg-destructive/60",
        outline:
          "bg-background shadow-(--custom-shadow-control) hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50 [&_svg:not([class*='text-'])]:text-muted-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-(--custom-shadow-control) hover:bg-secondary/80 aria-expanded:bg-secondary dark:hover:bg-muted-foreground/25 [&_svg:not([class*='text-'])]:text-muted-foreground",
        ghost:
          "hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground dark:hover:bg-accent/50 [&_svg:not([class*='text-'])]:text-muted-foreground",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
      },
      // Heights stay unprefixed on purpose: a `md:h-*` here would survive a
      // call site's plain `h-*` override and silently win at desktop widths.
      // Padding tightens on whichever side actually holds an icon.
      // Sizes under 32px reach 32px through an invisible `::after`.
      size: {
        default:
          "h-8 gap-1.5 px-3.5 has-[>svg:first-child]:pl-3 has-[>svg:last-child]:pr-3 [&_svg:not([class*='size-'])]:size-4",
        xs: "relative h-6 gap-1 px-2 text-xs has-[>svg:first-child]:pl-1.5 has-[>svg:last-child]:pr-1.5 after:absolute after:inset-x-0 after:-inset-y-1 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "relative h-7 gap-[5px] px-3 has-[>svg:first-child]:pl-[9px] has-[>svg:last-child]:pr-[9px] after:absolute after:inset-x-0 after:-inset-y-0.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-2 px-4 has-[>svg:first-child]:pl-3.5 has-[>svg:last-child]:pr-3.5 [&_svg:not([class*='size-'])]:size-4",
        icon: "size-8 [&_svg:not([class*='size-'])]:size-4",
        "icon-xs":
          "relative size-6 after:absolute after:-inset-1 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm":
          "relative size-7 after:absolute after:-inset-0.5 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-9 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
