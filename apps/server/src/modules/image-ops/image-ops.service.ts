import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import {
  assessKeyframeColorFromRgb,
  emptyKeyframeColorCheck,
  type KeyframeColorCheck,
} from '@nx9/shared';
import { PATHS } from '../../config/app.config';
import { materializeImageToLocal, materializeImagesToLocal } from '../../common/image-local';
import { AssetsService } from '../assets/assets.service';

type FitMode = 'cover' | 'contain' | 'fill' | 'inside' | 'outside';

@Injectable()
export class ImageOpsService {
  constructor(private readonly assets: AssetsService) {}

  async resizeImage(
    sourceUrl: string,
    width: number,
    height: number,
    fit: FitMode = 'cover',
  ) {
    const local = await materializeImageToLocal(sourceUrl);
    if (!local) {
      throw new Error(
        `无法读取图片（本地 /media 或外链下载失败）。请先上传到本机，或确认外链可访问: ${sourceUrl.slice(0, 120)}`,
      );
    }

    const w = Math.max(16, Math.min(4096, Math.round(width)));
    const h = Math.max(16, Math.min(4096, Math.round(height)));
    const name = `resize-${Date.now()}.jpg`;
    const out = join(PATHS.images, name);

    await sharp(local)
      .resize(w, h, { fit, background: '#FAFAF8' })
      .jpeg({ quality: 92 })
      .toFile(out);

    return { ok: true, url: this.assets.publicUrl('images', name), width: w, height: h, fit };
  }

  async mergeImages(
    imageUrls: string[],
    direction: 'horizontal' | 'vertical' | 'grid' = 'horizontal',
    cols = 2,
  ) {
    const { paths, failed } = await materializeImagesToLocal(imageUrls.filter(Boolean));
    if (paths.length === 0) {
      throw new Error(
        failed.length
          ? `无有效图片：外链下载失败或不是 /media 路径（${failed.length} 张）`
          : '无有效图片',
      );
    }
    if (failed.length > 0) {
      throw new Error(
        `拼贴缺图：${failed.length} 张无法读取（外链下载失败或路径无效）。请先上传到本机后再拼贴。`,
      );
    }

    const metas = await Promise.all(paths.map((p) => sharp(p).metadata()));
    const cellW = Math.max(...metas.map((m) => m.width ?? 256));
    const cellH = Math.max(...metas.map((m) => m.height ?? 256));

    let canvasW = cellW;
    let canvasH = cellH;
    const count = paths.length;

    if (direction === 'horizontal') {
      canvasW = cellW * count;
      canvasH = cellH;
    } else if (direction === 'vertical') {
      canvasW = cellW;
      canvasH = cellH * count;
    } else {
      const c = Math.max(1, cols);
      const rows = Math.ceil(count / c);
      canvasW = cellW * c;
      canvasH = cellH * rows;
    }

    const composites: sharp.OverlayOptions[] = [];
    for (let i = 0; i < count; i++) {
      let left = 0;
      let top = 0;
      if (direction === 'horizontal') {
        left = i * cellW;
      } else if (direction === 'vertical') {
        top = i * cellH;
      } else {
        const c = Math.max(1, cols);
        left = (i % c) * cellW;
        top = Math.floor(i / c) * cellH;
      }
      const buf = await sharp(paths[i])
        .resize(cellW, cellH, { fit: 'cover' })
        .toBuffer();
      composites.push({ input: buf, left, top });
    }

    const name = `merge-${Date.now()}.jpg`;
    const out = join(PATHS.images, name);
    await sharp({
      create: { width: canvasW, height: canvasH, channels: 3, background: '#FAFAF8' },
    })
      .composite(composites)
      .jpeg({ quality: 92 })
      .toFile(out);

    return {
      ok: true,
      url: this.assets.publicUrl('images', name),
      direction,
      count,
    };
  }

  async upscaleImage(sourceUrl: string, scale = 2) {
    const local = await materializeImageToLocal(sourceUrl);
    if (!local) {
      throw new Error(
        `无法读取图片（本地 /media 或外链下载失败）。请先上传到本机，或确认外链可访问: ${sourceUrl.slice(0, 120)}`,
      );
    }

    const factor = Math.max(1.25, Math.min(4, scale));
    const meta = await sharp(local).metadata();
    const w = Math.min(4096, Math.round((meta.width ?? 512) * factor));
    const h = Math.min(4096, Math.round((meta.height ?? 512) * factor));
    const name = `upscale-${Date.now()}.png`;
    const out = join(PATHS.images, name);

    await sharp(local).resize(w, h, { kernel: sharp.kernel.lanczos3 }).png().toFile(out);

    return { ok: true, url: this.assets.publicUrl('images', name), width: w, height: h, scale: factor };
  }

  async stripMetadata(sourceUrl: string) {
    const local = await materializeImageToLocal(sourceUrl);
    if (!local) throw new Error(`无法解析媒体路径: ${sourceUrl}`);

    const ext = local.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
    const name = `clean-${Date.now()}.${ext}`;
    const out = join(PATHS.images, name);

    const pipeline = sharp(local).rotate();
    if (ext === 'png') {
      await pipeline.png().toFile(out);
    } else {
      await pipeline.jpeg({ quality: 92, mozjpeg: true }).toFile(out);
    }

    return { ok: true, url: this.assets.publicUrl('images', name) };
  }

  async thumbnailCompose(
    imageUrl: string,
    title?: string,
    safeZone: string = '9:16',
  ): Promise<{ ok: boolean; url: string }> {
    const local = await materializeImageToLocal(imageUrl);
    if (!local || !existsSync(local)) throw new Error('无法读取源图像');
    const stamp = Date.now();
    const name = `thumb-${stamp}.png`;
    const out = join(PATHS.images, name);
    const targetW = 1080;
    const targetH = 1920;
    let img = sharp(local).resize(targetW, targetH, { fit: 'cover', position: 'center' });
    if (title?.trim()) {
      const svgText = `<svg width="${targetW}" height="${targetH}"><rect x="0" y="${targetH - 200}" width="${targetW}" height="200" fill="rgba(0,0,0,0.6)"/><text x="${targetW / 2}" y="${targetH - 80}" text-anchor="middle" fill="white" font-size="48" font-family="sans-serif" font-weight="bold">${escapeXml(title.trim())}</text></svg>`;
      img = img.composite([{ input: Buffer.from(svgText), top: 0, left: 0 }]);
    }
    await img.png().toFile(out);
    return { ok: true, url: this.assets.publicUrl('images', name) };
  }

  /**
   * 导演台彩色质检：读图采样色度。读失败返回 unknown，绝不抛成生成失败。
   */
  async assessKeyframeColor(sourceUrl: string): Promise<KeyframeColorCheck> {
    try {
      const local = await materializeImageToLocal(sourceUrl);
      if (!local || !existsSync(local)) return emptyKeyframeColorCheck('unknown');
      const { data, info } = await sharp(local)
        .resize(64, 64, { fit: 'inside', withoutEnlargement: true })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const channels = info.channels === 4 ? 4 : 3;
      return assessKeyframeColorFromRgb(data, channels);
    } catch {
      return emptyKeyframeColorCheck('unknown');
    }
  }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
