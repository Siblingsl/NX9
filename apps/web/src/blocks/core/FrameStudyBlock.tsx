import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { CanvasNodeShell } from '../shared/CanvasNodeShell';

/** 逐帧拉片节点：摘要卡 + 底部跟随工作区（抽帧策略 / 逐帧反推 / 拉片表 / 导出 / 送分镜） */
function FrameStudyBlock(props: NodeProps) {
  return <CanvasNodeShell {...props} />;
}

export default memo(FrameStudyBlock);
