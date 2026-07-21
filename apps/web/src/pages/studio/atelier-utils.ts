import type { StoryboardShot, ShotType } from '@nx9/shared';

export type AtelierSceneLane = {
  key: string;
  index: number;
  title: string;
  shots: StoryboardShot[];
  withImage: number;
  progress: number;
  mood: string;
};

const SHOT_TYPE_ZH: Record<ShotType, string> = {
  close: '特写',
  medium: '中景',
  wide: '全景',
  'extreme-wide': '大全景',
  custom: '自定义',
};

export function shotTypeLabel(t?: ShotType | null): string {
  if (!t) return '—';
  return SHOT_TYPE_ZH[t] ?? t;
}

export function formatDuration(sec?: number | null): string {
  const s = Math.max(0, Math.round(sec ?? 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/** 从描述/地点推断内外景与日夜（展示用） */
export function parseShotPlace(shot: StoryboardShot): {
  code: string;
  tod: string;
  ie: string;
  place: string;
} {
  const scene = (shot.sceneName ?? '').trim();
  const code =
    shot.sceneCode?.trim() ||
    `${String(shot.index).padStart(2, '0')}`;
  const blob = `${scene} ${shot.descriptionZh ?? ''}`;
  const tod = /夜|night/i.test(blob) ? '夜' : /晨|dawn|黄昏|dusk/i.test(blob) ? '晨' : '日';
  const ie = /外|outdoor|街道|天桥|巷/i.test(blob) ? '外' : '内';
  const place =
    scene
      .replace(/^[0-9]+[-−]?[0-9]*\s*/, '')
      .replace(/^(日|夜|晨|黄昏)\s*/, '')
      .replace(/^(内|外)\s*/, '')
      .trim() || scene || '未命名场景';
  return { code, tod, ie, place };
}

export function groupShotsIntoScenes(shots: StoryboardShot[]): AtelierSceneLane[] {
  const order: string[] = [];
  const map = new Map<string, StoryboardShot[]>();

  for (const shot of shots) {
    const key =
      (shot.sceneId && `id:${shot.sceneId}`) ||
      (shot.sceneName?.trim() && `name:${shot.sceneName.trim()}`) ||
      (shot.sceneCode?.split(/[-−]/)[0] && `code:${shot.sceneCode.split(/[-−]/)[0]}`) ||
      'ungrouped';
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(shot);
  }

  return order.map((key, i) => {
    const list = map.get(key) ?? [];
    list.sort((a, b) => a.index - b.index);
    const title =
      list[0]?.sceneName?.trim() ||
      (key === 'ungrouped' ? '未分组场次' : `场次 ${i + 1}`);
    const withImage = list.filter((s) => s.firstFrameAssetId).length;
    const progress = list.length ? Math.round((withImage / list.length) * 100) : 0;
    const mood =
      list
        .map((s) => s.colorGrade || s.lighting || s.notes)
        .find(Boolean)
        ?.toString()
        .slice(0, 24) || '待定氛围';
    return {
      key,
      index: i + 1,
      title,
      shots: list,
      withImage,
      progress,
      mood,
    };
  });
}

export function projectProgressPct(stepDone: Record<string, boolean>, totalSteps: number): number {
  const n = Object.values(stepDone).filter(Boolean).length;
  return totalSteps > 0 ? Math.round((n / totalSteps) * 100) : 0;
}
