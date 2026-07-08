import { create } from 'zustand';

export type RunPhase = 'idle' | 'running' | 'cancelled';

interface ExecutionQueueState {
  phase: RunPhase;
  progress: { done: number; total: number };
  currentBlockId: string | null;
  currentLabel: string | null;
  error: string | null;
  activeBlockIds: Set<string>;
  taskId: string | null;
  startBatch: (blockIds: string[], taskId?: string | null) => void;
  reportProgress: (patch: {
    done: number;
    total: number;
    currentBlockId?: string | null;
    currentLabel?: string | null;
  }) => void;
  reportError: (message: string) => void;
  finish: () => void;
  cancel: () => void;
  isRunning: () => boolean;
}

export const useExecutionQueue = create<ExecutionQueueState>((set, get) => ({
  phase: 'idle',
  progress: { done: 0, total: 0 },
  currentBlockId: null,
  currentLabel: null,
  error: null,
  activeBlockIds: new Set(),
  taskId: null,

  startBatch: (blockIds, taskId = null) =>
    set({
      phase: 'running',
      progress: { done: 0, total: blockIds.length },
      currentBlockId: null,
      currentLabel: null,
      error: null,
      activeBlockIds: new Set(blockIds),
      taskId,
    }),

  reportProgress: (patch) =>
    set((s) => ({
      progress: { done: patch.done, total: patch.total },
      currentBlockId: patch.currentBlockId ?? s.currentBlockId,
      currentLabel: patch.currentLabel ?? s.currentLabel,
      error: null,
    })),

  reportError: (message) =>
    set({
      error: message,
      phase: 'idle',
      currentBlockId: null,
      currentLabel: null,
    }),

  finish: () =>
    set({
      phase: 'idle',
      progress: { done: 0, total: 0 },
      currentBlockId: null,
      currentLabel: null,
      error: null,
      activeBlockIds: new Set(),
      taskId: null,
    }),

  cancel: () => set({ phase: 'cancelled' }),

  isRunning: () => get().phase === 'running',
}));
