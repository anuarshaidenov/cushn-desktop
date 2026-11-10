import { create } from "zustand";

type DialogStore = {
  isOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
};

export const useCommandDialogStore = create<DialogStore>((set) => ({
  isOpen: false,
  openDialog: () => set({ isOpen: true }),
  closeDialog: () => set({ isOpen: false }),
}));
