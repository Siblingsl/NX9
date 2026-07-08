export interface FalModelDef {
  id: string;
  label: string;
  hint: string;
  needsImage?: boolean;
  needsPrompt?: boolean;
}

export const FAL_MODELS: FalModelDef[] = [
  {
    id: 'fal-ai/birefnet/v2',
    label: 'BiRefNet 抠图',
    hint: '高质量背景移除',
    needsImage: true,
  },
  {
    id: 'fal-ai/flux/dev',
    label: 'FLUX Dev 生图',
    hint: '文生图',
    needsPrompt: true,
  },
  {
    id: 'fal-ai/creative-upscaler',
    label: 'Creative Upscaler',
    hint: 'AI 放大增强',
    needsImage: true,
  },
];
