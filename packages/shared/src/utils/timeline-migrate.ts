import type {
  TimelinePayload,
  TimelineTrack,
  TimelineTrackKind,
} from '../types/timeline';

/**
 * 时间线版本迁移（v1 → v2 → v3）。
 *
 * v3 变更：
 * - 轨道 ID 规范化为 V1..Vn / A1..An / S1..Sn / O1..On
 *   （历史上并存 `video-1` / `V1` / `track-bgm` / `audio-1` 等三套 ID，
 *   Remotion 合成按 ID 找轨会静默丢轨）
 * - 字幕 / 贴片轨的 kind 从 'video' 修正为 'subtitle' / 'overlay'
 * - durationSec 按轨道内容重算
 *
 * 幂等：version >= 3 原样返回。
 */
export function migrateTimelinePayload(p: TimelinePayload): TimelinePayload {
  if (!p || typeof p !== 'object') return p;
  if (p.version >= 3) return p;

  const v2: TimelinePayload =
    p.version >= 2
      ? p
      : { ...p, version: 2, aspect: '9:16', width: 1080, height: 1920 };

  const tracks = Array.isArray(v2.tracks) ? v2.tracks : [];
  const classified = tracks.map((t) => ({
    track: t,
    kind: classifyTrackKind(t),
    label: deriveTrackLabel(t),
  }));

  const counters: Record<TimelineTrackKind, number> = {
    video: 0,
    audio: 0,
    subtitle: 0,
    overlay: 0,
  };
  const prefix: Record<TimelineTrackKind, string> = {
    video: 'V',
    audio: 'A',
    subtitle: 'S',
    overlay: 'O',
  };

  const migrated: TimelineTrack[] = classified.map(({ track, kind, label }) => {
    counters[kind] += 1;
    return {
      ...track,
      id: `${prefix[kind]}${counters[kind]}`,
      kind,
      ...(label && !track.label ? { label } : {}),
      clips: Array.isArray(track.clips) ? track.clips : [],
    };
  });

  return {
    ...v2,
    version: 3,
    tracks: migrated,
    durationSec: computeTimelineDuration({ ...v2, tracks: migrated }),
  };
}

/** 遗留 ID → 轨道类型（先查表，再按 clips 内容推断） */
function classifyTrackKind(track: TimelineTrack): TimelineTrackKind {
  const id = (track.id ?? '').toLowerCase();
  if (id.startsWith('subtitle')) return 'subtitle';
  if (id === 'video-2') return 'overlay';
  if (track.kind === 'audio' || id.startsWith('audio') || id === 'track-bgm' || /^a\d+$/.test(id)) {
    return 'audio';
  }
  const clips = Array.isArray(track.clips) ? track.clips : [];
  if (clips.length > 0 && clips.every((c) => c.type === 'subtitle')) return 'subtitle';
  if (clips.length > 0 && clips.every((c) => c.type === 'overlay')) return 'overlay';
  if (clips.length > 0 && clips.every((c) => c.type === 'audio')) return 'audio';
  if (track.kind === 'subtitle' || track.kind === 'overlay') return track.kind;
  return 'video';
}

function deriveTrackLabel(track: TimelineTrack): string | undefined {
  if (track.label) return track.label;
  const id = (track.id ?? '').toLowerCase();
  if (id === 'track-bgm') return 'BGM';
  if (id === 'a1' || id === 'audio-1') return '配音';
  if (id === 'audio-2') return '语音';
  if (id.startsWith('subtitle')) return '字幕';
  if (id === 'video-2') return '贴片';
  return undefined;
}

/** 时间线总时长 = 所有片段最大结束点 */
export function computeTimelineDuration(p: Pick<TimelinePayload, 'tracks'>): number {
  let max = 0;
  for (const track of p.tracks ?? []) {
    for (const clip of track.clips ?? []) {
      const end = (clip.startSec ?? 0) + (clip.durationSec ?? 0);
      if (end > max) max = end;
    }
  }
  return Math.round(max * 1000) / 1000;
}
