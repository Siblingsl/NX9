export interface LightRigPreset {
  id: string;
  label: string;
  /** 英文 prompt 片段，供 picture-gen / clip-gen */
  prompt: string;
  /** 场景背景色（Stage Deck 预览） */
  backgroundColor?: string;
  /** HDRI / 全景曝光建议 */
  exposure?: number;
}

export const LIGHT_RIG_PRESETS: LightRigPreset[] = [
  {
    id: 'three-point-soft',
    label: '三点柔光',
    prompt: 'three-point soft lighting, key light 45° camera-left, gentle fill, subtle rim light, cinematic portrait',
    backgroundColor: '#1a1c24',
    exposure: 1,
  },
  {
    id: 'rembrandt',
    label: '伦勃朗光',
    prompt: 'Rembrandt lighting, dramatic triangle highlight on cheek, moody shadows, classical portrait',
    backgroundColor: '#121018',
    exposure: 0.95,
  },
  {
    id: 'butterfly',
    label: '蝴蝶光',
    prompt: 'butterfly lighting, beauty dish overhead, soft glamour, even skin tones, fashion editorial',
    backgroundColor: '#f0eeea',
    exposure: 1.05,
  },
  {
    id: 'hdri-studio',
    label: 'HDRI 棚拍',
    prompt: 'HDRI studio environment, neutral white cyclorama, even ambient fill, product photography lighting',
    backgroundColor: '#e8e8ec',
    exposure: 1.1,
  },
  {
    id: 'golden-hour',
    label: '黄金时刻',
    prompt: 'golden hour sunlight, warm backlight, long shadows, lens flare, outdoor cinematic',
    backgroundColor: '#2a1810',
    exposure: 1.15,
  },
  {
    id: 'neon-night',
    label: '霓虹夜景',
    prompt: 'neon rim lights, cyan and magenta accents, wet surface reflections, cyberpunk night scene',
    backgroundColor: '#0a0814',
    exposure: 1.2,
  },
];

export function buildLightRigPrompt(presetId: string, extra?: string): string {
  const preset = LIGHT_RIG_PRESETS.find((p) => p.id === presetId) ?? LIGHT_RIG_PRESETS[0];
  return [preset.prompt, extra?.trim()].filter(Boolean).join(', ');
}
