import { Injectable } from '@nestjs/common';
import { join } from 'path';
import sharp from 'sharp';
import { PATHS } from '../../config/app.config';
import { resolveMediaUrl } from '../../common/media-path';
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
    const local = resolveMediaUrl(sourceUrl);
    if (!local) throw new Error(`无法解析图片路径: ${sourceUrl}`);

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
    const paths = imageUrls.map((u) => resolveMediaUrl(u)).filter(Boolean) as string[];
    if (paths.length === 0) throw new Error('无有效图片');

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
    const local = resolveMediaUrl(sourceUrl);
    if (!local) throw new Error(`无法解析图片路径: ${sourceUrl}`);

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
    const local = resolveMediaUrl(sourceUrl);
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
}
