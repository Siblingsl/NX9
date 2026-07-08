import { memo, useCallback } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';

function VariantForkBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const variant = (props.data?.variantLabel as 'A' | 'B') ?? 'A';
  const notes = (props.data?.forkNotes as string) ?? '';
  const upstream = props.data?.upstream as {
    prompts?: string[];
    pictures?: string[];
    clips?: string[];
    sounds?: string[];
  } | undefined;

  const applyVariant = useCallback(
    (label: 'A' | 'B') => {
      updateNodeData(props.id, {
        variantLabel: label,
        meta: { variant: label, forkNotes: notes },
        content: upstream?.prompts?.[0] ?? '',
        output: upstream?.prompts?.[0],
        pictures: upstream?.pictures,
        clips: upstream?.clips,
        sounds: upstream?.sounds,
      });
    },
    [notes, upstream, props.id, updateNodeData],
  );

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <div className="flex gap-1">
          {(['A', 'B'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => applyVariant(v)}
              className={`flex-1 py-1.5 rounded-lg border font-semibold ${
                variant === v ? 'border-accent bg-accent/10 text-accent' : 'border-line'
              }`}
            >
              方案 {v}
            </button>
          ))}
        </div>
        <textarea
          value={notes}
          onChange={(e) => updateNodeData(props.id, { forkNotes: e.target.value, meta: { variant, forkNotes: e.target.value } })}
          placeholder="A/B 对比备注…"
          className="w-full min-h-[40px] rounded-xl border border-line px-2 py-1.5 resize-y"
        />
        <p className="text-[10px] text-ink/50">
          当前标记 <strong>{variant}</strong> · Take 侧可对比
        </p>
      </div>
    </BlockShell>
  );
}

export default memo(VariantForkBlock);
