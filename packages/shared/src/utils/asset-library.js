import { backlotTemplatePrompt } from '../data/backlot-templates';
import { resolveAssetPromptText } from './creative-asset-prompts';
export const ASSET_LIBRARY_TABS = [
    { key: 'character', label: '角色', hint: '人设与一致性参考' },
    { key: 'scene', label: '场景', hint: '环境、光线、空间' },
    { key: 'shot', label: '镜头', hint: '运镜、景别、机位' },
    { key: 'emotion', label: '情绪', hint: '表情、氛围、色调' },
    { key: 'hook', label: '钩子', hint: '开场与结尾钩子' },
    { key: 'sound', label: '声音', hint: '参考音频、配音样本' },
];
export const ASSET_KIND_MENTION_PREFIX = {
    character: '角色',
    scene: '场景',
    shot: '镜头',
    emotion: '情绪',
    hook: '钩子',
    sound: '声音',
};
const PREFIX_TO_KIND = Object.fromEntries(Object.entries(ASSET_KIND_MENTION_PREFIX).map(([k, v]) => [v, k]));
export function formatAssetMention(kind, label) {
    return `@${ASSET_KIND_MENTION_PREFIX[kind]}:${label}`;
}
export function parseAssetMentions(text) {
    if (!text)
        return [];
    const pattern = /@(角色|场景|镜头|情绪|钩子|声音):(\S+)/g;
    const seen = new Set();
    const result = [];
    for (const m of text.matchAll(pattern)) {
        const kind = PREFIX_TO_KIND[m[1]];
        const label = m[2];
        const key = `${kind}:${label}`;
        if (kind && !seen.has(key)) {
            seen.add(key);
            result.push({ kind, label });
        }
    }
    return result;
}
export function characterToItem(c, scope) {
    return {
        id: c.id,
        kind: 'character',
        scope,
        label: c.name,
        prompt: resolveAssetPromptText('character', c),
        description: c.descriptionZh,
        imageUrl: c.creative?.fullSheetUrl ?? c.referenceImageUrl ?? undefined,
        audioUrl: c.referenceAudioUrl ?? undefined,
    };
}
export function workspaceItemToAsset(item, scope) {
    const kind = item.kind;
    return {
        id: item.id,
        kind,
        scope,
        label: item.label,
        prompt: resolveAssetPromptText(kind, item),
        description: item.creative?.description ?? item.promptZh,
        hookPhase: item.hookPhase,
    };
}
export function templateToAsset(tpl, scope, builtin = false) {
    return {
        id: tpl.id,
        kind: tpl.kind,
        scope,
        label: tpl.label,
        prompt: backlotTemplatePrompt(tpl),
        description: tpl.description ?? tpl.promptZh,
        hookPhase: tpl.hookPhase,
        builtin,
    };
}
export function soundToItem(s, scope) {
    return {
        id: s.id,
        kind: 'sound',
        scope,
        label: s.name,
        prompt: resolveAssetPromptText('sound', s),
        description: s.description,
        audioUrl: s.audioUrl,
    };
}
export function resolveAssetRef(ref, privateItems, publicItems) {
    const pool = ref.scope === 'private' ? privateItems : publicItems;
    return pool.find((i) => i.id === ref.id && i.kind === ref.kind);
}
export function enrichPromptWithAssets(basePrompt, refs, privateItems, publicItems) {
    const parts = refs
        .map((ref) => resolveAssetRef(ref, privateItems, publicItems))
        .filter((item) => Boolean(item))
        .map((item) => `[${ASSET_KIND_MENTION_PREFIX[item.kind]} ${item.label}]: ${item.prompt}`)
        .filter(Boolean);
    const trimmed = basePrompt.trim();
    if (parts.length === 0)
        return trimmed;
    const suffix = `Asset context:\n${parts.join('\n')}`;
    return trimmed ? `${trimmed}\n\n${suffix}` : suffix;
}
