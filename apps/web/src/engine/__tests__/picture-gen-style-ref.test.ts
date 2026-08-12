import { describe, expect, it } from 'vitest';
import {
  patchStyleImageUrl,
  readPictureGenMode,
} from '../stage-deck/chrome/attached-workspace/generation/picture/picture-gen-modes';

describe('PG-03 风格参考图入口', () => {
  it('设置风格图 → 锁定 style-ref 模式', () => {
    const patch = patchStyleImageUrl('https://x/style.png', {});
    expect(patch.styleImageUrl).toBe('https://x/style.png');
    expect(patch.pictureGenMode).toBe('style-ref');
    expect(patch.useImageReference).toBe(true);
  });

  it('清除风格图（style-ref 模式）→ 按剩余上传参考回落基础模式', () => {
    const dataNoRef = { styleImageUrl: 'https://x/style.png', pictureGenMode: 'style-ref' };
    const patchEmpty = patchStyleImageUrl(undefined, dataNoRef);
    expect(patchEmpty.styleImageUrl).toBeUndefined();
    expect(patchEmpty.pictureGenMode).toBe('text-to-image');

    const dataOneRef = {
      styleImageUrl: 'https://x/style.png',
      pictureGenMode: 'style-ref',
      referenceImageUrl: 'https://x/a.png',
    };
    const patchOne = patchStyleImageUrl(undefined, dataOneRef);
    expect(patchOne.pictureGenMode).toBe('image-to-image');
  });

  it('清除风格图（非 style-ref 模式）→ 不动当前模式', () => {
    const data = { styleImageUrl: 'https://x/style.png', pictureGenMode: 'panorama-720' };
    const patch = patchStyleImageUrl(undefined, data);
    expect(patch.styleImageUrl).toBeUndefined();
    expect(patch.pictureGenMode).toBeUndefined();
    expect(readPictureGenMode(data)).toBe('panorama-720');
  });

  it('空白 URL 视为清除', () => {
    const patch = patchStyleImageUrl('   ', { pictureGenMode: 'style-ref' });
    expect(patch.styleImageUrl).toBeUndefined();
    expect(patch.pictureGenMode).toBe('text-to-image');
  });
});
