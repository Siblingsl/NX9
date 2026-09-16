# NX9 逐格出图有界并发（多格推演 / 角色设定表）

> 状态：已实现（2026-09-15）。范围：**逐格出图**的并发、进度台账、取消、续查与重试。
> 适用节点：「多格推演」（`multi-grid`）、「角色设定表」（`character-sheet-desk`）。

## 1. 能力范围

| 能力 | 说明 |
| --- | --- |
| 有界并发逐格出图 | 一批格子（多机位 9/25 宫格、剧情四宫格、画面推演、设定表 4–25+ 格）不再逐格串行 |
| 并发上限可调 | 节点级 `data.concurrency`，缺省 **2**，范围 **1–4**（1 = 串行），面板可改 |
| 进度账目正确 | `batchProgress.done / total` 在并发下仍单调、收敛到「已完成格数 / 总格数」 |
| 失败账单可重试 | 逐格失败仍按格号升序落盘（`lastResult.failures`），可逐格重跑；成功格不重打 |
| 取消不丢已完成结果 | 停止后未开始的格不再启动，在途格跑完，**已完成格先落盘再抛「已取消」** |
| 后台任务可续查 | `taskId` 一拿到即登记（不等轮询超时），刷新 / 重挂后仍可「续查未完成格」 |

不在范围内：真实出图端到端（需要出图通道与 API Key）、跨节点调度、按服务商配额自适应限流。

## 2. 并发口径（唯一来源）

| 项 | 值 | 出处 |
| --- | --- | --- |
| 缺省并发 | **2** | `CELL_GEN_DEFAULT_CONCURRENCY`（与导演台批出 `data.concurrency ?? 2` 同口径） |
| 上限 | **4** | `CELL_GEN_MAX_CONCURRENCY`（= `CELL_GEN_CONCURRENCY_OPTIONS` 末位） |
| 下限 | **1**（串行） | 并发池 `limit` 被裁剪到 `[1, 任务数]` |
| 面板选项 | 1 / 2 / 3 / 4 | `CELL_GEN_CONCURRENCY_OPTIONS`，UI 与执行器**共用同一份常量** |
| 覆盖方式 | 节点 `data.concurrency` | 面板「逐格并发」下拉写入；执行器与面板都走 `resolveCellGenConcurrency(data)` |

`resolveCellGenConcurrency(data)` 的解析规则（面板与执行器同源，不会漂移）：

- 缺省 / `undefined` / `null` / 空串 / 非有限值（如 `'abc'`、`NaN`）→ **2**；
- `0` 或负数 → **1**（即串行）；
- 大于 4 → **4**；小数向下取整。

三个层次的口径**互不越界**：

1. `runWithConcurrency(items, worker, { limit })`（`apps/web/src/engine/run-with-concurrency.ts`）
   —— 通用原语，`limit` 缺省 **1（串行）**，只负责「不超限 / 不吞错 / 可取消 / 可观测」；
2. `runCellGenBatch({ ... , concurrency })`（`apps/web/src/engine/flow-runner-ops/cell-gen-batch.ts`）
   —— 逐格出图内核，缺省仍为 **串行**（不显式传并发 = 既有行为不变）；
3. 两个执行器（`multi-grid-ops.ts` / `character-sheet-ops.ts`）
   —— 首轮批量与逐格重试都传 `concurrency: resolveCellGenConcurrency(data)`，于是**节点级缺省为 2**。

> 解释口径：`data.concurrency` 未写入过的历史节点同样按缺省 2 执行（面板显示 2、执行器按 2 跑），
> 这是本次交付明确指定的节点头默认值；如需回到严格串行，把下拉切到「1（串行）」即可，
> 或执行器传 `concurrency: 1`。

## 3. 与取消 / 续查 / 重试的关系

### 3.1 取消（停止）

- 观察取消的时机：**启动每一项之前**（`signal.aborted`）。已启动的格不会被强杀，跑完为止；
- 取消类异常（文案含「已取消 / 已中止」，或 `signal.aborted`）**不进失败账单**，而是让内核返回
  `cancelled: true`；
- 执行器拿到 `cancelled: true` 后：把**本轮已完成格与既有结果合并**落盘（不丢已完成结果），
  再抛 `已取消`，保持既有「取消 → 节点收回 idle / paused」的既有语义；
- 未开始的格不被改动（不会被清空、不会被记账为失败），仍可单独「逐格重试」。

### 3.2 续查（后台任务）

- `taskId` 一拿到就回调 `onPendingChange`（**不等**轮询超时），并发下同样成立：谁的 taskId 先到就先登记；
- 轮询超时（`VideoPollTimeoutError`）携带的 `taskId` 由 `readErrorTaskId` 注入取回，登记进待续查账单，
  同时**如实计入失败**（不假绿）；
- 待续查账单按格号升序去重后落盘（`multiGridPendingTasks` / `characterSheetPendingTasks`）；
- 「续查未完成格」链路（`resumePendingImageTasks`）未改动，与并发无关。

### 3.3 逐格重试

- 重试只跑指定格（`indexes`），成功格不重打；调用次数与格数一一对应（不会因并发重复出图）；
- 重试复用同一并发上限（`resolveCellGenConcurrency(data)`）；
- 重试期间取消：本轮已完成格照常合并落盘，然后抛「已取消」。

### 3.4 台账顺序口径

并发下完成顺序不等于格号顺序，因此内核统一**按下标对齐**：

- `slots[i]` 按下标预分配，完成顺序不影响归属；
- `failures` 与 `pendingTasks` 返回前按格号升序排序（与串行版的可见顺序一致，逐格重试不受影响）；
- `onProgress(done, total)`：`done` = 已完成项数（含失败、含复用源图的格），单调不减；
  串行（limit = 1）时的序列与既有串行循环**逐次一致**（进入第 n 项前报 `(n, total)`，收尾报 `(total, total)`）。

## 4. 已实现 / 未实现边界

已实现：

- 新原语 `apps/web/src/engine/run-with-concurrency.ts`（零依赖、纯逻辑，含 `resolveRunConcurrency`、
  `isCancelError`、`runWithConcurrency`）；
- 逐格出图内核 `apps/web/src/engine/flow-runner-ops/cell-gen-batch.ts`（出图器由调用方注入）；
- 两个执行器接入并发 + 取消落盘 + 面板并发下拉；
- 单测：`apps/web/src/engine/__tests__/run-with-concurrency.test.ts`、
  `apps/web/src/engine/__tests__/multi-grid-concurrency.test.ts`。

未实现 / 明确不做：

- **未回填 `flow-runner.ts` 的 `runLayerConcurrent`**：它保持原样（`PARALLEL_LIMIT = 3` 的模块私有 worker 池）。
  理由有二：① 硬性边界要求「既有行为不变」，不动是最强的保证；② `flow-runner.ts` 在 import 期解析
  `@nx9/shared` barrel，而该 barrel 当前引用了 8 个不存在的 `data/*` 模块（既有缺陷），
  其守卫测试 `flow-runner-split-guard.test.ts` 在本次改动前就已失败，**无法用单测证明「委托后行为逐字不变」**。
  因此本次选择「新处使用新原语」，并用源码级守卫断言 `runLayerConcurrent` 未被改动。
- 未做按服务商 / 按模型的差异化限流（统一 1–4 上限）；
- 未做「并发上限随失败率自动降级」；
- 未覆盖真实出图端到端（端到端需要出图通道；本次用注入 mock 出图器验证并发语义）。

## 5. 验证口径

真实出图端到端**不可跑**（无出图通道），因此：

- `packages/shared` 当前**无法构建**（`index.ts` 引用 8 个不存在的 `data/*` 模块），
  `apps/web/tsconfig.json` 又把 `@nx9/shared` 指向过期 `dist`；
  两个执行器在 import 期即解析该 barrel，**在 vitest 里无法直接 import**；
- 因此逐格并发的语义验证放在**可注入出图器的内核**（`cell-gen-batch.ts`）上，用 mock 出图器覆盖：
  并发上限不超限、调用次数、结果归属、进度账目、失败账单可重试、取消不丢已完成格、待续查登记、
  `limit = 1` 与 `limit = 2` 逐格结果一致；
- 执行器侧接线由 `multi-grid-concurrency.test.ts` 末尾的**源码级接线守卫**断言
  （两个执行器各 2 处 `concurrency: resolveCellGenConcurrency(...)`、取消落盘后抛「已取消」、
  `runLayerConcurrent` 未被回填）——沿用仓库既有 `flow-runner-split-guard.test.ts` 的做法。

命令与预期：

```bash
cd apps/web
npx vitest run src/engine/__tests__/run-with-concurrency.test.ts src/engine/__tests__/multi-grid-concurrency.test.ts
```

参考运行结果（本机）：2 个文件 24 个用例通过（exit 0）。
另跑既有相关回归（`multi-grid-closure` / `multi-grid-plan` / `multi-grid-to-shots` / `multi-grid-block-map` /
`character-sheet-closure` / `character-sheet-plan` / `character-sheet-block-map`）共 188 个用例通过（exit 0）。

未验证项（如实列出）：真实 `runPictureGenJob` 出图链路的并发表现、端到端 25 格大图批量耗时、
`pnpm build` / 全量 `tsc -b`（当前仓库既有 178 条类型错误，全部来自 `@nx9/shared` 过期 dist 与 barrel 缺陷）。
