import { lookupPictureModel } from '@nx9/shared';
import { api } from '../api/client';

export interface PictureGenJobInput {
  prompt: string;
  modelId?: string;
  size?: string;
  referenceImageUrl?: string;
  /** 额外参考图（多参考 / 风格） */
  referenceImageUrls?: string[];
  styleImageUrl?: string;
  /** 图生图强度 0–1，默认 0.85 */
  strength?: number;
  n?: number;
  mode?: 'standard' | 'panorama-720' | 'upscale-hd';
  negativePrompt?: string;
  seed?: number;
  /** 高清放大倍率，默认 2 */
  upscaleScale?: number;
  /** 清晰度档位 1k/2k/4k，透传 Gemini imageSize */
  imageSizeTier?: string;
  resolutionTier?: string;
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
  // ── 图片高清：本地 / 服务端放大，不走生成模型 ──
  if (input.mode === 'upscale-hd') {
    const src =
      input.referenceImageUrl?.trim() ||
      input.referenceImageUrls?.find((u) => u?.trim())?.trim() ||
      '';
    if (!src) throw new Error('图片高清需要参考图（上传或连接上游）');
    const scale = Math.min(4, Math.max(2, input.upscaleScale ?? 2));
    const res = await api.upscaleImage({ sourceUrl: src, scale });
    if (!res.url) throw new Error('高清放大失败');
    return [res.url];
  }

  const def = lookupPictureModel(input.modelId);
  const panorama = input.mode === 'panorama-720';
  const prompt = [input.prompt.trim(), panorama ? PANORAMA_720_PROMPT_SUFFIX : '']
    .filter(Boolean)
    .join('\n\n');
  // 图生图允许空 prompt（仅改风格时），文生图必须有
  if (!prompt && !input.referenceImageUrl) throw new Error('Prompt 为空');
  const safePrompt = prompt || 'high quality refined image, preserve subject';

  if (def.provider === 'fal') {
    const falInput: Record<string, unknown> = { prompt: safePrompt };
    if (input.negativePrompt?.trim()) {
      falInput.negative_prompt = input.negativePrompt.trim();
    }
    if (input.seed != null && Number.isFinite(input.seed)) {
      falInput.seed = input.seed;
    }
    if (panorama) {
      falInput.image_size = { width: 2048, height: 1024 };
      falInput.num_images = 1;
      falInput.enable_safety_checker = true;
    }
    const ref =
      input.referenceImageUrl?.trim() ||
      input.referenceImageUrls?.find((u) => u?.trim())?.trim() ||
      '';
    const style = input.styleImageUrl?.trim();
    if (def.supportsReference) {
      if (!ref && !style) {
        throw new Error('图生图需要参考图（上传、连接上游，或角色参考）');
      }
      falInput.image_url = ref || style;
      const s = input.strength;
      falInput.strength =
        typeof s === 'number' && s > 0 && s <= 1 ? s : 0.85;
      if (style && ref && style !== ref) {
        falInput.prompt = `${safePrompt}\n\n[Style reference attached; match visual style]`;
      }
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
  const refForProxy =
    input.referenceImageUrl?.trim() ||
    input.referenceImageUrls?.find((u) => u?.trim())?.trim() ||
    input.styleImageUrl?.trim() ||
    '';
  const tier =
    input.imageSizeTier?.trim() ||
    input.resolutionTier?.trim() ||
    undefined;
  const res = (await api.proxyImage({
    prompt: safePrompt,
    model: def.model,
    provider: def.provider,
    size: requestSize,
    n: panorama ? 1 : n,
    ...(tier ? { imageSizeTier: tier, resolutionTier: tier } : {}),
    ...(refForProxy && (def.supportsReference || def.provider === 'gemini')
      ? { referenceImageUrl: refForProxy }
      : {}),
  })) as {
    ok?: boolean;
    url?: string;
    urls?: string[];
    status?: string;
    taskId?: string;
    message?: string;
  };
  if (res.status === 'processing' && res.taskId) {
    const url = await pollClipTask(res.taskId);
    if (!url) throw new Error(res.message ?? 'Magic Hour 图片仍在生成中');
    const urls = [url];
    return panorama ? normalizePanoramaUrls(urls) : urls;
  }
  if (!res.url && !res.urls) throw new Error(res.message ?? '图像生成失败');
  const urls = res.urls ?? [res.url!];
  return panorama ? normalizePanoramaUrls(urls) : urls;
}

export async function pollClipTask(taskId: string): Promise<string | undefined> {
  const res = await api.pollVideo(taskId);
  if (res.status === 'success' && res.url) return res.url;
  if (res.status === 'failed') throw new Error(res.message ?? '视频生成失败');
  return undefined;
}
