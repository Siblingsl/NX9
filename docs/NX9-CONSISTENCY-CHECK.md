# NX9 跨格 / 跨镜一致性校验（图像级）

> 状态：已实现（2026-09-15）。适用节点：「多格推演」（`multi-grid`）、「角色设定表」（`character-sheet-desk`）。
> 与**文本级**连贯性检查（`continuity-check-runner` / `ContinuityCheckBlock`）互补，**不替代**。

## 1. 能力范围

| 能力 | 说明 |
| --- | --- |
| 逐格人脸分析取数 | 对已出图的格调既有视觉接口 `POST /api/tools/analyze-faces`（`api.analyzeFaces`），有界并发 + 同 URL 缓存 |
| 格间人脸有无 / 数量比对 | 有人有 / 有人无 → `error`；都有人脸但数量不同（1 vs 2）→ `warn` |
| 表情突变 | 以多数表情为基线，逐格标出偏离基线的格（含基线与取值证据） |
| 外观关键词比对 | 发色 / 发型长度 / 服装颜色 / 年龄段 / 配饰 五类，与多数基线冲突的格逐格列出 |
| 低置信提示 | 某格人脸置信度**最高值**低于阈值（缺省 0.4）→ `info`（该格「有人脸」结论不可靠） |
| 报告与跳转 | 面板按格列出问题 / severity / 证据，可「跳到该格」滚动并高亮 |
| 挑最优格 | 按固定判据给出推荐格（含判据明细、排除理由），无可用分析时明确「无法推荐」 |

**不在范围内**：真实人脸分析端到端（需服务端 + 视觉通道凭据）、格间像素级比对（构图 / 光影 / 色调 / 机位）、
自动修复（**不自动改写任何提示词 / 节点数据 / 图片**）、跨节点批量体检、报告落盘与历史版本。

## 2. 判据表（唯一口径）

所有判定都是**启发式**，措辞与 severity 均按证据强度给，只用于提示与排序。

| code | 判据 | severity | 证据内容 |
| --- | --- | --- | --- |
| `face-presence-mismatch` | 分析成功格中**既有「有人脸」又有「无人脸」**（最强的不一致信号） | `error`（可用 `presenceSeverity: 'warn'` 降级） | 每格的「N 张人脸 / 未检出」清单 + 主责格（无人脸格）与对照格 |
| `face-count-mismatch` | 都有人脸（≥1）但**数量不同**；只在都有人脸的格之间比 | `warn`（路人 / 双人同框不上升为 error） | 基线张数、基线格列表、不同格列表；未形成多数时明写「取最多数作基线」 |
| `expression-outlier` | 每格取**主脸**（置信度最高）表情；多数基线占比 ≥ 0.6 且可判格 ≥ 3 时，偏离基线的格逐格一条 | `warn`（可调 `outlierSeverity: 'info'`） | 基线表情 + 基线格列表 + 本格表情 + 全格表情清单 |
| `appearance-conflict` | 逐类别独立判定：类别的多数取值占比 ≥ 0.6 且可判格 ≥ 3 时，**不含**该取值的可判格逐格一条 | `warn`（可调 `conflictSeverity: 'info'`） | 基线取值 + 基线格列表 + 本格取值（无取值写「未提到该类别」） |
| `low-confidence-face` | 某格所有人脸置信度的**最大值** < 阈值（缺省 0.4） | `info` | 该格最高置信度与阈值 + 每张脸的置信度 |
| `cell-unanalyzed` | 该格没有可用分析结果（未出图 / 接口失败 / 返回体不可用） | `warn`（体检未覆盖，**不是**内容问题） | 该格与失败原因原文 |

判据阈值集中在 `packages/shared/src/utils/consistency-report.ts` 顶部常量：
`CONSISTENCY_MIN_COMPARABLE_CELLS = 2`、`CONSISTENCY_BASELINE_MIN_SAMPLE = 3`、
`CONSISTENCY_BASELINE_MAJORITY_RATIO = 0.6`、`CONSISTENCY_LOW_CONFIDENCE = 0.4`、
`CONSISTENCY_OUTFIT_ADJACENCY = 6`。

### 2.1 「可判格」的定义（逐类别）

| 场景 | 是否可判 | 说明 |
| --- | --- | --- |
| 分析成功 + 主脸描述非空 | ✅ 可判 | 该类别无关键词时记为「未提到该类别」，会命中冲突 |
| 分析成功 + 主脸描述为空 | ❌ 不可判 | 没有任何证据，不猜（既不进基线也不报冲突） |
| `faces` 为 `null`（分析不可用） | ❌ 不可判 | **不等于「无人脸」**，不参与任何比较 |
| `faces` 为 `[]`（分析成功且确实无人脸） | ✅ 可判（人脸数 = 0） | 参与「人脸有无 / 数量」比对 |

### 2.2 severity 定义

| severity | 含义 | 典型来源 |
| --- | --- | --- |
| `error` | 结构与多数**明确冲突**，足以判断「这不是同一主体」 | `face-presence-mismatch` |
| `warn` | **可疑但不确证**（启发式 / 措辞差异 / 漏写都可能命中），需人工核对 | 表情突变、外观冲突、数量不一致、体检未覆盖 |
| `info` | 仅提示，不暗示内容有问题 | 低置信人脸 |

排序口径：`error` → `warn` → `info`，同级按格序号升序（`crossCellSeverityRank`）。

### 2.3 外观关键词抽取规则（保守，宁缺勿滥）

- 只用**固定词表**命中（`CROSS_CELL_APPEARANCE_TERMS` + 颜色词表），**不做语义推断**：体型 / 肤色 / 气质一律不取；
- **相邻同现**：颜色词必须与服装名词（→ 服装颜色）或毛发名词（→ 发色）在 ≤ 6 字符内（重叠算 0）同现。
  因此「黑发」不会被读成黑色服装，「黑色长裙」不会被读成发色；`black hair` / `black long hair` /
  `long black hair` / `黑色长发` 都能判出发色；
- 银 / 灰 / 银白统一归到取值 `white`（白发/银发），避免同一外观因措辞不同被拆成两个取值而误报；
- 年龄段只认显式年龄词（儿童 / 少年 / 青年 / 中年 / 老年 及对应英文），不从气质推断；
- 每格只取**主脸**（置信度最高那张）的描述；同类别同取值去重。

## 3. 与文本级 continuity-check 的分工

| 维度 | 文本级连贯性检查（既有） | 本批：图像级跨格一致性校验 |
| --- | --- | --- |
| 入口 | `continuity-check-runner.ts` + `ContinuityCheckBlock` | `engine/consistency-check.ts` + `ConsistencyCheckSection` |
| 数据来源 | 视觉模型对多张图**自由作答**的 JSON（服装 / 光影 / 轴线 / 道具） | 人脸分析接口的**结构化字段**（人脸数 / 表情 / 置信度 / 描述） |
| 判定方式 | 模型语义判断（不可复算） | 纯函数机械比对（**可复算、可核对证据**） |
| 输出 | `{ summary, issues:[{shotIndex, message}] }` | `{ issues:[{cellIndex, severity, code, messageZh, evidence}], summaryZh, checkedCount, unavailable? }` |
| 一次最大图数 | 4 张（`CONTINUITY_IMAGE_CAP`） | 逐格各一次（并发受限），不截断格数 |
| 关系 | 互补 | 互补；**本批不改动其任何语义**（只在 barrel 追加导出） |

## 4. 取数壳层口径（`apps/web/src/engine/consistency-check.ts`）

| 项 | 口径 |
| --- | --- |
| 并发 | `runWithConcurrency` 有界并发；缺省 `CONSISTENCY_DEFAULT_LIMIT = 2`（与逐格出图缺省同口径），面板复用工作区「逐格并发」设置 |
| 去重 | 一批内同 URL 只请求一次；进度按**去重后**的 URL 数报（`onProgress`） |
| 缓存 | 会话内存 `Map`（上限 200，FIFO 淘汰；`clearConsistencyFaceCache()` 可清）；**只缓存成功结果** —— 失败不入缓存，重试会真的重新请求；`cache: false` 可完全绕过 |
| 失败透传 | 接口 `ok:false` → `status: 'failed'` + `reasonZh`（`message` 优先、其次 `summary`，都没有写「未给出原因」）；抛错 → `failed` + `请求失败：<原因>`；`ok:true` 但缺 `faces` 数组 → `failed`（**不谎称无人脸**） |
| 「无人脸」与「不可用」 | `ok:true` + `faces: []` → `status: 'no-face'`，`cells[].faces = []`（有效结论）；`ok:false` → `cells[].faces = null`（不可分析） |
| 取消 | `signal.aborted` 后不再启动新分析，已启动的跑完；未跑的格 `status: 'cancelled'` |
| 未出图 | 空 URL → `status: 'skipped'`，不进 `cells`，计入 `skippedCount`（报告里如实写「另有 N 格未纳入校验」） |
| 不伪造 | 壳层**不做任何判定**；判定全部在纯函数模块（可单测、无网络、无副作用） |

## 5. UI 接线

- **多格推演**（`MultiGridWorkspace`）：结果区末尾新增「一致性校验」区；目标格 = 当前计划全部格（未出图格自动跳过）；
  并发复用「逐格并发」；文案带上模式与行列（如「画面推演（3×3）」）。
- **角色设定表**（`CharacterSheetWorkspace`）：结果区末尾新增「一致性校验」区；除上述外，把**三视图正面格**作为
  `preferIndexes`（挑最优格时的平局优先项，不会盖掉更严重的问题）。
- 面板（`ConsistencyCheckSection`）：按钮触发校验 → 展示 `summaryZh`、逐格问题（severity 徽标 + 问题文案 + 一行证据 +
  可展开的逐格取值明细 + 「跳到该格」）、「挑最优格」结果（推荐理由、排除项、候选排序明细）。
- **只读**：报告不写节点 data、不改提示词、不触发重跑；报告为**会话内状态**（组件 state），重挂工作区后需重新校验。
  逐格图 / 格数在报告之后发生变化时，面板给出「报告可能已过期，建议重新校验」提示。
- 服务端不可用 / 网络失败：逐格显示失败原因，`buildConsistencyReport` 返回 `unavailable`（面板显示「本次未出结论」），
  **不显示任何假结论**。

## 6. 「挑最优格」判据（`pickBestCell`）

1. 候选 = 有可用人脸分析结果（`faces` 是数组）的格；`requireUrl !== false`（缺省）时排除「有 url 字段但为空」的格；
2. 候选为空 → **无法推荐**（`ok: false`，不猜）；
3. 被 `error` 级问题指向的候选格**排除**，排除理由逐条列出（`excludedZh`）；
4. 排除后无候选 → **无法推荐**（先修再选）；
5. 其余按 `[警告数 ↑, 提示数 ↑, 优先格优先, 人脸平均置信度 ↓, 格序号 ↑]` 排序取第一；
6. 只剩 1 个候选 → 给出推荐，但明确「仅此格有可用分析，未做格间比较」。

## 7. 已实现 / 未实现边界

**已实现**：上述全部能力 + 三份单测（判据边界、证据内容、`unavailable` 路径、推荐判据与「无法推荐」分支、
限流 / 去重 / 缓存 / 失败透传 / 取消、接线守卫）。

**未实现 / 已知边界（如实）**：

1. **真实人脸分析端到端未跑**：需要服务端与视觉通道凭据，本机不可执行；引擎行为由 mock 注入验证，
   接口契约以既有 `analyzeFaces` 返回形状为准（`ok / faces[].expression|confidence|description / summary`）。
2. **全部判定都是启发式**：LLM 描述**漏写**与**真的没有**无法区分 → 外观冲突文案写作「描述中未出现」，
   severity 固定为 `warn`，并在 UI/文档提示人工核对。
3. **不做「期望人脸数」类业务预判**：例如设定表恒为 1 人，本模块只做**格间比对**，不判断「2 张人脸就一定错」。
4. **不做几何 / 构图 / 像素级比对**：不比较人脸框位置、占比、色调、光影；不使用任何前端 CV 库。
5. **不跨节点比对**：一次校验只覆盖当前工作区的格，不能跨两个节点的结果对着比。
6. **缓存不跨会话**：刷新页面或重挂节点后缓存与报告都清空（无持久化，不新增持久化字段）。
7. **词表覆盖有限**：只在 `CROSS_CELL_APPEARANCE_TERMS` / 颜色词表覆盖的写法内判定；未收录的写法（如
   `chestnut bob`、方言式描述）不会被抽取，表现为「该类别不可判」而非误报。
8. **相邻同现阈值（6 字符）是经验值**：把颜色词与名词隔开更远的写法（如
   `black hair, standing beside a wooden coat rack`）不会被判成服装色 —— 宁可漏判，避免误报。

## 8. 验证口径

| 命令 | 结果 |
| --- | --- |
| `cd apps/web && npx vitest run src/engine/__tests__/consistency-report.test.ts src/engine/__tests__/consistency-check.test.ts src/engine/__tests__/consistency-wiring.test.ts` | **exit 0 · 3 files / 74 tests 全通过** |
| `npx tsc -p tsconfig.verify-consistency.json`（隔离最小 tsconfig，`@nx9/shared` 指向 barrel 源码，只列入本次 5 个文件及其依赖） | 本次 5 个文件 **0 错误**；全量 53 条错误全部位于**未改动**的既有文件（`packages/shared/src/index.ts` 8 条 TS2307 = 8 个不存在的 `data/*` 模块；其余为与之相关的 TS7006/TS7053 既有传导错误） |
| 变异验证（改判据 → 测例转红 → 还原，逐条执行） | ①「有人有 / 有人无」severity 由 error 改 warn → 2 例失败；②`pickBestCell` 不再排除 error 格 → 1 例失败；③失败结果也写缓存 → 1 例失败；④`buildConsistencyReport` 在无可用分析时不再标记 `unavailable` → 4 例失败。还原后 sha256 与变异前一致，74 例复绿 |

**为什么单测走相对路径直取源码**：`packages/shared/src/index.ts`（barrel）当前引用了 8 个**尚不存在**的
`data/*` 模块（既有缺陷），任何在 import 期解析该 barrel 的测试都无法加载；`apps/web/tsconfig.json` 又把
`@nx9/shared` 指向**过期**的 `packages/shared/dist/esm/index.d.ts`（其中连上一批已交付的
`readMultiGridCellUrls` / `characterSheetPlanToGridCells` 都没有）。因此：

- 纯函数单测与引擎单测**相对路径直取源码**，与上述两个缺陷解耦；
- 取数壳层对纯函数只用 `import type`（编译期抹除）、对 API 层只用**动态 `import()`**，因此注入了 mock 的
  单测完全不会触碰 barrel 与 `api/client`；
- 两个工作区（需要几十个 barrel 导出）**不做渲染测试**，改用源码级接线守卫（语法解析 + 文本断言），
  沿用仓库既有做法（逐格出图并发守卫 / flow-runner 拆分守卫同款）。

## 9. 文件清单

| 文件 | 作用 |
| --- | --- |
| `packages/shared/src/utils/consistency-report.ts` | **新增**：判据与报告构造（纯函数，零依赖、可序列化、不抛异常） |
| `packages/shared/src/index.ts` | **追加**：`consistency-report` 的类型与函数导出（既有导出未改） |
| `apps/web/src/engine/consistency-check.ts` | **新增**：`analyzeCellFaces` 取数壳层（限流 / 去重 / 缓存 / 失败透传 / 取消） |
| `apps/web/src/engine/stage-deck/chrome/attached-workspace/consistency/ConsistencyCheckSection.tsx` | **新增**：一致性校验区（按钮 + 报告面板 + 挑最优格 + 跳转） |
| `.../tool/MultiGridWorkspace.tsx` | **追加**：新增校验区、跳转高亮（逐格卡片加 `id` 与聚焦环） |
| `.../tool/CharacterSheetWorkspace.tsx` | **追加**：同上，并把三视图正面格作为优先格 |
| `apps/web/src/engine/__tests__/consistency-report.test.ts` | **新增**：判据 / severity 边界 / 证据 / `unavailable` / 推荐判据单测 |
| `apps/web/src/engine/__tests__/consistency-check.test.ts` | **新增**：限流 / 去重 / 缓存 / 失败透传 / 取消单测（mock 注入） |
| `apps/web/src/engine/__tests__/consistency-wiring.test.ts` | **新增**：接线守卫（语法 + 只读约束 + 跳转 id 同源 + barrel 边界） |
