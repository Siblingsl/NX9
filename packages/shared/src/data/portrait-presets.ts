export interface PortraitPreset {
  id: string;
  group: string;
  label: string;
  tags: string;
}

export const PORTRAIT_PRESETS: PortraitPreset[] = [
  { id: 'hair-long', group: '发型', label: '长发', tags: 'long hair, flowing' },
  { id: 'hair-short', group: '发型', label: '短发', tags: 'short hair, neat' },
  { id: 'hair-braided', group: '发型', label: '编发', tags: 'braided hair' },
  { id: 'eye-soft', group: '五官', label: '柔和眼型', tags: 'soft eyes, gentle gaze' },
  { id: 'eye-sharp', group: '五官', label: '锐利眼型', tags: 'sharp eyes, intense gaze' },
  { id: 'face-oval', group: '脸型', label: '鹅蛋脸', tags: 'oval face' },
  { id: 'face-round', group: '脸型', label: '圆脸', tags: 'round face, youthful' },
  { id: 'outfit-casual', group: '服饰', label: '休闲', tags: 'casual outfit, modern streetwear' },
  { id: 'outfit-formal', group: '服饰', label: '正装', tags: 'formal suit, elegant' },
  { id: 'outfit-fantasy', group: '服饰', label: '奇幻', tags: 'fantasy armor, ornate details' },
  { id: 'vibe-calm', group: '气质', label: '沉静', tags: 'calm expression, serene mood' },
  { id: 'vibe-confident', group: '气质', label: '自信', tags: 'confident posture, charismatic' },
];

export function buildPortraitPrompt(selectedIds: string[], extra?: string): string {
  const parts = PORTRAIT_PRESETS.filter((p) => selectedIds.includes(p.id)).map((p) => p.tags);
  if (extra?.trim()) parts.push(extra.trim());
  return parts.join(', ');
}
