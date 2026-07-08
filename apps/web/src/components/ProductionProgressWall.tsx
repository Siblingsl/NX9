import { useExecutionQueue } from '../stores/execution-queue';
import { useFlowRuntime } from '../stores/flow-runtime';

export function ProductionProgressWall() {
  const phase = useExecutionQueue((s) => s.phase);
  const progress = useExecutionQueue((s) => s.progress);
  const currentLabel = useExecutionQueue((s) => s.currentLabel);
  const error = useExecutionQueue((s) => s.error);
  const runtime = useFlowRuntime((s) => s.runtime);

  if (phase !== 'running' && phase !== 'cancelled' && !error) return null;

  const pct =
    progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;
  const running = phase === 'running';

  return (
    <div
      className="shrink-0 border-b border-line bg-gradient-to-r from-brand/5 via-white to-brand/5 px-5 py-2"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-block w-2 h-2 rounded-full shrink-0 ${
              running ? 'bg-brand animate-pulse' : 'bg-warn'
            }`}
          />
          <span className="text-sm font-medium text-ink">
            {running ? '批量生产进行中' : phase === 'cancelled' ? '正在停止…' : '运行中断'}
          </span>
          {currentLabel && running && (
            <span className="text-xs text-ink/50 truncate max-w-[240px]" title={currentLabel}>
              · {currentLabel}
            </span>
          )}
        </div>

        <div className="flex-1 flex items-center gap-3 min-w-0">
          <div className="flex-1 h-2 rounded-full bg-surface overflow-hidden border border-line/60">
            <div
              className="h-full bg-brand transition-all duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-ink/60 shrink-0 w-24 text-right">
            {progress.done}/{progress.total} · {pct}%
          </span>
        </div>

        {running && (
          <button
            type="button"
            onClick={() => runtime?.stopRun?.()}
            className="shrink-0 text-xs rounded-lg border border-line px-3 py-1 hover:bg-surface text-ink/70"
          >
            停止
          </button>
        )}

        {error && (
          <span className="text-xs text-red-600 truncate max-w-[200px]" title={error}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
