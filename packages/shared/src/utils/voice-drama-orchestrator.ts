/**
 * voice-drama-orchestrator.ts — 声音剧编排器（F-034）。
 *
 * 分镜/剧本对白 → 批量配音 → 时间线自动挂音轨。
 */
import type { StoryboardShot, VoiceLine } from '../types/storyboard';
import type { TimelinePayload, TimelineTrack, TimelineClip } from '../types/timeline';

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
    }));

  if (voClips.length > 0) {
    tracks.push({
      id: 'track-vo',
      kind: 'audio',
      clips: voClips,
    });
  }

  // 添加 BGM 轨
  if (bgmUrl) {
    tracks.push({
      id: 'track-bgm',
      kind: 'audio',
      clips: [{
        id: 'bgm-1',
        type: 'audio',
        assetUrl: bgmUrl,
        startSec: 0,
        durationSec: baseTimeline.durationSec ?? 60,
        label: 'BGM',
      }],
    });
  }

  return { ...baseTimeline, tracks };
}
