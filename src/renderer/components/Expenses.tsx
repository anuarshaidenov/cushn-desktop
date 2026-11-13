import {
  memo,
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
} from "react";
import { Input } from "./ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupNumericInput,
  InputGroupText,
} from "@/components/ui/input-group";
import type { Id } from "@shared/domain";
import type { ExpenseItem } from "@shared/api";
import { useReorderExpenses, useUpdateExpense } from "@/data/expenses";
import { useDebounce } from "@uidotdev/usehooks";
import { toast } from "@/components/ui/toast";
import React from "react";
import { ExpenseActions, SelectedExpensesContext } from "./ExpenseActions";
import { useDeleteExpensesWithUndo } from "@/hooks/use-delete-expenses";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "./ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  DragDropVerticalIcon,
  Cancel01Icon,
  Delete01Icon,
} from "@hugeicons/core-free-icons";
import { Checkbox } from "./ui/checkbox";
import { getCurrencySymbol } from "@/lib/utils";
import { Label } from "./ui/label";
import { useExpenseClipboardStore } from "@/stores/useExpenseClipboardStore";
import { useHotkey } from "@tanstack/react-hotkeys";
import { ShortcutChip } from "./ShortcutKeys";
import { Spinner } from "./ui/spinner";
import { appHotkeys } from "@/lib/hotkeys";
import {
  expenseSelectionReducer,
  noExpenseSelection,
} from "@/lib/expenseSelection";

type Props = {
  expenses: ExpenseItem[];
};

export const Expenses = (props: Props) => {
  const { mutate: reorder } = useReorderExpenses();
  const { deleteExpenses, isPending: isDeleting } = useDeleteExpensesWithUndo();
  const selectAllId = useId();
  const [reordered, setReordered] = useState<{
    from: ExpenseItem[];
    items: ExpenseItem[];
  } | null>(null);
  // A drop shows its order at once; the next list from the cache takes over.
  const items =
    reordered?.from === props.expenses ? reordered.items : props.expenses;
  const [selection, dispatch] = useReducer(
    expenseSelectionReducer,
    noExpenseSelection,
  );
  const { isSelectMode } = selection;
  // Ids that left the list (deleted elsewhere) drop out here, and from the state on the next check.
  const selectedItems = items.filter((i) => selection.selectedIds.has(i.id));
  const selectedIds = selectedItems.map((i) => i.id);

  // Read by the row callbacks, which stay stable so memoised rows skip re-rendering.
  const latestItems = useRef(items);
  useEffect(() => {
    latestItems.current = items;
  });

  const toggleSelectMode = () => dispatch({ type: "toggleMode" });

  const selectRow = useCallback(
    (id: Id<"expenses">, index: number) =>
      dispatch({ type: "selectRow", id, index }),
    [],
  );

  const checkRow = useCallback(
    (id: Id<"expenses">, index: number, shiftKey: boolean, checked: boolean) =>
      dispatch({
        type: "check",
        id,
        index,
        shiftKey,
        checked,
        ids: latestItems.current.map((i) => i.id),
      }),
    [],
  );

  const selectAllInList = () =>
    dispatch({ type: "set", ids: items.map((i) => i.id) });
  const deselectAllInList = () => dispatch({ type: "set", ids: [] });

  const copyToClipboard = useExpenseClipboardStore((state) => state.copy);

  const handleCopy = () => {
    if (selectedItems.length === 0) return;
    const selected = selectedItems.map(({ title, amount, description }) => ({
      title,
      amount,
      description: description ?? undefined,
    }));
    copyToClipboard(selected);
    toast.add({
      type: "success",
      title: `${selected.length} expense(s) copied`,
    });
  };

  const handleDelete = async () => {
    if (selectedIds.length === 0 || isDeleting) return;
    if (await deleteExpenses(selectedIds)) deselectAllInList();
  };

  const selectedCount = selectedIds.length;
  const allSelected = items.length > 0 && selectedCount === items.length;
  const someSelected = selectedCount > 0 && selectedCount < items.length;

  const toggleSelectAll = () => {
    if (allSelected) deselectAllInList();
    else selectAllInList();
  };

  useHotkey(appHotkeys["expenses.copy"], handleCopy, {
    enabled: isSelectMode && selectedCount > 0,
    ignoreInputs: true,
  });

  useHotkey(appHotkeys["expenses.exitSelection"], toggleSelectMode, {
    enabled: isSelectMode,
    ignoreInputs: true,
  });

  useHotkey(appHotkeys["expenses.selectAll"], toggleSelectAll, {
    enabled: isSelectMode,
    ignoreInputs: true,
  });

  useHotkey(appHotkeys["expenses.delete"], handleDelete, {
    enabled: isSelectMode && selectedCount > 0 && !isDeleting,
    ignoreInputs: true,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // requires slight movement before drag starts
      },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    if (active.id !== over.id) {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      const newItems = arrayMove(items, oldIndex, newIndex);
      setReordered({ from: props.expenses, items: newItems });

      reorder({
        orderedIds: newItems.map((i: { id: Id<"expenses"> }) => i.id),
      });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      {isSelectMode && (
        <div className="mb-3 flex flex-wrap items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id={selectAllId}
                checked={allSelected}
                indeterminate={!allSelected && someSelected}
                onCheckedChange={toggleSelectAll}
                aria-label={
                  allSelected ? "Deselect all expenses" : "Select all expenses"
                }
              />
              <Label
                htmlFor={selectAllId}
                className="text-sm font-normal text-muted-foreground"
              >
                Select all
              </Label>
            </div>
            <span className="text-sm text-muted-foreground tabular-nums">
              {selectedCount === 0
                ? "None selected"
                : `${selectedCount} selected`}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="md:pr-1"
              disabled={selectedCount === 0}
              onClick={handleCopy}
            >
              <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
              Copy
              <ShortcutChip
                id="expenses.copy"
                className="hidden md:inline-flex"
              />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/50 md:pr-1 dark:hover:bg-destructive/20"
              disabled={selectedCount === 0 || isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? (
                <Spinner className="size-3.5" />
              ) : (
                <HugeiconsIcon
                  icon={Delete01Icon}
                  strokeWidth={2}
                  className="text-destructive"
                />
              )}
              Delete
              <ShortcutChip
                id="expenses.delete"
                className="hidden md:inline-flex"
              />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="md:pr-1"
              onClick={toggleSelectMode}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              Cancel
              <ShortcutChip
                id="expenses.exitSelection"
                className="hidden md:inline-flex"
              />
            </Button>
          </div>
        </div>
      )}
      <SelectedExpensesContext
        value={{
          ids: selectedIds,
          copy: handleCopy,
          clear: deselectAllInList,
        }}
      >
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {items.map((exp, index) => (
            <Expense
              key={exp.id}
              expense={exp}
              rowIndex={index}
              isSelectMode={isSelectMode}
              isSelected={selection.selectedIds.has(exp.id)}
              onCheck={checkRow}
              onSelect={selectRow}
            />
          ))}
        </SortableContext>
      </SelectedExpensesContext>
    </DndContext>
  );
};

export const Expense = memo(function Expense({
  expense,
  rowIndex,
  isSelectMode,
  isSelected,
  onCheck,
  onSelect,
}: {
  expense: ExpenseItem;
  rowIndex: number;
  isSelectMode: boolean;
  isSelected: boolean;
  onCheck: (
    id: Id<"expenses">,
    index: number,
    shiftKey: boolean,
    checked: boolean,
  ) => void;
  onSelect: (id: Id<"expenses">, index: number) => void;
}) {
  const [expenseTitle, setExpenseTitle] = useState(expense.title);
  const [expenseAmount, setExpenseAmount] = useState(expense.amount);
  const debouncedTitle = useDebounce(expenseTitle, 500);
  const debouncedAmount = useDebounce(expenseAmount, 500);
  const titleRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const checkboxShiftRef = useRef(false);
  const { mutate } = useUpdateExpense();
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: expense.id,
      transition: { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  React.useEffect(() => {
    if (
      debouncedAmount === expense.amount &&
      debouncedTitle === expense.title
    ) {
      return;
    }
    mutate(
      {
        expenseId: expense.id,
        title: debouncedTitle,
        amount: Number(debouncedAmount),
      },
      {
        onError: (error) => {
          console.error(error);
          toast.add({ type: "error", title: "Failed to update expense" });
          setExpenseAmount(expense.amount);
          setExpenseTitle(expense.title);
        },
      },
    );
  }, [debouncedTitle, debouncedAmount]);

  const onFocusTitle = () => {
    titleRef.current?.select();
  };
  const onFocusAmount = () => {
    amountRef.current?.select();
  };

  return (
    <div
      className="group flex w-full items-center gap-2 hover:opacity-80"
      ref={setNodeRef}
      style={style}
    >
      <div className="flex items-center gap-2 lg:-ml-8">
        <Button
          {...listeners}
          {...attributes}
          variant={"ghost"}
          size={"icon-xs"}
          className="cursor-grab text-muted-foreground active:cursor-grabbing"
        >
          <HugeiconsIcon icon={DragDropVerticalIcon} strokeWidth={2} />
        </Button>
        {isSelectMode && (
          <Checkbox
            checked={isSelected}
            className="after:-inset-x-1"
            onClickCapture={(e) => {
              checkboxShiftRef.current = e.shiftKey;
            }}
            onCheckedChange={(checked) => {
              const shiftKey = checkboxShiftRef.current;
              checkboxShiftRef.current = false;
              onCheck(expense.id, rowIndex, shiftKey, checked);
            }}
            aria-label={isSelected ? "Deselect expense" : "Select expense"}
          />
        )}
      </div>
      <div className="flex w-full items-center justify-between">
        <Input
          ref={titleRef}
          value={expenseTitle}
          onFocus={onFocusTitle}
          onChange={(e) => setExpenseTitle(e.target.value)}
          placeholder="Expense title"
          className="[appearance:textfield] rounded-none border-0 border-none bg-background p-0 pb-1 pl-0 text-lg shadow-none ring-0 outline-none focus-within:outline-0 focus:border-none focus:bg-background focus:shadow-none focus:ring-0 focus:outline-0 focus:outline-none focus-visible:bg-background focus-visible:ring-0 has-[[data-slot=input-group-control]:focus-visible]:border-none has-[[data-slot=input-group-control]:focus-visible]:ring-0 md:text-xl dark:bg-background [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
        />
        <InputGroup className="w-48 [appearance:textfield] rounded-none border-0 border-none bg-background p-0 py-0 pl-0 shadow-none ring-0 outline-none focus-within:outline-0 focus:border-none focus:bg-background focus:shadow-none focus:ring-0 focus:outline-0 focus:outline-none focus-visible:bg-background focus-visible:ring-0 has-[[data-slot=input-group-control]:focus-visible]:border-none has-[[data-slot=input-group-control]:focus-visible]:ring-0 md:text-3xl dark:bg-background [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none">
          <InputGroupNumericInput
            ref={amountRef}
            onFocus={onFocusAmount}
            value={expenseAmount}
            onChange={(e) => setExpenseAmount(+e.target.value)}
            placeholder="0"
            className="block w-48 [appearance:textfield] pt-0 pl-0 text-right text-lg md:text-xl [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
          />
          <InputGroupAddon align="inline-end" className="pr-0">
            <InputGroupText className="pb-1 text-lg">
              {getCurrencySymbol(expense?.currency || "")}
            </InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      </div>
      <ExpenseActions
        expense={expense}
        onEnterSelectMode={() => onSelect(expense.id, rowIndex)}
        isSelectMode={isSelectMode}
      />
    </div>
  );
});
