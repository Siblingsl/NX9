import type {
  TimelineClip,
  TimelinePayload,
  TimelineTrack,
  TimelineTransition,
} from '../types/timeline';
import { computeTimelineDuration } from './timeline-migrate';
import {
  clampClipVolume,
  removeVolumeKeyframe,
  splitVolumeKeyframes,
  upsertVolumeKeyframe,
} from './timeline-volume';

/** 片段最小时长（秒） */
export const MIN_CLIP_SEC = 0.1;

/**
 * 时间线结构化操作。
 * 编辑器交互与智能建议（SmartSuggestion.ops）共用同一套 op，
 * 由 applyTimelineOp 统一执行（不可变更新），天然可进撤销栈。
 */
export type TimelineOp =
  /** 设置转场：clipId 缺省 = 视频轨所有相邻衔接处 */
  | { op: 'set-transition'; clipId?: string; transition: TimelineTransition | null }
  /** 片段属性补丁（volume/fade/speed/text/style/label…，位置与时长字段请走专用 op） */
  | { op: 'set-clip'; clipId: string; patch: Partial<TimelineClip> }
  /** 拖移片段（可跨同类轨道） */
  | { op: 'move-clip'; clipId: string; startSec: number; toTrackId?: string }
  /** 拖边缘裁剪：edge=start 动入点，edge=end 动出点；deltaSec 为时间线秒 */
  | { op: 'trim-clip'; clipId: string; edge: 'start' | 'end'; deltaSec: number }
  /** 播放头处分割（atSec 为时间线秒，需落在片段内部） */
  | { op: 'split-clip'; clipId: string; atSec: number; newClipId?: string }
  /** 删除片段；ripple = 同轨后续片段左移补洞 */
  | { op: 'remove-clip'; clipId: string; ripple?: boolean }
  /** 添加片段到轨道；atEnd = 忽略 clip.startSec，接到轨尾 */
  | { op: 'add-clip'; trackId: string; clip: TimelineClip; atEnd?: boolean }
  /** 添加轨道 */
  | { op: 'add-track'; track: TimelineTrack }
  /** 轨道属性（label/muted/locked） */
  | { op: 'set-track'; trackId: string; patch: Partial<Pick<TimelineTrack, 'label' | 'muted' | 'locked'>> }
  /** 音频压低（ducking 简化实现：整轨音量） */
  | { op: 'duck-audio'; trackId: string; volume: number }
  /** 人工精剪：在片段相对时间打/改音量关键帧 */
  | { op: 'set-volume-keyframe'; clipId: string; atSec: number; volume: number }
  | { op: 'remove-volume-keyframe'; clipId: string; atSec: number }
  /** 智能替换回写：换素材并记录溯源 */
  | { op: 'replace-clip-asset'; clipId: string; assetUrl: string; replacedFrom?: string; takeId?: string };

export interface ClipLocation {
  track: TimelineTrack;
  trackIndex: number;
  clip: TimelineClip;
  clipIndex: number;
}

export function findTimelineClip(timeline: TimelinePayload, clipId: string): ClipLocation | null {
  for (let ti = 0; ti < timeline.tracks.length; ti++) {
    const track = timeline.tracks[ti];
    const ci = track.clips.findIndex((c) => c.id === clipId);
    if (ci >= 0) return { track, trackIndex: ti, clip: track.clips[ci], clipIndex: ci };
  }
  return null;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function withDuration(timeline: TimelinePayload): TimelinePayload {
  return { ...timeline, durationSec: computeTimelineDuration(timeline) };
}

function replaceClip(
  timeline: TimelinePayload,
  clipId: string,
  fn: (clip: TimelineClip, track: TimelineTrack) => TimelineClip | null,
): TimelinePayload {
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => {
      if (!track.clips.some((c) => c.id === clipId)) return track;
      const clips = track.clips
        .map((c) => (c.id === clipId ? fn(c, track) : c))
        .filter((c): c is TimelineClip => c !== null)
        .sort((a, b) => a.startSec - b.startSec);
      return { ...track, clips };
    }),
  };
}

/** 片段消耗的素材长度上限（考虑 trimIn 与变速） */
function maxDurationBySource(clip: TimelineClip): number {
  if (clip.sourceDurationSec == null) return Number.POSITIVE_INFINITY;
  if (clip.type !== 'video' && clip.type !== 'audio') return Number.POSITIVE_INFINITY;
  const speed = clip.speed ?? 1;
  const remain = clip.sourceDurationSec - (clip.trimInSec ?? 0);
  return Math.max(MIN_CLIP_SEC, remain / speed);
}

export function applyTimelineOp(timeline: TimelinePayload, op: TimelineOp): TimelinePayload {
  switch (op.op) {
    case 'set-transition': {
      if (op.clipId) {
        return withDuration(
          replaceClip(timeline, op.clipId, (c) => ({
            ...c,
            transitionOut: op.transition ?? undefined,
          })),
        );
      }
      return withDuration({
        ...timeline,
        tracks: timeline.tracks.map((track) => {
          if (track.kind !== 'video') return track;
          return {
            ...track,
            clips: track.clips.map((c, i) =>
              i < track.clips.length - 1
                ? { ...c, transitionOut: op.transition ?? undefined }
                : c,
            ),
          };
        }),
      });
    }

    case 'set-clip': {
      // 位置/时长交由专用 op 处理，防止绕过 clamp
      const {
        startSec: _s,
        durationSec: _d,
        id: _id,
        ...safePatch
      } = op.patch;
      return withDuration(replaceClip(timeline, op.clipId, (c) => ({ ...c, ...safePatch })));
    }

    case 'move-clip': {
      const loc = findTimelineClip(timeline, op.clipId);
      if (!loc) return timeline;
      const startSec = round3(Math.max(0, op.startSec));
      if (!op.toTrackId || op.toTrackId === loc.track.id) {
        return withDuration(replaceClip(timeline, op.clipId, (c) => ({ ...c, startSec })));
      }
      const target = timeline.tracks.find((t) => t.id === op.toTrackId);
      if (!target || target.kind !== loc.track.kind || target.locked) return timeline;
      const moved = { ...loc.clip, startSec };
      return withDuration({
        ...timeline,
        tracks: timeline.tracks.map((track) => {
          if (track.id === loc.track.id) {
            return { ...track, clips: track.clips.filter((c) => c.id !== op.clipId) };
          }
          if (track.id === op.toTrackId) {
            return {
              ...track,
              clips: [...track.clips, moved].sort((a, b) => a.startSec - b.startSec),
            };
          }
          return track;
        }),
      });
    }

    case 'trim-clip': {
      const loc = findTimelineClip(timeline, op.clipId);
      if (!loc) return timeline;
      const clip = loc.clip;
      const speed = clip.speed ?? 1;
      const maxDur = maxDurationBySource(clip);

      if (op.edge === 'start') {
        // 左边缘：delta>0 向右收（掐头），delta<0 向左放
        let delta = op.deltaSec;
        // 不越过右边缘
        delta = Math.min(delta, clip.durationSec - MIN_CLIP_SEC);
        // 入点不为负、不早于 0 时刻
        const minDelta = Math.max(
          -(clip.trimInSec ?? 0) / speed,
          -clip.startSec,
        );
        delta = Math.max(delta, minDelta);
        if (delta === 0) return timeline;
        return withDuration(
          replaceClip(timeline, op.clipId, (c) => ({
            ...c,
            startSec: round3(c.startSec + delta),
            durationSec: round3(c.durationSec - delta),
            trimInSec: round3((c.trimInSec ?? 0) + delta * speed),
          })),
        );
      }

      // 右边缘：delta>0 向右放，delta<0 收尾
      let newDur = clip.durationSec + op.deltaSec;
      newDur = Math.max(MIN_CLIP_SEC, Math.min(newDur, maxDur));
      if (newDur === clip.durationSec) return timeline;
      return withDuration(
        replaceClip(timeline, op.clipId, (c) => ({ ...c, durationSec: round3(newDur) })),
      );
    }

    case 'split-clip': {
      const loc = findTimelineClip(timeline, op.clipId);
      if (!loc) return timeline;
      const clip = loc.clip;
      const rel = op.atSec - clip.startSec;
      if (rel < MIN_CLIP_SEC || rel > clip.durationSec - MIN_CLIP_SEC) return timeline;
      const speed = clip.speed ?? 1;
      const rightId = op.newClipId ?? makeSplitClipId(timeline, clip.id);
      const splitKeys = splitVolumeKeyframes(clip.volumeKeyframes, rel);
      const left: TimelineClip = {
        ...clip,
        durationSec: round3(rel),
        transitionOut: undefined,
        volumeKeyframes: splitKeys.left,
      };
      const right: TimelineClip = {
        ...clip,
        id: rightId,
        startSec: round3(clip.startSec + rel),
        durationSec: round3(clip.durationSec - rel),
        trimInSec: round3((clip.trimInSec ?? 0) + rel * speed),
        fadeInSec: undefined,
        volumeKeyframes: splitKeys.right,
      };
      // 左半段不再淡出
      left.fadeOutSec = undefined;
      return withDuration({
        ...timeline,
        tracks: timeline.tracks.map((track) => {
          if (track.id !== loc.track.id) return track;
          const clips = [...track.clips];
          clips.splice(loc.clipIndex, 1, left, right);
          return { ...track, clips };
        }),
      });
    }

    case 'remove-clip': {
      const loc = findTimelineClip(timeline, op.clipId);
      if (!loc) return timeline;
      const removed = loc.clip;
      return withDuration({
        ...timeline,
        tracks: timeline.tracks.map((track) => {
          if (track.id !== loc.track.id) return track;
          let clips = track.clips.filter((c) => c.id !== op.clipId);
          if (op.ripple) {
            clips = clips.map((c) =>
              c.startSec > removed.startSec
                ? { ...c, startSec: round3(Math.max(0, c.startSec - removed.durationSec)) }
                : c,
            );
          }
          return { ...track, clips };
        }),
      });
    }

    case 'add-clip': {
      const track = timeline.tracks.find((t) => t.id === op.trackId);
      if (!track || track.locked) return timeline;
      const trackEnd = track.clips.reduce(
        (max, c) => Math.max(max, c.startSec + c.durationSec),
        0,
      );
      const clip: TimelineClip = {
        ...op.clip,
        startSec: op.atEnd ? round3(trackEnd) : round3(Math.max(0, op.clip.startSec)),
      };
      return withDuration({
        ...timeline,
        tracks: timeline.tracks.map((t) =>
          t.id === op.trackId
            ? { ...t, clips: [...t.clips, clip].sort((a, b) => a.startSec - b.startSec) }
            : t,
        ),
      });
    }

    case 'add-track': {
      if (timeline.tracks.some((t) => t.id === op.track.id)) return timeline;
      return withDuration({ ...timeline, tracks: [...timeline.tracks, op.track] });
    }

    case 'set-track': {
      return {
        ...timeline,
        tracks: timeline.tracks.map((t) =>
          t.id === op.trackId ? { ...t, ...op.patch } : t,
        ),
      };
    }

    case 'duck-audio': {
      const volume = clampClipVolume(op.volume);
      return {
        ...timeline,
        tracks: timeline.tracks.map((t) =>
          t.id === op.trackId
            ? { ...t, clips: t.clips.map((c) => ({ ...c, volume })) }
            : t,
        ),
      };
    }

    case 'set-volume-keyframe': {
      return replaceClip(timeline, op.clipId, (c) => ({
        ...c,
        volumeKeyframes: upsertVolumeKeyframe(c.volumeKeyframes, op.atSec, op.volume),
      }));
    }

    case 'remove-volume-keyframe': {
      return replaceClip(timeline, op.clipId, (c) => ({
        ...c,
        volumeKeyframes: removeVolumeKeyframe(c.volumeKeyframes, op.atSec),
      }));
    }

    case 'replace-clip-asset': {
      return withDuration(
        replaceClip(timeline, op.clipId, (c) => ({
          ...c,
          assetUrl: op.assetUrl,
          replacedFrom: op.replacedFrom ?? c.assetUrl,
          ...(op.takeId ? { takeId: op.takeId } : {}),
        })),
      );
    }

    default:
      return timeline;
  }
}

export function applyTimelineOps(
  timeline: TimelinePayload,
  ops: TimelineOp[],
): TimelinePayload {
  return ops.reduce((tl, op) => applyTimelineOp(tl, op), timeline);
}

function makeSplitClipId(timeline: TimelinePayload, baseId: string): string {
  let n = 2;
  const exists = (id: string) =>
    timeline.tracks.some((t) => t.clips.some((c) => c.id === id));
  while (exists(`${baseId}.${n}`)) n += 1;
  return `${baseId}.${n}`;
}

/** 分配下一个规范轨道 ID（V/A/S/O 前缀顺延，避开已占用编号） */
export function nextTrackId(
  tracks: Pick<TimelineTrack, 'id'>[],
  kind: TimelineTrack['kind'],
): string {
  const prefix = kind === 'video' ? 'V' : kind === 'audio' ? 'A' : kind === 'subtitle' ? 'S' : 'O';
  let n = 1;
  const ids = new Set(tracks.map((t) => t.id));
  while (ids.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/** 时间线内所有唯一视频/音频素材地址（供 probe 时长校准） */
export function listTimelineMediaUrls(timeline: TimelinePayload): string[] {
  const urls = new Set<string>();
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if ((clip.type === 'video' || clip.type === 'audio') && clip.assetUrl) {
        urls.add(clip.assetUrl);
      }
    }
  }
  return [...urls];
}

/**
 * 用 probe 结果校准片段时长：
 * - 回写 sourceDurationSec
 * - 估算时长超出素材真实长度的片段收短，同轨后续片段 ripple 前移
 */
export function calibrateTimelineWithDurations(
  timeline: TimelinePayload,
  durations: Record<string, number>,
): TimelinePayload {
  const tracks = timeline.tracks.map((track) => {
    let shift = 0;
    const clips = track.clips
      .slice()
      .sort((a, b) => a.startSec - b.startSec)
      .map((clip) => {
        const moved = shift > 0 ? { ...clip, startSec: round3(clip.startSec - shift) } : clip;
        const src = durations[clip.assetUrl];
        if (src == null || src <= 0 || (clip.type !== 'video' && clip.type !== 'audio')) {
          return moved;
        }
        const speed = clip.speed ?? 1;
        const available = Math.max(MIN_CLIP_SEC, (src - (clip.trimInSec ?? 0)) / speed);
        if (moved.durationSec <= available) {
          return { ...moved, sourceDurationSec: src };
        }
        shift += moved.durationSec - available;
        return { ...moved, sourceDurationSec: src, durationSec: round3(available) };
      });
    return { ...track, clips };
  });
  return withDuration({ ...timeline, tracks });
}
