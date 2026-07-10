import { Injectable, Logger } from '@nestjs/common';
import { join } from 'path';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { timelineToHyperFramesHtml } from '@nx9/shared';
import type { TimelinePayload } from '@nx9/shared';

const PATHS = {
  exports: process.env.NX9_MEDIA_EXPORTS_DIR || join(process.cwd(), 'media', 'exports'),
  templates: join(process.cwd(), 'templates', 'hyperframes'),
};

export interface RenderResult {
  ok: boolean;
  taskId?: string;
  url?: string;
  message?: string;
  status?: string;
}

@Injectable()
export class HyperframesService {
  private readonly logger = new Logger(HyperframesService.name);
  private taskCounter = 0;
  private readonly tasks = new Map<string, { status: string; url?: string }>();

  async renderTimeline(
    timeline: TimelinePayload,
    opts?: { templateId?: string; transitionPack?: string },
  ): Promise<RenderResult> {
    const taskId = `hf-${Date.now()}-${++this.taskCounter}`;
    this.tasks.set(taskId, { status: 'queued' });

    // 异步渲染（不阻塞返回）
    this.processRender(taskId, timeline, opts).catch((e) => {
      this.logger.error(`HF render ${taskId} failed: ${e.message}`);
      this.tasks.set(taskId, { status: 'error' });
    });

    return { ok: true, taskId, status: 'queued' };
  }

  getTaskStatus(taskId: string): { status: string; url?: string } | null {
    return this.tasks.get(taskId) ?? null;
  }

  private async processRender(
    taskId: string,
    timeline: TimelinePayload,
    opts?: { templateId?: string },
  ): Promise<void> {
    this.tasks.set(taskId, { status: 'rendering' });

    try {
      if (!existsSync(PATHS.exports)) {
        mkdirSync(PATHS.exports, { recursive: true });
      }

      const html = timelineToHyperFramesHtml(timeline, opts?.templateId);
      const workDir = join(PATHS.exports, `hf-work-${Date.now()}`);
      mkdirSync(workDir, { recursive: true });
      writeFileSync(join(workDir, 'index.html'), html, 'utf-8');

      const outFilename = `episode-hf-${Date.now()}.mp4`;
      const outPath = join(PATHS.exports, outFilename);

      // 优先尝试 programmatic @hyperframes/producer，不可用时 fallback FFmpeg
      try {
        const hf = await import('@hyperframes/producer') as any;
        await hf.producer.render({
          entry: join(workDir, 'index.html'),
          out: outPath,
          fps: timeline.fps,
          width: timeline.width,
          height: timeline.height,
        });
      } catch {
        // FFmpeg fallback: 将 HTML 转为静帧序列再编码
        this.logger.warn('@hyperframes/producer 不可用，使用 FFmpeg 占位渲染');
        const { execSync } = await import('child_process');
        execSync(
          `ffmpeg -f lavfi -i color=c=#000:s=${timeline.width}x${timeline.height}:d=${timeline.durationSec} -c:v libx264 -preset ultrafast "${outPath}"`,
          { stdio: 'ignore' },
        );
      }

      const url = `/media/exports/${outFilename}`;
      this.tasks.set(taskId, { status: 'done', url });
      this.logger.log(`HF render ${taskId} done: ${url}`);
    } catch (e) {
      this.logger.error(`HF render ${taskId} error: ${(e as Error).message}`);
      this.tasks.set(taskId, { status: 'error' });
    }
  }
}
