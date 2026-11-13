import { lazy, Suspense } from "react";
import type { Id } from "@shared/domain";
import type {
  BudgetAllocationItem,
  BudgetDetail,
  ExpenseItem,
} from "@shared/api";
import { BudgetIncome } from "./BudgetIncome";
import { BudgetTitle } from "./BudgetTitle";
import { BudgetAllocations } from "./BudgetAllocations";
import { BudgetIcon } from "./BudgetIcon";

// The editor and the chart weigh ~2 MB together, so they load after the page paints.
const BudgetDetailsRich = lazy(() =>
  import("./BudgetDetailsRich").then((module) => ({
    default: module.BudgetDetailsRich,
  })),
);
const ExpensesAllocation = lazy(() =>
  import("./ExpensesAllocation").then((module) => ({
    default: module.ExpensesAllocation,
  })),
);

type Props = {
  budget: BudgetDetail;
  allocations: BudgetAllocationItem[];
  expensesByAllocation: Partial<Record<Id<"budgetAllocations">, ExpenseItem[]>>;
};

export const Budget = (props: Props) => {
  return (
    <div className="h-full pb-20 lg:pb-0">
      <div className="mb-10 flex flex-col gap-4 md:gap-10">
        <div className="flex flex-col gap-2">
          <BudgetIcon
            key={props.budget.id}
            budgetId={props.budget.id}
            icon={props.budget.icon}
          />
          <BudgetTitle budgetId={props.budget.id} title={props.budget.title} />
        </div>
        <Suspense
          fallback={
            <BudgetDetailsFallback description={props.budget.description} />
          }
        >
          <BudgetDetailsRich
            budgetId={props.budget.id}
            description={props.budget.description}
          />
        </Suspense>
      </div>
      <div className="mb-10">
        <BudgetIncome
          budgetId={props.budget.id}
          income={props.budget.income.toString()}
          currency={props.budget.currency}
        />
      </div>
      <div className="mb-10">
        <BudgetAllocations
          allocations={props.allocations}
          expensesByAllocation={props.expensesByAllocation}
        />
      </div>
      {/* Last on the page and often empty, so it reserves no space while it loads. */}
      <Suspense fallback={null}>
        <ExpensesAllocation budget={props.budget} />
      </Suspense>
    </div>
  );
};

/** Holds the editor's place: its empty placeholder, or the description's lines, hidden. */
const BudgetDetailsFallback = (props: { description: string | null }) => (
  <div className="tiptap mx-auto prose w-full max-w-none text-foreground dark:prose-invert prose-p:my-0">
    {props.description ? (
      <div aria-hidden className="invisible">
        {props.description.split(/\n+/).map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
    ) : (
      <p className="is-editor-empty" data-placeholder="Add description">
        <br />
      </p>
    )}
  </div>
);
