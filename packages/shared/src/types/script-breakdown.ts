import type { StoryboardShot } from './storyboard';
import type { CharacterProfile } from './character';
import type { EnvironmentProfile } from './environment';

export interface ScriptBreakdownDialogueLine {
  speaker: string;
  text: string;
  emotion?: string;
}

export interface ScriptBreakdownStoryAnalysis {
  title?: string;
  genre?: string;
  coreTheme?: string;
  background?: {
    era?: string;
    location?: string;
    worldview?: string;
  };
  visualStyle?: string;
}

export interface ScriptBreakdownCharacterProfile {
  name: string;
  identity?: string;
  age?: string;
  appearance?: string;
  height?: string;
  bodyType?: string;
  hairstyle?: string;
  costume?: string;
  signatureElements?: string;
  personality?: string;
  relationships?: string;
  goal?: string;
  currentEmotion?: string;
  fixedVisualKeywords?: string;
}

export interface ScriptBreakdownAct {
  name: string;
  title?: string;
  storyGoal?: string;
  conflict?: string;
  emotionalShift?: string;
  keyEvents?: string[];
  characterChange?: string;
}

export type ScriptSourceType = 'auto' | 'novel' | 'screenplay' | 'outline';
export type ScriptPacing = 'slow' | 'balanced' | 'fast';
export type ScriptAdaptationFidelity = 'strict' | 'balanced' | 'creative';
export type ScriptDialogueDensity = 'low' | 'medium' | 'high';
export type ScriptPromptLanguage = 'zh' | 'en' | 'bilingual';

export interface ScriptDirectorControls {
  storyGenres: string[];
  narrativeStyles: string[];
  emotionalTones: string[];
  imageStyles: string[];
  videoStyles: string[];
  lightingStyles: string[];
  colorStyles: string[];
  cinematographyStyles: string[];
  shotSizes: string[];
  cameraMoves: string[];
  shotFeelings: string[];
  eraBackgrounds: string[];
  sceneEnvironments: string[];
  architectureStyles: string[];
  costumeStyles: string[];
  musicStyles: string[];
  soundEffectStyles: string[];
  imageQualities: string[];
  characterPerformances: string[];
  actionIntensities: string[];
  continuityRequirements: string[];
  targetPlatforms: string[];
}

export interface ScriptBreakdownConfig {
  sourceType: ScriptSourceType;
  episodeMode: 'auto' | 'fixed';
  episodeCount: number;
  targetEpisodeDurationSec: number;
  minShotDurationSec: number;
  maxShotDurationSec: number;
  maxShotsPerEpisode: number;
  pacing: ScriptPacing;
  adaptationFidelity: ScriptAdaptationFidelity;
  dialogueDensity: ScriptDialogueDensity;
  targetFormat: 'comic' | 'live-action' | 'anime';
  aspectRatio: '16:9' | '9:16' | '1:1';
  promptLanguage: ScriptPromptLanguage;
  visualStyle: string;
  continuityLevel: 'normal' | 'strict';
  allowRuleFallback: boolean;
  directorControls: ScriptDirectorControls;
}

export interface ScriptBreakdownPromptTemplates {
  episodePlannerSystem: string;
  episodeBreakdownSystem: string;
}

export interface ScriptBreakdownPromptPack {
  schema: 'nx9-script-breakdown-prompt';
  version: 1;
  exportedAt: string;
  config: ScriptBreakdownConfig;
  prompts: ScriptBreakdownPromptTemplates;
}

export interface ScriptBreakdownExportEnvelope {
  schema: 'nx9-script-breakdown-result';
  version: 1;
  exportedAt: string;
  payload: ScriptBreakdownPayload;
}

export interface ScriptBreakdownDiagnostic {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  episodeId?: string;
}

export interface ScriptBreakdownShot {
  id: string;
  episodeId: string;
  episodeIndex: number;
  index: number;
  sceneId: string;
  sceneCode: string;
  title: string;
  purpose?: string;
  durationSec: number;
  shotSize?: 'ECU' | 'CU' | 'MS' | 'FS' | 'WS' | 'OTS';
  cameraMove?: '固定' | '推' | '拉' | '摇' | '移' | '跟' | '手持';
  cameraAngle?: string;
  cameraLens?: string;
  characters: string[];
  scene: string;
  scriptText: string;
  visual?: string;
  action?: string;
  dialogue: ScriptBreakdownDialogueLine[];
  narration?: string;
  sound?: string;
  imagePrompt: string;
  videoPrompt: string;
  continuityNotes?: string[];
  negativePrompt?: string;
  referenceImageUrl?: string | null;
  previewImageUrl?: string | null;
  status: 'draft' | 'previewing' | 'approved';
}

export interface ScriptBreakdownScene {
  id: string;
  episodeId: string;
  index: number;
  code: string;
  title: string;
  location: string;
  timeOfDay: string;
  interiorExterior: 'INT' | 'EXT' | 'INT/EXT';
  summary?: string;
  shots: ScriptBreakdownShot[];
}

export interface ScriptBreakdownEpisode {
  id: string;
  index: number;
  title: string;
  logline?: string;
  sourceText?: string;
  scenes?: ScriptBreakdownScene[];
  shots: ScriptBreakdownShot[];
}

export interface ScriptBreakdownPayload {
  version: 1;
  title: string;
  sourceText: string;
  storyAnalysis?: ScriptBreakdownStoryAnalysis;
  characters?: ScriptBreakdownCharacterProfile[];
  acts?: ScriptBreakdownAct[];
  episodes: ScriptBreakdownEpisode[];
  config?: ScriptBreakdownConfig;
  diagnostics?: ScriptBreakdownDiagnostic[];
  promptVersion?: string;
  generatedAt: string;
}

export const DEFAULT_SCRIPT_BREAKDOWN_CONFIG: ScriptBreakdownConfig = {
  sourceType: 'auto',
  episodeMode: 'auto',
  episodeCount: 1,
  targetEpisodeDurationSec: 90,
  minShotDurationSec: 3,
  maxShotDurationSec: 8,
  maxShotsPerEpisode: 24,
  pacing: 'balanced',
  adaptationFidelity: 'balanced',
  dialogueDensity: 'medium',
  targetFormat: 'comic',
  aspectRatio: '16:9',
  promptLanguage: 'bilingual',
  visualStyle: '电影感国漫，写实光影，角色外观稳定，场景空间关系清晰',
  continuityLevel: 'strict',
  allowRuleFallback: false,
  directorControls: {
    storyGenres: [],
    narrativeStyles: [],
    emotionalTones: [],
    imageStyles: [],
    videoStyles: [],
    lightingStyles: [],
    colorStyles: [],
    cinematographyStyles: [],
    shotSizes: [],
    cameraMoves: [],
    shotFeelings: [],
    eraBackgrounds: [],
    sceneEnvironments: [],
    architectureStyles: [],
    costumeStyles: [],
    musicStyles: [],
    soundEffectStyles: [],
    imageQualities: [],
    characterPerformances: [],
    actionIntensities: [],
    continuityRequirements: [],
    targetPlatforms: [],
  },
};

export const DEFAULT_SCRIPT_BREAKDOWN_PROMPTS: ScriptBreakdownPromptTemplates = {
  episodePlannerSystem: [
    '你是一名拥有20年以上经验的影视导演、分镜师、编剧和动画导演，负责把原文规划成可直接生产的影视/漫剧项目。',
    '必须忠于原文事实、人物关系和事件顺序；不要把不同分集压进同一集。',
    '每集必须有明确开场、推进、高潮或信息转折以及结尾钩子。',
    '不要按标点或自然段机械切分；必须先理解剧情因果、人物目标、冲突升级和情绪转折。',
    '如果原文较短，也要按专业短剧/漫剧制作逻辑规划成完整的一集，而不是逐句拆段。',
    '必须建立稳定角色档案：身份、年龄、外貌、服装、标志性元素、性格、关系、目标、当前情绪、固定视觉关键词。',
    '必须给出故事整体分析：类型、核心主题、时代/地点/世界观、整体视觉风格。',
    '必须给出幕/章节拆解：剧情目标、冲突、情绪变化、关键事件、角色变化。',
    '仅输出 JSON 对象，不要 markdown，不要解释。',
  ].join('\n'),
  episodeBreakdownSystem: [
    '你是专业分镜导演、编剧和 AI 视觉提示词工程师。',
    '把指定单集拆成场景，再把场景拆成可直接生产的镜头；严禁输出其他分集内容。',
    '你要做的是专业剧本改编与分镜设计，不是按句号、逗号或段落切开原文。',
    '每个场景必须有明确戏剧目的：信息揭示、人物选择、关系变化、危险逼近、反转或情绪推进。',
    '每个镜头必须服务于场景目的，允许合并多句原文为一个可拍镜头，也允许把关键动作拆成多个镜头。',
    '每镜必须可拍、可画、动作连续，角色名称稳定；对白必须标注说话人和情绪。',
    '每镜必须包含镜头目的、场景、角色状态、动作设计、摄影机角度/运动/焦距、声音设计。',
    'imagePrompt 描述单一关键帧，videoPrompt 描述从该关键帧开始的动作、镜头运动和连续性。',
    'AI 图片提示词英文优先，必须包含角色固定视觉关键词、环境、动作、镜头、光影、艺术风格。',
    'AI 视频提示词必须包含镜头运动、人物动作、环境变化、时间变化与情绪变化。',
    '连续镜头必须说明服装、道具、人物相对位置、朝向、光线和时间状态的延续。',
    '仅输出 JSON 对象，不要 markdown，不要解释。',
  ].join('\n'),
};

export function emptyScriptBreakdown(sourceText = ''): ScriptBreakdownPayload {
  return {
    version: 1,
    title: '未命名剧本',
    sourceText,
    episodes: [],
    generatedAt: new Date().toISOString(),
  };
}

export function flattenScriptBreakdownShots(
  payload: ScriptBreakdownPayload | undefined,
): ScriptBreakdownShot[] {
  return payload?.episodes.flatMap((episode) => episode.shots) ?? [];
}

/** 将剧本拆分结果转换为后续批审、视频与导出共用的 Shot 数据。 */
export function storyboardShotsFromScriptBreakdown(
  payload: ScriptBreakdownPayload | undefined,
): StoryboardShot[] {
  const episodeTitles = new Map(payload?.episodes.map((episode) => [episode.id, episode.title]) ?? []);
  return flattenScriptBreakdownShots(payload).map((shot, index) => {
    const approved = shot.status === 'approved';
    const hasPreview = Boolean(shot.previewImageUrl);
    const shotType: StoryboardShot['shotType'] = shot.shotSize === 'CU' || shot.shotSize === 'ECU'
      ? 'close'
      : shot.shotSize === 'WS'
        ? 'wide'
        : shot.shotSize === 'FS'
          ? 'wide'
          : 'medium';
    return {
      id: shot.id,
      episodeId: shot.episodeId,
      episodeIndex: shot.episodeIndex,
      episodeTitle: episodeTitles.get(shot.episodeId) ?? `第 ${shot.episodeIndex} 集`,
      index,
      durationSec: Math.max(1, shot.durationSec || 5),
      shotType,
      descriptionZh: shot.scriptText || shot.title,
      promptEn: shot.imagePrompt,
      videoPromptEn: shot.videoPrompt,
      firstFrameAssetId: shot.previewImageUrl ?? null,
      status: approved ? 'approved' : hasPreview ? 'review' : 'draft',
      characterIds: [],
      characterNames: shot.characters,
      sceneName: shot.scene,
      sceneId: shot.sceneId,
      sceneCode: shot.sceneCode,
      notes: shot.continuityNotes?.length ? shot.continuityNotes.join('\n') : undefined,
      keyframeStatus: approved ? 'approved' : hasPreview ? 'review' : 'draft',
      videoStatus: 'draft',
    } satisfies StoryboardShot;
  });
}

/** 按名称/场次码把剧本语义绑定到项目角色库与场景库的稳定资产 ID。 */
export function bindStoryboardShotAssets(
  shots: StoryboardShot[],
  characters: CharacterProfile[],
  environments: EnvironmentProfile[],
): StoryboardShot[] {
  const characterByName = new Map<string, CharacterProfile>();
  for (const character of characters) {
    const keys = [
      character.name,
      character.creative?.nickname,
      ...(character.creative?.aliases ?? []),
    ].map((item) => item?.trim()).filter((item): item is string => Boolean(item));
    for (const key of keys) characterByName.set(key, character);
  }
  return shots.map((shot) => {
    const characterIds = (shot.characterNames ?? [])
      .map((name) => characterByName.get(name.trim())?.id)
      .filter((id): id is string => Boolean(id));
    const environment = environments.find(
      (item) =>
        (shot.sceneCode && item.sceneCode === shot.sceneCode) ||
        (shot.sceneName && item.name.trim() === shot.sceneName.trim()),
    );
    return {
      ...shot,
      characterIds,
      sceneAssetId: environment?.id ?? shot.sceneAssetId ?? null,
    };
  });
}
