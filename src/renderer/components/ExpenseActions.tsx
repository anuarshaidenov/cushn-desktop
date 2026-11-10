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
import { useState } from "react";

type Props = {
  expense: ExpenseItem;
  onEnterSelectMode?: (expenseId: Id<"expenses">) => void;
  isSelectMode?: boolean;
  selectedIds?: Set<Id<"expenses">>;
  onCopySelected?: () => void;
  onDeleteSelectedSuccess?: () => void;
};

export const ExpenseActions = ({
  expense,
  onEnterSelectMode,
  isSelectMode,
  selectedIds,
  onCopySelected,
  onDeleteSelectedSuccess,
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
          <DropdownMenuItem
            onClick={() => onEnterSelectMode(expense.id)}
            disabled={isPending}
          >
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
        {isSelectMode &&
          onCopySelected &&
          selectedIds &&
          selectedIds.size > 0 && (
            <DropdownMenuItem
              onClick={() => onCopySelected()}
              disabled={isPending}
            >
              <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} /> Copy to
              clipboard ({selectedIds.size})
            </DropdownMenuItem>
          )}
        <DeleteItem
          onDelete={() => setIsPending(true)}
          onSettled={() => setIsPending(false)}
          expenseId={expense.id}
          selectedIds={selectedIds}
          isSelectMode={isSelectMode}
          onDeleteSelectedSuccess={onDeleteSelectedSuccess}
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

const DeleteItem = ({
  expenseId,
  onDelete,
  onSettled,
  selectedIds,
  isSelectMode,
  onDeleteSelectedSuccess,
}: {
  expenseId: Id<"expenses">;
  onDelete: () => void;
  onSettled: () => void;
  selectedIds?: Set<Id<"expenses">>;
  isSelectMode?: boolean;
  onDeleteSelectedSuccess?: () => void;
}) => {
  const { deleteExpenses, isPending } = useDeleteExpensesWithUndo();
  const handleDelete = async () => {
    onDelete();
    const hasSelection = isSelectMode && selectedIds && selectedIds.size > 0;
    const expenseIds = hasSelection ? Array.from(selectedIds) : [expenseId];
    if ((await deleteExpenses(expenseIds)) && hasSelection) {
      onDeleteSelectedSuccess?.();
    }
    onSettled();
  };

  const deleteLabel =
    isSelectMode && selectedIds && selectedIds.size > 0
      ? `Delete selected (${selectedIds.size})`
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
