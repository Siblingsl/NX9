import type { LucideIcon } from 'lucide-react';
import { Globe2, Image, Images, Palette, Type, ZoomIn } from 'lucide-react';

export type PictureGenMode =
  | 'text-to-image'
  | 'image-to-image'
  | 'multi-ref'
  | 'style-ref'
  | 'panorama-720'
  | 'upscale-hd';

export interface PictureGenModeDef {
  id: PictureGenMode;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  hint: string;
}

export const PICTURE_GEN_MODES: PictureGenModeDef[] = [
  {
    id: 'text-to-image',
    label: '文生图',
    shortLabel: '文生图',
    icon: Type,
    hint: '纯文字描述生成图像',
  },
  {
    id: 'image-to-image',
    label: '图生图',
    shortLabel: '图生图',
    icon: Image,
    hint: '基于参考图改写 / 重绘',
  },
  {
    id: 'multi-ref',
    label: '多参考',
    shortLabel: '多参考',
    icon: Images,
    hint: '角色 / 场景 / 构图多图融合',
  },
  {
    id: 'style-ref',
    label: '风格参考',
    shortLabel: '风格',
    icon: Palette,
    hint: '主体 + 风格图控制画风',
  },
  {
    id: 'upscale-hd',
    label: '图片放大',
    shortLabel: '放大',
    icon: ZoomIn,
    hint: '插值放大 2×/4×（不新增细节）',
  },
  {
    id: 'panorama-720',
    label: '720° 全景',
    shortLabel: '全景',
    icon: Globe2,
    hint: '2:1 等距柱状环境图',
  },
];

export function readPictureGenMode(data: Record<string, unknown>): PictureGenMode {
  const raw = data.pictureGenMode as string | undefined;
  if (raw === 'panorama-720') return 'panorama-720';
  if (raw === 'upscale-hd') return 'upscale-hd';
  if (raw === 'image-to-image') return 'image-to-image';
  if (raw === 'multi-ref') return 'multi-ref';
  if (raw === 'style-ref') return 'style-ref';
  if (data.useImageReference) return 'image-to-image';
  return 'text-to-image';
}

/** 不锁定模式的专业动作（仍按参考图自动文生/图生/多参考） */
const BASIC_PRO_ACTION_IDS = new Set(['text-to-image', 'image-to-image', 'multi-prompt']);

export function isSpecializedPictureMode(
  mode: PictureGenMode,
  proActionId?: string | null,
): boolean {
  if (mode === 'upscale-hd' || mode === 'panorama-720' || mode === 'style-ref') return true;
  const pro = (proActionId ?? '').trim();
  return Boolean(pro && !BASIC_PRO_ACTION_IDS.has(pro));
}

/** 按有效参考图数量推断基础模式：0→文生图 / 1→图生图 / ≥2→多参考 */
export function inferBasicPictureGenMode(refCount: number): PictureGenMode {
  if (refCount >= 2) return 'multi-ref';
  if (refCount >= 1) return 'image-to-image';
  return 'text-to-image';
}

/**
 * 运行时模式：专业玩法保持锁定；基础路径按参考图自动文生/图生/多参考。
 * effectiveRefUrls = 本节点上传 + 上游传入（已排除 excluded）+ 风格图。
 */
export function resolveRuntimePictureGenMode(
  data: Record<string, unknown>,
  effectiveRefUrls: string[] = [],
): PictureGenMode {
  const mode = readPictureGenMode(data);
  const proActionId = data.pictureProAction as string | undefined;
  if (isSpecializedPictureMode(mode, proActionId)) return mode;

  const urls = effectiveRefUrls
    .map((u) => u.trim())
    .filter(Boolean)
    .filter((u, i, arr) => arr.indexOf(u) === i);
  return inferBasicPictureGenMode(urls.length);
}

export function modeNeedsPrimaryRef(mode: PictureGenMode): boolean {
  return (
    mode === 'image-to-image' ||
    mode === 'multi-ref' ||
    mode === 'style-ref' ||
    mode === 'upscale-hd'
  );
}

export function modeNeedsStyleRef(mode: PictureGenMode): boolean {
  return mode === 'style-ref';
}

export function modeAllowsMultiRef(mode: PictureGenMode): boolean {
  return mode === 'multi-ref' || mode === 'style-ref';
}

export function lookupPictureGenModeDef(mode: PictureGenMode): PictureGenModeDef {
  return PICTURE_GEN_MODES.find((m) => m.id === mode) ?? PICTURE_GEN_MODES[0];
}

export function patchPictureGenMode(mode: PictureGenMode): Record<string, unknown> {
  return {
    pictureGenMode: mode,
    useImageReference:
      mode === 'image-to-image' ||
      mode === 'multi-ref' ||
      mode === 'style-ref' ||
      mode === 'upscale-hd',
    ...(mode === 'panorama-720'
      ? {
          aspectRatio: '2:1',
          imageCount: 1,
          panoramaProjection: 'equirectangular',
          width: 2048,
          height: 1024,
        }
      : {}),
    ...(mode === 'upscale-hd' ? { imageCount: 1 } : {}),
  };
}

/** 本节点上传的主体参考（不含风格图） */
export function resolveUploadedReferenceUrls(data: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const push = (u?: string | null) => {
    const v = u?.trim();
    if (v && !urls.includes(v)) urls.push(v);
  };
  push(data.referenceImageUrl as string | undefined);
  const multi = data.referenceImageUrls as string[] | undefined;
  if (Array.isArray(multi)) {
    for (const u of multi) push(u);
  }
  return urls;
}

/** 从节点 data 解析全部参考图（上传 + 风格 + 多参考槽） */
export function resolvePictureReferenceUrls(data: Record<string, unknown>): string[] {
  const urls = resolveUploadedReferenceUrls(data);
  const style = (data.styleImageUrl as string | undefined)?.trim();
  if (style && !urls.includes(style)) urls.push(style);
  return urls;
}

/** 本节点上传参考上限（与视频参考上限对齐） */
export const MAX_PICTURE_UPLOAD_REFS = 9;

/**
 * PG-03: 设置 / 清除风格参考图。
 * 设置 → 锁定 style-ref 模式；清除 → 按剩余上传参考数回落基础模式
 * （上游参考由工作区的自动同步 effect 再校正）。
 */
export function patchStyleImageUrl(
  url: string | undefined,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const next = url?.trim() || undefined;
  if (next) {
    return {
      styleImageUrl: next,
      pictureGenMode: 'style-ref',
      useImageReference: true,
    };
  }
  const uploadCount = resolveUploadedReferenceUrls(data).length;
  const mode = inferBasicPictureGenMode(uploadCount);
  return {
    styleImageUrl: undefined,
    ...(readPictureGenMode(data) === 'style-ref' ? patchPictureGenMode(mode) : {}),
  };
}

/** 写入主参考 + 额外参考槽（首张进 referenceImageUrl，其余进 referenceImageUrls） */
export function patchUploadedReferenceUrls(
  urls: string[],
  currentMode: PictureGenMode,
  proActionId?: string | null,
): Record<string, unknown> {
  const next = urls
    .map((u) => u.trim())
    .filter(Boolean)
    .filter((u, i, arr) => arr.indexOf(u) === i)
    .slice(0, MAX_PICTURE_UPLOAD_REFS);

  const pictureGenMode = isSpecializedPictureMode(currentMode, proActionId)
    ? currentMode
    : inferBasicPictureGenMode(next.length);

  return {
    referenceImageUrl: next[0],
    referenceImageUrls: next.slice(1),
    useImageReference: next.length > 0,
    pictureGenMode,
  };
}
