import { describe, expect, it } from 'vitest';
import { isRemoteImageUrl, materializeImageToLocal } from '../src/common/image-local';
import { unlinkSync } from 'fs';

describe('PG-18 外链图片落地', () => {
  it('识别 http / data URL', () => {
    expect(isRemoteImageUrl('https://cdn.example/a.png')).toBe(true);
    expect(isRemoteImageUrl('data:image/png;base64,aaaa')).toBe(true);
    expect(isRemoteImageUrl('/media/images/a.png')).toBe(false);
  });

  it('data URL 写入本地文件', async () => {
    // 1x1 png
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const local = await materializeImageToLocal(png);
    expect(local).toBeTruthy();
    expect(local?.endsWith('.png')).toBe(true);
    if (local) unlinkSync(local);
  });
});
