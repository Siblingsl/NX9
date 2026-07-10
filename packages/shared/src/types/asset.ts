export type AssetKind = 'picture' | 'video' | 'audio' | 'document' | 'other';

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

export interface AssetLibraryPayload {
  version: 1;
  assets: AssetRecord[];
}
