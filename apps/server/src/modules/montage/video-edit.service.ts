/**
 * VideoEditService — 视频级智能替换任务队列（P3）。
 *
 * POST /api/montage/video-edit 提交 { videoUrl, maskUrl, prompt, providerId? }，
 * 走 Fal 队列 API 异步执行（视频重绘耗时远超同步网关 90s 轮询上限），
 * 完成后将成片落盘到 storage/videos，返回 /media/videos/... 地址。
 *
 * 供应商能力位见 @nx9/shared provider-registry 的 VIDEO_EDIT_PROVIDERS。
 */
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { resolveVideoEditProvider } from '@nx9/shared';
import { PATHS } from '../../config/app.config';
import { resolveMediaUrl } from '../../common/media-path';
import { SettingsService } from '../settings/settings.service';

export interface VideoEditJob {
  taskId: string;
  status: 'queued' | 'running' | 'done' | 'error';
  progress: number;
  url?: string;
  message?: string;
  createdAt: number;
  updatedAt: number;
}

const POLL_INTERVAL_MS = 5000;
const TIMEOUT_MS = 20 * 60 * 1000;

@Injectable()
export class VideoEditService {
  private readonly logger = new Logger(VideoEditService.name);
  private readonly jobs = new Map<string, VideoEditJob>();
  private counter = 0;

  constructor(private readonly settings: SettingsService) {
    if (!fs.existsSync(PATHS.videos)) {
      fs.mkdirSync(PATHS.videos, { recursive: true });
    }
  }

  submit(body: {
    videoUrl: string;
    maskUrl?: string;
    prompt: string;
    providerId?: string;
  }): { ok: boolean; taskId?: string; message?: string } {
    const apiKey = this.settings.getRaw().primaryApiKey || '';
    if (!apiKey) {
      return { ok: false, message: '视频级替换需要在设置中配置 Fal API Key（primaryApiKey）' };
    }
    if (!body.videoUrl || !body.prompt?.trim()) {
      return { ok: false, message: 'videoUrl 与 prompt 必填' };
    }
    const provider = resolveVideoEditProvider(body.providerId);
    if (provider.requiresMask && !body.maskUrl) {
      return { ok: false, message: `${provider.label} 需要提供 mask` };
    }

    const taskId = `vedit-${Date.now()}-${++this.counter}`;
    const job: VideoEditJob = {
      taskId,
      status: 'queued',
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.jobs.set(taskId, job);

    void this.process(taskId, body, provider.falModel, provider.inputKeys, apiKey).catch((err) => {
      this.fail(taskId, err instanceof Error ? err.message : String(err));
    });

    return { ok: true, taskId };
  }

  getStatus(taskId: string): VideoEditJob | null {
    return this.jobs.get(taskId) ?? null;
  }

  private fail(taskId: string, message: string) {
    const job = this.jobs.get(taskId);
    if (!job) return;
    job.status = 'error';
    job.message = message;
    job.updatedAt = Date.now();
    this.logger.error(`video-edit ${taskId} failed: ${message}`);
  }

  private update(taskId: string, patch: Partial<VideoEditJob>) {
    const job = this.jobs.get(taskId);
    if (!job) return;
    Object.assign(job, patch, { updatedAt: Date.now() });
  }

  /** /media 本地地址转 data URI（fal 无法回源本机） */
  private toRemoteInput(url: string): string {
    if (!url.startsWith('/media/')) return url;
    const local = resolveMediaUrl(url);
    if (!local) return url;
    const ext = path.extname(local).slice(1).toLowerCase();
    const mime =
      ext === 'png'
        ? 'image/png'
        : ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : ext === 'webp'
            ? 'image/webp'
            : ext === 'mp4'
              ? 'video/mp4'
              : 'application/octet-stream';
    return `data:${mime};base64,${fs.readFileSync(local).toString('base64')}`;
  }

  private async process(
    taskId: string,
    body: { videoUrl: string; maskUrl?: string; prompt: string },
    falModel: string,
    inputKeys: { video: string; mask?: string; prompt: string },
    apiKey: string,
  ): Promise<void> {
    this.update(taskId, { status: 'running', progress: 5 });

    const input: Record<string, unknown> = {
      [inputKeys.prompt]: body.prompt,
      [inputKeys.video]: this.toRemoteInput(body.videoUrl),
    };
    if (inputKeys.mask && body.maskUrl) {
      input[inputKeys.mask] = this.toRemoteInput(body.maskUrl);
    }

    // Fal 队列 API：提交
    const submitRes = await fetch(`https://queue.fal.run/${falModel}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(input),
    });
    if (!submitRes.ok) {
      throw new Error(`Fal 提交失败: ${(await submitRes.text()).slice(0, 300)}`);
    }
    const submitted = (await submitRes.json()) as {
      request_id?: string;
      status_url?: string;
      response_url?: string;
    };
    if (!submitted.request_id) {
      throw new Error('Fal 未返回 request_id');
    }
    const statusUrl =
      submitted.status_url ??
      `https://queue.fal.run/${falModel}/requests/${submitted.request_id}/status`;
    const responseUrl =
      submitted.response_url ??
      `https://queue.fal.run/${falModel}/requests/${submitted.request_id}`;

    // 轮询
    const deadline = Date.now() + TIMEOUT_MS;
    let completed = false;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const st = await fetch(statusUrl, { headers: { Authorization: `Key ${apiKey}` } });
      if (!st.ok) continue;
      const stJson = (await st.json()) as { status?: string; queue_position?: number };
      const s = (stJson.status ?? '').toUpperCase();
      if (s === 'COMPLETED') {
        completed = true;
        break;
      }
      if (s === 'FAILED' || s === 'ERROR' || s === 'CANCELLED') {
        throw new Error(`Fal 任务状态: ${s}`);
      }
      this.update(taskId, {
        progress: s === 'IN_PROGRESS' ? 50 : Math.min(30, 5 + (stJson.queue_position ?? 0)),
      });
    }
    if (!completed) throw new Error('视频级替换超时（20 分钟）');

    this.update(taskId, { progress: 80 });
    const result = await fetch(responseUrl, { headers: { Authorization: `Key ${apiKey}` } });
    if (!result.ok) {
      throw new Error(`Fal 结果获取失败: ${(await result.text()).slice(0, 300)}`);
    }
    const json = (await result.json()) as Record<string, unknown>;
    const videoUrl =
      (json.video as { url?: string })?.url ||
      (json.videos as { url?: string }[])?.[0]?.url ||
      (json.output as { url?: string })?.url ||
      (typeof json.url === 'string' ? json.url : undefined);
    if (!videoUrl) {
      throw new Error(`Fal 结果无视频地址: ${JSON.stringify(json).slice(0, 200)}`);
    }

    // 落盘
    const saved = await this.saveRemoteVideo(videoUrl, taskId);
    this.update(taskId, { status: 'done', progress: 100, url: saved });
    this.logger.log(`video-edit ${taskId} done: ${saved}`);
  }

  private async saveRemoteVideo(url: string, taskId: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`视频下载失败: HTTP ${res.status}`);
    const name = `${taskId}.mp4`;
    fs.writeFileSync(path.join(PATHS.videos, name), Buffer.from(await res.arrayBuffer()));
    return `/media/videos/${encodeURIComponent(name)}`;
  }
}
