import type { SocketKind } from '../types/block';

/** 画布钉板媒体类型 */
export type MediaPinKind = 'picture' | 'clip' | 'sound' | 'text' | 'mesh';

/** 画布钉板来源：生成结果 / 上游传入 / 本地文件 */
export type MediaPinSource = 'generated' | 'upstream' | 'local';

export interface MediaPinPayload {
  url: string;
  source: MediaPinSource;
  /** 展示标签，如「生成 1」「上游 2」「本地 · clip.mp4」 */
  label: string;
  /** 媒体类型；缺省按 url 推断，再回退 picture（兼容旧钉图） */
  pinKind?: MediaPinKind;
  /** 拖出来源节点 id（可选，便于追溯） */
  sourceBlockId?: string;
  filename?: string;
  /** 文本钉：可内联正文，免二次拉取 */
  textContent?: string;
}

export interface MediaPinNodeData {
  pinUrl: string;
  pinSource: MediaPinSource;
  pinLabel: string;
  pinKind: MediaPinKind;
  sourceBlockId?: string;
  filename?: string;
  textContent?: string;
  previewUrl: string;
  assetUrl: string;
  status: 'done';
  /** 钉板始终全卡展示，不进收折摘要 */
  expanded: true;
  blockIndex?: number;
}

const PIN_KINDS = new Set<MediaPinKind>(['picture', 'clip', 'sound', 'text', 'mesh']);

export function isMediaPinKind(value: unknown): value is MediaPinKind {
  return typeof value === 'string' && PIN_KINDS.has(value as MediaPinKind);
}

export function mediaPinKindToSocket(pinKind: MediaPinKind): SocketKind {
  if (pinKind === 'text') return 'prompt';
  return pinKind;
}

export function guessMediaPinKindFromUrl(url: string): MediaPinKind {
  const path = url.split('?')[0] ?? url;
  if (/\.(mp4|webm|mov|mkv|avi)$/i.test(path)) return 'clip';
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(path)) return 'sound';
  if (/\.(glb|gltf|obj|fbx)$/i.test(path)) return 'mesh';
  if (/\.(txt|md|markdown)$/i.test(path)) return 'text';
  return 'picture';
}

export function guessMediaPinKindFromFile(file: File): MediaPinKind | null {
  const name = file.name || '';
  if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) {
    return 'picture';
  }
  if (file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(name)) {
    return 'clip';
  }
  if (file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(name)) {
    return 'sound';
  }
  if (/\.(txt|md|markdown)$/i.test(name) || file.type === 'text/plain' || file.type === 'text/markdown') {
    return 'text';
  }
  if (/\.(glb|gltf|obj|fbx)$/i.test(name)) return 'mesh';
  return null;
}

export function isMediaPinDropFile(file: File): boolean {
  return guessMediaPinKindFromFile(file) != null;
}

export function resolveMediaPinKind(
  pinKind: unknown,
  url?: string,
): MediaPinKind {
  if (isMediaPinKind(pinKind)) return pinKind;
  if (url) return guessMediaPinKindFromUrl(url);
  return 'picture';
}

export function mediaPinKindLabel(pinKind: MediaPinKind): string {
  switch (pinKind) {
    case 'picture':
      return '图像';
    case 'clip':
      return '视频';
    case 'sound':
      return '音频';
    case 'text':
      return '文本';
    case 'mesh':
      return '3D';
  }
}

export function buildMediaPinNodeData(
  payload: MediaPinPayload,
  blockIndex?: number,
): MediaPinNodeData {
  const pinKind = resolveMediaPinKind(payload.pinKind, payload.url);
  return {
    pinUrl: payload.url,
    pinSource: payload.source,
    pinLabel: payload.label,
    pinKind,
    sourceBlockId: payload.sourceBlockId,
    filename: payload.filename,
    textContent: payload.textContent,
    previewUrl: pinKind === 'picture' ? payload.url : '',
    assetUrl: payload.url,
    status: 'done',
    expanded: true,
    blockIndex,
  };
}

export function parseMediaPinPayload(raw: string): MediaPinPayload | null {
  try {
    const data = JSON.parse(raw) as Partial<MediaPinPayload>;
    if (!data?.url || typeof data.url !== 'string') return null;
    if (data.source !== 'generated' && data.source !== 'upstream' && data.source !== 'local') {
      return null;
    }
    const pinKind = resolveMediaPinKind(data.pinKind, data.url);
    return {
      url: data.url,
      source: data.source,
      label:
        typeof data.label === 'string' && data.label.trim()
          ? data.label.trim()
          : mediaPinKindLabel(pinKind),
      pinKind,
      sourceBlockId: typeof data.sourceBlockId === 'string' ? data.sourceBlockId : undefined,
      filename: typeof data.filename === 'string' ? data.filename : undefined,
      textContent: typeof data.textContent === 'string' ? data.textContent : undefined,
    };
  } catch {
    return null;
  }
}
