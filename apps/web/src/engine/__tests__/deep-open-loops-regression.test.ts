/**
 * DEEP-03/04/06/17 诚实态守卫（2026-08-12 第五批）
 * DEEP-01/02/05/10 由 vg-r2-p3.test.ts 锁定，此处只补本批次新变化。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const webSrc = resolve(__dirname, '..');

function branchOf(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('DEEP-03/04/17 假绿与参数诚实', () => {
  const storyOps = readFileSync(resolve(webSrc, 'flow-runner-ops/story-ops.ts'), 'utf8');
  const legacyOps = readFileSync(resolve(webSrc, 'flow-runner-ops/legacy-honesty-ops.ts'), 'utf8');

  it('variant-fork 明示 skipped，不再 success', () => {
    const branch = branchOf(legacyOps, "if (kind === 'variant-fork') {", "if (kind === 'prompt-diff') {");
    expect(branch).toContain("status: 'skipped'");
    expect(branch).toContain('noop: true');
    expect(branch).toContain('仅标记，不产生变体');
    expect(branch).not.toContain("status: 'success'");
  });

  it('分镜台无活时画布 Run 标 skipped，禁止假绿', () => {
    expect(storyOps).toContain("status: 'skipped'");
    expect(storyOps).toContain('无活（等待编剧台 confirmed package 拆镜，画布 Run 未产生镜表）');
    expect(storyOps).not.toContain("content: '分镜台：等待编剧台 confirmed package 拆镜'");
  });

  it('导演台空队列保留 success 但显式 noop', () => {
    const branch = branchOf(
      storyOps,
      "content: '队列为空（无待出关键帧）'",
      'batchSummary: summary,',
    );
    expect(branch).toContain('meta: { noop: true }');
  });

  it('prompt-diff 模型可配，不写死 gpt-4o-mini', () => {
    const branch = branchOf(legacyOps, "if (kind === 'prompt-diff') {", "if (kind === 'music-gen') {");
    expect(branch).toContain('diffModel');
    expect(branch).toContain('...(diffModel ? { model: diffModel } : {})');
    expect(branch).not.toContain("model: 'gpt-4o-mini'");
  });
});

describe('DEEP-06 孤儿文件清理', () => {
  it('core/panels/VoiceCastPanel.tsx 已删除且无引用', () => {
    expect(
      existsSync(resolve(webSrc, '../blocks/core/panels/VoiceCastPanel.tsx')),
    ).toBe(false);
    const sound = readFileSync(resolve(webSrc, '../blocks/core/SoundGenBlock.tsx'), 'utf8');
    // SoundGenBlock 的 VoiceCastPanel 别名指向 nx9/VoiceCastBlock，不得回指已删文件。
    expect(sound).toContain("lazy(() => import('../nx9/VoiceCastBlock'))");
  });
});
