/** Creative Asset Center — 结构化 Prompt */
export interface StructuredPrompt {
  version: 1;
  text: string;
  negative?: string;
  sections?: Record<string, string>;
  updatedAt?: number;
}

export function emptyStructuredPrompt(): StructuredPrompt {
  return { version: 1, text: '' };
}

export function touchStructuredPrompt(text: string, negative?: string): StructuredPrompt {
  return {
    version: 1,
    text,
    negative: negative?.trim() || undefined,
    updatedAt: Date.now(),
  };
}

/** 可扩展的键值素材项（表情 / 动作 / 角度） */
export interface CreativeVariantEntry {
  id: string;
  label: string;
  prompt?: string;
  imageUrl?: string;
  locked?: boolean;
}

export interface CharacterBodyMetrics {
  bust?: string;
  waist?: string;
  hip?: string;
  shoulderWidth?: string;
  legLength?: string;
  handLength?: string;
  footLength?: string;
}

export interface CharacterAppearanceDetails {
  skinTone?: string;
  hairColor?: string;
  eyeColor?: string;
  specialMarks?: string;
  tattoos?: string;
  scars?: string;
  accessories?: string;
}

export interface CharacterConsistencyMeta {
  negativePrompt?: string;
  consistencyPrompt?: string;
  seed?: string | number | null;
  loraId?: string | null;
  locked?: boolean;
}

export interface CharacterPromptPack {
  image?: StructuredPrompt;
  video?: StructuredPrompt;
  bible?: StructuredPrompt;
  negative?: StructuredPrompt;
}

/** 角色库 Creative Asset Center 扩展（与 CharacterProfile 合并存储） */
export interface CharacterCreativeExtension {
  nickname?: string;
  /** 剧本中的别名 / 称呼 / 错别字候选，例如：老林、林先生、林侦探 */
  aliases?: string[];
  age?: string;
  height?: string;
  weight?: string;
  occupation?: string;
  identityRole?: string;
  personalityText?: string;
  backgroundStory?: string;
  worldView?: string;
  fullSheetUrl?: string | null;
  frontViewUrl?: string | null;
  /** 主身份 3/4 站姿 */
  threeQuarterViewUrl?: string | null;
  sideViewUrl?: string | null;
  backViewUrl?: string | null;
  /** 正面/侧面剪影 */
  silhouetteFrontUrl?: string | null;
  silhouetteSideUrl?: string | null;
  /** 情绪特写（胸部以上） */
  emotionalCloseupUrl?: string | null;
  viewsLocked?: boolean;
  bodyMetrics?: CharacterBodyMetrics;
  appearanceDetails?: CharacterAppearanceDetails;
  expressions?: CreativeVariantEntry[];
  poses?: CreativeVariantEntry[];
  angles?: CreativeVariantEntry[];
  /** 微表情局部特写 */
  microExpressions?: CreativeVariantEntry[];
  /** 服装/材质细节格 */
  costumeDetails?: CreativeVariantEntry[];
  /** 手部参考格 */
  handRefs?: CreativeVariantEntry[];
  consistency?: CharacterConsistencyMeta;
  prompts?: CharacterPromptPack;
  /** 绑定的服装库条目 id */
  costumeId?: string | null;
  /** 绑定服装名称 */
  costumeLabel?: string | null;
  /** 绑定服装的可注入 Prompt 快照 */
  costumePrompt?: string | null;
  /** 设定板生成风格模式 */
  sheetStyleMode?: string | null;
  /** 核心主题一句话 */
  coreTheme?: string | null;
  /** 体型关键词 */
  bodyType?: string | null;
  /** 风格关键词 */
  styleKeywords?: string | null;
  gender?: string | null;
}

export interface SceneCreativeExtension {
  description?: string;
  tags?: string[];
  worldView?: string;
  referenceUrls?: string[];
  sheetUrl?: string | null;
  timeOfDay?: string;
  weather?: string;
  lighting?: string;
  colorTone?: string;
  recommendedCharacters?: string[];
  recommendedShots?: string[];
  recommendedMusic?: string[];
  recommendedSfx?: string[];
  recommendedActions?: string[];
  recommendedEmotions?: string[];
  prompts?: {
    scene?: StructuredPrompt;
    negative?: StructuredPrompt;
  };
}

export interface ShotCreativeExtension {
  purpose?: string;
  gifUrl?: string | null;
  exampleImageUrl?: string | null;
  recommendedPlot?: string;
  recommendedEmotion?: string;
  cameraMove?: string;
  durationSec?: number;
  shotSize?: string;
  favorite?: boolean;
  prompts?: {
    shot?: StructuredPrompt;
  };
}

export interface EmotionCreativeExtension {
  imageUrl?: string | null;
  characterDescription?: string;
  voiceDescription?: string;
  actionDescription?: string;
  shotRecommendation?: string;
  favorite?: boolean;
  prompts?: {
    emotion?: StructuredPrompt;
  };
}

export interface HookCreativeExtension {
  title?: string;
  purpose?: string;
  firstThreeSecondsScript?: string;
  applicableTypes?: string[];
  example?: string;
  prompts?: {
    hook?: StructuredPrompt;
  };
}

export interface VoiceCreativeExtension {
  voiceTone?: string;
  age?: string;
  gender?: string;
  speed?: string;
  emotion?: string;
  language?: string;
  favorite?: boolean;
  prompts?: {
    voice?: StructuredPrompt;
  };
}

/** 服装库 Creative Asset Center 扩展 */
export interface CostumeCreativeExtension {
  /** 套装简述 / 造型名 */
  description?: string;
  /** 服装类别：日常 / 正装 / 古装 / 战甲 等 */
  category?: string;
  /** 时代 / 风格 */
  eraStyle?: string;
  /** 主色与辅色 */
  colorPalette?: string;
  /** 面料与质感 */
  materials?: string;
  /** 剪裁与廓形 */
  silhouette?: string;
  /** 上衣 */
  top?: string;
  /** 下装 */
  bottom?: string;
  /** 外套 */
  outerwear?: string;
  /** 鞋履 */
  footwear?: string;
  /** 配饰 / 标志物 */
  accessories?: string;
  /** 适合角色（名称列表） */
  recommendedCharacters?: string[];
  /** 适用场景 */
  recommendedScenes?: string[];
  tags?: string[];
  /** 参考图 */
  referenceUrls?: string[];
  /** 服装设定板 */
  sheetUrl?: string | null;
  /** 锁定后防漂移 */
  locked?: boolean;
  prompts?: {
    costume?: StructuredPrompt;
    image?: StructuredPrompt;
    negative?: StructuredPrompt;
  };
}

export type WorkspaceCreativeExtension =
  | SceneCreativeExtension
  | ShotCreativeExtension
  | EmotionCreativeExtension
  | HookCreativeExtension
  | CostumeCreativeExtension;
