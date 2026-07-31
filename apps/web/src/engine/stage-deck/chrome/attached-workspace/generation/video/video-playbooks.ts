/**
 * 视频热门玩法目录（对齐图像专业工具：选中后写入节点字段，不改普通视频生成主路径）。
 */
import {
  BUILTIN_REFERENCE_PLAYBOOKS,
  type ReferencePlaybookDef,
} from '@nx9/shared';

export type VideoPlaybookCategoryId = 'action';

export interface VideoPlaybookActionDef {
  id: string;
  category: VideoPlaybookCategoryId;
  label: string;
  hint: string;
  /** 需要在输入框上方展示槽位工具 */
  needsSlotTools: boolean;
  playbook: ReferencePlaybookDef;
}

export interface VideoPlaybookCategoryDef {
  id: VideoPlaybookCategoryId;
  label: string;
}

export const VIDEO_PLAYBOOK_CATEGORIES: VideoPlaybookCategoryDef[] = [
  { id: 'action', label: '动作复刻' },
];

function byId(id: string): ReferencePlaybookDef {
  const pb = BUILTIN_REFERENCE_PLAYBOOKS.find((p) => p.id === id);
  if (!pb) throw new Error(`missing playbook ${id}`);
  return pb;
}

export const VIDEO_PLAYBOOK_ACTIONS: VideoPlaybookActionDef[] = [
  {
    id: 'depth-action-replica',
    category: 'action',
    label: '深度视频动作复刻',
    hint: '深度视频锁动作，人物图锁外貌，场景图换环境',
    needsSlotTools: true,
    playbook: byId('depth-action-replica'),
  },
];

export function lookupVideoPlaybookAction(
  id?: string | null,
): VideoPlaybookActionDef | undefined {
  if (!id) return undefined;
  return VIDEO_PLAYBOOK_ACTIONS.find((a) => a.id === id);
}
