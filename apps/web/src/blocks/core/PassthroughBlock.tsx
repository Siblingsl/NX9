import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import type { UpstreamOutputs } from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';

function PassthroughBlock(props: NodeProps) {
  const upstream = props.data?.upstream as UpstreamOutputs | undefined;
  const promptCount = upstream?.prompts?.length ?? 0;
  const picCount = upstream?.pictures?.length ?? 0;

  return (
    <BlockShell {...props}>
      <p className="text-xs text-ink/60 text-center py-2">
        透传上游 · 文本 {promptCount} · 图像 {picCount}
      </p>
    </BlockShell>
  );
}

export default memo(PassthroughBlock);
