import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { CanvasNodeShell } from '../shared/CanvasNodeShell';

function LocalEnhanceBlock(props: NodeProps) {
  return <CanvasNodeShell {...props} />;
}

export default memo(LocalEnhanceBlock);
