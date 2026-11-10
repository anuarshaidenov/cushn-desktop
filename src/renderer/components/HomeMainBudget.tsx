import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import type { HomeAllocation, HomeMainBudget as Budget } from "@shared/api";
import { roundMoney } from "@shared/money";
import { cn } from "@/lib/utils";
import { HomeSectionHeading } from "./HomeSection";
import { MoneyAmount } from "./MoneyAmount";

const UNALLOCATED = "unallocated";

type Props = {
  budget: Budget;
};

export const HomeMainBudget = ({ budget }: Props) => {
  const headingId = useId();
  const [hovered, setHovered] = useState<string | null>(null);
  const remaining = roundMoney(budget.income - budget.spent);
  const allocated = roundMoney(
    budget.allocations.reduce((sum, a) => sum + a.amount, 0),
  );
  const unallocated = Math.max(roundMoney(budget.income - allocated), 0);

  const dim = (id: string) =>
    cn(
      "transition-opacity duration-150 ease-out-quint motion-reduce:transition-none",
      hovered !== null && hovered !== id && "opacity-30",
    );

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <HomeSectionHeading id={headingId} title="Current budget" />
      <Link
        to="/dashboard/$budgetId"
        params={{ budgetId: budget.id }}
        className={cn(
          "@container flex flex-col gap-5 rounded-xl bg-card p-4 text-card-foreground shadow-(--custom-shadow) outline-none md:p-5",
          "transition-[transform,box-shadow] duration-200 ease-out-quint hover:shadow-(--custom-shadow-raised)",
          "focus-visible:ring-3 focus-visible:ring-ring/50",
          "active:scale-[0.99] active:duration-100 motion-reduce:active:scale-100",
        )}
      >
        <div className="flex items-baseline-last justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="flex min-w-0 items-center gap-0.5 text-sm font-medium">
              <span title={budget.title} className="truncate">
                {budget.title}
              </span>
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                className="size-3.5 shrink-0 text-muted-foreground"
              />
            </h3>
            <MoneyAmount
              value={remaining}
              currency={budget.currency}
              className={cn(
                "text-2xl font-medium tracking-tight md:text-3xl",
                remaining < 0 && "text-destructive",
              )}
            />
          </div>
          <p className="shrink-0 text-right text-sm text-muted-foreground">
            left of{" "}
            <MoneyAmount
              value={budget.income}
              currency={budget.currency}
              className="text-foreground"
            />
          </p>
        </div>

        {budget.allocations.length > 0 ? (
          <div
            className="flex flex-col gap-4"
            onPointerLeave={() => setHovered(null)}
          >
            <div aria-hidden className="flex h-3 w-full gap-0.5">
              {budget.allocations.map((allocation) => (
                <AllocationSegment
                  key={allocation.id}
                  allocation={allocation}
                  className={dim(allocation.id)}
                  onHover={() => setHovered(allocation.id)}
                />
              ))}
              {unallocated > 0 && (
                <div
                  className={cn(
                    "h-full min-w-0.5 rounded-[3px] border border-dashed border-foreground/20",
                    dim(UNALLOCATED),
                  )}
                  style={{ flex: `${unallocated} 1 0` }}
                  onPointerEnter={() => setHovered(UNALLOCATED)}
                />
              )}
            </div>

            <ul className="grid grid-cols-1 gap-x-6 @md:grid-cols-2">
              {budget.allocations.map((allocation) => (
                <LegendRow
                  key={allocation.id}
                  label={allocation.categoryName}
                  className={dim(allocation.id)}
                  onHover={() => setHovered(allocation.id)}
                  value={
                    <>
                      <MoneyAmount
                        value={allocation.spent}
                        className={
                          allocation.spent > allocation.amount
                            ? "text-destructive"
                            : "text-foreground"
                        }
                      />{" "}
                      / <MoneyAmount value={allocation.amount} />
                    </>
                  }
                />
              ))}
              {unallocated > 0 && (
                <LegendRow
                  label="Unallocated"
                  muted
                  className={dim(UNALLOCATED)}
                  onHover={() => setHovered(UNALLOCATED)}
                  value={
                    <MoneyAmount
                      value={unallocated}
                      currency={budget.currency}
                    />
                  }
                />
              )}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No categories in this budget yet.
          </p>
        )}
      </Link>
    </section>
  );
};

const AllocationSegment = (props: {
  allocation: HomeAllocation;
  className: string;
  onHover: () => void;
}) => {
  const { spent, amount } = props.allocation;
  const overspent = spent > amount;
  const fill = overspent ? 1 : amount > 0 ? Math.max(spent, 0) / amount : 0;

  return (
    <div
      className={cn(
        "h-full min-w-0.5 overflow-hidden rounded-[3px] bg-primary/15",
        props.className,
      )}
      style={{ flex: `${amount} 1 0` }}
      onPointerEnter={props.onHover}
    >
      <div
        className={cn(
          "h-full transition-transform duration-250 ease-out-quint motion-reduce:transition-none",
          overspent ? "bg-destructive" : "bg-primary",
        )}
        style={{ transform: `translateX(${(fill - 1) * 100}%)` }}
      />
    </div>
  );
};

const LegendRow = (props: {
  label: string;
  value: React.ReactNode;
  className: string;
  muted?: boolean;
  onHover: () => void;
}) => (
  <li
    className={cn(
      "flex items-baseline justify-between gap-3 border-t border-border/60 py-2 text-sm",
      props.className,
    )}
    onPointerEnter={props.onHover}
  >
    <span
      title={props.label}
      className={cn("min-w-0 truncate", props.muted && "text-muted-foreground")}
    >
      {props.label}
    </span>
    <span className="shrink-0 whitespace-nowrap text-muted-foreground tabular-nums">
      {props.value}
    </span>
  </li>
);
