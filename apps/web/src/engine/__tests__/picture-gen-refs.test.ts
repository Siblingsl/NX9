import { describe, expect, it } from 'vitest';
import {
  packPictureRefs,
  resolvePictureSendRefs,
  uniqueLibraryLabel,
} from '../picture-gen-refs';
import {
  archivePictureGeneration,
  restorePictureGeneration,
} from '../picture-gen-history';
import { buildPictureGenSuccessPatch } from '../picture-gen-commit';

describe('PG-14 参考图打包', () => {
  it('gemini 限额 3：风格图排在主参考之后，末尾 extras 被裁', () => {
    const packed = packPictureRefs({
      provider: 'gemini',
      primary: 'https://a/main.png',
      extras: ['https://a/e1.png', 'https://a/e2.png', 'https://a/e3.png'],
      style: 'https://a/style.png',
    });
    expect(packed.sent).toEqual([
      'https://a/main.png',
      'https://a/style.png',
      'https://a/e1.png',
    ]);
    expect(packed.styleSlot).toBe(2);
    expect(packed.truncatedCount).toBe(2);
    expect(packed.styleNote).toContain('Reference image 2 is a style reference');
  });

  it('openai 限额 4', () => {
    const packed = packPictureRefs({
      provider: 'openai',
      primary: 'm',
      extras: ['a', 'b', 'c', 'd'],
      style: 's',
    });
    expect(packed.sent).toEqual(['m', 's', 'a', 'b']);
    expect(packed.truncatedCount).toBe(2);
    expect(packed.styleSlot).toBe(2);
  });

  it('PG-22 仅风格图 → style-only 注记，风格图仍发送', () => {
    const packed = packPictureRefs({
      provider: 'gemini',
      style: 'https://a/style.png',
    });
    expect(packed.sent).toEqual(['https://a/style.png']);
    expect(packed.styleSlot).toBe(1);
    expect(packed.styleNote).toContain('style-only');
    expect(packed.truncatedCount).toBe(0);
  });

  it('fal 限额 1：只保留主参考，风格注记不入列但仍记录 style', () => {
    const packed = packPictureRefs({
      provider: 'fal',
      primary: 'https://a/main.png',
      style: 'https://a/style.png',
    });
    expect(packed.sent).toEqual(['https://a/main.png']);
    expect(packed.styleSlot).toBeNull();
    expect(packed.style).toBe('https://a/style.png');
    expect(packed.truncatedCount).toBe(1);
  });

  it('去重：风格图与主参考相同不重复占位', () => {
    const packed = packPictureRefs({
      provider: 'gemini',
      primary: 'https://a/x.png',
      extras: ['https://a/x.png'],
      style: 'https://a/x.png',
    });
    expect(packed.sent).toEqual(['https://a/x.png']);
    expect(packed.styleNote).toContain('style-only');
  });
});

describe('PG-23 入库 label 去重', () => {
  it('无冲突保持原名', () => {
    expect(uniqueLibraryLabel('海边小屋', ['森林'])).toBe('海边小屋');
  });

  it('冲突追加序号', () => {
    expect(uniqueLibraryLabel('海边小屋', ['海边小屋', '海边小屋 2'])).toBe('海边小屋 3');
  });
});

describe('PG-19 生成历史', () => {
  it('覆盖前归档旧 urls', () => {
    const next = archivePictureGeneration(
      ['/media/images/a.png'],
      'a cat',
      [],
      1_700_000_000_000,
    );
    expect(next).toHaveLength(1);
    expect(next[0].urls).toEqual(['/media/images/a.png']);
    expect(next[0].prompt).toBe('a cat');
  });

  it('空 urls 不归档', () => {
    expect(archivePictureGeneration([], 'x', [])).toEqual([]);
  });

  it('恢复某一轮并把当前结果重新归档', () => {
    const history = archivePictureGeneration(['old.png'], 'old', [], 1000);
    const restored = restorePictureGeneration(
      history[0].id,
      ['new.png'],
      'new',
      history,
      2000,
    );
    expect(restored?.urls).toEqual(['old.png']);
    expect(restored?.history[0].id).toBe(history[0].id);
    expect(restored?.history.some((h) => h.urls[0] === 'new.png')).toBe(true);
  });

  it('PG-45 归档存用户原稿与发送稿，恢复可回读', () => {
    const history = archivePictureGeneration(
      ['old.png'],
      'polluted prompt',
      [],
      1000,
      { userPrompt: 'a cat', compiledPrompt: 'a cat, cinematic [Composition]' },
    );
    expect(history[0].userPrompt).toBe('a cat');
    expect(history[0].compiledPrompt).toContain('[Composition]');
    const restored = restorePictureGeneration(
      history[0].id,
      ['new.png'],
      'new',
      history,
      2000,
    );
    expect(restored?.userPrompt).toBe('a cat');
    expect(restored?.compiledPrompt).toContain('[Composition]');
  });
});

describe('PG-26 发送参考与模式同源', () => {
  it('文生图不把角色定妆当静默主参考，但注入后升为图生图', () => {
    const send = resolvePictureSendRefs({
      data: {},
      characterRef: 'https://char/look.png',
    });
    expect(send.mode).toBe('image-to-image');
    expect(send.primary).toBe('https://char/look.png');
    expect(send.injected).toEqual([{ url: 'https://char/look.png', role: 'character' }]);
  });

  it('全景模式不注入定妆', () => {
    const send = resolvePictureSendRefs({
      data: { pictureGenMode: 'panorama-720' },
      characterRef: 'https://char/look.png',
    });
    expect(send.mode).toBe('panorama-720');
    expect(send.primary).toBeUndefined();
    expect(send.injected).toEqual([]);
  });

  it('用户上传参考优先于注入', () => {
    const send = resolvePictureSendRefs({
      data: {},
      nodeRef: 'https://user/ref.png',
      characterRef: 'https://char/look.png',
      envRef: 'https://env/bg.png',
    });
    expect(send.primary).toBe('https://user/ref.png');
    expect(send.extras).toContain('https://char/look.png');
    expect(send.extras).toContain('https://env/bg.png');
  });

  it('PG-38 排除的注入参考不再进发送集合，也不升模式', () => {
    const send = resolvePictureSendRefs({
      data: { excludedRefUrls: ['https://char/look.png'] },
      characterRef: 'https://char/look.png',
      envRef: 'https://env/bg.png',
    });
    expect(send.mode).toBe('image-to-image');
    expect(send.primary).toBe('https://env/bg.png');
    expect(send.injected).toEqual([{ url: 'https://env/bg.png', role: 'environment' }]);
  });

  it('PG-38 全部注入被排除时回落文生图', () => {
    const send = resolvePictureSendRefs({
      data: {
        excludedRefUrls: ['https://char/look.png', 'https://env/bg.png'],
      },
      characterRef: 'https://char/look.png',
      envRef: 'https://env/bg.png',
    });
    expect(send.mode).toBe('text-to-image');
    expect(send.primary).toBeUndefined();
    expect(send.injected).toEqual([]);
  });
});

describe('PG-25 成功写回不污染 content', () => {
  it('patch 不含 content，警告走 message', () => {
    const patch = buildPictureGenSuccessPatch({
      urls: ['/media/a.png'],
      compiledPrompt: 'enriched prompt with [Composition]',
      failures: [{ index: 1, error: 'boom' }],
      truncatedRefs: 2,
    });
    expect(patch).not.toHaveProperty('content');
    expect(patch.lastCompiledPrompt).toContain('enriched');
    expect(String(patch.message)).toContain('成功');
    expect(String(patch.message)).toContain('裁掉');
    expect(patch.previewUrls).toEqual(['/media/a.png']);
  });

  it('PG-38 成功 patch 回写实际发送模式', () => {
    const patch = buildPictureGenSuccessPatch({
      urls: ['/media/a.png'],
      pictureGenMode: 'image-to-image',
    });
    expect(patch.pictureGenMode).toBe('image-to-image');
    expect(patch.useImageReference).toBe(true);
  });
});
