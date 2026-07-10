/** 素材导入节点 — 单条已上传素材 */
export type ImportedAssetMediaKind = 'picture' | 'clip' | 'sound' | 'mesh';

export interface ImportedAssetItem {
  id: string;
  url: string;
  mediaKind: ImportedAssetMediaKind;
  filename?: string;
  thumbUrl?: string;
}

/** 从节点 data 解析素材列表（兼容旧版单 assetUrl） */
export function resolveAssetImportItems(
  data: Record<string, unknown> | undefined,
): ImportedAssetItem[] {
  if (!data) return [];
  const items = data.importItems as ImportedAssetItem[] | undefined;
  if (Array.isArray(items) && items.length > 0) {
    return items.filter((i) => i?.url);
  }
  const url = (data.assetUrl as string) || (data.previewUrl as string) || (data.filledUrl as string);
  if (!url) return [];
  const mediaKind = (data.mediaKind as ImportedAssetMediaKind) || guessMediaKindFromUrl(url);
  return [
    {
      id: 'legacy-0',
      url,
      mediaKind,
      filename: data.filename as string | undefined,
      thumbUrl: (data.thumbUrl as string) || (mediaKind === 'picture' ? url : undefined),
    },
  ];
}

export function guessMediaKindFromUrl(url: string): ImportedAssetMediaKind {
  if (/\.(mp4|webm|mov|mkv|avi)$/i.test(url)) return 'clip';
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(url)) return 'sound';
  if (/\.(glb|gltf|obj|fbx)$/i.test(url)) return 'mesh';
  return 'picture';
}

export function guessMediaKindFromFile(file: File): ImportedAssetMediaKind {
  if (file.type.startsWith('video/')) return 'clip';
  if (file.type.startsWith('audio/')) return 'sound';
  if (/\.(glb|gltf|obj|fbx)$/i.test(file.name)) return 'mesh';
  return 'picture';
}

/** 写入 importItems 时同步旧字段，供下游与 socket 兼容 */
export function syncAssetImportNodeFields(items: ImportedAssetItem[]): Record<string, unknown> {
  const pictures = items.filter((i) => i.mediaKind === 'picture').map((i) => i.url);
  const first = items[0];
  return {
    importItems: items,
    assetUrl: first?.url,
    mediaKind: first?.mediaKind,
    filename: first?.filename,
    previewUrl: pictures[0] ?? (first?.mediaKind === 'picture' ? first.url : undefined),
    previewUrls: pictures,
    assetCount: items.length,
    status: items.length > 0 ? 'done' : 'idle',
    error: undefined,
  };
}
