export interface PosePreset {
  id: string;
  label: string;
  tags: string;
}

export const POSE_PRESETS: PosePreset[] = [
  { id: 'stand-neutral', label: '站立', tags: 'standing straight, neutral pose' },
  { id: 'walk', label: '行走', tags: 'walking mid-stride, dynamic motion' },
  { id: 'sit', label: '坐姿', tags: 'sitting relaxed, natural posture' },
  { id: 'run', label: '奔跑', tags: 'running action pose, energetic' },
  { id: 'reach', label: '伸手', tags: 'reaching forward, extended arm' },
  { id: 'look-back', label: '回眸', tags: 'looking over shoulder, three-quarter back view' },
  { id: 'cross-arms', label: '抱臂', tags: 'arms crossed, confident stance' },
  { id: 'crouch', label: '蹲姿', tags: 'crouching low, balanced center of gravity' },
];

export function buildPosePrompt(selectedId: string, subject?: string, extra?: string): string {
  const pose = POSE_PRESETS.find((p) => p.id === selectedId)?.tags ?? '';
  return [subject?.trim(), pose, extra?.trim()].filter(Boolean).join(', ');
}
