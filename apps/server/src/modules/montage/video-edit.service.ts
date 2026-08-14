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
import { resolveVideoEditProvider, VIDEO_EDIT_PROVIDERS } from '@nx9/shared';
import { PATHS } from '../../config/app.config';
import { resolveMediaUrl } from '../../common/media-path';
import { SettingsService } from '../settings/settings.service';
import {
  VIDEO_EDIT_TASKS_FILE,
  loadTaskRecords,
  mapToRecords,
  recordsToMap,
  saveTaskRecords,
} from './render-task-store';

export interface VideoEditJob {
  taskId: string;
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  progress: number;
  url?: string;
  message?: string;
  /** Fal 队列 request_id，用于取消/追踪 */
  falRequestId?: string;
  falModel?: string;
  createdAt: number;
  updatedAt: number;
}

const POLL_INTERVAL_MS = 5000;
const TIMEOUT_MS = 20 * 60 * 1000;

@Injectable()
export class VideoEditService {
  private readonly logger = new Logger(VideoEditService.name);
  private readonly jobs: Map<string, VideoEditJob>;
  private counter = 0;

  constructor(private readonly settings: SettingsService) {
    if (!fs.existsSync(PATHS.videos)) {
      fs.mkdirSync(PATHS.videos, { recursive: true });
    }
    this.jobs = recordsToMap(loadTaskRecords<VideoEditJob>(VIDEO_EDIT_TASKS_FILE));
    // SE-DEEP-07: 服务重启后排队/进行中任务已无进程，标记中断而不是永远停留在 queued/running。
    let stale = 0;
    for (const job of this.jobs.values()) {
      if (job.status === 'queued' || job.status === 'running') {
        job.status = 'error';
        job.message = '服务重启，任务已中断；请重新提交';
        job.updatedAt = Date.now();
        stale += 1;
      }
    }
    if (stale > 0) {
      this.persist();
      this.logger.warn(`video-edit: ${stale} 个重启前任务标记为中断`);
    }
  }

  private persist(): void {
    saveTaskRecords(VIDEO_EDIT_TASKS_FILE, mapToRecords(this.jobs));
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
    if (body.providerId && !VIDEO_EDIT_PROVIDERS.some((p) => p.id === body.providerId)) {
      return { ok: false, message: `未知视频编辑供应商：${body.providerId}` };
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
    this.persist();

    void this.process(taskId, body, provider.falModel, provider.inputKeys, apiKey).catch((err) => {
      if (this.jobs.get(taskId)?.status === 'cancelled') return;
      this.fail(taskId, err instanceof Error ? err.message : String(err));
    });

    return { ok: true, taskId };
  }

  getStatus(taskId: string): VideoEditJob | null {
    return this.jobs.get(taskId) ?? null;
  }

  /** SE-DEEP-06: 取消任务；Fal cancel 不可用也至少停本地轮询并记 cancelled */
  async cancel(taskId: string): Promise<boolean> {
    const job = this.jobs.get(taskId);
    if (!job) return false;
    if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') {
      return false;
    }
    this.update(taskId, { status: 'cancelled', progress: job.progress, message: '任务已取消' });
    if (job.falRequestId && job.falModel) {
      const apiKey = this.settings.getRaw().primaryApiKey || '';
      try {
        const res = await fetch(
          `https://queue.fal.run/${job.falModel}/requests/${job.falRequestId}/cancel`,
          { method: 'POST', headers: { Authorization: `Key ${apiKey}` } },
        );
        if (!res.ok) {
          this.logger.warn(`video-edit ${taskId} fal cancel http ${res.status}; 本地任务已取消`);
        }
      } catch {
        this.logger.warn(`video-edit ${taskId} fal cancel 网络失败；本地任务已取消`);
      }
    }
    return true;
  }

  private fail(taskId: string, message: string) {
    const job = this.jobs.get(taskId);
    if (!job || job.status === 'cancelled') return;
    job.status = 'error';
    job.message = message;
    job.updatedAt = Date.now();
    this.persist();
    this.logger.error(`video-edit ${taskId} failed: ${message}`);
  }

  private update(taskId: string, patch: Partial<VideoEditJob>) {
    const job = this.jobs.get(taskId);
    if (!job || job.status === 'cancelled') return;
    Object.assign(job, patch, { updatedAt: Date.now() });
    this.persist();
  }

  /**
   * SE-DEEP-08: 本地 /media 文件先上传为公网临时地址，禁止整段 base64。
   * Fal 队列无法回源本机，且 data URI 会让长视频必炸内存或超 body 限制。
   */
  private async toRemoteInput(url: string, apiKey: string): Promise<string> {
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

    // Fal REST storage 上传：先取上传地址，再 PUT 文件内容，返回可公网拉取 URL。
    const initRes = await fetch('https://rest.alpha.fal.ai/storage/upload/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify({ content_type: mime, file_name: path.basename(local) }),
    });
    if (!initRes.ok) {
      const text = await (await initRes.text()).slice(0, 200);
      throw new Error(`Fal storage 上传初始化失败: ${text}`);
    }
    const initJson = (await initRes.json()) as {
      upload_url?: string;
      storage_url?: string;
      file_url?: string;
    };
    const uploadUrl = initJson.upload_url;
    const remoteUrl = initJson.storage_url ?? initJson.file_url;
    if (!uploadUrl || !remoteUrl) {
      throw new Error('Fal storage 未返回 upload_url/storage_url');
    }
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mime },
      body: fs.createReadStream(local) as unknown as BodyInit,
    });
    if (!putRes.ok) {
      throw new Error(`Fal storage 上传失败: HTTP ${putRes.status}`);
    }
    return remoteUrl;
  }

  private async process(
    taskId: string,
    body: { videoUrl: string; maskUrl?: string; prompt: string },
    falModel: string,
    inputKeys: { video: string; mask?: string; prompt: string },
    apiKey: string,
  ): Promise<void> {
    if (this.jobs.get(taskId)?.status === 'cancelled') return;
    this.update(taskId, { status: 'running', progress: 5 });
    if (this.jobs.get(taskId)?.status === 'cancelled') return;

    const input: Record<string, unknown> = {
      [inputKeys.prompt]: body.prompt,
      [inputKeys.video]: await this.toRemoteInput(body.videoUrl, apiKey),
    };
    if (inputKeys.mask && body.maskUrl) {
      input[inputKeys.mask] = await this.toRemoteInput(body.maskUrl, apiKey);
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
    this.update(taskId, { falRequestId: submitted.request_id, falModel });
    if (this.jobs.get(taskId)?.status === 'cancelled') return;

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
      if (this.jobs.get(taskId)?.status === 'cancelled') {
        this.logger.log(`video-edit ${taskId} cancelled, stop polling`);
        return;
      }
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
    if (this.jobs.get(taskId)?.status === 'cancelled') return;
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
    if (this.jobs.get(taskId)?.status === 'cancelled') return;
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
