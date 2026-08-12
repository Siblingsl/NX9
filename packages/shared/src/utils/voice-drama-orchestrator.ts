/**
 * voice-drama-orchestrator.ts — 声音剧编排器（F-034）。
 *
 * 分镜/剧本对白 → 批量配音 → 时间线自动挂音轨。
 */
import type { StoryboardShot, VoiceLine } from '../types/storyboard';
import type { TimelinePayload, TimelineTrack, TimelineClip } from '../types/timeline';
import { nextTrackId } from './timeline-ops';

export interface VoiceDramaConfig {
  /** 对白行 → 配音 */
  lines: Array<{ shotId: string; text: string; speaker: string }>;
  /** BGM 音频 URL（可选） */
  bgmUrl?: string;
  /** BGM 音量 0-1 */
  bgmVolume?: number;
}

/**
 * 将对白行映射到 shot。
 */
export function mapVoiceLinesToShots(
  shots: StoryboardShot[],
  lines: VoiceLine[],
): Map<string, VoiceLine[]> {
  const map = new Map<string, VoiceLine[]>();
  for (const line of lines) {
    if (!line.shotId) continue;
    const existing = map.get(line.shotId) ?? [];
    existing.push(line);
    map.set(line.shotId, existing);
  }
  return map;
}

/**
 * 构建带 VO 音轨的时间线。
 */
export function buildVoiceDramaTimeline(
  baseTimeline: TimelinePayload,
  voiceLines: VoiceLine[],
  bgmUrl?: string,
): TimelinePayload {
  const tracks: TimelineTrack[] = [...baseTimeline.tracks];

  // 添加 VO 音轨
  const voClips: TimelineClip[] = voiceLines
    .filter((l) => l.audioAssetId && l.shotId)
    .map((l) => ({
      id: `vo-${l.id}`,
      type: 'audio',
      assetUrl: l.audioAssetId!,
      startSec: 0,
      durationSec: 3,
      label: l.speaker || 'VO',
      shotId: l.shotId ?? undefined,
      soundAssetId: l.soundAssetId ?? undefined,
    }));

  if (voClips.length > 0) {
    tracks.push({
      id: nextTrackId(tracks, 'audio'),
      kind: 'audio',
      label: '对白',
      clips: voClips,
    });
    // 已有 BGM 轨时自动压低，避免盖过人声
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]!;
      if (track.kind !== 'audio' || track.label !== 'BGM') continue;
      tracks[i] = {
        ...track,
        clips: track.clips.map((clip) => ({
          ...clip,
          volume: clip.volume != null ? Math.min(clip.volume, 0.4) : 0.4,
        })),
      };
    }
  }

  // 添加 BGM 轨（有对白时自动 duck 到 40%，薄加深）
  if (bgmUrl) {
    tracks.push({
      id: nextTrackId(tracks, 'audio'),
      kind: 'audio',
      label: 'BGM',
      clips: [{
        id: 'bgm-1',
        type: 'audio',
        assetUrl: bgmUrl,
        startSec: 0,
        durationSec: baseTimeline.durationSec ?? 60,
        label: 'BGM',
        volume: voClips.length > 0 ? 0.4 : 1,
      }],
    });
  }

  return { ...baseTimeline, tracks };
}
