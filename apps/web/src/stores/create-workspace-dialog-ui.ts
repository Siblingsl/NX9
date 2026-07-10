import { create } from 'zustand';

export const useCreateWorkspaceDialogUi = create<{
  open: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}>((set) => ({
  open: false,
  openDialog: () => set({ open: true }),
  closeDialog: () => set({ open: false }),
}));
