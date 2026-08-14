/**
 * DR-05：beat-sync 只做 BPM 估切，不得宣称听音对齐。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../flow-runner-ops/story-ops.ts'), 'utf8');

describe('DR-05 beat-sync 诚实化', () => {
  it('meta 标注 bpm-interval / 未听音，UI 文案明示未做听音分析', () => {
    const branch = src.slice(src.indexOf("if (kind === 'beat-sync')"));
    expect(branch).toContain("algorithm: 'bpm-interval'");
    expect(branch).toContain('listenedToAudio: false');
    expect(branch).toContain('按 BPM 估切，未做听音分析');
    expect(branch).toContain('（未听音分析）');
  });
});
