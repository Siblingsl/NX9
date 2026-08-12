import { Injectable, Logger } from '@nestjs/common';
import { join } from 'path';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { timelineToHyperFramesHtml } from '@nx9/shared';
import type { TimelinePayload } from '@nx9/shared';
import {
  applyHyperframesTaskUpdate,
  HF_PRODUCER_UNAVAILABLE,
  type HyperframesTaskRecord,
} from './hyperframes-task';
import {
  HF_TASKS_FILE,
  loadTaskRecords,
  mapToRecords,
  recordsToMap,
  saveTaskRecords,
} from './render-task-store';

export { applyHyperframesTaskUpdate, HF_PRODUCER_UNAVAILABLE };
export type { HyperframesTaskRecord };

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
  private readonly tasks: Map<string, HyperframesTaskRecord>;
  private persistFile = HF_TASKS_FILE;

  constructor() {
    this.tasks = recordsToMap(loadTaskRecords<HyperframesTaskRecord>(this.persistFile));
  }

  async renderTimeline(
    timeline: TimelinePayload,
    opts?: { templateId?: string; transitionPack?: string },
  ): Promise<RenderResult> {
    const taskId = `hf-${Date.now()}-${++this.taskCounter}`;
    this.tasks.set(taskId, { status: 'queued', updatedAt: Date.now() });
    this.persist();

    this.processRender(taskId, timeline, opts).catch((e) => {
      this.logger.error(`HF render ${taskId} failed: ${e.message}`);
      this.commitTask(taskId, { status: 'error', message: e.message });
    });

    return { ok: true, taskId, status: 'queued' };
  }

  getTaskStatus(taskId: string): HyperframesTaskRecord | null {
    return this.tasks.get(taskId) ?? null;
  }

  /** F-046: 取消渲染任务；已结束的任务不可再改 */
  cancelTask(taskId: string): boolean {
    const current = this.tasks.get(taskId);
    if (!current) return false;
    if (current.status === 'done' || current.status === 'error' || current.status === 'cancelled') {
      return false;
    }
    this.tasks.set(taskId, { status: 'cancelled', updatedAt: Date.now() });
    this.persist();
    return true;
  }

  private persist(): void {
    saveTaskRecords(this.persistFile, mapToRecords(this.tasks));
  }

  private commitTask(taskId: string, next: HyperframesTaskRecord): boolean {
    const applied = applyHyperframesTaskUpdate(this.tasks.get(taskId), next);
    if (!applied) return false;
    this.tasks.set(taskId, { ...applied, updatedAt: Date.now() });
    this.persist();
    return true;
  }

  private async processRender(
    taskId: string,
    timeline: TimelinePayload,
    opts?: { templateId?: string },
  ): Promise<void> {
    if (!this.commitTask(taskId, { status: 'rendering' })) return;

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

      type HfProducer = {
        render: (opts: {
          entry: string;
          out: string;
          fps?: number;
          width?: number;
          height?: number;
        }) => Promise<unknown>;
      };
      let producer: HfProducer;
      try {
        const hf = (await import('@hyperframes/producer')) as unknown as {
          producer?: HfProducer;
        };
        if (!hf.producer?.render) throw new Error('no render');
        producer = hf.producer;
      } catch {
        throw new Error(HF_PRODUCER_UNAVAILABLE);
      }

      if (!this.commitTask(taskId, { status: 'rendering' })) return;

      await producer.render({
        entry: join(workDir, 'index.html'),
        out: outPath,
        fps: timeline.fps,
        width: timeline.width,
        height: timeline.height,
      });

      const url = `/media/exports/${outFilename}`;
      if (!this.commitTask(taskId, { status: 'done', url })) {
        this.logger.log(`HF render ${taskId} finished after cancel, discarded ${url}`);
        return;
      }
      this.logger.log(`HF render ${taskId} done: ${url}`);
    } catch (e) {
      const message = (e as Error).message;
      this.logger.error(`HF render ${taskId} error: ${message}`);
      this.commitTask(taskId, { status: 'error', message });
    }
  }
}
