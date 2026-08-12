import { resolvePictureModelForRequest } from '@nx9/shared';
import { api } from '../api/client';
import { pollVideoUntilDone, VideoPollTimeoutError } from './poll-task';
import { packPictureRefs } from './picture-gen-refs';

export interface PictureGenJobMeta {
  truncatedRefs?: number;
  taskId?: string;
}

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
  signal?: AbortSignal;
  /** PG-14/PG-17: 截断数、异步 taskId 回传 */
  onMeta?: (meta: PictureGenJobMeta) => void;
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

  const def = resolvePictureModelForRequest(input.modelId);
  const panorama = input.mode === 'panorama-720';
  const prompt = [input.prompt.trim(), panorama ? PANORAMA_720_PROMPT_SUFFIX : '']
    .filter(Boolean)
    .join('\n\n');
  // 图生图允许空 prompt（仅改风格时），文生图必须有
  if (!prompt && !input.referenceImageUrl) throw new Error('Prompt 为空');
  const safePrompt = prompt || 'high quality refined image, preserve subject';

  if (def.provider === 'fal') {
    // PG-11: fal 代理单次只返回 1 张（res.url 单值），n>1 在此链路不可达；
    // 多张请走「生成多图」多提示词批量。
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
    const packed = packPictureRefs({
      provider: 'fal',
      primary: input.referenceImageUrl,
      extras: input.referenceImageUrls,
      style: input.styleImageUrl,
    });
    if (packed.truncatedCount > 0) input.onMeta?.({ truncatedRefs: packed.truncatedCount });
    const ref = packed.primary ?? '';
    const style = packed.style;
    // fal 的 supportsReference 表示「该端点是图生图专用」，文生图应换模型，而不是在这里硬失败
    if (def.supportsReference) {
      if (!ref && !style) {
        throw new Error(
          '当前模型仅支持图生图：请添加参考图，或改用文生图模型（如 Gemini / FLUX Dev）',
        );
      }
      falInput.image_url = ref || style;
      const s = input.strength;
      falInput.strength =
        typeof s === 'number' && s > 0 && s <= 1 ? s : 0.85;
      if (packed.styleNote) {
        falInput.prompt = `${safePrompt}\n\n${packed.styleNote}`;
      }
    }
     const res = await api.proxyFal({ model: def.model, input: falInput }, { signal: input.signal });
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
  // PG-14: 按 provider 限额裁剪；风格图插在主参考后的安全位，注记按下标指认
  const packed = packPictureRefs({
    provider: def.provider,
    primary: input.referenceImageUrl,
    extras: input.referenceImageUrls,
    style: input.styleImageUrl,
  });
  const refForProxy = packed.primary ?? '';
  const dedupedExtraRefs = packed.extras;
  const tier =
    input.imageSizeTier?.trim() ||
    input.resolutionTier?.trim() ||
    undefined;
  const sendRefs = Boolean(
    refForProxy && (def.supportsReference || def.provider === 'gemini' || def.provider === 'openai'),
  );
  const proxyPrompt = packed.styleNote
    ? `${safePrompt}\n\n${packed.styleNote}`
    : safePrompt;
  const res = (await api.proxyImage({
    prompt: proxyPrompt,
    model: def.model,
    provider: def.provider,
    size: requestSize,
    n: panorama ? 1 : n,
    ...(tier ? { imageSizeTier: tier, resolutionTier: tier } : {}),
    ...(sendRefs
      ? {
          referenceImageUrl: refForProxy,
          ...(dedupedExtraRefs.length ? { referenceImageUrls: dedupedExtraRefs } : {}),
        }
      : {}),
  }, { signal: input.signal })) as {
    ok?: boolean;
    url?: string;
    urls?: string[];
    status?: string;
    taskId?: string;
    message?: string;
    truncatedRefs?: number;
  };
  const truncatedRefs = Math.max(packed.truncatedCount, Number(res.truncatedRefs) || 0);
  if (truncatedRefs > 0) input.onMeta?.({ truncatedRefs });
  if (res.status === 'processing' && res.taskId) {
    input.onMeta?.({ taskId: res.taskId, truncatedRefs: truncatedRefs || undefined });
    // PG-02: 异步图片任务与视频同口径轮询（默认 60 次 × 5s），不再单次查询即失败
    // PG-17: 超时文案走图片口径，taskId 由调用方持久化
    const url = await pollVideoUntilDone(res.taskId, {
      signal: input.signal,
      mediaKind: 'image',
    });
    const urls = [url];
    return panorama ? normalizePanoramaUrls(urls) : urls;
  }
  if (!res.url && !res.urls) throw new Error(res.message ?? '图像生成失败');
  const urls = res.urls ?? [res.url!];
  return panorama ? normalizePanoramaUrls(urls) : urls;
}

/**
 * 轮询异步媒体任务直至终态（PG-02 后为完整循环）。
 * 成功返回 url；失败/超时抛错。
 */
export async function pollClipTask(taskId: string): Promise<string | undefined> {
  return pollVideoUntilDone(taskId);
}

export interface PendingImageTask {
  taskId: string;
  prompt?: string;
}

/**
 * PG-17: 恢复超时的异步图片任务。成功则返回 url 列表；仍 processing 的保留。
 */
export async function resumePendingImageTasks(
  tasks: PendingImageTask[],
  signal?: AbortSignal,
): Promise<{ urls: string[]; stillPending: PendingImageTask[]; failed: PendingImageTask[] }> {
  const urls: string[] = [];
  const stillPending: PendingImageTask[] = [];
  const failed: PendingImageTask[] = [];
  for (const task of tasks) {
    if (!task.taskId?.trim()) continue;
    try {
      const url = await pollVideoUntilDone(task.taskId, { signal, mediaKind: 'image' });
      urls.push(url);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e;
      if (e instanceof VideoPollTimeoutError) {
        stillPending.push(task);
      } else {
        failed.push(task);
      }
    }
  }
  return { urls, stillPending, failed };
}
