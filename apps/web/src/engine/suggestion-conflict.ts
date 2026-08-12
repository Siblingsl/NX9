/**
 * SE-03: 智能建议批量采纳时的 clip 冲突检测。
 * 两条建议改同一 clip（或同一轨 duck）时，合并 apply 会静默覆盖且只留一步撤销。
 */
import type { SmartSuggestion, TimelineOp } from '@nx9/shared';

export function timelineOpTargets(op: TimelineOp): string[] {
  switch (op.op) {
    case 'set-transition':
      return op.clipId ? [`clip:${op.clipId}`] : ['clip:*'];
    case 'set-clip':
    case 'move-clip':
    case 'trim-clip':
    case 'split-clip':
    case 'remove-clip':
    case 'set-volume-keyframe':
    case 'remove-volume-keyframe':
    case 'replace-clip-asset':
      return [`clip:${op.clipId}`];
    case 'add-clip':
      return [`track:${op.trackId}`];
    case 'add-track':
      return [`track:${op.track.id}`];
    case 'set-track':
    case 'duck-audio':
      return [`track:${op.trackId}`];
    default:
      return [];
  }
}

export interface SuggestionConflictReport {
  /** 无目标重叠，可安全合并 */
  conflictFree: boolean;
  /** 被多条建议触及的 target key（clip:id / track:id） */
  contestedTargets: string[];
  /** 涉及冲突的建议 id */
  conflictingSuggestionIds: string[];
}

/** 检测待采纳建议之间是否存在目标重叠 */
export function detectSuggestionConflicts(
  suggestions: Array<Pick<SmartSuggestion, 'id' | 'ops' | 'targetClipIds'>>,
): SuggestionConflictReport {
  const owner = new Map<string, string>();
  const contested = new Set<string>();
  const conflictIds = new Set<string>();

  for (const sg of suggestions) {
    const targets = new Set<string>();
    for (const op of sg.ops ?? []) {
      for (const t of timelineOpTargets(op)) targets.add(t);
    }
    for (const clipId of sg.targetClipIds ?? []) {
      if (clipId) targets.add(`clip:${clipId}`);
    }
    for (const t of targets) {
      const prev = owner.get(t);
      if (prev && prev !== sg.id) {
        contested.add(t);
        conflictIds.add(prev);
        conflictIds.add(sg.id);
      } else if (!prev) {
        owner.set(t, sg.id);
      }
    }
  }

  return {
    conflictFree: contested.size === 0,
    contestedTargets: [...contested],
    conflictingSuggestionIds: [...conflictIds],
  };
}

export interface AcceptAllPlan {
  /** 按条采纳（每条独立 apply，撤销可分步） */
  applyPerSuggestion: boolean;
  conflictNote?: string;
  report: SuggestionConflictReport;
}

/** 批量采纳策略：有冲突则强制逐条 apply 并给出提示 */
export function planAcceptAllSuggestions(
  suggestions: Array<Pick<SmartSuggestion, 'id' | 'ops' | 'targetClipIds'>>,
): AcceptAllPlan {
  const report = detectSuggestionConflicts(suggestions);
  if (report.conflictFree) {
    return { applyPerSuggestion: true, report };
  }
  const n = report.conflictingSuggestionIds.length;
  const targets = report.contestedTargets
    .slice(0, 3)
    .map((t) => t.replace(/^clip:/, '片段 ').replace(/^track:/, '轨道 '))
    .join('、');
  return {
    applyPerSuggestion: true,
    report,
    conflictNote: `检测到 ${n} 条建议目标重叠（${targets}${report.contestedTargets.length > 3 ? '…' : ''}）；已按顺序逐条应用，后采纳的可能覆盖先前改动，可用撤销分步回退`,
  };
}
