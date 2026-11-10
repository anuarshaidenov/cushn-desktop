import { useId, useState } from "react";
import { Pie, PieChart } from "recharts";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import type { BudgetDetail } from "@shared/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useExpenseChartData } from "@/data/expenses";
import {
  type ExpenseSlice,
  formatShare,
  toExpenseSlices,
} from "@/lib/expenseSlices";
import { cn } from "@/lib/utils";
import { MoneyAmount } from "./MoneyAmount";

const SIZE = 232;
const OUTER_RADIUS = 108;
const INNER_RADIUS = 80;
const COLLAPSED_ROWS = 6;

type Props = {
  budget: BudgetDetail;
};

export const ExpensesAllocation = (props: Props) => {
  const { data } = useExpenseChartData(props.budget.id);
  if (!data) return null;

  const { slices, total } = toExpenseSlices(data.expensesData);
  if (slices.length === 0) return null;

  return (
    <AllocationCard
      key={props.budget.id}
      slices={slices}
      total={total}
      currency={props.budget.currency}
    />
  );
};

const AllocationCard = (props: {
  slices: ExpenseSlice[];
  total: number;
  currency: string;
}) => {
  const listId = useId();
  const [view, setView] = useState<{
    active: number | null;
    expanded: boolean;
  }>({ active: null, expanded: false });

  const highlight = (active: number | null) =>
    setView((prev) => (prev.active === active ? prev : { ...prev, active }));
  const activeSlice =
    view.active === null ? undefined : props.slices[view.active];
  const isDimmed = (index: number) => !!activeSlice && view.active !== index;
  const isHidden = (index: number) => !view.expanded && index >= COLLAPSED_ROWS;
  const count = props.slices.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-normal text-muted-foreground">
          Expenses allocation
        </CardTitle>
      </CardHeader>
      <CardContent className="@container">
        {/* Highlight clears on leaving the whole area, not each mark, so crossing gaps doesn't flicker. */}
        <div
          className="flex flex-col items-center gap-6 @xl:flex-row @xl:items-start @xl:gap-10"
          onPointerLeave={() => highlight(null)}
        >
          <div className="relative size-58 shrink-0">
            <div
              aria-hidden
              className="[&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden"
            >
              <PieChart width={SIZE} height={SIZE}>
                <Pie
                  data={props.slices.map((slice, index) => ({
                    name: slice.name,
                    value: slice.value,
                    fill: slice.color,
                    className: cn(
                      "origin-center transition-[scale,opacity] duration-150 ease-out-quint motion-reduce:transition-opacity",
                      view.active === index && "scale-[1.04]",
                      isDimmed(index) && "opacity-30",
                    ),
                  }))}
                  dataKey="value"
                  startAngle={90}
                  endAngle={-270}
                  innerRadius={INNER_RADIUS}
                  outerRadius={OUTER_RADIUS}
                  stroke={count > 1 ? "var(--card)" : "none"}
                  strokeWidth={2}
                  rootTabIndex={-1}
                  isAnimationActive={false}
                  onMouseEnter={(_, index) => highlight(index)}
                />
              </PieChart>
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex max-w-36 flex-col items-center text-center">
                <span className="max-w-full truncate text-xs text-muted-foreground">
                  {activeSlice ? activeSlice.name : "Total"}
                </span>
                <MoneyAmount
                  value={activeSlice ? activeSlice.value : props.total}
                  currency={props.currency}
                  className="text-lg font-medium uppercase"
                />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {activeSlice
                    ? formatShare(activeSlice.share)
                    : `${count} expense${count === 1 ? "" : "s"}`}
                </span>
              </div>
            </div>
          </div>

          <div className="flex w-full min-w-0 flex-1 flex-col @xl:min-h-58 @xl:justify-center">
            <ul
              id={listId}
              className="-mx-2"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  highlight(null);
                }
              }}
            >
              {props.slices.map((slice, index) => (
                <SliceRow
                  key={index}
                  slice={slice}
                  currency={props.currency}
                  hidden={isHidden(index)}
                  dimmed={isDimmed(index)}
                  onHighlight={() => highlight(index)}
                />
              ))}
            </ul>
            {count > COLLAPSED_ROWS && (
              <Button
                variant="ghost"
                size="xs"
                aria-controls={listId}
                aria-expanded={view.expanded}
                className="mt-1 -ml-2 self-start text-muted-foreground tabular-nums aria-expanded:bg-transparent aria-expanded:text-muted-foreground aria-expanded:hover:bg-accent aria-expanded:hover:text-accent-foreground dark:aria-expanded:hover:bg-accent/50"
                onPointerEnter={() => highlight(null)}
                onClick={() =>
                  setView((prev) => ({ ...prev, expanded: !prev.expanded }))
                }
              >
                {view.expanded ? "Show less" : `Show all (${count})`}
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  strokeWidth={2}
                  className={cn(
                    "transition-transform duration-200 ease-out-quint motion-reduce:transition-none",
                    view.expanded && "rotate-180",
                  )}
                />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const SliceRow = (props: {
  slice: ExpenseSlice;
  currency: string;
  hidden: boolean;
  dimmed: boolean;
  onHighlight: () => void;
}) => (
  <li
    tabIndex={0}
    inert={props.hidden}
    className={cn(
      "grid rounded outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
      "transition-[grid-template-rows] duration-200 ease-out-quint motion-reduce:transition-none",
      props.hidden ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
    )}
    onPointerEnter={props.onHighlight}
    onFocus={props.onHighlight}
  >
    <div
      className={cn(
        "min-h-0 overflow-hidden transition-opacity duration-150 ease-out-quint",
        props.hidden ? "opacity-0" : props.dimmed && "opacity-30",
      )}
    >
      <div className="flex items-center gap-3 px-2 py-2 text-sm">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-[3px]"
          style={{ backgroundColor: props.slice.color }}
        />
        <span title={props.slice.name} className="min-w-0 flex-1 truncate">
          {props.slice.name}
        </span>
        <MoneyAmount
          value={props.slice.value}
          currency={props.currency}
          className="shrink-0 uppercase"
        />
        <span className="w-10 shrink-0 text-right text-muted-foreground tabular-nums">
          {formatShare(props.slice.share)}
        </span>
      </div>
    </div>
  </li>
);
