/**
 * voice-drama-orchestrator.ts — 声音剧编排器（F-034 / SF-04～05 / SF-16～20）。
 *
 * 分镜/剧本对白 → 批量配音 → 时间线自动挂音轨（含字幕同源）。
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

/** 无实测时长时按字数粗估（中文约 4 字/秒） */
export function estimateVoiceDurationSec(text: string, fallback = 3): number {
  const t = text.trim();
  if (!t) return fallback;
  return Math.max(0.8, Math.min(30, Math.round((t.length / 4) * 10) / 10));
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

export interface BuildVoiceDramaOptions {
  bgmUrl?: string;
  /** SF-19：音效 URL 列表，挂到「音效」轨起点 */
  sfxUrls?: string[];
  /** SF-20：是否从 voice.lines 生成字幕轨（默认 true） */
  subtitleFromLines?: boolean;
}

/**
 * 构建带 VO 音轨的时间线。
 * - SF-04：按视频轨同 shotId 对齐起点
 * - SF-16：时长优先 TTS 实长 / 字数估算，其次镜长
 * - SF-17：同镜多句按顺序累加 startSec，不叠放
 * - SF-20：可选从对白文本生成字幕轨（与 VO 同源时间）
 */
export function buildVoiceDramaTimeline(
  baseTimeline: TimelinePayload,
  voiceLines: VoiceLine[],
  bgmUrlOrOpts?: string | BuildVoiceDramaOptions,
): TimelinePayload {
  const opts: BuildVoiceDramaOptions =
    typeof bgmUrlOrOpts === 'string'
      ? { bgmUrl: bgmUrlOrOpts }
      : bgmUrlOrOpts ?? {};
  const bgmUrl = opts.bgmUrl;
  const sfxUrls = opts.sfxUrls ?? [];
  const subtitleFromLines = opts.subtitleFromLines !== false;

  const tracks: TimelineTrack[] = [...baseTimeline.tracks];
  const videoClips =
    baseTimeline.tracks.find((t) => t.kind === 'video')?.clips ?? [];
  const byShot = new Map(videoClips.filter((c) => c.shotId).map((c) => [c.shotId!, c]));
  let fallbackSec = 0;
  /** 同镜内下一句起点（绝对时间） */
  const shotCursor = new Map<string, number>();

  const readyLines = voiceLines.filter((l) => l.audioAssetId && l.shotId);

  const voClips: TimelineClip[] = readyLines.map((l) => {
    const shotClip = byShot.get(l.shotId!);
    const audioDur =
      typeof l.durationSec === 'number' && l.durationSec > 0
        ? l.durationSec
        : estimateVoiceDurationSec(l.text, shotClip?.durationSec ?? 3);

    let startSec: number;
    if (shotClip) {
      const cursor = shotCursor.get(l.shotId!) ?? shotClip.startSec;
      startSec = cursor;
      shotCursor.set(l.shotId!, cursor + audioDur);
    } else {
      startSec = fallbackSec;
      fallbackSec += audioDur;
    }

    return {
      id: `vo-${l.id}`,
      type: 'audio' as const,
      assetUrl: l.audioAssetId!,
      startSec,
      durationSec: audioDur,
      label: l.speaker || 'VO',
      shotId: l.shotId ?? undefined,
      soundAssetId: l.soundAssetId ?? undefined,
    };
  });

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

  // SF-20: 对白字幕与 VO 同源时间（有配音时覆盖镜述字幕，避免双份）
  if (subtitleFromLines && readyLines.length > 0) {
    const subClips: TimelineClip[] = voClips.map((vo, i) => {
      const line = readyLines[i]!;
      return {
        id: `sub-vo-${line.id}`,
        type: 'subtitle' as const,
        assetUrl: '',
        startSec: vo.startSec,
        durationSec: vo.durationSec,
        text: line.text,
        label: line.speaker || '字幕',
        shotId: line.shotId ?? undefined,
      };
    });
    const existingSubIdx = tracks.findIndex((t) => t.kind === 'subtitle');
    if (existingSubIdx >= 0) {
      tracks[existingSubIdx] = {
        ...tracks[existingSubIdx]!,
        label: '字幕',
        clips: subClips,
      };
    } else {
      tracks.push({
        id: 'S1',
        kind: 'subtitle',
        label: '字幕',
        clips: subClips,
      });
    }
  }

  // SF-19: 音效轨
  if (sfxUrls.length > 0) {
    const sfxDur = baseTimeline.durationSec ?? 60;
    tracks.push({
      id: nextTrackId(tracks, 'audio'),
      kind: 'audio',
      label: '音效',
      clips: sfxUrls.map((url, i) => ({
        id: `sfx-${i + 1}`,
        type: 'audio' as const,
        assetUrl: url,
        startSec: 0,
        durationSec: sfxDur,
        label: `音效 ${i + 1}`,
        volume: 0.8,
      })),
    });
  }

  // BGM 轨（有对白时自动 duck 到 40%）
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
