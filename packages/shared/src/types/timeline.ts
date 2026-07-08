export interface TimelineClip {
  id: string;
  shotId?: string;
  label: string;
  startSec: number;
  durationSec: number;
  assetUrl: string;
  type: 'video' | 'audio' | 'image';
}

export interface TimelineTrack {
  id: string;
  kind: 'video' | 'audio';
  clips: TimelineClip[];
}

export interface TimelinePayload {
  version: 1;
  title: string;
  fps: number;
  durationSec: number;
  tracks: TimelineTrack[];
}
