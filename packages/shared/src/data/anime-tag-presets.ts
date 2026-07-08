export interface TagPreset {
  id: string;
  label: string;
  tags: string;
  group: string;
}

export const ANIME_TAG_PRESETS: TagPreset[] = [
  { id: 'slice-life', group: '题材', label: '日常', tags: 'slice of life, cozy atmosphere, soft colors' },
  { id: 'shonen', group: '题材', label: '热血', tags: 'shonen, dynamic action, bold lines, intense energy' },
  { id: 'isekai', group: '题材', label: '异世界', tags: 'isekai fantasy, magical world, adventure' },
  { id: 'ghibli', group: '风格', label: '吉卜力风', tags: 'studio ghibli style, painterly backgrounds, warm nostalgia' },
  { id: 'mappa', group: '风格', label: 'MAPPA 风', tags: 'high contrast anime, cinematic shading, detailed linework' },
  { id: 'cel-shade', group: '风格', label: '赛璐璐', tags: 'cel shading, flat colors, clean outlines' },
  { id: 'watercolor', group: '风格', label: '水彩', tags: 'watercolor anime illustration, soft edges' },
  { id: 'night-neon', group: '氛围', label: '霓虹夜', tags: 'neon lights, rainy night city, cyberpunk anime' },
  { id: 'sunset', group: '氛围', label: '黄昏', tags: 'golden hour anime sky, lens flare, emotional tone' },
  { id: 'school', group: '场景', label: '校园', tags: 'japanese high school, classroom, cherry blossoms' },
];

export const ANGLE_PRESETS = [
  { id: 'front', label: '正面', prompt: 'front view, facing camera, symmetrical composition' },
  { id: 'three-quarter', label: '3/4 侧', prompt: 'three-quarter view, slight turn, depth in pose' },
  { id: 'side', label: '侧面', prompt: 'profile view, side angle, silhouette readable' },
  { id: 'back', label: '背面', prompt: 'back view, over-shoulder hint, environment context' },
  { id: 'low', label: '仰拍', prompt: 'low angle shot, heroic perspective, looking up' },
  { id: 'high', label: '俯拍', prompt: 'high angle shot, top-down perspective' },
  { id: 'bird', label: '鸟瞰', prompt: 'bird eye view, wide environmental layout' },
] as const;
