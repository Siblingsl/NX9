import { Injectable } from '@nestjs/common';
import type { UsageSummary } from '@nx9/shared';
import { PrismaService } from '../../prisma/prisma.service';

const COST_TABLE: Record<string, number> = {
  llm: 1,
  image: 3,
  video: 10,
  tts: 1,
};

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    kind: string,
    opts?: { userId?: string; model?: string; units?: number; metadata?: Record<string, unknown> },
  ) {
    const units = opts?.units ?? COST_TABLE[kind] ?? 1;
    // F-009: metadata 可携带 workspaceId 实现按项目聚合
    const meta = opts?.metadata ? { ...opts.metadata } : undefined;
    await this.prisma.usageEvent.create({
      data: {
        kind,
        userId: opts?.userId ?? null,
        model: opts?.model ?? null,
        units,
        metadata: meta ? JSON.stringify(meta) : null,
      },
    });
  }

  async summary(days = 7, userId?: string, workspaceId?: string): Promise<UsageSummary> {
    const since = new Date(Date.now() - days * 86_400_000);
    const where: any = {
      createdAt: { gte: since },
      ...(userId ? { userId } : {}),
    };
    const events = await this.prisma.usageEvent.findMany({ where });
    const byKind: Record<string, number> = {};
    let estimatedCostUnits = 0;
    // F-009: 按 workspaceId 过滤（存在 metadata JSON 中）
    const filtered = workspaceId
      ? events.filter((e) => {
          try {
            const meta = e.metadata ? JSON.parse(e.metadata) : null;
            return meta?.workspaceId === workspaceId;
          } catch { return false; }
        })
      : events;
    for (const e of filtered) {
      byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
      estimatedCostUnits += e.units;
    }
    return {
      totalEvents: filtered.length,
      byKind,
      estimatedCostUnits: Math.round(estimatedCostUnits * 100) / 100,
      periodDays: days,
    };
  }

  async recent(limit = 50, userId?: string, workspaceId?: string) {
    const rows = await this.prisma.usageEvent.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    // F-009: 按 workspaceId 过滤（存在 metadata JSON 中）
    const filtered = workspaceId
      ? rows.filter((r) => {
          try {
            const meta = r.metadata ? JSON.parse(r.metadata) : null;
            return meta?.workspaceId === workspaceId;
          } catch { return false; }
        })
      : rows;
    return filtered.map((r) => ({
      id: r.id,
      kind: r.kind,
      model: r.model,
      units: r.units,
      userId: r.userId,
      workspaceId: (() => {
        try { return r.metadata ? (JSON.parse(r.metadata) as any)?.workspaceId ?? null : null; }
        catch { return null; }
      })(),
      createdAt: r.createdAt.getTime(),
    }));
  }

  /** F-009: 按日聚合用量，供折线/柱状图使用 */
  async daily(days = 7, userId?: string, workspaceId?: string) {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await this.prisma.usageEvent.findMany({
      where: {
        createdAt: { gte: since },
        ...(userId ? { userId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    // F-009: 按 workspaceId 过滤
    const filtered = workspaceId
      ? rows.filter((r) => {
          try {
            const meta = r.metadata ? JSON.parse(r.metadata) : null;
            return meta?.workspaceId === workspaceId;
          } catch { return false; }
        })
      : rows;
    // 按日期 + 类型聚合
    const bucket: Record<string, Record<string, { count: number; units: number }>> = {};
    for (const e of filtered) {
      const day = e.createdAt.toISOString().slice(0, 10);
      bucket[day] ??= {};
      bucket[day][e.kind] ??= { count: 0, units: 0 };
      bucket[day][e.kind].count++;
      bucket[day][e.kind].units += e.units;
    }
    // 补全缺失日期
    const result: Array<{ day: string; kind: string; count: number; units: number }> = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
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
}
