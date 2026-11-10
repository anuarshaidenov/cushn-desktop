import { cn } from "@/lib/utils";

const SIZE = 20;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type Props = {
  spent: number;
  amount: number;
  className?: string;
};

export const SpendRing = (props: Props) => {
  const overspent = props.spent > props.amount;
  const fill = overspent
    ? 1
    : props.amount > 0
      ? Math.max(props.spent, 0) / props.amount
      : 0;

  return (
    <svg
      aria-hidden
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={cn("shrink-0 -rotate-90", props.className)}
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        strokeWidth={STROKE}
        className="stroke-primary/15"
      />
      {fill > 0 && (
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fill)}
          className={overspent ? "stroke-destructive" : "stroke-primary"}
        />
      )}
    </svg>
  );
};
