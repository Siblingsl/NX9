import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { CanvasNodeShell } from '../shared/CanvasNodeShell';

/** 角色设定表节点：摘要卡 + 底部跟随工作区（版面 / 计划 / 批量出图 / 登记角色参考图） */
function CharacterSheetBlock(props: NodeProps) {
  return <CanvasNodeShell {...props} />;
}

export default memo(CharacterSheetBlock);
