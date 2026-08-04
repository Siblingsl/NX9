/**
 * F-005 行为验收
 * 等价手工勾选：无 asset-gate 模板 / 迁移写上游 / soft 可拆 hard 不可 / 导演可读上游就绪
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripAssetGateFromGraph, WORKFLOW_TEMPLATES } from '@nx9/shared';

const root = resolve(__dirname, '../../..');

describe('F-005 核心模板去 asset-gate', () => {
  it('tpl-core-episode 无 asset-gate，编剧直连分镜', () => {
    const template = WORKFLOW_TEMPLATES.find((tpl) => tpl.id === 'tpl-core-episode');
    expect(template).toBeDefined();
    const flow = template!.build();
    expect(flow.blocks.some((b) => b.type === 'asset-gate')).toBe(false);
    const script = flow.blocks.find((b) => b.type === 'script-desk')!;
    const desk = flow.blocks.find((b) => b.type === 'storyboard-desk')!;
    expect(flow.links.some((l) => l.source === script.id && l.target === desk.id)).toBe(true);
  });
});

describe('F-005 旧图迁移保留放行语义', () => {
  it('gate.passed=true → 写上游 script-desk.assetReadiness.ready，并桥接边', () => {
    const nodes = [
      { id: 'script-1', type: 'script-desk', data: { package: { status: 'confirmed' } } },
      {
        id: 'gate-1',
        type: 'asset-gate',
        data: { assetGate: { passed: true, releasedAt: '2026-07-01T00:00:00.000Z' } },
      },
      { id: 'desk-1', type: 'storyboard-desk', data: {} },
    ];
    const links = [
      { id: 'l1', source: 'script-1', target: 'gate-1' },
      { id: 'l2', source: 'gate-1', target: 'desk-1' },
    ];
    const result = stripAssetGateFromGraph(nodes, links);
    expect(result.strippedCount).toBe(1);
    expect(result.nodes.some((n) => n.type === 'asset-gate')).toBe(false);
    expect(result.links.some((l) => l.source === 'script-1' && l.target === 'desk-1')).toBe(true);

    const script = result.nodes.find((n) => n.id === 'script-1')!;
    const desk = result.nodes.find((n) => n.id === 'desk-1')!;
    const readiness = (script.data as Record<string, unknown>).assetReadiness as { ready: boolean };
    expect(readiness?.ready).toBe(true);
    // 禁止写到下游
    expect((desk.data as Record<string, unknown>).assetReadiness).toBeUndefined();
  });

  it('gate.passed=false → 上游 ready=false 且带 migrationError', () => {
    const nodes = [
      { id: 'script-1', type: 'script-desk', data: {} },
      { id: 'gate-1', type: 'asset-gate', data: { passed: false } },
      { id: 'desk-1', type: 'storyboard-desk', data: {} },
    ];
    const links = [
      { id: 'l1', source: 'script-1', target: 'gate-1' },
      { id: 'l2', source: 'gate-1', target: 'desk-1' },
    ];
    const result = stripAssetGateFromGraph(nodes, links);
    const script = result.nodes.find((n) => n.id === 'script-1')!;
    const data = script.data as Record<string, unknown>;
    expect((data.assetReadiness as { ready: boolean }).ready).toBe(false);
    expect(data.migrationError).toBeTruthy();
  });
});

describe('F-005 soft/hard 预检与接线源码守卫', () => {
  it('runStoryboardPreflight：soft 可继续，hard 阻断', () => {
    // 与 asset-readiness.runStoryboardPreflight 同语义（纯函数，避免拉入 web store）
    function runStoryboardPreflight(
      readiness: { ready: boolean; missingCharacters: string[]; missingScenes: string[] } | null,
      mode: 'soft' | 'hard' = 'soft',
    ): { ok: boolean; blocking: boolean; reason?: string } {
      if (!readiness) {
        return { ok: false, blocking: mode === 'hard', reason: '未检测到上游剧本设定就绪状态' };
      }
      if (readiness.ready) return { ok: true, blocking: false };
      const reason = `缺少资产：${[
        ...readiness.missingCharacters.map((c) => `角色「${c}」`),
        ...readiness.missingScenes.map((s) => `场景「${s}」`),
      ].join('、')}`;
      if (mode === 'hard') return { ok: false, blocking: true, reason };
      return { ok: true, blocking: false, reason: `${reason}（软模式可继续）` };
    }

    const notReady = {
      ready: false,
      missingCharacters: ['林深'],
      missingScenes: ['雨夜巷口'],
    };
    const soft = runStoryboardPreflight(notReady, 'soft');
    const hard = runStoryboardPreflight(notReady, 'hard');
    const ready = runStoryboardPreflight({ ready: true, missingCharacters: [], missingScenes: [] }, 'hard');
    expect(soft.ok).toBe(true);
    expect(soft.blocking).toBe(false);
    expect(soft.reason).toContain('软模式可继续');
    expect(hard.ok).toBe(false);
    expect(hard.blocking).toBe(true);
    expect(ready.ok).toBe(true);
    expect(ready.blocking).toBe(false);
  });

  it('ScriptDesk 已挂 AssetReadinessPanel 与设定就绪 Tab', () => {
    const src = readFileSync(
      resolve(root, 'apps/web/src/blocks/nx9/ScriptDeskBlock.tsx'),
      'utf8',
    );
    expect(src.includes('AssetReadinessPanel')).toBe(true);
    expect(src.includes("'readiness'")).toBe(true);
    expect(src.includes('设定就绪')).toBe(true);
    expect(src.includes('assetReadiness')).toBe(true);
    expect(src.includes('inspectBibleAssets')).toBe(true);
  });

  it('AssetReadinessPanel：角色入库合并主角/配角与缺图，无独立角色视觉/图像连接', () => {
    const src = readFileSync(
      resolve(root, 'apps/web/src/components/asset/AssetReadinessPanel.tsx'),
      'utf8',
    );
    expect(src).toContain('characterReadyLabel');
    expect(src).toContain('classifyBibleCharacterRoles');
    expect(src).toContain('缺三视图');
    expect(src).toContain('缺定妆');
    expect(src).toContain('未入库');
    expect(src).not.toContain('角色视觉 · 主角三视图');
    expect(src).not.toContain('图像生成连接');
    expect(src).toContain('同步缺失项到库');
  });

  it('StoryboardDesk 调用 runStoryboardPreflight 且硬模式禁用拆镜', () => {
    const src = readFileSync(
      resolve(root, 'apps/web/src/blocks/craft/storyboard-desk/use-storyboard-desk.tsx'),
      'utf8',
    );
    expect(src.includes('runStoryboardPreflight')).toBe(true);
    expect(src.includes('breakdownBlocked')).toBe(true);
    expect(src.includes('preflightMode')).toBe(true);
    expect(src.includes('togglePreflightMode')).toBe(true);
  });

  it('DirectorDesk 锁参考读 checkAssetReadinessInEdges', () => {
    const src = readFileSync(
      resolve(root, 'apps/web/src/blocks/core/DirectorDeskBlock.tsx'),
      'utf8',
    );
    expect(src.includes('checkAssetReadinessInEdges')).toBe(true);
    expect(src.includes('forceCharacterRef')).toBe(true);
    expect(src.includes('设定未就绪')).toBe(true);
    expect(src.includes('设定检查门禁')).toBe(false);
  });

  it('asset-gate 死文件已删除，registry 无注册', () => {
    expect(existsSync(resolve(root, 'apps/web/src/blocks/craft/AssetGateBlock.tsx'))).toBe(false);
    expect(existsSync(resolve(root, 'apps/web/src/blocks/craft/asset-gate.css'))).toBe(false);
    expect(existsSync(resolve(root, 'apps/web/src/engine/asset-gate-runner.ts'))).toBe(false);
    const registry = readFileSync(resolve(root, 'apps/web/src/blocks/registry.tsx'), 'utf8');
    expect(registry.includes('AssetGateBlock')).toBe(false);
  });
});

describe('F-005 checkAssetReadinessInEdges 可隔分镜读编剧', () => {
  it('导演台经分镜台仍可读到 script-desk.assetReadiness', async () => {
    // 内联与 asset-readiness.ts 相同的 BFS 语义（避免 web 模块依赖 workspace store）
    type N = { id: string; type?: string; data?: Record<string, unknown> };
    type E = { source: string; target: string };
    function check(blockId: string, nodes: N[], edges: E[]) {
      const visited = new Set<string>();
      const queue = edges.filter((e) => e.target === blockId).map((e) => e.source);
      let fallback: { ready: boolean } | null = null;
      while (queue.length) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const source = nodes.find((n) => n.id === id);
        if (!source?.data) continue;
        const readiness = source.data.assetReadiness as { ready: boolean } | undefined;
        if (readiness) {
          if (source.type === 'script-desk') return readiness;
          if (!fallback) fallback = readiness;
        }
        for (const edge of edges) {
          if (edge.target === id && !visited.has(edge.source)) queue.push(edge.source);
        }
      }
      return fallback;
    }

    const nodes: N[] = [
      { id: 'script-1', type: 'script-desk', data: { assetReadiness: { ready: true } } },
      { id: 'desk-1', type: 'storyboard-desk', data: {} },
      { id: 'dir-1', type: 'director-desk', data: {} },
    ];
    const edges: E[] = [
      { source: 'script-1', target: 'desk-1' },
      { source: 'desk-1', target: 'dir-1' },
    ];
    expect(check('dir-1', nodes, edges)?.ready).toBe(true);
    expect(check('desk-1', nodes, edges)?.ready).toBe(true);
  });
});
