import type { CharacterFaceRig } from '@nx9/shared';
import {
  FACE_RIG_MAX,
  FACE_RIG_MIN,
  faceRigSideValue,
  faceRigValue,
  getFaceRig,
  setFaceRigSideValue,
  setFaceRigValue,
} from '@nx9/shared';

export type SculptHandleSide = 'L' | 'R';
export type SculptHandleDragAxis = 'x' | 'y';

export interface SculptHandleDef {
  id: string;
  /** 契约 §5.1 的 Handle.* 命名 */
  name: string;
  paramId: string;
  side?: SculptHandleSide;
  axis: SculptHandleDragAxis;
  /** 屏幕像素位移 → 参数增量（x 右为正，y 上为正） */
  sensitivity: number;
  labelZh: string;
  /** 代理网格上 handle 标记的世界坐标 */
  position: [number, number, number];
}

/** P2 控制点：覆盖切片 6 项（faceLength / jawWidth / eyeSpacing / noseBridgeHeight / shoulderWidth / heightFeel）。 */
export const SCULPT_HANDLES: SculptHandleDef[] = [
  { id: 'jaw.L', name: 'Handle.Jaw.L', paramId: 'jawWidth', side: 'L', axis: 'x', sensitivity: 0.45, labelZh: '下颌 L', position: [-0.13, 1.52, 0.16] },
  { id: 'jaw.R', name: 'Handle.Jaw.R', paramId: 'jawWidth', side: 'R', axis: 'x', sensitivity: 0.45, labelZh: '下颌 R', position: [0.13, 1.52, 0.16] },
  { id: 'eyeSpacing.L', name: 'Handle.EyeOuter.L', paramId: 'eyeSpacing', side: 'L', axis: 'x', sensitivity: 0.3, labelZh: '眼距 L', position: [-0.13, 1.72, 0.15] },
  { id: 'eyeSpacing.R', name: 'Handle.EyeOuter.R', paramId: 'eyeSpacing', side: 'R', axis: 'x', sensitivity: 0.3, labelZh: '眼距 R', position: [0.13, 1.72, 0.15] },
  { id: 'noseBridge', name: 'Handle.NoseBridge', paramId: 'noseBridgeHeight', axis: 'y', sensitivity: 0.45, labelZh: '鼻梁', position: [0, 1.74, 0.21] },
  { id: 'hairline', name: 'Handle.Hairline', paramId: 'faceLength', axis: 'y', sensitivity: 0.35, labelZh: '发际', position: [0, 1.88, 0.12] },
  { id: 'shoulder.L', name: 'Handle.Shoulder.L', paramId: 'shoulderWidth', side: 'L', axis: 'x', sensitivity: 0.35, labelZh: '肩 L', position: [-0.36, 1.42, 0] },
  { id: 'shoulder.R', name: 'Handle.Shoulder.R', paramId: 'shoulderWidth', side: 'R', axis: 'x', sensitivity: 0.35, labelZh: '肩 R', position: [0.36, 1.42, 0] },
  { id: 'heightFeel', name: 'Handle.Height', paramId: 'heightFeel', axis: 'y', sensitivity: 0.3, labelZh: '身高感', position: [0, 0.35, 0] },
];

const HANDLE_BY_ID = new Map(SCULPT_HANDLES.map((h) => [h.id, h]));
const HANDLE_BY_NAME = new Map(SCULPT_HANDLES.map((h) => [h.name, h]));

export function clampFaceRigValue(v: number): number {
  return Math.min(FACE_RIG_MAX, Math.max(FACE_RIG_MIN, Math.round(v)));
}

export function handleDefById(id: string): SculptHandleDef | undefined {
  return HANDLE_BY_ID.get(id);
}

export function handleDefByName(name: string): SculptHandleDef | undefined {
  return HANDLE_BY_NAME.get(name);
}

/** 屏幕像素位移 → 参数增量；y 轴向上为正。 */
export function handleDragDelta(handle: SculptHandleDef, dx: number, dy: number): number {
  const raw = handle.axis === 'x' ? dx : dy;
  return raw * handle.sensitivity;
}

/**
 * P2：控制点拖拽 → faceRig。
 * 对称模式（默认）写基础值并清 per-side；解锁后带 side 的 handle 写左右扩展值。
 */
export function applyHandleDrag(
  rig: CharacterFaceRig | undefined,
  handleId: string,
  dx: number,
  dy: number,
  options: { symmetric?: boolean } = {},
): CharacterFaceRig {
  const def = handleDefById(handleId);
  const base = getFaceRig(rig);
  if (!def) return base;
  const delta = handleDragDelta(def, dx, dy);
  if (!def.side || options.symmetric !== false) {
    const current = faceRigValue(base, def.paramId);
    return setFaceRigValue(base, def.paramId, clampFaceRigValue(current + delta));
  }
  const current = faceRigSideValue(base, def.paramId, def.side);
  return setFaceRigSideValue(base, def.paramId, def.side, clampFaceRigValue(current + delta));
}
