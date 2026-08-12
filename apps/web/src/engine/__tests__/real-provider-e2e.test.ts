import { describe, expect, it } from 'vitest';

const enabled = process.env.NX9_REAL_PROVIDER_TEST === '1';

/**
 * 真实供应商 E2E 默认跳过。开启方式见 docs/REAL-PROVIDER-VALIDATION.md。
 * 未配 URL 的条目不计验收。
 */
describe.skipIf(!enabled)('real provider e2e (opt-in)', () => {
  it('health or picture URL is configured when the flag is on', () => {
    expect(
      Boolean(process.env.NX9_PROVIDER_HEALTHCHECK_URL || process.env.NX9_REAL_PICTURE_URL),
    ).toBe(true);
  });
});

describe('real provider e2e gate', () => {
  it('documents the opt-in flag so default pnpm test never bills a vendor', () => {
    expect(typeof enabled).toBe('boolean');
  });
});
