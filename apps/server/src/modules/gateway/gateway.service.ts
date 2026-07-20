import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { HOST, PATHS, PORT } from '../../config/app.config';
import { resolveMediaUrl } from '../../common/media-path';
import { resolveReferenceAudioPath } from '../../common/luxtts-path';
import { SettingsService } from '../settings/settings.service';
import { UsageService } from '../usage/usage.service';
import { LuxTtsAdapter, type LuxTtsProbeResult } from './luxtts.adapter';
import { MagicHourAdapter } from './magic-hour.adapter';
import { GeminiAdapter } from './gemini.adapter';
import { VoiceboxAdapter } from './voicebox.adapter';
import type { LuxTtsNoGpuFallback } from '@nx9/shared';

export interface TtsFallbackInfo {
  from: 'luxtts';
  to: 'cloud' | 'cpu';
  reason: string;
  applied: LuxTtsNoGpuFallback;
}

type VideoProviderKind = 'custom' | 'xai' | 'grokgo';

interface VideoProviderRuntime {
  kind: VideoProviderKind;
  apiKey: string;
  baseUrl: string;
  label: string;
  isLocalBridge: boolean;
}

@Injectable()
export class GatewayService {
  private luxProbeCache: { url: string; at: number; result: LuxTtsProbeResult } | null = null;

  constructor(
    private readonly settings: SettingsService,
    private readonly voicebox: VoiceboxAdapter,
    private readonly luxtts: LuxTtsAdapter,
    private readonly magicHour: MagicHourAdapter,
    private readonly gemini: GeminiAdapter,
    private readonly usage: UsageService,
  ) {}

  private shouldUseMagicHour(model?: string, provider?: string): boolean {
    if (!this.magicHour.hasKey()) return false;
    const p = (provider || '').toLowerCase();
    if (p === 'magichour' || p === 'magic-hour') return true;
    if (this.magicHour.isMagicHourModel(model)) return true;
    // Env key present + no primary image key → prefer Magic Hour for default models
    const primary = this.settings.getRaw().primaryApiKey || '';
    if (!primary && (!model || model === 'dall-e-3' || model === 'veo' || model === 'magic-hour')) {
      return true;
    }
    return false;
  }

  private shouldUseGemini(model?: string, provider?: string): boolean {
    if (!this.gemini.hasKey()) return false;
    const p = (provider || '').toLowerCase();
    if (p === 'gemini' || p === 'google' || p === 'google-ai') return true;
    if (this.gemini.isGeminiModel(model)) return true;
    return false;
  }

  private async track(
    kind: string,
    opts?: { userId?: string; model?: string; units?: number },
  ) {
    try {
      await this.usage.record(kind, opts);
    } catch {
      /* usage DB optional */
    }
  }

  private apiKey(kind: 'llm' | 'image' | 'video' | 'tts' = 'llm'): string {
    const cfg = this.settings.getRaw();
    if (kind === 'llm') return cfg.llmApiKey || cfg.primaryApiKey || '';
    if (kind === 'tts') return cfg.ttsApiKey || cfg.primaryApiKey || '';
    if (kind === 'video') return cfg.videoApiKey || cfg.primaryApiKey || cfg.llmApiKey || '';
    return cfg.primaryApiKey || cfg.llmApiKey || '';
  }

  private baseUrl(override?: string, kind: 'primary' | 'video' | 'llm' = 'primary'): string {
    const cfg = this.settings.getRaw();
    const configured =
      kind === 'video'
        ? cfg.videoBaseUrl || cfg.primaryBaseUrl
        : kind === 'llm'
          ? cfg.llmBaseUrl || cfg.primaryBaseUrl
          : cfg.primaryBaseUrl;
    return (override || configured || 'https://api.openai.com/v1').replace(/\/$/, '');
  }

  private normalizeBaseUrl(value: string | undefined, fallback: string): string {
    return (value || fallback).replace(/\/$/, '');
  }

  private isLocalBaseUrl(baseUrl: string): boolean {
    return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(baseUrl);
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit = {},
    timeoutMs = 30000,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: init.signal ?? controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private resolveVideoProvider(body: Record<string, unknown>): VideoProviderRuntime {
    const cfg = this.settings.getRaw();
    const requested = String(body.provider || cfg.videoProvider || 'custom').toLowerCase();
    const kind: VideoProviderKind =
      requested === 'xai' ? 'xai' : requested === 'grokgo' || requested === 'grok-go' ? 'grokgo' : 'custom';

    if (kind === 'xai') {
      const baseUrl = this.normalizeBaseUrl(body.baseUrl as string || cfg.xaiBaseUrl, 'https://api.x.ai/v1');
      return {
        kind,
        apiKey: cfg.xaiApiKey || cfg.videoApiKey || '',
        baseUrl,
        label: 'xAI 官方视频 API',
        isLocalBridge: false,
      };
    }

    if (kind === 'grokgo') {
      const baseUrl = this.normalizeBaseUrl(
        (body.baseUrl as string) || cfg.grokGoBaseUrl || cfg.videoBaseUrl,
        'http://127.0.0.1:8787/v1',
      );
      return {
        kind,
        apiKey: cfg.grokGoApiKey || cfg.videoApiKey || cfg.primaryApiKey || cfg.llmApiKey || '',
        baseUrl,
        label: '本地 GrokGo 测试桥',
        isLocalBridge: true,
      };
    }

    const baseUrl = this.baseUrl(body.baseUrl as string, 'video');
    return {
      kind,
      apiKey: this.apiKey('video'),
      baseUrl,
      label: this.isLocalBaseUrl(baseUrl) ? '本地 OpenAI 兼容视频代理' : 'OpenAI 兼容视频 API',
      isLocalBridge: this.isLocalBaseUrl(baseUrl),
    };
  }

  private normalizeOpenAiVideoModel(model: string): string {
    if (model === 'grok') return 'grok-imagine-video';
    return model;
  }

  private normalizeOpenAiVideoResolution(resolution: unknown): string | undefined {
    const value = String(resolution ?? '').trim().toLowerCase();
    if (!value) return undefined;
    if (value.includes('1080')) return '1080p';
    if (value.includes('720')) return '720p';
    if (value.includes('480')) return '480p';
    return value;
  }

  private normalizeOpenAiVideoSize(
    size: unknown,
    opts: { model: string; resolution?: string; aspectRatio?: string },
  ): string | undefined {
    const raw = String(size ?? '').trim().toLowerCase();
    const model = opts.model.toLowerCase();
    if (!model.startsWith('grok-imagine-video')) return raw || undefined;

    const resolution = this.normalizeOpenAiVideoResolution(opts.resolution);
    const aspect = String(opts.aspectRatio ?? '').trim();
    if (aspect === '16:9') {
      if (resolution === '480p') return '848x480';
      if (resolution === '720p') return '1280x720';
      if (resolution === '1080p') return '1920x1080';
    }
    if (raw === '854x480') return '848x480';
    return raw || undefined;
  }

  private upstreamStatus(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
  }

  private isVideoProcessingStatus(value: unknown): boolean {
    return ['processing', 'queued', 'pending', 'running', 'in_progress', 'submitted', 'starting']
      .includes(this.upstreamStatus(value));
  }

  private isVideoSuccessStatus(value: unknown): boolean {
    return ['success', 'succeeded', 'completed', 'complete', 'done', 'finished']
      .includes(this.upstreamStatus(value));
  }

  private isVideoFailedStatus(value: unknown): boolean {
    return ['failed', 'error', 'cancelled', 'canceled']
      .includes(this.upstreamStatus(value));
  }

  private publicMediaUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/media/')) return `http://${HOST}:${PORT}${url}`;
    return url;
  }

  private imageUrlForOpenAiVideo(url: string, provider: VideoProviderRuntime, model: string): string {
    if (provider.isLocalBridge && model.toLowerCase().startsWith('grok-imagine-video') && url.startsWith('/media/')) {
      return this.mediaUrlToDataUri(url);
    }
    return this.publicMediaUrl(url);
  }

  async proxyLlmStream(
    messages: { role: string; content: string }[],
    userId: string | undefined,
    onChunk: (text: string) => void,
  ): Promise<string> {
    const apiKey = this.apiKey('llm');
    if (!apiKey) throw new BadRequestException('LLM API key not configured');
    const baseUrl = this.baseUrl(undefined, 'llm');
    const cfg = this.settings.getRaw();
    const model = cfg.llmModel || 'gpt-4o-mini';
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, stream: true }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new ServiceUnavailableException(`LLM stream error: ${text.slice(0, 300)}`);
    }
    const reader = res.body?.getReader();
    if (!reader) throw new ServiceUnavailableException('No response body');
    const decoder = new TextDecoder();
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n').filter((l) => l.startsWith('data: '))) {
        const json = line.slice(6).trim();
        if (json === '[DONE]') continue;
        try {
          const parsed = JSON.parse(json) as { choices?: { delta?: { content?: string } }[] };
          const text = parsed.choices?.[0]?.delta?.content ?? '';
          if (text) { full += text; onChunk(text); }
        } catch { /* ignore parse errors */ }
      }
    }
    return full;
  }

  async proxyLlm(body: Record<string, unknown>, userId?: string) {
    const apiKey = this.apiKey('llm');
    if (!apiKey) throw new BadRequestException('LLM API key not configured');

    const baseUrl = this.baseUrl(body.baseUrl as string, 'llm');
    const model = (body.model as string) || this.settings.getRaw().llmModel || 'gpt-4o-mini';
    const messages = body.messages;

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(body.response_format ? { response_format: body.response_format } : {}),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new ServiceUnavailableException(`Upstream LLM error: ${text.slice(0, 200)}`);
    }
    const json = await res.json();
    void this.track('llm', { userId, model });
    return json;
  }

  /** OpenAI-compatible /images/generations — saves PNG to storage/images. */
  async proxyImage(body: Record<string, unknown>, userId?: string): Promise<{
    ok: boolean;
    url: string;
    urls?: string[];
    revisedPrompt?: string;
    taskId?: string;
    status?: 'success' | 'processing' | 'failed';
    message?: string;
  }> {
    const prompt = ((body.prompt as string) ?? '').trim();
    if (!prompt) throw new BadRequestException('Image prompt is required');

    const model = (body.model as string) || 'gemini-2.5-flash-image';
    const size = (body.size as string) || '1024x1024';
    const n = Math.min(4, Math.max(1, (body.n as number) || 1));

    if (this.shouldUseMagicHour(model, body.provider as string | undefined)) {
      return this.proxyImageMagicHour({ prompt, model, size, n }, userId);
    }

    if (this.shouldUseGemini(model, body.provider as string | undefined)) {
      return this.proxyImageGemini(body, userId);
    }

    // 未显式选模型但已配置 Gemini、且无 OpenAI 主 Key 时，默认走 Gemini 图片
    if (this.gemini.hasKey() && !this.apiKey('image')) {
      const p = String(body.provider || '').toLowerCase();
      if (!p || p === 'openai' || p === 'auto') {
        return this.proxyImageGemini(
          { ...body, model: model && model !== 'dall-e-3' ? model : 'gemini-2.5-flash-image' },
          userId,
        );
      }
    }

    const apiKey = this.apiKey('image');
    if (!apiKey) {
      if (this.magicHour.hasKey()) {
        return this.proxyImageMagicHour({ prompt, model: 'magic-hour', size, n }, userId);
      }
      throw new BadRequestException('Primary API key not configured');
    }

    const baseUrl = this.baseUrl(body.baseUrl as string);

    const res = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, prompt, n, size, response_format: 'b64_json' }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new ServiceUnavailableException(`Upstream image error: ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      data?: { b64_json?: string; url?: string; revised_prompt?: string }[];
    };
    if (!json.data?.length) throw new ServiceUnavailableException('Empty image response');

    const urls: string[] = [];
    for (const item of json.data) {
      if (!existsSync(PATHS.images)) mkdirSync(PATHS.images, { recursive: true });
      const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;

      if (item.b64_json) {
        writeFileSync(join(PATHS.images, name), Buffer.from(item.b64_json, 'base64'));
      } else if (item.url) {
        const imgRes = await fetch(item.url);
        if (!imgRes.ok) throw new ServiceUnavailableException('Failed to download image URL');
        writeFileSync(join(PATHS.images, name), Buffer.from(await imgRes.arrayBuffer()));
      } else {
        continue;
      }
      urls.push(`/media/images/${encodeURIComponent(name)}`);
    }

    if (urls.length === 0) throw new ServiceUnavailableException('No image data in response');

    void this.track('image', { userId, model });
    return {
      ok: true,
      url: urls[0],
      urls,
      revisedPrompt: json.data[0].revised_prompt,
      status: 'success',
    };
  }

  private async proxyImageGemini(
    body: Record<string, unknown>,
    userId?: string,
  ): Promise<{
    ok: boolean;
    url: string;
    urls?: string[];
    revisedPrompt?: string;
    taskId?: string;
    status?: 'success' | 'processing' | 'failed';
    message?: string;
  }> {
    const prompt = ((body.prompt as string) ?? '').trim();
    const model = (body.model as string) || 'gemini-2.5-flash-image';
    const size = (body.size as string) || '1024x1024';
    const n = Math.min(4, Math.max(1, (body.n as number) || 1));

    const referenceParts: { inlineBase64?: string; mimeType?: string; text?: string }[] = [];
    const refCandidates: string[] = [];
    if (typeof body.referenceImageUrl === 'string' && body.referenceImageUrl.trim()) {
      refCandidates.push(body.referenceImageUrl.trim());
    }
    if (Array.isArray(body.referenceImageUrls)) {
      for (const u of body.referenceImageUrls as unknown[]) {
        if (typeof u === 'string' && u.trim()) refCandidates.push(u.trim());
      }
    }
    for (const refUrl of refCandidates.slice(0, 3)) {
      try {
        if (refUrl.startsWith('data:')) {
          const m = refUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (m) referenceParts.push({ inlineBase64: m[2], mimeType: m[1] });
          continue;
        }
        const local = resolveMediaUrl(refUrl);
        if (local && existsSync(local)) {
          const buf = readFileSync(local);
          const lower = local.toLowerCase();
          const mime = lower.endsWith('.png')
            ? 'image/png'
            : lower.endsWith('.webp')
              ? 'image/webp'
              : 'image/jpeg';
          referenceParts.push({ inlineBase64: buf.toString('base64'), mimeType: mime });
          continue;
        }
        if (/^https?:\/\//i.test(refUrl)) {
          const imgRes = await fetch(refUrl);
          if (imgRes.ok) {
            const buf = Buffer.from(await imgRes.arrayBuffer());
            const ct = imgRes.headers.get('content-type') || 'image/png';
            referenceParts.push({ inlineBase64: buf.toString('base64'), mimeType: ct });
          }
        }
      } catch {
        /* 参考图可选 */
      }
    }

    const imageSizeTier =
      (typeof body.imageSizeTier === 'string' && body.imageSizeTier.trim()) ||
      (typeof body.resolutionTier === 'string' && body.resolutionTier.trim()) ||
      undefined;

    const result = await this.gemini.generateImages({
      prompt,
      model,
      size,
      n,
      imageSizeTier,
      referenceParts: referenceParts.length ? referenceParts : undefined,
    });

    void this.track('image', { userId, model: result.model, units: result.urls.length });
    return {
      ok: true,
      url: result.urls[0],
      urls: result.urls,
      revisedPrompt: result.text,
      status: 'success',
    };
  }

  private async proxyImageMagicHour(
    opts: { prompt: string; model: string; size: string; n: number },
    userId?: string,
  ): Promise<{
    ok: boolean;
    url: string;
    urls?: string[];
    taskId?: string;
    status?: 'success' | 'processing' | 'failed';
    message?: string;
  }> {
    const created = await this.magicHour.createImage({
      prompt: opts.prompt,
      imageCount: opts.n,
      orientation: this.magicHour.orientationFromSize(opts.size),
    });
    const taskId = this.magicHour.encodeImageTaskId(created.id);
    const project = await this.magicHour.waitForProject('image', created.id, {
      attempts: 90,
      intervalMs: 2000,
    });

    if (project.status !== 'complete') {
      if (project.status === 'error' || project.status === 'canceled') {
        throw new ServiceUnavailableException(this.magicHour.projectErrorMessage(project));
      }
      // Leave async task id for client poll via /api/gateway/video/poll
      return {
        ok: false,
        url: '',
        taskId,
        status: 'processing',
        message: `Magic Hour 图片仍在队列中（${taskId}），请稍后重试`,
      };
    }

    const remoteUrls = this.magicHour.downloadUrls(project);
    if (!remoteUrls.length) {
      throw new ServiceUnavailableException('Magic Hour 图片完成但无下载地址');
    }
    const urls: string[] = [];
    for (const remote of remoteUrls) {
      urls.push(await this.saveRemoteImage(remote, 'mh'));
    }
    void this.track('image', { userId, model: opts.model || 'magic-hour' });
    return { ok: true, url: urls[0], urls, taskId, status: 'success' };
  }

  /**
   * Video generation — async-capable OpenAI-compatible endpoint.
   * Polls up to 90s when upstream returns task id.
   */
  async proxyVideo(body: Record<string, unknown>, userId?: string): Promise<{
    ok: boolean;
    url?: string;
    status: 'success' | 'processing' | 'failed';
    taskId?: string;
    message?: string;
  }> {
    const prompt = ((body.prompt as string) ?? '').trim();
    if (!prompt) throw new BadRequestException('Video prompt is required');

    const model = this.normalizeOpenAiVideoModel((body.model as string) || 'veo');
    if (this.shouldUseMagicHour(model, body.provider as string | undefined)) {
      return this.proxyVideoMagicHour(body, userId);
    }

    const provider = this.resolveVideoProvider(body);
    const { apiKey, baseUrl } = provider;
    if (!apiKey) {
      if (this.magicHour.hasKey()) return this.proxyVideoMagicHour(body, userId);
      throw new BadRequestException(`${provider.label} 未配置 API Key`);
    }

    const payload: Record<string, unknown> = { model, prompt };
    const imageUrl = typeof body.imageUrl === 'string'
      ? this.imageUrlForOpenAiVideo(body.imageUrl, provider, model)
      : '';
    if (imageUrl) {
      payload.image_url = imageUrl;
      if (model.startsWith('grok-imagine-video')) {
        payload.image = { url: imageUrl };
        payload.reference_image_url = { url: imageUrl };
        payload.first_frame_url = { url: imageUrl };
      }
    }
    if (body.aspect_ratio) payload.aspect_ratio = body.aspect_ratio;
    if (body.duration) payload.duration = body.duration;
    const normalizedResolution = this.normalizeOpenAiVideoResolution(body.resolution);
    const normalizedSize = this.normalizeOpenAiVideoSize(body.size, {
      model,
      resolution: normalizedResolution,
      aspectRatio: body.aspect_ratio as string | undefined,
    });
    if (normalizedSize) payload.size = normalizedSize;
    if (normalizedResolution) payload.resolution = normalizedResolution;

    let res: Response;
    try {
      res = await this.fetchWithTimeout(
        `${baseUrl}/videos/generations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
        },
        45000,
      );
    } catch (e) {
      throw new ServiceUnavailableException(
        `视频 API 连接失败：${provider.label}（${baseUrl}）。请确认服务可访问、Base URL 正确。${String(e)}`,
      );
    }

    if (res.status === 404 || res.status === 405) {
      if (this.magicHour.hasKey()) return this.proxyVideoMagicHour(body, userId);
      return {
        ok: false,
        status: 'failed',
        message:
          `当前通道不支持 /videos/generations：${provider.label}。请切换到 xAI 官方、GrokGo 测试桥，或配置支持视频的 OpenAI 兼容端点。`,
      };
    }

    if (!res.ok) {
      const text = await res.text();
      if (
        model.startsWith('grok-imagine-video') &&
        /text-to-video is not supported/i.test(text)
      ) {
        throw new ServiceUnavailableException(
          'Grok Imagine 需要图生视频，但代理没有识别到首图。请确认视频节点已连接图像节点，或上传首图后重试。',
        );
      }
      if (provider.kind === 'xai' && /\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(imageUrl)) {
        throw new ServiceUnavailableException(
          'xAI 官方接口无法读取本机图片地址。请先使用可公网访问的图片 URL，或切换到本地 GrokGo 测试桥。',
        );
      }
      throw new ServiceUnavailableException(`Upstream video error: ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as Record<string, unknown>;
    const taskId =
      (json.id as string) ||
      (json.task_id as string) ||
      (json.taskId as string) ||
      (json.video_id as string) ||
      (json.request_id as string) ||
      (json.requestId as string);

    if (this.isVideoProcessingStatus(json.status) || (taskId && !this.isVideoSuccessStatus(json.status))) {
      if (taskId) {
        const polled = await this.pollVideoTask(provider, taskId);
        if (polled) return polled;
      }
      return { ok: true, status: 'processing', taskId, message: '视频生成中，请稍后重试查询' };
    }

    const url = await this.extractVideoUrl(json);
    if (url) {
      const local = await this.saveVideoFromUrl(url, baseUrl);
      void this.track('video', { userId, model });
      return { ok: true, status: 'success', url: local, taskId };
    }

    return {
      ok: false,
      status: taskId ? 'processing' : 'failed',
      taskId,
      message: `视频 API 返回格式无法识别（字段: ${Object.keys(json).join(', ') || '空响应'}）`,
    };
  }

  private async proxyVideoMagicHour(
    body: Record<string, unknown>,
    userId?: string,
  ): Promise<{
    ok: boolean;
    url?: string;
    status: 'success' | 'processing' | 'failed';
    taskId?: string;
    message?: string;
  }> {
    const prompt = ((body.prompt as string) ?? '').trim();
    const model = (body.model as string) || 'magic-hour';
    const endSeconds = Number(body.duration) || 5;
    const aspectRatio = (body.aspect_ratio as string) || '16:9';
    const resolution = (body.resolution as string) || '480p';
    const generateAudio = (body.generateAudio as boolean | undefined) ?? false;
    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';

    let created: { id: string };
    if (imageUrl) {
      const imageFilePath = await this.magicHour.resolveImageFilePath(imageUrl);
      created = await this.magicHour.createImageToVideo({
        prompt,
        imageFilePath,
        endSeconds,
        resolution,
        model,
        audio: generateAudio,
      });
    } else {
      created = await this.magicHour.createTextToVideo({
        prompt,
        endSeconds,
        aspectRatio,
        resolution,
        model,
        audio: generateAudio,
      });
    }

    const taskId = this.magicHour.encodeVideoTaskId(created.id);
    const project = await this.magicHour.waitForProject('video', created.id, {
      attempts: 40,
      intervalMs: 3000,
    });

    if (project.status === 'complete') {
      const remote = this.magicHour.downloadUrls(project)[0];
      if (!remote) {
        return { ok: false, status: 'failed', taskId, message: 'Magic Hour 视频完成但无下载地址' };
      }
      const local = await this.saveVideoFromUrl(remote);
      void this.track('video', { userId, model });
      return { ok: true, status: 'success', url: local, taskId };
    }

    if (project.status === 'error' || project.status === 'canceled') {
      return {
        ok: false,
        status: 'failed',
        taskId,
        message: this.magicHour.projectErrorMessage(project),
      };
    }

    return {
      ok: true,
      status: 'processing',
      taskId,
      message: 'Magic Hour 视频生成中，请稍后轮询',
    };
  }

  async pollVideo(
    taskId: string,
    baseUrlOverride?: string,
    userId?: string,
  ): Promise<{
    ok: boolean;
    url?: string;
    status: 'success' | 'processing' | 'failed';
    taskId: string;
    message?: string;
  }> {
    const mh = this.magicHour.decodeTaskId(taskId);
    if (mh) {
      const project =
        mh.kind === 'image'
          ? await this.magicHour.getImageProject(mh.id)
          : await this.magicHour.getVideoProject(mh.id);

      if (project.status === 'complete') {
        const remote = this.magicHour.downloadUrls(project)[0];
        if (!remote) {
          return {
            ok: false,
            status: 'failed',
            taskId,
            message: 'Magic Hour 完成但无下载地址',
          };
        }
        const local =
          mh.kind === 'image'
            ? await this.saveRemoteImage(remote, 'mh')
            : await this.saveVideoFromUrl(remote);
        if (mh.kind === 'video') void this.track('video', { userId });
        if (mh.kind === 'image') void this.track('image', { userId });
        return { ok: true, status: 'success', url: local, taskId };
      }

      if (project.status === 'error' || project.status === 'canceled') {
        return {
          ok: false,
          status: 'failed',
          taskId,
          message: this.magicHour.projectErrorMessage(project),
        };
      }

      return {
        ok: true,
        status: 'processing',
        taskId,
        message: `Magic Hour 状态: ${project.status}`,
      };
    }

    const provider = this.resolveVideoProvider(baseUrlOverride ? { baseUrl: baseUrlOverride } : {});
    if (!provider.apiKey) throw new BadRequestException(`${provider.label} 未配置 API Key`);
    const polled = await this.pollVideoTask(provider, taskId);
    if (polled?.status === 'success' && polled.url) {
      void this.track('video', { userId });
    }
    return (
      polled ?? {
        ok: false,
        status: 'processing',
        taskId,
        message: '视频仍在生成中',
      }
    );
  }

  private async pollVideoTask(
    provider: VideoProviderRuntime,
    taskId: string,
  ): Promise<{ ok: boolean; url?: string; status: 'success' | 'processing' | 'failed'; taskId: string; message?: string } | null> {
    for (let i = 0; i < 18; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const json = await this.fetchVideoTaskStatus(provider, taskId);
      if (!json) continue;
      const message = this.upstreamErrorMessage(json);
      if (this.isVideoFailedStatus(json.status)) {
        return { ok: false, status: 'failed', taskId, message };
      }
      if (this.isVideoSuccessStatus(json.status)) {
        const url = await this.extractVideoUrl(json);
        if (url) {
          const local = await this.saveVideoFromUrl(url, provider.baseUrl);
          return { ok: true, status: 'success', url: local, taskId };
        }
        return { ok: false, status: 'failed', taskId, message: '视频任务完成但未返回可下载地址' };
      }
      const url = await this.extractVideoUrl(json);
      if (url) {
        const local = await this.saveVideoFromUrl(url, provider.baseUrl);
        return { ok: true, status: 'success', url: local, taskId };
      }
    }
    return null;
  }

  private async fetchVideoTaskStatus(
    provider: VideoProviderRuntime,
    taskId: string,
  ): Promise<Record<string, unknown> | null> {
    for (const path of [`/videos/generations/${taskId}`, `/videos/${taskId}`]) {
      let res: Response;
      try {
        res = await this.fetchWithTimeout(
          `${provider.baseUrl}${path}`,
          { headers: { Authorization: `Bearer ${provider.apiKey}` } },
          15000,
        );
      } catch {
        continue;
      }
      if (!res.ok) continue;
      return (await res.json()) as Record<string, unknown>;
    }
    return null;
  }

  private upstreamErrorMessage(json: Record<string, unknown>): string | undefined {
    if (typeof json.message === 'string') return json.message;
    if (typeof json.error === 'string') return json.error;
    const error = json.error as { message?: unknown; code?: unknown } | undefined;
    if (typeof error?.message === 'string') return error.message;
    if (typeof error?.code === 'string') return error.code;
    return undefined;
  }

  private async extractVideoUrl(json: Record<string, unknown>): Promise<string | null> {
    const data = json.data as { url?: string; b64_json?: string; content?: string; video?: { url?: string; video_url?: string } }[] | undefined;
    if (data?.[0]?.url) return data[0].url;
    if (data?.[0]?.video?.url) return data[0].video.url;
    if (data?.[0]?.video?.video_url) return data[0].video.video_url;
    if (data?.[0]?.b64_json) return `data:video/mp4;base64,${data[0].b64_json}`;
    if (data?.[0]?.content) return data[0].content;
    if (typeof json.url === 'string') return json.url;
    if (typeof json.video_url === 'string') return json.video_url;
    if (typeof json.download_url === 'string') return json.download_url;
    if (typeof json.output_url === 'string') return json.output_url;
    const video = json.video as { url?: string; video_url?: string } | undefined;
    if (video?.url) return video.url;
    if (video?.video_url) return video.video_url;
    const output = json.output as { url?: string; video_url?: string } | undefined;
    if (output?.url) return output.url;
    if (output?.video_url) return output.video_url;
    const result = json.result as { url?: string; video_url?: string } | undefined;
    if (result?.url) return result.url;
    if (result?.video_url) return result.video_url;
    const videos = json.videos as { url?: string; video_url?: string }[] | undefined;
    if (videos?.[0]?.url) return videos[0].url;
    if (videos?.[0]?.video_url) return videos[0].video_url;
    const artifacts = json.artifacts as { url?: string }[] | undefined;
    if (artifacts?.[0]?.url) return artifacts[0].url;
    return null;
  }

  private async saveVideoFromUrl(url: string, baseUrl?: string): Promise<string> {
    if (!existsSync(PATHS.videos)) mkdirSync(PATHS.videos, { recursive: true });
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
    if (url.startsWith('data:video/')) {
      const base64 = url.split(',')[1] ?? '';
      if (!base64) throw new ServiceUnavailableException('视频返回了空的 base64 数据');
      writeFileSync(join(PATHS.videos, name), Buffer.from(base64, 'base64'));
      return `/media/videos/${encodeURIComponent(name)}`;
    }
    const absoluteUrl = this.resolveUpstreamUrl(url, baseUrl);
    let res: Response;
    try {
      res = await this.fetchWithTimeout(absoluteUrl, {}, 60000);
    } catch {
      return absoluteUrl;
    }
    if (!res.ok) return absoluteUrl;
    writeFileSync(join(PATHS.videos, name), Buffer.from(await res.arrayBuffer()));
    return `/media/videos/${encodeURIComponent(name)}`;
  }

  private resolveUpstreamUrl(url: string, baseUrl?: string): string {
    if (/^https?:\/\//i.test(url)) return url;
    if (!baseUrl) return url;
    const base = new URL(baseUrl);
    if (url.startsWith('/')) return `${base.origin}${url}`;
    return new URL(url, `${base.href.replace(/\/+$/, '')}/`).toString();
  }

  private saveAudioBuffer(buffer: Buffer, prefix: string, ext = 'wav'): string {
    const name = `${Date.now()}-${prefix}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    if (!existsSync(PATHS.audio)) mkdirSync(PATHS.audio, { recursive: true });
    writeFileSync(join(PATHS.audio, name), buffer);
    return `/media/audio/${encodeURIComponent(name)}`;
  }

  private resolveLuxTtsReference(
    body: Record<string, unknown>,
    voice: string,
    cfg: ReturnType<SettingsService['getRaw']>,
  ): { referenceAudioPath?: string; profileId?: string } {
    const profileId = (body.profileId as string) || (body.luxTtsProfileId as string) || undefined;
    if (profileId && !body.referenceAudioUrl && !body.referenceAudioPath) {
      return { profileId };
    }

    let referenceAudioUrl = (body.referenceAudioUrl as string) || undefined;
    let referenceAudioPath = (body.referenceAudioPath as string) || undefined;

    if (voice.startsWith('luxtts:')) {
      const tail = voice.slice('luxtts:'.length).trim();
      if (tail.startsWith('/media/')) referenceAudioUrl = tail;
      else if (tail) referenceAudioPath = tail;
    }

    if (!referenceAudioUrl && !referenceAudioPath && cfg.luxTtsDefaultReferenceAudio) {
      referenceAudioUrl = cfg.luxTtsDefaultReferenceAudio;
    }

    const resolved = resolveReferenceAudioPath(referenceAudioUrl, referenceAudioPath);
    return resolved ? { referenceAudioPath: resolved, profileId } : { profileId };
  }

  private shouldTryLuxTts(
    body: Record<string, unknown>,
    voice: string,
    cfg: ReturnType<SettingsService['getRaw']>,
  ): boolean {
    if (!cfg.luxTtsEnabled || !cfg.luxTtsBaseUrl) return false;
    if (body.useLuxTts === true) return true;
    if (body.referenceAudioUrl || body.referenceAudioPath || body.profileId || body.luxTtsProfileId) {
      return true;
    }
    if (voice.startsWith('luxtts:')) return true;
    if (cfg.luxTtsDefaultReferenceAudio && body.useLuxTts === true) return true;
    return false;
  }

  private async getLuxProbe(baseUrl: string): Promise<LuxTtsProbeResult> {
    const now = Date.now();
    if (
      this.luxProbeCache &&
      this.luxProbeCache.url === baseUrl &&
      now - this.luxProbeCache.at < 30_000
    ) {
      return this.luxProbeCache.result;
    }
    const result = await this.luxtts.probe(baseUrl);
    this.luxProbeCache = { url: baseUrl, at: now, result };
    return result;
  }

  private isLuxTtsOnCpu(probe: LuxTtsProbeResult): boolean {
    if (probe.runningOnCpu === true) return true;
    if (probe.gpuAvailable === false) return true;
    const dev = (probe.activeDevice ?? probe.device ?? '').toLowerCase();
    return dev === 'cpu';
  }

  private resolveNoGpuFallback(
    body: Record<string, unknown>,
    cfg: ReturnType<SettingsService['getRaw']>,
  ): LuxTtsNoGpuFallback {
    const override = body.luxTtsNoGpuFallback;
    if (override === 'cpu' || override === 'cloud') return override;
    return cfg.luxTtsNoGpuFallback === 'cpu' ? 'cpu' : 'cloud';
  }

  private cloudVoiceFromBody(body: Record<string, unknown>, voice: string): string {
    const explicit = (body.fallbackVoice as string) || (body.cloudVoice as string);
    if (explicit && !explicit.startsWith('luxtts:')) return explicit;
    if (voice.startsWith('luxtts:')) return 'alloy';
    return voice;
  }

  async proxyTts(body: Record<string, unknown>, userId?: string): Promise<{
    ok: boolean;
    url: string;
    bytes: number;
    provider?: 'luxtts' | 'voicebox' | 'openai-compatible';
    fallback?: TtsFallbackInfo;
  }> {
    const cfg = this.settings.getRaw();
    const input = (body.input as string) ?? '';
    if (!input.trim()) throw new BadRequestException('TTS input text is required');

    const voice = (body.voice as string) || cfg.voiceboxDefaultProfile || 'alloy';
    let luxSkipFallback: TtsFallbackInfo | undefined;

    if (this.shouldTryLuxTts(body, voice, cfg)) {
      const luxBase = (body.luxTtsBaseUrl as string) || cfg.luxTtsBaseUrl || 'http://127.0.0.1:17880';
      const ref = this.resolveLuxTtsReference(body, voice, cfg);
      try {
        const probe = await this.getLuxProbe(luxBase);
        const noGpuFallback = this.resolveNoGpuFallback(body, cfg);
        const onCpu = this.isLuxTtsOnCpu(probe);

        if (onCpu && noGpuFallback === 'cloud') {
          luxSkipFallback = {
            from: 'luxtts',
            to: 'cloud',
            applied: 'cloud',
            reason:
              probe.recommendation ??
              '未检测到 GPU，已按设置跳过 LuxTTS 本地推理，改走 Voicebox / 云端 TTS',
          };
        } else if (probe.available && (ref.referenceAudioPath || ref.profileId)) {
          const { buffer } = await this.luxtts.synthesize(luxBase, input, {
            referenceAudioPath: ref.referenceAudioPath,
            profileId: ref.profileId,
            rms: (body.rms as number) ?? cfg.luxTtsRms ?? 0.01,
            t_shift: (body.t_shift as number) ?? cfg.luxTtsTShift ?? 0.9,
            num_steps: (body.num_steps as number) ?? cfg.luxTtsNumSteps ?? 4,
            speed: (body.speed as number) ?? cfg.luxTtsSpeed ?? 1.0,
            return_smooth: (body.return_smooth as boolean) ?? cfg.luxTtsReturnSmooth ?? false,
            ref_duration: (body.ref_duration as number) ?? cfg.luxTtsRefDuration ?? 5,
          });
          const url = this.saveAudioBuffer(buffer, 'lux');
          void this.track('tts', { userId, model: onCpu ? 'luxtts-cpu' : 'luxtts' });
          return {
            ok: true,
            url,
            bytes: buffer.length,
            provider: 'luxtts',
            ...(onCpu
              ? {
                  fallback: {
                    from: 'luxtts' as const,
                    to: 'cpu' as const,
                    applied: 'cpu' as const,
                    reason: '当前使用 LuxTTS CPU 推理（无 GPU，速度较慢）',
                  },
                }
              : {}),
          };
        }
      } catch {
        /* fall through */
      }
    }

    const effectiveVoice = luxSkipFallback ? this.cloudVoiceFromBody(body, voice) : voice;

    if (cfg.voiceboxEnabled && cfg.voiceboxBaseUrl) {
      try {
        const probe = await this.voicebox.probe(cfg.voiceboxBaseUrl);
        if (probe.available) {
          const { buffer } = await this.voicebox.synthesize(cfg.voiceboxBaseUrl, input, effectiveVoice);
          const url = this.saveAudioBuffer(buffer, 'vb');
          void this.track('tts', { userId, model: 'voicebox' });
          return {
            ok: true,
            url,
            bytes: buffer.length,
            provider: 'voicebox',
            ...(luxSkipFallback ? { fallback: luxSkipFallback } : {}),
          };
        }
      } catch {
        /* fall through to cloud TTS */
      }
    }

    const apiKey = this.apiKey('tts');
    if (!apiKey) throw new BadRequestException('TTS API key not configured');

    const baseUrl = this.baseUrl((body.ttsBaseUrl as string) || cfg.ttsBaseUrl);
    const model = (body.model as string) || 'tts-1';
    const format = (body.response_format as string) || 'mp3';

    const res = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, voice: effectiveVoice, input, response_format: format }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new ServiceUnavailableException(`Upstream TTS error: ${text.slice(0, 200)}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const ext = format === 'mp3' ? 'mp3' : format;
    const url = this.saveAudioBuffer(buf, 'cloud', ext);
    void this.track('tts', { userId, model });
    return {
      ok: true,
      url,
      bytes: buf.length,
      provider: 'openai-compatible',
      ...(luxSkipFallback ? { fallback: luxSkipFallback } : {}),
    };
  }

  async probeVoicebox(baseUrl?: string) {
    const cfg = this.settings.getRaw();
    const url = baseUrl || cfg.voiceboxBaseUrl || 'http://127.0.0.1:17493';
    return this.voicebox.probe(url);
  }

  async probeLuxTts(baseUrl?: string) {
    const cfg = this.settings.getRaw();
    const url = baseUrl || cfg.luxTtsBaseUrl || 'http://127.0.0.1:17880';
    const result = await this.getLuxProbe(url);
    const noGpuFallback = cfg.luxTtsNoGpuFallback === 'cpu' ? 'cpu' : 'cloud';
    if (result.available && cfg.luxTtsWarmOnProbe !== false && cfg.luxTtsDefaultReferenceAudio) {
      const ref = resolveReferenceAudioPath(cfg.luxTtsDefaultReferenceAudio);
      if (ref) {
        try {
          await this.luxtts.encode(url, ref, { profileId: 'nx9-default', rms: cfg.luxTtsRms ?? 0.01 });
        } catch {
          /* warm-up optional */
        }
      }
    }
    return {
      ...result,
      noGpuFallback,
      effectiveStrategy:
        this.isLuxTtsOnCpu(result) && noGpuFallback === 'cloud'
          ? '将跳过 LuxTTS，改走 Voicebox / 云端 TTS'
          : this.isLuxTtsOnCpu(result)
            ? '将使用 LuxTTS CPU 推理（较慢）'
            : '将使用 LuxTTS GPU 推理',
    };
  }

  async probeProviders() {
    const cfg = this.settings.getRaw();
    const providers = cfg.advancedProviders ?? [];
    const results = await Promise.all(
      providers.filter((p) => p.enabled !== false).map(async (p) => {
        if (p.protocol === 'openai-compat' && p.baseUrl && p.apiKey) {
          try {
            const res = await fetch(`${p.baseUrl.replace(/\/+$/, '')}/v1/models`, {
              headers: { Authorization: `Bearer ${p.apiKey}` },
              signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) {
              return { id: p.id, label: p.label, available: false, message: `HTTP ${res.status}` };
            }
            const json = (await res.json()) as { data?: { id: string }[] };
            const models = json.data?.map((m) => m.id) ?? [];
            return { id: p.id, label: p.label, available: true, models, message: `可用模型: ${models.length} 个` };
          } catch (e) {
            return { id: p.id, label: p.label, available: false, message: String(e) };
          }
        }
        try {
          const res = await fetch(p.baseUrl ?? '', { method: 'HEAD', signal: AbortSignal.timeout(5000) });
          return { id: p.id, label: p.label, available: true, message: res.ok ? '已连接' : `HTTP ${res.status}` };
        } catch (e) {
          return { id: p.id, label: p.label, available: false, message: String(e) };
        }
      }),
    );

    if (this.magicHour.hasKey()) {
      results.unshift({
        id: 'magic-hour',
        label: 'Magic Hour',
        available: true,
        message: 'MAGIC_HOUR_API_KEY 已加载（apps/server/.env）',
      });
    } else {
      results.unshift({
        id: 'magic-hour',
        label: 'Magic Hour',
        available: false,
        message: '未配置 MAGIC_HOUR_API_KEY',
      });
    }

    if (this.gemini.hasKey()) {
      results.unshift({
        id: 'gemini',
        label: 'Google Gemini / Imagen',
        available: true,
        message: `Gemini Key 已配置 · ${this.gemini.resolveBaseUrl()}`,
      });
    } else {
      results.unshift({
        id: 'gemini',
        label: 'Google Gemini / Imagen',
        available: false,
        message: '未配置 GEMINI_API_KEY / 设置中的 Gemini API Key',
      });
    }

    return { providers: results };
  }

  private mediaUrlToDataUri(url: string): string {
    const local = resolveMediaUrl(url);
    if (!local) throw new BadRequestException(`无法解析本地媒体: ${url}`);
    const buf = readFileSync(local);
    const lower = local.toLowerCase();
    const mime = lower.endsWith('.png')
      ? 'image/png'
      : lower.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  }

  private async saveRemoteImage(url: string, prefix = 'fal'): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new ServiceUnavailableException('Failed to download Fal output');
    if (!existsSync(PATHS.images)) mkdirSync(PATHS.images, { recursive: true });
    const name = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`;
    writeFileSync(join(PATHS.images, name), Buffer.from(await res.arrayBuffer()));
    return `/media/images/${encodeURIComponent(name)}`;
  }

  /** Fal.ai 同步推理 — 使用 primaryApiKey 作为 Fal Key */
  async proxyFal(
    body: { model: string; input: Record<string, unknown> },
    userId?: string,
  ): Promise<{ ok: boolean; url?: string; output?: Record<string, unknown> }> {
    const apiKey = this.settings.getRaw().primaryApiKey || '';
    if (!apiKey) throw new BadRequestException('请在设置中配置 Fal.ai API Key（primaryApiKey）');

    const model = (body.model ?? '').replace(/^\/+/, '').trim();
    if (!model) throw new BadRequestException('Fal model id is required');

    const input = { ...(body.input ?? {}) };
    for (const key of ['image_url', 'image', 'video_url']) {
      const val = input[key];
      if (typeof val === 'string' && val.startsWith('/media/')) {
        input[key] = this.mediaUrlToDataUri(val);
      }
    }

    const res = await fetch(`https://fal.run/${model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new ServiceUnavailableException(`Fal error: ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as Record<string, unknown>;
    void this.track('image', { userId, model: `fal:${model}` });

    const imageUrl =
      (json.image as { url?: string })?.url ||
      (json.images as { url?: string }[])?.[0]?.url ||
      (json.output as { url?: string })?.url ||
      (typeof json.url === 'string' ? json.url : undefined);

    if (imageUrl) {
      const saved = await this.saveRemoteImage(imageUrl, 'fal');
      return { ok: true, url: saved, output: json };
    }

    const requestId =
      (json.request_id as string) ||
      (json.requestId as string) ||
      (json.id as string);
    const status = (json.status as string) || '';
    if (requestId && /inprogress|queued|processing/i.test(status)) {
      return this.pollFalRequest(model, requestId, apiKey, userId);
    }
    if (status && /inprogress|queued|processing/i.test(status) && !requestId) {
      throw new ServiceUnavailableException(`Fal 任务已排队但缺少 request_id，无法轮询：${status}`);
    }

    return { ok: true, output: json };
  }

  private async pollFalRequest(
    model: string,
    requestId: string,
    apiKey: string,
    userId?: string,
  ): Promise<{ ok: boolean; url?: string; output?: Record<string, unknown> }> {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const pollRes = await fetch(`https://fal.run/${model}/requests/${requestId}`, {
        method: 'GET',
        headers: { Authorization: `Key ${apiKey}` },
      });
      if (!pollRes.ok) continue;
      const json = (await pollRes.json()) as Record<string, unknown>;
      const imageUrl =
        (json.image as { url?: string })?.url ||
        (json.images as { url?: string }[])?.[0]?.url ||
        (json.output as { url?: string })?.url ||
        (typeof json.url === 'string' ? json.url : undefined);
      if (imageUrl) {
        const saved = await this.saveRemoteImage(imageUrl, 'fal');
        void this.track('image', { userId, model: `fal:${model}` });
        return { ok: true, url: saved, output: json };
      }
      const status = (json.status as string) || '';
      if (/error|failed|cancel/i.test(status)) {
        throw new ServiceUnavailableException(`Fal 任务失败：${status}`);
      }
    }
    throw new ServiceUnavailableException('Fal 任务轮询超时（90s），请稍后在客户端重试查询');
  }

  private resolveComfyBaseUrl(override?: string): string {
    const trimmed = override?.trim();
    if (trimmed) return trimmed.replace(/\/+$/, '');
    const providers = this.settings.getRaw().advancedProviders ?? [];
    const comfy = providers.find(
      (p) => p.protocol === 'comfyui' && p.enabled !== false && p.baseUrl?.trim(),
    );
    if (comfy?.baseUrl) return comfy.baseUrl.replace(/\/+$/, '');
    throw new BadRequestException(
      '请配置 ComfyUI 地址（设置 → 高级 Provider → protocol: comfyui）或在模块中填写 Base URL',
    );
  }

  private injectComfyPrompt(
    workflow: Record<string, unknown>,
    prompt: string,
  ): Record<string, unknown> {
    const next = JSON.parse(JSON.stringify(workflow)) as Record<
      string,
      { class_type?: string; inputs?: Record<string, unknown> }
    >;
    for (const node of Object.values(next)) {
      if (!node?.inputs || typeof node.inputs.text !== 'string') continue;
      if (node.class_type?.includes('CLIPTextEncode') || !node.inputs.text.includes('negative')) {
        node.inputs.text = prompt;
        break;
      }
    }
    return next;
  }

  async proxyComfy(
    body: { workflow: Record<string, unknown>; baseUrl?: string; prompt?: string },
    userId?: string,
  ): Promise<{ ok: boolean; url?: string; promptId?: string; message?: string }> {
    const baseUrl = this.resolveComfyBaseUrl(body.baseUrl);
    if (!body.workflow || typeof body.workflow !== 'object') {
      throw new BadRequestException('ComfyUI workflow JSON is required');
    }

    let workflow = body.workflow;
    if (typeof body.prompt === 'string' && body.prompt.trim()) {
      workflow = this.injectComfyPrompt(workflow, body.prompt.trim());
    }

    const clientId = `nx9-${Date.now()}`;
    const submit = await fetch(`${baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    });
    if (!submit.ok) {
      throw new ServiceUnavailableException(`ComfyUI submit error: ${(await submit.text()).slice(0, 300)}`);
    }

    const submitted = (await submit.json()) as { prompt_id?: string };
    const promptId = submitted.prompt_id;
    if (!promptId) throw new ServiceUnavailableException('ComfyUI 未返回 prompt_id');

    for (let attempt = 0; attempt < 90; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      const histRes = await fetch(`${baseUrl}/history/${promptId}`);
      if (!histRes.ok) continue;
      const hist = (await histRes.json()) as Record<
        string,
        {
          outputs?: Record<
            string,
            { images?: { filename: string; subfolder?: string; type?: string }[] }
          >;
        }
      >;
      const entry = hist[promptId];
      const images = entry?.outputs
        ? Object.values(entry.outputs).flatMap((o) => o.images ?? [])
        : [];
      if (images.length === 0) continue;

      const img = images[0];
      const viewUrl = `${baseUrl}/view?filename=${encodeURIComponent(img.filename)}&type=${encodeURIComponent(img.type ?? 'output')}${img.subfolder ? `&subfolder=${encodeURIComponent(img.subfolder)}` : ''}`;
      const imgRes = await fetch(viewUrl);
      if (!imgRes.ok) continue;

      if (!existsSync(PATHS.images)) mkdirSync(PATHS.images, { recursive: true });
      const name = `${Date.now()}-comfy-${Math.random().toString(36).slice(2, 8)}.png`;
      writeFileSync(join(PATHS.images, name), Buffer.from(await imgRes.arrayBuffer()));
      void this.track('image', { userId, model: 'comfyui' });
      return {
        ok: true,
        url: `/media/images/${encodeURIComponent(name)}`,
        promptId,
      };
    }

    return {
      ok: false,
      promptId,
      message: 'ComfyUI 任务超时（180s），请检查本地 ComfyUI 是否仍在运行',
    };
  }
}
