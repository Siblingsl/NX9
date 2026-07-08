import { create } from 'zustand';

interface ActivityLogState {
  lines: string[];
  open: boolean;
  append: (line: string) => void;
  clear: () => void;
  toggle: (open?: boolean) => void;
}

const MAX_LINES = 400;

export const useActivityLog = create<ActivityLogState>((set) => ({
  lines: [],
  open: false,

  append: (line) =>
    set((s) => {
      const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      const next = [...s.lines, `[${stamp}] ${line}`];
      return { lines: next.slice(-MAX_LINES) };
    }),

  clear: () => set({ lines: [] }),
  toggle: (open) => set((s) => ({ open: open ?? !s.open })),
}));
