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
