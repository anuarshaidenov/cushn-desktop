import { create } from "zustand";

type ClipboardExpense = {
  title: string;
  amount: number;
  description?: string;
};

type ExpenseClipboardStore = {
  expenses: ClipboardExpense[];
  copy: (expenses: ClipboardExpense[]) => void;
  clear: () => void;
};

export const useExpenseClipboardStore = create<ExpenseClipboardStore>(
  (set) => ({
    expenses: [],
    copy: (expenses) => set({ expenses }),
    clear: () => set({ expenses: [] }),
  }),
);
