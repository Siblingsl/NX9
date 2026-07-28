/**
 * hyperframes-job-state.ts — Hyperframes 导出状态机（F-046）。
 *
 * 状态：idle → submitted → polling → done | error | cancelled
 */
export type HyperframesJobStatus = 'idle' | 'submitted' | 'polling' | 'done' | 'error' | 'cancelled';

export interface HyperframesJobState {
  taskId: string | null;
  status: HyperframesJobStatus;
  progress: number; // 0-100
  url?: string;
  error?: string;
  submittedAt?: number;
  completedAt?: number;
}

export function createHyperframesJobState(): HyperframesJobState {
  return { taskId: null, status: 'idle', progress: 0 };
}

export function submitHyperframesJob(state: HyperframesJobState, taskId: string): HyperframesJobState {
  return { ...state, taskId, status: 'submitted', progress: 0, submittedAt: Date.now() };
}

export function startPollingHyperframes(state: HyperframesJobState): HyperframesJobState {
  return { ...state, status: 'polling' };
}

export function updateHyperframesProgress(state: HyperframesJobState, progress: number): HyperframesJobState {
  return { ...state, progress: Math.min(progress, 100) };
}

export function completeHyperframesJob(state: HyperframesJobState, url: string): HyperframesJobState {
  return { ...state, status: 'done', progress: 100, url, completedAt: Date.now() };
}

export function failHyperframesJob(state: HyperframesJobState, error: string): HyperframesJobState {
  return { ...state, status: 'error', error, completedAt: Date.now() };
}

export function cancelHyperframesJob(state: HyperframesJobState): HyperframesJobState {
  return { ...state, status: 'cancelled', completedAt: Date.now() };
}

export function canRetryHyperframes(state: HyperframesJobState): boolean {
  return state.status === 'error' || state.status === 'cancelled';
}

export function hyperframesJobSummary(state: HyperframesJobState): string {
  switch (state.status) {
    case 'idle': return '等待提交';
    case 'submitted': return '已提交，等待渲染…';
    case 'polling': return `渲染中 ${state.progress}%`;
    case 'done': return '渲染完成';
    case 'error': return `渲染失败: ${state.error ?? '未知错误'}`;
    case 'cancelled': return '已取消';
    default: return state.status;
  }
}
