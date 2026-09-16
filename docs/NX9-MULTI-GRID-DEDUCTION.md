# NX9 多格推演（multi-grid）

> 画布节点「多格推演」：把一张上游关键帧 / 图片，按三种语义自动组装成「逐格提示词 → 逐格出图 → 逐格送入视频生成」的闭环。
> 本文只描述 NX9 自身能力与实现边界，不引用任何外部产品。

## 1. 能力范围

给定上游**任意一张关键帧 / 图片**（`picture-gen` 出图、素材导入、画布钉板、分镜关键帧均可），节点会：

1. 按所选模式生成**生成计划**（`MultiGridPlan`）：逐格的中英提示词、机位标签、机位坐标建议、负面提示词；
2. **批量出图**：逐格调用图像同源运行器（源图作为参考图，保持主体一致），获得每格图 URL；
3. **回写结果**：产出与既有宫格数据结构 `GridReversePromptsResult` 兼容的 `gridCells` / `splitUrls`，供下游 `clip-gen`（视频生成）与 `grid-compose`（宫格拼接）直接消费；
4. **逐格送入视频生成**：选中某一格后，该格的视频提示词与该格图成为下游 `clip-gen` 的单镜输入（该图排为下游首帧）；
5. **逐格重试 / 续查未完成格**：失败格可单独重跑（成功格保留），刷新 / 重挂后仍能把后台异步任务的图取回，进度（完成 / 总数 / 失败 / 后台）面板可见；
6. **结果写回分镜镜表**：逐格或整组把该格图写成上游镜表对应镜头的首帧（复用既有写回契约）；
7. **结果入库 / 回收站 + 接触表导出**：逐格结果可登记进素材库、可软删进回收站；N 格结果可一键拼成一张接触表并导出 / 入库。

## 2. 三种语义（四种模式）

| 模式 | kind 取值 | 几何 | 语义 |
| --- | --- | --- | --- |
| 多机位 9 宫格 | `multi-cam-9` | 3×3 | 方位（左前 45° / 正前 0° / 右前 45°）× 景别（近景 / 中景 / 全景） |
| 多机位 25 宫格 | `multi-cam-25` | 5×5 | 方位（左侧 90° … 右侧 90°）× 景别（特写 / 近景 / 中景 / 全景 / 大远景） |
| 剧情推演四宫格 | `story-predict-4` | 2×2 | 起因确立 → 冲突升级 → 转折 → 收束 · 钩子 |
| 画面推演 | `frame-predict` | 1×3 | N 秒前（默认 5）/ 当前（源图）/ M 秒后（默认 3） |

### 多机位：每格都带真实机位信息

- 格标签形如 **「左前 45° · 中景」**（`role`），并分别落在 `cameraAngleLabel` / `shotSizeLabel`；
- 按景别给出**建议机位坐标**（`cameraPositionHint`，如 `相对主体建议机位 x=-2.83 / y=1.6 / z=2.83（米，+z 为主体正前，+x 为画面右侧）`）、建议机位高度（`cameraHeightM`）与等效焦距（`focalLengthMm`）；
- 焦距按用户给定**焦段区间**（`focalRange`，默认 18–100mm）线性换算，并据 `f = 36mm 全画幅` 实时算出水平视角写入提示词；
- 每格**复述同一套主体一致性措辞**（同一角色外貌 / 同一服装 / 同一场景陈设 / 同一光线与色调，只改机位与景别），避免逐格漂移；
- 计划说明 `notesZh` 明确声明：**坐标、高度、焦距是按景别给出的建议值，不是对源图的测量结果**。

### 剧情推演：节拍可编辑，中英不脱节

- 四格节拍内置为「起因确立 / 冲突升级 / 转折 / 收束 · 钩子」，`beats` 可逐条覆盖（字符串或 `{ zh, en }`）；
- `direction`（剧情方向）写入每格节拍说明；为空时自动采用节点文本或上游文本，让上游剧本驱动节拍；
- 只给中文节拍时，英文稿保留内置节拍并附 `story beat (Chinese, keep the meaning): …`，不臆造翻译。

### 画面推演：前后格互为收尾帧

- 三格时间偏移分别为 `-beforeSec` / `0` / `+afterSec`；
- **当前格 `reuseSourceImage = true`：直接复用源图，不重复出图**；
- 前格 `needsEndFrame = true`，尾帧指向「当前」；当前格 `needsEndFrame = true`，尾帧指向「M 秒后」——可直接用于首尾帧视频生成；后格开放式，不再设尾帧。

## 3. 数据结构

```ts
type MultiGridMode = 'multi-cam-9' | 'multi-cam-25' | 'story-predict-4' | 'frame-predict';

interface MultiGridCell {
  cellIndex: number; row: number; col: number;
  role: string;                       // 「左前 45° · 中景」/「转折」/「3 秒后」
  imagePromptZh: string; imagePrompt: string;
  negativePrompt?: string;
  cameraAngleLabel?: string; shotSizeLabel?: string;
  timeOffsetSec?: number;             // 画面推演
  cameraPositionHint?: string; focalLengthMm?: number; cameraHeightM?: number;
  reuseSourceImage?: boolean;         // 画面推演「当前」格
  promptEdited?: boolean;             // 面板中改写过（中英同源）
  needsEndFrame: boolean; endFramePromptZh: string; endFramePrompt: string;
}

interface MultiGridPlan {
  mode: MultiGridMode; rows: number; cols: number;
  aspectRatio: string; sourceUrl: string;
  cells: MultiGridCell[]; notesZh: string;
}
```

- 位置：`packages/shared/src/types/multi-grid.ts`（契约）、`packages/shared/src/utils/multi-grid-plan.ts`（构造器与转换，纯函数）；
- 转换器：`planCellsToGridCellPrompts(plan, imageUrls) → GridCellPrompt[]`、`planToGridReverseResult(plan, imageUrls) → GridReversePromptsResult`（复用既有 `packages/shared/src/types/grid-prompts.ts`，未另造数据结构）；
- 全部字段可 JSON 序列化；构造器纯函数、无副作用、可重复调用结果一致。

## 4. 节点数据契约（运行时）

| 字段 | 含义 |
| --- | --- |
| `multiGridMode` | 当前模式 |
| `multiGridPlan` / `multiGridCells` | 计划（含用户在面板中的改写） |
| `gridCells` | `GridCellPrompt[]`（与宫格反推同构，含 `videoPrompt` / `videoPromptZh` / 尾帧字段） |
| `gridReverseResult` | `GridReversePromptsResult`（`ok` 反映是否真的拿到图，不假绿） |
| `splitUrls` / `pictures` / `previewUrls` / `previewUrl` | 逐格图（画布摘要与下游共用） |
| `content` / `output` | 逐格中文 / 英文视频提示词（供下游 `clip-gen` 文本入） |
| `sendToVideoIndex` | 「送入视频生成」选中的格 |
| `batchProgress` / `effectiveModel` / `lastResult` | 出图进度、实际所用模型、本轮汇总（含失败格） |
| `multiGridPendingTasks` | 后台异步任务清单（`taskId` + `cellIndex`），刷新 / 重挂后续查依据 |
| `multiGridShotTargets` | 逐格「写入分镜」的目标镜头覆盖（`{ [格号]: shotId }`） |
| `contactSheetUrl` / `contactSheetSignature` / `contactSheetAt` | 接触表产物、过期签名、生成时间 |

## 5. UI 入口

- **节点**：`kind = 'multi-grid'`，目录 `packages/shared/src/catalog/block-catalog.ts`（生成分组，Dock 可见），前端渲染 `apps/web/src/blocks/core/MultiGridBlock.tsx`；
- **端口**：左「图像 / 文本」入，右「图像 / 文本」出（`socket-registry.ts`）；
- **底部跟随工作区**：`AttachedWorkspaceRouter` → `tool/MultiGridWorkspace.tsx`（`workspaceType: 'tool'`，`compactCanvas: true`）；
- 面板内容：模式芯片 → 源图预览与模型选择 → 参数（宫格规格 / 焦段 / 时间偏移 / 剧情方向 / 宽高比 / 参考强度 / 追加负面提示词）→ 逐格计划（缩略图 + **可编辑中文提示词** + 机位坐标建议 + 「送入视频生成」）→ 批量出图 / 停止；
- 逐格中文提示词一旦被改写，该格出图按改写文本发送（中英同源），并标注「已改」，可展开查看原始发送稿；「恢复默认提示词」可一键回到按参数生成的计划；
- 源图行下方是**进度与闭环动作条**：`完成 x/N · 失败 y · 后台待续查 z` + 「重试未完成格（n）」+「续查未完成格（n）」+「整组写入分镜」；
- 每格卡片：右上角状态（待跑 / 出图中 / 成功 / 失败 / 后台待续查）、失败原因、「送入视频生成」、**「重试」**、**「入库」**、**回收站**，以及「目标镜头下拉 + 写入分镜」；
- 面板底部是**接触表**区：一键导出 / 重出、下载、入库、回收站，并预览（逐格图变更后标记「已过期」）。

## 6. 与下游的关系

- **`clip-gen`（视频生成）**：默认把逐格图与逐格视频提示词全量交给下游（批出）；一旦在某格点「送入视频生成」，上游契约切为该单镜——只交该格提示词，并把该格图排到 `pictures[0]`，下游据此定首帧；
- **`grid-compose`（宫格拼接）**：`splitUrls` 即逐格图，可直接拼接成接触表；
- 出图与 `picture-gen` 同源（同一运行器、同一模型解析与参考图限额规则），与 `clip-gen` 共用 `runCascadeFromBlock` 级联运行。

## 7. 生产闭环（逐格重试 / 续查 / 回写 / 入库 / 接触表）

上一版只到「批量出图 + 送入视频生成」；本节补齐开箱可用所需的闭环能力，全部复用既有机制。

### 7.1 逐格状态与进度

- **单一来源**：格状态从节点 data 推导（`multiGridCells` / `gridCells` / `lastResult.failures` / `multiGridPendingTasks`），**不另存一份状态**，避免与结果漂移；
- 状态取值：`idle` 待跑 · `running` 出图中 · `success` 成功 · `failed` 失败 · `remote` 后台待续查；
- 判定优先级：**有图 = 成功** > 该格有后台任务 = 后台待续查 > 本轮在跑 = 出图中 > 在失败账单 = 失败 > 待跑；
- 面板显示 `完成 x/N · 失败 y · 后台待续查 z`，每格右上角标状态，失败格直接显示原因；
- 读取/汇总在 `apps/web/src/engine/multi-grid-closure.ts`：`readMultiGridCellRunStates` / `summarizeMultiGridProgress`。

### 7.2 逐格重试（成功格保留）

- 入口：每格「重试」按钮；顶部「重试未完成格」= 一次跑完所有非成功格；
- `selectMultiGridRetryIndexes` **一律剔除已成功格**，只重跑失败 / 后台待续查 / 待跑格；
- 执行器 `runMultiGridCellRetry`（`apps/web/src/engine/flow-runner-ops/multi-grid-ops.ts`）复用首轮的模型解析（fal 文生图端点 → 回落 Gemini 保持主体一致）、出图尺寸、参考强度与源图口径，**不另立一条出图链**；
- 本轮参与重试的格由本轮结果重新定论；未参与的旧失败账单原样保留；与既有「导演批次幂等续跑」（只重试未成功项）同口径；
- 重试写入与首轮批量出图**完全同构**（`gridCells` / `gridReverseResult` / `splitUrls` / `lastResult` / `batchProgress`），下游契约不变。

### 7.3 刷新 / 重挂后续查未完成格

- 出图时**taskId 一拿到就落盘**（`runPictureGenJob` 的 `onMeta`，与图像节点 PG-28 同口径），写入节点 data：
  `multiGridPendingTasks: { taskId, cellIndex, prompt? }[]`，同时兼容写 `pendingImageTasks` / `pendingImageTaskId`；
- `PendingImageTask` **追加可选字段 `cellIndex`**（既有字段与行为不动），因此续查可直接复用 `resumePendingImageTasks`；
- `resumePendingImageTasks` 只回传成功 URL（不带 taskId），`pairResumedTaskUrls` 按「未落入 stillPending / failed 的任务」还原成功任务次序 → 格号，再补齐到结果数组（既有格图不被覆盖）；
- 面板「续查未完成格（n）」按钮 + 顶部计数；仍在后台的继续留存，失败的如实报错；
- **一图未出但仍有后台任务时停在 `running` 并提示可续查**（不再直接抛错）——这是本轮为异步图片任务新增的分支；一图未出且无后台任务时仍按原口径抛错（禁止空成功）；
- 重新「批量出图」不会丢弃上一轮遗留的后台任务（只丢弃本批已出图那几格的遗留任务），避免用户后台图 URL 丢失。

### 7.4 结果写入分镜镜表

- 每格「写入分镜」+ 顶部「整组写入分镜」，全部走既有 `writePictureShotPatch`，patch 与图像工作区**逐字一致**：
  `{ firstFrameAssetId: <该格图>, keyframeStatus: 'review', status: 'review' }` —— **未改动既有镜表写入契约**；
- 目标镜头解析（`buildMultiGridWriteBackPlan`）：
  - 逐格写入：用户在该格下拉指定的镜头 → 同序号镜头 → 第 1 镜；
  - 整组写入：按「格序 ↔ 镜序」一一对应，**镜数不足的格如实跳过并说明原因**（不在同一镜上反复覆盖）；
- **无上游链镜表时给明确提示**（面板 amber 提示 + toastError + 活动日志），不静默失败；
- 指定的镜头已不在上游镜表 → 跳过并说明，**不写错镜**。

### 7.5 结果入库 / 回收站

- 每格「入库」：复用图像工作区的入库口径 —— `upsertBacklotWorkspace` 写入**场景**条目（`creative.coverUrl` 与 `referenceUrls` 均为该格图），label 复用 `uniqueLibraryLabel` 去重；
- 每格垃圾桶：`trashGeneratedMedia`（`mediaKind: 'picture'`，与图像工作区同一条软删链，可在「素材回收站」恢复），并同步把该格从节点结果里摘掉（`dropMultiGridCell`），避免「已进回收站但画面还在」；
- 接触表同样支持入库 / 进回收站。

### 7.6 接触表一键导出

- 复用服务端**宫格拼合**（`api.gridCompose` → `/api/grid/compose`），传入逐格图 + 逐格角色标签（`1. 左前 45° · 中景`）；
- **缺图格用源图占位**：保住「第 N 格 = 第 N 机位 / 第 N 节拍」的对位（服务端会过滤空 URL，若直接丢空会整格错位），占位格数在日志与 toast 中如实播报；
- 版面口径镜像 `apps/server/src/modules/grid/grid.service.ts#composeGrid`（单格 480×300 + 标题 28 + 间隙 10 + 内边距 14）；客户端 `computeContactSheetGridLayout` 只做**尺寸预算与格位计算**，实际拼合仍在服务端；
- 产物命名沿用服务端既有约定 `/media/images/compose-<ts>.jpg`；下载文件名沿用 `<kind>-sheet-<ts>.<ext>` 约定 → `multi-grid-sheet-<ts>.jpg`；
- `contactSheetUrl` + `contactSheetSignature`：逐格图或角色变化后旧接触表标记「已过期」（与分镜故事板大图 `buildDeskContactSheetSignature` 同口径）。

### 7.7 新增文件与节点字段

| 文件 | 作用 |
| --- | --- |
| `apps/web/src/engine/multi-grid-closure.ts` | 生产闭环**纯函数层**：格状态机、重试选择、续查配对/合并、镜表回写落点、接触表版面、结果回写 payload、入库条目 |
| `apps/web/src/engine/__tests__/multi-grid-closure.test.ts` | 上述纯函数的单测（相对路径直取源码） |

| 新增节点字段 | 含义 |
| --- | --- |
| `multiGridPendingTasks` | 后台异步任务清单（`taskId` + `cellIndex`），刷新 / 重挂后续查的依据 |
| `multiGridShotTargets` | 逐格「写入分镜」的目标镜头覆盖（`{ [格号]: shotId }`），模式切换即作废 |
| `contactSheetUrl` / `contactSheetSignature` / `contactSheetAt` | 接触表产物、过期签名、生成时间 |

## 8. 已实现 / 未实现边界

已实现：

- 四种模式计划组装（9 / 25 / 4 / 3 格），机位标签、坐标建议、焦距换算、主体一致性措辞；
- 逐格批量出图（源图作参考、逐格进度、部分失败保留并如实上报、一图未出直接报错）；
- `GridCellPrompt` / `GridReversePromptsResult` 兼容回写；下游 `clip-gen` / `grid-compose` 消费；
- 逐格「送入视频生成」选定首帧与单镜提示词；
- AbortSignal 停止；参数与改写计划的优先级规则（模式 / 源图 / 角色标签一致才采用改写稿）；
- **逐格状态与进度**（待跑 / 出图中 / 成功 / 失败 / 后台待续查）、**逐格重试**（成功格不重打）、**重试全部未完成格**；
- **后台任务落盘与续查**（同一条 `resumePendingImageTasks` 链，按 taskId → 格号补齐）；
- **逐格 / 整组写入上游分镜镜表**（复用 `writePictureShotPatch` 契约，无上游镜表明确提示）；
- **逐格入库为素材库场景条目**、**逐格 / 接触表进资产回收站**（软删可恢复）；
- **接触表一键导出**（复用宫格拼合，缺图格源图占位并如实播报）、下载、入库、回收站、过期标记。

未实现 / 边界：

- 逐格出图为**串行**（与图像生成节点同口径），25 宫格耗时较长；本轮未引入并发（并发属既有图像链路的独立课题）；
- 续查只能覆盖**已落盘 taskId** 的任务：未保存工作区就关闭页面时，未落盘的任务无法找回（与图像节点同边界）；
- 接触表拼合依赖**服务端在线**（sharp + `/api/grid/compose`）；服务端不可用时如实报错，不做客户端替代实现；
- 「入库」按既有口径登记为**场景**条目（与图像工作区一致），不含情绪 / 道具等其它类目的自动判定；
- 接触表占位格用的是源图，面板会如实播报占位数量，但**不承诺**占位格与真实结果视觉一致；
- 不做角度 / 焦段的可视化 3D 预演（机位数值为**建议**，非取自 3D 场景实测）；
- 未接入 LLM 反推源图内容：主体 / 场景在提示词中以「同上关键帧」措辞锁定，如需具体人物与场景名词，请在节点上游提供文本或改写逐格提示词；
- 「剧情推演」的四格节拍为通用四幕结构 + 用户方向，不做剧本级自动分场；
- 真实出图需 API 凭据，**本环境未做端到端出图验证**（见第 9 节）。

## 9. 验证口径（重要）

本仓库 `packages/shared/src/index.ts` 目前引用了 8 个不存在的模块（`emotion-presets` / `shot-move-families` / `creative-asset-presets` / `character-face-rig-presets` / `playbook-definitions` / `camera-presets` / `shot-lexicon-taxonomy` / `provider-registry`），属**既有缺陷**：`pnpm --filter @nx9/shared build`、`pnpm --filter @nx9/web typecheck` 与走 barrel 的测试均无法运行。

因此本次交付的验证为**隔离验证**（下述均为真实执行过的命令与结果）：

1. `packages/shared/tsconfig.multi-grid-check.json` 对新增契约 / 构造器单独 `tsc --noEmit`（exit 0）；
2. `apps/web/tsconfig.multi-grid-check.json` 对生产闭环纯函数层与单测单独 `tsc --noEmit`（exit 0）；
3. 单测以**相对路径直取源码**，与 barrel 缺陷解耦：
   - `apps/web/src/engine/__tests__/multi-grid-closure.test.ts`（33 例：格状态机 / 重试选择 / 续查配对与合并 / 镜表回写落点 / 接触表版面与命名 / 回写 payload / 入库条目）；
   - 既有 `multi-grid-plan.test.ts`（20 例）、`multi-grid-block-map.test.ts`（11 例）同步回归通过。
4. 改动的前端文件（`multi-grid-closure.ts` / `flow-runner-ops/multi-grid-ops.ts` / `tool/MultiGridWorkspace.tsx`）以**临时 tsconfig**（未入库，用 `paths` 把 `@nx9/shared` 指向真实 shared 源码门面）`tsc --noEmit`，**自身 0 诊断**——该门面把多格推演 / 镜表 `StoryboardShot` / 图片模型 / 上游镜头 `resolveUpstreamShotsFromGraph` 等类型都接到真源码，故这些契约是**真类型校验**而非 `any`；程序内其余文件因门面不全会有噪声诊断，已按文件过滤剔除。

**未验证**（不谎报）：

- 完整 `pnpm run build`、`pnpm --filter @nx9/web typecheck`、全量 `vitest`、浏览器端到端——共享包 barrel 修复前均无法运行；
- **真实出图 / 续查 / 入库 / 接触表端到端**：需要 API 凭据与服务端（sharp）在线，本环境不具备，未做端到端验证；
- 隔离 tsconfig 未覆盖到的那部分：凡以 `@nx9/shared` 桶文件类型（如 `WorkspacePayload`）为参数的应用内部类型，在隔离环境下退化为 `any`，因此**不构成**对这些调用点的类型保证。

> 增量补充：镜头层面（把推演结果生成分镜镜头并写回镜表）见 `docs/NX9-MULTI-GRID-TO-STORYBOARD.md`。
