import type { Id } from "@shared/domain";
import type {
  BudgetAllocationItem,
  BudgetDetail,
  ExpenseItem,
} from "@shared/api";
import { BudgetIncome } from "./BudgetIncome";
import { BudgetTitle } from "./BudgetTitle";
import { BudgetAllocations } from "./BudgetAllocations";
import { ExpensesAllocation } from "./ExpensesAllocation";
import { BudgetDetailsRich } from "./BudgetDetailsRich";
import { BudgetIcon } from "./BudgetIcon";

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
        <BudgetDetailsRich
          budgetId={props.budget.id}
          description={props.budget.description}
        />
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
      <ExpensesAllocation budget={props.budget} />
    </div>
  );
};
