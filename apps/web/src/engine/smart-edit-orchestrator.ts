import {
  buildTimelineFromShotsV2,
  validateRemotionTimeline,
  buildViralClip,
  buildA1Clip,
  type TimelinePayload,
  type TimelineClip,
  type SmartSuggestion,
} from '@nx9/shared';
import { api } from '../api/client';
import { useWorkspaceDocument } from '../stores/workspace-document';

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
}

function makeId() {
  return `sg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** 漫剧编排：从故事板镜头生成时间线 */
export async function orchestrateDramaTimeline(opts: {
  title?: string;
  aspect?: string;
  approvedOnly?: boolean;
}): Promise<OrchestrateResult> {
  const doc = useWorkspaceDocument.getState();
  const shots = doc.storyboard.shots
    .filter((s) => (opts.approvedOnly ? s.status === 'approved' : true))
    .sort((a, b) => a.index - b.index);

  const timeline = buildTimelineFromShotsV2(shots, opts.title ?? '漫剧成片', {
    aspect: (opts.aspect ?? '9:16') as '9:16' | '16:9' | '1:1',
    subtitleEnabled: true,
    defaultTransition: { kind: 'fade', durationSec: 0.4 },
  });

  const a1Clips: TimelineClip[] = shots
    .filter((s) => s.videoAssetId)
    .map((s) => {
      const dur = s.durationSec || 5;
      return buildA1Clip({
        id: `a1-${s.id}`,
        url: s.videoAssetId!,
        startSec: (s.index - 1) * dur,
        durationSec: dur,
      });
    });
  if (a1Clips.length > 0) {
    timeline.tracks.push({
      id: 'A1',
      kind: 'audio',
      clips: a1Clips,
    });
  }

  const suggestions: SmartSuggestion[] = [];

  const durations = timeline.tracks
    .filter((t) => t.kind === 'video')
    .flatMap((t) => t.clips.map((c) => c.durationSec));
  if (durations.length > 1) {
    const sorted = [...durations].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    for (let i = 0; i < durations.length - 1; i++) {
      if (durations[i] > median * 2) {
        suggestions.push({
          id: makeId(),
          kind: 'trim',
          targetClipIds: [],
          message: `镜 ${i + 1} 时长 ${durations[i]}s 偏长，建议微调`,
          patch: {},
          confidence: 0.5,
        });
      }
    }
  }

  suggestions.push({
    id: makeId(),
    kind: 'transition',
    targetClipIds: [],
    message: '建议 fade 0.4s 用于镜头间过渡',
    patch: {},
    confidence: 0.7,
  });

  const a1Track = timeline.tracks.find((t) => t.id === 'A1' && t.kind === 'audio');
  if (a1Track && a1Track.clips.length > 0) {
    suggestions.push({
      id: makeId(),
      kind: 'ducking',
      targetClipIds: a1Track.clips.map((c) => c.id),
      message: `对白 ${a1Track.clips.length} 段，建议 BGM ducking -6dB 避免压盖人声`,
      patch: { ducking: { threshold: -18, reduction: -6, attackMs: 50, releaseMs: 200 } },
      confidence: 0.65,
    });
  }

  return { timeline, suggestions };
}

/** 爆款编排：从上游 clips 顺序拼轨 */
export async function orchestrateViralTimeline(opts: {
  clips: string[];
  templateId?: string;
  aspect?: string;
  targetDurationSec?: number;
}): Promise<OrchestrateResult> {
  const clips = opts.clips.filter(Boolean);
  const suggestions: SmartSuggestion[] = [];

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

  const timeline: TimelinePayload = {
    version: 2,
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
        clips: videoClips.map((c) => ({
          ...c,
          transitionOut: { kind: 'fade' as const, durationSec: 0.25 },
        })),
      },
    ],
    renderPreset: 'hyperframes-vertical',
  };

  suggestions.push({
    id: makeId(),
    kind: 'transition',
    targetClipIds: [],
    message: `已设置 fade 0.25s 默认转场，共 ${clips.length} 段`,
    patch: {},
    confidence: 1,
  });

  if (clips.length > 0) {
    try {
      const refResult: AnalyzeReferenceResult = await api.analyzeReferenceVideo({
        videoUrl: clips[0],
        targetShotCount: Math.min(clips.length, 12),
      });
      if (refResult.ok && refResult.shots && refResult.shots.length > 1) {
        const beatCutSgs: SmartSuggestion[] = refResult.shots
          .filter((s) => s.durationSec && s.durationSec > 0)
          .map((s) => ({
            id: makeId(),
            kind: 'beat-cut' as const,
            targetClipIds: [`clip-${s.id.slice(-8)}`].filter(() => true),
            message: `参考节奏：${s.description || s.shotType || '镜'} ${(s.durationSec ?? 0).toFixed(1)}s${s.index ? ` (#${s.index})` : ''}`,
            patch: { beatCut: { shotIndex: s.index, durationSec: s.durationSec } },
            confidence: 0.6,
          }));
        suggestions.push(...beatCutSgs);
      }
    } catch {
      /* analyze-reference 不可用时静默降级 */
    }
  }

  const hfVars: Record<string, string> = {};
  clips.forEach((url, i) => {
    hfVars[`clip_url_${i}`] = url;
    hfVars[`clip_id_${i}`] = `clip-${url.slice(-8)}`;
  });
  hfVars['clip_count'] = String(clips.length);
  hfVars['total_duration_sec'] = String(fullDur.toFixed(1));
  suggestions.push({
    id: makeId(),
    kind: 'template-patch',
    targetClipIds: videoClips.map((c) => c.id),
    message: `HF 模板变量已注入（${Object.keys(hfVars).length} 项）`,
    patch: { templateVars: hfVars as unknown as Record<string, unknown> },
    confidence: 0.8,
  });

  return { timeline, suggestions };
}

export function validateTimeline(timeline: TimelinePayload | undefined | null): { ok: boolean; warnings: string[] } {
  if (!timeline) return { ok: false, warnings: ['无时间线'] };
  return validateRemotionTimeline(timeline);
}
