/**
 * EpisodeQueueBar — 多集拆镜队列控制栏（F-016）。
 *
 * 显示队列进度、支持暂停/继续/跳过/取消。
 */
import type { EpisodeQueueState, QueueProgress } from '@nx9/shared';

export interface EpisodeQueueBarProps {
  /** 队列完整状态 */
  state: EpisodeQueueState;
  /** 当前集名称（用于展示） */
  currentEpisodeTitle?: string;
  /** 进度快照 */
  progress: QueueProgress;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onCancel: () => void;
  onRetryFailed?: () => void;
}

export function EpisodeQueueBar({
  state,
  currentEpisodeTitle,
  progress,
  onPause,
  onResume,
  onSkip,
  onCancel,
  onRetryFailed,
}: EpisodeQueueBarProps) {
  const isRunning = state.status === 'running';
  const isPaused = state.status === 'paused';
  const isDone = state.status === 'done' || state.status === 'cancelled';
  const isIdle = state.status === 'idle';
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  if (isIdle) return null;

  return (
    <div className="rounded-lg border border-line/60 bg-surface/40 px-3 py-2 space-y-2 text-[10px]">
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-medium text-ink/70">
          {isRunning && <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />}
          {isPaused && <span className="w-2 h-2 rounded-full bg-warn" />}
          {isDone && <span className="w-2 h-2 rounded-full bg-ok/50" />}
          分集拆镜队列
        </span>
        <span className="text-[9px] text-ink/40">
          {state.status === 'running' && '运行中'}
          {state.status === 'paused' && '已暂停'}
          {state.status === 'done' && '已完成'}
          {state.status === 'cancelled' && '已取消'}
        </span>
      </div>

      {/* 进度条 */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[9px] text-ink/45">
          <span>{progress.current}/{progress.total} 集</span>
          {currentEpisodeTitle && (
            <span className="truncate max-w-[60%] text-right">
              {currentEpisodeTitle}
            </span>
          )}
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isDone
                ? 'bg-ok/60'
                : isPaused
                  ? 'bg-warn/60'
                  : 'bg-brand/60'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* 统计标签 */}
      <div className="flex items-center gap-3 text-[9px] text-ink/40">
        <span className={progress.succeeded > 0 ? 'text-ok/70 font-medium' : ''}>
          成功 {progress.succeeded}
        </span>
        <span className={progress.failed > 0 ? 'text-warn font-medium' : ''}>
          失败 {progress.failed}
        </span>
        <span>跳过 {progress.skipped}</span>
      </div>

      {/* 操作按钮 */}
      {!isDone && (
        <div className="flex items-center gap-1.5">
          {isRunning && (
            <button
              type="button"
              onClick={onPause}
              className="flex-1 rounded-md border border-warn/30 bg-warn/5 text-warn py-1 text-[9px] hover:bg-warn/10"
            >
              暂停
            </button>
          )}
          {isPaused && (
            <button
              type="button"
              onClick={onResume}
              className="flex-1 rounded-md border border-brand/30 bg-brand/5 text-brand py-1 text-[9px] hover:bg-brand/10"
            >
              继续
            </button>
          )}
          <button
            type="button"
            onClick={onSkip}
            disabled={isDone}
            className="flex-1 rounded-md border border-line/50 text-ink/50 py-1 text-[9px] hover:bg-surface/60 disabled:opacity-30"
          >
            跳过本集
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-line/50 text-ink/50 py-1 text-[9px] hover:bg-warn/10 hover:text-warn hover:border-warn/30"
          >
            取消
          </button>
        </div>
      )}

      {/* 错误列表 */}
      {progress.errorList.length > 0 && (
        <div className="max-h-24 overflow-y-auto space-y-0.5 border-t border-line/30 pt-1.5 nx9-scroll">
          {progress.errorList.map((item, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[8px] text-warn/80">
              <span className="shrink-0 font-medium text-ink/40">{item.episodeId.slice(0, 12)}</span>
              <span className="min-w-0 break-all">{item.error}</span>
            </div>
          ))}
        </div>
      )}

      {/* 完成摘要 */}
      {isDone && (
        <div className="border-t border-line/30 pt-1.5 text-[9px] text-ink/45">
          完成的 {state.status === 'cancelled' ? '（用户取消）' : ''}
          {Object.keys(state.errors).length > 0 && (
            <span className="ml-1 text-warn">
              共 {Object.keys(state.errors).length} 集失败
            </span>
          )}
        </div>
      )}
      {isDone && Object.keys(state.errors).length > 0 && onRetryFailed && (
        <button
          type="button"
          onClick={onRetryFailed}
          className="w-full rounded-md border border-warn/30 bg-warn/5 text-warn py-1 text-[9px] hover:bg-warn/10 mt-1"
        >
          只重试失败 · {Object.keys(state.errors).length} 集
        </button>
      )}
    </div>
  );
}
