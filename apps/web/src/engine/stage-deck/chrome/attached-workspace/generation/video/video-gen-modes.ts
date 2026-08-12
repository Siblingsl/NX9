import type { LucideIcon } from 'lucide-react';
import { Film, Image, ImagePlus, Layers, Sparkles, Type } from 'lucide-react';

export type VideoGenMode =
  | 'text-to-video'
  | 'omni-ref'
  | 'image-to-video'
  | 'keyframe'
  | 'image-ref'
  | 'bridge';

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
  /** VG-07: Bridge 续拍——上游视频尾帧 + 本镜 Prompt */
  { id: 'bridge', label: 'Bridge 续拍', icon: Film },
];

export function lookupVideoGenMode(id?: string): VideoGenModeDef {
  return VIDEO_GEN_MODES.find((m) => m.id === id) ?? VIDEO_GEN_MODES[0];
}

export function readVideoGenMode(data: Record<string, unknown>): VideoGenMode {
  const raw = data.videoGenMode as string | undefined;
  if (raw && VIDEO_GEN_MODES.some((m) => m.id === raw)) return raw as VideoGenMode;
  if (data.useKeyframePair) return 'keyframe';
  if (data.videoMode === 'bridge') return 'bridge';
  return 'text-to-video';
}

export type VideoFrameSlotId = 'start' | 'end' | 'ref';

/** VG-20: 首尾帧显示首/尾；图片参考与全能参考显示 Ref */
export function videoFrameStripSlots(mode: VideoGenMode): VideoFrameSlotId[] {
  if (mode === 'keyframe') return ['start', 'end'];
  if (mode === 'image-ref' || mode === 'omni-ref') return ['ref'];
  return [];
}

export function showVideoFrameStrip(mode: VideoGenMode): boolean {
  return videoFrameStripSlots(mode).length > 0;
}

export function showVideoSourceStrip(mode: VideoGenMode): boolean {
  return mode === 'bridge';
}

export function patchVideoGenMode(mode: VideoGenMode): Record<string, unknown> {
  return {
    videoGenMode: mode,
    useKeyframePair: mode === 'keyframe',
    // VG-07: 与执行层 videoMode 词表对齐（flow-runner Bridge 分支据此触发）
    videoMode: mode === 'bridge' ? 'bridge' : 'single',
  };
}
