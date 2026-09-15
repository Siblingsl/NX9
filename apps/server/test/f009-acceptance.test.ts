import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  aggregateUsageDaily,
  aggregateUsageSummary,
  filterUsageByWorkspace,
} from '@nx9/shared';

const root = resolve(__dirname, '../../..');
const webSrc = resolve(__dirname, '../../web/src');

describe('F-009 Token 用量仪表 — 聚合', () => {
  const now = Date.parse('2026-09-11T12:00:00.000Z');
  const events = [
    {
      kind: 'llm',
      model: 'gpt-test',
      units: 2,
      createdAt: new Date(now - 1 * 86_400_000),
      metadata: JSON.stringify({ workspaceId: 'ws-a' }),
    },
    {
      kind: 'image',
      model: 'img-a',
      units: 3,
      createdAt: new Date(now - 1 * 86_400_000),
      metadata: JSON.stringify({ workspaceId: 'ws-a' }),
    },
    {
      kind: 'video',
      model: null,
      units: 10,
      createdAt: new Date(now),
      metadata: JSON.stringify({ workspaceId: 'ws-b' }),
    },
    {
      kind: 'tts',
      model: 'voice-x',
      units: 1,
      createdAt: new Date(now),
      metadata: null,
    },
  ];

  it('按项目过滤 workspaceId', () => {
    const a = filterUsageByWorkspace(events, 'ws-a');
    expect(a).toHaveLength(2);
    expect(a.every((e) => JSON.parse(e.metadata!).workspaceId === 'ws-a')).toBe(true);
    expect(filterUsageByWorkspace(events, 'ws-missing')).toHaveLength(0);
    expect(filterUsageByWorkspace(events)).toHaveLength(4);
  });

  it('summary 含 byKind + byModel（全周期，非 recent 凑）', () => {
    const s = aggregateUsageSummary(filterUsageByWorkspace(events, 'ws-a'), 7);
    expect(s.totalEvents).toBe(2);
    expect(s.byKind).toEqual({ llm: 1, image: 1 });
    expect(s.byModel).toEqual({ 'gpt-test': 2, 'img-a': 3 });
    expect(s.estimatedCostUnits).toBe(5);
    expect(s.periodDays).toBe(7);

    const all = aggregateUsageSummary(events, 7);
    expect(all.byModel['未知']).toBe(10);
    expect(all.byModel['voice-x']).toBe(1);
  });

  it('daily 按日补全空桶', () => {
    const daily = aggregateUsageDaily(events, 3, now);
    const days = [...new Set(daily.map((d) => d.day))];
    expect(days).toHaveLength(3);
    const withCalls = daily.filter((d) => d.count > 0);
    expect(withCalls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('F-009 接线守卫', () => {
  it('UsageSummary 类型含 byModel；UsageService 走 shared 聚合', () => {
    const wsTypes = readFileSync(resolve(root, 'packages/shared/src/types/workspace.ts'), 'utf8');
    expect(wsTypes).toMatch(/byModel:\s*Record/);

    const svc = readFileSync(
      resolve(root, 'apps/server/src/modules/usage/usage.service.ts'),
      'utf8',
    );
    expect(svc).toContain('aggregateUsageSummary');
    expect(svc).toContain('filterUsageByWorkspace');
    expect(svc).toContain('aggregateUsageDaily');
  });

  it('UsagePanel：项目范围切换 + 传 workspaceId + 用 summary.byModel', () => {
    const panel = readFileSync(resolve(webSrc, 'panels/UsagePanel.tsx'), 'utf8');
    expect(panel).toContain('usage-scope-toggle');
    expect(panel).toContain('usage-scope-project');
    expect(panel).toContain('getCurrentWorkspaceId');
    expect(panel).toMatch(/api\.usageSummary\(days,\s*undefined,\s*wsFilter\)/);
    expect(panel).toMatch(/api\.usageDaily\(days,\s*undefined,\s*wsFilter\)/);
    expect(panel).toContain('summary?.byModel');
    expect(panel).toContain('usage-by-model');
    expect(panel).toContain('usage-daily-chart');
    expect(panel).toContain('usage-recent');
  });

  it('gateway track 写入 workspaceId metadata', () => {
    const gw = readFileSync(
      resolve(root, 'apps/server/src/modules/gateway/gateway.service.ts'),
      'utf8',
    );
    expect(gw).toContain('workspaceId');
    expect(gw).toMatch(/metadata\s*=\s*opts\?\.workspaceId/);
  });

  it('API client 支持 usage* 的 workspaceId 查询参数', () => {
    const client = readFileSync(resolve(webSrc, 'api/client.ts'), 'utf8');
    expect(client).toMatch(/usageSummary:[\s\S]*workspaceId/);
    expect(client).toMatch(/usageDaily:[\s\S]*workspaceId/);
    expect(client).toMatch(/usageRecent:[\s\S]*workspaceId/);
    expect(client).toContain('X-NX9-Workspace-Id');
  });
});
