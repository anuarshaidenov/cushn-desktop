import { type ComponentProps, type ReactNode, memo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  ArrowUp02Icon,
  DragDropVerticalIcon,
  MoreVerticalCircle01Icon,
  SidebarLeftIcon,
} from "@hugeicons/core-free-icons";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

// The Lisbon trip, captured from the app, scrolled to Food & fun (500 €). The story types the last row.
const EXPENSES = [
  ["Seafood dinner", 132],
  ["Sintra day trip", 89],
  ["Fado night", 64],
  ["Surf lesson", 75],
  ["Market lunch", 58],
] as const;

export const NEW_EXPENSE = { title: "Stadium tour", cost: 99, paid: "115 usd" };
export const TOTAL = { before: 418, after: 517 };
// What's left, as a figure: 82 €, then 17 € under zero.
export const LEFT = { before: 82, after: 17 };

// Each digit is a one-line window over three decades of figures.
const STRIP = [..."012345678901234567890123456789"];
export const shift = (at: number) => `translateY(calc(${-at} * 1lh))`;

const Figure = ({ value }: { value: number }) => (
  <span data-figure>
    {[...String(value)].map((digit, index) => (
      <span key={index} className="ovs-digit">
        <span
          className="ovs-strip"
          style={{ transform: shift(10 + Number(digit)) }}
        >
          {STRIP.map((figure, at) => (
            <span key={at}>{figure}</span>
          ))}
        </span>
      </span>
    ))}
  </span>
);

// The amounts' copy button only shows on hover; here it just holds its room.
const CopySpacer = () => (
  <span className="hidden size-6 shrink-0 @min-[480px]:block" />
);

const ExpenseRow = ({
  title,
  amount,
  ...props
}: { title: string; amount: number } & ComponentProps<"div">) => (
  <div className="group flex w-full items-center gap-2" {...props}>
    <div className="flex items-center gap-2 @min-[480px]:-ml-8">
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground">
        <HugeiconsIcon
          icon={DragDropVerticalIcon}
          strokeWidth={2}
          className="size-3.5"
        />
      </span>
    </div>
    <div className="flex w-full min-w-0 items-center justify-between">
      <div className="h-9 w-full min-w-0 content-center truncate bg-background p-0 pb-1 text-lg @min-[480px]:text-xl">
        {title}
      </div>
      <div className="relative flex h-9 w-28 min-w-0 items-center bg-background p-0 @min-[480px]:w-48 @min-[480px]:text-3xl">
        <div className="block h-9 w-48 min-w-0 flex-1 content-center truncate bg-transparent px-3 py-1 pt-0 pr-2 pl-0 text-right text-lg tabular-nums @min-[480px]:text-xl">
          {amount}
        </div>
        <div className="order-last flex h-auto items-center justify-center gap-2 py-1.5 pr-0 text-sm font-medium text-muted-foreground">
          <span className="flex items-center gap-2 pb-1 text-lg text-muted-foreground">
            €
          </span>
        </div>
      </div>
    </div>
    <span className="relative inline-flex size-6 shrink-0 items-center justify-center rounded-full @min-[480px]:-mr-8 @min-[480px]:opacity-0">
      <HugeiconsIcon
        icon={MoreVerticalCircle01Icon}
        strokeWidth={2}
        className="size-3.5 text-muted-foreground"
      />
    </span>
  </div>
);

const SummaryLine = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div className="flex items-center justify-between">
    <p className="ml-8 text-muted-foreground @min-[480px]:ml-0">{label}</p>
    <div className="mr-8 @min-[480px]:mr-0">
      <div className="flex items-center gap-2 @min-[480px]:-mr-8">
        {children}
        <CopySpacer />
      </div>
    </div>
  </div>
);

/**
 * The budget page in a window with the sidebar collapsed. Renders the story's start, or with
 * `finished` its end; OverspendDemo finds its parts by their data attributes and plays the rest.
 */
export const OverspendDemoWindow = memo(
  ({ finished, className }: { finished: boolean; className?: string }) => (
    <div
      className={cn(
        "relative rounded-xl after:pointer-events-none after:absolute after:inset-0 after:rounded-xl after:shadow-(--custom-shadow-chrome)",
        className,
      )}
    >
      <div className="@container relative h-full overflow-hidden rounded-xl">
        <div className="absolute top-[22px] left-[18px] z-20 flex gap-2">
          <span className="size-3 rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.2)]" />
          <span className="size-3 rounded-full bg-[#febc2e] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.2)]" />
          <span className="size-3 rounded-full bg-[#28c840] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.2)]" />
        </div>
        <div className="flex h-full w-full bg-sidebar p-1">
          <div className="h-full min-w-0 flex-1 rounded-xl bg-background shadow-(--custom-shadow-raised)">
            <div className="flex h-full flex-col overflow-hidden">
              <header className="sticky top-0 z-10 flex h-12 items-center rounded-t-xl border-b bg-background px-4 py-2 pl-20">
                <span className="relative mr-2 inline-flex size-7 shrink-0 items-center justify-center rounded-full">
                  <HugeiconsIcon
                    icon={SidebarLeftIcon}
                    strokeWidth={2}
                    className="size-4 text-muted-foreground"
                  />
                </span>
                <ol className="flex flex-wrap items-center gap-1.5 text-sm break-words text-muted-foreground @min-[480px]:gap-2.5">
                  <li className="inline-flex items-center gap-1.5">Budgets</li>
                  <li className="[&>svg]:size-3.5">
                    <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
                  </li>
                  <li className="inline-flex items-center gap-1.5">
                    <span className="truncate font-normal text-foreground">
                      Lisbon trip
                    </span>
                  </li>
                </ol>
              </header>
              <div className="h-auto w-full border-b bg-background px-4 py-2">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-xs text-muted-foreground">
                    October 1, 2026
                  </span>
                  <span className="text-xs text-muted-foreground">Travel</span>
                </div>
              </div>
              <div className="h-full min-h-0 flex-1 overflow-hidden">
                <div className="mx-auto max-w-3xl px-4 pt-6 @min-[480px]:px-10">
                  <div className="mb-10">
                    <div className="mb-6 flex justify-between @min-[480px]:items-start">
                      <div className="flex flex-col gap-2">
                        <div className="text-lg text-muted-foreground">
                          Food &amp; fun
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Meals, tours and tickets
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-muted-foreground">
                        <div className="flex flex-col text-lg font-medium @min-[480px]:items-end">
                          <div className="flex items-center gap-2 @min-[480px]:-mr-8">
                            <span className="tabular-nums">
                              500 <span className="uppercase">€</span>
                            </span>
                            <CopySpacer />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-5">
                      {EXPENSES.map(([title, amount]) => (
                        <ExpenseRow key={title} title={title} amount={amount} />
                      ))}
                      <ExpenseRow
                        data-new-expense
                        hidden={!finished}
                        title={NEW_EXPENSE.title}
                        amount={NEW_EXPENSE.cost}
                      />
                      <div data-after-new className="flex flex-col gap-5">
                        <SummaryLine label="Total expenses">
                          <span
                            data-total
                            className="text-lg text-muted-foreground tabular-nums"
                          >
                            <Figure
                              value={finished ? TOTAL.after : TOTAL.before}
                            />{" "}
                            €
                          </span>
                        </SummaryLine>
                        <SummaryLine label="Remaining amount">
                          <span
                            data-remaining
                            data-tone={finished ? "over" : "under"}
                            className="text-lg tabular-nums"
                          >
                            <span
                              data-sign
                              data-closed={finished ? undefined : ""}
                            >
                              -
                            </span>
                            <Figure
                              value={finished ? LEFT.after : LEFT.before}
                            />{" "}
                            €
                          </span>
                        </SummaryLine>
                        <div
                          data-add-expense-group
                          className="group/input-group relative flex h-9 w-full min-w-0 items-center rounded-full shadow-(--custom-shadow-control) transition-[color,box-shadow] outline-none data-focused:ring-[3px] data-focused:ring-ring/50 dark:bg-input/30"
                        >
                          <div
                            data-add-expense
                            className="h-9 w-full min-w-0 flex-1 content-center truncate rounded-none bg-transparent px-3 py-1 text-base tabular-nums @min-[480px]:text-sm"
                          >
                            <span
                              data-placeholder
                              className="text-muted-foreground"
                            >
                              Add expense, e.g. Coffee 20k + 5k or Rent 200 usd
                            </span>
                          </div>
                          <div className="order-last flex h-auto items-center justify-center gap-2 py-1.5 pr-3 text-sm font-medium text-muted-foreground has-[>button]:mr-[-0.45rem] has-[>kbd]:mr-[-0.35rem] [&>kbd]:rounded-[calc(var(--radius)-5px)]">
                            <span
                              data-conversion
                              hidden
                              className="flex h-6 origin-right items-center gap-1 rounded-full bg-muted px-2.5 text-xs text-muted-foreground"
                            >
                              <span>≈</span>
                              <span className="font-medium whitespace-nowrap text-foreground tabular-nums">
                                {NEW_EXPENSE.cost} €
                              </span>
                            </span>
                            <KbdGroup className="hidden group-data-hint/input-group:inline-flex">
                              <Kbd>⌘</Kbd>
                              <Kbd>E</Kbd>
                            </KbdGroup>
                            <span className="relative inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                              <HugeiconsIcon
                                icon={ArrowUp02Icon}
                                strokeWidth={2}
                                className="size-3.5 translate-y-[0.5px] text-muted-foreground"
                              />
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div
                    data-after-allocation
                    className="flex flex-col gap-6 rounded-xl bg-card py-4 text-card-foreground shadow-(--custom-shadow)"
                  >
                    <div className="px-6 text-lg text-muted-foreground">
                      Expenses allocation
                    </div>
                    <div className="h-58" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ),
);
