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
  /**
   * 视听语言：成段中文镜头叙事（运镜如何服务情绪、景别功能、光色/材质对比、声画关系）。
   * 不是「特写/推/平视」等标签罗列。
   */
  audiovisualLanguage?: string;
  imagePrompt: string;
  videoPrompt: string;
  /** 线稿 / 草图构图提示词：用于分镜预览草稿、AI 线稿或手绘画板参考，不直接替代正式出图 Prompt。 */
  sketchPrompt?: string;
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
  minShotDurationSec: 2,
  maxShotDurationSec: 4,
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
    '你是一名拥有20年以上经验的影视导演、分镜师、编剧和动画导演，同时熟悉短剧、漫剧、动漫与真人短片工业化生产流程。',
    '任务：把原文规划成可直接进入分镜生产的多集项目蓝图；你是项目架构师，不是摘要机器。',
    '必须忠于原文事实、人物关系、因果链与事件顺序；禁止把不同分集剧情压进同一集，禁止无依据新增主线事件。',
    '每集必须具备可拍的戏剧弧：开场钩子 → 目标推进 → 冲突升级/信息转折 → 集末钩子；明确本集观众获得的情绪与信息。',
    '禁止按标点、自然段或字数机械切分；先识别人物目标、障碍、反转与情绪拐点，再决定集边界。',
    '若原文较短，仍需按专业短剧/漫剧制作逻辑补齐可拍结构（不编造与原文冲突的主线），避免逐句拆段。',
    '角色档案必须稳定可复用：身份、年龄感、外貌、发型、体型、服装、标志性元素、性格、关系、目标、当前情绪、fixedVisualKeywords（英文关键词串）。',
    '故事整体分析必须包含：类型、核心主题、时代/地点/世界观、整体视觉风格、叙事节奏建议。',
    '幕/章节拆解必须写清：剧情目标、冲突、情绪变化、关键事件、角色变化；用于后续分镜的戏剧骨架。',
    '角色与场景只输出候选设定，不假定已入库；同名角色必须唯一稳定；新增角色要能被设定检查节点识别。',
    '场景输出可复用环境概念（地点+时间+光色规则）；禁止一句话一个新场景，仅当地点/时间/视觉规则明显不同才新建。',
    '输出必须可被下游分镜拆解直接消费：名称稳定、字段完整、无互相矛盾的设定。',
    '仅输出 JSON 对象，不要 markdown，不要解释。',
  ].join('\n'),
  episodeBreakdownSystem: [
    '你是专业分镜导演、编剧和 AI 视觉提示词工程师，同时具备真人影视、动漫、国漫、3D 动画的镜头语言素养。',
    '把指定单集拆成场景，再把场景拆成可直接生产的镜头；严禁输出其他分集内容。',
    '你要做的是专业剧本改编与分镜设计，不是按句号、逗号或段落切开原文。',
    '每个场景必须有明确戏剧目的：信息揭示、人物选择、关系变化、危险逼近、反转或情绪推进。',
    '每个镜头必须服务于场景目的，允许合并多句原文为一个可拍镜头，也允许把关键动作拆成多个镜头。',
    '每镜必须可拍、可画、动作连续，角色名称稳定；对白必须标注说话人和情绪。',
    '每镜必须包含：purpose、visual、action、sound、audiovisualLanguage、imagePrompt、videoPrompt、sketchPrompt。',
    '必须保持资产一致性：同一角色的 fixedVisualKeywords、服装标志、发型、年龄感不得在镜头之间漂移；场景的时代、建筑、光线和空间关系不得随意改变。',
    '镜头里的 characters 必须使用 characters 档案中的稳定名称；如果出现新角色，必须在 characters 中补充候选档案。',
    '镜头里的 scene 必须使用清晰可复用的场景名称，并与 scenes/location 对应，避免“一句话一个新场景”。',
    '',
    '【视听语言 audiovisualLanguage — 最高优先级字段之一】',
    'audiovisualLanguage 必须是 1～3 句完整的中文镜头叙事描写，写「镜头如何讲故事」，而不是标签清单。',
    '禁止输出：仅「特写 / 推镜头 / 平视 / 长焦」等词条罗列；禁止空泛的「画面好看」「电影感」。',
    '必须把运镜、景别、光色、材质、声画、角色状态编织成连贯句子，说明它们如何服务情绪与戏剧信息。',
    '',
    '写作结构建议（可自然融合，不必分条）：',
    '1) 运镜与景别如何跟随/压迫/疏离角色；',
    '2) 关键帧信息（表情、肢体、道具、受制或主动）；',
    '3) 光色、材质、对比如何强化冲击或情绪；',
    '4) 可选：环境声、呼吸、音乐与画面同步的感觉。',
    '',
    '真人/写实影视范例：',
    '「微摇的镜头跟随角色的挣扎，特写交代了男子受制、无法反抗的生理困境。金属的冷色与鲜红的血液形成强烈对比，增强了视觉冲击力。」',
    '',
    '动漫/赛璐璐范例：',
    '「手持感的跟镜压近角色侧脸，速度线在背景炸开，特写咬紧的牙关与泛红眼角把崩溃情绪钉死。平涂阴影切成硬边，高饱和对比色把怒意推到前景。」',
    '',
    '国漫/3D 仙侠范例：',
    '「缓推镜头穿过灵雾，中景落在袍角翻飞与剑光交击；随后切近眼部高光，刀光反射在虹膜上。冷青的体积光与暖金法阵形成层次，烟尘粒子拖出一丝余韵。」',
    '',
    '暗黑写实/惊悚范例：',
    '「低机位微仰缓推，让走廊尽头的身影显得压迫；景深虚化前景铁栏，把视线钉在颤抖的指节。青灰雾气吞没高光，只有一点腥红提示危险逼近。」',
    '',
    '请根据导演控制中的图片风格/视频风格/目标形态自动选择语感：真人写实偏摄影与材质，动漫偏线、影、速度线与夸张表情，古风/国漫偏烟尘、光雾与器物质感。',
    '',
    'sketchPrompt 描述黑白线稿分镜构图：人物站位、前中后景、镜头角度、轮廓关系、画面重心；只用于草图/线稿，不写颜色和最终质感。',
    'imagePrompt 描述单一关键帧（英文优先），videoPrompt 描述从该关键帧开始的动作、镜头运动和连续性。',
    '【imagePrompt 专业标准】英文优先，单帧可执行；必须包含：角色 fixedVisualKeywords、服装标志、环境锚点、动作定格、景别/机位、光线、材质、艺术风格；建议结构 Subject + Action + Environment + Camera + Lighting + Style + Quality。',
    '【videoPrompt 专业标准】必须可直接驱动图生视频/文生视频：起幅状态、动作过程、镜头运动动机、环境/时间变化、情绪曲线、时长感；保持与 imagePrompt 角色与场景一致。',
    '【sketchPrompt 专业标准】英文优先；必须包含 black and white storyboard sketch、clean pencil line art、clear silhouettes、readable pose/eyeline、foreground/midground/background、composition guide、no color、no shading、white background；禁止写最终渲染、材质、色彩分级。',
    'Prompt 必须可直接给图像生成/视频生成/线稿节点使用；禁止“同上”“参考前文”“保持刚才风格”等依赖上下文短语；每条独立可执行。',
    '连续镜头必须说明服装、道具、人物相对位置、朝向、光线和时间状态的延续；跨镜角色与场景资产名称保持稳定。',
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
      durationSec: Math.max(1, shot.durationSec || 3),
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
      sketchPrompt: shot.sketchPrompt ?? null,
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
