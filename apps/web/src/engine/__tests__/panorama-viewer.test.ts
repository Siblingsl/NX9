import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isEquirectangularSize } from '../../blocks/shared/PanoramaViewer';

describe('isEquirectangularSize', () => {
  it('detects standard 2:1 equirectangular panoramas', () => {
    expect(isEquirectangularSize(2048, 1024)).toBe(true);
    expect(isEquirectangularSize(4096, 2048)).toBe(true);
  });

  it('keeps ordinary wide images in flat preview mode', () => {
    expect(isEquirectangularSize(1920, 1080)).toBe(false);
    expect(isEquirectangularSize(1024, 1024)).toBe(false);
  });

  it('rejects incomplete image dimensions', () => {
    expect(isEquirectangularSize(0, 0)).toBe(false);
  });
});

describe('PictureWorkspace 全景结果预览接线', () => {
  it('panorama-720 模式向结果画廊传入 panoramaMode', () => {
    const src = readFileSync(
      resolve(__dirname, '../stage-deck/chrome/attached-workspace/generation/picture/PictureWorkspace.tsx'),
      'utf8',
    );
    expect(src).toContain("panoramaMode={pictureGenMode === 'panorama-720'}");
    const gallery = readFileSync(
      resolve(__dirname, '../stage-deck/chrome/attached-workspace/generation/picture/PictureResultGallery.tsx'),
      'utf8',
    );
    expect(gallery).toContain('panoramaMode');
    expect(gallery).toContain('PanoramaViewer');
    expect(gallery).toContain('nx9-panorama-viewer--fill');
  });
});
