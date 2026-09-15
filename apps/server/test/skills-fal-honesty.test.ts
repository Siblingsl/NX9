/**
 * Skills / Fal 提交：空正文与提交失败禁止空成功文案。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('skills / video-edit 诚实门禁', () => {
  it('Skill 正文为空禁止注入空成功', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/modules/skills/skills.service.ts'),
      'utf8',
    );
    expect(src).toContain('正文为空，禁止空成功');
    expect(src).toContain('frontmatter 缺少 name，禁止空成功');
    expect(src).toContain('frontmatter 缺少 description，禁止空成功');
    expect(src).toContain('为空（至少 1 个文件），禁止空成功');
    expect(src).toContain('metadata.json 缺失，禁止空成功');
    expect(src).toContain('description 缺失或过短（需 ≥20 字），禁止空成功');
    expect(src).toContain('meta.description.length < 20');
    expect(src).toContain('SKILL.md 不存在，禁止空成功');
    expect(src).toContain('examples/ 目录缺失，禁止空成功');
    expect(src).toContain('Skill description 缺失或过短（需 ≥20 字），禁止空成功');
  });

  it('Fal 上传/提交失败文案带禁止空成功', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/modules/montage/video-edit.service.ts'),
      'utf8',
    );
    expect(src).toContain('Fal storage 上传失败，禁止空成功');
    expect(src).toContain('Fal 提交失败，禁止空成功');
    expect(src).toContain('Fal 追踪提交失败，禁止空成功');
    expect(src).toContain('videoUrl 与 prompt 必填，禁止空成功');
    expect(src).toContain('videoUrl 与 maskUrl（首帧蒙版）必填，禁止空成功');
    const gateway = readFileSync(
      resolve(__dirname, '../src/modules/gateway/gateway.service.ts'),
      'utf8',
    );
    expect(gateway).toContain('Fal 任务已排队但缺少 request_id，禁止空成功');
  });

  it('BGM 提交 HTTP 失败文案带禁止空成功', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/modules/gateway/gateway-music.service.ts'),
      'utf8',
    );
    expect(src).toContain('BGM 提交失败，禁止空成功');
    expect(src).toContain('BGM 描述不能为空，禁止空成功');
  });

  it('复刻参考链接为空禁止空成功', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/modules/tools/vision-tools.service.ts'),
      'utf8',
    );
    expect(src).toContain('参考链接为空，禁止空成功');
    expect(src).toContain('LLM 返回无法解析为 JSON，禁止空成功');
  });

  it('工作区空 payload / 空对白禁止空成功', () => {
    const ws = readFileSync(
      resolve(__dirname, '../src/modules/workspace/workspace.service.ts'),
      'utf8',
    );
    const prisma = readFileSync(
      resolve(__dirname, '../src/modules/workspace/prisma-workspace.store.ts'),
      'utf8',
    );
    const voice = readFileSync(
      resolve(__dirname, '../src/modules/workspace/voice-workspace.service.ts'),
      'utf8',
    );
    expect(ws).toContain('Refusing to overwrite non-empty workspace with empty payload，禁止空成功');
    expect(prisma).toContain('Refusing to overwrite non-empty workspace with empty payload，禁止空成功');
    expect(voice).toContain('No voice lines in workspace，禁止空成功');
    const tools = readFileSync(
      resolve(__dirname, '../src/modules/tools/tools.controller.ts'),
      'utf8',
    );
    expect(tools).toContain('Prompt 包格式无效：需要 JSON 数组或 {items: [...]}，禁止空成功');
    expect(tools).toMatch(/下载失败:[\s\S]*禁止空成功/);
    expect(tools).toMatch(/拉取失败:[\s\S]*禁止空成功/);
    const picture = readFileSync(
      resolve(__dirname, '../src/modules/picture/picture.controller.ts'),
      'utf8',
    );
    expect(picture).toContain('edit-masked 需要 imageUrl、maskUrl 与 prompt，禁止空成功');
  });
});
