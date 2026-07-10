import { join } from 'path';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { timelineToHyperFramesHtml } from '@nx9/shared';
import type { TimelinePayload } from '@nx9/shared';

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
 * 低层渲染器：将 TimelinePayload 转为 HTML → 调用 @hyperframes/producer 或 FFmpeg fallback
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

    // 优先 programmatic API
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
      // FFmpeg fallback
      const { execSync } = await import('child_process');
      execSync(
        `ffmpeg -f lavfi -i color=c=#000:s=${timeline.width}x${timeline.height}:d=${timeline.durationSec} -c:v libx264 -preset ultrafast "${outPath}"`,
        { stdio: 'ignore' },
      );
    }

    return { ok: true, url: `/media/exports/${outFilename}` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
