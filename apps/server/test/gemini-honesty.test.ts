/**
 * Gemini 图片：空 base64 / 空解码 / 未写出禁止空成功。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(
  resolve(__dirname, '../src/modules/gateway/gemini.adapter.ts'),
  'utf8',
);

describe('Gemini 空成功门禁', () => {
  it('saveInlineImage 拒空数据与空落盘', () => {
    expect(src).toContain('Gemini 图片数据为空，禁止空成功');
    expect(src).toContain('Gemini 图片解码为空，禁止空成功');
    expect(src).toContain('Gemini 图片产物未写出，禁止空成功');
  });

  it('generateContent / Interactions / Imagen 无图禁止空成功', () => {
    expect(src).toContain('Gemini generateContent 未返回图片数据，禁止空成功');
    expect(src).toContain('Gemini Interactions 未返回图片数据，禁止空成功');
    expect(src).toContain('Imagen 未返回图片数据，禁止空成功');
    expect(src).toContain('Gemini 未返回图片（仅文本），禁止空成功');
    expect(src).toContain('Gemini 图片 prompt 不能为空，禁止空成功');
    expect(src).toContain('Imagen prompt 不能为空，禁止空成功');
    expect(src).toMatch(/Gemini 返回非 JSON:[\s\S]*禁止空成功/);
    expect(src).toMatch(/Gemini Interactions 返回非 JSON:[\s\S]*禁止空成功/);
    expect(src).toMatch(/Imagen 返回非 JSON:[\s\S]*禁止空成功/);
    expect(src).toMatch(/Gemini 请求异常:[\s\S]*禁止空成功/);
  });
});
