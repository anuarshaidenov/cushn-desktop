import { cn } from "@/lib/utils";

type Props = {
  spent: number;
  amount: number;
  className?: string;
};

export const SpendMeter = (props: Props) => {
  const overspent = props.spent > props.amount;
  const fill = overspent
    ? 1
    : props.amount > 0
      ? Math.max(props.spent, 0) / props.amount
      : 0;

  return (
    <div
      aria-hidden
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-primary/15",
        props.className,
      )}
    >
      {/* Translated rather than scaled, so the rounded end keeps its shape. */}
      <div
        className={cn(
          "h-full rounded-full transition-transform duration-250 ease-out-quint motion-reduce:transition-none",
          overspent ? "bg-destructive" : "bg-primary",
        )}
        style={{ transform: `translateX(${(fill - 1) * 100}%)` }}
      />
    </div>
  );
};
