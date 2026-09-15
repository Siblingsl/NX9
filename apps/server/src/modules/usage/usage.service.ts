import { Injectable } from '@nestjs/common';
import {
  aggregateUsageDaily,
  aggregateUsageSummary,
  filterUsageByWorkspace,
  resolveUsageWorkspaceId,
  type UsageSummary,
} from '@nx9/shared';
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
    const where: { createdAt: { gte: Date }; userId?: string } = {
      createdAt: { gte: since },
      ...(userId ? { userId } : {}),
    };
    const events = await this.prisma.usageEvent.findMany({ where });
    const filtered = filterUsageByWorkspace(events, workspaceId);
    return aggregateUsageSummary(filtered, days);
  }

  async recent(limit = 50, userId?: string, workspaceId?: string) {
    const rows = await this.prisma.usageEvent.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.max(limit * 4, 50),
    });
    const filtered = filterUsageByWorkspace(rows, workspaceId).slice(0, limit);
    return filtered.map((r) => ({
      id: r.id,
      kind: r.kind,
      model: r.model,
      units: r.units,
      userId: r.userId,
      workspaceId: resolveUsageWorkspaceId(r),
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
    const filtered = filterUsageByWorkspace(rows, workspaceId);
    return aggregateUsageDaily(filtered, days);
  }
}
