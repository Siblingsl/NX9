import { memo } from 'react';
import { type NodeProps, useReactFlow } from '@xyflow/react';
import { BlockShell } from '../shared/BlockShell';

function MemoBlock(props: NodeProps) {
  const { updateNodeData } = useReactFlow();
  const note = (props.data?.note as string) ?? '';

  return (
    <BlockShell {...props}>
      <textarea
        value={note}
        onChange={(e) => updateNodeData(props.id, { note: e.target.value, content: e.target.value })}
        placeholder="记录灵感…"
        className="w-full min-h-[72px] rounded-xl border border-line bg-surface px-2 py-1.5 text-sm"
      />
    </BlockShell>
  );
}

export default memo(MemoBlock);
