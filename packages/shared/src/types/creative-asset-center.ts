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
  /** H-03 / C-06：锁定时写入的 Prompt 快照，用于漂移检测 */
  lockedPromptSnapshot?: string;
  lockedAt?: string;
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
  /** 角色完整设定板（ID LOCK 母图；五类分类原图的唯一角色参考） */
  fullSheetUrl?: string | null;
  /** 五张分类母图原图，便于追溯裁切来源 */
  categorySheetUrls?: Record<string, string>;
  frontViewUrl?: string | null;
  /** 主身份 3/4 站姿 */
  threeQuarterViewUrl?: string | null;
  sideViewUrl?: string | null;
  backViewUrl?: string | null;
  /** 正面/侧面剪影 */
  silhouetteFrontUrl?: string | null;
  silhouetteSideUrl?: string | null;
  /** 完整设定板内的定妆头像（脸锁）；可选，不单独展示编辑 */
  faceLockUrl?: string | null;
  /** @deprecated 情绪特写已并入表情系统；保留字段仅兼容旧数据，不再生成/展示 */
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
  /** 设定板主景裁切封面（卡片优先；整板仍在 sheetUrl） */
  coverUrl?: string | null;
  timeOfDay?: string;
  weather?: string;
  lighting?: string;
  colorTone?: string;
  /** 对应 EnvironmentProfile.id，素材库 ↔ 环境圣经双向同步 */
  environmentId?: string;
  sceneCode?: string;
  props?: string[];
  /** 场景挂接的道具库条目 id（Scn-01 / Prop-05） */
  propIds?: string[];
  locked?: boolean;
  forbiddenDrift?: string;
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

/** 公共镜头库运镜族（主分类） */
export type ShotMoveFamily =
  | 'static'
  | 'dolly'
  | 'pan_tilt'
  | 'track'
  | 'crane'
  | 'orbit'
  | 'special';

export interface ShotCreativeExtension {
  purpose?: string;
  gifUrl?: string | null;
  exampleImageUrl?: string | null;
  recommendedPlot?: string;
  /** @deprecated 优先用 emotionTags；保留兼容旧数据 */
  recommendedEmotion?: string;
  /** 表演/氛围标签（内置预设或自定义；不替代角色表情格） */
  emotionTags?: string[];
  /** 运镜族：摄影动作粗分（三级筛选） */
  moveFamily?: ShotMoveFamily;
  /** 词典体系 id：system1 实拍 / system2 AI·CG（一级筛选） */
  lexiconSystemId?: string;
  /** 词典体系全称 */
  lexiconSystem?: string;
  /** 词典分类（二级筛选，如「基础推拉变焦运镜」） */
  lexiconCategory?: string;
  cameraMove?: string;
  durationSec?: number;
  shotSize?: string;
  favorite?: boolean;
  /** Shot-02：与角色同级锁定 */
  locked?: boolean;
  /** H-03：锁定时 Prompt 快照 */
  lockedPromptSnapshot?: string;
  lockedAt?: string;
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
  /** Emo-02 */
  locked?: boolean;
  lockedPromptSnapshot?: string;
  lockedAt?: string;
  /** Emo-01：从角色表情格发布时记录来源 */
  sourceCharacterId?: string;
  sourceExpressionId?: string;
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
  favorite?: boolean;
  /** Hook-02 */
  locked?: boolean;
  lockedPromptSnapshot?: string;
  lockedAt?: string;
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

/** 道具库 Creative Asset Center 扩展（轻量：对齐服装子集，无完整设定板五分类） */
export interface PropCreativeExtension {
  /** 外观 / 用途简述 */
  description?: string;
  /** 类别：手持 / 陈设 / 载具… */
  category?: string;
  /** 材质与质感 */
  materials?: string;
  /** 标志细节（连续性锚点） */
  landmarks?: string;
  /** 所属或常出场景名（文本兼容） */
  linkedScenes?: string[];
  /** 关联场景库 id（与场景 propIds 双向） */
  linkedSceneIds?: string[];
  tags?: string[];
  /** 参考图 */
  referenceUrls?: string[];
  /** 主参考 / 三视图设定板 */
  sheetUrl?: string | null;
  /** 三视图正面格裁切封面（卡片优先） */
  coverUrl?: string | null;
  /** 锁定后防漂移 */
  locked?: boolean;
  prompts?: {
    prop?: StructuredPrompt;
    image?: StructuredPrompt;
    negative?: StructuredPrompt;
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
  /** 设定板裁切/上传的正面全身衣封面 */
  frontFlatUrl?: string | null;
  /** 状态变体：破损 / 湿衣 / 夜视 / 战斗等（轻量，默认空） */
  variants?: CreativeVariantEntry[];
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
  | CostumeCreativeExtension
  | PropCreativeExtension;
