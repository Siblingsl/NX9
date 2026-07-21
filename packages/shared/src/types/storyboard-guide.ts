/**
 * 分镜导引标注（仅 UI / 出片引导图使用）
 * 红=人物动作 · 蓝=摄像机 · 橙=照明 · 绿=构图 · 紫=情绪台词 · 黑=镜头说明
 * 成片视频不得画出这些箭头/标记，只作运动与机位引导。
 */

export type StoryboardGuideKind =
  | 'action' // 红
  | 'camera' // 蓝
  | 'light' // 橙
  | 'compose' // 绿
  | 'emotion' // 紫
  | 'label'; // 黑

export type StoryboardGuideArrow = {
  id: string;
  kind: Extract<StoryboardGuideKind, 'action' | 'camera' | 'light'>;
  /** 归一化 0–1 */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 弧线弯曲度，0=直线，正负=两侧 */
  curve?: number;
  label?: string;
};

export type StoryboardGuideMark = {
  id: string;
  kind: StoryboardGuideKind;
  x: number;
  y: number;
  text: string;
  /** 相对锚点 */
  align?: 'start' | 'middle' | 'end';
};

export type StoryboardGuideOverlay = {
  version: 1;
  arrows: StoryboardGuideArrow[];
  marks: StoryboardGuideMark[];
};

export const STORYBOARD_GUIDE_COLORS: Record<StoryboardGuideKind, string> = {
  action: '#e11d48',
  camera: '#2563eb',
  light: '#ea580c',
  compose: '#16a34a',
  emotion: '#7c3aed',
  label: '#1a1a1a',
};

export const STORYBOARD_GUIDE_LEGEND: Array<{ kind: StoryboardGuideKind; label: string }> = [
  { kind: 'action', label: '红色箭头 = 人物动作方向' },
  { kind: 'camera', label: '蓝色箭头 = 摄像机移动' },
  { kind: 'light', label: '橙色标记 = 照明方向' },
  { kind: 'compose', label: '绿色标记 = 构图/留白' },
  { kind: 'emotion', label: '紫色标记 = 情绪/台词' },
  { kind: 'label', label: '黑色文字 = 镜头说明（无时间戳）' },
];

export function emptyStoryboardGuideOverlay(): StoryboardGuideOverlay {
  return { version: 1, arrows: [], marks: [] };
}

export function isStoryboardGuideOverlay(
  value: unknown,
): value is StoryboardGuideOverlay {
  if (!value || typeof value !== 'object') return false;
  const o = value as StoryboardGuideOverlay;
  return o.version === 1 && Array.isArray(o.arrows) && Array.isArray(o.marks);
}

/** 全部导引 kind（用于默认开启） */
export const STORYBOARD_GUIDE_KINDS: StoryboardGuideKind[] = [
  'action',
  'camera',
  'light',
  'compose',
  'emotion',
  'label',
];

/** 按总开关 + kind 白名单过滤叠层（展示 / 导出 / 出片共用） */
export function filterStoryboardGuideOverlay(
  overlay: StoryboardGuideOverlay | null | undefined,
  opts?: {
    enabled?: boolean;
    /** 未传或空 = 全部 kind */
    kinds?: readonly StoryboardGuideKind[] | null;
  },
): StoryboardGuideOverlay {
  if (!overlay || opts?.enabled === false) return emptyStoryboardGuideOverlay();
  const kinds = opts?.kinds;
  if (!kinds || kinds.length === 0) {
    return {
      version: 1,
      arrows: [...overlay.arrows],
      marks: [...overlay.marks],
    };
  }
  const allow = new Set(kinds);
  return {
    version: 1,
    arrows: overlay.arrows.filter((a) => allow.has(a.kind)),
    marks: overlay.marks.filter((m) => allow.has(m.kind)),
  };
}
