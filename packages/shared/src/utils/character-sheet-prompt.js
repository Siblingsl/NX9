import { ANGLE_PRESETS } from '../data/anime-tag-presets';
import { CHARACTER_EXPRESSION_PRESETS, CHARACTER_SHEET_POSE_PRESETS, } from '../data/character-sheet-presets';
/** Character Bible 六层锚点（NX9 角色设定结构） */
export const CHARACTER_BIBLE_LAYERS = [
    { key: 'identity', label: '基础设定', placeholder: '姓名 / 年龄 / 职业 / 身份…' },
    { key: 'appearance', label: '外貌', placeholder: '识别特征、发色、瞳色、身材、色板…' },
    { key: 'personality', label: '性格动机', placeholder: '性格关键词与核心动机…' },
    { key: 'background', label: '背景故事', placeholder: '出身、关键经历…' },
    { key: 'voice', label: '声音语言', placeholder: '声线、口癖、语言风格…' },
    { key: 'relationships', label: '关系网络', placeholder: '与其他角色的关系…' },
];
function lookupExpression(id) {
    return CHARACTER_EXPRESSION_PRESETS.find((p) => p.id === id);
}
function lookupPose(id) {
    return CHARACTER_SHEET_POSE_PRESETS.find((p) => p.id === id);
}
function lookupAngle(id) {
    return ANGLE_PRESETS.find((p) => p.id === id);
}
/** 拼一致性 prompt：恒定层 + 当前镜头变体 */
export function buildCharacterSheetPrompt(input) {
    const name = input.characterName?.trim() || '角色';
    const p = input.profile ?? {};
    const parts = [`@${name}`];
    if (p.distinctiveFeatures?.trim()) {
        parts.push(p.distinctiveFeatures.trim());
    }
    if (p.occupation?.trim())
        parts.push(p.occupation.trim());
    if (p.personality?.trim())
        parts.push(p.personality.trim());
    const expr = lookupExpression(input.activeVariant?.expressionId);
    const pose = lookupPose(input.activeVariant?.poseId);
    const angle = lookupAngle(input.activeVariant?.angleId);
    if (expr)
        parts.push(expr.tags);
    if (pose)
        parts.push(pose.tags);
    if (angle)
        parts.push(angle.prompt);
    if (input.palette?.trim())
        parts.push(`color palette: ${input.palette.trim()}`);
    if (input.forbiddenTraits?.trim())
        parts.push(`avoid: ${input.forbiddenTraits.trim()}`);
    parts.push('consistent character design, same outfit and proportions across shots');
    return parts.filter(Boolean).join(', ');
}
/** 选参考图：完整设定图优先，其次三视图正面 */
export function pickCharacterSheetReference(input) {
    return (input.fullSheetUrl?.trim() ||
        input.frontUrl?.trim() ||
        input.sideUrl?.trim() ||
        input.backUrl?.trim() ||
        undefined);
}
export function collectCharacterSheetPictures(input) {
    const urls = [input.fullSheetUrl, input.frontUrl, input.sideUrl, input.backUrl];
    const seen = new Set();
    const out = [];
    for (const u of urls) {
        const t = u?.trim();
        if (t && !seen.has(t)) {
            seen.add(t);
            out.push(t);
        }
    }
    return out;
}
/** 写入 Backlot CharacterProfile 的一致性描述 */
export function buildCharacterConsistencyPrompt(input) {
    const p = input.profile ?? {};
    const bible = input.bible ?? {};
    const bibleText = CHARACTER_BIBLE_LAYERS.map((l) => {
        const v = (bible[l.key] ?? '').trim();
        return v ? `${l.label}: ${v}` : '';
    })
        .filter(Boolean)
        .join('. ');
    const base = [p.distinctiveFeatures, p.occupation, p.personality, p.background]
        .map((s) => s?.trim())
        .filter(Boolean)
        .join('. ');
    const combined = [base, bibleText].filter(Boolean).join('. ');
    const variant = buildCharacterSheetPrompt(input);
    return combined ? `${combined}. ${variant}` : variant;
}
export function buildCharacterSheetMeta(input) {
    const variant = input.activeVariant ?? {};
    return {
        characterName: input.characterName?.trim() || '',
        profile: input.profile ?? {},
        palette: input.palette ?? '',
        forbidden: input.forbiddenTraits ?? '',
        activeVariant: variant,
        expressionLabel: lookupExpression(variant.expressionId)?.label,
        poseLabel: lookupPose(variant.poseId)?.label,
        angleLabel: lookupAngle(variant.angleId)?.label,
        turnaround: {
            front: input.frontUrl ?? '',
            side: input.sideUrl ?? '',
            back: input.backUrl ?? '',
        },
        fullSheetUrl: input.fullSheetUrl ?? '',
        bible: input.bible ?? {},
    };
}
export function applyCharacterSheetPatch(current, patch) {
    return {
        ...current,
        ...patch,
        profile: { ...current.profile, ...patch.profile },
        bible: patch.bible
            ? { ...current.bible, ...patch.bible }
            : current.bible,
        activeVariant: patch.activeVariant
            ? { ...current.activeVariant, ...patch.activeVariant }
            : current.activeVariant,
    };
}
export function characterSheetFromNodeData(data) {
    const profile = data?.profile ?? {};
    const bible = data?.bible ?? {};
    return {
        characterName: data?.characterName ?? '',
        profile: {
            age: profile.age ?? data?.age,
            height: profile.height ?? data?.height,
            weight: profile.weight ?? data?.weight,
            occupation: profile.occupation ?? data?.occupation,
            personality: profile.personality ?? data?.personality,
            background: profile.background ?? data?.background,
            distinctiveFeatures: profile.distinctiveFeatures ?? data?.distinctiveFeatures,
        },
        frontUrl: data?.frontUrl ?? '',
        sideUrl: data?.sideUrl ?? '',
        backUrl: data?.backUrl ?? '',
        fullSheetUrl: data?.fullSheetUrl ?? '',
        palette: data?.palette ?? '',
        forbiddenTraits: data?.forbiddenTraits ?? '',
        bible: {
            identity: (bible.identity ?? data?.bibleIdentity) || undefined,
            appearance: (bible.appearance ?? data?.bibleAppearance) || undefined,
            personality: (bible.personality ?? data?.biblePersonality) || undefined,
            background: (bible.background ?? data?.bibleBackground) || undefined,
            voice: (bible.voice ?? data?.bibleVoice) || undefined,
            relationships: (bible.relationships ?? data?.bibleRelationships) || undefined,
        },
        activeVariant: data?.activeVariant ?? {
            expressionId: 'calm',
            poseId: 'stand',
            angleId: 'three-quarter',
        },
    };
}
export function syncCharacterSheetNodeOutput(input) {
    const content = buildCharacterSheetPrompt(input);
    const pictures = collectCharacterSheetPictures(input);
    const ref = pickCharacterSheetReference(input);
    return {
        content,
        output: content,
        meta: buildCharacterSheetMeta(input),
        pictures: pictures.length ? pictures : undefined,
        previewUrl: ref,
        fullSheetUrl: input.fullSheetUrl?.trim() || undefined,
    };
}
