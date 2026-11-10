import { roundMoney } from "@shared/money";

export const NAMED_COLOR_COUNT = 8;

export type ExpenseSlice = {
  name: string;
  value: number;
  share: number;
  color: string;
};

/** Largest first; amounts of zero or less have no share of the whole and are left out. */
export const toExpenseSlices = (
  expenses: readonly { name: string; value: number }[],
) => {
  const sorted = expenses
    .filter((expense) => expense.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = sorted.reduce((sum, expense) => sum + expense.value, 0);
  const slices = sorted.map((expense, index): ExpenseSlice => ({
    name: expense.name.trim() || "Untitled",
    value: expense.value,
    share: expense.value / total,
    color:
      index < NAMED_COLOR_COUNT
        ? `var(--chart-${index + 1})`
        : "var(--chart-other)",
  }));
  return { slices, total: roundMoney(total) };
};

export const formatShare = (share: number) => {
  const percent = Math.round(share * 100);
  if (share > 0 && percent === 0) return "<1%";
  if (share < 1 && percent === 100) return ">99%";
  return `${percent}%`;
};
