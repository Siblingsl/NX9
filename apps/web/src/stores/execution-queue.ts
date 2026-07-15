import { create } from 'zustand';
import { useWorkspaceDocument } from './workspace-document';

export type RunPhase = 'idle' | 'running' | 'cancelled' | 'paused';

interface ExecutionQueueState {
  phase: RunPhase;
  progress: { done: number; total: number };
  currentBlockId: string | null;
  currentLabel: string | null;
  error: string | null;
  activeBlockIds: Set<string>;
  completedBlockIds: Set<string>;
  runLabel: string | null;
  taskId: string | null;
  startBatch: (blockIds: string[], taskId?: string | null, label?: string | null) => void;
  resumeBatch: () => void;
  reportCompleted: (blockIds: string[]) => void;
  reportProgress: (patch: {
    done: number;
    total: number;
    currentBlockId?: string | null;
    currentLabel?: string | null;
  }) => void;
  reportError: (message: string) => void;
  finish: () => void;
  cancel: () => void;
  pause: () => void;
  isRunning: () => boolean;
}

export const useExecutionQueue = create<ExecutionQueueState>((set, get) => ({
  phase: 'idle',
  progress: { done: 0, total: 0 },
  currentBlockId: null,
  currentLabel: null,
  error: null,
  activeBlockIds: new Set(),
  completedBlockIds: new Set(),
  runLabel: null,
  taskId: null,

  startBatch: (blockIds, taskId = null, label = null) => {
    useWorkspaceDocument.getState().setProjectStatus('generating');
    return set({
      phase: 'running',
      progress: { done: 0, total: blockIds.length },
      currentBlockId: null,
      currentLabel: null,
      error: null,
      activeBlockIds: new Set(blockIds),
      completedBlockIds: new Set(),
      runLabel: label,
      taskId,
    });
  },

  resumeBatch: () => {
    useWorkspaceDocument.getState().setProjectStatus('generating');
    set({ phase: 'running', error: null });
  },

  reportCompleted: (blockIds) =>
    set((s) => ({
      completedBlockIds: new Set([...s.completedBlockIds, ...blockIds]),
    })),

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
      completedBlockIds: new Set(),
      runLabel: null,
      taskId: null,
    }),

  cancel: () => set({ phase: 'cancelled' }),

  pause: () => {
    useWorkspaceDocument.getState().setProjectStatus('paused');
    set({ phase: 'paused', currentBlockId: null, currentLabel: null, error: null });
  },

  isRunning: () => get().phase === 'running',
}));
