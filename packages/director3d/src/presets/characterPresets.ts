import type { CharacterBodyType } from '../schema/directorProject';

export interface PosePreset {
  id: string;
  label: string;
  body: [number, number, number];
  torso: [number, number, number];
  head: [number, number, number];
  armL: [number, number, number];
  armR: [number, number, number];
  legL: [number, number, number];
  legR: [number, number, number];
  offsetY?: number;
}

export const POSE_PRESETS: PosePreset[] = [
  {
    id: 'stand',
    label: '站立',
    body: [0, 0, 0],
    torso: [0, 0, 0],
    head: [0, 0, 0],
    armL: [0, 0, -8],
    armR: [0, 0, 8],
    legL: [0, 0, 0],
    legR: [0, 0, 0],
  },
  {
    id: 'walk',
    label: '行走',
    body: [0, 0, 0],
    torso: [4, 0, 0],
    head: [-2, 0, 0],
    armL: [18, 0, -12],
    armR: [-16, 0, 10],
    legL: [-14, 0, 0],
    legR: [10, 0, 0],
  },
  {
    id: 'run',
    label: '奔跑',
    body: [8, 0, 0],
    torso: [10, 0, 0],
    head: [-6, 0, 0],
    armL: [42, 0, -18],
    armR: [-38, 0, 16],
    legL: [-28, 0, 0],
    legR: [22, 0, 0],
  },
  {
    id: 'sit',
    label: '坐姿',
    body: [0, 0, 0],
    torso: [-8, 0, 0],
    head: [4, 0, 0],
    armL: [0, 0, -10],
    armR: [0, 0, 10],
    legL: [78, 0, 0],
    legR: [78, 0, 0],
    offsetY: -0.42,
  },
  {
    id: 'point',
    label: '指向',
    body: [0, 0, 0],
    torso: [0, 12, 0],
    head: [0, -8, 0],
    armL: [0, 0, -6],
    armR: [-55, 0, 42],
    legL: [0, 0, 0],
    legR: [0, 0, 0],
  },
  {
    id: 'think',
    label: '思考',
    body: [0, 0, 0],
    torso: [-4, 0, 0],
    head: [8, -12, 0],
    armL: [0, 0, -4],
    armR: [52, 0, 28],
    legL: [0, 0, 0],
    legR: [0, 0, 0],
  },
  {
    id: 'jump',
    label: '跳跃',
    body: [0, -30, 0],
    torso: [0, 0, 0],
    head: [0, 0, 0],
    armL: [30, 0, -10],
    armR: [30, 0, 10],
    legL: [-20, 0, 0],
    legR: [20, 0, 0],
    offsetY: -0.35,
  },
  {
    id: 'crouch',
    label: '蹲下',
    body: [0, 0, 0],
    torso: [-24, 0, 0],
    head: [16, 0, 0],
    armL: [0, 0, -8],
    armR: [0, 0, 8],
    legL: [52, 0, -6],
    legR: [52, 0, 6],
    offsetY: -0.38,
  },
  {
    id: 'lie',
    label: '躺下',
    body: [0, -50, 0],
    torso: [-90, 0, 0],
    head: [20, 0, 0],
    armL: [0, -20, -12],
    armR: [0, -20, 12],
    legL: [0, 0, -6],
    legR: [0, 0, 6],
    offsetY: -0.5,
  },
  {
    id: 'hands-up',
    label: '举手',
    body: [0, 0, 0],
    torso: [0, 0, 0],
    head: [0, 0, 0],
    armL: [-70, 0, -14],
    armR: [-70, 0, 14],
    legL: [0, 0, 0],
    legR: [0, 0, 0],
  },
  {
    id: 'hands-on-hips',
    label: '叉腰',
    body: [0, 0, 0],
    torso: [0, 0, 0],
    head: [0, 0, 0],
    armL: [12, 0, -32],
    armR: [-12, 0, 32],
    legL: [0, 0, 0],
    legR: [0, 0, 0],
  },
  {
    id: 'bow',
    label: '鞠躬',
    body: [0, 0, 0],
    torso: [-62, 0, 0],
    head: [32, 0, 0],
    armL: [0, 0, -10],
    armR: [0, 0, 10],
    legL: [0, 0, 0],
    legR: [0, 0, 0],
  },
  {
    id: 'wave',
    label: '挥手',
    body: [0, 0, 0],
    torso: [0, 6, 0],
    head: [0, -4, 0],
    armL: [0, 0, -6],
    armR: [-84, 0, 20],
    legL: [0, 0, 0],
    legR: [0, 0, 0],
  },
  {
    id: 'hug',
    label: '拥抱',
    body: [0, 0, 0],
    torso: [0, 0, 0],
    head: [0, 0, 0],
    armL: [20, 0, -30],
    armR: [-20, 0, -30],
    legL: [0, 0, 0],
    legR: [0, 0, 0],
  },
  {
    id: 'kneel',
    label: '跪姿',
    body: [0, 0, 0],
    torso: [-8, 0, 0],
    head: [4, 0, 0],
    armL: [0, 0, -8],
    armR: [0, 0, 8],
    legL: [50, 0, -8],
    legR: [50, 0, 8],
    offsetY: -0.42,
  },
  {
    id: 'dance',
    label: '舞蹈',
    body: [0, 0, 0],
    torso: [6, 0, 12],
    head: [-4, 0, -8],
    armL: [34, 0, -24],
    armR: [-28, 0, 20],
    legL: [-16, 0, 10],
    legR: [12, 0, -6],
  },
  {
    id: 'lean',
    label: '倚靠',
    body: [0, 0, 6],
    torso: [4, 0, 0],
    head: [-2, 0, 0],
    armL: [0, 0, -10],
    armR: [-40, 0, 10],
    legL: [0, 0, 0],
    legR: [0, 0, 0],
  },
  {
    id: 'carry',
    label: '搬运',
    body: [0, 0, 0],
    torso: [10, 0, 0],
    head: [-4, 0, 0],
    armL: [40, 0, -20],
    armR: [40, 0, 20],
    legL: [0, 0, 0],
    legR: [0, 0, 0],
  },
  {
    id: 'cross-arms',
    label: '抱臂',
    body: [0, 0, 0],
    torso: [0, 0, 0],
    head: [0, 0, 0],
    armL: [8, 0, -32],
    armR: [-8, 0, -26],
    legL: [0, 0, 0],
    legR: [0, 0, 0],
  },
];

export const BODY_TYPES: { id: CharacterBodyType; label: string; scale: [number, number, number] }[] = [
  { id: 'neutral', label: '标准', scale: [1, 1, 1] },
  { id: 'slim', label: '纤细', scale: [0.88, 1.02, 0.88] },
  { id: 'broad', label: '宽肩', scale: [1.12, 0.98, 1.08] },
  { id: 'tall', label: '高挑', scale: [0.92, 1.14, 0.92] },
  { id: 'compact', label: '紧凑', scale: [1.05, 0.88, 1.05] },
  { id: 'child', label: '少年', scale: [0.78, 0.78, 0.78] },
  { id: 'hero', label: '英雄', scale: [1.08, 1.06, 1.08] },
  { id: 'actor', label: '演员', scale: [0.96, 1, 0.96] },
];

export function lookupPose(id?: string): PosePreset {
  return POSE_PRESETS.find((p) => p.id === id) ?? POSE_PRESETS[0];
}

export function lookupBody(id?: CharacterBodyType) {
  return BODY_TYPES.find((b) => b.id === id) ?? BODY_TYPES[0];
}

/** Relative Euler offsets (deg) layered on a pose preset — NX9 self-impl, not AGPL joint drag. */
export type PoseJointKey = 'body' | 'torso' | 'head' | 'armL' | 'armR' | 'legL' | 'legR';

export type PoseJointOverride = Partial<Record<PoseJointKey, [number, number, number]>>;

export const POSE_JOINT_SLIDERS: {
  key: PoseJointKey;
  axis: 0 | 1 | 2;
  label: string;
  min: number;
  max: number;
}[] = [
  { key: 'head', axis: 0, label: '头俯仰', min: -45, max: 45 },
  { key: 'head', axis: 1, label: '头左右', min: -60, max: 60 },
  { key: 'torso', axis: 0, label: '躯干俯仰', min: -40, max: 40 },
  { key: 'torso', axis: 1, label: '躯干扭转', min: -50, max: 50 },
  { key: 'armL', axis: 0, label: '左臂抬落', min: -90, max: 90 },
  { key: 'armR', axis: 0, label: '右臂抬落', min: -90, max: 90 },
  { key: 'legL', axis: 0, label: '左腿屈伸', min: -60, max: 90 },
  { key: 'legR', axis: 0, label: '右腿屈伸', min: -60, max: 90 },
];

function addEuler(
  base: [number, number, number],
  delta?: [number, number, number],
): [number, number, number] {
  if (!delta) return base;
  return [base[0] + delta[0], base[1] + delta[1], base[2] + delta[2]];
}

/** Merge pose preset with optional per-joint offsets (degrees). */
export function mergePose(presetId?: string, override?: PoseJointOverride | null): PosePreset {
  const base = lookupPose(presetId);
  if (!override) return base;
  return {
    ...base,
    body: addEuler(base.body, override.body),
    torso: addEuler(base.torso, override.torso),
    head: addEuler(base.head, override.head),
    armL: addEuler(base.armL, override.armL),
    armR: addEuler(base.armR, override.armR),
    legL: addEuler(base.legL, override.legL),
    legR: addEuler(base.legR, override.legR),
  };
}

export function setJointAxis(
  override: PoseJointOverride | undefined,
  key: PoseJointKey,
  axis: 0 | 1 | 2,
  value: number,
): PoseJointOverride {
  const prev = override?.[key] ?? ([0, 0, 0] as [number, number, number]);
  const next: [number, number, number] = [...prev];
  next[axis] = value;
  const out: PoseJointOverride = { ...(override ?? {}), [key]: next };
  if (next[0] === 0 && next[1] === 0 && next[2] === 0) {
    delete out[key];
  }
  return out;
}
