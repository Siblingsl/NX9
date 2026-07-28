import { create } from 'zustand';

export const useAssetTrashModalUi = create<{
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
