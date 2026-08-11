/**
 * 服装 / 场景 / 道具设定板裁切坐标（归一化 0–1）。
 * 与 creative-asset-prompts 中硬锁版式描述对齐；格子少，仅回填封面级主视觉。
 */

/** 服装完整设定板 · 正面全身主视觉 → frontFlatUrl */
export const COSTUME_SHEET_FRONT_RECT: [number, number, number, number] = [
  0.26, 0.10, 0.42, 0.34,
];

/** 场景空间设定板 · 主确立宽景 */
export const SCENE_SHEET_HERO_RECT: [number, number, number, number] = [
  0.04, 0.10, 0.58, 0.44,
];

/** 道具三视图板 · 正面英雄格 */
export const PROP_SHEET_FRONT_RECT: [number, number, number, number] = [
  0.04, 0.14, 0.30, 0.72,
];

export type EntitySheetCropKind = 'costume-front' | 'scene-hero' | 'prop-front';

export function entitySheetCropRect(kind: EntitySheetCropKind): [number, number, number, number] {
  if (kind === 'scene-hero') return SCENE_SHEET_HERO_RECT;
  if (kind === 'prop-front') return PROP_SHEET_FRONT_RECT;
  return COSTUME_SHEET_FRONT_RECT;
}
