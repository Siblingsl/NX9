import type { ShotMoveFamily } from '../types/creative-asset-center';

export type { ShotMoveFamily };

export const SHOT_MOVE_FAMILIES: ReadonlyArray<{ id: ShotMoveFamily; label: string }> = [
  { id: 'static', label: '固定' },
  { id: 'dolly', label: '推拉' },
  { id: 'pan_tilt', label: '摇移' },
  { id: 'track', label: '跟拍' },
  { id: 'crane', label: '升降' },
  { id: 'orbit', label: '环绕' },
  { id: 'special', label: '特殊' },
] as const;

export function shotMoveFamilyLabel(id: ShotMoveFamily | string | undefined | null): string | undefined {
  if (!id) return undefined;
  return SHOT_MOVE_FAMILIES.find((f) => f.id === id)?.label;
}

/** 从旧模板 group 文案推断运镜族 */
export function inferShotMoveFamilyFromGroup(group: string | undefined | null): ShotMoveFamily | undefined {
  const g = (group ?? '').trim();
  if (!g) return undefined;
  if (/固定/.test(g)) return 'static';
  if (/推拉|推镜|拉镜|dolly/i.test(g)) return 'dolly';
  if (/摇移|左摇|右摇|上摇|下摇|pan|tilt/i.test(g)) return 'pan_tilt';
  if (/跟拍|跟随|横移|track/i.test(g)) return 'track';
  if (/升降|升镜|降镜|crane/i.test(g)) return 'crane';
  if (/环绕|盘旋|orbit/i.test(g)) return 'orbit';
  if (/特殊|手持|POV|甩镜|转场|FPV/i.test(g)) return 'special';
  return undefined;
}
