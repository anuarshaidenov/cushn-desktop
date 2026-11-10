import type { BudgetLayout } from "@shared/domain";
import { useSettings, useUpdateSettings } from "@/data/settings";

// Stored in `user_settings.budget_view`, not browser storage.
export const useBudgetsView = () => {
  const { data } = useSettings();
  const { mutate } = useUpdateSettings();
  const view: BudgetLayout = data?.settings.budgetView ?? "grid";
  const setView = (
    next: BudgetLayout | ((prevView: BudgetLayout) => BudgetLayout),
  ) => {
    mutate({ budgetView: typeof next === "function" ? next(view) : next });
  };
  return { view, setView };
};
