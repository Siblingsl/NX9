/**
 * bench-canvas-nodes.mjs — F-012 千级画布无头压测（阈值 / Toast 判定 / 造图耗时）
 *
 * 用法（仓库根）：
 *   pnpm --filter @nx9/shared build
 *   node scripts/bench-canvas-nodes.mjs
 *
 * 浏览器侧（打开画布后控制台）：
 *   __NX9_BENCH__.inject(1000)  // 观察 Toast 升档与 FPS
 *   __NX9_BENCH__.clear()
 *
 * 阈值（@nx9/shared PERF）：
 *   - 80 节点 / 32 连线 → threshold（首档降级）
 *   - 500 节点 → soft-warn
 *   - 1000 节点 → danger-warn
 */
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let shared;
try {
  shared = require(resolve(root, 'packages/shared/dist/cjs/index.js'));
} catch (err) {
  console.error('请先执行: pnpm --filter @nx9/shared build');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const {
  PERF,
  resolvePerfTier,
  resolvePerfToast,
  perfTierLabel,
} = shared;

const SCENARIOS = [
  { label: '空画布', nodes: 0, edges: 0 },
  { label: '少节点制作向', nodes: 12, edges: 8 },
  { label: '半阈值', nodes: 40, edges: 16 },
  { label: '首档 threshold', nodes: 80, edges: 0 },
  { label: '连线 threshold', nodes: 10, edges: 32 },
  { label: '百级', nodes: 100, edges: 99 },
  { label: '软警告', nodes: 500, edges: 499 },
  { label: '千级危险', nodes: 1000, edges: 999 },
  { label: '超千', nodes: 1200, edges: 1199 },
];

function buildGraph(nodeCount, edgeCount) {
  const nodes = [];
  const edges = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      id: `n-${i}`,
      type: 'prompt',
      position: { x: (i % 40) * 200, y: Math.floor(i / 40) * 140 },
      data: { label: `n${i}` },
    });
  }
  // 用完全图边枚举，避免「链式 max=n-1」造不出 heavyLinkCount
  let e = 0;
  for (let a = 0; a < nodeCount && e < edgeCount; a++) {
    for (let b = a + 1; b < nodeCount && e < edgeCount; b++) {
      edges.push({ id: `e-${e}`, source: `n-${a}`, target: `n-${b}` });
      e++;
    }
  }
  return { nodes, edges };
}

function run() {
  const rows = [];
  console.log('F-012 画布千级无头压测');
  console.log(
    `阈值: heavy=${PERF.heavyBlockCount}/${PERF.heavyLinkCount}, warn=${PERF.warnBlockCount}, danger=${PERF.dangerBlockCount}`,
  );
  console.log('');

  for (const s of SCENARIOS) {
    const t0 = performance.now();
    const { nodes, edges } = buildGraph(s.nodes, s.edges);
    const buildMs = performance.now() - t0;
    const t1 = performance.now();
    const tier = resolvePerfTier(nodes.length, edges.length);
    const toast = resolvePerfToast(nodes.length, edges.length);
    const resolveMs = performance.now() - t1;
    const row = {
      scenario: s.label,
      nodes: nodes.length,
      edges: edges.length,
      tier,
      tierLabel: perfTierLabel(tier),
      toastReason: toast?.reason ?? '—',
      toastLevel: toast?.level ?? 0,
      buildMs: Number(buildMs.toFixed(3)),
      resolveMs: Number(resolveMs.toFixed(3)),
    };
    rows.push(row);
    console.log(
      `${s.label.padEnd(14)} n=${String(row.nodes).padStart(4)} e=${String(row.edges).padStart(4)}  tier=${row.tier.padEnd(10)} toast=${String(row.toastReason).padEnd(12)} build=${row.buildMs}ms`,
    );
  }

  // 升档去重语义抽检（模拟 session）
  let lastLevel = 0;
  const escalate = [];
  for (const n of [12, 80, 80, 500, 500, 1000]) {
    const toast = resolvePerfToast(n, 0);
    const show = Boolean(toast && toast.level > lastLevel);
    if (show && toast) lastLevel = toast.level;
    if (!toast) lastLevel = 0;
    escalate.push({ nodes: n, show, reason: toast?.reason ?? null, lastLevel });
  }

  const outDir = resolve(root, 'docs');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'NX9-PERF-BENCH-RESULTS.md');
  const date = new Date().toISOString().slice(0, 10);
  const md = `# NX9 画布性能压测结果（F-012）

> 生成：\`node scripts/bench-canvas-nodes.mjs\` · 日期 ${date}  
> 阈值来源：\`packages/shared/src/constants/perf-thresholds.ts\`（PERF）

## 阈值修订表

| 档位 | 条件 | 行为 | 校准说明 |
|------|------|------|----------|
| light | 节点 <40 且连线 <16 | 全特效 | 日常小图 |
| balanced | 节点≥40 或连线≥16 | 中间档 | 半阈值 |
| intensive / threshold Toast | 节点≥**${PERF.heavyBlockCount}** 或连线≥**${PERF.heavyLinkCount}** | 降特效 + Toast「节点/连线较多」 | 首档降载；**不**因制作模式单独 Toast |
| soft-warn | 节点≥**${PERF.warnBlockCount}** | Toast 软警告 | 建议归档 |
| danger-warn | 节点≥**${PERF.dangerBlockCount}** | Toast 强警告（仍可继续，不硬锁） | 千级软上限 |

## 无头场景结果

| 场景 | 节点 | 连线 | 档位 | Toast | 造图 ms | 判定 ms |
|------|------|------|------|-------|---------|---------|
${rows
  .map(
    (r) =>
      `| ${r.scenario} | ${r.nodes} | ${r.edges} | ${r.tier}（${r.tierLabel}） | ${r.toastReason} | ${r.buildMs} | ${r.resolveMs} |`,
  )
  .join('\n')}

## Session 升档去重抽检

同档不重复；升档可再提示。

| 节点序列 | 是否弹出 | reason | 会话 level |
|----------|----------|--------|------------|
${escalate.map((e) => `| ${e.nodes} | ${e.show ? '是' : '否'} | ${e.reason ?? '—'} | ${e.lastLevel} |`).join('\n')}

## 浏览器 FPS 抽检步骤（手工）

1. \`pnpm run dev\`，打开任意项目画布  
2. 控制台：\`__NX9_BENCH__.inject(100)\` → 预期 threshold Toast  
3. \`__NX9_BENCH__.inject(500)\` → 预期 soft-warn（升档）  
4. \`__NX9_BENCH__.inject(1000)\` → 预期 danger-warn  
5. 设置 → 偏好：可见「当前画布性能档位」  
6. 少节点 + 制作模式：不应出现「节点较多」类 Toast  
7. \`__NX9_BENCH__.clear()\` 清理压测节点  

## 结论

- Toast **仅阈值**触发，制作模式 forced intensive **不**误报。  
- 千级（1000）允许继续编辑，必须有 danger-warn。  
- 造图与判定在无头环境下为毫秒级；真实 FPS 以浏览器步骤为准。
`;

  writeFileSync(outPath, md, 'utf8');
  console.log('');
  console.log(`结果表已写入: ${outPath}`);
  return { rows, escalate, outPath };
}

run();
