/**
 * 生图 runner：ok:false / 无 url 禁止返回成功 URL 列表。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../picture-gen-runner.ts'), 'utf8');

describe('picture-gen-runner 空成功门禁', () => {
  it('高清 / Fal / 网关图生均校验 ok，禁止空成功', () => {
    expect(src).toContain('高清放大失败，禁止空成功');
    expect(src).toContain('Fal 未返回图片，禁止空成功');
    expect(src).toContain('图像生成失败，禁止空成功');
    expect(src).toContain('图片高清需要参考图（上传或连接上游），禁止空成功');
    expect(src).toContain('!res.ok || !res.url');
    expect(src).toContain('res.ok === false');
  });

  it('executor 多图空提示 / 放大缺参考图禁止空成功', () => {
    const exec = readFileSync(resolve(__dirname, '../executors/picture-gen-executor.ts'), 'utf8');
    expect(exec).toContain('请至少填写一条多图提示词，禁止空成功');
    expect(exec).toContain('图片放大需要参考图：请上传或连接上游，禁止空成功');
    expect(exec).toContain('参考板约束阻塞');
    expect(exec).toMatch(/参考板约束阻塞[\s\S]*禁止空成功/);
    const ws = readFileSync(
      resolve(
        __dirname,
        '../stage-deck/chrome/attached-workspace/generation/picture/PictureWorkspace.tsx',
      ),
      'utf8',
    );
    expect(ws).toContain('请至少填写一条多图提示词，禁止空成功');
    expect(ws).toContain('未配置图片模型连接：请先在「设置 → 连接」添加图片模型，禁止空成功');
    expect(ws).toContain('参考图上传失败或未返回 URL，禁止空成功');
    expect(ws).toContain('风格参考图上传失败或未返回 URL，禁止空成功');
  });
});
