import { create } from 'zustand';
import { useWorkspaceDocument } from './workspace-document';
import { useFlowGraphMirror } from './flow-graph-mirror';

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
  /** SE-RESUME: 跨会话恢复出的中断时刻（phase=paused 且非用户主动暂停） */
  interruptedAt: string | null;
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

/** SE-RESUME: 批量运行进度按工作区落 localStorage，刷新后可恢复"已完成哪些" */
function queueStorageKey(wsId: string): string {
  return `nx9-exec-queue:${wsId}`;
}

function persistQueueSnapshot(): void {
  try {
    const wsId = useFlowGraphMirror.getState().workspaceId;
    if (!wsId) return;
    const s = useExecutionQueue.getState();
    if (s.phase === 'idle') {
      localStorage.removeItem(queueStorageKey(wsId));
      return;
    }
    localStorage.setItem(
      queueStorageKey(wsId),
      JSON.stringify({
        phase: s.phase,
        progress: s.progress,
        currentLabel: s.currentLabel,
        error: s.error,
        runLabel: s.runLabel,
        taskId: s.taskId,
        activeBlockIds: [...s.activeBlockIds],
        completedBlockIds: [...s.completedBlockIds],
        interruptedAt: s.interruptedAt,
      }),
    );
  } catch {
    /* localStorage 不可用/超限时静默跳过 */
  }
}

/**
 * SE-RESUME: 工作区加载时恢复上次批量运行进度。
 * 恢复语义诚实：刷新后进程已不存在，原 running 恢复为 paused + interruptedAt 标记，
 * 保留 completed/active 供 UI 提示「上次中断，未完成节点可重跑」。
 */
export function hydrateExecutionQueue(workspaceId: string): void {
  const defaults = {
    phase: 'idle' as RunPhase,
    progress: { done: 0, total: 0 },
    currentBlockId: null,
    currentLabel: null,
    error: null,
    activeBlockIds: new Set<string>(),
    completedBlockIds: new Set<string>(),
    runLabel: null,
    taskId: null,
    interruptedAt: null,
  };
  try {
    const raw = localStorage.getItem(queueStorageKey(workspaceId));
    if (!raw) {
      // 无快照（首次/已完结/切换工作区）：重置为干净默认，避免残留上一个工作区的状态
      useExecutionQueue.setState(defaults);
      return;
    }
    const snap = JSON.parse(raw) as {
      phase: RunPhase;
      progress: { done: number; total: number };
      currentLabel?: string | null;
      error?: string | null;
      runLabel?: string | null;
      taskId?: string | null;
      activeBlockIds?: string[];
      completedBlockIds?: string[];
      interruptedAt?: string | null;
    };
    if (snap.phase !== 'running' && snap.phase !== 'paused' && snap.phase !== 'cancelled') {
      useExecutionQueue.setState(defaults);
      return;
    }
    const wasRunning = snap.phase === 'running';
    useExecutionQueue.setState({
      phase: wasRunning ? 'paused' : snap.phase,
      progress: snap.progress ?? { done: 0, total: 0 },
      currentBlockId: null,
      currentLabel: null,
      error: snap.error ?? null,
      activeBlockIds: new Set(snap.activeBlockIds ?? []),
      completedBlockIds: new Set(snap.completedBlockIds ?? []),
      runLabel: snap.runLabel ?? null,
      taskId: snap.taskId ?? null,
      interruptedAt: wasRunning ? new Date().toISOString() : snap.interruptedAt ?? null,
    });
  } catch {
    /* 损坏快照按无快照处理 */
    useExecutionQueue.setState(defaults);
  }
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
  interruptedAt: null,

  startBatch: (blockIds, taskId = null, label = null) => {
    useWorkspaceDocument.getState().setProjectStatus('generating');
    const next = {
      phase: 'running' as const,
      progress: { done: 0, total: blockIds.length },
      currentBlockId: null,
      currentLabel: null,
      error: null,
      activeBlockIds: new Set(blockIds),
      completedBlockIds: new Set<string>(),
      runLabel: label,
      taskId,
      interruptedAt: null,
    };
    set(next);
    persistQueueSnapshot();
  },

  resumeBatch: () => {
    useWorkspaceDocument.getState().setProjectStatus('generating');
    set({ phase: 'running', error: null, interruptedAt: null });
    persistQueueSnapshot();
  },

  reportCompleted: (blockIds) => {
    set((s) => ({
      completedBlockIds: new Set([...s.completedBlockIds, ...blockIds]),
    }));
    persistQueueSnapshot();
  },

  reportProgress: (patch) => {
    set((s) => ({
      progress: { done: patch.done, total: patch.total },
      currentBlockId: patch.currentBlockId ?? s.currentBlockId,
      currentLabel: patch.currentLabel ?? s.currentLabel,
      error: null,
    }));
    persistQueueSnapshot();
  },

  reportError: (message) => {
    set({
      error: message,
      phase: 'idle',
      currentBlockId: null,
      currentLabel: null,
    });
    persistQueueSnapshot();
  },

  finish: () => {
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
      interruptedAt: null,
    });
    persistQueueSnapshot();
  },

  cancel: () => {
    set({ phase: 'cancelled' });
    persistQueueSnapshot();
  },

  pause: () => {
    useWorkspaceDocument.getState().setProjectStatus('paused');
    set({ phase: 'paused', currentBlockId: null, currentLabel: null, error: null });
    persistQueueSnapshot();
  },

  isRunning: () => get().phase === 'running',
}));
