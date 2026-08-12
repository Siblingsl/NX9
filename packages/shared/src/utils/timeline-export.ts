import type { TimelineClip, TimelineTrack, TimelinePayload, TimelineAspect, TimelineTransition } from '../types/timeline';

export interface TimelineBuildWarnings {
  warnings: string[];
}

export interface TranscribeCue {
  startSec: number;
  endSec: number;
  text: string;
}

/** 原始镜头数据类型 */
export interface ShotInput {
  id: string;
  index: number;
  durationSec: number;
  descriptionZh: string;
  videoAssetId?: string | null;
  audioAssetId?: string | null;
  firstFrameAssetId?: string | null;
  /** overlay 素材（logo/片头/lower-third） */
  overlayAssetId?: string | null;
  /** 配音文本 */
  voiceLineText?: string | null;
  /** subtitle-burn 节点输出的字幕文本 */
  subtitleText?: string | null;
  /** 审阅状态（用于 approvedOnly 过滤） */
  status?: 'draft' | 'generating' | 'review' | 'approved' | 'failed' | string;
}

export function buildTimelineFromShots(
  shots: ShotInput[],
  title = 'NX9 Timeline',
): TimelinePayload {
  const sorted = [...shots].sort((a, b) => a.index - b.index);
  let offset = 0;
  const videoClips: TimelineClip[] = [];
  const audioClips: TimelineClip[] = [];
  const voiceClips: TimelineClip[] = [];
  const subtitleClips: TimelineClip[] = [];
  const overlayClips: TimelineClip[] = [];
  const warnings: string[] = [];

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
    } else {
      warnings.push(`镜 #${shot.index} 无视频素材`);
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
    if (shot.voiceLineText) {
      voiceClips.push({
        id: `vl-${shot.id}`,
        shotId: shot.id,
        label: `语音 #${shot.index}`,
        startSec: offset,
        durationSec: dur,
        assetUrl: '',
        type: 'audio',
        text: shot.voiceLineText,
      });
    }
    const subtitleText = shot.subtitleText || shot.descriptionZh || '';
    if (subtitleText) {
      subtitleClips.push({
        id: `s-${shot.id}`,
        shotId: shot.id,
        label: `字幕 #${shot.index}`,
        startSec: offset,
        durationSec: dur,
        assetUrl: '',
        type: 'subtitle',
        text: subtitleText,
      });
    }
    if (shot.overlayAssetId) {
      overlayClips.push({
        id: `o-${shot.id}`,
        shotId: shot.id,
        label: `Overlay #${shot.index}`,
        startSec: offset,
        durationSec: dur,
        assetUrl: shot.overlayAssetId,
        type: 'overlay',
      });
    }
    offset += dur;
  }

  // v3 规范轨道：V/A/S/O 前缀 ID + 语义 kind
  const tracks: TimelineTrack[] = [];
  if (videoClips.length) tracks.push({ id: 'V1', kind: 'video', label: '视频', clips: videoClips });
  if (overlayClips.length) tracks.push({ id: 'O1', kind: 'overlay', label: '贴片', clips: overlayClips });
  if (audioClips.length) tracks.push({ id: 'A1', kind: 'audio', label: '配音', clips: audioClips });
  if (voiceClips.length) tracks.push({ id: 'A2', kind: 'audio', label: '语音', clips: voiceClips });
  if (subtitleClips.length) tracks.push({ id: 'S1', kind: 'subtitle', label: '字幕', clips: subtitleClips });

  return {
    version: 3,
    title,
    fps: 30,
    durationSec: offset,
    aspect: '9:16',
    width: 1080,
    height: 1920,
    tracks,
  };
}

export function buildTimelineFromShotsV2(
  shots: ShotInput[],
  title?: string,
  opts?: {
    aspect?: TimelineAspect;
    approvedOnly?: boolean;
    defaultTransition?: TimelineTransition;
    /** Whisper SRT cues 转字幕轨 */
    transcribeCues?: TranscribeCue[];
    /** 是否启用字幕轨（默认 true） */
    subtitleEnabled?: boolean;
  },
): TimelinePayload & TimelineBuildWarnings {
  const warnings: string[] = [];
  const {
    aspect = '9:16',
    approvedOnly,
    defaultTransition,
    transcribeCues,
    subtitleEnabled = true,
  } = opts ?? {};

  let filtered = [...shots].sort((a, b) => a.index - b.index);
  if (approvedOnly) {
    filtered = filtered.filter((s) => s.status === 'approved');
  }

  const result = buildTimelineFromShots(filtered, title);

  // 追加 transcribe cues 到字幕轨
  if (transcribeCues && transcribeCues.length > 0 && subtitleEnabled) {
    const existing = result.tracks.find((t) => t.kind === 'subtitle');
    const cueClips: TimelineClip[] = transcribeCues.map((cue, i) => ({
      id: `tc-${i}`,
      label: `字幕 ${i + 1}`,
      startSec: cue.startSec,
      durationSec: cue.endSec - cue.startSec,
      assetUrl: '',
      type: 'subtitle' as const,
      text: cue.text,
    }));
    if (existing) {
      existing.clips.push(...cueClips);
    } else {
      result.tracks.push({ id: 'S1', kind: 'subtitle', label: '字幕', clips: cueClips });
    }
  }

  // 默认转场（仅视频轨衔接处）
  const applyDefaultTransition = (transition: TimelineTransition) => {
    for (const track of result.tracks) {
      if (track.kind !== 'video') continue;
      for (let i = 0; i < track.clips.length - 1; i++) {
        track.clips[i].transitionOut = transition;
      }
    }
  };
  if (defaultTransition) {
    applyDefaultTransition(defaultTransition);
  } else if (result.renderPreset === 'hyperframes-vertical') {
    applyDefaultTransition({ kind: 'fade', durationSec: 0.3 });
  }

  return {
    ...result,
    aspect,
    width: aspect === '9:16' ? 1080 : aspect === '1:1' ? 1080 : 1920,
    height: aspect === '9:16' ? 1920 : aspect === '1:1' ? 1080 : 1080,
    warnings,
  };
}
