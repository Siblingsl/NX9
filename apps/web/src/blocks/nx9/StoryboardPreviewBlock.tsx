import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import { CanvasNodeShell } from '../shared/CanvasNodeShell';

/** 分镜预览 — Video Proof 节点（画布紧凑摘要 + 底部网格工作区） */
function StoryboardPreviewBlock(props: NodeProps) {
  return <CanvasNodeShell {...props} />;
}

export default memo(StoryboardPreviewBlock);
