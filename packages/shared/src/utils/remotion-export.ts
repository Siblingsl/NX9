import type { TimelinePayload } from '../types/timeline';
import { buildTimelineFromShots } from './timeline-export';

/** Remotion Player / Studio compatible composition descriptor (lightweight). */
export interface RemotionComposition {
  id: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  props: {
    title: string;
    tracks: RemotionTrack[];
  };
}

export interface RemotionTrack {
  id: string;
  kind: 'video' | 'audio';
  clips: RemotionClipSequence[];
}

export interface RemotionClipSequence {
  id: string;
  from: number;
  durationInFrames: number;
  src: string;
  type: 'video' | 'audio' | 'image';
  label: string;
}

export function timelineToRemotion(
  timeline: TimelinePayload,
  opts?: { width?: number; height?: number },
): RemotionComposition {
  const fps = timeline.fps || 30;
  const durationInFrames = Math.max(1, Math.ceil(timeline.durationSec * fps));

  const tracks: RemotionTrack[] = timeline.tracks.map((track) => ({
    id: track.id,
    kind: track.kind,
    clips: track.clips.map((clip) => ({
      id: clip.id,
      from: Math.round(clip.startSec * fps),
      durationInFrames: Math.max(1, Math.round(clip.durationSec * fps)),
      src: clip.assetUrl,
      type: clip.type,
      label: clip.label,
    })),
  }));

  return {
    id: 'Nx9Timeline',
    width: opts?.width ?? 1920,
    height: opts?.height ?? 1080,
    fps,
    durationInFrames,
    props: {
      title: timeline.title,
      tracks,
    },
  };
}

export function shotsToRemotion(
  shots: Parameters<typeof buildTimelineFromShots>[0],
  title?: string,
): RemotionComposition {
  const timeline = buildTimelineFromShots(shots, title);
  return timelineToRemotion(timeline);
}

/** Active clip at playback time (seconds). */
export function clipAtTime(
  timeline: TimelinePayload,
  timeSec: number,
): { video?: string; audio?: string; image?: string; label?: string } {
  const out: { video?: string; audio?: string; image?: string; label?: string } = {};
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      const end = clip.startSec + clip.durationSec;
      if (timeSec >= clip.startSec && timeSec < end) {
        if (clip.type === 'video') out.video = clip.assetUrl;
        if (clip.type === 'audio') out.audio = clip.assetUrl;
        if (clip.type === 'image') out.image = clip.assetUrl;
        out.label = clip.label;
      }
    }
  }
  return out;
}
