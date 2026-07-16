import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { CanvasNodeShell } from '../shared/CanvasNodeShell';

/**
 * 图像生成节点 — 画布 L1 摘要卡 + 底部跟随工作区（PictureWorkspace）。
 * 完整能力在底部工作区：文生图 / 图生图 / 多参考 / 风格 / 全景、模型、质量、比例、张数、Seed 等。
 * 禁止改成屏幕弹窗（见 docs/NX9-CANVAS-NODE-CONTRACT.md）。
 */
function PictureGenBlock(props: NodeProps) {
  return <CanvasNodeShell {...props} />;
}

export default memo(PictureGenBlock);
