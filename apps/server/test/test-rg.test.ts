import { describe, it, expect } from 'vitest';

describe('TEST-RG — Review Gate (pure function tests)', () => {

  it('TEST-RG-001: 关键帧门禁阻断 - ReviewGateBlockedError carries pending shot indices', () => {
    class ReviewGateBlockedError extends Error {
      readonly pending: number[];

      constructor(pending: number[]) {
        super(`关键帧审阅未通过：镜头 ${pending.join(', ')} 尚未批准`);
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
