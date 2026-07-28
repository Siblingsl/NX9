/**
 * F-011: 有效时间线判定（clips≥1 才可导出 / Playbook 就绪）。
 * 兼容 tracks[].clips（正式 TimelinePayload）与遗留顶层 clips。
 */
import type { TimelinePayload } from '../types/timeline';

export type TimelineDraftRaw = TimelinePayload | string | null | undefined | Record<string, unknown>;

/** 解析节点上的 timelineDraft（对象或 JSON 字符串） */
export function parseTimelineDraft(raw: TimelineDraftRaw): TimelinePayload | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      return parseTimelineDraft(JSON.parse(trimmed) as TimelineDraftRaw);
    } catch {
      return null;
    }
  }
  if (typeof raw !== 'object') return null;
  return raw as TimelinePayload;
}

/** 统计可导出片段数：优先 tracks，兼容遗留顶层 clips */
export function countTimelineClips(raw: TimelineDraftRaw): number {
  const timeline = parseTimelineDraft(raw);
  if (!timeline) return 0;
  const tracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
  let n = 0;
  for (const track of tracks) {
    if (Array.isArray(track?.clips)) n += track.clips.length;
  }
  if (n > 0) return n;
  const legacy = (timeline as { clips?: unknown[] }).clips;
  return Array.isArray(legacy) ? legacy.length : 0;
}

/**
 * 有 clips≥1 的有效时间线（产品拍板：有 clips 即可导出；确认仅写 confirmedAt）。
 */
export function hasEffectiveTimeline(raw: TimelineDraftRaw): boolean {
  return countTimelineClips(raw) >= 1;
}
