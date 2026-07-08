import { memo } from 'react';
import { Focus, Play, Square, Trash2 } from 'lucide-react';
import { RUNNABLE_BLOCKS } from '../engine/flow-runner';
import { useExecutionQueue } from '../stores/execution-queue';

interface NodeActionBarProps {
  nodeId: string;
  nodeType: string;
  onRun: () => void;
  onStop: () => void;
  onDelete: () => void;
  onFocus: () => void;
}

export const NodeActionBar = memo(function NodeActionBar({
  nodeId,
  nodeType,
  onRun,
  onStop,
  onDelete,
  onFocus,
}: NodeActionBarProps) {
  const isRunning = useExecutionQueue((s) => s.phase === 'running');
  const canRun = RUNNABLE_BLOCKS.has(nodeType);

  return (
    <div className="absolute -top-11 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-full border border-line bg-white shadow-panel px-2 py-1">
      {isRunning ? (
        <button
          type="button"
          title="停止"
          className="p-1.5 rounded-full hover:bg-warn/10 text-warn"
          onClick={onStop}
        >
          <Square size={14} fill="currentColor" />
        </button>
      ) : (
        <button
          type="button"
          title="运行此模块"
          disabled={!canRun}
          className="p-1.5 rounded-full hover:bg-brand/10 text-brand disabled:opacity-40"
          onClick={onRun}
        >
          <Play size={14} fill="currentColor" />
        </button>
      )}
      <button
        type="button"
        title="聚焦"
        className="p-1.5 rounded-full hover:bg-accent/10 text-accent"
        onClick={onFocus}
      >
        <Focus size={14} />
      </button>
      <button
        type="button"
        title="删除"
        className="p-1.5 rounded-full hover:bg-red-50 text-red-600"
        onClick={onDelete}
      >
        <Trash2 size={14} />
      </button>
      <span className="text-[9px] font-mono text-ink/30 pl-1">{nodeId.slice(-6)}</span>
    </div>
  );
});
