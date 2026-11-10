import { useRef, useState } from "react";
import { Input } from "./ui/input";
import type { Id } from "@shared/domain";
import { useUpdateBudget } from "@/data/budgets";
import { useDebouncedSave } from "@/hooks/use-debounced-save";
import { toast } from "@/components/ui/toast";

type Props = {
  title: string;
  budgetId: Id<"budgets">;
};

export const BudgetTitle = (props: Props) => {
  const [title, setTitle] = useState(props.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const { mutateAsync } = useUpdateBudget();

  useDebouncedSave(title, props.title, async (newTitle) => {
    try {
      await mutateAsync({ budgetId: props.budgetId, title: newTitle });
    } catch (error) {
      console.error(error);
      toast.add({ type: "error", title: "Failed to update budget title" });
    }
  });

  return (
    <>
      <h1 className="sr-only">{title}</h1>
      <Input
        ref={inputRef}
        value={title}
        placeholder="Budget title"
        onChange={(e) => setTitle(e.target.value)}
        data-escape-navigates
        className="bg-background dark:bg-background focus:bg-background focus-visible:bg-background rounded-none border-0 border-none p-0 py-0 text-2xl shadow-none ring-0 outline-none focus-within:outline-0 focus:border-none focus:ring-0 focus:outline-0 focus:outline-none focus-visible:ring-0 md:text-3xl"
      />
    </>
  );
};
