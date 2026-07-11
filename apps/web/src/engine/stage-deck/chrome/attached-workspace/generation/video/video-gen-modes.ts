import type { LucideIcon } from 'lucide-react';
import { Image, ImagePlus, Layers, Sparkles, Type } from 'lucide-react';

export type VideoGenMode =
  | 'text-to-video'
  | 'omni-ref'
  | 'image-to-video'
  | 'keyframe'
  | 'image-ref';

export interface VideoGenModeDef {
  id: VideoGenMode;
  label: string;
  icon: LucideIcon;
}

export const VIDEO_GEN_MODES: VideoGenModeDef[] = [
  { id: 'text-to-video', label: '文生视频', icon: Type },
  { id: 'omni-ref', label: '全能参考', icon: Sparkles },
  { id: 'image-to-video', label: '图生视频', icon: Image },
  { id: 'keyframe', label: '首尾帧', icon: Layers },
  { id: 'image-ref', label: '图片参考', icon: ImagePlus },
];

export function lookupVideoGenMode(id?: string): VideoGenModeDef {
  return VIDEO_GEN_MODES.find((m) => m.id === id) ?? VIDEO_GEN_MODES[0];
}

export function readVideoGenMode(data: Record<string, unknown>): VideoGenMode {
  const raw = data.videoGenMode as string | undefined;
  if (raw && VIDEO_GEN_MODES.some((m) => m.id === raw)) return raw as VideoGenMode;
  if (data.useKeyframePair) return 'keyframe';
  return 'text-to-video';
}

export function showVideoFrameStrip(mode: VideoGenMode): boolean {
  return mode === 'keyframe';
}

export function patchVideoGenMode(mode: VideoGenMode): Record<string, unknown> {
  return {
    videoGenMode: mode,
    useKeyframePair: mode === 'keyframe',
  };
}
