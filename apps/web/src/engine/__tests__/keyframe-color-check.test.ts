import { describe, expect, it } from 'vitest';
import {
  assessKeyframeColorFromRgb,
  describeKeyframeColorCheck,
  normalizeKeyframeColorCheck,
} from '@nx9/shared';

function fillRgb(count: number, rgb: [number, number, number]): Uint8Array {
  const data = new Uint8Array(count * 3);
  for (let i = 0; i < count; i++) {
    data[i * 3] = rgb[0];
    data[i * 3 + 1] = rgb[1];
    data[i * 3 + 2] = rgb[2];
  }
  return data;
}

describe('assessKeyframeColorFromRgb', () => {
  it('flags high-confidence grayscale as suspect-monochrome', () => {
    const check = assessKeyframeColorFromRgb(fillRgb(128, [180, 180, 180]));
    expect(check.verdict).toBe('suspect-monochrome');
    expect(check.chromaMean).toBe(0);
  });

  it('flags line-art-like black/white as suspect-monochrome', () => {
    const data = new Uint8Array(128 * 3);
    for (let i = 0; i < 128; i++) {
      const v = i % 8 === 0 ? 0 : 250;
      data[i * 3] = v;
      data[i * 3 + 1] = v;
      data[i * 3 + 2] = v;
    }
    expect(assessKeyframeColorFromRgb(data).verdict).toBe('suspect-monochrome');
  });

  it('accepts saturated color as color', () => {
    const check = assessKeyframeColorFromRgb(fillRgb(128, [220, 40, 36]));
    expect(check.verdict).toBe('color');
    expect(check.chromaMean).toBeGreaterThan(100);
  });

  it('returns unknown when samples are too few rather than guessing', () => {
    const check = assessKeyframeColorFromRgb(fillRgb(8, [10, 10, 10]));
    expect(check.verdict).toBe('unknown');
  });

  it('describe only warns on suspect, never on unknown/color', () => {
    expect(describeKeyframeColorCheck({ verdict: 'color' })).toBeNull();
    expect(describeKeyframeColorCheck({ verdict: 'unknown' })).toBeNull();
    expect(describeKeyframeColorCheck({ verdict: 'suspect-monochrome' })).toMatch(/未标失败/);
  });

  it('normalize rejects unknown verdict strings as unknown', () => {
    expect(normalizeKeyframeColorCheck({ verdict: 'failed' }).verdict).toBe('unknown');
  });
});
