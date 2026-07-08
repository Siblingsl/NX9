import { memo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { ChevronLeft, ChevronRight, Play, Zap } from 'lucide-react';
import { BlockShell } from '../shared/BlockShell';
import { useFlowRuntime } from '../../stores/flow-runtime';
import { useExecutionQueue } from '../../stores/execution-queue';

function IteratorBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const runtime = useFlowRuntime((s) => s.runtime);
  const batchRunning = useExecutionQueue((s) => s.phase === 'running');
  const items = (props.data?.iterItems as string[]) ?? [];
  const idx = (props.data?.currentIndex as number) ?? 0;
  const current = items[idx] ?? '';
  const loopMode = (props.data?.loopMode as string) ?? 'serial';
  const loopCount = (props.data?.loopCount as number) ?? 1;
  const loopVariants = (props.data?.loopVariants as string) ?? '';
  const variantLines = loopVariants.split('\n').filter((s) => s.trim()).length;

  const step = (delta: number) => {
    if (items.length === 0) return;
    const next = (idx + delta + items.length) % items.length;
    updateNodeData(props.id, {
      currentIndex: next,
      content: items[next],
      output: items[next],
    });
  };

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <p className="text-ink/50">遍历上游素材/文本队列，驱动下游多轮生成</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1">
            模式
            <select
              value={loopMode}
              onChange={(e) => updateNodeData(props.id, { loopMode: e.target.value })}
              className="rounded-lg border border-line bg-white px-2 py-1"
            >
              <option value="serial">串行</option>
              <option value="parallel">并行</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            轮次
            <input
              type="number"
              min={1}
              max={99}
              value={loopCount}
              onChange={(e) =>
                updateNodeData(props.id, { loopCount: Number(e.target.value) || 1 })
              }
              className="w-14 rounded-lg border border-line bg-white px-2 py-1"
            />
          </label>
          <span className="text-brand/80 font-mono">
            Loop × {Math.max(loopCount, variantLines || 1)}
          </span>
        </div>
        <textarea
          value={loopVariants}
          onChange={(e) => updateNodeData(props.id, { loopVariants: e.target.value })}
          rows={3}
          placeholder={'变体 Prompt，每行一条\n日落\n夜景\n雨景'}
          className="w-full rounded-xl border border-line bg-surface px-2 py-1.5 text-sm resize-y"
        />
        <div className="flex items-center gap-2">
          <button type="button" className="p-1 rounded-lg border border-line" onClick={() => step(-1)}>
            <ChevronLeft size={14} />
          </button>
          <span className="flex-1 text-center font-mono text-brand">
            {items.length ? `${idx + 1} / ${items.length}` : '0 / 0'}
          </span>
          <button type="button" className="p-1 rounded-lg border border-line" onClick={() => step(1)}>
            <ChevronRight size={14} />
          </button>
        </div>
        {current && (
          <p className="rounded-lg bg-surface px-2 py-1.5 line-clamp-3 break-all">{current}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={batchRunning}
            onClick={() => runtime?.runSelected([props.id])}
            className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-brand text-white py-2 disabled:opacity-50"
          >
            <Play size={14} />
            运行
          </button>
          <button
            type="button"
            disabled={batchRunning}
            onClick={() => void runtime?.runCascade?.(props.id)}
            className="flex-1 flex items-center justify-center gap-1 rounded-xl border border-accent/40 text-accent py-2 disabled:opacity-50"
          >
            <Zap size={14} />
            Loop Cascade
          </button>
        </div>
      </div>
    </BlockShell>
  );
}

export default memo(IteratorBlock);
