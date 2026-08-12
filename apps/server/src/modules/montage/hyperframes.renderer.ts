import { join } from 'path';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { timelineToHyperFramesHtml } from '@nx9/shared';
import type { TimelinePayload } from '@nx9/shared';
import { HF_PRODUCER_UNAVAILABLE } from './hyperframes-task';

const PATHS = {
  exports: process.env.NX9_MEDIA_EXPORTS_DIR || join(process.cwd(), 'media', 'exports'),
};

export interface HyperFramesRenderOpts {
  templateId?: string;
  transitionPack?: 'default' | 'shader';
}

export interface HyperFramesRenderResult {
  ok: boolean;
  url?: string;
  message?: string;
  status?: string;
}

/**
 * 低层渲染器：将 TimelinePayload 转为 HTML → 调用 @hyperframes/producer。
 * producer 不可用时明确失败，禁止 FFmpeg 黑片占位。
 */
export async function renderTimelineToMp4(
  timeline: TimelinePayload,
  opts: HyperFramesRenderOpts = {},
): Promise<HyperFramesRenderResult> {
  try {
    if (!existsSync(PATHS.exports)) {
      mkdirSync(PATHS.exports, { recursive: true });
    }

    const html = timelineToHyperFramesHtml(timeline, opts.templateId);
    const workDir = join(PATHS.exports, `hf-render-${Date.now()}`);
    mkdirSync(workDir, { recursive: true });
    writeFileSync(join(workDir, 'index.html'), html, 'utf-8');

    const outFilename = `episode-hf-${Date.now()}.mp4`;
    const outPath = join(PATHS.exports, outFilename);

    const hf = (await import('@hyperframes/producer')) as unknown as {
      producer?: {
        render: (opts: {
          entry: string;
          out: string;
          fps?: number;
          width?: number;
          height?: number;
        }) => Promise<unknown>;
      };
    };
    if (!hf.producer?.render) {
      return { ok: false, message: HF_PRODUCER_UNAVAILABLE };
    }
    await hf.producer.render({
      entry: join(workDir, 'index.html'),
      out: outPath,
      fps: timeline.fps,
      width: timeline.width,
      height: timeline.height,
    });

    return { ok: true, url: `/media/exports/${outFilename}` };
  } catch (e) {
    const message = (e as Error).message;
    const unavailable =
      /cannot find module|producer/i.test(message) ? HF_PRODUCER_UNAVAILABLE : message;
    return { ok: false, message: unavailable };
  }
}
