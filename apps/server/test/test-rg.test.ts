import { describe, it, expect } from 'vitest';

describe('TEST-RG — Review Gate (pure function tests)', () => {

  it('TEST-RG-001: review-gate 阻断 - ReviewGateBlockedError carries pending shot indices', () => {
    class ReviewGateBlockedError extends Error {
      readonly pending: number[];

      constructor(pending: number[]) {
        super(`审阅关卡：镜头 ${pending.join(', ')} 尚未通过`);
        this.name = 'ReviewGateBlockedError';
        this.pending = pending;
      }
    }

    const err1 = new ReviewGateBlockedError([1, 2, 3]);
    expect(err1.name).toBe('ReviewGateBlockedError');
    expect(err1.pending).toEqual([1, 2, 3]);
    expect(err1.message).toContain('1, 2, 3');

    const err2 = new ReviewGateBlockedError([5]);
    expect(err2.pending).toEqual([5]);
    expect(err2.pending).toHaveLength(1);

    const err3 = new ReviewGateBlockedError([]);
    expect(err3.pending).toEqual([]);
    expect(err3.pending).toHaveLength(0);
  });
});
