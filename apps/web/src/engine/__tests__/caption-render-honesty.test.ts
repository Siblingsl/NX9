/**
 * 字幕烧录 / CaptionWorkspace：无 URL 禁止空成功。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webSrc = resolve(__dirname, '../..');

describe('字幕烧录诚实门禁', () => {
  it('CaptionWorkspace 烧录无 URL 拒绝', () => {
    const src = readFileSync(
      resolve(webSrc, 'engine/stage-deck/chrome/attached-workspace/generation/CaptionWorkspace.tsx'),
      'utf8',
    );
    expect(src).toContain('字幕烧录失败，禁止空成功');
    expect(src).toContain('语音转字幕失败或结果为空，禁止空成功');
    expect(src).toContain('字幕台：无上游音频/视频，禁止空成功');
    expect(src).toContain('字幕烧录：字幕文本为空，禁止空成功');
    expect(src).toContain('toastError');
  });

  it('picture-gen-executor / client 导出拒空成功文案', () => {
    expect(
      readFileSync(resolve(webSrc, 'engine/executors/picture-gen-executor.ts'), 'utf8'),
    ).toContain('图像生成失败，禁止空成功');
    expect(readFileSync(resolve(webSrc, 'api/client.ts'), 'utf8')).toContain(
      '导出失败，禁止空成功',
    );
  });
});
