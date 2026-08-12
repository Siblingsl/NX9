/**
 * PG-30：图片代理路由策略（Magic Hour 不支持参考图）。
 */

export const MAGIC_HOUR_REF_BLOCKED =
  '当前请求含参考图，不能静默走 Magic Hour（不支持参考图）。请配置 Gemini 或 OpenAI，或去掉参考图后再生成。';

export function countImageRefUrls(body: Record<string, unknown>): number {
  const set = new Set<string>();
  if (typeof body.referenceImageUrl === 'string' && body.referenceImageUrl.trim()) {
    set.add(body.referenceImageUrl.trim());
  }
  if (Array.isArray(body.referenceImageUrls)) {
    for (const u of body.referenceImageUrls) {
      if (typeof u === 'string' && u.trim()) set.add(u.trim());
    }
  }
  return set.size;
}

export function isExplicitMagicHourRoute(model?: string, provider?: string): boolean {
  const p = String(provider || '').toLowerCase();
  if (p === 'magichour' || p === 'magic-hour') return true;
  const m = String(model || '').toLowerCase();
  return m === 'magic-hour' || m === 'magichour' || m.startsWith('mh-');
}

/**
 * 带参考图时：显式 Magic Hour 允许但标记截断；静默降级则拒绝。
 */
export function decideMagicHourImageRoute(
  refCount: number,
  explicit: boolean,
): { ok: true; truncatedRefs?: number } | { ok: false; error: string } {
  if (refCount <= 0) return { ok: true };
  if (!explicit) return { ok: false, error: MAGIC_HOUR_REF_BLOCKED };
  return { ok: true, truncatedRefs: refCount };
}
