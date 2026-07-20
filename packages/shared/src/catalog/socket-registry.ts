import type { SocketKind, SocketProfile } from '../types/block';
import { resolveAssetImportItems } from '../utils/asset-import';

const DEV_SOCKETS: Record<string, SocketProfile> = {};

export const SOCKET_REGISTRY: Record<string, SocketProfile> = {
  prompt: { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['prompt'] },
  'picture-gen': { accepts: ['prompt', 'picture'], emits: ['picture'] },
  'clip-gen': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['clip'] },
  'storyboard-preview': { accepts: ['prompt', 'picture', 'meta'], emits: ['picture', 'meta'] },
  /** 分镜台 = 网格 + 关键帧预览（合并节点） */
  'storyboard-desk': { accepts: ['prompt', 'picture', 'meta'], emits: ['prompt', 'picture', 'meta'] },
  'clip-editor': { accepts: ['clip', 'sound', 'picture'], emits: ['clip', 'sound'] },
  'motion-story': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['clip'] },
  'director-desk': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['picture', 'prompt'] },
  'sound-gen': { accepts: ['prompt', 'sound'], emits: ['sound'] },
  'chat-model': { accepts: ['prompt', 'picture', 'clip'], emits: ['prompt'] },

  'prompt-studio': { accepts: ['prompt', 'picture'], emits: ['prompt'] },
  'style-lab': { accepts: ['prompt', 'picture'], emits: ['prompt', 'picture'] },
  'local-enhance': { accepts: ['picture', 'clip'], emits: ['picture', 'clip'] },
  'model-market': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['prompt', 'picture', 'clip', 'sound', 'mesh'] },
  'shot-script': { accepts: ['prompt'], emits: ['prompt', 'meta'] },
  'reference-board': { accepts: ['prompt', 'picture'], emits: ['prompt', 'picture'] },
  'character-sheet': { accepts: ['prompt', 'picture', 'meta'], emits: ['prompt', 'meta'] },
  'continuity-check': { accepts: ['prompt', 'picture', 'clip'], emits: ['prompt', 'meta'] },
  'scene-card': { accepts: ['prompt', 'picture'], emits: ['prompt', 'meta'] },
  'dialogue-sheet': { accepts: ['prompt'], emits: ['prompt', 'meta'] },
  'asset-gate': { accepts: ['prompt', 'meta'], emits: ['prompt', 'meta'] },
  'voice-cast': { accepts: ['prompt', 'sound'], emits: ['sound', 'meta'] },
  'bridge-clip': { accepts: ['prompt', 'clip'], emits: ['prompt', 'picture', 'meta'] },
  'caption-asr': { accepts: ['clip', 'sound', 'prompt'], emits: ['prompt', 'clip', 'meta'] },
  'seedance-chain': { accepts: ['prompt', 'clip'], emits: ['clip', 'meta'] },
  'thumbnail-maker': { accepts: ['picture', 'clip'], emits: ['picture', 'meta'] },
  'inpaint-edit': { accepts: ['picture', 'prompt'], emits: ['picture', 'meta'] },
  'control-preprocess': { accepts: ['picture'], emits: ['picture', 'meta'] },
  'reference-analyze': { accepts: ['clip', 'prompt'], emits: ['prompt', 'meta'] },
  'music-gen': { accepts: ['prompt'], emits: ['sound'] },
  'lipsync-pass': { accepts: ['clip', 'sound'], emits: ['clip'] },
  'export-pack': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: [] },
  'subtitle-burn': { accepts: ['prompt', 'clip'], emits: ['clip'] },
  'audio-mix': { accepts: ['sound'], emits: ['sound'] },
  'color-grade': { accepts: ['picture', 'clip'], emits: ['picture', 'clip'] },
  'beat-sync': { accepts: ['sound', 'clip'], emits: ['clip', 'meta'] },
  'variant-fork': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['prompt', 'picture', 'clip', 'sound', 'meta'] },
  'review-gate': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['prompt', 'picture', 'clip', 'sound', 'meta'] },
  'recipe-spawn': { accepts: [], emits: [] },
  'prompt-diff': { accepts: ['prompt'], emits: ['prompt', 'meta'] },
  'asset-watch': { accepts: ['picture', 'clip', 'sound'], emits: ['picture', 'clip', 'sound', 'meta'] },

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
  'comfy-workflow': { accepts: ['prompt', 'picture', 'clip'], emits: ['picture', 'clip', 'meta'] },
  'comfy-builder': { accepts: [], emits: ['prompt'] },

  'multi-view-3d': { accepts: ['prompt', 'picture'], emits: ['picture'] },
  'panorama-flat': { accepts: ['prompt'], emits: ['picture'] },
  'portrait-flow': { accepts: ['prompt', 'picture', 'meta'], emits: ['picture'] },
  'portrait-meta': { accepts: ['picture'], emits: ['meta'] },
  'story-grid': { accepts: ['prompt', 'meta'], emits: ['prompt', 'meta'] },
  'grid-prompt-reverse': { accepts: ['picture'], emits: ['prompt', 'picture'] },
  'photo-speak': { accepts: ['prompt', 'picture', 'sound'], emits: ['clip', 'sound'] },

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

  'cinema-prompt': { accepts: ['prompt'], emits: ['prompt'] },
  'camera-prompt': { accepts: ['prompt', 'picture'], emits: ['prompt'] },
  'angle-visual': { accepts: ['picture'], emits: ['prompt'] },
  'portrait-craft': { accepts: ['prompt', 'meta'], emits: ['prompt', 'meta'] },
  'pose-craft': { accepts: ['prompt', 'picture', 'meta'], emits: ['picture', 'prompt', 'meta'] },
  'link-parser': { accepts: ['prompt'], emits: ['prompt', 'picture', 'clip', 'sound'] },
  'batch-runner': { accepts: ['picture', 'clip', 'sound', 'mesh'], emits: [] },
  'topaz-picture': { accepts: ['picture'], emits: ['picture'] },
  'topaz-clip': { accepts: ['clip'], emits: ['clip'] },
  'panorama-sphere': { accepts: ['picture'], emits: ['picture'] },
  'director-3d': { accepts: ['picture', 'mesh'], emits: ['picture', 'prompt'] },
  'blocking-stage': { accepts: ['prompt', 'picture'], emits: ['prompt', 'meta'] },
  'light-rig': { accepts: ['picture', 'prompt'], emits: ['picture', 'prompt'] },
  'depth-pass': { accepts: ['picture', 'mesh'], emits: ['picture', 'meta'] },

  'asset-import': { accepts: [], emits: [] },
  'asset-bundle': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['prompt', 'picture', 'clip', 'sound'] },
  'render-slot': { accepts: ['prompt', 'picture'], emits: ['picture'] },
  'preview-sink': { accepts: ['prompt', 'picture', 'clip', 'sound', 'mesh', 'wildcard'], emits: ['wildcard'] },
  'group-frame': { accepts: [], emits: ['wildcard'] },
  'codex-picture': { accepts: ['prompt', 'picture'], emits: ['picture', 'prompt'] },
};

export const SOCKET_COLORS: Record<SocketKind, string> = {
  prompt: '#5E4D8A',
  picture: '#A13D63',
  clip: '#D97706',
  sound: '#2E8B57',
  mesh: '#5E4D8A',
  meta: '#222222',
  param: '#5E4D8A',
  wildcard: '#E6E6E6',
};

export const SOCKET_LABELS: Record<SocketKind, string> = {
  prompt: '文本',
  picture: '图像',
  clip: '视频',
  sound: '音频',
  mesh: '3D',
  meta: '元数据',
  param: '参数',
  wildcard: '任意',
};

export function resolveEmits(kind: string, data?: Record<string, unknown>): SocketKind[] {
  if (kind === 'asset-import') {
    const items = resolveAssetImportItems(data);
    if (items.length === 0) return [];
    const kinds = new Set<SocketKind>();
    for (const item of items) {
      if (item.mediaKind === 'picture') kinds.add('picture');
      else if (item.mediaKind === 'clip') kinds.add('clip');
      else if (item.mediaKind === 'sound') kinds.add('sound');
      else if (item.mediaKind === 'mesh') kinds.add('mesh');
    }
    return [...kinds];
  }
  if (kind === 'asset-bundle') {
    const bundleKind = data?.bundleKind as string | undefined;
    const items = data?.bundleItems;
    if (!Array.isArray(items) || items.length === 0) return [];
    if (bundleKind === 'prompt') return ['prompt'];
    if (bundleKind === 'picture') return ['picture'];
    if (bundleKind === 'clip') return ['clip'];
    if (bundleKind === 'sound') return ['sound'];
    return [];
  }
  return SOCKET_REGISTRY[kind]?.emits ?? [];
}

export function resolveAccepts(kind: string): SocketKind[] {
  return SOCKET_REGISTRY[kind]?.accepts ?? [];
}

export function socketsCompatible(sourceEmits: SocketKind[], targetAccepts: SocketKind[]): boolean {
  if (sourceEmits.length === 0 || targetAccepts.length === 0) return false;
  if (sourceEmits.includes('wildcard') || targetAccepts.includes('wildcard')) return true;
  return sourceEmits.some((s) => targetAccepts.includes(s));
}

export function validateLink(
  sourceKind: string,
  targetKind: string,
  sourceData?: Record<string, unknown>,
): boolean {
  if (sourceKind === targetKind && sourceKind !== 'passthrough') return false;
  if (sourceKind === 'iterator' && targetKind === 'preview-sink') return false;
  const emits = resolveEmits(sourceKind, sourceData);
  const accepts = resolveAccepts(targetKind);
  return socketsCompatible(emits, accepts);
}

/** 分镜预览挂载图像生成 / 3D 导演台能力的上下端口（竖直连线） */
export type VerticalSocketSpec = {
  kind: SocketKind;
  position: 'top' | 'bottom';
  type: 'source' | 'target' | 'both';
  id: string;
  label?: string;
  offsetPct?: number;
};

export const EXEC_PICTURE_HANDLES = new Set([
  'exec-picture',
  'exec-picture-in',
  'exec-picture-out',
]);

export const VERTICAL_SOCKETS: Record<string, VerticalSocketSpec[]> = {
  'character-sheet': [
    {
      kind: 'meta',
      position: 'bottom',
      type: 'source',
      id: 'asset-gate',
      label: '角色设定',
    },
    {
      kind: 'picture',
      position: 'top',
      type: 'target',
      id: 'exec-picture',
      // 连接图像生成：生成角色设定板 / 接收上游图
    },
  ],
  'scene-card': [
    {
      kind: 'meta',
      position: 'bottom',
      type: 'source',
      id: 'asset-gate',
      label: '场景设定',
    },
  ],
  'picture-gen': [
    {
      kind: 'picture',
      position: 'bottom',
      type: 'source',
      id: 'exec-picture',
      // label: '出图',
    },
  ],
  'director-3d': [
    {
      kind: 'picture',
      position: 'bottom',
      type: 'source',
      id: 'exec-picture',
      // 与图像生成共用能力口：向分镜预览回写 3D 机位参考
    },
  ],
  'storyboard-preview': [
    {
      kind: 'picture',
      position: 'top',
      type: 'target',
      id: 'exec-picture',
    },
  ],
  'storyboard-desk': [
    {
      kind: 'picture',
      position: 'top',
      type: 'target',
      id: 'exec-picture',
    },
  ],
  'asset-gate': [
    {
      kind: 'meta',
      position: 'top',
      type: 'both',
      id: 'asset-gate',
      label: '设定门禁',
    },
  ],
};

export function resolveVerticalSockets(kind: string): VerticalSocketSpec[] {
  return VERTICAL_SOCKETS[kind] ?? [];
}

/** 分镜关键帧宿主：分镜台（及迁移前的预览节点） */
export function isStoryboardPreviewHostKind(kind?: string | null): boolean {
  return kind === 'storyboard-desk' || kind === 'storyboard-preview' || kind === 'story-grid';
}

export function isAssetSheetPictureHostKind(kind?: string | null): boolean {
  return kind === 'character-sheet' || kind === 'scene-card';
}

export function isStoryboardExecLink(
  sourceKind: string,
  targetKind: string,
  sourceHandle?: string | null,
  targetHandle?: string | null,
): boolean {
  const usesExec =
    EXEC_PICTURE_HANDLES.has(sourceHandle ?? '') ||
    EXEC_PICTURE_HANDLES.has(targetHandle ?? '');
  const pair =
    (sourceKind === 'picture-gen' && isStoryboardPreviewHostKind(targetKind)) ||
    (isStoryboardPreviewHostKind(sourceKind) && targetKind === 'picture-gen') ||
    (sourceKind === 'picture-gen' && isAssetSheetPictureHostKind(targetKind)) ||
    (isAssetSheetPictureHostKind(sourceKind) && targetKind === 'picture-gen') ||
    (sourceKind === 'director-3d' && isStoryboardPreviewHostKind(targetKind)) ||
    (isStoryboardPreviewHostKind(sourceKind) && targetKind === 'director-3d');
  // 能力口连线必须带 exec handle；资产设定板也允许普通 picture 口互连
  if (isAssetSheetPictureHostKind(sourceKind) || isAssetSheetPictureHostKind(targetKind)) {
    return pair;
  }
  return usesExec && pair;
}

