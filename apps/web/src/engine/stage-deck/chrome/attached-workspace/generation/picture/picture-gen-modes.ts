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
    label: '图片高清',
    shortLabel: '高清',
    icon: ZoomIn,
    hint: '放大并增强清晰度',
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

export function showPictureReferenceStrip(
  mode: PictureGenMode,
  hasUpstream: boolean,
  force = false,
): boolean {
  if (force) return true;
  if (mode === 'text-to-image') return hasUpstream;
  if (mode === 'upscale-hd') return true;
  return mode !== 'panorama-720' || hasUpstream;
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

/** 从节点 data 解析全部参考图（上传 + 多参考槽） */
export function resolvePictureReferenceUrls(data: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const push = (u?: string | null) => {
    const v = u?.trim();
    if (v && !urls.includes(v)) urls.push(v);
  };
  push(data.referenceImageUrl as string | undefined);
  push(data.styleImageUrl as string | undefined);
  const multi = data.referenceImageUrls as string[] | undefined;
  if (Array.isArray(multi)) {
    for (const u of multi) push(u);
  }
  return urls;
}
