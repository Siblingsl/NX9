export type AssetKind = 'picture' | 'video' | 'audio' | 'document' | 'other';

/**
 * 画布/节点侧「媒体文件」记录（出图/视频/音频 blob 引用）。
 * 与创意素材库（角色/服/场/道…）不是同一概念。
 *
 * 正名别名：`MediaBlob` / `GeneratedMedia`（P-19）。
 * `refCount` 仅服务媒体 GC，不替代创意库 usage。
 */
export interface AssetRecord {
  id: string;
  kind: AssetKind;
  url: string;
  label?: string;
  thumbUrl?: string;
  versions?: string[];
  refCount: number;
  shotId?: string;
  blockId?: string;
  createdAt: string;
  meta?: Record<string, unknown>;
}

/** P-19：媒体 blob 正名（与创意资产分离） */
export type MediaBlob = AssetRecord;
/** P-19：生成媒体正名（与创意资产分离） */
export type GeneratedMedia = AssetRecord;

export interface AssetLibraryPayload {
  version: 1;
  assets: AssetRecord[];
}
