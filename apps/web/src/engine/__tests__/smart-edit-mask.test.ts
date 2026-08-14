import { describe, expect, it } from 'vitest';
import { assertMaskFrameAligned, displayScaleForFrame } from '../smart-edit-mask';

describe('SE-DEEP-14 SmartReplace 蒙版对齐', () => {
  it('蒙版与抽帧同尺寸时通过', () => {
    expect(() =>
      assertMaskFrameAligned({ maskWidth: 1920, maskHeight: 1080, frameWidth: 1920, frameHeight: 1080 }),
    ).not.toThrow();
  });

  it('尺寸不一致时抛出明确错误，禁止错位提交', () => {
    expect(() =>
      assertMaskFrameAligned({ maskWidth: 360, maskHeight: 240, frameWidth: 1920, frameHeight: 1080 }),
    ).toThrow(/蒙版尺寸 .* 与抽帧尺寸 .* 不一致/);
  });

  it('显示画布等比缩放不改变 natural 坐标基准', () => {
    const scale = displayScaleForFrame(1920, 1080, 420, 300);
    expect(scale).toBeLessThan(1);
    expect(Math.round(1920 * scale)).toBeLessThanOrEqual(420);
    expect(Math.round(1080 * scale)).toBeLessThanOrEqual(300);
  });
});
