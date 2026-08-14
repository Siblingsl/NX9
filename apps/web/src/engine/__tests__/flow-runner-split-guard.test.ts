/**
 * ENG-03：flow-runner.ts 巨石拆分守卫（2026-08-13）
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { runFlowBatch, RUNNABLE_BLOCKS } from '../flow-runner';

const webSrc = resolve(__dirname, '..');
const opsDir = resolve(webSrc, 'flow-runner-ops');

function readSource(rel: string) {
  return readFileSync(resolve(webSrc, rel), 'utf8');
}

describe('ENG-03 flow-runner 拆分守卫', () => {
  it('主文件显著缩小且 ops 模块齐备', () => {
    const mainLines = readSource('flow-runner.ts').split('\n').length;
    expect(mainLines).toBeLessThan(1000);
    const opsFiles = readdirSync(opsDir).filter((f) => f.endsWith('.ts'));
    expect(opsFiles).toEqual(
      expect.arrayContaining([
        'base-ops.ts',
        'clip-gen-ops.ts',
        'media-ops.ts',
        'story-ops.ts',
        'tool-ops.ts',
        'legacy-honesty-ops.ts',
      ]),
    );
  });

  it('分支实现已迁出主文件', () => {
    const main = readSource('flow-runner.ts');
    expect(main).not.toContain('const { block, kind, prompt, upstream, updateNodeData, ctx } = deps;');
    expect(main).not.toContain('const charCtx = characterContextForBlock');
    expect(main).not.toContain('parseContinuityLlmJson(raw)');
    expect(main).not.toContain("soundMode === 'music'");
    expect(main).not.toContain('lastBatchPreviewUrl: summary.lastUrl');
  });

  it('各域分支锚点落在对应 ops 文件', () => {
    const base = readSource('flow-runner-ops/base-ops.ts');
    const clip = readSource('flow-runner-ops/clip-gen-ops.ts');
    const media = readSource('flow-runner-ops/media-ops.ts');
    const story = readSource('flow-runner-ops/story-ops.ts');
    const tool = readSource('flow-runner-ops/tool-ops.ts');
    const legacy = readSource('flow-runner-ops/legacy-honesty-ops.ts');

    expect(base).toContain("if (kind === 'prompt')");
    expect(base).toContain("if (kind === 'picture-gen')");
    expect(clip).toContain("if (kind === 'clip-gen')");
    expect(media).toContain("if (kind === 'chat-model')");
    expect(media).toContain("if (kind === 'sound-gen')");
    expect(media).toContain("if (kind === 'inpaint-edit')");
    expect(story).toContain("if (kind === 'director-desk')");
    expect(story).toContain("if (kind === 'continuity-check')");
    expect(story).toContain("if (kind === 'beat-sync')");
    expect(tool).toContain("if (kind === 'topaz-picture')");
    expect(tool).toContain("if (kind === 'control-preprocess')");
    expect(legacy).toContain("if (kind === 'export-pack')");
    expect(legacy).toContain("if (kind === 'variant-fork')");
    expect(legacy).toContain("if (kind === 'music-gen')");
  });

  it('runFlowBatch 公共契约保留', () => {
    expect(RUNNABLE_BLOCKS.has('clip-gen')).toBe(true);
    expect(RUNNABLE_BLOCKS.has('continuity-check')).toBe(true);
    expect(typeof runFlowBatch).toBe('function');
  });
});
