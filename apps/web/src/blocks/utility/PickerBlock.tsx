import { memo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';

function PickerBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const pickIndex = (props.data?.pickIndex as number) ?? 0;
  const items = (props.data?.iterItems as string[]) ?? [];

  return (
    <BlockShell {...props}>
      <div className="space-y-2 nodrag nopan text-xs">
        <p className="text-ink/50">从上游队列中按索引选取一项</p>
        <label className="text-ink/60">
          索引
          <input
            type="number"
            min={0}
            value={pickIndex}
            onChange={(e) => updateNodeData(props.id, { pickIndex: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-line px-2 py-1"
          />
        </label>
        {items[pickIndex] && (
          <p className="rounded-lg bg-brand/5 border border-brand/20 px-2 py-1.5 line-clamp-3 break-all">
            {items[pickIndex]}
          </p>
        )}
      </div>
    </BlockShell>
  );
}

export default memo(PickerBlock);
