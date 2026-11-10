import { useId } from "react";
import { Link } from "@tanstack/react-router";
import type { HomeBudget } from "@shared/api";
import { roundMoney } from "@shared/money";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/relativeTime";
import { HomeSectionHeading } from "./HomeSection";
import { MoneyAmount } from "./MoneyAmount";
import { SpendRing } from "./SpendRing";

type Props = {
  budgets: HomeBudget[];
};

export const HomeOtherBudgets = (props: Props) => {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="@container flex flex-col gap-2"
    >
      <HomeSectionHeading
        id={headingId}
        title="Other budgets"
        action={
          // The tiles start 8px below, so the 32px target grows upward instead.
          <Link
            to="/dashboard"
            className="relative rounded-sm text-xs text-muted-foreground transition-colors after:absolute after:-inset-x-2 after:-top-3 after:-bottom-1 hover:text-foreground"
          >
            See all
          </Link>
        }
      />
      {/* An odd last tile spans the row, so the grid never ends on a hole. */}
      <ul className="grid grid-cols-1 gap-3 @md:grid-cols-2 @md:[&>li:last-child:nth-child(odd)]:col-span-2">
        {props.budgets.map((budget) => (
          <li key={budget.id} className="min-w-0">
            <OtherBudget budget={budget} />
          </li>
        ))}
      </ul>
    </section>
  );
};

const OtherBudget = ({ budget }: { budget: HomeBudget }) => {
  const remaining = roundMoney(budget.income - budget.spent);

  return (
    <Link
      to="/dashboard/$budgetId"
      params={{ budgetId: budget.id }}
      className={cn(
        "flex flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground shadow-(--custom-shadow) outline-none",
        "transition-[transform,box-shadow] duration-200 ease-out-quint hover:shadow-(--custom-shadow-raised)",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        "active:scale-[0.98] active:duration-100 motion-reduce:active:scale-100",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          title={budget.title}
          className="min-w-0 truncate text-sm font-medium"
        >
          {budget.title}
        </span>
        <SpendRing spent={budget.spent} amount={budget.income} />
      </div>
      <div className="flex flex-col gap-0.5">
        <MoneyAmount
          value={remaining}
          currency={budget.currency}
          className={cn(
            "text-xl font-medium tracking-tight",
            remaining < 0 && "text-destructive",
          )}
        />
        <p className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
          <span className="truncate">
            left of{" "}
            <MoneyAmount value={budget.income} currency={budget.currency} />
          </span>
          <time
            dateTime={new Date(budget.lastActivityAt).toISOString()}
            className="shrink-0 tabular-nums"
          >
            {formatRelativeTime(budget.lastActivityAt)}
          </time>
        </p>
      </div>
    </Link>
  );
};
