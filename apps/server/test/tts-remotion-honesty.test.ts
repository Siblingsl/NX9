/**
 * TTS / Remotion：空音频与空成片禁止 ok。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('TTS / Remotion 空成功门禁', () => {
  it('LuxTTS / Voicebox 拒空 buffer', () => {
    const lux = readFileSync(resolve(__dirname, '../src/modules/gateway/luxtts.adapter.ts'), 'utf8');
    const vb = readFileSync(resolve(__dirname, '../src/modules/gateway/voicebox.adapter.ts'), 'utf8');
    expect(lux).toContain('LuxTTS 返回空音频，禁止空成功');
    expect(vb).toContain('Voicebox 返回空音频，禁止空成功');
  });

  it('gateway saveAudioBuffer 拒空并校验落盘', () => {
    const src = readFileSync(resolve(__dirname, '../src/modules/gateway/gateway.service.ts'), 'utf8');
    expect(src).toContain('TTS 音频内容为空，禁止空成功');
    expect(src).toContain('TTS 音频产物未写出，禁止空成功');
  });

  it('Remotion 空文件禁止 done', () => {
    const src = readFileSync(resolve(__dirname, '../src/modules/montage/remotion.renderer.ts'), 'utf8');
    expect(src).toContain('渲染完成但输出文件不存在，禁止空成功');
    expect(src).toContain('渲染产物为空文件，禁止空成功');
  });

  it('编剧技能 JSON 解析失败禁止空成功', () => {
    const src = readFileSync(resolve(__dirname, '../src/modules/agent/agent.service.ts'), 'utf8');
    expect(src).toContain('编剧技能 JSON 无法解析，禁止空成功');
  });
});
