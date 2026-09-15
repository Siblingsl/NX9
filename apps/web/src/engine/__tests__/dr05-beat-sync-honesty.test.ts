/**
 * DR-05：beat-sync 优先真·听音；失败才 BPM 估切且明示未听音。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../flow-runner-ops/story-ops.ts'), 'utf8');

describe('DR-05 beat-sync 诚实化', () => {
  it('优先 beatAnalyze；成功路径标注 energy-onset / 已听音', () => {
    const branch = src.slice(src.indexOf("if (kind === 'beat-sync')"));
    expect(branch).toContain('api.beatAnalyze');
    expect(branch).toContain("algorithm: 'energy-onset'");
    expect(branch).toContain('listenedToAudio: true');
    expect(branch).toContain('听音节拍分析');
  });

  it('听音失败回退 BPM 估切并明示未听音', () => {
    const branch = src.slice(src.indexOf("if (kind === 'beat-sync')"));
    expect(branch).toContain("algorithm: 'bpm-interval'");
    expect(branch).toContain('listenedToAudio: false');
    expect(branch).toContain('听音失败');
    expect(branch).toContain('（未听音分析）');
  });
});
