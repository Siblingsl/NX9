import type { LucideIcon } from 'lucide-react';
import { Globe2, Image, Type } from 'lucide-react';

export type PictureGenMode = 'text-to-image' | 'image-to-image' | 'panorama-720';

export interface PictureGenModeDef {
  id: PictureGenMode;
  label: string;
  icon: LucideIcon;
}

export const PICTURE_GEN_MODES: PictureGenModeDef[] = [
  { id: 'text-to-image', label: '文生图', icon: Type },
  { id: 'image-to-image', label: '图生图', icon: Image },
  { id: 'panorama-720', label: '720° 全景', icon: Globe2 },
];

export function readPictureGenMode(data: Record<string, unknown>): PictureGenMode {
  const raw = data.pictureGenMode as string | undefined;
  if (raw === 'panorama-720') return 'panorama-720';
  if (raw === 'image-to-image') return 'image-to-image';
  if (data.useImageReference) return 'image-to-image';
  return 'text-to-image';
}

export function showPictureReferenceStrip(
  mode: PictureGenMode,
  hasUpstream: boolean,
): boolean {
  return mode === 'image-to-image' || hasUpstream;
}

export function lookupPictureGenModeDef(mode: PictureGenMode): PictureGenModeDef {
  return PICTURE_GEN_MODES.find((m) => m.id === mode) ?? PICTURE_GEN_MODES[0];
}

export function patchPictureGenMode(mode: PictureGenMode): Record<string, unknown> {
  return {
    pictureGenMode: mode,
    useImageReference: mode === 'image-to-image',
    ...(mode === 'panorama-720'
      ? {
          aspectRatio: '2:1',
          imageCount: 1,
          panoramaProjection: 'equirectangular',
          width: 2048,
          height: 1024,
        }
      : {}),
  };
}
