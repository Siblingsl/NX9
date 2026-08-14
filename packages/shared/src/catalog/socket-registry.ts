import type { SocketKind, SocketProfile } from '../types/block';
import { resolveAssetImportItems } from '../utils/asset-import';
import { mediaPinKindToSocket, resolveMediaPinKind } from '../utils/media-pin';

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
  'director-desk': {
    accepts: ['prompt', 'picture', 'clip', 'sound', 'mesh'],
    emits: ['picture', 'prompt', 'mesh'],
  },
  'sound-gen': { accepts: ['prompt', 'sound'], emits: ['sound'] },
  'chat-model': { accepts: ['prompt', 'picture', 'clip'], emits: ['prompt'] },

  'prompt-studio': { accepts: ['prompt', 'picture'], emits: ['prompt'] },
  'style-lab': { accepts: ['prompt', 'picture'], emits: ['prompt', 'picture'] },
  'local-enhance': { accepts: ['picture', 'clip'], emits: ['picture', 'clip'] },
  'model-market': { accepts: ['prompt', 'picture', 'clip', 'sound'], emits: ['prompt', 'picture', 'clip', 'sound', 'mesh'] },
  'shot-script': { accepts: ['prompt'], emits: ['prompt', 'meta'] },
  'reference-board': { accepts: ['prompt', 'picture', 'clip'], emits: ['prompt', 'picture', 'clip'] },
  'continuity-check': { accepts: ['prompt', 'picture', 'clip'], emits: ['prompt', 'meta'] },
  /** 编剧台：左右 prompt 交分镜；picture / 顶口 exec-picture 交图像生成（设定板/定妆） */
  'script-desk': { accepts: ['prompt', 'picture'], emits: ['prompt', 'picture', 'meta'] },
  'dialogue-sheet': { accepts: ['prompt', 'picture'], emits: ['prompt', 'picture', 'meta'] },
  // F-005: asset-gate 已删除 — 能力拆并到编剧台/分镜台
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
  /** 画布钉板：按 pinKind 动态口；静态表为无 data 时的兜底 */
  'media-pin': {
    accepts: ['picture', 'clip', 'sound', 'mesh', 'prompt'],
    emits: ['picture', 'clip', 'sound', 'mesh', 'prompt'],
  },
  'preview-sink': { accepts: ['prompt', 'picture', 'clip', 'sound', 'mesh', 'wildcard'], emits: ['wildcard'] },
  'group-frame': { accepts: [], emits: ['wildcard'] },
  /** 场景组：左右数据口，兼容常见媒体/文本连线 */
  'scene-group': {
    accepts: ['prompt', 'picture', 'clip', 'sound', 'mesh', 'wildcard'],
    emits: ['picture', 'prompt', 'clip', 'sound', 'mesh', 'wildcard'],
  },
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
  if (kind === 'media-pin') {
    const pinKind = resolveMediaPinKind(data?.pinKind, (data?.pinUrl as string) || (data?.assetUrl as string));
    return [mediaPinKindToSocket(pinKind)];
  }
  if (kind === 'asset-import') {
    const items = resolveAssetImportItems(data);
    if (items.length === 0) {
      // 模板预置 mediaKind 时仍露出对应出口，避免空节点看起来「断线」
      const mediaKind = data?.mediaKind as string | undefined;
      if (mediaKind === 'picture') return ['picture'];
      if (mediaKind === 'clip') return ['clip'];
      if (mediaKind === 'sound') return ['sound'];
      if (mediaKind === 'mesh') return ['mesh'];
      return [];
    }
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

export function resolveAccepts(kind: string, data?: Record<string, unknown>): SocketKind[] {
  if (kind === 'media-pin') {
    if (data?.pinKind != null || data?.pinUrl || data?.assetUrl) {
      const pinKind = resolveMediaPinKind(
        data?.pinKind,
        (data?.pinUrl as string) || (data?.assetUrl as string),
      );
      return [mediaPinKindToSocket(pinKind)];
    }
    return SOCKET_REGISTRY['media-pin']?.accepts ?? ['picture'];
  }
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
  targetData?: Record<string, unknown>,
): boolean {
  if (sourceKind === targetKind && sourceKind !== 'passthrough') return false;
  if (sourceKind === 'iterator' && targetKind === 'preview-sink') return false;
  const emits = resolveEmits(sourceKind, sourceData);
  const accepts = resolveAccepts(targetKind, targetData);
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

export const EXEC_3D_HANDLES = new Set(['exec-3d', 'exec-3d-out']);

export const VERTICAL_SOCKETS: Record<string, VerticalSocketSpec[]> = {
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
      kind: 'mesh',
      position: 'bottom',
      type: 'target',
      id: 'exec-3d',
      // 底口单点：承接导演台顶口（分镜图走左右 picture 口）
    },
  ],
  'director-desk': [
    {
      kind: 'mesh',
      position: 'top',
      type: 'source',
      id: 'exec-3d',
      // 顶口单点：连到 3D 导演台底口
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
  /** 编剧台顶口：连接图像生成，供素材库一键设定板/定妆出图 */
  'script-desk': [
    {
      kind: 'picture',
      position: 'top',
      type: 'target',
      id: 'exec-picture',
    },
  ],
  // F-005: asset-gate 已删除，上下口能力拆并到编剧台/分镜台
};

export function resolveVerticalSockets(kind: string): VerticalSocketSpec[] {
  return VERTICAL_SOCKETS[kind] ?? [];
}

/** F-006: 上下能力口仅当 data.showExecPorts === true 时启用（缺省 false；设定板宿主默认开启） */
export function isExecPortsEnabled(
  data?: Record<string, unknown> | null,
  kind?: string | null,
): boolean {
  if (data?.showExecPorts === true) return true;
  if (data?.showExecPorts === false) return false;
  return isAssetSheetPictureHostKind(kind);
}

/** F-006: 当前节点可见的竖直能力口（未开启时返回空，供吸附/渲染共用） */
export function resolveVisibleVerticalSockets(
  kind: string,
  data?: Record<string, unknown> | null,
): VerticalSocketSpec[] {
  if (!isExecPortsEnabled(data, kind)) return [];
  return resolveVerticalSockets(kind);
}

export function isExecHandle(handle?: string | null): boolean {
  if (!handle) return false;
  if (EXEC_PICTURE_HANDLES.has(handle) || EXEC_3D_HANDLES.has(handle)) return true;
  const base = handle.endsWith('-out') ? handle.slice(0, -4) : handle;
  if (EXEC_PICTURE_HANDLES.has(base) || EXEC_3D_HANDLES.has(base)) return true;
  return handle.startsWith('exec-') || base.startsWith('exec-');
}

/**
 * F-006: 连接校验（含 handle）。
 * 未开启 showExecPorts 的节点禁止连入/连出 exec 上下口。
 */
export function validateConnectionWithHandles(
  sourceKind: string,
  targetKind: string,
  sourceData?: Record<string, unknown> | null,
  targetData?: Record<string, unknown> | null,
  sourceHandle?: string | null,
  targetHandle?: string | null,
): { ok: boolean; reason?: 'socket_incompatible' | 'exec_ports_disabled' } {
  if (!validateLink(sourceKind, targetKind, sourceData ?? undefined, targetData ?? undefined)) {
    return { ok: false, reason: 'socket_incompatible' };
  }
  const sourceExec = isExecHandle(sourceHandle);
  const targetExec = isExecHandle(targetHandle);
  if (!sourceExec && !targetExec) return { ok: true };

  if (
    sourceExec &&
    resolveVerticalSockets(sourceKind).length > 0 &&
    !isExecPortsEnabled(sourceData, sourceKind)
  ) {
    return { ok: false, reason: 'exec_ports_disabled' };
  }
  if (
    targetExec &&
    resolveVerticalSockets(targetKind).length > 0 &&
    !isExecPortsEnabled(targetData, targetKind)
  ) {
    return { ok: false, reason: 'exec_ports_disabled' };
  }
  return { ok: true };
}

/**
 * F-006: 数据边不得挂在上下 exec 口。
 * 编剧→分镜、分镜→导演 若缺 handle 或误挂 exec，一律改回左右 prompt。
 * 另：出图已挂分镜能力口时，拆除出图→导演旁路。
 */
export function normalizeDataEdgeHandlesAwayFromExec<
  T extends { id: string; type?: string | null },
  L extends {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  },
>(nodes: T[], links: L[]): L[] {
  const typeById = new Map(nodes.map((n) => [n.id, n.type ?? '']));
  const isStoryboardHost = (t: string) =>
    t === 'storyboard-desk' || t === 'storyboard-preview' || t === 'story-grid';

  const pictureIdsWithDeskExec = new Set<string>();
  for (const link of links) {
    const sourceType = typeById.get(link.source) ?? '';
    const targetType = typeById.get(link.target) ?? '';
    const usesExec =
      isExecHandle(link.sourceHandle) || isExecHandle(link.targetHandle);
    if (
      usesExec &&
      sourceType === 'picture-gen' &&
      isStoryboardHost(targetType)
    ) {
      pictureIdsWithDeskExec.add(link.source);
    }
    if (
      usesExec &&
      targetType === 'picture-gen' &&
      isStoryboardHost(sourceType)
    ) {
      pictureIdsWithDeskExec.add(link.target);
    }
  }

  return links
    .filter((link) => {
      const sourceType = typeById.get(link.source) ?? '';
      const targetType = typeById.get(link.target) ?? '';
      // 出图已挂分镜时，禁止再直连导演台（视觉旁路）
      if (
        sourceType === 'picture-gen' &&
        targetType === 'director-desk' &&
        pictureIdsWithDeskExec.has(link.source)
      ) {
        return false;
      }
      return true;
    })
    .map((link) => {
      const sourceType = typeById.get(link.source) ?? '';
      const targetType = typeById.get(link.target) ?? '';
      const sourceExec = isExecHandle(link.sourceHandle);
      const targetExec = isExecHandle(link.targetHandle);
      const missing =
        link.sourceHandle == null ||
        link.sourceHandle === '' ||
        link.targetHandle == null ||
        link.targetHandle === '';

      const scriptToDesk =
        sourceType === 'script-desk' && isStoryboardHost(targetType);
      const deskToDirector =
        isStoryboardHost(sourceType) && targetType === 'director-desk';

      if ((scriptToDesk || deskToDirector) && (missing || sourceExec || targetExec)) {
        return { ...link, sourceHandle: 'prompt', targetHandle: 'prompt' };
      }
      return link;
    });
}

/** 分镜关键帧宿主：分镜台（及迁移前的预览节点） */
export function isStoryboardPreviewHostKind(kind?: string | null): boolean {
  return kind === 'storyboard-desk' || kind === 'storyboard-preview' || kind === 'story-grid';
}

/** 资产设定板宿主：可连 picture-gen 出角色/场景设定图（含普通 picture 口与 exec-picture） */
export function isAssetSheetPictureHostKind(kind?: string | null): boolean {
  return kind === 'script-desk' || kind === 'dialogue-sheet';}

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

function isExec3dHandle(handle?: string | null): boolean {
  if (!handle) return false;
  if (EXEC_3D_HANDLES.has(handle)) return true;
  return handle === 'exec-3d' || handle.startsWith('exec-3d');
}

/** 导演台 ↔ 3D 导演台 竖直 mesh 能力口 */
export function isDirector3dDeskLink(
  sourceKind: string,
  targetKind: string,
  sourceHandle?: string | null,
  targetHandle?: string | null,
): boolean {
  const uses3d = isExec3dHandle(sourceHandle) || isExec3dHandle(targetHandle);
  if (!uses3d) return false;
  return (
    (sourceKind === 'director-desk' && targetKind === 'director-3d') ||
    (sourceKind === 'director-3d' && targetKind === 'director-desk')
  );
}

