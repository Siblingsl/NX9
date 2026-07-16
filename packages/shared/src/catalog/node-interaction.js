import { lookupBlock } from './block-catalog';
import { resolveAttachedWorkspace } from './attached-workspace';
const OUTPUT_KINDS = new Set([
    'preview-sink',
    'mesh-viewer',
    'thumbnail-maker',
    'clip-sink',
    'render-slot',
]);
const CONFIG_KINDS = new Set([
    'model-market',
    'comfy-workflow',
    'control-preprocess',
    'color-grade',
    'audio-mix',
    'export-pack',
    'subtitle-burn',
    'lipsync-pass',
    'param-inject',
    'director-3d',
    'blocking-stage',
    'light-rig',
    'depth-pass',
    'panorama-sphere',
]);
const LOGIC_KINDS = new Set([
    'variant-fork',
    'review-gate',
    'recipe-spawn',
    'prompt-diff',
    'asset-watch',
    'beat-sync',
    'bridge-clip',
    'iterator',
    'picker',
    'passthrough',
    'frame-endpoints',
    'picture-diff',
    'grid-split',
    'grid-compose',
    'scale-fit',
    'picture-merge',
    'batch-runner',
]);
const AI_KINDS = new Set([
    'continuity-check',
    'reference-analyze',
    'seedance-chain',
    'caption-asr',
    'grid-prompt-reverse',
    'chat-model',
]);
const CATEGORY_DEFAULT = {
    source: 'input',
    generate: 'input',
    craft: 'input',
    hub: 'logic',
    integrate: 'config',
    utility: 'logic',
    support: 'output',
    spatial: 'config',
};
/**
 * 仅以下节点类型打开 Prompt Bar（白名单）。
 * 角色设定、素材导入、局部增强等结构化/配置/逻辑节点不在此列。
 */
export const PROMPT_BAR_KINDS = new Set([
    'prompt',
    'picture-gen',
    'clip-gen',
    'sound-gen',
    'motion-story',
    'photo-speak',
    'music-gen',
    'inpaint-edit',
    'chat-model',
    'prompt-studio',
    'style-lab',
    'story-grid',
    'grid-prompt-reverse',
    'shot-script',
    'director-desk',
    'caption-asr',
    'seedance-chain',
    'bridge-clip',
    'thumbnail-maker',
]);
/** 生成类节点 — Prompt Bar 底部展示模型/比例等高级参数 */
export const PROMPT_BAR_GEN_KINDS = new Set([
    'picture-gen',
    'clip-gen',
    'sound-gen',
    'motion-story',
    'photo-speak',
    'music-gen',
    'inpaint-edit',
]);
export function isPromptBarKind(kind) {
    const spec = resolveAttachedWorkspace(kind);
    if (spec)
        return spec.attachToNode;
    return PROMPT_BAR_KINDS.has(kind);
}
export function isPromptBarGenKind(kind) {
    return PROMPT_BAR_GEN_KINDS.has(kind);
}
function profileFromClass(cls) {
    switch (cls) {
        case 'input':
            return { class: cls, opensPromptBar: true, opensInspector: true, opensPreview: false };
        case 'ai':
            return { class: cls, opensPromptBar: true, opensInspector: true, opensPreview: true };
        case 'config':
            return { class: cls, opensPromptBar: false, opensInspector: true, opensPreview: false };
        case 'logic':
            return { class: cls, opensPromptBar: false, opensInspector: true, opensPreview: false };
        case 'output':
            return { class: cls, opensPromptBar: false, opensInspector: true, opensPreview: true };
        default:
            return { class: 'input', opensPromptBar: true, opensInspector: true, opensPreview: false };
    }
}
export function resolveNodeInteractionClass(kind) {
    if (OUTPUT_KINDS.has(kind))
        return 'output';
    if (CONFIG_KINDS.has(kind))
        return 'config';
    if (LOGIC_KINDS.has(kind))
        return 'logic';
    if (AI_KINDS.has(kind))
        return 'ai';
    const def = lookupBlock(kind);
    if (!def)
        return 'input';
    if (def.category === 'source' && kind.includes('preview'))
        return 'output';
    return CATEGORY_DEFAULT[def.category] ?? 'input';
}
export function resolveNodeInteraction(kind) {
    const cls = resolveNodeInteractionClass(kind);
    const base = profileFromClass(cls);
    const spec = resolveAttachedWorkspace(kind);
    const opensPromptBar = spec ? spec.attachToNode : PROMPT_BAR_KINDS.has(kind);
    return {
        ...base,
        opensPromptBar,
        opensInspector: false,
        opensPreview: base.opensPreview || cls === 'output',
    };
}
/** Normalize legacy block status strings to unified node status */
export function normalizeNodeStatus(raw) {
    switch (raw) {
        case 'running':
            return 'running';
        case 'done':
        case 'success':
            return 'success';
        case 'error':
            return 'error';
        case 'blocked':
        case 'waiting':
        case 'stale':
            return 'waiting';
        case 'disabled':
            return 'disabled';
        case 'ready':
            return 'ready';
        default:
            return 'idle';
    }
}
const PROMPT_KEYS = [
    'content',
    'globalPrompt',
    'prompt',
    'promptEn',
    'promptZh',
    'upstreamPrompt',
    'compiledPrompt',
    'script',
    'descriptionZh',
];
/** Primary prompt field key for read/write (defaults to `content`) */
export function resolveNodePromptField(data) {
    if (!data)
        return 'content';
    for (const key of PROMPT_KEYS) {
        const v = data[key];
        if (typeof v === 'string' && v.trim())
            return key;
    }
    if (typeof data.content === 'string')
        return 'content';
    if (typeof data.globalPrompt === 'string')
        return 'globalPrompt';
    if (typeof data.prompt === 'string')
        return 'prompt';
    return 'content';
}
/** Extract primary editable prompt text from node data */
export function resolveNodePromptText(data) {
    if (!data)
        return '';
    for (const key of PROMPT_KEYS) {
        const v = data[key];
        if (typeof v === 'string' && v.trim())
            return v;
    }
    const items = data.promptItems;
    if (items?.length) {
        const filled = items.filter((i) => i.text?.trim());
        const withImages = items.filter((i) => i.imageUrl);
        if (filled.length > 1) {
            const first = filled[0].text.trim().replace(/\s+/g, ' ');
            const preview = first.length > 28 ? `${first.slice(0, 28)}…` : first;
            return `${filled.length} 条 · ${preview}`;
        }
        if (filled.length === 1)
            return filled[0].text.trim();
        if (withImages.length > 0)
            return `${withImages.length} 素材 · 待填提示词`;
    }
    const previewPayload = data.storyboardPreview;
    if (previewPayload?.frames?.length) {
        const total = previewPayload.frames.length;
        const ok = previewPayload.frames.filter((f) => f.status === 'success' || f.status === 'locked').length;
        const ready = ok === total ? 'Ready' : `${ok}/${total}`;
        return `Storyboard Preview · ${total} Images · ${ready}`;
    }
    return '';
}
export function truncatePromptPreview(text, max = 40) {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!t)
        return '';
    if (t.length <= max)
        return t;
    return `${t.slice(0, max)}…`;
}
export function resolveNodeAssetTags(data) {
    if (!data)
        return [];
    const tags = [];
    const pushRef = (kind, ref) => {
        if (!ref || typeof ref !== 'object')
            return;
        const label = ref.label;
        if (label)
            tags.push({ kind, label });
    };
    pushRef('character', data.characterAssetRef);
    pushRef('scene', data.sceneAssetRef);
    pushRef('shot', data.shotAssetRef);
    pushRef('emotion', data.emotionAssetRef);
    pushRef('hook', data.assetRef ?? data.hookAssetRef);
    pushRef('sound', data.soundAssetRef ?? data.voiceAssetRef);
    if (typeof data.stylePreset === 'string' && data.stylePreset) {
        tags.push({ kind: 'style', label: data.stylePreset });
    }
    return tags;
}
export function resolveNodeThumbUrl(data, kind) {
    if (!data)
        return undefined;
    if (kind === 'clip-gen') {
        return (data.previewUrl ??
            data.assetUrl ??
            undefined);
    }
    const previewPayload = data.storyboardPreview;
    const frameThumb = previewPayload?.frames?.find((f) => f.imageUrl)?.imageUrl;
    if (frameThumb)
        return frameThumb ?? undefined;
    const previewUrls = data.previewUrls;
    return (previewUrls?.[0] ??
        data.previewUrl ??
        data.assetUrl ??
        data.videoUrl ??
        data.lastCaptureUrl);
}
export function resolveNodeOutputCount(kind, data) {
    if (!data)
        return undefined;
    if (kind === 'storyboard-preview') {
        const previewPayload = data.storyboardPreview;
        const n = previewPayload?.frames?.length;
        if (typeof n === 'number' && n > 0)
            return n;
    }
    const imageCount = data.imageCount;
    if (typeof imageCount === 'number' && imageCount > 0)
        return imageCount;
    const previewUrls = data.previewUrls;
    if (previewUrls?.length)
        return previewUrls.length;
    if (data.previewUrl || data.videoUrl || data.assetUrl)
        return 1;
    const batchCount = data.batchCount;
    if (typeof batchCount === 'number' && batchCount > 0)
        return batchCount;
    if (kind === 'prompt') {
        const items = data.promptItems;
        if (items?.length)
            return items.length;
    }
    return undefined;
}
