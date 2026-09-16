# NX9 多格推演 → 分镜台（镜头层面写回）

> 本文只描述 NX9 自身能力与实现边界，不引用任何外部产品。
> 上游能力（四种推演模式、逐格出图、逐格状态机、接触表）见 `docs/NX9-MULTI-GRID-DEDUCTION.md`；
> 本文只讲**新增的一层**：把推演出的多机位 / 剧情 / 画面格**直接生成分镜镜头并写回镜表**。

## 1. 能力范围

在多格推演面板上多了一个「生成分镜镜头」区：

1. **预览**：按当前推演计划实时算出「将新增哪几个镜头」——序号、景别、时长、中文描述逐条列出，并显示目标分集、序号区间与全部告警；
2. **确认后写回**：确认后一次性完成
   - ① 分镜台**拆镜结构**（`scriptBreakdown`）插入新镜 → 由既有 `applyDeskBreakdown` 重算链镜表（分镜台里可编辑、可重拆、不丢）；
   - ② 上游 **chainStoryboard**（链镜表）兜底合并：补齐未落链的新镜，并按新镜 id 写入首帧；
   - ③ **全局镜表**镜像 `addShots(shots, 'append')`；
   - ④ 记录**防重键**到本节点 data；
3. **去分镜台查看**：一键定位并打开上游分镜台工作台核对新镜。

三种模式都覆盖：多机位 9 / 25 宫格（每格一镜）、剧情推演四宫格（4 个连续镜头）、画面推演（过去 / 当前 / 未来）。

## 2. 映射规则表

| 模式 | 镜头数 | 顺序 | 单镜时长（秒） | 描述口径 | 运镜（写入既有 `cameraMove`） |
| --- | --- | --- | --- | --- | --- |
| `multi-cam-9` | 9 | 按格序（行优先 = 景别行为主、方位为列） | 默认 3（`MULTI_GRID_SHOT_DEFAULT_DURATION_SEC`） | 机位方位 + 景别 + 建议参数 | `固定`（构造器给的是「微推或固定」，本层取固定） |
| `multi-cam-25` | 25 | 同上 | 默认 3 | 同上 | 同上 |
| `story-predict-4` | 4 | 按格序（起因 → 冲突 → 转折 → 收束） | **递增** 2 / 3 / 4 / 5（`MULTI_GRID_STORY_BEAT_DURATIONS_SEC`） | 节拍名（起因 / 冲突 / 转折 / 收束 · 钩子） | 不写（计划里没有运镜语义，不编造） |
| `frame-predict` | 3 | **按 `timeOffsetSec` 升序**（过去 → 当前 → 未来），乱序计划也会被排好 | `\|timeOffsetSec\|`，当前帧（偏移 0）用 3 | 时间方向（回溯 / 推进 / 当前帧） | `固定`（构造器明确「镜头保持同一机位」） |

时长优先级：`cellDurationsSec[cellIndex]`（逐格）> `defaultDurationSec`（全局）> 模式默认；越界收敛到 `1–120s` 并在告警里如实说明。
UI 里若已用「按 BGM 节拍分配各格时长」（真实节拍），该时长自动作为本批镜头时长。

## 3. 字段映射表（`MultiGridCell` → `StoryboardShot`）

只使用 `StoryboardShot` 既有字段，**不新增任何持久化字段**：

| 目标字段 | 来源 |
| --- | --- |
| `id` | `shot-mgrid-<mode>-<cellIndex>-<hash8>`（同模式 / 源图 / 格 / 提示词必得同一 id；可注入 `idFactory`） |
| `index` | 上游该集末镜序号 + 1 起连续；无上游镜表时从 1 起并告警 |
| `episodeId` / `episodeIndex` / `episodeTitle` | 上游链镜表当前分集（`chain.activeEpisodeId`）或上游末镜所属分集 |
| `shotType` | 由 `shotSizeLabel` 映射（见第 4 节）；该模式没有景别语义时记 `custom` |
| `durationSec` | 见第 2 节 |
| `descriptionZh` | `【<模式名> · 第 i/N 格】` + 机位 / 景别 / 时间方向 + 「与源图同一主体与同一场景」口径 |
| `promptEn` | 该格 `imagePrompt`（用户在面板改写过的稿也照用） |
| `videoPromptEn` | 运镜短语（复用既有 `buildCameraMovePrompt`，`static-locked-off`）+ 时长 + 同一主体 / 场景口径 |
| `firstFrameAssetId` | 该格已出图 → 该图；`reuseSourceImage` 的格 → 源图；都不可得 → `null` |
| `keyframeStatus` / `status` | 有首帧 → `review`（与既有 `buildMultiGridShotPatch` 写回首帧的口径一致）；无首帧 → `draft` |
| `cameraMove` | 见第 2 节（分镜台拆镜结构的运镜是枚举，落到枚举内） |
| `notes` | 推演模式 + 格号 + 格语义 + 时间基准 + **机位建议**（等效焦距 / 机位高度 / 相对坐标）+ 「建议值非实测」声明 |
| `characterIds` / `characterNames` | 空数组（推演计划没有角色语义，不臆测绑定） |

不在本层写入：`lineArtUrl`（分镜线稿归分镜台）、`keyframeProvenance`（其 `role` 是导演彩色关键帧专用字面量）、`director3dGuide`（归导演台 / 3D）。`linkedBlockId` 有意留空：写入 `linkedBlockId` 会让全局 `addShots` 走「同来源整批替换」分支，与「本批防重 + 增量追加」的语义冲突。

## 4. 景别映射表

| `shotSizeLabel`（含中英与常见缩写） | `shotType` | 拆镜结构 `shotSize`（分镜台重算用） |
| --- | --- | --- |
| 特写 / 近景 / close / close-up / CU / ECU / MCU | `close` | `CU` |
| 中景 / medium / MS / OTS | `medium` | `MS` |
| 全景 / 远景 / wide / full shot / long shot / WS / FS | `wide` | `WS` |
| 大远景 / extreme wide / extreme long shot / EWS | `extreme-wide` | `WS`（枚举无 EWS，收敛） |
| 未命中 / 该模式无景别（剧情 / 画面推演） | `custom` | 不写（`shotSize` 留空） |

匹配顺序：先精确匹配（归一化大小写与 `-_/`），再关键词兜底（长词优先，「大远景」不会被「远景」截胡）。未命中会给出中文告警，不静默变 `medium`。

## 5. UI 入口与写回链路

入口：画布「多格推演」节点 → 打开工作区 → 节点主体下方 **「生成分镜镜头」** 面板（在「接触表」之上）。

面板内容：镜数 / 序号区间 / 目标分集 / 是否已写入 · 逐镜清单（`#序号 景别 时长 描述`）· 告警列表 · 两个动作按钮。

写回链路（`handleGenerateShots`）：

1. 前置校验（任一不满足都给出**明确中文提示**，不静默失败、不写到别处）：
   - 无推演计划 / 计划无格 → 提示；
   - 上游链镜表不可得（`useUpstreamShots` 无入边或链为空）→ 复用 `MULTI_GRID_NO_UPSTREAM_REASON`（「上游未连接分镜台镜表（chainStoryboard）…」）；
   - 解析不到上游 `storyboard-desk` 节点 → 提示；
   - 同批已写入（防重键相同）→ 提示「本批镜头已写入过…未重复追加」。
2. 二次防重：剔除链镜表 / 全局镜表里**已存在同 id** 的镜头；若整批都被剔除 → 明确提示不重复写入。
3. `askConfirm` 弹层展示 `describeMultiGridShotPlan` 摘要 + 告警，人工确认。
4. 写回（见第 1 节 ①②③④）。
5. 日志 + Toast 播报「已生成 N 个镜头（序号 a–b，含 M 镜带首帧）」。

防重（两层）：

- **键层**：`mgw-<hash8>`，种子里含模式 / 源图 / 本批 `id:index:shotType:durationSec`，记录在节点 data `multiGridShotWriteback { key, ids, count, deskId, at }`。同一计划 + 同一批镜头 ⇒ 同键 ⇒ 拒绝重复写；改了逐格提示词 / 时长 / 序号 ⇒ 键变化 ⇒ 可作为新一批写回。
- **id 层**：写入前与两个镜表比对同 id；相同 id 的一律不重复追加（即使键被绕过，也不会产生重复镜头）。

## 6. 与图层面回写（multi-grid-closure）的分工

| 层 | 做什么 | 入口 |
| --- | --- | --- |
| **镜头层面（本次新增）** | 新增镜头：序号 / 分集 / 景别 / 时长 / 中英提示词 / 首帧（顺带） | 「生成分镜镜头」 |
| **图层面（既有）** | 覆盖**既有镜头**首帧：逐格或整组把「第 N 格图」写成「第 N 镜首帧」（审阅态） | 逐格「写入分镜」/「整组写入分镜」（`buildMultiGridWriteBackPlan` + `writePictureShotPatch`） |

两者可先后使用：先建镜（镜头层面），再对已存在镜逐格写首帧（图层面，也可用于重出图后覆盖首帧）。镜头层面的首帧只在**新镜生成时**顺带带入，不做二次覆盖。

## 7. 已实现 / 未实现边界

已实现：

- 映射纯函数层（`packages/shared/src/utils/multi-grid-to-shots.ts`）：计划 → 镜头、镜头 → 分镜台拆镜结构、预览摘要、防重键、id 生成器（可注入）；
- 序号续接（按目标分集作用域）+ 分集继承 + 起始序号覆盖；
- 景别映射（中英 + 缩写 + 关键词兜底）、时长规则（默认 / 递增 / 时间偏移 / 逐格 / 全局覆盖 / 上下限收敛）；
- 时间偏移排序（乱序计划也会按过去 → 未来排好）；
- 首帧：`reuseSourceImage`（画面推演当前帧）指向源图；已出图的格带入该格图；都不可得则留空 + 告警，**不编造素材**；
- 三处「明确中文原因」：无上游链镜表 / 无分镜台节点 / 无拆镜结构；
- 写回拆镜结构 + 链镜表 + 全局镜表 + 防重键记录；
- 「去分镜台查看」（`runtime.focusBlock` + `openDeskAt` 打开工作台）。

未实现 / 边界（如实列出）：

- **分镜台重算会改写部分字段**：链镜表由分镜台的拆镜结构派生，重算时
  - `index` 取该集内的位置序号（不是本层算出的全局续号；新镜追加在集末，顺序仍然是「接着」的）；
  - `shotType` 由拆镜景别枚举反推：`extreme-wide` → `wide`（枚举无 EWS）、`custom` → `medium`（枚举无 custom）。
  本层的映射结果原样保留在**全局镜表镜像**与写回预览里；如需严格保留 `extreme-wide`，请在该镜的分镜台编辑里改回。
- **拆镜结构不承载首帧**：`ScriptBreakdownShot` 没有首帧字段，首帧只能写在链镜表上（本层已补写）。分镜台后续编辑会经 `mergeStoryboardShotFromBreakdown` 保留该首帧（同 id 合并）；但若把新镜删掉再拆镜，首帧随之消失（与既有行为一致）。
- **场次归属沿用锚点**：新镜的 `sceneId` / `sceneCode` / `scene` 取自插入位置（该集末镜）的场次（多格推演以源图为同一场景基准）；该集没有镜头时留空字符串，不臆测场次。
- **角色 / 场景资产绑定为空**：不在推演结果里臆测角色名与场景资产；分镜台里可再绑定。
- **分镜台没有拆镜结构时**（例如链镜表由迁移或制作台新增而来）：只写链镜表 + 全局镜表，并在日志里如实播报「拆镜结构未插入」；此时分镜台重新拆镜会以拆镜结构为准。
- 不改「剧情推演四宫格」的节拍内容本身（节拍文案仍由构造器给出），本层只把它落成 4 个镜头。
- 不做镜头去重之外的**合并 / 排序重排**：不合并同机位镜、不重排上游既有镜。

## 8. 验证口径（重要）

`packages/shared/src/index.ts` 目前引用了 8 个不存在的 `data/*` 模块（既有缺陷），因此 `pnpm --filter @nx9/shared build` / `pnpm --filter @nx9/web typecheck` 与走 barrel 的测试均无法运行；本次同样是**隔离验证**，下述命令均为真实执行：

1. 新增模块单独类型检查（新增 `packages/shared/tsconfig.multi-grid-shots-check.json`，只 include 该模块与其类型依赖）：
   `cd packages/shared && node ../../node_modules/typescript/bin/tsc -p tsconfig.multi-grid-shots-check.json` → **exit 0**；
2. 新增单测与其依赖的单独类型检查（新增 `apps/web/tsconfig.multi-grid-shots-check.json`，只 include 该测试文件）：
   `cd apps/web && node ../../node_modules/typescript/bin/tsc -p tsconfig.multi-grid-shots-check.json` → **exit 0**；
3. 单测（相对路径直取源码，与 barrel 缺陷解耦）：
   `cd apps/web && ./node_modules/.bin/vitest run src/engine/__tests__/multi-grid-to-shots.test.ts` → **44 passed / exit 0**；
   覆盖：四模式镜头数与顺序、序号续接与分集继承、景别映射（含「大远景」不被「远景」截胡）、时长规则与收敛、中英字段完整性、id 唯一 / 稳定 / 可注入、时间偏移排序、首帧与缺图告警、防重键、异常输入不抛异常且可 JSON 序列化、拆镜结构插入（位置 / 序号重排 / 同 id 不重复 / 分集不存在 / 无拆镜结构 / 锚点场次）。
4. 既有回归：`multi-grid-plan.test.ts`(20) / `multi-grid-closure.test.ts`(33) / `multi-grid-block-map.test.ts`(11) → **64 passed / exit 0**；
5. 改动的前端文件 `tool/MultiGridWorkspace.tsx` 用**临时 tsconfig**（未入库；`paths` 把 `@nx9/shared` 指向由真实源码 barrel 生成的替身，剔除 8 个缺失模块的导出）`tsc --noEmit`：该文件 **0 诊断**；其余 54 条诊断全部落在引用那 8 个缺失模块的文件上（既有缺陷，与本批无关）。

**未验证**（不谎报）：

- 完整 `pnpm run build`、`pnpm --filter @nx9/web typecheck`、全量 `vitest`、浏览器端到端——共享包 barrel 缺陷修复前无法运行；
- **真实交互端到端**（点击「生成并写回」后分镜台 / 导演台打开核对新镜）需要服务端与浏览器环境，本环境未执行；
- 分镜台重算后的字段差异（`index` / `shotType`）是**按既有派生规则静态推导**的结论，未在真机分镜台上逐步核对；
- 隔离替身 barrel 的检查不构成对 `packages/shared/src/index.ts` 新增导出行的类型保证（barrel 自身无法编译）；该追加块与既有导出写法一致，已逐行核对命名与来源文件。
