import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseStoryboardMarkdown } from '@nx9/shared';
import { PATHS } from '../../config/app.config';
import { resolveMediaUrl } from '../../common/media-path';
import { GatewayService } from '../gateway/gateway.service';

@Injectable()
export class AnalyzeService {
  constructor(private readonly gateway: GatewayService) {}

  async probeVideo(videoUrl: string) {
    const local = resolveMediaUrl(videoUrl);
    if (!local || !existsSync(local)) {
      return {
        ok: false,
        message: '无法访问视频文件，请使用已上传或已生成的 /media/videos/ URL',
      };
    }
    return { ok: true, path: local };
  }

  /** Extract N frames via ffmpeg for vision-style analysis hints. */
  async extractFrameHints(videoUrl: string, count = 4): Promise<string[]> {
    const local = resolveMediaUrl(videoUrl);
    if (!local || !existsSync(local)) return [];

    const outDirName = `frames-${Date.now()}`;
    const outDir = join(PATHS.exports, outDirName);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    return new Promise((resolve) => {
      const pattern = join(outDir, 'frame-%03d.jpg');
      const proc = spawn('ffmpeg', [
        '-y',
        '-i',
        local,
        '-vf',
        `fps=1/${Math.max(1, Math.floor(30 / count))}`,
        '-frames:v',
        String(count),
        pattern,
      ]);
      proc.on('error', () => resolve([]));
      proc.on('close', (code) => {
        if (code !== 0) {
          resolve([]);
          return;
        }
        const files = readdirSync(outDir)
          .filter((f) => f.endsWith('.jpg'))
          .map((f) => `/media/exports/${outDirName}/${f}`);
        resolve(files);
      });
    });
  }

  /**
   * OpenMontage-style: infer storyboard structure from reference video metadata + optional notes.
   * Uses LLM to output Markdown table compatible with parseStoryboardMarkdown.
   */
  async analyzeReference(body: {
    videoUrl: string;
    notes?: string;
    targetShotCount?: number;
  }) {
    const probe = await this.probeVideo(body.videoUrl);
    const frameHints = probe.ok ? await this.extractFrameHints(body.videoUrl, 3) : [];
    const shotCount = body.targetShotCount ?? 6;

    const systemPrompt = `你是分镜分析师。根据参考视频信息，输出 Markdown 分镜表。
表头必须为：| 镜号 | 景别 | 画面描述 | 英文提示词 | 时长 |
景别用：特写/中景/全景/远景。时长用秒数如 3s。输出 ${shotCount} 行左右。只输出表格，不要其他说明。`;

    const userContent = [
      `参考视频 URL: ${body.videoUrl}`,
      body.notes ? `用户备注: ${body.notes}` : '',
      frameHints.length ? `已抽帧 ${frameHints.length} 张（路径供参考）: ${frameHints.join(', ')}` : '未能抽帧，请根据 URL 与备注推断合理分镜节奏。',
      '请模仿参考视频的镜头节奏与景别变化，生成分镜表。',
    ]
      .filter(Boolean)
      .join('\n');

    const res = (await this.gateway.proxyLlm({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      model: 'gpt-4o-mini',
    })) as { choices?: { message?: { content?: string } }[] };

    const markdown = res.choices?.[0]?.message?.content ?? '';
    const shots = parseStoryboardMarkdown(markdown);

    return {
      ok: shots.length > 0,
      markdown,
      shots,
      frameHints,
      message: shots.length > 0 ? `已反推 ${shots.length} 个镜头` : '未能解析分镜表，请检查 LLM 输出',
    };
  }
}
