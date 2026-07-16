/** 从节点 data 解析素材列表（兼容旧版单 assetUrl） */
export function resolveAssetImportItems(data) {
    if (!data)
        return [];
    const items = data.importItems;
    if (Array.isArray(items) && items.length > 0) {
        return items.filter((i) => i?.url);
    }
    const url = data.assetUrl || data.previewUrl || data.filledUrl;
    if (!url)
        return [];
    const mediaKind = data.mediaKind || guessMediaKindFromUrl(url);
    return [
        {
            id: 'legacy-0',
            url,
            mediaKind,
            filename: data.filename,
            thumbUrl: data.thumbUrl || (mediaKind === 'picture' ? url : undefined),
        },
    ];
}
export function guessMediaKindFromUrl(url) {
    if (/\.(mp4|webm|mov|mkv|avi)$/i.test(url))
        return 'clip';
    if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(url))
        return 'sound';
    if (/\.(glb|gltf|obj|fbx)$/i.test(url))
        return 'mesh';
    return 'picture';
}
export function guessMediaKindFromFile(file) {
    if (file.type.startsWith('video/'))
        return 'clip';
    if (file.type.startsWith('audio/'))
        return 'sound';
    if (/\.(glb|gltf|obj|fbx)$/i.test(file.name))
        return 'mesh';
    return 'picture';
}
/** 写入 importItems 时同步旧字段，供下游与 socket 兼容 */
export function syncAssetImportNodeFields(items) {
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
