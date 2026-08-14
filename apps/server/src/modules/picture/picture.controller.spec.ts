import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { PictureController } from './picture.controller';

describe('PictureController /api/picture/edit-masked', () => {
  const gateway = {
    proxyFal: vi.fn().mockResolvedValue({ ok: true, url: '/media/images/fal.png' }),
    proxyImage: vi.fn().mockResolvedValue({ ok: true, url: '/media/images/gemini.png' }),
  };
  const ctrl = new PictureController(gateway as never);

  it('缺 mask/prompt 返回稳定 BadRequestException', async () => {
    expect(() =>
      ctrl.editMasked({ imageUrl: '/a.png', maskUrl: '', prompt: 'x' } as never),
    ).toThrow(BadRequestException);
    expect(() =>
      ctrl.editMasked({ imageUrl: '', maskUrl: '/m.png', prompt: 'x' } as never),
    ).toThrow(BadRequestException);
    expect(() =>
      ctrl.editMasked({ imageUrl: '/a.png', maskUrl: '/m.png', prompt: '  ' } as never),
    ).toThrow(BadRequestException);
  });

  it('fal-inpaint 走 proxyFal 且携带 mask 与原图', async () => {
    await ctrl.editMasked({
      imageUrl: '/a.png',
      maskUrl: '/m.png',
      prompt: '换装',
      engine: 'fal-inpaint',
    } as never);
    expect(gateway.proxyFal).toHaveBeenCalledWith({
      model: 'fal-ai/fast-sdxl/inpainting',
      input: { image_url: '/a.png', mask_url: '/m.png', prompt: '换装' },
    });
  });

  it('gemini-edit 走 proxyImage 且带原图 + 参考图列表', async () => {
    await ctrl.editMasked({
      imageUrl: '/a.png',
      maskUrl: '/m.png',
      prompt: '换场景',
      referenceImageUrls: ['/ref.png'],
    } as never);
    expect(gateway.proxyImage).toHaveBeenCalledWith({
      prompt: '换场景',
      model: 'gemini-2.5-flash-image',
      referenceImageUrls: ['/a.png', '/ref.png'],
      n: 1,
    });
  });

  it('未知 engine 落到 gemini-edit，不静默伪造其它供应商', async () => {
    await ctrl.editMasked({
      imageUrl: '/a.png',
      maskUrl: '/m.png',
      prompt: 'x',
      engine: 'unknown' as never,
    });
    expect(gateway.proxyImage).toHaveBeenCalled();
    expect(gateway.proxyFal).not.toHaveBeenCalledWith(
      expect.objectContaining({ model: 'unknown' }),
    );
  });
});
