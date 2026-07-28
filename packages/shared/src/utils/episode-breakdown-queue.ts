/**
 * episode-breakdown-queue.ts — 分镜多集批量拆镜队列（F-016）。
 *
 * 串行执行，支持 pause/resume/cancel/skip。
 * 不并行拆镜（防打爆 LLM）。
 */
export interface EpisodeQueueState {
  episodeIds: string[];
  index: number;
  status: 'idle' | 'running' | 'paused' | 'done' | 'cancelled';
  errors: Record<string, string>;
  results: Record<string, boolean>;
  /** 被用户跳过的集 ID 集合 */
  skipped: string[];
}

export function createEpisodeQueue(episodeIds: string[]): EpisodeQueueState {
  return {
    episodeIds,
    index: 0,
    status: 'idle',
    errors: {},
    results: {},
    skipped: [],
  };
}

export function queueNextEpisode(state: EpisodeQueueState): { episodeId: string | null; done: boolean } {
  if (state.status === 'paused' || state.status === 'done' || state.status === 'cancelled') {
    return { episodeId: null, done: state.status === 'done' || state.status === 'cancelled' };
  }
  if (state.index >= state.episodeIds.length) {
    return { episodeId: null, done: true };
  }
  const episodeId = state.episodeIds[state.index];
  // 跳过已经在 skipped 列表中的集
  if (state.skipped.includes(episodeId)) {
    const advanced = queueAdvance(state);
    return queueNextEpisode(advanced);
  }
  return { episodeId, done: false };
}

export function queueAdvance(state: EpisodeQueueState): EpisodeQueueState {
  const nextIndex = state.index + 1;
  const isDone = nextIndex >= state.episodeIds.length;
  return {
    ...state,
    index: nextIndex,
    status: isDone ? 'done' : state.status,
  };
}

export function queueMarkSuccess(state: EpisodeQueueState): EpisodeQueueState {
  const nextIndex = state.index + 1;
  const isDone = nextIndex >= state.episodeIds.length;
  return {
    ...state,
    index: nextIndex,
    status: isDone ? 'done' : 'running',
    results: { ...state.results, [state.episodeIds[state.index]!]: true },
  };
}

export function queueMarkError(state: EpisodeQueueState, error: string): EpisodeQueueState {
  return {
    ...state,
    errors: { ...state.errors, [state.episodeIds[state.index]!]: error },
    results: { ...state.results, [state.episodeIds[state.index]!]: false },
  };
}

export function queueSkipEpisode(state: EpisodeQueueState): EpisodeQueueState {
  const currentId = state.episodeIds[state.index];
  const isDone = state.index + 1 >= state.episodeIds.length;
  return {
    ...state,
    index: state.index + 1,
    status: isDone ? 'done' : 'running',
    skipped: currentId ? [...state.skipped, currentId] : state.skipped,
  };
}

export function queuePause(state: EpisodeQueueState): EpisodeQueueState {
  return { ...state, status: state.status === 'running' ? 'paused' : state.status };
}

export function queueResume(state: EpisodeQueueState): EpisodeQueueState {
  return { ...state, status: state.status === 'paused' ? 'running' : state.status };
}

export function queueCancel(state: EpisodeQueueState): EpisodeQueueState {
  return { ...state, status: 'cancelled' };
}

export function queueSummary(state: EpisodeQueueState): string {
  const total = state.episodeIds.length;
  const succeeded = Object.values(state.results).filter(Boolean).length;
  const failed = Object.keys(state.errors).length;
  const skipped = state.skipped.length;
  const parts: string[] = [];
  if (succeeded > 0) parts.push(`成功 ${succeeded}`);
  if (failed > 0) parts.push(`失败 ${failed}`);
  if (skipped > 0) parts.push(`跳过 ${skipped}`);
  return `共 ${total} 集 · ${parts.join(' · ')} · 当前进度 ${state.index}/${total}`;
}

/**
 * 可序列化的队列进度快照（供 UI 展示）。
 */
export interface QueueProgress {
  total: number;
  current: number;
  currentId: string | null;
  status: EpisodeQueueState['status'];
  succeeded: number;
  failed: number;
  skipped: number;
  errorList: Array<{ episodeId: string; error: string }>;
}
