import type { Node } from '@xyflow/react';

export interface GenerationHistoryItem {
  id: string;
  type: string;
  label: string;
  url?: string;
}

/** 从画布节点收集生成产物（History Rail / 生成历史面板共用） */
export function collectGenerationHistoryItems(nodes: Node[], limit = 40): GenerationHistoryItem[] {
  const out: GenerationHistoryItem[] = [];
  for (const n of nodes) {
    const d = n.data ?? {};
    const type = n.type ?? 'unknown';
    const url =
      (d.previewUrl as string) ||
      (d.videoUrl as string) ||
      (d.audioUrl as string) ||
      (d.composedUrl as string) ||
      (d.outputUrl as string) ||
      (d.lastCaptureUrl as string);
    const text = (d.output as string) || (d.lastReply as string) || (d.content as string);
    if (url || (text && text.length > 20)) {
      out.push({
        id: n.id,
        type,
        label: text?.slice(0, 48) || url?.split('/').pop() || type,
        url,
      });
    }
  }
  return out.reverse().slice(0, limit);
}
