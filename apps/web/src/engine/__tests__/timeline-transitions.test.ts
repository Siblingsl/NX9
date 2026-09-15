import { describe, expect, it } from 'vitest';
import { computeClipTransition, transitionFadesOut } from '@nx9/shared';

const FPS = 30;

describe('出向转场渲染样式（wipe/shader 渲染层接入）', () => {
  it('fade 不延长 Sequence，走片段尾压黑渐隐（历史语义）', () => {
    const r = computeClipTransition({ kind: 'fade', durationSec: 0.5 }, 0, FPS, 90);
    expect(r.extendFrames).toBe(0);
    expect(r.style.zIndex).toBeUndefined();
    expect(transitionFadesOut({ kind: 'fade', durationSec: 0.5 })).toBe(0.5);
    expect(transitionFadesOut({ kind: 'wipe', durationSec: 0.5 })).toBe(-1);
  });

  it('wipe 在延长窗口内置顶从右向左擦出', () => {
    const duration = 90;
    const extend = Math.round(0.5 * FPS);
    const r0 = computeClipTransition({ kind: 'wipe', durationSec: 0.5 }, 0, FPS, duration);
    expect(r0.extendFrames).toBe(extend);
    expect(r0.style).toEqual({});

    const half = computeClipTransition({ kind: 'wipe', durationSec: 0.5 }, duration + extend / 2, FPS, duration);
    expect(half.style.zIndex).toBe(10);
    expect(half.style.clipPath).toBe('inset(0 50.00% 0 0)');

    const done = computeClipTransition({ kind: 'wipe', durationSec: 0.5 }, duration + extend, FPS, duration);
    expect(done.style).toEqual({});
  });

  it('shader 预置：默认 flash 闪白，blur 渐糊，slide 滑出', () => {
    const duration = 60;
    const mid = duration + 15; // t=0.5
    const flash = computeClipTransition({ kind: 'shader', durationSec: 1 }, mid, FPS, duration);
    expect(flash.style.filter).toBe('brightness(2.25)');

    const blur = computeClipTransition({ kind: 'shader', durationSec: 1, shaderId: 'blur' }, mid, FPS, duration);
    expect(blur.style.filter).toBe('blur(12.0px)');

    const slide = computeClipTransition({ kind: 'shader', durationSec: 1, shaderId: 'slide' }, mid, FPS, duration);
    expect(slide.style.transform).toBe('translateX(-50.00%)');
  });

  it('cut 与无转场不产生任何延长与样式', () => {
    expect(computeClipTransition({ kind: 'cut', durationSec: 0.4 }, 100, FPS, 90)).toEqual({ style: {}, extendFrames: 0 });
    expect(computeClipTransition(null, 100, FPS, 90)).toEqual({ style: {}, extendFrames: 0 });
  });
});
