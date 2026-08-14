import {
  buildTimelineFromShotsV2,
  validateRemotionTimeline,
  buildViralClip,
  calibrateTimelineWithDurations,
  listTimelineMediaUrls,
  nextTrackId,
  type TimelinePayload,
  type TimelineClip,
  type TimelineOp,
  type SmartSuggestion,
} from '@nx9/shared';
import { api } from '../api/client';

interface AnalyzeReferenceResult {
  ok: boolean;
  markdown: string;
  shots: Array<{
    id: string;
    index: number;
    durationSec?: number;
    description?: string;
    shotType?: string;
  }>;
  message?: string;
}

export type { SmartSuggestion };

export interface OrchestrateResult {
  timeline: TimelinePayload;
  suggestions: SmartSuggestion[];
  /** 编排诚实提示（如未做参考分析 / 模板变量说明），显示在台内结果条 */
  notes: string[];
}

function makeId() {
  return `sg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * probe 校准：用 FFmpeg 真实时长回写 sourceDurationSec，
 * 估算超长的片段收短并 ripple（修 D4：时间轴刻度失真）。
 * probe 不可用时静默返回原时间线。
 */
export async function calibrateTimeline(timeline: TimelinePayload): Promise<TimelinePayload> {
  const urls = listTimelineMediaUrls(timeline).slice(0, 64);
  if (urls.length === 0) return timeline;
  const durations: Record<string, number> = {};
  await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await api.probeMediaDuration(url);
        if (res.ok && res.durationSec > 0) durations[url] = res.durationSec;
      } catch {
        /* 单个素材 probe 失败不阻塞编排 */
      }
    }),
  );
  if (Object.keys(durations).length === 0) return timeline;
  return calibrateTimelineWithDurations(timeline, durations);
}

/** 时长离群建议：明显长于中位数的镜头给出可执行的收短 op */
function buildTrimSuggestions(timeline: TimelinePayload): SmartSuggestion[] {
  const videoClips = timeline.tracks
    .filter((t) => t.kind === 'video')
    .flatMap((t) => t.clips);
  if (videoClips.length < 3) return [];
  const durations = videoClips.map((c) => c.durationSec);
  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const out: SmartSuggestion[] = [];
  for (const clip of videoClips) {
    if (clip.durationSec > median * 2 && median > 0) {
      const target = Math.round(median * 1.5 * 10) / 10;
      out.push({
        id: makeId(),
        kind: 'trim',
        targetClipIds: [clip.id],
        message: `「${clip.label}」${clip.durationSec}s 明显偏长（中位 ${median}s），建议收短到 ${target}s`,
        ops: [
          {
            op: 'trim-clip',
            clipId: clip.id,
            edge: 'end',
            deltaSec: target - clip.durationSec,
          },
        ],
        confidence: 0.55,
      });
    }
  }
  return out;
}

/** 转场建议：视频轨衔接处统一 fade */
function buildTransitionSuggestion(
  timeline: TimelinePayload,
  durationSec: number,
): SmartSuggestion | null {
  const boundaries = timeline.tracks
    .filter((t) => t.kind === 'video')
    .reduce((n, t) => n + Math.max(0, t.clips.length - 1), 0);
  if (boundaries === 0) return null;
  return {
    id: makeId(),
    kind: 'transition',
    targetClipIds: [],
    message: `为 ${boundaries} 处镜头衔接统一设置 fade ${durationSec}s 转场`,
    ops: [{ op: 'set-transition', transition: { kind: 'fade', durationSec } }],
    confidence: 0.7,
  };
}

/** ducking 建议：有对白轨时压低 BGM 轨音量 */
function buildDuckingSuggestion(timeline: TimelinePayload): SmartSuggestion | null {
  const audioTracks = timeline.tracks.filter((t) => t.kind === 'audio');
  const bgm = audioTracks.find((t) => t.label === 'BGM');
  const dialogue = audioTracks.find((t) => t !== bgm && t.clips.length > 0);
  if (!bgm || !dialogue) return null;
  return {
    id: makeId(),
    kind: 'ducking',
    targetClipIds: bgm.clips.map((c) => c.id),
    message: `检测到 ${dialogue.clips.length} 段对白，建议 BGM 音量压至 40% 避免压盖人声`,
    ops: [{ op: 'duck-audio', trackId: bgm.id, volume: 0.4 }],
    confidence: 0.65,
  };
}

/** 漫剧编排：只使用调用方传入的镜头（节点实例级，不读全局故事板） */
export async function orchestrateDramaTimeline(opts: {
  title?: string;
  aspect?: string;
  approvedOnly?: boolean;
  /** 本节点连入的镜头；必填。空数组则生成空时间线。 */
  shots: Array<{
    id: string;
    index: number;
    status?: string;
    durationSec?: number;
    videoAssetId?: string | null;
    videoStatus?: string;
    firstFrameAssetId?: string | null;
    audioAssetId?: string | null;
    descriptionZh?: string;
    subtitleText?: string | null;
  }>;
  /** F-014: 上游 sound-gen 生成的 BGM URL */
  bgmUrl?: string;
}): Promise<OrchestrateResult> {
  const shots = [...opts.shots]
    .filter((s) => (opts.approvedOnly ? s.videoStatus === 'approved' : true))
    .sort((a, b) => a.index - b.index)
    .map((s) => ({
      id: s.id,
      index: s.index,
      status: s.status,
      durationSec: s.durationSec ?? 4,
      descriptionZh: s.descriptionZh ?? '',
      videoAssetId: s.videoAssetId,
      videoStatus: s.videoStatus,
      firstFrameAssetId: s.firstFrameAssetId,
      audioAssetId: s.audioAssetId,
      subtitleText: s.subtitleText,
    }));

  let timeline: TimelinePayload = buildTimelineFromShotsV2(shots, opts.title ?? '漫剧成片', {
    aspect: (opts.aspect ?? '9:16') as '9:16' | '16:9' | '1:1',
    subtitleEnabled: true,
    defaultTransition: { kind: 'fade', durationSec: 0.4 },
  });
  // 注：视频片段自带音轨由合成层播放，不再把 videoAssetId 复制成独立音轨
  // （v3 合成按 kind 遍历，复制会导致声音翻倍）

  // F-014: 上游 sound-gen BGM 注入；若已有独立对白音轨则默认 duck
  if (opts.bgmUrl) {
    const bgmDur = timeline.durationSec > 0 ? timeline.durationSec : 60;
    const hasDialogueAudio = timeline.tracks.some(
      (t) => t.kind === 'audio' && t.label !== 'BGM' && t.clips.length > 0,
    );
    timeline = {
      ...timeline,
      tracks: [
        ...timeline.tracks,
        {
          id: nextTrackId(timeline.tracks, 'audio'),
          kind: 'audio' as const,
          label: 'BGM',
          clips: [
            {
              id: 'bgm-1',
              type: 'audio' as const,
              assetUrl: opts.bgmUrl,
              startSec: 0,
              durationSec: bgmDur,
              label: 'BGM',
              volume: hasDialogueAudio ? 0.4 : 1,
            },
          ],
        },
      ],
    };
  }

  // D4: probe 真实时长校准
  timeline = await calibrateTimeline(timeline);

  const suggestions: SmartSuggestion[] = [];
  suggestions.push(...buildTrimSuggestions(timeline));
  const transition = buildTransitionSuggestion(timeline, 0.4);
  if (transition) suggestions.push(transition);
  const ducking = buildDuckingSuggestion(timeline);
  if (ducking) suggestions.push(ducking);

  return { timeline, suggestions, notes: [] };
}

/** 爆款编排：从上游 clips 顺序拼轨 */
export async function orchestrateViralTimeline(opts: {
  clips: string[];
  templateId?: string;
  aspect?: string;
  targetDurationSec?: number;
  /** F-014: 上游 sound-gen 生成的 BGM URL */
  bgmUrl?: string;
}): Promise<OrchestrateResult> {
  const clips = opts.clips.filter(Boolean);
  const suggestions: SmartSuggestion[] = [];
  const notes: string[] = [];

  let startSec = 0;
  const videoClips: TimelineClip[] = [];
  for (const url of clips) {
    const dur = opts.targetDurationSec
      ? opts.targetDurationSec / Math.max(clips.length, 1)
      : 3;
    const ci = buildViralClip({
      id: `clip-${url.slice(-8)}`,
      url,
      startSec,
      durationSec: dur,
    });
    videoClips.push(ci);
    startSec += ci.durationSec;
  }
  const fullDur = startSec;

  let timeline: TimelinePayload = {
    version: 3,
    title: '爆款复刻',
    durationSec: fullDur,
    fps: 30,
    aspect: (opts.aspect ?? '9:16') as '9:16' | '16:9' | '1:1',
    width: 720,
    height: 1280,
    tracks: [
      {
        id: 'V1',
        kind: 'video',
        label: '视频',
        clips: videoClips.map((c) => ({
          ...c,
          transitionOut: { kind: 'fade' as const, durationSec: 0.25 },
        })),
      },
    ],
    renderPreset: 'hyperframes-vertical',
  };

  // F-014: 上游 sound-gen BGM 注入
  if (opts.bgmUrl) {
    timeline.tracks.push({
      id: nextTrackId(timeline.tracks, 'audio'),
      kind: 'audio',
      label: 'BGM',
      clips: [{
        id: 'bgm-1',
        type: 'audio',
        assetUrl: opts.bgmUrl,
        startSec: 0,
        durationSec: fullDur > 0 ? fullDur : 60,
        label: 'BGM',
      }],
    });
  }

  // D4: probe 真实时长校准（爆款素材时长全靠估，校准价值最大）
  timeline = await calibrateTimeline(timeline);


  if (clips.length > 0) {
    try {
      const refResult: AnalyzeReferenceResult = await api.analyzeReferenceVideo({
        videoUrl: clips[0],
        targetShotCount: Math.min(clips.length, 12),
      });
      if (refResult.ok && refResult.shots && refResult.shots.length > 1) {
        const videoTrack = timeline.tracks.find((t) => t.kind === 'video');
        const beatCutSgs: SmartSuggestion[] = refResult.shots
          .filter((s) => s.durationSec && s.durationSec > 0)
          .map((s, i) => {
            const target = videoTrack?.clips[i];
            const ops: TimelineOp[] =
              target && s.durationSec
                ? [
                    {
                      op: 'trim-clip',
                      clipId: target.id,
                      edge: 'end',
                      deltaSec: s.durationSec - target.durationSec,
                    },
                  ]
                : [];
            return {
              id: makeId(),
              kind: 'beat-cut' as const,
              targetClipIds: target ? [target.id] : [],
              message: `参考节奏：${s.description || s.shotType || '镜'} ${(s.durationSec ?? 0).toFixed(1)}s${target ? ` → 应用到「${target.label}」` : ''}`,
              ops,
              confidence: 0.6,
              meta: {
                algorithm: 'reference-shot-durations' as const,
                source: 'analyze-reference',
                audioAnalyzed: false,
              },
            };
          });
        suggestions.push(...beatCutSgs);
      }
    } catch {
    }
  }

  if (clips.length > 0) {
    notes.push(
      suggestions.some((s) => s.kind === 'beat-cut')
        ? '参考节奏：已按参考视频镜头分析生成 beat-cut 建议（algorithm: reference-shot-durations，未做音频听感）。'
        : '未做音频听感/未分析参考：本次未生成 beat-cut 建议，时间线按等分时长编排。',
    );
  }

  notes.push('HF 模板变量无需注入：HyperFrames 直接消费时间线片段，无独立 templateVars 通道。');

  return { timeline, suggestions, notes };
}

export function validateTimeline(timeline: TimelinePayload | undefined | null): { ok: boolean; warnings: string[] } {
  if (!timeline) return { ok: false, warnings: ['无时间线'] };
  return validateRemotionTimeline(timeline);
}
