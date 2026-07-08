"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOCKET_LABELS = exports.SOCKET_COLORS = exports.SOCKET_REGISTRY = void 0;
exports.resolveEmits = resolveEmits;
exports.resolveAccepts = resolveAccepts;
exports.socketsCompatible = socketsCompatible;
exports.validateLink = validateLink;
const DEV_SOCKETS = {};
exports.SOCKET_REGISTRY = {
    prompt: { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['prompt'] },
    'picture-gen': { accepts: ['prompt', 'picture'], emits: ['picture'] },
    'clip-gen': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['clip'] },
    'clip-editor': { accepts: ['clip'], emits: ['clip'] },
    'motion-story': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['clip'] },
    'director-desk': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['clip', 'prompt'] },
    'sound-gen': { accepts: ['prompt', 'sound'], emits: ['sound'] },
    'chat-model': { accepts: ['prompt', 'picture', 'clip'], emits: ['prompt'] },
    'workflow-hub': { accepts: ['prompt', 'picture', 'clip', 'sound', 'param'], emits: ['picture', 'clip'] },
    'wallet-hub': { accepts: ['prompt', 'picture', 'clip', 'sound', 'param'], emits: ['picture', 'clip'] },
    'param-inject': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['param'] },
    'hub-market': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['picture', 'clip', 'sound'] },
    'hub-toolkit': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['prompt', 'picture', 'clip', 'sound'] },
    'vibe-workbench': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['prompt', 'picture', 'clip', 'sound'] },
    ...DEV_SOCKETS,
    'fal-market': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['prompt', 'picture', 'clip', 'sound', 'mesh'] },
    'mesh-viewer': { accepts: ['mesh'], emits: ['picture'] },
    'mesh-import': { accepts: [], emits: ['mesh'] },
    'grok-agent': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['prompt', 'picture', 'clip', 'sound'] },
    'codex-agent': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['prompt', 'picture', 'clip', 'sound', 'mesh'] },
    'style-atelier': { accepts: ['prompt'], emits: ['prompt', 'picture'] },
    'tag-atelier': { accepts: ['prompt', 'picture'], emits: ['prompt', 'picture'] },
    'comfy-market': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['prompt', 'picture', 'clip', 'sound'] },
    'comfy-builder': { accepts: [], emits: ['prompt'] },
    'multi-view-3d': { accepts: ['prompt', 'picture'], emits: ['picture'] },
    'panorama-flat': { accepts: ['prompt'], emits: ['picture'] },
    'portrait-flow': { accepts: ['prompt', 'picture', 'meta'], emits: ['picture'] },
    'portrait-meta': { accepts: ['picture'], emits: ['meta'] },
    'story-grid': { accepts: ['picture'], emits: ['picture'] },
    'sketch-pad': { accepts: ['picture'], emits: ['picture'] },
    'web-view': { accepts: [], emits: ['prompt', 'picture'] },
    'picture-diff': { accepts: ['picture'], emits: ['picture'] },
    'frame-sampler': { accepts: ['clip'], emits: ['picture'] },
    'frame-endpoints': { accepts: ['clip'], emits: ['picture'] },
    iterator: { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['prompt', 'picture', 'clip', 'sound'] },
    picker: { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['prompt', 'picture', 'clip', 'sound'] },
    'text-chunker': { accepts: ['prompt'], emits: ['prompt'] },
    'scale-fit': { accepts: ['picture'], emits: ['picture'] },
    'picture-merge': { accepts: ['picture'], emits: ['picture'] },
    'bg-remove': { accepts: ['picture'], emits: ['picture'] },
    'upscale-lite': { accepts: ['picture'], emits: ['picture'] },
    'grid-split': { accepts: ['picture'], emits: ['picture'] },
    'grid-compose': { accepts: ['picture'], emits: ['picture'] },
    'touch-up': { accepts: ['prompt', 'picture'], emits: ['picture'] },
    memo: { accepts: [], emits: ['prompt'] },
    blueprint: { accepts: ['prompt'], emits: ['prompt'] },
    passthrough: { accepts: ['wildcard'], emits: ['wildcard'] },
    'watermark-clean': { accepts: ['picture', 'clip', 'sound'], emits: ['picture', 'clip', 'sound', 'prompt', 'meta'] },
    'clip-sink': { accepts: ['clip'], emits: [] },
    'cinema-prompt': { accepts: [], emits: ['prompt'] },
    'camera-prompt': { accepts: [], emits: ['prompt'] },
    'angle-visual': { accepts: ['picture'], emits: ['prompt'] },
    'portrait-craft': { accepts: ['prompt', 'meta'], emits: ['prompt', 'meta'] },
    'pose-craft': { accepts: ['prompt', 'picture', 'meta'], emits: ['picture', 'prompt', 'meta'] },
    'link-parser': { accepts: ['prompt'], emits: ['prompt', 'picture', 'clip', 'sound'] },
    'batch-runner': { accepts: ['picture', 'clip', 'sound', 'mesh'], emits: [] },
    'topaz-picture': { accepts: ['picture'], emits: ['picture'] },
    'topaz-clip': { accepts: ['clip'], emits: ['clip'] },
    'panorama-sphere': { accepts: ['picture'], emits: ['picture'] },
    'asset-import': { accepts: [], emits: [] },
    'asset-bundle': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['prompt', 'picture', 'clip', 'sound'] },
    'render-slot': { accepts: ['prompt', 'picture'], emits: ['picture'] },
    'preview-sink': { accepts: ['prompt', 'picture', 'clip', 'sound', 'mesh', 'wildcard'], emits: ['wildcard'] },
    'group-frame': { accepts: [], emits: ['wildcard'] },
    'codex-picture': { accepts: ['prompt', 'picture'], emits: ['picture', 'prompt'] },
};
exports.SOCKET_COLORS = {
    prompt: '#5E4D8A',
    picture: '#A13D63',
    clip: '#D97706',
    sound: '#2E8B57',
    mesh: '#5E4D8A',
    meta: '#222222',
    param: '#5E4D8A',
    wildcard: '#E6E6E6',
};
exports.SOCKET_LABELS = {
    prompt: '文本',
    picture: '图像',
    clip: '视频',
    sound: '音频',
    mesh: '3D',
    meta: '元数据',
    param: '参数',
    wildcard: '任意',
};
function resolveEmits(kind, data) {
    if (kind === 'asset-import') {
        const media = data?.mediaKind;
        if (media === 'picture')
            return ['picture'];
        if (media === 'clip')
            return ['clip'];
        if (media === 'sound')
            return ['sound'];
        if (media === 'mesh')
            return ['mesh'];
        return [];
    }
    if (kind === 'asset-bundle') {
        const bundleKind = data?.bundleKind;
        const items = data?.bundleItems;
        if (!Array.isArray(items) || items.length === 0)
            return [];
        if (bundleKind === 'prompt')
            return ['prompt'];
        if (bundleKind === 'picture')
            return ['picture'];
        if (bundleKind === 'clip')
            return ['clip'];
        if (bundleKind === 'sound')
            return ['sound'];
        return [];
    }
    return exports.SOCKET_REGISTRY[kind]?.emits ?? [];
}
function resolveAccepts(kind) {
    return exports.SOCKET_REGISTRY[kind]?.accepts ?? [];
}
function socketsCompatible(sourceEmits, targetAccepts) {
    if (sourceEmits.length === 0 || targetAccepts.length === 0)
        return false;
    if (sourceEmits.includes('wildcard') || targetAccepts.includes('wildcard'))
        return true;
    return sourceEmits.some((s) => targetAccepts.includes(s));
}
function validateLink(sourceKind, targetKind, sourceData) {
    if (sourceKind === targetKind && sourceKind !== 'passthrough')
        return false;
    if (sourceKind === 'iterator' && targetKind === 'preview-sink')
        return false;
    const emits = resolveEmits(sourceKind, sourceData);
    const accepts = resolveAccepts(targetKind);
    return socketsCompatible(emits, accepts);
}
//# sourceMappingURL=socket-registry.js.map