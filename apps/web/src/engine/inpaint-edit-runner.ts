import { api } from '../api/client';
import { patchUpstreamShot } from './chain-storyboard-utils';
import type { Node } from '@xyflow/react';

export const DEFAULT_INPAINT_MODEL = 'fal-ai/fast-sdxl/inpainting';

export function resolveInpaintModel(data: Record<string, unknown>): string {
  const raw = ((data.inpaintModel as string) || (data.model as string) || '').trim();
  return raw || DEFAULT_INPAINT_MODEL;
}

export async function runInpaintEdit(input: {
  imageUrl: string;
  maskUrl?: string;
  prompt: string;
  model?: string;
}): Promise<{ url: string; model: string }> {
  const prompt = input.prompt.trim();
  if (!input.imageUrl) throw new Error('局部重绘：需要上游图片');
  if (!prompt) throw new Error('局部重绘：请输入 prompt');
  const model = input.model?.trim() || DEFAULT_INPAINT_MODEL;
  const res = (await api.proxyFal({
    model,
    input: {
      image_url: input.imageUrl,
      mask_url: input.maskUrl || undefined,
      prompt,
    },
  })) as { ok?: boolean; url?: string };
  if (!res.url) throw new Error('重绘失败');
  return { url: res.url, model };
}

/** F-036: 将重绘结果写回连接链上的 linkedShot */
export function writeBackInpaintShot(opts: {
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  nodeId: string;
  nodes: Node[];
  edges: Array<{ source: string; target: string }>;
  linkedShotId?: string;
  imageUrl: string;
}): boolean {
  if (!opts.linkedShotId) return false;
  return patchUpstreamShot(
    opts.updateNodeData,
    opts.nodeId,
    opts.nodes,
    opts.edges,
    opts.linkedShotId,
    {
      firstFrameAssetId: opts.imageUrl,
      keyframeStatus: 'review',
      status: 'review',
    },
  );
}
