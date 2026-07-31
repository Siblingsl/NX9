/**
 * F-010: 资产软删除 / 回收站（与项目级 workspace trash 对等）。
 * 策略：deletedAt 标记；活跃列表过滤；30 天后 purge；彻底删除不可恢复。
 */

export const ASSET_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type SoftDeletable = { id: string; deletedAt?: number | null };

export function isAssetTrashed(item: SoftDeletable | null | undefined, now = Date.now()): boolean {
  const ts = item?.deletedAt;
  if (ts == null || !Number.isFinite(ts)) return false;
  return now - ts < ASSET_TRASH_RETENTION_MS;
}

export function isAssetActive(item: SoftDeletable | null | undefined): boolean {
  const ts = item?.deletedAt;
  return ts == null || !Number.isFinite(ts);
}

export function softDeleteAsset<T extends SoftDeletable>(item: T, now = Date.now()): T {
  return { ...item, deletedAt: now };
}

export function restoreAsset<T extends SoftDeletable>(item: T): T {
  const next = { ...item };
  delete (next as SoftDeletable).deletedAt;
  return next;
}

/** 活跃项（未进回收站） */
export function filterActiveAssets<T extends SoftDeletable>(items: T[]): T[] {
  return items.filter((item) => isAssetActive(item));
}

/** 回收站可见项（未过 30 天） */
export function filterTrashedAssets<T extends SoftDeletable>(items: T[], now = Date.now()): T[] {
  return items
    .filter((item) => isAssetTrashed(item, now))
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

/** 物理剔除已过期软删项，返回 { items, purgedCount } */
export function purgeExpiredAssets<T extends SoftDeletable>(
  items: T[],
  now = Date.now(),
): { items: T[]; purgedCount: number } {
  const kept: T[] = [];
  let purgedCount = 0;
  for (const item of items) {
    const ts = item.deletedAt;
    if (ts != null && Number.isFinite(ts) && now - ts >= ASSET_TRASH_RETENTION_MS) {
      purgedCount += 1;
      continue;
    }
    kept.push(item);
  }
  return { items: kept, purgedCount };
}

/** 彻底删除指定 id（从数组移除） */
export function purgeAssetById<T extends SoftDeletable>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

/**
 * 软删：把匹配 id 的项标 deletedAt；若不存在则 no-op。
 * 返回新数组。
 */
export function softDeleteAssetById<T extends SoftDeletable>(
  items: T[],
  id: string,
  now = Date.now(),
): T[] {
  return items.map((item) => (item.id === id ? softDeleteAsset(item, now) : item));
}

/**
 * 恢复：清除 deletedAt。
 * 若活跃区已有同 id（理论上不应发生），为冲突项生成新 id。
 */
export function restoreAssetById<T extends SoftDeletable>(
  items: T[],
  id: string,
  allocId?: () => string,
): { items: T[]; restoredId: string; conflictRenamed: boolean } {
  const target = items.find((item) => item.id === id);
  if (!target || target.deletedAt == null) {
    return { items, restoredId: id, conflictRenamed: false };
  }
  const activeClash = items.some((item) => item.id === id && item.deletedAt == null);
  if (activeClash && allocId) {
    const newId = allocId();
    return {
      items: items.map((item) =>
        item.id === id && item.deletedAt != null
          ? restoreAsset({ ...item, id: newId })
          : item,
      ),
      restoredId: newId,
      conflictRenamed: true,
    };
  }
  return {
    items: items.map((item) => (item.id === id ? restoreAsset(item) : item)),
    restoredId: id,
    conflictRenamed: false,
  };
}

export type AssetTrashKind =
  | 'character'
  | 'costume'
  | 'scene'
  | 'shot'
  | 'emotion'
  | 'hook'
  | 'sound'
  /** 节点生成结果（图像生成 / 视频等）软删进回收站 */
  | 'picture'
  | 'video'
  /** 编剧台成稿快照（重置未存草稿 / 草稿箱删除） */
  | 'screenplay';

export interface AssetTrashEntry {
  id: string;
  kind: AssetTrashKind;
  scope: 'private' | 'public';
  label: string;
  deletedAt: number;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  /** 生成结果软删时的来源节点（恢复时写回 previewUrls） */
  sourceBlockId?: string;
}

/** 画布生成媒体软删项（图像/视频生成结果，非素材库条目） */
export type MediaTrashKind = 'picture' | 'video';

export interface MediaTrashItem {
  id: string;
  mediaKind: MediaTrashKind;
  url: string;
  label: string;
  sourceBlockId?: string;
  deletedAt: number;
}

export function createMediaTrashItem(input: {
  url: string;
  mediaKind?: MediaTrashKind;
  label?: string;
  sourceBlockId?: string;
  now?: number;
}): MediaTrashItem {
  const now = input.now ?? Date.now();
  const mediaKind = input.mediaKind ?? 'picture';
  return {
    id: `media-trash-${now}-${Math.random().toString(36).slice(2, 8)}`,
    mediaKind,
    url: input.url,
    label: input.label?.trim() || (mediaKind === 'video' ? '生成视频' : '生成图'),
    sourceBlockId: input.sourceBlockId,
    deletedAt: now,
  };
}

export function daysRemainingInTrash(deletedAt: number, now = Date.now()): number {
  const left = ASSET_TRASH_RETENTION_MS - (now - deletedAt);
  return Math.max(0, Math.ceil(left / 86400000));
}
