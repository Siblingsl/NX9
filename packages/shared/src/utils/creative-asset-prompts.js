import { defaultCharacterVariants } from '../data/creative-asset-presets';
import { touchStructuredPrompt } from '../types/creative-asset-center';
export const CHARACTER_SHEET_PROMPT_TEMPLATE = `Marvel-style character sheet, white background, clean layout, high resolution.
Full-body front standing pose showing outfit proportions and silhouette.
Turnaround: front view, side profile, back view — identical character design.
Character info panel with name, age, occupation, personality tags.
Body metrics and appearance details as labeled reference.
Expression grid: smile, happy, laugh, calm, sad, angry, surprised, afraid and more.
Action poses: stand, walk, run, sit, combat, wave.
Camera angles: front, 45-degree, side, back, close-up, medium, wide.
Consistent face, hair, outfit, accessories across all panels.
Anime cinematic style, production-ready character bible reference sheet.`;
function lines(...parts) {
    return parts.filter((p) => p && String(p).trim()).join('\n');
}
function section(title, body) {
    const t = body?.trim();
    if (!t)
        return '';
    return `## ${title}\n${t}`;
}
export function getCharacterCreative(c) {
    const ext = c.creative ?? {};
    const variants = defaultCharacterVariants();
    return {
        ...variants,
        ...ext,
        expressions: ext.expressions?.length ? ext.expressions : variants.expressions,
        poses: ext.poses?.length ? ext.poses : variants.poses,
        angles: ext.angles?.length ? ext.angles : variants.angles,
        consistency: { ...ext.consistency },
        prompts: { ...ext.prompts },
    };
}
export function getSceneCreative(item) {
    return item.creative ?? {};
}
export function getShotCreative(item) {
    return item.creative ?? {};
}
export function getEmotionCreative(item) {
    return item.creative ?? {};
}
export function getHookCreative(item) {
    return item.creative ?? {};
}
export function getVoiceCreative(s) {
    return s.creative ?? {};
}
export function buildCharacterBiblePrompt(c) {
    const ext = getCharacterCreative(c);
    const bible = c.bible ?? {};
    return lines(section('角色', c.name), section('昵称', ext.nickname), section('简介', c.descriptionZh), section('基础设定', bible.identity || [ext.age, ext.height, ext.weight, ext.occupation, ext.identityRole].filter(Boolean).join(' · ')), section('性格', ext.personalityText || bible.personality), section('背景', ext.backgroundStory || bible.background), section('外貌', bible.appearance), section('世界观', ext.worldView), section('声音', bible.voice), section('关系', bible.relationships), section('身体数据', formatBodyMetrics(ext)), section('外观细节', formatAppearance(ext)), section('一致性', c.consistencyPrompt || ext.consistency?.consistencyPrompt), section('标签', c.tags?.join(', ')));
}
export function buildCharacterImagePrompt(c) {
    const ext = getCharacterCreative(c);
    const base = buildCharacterBiblePrompt(c);
    const expr = ext.expressions?.slice(0, 4).map((e) => e.prompt).filter(Boolean).join(', ');
    const pose = ext.poses?.[0]?.prompt;
    const angle = ext.angles?.[0]?.prompt;
    return lines(base, expr && `Expression: ${expr}`, pose && `Pose: ${pose}`, angle && `Angle: ${angle}`, 'consistent character design, same outfit and face');
}
export function buildCharacterVideoPrompt(c) {
    const image = buildCharacterImagePrompt(c);
    return lines(image, 'cinematic motion, stable identity, smooth animation, character consistency maintained');
}
export function buildCharacterSheetGenerationPrompt(c) {
    const ext = getCharacterCreative(c);
    const refHint = [ext.fullSheetUrl, c.referenceImageUrl, ext.frontViewUrl].find((u) => u?.trim());
    return lines(CHARACTER_SHEET_PROMPT_TEMPLATE, `Character name: ${c.name}`, buildCharacterBiblePrompt(c), refHint ? `Reference image: match identity and outfit from uploaded reference.` : '', 'Output: single high-resolution character bible sheet on white background.');
}
export function buildCharacterNegativePrompt(c) {
    const ext = getCharacterCreative(c);
    return (ext.consistency?.negativePrompt?.trim() ||
        ext.prompts?.negative?.text?.trim() ||
        'deformed, inconsistent face, wrong outfit, extra limbs, blurry, low quality');
}
export function buildSceneBiblePrompt(item) {
    const ext = getSceneCreative(item);
    return lines(section('场景', item.label), section('描述', ext.description || item.promptZh), section('英文 Prompt', item.promptEn), section('世界观', ext.worldView), section('时间', ext.timeOfDay), section('天气', ext.weather), section('光照', ext.lighting), section('色调', ext.colorTone), section('推荐角色', ext.recommendedCharacters?.join(', ')), section('推荐镜头', ext.recommendedShots?.join(', ')), section('推荐音乐', ext.recommendedMusic?.join(', ')), section('推荐音效', ext.recommendedSfx?.join(', ')), section('推荐动作', ext.recommendedActions?.join(', ')), section('推荐情绪', ext.recommendedEmotions?.join(', ')), section('标签', ext.tags?.join(', ')));
}
export const SCENE_SHEET_PROMPT_TEMPLATE = `Environment concept sheet, white background, clean layout.
Bird-eye overview of the full scene, multiple viewing angles, local detail callouts.
Lighting setup, material textures, color palette, weather and time-of-day notes.
Consistent spatial layout for AI scene generation across shots.`;
export function buildSceneSheetGenerationPrompt(item) {
    return lines(SCENE_SHEET_PROMPT_TEMPLATE, buildSceneBiblePrompt(item));
}
export function buildShotPrompt(item) {
    const ext = getShotCreative(item);
    return lines(section('镜头', item.label), section('用途', ext.purpose), section('运镜', ext.cameraMove || item.promptEn), section('景别', ext.shotSize), section('时长', ext.durationSec ? `${ext.durationSec}s` : undefined), section('推荐剧情', ext.recommendedPlot), section('推荐情绪', ext.recommendedEmotion), section('中文', item.promptZh));
}
export function buildEmotionPrompt(item) {
    const ext = getEmotionCreative(item);
    return lines(section('情绪', item.label), section('人物', ext.characterDescription), section('声音', ext.voiceDescription), section('动作', ext.actionDescription), section('镜头推荐', ext.shotRecommendation), section('Prompt', item.promptEn), section('中文', item.promptZh));
}
export function buildHookPrompt(item) {
    const ext = getHookCreative(item);
    return lines(section('钩子', ext.title || item.label), section('用途', ext.purpose), section('前三秒脚本', ext.firstThreeSecondsScript), section('适用类型', ext.applicableTypes?.join(', ')), section('示例', ext.example), section('Prompt', item.promptEn), section('阶段', item.hookPhase === 'ending' ? '结尾' : '开场'));
}
export function buildVoicePrompt(s) {
    const ext = getVoiceCreative(s);
    return lines(section('声音', s.name), section('描述', s.description), section('音色', ext.voiceTone), section('年龄', ext.age), section('性别', ext.gender), section('语速', ext.speed), section('情绪', ext.emotion), section('语言', ext.language));
}
export function regenerateCharacterPrompts(c) {
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
export function regenerateScenePrompts(item) {
    const ext = getSceneCreative(item);
    const sceneText = buildSceneBiblePrompt(item);
    return {
        ...ext,
        prompts: {
            scene: touchStructuredPrompt(sceneText),
            negative: touchStructuredPrompt(ext.prompts?.negative?.text || 'low quality, inconsistent lighting, wrong scale'),
        },
    };
}
export function regenerateWorkspacePrompts(item) {
    switch (item.kind) {
        case 'scene':
            return regenerateScenePrompts(item);
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
export function regenerateVoicePrompts(s) {
    const ext = getVoiceCreative(s);
    return {
        ...ext,
        prompts: { voice: touchStructuredPrompt(buildVoicePrompt(s)) },
    };
}
export function resolveAssetPromptText(kind, entity) {
    if (kind === 'character') {
        const c = entity;
        const ext = getCharacterCreative(c);
        return (ext.prompts?.bible?.text?.trim() ||
            c.consistencyPrompt?.trim() ||
            buildCharacterBiblePrompt(c));
    }
    if (kind === 'sound') {
        const s = entity;
        return getVoiceCreative(s).prompts?.voice?.text?.trim() || buildVoicePrompt(s);
    }
    const item = entity;
    if (item.kind === 'scene') {
        const text = getSceneCreative(item).prompts?.scene?.text?.trim();
        return text || buildSceneBiblePrompt(item);
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
function formatBodyMetrics(ext) {
    const m = ext.bodyMetrics;
    if (!m)
        return '';
    return [
        m.bust && `胸围 ${m.bust}`,
        m.waist && `腰围 ${m.waist}`,
        m.hip && `臀围 ${m.hip}`,
        m.shoulderWidth && `肩宽 ${m.shoulderWidth}`,
        m.legLength && `腿长 ${m.legLength}`,
        m.handLength && `手长 ${m.handLength}`,
        m.footLength && `脚长 ${m.footLength}`,
    ]
        .filter(Boolean)
        .join(' · ');
}
function formatAppearance(ext) {
    const a = ext.appearanceDetails;
    if (!a)
        return '';
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
