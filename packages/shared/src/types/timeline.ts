export type TimelineAspect = '16:9' | '9:16' | '1:1';

export interface TimelineTransition {
  kind: 'cut' | 'fade' | 'wipe' | 'shader';
  durationSec: number;
  shaderId?: string;
}

export interface TimelineClip {
  id: string;
  shotId?: string;
  label: string;
  startSec: number;
  durationSec: number;
  assetUrl: string;
  type: 'video' | 'audio' | 'image' | 'subtitle' | 'overlay';
  takeId?: string;
  trimInSec?: number;
  trimOutSec?: number;
  transitionOut?: TimelineTransition;
  text?: string;
  style?: Record<string, string | number>;
}

export interface TimelineTrack {
  id: string;
  kind: 'video' | 'audio';
  clips: TimelineClip[];
}

export interface TimelinePayload {
  version: number;
  title: string;
  fps: number;
  durationSec: number;
  aspect: TimelineAspect;
  width: number;
  height: number;
  tracks: TimelineTrack[];
  renderPreset?: 'ffmpeg-fast' | 'hyperframes-vertical' | 'remotion-studio';
  metadata?: {
    episodeId?: string;
    approvedOnly?: boolean;
    exportedAt?: string;
  };
}
