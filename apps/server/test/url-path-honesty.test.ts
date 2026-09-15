/**
 * URL 抽取 / 媒体路径解析：空输入与不可解析路径禁止空成功文案。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractUrlFromText } from '../src/common/url-utils';

describe('url / 媒体路径诚实门禁', () => {
  it('extractUrlFromText 空输入与无链接禁止空成功', () => {
    expect(() => extractUrlFromText('')).toThrow('URL 为空，禁止空成功');
    expect(() => extractUrlFromText('not-a-url')).toThrow('未在文本中找到有效链接，禁止空成功');
    expect(extractUrlFromText('see https://cdn.example.com/a.mp4 now')).toBe(
      'https://cdn.example.com/a.mp4',
    );
  });

  it('网关/宫格/image-ops/montage 路径解析文案带禁止空成功', () => {
    const gateway = readFileSync(
      resolve(__dirname, '../src/modules/gateway/gateway.service.ts'),
      'utf8',
    );
    const grid = readFileSync(resolve(__dirname, '../src/modules/grid/grid.service.ts'), 'utf8');
    const imageOps = readFileSync(
      resolve(__dirname, '../src/modules/image-ops/image-ops.service.ts'),
      'utf8',
    );
    const montage = readFileSync(
      resolve(__dirname, '../src/modules/montage/montage.service.ts'),
      'utf8',
    );
    expect(gateway).toContain('无法解析本地媒体，禁止空成功');
    expect(grid).toContain('无法解析图片路径，禁止空成功');
    expect(imageOps).toContain('无法解析媒体路径，禁止空成功');
    expect(imageOps).toContain('未找到可分离的主体边界，禁止空成功');
    expect(imageOps).toContain('无法读取图片，禁止空成功');
    expect(imageOps).toContain('拼贴缺图，禁止空成功');
    expect(imageOps).toContain('无法读取源图像，禁止空成功');
    expect(imageOps).toContain('图片尺寸过小，无法分层，禁止空成功');
    expect(imageOps).toContain('无法识别背景色，禁止空成功');
    const topaz = readFileSync(resolve(__dirname, '../src/modules/topaz/topaz.service.ts'), 'utf8');
    expect(topaz).toContain('无法读取输入图像，禁止空成功');
    expect(topaz).toContain('无法读取输入视频，禁止空成功');
    expect(gateway).toContain('参考图无法读取，禁止空成功');
    expect(montage).toContain('无法解析视频，禁止空成功');
    expect(montage).toContain('无法读取源视频，禁止空成功');
    expect(montage).toContain('无法读取图片，禁止空成功');
    expect(montage).toContain('无法读取源媒体，禁止空成功');
    expect(montage).toContain('无法读取音频文件，禁止空成功');
    expect(montage).toContain('无法读取源图像，禁止空成功');
    expect(montage).toContain('无法读取音频/视频文件，禁止空成功');
  });
});
