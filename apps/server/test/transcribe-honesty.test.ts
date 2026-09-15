/**
 * montage.transcribe：空 SRT 禁止 ok:true。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('montage.transcribe 空成功门禁', () => {
  it('源码拒绝空 srtContent', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/modules/montage/montage.service.ts'),
      'utf8',
    );
    expect(src).toContain('语音转字幕结果为空，禁止空成功');
    expect(src).toContain('API key 未配置，禁止空成功');
    expect(src).toMatch(/Whisper 转写失败:[\s\S]*禁止空成功/);
  });
});
