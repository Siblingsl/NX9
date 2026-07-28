import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { CanvasNodeShell } from '../shared/CanvasNodeShell';

function GridComposeBlock(props: NodeProps) {
  return <CanvasNodeShell {...props} />;
}

export default memo(GridComposeBlock);
