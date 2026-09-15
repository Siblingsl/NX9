import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CONTINUITY_IMAGE_CAP,
  buildContinuityUserText,
  resolveContinuityModel,
  sliceContinuityImages,
} from '../continuity-check-runner';
import { DEFAULT_INPAINT_MODEL, resolveInpaintModel } from '../inpaint-edit-runner';

const webSrc = resolve(__dirname, '..');

describe('TOOL-05 continuity-check', () => {
  it('超 4 图给出省略提示，不静默丢弃', () => {
    const sliced = sliceContinuityImages(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(sliced.sent).toHaveLength(CONTINUITY_IMAGE_CAP);
    expect(sliced.omitted).toBe(2);
    expect(sliced.note).toMatch(/省略后 2 张/);
    expect(buildContinuityUserText({ imageCount: 6, omitted: 2 })).toMatch(/省略后 2 张/);
  });

  it('未指定模型时不硬编码 gpt-4o-mini，交给网关全局配置', () => {
    expect(resolveContinuityModel({})).toBeUndefined();
    expect(resolveContinuityModel({ llmModel: 'gpt-4o' })).toBe('gpt-4o');
  });

  it('flow-runner / ContinuityCheckBlock 不再写死 gpt-4o-mini', () => {
    const runner = readFileSync(resolve(webSrc, 'flow-runner-ops/story-ops.ts'), 'utf8');
    const branch = runner.slice(
      runner.indexOf("if (kind === 'continuity-check')"),
      runner.indexOf("if (kind === 'beat-sync')"),
    );
    expect(branch).toContain('resolveContinuityModel');
    expect(branch).toContain('sliceContinuityImages');
    expect(branch).toContain('patchUpstreamShot');
    expect(branch).not.toContain('gpt-4o-mini');
    // 注释可提及旧 API；执行路径不得调用全局写回
    const codeOnly = branch.replace(/\/\/[^\n]*/g, '');
    expect(codeOnly).not.toContain('applyShotReviewFromReport');

    const block = readFileSync(resolve(webSrc, '../blocks/nx9/ContinuityCheckBlock.tsx'), 'utf8');
    expect(block).toContain('resolveContinuityModel');
    expect(block).not.toMatch(/model:\s*'gpt-4o-mini'/);
  });

  it('解析失败时 status=error，禁止空成功假绿', () => {
    const runner = readFileSync(resolve(webSrc, 'flow-runner-ops/story-ops.ts'), 'utf8');
    const branch = runner.slice(
      runner.indexOf("if (kind === 'continuity-check')"),
      runner.indexOf("if (kind === 'beat-sync')"),
    );
    expect(branch).toContain("status: parsed.parseFailed ? 'error' : 'success'");
    expect(branch).toContain('连贯性检查解析失败，禁止空成功');

    const block = readFileSync(resolve(webSrc, '../blocks/nx9/ContinuityCheckBlock.tsx'), 'utf8');
    expect(block).toContain("status: parsed.parseFailed ? 'error' : 'success'");
    expect(block).toContain('连贯性检查解析失败，禁止空成功');
    expect(block).toContain('连贯性检查：至少需要 2 张图像（上游图片或故事板线稿），禁止空成功');
    expect(block).toContain('[连贯性] 未找到连线上游分镜台，禁止空成功');
  });

  it('story-ops 连贯性空前置禁止空成功', () => {
    const ops = readFileSync(resolve(webSrc, 'flow-runner-ops/story-ops.ts'), 'utf8');
    expect(ops).toContain('至少需要 2 张上游图像，禁止空成功');
    expect(ops).toContain('需要上游音频，禁止空成功');
  });
});

describe('TOOL-06 inpaint-edit 双路径合一', () => {
  it('默认模型可被节点字段覆盖', () => {
    expect(resolveInpaintModel({})).toBe(DEFAULT_INPAINT_MODEL);
    expect(resolveInpaintModel({ inpaintModel: 'custom/inpaint' })).toBe('custom/inpaint');
  });

  it('工作台与画布 Run 都走 runInpaintEdit + shot 写回', () => {
    const runner = readFileSync(resolve(webSrc, 'flow-runner-ops/media-ops.ts'), 'utf8');
    const branch = runner.slice(
      runner.indexOf("if (kind === 'inpaint-edit')"),
      runner.indexOf("if (kind === 'thumbnail-maker')"),
    );
    expect(branch).toContain('runInpaintEdit');
    expect(branch).toContain('writeBackInpaintShot');

    const ws = readFileSync(
      resolve(webSrc, 'stage-deck/chrome/attached-workspace/generation/InpaintWorkspace.tsx'),
      'utf8',
    );
    expect(ws).toContain('runInpaintEdit');
    expect(ws).toContain('writeBackInpaintShot');
    expect(ws).toContain('局部重绘：无上游图片，禁止空成功');
    expect(ws).toContain('局部重绘：请输入 prompt，禁止空成功');
    expect(ws).toContain('局部重绘：请绘制蒙版，禁止空成功');
    expect(ws).toContain('toastError');
    expect(ws).not.toContain("model: 'fal-ai/fast-sdxl/inpainting'");
  });

  it('runInpaintEdit 校验 ok，禁止空成功', () => {
    const src = readFileSync(resolve(webSrc, 'inpaint-edit-runner.ts'), 'utf8');
    expect(src).toContain('!res.ok || !res.url');
    expect(src).toContain('局部重绘：需要上游图片，禁止空成功');
    expect(src).toContain('局部重绘：请输入 prompt，禁止空成功');
    expect(src).toContain('重绘失败，禁止空成功');
  });
});
