export type PromptTemplateCategory = 'image' | 'video' | 'story' | 'portrait' | 'product';

export interface PromptTemplate {
  id: string;
  label: string;
  description: string;
  category: PromptTemplateCategory;
  /** 英文 prompt，可直接用于 picture-gen / clip-gen */
  promptEn: string;
  /** 可选中文说明，导入故事板或备忘 */
  promptZh?: string;
  tags?: string[];
}

export const PROMPT_TEMPLATE_CATEGORIES: { key: PromptTemplateCategory; label: string }[] = [
  { key: 'image', label: '图像' },
  { key: 'video', label: '视频' },
  { key: 'story', label: '分镜' },
  { key: 'portrait', label: '人像' },
  { key: 'product', label: '产品' },
];

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'img-cinematic-portrait',
    label: '电影感人像',
    description: '柔光、浅景深、胶片颗粒',
    category: 'portrait',
    promptEn:
      'cinematic portrait, soft window light, shallow depth of field, 85mm lens, subtle film grain, natural skin texture, editorial photography',
    promptZh: '电影感人像，窗边柔光，浅景深',
    tags: ['portrait', 'cinematic'],
  },
  {
    id: 'img-anime-key-visual',
    label: '动漫主视觉',
    description: '高饱和、清晰线稿、海报构图',
    category: 'image',
    promptEn:
      'anime key visual, vibrant colors, clean line art, dynamic composition, detailed background, studio quality illustration',
    promptZh: '动漫主视觉海报',
    tags: ['anime'],
  },
  {
    id: 'img-product-studio',
    label: '产品棚拍',
    description: '白底/渐变底商业产品图',
    category: 'product',
    promptEn:
      'professional product photography, studio lighting, soft shadow, clean gradient background, high detail, commercial advertising style',
    promptZh: '商业产品棚拍',
    tags: ['product'],
  },
  {
    id: 'img-landscape-mood',
    label: '氛围风景',
    description: '广角、黄金时刻、史诗感',
    category: 'image',
    promptEn:
      'epic landscape, golden hour, wide angle, atmospheric haze, dramatic clouds, ultra detailed environment art',
    promptZh: '史诗氛围风景',
    tags: ['landscape'],
  },
  {
    id: 'vid-dolly-in',
    label: '镜头推近',
    description: '缓慢 dolly in，主体居中',
    category: 'video',
    promptEn:
      'slow cinematic dolly in toward subject, stable camera, shallow depth of field, natural motion, 4K video',
    promptZh: '缓慢推镜头',
    tags: ['camera'],
  },
  {
    id: 'vid-orbit-product',
    label: '产品环绕',
    description: '360° 环绕展示',
    category: 'video',
    promptEn:
      'smooth orbital camera move around product, studio lighting, seamless loop feel, commercial showcase, 4K',
    promptZh: '产品环绕镜头',
    tags: ['product', 'camera'],
  },
  {
    id: 'vid-walking-shot',
    label: '跟拍行走',
    description: '手持跟拍，街头纪实感',
    category: 'video',
    promptEn:
      'handheld follow shot, subject walking through urban street, natural daylight, documentary style, subtle camera sway',
    promptZh: '街头跟拍行走',
    tags: ['street'],
  },
  {
    id: 'story-opening-hook',
    label: '开场钩子',
    description: '3 秒抓注意力分镜描述',
    category: 'story',
    promptEn:
      'Opening hook: extreme close-up of eyes widening, quick cut to wide reveal of mysterious location, high contrast lighting, suspenseful mood, 3 seconds',
    promptZh: '开场钩子：特写眼睛 → 大全景揭示',
    tags: ['storyboard'],
  },
  {
    id: 'story-dialogue-two-shot',
    label: '双人对话',
    description: '过肩 + 反打经典构图',
    category: 'story',
    promptEn:
      'Two-shot dialogue scene, over-the-shoulder framing, warm interior lighting, emotional subtle expressions, cinematic color grade',
    promptZh: '双人对话过肩镜头',
    tags: ['storyboard'],
  },
  {
    id: 'story-action-chase',
    label: '动作追逐',
    description: '快节奏、手持、动态模糊',
    category: 'story',
    promptEn:
      'High-energy chase sequence, handheld camera, motion blur, dynamic angles, urban alley at night, neon reflections',
    promptZh: '夜间巷战追逐',
    tags: ['storyboard', 'action'],
  },
  {
    id: 'portrait-beauty-soft',
    label: '美妆柔肤',
    description: '高调布光、皮肤质感',
    category: 'portrait',
    promptEn:
      'beauty portrait, soft high-key lighting, flawless but natural skin, minimal makeup emphasis, pastel background, magazine cover',
    promptZh: '美妆柔光人像',
    tags: ['beauty'],
  },
  {
    id: 'portrait-noir',
    label: '黑色电影',
    description: '高对比侧光、阴影',
    category: 'portrait',
    promptEn:
      'film noir portrait, hard side light, deep shadows, venetian blind patterns, monochrome with subtle color accent, 1940s detective mood',
    promptZh: '黑色电影风格人像',
    tags: ['noir'],
  },
  {
    id: 'product-lifestyle',
    label: '生活方式产品',
    description: '场景化使用情境',
    category: 'product',
    promptEn:
      'lifestyle product shot, product in natural daily scene, warm morning light, cozy interior, authentic candid feel',
    promptZh: '生活方式场景产品图',
    tags: ['product'],
  },
  {
    id: 'img-isometric-room',
    label: '等距小场景',
    description: '游戏/信息图风格',
    category: 'image',
    promptEn:
      'isometric diorama room, cute stylized 3D render, soft global illumination, miniature scene, clean edges, playful colors',
    promptZh: '等距迷你场景',
    tags: ['isometric'],
  },
  {
    id: 'vid-timelapse-sky',
    label: '延时天空',
    description: '云层流动、固定机位',
    category: 'video',
    promptEn:
      'locked-off timelapse, dramatic clouds moving across sky, sunset color transition, smooth motion, cinematic grade',
    promptZh: '固定机位天空延时',
    tags: ['timelapse'],
  },
  {
    id: 'story-emotional-close',
    label: '情绪特写',
    description: '微表情、静默时刻',
    category: 'story',
    promptEn:
      'Emotional close-up, subtle tear, shallow focus, quiet moment before decision, warm tungsten light, intimate framing',
    promptZh: '情绪特写，决定前静默',
    tags: ['storyboard'],
  },
];

export function lookupPromptTemplate(id: string): PromptTemplate | undefined {
  return PROMPT_TEMPLATES.find((t) => t.id === id);
}
