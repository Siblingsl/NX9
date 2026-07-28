# NX9 画布性能压测结果（F-012）

> 生成：`node scripts/bench-canvas-nodes.mjs` · 日期 2026-07-28  
> 阈值来源：`packages/shared/src/constants/perf-thresholds.ts`（PERF）

## 阈值修订表

| 档位 | 条件 | 行为 | 校准说明 |
|------|------|------|----------|
| light | 节点 <40 且连线 <16 | 全特效 | 日常小图 |
| balanced | 节点≥40 或连线≥16 | 中间档 | 半阈值 |
| intensive / threshold Toast | 节点≥**80** 或连线≥**32** | 降特效 + Toast「节点/连线较多」 | 首档降载；**不**因制作模式单独 Toast |
| soft-warn | 节点≥**500** | Toast 软警告 | 建议归档 |
| danger-warn | 节点≥**1000** | Toast 强警告（仍可继续，不硬锁） | 千级软上限 |

## 无头场景结果

| 场景 | 节点 | 连线 | 档位 | Toast | 造图 ms | 判定 ms |
|------|------|------|------|-------|---------|---------|
| 空画布 | 0 | 0 | light（轻量） | — | 0.067 | 0.052 |
| 少节点制作向 | 12 | 8 | light（轻量） | — | 0.077 | 0.001 |
| 半阈值 | 40 | 16 | balanced（均衡） | — | 0.058 | 0.001 |
| 首档 threshold | 80 | 0 | intensive（高负载（已降级特效）） | threshold | 0.049 | 0.007 |
| 连线 threshold | 10 | 32 | intensive（高负载（已降级特效）） | threshold | 0.008 | 0.003 |
| 百级 | 100 | 99 | intensive（高负载（已降级特效）） | threshold | 0.073 | 0.006 |
| 软警告 | 500 | 499 | intensive（高负载（已降级特效）） | soft-warn | 0.152 | 0.004 |
| 千级危险 | 1000 | 999 | intensive（高负载（已降级特效）） | danger-warn | 0.334 | 0.006 |
| 超千 | 1200 | 1199 | intensive（高负载（已降级特效）） | danger-warn | 0.855 | 0.011 |

## Session 升档去重抽检

同档不重复；升档可再提示。

| 节点序列 | 是否弹出 | reason | 会话 level |
|----------|----------|--------|------------|
| 12 | 否 | — | 0 |
| 80 | 是 | threshold | 1 |
| 80 | 否 | threshold | 1 |
| 500 | 是 | soft-warn | 2 |
| 500 | 否 | soft-warn | 2 |
| 1000 | 是 | danger-warn | 3 |

## 浏览器 FPS 抽检步骤（手工）

1. `pnpm run dev`，打开任意项目画布  
2. 控制台：`__NX9_BENCH__.inject(100)` → 预期 threshold Toast  
3. `__NX9_BENCH__.inject(500)` → 预期 soft-warn（升档）  
4. `__NX9_BENCH__.inject(1000)` → 预期 danger-warn  
5. 设置 → 偏好：可见「当前画布性能档位」  
6. 少节点 + 制作模式：不应出现「节点较多」类 Toast  
7. `__NX9_BENCH__.clear()` 清理压测节点  

## 结论

- Toast **仅阈值**触发，制作模式 forced intensive **不**误报。  
- 千级（1000）允许继续编辑，必须有 danger-warn。  
- 造图与判定在无头环境下为毫秒级；真实 FPS 以浏览器步骤为准。
