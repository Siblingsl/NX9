import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { resolveMediaUrl } from '../../common/media-path';

const MH_BASE = 'https://api.magichour.ai';
const TASK_PREFIX_IMAGE = 'mh:image:';
const TASK_PREFIX_VIDEO = 'mh:video:';

export type MagicHourOrientation = 'square' | 'landscape' | 'portrait';
export type MagicHourProjectStatus =
  | 'draft'
  | 'queued'
  | 'rendering'
  | 'complete'
  | 'error'
  | 'canceled';

interface MagicHourDownload {
  url: string;
  expires_at?: string;
}

interface MagicHourProject {
  id: string;
  status: MagicHourProjectStatus;
  downloads?: MagicHourDownload[];
  error?: { message?: string; code?: string } | null;
  credits_charged?: number;
}

@Injectable()
export class MagicHourAdapter {
  hasKey(): boolean {
    return Boolean(this.apiKey());
  }

  apiKey(): string {
    return (process.env.MAGIC_HOUR_API_KEY || '').trim();
  }

  isMagicHourModel(model?: string): boolean {
    const m = (model || '').toLowerCase();
    return m === 'magic-hour' || m === 'magichour' || m.startsWith('mh-');
  }

  encodeImageTaskId(id: string): string {
    return `${TASK_PREFIX_IMAGE}${id}`;
  }

  encodeVideoTaskId(id: string): string {
    return `${TASK_PREFIX_VIDEO}${id}`;
  }

  decodeTaskId(
    taskId: string,
  ): { kind: 'image' | 'video'; id: string } | null {
    if (taskId.startsWith(TASK_PREFIX_IMAGE)) {
      return { kind: 'image', id: taskId.slice(TASK_PREFIX_IMAGE.length) };
    }
    if (taskId.startsWith(TASK_PREFIX_VIDEO)) {
      return { kind: 'video', id: taskId.slice(TASK_PREFIX_VIDEO.length) };
    }
    return null;
  }

  orientationFromSize(size?: string): MagicHourOrientation {
    if (!size) return 'square';
    const [w, h] = size.toLowerCase().split('x').map(Number);
    if (!w || !h) return 'square';
    if (w === h) return 'square';
    return w > h ? 'landscape' : 'portrait';
  }

  private headers(json = true): Record<string, string> {
    const key = this.apiKey();
    if (!key) throw new BadRequestException('未配置 MAGIC_HOUR_API_KEY（apps/server/.env）');
    const h: Record<string, string> = {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${MH_BASE}${path}`, {
      method,
      headers: this.headers(body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      const message = this.readErrorMessage(text);
      if (res.status === 402 || /insufficient credits|credits/i.test(message)) {
        throw new HttpException(
          `Magic Hour 积分不足：${message}`,
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      throw new ServiceUnavailableException(
        `Magic Hour ${method} ${path}: ${res.status} ${message.slice(0, 300)}`,
      );
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ServiceUnavailableException(`Magic Hour 返回非 JSON: ${text.slice(0, 200)}`);
    }
  }

  async createImage(opts: {
    prompt: string;
    name?: string;
    imageCount?: number;
    orientation?: MagicHourOrientation;
  }): Promise<{ id: string; creditsCharged?: number }> {
    const prompt = opts.prompt.trim();
    if (!prompt) throw new BadRequestException('Image prompt is required');
    const json = await this.request<{ id: string; credits_charged?: number }>(
      'POST',
      '/v1/ai-image-generator',
      {
        name: opts.name || `NX9 image ${new Date().toISOString()}`,
        image_count: Math.min(4, Math.max(1, opts.imageCount ?? 1)),
        orientation: opts.orientation || 'square',
        style: { prompt },
      },
    );
    if (!json.id) throw new ServiceUnavailableException('Magic Hour 未返回 image project id');
    return { id: json.id, creditsCharged: json.credits_charged };
  }

  async getImageProject(id: string): Promise<MagicHourProject> {
    return this.request<MagicHourProject>('GET', `/v1/image-projects/${id}`);
  }

  async createTextToVideo(opts: {
    prompt: string;
    name?: string;
    endSeconds?: number;
    aspectRatio?: string;
    resolution?: string;
    model?: string;
    audio?: boolean;
  }): Promise<{ id: string; creditsCharged?: number }> {
    const prompt = opts.prompt.trim();
    if (!prompt) throw new BadRequestException('Video prompt is required');
    const model = this.normalizeVideoModel(opts.model);
    const json = await this.request<{ id: string; credits_charged?: number }>(
      'POST',
      '/v1/text-to-video',
      {
        name: opts.name || `NX9 t2v ${new Date().toISOString()}`,
        end_seconds: opts.endSeconds ?? 5,
        aspect_ratio: opts.aspectRatio || '16:9',
        resolution: this.normalizeResolution(opts.resolution),
        model,
        ...(opts.audio ? { audio: true } : {}),
        style: { prompt },
      },
    );
    if (!json.id) throw new ServiceUnavailableException('Magic Hour 未返回 video project id');
    return { id: json.id, creditsCharged: json.credits_charged };
  }

  async createImageToVideo(opts: {
    prompt: string;
    imageFilePath: string;
    name?: string;
    endSeconds?: number;
    resolution?: string;
    model?: string;
    audio?: boolean;
  }): Promise<{ id: string; creditsCharged?: number }> {
    const prompt = opts.prompt.trim();
    if (!prompt) throw new BadRequestException('Video prompt is required');
    const model = this.normalizeVideoModel(opts.model);
    const json = await this.request<{ id: string; credits_charged?: number }>(
      'POST',
      '/v1/image-to-video',
      {
        name: opts.name || `NX9 i2v ${new Date().toISOString()}`,
        end_seconds: opts.endSeconds ?? 5,
        resolution: this.normalizeResolution(opts.resolution),
        model,
        audio: opts.audio ?? false,
        style: { prompt },
        assets: { image_file_path: opts.imageFilePath },
      },
    );
    if (!json.id) throw new ServiceUnavailableException('Magic Hour 未返回 video project id');
    return { id: json.id, creditsCharged: json.credits_charged };
  }

  async getVideoProject(id: string): Promise<MagicHourProject> {
    return this.request<MagicHourProject>('GET', `/v1/video-projects/${id}`);
  }

  /** Upload a local /media/... file (or remote http URL) and return Magic Hour file_path. */
  async resolveImageFilePath(imageUrl: string): Promise<string> {
    const url = imageUrl.trim();
    if (!url) throw new BadRequestException('imageUrl is required');

    // Already a Magic Hour asset path
    if (url.startsWith('api-assets/') || url.startsWith('video/') || url.startsWith('image/')) {
      return url;
    }

    // Public URL Magic Hour can fetch directly
    if (/^https?:\/\//i.test(url) && !/localhost|127\.0\.0\.1/i.test(url)) {
      return url;
    }

    const local = resolveMediaUrl(url);
    if (!local || !existsSync(local)) {
      throw new BadRequestException(
        `Magic Hour 无法读取参考图（需本地 /media/... 或公网 URL）: ${url}`,
      );
    }

    const ext = (local.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const upload = await this.request<{
      items: { upload_url: string; file_path: string }[];
    }>('POST', '/v1/files/upload-urls', {
      items: [{ type: 'image', extension: ext }],
    });
    const item = upload.items?.[0];
    if (!item?.upload_url || !item.file_path) {
      throw new ServiceUnavailableException('Magic Hour upload-urls 返回为空');
    }

    const buf = readFileSync(local);
    const put = await fetch(item.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': `image/${ext === 'jpg' ? 'jpeg' : ext}` },
      body: buf,
    });
    if (!put.ok) {
      const t = await put.text();
      throw new ServiceUnavailableException(
        `Magic Hour 上传失败: ${put.status} ${t.slice(0, 200)}`,
      );
    }
    return item.file_path;
  }

  async waitForProject(
    kind: 'image' | 'video',
    id: string,
    opts?: { attempts?: number; intervalMs?: number },
  ): Promise<MagicHourProject> {
    const attempts = opts?.attempts ?? 60;
    const intervalMs = opts?.intervalMs ?? 3000;
    let last: MagicHourProject | null = null;
    for (let i = 0; i < attempts; i++) {
      last = kind === 'image' ? await this.getImageProject(id) : await this.getVideoProject(id);
      if (last.status === 'complete' || last.status === 'error' || last.status === 'canceled') {
        return last;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return (
      last ?? {
        id,
        status: 'queued',
        downloads: [],
        error: null,
      }
    );
  }

  downloadUrls(project: MagicHourProject): string[] {
    return (project.downloads ?? [])
      .map((d) => d.url)
      .filter((u): u is string => Boolean(u));
  }

  projectErrorMessage(project: MagicHourProject): string {
    return project.error?.message || `Magic Hour 状态: ${project.status}`;
  }

  private normalizeVideoModel(model?: string): string {
    const m = (model || '').toLowerCase();
    if (!m || m === 'magic-hour' || m === 'magichour' || m === 'veo' || m === 'mh-video') {
      return 'ltx-2.3';
    }
    if (m.startsWith('mh-')) return m.slice(3) || 'ltx-2.3';
    return model || 'ltx-2.3';
  }

  private readErrorMessage(text: string): string {
    try {
      const json = JSON.parse(text) as { message?: unknown; error?: unknown };
      if (typeof json.message === 'string') return json.message;
      if (typeof json.error === 'string') return json.error;
      if (json.error && typeof json.error === 'object') {
        const err = json.error as { message?: unknown };
        if (typeof err.message === 'string') return err.message;
      }
    } catch {
      /* plain text upstream response */
    }
    return text;
  }

  private normalizeResolution(resolution?: string): string {
    const r = (resolution || '').toString().toLowerCase();
    if (r.includes('1080') || r === '1080p') return '1080p';
    if (r.includes('720') || r === '720p') return '720p';
    if (r.includes('480') || r === '480p') return '480p';
    // Free tier default
    return '480p';
  }
}
