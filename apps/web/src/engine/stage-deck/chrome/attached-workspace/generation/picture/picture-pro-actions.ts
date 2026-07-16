/**
 * LibTV 对齐的图像专业动作目录。
 * 选中动作后：注入 prompt 模板 + 推荐比例/质量/模式，再走统一 picture-gen 执行链。
 */

export type PictureProCategoryId =
  | 'quick'
  | 'storyboard'
  | 'spatial'
  | 'design'
  | 'quality';

export type PictureProActionId =
  | 'text-to-image'
  | 'image-to-image'
  | 'upscale-hd'
  | 'director-storyboard'
  | 'storyboard'
  | 'grid-25'
  | 'story-grid-4'
  | 'evolve-plus-3s'
  | 'evolve-minus-5s'
  | 'panorama-720'
  | 'multi-cam-9'
  | 'char-face-3view'
  | 'char-design-sheet'
  | 'char-turnaround'
  | 'scene-design-sheet'
  | 'product-design-sheet'
  | 'portrait-refine'
  | 'cinematic-light';

export interface PictureProActionDef {
  id: PictureProActionId;
  category: PictureProCategoryId;
  label: string;
  hint: string;
  /** 是否需要参考图 */
  needsReference?: boolean;
  /** 写入节点的 pictureGenMode */
  pictureGenMode?:
    | 'text-to-image'
    | 'image-to-image'
    | 'multi-ref'
    | 'style-ref'
    | 'panorama-720'
    | 'upscale-hd';
  /** 推荐宽高比 */
  aspectRatio?: string;
  /** 推荐质量 */
  quality?: string;
  /** 强制张数 */
  imageCount?: number;
  /** 拼接到用户 prompt 后的专业模板 */
  promptSuffix: string;
  /** 空 prompt 时的默认描述占位（用户仍可改） */
  defaultPromptHint?: string;
  /** 在节点空态快捷入口展示 */
  quickOnEmpty?: boolean;
}

export interface PictureProCategoryDef {
  id: PictureProCategoryId;
  label: string;
}

export const PICTURE_PRO_CATEGORIES: PictureProCategoryDef[] = [
  { id: 'quick', label: '基础' },
  { id: 'storyboard', label: '分镜叙事' },
  { id: 'spatial', label: '空间与机位' },
  { id: 'design', label: '设定图' },
  { id: 'quality', label: '质感调节' },
];

export const PICTURE_PRO_ACTIONS: PictureProActionDef[] = [
  // ── 基础 ──
  {
    id: 'text-to-image',
    category: 'quick',
    label: '文生图',
    hint: '纯文字描述生成图像',
    pictureGenMode: 'text-to-image',
    promptSuffix: '',
    defaultPromptHint: '描述画面内容、构图、光影与风格…',
  },
  {
    id: 'image-to-image',
    category: 'quick',
    label: '图生图',
    hint: '基于参考图改写 / 重绘',
    needsReference: true,
    pictureGenMode: 'image-to-image',
    promptSuffix:
      'Keep the subject identity and composition readable from the reference; refine details, lighting and style as described.',
    defaultPromptHint: '描述想改成什么样…',
    quickOnEmpty: true,
  },
  {
    id: 'upscale-hd',
    category: 'quick',
    label: '图片高清',
    hint: '放大并增强清晰度',
    needsReference: true,
    pictureGenMode: 'upscale-hd',
    imageCount: 1,
    promptSuffix: '',
    defaultPromptHint: '可选：补充增强方向（皮肤 / 纹理 / 锐度）…',
    quickOnEmpty: true,
  },

  // ── 分镜叙事 ──
  {
    id: 'director-storyboard',
    category: 'storyboard',
    label: '调度故事板',
    hint: '生成带有运动轨迹等调度草图分镜',
    pictureGenMode: 'text-to-image',
    aspectRatio: '16:9',
    quality: 'high',
    promptSuffix: [
      'Director storyboard panel layout, cinematic previsualization.',
      'Clear motion arrows and camera path annotations where natural.',
      'Multiple sequential panels showing blocking and camera moves.',
      'Clean production sketch aesthetic, high contrast line work optional,',
      'film language: shot size, eyeline, action continuity.',
    ].join(' '),
    defaultPromptHint: '描述 10–15 秒内能演完的小段落：机位、对白或参考图…',
  },
  {
    id: 'storyboard',
    category: 'storyboard',
    label: '故事板',
    hint: '标准影视分镜条',
    pictureGenMode: 'text-to-image',
    aspectRatio: '16:9',
    promptSuffix: [
      'Professional film storyboard strip, sequential panels left to right.',
      'Consistent characters and environment across panels.',
      'Clear shot sizes (WS/MS/CU), camera angles labeled subtly if needed.',
      'Production-ready storyboard style, clean composition.',
    ].join(' '),
    defaultPromptHint: '描述这一场戏的镜头序列…',
  },
  {
    id: 'grid-25',
    category: 'storyboard',
    label: '25宫格连贯分镜',
    hint: '5×5 连贯分镜总览',
    pictureGenMode: 'text-to-image',
    aspectRatio: '1:1',
    quality: 'high',
    imageCount: 1,
    promptSuffix: [
      'Single image: 5x5 grid of 25 continuous storyboard frames.',
      'Same characters and world, chronological sequence, seamless narrative flow.',
      'Equal panel size, thin gutters, no text captions unless essential.',
      'Cinematic framing variety while keeping continuity.',
    ].join(' '),
    defaultPromptHint: '描述整段剧情的起承转合…',
  },
  {
    id: 'story-grid-4',
    category: 'storyboard',
    label: '剧情推演四宫格',
    hint: '2×2 剧情推演',
    pictureGenMode: 'text-to-image',
    aspectRatio: '1:1',
    imageCount: 1,
    promptSuffix: [
      'Single image: 2x2 four-panel story progression grid.',
      'Panel 1 setup, panel 2 rising action, panel 3 climax beat, panel 4 outcome.',
      'Same characters, coherent lighting and palette.',
    ].join(' '),
    defaultPromptHint: '描述要推演的剧情节点…',
  },
  {
    id: 'evolve-plus-3s',
    category: 'storyboard',
    label: '画面推演 · 3秒后',
    hint: '基于当前画面推演 3 秒后的状态',
    needsReference: true,
    pictureGenMode: 'image-to-image',
    promptSuffix: [
      'Temporal continuation: what happens about 3 seconds after the reference frame.',
      'Preserve identity, wardrobe, location and camera language.',
      'Natural motion progress, not a hard cut to a new scene.',
    ].join(' '),
    defaultPromptHint: '可选：补充动作意图…',
  },
  {
    id: 'evolve-minus-5s',
    category: 'storyboard',
    label: '画面推演 · 5秒前',
    hint: '基于当前画面回溯 5 秒前',
    needsReference: true,
    pictureGenMode: 'image-to-image',
    promptSuffix: [
      'Temporal reverse: what happened about 5 seconds before the reference frame.',
      'Preserve identity and world; show the preceding beat leading into the reference.',
    ].join(' '),
    defaultPromptHint: '可选：补充前序动作…',
  },

  // ── 空间与机位 ──
  {
    id: 'panorama-720',
    category: 'spatial',
    label: '720全景',
    hint: '360×180 等距柱状环境图',
    pictureGenMode: 'panorama-720',
    aspectRatio: '2:1',
    imageCount: 1,
    promptSuffix: '',
    defaultPromptHint: '只描述环境与氛围，不要写人物…',
  },
  {
    id: 'multi-cam-9',
    category: 'spatial',
    label: '多机位九宫格',
    hint: '同一瞬间 9 个机位',
    pictureGenMode: 'text-to-image',
    aspectRatio: '1:1',
    quality: 'high',
    imageCount: 1,
    promptSuffix: [
      'Single image: 3x3 nine-camera grid of the SAME moment and subject.',
      'Camera angles: extreme wide, wide, medium, close-up, low angle, high angle,',
      'over-the-shoulder, dutch, profile — consistent character and lighting.',
      'Thin panel borders, production multi-cam reference board.',
    ].join(' '),
    defaultPromptHint: '描述主体、场景与情绪…',
  },

  // ── 设定图 ──
  {
    id: 'char-face-3view',
    category: 'design',
    label: '角色脸部三视图',
    hint: '正面 / 侧面 / 3/4 脸部',
    pictureGenMode: 'text-to-image',
    aspectRatio: '16:9',
    quality: 'high',
    promptSuffix: [
      'Character face turnaround sheet on clean neutral background.',
      'Three head views: front, three-quarter, side profile — identical identity.',
      'Clear facial features, hair, expression neutral-to-soft, production design quality.',
    ].join(' '),
    defaultPromptHint: '描述角色五官、发型、气质…',
  },
  {
    id: 'char-design-sheet',
    category: 'design',
    label: '角色设定图',
    hint: '完整角色设定圣经页',
    pictureGenMode: 'text-to-image',
    aspectRatio: '3:2',
    quality: 'high',
    promptSuffix: [
      'Marvel-style character design sheet, white or light studio background.',
      'Full-body front pose, outfit details, accessories callouts,',
      'expression row and key props; production-ready character bible page.',
      'Consistent design language, high resolution concept art.',
    ].join(' '),
    defaultPromptHint: '描述角色身份、服装、性格标签…',
  },
  {
    id: 'char-turnaround',
    category: 'design',
    label: '角色三视图',
    hint: '全身正 / 侧 / 背',
    pictureGenMode: 'text-to-image',
    aspectRatio: '16:9',
    quality: 'high',
    promptSuffix: [
      'Full-body character turnaround: front, side, back views side by side.',
      'Identical proportions, outfit and silhouette; clean background; model sheet style.',
    ].join(' '),
    defaultPromptHint: '描述体型、服装与配饰…',
  },
  {
    id: 'scene-design-sheet',
    category: 'design',
    label: '场景设定图',
    hint: '环境关键设定',
    pictureGenMode: 'text-to-image',
    aspectRatio: '16:9',
    quality: 'high',
    promptSuffix: [
      'Environment design sheet / location bible illustration.',
      'Hero establishing view plus supporting angles or detail callouts if space allows.',
      'Clear spatial layout, materials, lighting mood; no hero characters unless needed for scale.',
    ].join(' '),
    defaultPromptHint: '描述场景地点、时代、氛围…',
  },
  {
    id: 'product-design-sheet',
    category: 'design',
    label: '产品设定图',
    hint: '道具 / 产品多视图',
    pictureGenMode: 'text-to-image',
    aspectRatio: '1:1',
    quality: 'high',
    promptSuffix: [
      'Product / prop design sheet on clean background.',
      'Orthographic multi-view (front, side, 3/4), material callouts, scale sense.',
      'Industrial design presentation quality.',
    ].join(' '),
    defaultPromptHint: '描述产品外形、材质与用途…',
  },

  // ── 质感调节 ──
  {
    id: 'portrait-refine',
    category: 'quality',
    label: '人像质感调节',
    hint: '皮肤 / 五官 / 写真质感',
    needsReference: true,
    pictureGenMode: 'image-to-image',
    quality: 'high',
    promptSuffix: [
      'Portrait quality refinement: natural skin texture, refined facial micro-detail,',
      'tasteful beauty lighting, preserve identity and likeness from reference.',
      'No plastic skin, no heavy makeup unless described.',
    ].join(' '),
    defaultPromptHint: '可选：写真风格 / 光线偏好…',
  },
  {
    id: 'cinematic-light',
    category: 'quality',
    label: '电影级光影校正',
    hint: '电影光比与色彩分级',
    needsReference: true,
    pictureGenMode: 'image-to-image',
    quality: 'high',
    promptSuffix: [
      'Cinematic lighting grade: motivated key/fill/rim, filmic contrast and color,',
      'preserve scene content and faces; elevate to theatrical release still quality.',
    ].join(' '),
    defaultPromptHint: '可选：冷暖调 / 时代感 / 片种…',
  },
];

export function lookupPictureProAction(id?: string | null): PictureProActionDef | undefined {
  if (!id) return undefined;
  return PICTURE_PRO_ACTIONS.find((a) => a.id === id);
}

export function pictureProActionsByCategory(
  category: PictureProCategoryId,
): PictureProActionDef[] {
  return PICTURE_PRO_ACTIONS.filter((a) => a.category === category);
}

/** 应用专业动作 → 节点 data patch（不含用户 prompt 正文） */
export function buildPictureProActionPatch(
  action: PictureProActionDef,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    pictureProAction: action.id,
    pictureProActionLabel: action.label,
  };
  if (action.pictureGenMode) {
    patch.pictureGenMode = action.pictureGenMode;
    patch.useImageReference =
      action.pictureGenMode === 'image-to-image' ||
      action.pictureGenMode === 'multi-ref' ||
      action.pictureGenMode === 'style-ref' ||
      action.pictureGenMode === 'upscale-hd' ||
      Boolean(action.needsReference);
  }
  if (action.aspectRatio) patch.aspectRatio = action.aspectRatio;
  if (action.quality) patch.quality = action.quality;
  if (action.imageCount != null) patch.imageCount = action.imageCount;
  if (action.pictureGenMode === 'panorama-720') {
    patch.aspectRatio = '2:1';
    patch.imageCount = 1;
    patch.panoramaProjection = 'equirectangular';
    patch.width = 2048;
    patch.height = 1024;
  }
  if (action.pictureGenMode === 'upscale-hd') {
    patch.imageCount = 1;
  }
  // 宫格类默认高画质
  if (action.id === 'grid-25' || action.id === 'multi-cam-9') {
    patch.quality = action.quality ?? 'high';
  }
  return patch;
}

/**
 * 组装最终生成 prompt：用户正文 + 专业模板后缀。
 * 避免重复拼接同一 suffix。
 */
export function composePictureProPrompt(
  userPrompt: string,
  action?: PictureProActionDef | null,
): string {
  const base = userPrompt.trim();
  const suffix = action?.promptSuffix?.trim() ?? '';
  if (!suffix) return base;
  if (base.includes(suffix.slice(0, 40))) return base;
  if (!base) return suffix;
  return `${base}\n\n[Professional mode · ${action!.label}]\n${suffix}`;
}
