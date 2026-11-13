import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkSquare02Icon,
  Copy01Icon,
  CopyPlusIcon,
  MoreVerticalCircle01Icon,
  Delete01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "./ui/button";
import type { Id } from "@shared/domain";
import type { ExpenseItem } from "@shared/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDuplicateExpense } from "@/data/expenses";
import { useDeleteExpensesWithUndo } from "@/hooks/use-delete-expenses";
import { toast } from "@/components/ui/toast";
import { Spinner } from "./ui/spinner";
import { createContext, use, useState } from "react";

type SelectedExpenses = {
  /** In list order. */
  ids: Id<"expenses">[];
  copy: () => void;
  /** Called once the selection is deleted. */
  clear: () => void;
};

/** The list's selection, read only by an open menu, so selecting doesn't re-render every row. */
export const SelectedExpensesContext = createContext<SelectedExpenses | null>(
  null,
);

type Props = {
  expense: ExpenseItem;
  onEnterSelectMode?: () => void;
  isSelectMode?: boolean;
};

export const ExpenseActions = ({
  expense,
  onEnterSelectMode,
  isSelectMode,
}: Props) => {
  const [isPending, setIsPending] = useState(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={"ghost"}
            size={"icon-xs"}
            className="lg:-mr-8 lg:opacity-0 lg:group-hover:opacity-100"
          />
        }
      >
        {isPending ? (
          <Spinner />
        ) : (
          <HugeiconsIcon icon={MoreVerticalCircle01Icon} strokeWidth={2} />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {onEnterSelectMode && !isSelectMode && (
          <DropdownMenuItem onClick={onEnterSelectMode} disabled={isPending}>
            <HugeiconsIcon icon={CheckmarkSquare02Icon} strokeWidth={2} />{" "}
            Select
          </DropdownMenuItem>
        )}
        {!isSelectMode && (
          <DuplicateItem
            onDuplicate={() => setIsPending(true)}
            onSettled={() => setIsPending(false)}
            expenseId={expense.id}
          />
        )}
        {isSelectMode && <CopySelectedItem disabled={isPending} />}
        <DeleteItem
          onDelete={() => setIsPending(true)}
          onSettled={() => setIsPending(false)}
          expenseId={expense.id}
          isSelectMode={isSelectMode}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const DuplicateItem = ({
  expenseId,
  onDuplicate,
  onSettled,
}: {
  expenseId: Id<"expenses">;
  onDuplicate: () => void;
  onSettled: () => void;
}) => {
  const { mutateAsync, isPending } = useDuplicateExpense();
  // `mutateAsync`: the menu unmounts this item on close, which skips per-call `mutate` callbacks.
  const duplicate = async () => {
    onDuplicate();
    try {
      await mutateAsync({ expenseId });
    } catch (error) {
      console.error(error);
      toast.add({ type: "error", title: "Failed to duplicate expense" });
    } finally {
      onSettled();
    }
  };

  return (
    <DropdownMenuItem onClick={() => duplicate()} disabled={isPending}>
      <HugeiconsIcon icon={CopyPlusIcon} strokeWidth={2} /> Duplicate
    </DropdownMenuItem>
  );
};

const CopySelectedItem = (props: { disabled: boolean }) => {
  const selected = use(SelectedExpensesContext);
  if (!selected || selected.ids.length === 0) return null;

  return (
    <DropdownMenuItem onClick={() => selected.copy()} disabled={props.disabled}>
      <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} /> Copy to clipboard (
      {selected.ids.length})
    </DropdownMenuItem>
  );
};

const DeleteItem = ({
  expenseId,
  onDelete,
  onSettled,
  isSelectMode,
}: {
  expenseId: Id<"expenses">;
  onDelete: () => void;
  onSettled: () => void;
  isSelectMode?: boolean;
}) => {
  const selected = use(SelectedExpensesContext);
  const { deleteExpenses, isPending } = useDeleteExpensesWithUndo();
  const selectedIds = isSelectMode ? (selected?.ids ?? []) : [];
  const hasSelection = selectedIds.length > 0;

  const handleDelete = async () => {
    onDelete();
    const expenseIds = hasSelection ? selectedIds : [expenseId];
    if ((await deleteExpenses(expenseIds)) && hasSelection) {
      selected?.clear();
    }
    onSettled();
  };

  const deleteLabel = hasSelection
    ? `Delete selected (${selectedIds.length})`
    : "Delete";

  return (
    <DropdownMenuItem
      variant="destructive"
      onClick={() => handleDelete()}
      disabled={isPending}
    >
      <HugeiconsIcon icon={Delete01Icon} strokeWidth={2} /> {deleteLabel}
    </DropdownMenuItem>
  );
};
