import type { LucideIcon } from 'lucide-react';
import { Image, Type } from 'lucide-react';

export type PictureGenMode = 'text-to-image' | 'image-to-image';

export interface PictureGenModeDef {
  id: PictureGenMode;
  label: string;
  icon: LucideIcon;
}

export const PICTURE_GEN_MODES: PictureGenModeDef[] = [
  { id: 'text-to-image', label: '文生图', icon: Type },
  { id: 'image-to-image', label: '图生图', icon: Image },
];

export function readPictureGenMode(data: Record<string, unknown>): PictureGenMode {
  const raw = data.pictureGenMode as string | undefined;
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
  };
}
