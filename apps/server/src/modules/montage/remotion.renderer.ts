/**
 * RemotionRenderer — 服务端 Remotion 真渲（F-020）。
 *
 * 拍板 #6：POST 时间线 → 服务端 Remotion 渲染 → 轮询 → mp4。
 * 客户端预览可保留，但不能作为唯一成片路径。
 *
 * 依赖 @remotion/renderer（peer dep），若未安装则返回清晰的错误。
 * 安装方式：pnpm add @remotion/renderer --filter @nx9/server
 */
import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { PATHS } from '../../config/app.config';

export interface RemotionRenderJob {
  taskId: string;
  status: 'queued' | 'rendering' | 'done' | 'error';
  progress: number;
  outputUrl?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/** Remotion 组合包的 serve URL（生产环境下为构建产物路径） */
const REMOTION_BUNDLE_DIR = path.resolve(
  __dirname,
  '../../../../packages/remotion-compositions/dist',
);

@Injectable()
export class RemotionRenderer {
  private readonly logger = new Logger(RemotionRenderer.name);
  private jobs = new Map<string, RemotionRenderJob>();
  private counter = 0;
  /** 渲染输出目录 */
  private readonly outputDir = PATHS.remotion;

  constructor() {
    // 确保输出目录存在
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async submit(
    timeline: unknown,
    codec = 'h264',
    compositionId = 'Nx9Episode',
  ): Promise<{ taskId: string; status: string }> {
    const taskId = `remotion-${Date.now()}-${++this.counter}`;
    const job: RemotionRenderJob = {
      taskId,
      status: 'queued',
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.jobs.set(taskId, job);

    // 异步渲染
    this.processJob(taskId, timeline, codec, compositionId).catch((err) => {
      const existing = this.jobs.get(taskId);
      if (existing) {
        existing.status = 'error';
        existing.error = err.message;
        existing.updatedAt = Date.now();
        this.logger.error(`渲染失败 [${taskId}]: ${err.message}`);
      }
    });

    return { taskId, status: 'queued' };
  }

  getStatus(taskId: string): RemotionRenderJob | null {
    return this.jobs.get(taskId) ?? null;
  }

  private async processJob(
    taskId: string,
    timeline: unknown,
    codec: string,
    compositionId: string,
  ): Promise<void> {
    const job = this.jobs.get(taskId);
    if (!job) return;

    job.status = 'rendering';
    job.updatedAt = Date.now();

    try {
      // 验证时间线
      if (!timeline || typeof timeline !== 'object') {
        throw new Error('无效的时间线数据');
      }

      // 动态导入 @remotion/renderer（可选的 peer dep）
      let renderer: typeof import('@remotion/renderer');
      try {
        renderer = await import('@remotion/renderer');
      } catch {
        throw new Error(
          'Remotion 服务端渲染需要安装 @remotion/renderer。\n' +
          '请执行: pnpm add @remotion/renderer --filter @nx9/server\n' +
          '或使用 ffmpeg / hyperframes 引擎作为替代。',
        );
      }

      // 检查组合包构建产物
      const bundlePath = REMOTION_BUNDLE_DIR;
      if (!fs.existsSync(bundlePath)) {
        throw new Error(
          `Remotion 组合包未找到: ${bundlePath}\n` +
          '请先构建: pnpm --filter @nx9/remotion-compositions build',
        );
      }

      // 选择组合
      const composition = await renderer.selectComposition({
        serveUrl: bundlePath,
        id: compositionId,
        inputProps: { timeline },
      });

      // 输出路径
      const outputFilename = `remotion-${taskId}.mp4`;
      const outputPath = path.join(this.outputDir, outputFilename);

      this.logger.log(`开始渲染: ${taskId} -> ${outputPath}`);

      // 进度回调
      const onProgress = (progress: { progress: number }) => {
        job.progress = Math.round(progress.progress * 100);
        job.updatedAt = Date.now();
      };

      // 渲染
      await renderer.renderMedia({
        composition,
        serveUrl: bundlePath,
        codec: codec as ReturnType<typeof renderer.renderMedia> extends Promise<unknown> ? any : any,
        outputLocation: outputPath,
        inputProps: { timeline },
        onProgress,
      });

      // 验证产物
      if (!fs.existsSync(outputPath)) {
        throw new Error('渲染完成但输出文件不存在');
      }

      const stats = fs.statSync(outputPath);
      if (stats.size === 0) {
        fs.unlinkSync(outputPath);
        throw new Error('渲染产物为空文件');
      }

      // 成功
      job.status = 'done';
      job.progress = 100;
      job.outputUrl = `/media/${outputFilename}`;
      job.updatedAt = Date.now();

      this.logger.log(`渲染完成: ${taskId} (${stats.size} bytes)`);
    } catch (err) {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : '渲染失败';
      job.updatedAt = Date.now();
    }
  }
}
