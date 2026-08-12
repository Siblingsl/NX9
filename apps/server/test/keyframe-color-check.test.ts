import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { ImageOpsService } from '../src/modules/image-ops/image-ops.service';

function service() {
  return new ImageOpsService({
    publicUrl: (_folder: string, name: string) => `/media/images/${name}`,
  } as never);
}

describe('image-ops keyframe color check', () => {
  it('read failure returns unknown and does not throw', async () => {
    const result = await service().assessKeyframeColor('/media/images/missing-nope.png');
    expect(result.verdict).toBe('unknown');
  });

  it('gray png is suspect-monochrome; saturated png is color', async () => {
    const gray = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 170, g: 170, b: 170 } },
    }).png().toBuffer();
    const color = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 220, g: 32, b: 40 } },
    }).png().toBuffer();
    const grayUrl = `data:image/png;base64,${gray.toString('base64')}`;
    const colorUrl = `data:image/png;base64,${color.toString('base64')}`;
    const ops = service();
    expect((await ops.assessKeyframeColor(grayUrl)).verdict).toBe('suspect-monochrome');
    expect((await ops.assessKeyframeColor(colorUrl)).verdict).toBe('color');
  });
});
