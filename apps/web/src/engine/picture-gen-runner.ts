import { lookupPictureModel } from '@nx9/shared';
import { api } from '../api/client';

export interface PictureGenJobInput {
  prompt: string;
  modelId?: string;
  size?: string;
  referenceImageUrl?: string;
  n?: number;
  mode?: 'standard' | 'panorama-720';
}

export const PANORAMA_720_PROMPT_SUFFIX = [
  'seamless equirectangular environment panorama',
  'full 360 degree horizontal and 180 degree vertical field of view',
  'standard 2:1 spherical projection with centered horizon',
  'left and right edges match perfectly with no visible seam',
  'environment only, no people or characters, no text, no frame, no fisheye circle',
  'suitable as a Three.js 360 panorama background for realtime character blocking',
].join(', ');

async function normalizePanoramaUrls(urls: string[]): Promise<string[]> {
  return Promise.all(
    urls.map(async (sourceUrl) => {
      const result = await api.resizeImage({
        sourceUrl,
        width: 2048,
        height: 1024,
        fit: 'cover',
      });
      return result.url;
    }),
  );
}

export async function runPictureGenJob(input: PictureGenJobInput): Promise<string[]> {
  const def = lookupPictureModel(input.modelId);
  const panorama = input.mode === 'panorama-720';
  const prompt = [input.prompt.trim(), panorama ? PANORAMA_720_PROMPT_SUFFIX : '']
    .filter(Boolean)
    .join('\n\n');
  if (!prompt) throw new Error('Prompt 为空');

  if (def.provider === 'fal') {
    const falInput: Record<string, unknown> = { prompt };
    if (panorama) {
      falInput.image_size = { width: 2048, height: 1024 };
      falInput.num_images = 1;
      falInput.enable_safety_checker = true;
    }
    const ref = input.referenceImageUrl?.trim();
    if (def.supportsReference) {
      if (!ref) throw new Error('FLUX 图生图需要参考图（连接上游图片或角色参考）');
      falInput.image_url = ref;
      falInput.strength = 0.85;
    }
    const res = await api.proxyFal({ model: def.model, input: falInput });
    if (!res.url) throw new Error('Fal 未返回图片');
    const urls = [res.url];
    return panorama ? normalizePanoramaUrls(urls) : urls;
  }

  const n = Math.min(4, Math.max(1, input.n ?? 1));
  const requestSize = panorama
    ? def.id === 'dall-e-2'
      ? '1024x1024'
      : '1792x1024'
    : input.size || def.defaultSize || '1024x1024';
  const res = (await api.proxyImage({
    prompt,
    model: def.model,
    size: requestSize,
    n: panorama ? 1 : n,
  })) as { ok?: boolean; url?: string; urls?: string[] };
  if (!res.url && !res.urls) throw new Error('图像生成失败');
  const urls = res.urls ?? [res.url!];
  return panorama ? normalizePanoramaUrls(urls) : urls;
}

export async function pollClipTask(taskId: string): Promise<string | undefined> {
  const res = await api.pollVideo(taskId);
  if (res.status === 'success' && res.url) return res.url;
  if (res.status === 'failed') throw new Error(res.message ?? '视频生成失败');
  return undefined;
}
