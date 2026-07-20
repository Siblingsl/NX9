export interface PictureGenModelDef {
  id: string;
  label: string;
  provider: 'openai' | 'fal' | 'magichour' | 'gemini';
  /** OpenAI model id、Fal model path，或 Magic Hour 路由名 */
  model: string;
  supportsReference?: boolean;
  defaultSize?: string;
  /** Fal 模型分辨率上限（超过会报错），undefined 表示无限制 */
  resolutionCap?: number;
  /** UI 分组提示（可选） */
  group?: 'gemini' | 'openai' | 'fal' | 'other';
  /** 简短能力说明 */
  hint?: string;
}

/**
 * 图片生成可选模型。
 * Gemini / Imagen 走服务端 GeminiAdapter（需 Gemini API Key）。
 *
 * 免费 API 优先用 gemini-2.5-flash-image（Nano Banana）。
 * 3.1 / Pro 等多需付费 API 配额（网页 Pro ≠ API 额度）。
 */
export const PICTURE_GEN_MODELS: PictureGenModelDef[] = [
  {
    id: 'gemini-2.5-flash-image',
    label: 'Gemini 2.5 Flash Image（免费）',
    provider: 'gemini',
    model: 'gemini-2.5-flash-image',
    supportsReference: true,
    defaultSize: '1024x1024',
    group: 'gemini',
    hint: 'API 免费档首选 · Nano Banana',
  },
  {
    id: 'gemini-3.1-flash-image',
    label: 'Gemini 3.1 Flash Image',
    provider: 'gemini',
    model: 'gemini-3.1-flash-image',
    supportsReference: true,
    defaultSize: '1024x1024',
    group: 'gemini',
    hint: '需 API 付费配额 · Nano Banana 2',
  },
  {
    id: 'gemini-3.1-flash-lite-image',
    label: 'Gemini 3.1 Flash Lite Image',
    provider: 'gemini',
    model: 'gemini-3.1-flash-lite-image',
    supportsReference: false,
    defaultSize: '1024x1024',
    group: 'gemini',
    hint: '轻量 · 多需付费配额',
  },
  {
    id: 'gemini-3-pro-image',
    label: 'Gemini 3 Pro Image',
    provider: 'gemini',
    model: 'gemini-3-pro-image',
    supportsReference: true,
    defaultSize: '1024x1024',
    group: 'gemini',
    hint: '高阶 · 需 API 付费配额',
  },
  {
    id: 'imagen-4',
    label: 'Imagen 4',
    provider: 'gemini',
    model: 'imagen-4.0-generate-001',
    defaultSize: '1024x1024',
    group: 'gemini',
    hint: 'Google Imagen · 多需付费',
  },
  {
    id: 'imagen-4-ultra',
    label: 'Imagen 4 Ultra',
    provider: 'gemini',
    model: 'imagen-4.0-ultra-generate-001',
    defaultSize: '1024x1024',
    group: 'gemini',
    hint: 'Imagen 最高画质',
  },
  {
    id: 'imagen-4-fast',
    label: 'Imagen 4 Fast',
    provider: 'gemini',
    model: 'imagen-4.0-fast-generate-001',
    defaultSize: '1024x1024',
    group: 'gemini',
    hint: 'Imagen 快速档',
  },
  {
    id: 'dall-e-3',
    label: 'DALL·E 3',
    provider: 'openai',
    model: 'dall-e-3',
    defaultSize: '1024x1024',
    group: 'openai',
  },
  {
    id: 'dall-e-2',
    label: 'DALL·E 2',
    provider: 'openai',
    model: 'dall-e-2',
    defaultSize: '1024x1024',
    group: 'openai',
  },
  {
    id: 'magic-hour',
    label: 'Magic Hour',
    provider: 'magichour',
    model: 'magic-hour',
    defaultSize: '1024x1024',
    group: 'other',
  },
  {
    id: 'flux-dev',
    label: 'FLUX Dev',
    provider: 'fal',
    model: 'fal-ai/flux/dev',
    defaultSize: '1024x1024',
    group: 'fal',
  },
  {
    id: 'flux-i2i',
    label: 'FLUX 图生图',
    provider: 'fal',
    model: 'fal-ai/flux/dev/image-to-image',
    supportsReference: true,
    defaultSize: '1024x1024',
    group: 'fal',
  },
];

export const PICTURE_GEN_SIZES = [
  { id: '1024x1024', label: '1:1 方图' },
  { id: '1024x1792', label: '9:16 竖图' },
  { id: '1792x1024', label: '16:9 横图' },
] as const;

export interface ClipGenModelDef {
  id: string;
  label: string;
  hint: string;
}

export const CLIP_GEN_MODELS: ClipGenModelDef[] = [
  { id: 'magic-hour', label: 'Magic Hour', hint: '文生视频 / 图生视频（需 MAGIC_HOUR_API_KEY）' },
  { id: 'mh-ltx-2.3', label: 'MH LTX 2.3', hint: 'Magic Hour 免费层推荐，速度快' },
  { id: 'veo', label: 'Veo', hint: 'OpenAI 兼容 /videos/generations' },
  { id: 'grok-imagine-video', label: 'Grok Imagine', hint: 'xAI 官方 / GrokGo 测试通道' },
  { id: 'grok-imagine-video-1.5', label: 'Grok Imagine 1.5', hint: 'xAI 官方 / GrokGo 测试通道，图生视频更稳定' },
  { id: 'grok', label: 'Grok Video', hint: '兼容旧节点，自动映射到 Grok Imagine' },
  { id: 'seedance', label: 'Seedance', hint: '分镜连续链请用 motion-story' },
];

export const CLIP_GEN_ASPECTS = [
  { id: '16:9', label: '16:9 横屏' },
  { id: '9:16', label: '9:16 竖屏' },
  { id: '1:1', label: '1:1 方屏' },
] as const;

/** 默认图片模型：免费 API 友好的 2.5 Flash Image */
export const DEFAULT_PICTURE_GEN_MODEL_ID = 'gemini-2.5-flash-image';

export function lookupPictureModel(id?: string): PictureGenModelDef {
  if (id) {
    const hit = PICTURE_GEN_MODELS.find((m) => m.id === id || m.model === id);
    if (hit) return hit;
  }
  return (
    PICTURE_GEN_MODELS.find((m) => m.id === DEFAULT_PICTURE_GEN_MODEL_ID) ||
    PICTURE_GEN_MODELS.find((m) => m.provider === 'gemini') ||
    PICTURE_GEN_MODELS[0]
  );
}
