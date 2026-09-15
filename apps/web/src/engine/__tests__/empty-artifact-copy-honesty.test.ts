/**
 * 导演 / 资产库 / 线稿：空 URL 文案统一禁止空成功。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const engine = resolve(__dirname, '..');
const webSrc = resolve(__dirname, '../..');

describe('空产物文案诚实门禁（批次 18）', () => {
  it('导演台 / 关键帧批出拒空 URL', () => {
    expect(readFileSync(resolve(engine, 'director-desk-runner.ts'), 'utf8')).toContain(
      '图像生成未返回 URL，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'director-desk-runner.ts'), 'utf8')).toContain(
      '缺少上游链镜表写回适配器，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'director-keyframe-batch-runner.ts'), 'utf8')).toContain(
      '视频生成未返回 URL，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'flow-runner-ops/clip-gen-ops.ts'), 'utf8')).toContain(
      '关键帧门禁缺少画布上下文，拒绝回退全局镜表，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'flow-runner-ops/clip-gen-ops.ts'), 'utf8')).toContain(
      '关键帧门禁未找到上游链镜表，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'director3d-commit-adapter.ts'), 'utf8')).toContain(
      '采用帧缺少持久化图片，禁止提交本地草稿，禁止空成功',
    );
  });

  it('线稿 / 宫格切分 / 图片编辑拒空图', () => {
    expect(readFileSync(resolve(webSrc, 'blocks/craft/storyboard-desk/line-art-ops.ts'), 'utf8')).toContain(
      '宫格线稿未返回图片，禁止空成功',
    );
    expect(readFileSync(resolve(webSrc, 'blocks/craft/storyboard-desk/line-art-ops.ts'), 'utf8')).toContain(
      '宫格切分未返回图片，禁止空成功',
    );
    expect(readFileSync(resolve(webSrc, 'blocks/shared/ImageEditModal.tsx'), 'utf8')).toContain(
      '宫格切分未返回图片，禁止空成功',
    );
  });

  it('资产库生成 / 剪辑渲染 / 拆镜拒空产物', () => {
    const gen = readFileSync(
      resolve(webSrc, 'panels/asset-library/modal/use-asset-library-generation.ts'),
      'utf8',
    );
    expect(gen).toContain('未返回图片，禁止空成功');
    expect(gen).toContain('完整设定板未返回图片，禁止空成功');
    expect(gen).toContain('裁切封面：请先有设定板图片，禁止空成功');
    expect(gen).toContain('五类原图：请先生成并确认角色完整设定板，禁止空成功');
    expect(gen).toContain('服装设定板：没有可生成的服装条目，禁止空成功');
    expect(readFileSync(resolve(engine, 'clip-editor-render.ts'), 'utf8')).toContain(
      '时间线视频轨无可用片段，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'clip-editor-render.ts'), 'utf8')).toContain(
      'FFmpeg 拼接失败，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'clip-editor-render.ts'), 'utf8')).toContain(
      'Remotion 任务提交失败，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'script-breakdown-runner.ts'), 'utf8')).toContain(
      '生成结果为空，禁止空成功',
    );
    expect(readFileSync(resolve(engine, 'script-breakdown-runner.ts'), 'utf8')).toContain(
      '请先输入剧本原文，禁止空成功',
    );
  });
});
