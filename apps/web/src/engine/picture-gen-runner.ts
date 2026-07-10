import { lookupPictureModel } from '@nx9/shared';
import { api } from '../api/client';

export interface PictureGenJobInput {
  prompt: string;
  modelId?: string;
  size?: string;
  referenceImageUrl?: string;
  n?: number;
}

export async function runPictureGenJob(input: PictureGenJobInput): Promise<string[]> {
  const def = lookupPictureModel(input.modelId);
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error('Prompt 为空');

  if (def.provider === 'fal') {
    const falInput: Record<string, unknown> = { prompt };
    const ref = input.referenceImageUrl?.trim();
    if (def.supportsReference) {
      if (!ref) throw new Error('FLUX 图生图需要参考图（连接上游图片或角色参考）');
      falInput.image_url = ref;
      falInput.strength = 0.85;
    }
    const res = await api.proxyFal({ model: def.model, input: falInput });
    if (!res.url) throw new Error('Fal 未返回图片');
    return [res.url];
  }

  const n = Math.min(4, Math.max(1, input.n ?? 1));
  const res = (await api.proxyImage({
    prompt,
    model: def.model,
    size: input.size || def.defaultSize || '1024x1024',
    n,
  })) as { ok?: boolean; url?: string; urls?: string[] };
  if (!res.url && !res.urls) throw new Error('图像生成失败');
  return res.urls ?? [res.url!];
}

export async function pollClipTask(taskId: string): Promise<string | undefined> {
  const res = await api.pollVideo(taskId);
  if (res.status === 'success' && res.url) return res.url;
  if (res.status === 'failed') throw new Error(res.message ?? '视频生成失败');
  return undefined;
}
