# NX9 逐帧拉片（frame-study）

> 本文只描述 NX9 自身能力与实现口径，不引用任何外部产品作为母版或对标物。

## 1. 能力范围

**逐帧拉片**：给一段参考视频，按抽帧策略把它逐帧拆解成「**参考帧 + 每帧提示词**」的
**拉片表**，供快捷参考 / 复刻使用。

一次拉片（节点级运行）做四件事：

1. **探测真实时长** —— `POST /api/montage/probe-duration`（既有通道），拿到真实秒数；探不到就如实说「时长未知」。
2. **抽帧** —— `POST /api/montage/extract-frames`（既有通道），拿到逐帧截图（`/media/exports/frames-*/frame-*.jpg`）。
3. **逐帧反推提示词** —— 对每一帧调 `POST /api/grid/reverse-prompts`（`rows=1 / cols=1` 即整帧画面），
   拿到中英提示词；逐帧并发受限（默认 2，可 1–4）。
4. **落成拉片表** —— 每帧一条：缩略图 + 时间码 + 中英提示词 + 景别 / 运镜（字面命中才有）+ 备注。

产出可直接消费：

| 通道 | 说明 |
| --- | --- |
| 拉片表面板 | 缩略图 + 时间码 + 提示词；可**单帧编辑 / 复制 / 重推 / 清空** |
| 导出 JSON | 含时间码 / 中英提示词 / 景别 / 运镜 / 备注，确定性输出（无时间戳） |
| 导出 CSV | UTF-8 带 BOM，Excel 可直接打开；中文提示词带引号转义 |
| 送入分镜 | 拉片表逐帧生成为分镜镜头，写回上游链镜表 + 分镜台拆镜结构 + 全局镜表，帧图写为该镜首帧（审阅态） |
| 下游连线 | 节点出口 = 逐帧参考图（picture）+ 逐帧提示词（prompt），可直接连图像 / 宫格拼合 / 视频生成 |

## 2. 抽帧策略与**管线真实口径**（本节是理解时间码的关键）

抽帧端点 `POST /api/montage/extract-frames` 的既有实现
（`apps/server/src/modules/montage/analyze.service.ts#extractFrameHints`）是：

```
ffmpeg -i <local> -vf fps=1/${max(1, floor(30 / count))} -frames:v ${count} frame-%03d.jpg
```

由此得到三条**硬约束**（本模块不臆猜，全部按此实现）：

1. **服务端只认 `count`，不认间隔**。间隔被量化成 `N = max(1, floor(30 / count))`；
   可达间隔只有 **{30, 15, 10, 7, 6, 5, 4, 3, 2, 1} 秒**（count = 1..30）。
   例如 count=8 → 每 3 秒一帧；count=4 → 每 7 秒一帧。
2. **输出帧数上限 = count**，所以**覆盖时长 ≈ count × N**：
   - count ≤ 30 时，`count × floor(30/count) ≈ 30` 秒 —— 无论 count 多大，**只能覆盖前约 30 秒**；
   - count > 30 时 `floor(30/count) = 0` → 收敛到 1 秒/帧，覆盖时长 ≈ count 秒。
3. 帧图文件名零填充（`frame-%03d.jpg`），字典序即时间序（帧数 < 1000 恒成立），
   客户端按文件名排序后与帧号对齐。

### 两种策略

| 策略 | 用户输入 | 换算出的 `count` | 拉片表时间码 |
| --- | --- | --- | --- |
| 按张数 `count` | 张数 1–60 | 就是该张数 | `k × N`（N = 服务端间隔） |
| 按间隔 `interval` | 间隔 1–30 秒 | 量化到可达间隔后取最大 count | `k × N`（N = 量化后的间隔） |

- **按张数**：用户要 N 帧，就请求 N 帧。注意时间码**不是**把整段时长等分 —— 而是抽帧网格的落点。
- **按间隔**：用户要 I 秒一帧。先把 I 量化到**不超过 I** 的可达间隔里最大者
  （即采样密度**不低于**用户要求），例如 I=8 → 7 秒（count=4），I=12 → 10 秒（count=3）。
- 单次帧数上限 **60**；帧数上限 / 间隔越界 / 覆盖不全一律给**结构化告警**，不静默截断。

### 计划里为什么有两个时间码

| 字段 | 口径 | 用途 |
| --- | --- | --- |
| `plan.timeSec` | **抽帧管线实际落点**：`k × serverIntervalSec`，受时长与帧数上限裁剪 | **拉片表 / 导出 / 送分镜一律用它**（唯一的真时间码） |
| `plan.idealTimeSec` | **策略口径的等距时间码**：按张数 = 等分整段**含首尾**（n=1 时落在 0）；按间隔 = 自 0 等距 + 末点距片尾 ≥ 半格时补**片尾边界帧** | 表达「用户想怎么抽」；用于对照与告警说明 |

两者不一致时给 `sampling-not-even` 告警。**不会**把理想等分时间码冒充帧位置；
时长未知时按张数模式**不给时间码**（`idealTimeSec: []`），而不是猜一个。

### 结构化告警码

| code | 触发 |
| --- | --- |
| `duration-unknown` | 未探到 / 非数字时长 |
| `duration-zero` | 时长 ≤ 0 |
| `duration-too-long` | 时长 > 3600s（只告警，不裁剪） |
| `count-clamped` | 张数越界被收敛到 1–60 |
| `interval-clamped` | 间隔被量化 / 越界收敛 |
| `frame-count-clamped` | 按策略整段排帧需要更多帧，一次请求给不满 |
| `interval-exceeds-duration` | 间隔 > 时长（只能拿到 t=0 一帧） |
| `coverage-partial` | 实际帧数少于请求 / 片尾未被覆盖 |
| `sampling-not-even` | 管线落点 ≠ 策略等分 |
| `missing-frame` / `missing-reversal` / `reverse-failed` | 合并层的缺帧 / 缺反推 / 反推失败 |
| `out-of-range-result` / `duplicate-result` | 反推结果帧号越界 / 重复（丢弃并告警，不塞进别的帧） |
| `invalid-plan` | 计划不可用 / 缺源视频地址 / 上游无镜表 |

## 3. 数据结构

契约在 `packages/shared/src/types/frame-study.ts`，纯函数在
`packages/shared/src/utils/frame-study-plan.ts`。

```
FrameStudyPlan {
  sourceUrl, durationSec(可 null), mode('count'|'interval'), value, rawValue,
  requestedCount,          // 实际发给抽帧端点的 count
  serverIntervalSec,       // 服务端真实间隔 N（如实披露）
  timeSec[],               // 管线实际落点时间码（拉片表口径）
  idealTimeSec[],          // 策略口径等距时间码（含首尾 / 补片尾边界）
  timeSecKnown, coverageSec, aspectRatio, notesZh, warnings[]
}

FrameStudyItem {
  index, timeSec?, thumbnailUrl?, reversePromptZh?, reversePromptEn?,
  shotSizeLabel?, cameraMoveLabel?, notes?
}

FrameStudyResult { ok, plan, items[], frameCount, reversedCount, warnings[], messageZh }
```

节点 data 字段（无新增持久化类型，全部落在既有节点 data 约定里）：

| 字段 | 含义 |
| --- | --- |
| `frameStudyMode` / `frameStudyValue` | 抽帧策略与策略值 |
| `frameStudyVideoUrl` | 面板指定的视频地址（上游无视频时用） |
| `frameStudyDurationSec` / `frameStudyDurationNote` | 真实探测到的时长 / 探测失败原因 |
| `frameStudyContext` | 参考视频上下文（作为逐帧反推的 `storyPrompt`） |
| `frameStudyPlan` / `frameStudyItems` / `frameStudyResult` | 计划 / 拉片表条目 / 完整结果 |
| `frameStudyFrameUrls` | 逐帧图地址数组（下游与预览用） |
| `frameStudyShotWriteback` | 「送入分镜」的防重键与批次记录 |
| `pictures` / `previewUrl` / `previewUrls` / `splitUrls` / `imageCount` | 沿用既有下游消费字段 |
| `concurrency` | 逐帧反推并发（与逐格出图同一解析口径，1–4，默认 2） |

### 标签提取（景别 / 运镜）—— 只做字面命中，不做语义推断

- **景别**：只认**完整景别词**（大远景 / 远景 / 全景 / 中景 / 近景 / 特写，及
  `medium shot` / `close-up` / `wide shot` 等整词）。bare 形容词（如 `wide`）**不算**命中。
- **运镜**：命中值一律落在分镜台拆镜枚举 `固定/推/拉/摇/移/跟/手持` 上，保证写分镜不被丢弃；
  英文按**整词**匹配（`\bpan\b` 不会命中 `panorama`），并显式收录 `-ing` 等形式。
- 未命中就**留空**（`shotSizeLabel` / `cameraMoveLabel` 为 `undefined`），不猜。

## 4. UI 入口

- **Dock 生成分组** → 「逐帧拉片」（`glyph: Frame`，`nx9Native`）。
- 节点为 tool 型 + `attachToNode` → 点击节点在**节点下方展开底部跟随工作区**（不进 Inspector）。
- 工作区（`FrameStudyWorkspace.tsx`）：
  - 顶部：参考视频来源与地址、**探测时长**按钮；
  - 状态行：帧数 / 反推进度 / **导出 JSON** / **导出 CSV** / **送入分镜**；
  - 参数区（折叠）：策略值、宽高比、逐帧并发、参考视频上下文、**抽帧计划摘要 + 全部告警**、视频预览；
  - 正文：逐帧卡片（缩略图 + 时间码 + 景别 / 运镜 + 中英提示词可编辑 + 重推 / 复制 / 清空）
    + 「送入分镜」镜头清单预览。
- 空 / 失败态一律中文说明：未连视频、未抽帧、无上游镜表、帧无图、反推失败各自有独立文案。
- 运行主按钮：`resolveRunLabel('frame-study')` → 「抽帧并逐帧反推」。

## 5. 与 `frame-sampler` / `analyze-reference` 的分工

| 能力 | 层级 | 输入 → 输出 | 本节点是否复用 |
| --- | --- | --- | --- |
| `frame-sampler` / `frame-endpoints` 节点 | **帧级，只出图** | 视频 → 帧图数组 | 语义不重叠：它们**只吐图**，没有时间码表、没有逐帧提示词、不能导出拉片表。本节点的抽帧走同一个服务端端点，但额外给出时间码 + 逐帧提示词 + 拉片表 |
| 媒体工具里的「抽帧」 | 帧级，只出图 | 视频 → 帧图 | 同上（`extractFrames` 调用契约未改动） |
| `analyzeReferenceVideo`（`/api/montage/analyze-reference`） | **镜头级** | 视频 + 备注 → 分镜表（Markdown → `StoryboardShot[]`），一次抽 3 帧仅作 LLM 提示 | 不重叠：它是「按 URL 与备注**推断**分镜节奏」，不是逐帧；本节点不调用它，也不依赖它的推断 |
| **本节点 `frame-study`** | **帧级 + 提示词** | 视频 → 拉片表（时间码 + 逐帧中英提示词） | 复用 `probe-duration` / `extract-frames` / `grid/reverse-prompts` 三条既有通道，未改任何既有契约 |

下游差异：`frame-sampler` 的出帧可直接被宫格 / 视频节点消费；
本节点除了出帧，还把**逐帧提示词**一并交下游（`gatherUpstream` 的 `pictures` + `prompts`），
并支持把拉片表逐帧**生成分镜镜头**写回镜表。

## 6. 已实现 / 未实现边界

### 已实现

- 抽帧策略双模式（按张数 / 按间隔）、服务端间隔量化、真实落点时间码、等距策略时间码与首尾边界。
- 时长真实探测（失败如实报未知）、时长 0 / 负数 / 非数字 / 超长的结构化告警。
- 逐帧反推（有界并发、可取消、单项失败不打断其它帧）、按帧号归位合并（缺帧 / 多余帧 / 乱序 / 重复全部有确定语义）。
- 拉片表单帧编辑 / 复制 / 重推 / 清空；导出 JSON / CSV；逐帧送入分镜（含防重键与不重复追加）。
- 单帧重推与「清空单帧」只动该帧，成功帧不被覆盖。
- 空成功防护：一帧未抽到直接抛错；拉片表无任何帧图时不生成空镜头。

### 未实现（如实列出）

- **跨整段等分的「二次抽样」**：`count` 模式下，若视频长于 `count × N`，只会覆盖前约 30 秒。
  要做到「N 帧均分整段」，需要先按细间隔多抽、再客户端下采样到 N 帧——
  本批**未实现**，改为给出 `coverage-partial` / `frame-count-clamped` 告警，
  并在文档与面板上引导用户改用「按间隔」或**分段拉片**（每次拉一段）。
- **超过单次上限的视频**：单次最多 60 帧（覆盖约 ≤60 秒）。更长的视频需分段拉片，无自动分段。
- **一次拉片的服务端抽帧无进度回调**：抽帧是单个 ffmpeg 请求，进度只覆盖「反推」阶段。
- **抽帧 / 反推请求不可中断在途调用**：既有端点未接受 `AbortSignal`；
  「停止」只会不再启动后续帧，在途请求跑完（已完成结果照常落盘）。
- **逐帧提示词不带运镜 / 尾帧结构化字段**：反推返回的是图提示词（中英）；尾帧 / 运镜运动描述
  未纳入拉片表（不编造），只做字面景别 / 运镜标注。
- **没有拉片表版本 / 历史回滚**：重跑覆盖当前拉片表（`清空拉片表` 后重跑）。
- **未接模板**：`WORKFLOW_TEMPLATES` 里没有预置拉片模板（不做无验证的模板）。

### 未验证（本机无法验证，不声称通过）

- **真实抽帧与真实反推的端到端**：需要可访问的视频文件 + 本机 `ffmpeg` + 可用的视觉 LLM 通道，
  本机不具备，**未运行**。
- 因此「抽帧得到的帧数恰好等于计划帧数」「反推提示词质量」等结论均**未经真机验证**，
  只以服务端源码口径（`fps=1/N` + `-frames:v count`）推导并在文档中标注为推导口径。

## 7. 验证口径

### 单测

```bash
cd apps/web
npx vitest run src/engine/__tests__/frame-study-plan.test.ts src/engine/__tests__/frame-study-block-map.test.ts
```

- `frame-study-plan.test.ts`：抽帧管线口径（间隔公式、可达间隔集合、count 反查）、
  量化间隔、等距时间码与首尾边界、计划边界（count=1 / 超长 / 间隔大于时长 / 时长 0/负/未知/超长）、
  反推合并（缺帧 / 多余帧 / 乱序 / 重复 / 失败）、字面标签提取（含 `panorama` 不命中 `pan` 的反例）、
  送分镜（序号续接 / 时长收敛 / 防重键）、导出（BOM / 引号转义 / 确定性）。
- `frame-study-block-map.test.ts`：目录 / socket / 交互类 / 跟随工作区 / run 文案 / `gatherUpstream` 契约 /
  `RUNNABLE_BLOCKS` 与执行分支成对 / 前端渲染器与工作区路由注册。

两个测试都用**相对路径直取 `packages/shared/src` 源码**，不依赖 `@nx9/shared` barrel。

### 类型检查

仓库的 `apps/web/tsconfig.json` 把 `@nx9/shared` 指向 `packages/shared/dist/esm/index.d.ts`（**stale dist**），
而 `packages/shared` 因缺失 `data/*` 模块无法重新构建 —— 这是既有缺陷，web 侧 `tsc` 基线本身是红的。

因此本批的类型验证用「把 `@nx9/shared` 指回 `packages/shared/src/index.ts`」的临时 tsconfig
单独编译**本次新增 / 改动的文件**，结论：这些文件 **0 类型错误**。

### 全量回归

```bash
cd apps/web
npx vitest run            # 全量
```

口径：与改动前基线逐文件比对失败集合；失败文件数与错误签名必须一致才算零回归。

## 8. 实现落点（文件清单）

| 文件 | 作用 |
| --- | --- |
| `packages/shared/src/types/frame-study.ts` | 数据契约（新增） |
| `packages/shared/src/utils/frame-study-plan.ts` | 纯函数层：计划 / 反推合并 / 标签字面提取 / 送分镜 / 导出（新增） |
| `packages/shared/src/index.ts` | 追加导出（既有导出未改动） |
| `packages/shared/src/catalog/block-catalog.ts` | 追加目录项（生成分组，`glyph: Frame`） |
| `packages/shared/src/catalog/socket-registry.ts` | 追加 socket：`clip`+`prompt` 入，`picture`+`prompt` 出 |
| `packages/shared/src/catalog/node-interaction.ts` | 追加到 `LOGIC_KINDS` |
| `packages/shared/src/catalog/attached-workspace.ts` | 追加 tool 型跟随工作区 |
| `packages/shared/src/utils/run-labels.ts` | 追加运行文案 |
| `packages/shared/src/engine/flow-graph.ts` | 追加 `gatherUpstream` 分支（逐帧图 + 逐帧提示词） |
| `apps/web/src/blocks/core/FrameStudyBlock.tsx` | 节点渲染（复用 `CanvasNodeShell`，新增） |
| `apps/web/src/blocks/registry.tsx` | 追加 lazy loader |
| `apps/web/src/engine/flow-runner.ts` | 追加 `RUNNABLE_BLOCKS` 与执行分支 |
| `apps/web/src/engine/flow-runner-ops/frame-study-ops.ts` | 执行器：探测 / 计划 / 抽帧 / 逐帧反推 / 落盘 / 单帧重推 / 单帧清空（新增） |
| `apps/web/src/engine/stage-deck/chrome/attached-workspace/tool/FrameStudyWorkspace.tsx` | 工作区面板（新增） |
| `apps/web/src/engine/stage-deck/chrome/attached-workspace/AttachedWorkspaceRouter.tsx` | 追加路由分支 |
| `apps/web/src/engine/__tests__/frame-study-plan.test.ts` | 纯函数回归（新增） |
| `apps/web/src/engine/__tests__/frame-study-block-map.test.ts` | 节点目录 / 接线回归（新增） |
