import { existsSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { PATHS } from '../../config/app.config';
import { AssetsService } from '../assets/assets.service';
import { ImageOpsService } from './image-ops.service';

describe('ImageOpsService separateLayers', () => {
  it('separates a centered subject from a connected flat background', async () => {
    const service = new ImageOpsService(new AssetsService());
    const sourceName = `layer-spec-${Date.now()}.png`;
    const sourcePath = join(PATHS.images, sourceName);
    await sharp({
      create: { width: 40, height: 40, channels: 3, background: '#ffffff' },
    })
      .composite([{
        input: await sharp({
          create: { width: 10, height: 10, channels: 3, background: '#ff0000' },
        }).png().toBuffer(),
        left: 15,
        top: 15,
      }])
      .png()
      .toFile(sourcePath);

    try {
      const result = await service.separateLayers(`/media/images/${sourceName}`, 24);
      expect(result.ok).toBe(true);
      expect(result.method).toBe('border-connected-color');
      expect(result.coverage).toBeCloseTo(0.0625, 2);
      expect(existsSync(join(PATHS.images, decodeURIComponent(result.foregroundUrl.split('/').pop()!)))).toBe(true);
      expect(existsSync(join(PATHS.images, decodeURIComponent(result.backdropUrl.split('/').pop()!)))).toBe(true);
    } finally {
      if (existsSync(sourcePath)) void import('fs').then(({ unlinkSync }) => unlinkSync(sourcePath));
    }
  });
});
