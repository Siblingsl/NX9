import type { TimelineClip, TimelineTrack } from '../types/timeline';

export interface TimelineExport {
  version: 1;
  title: string;
  fps: number;
  durationSec: number;
  tracks: TimelineTrack[];
}

export function buildTimelineFromShots(
  shots: Array<{
    id: string;
    index: number;
    durationSec: number;
    descriptionZh: string;
    videoAssetId?: string | null;
    audioAssetId?: string | null;
    firstFrameAssetId?: string | null;
  }>,
  title = 'NX9 Timeline',
): TimelineExport {
  const sorted = [...shots].sort((a, b) => a.index - b.index);
  let offset = 0;
  const videoClips: TimelineClip[] = [];
  const audioClips: TimelineClip[] = [];

  for (const shot of sorted) {
    const dur = shot.durationSec || 4;
    if (shot.videoAssetId) {
      videoClips.push({
        id: `v-${shot.id}`,
        shotId: shot.id,
        label: `#${shot.index} ${shot.descriptionZh || ''}`.trim(),
        startSec: offset,
        durationSec: dur,
        assetUrl: shot.videoAssetId,
        type: 'video',
      });
    } else if (shot.firstFrameAssetId) {
      videoClips.push({
        id: `v-${shot.id}`,
        shotId: shot.id,
        label: `#${shot.index} (still)`,
        startSec: offset,
        durationSec: dur,
        assetUrl: shot.firstFrameAssetId,
        type: 'image',
      });
    }
    if (shot.audioAssetId) {
      audioClips.push({
        id: `a-${shot.id}`,
        shotId: shot.id,
        label: `配音 #${shot.index}`,
        startSec: offset,
        durationSec: dur,
        assetUrl: shot.audioAssetId,
        type: 'audio',
      });
    }
    offset += dur;
  }

  const tracks: TimelineTrack[] = [];
  if (videoClips.length) tracks.push({ id: 'video-1', kind: 'video', clips: videoClips });
  if (audioClips.length) tracks.push({ id: 'audio-1', kind: 'audio', clips: audioClips });

  return {
    version: 1,
    title,
    fps: 30,
    durationSec: offset,
    tracks,
  };
}
