import { describe, expect, it } from 'vitest';
import {
  countImageRefUrls,
  decideMagicHourImageRoute,
  isExplicitMagicHourRoute,
  MAGIC_HOUR_REF_BLOCKED,
} from '../src/modules/gateway/image-proxy-policy';

describe('PG-30 Magic Hour 参考图路由', () => {
  it('统计参考 URL 去重', () => {
    expect(
      countImageRefUrls({
        referenceImageUrl: 'a',
        referenceImageUrls: ['a', 'b', ''],
      }),
    ).toBe(2);
  });

  it('显式 Magic Hour 模型/provider', () => {
    expect(isExplicitMagicHourRoute('magic-hour')).toBe(true);
    expect(isExplicitMagicHourRoute('dall-e-3', 'magichour')).toBe(true);
    expect(isExplicitMagicHourRoute('gemini-2.5-flash-image')).toBe(false);
  });

  it('静默降级带参考 → 拒绝', () => {
    const d = decideMagicHourImageRoute(2, false);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error).toBe(MAGIC_HOUR_REF_BLOCKED);
  });

  it('显式 Magic Hour 带参考 → 允许并标记截断', () => {
    const d = decideMagicHourImageRoute(3, true);
    expect(d).toEqual({ ok: true, truncatedRefs: 3 });
  });

  it('无参考 → 放行', () => {
    expect(decideMagicHourImageRoute(0, false)).toEqual({ ok: true });
  });
});
