import { describe, expect, it } from 'vitest';
import {
  inferBasicPictureGenMode,
  isSpecializedPictureMode,
  resolveRuntimePictureGenMode,
} from '../stage-deck/chrome/attached-workspace/generation/picture/picture-gen-modes';

describe('picture gen auto mode', () => {
  it('inferBasicPictureGenMode 按参考数量分流', () => {
    expect(inferBasicPictureGenMode(0)).toBe('text-to-image');
    expect(inferBasicPictureGenMode(1)).toBe('image-to-image');
    expect(inferBasicPictureGenMode(2)).toBe('multi-ref');
    expect(inferBasicPictureGenMode(5)).toBe('multi-ref');
  });

  it('专业玩法锁定，不因参考图改模式', () => {
    expect(isSpecializedPictureMode('upscale-hd')).toBe(true);
    expect(isSpecializedPictureMode('panorama-720')).toBe(true);
    expect(isSpecializedPictureMode('text-to-image', 'director-storyboard')).toBe(true);
    expect(isSpecializedPictureMode('text-to-image')).toBe(false);
    expect(isSpecializedPictureMode('image-to-image', 'image-to-image')).toBe(false);
  });

  it('无专业玩法时按参考图自动文生/图生', () => {
    expect(resolveRuntimePictureGenMode({}, [])).toBe('text-to-image');
    expect(resolveRuntimePictureGenMode({ pictureGenMode: 'text-to-image' }, ['a.png'])).toBe(
      'image-to-image',
    );
    expect(
      resolveRuntimePictureGenMode({ pictureGenMode: 'image-to-image' }, ['a.png', 'b.png']),
    ).toBe('multi-ref');
    expect(
      resolveRuntimePictureGenMode({ pictureGenMode: 'multi-ref', useImageReference: true }, []),
    ).toBe('text-to-image');
  });

  it('调度故事板等专业动作保持锁定', () => {
    expect(
      resolveRuntimePictureGenMode(
        { pictureGenMode: 'text-to-image', pictureProAction: 'director-storyboard' },
        ['a.png', 'b.png'],
      ),
    ).toBe('text-to-image');
  });
});
