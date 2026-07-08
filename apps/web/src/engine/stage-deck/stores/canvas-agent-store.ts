import { create } from 'zustand';

export interface CanvasAgentOp {
  id: string;
  summary: string;
  detail?: string;
  apply: () => void;
}

interface CanvasAgentState {
  pendingOps: CanvasAgentOp[];
  proposeOp: (op: Omit<CanvasAgentOp, 'id'>) => void;
  confirmOp: (id: string) => void;
  rejectOp: (id: string) => void;
  clearAll: () => void;
}

export const useCanvasAgentStore = create<CanvasAgentState>((set, get) => ({
  pendingOps: [],

  proposeOp: (op) =>
    set((s) => ({
      pendingOps: [
        ...s.pendingOps,
        { ...op, id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 5)}` },
      ],
    })),

  confirmOp: (id) => {
    const op = get().pendingOps.find((o) => o.id === id);
    op?.apply();
    set((s) => ({ pendingOps: s.pendingOps.filter((o) => o.id !== id) }));
  },

  rejectOp: (id) =>
    set((s) => ({ pendingOps: s.pendingOps.filter((o) => o.id !== id) })),

  clearAll: () => set({ pendingOps: [] }),
}));
