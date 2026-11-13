import type { Id } from "@shared/domain";

type ExpenseId = Id<"expenses">;

export type ExpenseSelection = {
  isSelectMode: boolean;
  selectedIds: ReadonlySet<ExpenseId>;
  /** The last checked row's index, where a shift-click range starts. */
  anchor: number | null;
};

export type ExpenseSelectionAction =
  | { type: "toggleMode" }
  | { type: "selectRow"; id: ExpenseId; index: number }
  | {
      type: "check";
      id: ExpenseId;
      index: number;
      checked: boolean;
      shiftKey: boolean;
      /** The listed ids, in order; ids outside it drop out of the selection. */
      ids: readonly ExpenseId[];
    }
  | { type: "set"; ids: readonly ExpenseId[] };

export const noExpenseSelection: ExpenseSelection = {
  isSelectMode: false,
  selectedIds: new Set(),
  anchor: null,
};

export function expenseSelectionReducer(
  state: ExpenseSelection,
  action: ExpenseSelectionAction,
): ExpenseSelection {
  switch (action.type) {
    case "toggleMode":
      return state.isSelectMode
        ? noExpenseSelection
        : { ...state, isSelectMode: true };
    case "selectRow":
      return {
        isSelectMode: true,
        selectedIds: new Set(state.selectedIds).add(action.id),
        anchor: action.index,
      };
    case "check": {
      const listed = new Set(action.ids);
      const next = new Set(
        [...state.selectedIds].filter((id) => listed.has(id)),
      );
      if (action.shiftKey && state.anchor !== null) {
        const from = Math.min(state.anchor, action.index);
        const to = Math.max(state.anchor, action.index);
        for (const id of action.ids.slice(from, to + 1)) next.add(id);
      } else if (action.checked) {
        next.add(action.id);
      } else {
        next.delete(action.id);
      }
      return { ...state, selectedIds: next, anchor: action.index };
    }
    case "set":
      return { ...state, selectedIds: new Set(action.ids) };
  }
}
