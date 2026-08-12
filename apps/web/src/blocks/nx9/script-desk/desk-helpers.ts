/**
 * Q-01: 编剧台模块级常量与纯函数（自 ScriptDeskBlock 纯搬运，禁夹带行为变更）。
 */
import type { ScreenplayPackage, ScriptDeskSkillId } from '@nx9/shared';

export type EntryMode = 'agent' | 'ingest';
export type RightTab = 'screenplay' | 'bible' | 'readiness' | 'diagnostics';

/** 左侧对话区宽度占比（相对 sd2-body）；默认 60，可拖拽调整 */
export const SPLIT_DEFAULT = 60;
export const SPLIT_MIN = 32;
export const SPLIT_MAX = 72;

export const SCREENPLAY_VISUAL_STYLES = [
  { value: '真人写实', label: '真人写实' },
  { value: '写实 3D', label: '写实 3D' },
  { value: '风格化 3D', label: '风格化 3D' },
  { value: '二维动漫', label: '二维动漫' },
  { value: '国漫水墨', label: '国漫水墨' },
  { value: '定格动画', label: '定格动画' },
] as const;

export function clampSplitPct(n: number): number {
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(n * 10) / 10));
}

export const SKILL_CHIPS: Array<{ id: ScriptDeskSkillId; label: string; segment: 'brief' | 'draft' | 'qa' }> = [
  { id: 'topic', label: '选题', segment: 'brief' },
  { id: 'world', label: '世界观', segment: 'brief' },
  { id: 'character', label: '人物', segment: 'brief' },
  { id: 'plot', label: '剧情', segment: 'brief' },
  { id: 'pacing', label: '节奏', segment: 'draft' },
  { id: 'dialogue', label: '对白', segment: 'draft' },
  { id: 'hooks', label: '爆点', segment: 'draft' },
  { id: 'consistency', label: '一致性', segment: 'qa' },
  { id: 'generate', label: '生成剧本', segment: 'draft' },
];

export function compact(text: string, max = 48) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Brief 已可用：至少有剧名或 logline，才允许首次选集数生成分集 */
export function isBriefReadyForFirstGen(pkg: ScreenplayPackage): boolean {
  return Boolean(pkg.brief.title?.trim() || pkg.brief.logline?.trim());
}

export function isVisualStyleReady(pkg: ScreenplayPackage): boolean {
  return Boolean(pkg.bible.world?.visualStyleNotes?.trim());
}

/** 列表标题：去掉与集号重复的「第N集」前缀；若标题仅有集号则返回空串 */
export function episodeDisplayTitle(index: number, title?: string): string {
  const raw = (title ?? '').trim();
  if (!raw) return '';
  return raw
    .replace(new RegExp(`^第\\s*${index}\\s*集\\s*[·\\-—:：]?\\s*`), '')
    .trim();
}

/** 撤销粒度：结构性操作每次入栈；键入 2s 窗口内合并为一次 */
export type UndoMode = 'struct' | 'typing' | false;
export type UndoLatch = { mode: 'struct' | 'typing'; at: number };

export function shouldPushUndo(
  mode: UndoMode,
  last: UndoLatch | null,
  now: number,
  typingWindowMs = 2000,
): boolean {
  if (mode === false) return false;
  if (mode === 'struct') return true;
  if (!last || last.mode !== 'typing') return true;
  return now - last.at > typingWindowMs;
}

export function shouldShowUnconfirmBanner(
  status: ScreenplayPackage['status'],
  hadConfirmed: boolean,
  epCount: number,
): boolean {
  return status !== 'confirmed' && hadConfirmed && epCount > 0;
}

/** 换稿/重置时复位确认 latch，避免跨稿误报 */
export function confirmedLatchForSnapshot(status: ScreenplayPackage['status'] | undefined): boolean {
  return status === 'confirmed';
}

export function countCharacterRenameHits(
  pkg: ScreenplayPackage,
  oldName: string,
): { bodyHits: number; bibleHits: number } {
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'g');
  let bodyHits = 0;
  for (const ep of pkg.screenplay.episodes) {
    bodyHits += (ep.bodyMd.match(re) ?? []).length + (ep.title.match(re) ?? []).length;
  }
  let bibleHits = 0;
  for (const c of pkg.bible.characters) {
    if (c.name.trim() !== oldName.trim()) continue;
    bibleHits += 1;
    bibleHits += (c.identity?.match(re) ?? []).length;
    bibleHits += (c.personality?.match(re) ?? []).length;
    bibleHits += (c.appearance?.match(re) ?? []).length;
    bibleHits += (c.relationships?.match(re) ?? []).length;
  }
  return { bodyHits, bibleHits };
}

export function isBibleCardHighlighted(
  highlightedId: string | null,
  entity: { id: string; name: string; code?: string },
): boolean {
  if (!highlightedId) return false;
  return highlightedId === entity.id
    || highlightedId === entity.name
    || (Boolean(entity.code) && highlightedId === entity.code);
}

export type SavePkgFn = (
  next: ScreenplayPackage | ((current: ScreenplayPackage) => ScreenplayPackage),
  extra?: Record<string, unknown>,
  opts?: { undo?: UndoMode },
) => void;

/** 切 tab 后仍记住展开集：默认只开第 1 集 */
export function initialOpenEpisodeIds(pkg: ScreenplayPackage): string[] {
  const first = pkg.screenplay.episodes.find((ep) => ep.index === 1);
  return first ? [first.id] : [];
}

/** 素材库跳转：已是 id 则原样；否则按 name/label 解析 */
export function resolveLibraryItemId(
  itemIdOrName: string,
  items: Array<{ id: string; name?: string; label?: string }>,
): string {
  const raw = itemIdOrName.trim();
  if (!raw) return raw;
  if (items.some((item) => item.id === raw)) return raw;
  const key = raw.toLowerCase();
  const hit = items.find((item) => {
    const name = (item.name ?? item.label ?? '').trim().toLowerCase();
    return name === key;
  });
  return hit?.id ?? raw;
}

export function textLooksLikeEpisodicScreenplay(text: string): boolean {
  return /第\s*\d+\s*集/.test(text);
}

export const SCRIPT_DESK_ERROR_HINTS: Record<string, string> = {
  abort: '已保留成功部分，可继续或重试失败集',
  rate_limit: '稍后再试，或到设置换模型/通道',
  timeout: '网络或模型超时，可缩短单集后再试',
  content_filter: '请改写提示后重试',
  format_fail: '模型输出体例不合，可重试或改用上传成稿',
  empty_output: '模型空响应，检查通道后重试',
  visual_style_missing: '到设定页选择全片视觉风格后再生成',
  unknown: '可重试；若反复失败请检查模型设置',
};

