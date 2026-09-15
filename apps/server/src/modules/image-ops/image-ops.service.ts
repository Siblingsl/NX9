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
        `无法读取图片，禁止空成功（本地 /media 或外链下载失败）。请先上传到本机，或确认外链可访问: ${sourceUrl.slice(0, 120)}`,
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
    if (!existsSync(out)) throw new Error('缩放产物未写出，禁止空成功');

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
          ? `无有效图片，禁止空成功：外链下载失败或不是 /media 路径（${failed.length} 张）`
          : '无有效图片，禁止空成功',
      );
    }
    if (failed.length > 0) {
      throw new Error(
        `拼贴缺图，禁止空成功：${failed.length} 张无法读取（外链下载失败或路径无效）。请先上传到本机后再拼贴。`,
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
    if (!existsSync(out)) throw new Error('拼贴产物未写出，禁止空成功');

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
        `无法读取图片，禁止空成功（本地 /media 或外链下载失败）。请先上传到本机，或确认外链可访问: ${sourceUrl.slice(0, 120)}`,
      );
    }

    const factor = Math.max(1.25, Math.min(4, scale));
    const meta = await sharp(local).metadata();
    const w = Math.min(4096, Math.round((meta.width ?? 512) * factor));
    const h = Math.min(4096, Math.round((meta.height ?? 512) * factor));
    const name = `upscale-${Date.now()}.png`;
    const out = join(PATHS.images, name);

    await sharp(local).resize(w, h, { kernel: sharp.kernel.lanczos3 }).png().toFile(out);
    if (!existsSync(out)) throw new Error('放大产物未写出，禁止空成功');

    return { ok: true, url: this.assets.publicUrl('images', name), width: w, height: h, scale: factor };
  }

  async stripMetadata(sourceUrl: string) {
    const local = await materializeImageToLocal(sourceUrl);
    if (!local) throw new Error(`无法解析媒体路径，禁止空成功: ${sourceUrl}`);

    const ext = local.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
    const name = `clean-${Date.now()}.${ext}`;
    const out = join(PATHS.images, name);

    const pipeline = sharp(local).rotate();
    if (ext === 'png') {
      await pipeline.png().toFile(out);
    } else {
      await pipeline.jpeg({ quality: 92, mozjpeg: true }).toFile(out);
    }
    if (!existsSync(out)) throw new Error('元数据清理产物未写出，禁止空成功');

    return { ok: true, url: this.assets.publicUrl('images', name) };
  }

  async thumbnailCompose(
    imageUrl: string,
    title?: string,
    safeZone: string = '9:16',
  ): Promise<{ ok: boolean; url: string }> {
    const local = await materializeImageToLocal(imageUrl);
    if (!local || !existsSync(local)) throw new Error('无法读取源图像，禁止空成功');
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
    if (!existsSync(out)) throw new Error('封面合成产物未写出，禁止空成功');
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

  /**
   * 快速主体/背景分层：从边界连通的近似底色中分离前景。
   * 这是确定性本地预处理，不宣称替代语义抠图。
   */
  async separateLayers(sourceUrl: string, tolerance = 34) {
    const local = await materializeImageToLocal(sourceUrl);
    if (!local) throw new Error(`无法读取图片，禁止空成功: ${sourceUrl}`);

    const { data, info } = await sharp(local)
      .rotate()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const width = info.width ?? 0;
    const height = info.height ?? 0;
    if (width < 4 || height < 4) throw new Error('图片尺寸过小，无法分层，禁止空成功');

    const pixelCount = width * height;
    const at = (x: number, y: number) => (y * width + x) * info.channels;
    const distance = (a: number, b: number) => {
      const dr = data[a]! - data[b]!;
      const dg = data[a + 1]! - data[b + 1]!;
      const db = data[a + 2]! - data[b + 2]!;
      return Math.sqrt(dr * dr + dg * dg + db * db);
    };

    const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
    for (let x = 0; x < width; x += 1) {
      for (const y of [0, height - 1]) {
        const p = at(x, y);
        const key = ((data[p]! >> 4) << 8) | ((data[p + 1]! >> 4) << 4) | (data[p + 2]! >> 4);
        const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
        bin.count += 1;
        bin.r += data[p]!;
        bin.g += data[p + 1]!;
        bin.b += data[p + 2]!;
        bins.set(key, bin);
      }
    }
    for (let y = 0; y < height; y += 1) {
      for (const x of [0, width - 1]) {
        const p = at(x, y);
        const key = ((data[p]! >> 4) << 8) | ((data[p + 1]! >> 4) << 4) | (data[p + 2]! >> 4);
        const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
        bin.count += 1;
        bin.r += data[p]!;
        bin.g += data[p + 1]!;
        bin.b += data[p + 2]!;
        bins.set(key, bin);
      }
    }
    const dominant = [...bins.values()].sort((a, b) => b.count - a.count)[0];
    if (!dominant) throw new Error('无法识别背景色，禁止空成功');
    const background = {
      r: Math.round(dominant.r / dominant.count),
      g: Math.round(dominant.g / dominant.count),
      b: Math.round(dominant.b / dominant.count),
    };

    const backgroundMask = new Uint8Array(pixelCount);
    const stack: number[] = [];
    const pushIfBackground = (x: number, y: number) => {
      const index = y * width + x;
      if (backgroundMask[index]) return;
      const p = index * info.channels;
      const dr = data[p]! - background.r;
      const dg = data[p + 1]! - background.g;
      const db = data[p + 2]! - background.b;
      if (Math.sqrt(dr * dr + dg * dg + db * db) <= tolerance) {
        backgroundMask[index] = 1;
        stack.push(index);
      }
    };

    for (let x = 0; x < width; x += 1) {
      pushIfBackground(x, 0);
      pushIfBackground(x, height - 1);
    }
    for (let y = 0; y < height; y += 1) {
      pushIfBackground(0, y);
      pushIfBackground(width - 1, y);
    }
    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % width;
      const y = Math.floor(index / width);
      if (x > 0) pushIfBackground(x - 1, y);
      if (x + 1 < width) pushIfBackground(x + 1, y);
      if (y > 0) pushIfBackground(x, y - 1);
      if (y + 1 < height) pushIfBackground(x, y + 1);
    }

    let foregroundPixels = 0;
    const foreground = Buffer.alloc(pixelCount * 4);
    const backdrop = Buffer.alloc(pixelCount * 3);
    for (let index = 0; index < pixelCount; index += 1) {
      const source = index * info.channels;
      const isForeground = backgroundMask[index] === 0;
      if (isForeground) foregroundPixels += 1;
      foreground[source] = data[source]!;
      foreground[source + 1] = data[source + 1]!;
      foreground[source + 2] = data[source + 2]!;
      foreground[source + 3] = isForeground ? data[source + 3]! : 0;
      backdrop[index * 3] = isForeground ? background.r : data[source]!;
      backdrop[index * 3 + 1] = isForeground ? background.g : data[source + 1]!;
      backdrop[index * 3 + 2] = isForeground ? background.b : data[source + 2]!;
    }

    if (foregroundPixels === 0 || foregroundPixels === pixelCount) {
      throw new Error('未找到可分离的主体边界，禁止空成功；可尝试调整容差');
    }

    const stamp = Date.now();
    const foregroundName = `layer-fg-${stamp}.png`;
    const backdropName = `layer-bg-${stamp}.jpg`;
    const fgOut = join(PATHS.images, foregroundName);
    const bgOut = join(PATHS.images, backdropName);
    await sharp(foreground, { raw: { width, height, channels: 4 } })
      .png()
      .toFile(fgOut);
    await sharp(backdrop, { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 92 })
      .toFile(bgOut);
    if (!existsSync(fgOut) || !existsSync(bgOut)) {
      throw new Error('图层分离产物未写出，禁止空成功');
    }

    return {
      ok: true,
      method: 'border-connected-color',
      foregroundUrl: this.assets.publicUrl('images', foregroundName),
      backdropUrl: this.assets.publicUrl('images', backdropName),
      coverage: Number((foregroundPixels / pixelCount).toFixed(4)),
      tolerance,
      background,
    };
  }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
