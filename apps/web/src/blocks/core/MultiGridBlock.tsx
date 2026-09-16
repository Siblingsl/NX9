import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { CanvasNodeShell } from '../shared/CanvasNodeShell';

/** 多格推演节点：摘要卡 + 底部跟随工作区（模式 / 计划 / 批量出图） */
function MultiGridBlock(props: NodeProps) {
  return <CanvasNodeShell {...props} />;
}

export default memo(MultiGridBlock);
