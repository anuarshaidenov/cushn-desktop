import { SelectBudgetView } from "./AddBudgetDialog";
import type { Id } from "@shared/domain";
import { useSetBudgetView } from "@/data/budgets";
import { toast } from "@/components/ui/toast";

type Props = {
  budgetId: Id<"budgets">;
  viewId: Id<"budgetViews"> | null;
};

export const BudgetViewProperty = (props: Props) => {
  const { mutate } = useSetBudgetView();
  const setView = (nextViewId: Id<"budgetViews"> | null) =>
    mutate(
      { budgetId: props.budgetId, viewId: nextViewId },
      {
        onError: (error) => {
          console.error(error);
          toast.add({ type: "error", title: "Failed to set budget view" });
        },
      },
    );

  return (
    <SelectBudgetView
      value={props.viewId ?? "none"}
      triggerClassName="h-5! max-w-[130px] px-2! py-1 text-xs after:-inset-y-1.5"
      onValueChange={(value) => {
        if (value === "none") {
          setView(null);
          return;
        }
        setView(value as Id<"budgetViews">);
      }}
    />
  );
};
