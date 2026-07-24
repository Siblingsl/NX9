/** 画布钉图来源：生成结果 / 上游传入 */
export type MediaPinSource = 'generated' | 'upstream';

export interface MediaPinPayload {
  url: string;
  source: MediaPinSource;
  /** 展示标签，如「生成 1」「上游 2」 */
  label: string;
  /** 拖出来源节点 id（可选，便于追溯） */
  sourceBlockId?: string;
}

export interface MediaPinNodeData {
  pinUrl: string;
  pinSource: MediaPinSource;
  pinLabel: string;
  sourceBlockId?: string;
  previewUrl: string;
  assetUrl: string;
  status: 'done';
  /** 钉图始终全卡展示，不进收折摘要 */
  expanded: true;
  blockIndex?: number;
}

export function buildMediaPinNodeData(
  payload: MediaPinPayload,
  blockIndex?: number,
): MediaPinNodeData {
  return {
    pinUrl: payload.url,
    pinSource: payload.source,
    pinLabel: payload.label,
    sourceBlockId: payload.sourceBlockId,
    previewUrl: payload.url,
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
    if (data.source !== 'generated' && data.source !== 'upstream') return null;
    return {
      url: data.url,
      source: data.source,
      label: typeof data.label === 'string' && data.label.trim() ? data.label.trim() : '钉图',
      sourceBlockId: typeof data.sourceBlockId === 'string' ? data.sourceBlockId : undefined,
    };
  } catch {
    return null;
  }
}
