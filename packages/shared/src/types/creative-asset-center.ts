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
  sideViewUrl?: string | null;
  backViewUrl?: string | null;
  viewsLocked?: boolean;
  bodyMetrics?: CharacterBodyMetrics;
  appearanceDetails?: CharacterAppearanceDetails;
  expressions?: CreativeVariantEntry[];
  poses?: CreativeVariantEntry[];
  angles?: CreativeVariantEntry[];
  consistency?: CharacterConsistencyMeta;
  prompts?: CharacterPromptPack;
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

export type WorkspaceCreativeExtension =
  | SceneCreativeExtension
  | ShotCreativeExtension
  | EmotionCreativeExtension
  | HookCreativeExtension;
