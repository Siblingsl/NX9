/**
 * Magic Hour / 网关：完成无下载地址禁止空成功。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(
  resolve(__dirname, '../src/modules/gateway/gateway.service.ts'),
  'utf8',
);

describe('Magic Hour / 网关空地址诚实门禁', () => {
  it('图片完成无地址 / 落盘失败禁止空成功', () => {
    expect(src).toContain('Magic Hour 图片完成但无下载地址，禁止空成功');
    expect(src).toContain('Magic Hour 图片落盘失败，禁止空成功');
  });

  it('视频完成无地址禁止空成功', () => {
    expect(src).toContain('Magic Hour 视频完成但无下载地址，禁止空成功');
    expect(src).toContain('视频任务完成但未返回可下载地址，禁止空成功');
    expect(src).toContain('视频返回了空的 base64 数据，禁止空成功');
    expect(src).toContain('视频产物未写出，禁止空成功');
  });

  it('视频模型 / prompt / 密钥空配置禁止空成功', () => {
    expect(src).toContain('请先在 设置 → 连接 中配置并选择视频模型，禁止空成功');
    expect(src).toContain('Video prompt is required，禁止空成功');
    expect(src).toContain('请先填写 Base URL，禁止空成功');
    expect(src).toContain('请先填写 API Key，禁止空成功');
    expect(src).toContain('视频 API 返回格式无法识别');
    expect(src).toMatch(/视频 API 返回格式无法识别[\s\S]*禁止空成功/);
    expect(src).toContain('未配置 MAGIC_HOUR_API_KEY，禁止空成功');
    expect(src).toContain('未配置 GEMINI_API_KEY / 设置中的 Gemini API Key，禁止空成功');
  });

  it('Gemini 网关层拒空 urls', () => {
    expect(src).toContain('Gemini 未返回图片，禁止空成功');
  });

  it('Comfy / MH 提交缺 id 禁止空成功', () => {
    expect(src).toContain('ComfyUI 未返回 prompt_id，禁止空成功');
    expect(src).toContain('ComfyUI 任务超时（180s），请检查本地 ComfyUI 是否仍在运行，禁止空成功');
    const mh = readFileSync(
      resolve(__dirname, '../src/modules/gateway/magic-hour.adapter.ts'),
      'utf8',
    );
    expect(mh).toContain('Magic Hour 未返回 image project id，禁止空成功');
    expect(mh).toContain('Magic Hour 未返回 video project id，禁止空成功');
    expect(mh).toContain('Magic Hour upload-urls 返回为空，禁止空成功');
    expect(mh).toContain('Magic Hour 无法读取参考图，禁止空成功');
    expect(mh).toContain('未配置 MAGIC_HOUR_API_KEY（apps/server/.env），禁止空成功');
  });

  it('视频轮询缺 API Key 禁止空成功', () => {
    expect(src).toContain('未配置 API Key，禁止空成功');
    expect(src).toContain('Image prompt is required，禁止空成功');
    expect(src).toContain('TTS input text is required，禁止空成功');
    expect(src).toContain('Fal model id is required，禁止空成功');
    expect(src).toContain('ComfyUI workflow JSON is required，禁止空成功');
    expect(src).toContain('Empty image response，禁止空成功');
  });

  it('Magic Hour adapter 空 prompt / imageUrl 禁止空成功', () => {
    const mh = readFileSync(
      resolve(__dirname, '../src/modules/gateway/magic-hour.adapter.ts'),
      'utf8',
    );
    expect(mh).toContain('Image prompt is required，禁止空成功');
    expect(mh).toContain('Video prompt is required，禁止空成功');
    expect(mh).toContain('imageUrl is required，禁止空成功');
    expect(mh).toMatch(/Magic Hour 返回非 JSON:[\s\S]*禁止空成功/);
  });
});
