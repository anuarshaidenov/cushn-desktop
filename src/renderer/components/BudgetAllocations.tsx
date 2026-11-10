import { AddExpense } from "./AddExpense";
import { Expenses } from "./Expenses";
import type { Id } from "@shared/domain";
import type { BudgetAllocationItem, ExpenseItem } from "@shared/api";
import { useCreateExpenses } from "@/data/expenses";
import { cn, formatNumberWithSpaces, getCurrencySymbol } from "@/lib/utils";
import { AmountClipboardWrapper } from "./AmountClipboardWrapper";
import { useMemo } from "react";
import { useExpenseClipboardStore } from "@/stores/useExpenseClipboardStore";
import { Button } from "./ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { ClipboardPasteIcon } from "@hugeicons/core-free-icons";
import { toast } from "@/components/ui/toast";
import { useAddExpenseShortcuts } from "@/hooks/use-add-expense-shortcuts";

type Props = {
  allocations: BudgetAllocationItem[];
  expensesByAllocation: Partial<Record<Id<"budgetAllocations">, ExpenseItem[]>>;
};

export const BudgetAllocations = (props: Props) => {
  useAddExpenseShortcuts();
  const canCycleAddExpense =
    props.allocations.filter((allocation) => allocation.editable).length > 1;

  return (
    <div className="flex flex-col gap-14">
      {props.allocations.map((allocation) => (
        <BudgetAllocation
          key={allocation.id}
          allocation={allocation}
          expenses={props.expensesByAllocation[allocation.id] ?? []}
          showCycleHint={canCycleAddExpense}
        />
      ))}
    </div>
  );
};

const BudgetAllocation = (props: {
  allocation: BudgetAllocationItem;
  expenses: ExpenseItem[];
  showCycleHint: boolean;
}) => {
  const totalExpenses = useMemo(
    () => props.expenses.reduce((acc, expense) => acc + expense.amount, 0),
    [props.expenses],
  );
  const remainingAmount = props.allocation.amount - totalExpenses;

  const clipboardExpenses = useExpenseClipboardStore((state) => state.expenses);
  const { mutateAsync, isPending: isPasting } = useCreateExpenses();
  // `mutateAsync`: per-call `mutate` callbacks are skipped if this unmounts mid-paste.
  const pasteExpenses = async () => {
    const id = toast.add({ type: "loading", title: "Pasting expenses..." });
    try {
      await mutateAsync({
        budgetId: props.allocation.budgetId,
        allocationId: props.allocation.id,
        items: clipboardExpenses,
      });
      toast.update(id, {
        type: "success",
        title: `${clipboardExpenses.length} expense(s) pasted`,
      });
    } catch {
      toast.update(id, { type: "error", title: "Failed to paste expenses" });
    }
  };

  return (
    <div>
      <div className="mb-6 flex justify-between md:items-start">
        <div className="flex flex-col gap-2">
          <h2 className="text-muted-foreground text-lg">
            {props.allocation.categoryName}
          </h2>
          {props.allocation.description && (
            <p className="text-muted-foreground text-sm">
              {props.allocation.description}
            </p>
          )}
        </div>

        <div className="text-muted-foreground shrink-0 text-right">
          <div className="flex flex-col text-lg font-medium md:items-end">
            <AmountClipboardWrapper value={props.allocation.amount}>
              <span className="tabular-nums">
                {formatNumberWithSpaces(props.allocation.amount)}{" "}
                <span className="uppercase">
                  {getCurrencySymbol(props.allocation.currency)}
                </span>
              </span>
            </AmountClipboardWrapper>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-5">
        <Expenses expenses={props.expenses} />
        {!!totalExpenses && (
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground ml-8 lg:ml-0">
              Total expenses
            </p>
            <div className="mr-8 lg:mr-0">
              <AmountClipboardWrapper value={totalExpenses}>
                <span className="text-muted-foreground text-lg tabular-nums">
                  {formatNumberWithSpaces(totalExpenses)}{" "}
                  {getCurrencySymbol(props.allocation.currency)}
                </span>
              </AmountClipboardWrapper>
            </div>
          </div>
        )}
        {remainingAmount !== props.allocation.amount && (
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground ml-8 lg:ml-0">
              Remaining amount
            </p>
            <div className="mr-8 lg:mr-0">
              <AmountClipboardWrapper value={remainingAmount}>
                <span
                  className={cn(
                    "text-lg tabular-nums",
                    remainingAmount < 0 && "text-red-800",
                    remainingAmount > 0 && "text-green-800",
                  )}
                >
                  {formatNumberWithSpaces(remainingAmount)}{" "}
                  {getCurrencySymbol(props.allocation.currency)}
                </span>
              </AmountClipboardWrapper>
            </div>
          </div>
        )}
        {props.allocation.editable && (
          <div className="flex flex-col gap-2">
            <AddExpense
              budgetId={props.allocation.budgetId}
              allocationId={props.allocation.id}
              currency={props.allocation.currency}
              showCycleHint={props.showCycleHint}
            />
            {clipboardExpenses.length > 0 && (
              <Button
                variant="outline"
                size="xs"
                className="gap-1.5 self-start"
                disabled={isPasting}
                onClick={() => pasteExpenses()}
              >
                <HugeiconsIcon icon={ClipboardPasteIcon} strokeWidth={2} className="size-4" />
                Paste {clipboardExpenses.length} expense(s)
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
