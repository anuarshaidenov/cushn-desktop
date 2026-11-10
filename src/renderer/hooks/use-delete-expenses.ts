import type { Id } from "@shared/domain";
import { CushnError } from "@shared/errors";
import { toast } from "@/components/ui/toast";
import { useDeleteExpenses } from "@/data/expenses";
import { showUndoableToast } from "@/lib/undoToast";

export const expensesDeletedTitle = (count: number) =>
  count === 1 ? "Expense deleted" : `${count} expenses deleted`;

/** Deletes expenses with a toast whose Undo puts them back. Resolves `true` on success; failures toast. */
export function useDeleteExpensesWithUndo() {
  const { mutateAsync, isPending } = useDeleteExpenses();

  // `mutateAsync`: the deleted rows unmount their menus before the mutation settles.
  const deleteExpenses = async (expenseIds: Id<"expenses">[]) => {
    if (expenseIds.length === 0) return false;
    try {
      const { result, entry } = await mutateAsync({ expenseIds });
      showUndoableToast({
        title: expensesDeletedTitle(result.deletedCount),
        description:
          result.deleted.length === 1 ? result.deleted[0].title : undefined,
        entry,
      });
      return true;
    } catch (error) {
      console.error(error);
      toast.add({
        type: "error",
        title:
          expenseIds.length === 1
            ? "Couldn't delete expense"
            : "Couldn't delete expenses",
        description: error instanceof CushnError ? error.message : undefined,
      });
      return false;
    }
  };

  return { deleteExpenses, isPending };
}
