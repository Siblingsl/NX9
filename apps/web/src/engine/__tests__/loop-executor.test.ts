import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { advanceIteratorIndex, runRoundsWithConcurrency } from '../stage-deck/execution/loop-executor';

describe('TOOL-04 iterator / loop', () => {
  it('单跑自增，空池保持 0', () => {
    expect(advanceIteratorIndex(0, 3)).toBe(1);
    expect(advanceIteratorIndex(2, 3)).toBe(0);
    expect(advanceIteratorIndex(0, 0)).toBe(0);
  });

  it('flow-runner iterator 分支调用 advanceIteratorIndex', () => {
    const src = readFileSync(resolve(__dirname, '../flow-runner-ops/media-ops.ts'), 'utf8');
    const branch = src.slice(src.indexOf("if (kind === 'iterator')"), src.indexOf("if (kind === 'picker')"));
    expect(branch).toContain('advanceIteratorIndex');
    expect(branch).toContain('lastEmittedIndex');
  });

  it('并行并发会重叠，串行不会', async () => {
    let inflight = 0;
    let maxParallel = 0;
    await runRoundsWithConcurrency(4, 2, async () => {
      inflight += 1;
      maxParallel = Math.max(maxParallel, inflight);
      await new Promise((r) => setTimeout(r, 25));
      inflight -= 1;
    });
    expect(maxParallel).toBeGreaterThan(1);

    inflight = 0;
    let maxSerial = 0;
    await runRoundsWithConcurrency(3, 1, async () => {
      inflight += 1;
      maxSerial = Math.max(maxSerial, inflight);
      await new Promise((r) => setTimeout(r, 10));
      inflight -= 1;
    });
    expect(maxSerial).toBe(1);
  });

  it('loop-executor 并行不再与串行逐字相同', () => {
    const src = readFileSync(resolve(__dirname, '../stage-deck/execution/loop-executor.ts'), 'utf8');
    expect(src).toContain('runRoundsWithConcurrency');
    expect(src).toContain('loopConcurrency');
  });
});
