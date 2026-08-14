import { describe, expect, it } from 'vitest';
import {
  inferBasicPictureGenMode,
  isSpecializedPictureMode,
  resolveRuntimePictureGenMode,
  resolvePictureGenRunPrompt,
  patchPictureGenMode,
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

describe('清除专业工具时回落模式', () => {
  it('退出图片放大时清掉 upscale-hd，按参考数回落', async () => {
    const { buildClearPictureProActionPatch } = await import(
      '../stage-deck/chrome/attached-workspace/generation/picture/picture-pro-actions'
    );
    const cleared = buildClearPictureProActionPatch(
      {
        pictureGenMode: 'upscale-hd',
        pictureProAction: 'upscale-hd',
        pictureProActionLabel: '图片放大',
        useImageReference: true,
      },
      0,
    );
    expect(cleared.pictureProAction).toBeUndefined();
    expect(cleared.pictureProActionLabel).toBeUndefined();
    expect(cleared.pictureGenMode).toBe('text-to-image');
    expect(cleared.useImageReference).toBe(false);
  });

  it('仅残留 upscale-hd（无专业芯片）也能清回文生图', async () => {
    const { buildClearPictureProActionPatch } = await import(
      '../stage-deck/chrome/attached-workspace/generation/picture/picture-pro-actions'
    );
    const cleared = buildClearPictureProActionPatch({ pictureGenMode: 'upscale-hd' }, 1);
    expect(cleared.pictureGenMode).toBe('image-to-image');
    expect(cleared.useImageReference).toBe(true);
  });

  it('退出全景时回落基础模式', async () => {
    const { buildClearPictureProActionPatch } = await import(
      '../stage-deck/chrome/attached-workspace/generation/picture/picture-pro-actions'
    );
    const cleared = buildClearPictureProActionPatch(
      { pictureGenMode: 'panorama-720', pictureProAction: 'panorama-720' },
      2,
    );
    expect(cleared.pictureGenMode).toBe('multi-ref');
  });
});

describe('PG-37 runPrompt 优先于 content', () => {
  it('runPrompt 非空时优先，content 不被当作发送稿', () => {
    expect(
      resolvePictureGenRunPrompt({ runPrompt: 'run prompt', content: 'user prompt' }),
    ).toBe('run prompt');
  });

  it('空白 runPrompt 回退用户 content', () => {
    expect(
      resolvePictureGenRunPrompt({ runPrompt: '   ', content: 'user prompt' }),
    ).toBe('user prompt');
  });

  it('无 runPrompt 时读 content', () => {
    expect(resolvePictureGenRunPrompt({ content: 'user prompt' })).toBe('user prompt');
  });
});

describe('PG-46 全景比例不粘滞', () => {
  it('进入全景记住上次非全景比例，退出恢复', () => {
    const entered = patchPictureGenMode('panorama-720', { aspectRatio: '16:9' });
    expect(entered.aspectRatio).toBe('2:1');
    expect(entered.nonPanoramaAspectRatio).toBe('16:9');
    const left = patchPictureGenMode('text-to-image', {
      pictureGenMode: 'panorama-720',
      aspectRatio: '2:1',
      nonPanoramaAspectRatio: '16:9',
    });
    expect(left.aspectRatio).toBe('16:9');
  });

  it('无记忆时退出全景回 1:1', () => {
    const left = patchPictureGenMode('multi-ref', {
      pictureGenMode: 'panorama-720',
      aspectRatio: '2:1',
    });
    expect(left.aspectRatio).toBe('1:1');
  });

  it('专业动作进入全景也记住比例', async () => {
    const { PICTURE_PRO_ACTIONS, buildPictureProActionPatch } = await import(
      '../stage-deck/chrome/attached-workspace/generation/picture/picture-pro-actions'
    );
    const panorama = PICTURE_PRO_ACTIONS.find((a) => a.id === 'panorama-720');
    expect(panorama).toBeDefined();
    const patch = buildPictureProActionPatch(panorama!, { aspectRatio: '9:16' });
    expect(patch.aspectRatio).toBe('2:1');
    expect(patch.nonPanoramaAspectRatio).toBe('9:16');
  });

  it('退出全景专业工具时恢复记忆比例', async () => {
    const { buildClearPictureProActionPatch } = await import(
      '../stage-deck/chrome/attached-workspace/generation/picture/picture-pro-actions'
    );
    const cleared = buildClearPictureProActionPatch(
      {
        pictureGenMode: 'panorama-720',
        pictureProAction: 'panorama-720',
        aspectRatio: '2:1',
        nonPanoramaAspectRatio: '4:3',
      },
      0,
    );
    expect(cleared.pictureGenMode).toBe('text-to-image');
    expect(cleared.aspectRatio).toBe('4:3');
  });
});
