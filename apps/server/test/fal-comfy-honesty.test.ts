/**
 * Fal / Comfy：无图与空落盘禁止 ok:true。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(
  resolve(__dirname, '../src/modules/gateway/gateway.service.ts'),
  'utf8',
);

describe('Fal / Comfy 空成功门禁', () => {
  it('proxyFal 无图片返回 ok:false', () => {
    expect(src).toContain("message: 'Fal 未返回图片，禁止空成功'");
    expect(src).toContain('ok: false, output: json');
  });

  it('saveRemoteImage 拒空 buffer 并校验落盘', () => {
    expect(src).toContain('远程图片内容为空，禁止空成功');
    expect(src).toContain('远程图片产物未写出，禁止空成功');
  });

  it('ComfyUI 落盘校验空 buffer / 文件存在', () => {
    const branch = src.slice(src.indexOf('comfy-'));
    expect(branch).toContain('if (!buf.length) continue');
    expect(branch).toContain('if (!existsSync(out)) continue');
  });

  it('模型列表空响应禁止空成功', () => {
    expect(src).toContain('接口已响应，但未返回模型，禁止空成功');
    expect(src).toContain('无法获取模型列表，禁止空成功');
  });
});
