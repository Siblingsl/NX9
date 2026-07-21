import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import type { GridCellPrompt } from '@nx9/shared';
import { buildLineArtGridPrompt, buildLineArtShotPrompt } from '@nx9/shared';
import { PATHS } from '../../config/app.config';
import { resolveMediaUrl } from '../../common/media-path';
import { AssetsService } from '../assets/assets.service';
import { GatewayService } from '../gateway/gateway.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class GridService {
  constructor(
    private readonly assets: AssetsService,
    private readonly gateway: GatewayService,
  ) {}

  async splitGrid(sourceUrl: string, rows = 3, cols = 3) {
    const local = resolveMediaUrl(sourceUrl);
    if (!local) throw new Error(`无法解析图片路径: ${sourceUrl}`);
    const meta = await sharp(local).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < cols || h < rows) throw new Error('图片尺寸不足以切分');

    const cellW = Math.floor(w / cols);
    const cellH = Math.floor(h / rows);
    const urls: string[] = [];
    const stamp = Date.now();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const name = `split-${stamp}-${r}-${c}.jpg`;
        const out = join(PATHS.images, name);
        await sharp(local)
          .extract({ left: c * cellW, top: r * cellH, width: cellW, height: cellH })
          .jpeg({ quality: 90 })
          .toFile(out);
        urls.push(this.assets.publicUrl('images', name));
      }
    }
    return { ok: true, urls, rows, cols };
  }

  /**
   * 将多张分镜图合成为一张宫格大图（纸面分镜条）。
   * labels 可选：每格左上角编号/标题。
   */
  async composeGrid(
    imageUrls: string[],
    rows: number,
    cols: number,
    labels?: string[],
  ) {
    const paths = imageUrls.map((u) => resolveMediaUrl(u)).filter(Boolean) as string[];
    if (paths.length === 0) throw new Error('无有效图片');
    const count = Math.min(paths.length, Math.max(1, rows) * Math.max(1, cols));
    const safeCols = Math.max(1, cols);
    const safeRows = Math.max(1, rows, Math.ceil(count / safeCols));

    const gap = 10;
    const pad = 14;
    const titleH = 28;
    const cellW = 480;
    const cellH = 300;
    const panelW = cellW;
    const panelH = titleH + cellH;
    const canvasW = pad * 2 + safeCols * panelW + (safeCols - 1) * gap;
    const canvasH = pad * 2 + safeRows * panelH + (safeRows - 1) * gap;

    const composites: sharp.OverlayOptions[] = [];
    for (let i = 0; i < count; i++) {
      const r = Math.floor(i / safeCols);
      const c = i % safeCols;
      const left = pad + c * (panelW + gap);
      const top = pad + r * (panelH + gap);
      const labelRaw = (labels?.[i] ?? `${i + 1}.`).replace(/[<>&"]/g, '').slice(0, 36);

      const frameSvg = Buffer.from(
        `<svg width="${panelW}" height="${panelH}" xmlns="http://www.w3.org/2000/svg">
          <rect x="0.75" y="0.75" width="${panelW - 1.5}" height="${panelH - 1.5}" fill="#ffffff" stroke="#2a241c" stroke-width="1.5"/>
          <rect x="1" y="1" width="${panelW - 2}" height="${titleH - 1}" fill="#ffffff"/>
          <line x1="1" y1="${titleH}" x2="${panelW - 1}" y2="${titleH}" stroke="#2a241c" stroke-width="1" stroke-opacity="0.55"/>
          <text x="8" y="${Math.round(titleH * 0.72)}" font-family="sans-serif" font-size="14" font-weight="700" fill="#1a1a1a">${labelRaw}</text>
        </svg>`,
      );
      composites.push({ input: frameSvg, left, top });

      const imgBuf = await sharp(paths[i])
        .resize(cellW - 4, cellH - 4, { fit: 'contain', background: '#f7f5f1' })
        .jpeg({ quality: 90 })
        .toBuffer();
      composites.push({ input: imgBuf, left: left + 2, top: top + titleH + 2 });
    }

    const name = `compose-${Date.now()}.jpg`;
    const out = join(PATHS.images, name);
    await sharp({
      create: { width: canvasW, height: canvasH, channels: 3, background: '#f3f1ec' },
    })
      .composite(composites)
      .jpeg({ quality: 92 })
      .toFile(out);

    return {
      ok: true,
      url: this.assets.publicUrl('images', name),
      rows: safeRows,
      cols: safeCols,
      count,
    };
  }

  async generateStoryGrid(prompt: string, rows = 3, cols = 3, style: 'cinematic' | 'line-art' = 'cinematic') {
    const gridPrompt = style === 'line-art'
      ? buildLineArtGridPrompt(prompt, rows, cols)
      : [
          prompt.trim(),
          `cinematic storyboard contact sheet, ${rows}x${cols} panel grid layout,`,
          'consistent characters, numbered panels left-to-right top-to-bottom,',
          'no borders text or watermarks, production storyboard style',
        ]
          .filter(Boolean)
          .join(' ');

    const generated = await this.gateway.proxyImage({
      prompt: gridPrompt,
      model: 'dall-e-3',
      size: rows * cols > 6 ? '1792x1024' : '1024x1024',
    });

    return {
      ok: true,
      url: generated.url,
      prompt: gridPrompt,
      rows,
      cols,
      style,
      message: style === 'line-art' ? '已生成线稿分镜宫格' : '已通过图像 API 生成分镜宫格',
    };
  }

  async generateShotSketch(body: {
    descriptionZh: string;
    promptEn?: string;
    shotType?: string;
    artStylePrompt?: string;
  }) {
    const shotPrompt = buildLineArtShotPrompt(
      body.promptEn || body.descriptionZh,
      body.shotType,
    );
    const finalPrompt = body.artStylePrompt
      ? `${shotPrompt}, ${body.artStylePrompt}`
      : shotPrompt;

    const generated = await this.gateway.proxyImage({
      prompt: finalPrompt,
      model: 'dall-e-3',
      size: '1024x1024',
    });

    return {
      ok: true,
      url: generated.url,
      prompt: finalPrompt,
      message: '已生成单镜线稿',
    };
  }

  private imageDataUrl(url: string): string {
    const local = resolveMediaUrl(url);
    if (!local) return url;
    const buf = readFileSync(local);
    const ext = local.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
    return `data:image/${ext};base64,${buf.toString('base64')}`;
  }

  private async visionCellPrompt(
    cellUrl: string,
    index: number,
    row: number,
    col: number,
    storyPrompt?: string,
  ): Promise<GridCellPrompt> {
    const visionUrl = this.imageDataUrl(cellUrl);
    const res = (await this.gateway.proxyLlm({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `你是分镜分析师。分析故事板宫格中的单格画面，输出三层 Prompt JSON：
{
  "imagePrompt":"英文首帧静态生图提示词",
  "imagePromptZh":"中文首帧描述",
  "needsEndFrame":true/false,
  "endFramePrompt":"英文尾帧提示词(若不需要则空)",
  "endFramePromptZh":"中文尾帧",
  "endFrameReason":"为何需要尾帧",
  "videoPrompt":"英文视频动态/运镜提示词",
  "videoPromptZh":"中文视频描述"
}
needsEndFrame 在人物走位、镜头推拉摇移、状态变化时为 true。`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                `格子编号 ${index}，行 ${row + 1} 列 ${col + 1}。`,
                storyPrompt ? `故事上下文: ${storyPrompt}` : '',
              ]
                .filter(Boolean)
                .join('\n'),
            },
            { type: 'image_url', image_url: { url: visionUrl } },
          ],
        },
      ],
    })) as { choices?: { message?: { content?: string } }[] };

    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(res.choices?.[0]?.message?.content ?? '{}');
    } catch {
      data = {};
    }

    return {
      index,
      row,
      col,
      cellImageUrl: cellUrl,
      imagePrompt: String(data.imagePrompt ?? ''),
      imagePromptZh: String(data.imagePromptZh ?? ''),
      needsEndFrame: Boolean(data.needsEndFrame),
      endFramePrompt: String(data.endFramePrompt ?? ''),
      endFramePromptZh: String(data.endFramePromptZh ?? ''),
      endFrameReason: data.endFrameReason ? String(data.endFrameReason) : undefined,
      videoPrompt: String(data.videoPrompt ?? data.imagePrompt ?? ''),
      videoPromptZh: String(data.videoPromptZh ?? data.imagePromptZh ?? ''),
    };
  }

  /** 宫格切分 + 逐格 Vision 三层反推 */
  async reverseGridPrompts(
    sourceUrl: string,
    rows = 3,
    cols = 3,
    storyPrompt?: string,
  ) {
    const split = await this.splitGrid(sourceUrl, rows, cols);
    const cells: GridCellPrompt[] = [];
    for (let i = 0; i < split.urls.length; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      cells.push(await this.visionCellPrompt(split.urls[i], i + 1, r, c, storyPrompt));
    }
    return {
      ok: true,
      rows,
      cols,
      sourceUrl,
      splitUrls: split.urls,
      cells,
      message: `已反推 ${cells.length} 格三层 Prompt`,
    };
  }
}
