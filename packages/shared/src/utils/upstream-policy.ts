/**
 * upstream-policy.ts — 多上游 desk 解析规则（F-027）。
 *
 * 多条同 kind 上游时，默认「全部合并」；若节点 data.upstreamPolicy='primary'
 * 则只取第一条并在 UI 显示来源切换。
 */
export type UpstreamPolicy = 'merge' | 'primary';

export interface UpstreamSource {
  nodeId: string;
  nodeType: string;
  label?: string;
}

/**
 * 按策略解析多个上游来源。
 */
export function resolveUpstreamSources<T>(
  sources: Array<{ nodeId: string; nodeType: string; label?: string; data: T }>,
  policy: UpstreamPolicy,
  primarySourceId?: string | null,
): { sources: Array<{ nodeId: string; nodeType: string; label?: string; data: T }>; activeSourceId?: string } {
  if (sources.length === 0) {
    return { sources: [] };
  }

  if (policy === 'primary') {
    const primary = primarySourceId
      ? sources.find((s) => s.nodeId === primarySourceId)
      : sources[0];
    if (primary) {
      return { sources: [primary], activeSourceId: primary.nodeId };
    }
    // 回落：取第一个
    return { sources: [sources[0]], activeSourceId: sources[0].nodeId };
  }

  // merge: 全部合并
  return { sources };
}

/**
 * 合并多个上游的数据（generic 合并函数）。
 */
export function mergeUpstreamData<T extends Record<string, unknown>>(
  sources: Array<{ data: T }>,
  mergeFields: (keyof T)[],
): Partial<T> {
  const result: Partial<T> = {};
  for (const field of mergeFields) {
    const values = sources.map((s) => s.data[field]).filter((v) => v !== undefined && v !== null);
    if (values.length > 0) {
      if (Array.isArray(values[0])) {
        // 数组合并
        (result as any)[field] = values.flat();
      } else {
        // 取第一个非空
        (result as any)[field] = values[0];
      }
    }
  }
  return result;
}
