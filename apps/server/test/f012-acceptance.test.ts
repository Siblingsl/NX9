/**
 * F-012 性能 Toast + 千级压测验收
 * - 少节点不误报（含制作模式场景语义）
 * - 达阈值才提示；升档可再提示
 * - 千级压测脚本与结果表交付物存在
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PERF,
  perfTierLabel,
  resolvePerfTier,
  resolvePerfToast,
} from '@nx9/shared';

const root = resolve(__dirname, '../../..');
const webSrc = resolve(root, 'apps/web/src');

function readWeb(rel: string) {
  return readFileSync(resolve(webSrc, rel), 'utf8');
}

describe('F-012 阈值与 Toast 判定', () => {
  it('少节点不触发 Toast（制作模式也不应靠计数误报）', () => {
    expect(resolvePerfToast(0, 0)).toBeNull();
    expect(resolvePerfToast(12, 8)).toBeNull();
    expect(resolvePerfToast(PERF.heavyBlockCount - 1, PERF.heavyLinkCount - 1)).toBeNull();
    // 制作模式 forced intensive 不改变 resolvePerfToast 输入 → 仍为 null
    expect(resolvePerfTier(12, 8)).not.toBe('intensive');
  });

  it('达 heavy 阈值才 threshold', () => {
    const byNodes = resolvePerfToast(PERF.heavyBlockCount, 0);
    expect(byNodes?.reason).toBe('threshold');
    expect(byNodes?.level).toBe(1);
    expect(byNodes?.message).toMatch(/节点较多|降级特效/);

    const byEdges = resolvePerfToast(10, PERF.heavyLinkCount);
    expect(byEdges?.reason).toBe('threshold');
    expect(byEdges?.message).toMatch(/连线较多/);
  });

  it('500 / 1000 升档 soft → danger', () => {
    const soft = resolvePerfToast(PERF.warnBlockCount, 0);
    expect(soft?.reason).toBe('soft-warn');
    expect(soft?.level).toBe(2);

    const danger = resolvePerfToast(PERF.dangerBlockCount, 0);
    expect(danger?.reason).toBe('danger-warn');
    expect(danger?.level).toBe(3);
    expect(danger?.message).toMatch(/建议简化|降级/);
  });

  it('session 升档去重语义：同档不重复、升档可再弹', () => {
    let last = 0;
    const shown: string[] = [];
    for (const n of [12, 80, 80, 500, 500, 1000, 1000]) {
      const t = resolvePerfToast(n, 0);
      if (!t) {
        last = 0;
        continue;
      }
      if (t.level > last) {
        shown.push(t.reason);
        last = t.level;
      }
    }
    expect(shown).toEqual(['threshold', 'soft-warn', 'danger-warn']);
  });

  it('档位与中文标签', () => {
    expect(resolvePerfTier(0, 0)).toBe('light');
    expect(resolvePerfTier(40, 0)).toBe('balanced');
    expect(resolvePerfTier(80, 0)).toBe('intensive');
    expect(perfTierLabel('intensive')).toMatch(/高负载|降级/);
  });
});

describe('F-012 主路径接线', () => {
  it('FlowSurface 真正 push Toast，并按 level 升档去重', () => {
    const src = readWeb('engine/FlowSurface.tsx');
    expect(src).toMatch(/resolvePerfToast\(nodes\.length,\s*edges\.length\)/);
    expect(src).toMatch(/useToast\.getState\(\)\.push/);
    expect(src).toMatch(/perfToastLevelRef/);
    expect(src).toMatch(/toast\.level\s*<=\s*perfToastLevelRef/);
    expect(src).toMatch(/__NX9_BENCH__/);
  });

  it('导演台 3D 文案区分「预览降质」，且仅阈值触发', () => {
    const src = readWeb('panels/Director3dPanel.tsx');
    expect(src).toMatch(/resolvePerfToast\(graphNodeCount,\s*graphEdgeCount\)/);
    expect(src).toMatch(/3D 预览已降质/);
    expect(src).not.toMatch(/画布节点较多，3D 导演台将使用性能模式/);
  });

  it('设置偏好展示当前性能档位', () => {
    const src = readWeb('panels/SettingsModal.tsx');
    expect(src).toMatch(/当前画布性能档位/);
    expect(src).toMatch(/perfTierLabel/);
    expect(src).toMatch(/resolvePerfTier/);
  });
});

describe('F-012 千级压测交付物', () => {
  it('无头脚本与结果表存在', () => {
    expect(existsSync(resolve(root, 'scripts/bench-canvas-nodes.mjs'))).toBe(true);
    expect(existsSync(resolve(root, 'docs/NX9-PERF-BENCH-RESULTS.md'))).toBe(true);
    const results = readFileSync(resolve(root, 'docs/NX9-PERF-BENCH-RESULTS.md'), 'utf8');
    expect(results).toMatch(/阈值修订表/);
    expect(results).toMatch(/danger-warn|千级/);
    expect(results).toMatch(String(PERF.dangerBlockCount));
  });
});
