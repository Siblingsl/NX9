export interface PictureGenModelDef {
  id: string;
  label: string;
  provider: 'openai' | 'fal';
  /** OpenAI model id 或 Fal model path */
  model: string;
  supportsReference?: boolean;
  defaultSize?: string;
  /** Fal 模型分辨率上限（超过会报错），undefined 表示无限制 */
  resolutionCap?: number;
}

export const PICTURE_GEN_MODELS: PictureGenModelDef[] = [
  {
    id: 'dall-e-3',
    label: 'DALL·E 3',
    provider: 'openai',
    model: 'dall-e-3',
    defaultSize: '1024x1024',
  },
  {
    id: 'dall-e-2',
    label: 'DALL·E 2',
    provider: 'openai',
    model: 'dall-e-2',
    defaultSize: '1024x1024',
  },
  {
    id: 'flux-dev',
    label: 'FLUX Dev',
    provider: 'fal',
    model: 'fal-ai/flux/dev',
    defaultSize: '1024x1024',
  },
  {
    id: 'flux-i2i',
    label: 'FLUX 图生图',
    provider: 'fal',
    model: 'fal-ai/flux/dev/image-to-image',
    supportsReference: true,
    defaultSize: '1024x1024',
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
  { id: 'veo', label: 'Veo', hint: 'OpenAI 兼容 /videos/generations' },
  { id: 'grok', label: 'Grok Video', hint: '需网关支持对应 model 名' },
  { id: 'seedance', label: 'Seedance', hint: '分镜连续链请用 motion-story' },
];

export const CLIP_GEN_ASPECTS = [
  { id: '16:9', label: '16:9 横屏' },
  { id: '9:16', label: '9:16 竖屏' },
  { id: '1:1', label: '1:1 方屏' },
] as const;

export function lookupPictureModel(id?: string): PictureGenModelDef {
  return PICTURE_GEN_MODELS.find((m) => m.id === id) ?? PICTURE_GEN_MODELS[0];
}
