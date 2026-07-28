/**
 * bench-canvas-nodes.ts — 浏览器控制台压测说明（F-012）。
 *
 * 推荐：打开画布后直接执行
 *   __NX9_BENCH__.inject(1000)
 *   __NX9_BENCH__.getCounts()
 *   __NX9_BENCH__.clear()
 *
 * 无头阈值 / 结果表：
 *   pnpm --filter @nx9/shared build
 *   node scripts/bench-canvas-nodes.mjs
 *   → docs/NX9-PERF-BENCH-RESULTS.md
 *
 * 阈值：
 *   - 80 节点 / 32 连线 → 首档降级 Toast
 *   - 500 节点 → 软警告
 *   - 1000 节点 → 强警告（建议简化，不硬锁）
 */
export {};
