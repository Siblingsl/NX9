import { create } from 'zustand';

export const useDeckUi = create<{
  selectedBlockId: string | null;
  visible: boolean;
  setSelection: (blockId: string | null, runnable: boolean) => void;
  clear: () => void;
}>((set) => ({
  selectedBlockId: null,
  visible: false,
  setSelection: (selectedBlockId, runnable) =>
    set({ selectedBlockId, visible: Boolean(selectedBlockId && runnable) }),
  clear: () => set({ selectedBlockId: null, visible: false }),
}));
