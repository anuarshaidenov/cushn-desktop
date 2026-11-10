import { CushnError } from "@shared/errors";
import { toast } from "@/components/ui/toast";
import {
  type BudgetSelection,
  useArchiveBudgets,
  useRestoreBudgets,
  useTrashBudgets,
  useUnarchiveBudgets,
} from "@/data/budgets";
import type { UndoableResult } from "@/data/undoable";
import { showUndoableToast } from "@/lib/undoToast";

type Budgets = BudgetSelection["budgets"];

type UndoableBudgetMutation = {
  mutateAsync: (selection: BudgetSelection) => Promise<UndoableResult<unknown>>;
};

const describe = (budgets: Budgets) =>
  budgets.length === 1 ? budgets[0].title : `${budgets.length} budgets`;

/** Archive, trash, unarchive and restore, each followed by a toast with Undo. They resolve `true` on success; failures toast. */
export function useBudgetActions() {
  const archive = useArchiveBudgets();
  const unarchive = useUnarchiveBudgets();
  const trash = useTrashBudgets();
  const restore = useRestoreBudgets();

  // `mutateAsync`: menu items and rows unmount before the action settles, which skips per-call `mutate` callbacks.
  const run =
    (mutation: UndoableBudgetMutation, done: string, failed: string) =>
    async (budgets: Budgets) => {
      if (budgets.length === 0) return false;
      try {
        const { entry } = await mutation.mutateAsync({ budgets });
        showUndoableToast({
          title: done,
          description: describe(budgets),
          entry,
        });
        return true;
      } catch (error) {
        console.error(error);
        toast.add({
          type: "error",
          title: failed,
          description: error instanceof CushnError ? error.message : undefined,
        });
        return false;
      }
    };

  return {
    archive: run(archive, "Archived", "Couldn't archive"),
    unarchive: run(unarchive, "Unarchived", "Couldn't unarchive"),
    trash: run(trash, "Moved to trash", "Couldn't delete"),
    restore: run(restore, "Restored", "Couldn't restore"),
    isPending:
      archive.isPending ||
      unarchive.isPending ||
      trash.isPending ||
      restore.isPending,
  };
}
