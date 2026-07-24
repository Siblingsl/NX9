import type { TimelinePayload, TimelineClip } from './timeline';

export type SmartEditProfile = 'drama' | 'viral';
export type SmartEditEngine = 'auto' | 'remotion' | 'hyperframes' | 'ffmpeg';

export interface SmartEditNodeData {
  profile: SmartEditProfile;
  engine: SmartEditEngine;
  templateId?: string;
  status?: 'idle' | 'running' | 'success' | 'error';
  error?: string;
  timelineSyncedAt?: string;
  pendingSuggestionIds?: string[];
  renderTaskId?: string;
  renderBackend?: 'ffmpeg' | 'remotion' | 'hyperframes';
  outputUrl?: string;
  videoUrl?: string;
  outputSound?: string;

  editorMode?: 'concat' | 'audio' | 'grade';
  extraClips?: string[];
  transition?: string;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  normalize?: boolean;
  title?: string;
}

export interface SmartSuggestion {
  id: string;
  kind: 'transition' | 'subtitle' | 'trim' | 'ducking' | 'beat-cut' | 'template-patch';
  targetClipIds: string[];
  message: string;
  patch: Record<string, unknown>;
  confidence: number;
}

export function resolveEngine(profile: SmartEditProfile, engine: SmartEditEngine): SmartEditEngine {
  if (engine !== 'auto') return engine;
  return profile === 'drama' ? 'remotion' : 'hyperframes';
}

export function engineLabel(engine: SmartEditEngine): string {
  switch (engine) {
    case 'auto': return '自动';
    case 'remotion': return 'Remotion';
    case 'hyperframes': return 'HF';
    case 'ffmpeg': return 'FFmpeg';
  }
}

export function profileLabel(profile: SmartEditProfile): string {
  return profile === 'drama' ? '漫剧成片' : '爆款模板';
}

export function buildViralClip(args: {
  id: string;
  url: string;
  startSec: number;
  durationSec: number;
}): TimelineClip {
  return {
    id: args.id,
    label: `clip-${args.id.slice(-8)}`,
    startSec: args.startSec,
    durationSec: args.durationSec,
    assetUrl: args.url,
    type: 'video',
    transitionOut: { kind: 'fade' as const, durationSec: 0.25 },
  };
}

export function buildA1Clip(args: {
  id: string;
  url: string;
  startSec: number;
  durationSec: number;
}): TimelineClip {
  return {
    id: args.id,
    label: `配音-${args.id.slice(-8)}`,
    startSec: args.startSec,
    durationSec: args.durationSec,
    assetUrl: args.url,
    type: 'audio',
  };
}
