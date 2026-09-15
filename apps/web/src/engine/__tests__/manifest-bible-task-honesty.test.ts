/**
 * tasks.pollVideoTask / export-manifest / bible 出图：空产物禁止空成功。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const serverSrc = resolve(__dirname, '../../../../server/src');
const engine = resolve(__dirname, '..');

describe('tasks / manifest / bible 诚实门禁', () => {
  it('pollVideoTask：done 无 url 立即 failed', () => {
    const src = readFileSync(resolve(serverSrc, 'modules/tasks/tasks.service.ts'), 'utf8');
    expect(src).toContain('res.done && !res.url');
    expect(src).toContain('视频任务完成但无输出地址，禁止空成功');
  });

  it('export-manifest-client：响应无 url 拒绝', () => {
    const src = readFileSync(resolve(engine, 'export-manifest-client.ts'), 'utf8');
    expect(src).toContain('CSV 清单未返回下载地址，禁止空成功');
    expect(src).toContain('PDF 清单未返回下载地址，禁止空成功');
    expect(src).toContain('CSV 生成失败，禁止空成功');
    expect(src).toContain('PDF 生成失败，禁止空成功');
  });

  it('useBibleImageGen：无 url 禁止空成功', () => {
    const src = readFileSync(resolve(engine, 'use-bible-image-gen.ts'), 'utf8');
    expect(src).toContain('Bible 图像生成未返回 URL，禁止空成功');
  });

  it('sound-gen BGM 失败文案带禁止空成功', () => {
    const src = readFileSync(resolve(engine, 'sound-gen-runner.ts'), 'utf8');
    expect(src).toContain('BGM 生成失败，禁止空成功');
    expect(src).toContain('BGM 服务未配置。请先在设置→BGM 填写 Suno 兼容 Base URL 与 API Key，禁止空成功');
    expect(src).toContain('BGM 生成超时，禁止空成功');
  });
});
