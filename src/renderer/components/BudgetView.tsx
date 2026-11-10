import { useEffect, useRef, useState } from "react";
import { useDebounce } from "@uidotdev/usehooks";
import { toast } from "@/components/ui/toast";
import type { Id } from "@shared/domain";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { MAX_BUDGET_VIEW_DESCRIPTION_LENGTH } from "@/constants";
import { useUpdateView } from "@/data/views";

type BudgetViewModel = {
  id: Id<"budgetViews">;
  title: string;
  description?: string | null;
};

type Props = {
  budgetView: BudgetViewModel;
};

const toFields = (budgetView: BudgetViewModel) => ({
  title: budgetView.title,
  description: (budgetView.description ?? "").slice(
    0,
    MAX_BUDGET_VIEW_DESCRIPTION_LENGTH,
  ),
});

export const BudgetView = (props: Props) => {
  const { budgetView } = props;

  const [fields, setFields] = useState(() => toFields(budgetView));
  const debouncedTitle = useDebounce(fields.title, 500);
  const debouncedDescription = useDebounce(fields.description, 500);
  const previousViewIdRef = useRef(budgetView.id);

  // Two instances: each save keeps its own error toast.
  const { mutate: updateTitle } = useUpdateView();
  const { mutate: updateDescription } = useUpdateView();

  const saveTitle = (newTitle: string) =>
    updateTitle(
      { viewId: budgetView.id, title: newTitle },
      {
        onError: (error) => {
          console.error(error);
          toast.add({ type: "error", title: "Failed to update view title" });
        },
      },
    );

  const saveDescription = (newDescription: string) =>
    updateDescription(
      { viewId: budgetView.id, description: newDescription },
      {
        onError: (error) => {
          console.error(error);
          toast.add({
            type: "error",
            title: "Failed to update view description",
          });
        },
      },
    );

  useEffect(() => {
    if (previousViewIdRef.current === budgetView.id) return;
    previousViewIdRef.current = budgetView.id;
    setFields(toFields(budgetView));
  }, [budgetView.id, budgetView.title, budgetView.description]);

  useEffect(() => {
    if (debouncedTitle === budgetView.title) return;
    saveTitle(debouncedTitle);
  }, [debouncedTitle]);

  useEffect(() => {
    const propDescription = budgetView.description ?? "";
    if (debouncedDescription === propDescription) return;
    saveDescription(debouncedDescription);
  }, [debouncedDescription]);

  return (
    <div>
      <div className="flex flex-col gap-4">
        <Input
          value={fields.title}
          onChange={(e) =>
            setFields((prev) => ({ ...prev, title: e.target.value }))
          }
          placeholder="View title"
          className="bg-background dark:bg-background focus:bg-background focus-visible:bg-background rounded-none border-0 border-none p-0 py-0 text-2xl shadow-none ring-0 outline-none focus-within:outline-0 focus:border-none focus:ring-0 focus:outline-0 focus:outline-none focus-visible:ring-0 md:text-3xl"
        />
        <Textarea
          value={fields.description}
          onChange={(e) =>
            setFields((prev) => ({
              ...prev,
              description: e.target.value.slice(
                0,
                MAX_BUDGET_VIEW_DESCRIPTION_LENGTH,
              ),
            }))
          }
          maxLength={MAX_BUDGET_VIEW_DESCRIPTION_LENGTH}
          placeholder="View description"
          className="bg-background dark:bg-background focus:bg-background focus-visible:bg-background resize-none! rounded-none border-0 border-none p-0 py-0 text-sm shadow-none ring-0 outline-none focus-within:outline-0 focus:border-none focus:ring-0 focus:outline-0 focus:outline-none focus-visible:ring-0 md:text-base"
        />
      </div>
    </div>
  );
};
