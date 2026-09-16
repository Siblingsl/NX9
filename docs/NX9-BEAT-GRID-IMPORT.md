# NX9 音频节拍网格接入（beat-grid）

> 把**已有的服务端节拍分析能力**接到客户端：运镜时间轴与多格推演的「节拍对齐」
> 从此可以按**真实 BGM 节拍**（听音分析）而不是手填等分来做。
>
> 本次为**增量接线**：服务端 `detectBeats` / `POST /api/montage/beat-analyze`
> 与 `api.beatAnalyze` 都是既有能力，本次只补齐「客户端接入层 + 纯函数 + UI 入口 + 单测/文档」。

---

## 1. 能力范围

| 能力 | 位置 | 说明 |
| --- | --- | --- |
| 听音节拍分析 | **既有** `apps/server/src/modules/montage/beat-detection.ts` | 单声道 PCM → 分窗 RMS 能量 → 平滑 → 自适应阈值（均值 + k×标准差）→ 局部峰值 = onset → 200ms 内合并 → BPM（相邻间隔中位数，限 40–240 BPM） |
| HTTP 接口 | **既有** `POST /api/montage/beat-analyze` | body `{ audioUrl }` → `{ ok, beats?, tempo?, message? }`；无 ffmpeg / 读不到文件 / 解码失败 / 节拍不明显一律 `ok:false`（**禁止空成功**） |
| 前端 API | **既有** `apps/web/src/api/client.ts` 的 `beatAnalyze(audioUrl)` | 本次之前**没有任何 UI 消费** |
| 客户端接入层 | **新增** `apps/web/src/engine/beat-grid.ts` | 结构化 `BeatGrid`、同址缓存、并发去重、超时、失败如实透传；4 个纯函数供 UI 用 |
| 共享纯函数 | **新增** `packages/shared/src/utils/beat-grid-plan.ts` | `distributeSegmentBoundaries` / `snapTimelineToBeatGrid` / `planCellDurationsFromBeats`（+ `sanitizeBeats` / `beatGridEndSec`） |
| UI 入口 ① | **新增** 运镜时间轴编辑器「从 BGM 分析节拍 → 对齐到真实节拍」 | BPM / 节拍数 / 间隔统计 + 时间轴上的真实节拍刻度线 |
| UI 入口 ② | **新增** 多格推演面板「按 BGM 节拍分配各格时长」 | 逐格节拍时长 + 占拍数，展示在每格卡片上 |
| 单测 | **新增** `apps/web/src/engine/__tests__/beat-grid.test.ts`（50 项）+ 编辑器组件回归 5 项 | 注入 mock api，覆盖成功 / 失败 / 缺拍 / 超时 / 缓存 / 并发去重 / 边界分配 / 多格时长 |

不在本次范围：不改服务端、不引入任何第三方音频解码库、**不在前端解码音频**（一律走服务端既有 ffmpeg 链路）。

---

## 2. 数据流

```
素材库 / sound-gen / media-pin / 上游音频
        │  audioUrl
        ▼
POST /api/montage/beat-analyze                     （既有）
        ▼
montage.service.beatAnalyze                        （既有）
   ├─ resolveMediaUrl + existsSync   → 失败：ok:false「无法读取音频文件，禁止空成功」
   ├─ checkFfmpeg()                  → 失败：ok:false「未检测到 FFmpeg，禁止空成功」
   ├─ spawn ffmpeg -ac 1 -ar 8000 -f f32le pipe:1   （最长 600s）
   └─ detectBeats(samples, 8000)     → 空节拍：ok:false + detectBeats.message
        ▼
{ ok, beats:number[], tempo?:number, message? }    （既有）
        ▼
engine/beat-grid.ts  analyzeAudioBeats()           （新增）
   ├─ 清洗（升序 / 去重 / 丢非正值）
   ├─ ok!==true 或清洗后为空 → 判定失败，透传 message（禁止伪造节拍）
   ├─ 同址缓存：成功 30min / 失败 30s；同址并发共用一个 Promise
   └─ 超时（默认 20s）→ ok:false + 超时原因
        ▼
BeatGrid { ok, audioUrl, beats, tempo?, durationSec?, message?, analyzedAt, cached? }
        ▼
UI：CameraMoveTimelineEditor（时间轴刻度 + 对齐）/ MultiGridWorkspace（各格时长）
```

`BeatGrid.durationSec` 的口径：**不是**音频真实总时长（服务端未返回），
而是「被分析到的末端秒数」= 末个节拍点。它只用于对齐边界，**不得**对外当作音频时长声明。

---

## 3. 纯函数口径（`packages/shared/src/utils/beat-grid-plan.ts`）

全部纯函数：无 IO、无副作用、不改入参、输入输出可 JSON 序列化、**不抛异常**。

### 3.1 `distributeSegmentBoundaries(beats, segmentCount, opts?) → BeatSegmentBoundaryPlan`

把节拍点收敛成 N 段边界：

- 首边界 = `opts.startSec`（默认 0，时间轴从 0 起）；末边界 = 末个可用节拍；
- **中间边界一律取自真实节拍点**（按段分配节拍数后取每段末拍）；
- 段内节拍数用「剩余拍数 / 剩余段数」四舍五入贪心分配，并保证后续每段仍有 `minBeatsPerSegment` 拍；
- `minBeatsPerSegment`（默认 1）无法满足 → `ok:false` + 「节拍点不足：X 拍 < N 段 × 每段最少 M 拍」；
- `maxBeatsPerSegment` 装不下全部节拍 → 放宽为刚好能均分的最小值，`relaxedMaxBeats:true` 并在 `messageZh` 说明（**节拍点依旧是真实的**）；
- 零节拍 / 段数非法 / 起始秒之后无拍点 → `ok:false` + 中文原因，**不做等分兜底**。

### 3.2 `snapTimelineToBeatGrid(timeline, grid, opts?) → BeatSnapResult`

把 `CameraMoveTimeline` 各段边界贴到真实节拍点：

- **均匀网格**（相邻间隔相对偏差 ≤ 5%）→ 复用既有 `snapMoveTimelineToBeats({ secondsPerBeat: 中位间隔 })`，
  再逐边界校验确实落在真实节拍上 → `strategy:'uniform-grid'`（**与既有实现协同，不冲突**）；
- **相位不符**（拍点整体偏移，例如 0.3/1.3/2.3…）或**非均匀网格** → 显式吸附到
  `{0} ∪ 真实节拍点` 里最近的点 → `strategy:'beat-points'`；绝不使用并不存在的刻度；
- 网格比时间轴短 → 裁剪到网格末端，`clippedSec` + `messageZh` **如实报告裁掉多少秒**；
- 相邻边界吸到同一拍 → 零时长段被归一化丢弃，`droppedSegments` 计数并在 `messageZh` 说明；
- 网格不可用（`ok!=true`）/ 节拍为空 / 时间轴为空 → `ok:false` + **原时间轴的归一化结果** + 中文原因（不假装已对齐）；
- 成功结果带 `beatAligned:true`，因此注入的运镜行会写 `beat-aligned` / `按节拍对齐`。

### 3.3 `planCellDurationsFromBeats(cellCount, grid, opts?) → CellDurationPlan`

多格推演各格时长：第 1 格从 `startSec`（默认 0）起，逐格推进到各自节拍边界，**格间切点即拍点**。

节拍不可用时（未分析 / 失败 / 拍数不足）：

- 给了 `opts.fallbackSec` → 返回等长兜底时长，但 `ok:false`、`usedFallback:true`，
  `messageZh` 明确写「已改用每格 Xs 兜底（这些时长不是按节拍算出来的）」；
- 没给 → 返回空时长 + 原因。

---

## 4. UI 入口

### 4.1 运镜时间轴编辑器（`CameraMoveTimelineEditor.tsx`）

**从 BGM 分析节拍**

- 音频地址输入框（`aria-label="BGM 音频地址"`）+ 可选上游音频下拉（`audioCandidates`）：
  未填地址时自动取第一个候选。候选来源：上游音频 / 配乐 / 音效
  （`useUpstreamMedia` 的 `sounds / bgmUrls / sfxUrls`，由视频 / 图片工作台传入）；
- 成功后显示：`约 120 BPM · N 拍`、`间隔中位 x s · 最小 y s · 最大 z s`、`覆盖到 T s`；
- **时间轴上画出真实节拍刻度线**（`[data-beat-index]`，hover 显示 `真实节拍 #n · Xs（距上一拍 Ys）`），
  只画在时间轴覆盖范围内；分析失败时不画任何刻度。

**对齐到真实节拍**

- 调 `snapTimelineToBeatGrid(rawTimeline, grid)`，成功则各段贴到真实拍点；
- 段数一致且时长不被最短片段阈值（0.2s）抬高时，**回写各段时长到条目**
  （吸附结果连续铺满 → 回写后由条目重建的时间轴与吸附结果逐段一致，幂等）；
  段数变化或受限时**不回写**，并在提示里说明，避免显示值与对齐结果自相矛盾；
- 与既有「节拍对齐（手工等分数）」**互斥**：开启一方自动关闭另一方，避免两套刻度打架；
  既有手工路径的行为与提示文案（含 `title="节拍数"`）**一字未改**；
- 「取消对齐」退回普通时间轴（时长保持当前值）。

### 4.2 多格推演（`MultiGridWorkspace.tsx`）

高级参数区新增「BGM 节拍」块：音频地址（含上游候选下拉）→「分析节拍」→
「按 BGM 节拍分配各格时长」。结果显示在**每格卡片**上（`节拍时长 X s · 占 N 拍`），
并在活动日志里记一条逐格时长清单。

---

## 5. 失败口径（诚实边界）

| 情形 | 客户端表现 |
| --- | --- |
| 未检测到 FFmpeg | `ok:false`，UI 原样显示「未检测到 FFmpeg，禁止空成功」；「对齐到真实节拍」禁用 |
| 读不到音频文件 | 同上，显示「无法读取音频文件，禁止空成功」 |
| ffmpeg 解码失败 | 显示「音频解码失败（ffmpeg exit N），禁止空成功」 |
| 音频过短 / 能量平稳 / 无明显起伏 | 显示 detectBeats 的原因（如「音频能量平稳（无明显节拍起伏）」） |
| 服务端 `ok:true` 但节拍为空 | 客户端**判定失败**（不把空节拍当成功） |
| 请求超时（默认 20s） | 显示「节拍分析超时（超过 N 秒），未取到节拍」 |
| 网络 / 500 | 显示「节拍分析请求失败：<错误文本>」 |
| 地址为空 | 显示「请先选择或输入 BGM 音频地址」，**不发出请求** |

任何失败路径下：`BeatGrid.beats` 必为空数组、时间轴不画假刻度、不返回等分边界冒充节拍边界。

---

## 6. 持久化边界（不新增字段名）

- 节拍网格（`BeatGrid`）**只在会话内**保存：编辑器 / 多格推演的组件状态 + `engine/beat-grid.ts` 的内存缓存
  （同址不重复请求；成功 30 分钟、失败 30 秒，`clearBeatGridCache()` 可清）。
- 真正落库的仍然只有**既有提示词文本**（运镜行，复用 `camera/movement` 同一行槽位）。
- 多格推演的「各格节拍时长」同样是会话内推演参考，**不写入任何节点 data 字段**，
  面板上明确标注；下游视频生成仍按各格视频提示词里既有的时长执行。
- 未新增任何持久化字段名。

---

## 7. 已实现 / 未实现边界

**已实现**

- 听音节拍分析接入（缓存 / 去重 / 超时 / 失败透传）；
- 时间轴真实节拍刻度 + BPM / 间隔统计展示；
- 各段贴到真实节拍（均匀网格复用既有实现并做真实性校验，非均匀网格按真实拍点吸附，含裁剪 / 丢段报告）；
- 多格推演各格时长按节拍分配（含不足时兜底与明示）；
- 50 项引擎单测 + 5 项编辑器组件回归（含失败 / 空地址 / 取消对齐）。

**未实现（诚实列出）**

1. **真实音频端到端未验证**：需要 ffmpeg + 真实音频 + 运行中的服务端。本次只对注入的 mock api 做了单测，
   `POST /api/montage/beat-analyze` 的真实往返**没有跑过**。
2. **多格节拍时长没有下游闭环**：不写节点字段，因此不会自动改变下游视频生成的时长
   （各格 `videoPrompt` 里的时长是生成时固化的文案，改写它有文本替换风险）。
   若要闭环，应由 `clip-gen` 消费**结构化**时长，而不是改提示词文本。
3. **不做节拍细分**：只区分拍点，不推断小节（bar）/ 强拍，因此没有「每 4 拍一线」的加重显示。
4. **音频时长未知**：服务端未返回音频总时长，`BeatGrid.durationSec` 是「分析覆盖末端」（末个节拍）。
5. `@nx9/shared` barrel 目前**整体不可加载**（既有缺陷，见下），因此新增的 barrel 导出
   （`distributeSegmentBoundaries` / `snapTimelineToBeatGrid` / `planCellDurationsFromBeats` /
   `sanitizeBeats` / `beatGridEndSec` / 相关类型）要等该缺陷修复后才会对其它消费方生效。

---

## 8. 验证口径

> 命令均在 `apps/web` 下执行（`pnpm` workspace 的 web 包）。

### 8.1 新增引擎单测 + 编辑器组件回归

```bash
npx vitest run \
  src/engine/__tests__/beat-grid.test.ts \
  src/engine/__tests__/camera-move-timeline.test.ts \
  src/engine/__tests__/multi-grid-plan.test.ts \
  src/engine/__tests__/multi-grid-closure.test.ts \
  src/engine/__tests__/dr05-beat-sync-honesty.test.ts \
  src/blocks/craft/__tests__/CameraMoveTimelineEditor.test.tsx

# → Test Files  6 passed (6)
# → Tests  174 passed (174)
# → exit 0
#   beat-grid.test.ts 50 项：成功 / ok:false 透传 / 空节拍 / 脏数据清洗 / 超时 /
#   请求抛错 / 空地址 / 缓存命中 / 失败短缓存 / force / 并发去重 / 不同 URL 隔离 /
#   markers / 间隔统计 / 覆盖末端 / 边界分配（均匀 · 非均匀 · 零拍 · 不足 · 过多 ·
#   单段 · 非法段数 · 起始秒越界）/ 时间轴吸附（均匀复用既有实现一致性 · 相位不符回退 ·
#   裁剪 · 丢段 · 网格不可用 / 为空 / 时间轴为空 / 不改入参）/ 多格时长（均匀 · 非均匀 ·
#   不足 + 兜底 · 无兜底 · null 网格 · 非法格数 · 单格）
#   CameraMoveTimelineEditor.test.tsx 20 项（既有 15 项全通过 + 新增 5 项：分析成功显示
#   BPM 并画 6 条真实刻度 / 空地址不发请求 / 失败显示真实原因且对齐按钮禁用 /
#   对齐后注入 beat-aligned 且边界落在整数秒拍点 / 取消对齐）
```

### 8.2 隔离类型检查（最小 tsconfig + 源码路径映射）

```bash
node ../../node_modules/typescript/bin/tsc -p tsconfig.beat-grid-check.json
# → exit 2，53 条错误，**被检查的文件 0 error**
#   （`grep -c "beat-grid\|CameraMoveTimelineEditor\|MultiGridWorkspace"` = 0）
#   53 条全部落在既有缺陷上：packages/shared/src/index.ts 的 8 个不存在模块
#   （TS2307）及其级联 implicit-any、packages/shared/utils/character-face-rig.ts、
#   playbook-*、director3d/src/sculpt/*、src/stores/workspace-document.ts
#   对照基线：仓库既有的同口径检查 `tsconfig.movetl-check.json` 同样是 exit 2 / 53 条 / 被检查文件 0 error
```

### 8.3 无法运行的检查（如实说明）

```bash
pnpm --filter @nx9/shared build      # ✗ 既有缺陷：index.ts 引用 8 个不存在的 data/* 模块
pnpm --filter @nx9/web typecheck     # ✗ apps/web/tsconfig.json 把 @nx9/shared 指向**过期**的
                                     #   dist/esm/index.d.ts（连既有的 camera-move-* 导出都报缺失），
                                     #   dist 又因上一条无法重建
```

真实证据（不是推测）：

```bash
# barrel 是否可解析 —— 用 esbuild 真实打包
node -e "require('esbuild').build({entryPoints:['packages/shared/src/index.ts'],bundle:true,format:'esm',write:false,logLevel:'silent'}).then(...)"
# → BUNDLE_FAIL / 12 errors，前 5 条：
#   index.ts:587 Could not resolve "./data/emotion-presets"
#   index.ts:622 Could not resolve "./data/shot-move-families"
#   index.ts:640 Could not resolve "./data/creative-asset-presets"
#   index.ts:655 Could not resolve "./data/character-face-rig-presets"
#   index.ts:884 Could not resolve "./data/playbook-definitions"
#   （其余 3 个：camera-presets / shot-lexicon-taxonomy / provider-registry）

# 全量 web 类型检查的既有错误规模（与本次改动无关，改动前后同量级）
node ../../node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
# → exit 2，122 条错误，其中既有的 camera-move 相关行例如：
#   CameraMoveTimelineEditor.tsx(33,3) TS2305: '"@nx9/shared"' has no exported member 'buildComposedMovePrompt'
#   shot-edit-modal.tsx(18,3) TS2305: ... 'mergeCameraMoveChannels'
#   → 说明 dist 落后于源码是本次之前就存在的问题
```

**因此本文件不声明「构建通过」「全量通过」「端到端通过」。**

### 8.4 引擎测试目录整体回归（用于确认没有引入回归）

```bash
npx vitest run src/engine/__tests__        # exit 1
# → Test Files  75 failed | 50 passed (125)
# → Tests  457 passed | 1 skipped (458)     ← 测试级失败 0
# 75 个失败文件全部是**加载期**失败（`@nx9/shared` alias 指向破损 barrel →
#   Failed to resolve import "./data/emotion-presets" 等 8 个不存在的模块），
#   属既有缺陷；本次新增的 beat-grid.test.ts 在该批次中通过（50 项）。
# 对照上文既有工作记录（122 文件时 47 passed | 75 failed / 329 tests passed），
# **失败文件数稳定在 75**，通过文件与用例数只增不减。

---

## 9. 相关文件

| 文件 | 状态 | 作用 |
| --- | --- | --- |
| `packages/shared/src/utils/beat-grid-plan.ts` | 新增 | 节拍 → 分段边界 / 时间轴吸附 / 多格时长（纯函数） |
| `packages/shared/src/index.ts` | 追加 17 行 | 导出上述符号（既有 import 一字未改，diff 为 0 删除） |
| `apps/web/src/engine/beat-grid.ts` | 新增 | `analyzeAudioBeats` + 缓存 / 并发去重 / 超时 + 4 个纯函数 |
| `apps/web/src/engine/__tests__/beat-grid.test.ts` | 新增 | 50 项引擎与纯函数回归 |
| `apps/web/src/engine/stage-deck/chrome/attached-workspace/generation/CameraMoveTimelineEditor.tsx` | 追加 | 「从 BGM 分析节拍 / 对齐到真实节拍」+ 真实刻度线 |
| `apps/web/src/engine/stage-deck/chrome/attached-workspace/tool/MultiGridWorkspace.tsx` | 追加 | 「按 BGM 节拍分配各格时长」+ 逐格时长展示 |
| `apps/web/src/engine/stage-deck/chrome/attached-workspace/generation/{picture,video}/*Workspace.tsx` | 追加 | 把上游音频作为 BGM 候选传给编辑器 |
| `apps/web/src/blocks/craft/__tests__/CameraMoveTimelineEditor.test.tsx` | 追加 | barrel mock 增补 1 行 + 5 项真实节拍回归 |
| `apps/web/tsconfig.beat-grid-check.json` | 新增 | 隔离类型检查配置（同 `tsconfig.movetl-check.json` 口径） |

相关文档：`docs/NX9-CAMERA-MOVE-TIMELINE.md`（运镜时间轴编排）、`docs/NX9-MULTI-GRID-DEDUCTION.md`（多格推演）。
