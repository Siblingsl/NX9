import { useState, useEffect, useRef } from 'react';
import { Clock, CheckCircle, XCircle, RefreshCw, Zap } from 'lucide-react';
import { useExecutionQueue } from '../../../../stores/execution-queue';

interface TaskRecord {
  id: string;
  label: string;
  kind?: string;
  status: string;
  progress?: number;
  error?: string;
  createdAt: number;
  retry?: () => void;
}

export function TaskCenterPanel() {
  const queue = useExecutionQueue();
  const [history, setHistory] = useState<TaskRecord[]>([]);
  const startTimeRef = useRef<number>(0);
  const avgMsRef = useRef<number>(0);
  const doneCountRef = useRef<number>(0);

  useEffect(() => {
    if (queue.phase === 'running') {
      if (startTimeRef.current === 0) startTimeRef.current = Date.now();
      else {
        const elapsed = Date.now() - startTimeRef.current;
        if (queue.progress.done > doneCountRef.current) {
          doneCountRef.current = queue.progress.done;
          avgMsRef.current = elapsed / queue.progress.done;
        }
      }
    } else if (queue.phase === 'idle') {
      startTimeRef.current = 0;
      doneCountRef.current = 0;
    }
  }, [queue.phase, queue.progress.done]);

  useEffect(() => {
    if (queue.phase === 'running' && queue.activeBlockIds.size > 0) {
      const now = Date.now();
      setHistory((prev) => {
        const existing = new Set(prev.map((t) => t.id));
        const newTasks = [...queue.activeBlockIds]
          .filter((id) => !existing.has(id))
          .map((id) => ({
            id,
            label: '',
            kind: id.split('-')[0],
            status: 'running',
            createdAt: now,
          }));
        return newTasks.length > 0 ? [...newTasks, ...prev] : prev;
      });
    }
  }, [queue.phase, queue.activeBlockIds]);

  const runningTasks = history.filter((t) => t.status === 'running');
  const failedTasks = history.filter((t) => t.status === 'error' || t.status === 'failed');
  const doneTasks = history.filter((t) => t.status === 'done' || t.status === 'success');
  const stats = {
    total: history.length,
    running: runningTasks.length,
    done: doneTasks.length,
    failed: failedTasks.length,
  };

  const displayItems = history.slice(0, 20);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock size={16} className="text-brand" />
        <span className="font-medium text-sm">任务中心</span>
        {queue.phase === 'running' && (
          <span className="text-[10px] text-brand/70 flex items-center gap-1">
            <RefreshCw size={10} className="animate-spin" />
            {queue.progress.done}/{queue.progress.total}
          </span>
        )}
      </div>

      {queue.phase === 'running' && (
        <div className="flex items-center gap-2 rounded-lg bg-brand/5 border border-brand/20 p-2">
          <Zap size={14} className="text-brand shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-ink/80">
              {queue.currentLabel ?? '生成中…'}
            </p>
            <div className="w-full h-1 rounded-full bg-line mt-1 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand transition-all"
                style={{
                  width: `${
                    queue.progress.total > 0
                      ? (queue.progress.done / queue.progress.total) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {stats.total > 0 && (
        <div className="flex items-center gap-3 text-[10px] text-ink/50">
          <span>总计 {stats.total}</span>
          <span className="flex items-center gap-0.5"><CheckCircle size={10} className="text-ok" /> {stats.done}</span>
          <span className="flex items-center gap-0.5"><XCircle size={10} className="text-error" /> {stats.failed}</span>
          {stats.running > 0 && <span>进行中 {stats.running}</span>}
          {queue.phase === 'running' && avgMsRef.current > 0 && queue.progress.total > queue.progress.done && (
            <span className="text-ink/40">
              剩余 ≈{Math.max(1, Math.round(avgMsRef.current * (queue.progress.total - queue.progress.done) / 1000))}s
            </span>
          )}
        </div>
      )}

      <div className="max-h-60 overflow-y-auto nx9-scroll space-y-1">
        {displayItems.length === 0 ? (
          <p className="text-[11px] text-ink/40">暂无任务</p>
        ) : (
          displayItems.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-2 rounded-lg border p-2 ${
                item.status === 'error' || item.status === 'failed'
                  ? 'border-error/20 bg-error/5'
                  : item.status === 'running'
                    ? 'border-brand/20 bg-brand/5'
                    : 'border-line bg-surface'
              }`}
            >
              <span className="text-[10px] text-ink/40 w-4 shrink-0">
                {item.status === 'running' ? <RefreshCw size={12} className="animate-spin text-brand" /> :
                 item.status === 'done' || item.status === 'success' ? <CheckCircle size={12} className="text-ok" /> :
                 item.status === 'error' || item.status === 'failed' ? <XCircle size={12} className="text-error" /> :
                 <Clock size={12} className="text-ink/30" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-ink/80 truncate">
                  {item.label || item.kind || item.id}
                </p>
                {item.error && (
                  <p className="text-[10px] text-error">{item.error}</p>
                )}
              </div>
              {(item.status === 'error' || item.status === 'failed') && (
                <div className="flex gap-1 shrink-0">
                  {item.retry && (
                    <button
                      type="button"
                      onClick={item.retry}
                      className="rounded-lg border border-brand/30 px-2 py-0.5 text-[10px] text-brand"
                    >
                      重试
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-lg border border-line px-2 py-0.5 text-[10px] text-ink/50 hover:text-brand"
                  >
                    换模型
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
