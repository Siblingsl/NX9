/**
 * F-009 — 用量事件纯聚合（项目过滤 / 按类型 / 按模型 / 按日）。
 * 服务端与前端验收共用，避免只在 UI 用 recent 凑「按模型」。
 */

export interface UsageEventLike {
  kind: string;
  model?: string | null;
  units: number;
  createdAt: Date | number | string;
  metadata?: string | null;
  workspaceId?: string | null;
}

export function resolveUsageWorkspaceId(ev: UsageEventLike): string | null {
  if (ev.workspaceId) return ev.workspaceId;
  if (!ev.metadata) return null;
  try {
    const meta = JSON.parse(ev.metadata) as { workspaceId?: string };
    return typeof meta?.workspaceId === 'string' ? meta.workspaceId : null;
  } catch {
    return null;
  }
}

export function filterUsageByWorkspace<T extends UsageEventLike>(
  events: T[],
  workspaceId?: string | null,
): T[] {
  if (!workspaceId) return events;
  return events.filter((e) => resolveUsageWorkspaceId(e) === workspaceId);
}

export function aggregateUsageSummary(
  events: UsageEventLike[],
  periodDays: number,
): {
  totalEvents: number;
  byKind: Record<string, number>;
  byModel: Record<string, number>;
  estimatedCostUnits: number;
  periodDays: number;
} {
  const byKind: Record<string, number> = {};
  const byModel: Record<string, number> = {};
  let estimatedCostUnits = 0;
  for (const e of events) {
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    const modelKey = (e.model && String(e.model).trim()) || '未知';
    byModel[modelKey] = (byModel[modelKey] ?? 0) + (e.units ?? 0);
    estimatedCostUnits += e.units ?? 0;
  }
  return {
    totalEvents: events.length,
    byKind,
    byModel,
    estimatedCostUnits: Math.round(estimatedCostUnits * 100) / 100,
    periodDays,
  };
}

function toDay(createdAt: Date | number | string): string {
  if (createdAt instanceof Date) return createdAt.toISOString().slice(0, 10);
  if (typeof createdAt === 'number') return new Date(createdAt).toISOString().slice(0, 10);
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? String(createdAt).slice(0, 10) : d.toISOString().slice(0, 10);
}

/** 按日+类型聚合；补全 period 内缺失日期为空桶 */
export function aggregateUsageDaily(
  events: UsageEventLike[],
  days: number,
  nowMs = Date.now(),
): Array<{ day: string; kind: string; count: number; units: number }> {
  const bucket: Record<string, Record<string, { count: number; units: number }>> = {};
  for (const e of events) {
    const day = toDay(e.createdAt);
    bucket[day] ??= {};
    bucket[day][e.kind] ??= { count: 0, units: 0 };
    bucket[day][e.kind].count++;
    bucket[day][e.kind].units += e.units ?? 0;
  }
  const result: Array<{ day: string; kind: string; count: number; units: number }> = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(nowMs - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    const dayBucket = bucket[d] ?? {};
    if (Object.keys(dayBucket).length === 0) {
      result.push({ day: d, kind: 'llm', count: 0, units: 0 });
    } else {
      for (const [kind, stats] of Object.entries(dayBucket)) {
        result.push({ day: d, kind, count: stats.count, units: stats.units });
      }
    }
  }
  return result;
}
