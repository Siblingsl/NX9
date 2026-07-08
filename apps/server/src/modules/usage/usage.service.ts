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
    await this.prisma.usageEvent.create({
      data: {
        kind,
        userId: opts?.userId ?? null,
        model: opts?.model ?? null,
        units,
        metadata: opts?.metadata ? JSON.stringify(opts.metadata) : null,
      },
    });
  }

  async summary(days = 7, userId?: string): Promise<UsageSummary> {
    const since = new Date(Date.now() - days * 86_400_000);
    const where = {
      createdAt: { gte: since },
      ...(userId ? { userId } : {}),
    };
    const events = await this.prisma.usageEvent.findMany({ where });
    const byKind: Record<string, number> = {};
    let estimatedCostUnits = 0;
    for (const e of events) {
      byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
      estimatedCostUnits += e.units;
    }
    return {
      totalEvents: events.length,
      byKind,
      estimatedCostUnits: Math.round(estimatedCostUnits * 100) / 100,
      periodDays: days,
    };
  }

  async recent(limit = 50, userId?: string) {
    const rows = await this.prisma.usageEvent.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      model: r.model,
      units: r.units,
      userId: r.userId,
      createdAt: r.createdAt.getTime(),
    }));
  }
}
