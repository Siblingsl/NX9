/** 默认单镜时长（秒）— 短剧节奏以 2–3s 为主 */
export const DEFAULT_SHOT_DURATION_SEC = 3;

export type ShotTimelineInput = {
  id: string;
  index: number;
  durationSec?: number | null;
};

export type ShotTimelineEntry = {
  shotId: string;
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
};

/**
 * 按本集镜头顺序累加起止秒：镜1 = 0~d1，镜2 = d1~d1+d2 …
 */
export function buildShotTimeline(shots: ShotTimelineInput[]): ShotTimelineEntry[] {
  const sorted = [...shots].sort((a, b) => a.index - b.index);
  let cursor = 0;
  return sorted.map((shot) => {
    const durationSec = Math.max(
      0.5,
      Number(shot.durationSec) > 0 ? Number(shot.durationSec) : DEFAULT_SHOT_DURATION_SEC,
    );
    const startSec = cursor;
    const endSec = cursor + durationSec;
    cursor = endSec;
    return {
      shotId: shot.id,
      index: shot.index,
      startSec,
      endSec,
      durationSec,
    };
  });
}

export function shotTimelineMap(shots: ShotTimelineInput[]): Map<string, ShotTimelineEntry> {
  return new Map(buildShotTimeline(shots).map((entry) => [entry.shotId, entry]));
}

/** 展示用：0–3s / 3–5.5s */
export function formatShotTimeRange(startSec: number, endSec: number): string {
  const fmt = (n: number) => {
    const rounded = Math.round(n * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  };
  return `${fmt(startSec)}–${fmt(endSec)}s`;
}

/** 建议宫格列数（故事板 contact sheet） */
export function suggestStoryboardGridCols(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  if (count <= 16) return 4;
  return 4;
}
