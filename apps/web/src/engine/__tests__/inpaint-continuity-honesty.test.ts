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
    const runner = readFileSync(resolve(webSrc, 'flow-runner.ts'), 'utf8');
    const branch = runner.slice(
      runner.indexOf("if (kind === 'continuity-check')"),
      runner.indexOf("if (kind === 'export-pack')"),
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
});

describe('TOOL-06 inpaint-edit 双路径合一', () => {
  it('默认模型可被节点字段覆盖', () => {
    expect(resolveInpaintModel({})).toBe(DEFAULT_INPAINT_MODEL);
    expect(resolveInpaintModel({ inpaintModel: 'custom/inpaint' })).toBe('custom/inpaint');
  });

  it('工作台与画布 Run 都走 runInpaintEdit + shot 写回', () => {
    const runner = readFileSync(resolve(webSrc, 'flow-runner.ts'), 'utf8');
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
    expect(ws).not.toContain("model: 'fal-ai/fast-sdxl/inpainting'");
  });
});
