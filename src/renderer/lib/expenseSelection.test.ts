import { describe, expect, it } from "vitest";
import type { Id } from "@shared/domain";
import {
  expenseSelectionReducer,
  noExpenseSelection,
  type ExpenseSelection,
} from "./expenseSelection";

const ids = ["a", "b", "c", "d", "e"] as Id<"expenses">[];
const [a, b, c, d] = ids;

const check = (
  state: ExpenseSelection,
  index: number,
  options: {
    checked?: boolean;
    shiftKey?: boolean;
    list?: Id<"expenses">[];
  } = {},
) => {
  const list = options.list ?? ids;
  return expenseSelectionReducer(state, {
    type: "check",
    id: list[index],
    index,
    checked: options.checked ?? true,
    shiftKey: options.shiftKey ?? false,
    ids: list,
  });
};

const selected = (state: ExpenseSelection) => [...state.selectedIds].sort();

describe("expenseSelectionReducer", () => {
  it("enters select mode from a row's menu with that row checked", () => {
    const state = expenseSelectionReducer(noExpenseSelection, {
      type: "selectRow",
      id: c,
      index: 2,
    });
    expect(state.isSelectMode).toBe(true);
    expect(selected(state)).toEqual([c]);
    expect(state.anchor).toBe(2);
  });

  it("checks and unchecks single rows", () => {
    let state = check(noExpenseSelection, 0);
    state = check(state, 2);
    expect(selected(state)).toEqual([a, c]);
    state = check(state, 0, { checked: false });
    expect(selected(state)).toEqual([c]);
  });

  it("shift-checks the range from the last checked row, in either direction", () => {
    let state = check(noExpenseSelection, 3);
    state = check(state, 1, { shiftKey: true });
    expect(selected(state)).toEqual([b, c, d]);
    expect(state.anchor).toBe(1);
  });

  it("checks a single row on shift when nothing was checked before", () => {
    const state = check(noExpenseSelection, 2, { shiftKey: true });
    expect(selected(state)).toEqual([c]);
  });

  it("drops ids that left the list on the next check", () => {
    let state = check(noExpenseSelection, 0);
    state = check(state, 1, { list: [b, c, d] as Id<"expenses">[] });
    expect(selected(state)).toEqual([c]);
  });

  it("clears the selection when leaving select mode", () => {
    let state = expenseSelectionReducer(noExpenseSelection, {
      type: "selectRow",
      id: a,
      index: 0,
    });
    state = expenseSelectionReducer(state, { type: "toggleMode" });
    expect(state).toEqual(noExpenseSelection);
  });

  it("sets the whole selection", () => {
    const state = expenseSelectionReducer(noExpenseSelection, {
      type: "set",
      ids,
    });
    expect(selected(state)).toEqual(ids);
  });
});
