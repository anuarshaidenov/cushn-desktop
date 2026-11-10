import type { HomeMainBudget } from "@shared/api";
import { HomeLinkRow, HomeSection } from "./HomeSection";
import { MoneyAmount } from "./MoneyAmount";

type Props = {
  budget: HomeMainBudget;
};

export const HomeBiggestExpenses = ({ budget }: Props) => {
  const share = (amount: number) =>
    budget.spent > 0 ? amount / budget.spent : 0;
  const total = budget.biggestExpenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <HomeSection
      title="Biggest expenses"
      action={
        <span className="text-xs text-muted-foreground tabular-nums">
          {Math.round(share(total) * 100)}% of spending
        </span>
      }
    >
      {budget.biggestExpenses.map((expense) => (
        <HomeLinkRow key={expense.id} budgetId={budget.id}>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="flex min-w-0 items-baseline gap-1.5">
                <span title={expense.title} className="truncate">
                  {expense.title.trim() || "Untitled"}
                </span>
                <span
                  title={expense.categoryName}
                  className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground"
                >
                  {expense.categoryName}
                </span>
              </p>
              <MoneyAmount
                value={expense.amount}
                currency={budget.currency}
                className="shrink-0"
              />
            </div>
            <div
              aria-hidden
              className="h-1 overflow-hidden rounded-full bg-primary/15"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${Math.min(share(expense.amount), 1) * 100}%`,
                }}
              />
            </div>
          </div>
        </HomeLinkRow>
      ))}
    </HomeSection>
  );
};
