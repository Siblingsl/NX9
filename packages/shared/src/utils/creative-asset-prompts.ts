import {
  buildCharacterMasterSheetPrompt,
  buildCharacterSheetCategoryPrompt,
  CHARACTER_SHEET_MASTER_PROMPT_TEMPLATE,
} from './character-sheet-master';
import type { CharacterSheetCategoryId } from './character-sheet-master';
import type { GenPromptPack } from './gen-skill-pack';
import type { BacklotWorkspaceItem } from '../data/backlot-templates';
import type { CharacterProfile } from '../types/character';
import type {
  CharacterCreativeExtension,
  EmotionCreativeExtension,
  HookCreativeExtension,
  SceneCreativeExtension,
  ShotCreativeExtension,
  StructuredPrompt,
  VoiceCreativeExtension,
} from '../types/creative-asset-center';
import type { SoundAssetProfile } from '../types/sound-library';
import {
  FACE_RIG_FACE_GROUPS,
  buildFaceRigPrompt,
  faceRigSkipBodyIds,
  getFaceRig,
} from './character-face-rig';
import { defaultCharacterVariants, mergeVariantSlots, CAC_COSTUME_VARIANT_PRESETS } from '../data/creative-asset-presets';
import { DEFAULT_PROP_VARIANTS, DEFAULT_SCENE_VARIANTS, touchStructuredPrompt } from '../types/creative-asset-center';

/** @deprecated 使用 buildCharacterMasterSheetPrompt；保留兼容导出名 */
export const CHARACTER_SHEET_PROMPT_TEMPLATE = CHARACTER_SHEET_MASTER_PROMPT_TEMPLATE;

function lines(...parts: Array<string | undefined | null | false>): string {
  return parts.filter((p) => p && String(p).trim()).join('\n');
}

function section(title: string, body?: string): string {
  const t = body?.trim();
  if (!t) return '';
  return `## ${title}\n${t}`;
}

export function getCharacterCreative(c: CharacterProfile): CharacterCreativeExtension {
  const ext = c.creative ?? {};
  const variants = defaultCharacterVariants();
  return {
    ...variants,
    ...ext,
    // 固定 8 表情槽：对齐设定板，并丢掉旧预设残留（好奇/放松）
    expressions: mergeVariantSlots(ext.expressions, variants.expressions, { keepUnknown: false }),
    poses: ext.poses?.length ? ext.poses : variants.poses,
    angles: ext.angles?.length ? ext.angles : variants.angles,
    // 已有旧数据时也要按预设补齐新槽（如咬唇），不能因 length>0 直接跳过
    microExpressions: mergeVariantSlots(ext.microExpressions, variants.microExpressions),
    costumeDetails: ext.costumeDetails?.length ? ext.costumeDetails : variants.costumeDetails,
    handRefs: ext.handRefs?.length ? ext.handRefs : variants.handRefs,
    consistency: { ...ext.consistency },
    prompts: { ...ext.prompts },
  };
}

export function getSceneCreative(item: BacklotWorkspaceItem): SceneCreativeExtension {
  const raw = (item.creative as SceneCreativeExtension) ?? {};
  return {
    ...raw,
    variants: mergeVariantSlots(raw.variants, DEFAULT_SCENE_VARIANTS),
  };
}

export function getShotCreative(item: BacklotWorkspaceItem): ShotCreativeExtension {
  return (item.creative as ShotCreativeExtension) ?? {};
}

export function getEmotionCreative(item: BacklotWorkspaceItem): EmotionCreativeExtension {
  return (item.creative as EmotionCreativeExtension) ?? {};
}

export function getHookCreative(item: BacklotWorkspaceItem): HookCreativeExtension {
  return (item.creative as HookCreativeExtension) ?? {};
}

export function getCostumeCreative(item: BacklotWorkspaceItem): import('../types/creative-asset-center').CostumeCreativeExtension {
  const raw = (item.creative as import('../types/creative-asset-center').CostumeCreativeExtension) ?? {};
  return {
    ...raw,
    variants: mergeVariantSlots(raw.variants, CAC_COSTUME_VARIANT_PRESETS),
  };
}

export function getPropCreative(item: BacklotWorkspaceItem): import('../types/creative-asset-center').PropCreativeExtension {
  const raw = (item.creative as import('../types/creative-asset-center').PropCreativeExtension) ?? {};
  return {
    ...raw,
    variants: mergeVariantSlots(raw.variants, DEFAULT_PROP_VARIANTS),
  };
}

export function getVoiceCreative(s: SoundAssetProfile): VoiceCreativeExtension {
  return s.creative ?? {};
}

export function buildCharacterBiblePrompt(c: CharacterProfile): string {
  const ext = getCharacterCreative(c);
  const bible = c.bible ?? {};
  return lines(
    section('角色', c.name),
    section('昵称', ext.nickname),
    section('简介', c.descriptionZh),
    section('基础设定', bible.identity || [ext.age, ext.height, ext.weight, ext.occupation, ext.identityRole].filter(Boolean).join(' · ')),
    section('性格', ext.personalityText || bible.personality),
    section('背景', ext.backgroundStory || bible.background),
    section('外貌', bible.appearance),
    section('面部结构（参数锁）', buildCharacterFaceRigPrompt(c)),
    section('世界观', ext.worldView),
    section('声音', bible.voice),
    section('关系', bible.relationships),
    section('身体数据', formatBodyMetrics(ext)),
    section('外观细节', formatAppearance(ext)),
    section('一致性', c.consistencyPrompt || ext.consistency?.consistencyPrompt),
    section('标签', c.tags?.join(', ')),
  );
}

export function buildCharacterImagePrompt(c: CharacterProfile): string {
  const ext = getCharacterCreative(c);
  const base = buildCharacterBiblePrompt(c);
  const expr = ext.expressions?.slice(0, 4).map((e) => e.prompt).filter(Boolean).join(', ');
  const pose = ext.poses?.[0]?.prompt;
  const angle = ext.angles?.[0]?.prompt;
  const fixed = c.consistencyPrompt?.trim() || ext.consistency?.consistencyPrompt?.trim();
  return lines(
    'Single character key visual, production still, locked identity.',
    base,
    fixed && `Identity lock: ${fixed}`,
    expr && `Expression: ${expr}`,
    pose && `Pose: ${pose}`,
    angle && `Camera: ${angle}`,
    'Composition: clear subject separation, readable silhouette, costume landmarks visible.',
    'Quality: high detail face and fabric, coherent lighting, no text, no watermark, no multi-character crowd.',
    'Consistency: same face, hairline, body proportion, outfit, accessories across any reference match.',
  );
}

export function buildCharacterVideoPrompt(c: CharacterProfile): string {
  const image = buildCharacterImagePrompt(c);
  return lines(
    image,
    'Motion brief: natural continuous performance, subtle body mechanics, stable head volume.',
    'Camera: motivated gentle move (push/orbit/hold), no jump cuts, keep face readable.',
    'Continuity: identity and costume locked from first frame to last frame.',
    'Constraints: no morphing face, no outfit change, no text overlay, filmic motion blur only when motivated.',
  );
}

export function buildCharacterSheetGenerationPrompt(
  c: CharacterProfile,
  pack?: GenPromptPack | null,
  categoryId?: CharacterSheetCategoryId,
): string {
  const ext = getCharacterCreative(c);
  const refHint = [ext.fullSheetUrl, c.referenceImageUrl, ext.frontViewUrl].find((u) => u?.trim());
  const personality = ext.personalityText || c.bible?.personality || '';
  const role = ext.identityRole || ext.occupation || c.bible?.identity || '';
  const appearanceText = c.bible?.appearance || ext.appearanceDetails?.specialMarks || c.consistencyPrompt || '';
  // 捏脸参数是结构层，排在自由描述之前；两者冲突时以参数为准
  const appearance = lines(buildCharacterFaceRigPrompt(c), appearanceText);
  const input = {
    characterName: c.name,
    characterDescription: c.descriptionZh || c.consistencyPrompt || appearance,
    styleMode: (ext.sheetStyleMode as any) || 'semi-realistic',
    gender: ext.gender || undefined,
    age: ext.age || undefined,
    bodyType: ext.bodyType || undefined,
    styleKeywords: ext.styleKeywords || undefined,
    role,
    personality,
    coreTheme: ext.coreTheme || undefined,
    costumeLock: ext.costumePrompt || ext.costumeLabel || undefined,
    appearanceLock: appearance,
    forbidden: ext.consistency?.negativePrompt || undefined,
    hasReferenceImage: Boolean(refHint),
  };
  return categoryId
    ? buildCharacterSheetCategoryPrompt(input, categoryId, pack)
    : buildCharacterMasterSheetPrompt(input, pack);
}

export function buildCharacterNegativePrompt(c: CharacterProfile): string {
  const ext = getCharacterCreative(c);
  return (
    ext.consistency?.negativePrompt?.trim() ||
    ext.prompts?.negative?.text?.trim() ||
    'deformed, inconsistent face, wrong outfit, extra limbs, blurry, low quality'
  );
}

export function buildSceneBiblePrompt(item: BacklotWorkspaceItem): string {
  const ext = getSceneCreative(item);
  return lines(
    section('场景', item.label),
    section('描述', ext.description || item.promptZh),
    section('英文 Prompt', item.promptEn),
    section('世界观', ext.worldView),
    section('时间', ext.timeOfDay),
    section('天气', ext.weather),
    section('光照', ext.lighting),
    section('色调', ext.colorTone),
    section('固定道具文本', ext.props?.join(', ')),
    section('道具库引用', ext.propIds?.join(', ')),
    section('推荐角色', ext.recommendedCharacters?.join(', ')),
    section('推荐镜头', ext.recommendedShots?.join(', ')),
    section('推荐音乐', ext.recommendedMusic?.join(', ')),
    section('推荐音效', ext.recommendedSfx?.join(', ')),
    section('推荐动作', ext.recommendedActions?.join(', ')),
    section('推荐情绪', ext.recommendedEmotions?.join(', ')),
    section('标签', ext.tags?.join(', ')),
    section(
      'Generation anchors',
      lines(
        ext.timeOfDay && `time of day: ${ext.timeOfDay}`,
        ext.weather && `weather: ${ext.weather}`,
        ext.lighting && `lighting: ${ext.lighting}`,
        ext.colorTone && `color grade: ${ext.colorTone}`,
        ext.props && ext.props.length > 0 && `prop anchors: ${ext.props.join(', ')}`,
        'keep spatial continuity and material language across shots',
      ) || undefined,
    ),
  );
}

export const SCENE_SHEET_PROMPT_TEMPLATE = `【场景空间设定板 · 固定版式 · 全角色/全场景布局必须相同】
画一张可复用的环境圣经板。只用简体中文短标签，禁止乱码、禁止英文乱拼、禁止 UI 框线水印。
严格布局（不可改格子）：
┌ 顶栏：场景空间设定板 · 场景名 · 场景码 · 时段/天气
├ 左大区：主确立宽景（英雄图，占主要面积）
├ 右上：色彩/光照注释（简体短句 + 色块）
├ 中下左：另一机位/纵深
├ 中下中：关键结构（门窗/立柱/地面材质）
├ 中下右：固定道具位示意（与档案道具一致，勿瞬移）
└ 底栏锚点条：门 · 窗 · 招牌 · 地面 · 天光方向（简体）
硬约束：同一空间不改装修；透视与尺度稳定；人物仅可作比例小人；禁漂移、禁乱码。`;

export function buildSceneSheetGenerationPrompt(item: BacklotWorkspaceItem): string {
  return lines(
    SCENE_SHEET_PROMPT_TEMPLATE,
    buildSceneBiblePrompt(item),
    'OUTPUT LANGUAGE: Simplified Chinese labels only. Same locked grid for every scene sheet.',
    'Use as reusable location bible for multi-shot continuity; keep architecture, light logic and prop anchors fixed.',
  );
}

export function buildShotPrompt(item: BacklotWorkspaceItem): string {
  const ext = getShotCreative(item);
  return lines(
    section('镜头', item.label),
    section('用途', ext.purpose),
    section('运镜', ext.cameraMove || item.promptEn),
    section('景别', ext.shotSize),
    section('时长', ext.durationSec ? `${ext.durationSec}s` : undefined),
    section('推荐剧情', ext.recommendedPlot),
    section('推荐情绪', ext.recommendedEmotion),
    section('中文', item.promptZh),
  );
}

export function buildEmotionPrompt(item: BacklotWorkspaceItem): string {
  const ext = getEmotionCreative(item);
  return lines(
    section('情绪', item.label),
    section('人物', ext.characterDescription),
    section('声音', ext.voiceDescription),
    section('动作', ext.actionDescription),
    section('镜头推荐', ext.shotRecommendation),
    section('Prompt', item.promptEn),
    section('中文', item.promptZh),
  );
}

export function buildHookPrompt(item: BacklotWorkspaceItem): string {
  const ext = getHookCreative(item);
  return lines(
    section('钩子', ext.title || item.label),
    section('用途', ext.purpose),
    section('前三秒脚本', ext.firstThreeSecondsScript),
    section('适用类型', ext.applicableTypes?.join(', ')),
    section('示例', ext.example),
    section('Prompt', item.promptEn),
    section('阶段', item.hookPhase === 'ending' ? '结尾' : '开场'),
  );
}

export function buildVoicePrompt(s: SoundAssetProfile): string {
  const ext = getVoiceCreative(s);
  return lines(
    section('声音', s.name),
    section('描述', s.description),
    section('音色', ext.voiceTone),
    section('年龄', ext.age),
    section('性别', ext.gender),
    section('语速', ext.speed),
    section('情绪', ext.emotion),
    section('语言', ext.language),
  );
}


export function buildCostumeBiblePrompt(item: BacklotWorkspaceItem): string {
  const ext = getCostumeCreative(item);
  return lines(
    section('服装', item.label),
    section('描述', ext.description || item.promptZh),
    section('类别', ext.category),
    section('时代风格', ext.eraStyle),
    section('配色', ext.colorPalette),
    section('面料质感', ext.materials),
    section('廓形剪裁', ext.silhouette),
    section('上衣', ext.top),
    section('下装', ext.bottom),
    section('外套', ext.outerwear),
    section('鞋履', ext.footwear),
    section('配饰标志', ext.accessories),
    section('适用角色', ext.recommendedCharacters?.join(', ')),
    section('适用场景', ext.recommendedScenes?.join(', ')),
    section('标签', ext.tags?.join(', ')),
    section('英文 Prompt', item.promptEn),
  );
}

export function buildCostumeImagePrompt(item: BacklotWorkspaceItem): string {
  const ext = getCostumeCreative(item);
  const base = item.promptEn?.trim() || buildCostumeBiblePrompt(item);
  return lines(
    'Production costume design plate, clean presentation, wardrobe continuity reference.',
    base,
    ext.silhouette && `Silhouette: ${ext.silhouette}`,
    ext.colorPalette && `Palette: ${ext.colorPalette}`,
    ext.materials && `Materials: ${ext.materials}`,
    ext.accessories && `Signature accessories: ${ext.accessories}`,
    'Show full outfit clearly; preserve fabric, cut and landmark accessories; no random wardrobe drift; no watermark.',
  );
}

export function buildCostumeNegativePrompt(item: BacklotWorkspaceItem): string {
  const ext = getCostumeCreative(item);
  return (
    ext.prompts?.negative?.text?.trim()
    || 'wrong outfit, inconsistent wardrobe, extra accessories, modern clothes when period costume, low quality fabric, deformed clothing, watermark, UI chrome'
  );
}

export const COSTUME_SHEET_PROMPT_TEMPLATE = `【服装完整设定板 · 固定版式 · 每套服装布局必须相同】
画一张服装生产设定板。焦点在衣不在脸。只用简体中文短标签，禁止乱码、禁止水印、禁止 UI 框。
严格布局（不可改格子）：
┌ 顶栏：服装完整设定板 · 服装名 · 类别 · 时代/风格
├ 左上：色彩/面料色块 + 简体材质注
├ 中上：正面全身造型（主视觉，廓形清晰）
├ 右上：标志配饰特写 1～2
├ 中排：3/4 全身 · 侧面全身 · 背面全身（同一套服装、接缝与配饰一致）
└ 底栏细节：领 · 袖口 · 开合 · 纹样 · 鞋履（4～6 小格）
硬约束：全图同一套装，禁换装漂移；人体可作衣架/弱化五官；简体中文；布局不可自由发挥。`;

export function buildCostumeSheetGenerationPrompt(item: BacklotWorkspaceItem): string {
  return lines(
    COSTUME_SHEET_PROMPT_TEMPLATE,
    buildCostumeBiblePrompt(item),
    buildCostumeImagePrompt(item),
    'OUTPUT LANGUAGE: Simplified Chinese labels only. Same locked grid for every costume sheet.',
    'Use as reusable wardrobe continuity plate across multi-shot production.',
  );
}

export const PROP_SHEET_PROMPT_TEMPLATE = `【道具设定板 · 固定三视图 · 轻量】
画一张物件连续性设定板。只用简体中文短标签，禁止乱码、禁止水印。
严格布局（不可改格子）：
┌ 顶栏：道具设定板 · 道具名 · 类别
├ 左：正面英雄图
├ 中：侧面或背面
└ 右：标志细节特写（刮痕/铭文/机关必须画进此格）
硬约束：全图同一物件；材质与 landmarks 锁定；禁止变成别的道具。`;

export function buildPropSheetGenerationPrompt(item: BacklotWorkspaceItem): string {
  return lines(
    PROP_SHEET_PROMPT_TEMPLATE,
    buildPropBiblePrompt(item),
    buildPropImagePrompt(item),
    'OUTPUT LANGUAGE: Simplified Chinese labels only. Same locked three-panel grid for every prop sheet.',
  );
}

export function buildPropBiblePrompt(item: BacklotWorkspaceItem): string {
  const ext = getPropCreative(item);
  return lines(
    section('道具', item.label),
    section('描述', ext.description || item.promptZh),
    section('类别', ext.category),
    section('材质', ext.materials),
    section('标志细节', ext.landmarks),
    section('关联场景', ext.linkedScenes?.join(', ')),
    section('关联场景ID', ext.linkedSceneIds?.join(', ')),
    section('标签', ext.tags?.join(', ')),
    section('英文 Prompt', item.promptEn),
  );
}

export function buildPropImagePrompt(item: BacklotWorkspaceItem): string {
  const ext = getPropCreative(item);
  const base = item.promptEn?.trim() || buildPropBiblePrompt(item);
  return lines(
    'Production prop continuity reference, clean presentation, product-hero lighting.',
    base,
    ext.materials && `Materials: ${ext.materials}`,
    ext.landmarks && `Landmark details: ${ext.landmarks}`,
    'Keep silhouette, materials and signature details locked; no random prop teleport; no watermark.',
  );
}

export function buildPropNegativePrompt(item: BacklotWorkspaceItem): string {
  const ext = getPropCreative(item);
  return (
    ext.prompts?.negative?.text?.trim()
    || 'wrong prop, inconsistent materials, missing landmark details, extra objects, low quality, watermark, UI chrome'
  );
}

export function regeneratePropPrompts(item: BacklotWorkspaceItem): import('../types/creative-asset-center').PropCreativeExtension {
  const ext = getPropCreative(item);
  const bible = buildPropBiblePrompt(item);
  const image = buildPropImagePrompt(item);
  const negative = buildPropNegativePrompt(item);
  return {
    ...ext,
    prompts: {
      prop: touchStructuredPrompt(bible),
      image: touchStructuredPrompt(image),
      negative: touchStructuredPrompt(negative, negative),
    },
  };
}

export function regenerateCharacterPrompts(c: CharacterProfile): CharacterCreativeExtension {
  const ext = getCharacterCreative(c);
  const bibleText = buildCharacterBiblePrompt(c);
  const imageText = buildCharacterImagePrompt(c);
  const videoText = buildCharacterVideoPrompt(c);
  const negativeText = buildCharacterNegativePrompt(c);
  return {
    ...ext,
    consistency: {
      ...ext.consistency,
      consistencyPrompt: bibleText,
    },
    prompts: {
      bible: touchStructuredPrompt(bibleText),
      image: touchStructuredPrompt(imageText),
      video: touchStructuredPrompt(videoText),
      negative: touchStructuredPrompt(negativeText, negativeText),
    },
  };
}

export function regenerateScenePrompts(item: BacklotWorkspaceItem): SceneCreativeExtension {
  const ext = getSceneCreative(item);
  const sceneText = buildSceneBiblePrompt(item);
  return {
    ...ext,
    prompts: {
      scene: touchStructuredPrompt(sceneText),
      negative: touchStructuredPrompt(
        ext.prompts?.negative?.text
          || 'low quality, inconsistent lighting, warped architecture, wrong scale, cluttered composition, random extra props, text watermark, UI chrome, people crowd unless specified',
      ),
    },
  };
}

export function regenerateCostumePrompts(item: BacklotWorkspaceItem): import('../types/creative-asset-center').CostumeCreativeExtension {
  const ext = getCostumeCreative(item);
  const bible = buildCostumeBiblePrompt(item);
  const image = buildCostumeImagePrompt(item);
  const negative = buildCostumeNegativePrompt(item);
  return {
    ...ext,
    description: ext.description || item.promptZh || item.label,
    prompts: {
      costume: touchStructuredPrompt(bible),
      image: touchStructuredPrompt(image),
      negative: touchStructuredPrompt(negative, negative),
    },
  };
}

export function regenerateWorkspacePrompts(item: BacklotWorkspaceItem): BacklotWorkspaceItem['creative'] {
  switch (item.kind) {
    case 'scene':
      return regenerateScenePrompts(item);
    case 'costume':
      return regenerateCostumePrompts(item);
    case 'prop':
      return regeneratePropPrompts(item);
    case 'shot':
      return { ...getShotCreative(item), prompts: { shot: touchStructuredPrompt(buildShotPrompt(item)) } };
    case 'emotion':
      return { ...getEmotionCreative(item), prompts: { emotion: touchStructuredPrompt(buildEmotionPrompt(item)) } };
    case 'hook':
      return { ...getHookCreative(item), prompts: { hook: touchStructuredPrompt(buildHookPrompt(item)) } };
    default:
      return item.creative;
  }
}

export function regenerateVoicePrompts(s: SoundAssetProfile): VoiceCreativeExtension {
  const ext = getVoiceCreative(s);
  return {
    ...ext,
    prompts: { voice: touchStructuredPrompt(buildVoicePrompt(s)) },
  };
}

export function resolveAssetPromptText(
  kind: 'character' | 'scene' | 'shot' | 'emotion' | 'hook' | 'costume' | 'prop' | 'sound',
  entity: CharacterProfile | BacklotWorkspaceItem | SoundAssetProfile,
): string {
  if (kind === 'character') {
    const c = entity as CharacterProfile;
    const ext = getCharacterCreative(c);
    return (
      ext.prompts?.bible?.text?.trim() ||
      c.consistencyPrompt?.trim() ||
      buildCharacterBiblePrompt(c)
    );
  }
  if (kind === 'sound') {
    const s = entity as SoundAssetProfile;
    return getVoiceCreative(s).prompts?.voice?.text?.trim() || buildVoicePrompt(s);
  }
  const item = entity as BacklotWorkspaceItem;
  if (item.kind === 'scene') {
    const text = getSceneCreative(item).prompts?.scene?.text?.trim();
    return text || buildSceneBiblePrompt(item);
  }
  if (item.kind === 'costume') {
    const text = getCostumeCreative(item).prompts?.costume?.text?.trim()
      || getCostumeCreative(item).prompts?.image?.text?.trim();
    return text || buildCostumeBiblePrompt(item);
  }
  if (item.kind === 'prop') {
    const text = getPropCreative(item).prompts?.prop?.text?.trim()
      || getPropCreative(item).prompts?.image?.text?.trim();
    return text || buildPropBiblePrompt(item);
  }
  if (item.kind === 'shot') {
    const text = getShotCreative(item).prompts?.shot?.text?.trim();
    return text || buildShotPrompt(item);
  }
  if (item.kind === 'emotion') {
    const text = getEmotionCreative(item).prompts?.emotion?.text?.trim();
    return text || buildEmotionPrompt(item);
  }
  const text = getHookCreative(item).prompts?.hook?.text?.trim();
  return text || buildHookPrompt(item);
}

/** 捏脸参数 → 面部结构段（不含体型；体型并入「身体数据」） */
export function buildCharacterFaceRigPrompt(c: CharacterProfile): string {
  return buildFaceRigPrompt(getFaceRig(c), { groups: FACE_RIG_FACE_GROUPS });
}

function formatBodyMetrics(ext: CharacterCreativeExtension): string {
  const m = ext.bodyMetrics;
  const measured = [
    m?.bust && `胸围 ${m.bust}`,
    m?.waist && `腰围 ${m.waist}`,
    m?.hip && `臀围 ${m.hip}`,
    m?.shoulderWidth && `肩宽 ${m.shoulderWidth}`,
    m?.legLength && `腿长 ${m.legLength}`,
    m?.handLength && `手长 ${m.handLength}`,
    m?.footLength && `脚长 ${m.footLength}`,
  ]
    .filter(Boolean)
    .join(' · ');

  // 实测值优先：同维度有数值时该捏人参数降级不写，避免数值与形容互相矛盾
  const rigBody = buildFaceRigPrompt(getFaceRig(ext.faceRig), {
    groups: ['body'],
    skipIds: faceRigSkipBodyIds(m),
    omitPriorityNote: true,
    omitConsistencyNote: true,
  });

  return lines(measured, rigBody);
}

function formatAppearance(ext: CharacterCreativeExtension): string {
  const a = ext.appearanceDetails;
  if (!a) return '';
  return [
    a.skinTone && `肤色 ${a.skinTone}`,
    a.hairColor && `发色 ${a.hairColor}`,
    a.eyeColor && `瞳色 ${a.eyeColor}`,
    a.specialMarks && `标志 ${a.specialMarks}`,
    a.tattoos && `纹身 ${a.tattoos}`,
    a.scars && `伤疤 ${a.scars}`,
    a.accessories && `饰品 ${a.accessories}`,
  ]
    .filter(Boolean)
    .join(' · ');
}
