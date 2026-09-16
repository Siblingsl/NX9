# NX9 角色设定表 / 三视图（character-sheet-desk）

> 画布节点「角色设定表」：把一份角色设定（名称 / 外观 / 服装 / 画风 / 参考图）按四种版面组装成「逐格提示词 → 逐格出图 → 拼成设定表 → 登记为角色参考图」的闭环。
> 本文只描述 NX9 自身能力与实现边界，不引用任何外部产品。

## 1. 能力范围

给定一份**角色设定**（来自素材库角色档案，或节点上的文字设定）与（可选的）**角色参考图**，节点会：

1. 按所选版面生成**生成计划**（`CharacterSheetPlan`）：逐格的中英提示词、该格的视角 / 表情 / 动作标签、负面提示词，以及**一段逐格复述的一致性锁定短语**；
2. **批量出图**：逐格调用图像同源运行器（参考图作为图生图基准，一致性档位决定图生图强度），获得每格图 URL；
3. **回写结果**：产出与既有宫格数据结构 `GridReversePromptsResult` 兼容的 `gridCells` / `splitUrls`，供下游 `grid-compose`（拼合）与 `clip-gen`（视频生成）直接消费；
4. **拼成设定表**：把逐格设定图按当前版面拼成一张设定表母图（复用服务端 `/api/grid/compose`；缺图格用参考图占位并如实播报占位数量）；
5. **登记为角色参考图**：把设定表母图（或三视图正面格）写入素材库角色的参考图字段，并把本次一致性锁定短语写入该角色的一致性描述，供后续所有出图 / 出视频注入；
6. **逐格重试 / 续查未完成格**：失败格可单独重跑（成功格保留），刷新 / 重挂后仍能把后台异步任务的图取回，进度（完成 / 总数 / 失败 / 后台）面板可见；
7. **口径告警而非编造**：角色名、外观、服装、参考图任一项缺失时，计划里给出逐条中文告警；不虚构角色设定。

## 2. 四种版面语义

| 版面 | `kind` 取值 | 几何 | 语义 |
| --- | --- | --- | --- |
| 三视图 | `turnaround` | 1×4 | 正面 / 3-4 侧 / 侧面 / 背面 |
| 表情表 | `expression` | 2×5 | 既有角色设定表情预设（10 项，按预设次序） |
| 动作表 | `pose` | 1×5 | 既有角色设定动作预设（5 项，按预设次序） |
| 全套设定表 | `full` | 4×5 | 三视图 4 + 表情 10 + 动作 5 = 19 格 |

### 三视图：四视角，只改视角

- 角度**取自既有角度预设**（`packages/shared/src/data/anime-tag-presets.ts` 的 `ANGLE_PRESETS`，id 为 `front` / `three-quarter` / `side` / `back`），标签与英文措辞直接来自预设，本节点不新增词汇表；
- 格标签形如 **「三视图 · 正面」**（`role`），并分别落在 `angleId` / `angleLabel`；
- 每格写明：保持同一角色、同一服装、同一光照与同一素色背景，**本格只把视角转到该角度**；全身入画，身高与头身比例与相邻视角一致，便于逐视角对照。

### 表情表 / 动作表：只改表情 / 只改动作

- 表情取自既有 `CHARACTER_EXPRESSION_PRESETS`（平静 / 微笑 / 咧嘴笑 / 大笑 / 坚定 / 失望 / 难过 / 生气 / 愤怒 / 打哈欠），落 `expressionId` / `expressionLabel`；
- 动作取自既有 `CHARACTER_SHEET_POSE_PRESETS`（站立 / 战斗 / 奔跑 / 坐下 / 跳跃），落 `poseId` / `poseLabel`；
- 表情表格为「胸部以上景别、正面平视」；动作表格为「全身入画」；两者都写明「保持角色外观与服装不变，只改面部表情 / 整体动作」。

### 全套设定表：整套版面，行列自算

- 全部格按 **三视图 → 表情 → 动作** 顺序行优先铺入版面，行列自算为 4×5（19 格占前 19 个格位，末行 4 格）；
- 行列可由用户在面板覆盖，但**必须容得下全部格**，否则回落默认几何并写入告警（不丢格、不抛异常）。

### 一致性锁定（换角度不换人）

- 角色设定被压成一段 **一致性锁定短语**：既有 `buildCharacterConsistencyPrompt`（Character Bible 六层 + 角色档案 + 固定美术方向）为基底，再叠加本节点特有的 `locked wardrobe` / `locked art style` / `match the reference description` 三层；
- 该短语**逐格原样复述**进每格英文提示词；中文侧复述同一段「一致性锁定摘要」；
- 面板可见中英两份锁定稿，并可展开核对实际发送稿。

**一致性强度档位**（写入 `consistency`，决定图生图强度与措辞强度）：

| 档位 | 图生图强度 | 含义 |
| --- | --- | --- |
| 宽松 `loose` | 0.82 | 允许姿态与表情自然调整，身份 / 发色 / 服装主色不变 |
| 标准 `standard` | 0.72 | 身份、发型、服装与画风逐格一致，仅本格指定的视角 / 表情 / 动作变化 |
| 严格 `strict` | 0.58 | 严格复刻参考图角色设计，外观 / 服装 / 配色不得改动 |

## 3. 数据结构

```ts
type CharacterSheetKind = 'turnaround' | 'expression' | 'pose' | 'full';
type CharacterSheetConsistencyLevel = 'loose' | 'standard' | 'strict';
type CharacterSheetSectionId = 'turnaround' | 'expression' | 'pose';

interface CharacterSheetCell {
  cellIndex: number; row: number; col: number;
  role: string;                                  // 「三视图 · 正面」/「表情 · 平静」/「动作 · 战斗」
  section: CharacterSheetSectionId;
  angleId?: string; angleLabel?: string;         // 三视图
  expressionId?: string; expressionLabel?: string; // 表情表
  poseId?: string; poseLabel?: string;           // 动作表
  imagePromptZh: string; imagePrompt: string;
  negativePrompt?: string;
  reuseSourceImage: boolean;
  promptEdited?: boolean;                        // 面板中改写过（中英同源）
  needsEndFrame: boolean; endFramePromptZh: string; endFramePrompt: string;
}

interface CharacterSheetSubject {
  characterId?: string; name?: string;
  appearanceZh?: string; outfitZh?: string; styleZh?: string; paletteZh?: string;
  occupationZh?: string; personalityZh?: string;
  forbiddenTraits?: string; referenceNoteZh?: string; referenceImageUrl?: string;
  bible?: CharacterBible;                        // 复用既有六层锚点
}

interface CharacterSheetPlan {
  kind: CharacterSheetKind; rows: number; cols: number; aspectRatio: string;
  sourceRef: string;                             // 参考图；无参考图时为空串（不编造）
  cells: CharacterSheetCell[];
  notesZh: string;
  consistencyLock: string;                       // 英文锁定短语（逐格复述）
  consistencySummaryZh: string;                  // 中文锁定摘要（逐格复述 + 面板）
  consistency: CharacterSheetConsistencyLevel;
  consistencyStrength: number;                   // 图生图强度 0–1
  warningsZh: string[];                          // 缺信息 / 覆盖被忽略的告警
}
```

- 位置：`packages/shared/src/types/character-sheet.ts`（契约）、`packages/shared/src/utils/character-sheet-plan.ts`（构造器与转换，纯函数）；
- 构造器：`buildCharacterSheetPlan(kind, options)`、`buildCharacterSheetConsistencyPrompt(subject)`、`buildCharacterSheetConsistencySummaryZh(subject)`、`collectCharacterSheetSubjectWarnings(subject, sourceRef)`、`characterSheetSubjectFromProfile(profile)`；
- 转换器：`characterSheetPlanToGridCells(plan, imageUrls) → GridCellPrompt[]`、`characterSheetPlanToGridResult(plan, imageUrls) → GridReversePromptsResult`（复用既有 `packages/shared/src/types/grid-prompts.ts`，未另造数据结构）；
- 版面目录 / 一致性档位：`CHARACTER_SHEET_KINDS`、`CHARACTER_SHEET_CONSISTENCY_LEVELS`；读取容错 `readCharacterSheetKind` / `readCharacterSheetConsistency`（非法值回落）；
- 全部字段可 JSON 序列化；构造器纯函数、无副作用、可重复调用结果一致、**任何输入都不抛异常**。

> 命名说明：`buildCharacterConsistencyPrompt` 这一名字已被既有导出占用（`packages/shared/src/utils/character-sheet-prompt.ts`）。为不改动既有导出与行为，本节点的一致性构造器取名为 `buildCharacterSheetConsistencyPrompt`，并在内部**复用**既有函数作为基底。

## 4. 节点数据契约（运行时）

| 字段 | 含义 |
| --- | --- |
| `characterSheetKind` | 当前版面 |
| `characterSheetSubject` | 角色设定（来自素材库角色或面板写入） |
| `characterSheetReferenceImage` / `characterSheetRef` | 参考图（角色参考图 / 节点钉住的参考图） |
| `characterSheetRows` / `characterSheetCols` | 版面行列覆盖 |
| `consistency` / `aspectRatio` / `styleNote` / `negativePrompt` / `quality` / `model` | 一致性档位、单格宽高比、画风补充、追加负面、清晰度、模型 |
| `characterSheetPlan` / `characterSheetCells` | 计划（含用户在面板中的改写） |
| `gridCells` | `GridCellPrompt[]`（与宫格反推同构，含 `videoPrompt` / `videoPromptZh`） |
| `gridReverseResult` | `GridReversePromptsResult`（`ok` 反映是否真的拿到图，不假绿） |
| `splitUrls` / `pictures` / `previewUrls` / `previewUrl` / `imageCount` | 逐格图（画布摘要与下游共用） |
| `content` / `output` | 逐格**画像提示词**（中文 / 英文；角色设定表的产出语义） |
| `batchProgress` / `effectiveModel` / `modelFallbackNote` / `lastResult` / `message` | 出图进度、实际所用模型、降级说明、本轮汇总（含失败格与口径告警） |
| `characterSheetPendingTasks` | 后台异步任务清单（`taskId` + `cellIndex`），刷新 / 重挂后续查依据；同时写通用键 `pendingImageTasks` / `pendingImageTaskId` 供图像续查链使用 |
| `characterSheetUrl` / `characterSheetSignature` / `characterSheetAt` | 设定表母图、过期签名（结构 / 参考图 / 锁定短语 / 逐格图变更即失效）、生成时间 |
| `characterSheetReference` | 最近一次「登记为角色参考图」的记录（角色 id / 名称 / 图 / 锁定短语 / 签名 / 时间） |

## 5. UI 入口

- **节点**：`kind = 'character-sheet-desk'`，目录 `packages/shared/src/catalog/block-catalog.ts`（生成分组，`nx9Native`，Dock 可见），前端渲染 `apps/web/src/blocks/core/CharacterSheetBlock.tsx`；
- **端口**：左「图像 / 文本」入，右「图像 / 文本」出（`catalog/socket-registry.ts`）；
- **底部跟随工作区**：`AttachedWorkspaceRouter` → `tool/CharacterSheetWorkspace.tsx`（`workspaceType: 'tool'`，`attachToNode: true`，`compactCanvas: true`）；
- **运行文案**：`resolveRunLabel('character-sheet-desk')` → 「批量出设定图」/「出设定图中…」（`utils/run-labels.ts`）；
- 面板内容：版面芯片 → 一致性档位芯片 → 参考图预览 + **角色下拉（素材库角色）** + 模型选择 → 进度与闭环动作条 → 参数区（行列 / 单格宽高比 / 画风补充 / 追加负面 / 中英一致性锁定稿 / 告警清单）→ 逐格结果（缩略图 + 状态 + **可编辑中文提示词** + 「重试」/「清空」）→ 设定表母图预览；
- 闭环动作条：`完成 x/N · 失败 y · 后台待续查 z` + 「重试未完成格（n）」+「续查未完成格（n）」+「拼成设定表」+「登记为角色参考图」+「下载设定表」；
- 逐格中文提示词一旦被改写，该格出图按改写文本发送（中英同源），并标注「已改」，可展开查看原始发送稿；「恢复默认提示词」可一键回到按参数生成的版面。

> **`kind` 取值说明（重要）**：本节点的 kind 是 `character-sheet-desk`，**不是** `character-sheet`。
> `character-sheet` 在 NX9 中是**历史废弃 kind**：`catalog/migrate-block-kinds.ts` 把它迁移为 `asset-import`，且 `stage-deck-node-types.tsx` 对废弃 kind 只渲染空壳（隐藏端口）。沿用旧名会导致节点一加载就被改写、画布上只剩空卡。
> 既有 `character-sheet` 的废弃映射与迁移补丁**保持不变**（既有行为不改）。

## 6. 与素材库角色的关系

### 读取（角色 → 设定表）

面板顶部「角色」下拉列出素材库角色（不含回收站）。选中后：

- `characterSheetSubjectFromProfile(profile)` 把既有 `CharacterProfile` / `CharacterBible` 映射为 `CharacterSheetSubject`：
  - 外观 ← `bible.appearance` + `descriptionZh` + `creative.appearanceDetails`（肤色 / 发色 / 瞳色 / 特殊标记 / 纹身 / 疤痕 / 配饰）+ `creative.bodyType`；
  - 服装 ← `creative.costumeLabel` + `creative.costumePrompt`；画风 ← `creative.styleKeywords`；
  - 职业 / 性格 ← `creative.occupation` / `creative.personalityText`，回落 `bible.identity` / `bible.personality`；
  - 参考图 ← `referenceImageUrl` → `creative.fullSheetUrl` → `creative.frontViewUrl` → `creative.referenceUrls[0]`；
- 该角色的参考图同时被钉为本节点的图生图基准（`characterSheetReferenceImage`）。

### 写入（设定表 → 角色）

点「登记为角色参考图」后，写入**同一个素材库角色**（其余字段原样保留）：

| 字段 | 写入内容 |
| --- | --- |
| `referenceImageUrl` | 设定表母图（未拼合时退三视图正面格，再退首个已出图格） |
| `consistencyPrompt` | 本次逐格复述的一致性锁定短语（英文，既有字段语义即「注入到生图 / 生视频 prompt 的一致性描述」） |
| `creative.fullSheetUrl` | 设定表母图（既有「角色完整设定板（ID LOCK 母图）」字段） |
| `creative.frontViewUrl` | 三视图正面格（既有字段，仅在存在该格图时写） |

**无角色上下文时明确提示，不静默、不新建角色**：上游节点挂着角色 AssetRef 但本节点未选用时，提示「请先在顶部角色里选中该角色再登记」；完全没有角色上下文时提示「请先选择或新建素材库角色」。目标角色已不在素材库时拒绝写入（避免写到别的角色上）。

## 7. 与下游的关系

- **`grid-compose`（宫格拼合）**：`splitUrls` 即逐格设定图，可直接拼接；
- **`clip-gen`（视频生成）**：`gatherUpstream` 把逐格图（`splitUrls`）与逐格**角色提示词**（`gridCells[].imagePromptZh`）交给下游；若只回写了 `previewUrl`，也按单图交下游（不丢图）；
- 本节点**不把参考图额外塞进 `pictures`**：下游拿到的图片就是产出图，构图语义与既有节点一致；
- 每格另带立绘微动视频提示词（`videoPrompt` / `videoPromptZh`，`CHARACTER_SHEET_CLIP_SEC = 3` 秒），供下游单镜视频直接使用；
- 出图与 `picture-gen` 同源：同一运行器、同一模型解析（fal 端点不支持参考图时降级并给出 `modelFallbackNote`）与同一参考图限额规则；运行走既有 `runCascadeFromBlock` 级联。

## 8. 生产闭环（逐格状态 / 重试 / 续查 / 拼合 / 登记）

### 8.1 逐格状态与进度

逐格状态由 `apps/web/src/engine/character-sheet-closure.ts` 的 `readCharacterSheetCellRunStates` 推导，优先级：**成功 > 后台待续查 > 出图中 > 失败 > 待跑**；进度汇总复用多格推演的 `summarizeMultiGridProgress`。

### 8.2 逐格重试（成功格保留）

`runCharacterSheetCellRetry` 只重跑「失败 / 后台 / 待跑」的格；已出图的格**绝不重打**。重试复用首轮的模型解析、单格尺寸与一致性强度口径，不另立第二条出图链。

### 8.3 刷新 / 重挂后续查未完成格

异步图片任务的 `taskId` 一拿到就落盘（`characterSheetPendingTasks` + 通用 `pendingImageTasks`），续查复用既有 `resumePendingImageTasks`，按 `taskId → 格号` 把取回的图补进结果数组；仍在后台的继续登记，成功格不受影响。

### 8.4 拼成设定表

按当前版面调用服务端宫格拼合（`/api/grid/compose`），逐格图按序铺格；**缺图格用参考图占位**并播报占位数量（不假绿）。产出母图写入 `characterSheetUrl`，同时用 `buildCharacterSheetSignature(plan, cellUrls)` 记录签名；逐格结果或锁定短语变化后，面板提示「设定表与最新逐格结果不一致」。

### 8.5 登记为角色参考图

见第 6 节；登记前用 `askConfirm` 明确告知将替换原参考图（若有），登记后在面板显示已登记角色与最近一次记录。

### 8.6 新增文件与节点字段

新增：

- `packages/shared/src/types/character-sheet.ts`
- `packages/shared/src/utils/character-sheet-plan.ts`
- `packages/shared/tsconfig.character-sheet-check.json`
- `apps/web/src/blocks/core/CharacterSheetBlock.tsx`
- `apps/web/src/engine/character-sheet-closure.ts`
- `apps/web/src/engine/flow-runner-ops/character-sheet-ops.ts`
- `apps/web/src/engine/stage-deck/chrome/attached-workspace/tool/CharacterSheetWorkspace.tsx`
- `apps/web/tsconfig.character-sheet-check.json`
- `apps/web/src/engine/__tests__/character-sheet-plan.test.ts`、`character-sheet-block-map.test.ts`、`character-sheet-closure.test.ts`

改动（均为**追加**，未删改既有导出与行为）：`packages/shared/src/index.ts`（追加 32 个导出名）、`catalog/block-catalog.ts`、`catalog/socket-registry.ts`、`catalog/node-interaction.ts`、`catalog/attached-workspace.ts`、`utils/run-labels.ts`、`engine/flow-graph.ts`（追加 `character-sheet-desk` 下游分支）、`apps/web/src/blocks/registry.tsx`、`apps/web/src/engine/flow-runner.ts`、`.../attached-workspace/AttachedWorkspaceRouter.tsx`。

## 9. 已实现 / 未实现边界

已实现：

- 四种版面计划组装（4 / 10 / 5 / 19 格），角度 / 表情 / 动作全部取自既有预设，未新增词汇表；
- 一致性锁定短语（中英各一份）逐格复述 + 三档一致性强度（决定图生图强度与措辞）；
- 逐格批量出图（参考图作图生图基准、逐格进度、部分失败保留并如实上报、一图未出直接报错）。**无参考图时不阻止出图**：按纯文字设定表走文生图并给出计划告警；但若所选模型是「仅支持图生图」的 fal 端点，逐格请求会返回明确错误（`当前模型仅支持图生图：请添加参考图，或改用文生图模型`），面板按失败格如实展示，不会静默降级；
- `GridCellPrompt` / `GridReversePromptsResult` 兼容回写；下游 `grid-compose` / `clip-gen` 消费；
- AbortSignal 停止；参数与改写计划的优先级规则（版面 / 参考图 / 角色标签一致才采用改写稿）；
- 逐格状态与进度、逐格重试（成功格不重打）、后台任务落盘与续查；
- 设定表拼合（缺图格占位 + 占位数量播报）、下载、过期签名；
- **登记为角色参考图**（写 `referenceImageUrl` / `consistencyPrompt` / `creative.fullSheetUrl` / `creative.frontViewUrl`），无角色上下文明确提示、目标角色缺失拒绝写入；
- 角色信息缺失时的逐条告警（角色名 / 外观 / 服装 / 参考图）。

未实现 / 边界：

- 逐格出图为**串行**（与图像生成节点同口径），19 格整套设定表耗时较长；本轮未引入并发（并发属既有图像链路的独立课题）；
- 「登记为角色参考图」**不会新建角色**，也不会改动 `bible` / `creative` 的其它字段；需要新角色请先在素材库创建；
- 续查只能覆盖**已落盘 taskId** 的任务：未保存工作区就关闭页面时，未落盘的任务无法找回（与图像节点同边界）；
- 设定表拼合依赖**服务端在线**（sharp + `/api/grid/compose`）；服务端不可用时如实报错，不做客户端替代实现；
- 拼合占位格用的是参考图，面板会如实播报占位数量，但**不承诺**占位格与真实结果视觉一致；
- 不做**逐格**入库（素材库场景 / 道具条目）与接触表式导出：设定表的入库语义是「登记为该角色的参考图」，逐格入库属多格推演 / 图像工作区的既有能力，本节点未重复实现；
- 未接入 LLM 反推参考图内容：角色设定以素材库档案 + 用户文字为准，不做图像反推；
- `full` 版面为 19 格固定组成（4 + 10 + 5），不做表情 / 动作的逐项勾选子集；
- 真实出图 / 素材库写入需 API 凭据与服务端在线，**本环境未做端到端验证**（见第 10 节）。

## 10. 验证口径（重要）

本仓库 `packages/shared/src/index.ts` 目前引用了 8 个不存在的模块（`emotion-presets` / `shot-move-families` / `creative-asset-presets` / `character-face-rig-presets` / `playbook-definitions` / `camera-presets` / `shot-lexicon-taxonomy` / `provider-registry`），属**既有缺陷**（这 8 个模块在 HEAD 中同样不存在，且 `index.ts` 对它们的 import 在 HEAD 中已经存在）：`pnpm --filter @nx9/shared build`、`pnpm --filter @nx9/web typecheck` 与走 barrel 的测试均无法运行。

因此本次交付的验证为**隔离验证**（下述均为真实执行过的命令与结果）：

1. `tsc -p packages/shared/tsconfig.character-sheet-check.json` → **exit 0**（新增契约 / 构造器单独类型检查）；
2. `tsc -p apps/web/tsconfig.character-sheet-check.json` → exit 2，共 58 行诊断**全部落在既有缺陷文件**（`packages/shared/src/index.ts` 及其缺失模块的下游、`workspace-document.ts` 的 `PlaybookId` 等），**本次新增 / 改动的 10 个文件 0 诊断**。该配置与既有 `apps/web/tsconfig.movetl-check.json` 同口径（同样映射真实 barrel、同样带既有噪声），已用反向对照验证覆盖有效：向 `CharacterSheetWorkspace.tsx` / `CharacterSheetBlock.tsx` 注入类型错误后，两个文件均被该配置报出，回滚后恢复 0 诊断；
3. 单测以**相对路径直取源码**，与 barrel 缺陷解耦，三个文件 **56 例全通过（exit 0）**：
   - `apps/web/src/engine/__tests__/character-sheet-plan.test.ts`（29 例：四种版面格数与标签、预设取自既有数据源、一致性短语逐格复述、档位与强度、告警、行列自算与覆盖、读取容错、GridCellPrompt 兼容、纯函数与序列化、素材库角色映射）；
   - `apps/web/src/engine/__tests__/character-sheet-closure.test.ts`（14 例：逐格 URL / 待续查 / 失败账单读取、逐格状态机优先级、回写结构与字段语义、版面签名失效）；
   - `apps/web/src/engine/__tests__/character-sheet-block-map.test.ts`（13 例：目录 / socket / 交互 / 工作区 / 运行文案 / `gatherUpstream`，并断言本 kind **不是**废弃 kind 且既有 `character-sheet` 的废弃映射保持不变）。

**未验证**（不谎报）：

- 完整 `pnpm run build`、`pnpm --filter @nx9/web typecheck`、全量 `vitest`、浏览器端到端 —— 共享包 barrel 修复前均无法运行（全量 `vitest run src/engine/__tests__` 当前为 75 个测试文件因 `Cannot find module './data/emotion-presets'` 加载失败，均属该既有缺陷；本次新增的 3 个测试文件不在其中）；
- **真实出图 / 拼合 / 素材库写入端到端**：需要 API 凭据与服务端（sharp）在线，本环境不具备，未做端到端验证；
- 隔离 `tsconfig` 未覆盖到的部分：以 `@nx9/shared` 缺失模块类型（如 `PlaybookId`、`FACE_RIG_PARAMS`）为参数的调用点在隔离环境下退化为 `any`，因此**不构成**对这些调用点的类型保证。
