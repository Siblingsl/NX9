import type { StoryboardShot } from '../types/storyboard';

export interface ShotGroupingConfig {
  maxDurationSec: number;
  maxPerGroup: number;
  minPerGroup: number;
}

export interface ShotGroupSuggestion {
  id: string;
  name: string;
  shotIds: string[];
  totalDurationSec: number;
}

const DEFAULT_CONFIG: ShotGroupingConfig = {
  maxDurationSec: 15,
  maxPerGroup: 4,
  minPerGroup: 1,
};

/** 从描述中提取场景头（如 1-1 / 第二场）用于断开分组 */
function sceneKey(shot: StoryboardShot): string {
  const text = `${shot.descriptionZh} ${shot.promptEn}`.trim();
  const m = text.match(/^(\d+[-–]\d+)/);
  if (m) return m[1];
  const scene = text.match(/第([一二三四五六七八九十\d]+)[场幕]/);
  if (scene) return scene[0];
  return '';
}

function characterOverlap(a: StoryboardShot, b: StoryboardShot): number {
  const idsA = a.characterIds ?? [];
  const idsB = b.characterIds ?? [];
  if (idsA.length === 0 || idsB.length === 0) return 0;
  const setA = new Set(idsA);
  const overlap = idsB.filter((id) => setA.has(id)).length;
  const union = new Set([...idsA, ...idsB]).size;
  return union > 0 ? overlap / union : 0;
}

function sameScene(a: StoryboardShot, b: StoryboardShot): boolean {
  const ka = sceneKey(a);
  const kb = sceneKey(b);
  if (!ka && !kb) return true;
  return ka === kb;
}

function genGroupId(): string {
  return `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** P3-03: S-Class 贪心分组，单组 ≤15s，场景变化优先断开 */
export function suggestShotGroups(
  shots: StoryboardShot[],
  config: Partial<ShotGroupingConfig> = {},
): ShotGroupSuggestion[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const ordered = [...shots].sort((a, b) => a.index - b.index);
  if (ordered.length === 0) return [];

  const groups: ShotGroupSuggestion[] = [];
  let currentIds: string[] = [];
  let currentDuration = 0;

  const flush = () => {
    if (currentIds.length === 0) return;
    const first = ordered.find((s) => s.id === currentIds[0]);
    const last = ordered.find((s) => s.id === currentIds[currentIds.length - 1]);
    const name =
      first && sceneKey(first)
        ? `${sceneKey(first)} · #${first.index}${last && last.id !== first?.id ? `–#${last.index}` : ''}`
        : `第 ${groups.length + 1} 组 · #${first?.index ?? '?'}`;
    groups.push({
      id: genGroupId(),
      name,
      shotIds: [...currentIds],
      totalDurationSec: currentDuration,
    });
    currentIds = [];
    currentDuration = 0;
  };

  for (let i = 0; i < ordered.length; i++) {
    const shot = ordered[i];
    const dur = Math.max(1, shot.durationSec || 4);
    let shouldBreak = false;

    if (currentIds.length >= cfg.maxPerGroup) {
      shouldBreak = true;
    } else if (currentDuration + dur > cfg.maxDurationSec && currentIds.length > 0) {
      shouldBreak = true;
    } else if (currentIds.length > 0) {
      const prev = ordered[i - 1];
      if (prev && !sameScene(prev, shot) && currentIds.length >= cfg.minPerGroup) {
        if (characterOverlap(prev, shot) < 0.5) shouldBreak = true;
      }
    }

    if (shouldBreak) flush();

    currentIds.push(shot.id);
    currentDuration += dur;
  }

  flush();
  return groups;
}
