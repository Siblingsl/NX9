import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PATHS } from '../../config/app.config';
import { SettingsService } from '../settings/settings.service';

/**
 * Google Gemini / Imagen 原生图片生成
 * 文档：https://ai.google.dev/gemini-api/docs/image-generation
 *
 * 主路径：POST /v1beta/models/{model}:generateContent
 * 兼容：Interactions API / Imagen :predict
 */
export const GEMINI_IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-image-preview',
  'gemini-3.1-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3.1-flash-lite-image',
  'gemini-3-pro-image',
  'gemini-3-pro-image-preview',
  'imagen-4.0-generate-001',
  'imagen-4.0-ultra-generate-001',
  'imagen-4.0-fast-generate-001',
] as const;

const DEFAULT_GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export type GeminiImageAspect =
  | '1:1'
  | '2:3'
  | '3:2'
  | '3:4'
  | '4:3'
  | '4:5'
  | '5:4'
  | '9:16'
  | '16:9'
  | '21:9';

export type GeminiImageSizeTier = '1K' | '2K' | '4K';

export interface GeminiImagePartInput {
  text?: string;
  inlineBase64?: string;
  mimeType?: string;
}

export interface GeminiGenerateImageOpts {
  prompt: string;
  model?: string;
  /** 如 1024x1024 / 1792x1024，或 16:9 */
  size?: string;
  n?: number;
  referenceParts?: GeminiImagePartInput[];
  /** 1K / 2K / 4K（Gemini 3 系列；2.5 也可能忽略） */
  imageSizeTier?: string;
}

@Injectable()
export class GeminiAdapter {
  constructor(private readonly settings: SettingsService) {}

  hasKey(): boolean {
    return Boolean(this.resolveApiKey());
  }

  resolveApiKey(): string {
    const cfg = this.settings.getRaw();
    return (
      (cfg.geminiApiKey || '').trim() ||
      (process.env.GEMINI_API_KEY || '').trim() ||
      (process.env.GOOGLE_API_KEY || '').trim() ||
      (process.env.GOOGLE_AI_API_KEY || '').trim()
    );
  }

  resolveBaseUrl(): string {
    const cfg = this.settings.getRaw();
    const raw =
      (cfg.geminiBaseUrl || '').trim() ||
      (process.env.GEMINI_BASE_URL || '').trim() ||
      DEFAULT_GEMINI_BASE;
    return raw.replace(/\/$/, '');
  }

  isGeminiModel(model?: string): boolean {
    if (!model) return false;
    const m = model.toLowerCase();
    if (GEMINI_IMAGE_MODELS.some((id) => id === m)) return true;
    if (m.startsWith('gemini-') && m.includes('image')) return true;
    if (m.startsWith('imagen-')) return true;
    if (
      m === 'gemini' ||
      m === 'nano-banana' ||
      m === 'nano-banana-2' ||
      m === 'nano-banana-pro' ||
      m === 'nano-banana-lite'
    ) {
      return true;
    }
    return false;
  }

  aspectFromSize(size?: string): GeminiImageAspect {
    if (!size) return '1:1';
    const s = size.toLowerCase().trim();
    if (
      ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'].includes(s)
    ) {
      return s as GeminiImageAspect;
    }
    const m = s.match(/^(\d+)\s*x\s*(\d+)$/i);
    if (!m) return '1:1';
    const w = Number(m[1]);
    const h = Number(m[2]);
    if (!w || !h) return '1:1';
    const r = w / h;
    if (Math.abs(r - 1) < 0.08) return '1:1';
    if (Math.abs(r - 16 / 9) < 0.12) return '16:9';
    if (Math.abs(r - 9 / 16) < 0.12) return '9:16';
    if (Math.abs(r - 4 / 3) < 0.12) return '4:3';
    if (Math.abs(r - 3 / 4) < 0.12) return '3:4';
    if (Math.abs(r - 3 / 2) < 0.12) return '3:2';
    if (Math.abs(r - 2 / 3) < 0.12) return '2:3';
    if (Math.abs(r - 21 / 9) < 0.15) return '21:9';
    if (Math.abs(r - 5 / 4) < 0.1) return '5:4';
    if (Math.abs(r - 4 / 5) < 0.1) return '4:5';
    return r > 1 ? '16:9' : '9:16';
  }

  /** 根据 size 最长边推断 1K/2K/4K */
  imageSizeTierFromSize(size?: string, explicit?: string): GeminiImageSizeTier {
    const e = (explicit || '').toLowerCase().replace(/\s+/g, '');
    if (e === '4k' || e === '4' || e === 'uhd') return '4K';
    if (e === '2k' || e === '2' || e === 'hd') return '2K';
    if (e === '1k' || e === '1' || e === 'sd') return '1K';
    if (!size) return '2K';
    const m = size.match(/^(\d+)\s*x\s*(\d+)$/i);
    if (!m) return '2K';
    const maxSide = Math.max(Number(m[1]), Number(m[2]));
    if (maxSide >= 3000) return '4K';
    if (maxSide >= 1500) return '2K';
    return '1K';
  }

  /**
   * NX9 节点 model id → 官方 API model id
   * 原则：用户在 UI 选了哪个 id，就尽量原样调用（Pro 可直连 gemini-3.1-flash-image 等）。
   * 仅对别名 / 旧昵称做映射；preview 回落由 modelFallbacks 在请求失败时再试。
   */
  resolveModelId(model?: string): string {
    const m = (model || '').toLowerCase().trim();
    if (!m || m === 'gemini' || m === 'nano-banana' || m === 'gemini-flash-image') {
      return 'gemini-2.5-flash-image';
    }
    // 2.5 Flash Image
    if (m === 'gemini-2.5-flash-image' || m === 'gemini-2.5-flash-image-preview') {
      return m.endsWith('-preview') ? 'gemini-2.5-flash-image-preview' : 'gemini-2.5-flash-image';
    }
    // 3.1 Flash Image（Pro 常用；用户明确选择时绝不改写为 preview）
    if (m === 'gemini-3.1-flash-image') {
      return 'gemini-3.1-flash-image';
    }
    if (m === 'gemini-3.1-flash-image-preview' || m === 'nano-banana-2' || m === 'gemini-3-flash-image') {
      // 旧昵称默认走稳定 id；仅 preview 自身保留
      return m === 'gemini-3.1-flash-image-preview'
        ? 'gemini-3.1-flash-image-preview'
        : 'gemini-3.1-flash-image';
    }
    // 3.1 Flash Lite
    if (
      m === 'gemini-3.1-flash-lite-image' ||
      m === 'gemini-3.1-flash-lite-image-preview' ||
      m === 'nano-banana-lite' ||
      m === 'gemini-flash-lite-image'
    ) {
      return m.endsWith('-preview')
        ? 'gemini-3.1-flash-lite-image-preview'
        : 'gemini-3.1-flash-lite-image';
    }
    // 3 Pro Image
    if (m === 'gemini-3-pro-image') {
      return 'gemini-3-pro-image';
    }
    if (
      m === 'gemini-3-pro-image-preview' ||
      m === 'gemini-pro-image' ||
      m === 'nano-banana-pro'
    ) {
      return m === 'gemini-3-pro-image-preview' ? 'gemini-3-pro-image-preview' : 'gemini-3-pro-image';
    }
    // Imagen 4 系列
    if (m === 'imagen-4' || m === 'imagen4' || m === 'imagen-4.0-generate-001') {
      return 'imagen-4.0-generate-001';
    }
    if (m === 'imagen-4-ultra' || m === 'imagen-4.0-ultra-generate-001') {
      return 'imagen-4.0-ultra-generate-001';
    }
    if (m === 'imagen-4-fast' || m === 'imagen-4.0-fast-generate-001') {
      return 'imagen-4.0-fast-generate-001';
    }
    // 已是官方 id / 未知 id：原样透传
    return model!.trim();
  }

  private headers(): Record<string, string> {
    const key = this.resolveApiKey();
    if (!key) {
      throw new BadRequestException(
        '未配置 Gemini API Key：请在设置 → 图片模型填写，或在 apps/server/.env 设置 GEMINI_API_KEY',
      );
    }
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
    };
  }


  /** 统一 fetch，把网络失败转成可读中文（避免只显示 fetch failed） */

  /** 把 Google 上游 HTTP 错误转成可读中文 */
  private formatUpstreamError(status: number, model: string, body: string, via: string): string {
    let parsed: { error?: { message?: string; status?: string; code?: number } } | null = null;
    try {
      parsed = JSON.parse(body) as { error?: { message?: string; status?: string; code?: number } };
    } catch {
      parsed = null;
    }
    const apiMsg = (parsed?.error?.message || body || "").replace(/\s+/g, " ").trim();

    if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate.?limit|exceeded your current quota/i.test(apiMsg)) {
      const freeTierZero = /free_tier|limit:\s*0/i.test(apiMsg);
      return [
        `Gemini 配额不足（HTTP 429 · ${model} · ${via}）。`,
        freeTierZero
          ? "当前 Key 对该图片模型走的是 free_tier，且额度 limit=0（常见：未开通付费结算，或免费图片额度已用尽）。"
          : "已达到当前计划的速率/日限额。",
        "处理：1) 打开 https://aistudio.google.com/ 与 https://ai.dev/rate-limit 查看用量；",
        "2) 在 Google AI Studio / Cloud 为该项目开通 Billing（Pro 网页会员 ≠ API 付费配额）；",
        "3) 换有额度的 API Key，或等待配额重置后再试。",
        `上游摘要: ${apiMsg.slice(0, 220)}`,
      ].join(" ");
    }
    if (status === 404) {
      return `Gemini 模型不可用（404 · ${model} · ${via}）: ${apiMsg.slice(0, 240)}`;
    }
    if (status === 400) {
      return `Gemini 请求参数错误（400 · ${model} · ${via}）: ${apiMsg.slice(0, 240)}`;
    }
    if (status === 401 || status === 403) {
      return `Gemini API Key 无效或无权限（${status} · ${model}）: ${apiMsg.slice(0, 200)}`;
    }
    return `Gemini ${via} 失败 ${status} (${model}): ${apiMsg.slice(0, 280)}`;
  }

  private async geminiFetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const cause =
        err && typeof err === "object" && "cause" in err
          ? String((err as { cause?: unknown }).cause ?? "")
          : "";
      const detail = [raw, cause].filter(Boolean).join(" | ");
      const blocked =
        /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|certificate|network|连接|timed out/i.test(
          detail,
        );
      if (blocked) {
        throw new ServiceUnavailableException(
          [
            "无法连接 Google Gemini API（网络层失败）。",
            "本机 DNS 能解析 generativelanguage.googleapis.com，但 HTTPS:443 连不上，常见于国内网络/公司防火墙未走代理。",
            "处理：1) 为 Node 服务配置 HTTPS_PROXY/HTTP_PROXY 后重启 server；",
            "2) 或在设置 → Gemini Base URL 填可访问的中转地址；",
            "3) 确认已保存 Gemini API Key。",
            `技术细节: ${detail.slice(0, 220)}`,
          ].join(" "),
        );
      }
      throw new ServiceUnavailableException(`Gemini 请求异常: ${detail.slice(0, 300)}`);
    }
  }

  private saveInlineImage(base64: string, mimeType?: string): string {
    if (!existsSync(PATHS.images)) mkdirSync(PATHS.images, { recursive: true });
    const ext =
      mimeType?.includes('jpeg') || mimeType?.includes('jpg')
        ? 'jpg'
        : mimeType?.includes('webp')
          ? 'webp'
          : 'png';
    const name = `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    writeFileSync(join(PATHS.images, name), Buffer.from(base64, 'base64'));
    return `/media/images/${encodeURIComponent(name)}`;
  }

  private extractImagesFromUnknown(json: unknown): { urls: string[]; texts: string[] } {
    const urls: string[] = [];
    const texts: string[] = [];
    const seen = new Set<string>();

    const pushB64 = (data?: string, mime?: string) => {
      if (!data || typeof data !== 'string') return;
      // 去重（同一 JSON 可能 camel/snake 双写）
      const key = data.slice(0, 64) + data.length;
      if (seen.has(key)) return;
      seen.add(key);
      urls.push(this.saveInlineImage(data, mime || 'image/png'));
    };

    const walk = (node: unknown, depth = 0) => {
      if (!node || depth > 10) return;
      if (typeof node === 'string') return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item, depth + 1);
        return;
      }
      if (typeof node !== 'object') return;
      const o = node as Record<string, unknown>;

      if (typeof o.text === 'string' && o.text.trim()) texts.push(o.text);

      // Interactions: output_image / outputs[].image
      if (o.data && (o.mime_type || o.mimeType || o.type === 'image' || o.type === 'output_image')) {
        pushB64(
          String(o.data),
          typeof o.mime_type === 'string'
            ? o.mime_type
            : typeof o.mimeType === 'string'
              ? o.mimeType
              : 'image/png',
        );
      }

      // generateContent: inlineData / inline_data
      const inline = (o.inlineData || o.inline_data) as
        | { data?: string; mimeType?: string; mime_type?: string }
        | undefined;
      if (inline?.data) {
        pushB64(inline.data, inline.mimeType || inline.mime_type || 'image/png');
      }

      // Imagen predict
      if (typeof o.bytesBase64Encoded === 'string') {
        pushB64(o.bytesBase64Encoded, typeof o.mimeType === 'string' ? o.mimeType : 'image/png');
      }

      // 部分代理返回 url / imageUrl
      if (typeof o.url === 'string' && /^https?:\/\//i.test(o.url) && o.url.includes('image')) {
        // 仅记录，不在 walk 中同步下载；由上层处理
      }

      for (const v of Object.values(o)) {
        if (v && typeof v === 'object') walk(v, depth + 1);
      }
    };

    walk(json);
    return { urls, texts };
  }

  private modelFallbacks(primary: string): string[] {
    const list = [primary];
    if (primary.endsWith('-preview')) {
      list.push(primary.replace(/-preview$/, ''));
    } else if (
      primary.includes('gemini-3') ||
      primary.includes('gemini-3.1') ||
      primary.includes('flash-image') ||
      primary.includes('pro-image')
    ) {
      if (!primary.endsWith('-preview')) list.push(`${primary}-preview`);
    }
    // 去重
    return [...new Set(list.filter(Boolean))];
  }

  /**
   * 主路径：generateContent + responseModalities IMAGE
   * 文档：generationConfig.responseModalities / imageConfig.aspectRatio / imageConfig.imageSize
   */
  async generateViaGenerateContent(opts: GeminiGenerateImageOpts): Promise<{
    urls: string[];
    text?: string;
    model: string;
  }> {
    const modelPrimary = this.resolveModelId(opts.model);
    const prompt = (opts.prompt || '').trim();
    if (!prompt && !(opts.referenceParts?.length)) {
      throw new BadRequestException('Gemini 图片 prompt 不能为空');
    }

    const parts: Array<Record<string, unknown>> = [];
    if (prompt) parts.push({ text: prompt });
    for (const ref of opts.referenceParts ?? []) {
      if (ref.text) parts.push({ text: ref.text });
      if (ref.inlineBase64) {
        parts.push({
          inlineData: {
            mimeType: ref.mimeType || 'image/png',
            data: ref.inlineBase64,
          },
        });
      }
    }

    const aspectRatio = this.aspectFromSize(opts.size);
    const imageSize = this.imageSizeTierFromSize(opts.size, opts.imageSizeTier);

    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio,
          imageSize,
        },
      },
    };

    let lastErr = '';
    for (const model of this.modelFallbacks(modelPrimary)) {
      const url = `${this.resolveBaseUrl()}/models/${encodeURIComponent(model)}:generateContent`;
      const res = await this.geminiFetch(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        lastErr = this.formatUpstreamError(res.status, model, text, "generateContent");
        // 配额耗尽：立刻失败（再试 Interactions/别名只会重复 429 或制造噪音）
        if (res.status === 429) {
          throw new ServiceUnavailableException(lastErr);
        }
        // 模型不存在 / 无权限时尝试下一个别名
        if (res.status === 404 || res.status === 400 || res.status === 403) continue;
        throw new ServiceUnavailableException(lastErr);
      }

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new ServiceUnavailableException(`Gemini 返回非 JSON: ${text.slice(0, 200)}`);
      }

      const { urls, texts } = this.extractImagesFromUnknown(json);
      if (urls.length === 0) {
        lastErr = texts.length
          ? `Gemini 未返回图片（仅文本）: ${texts.join(' ').slice(0, 200)}`
          : 'Gemini generateContent 未返回图片数据';
        continue;
      }
      return {
        urls,
        text: texts.join('\n').trim() || undefined,
        model,
      };
    }

    throw new ServiceUnavailableException(lastErr || 'Gemini generateContent 未返回图片数据');
  }

  /**
   * 兼容：Interactions API
   * POST {base}/interactions
   */
  async generateViaInteractions(opts: GeminiGenerateImageOpts): Promise<{
    urls: string[];
    text?: string;
    model: string;
  }> {
    const model = this.resolveModelId(opts.model);
    const prompt = (opts.prompt || '').trim();
    if (!prompt && !(opts.referenceParts?.length)) {
      throw new BadRequestException('Gemini 图片 prompt 不能为空');
    }

    const input: Array<Record<string, unknown>> = [];
    if (prompt) input.push({ type: 'text', text: prompt });
    for (const ref of opts.referenceParts ?? []) {
      if (ref.text) input.push({ type: 'text', text: ref.text });
      if (ref.inlineBase64) {
        input.push({
          type: 'image',
          mime_type: ref.mimeType || 'image/png',
          data: ref.inlineBase64,
        });
      }
    }

    const aspectRatio = this.aspectFromSize(opts.size);
    const imageSize = this.imageSizeTierFromSize(opts.size, opts.imageSizeTier);

    const body: Record<string, unknown> = {
      model,
      input,
      response_modalities: ['image', 'text'],
      generation_config: {
        image_config: {
          aspect_ratio: aspectRatio,
          image_size: imageSize,
        },
      },
      // 部分环境仍认 response_format
      response_format: {
        type: 'image',
        // Interactions 仅支持 image/jpeg
        mime_type: 'image/jpeg',
        aspect_ratio: aspectRatio,
        image_size: imageSize,
      },
    };

    const url = `${this.resolveBaseUrl()}/interactions`;
    const res = await this.geminiFetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new ServiceUnavailableException(
        this.formatUpstreamError(res.status, model, text, "Interactions"),
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ServiceUnavailableException(`Gemini Interactions 返回非 JSON: ${text.slice(0, 200)}`);
    }

    const { urls, texts } = this.extractImagesFromUnknown(json);
    const root = json as Record<string, unknown>;
    const outImg = (root.output_image || root.outputImage) as
      | { data?: string; mime_type?: string; mimeType?: string }
      | undefined;
    if (outImg?.data && urls.length === 0) {
      urls.push(this.saveInlineImage(outImg.data, outImg.mime_type || outImg.mimeType || 'image/png'));
    }
    if (urls.length === 0) {
      throw new ServiceUnavailableException(
        texts.length
          ? `Gemini 未返回图片（仅文本）: ${texts.join(' ').slice(0, 200)}`
          : 'Gemini Interactions 未返回图片数据',
      );
    }
    return {
      urls,
      text: texts.join('\n').trim() || undefined,
      model,
    };
  }

  /** Imagen 4 :predict */
  async generateImagen(opts: {
    prompt: string;
    model: string;
    size?: string;
    n?: number;
  }): Promise<{ urls: string[]; text?: string; model: string }> {
    const prompt = (opts.prompt || '').trim();
    if (!prompt) throw new BadRequestException('Imagen prompt 不能为空');
    const model = opts.model.startsWith('imagen-')
      ? opts.model
      : 'imagen-4.0-generate-001';
    const sampleCount = Math.min(4, Math.max(1, opts.n ?? 1));
    const aspectRatio = this.aspectFromSize(opts.size);

    const body = {
      instances: [{ prompt }],
      parameters: {
        sampleCount,
        aspectRatio,
      },
    };

    const url = `${this.resolveBaseUrl()}/models/${encodeURIComponent(model)}:predict`;
    const res = await this.geminiFetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new ServiceUnavailableException(
        `Imagen 生成失败 ${res.status}: ${text.slice(0, 400)}`,
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ServiceUnavailableException(`Imagen 返回非 JSON: ${text.slice(0, 200)}`);
    }
    const { urls, texts } = this.extractImagesFromUnknown(json);
    if (urls.length === 0) {
      throw new ServiceUnavailableException('Imagen 未返回图片数据');
    }
    return {
      urls,
      text: texts.join('\n').trim() || undefined,
      model,
    };
  }

  /**
   * 单次生成：Imagen → predict；其余优先 generateContent，失败回落 Interactions
   */
  async generateContentImage(opts: GeminiGenerateImageOpts): Promise<{
    urls: string[];
    text?: string;
    model: string;
  }> {
    const model = this.resolveModelId(opts.model);
    if (model.startsWith('imagen-')) {
      return this.generateImagen({
        prompt: opts.prompt,
        model,
        size: opts.size,
        n: opts.n ?? 1,
      });
    }

    try {
      return await this.generateViaGenerateContent({ ...opts, model });
    } catch (err) {
      const a = err instanceof Error ? err.message : String(err);
      // 配额/鉴权问题：不必再打 Interactions
      if (/429|配额|quota|RESOURCE_EXHAUSTED|401|403|API Key/i.test(a)) {
        throw err instanceof ServiceUnavailableException || err instanceof BadRequestException
          ? err
          : new ServiceUnavailableException(a);
      }
      try {
        return await this.generateViaInteractions({ ...opts, model });
      } catch (err2) {
        const b = err2 instanceof Error ? err2.message : String(err2);
        throw new ServiceUnavailableException(
          `Gemini 出图失败。主路径: ${a.slice(0, 280)} | 回落: ${b.slice(0, 180)}`,
        );
      }
    }
  }

  /** 统一入口：按 n 次补齐（单次通常 1 张） */
  async generateImages(opts: GeminiGenerateImageOpts): Promise<{
    urls: string[];
    text?: string;
    model: string;
  }> {
    const model = this.resolveModelId(opts.model);
    const want = Math.min(4, Math.max(1, opts.n ?? 1));
    if (model.startsWith('imagen-')) {
      return this.generateImagen({
        prompt: opts.prompt,
        model,
        size: opts.size,
        n: want,
      });
    }

    const first = await this.generateContentImage({ ...opts, model, n: 1 });
    const urls = [...first.urls];
    const texts = first.text ? [first.text] : [];
    for (let i = 1; i < want; i++) {
      try {
        const more = await this.generateContentImage({ ...opts, model, n: 1 });
        urls.push(...more.urls);
        if (more.text) texts.push(more.text);
      } catch (e) {
        if (urls.length > 0) break;
        throw e;
      }
    }
    return {
      urls: urls.slice(0, want),
      text: texts.join('\n').trim() || undefined,
      model: first.model,
    };
  }
}
