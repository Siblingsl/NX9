# NX9 工作区面板 · 组件级（jsdom）测试覆盖矩阵

> 范围：本会话新增的**工作区面板 / 组件**。此前这些能力多数只有**纯函数层**测试，
> 「面板的 React 交互」是已知薄弱面。本文记录本次补上的组件级覆盖、未覆盖项与理由，
> 以及跑测方式。
>
> **§1–§6 记录第一轮「只加测试、不改产品逻辑」的成果；§7 记录第二轮：写测试时实际复现了 4 处
> 缺陷并修复（B1–B4），§6 的条目 2 / 4 / 5 / 6 已随之关闭。**

---

## 1. 如何运行

```bash
# 单独跑本次新增的 8 个组件测试文件（87 个用例；§7 修复轮再加 6 个 → 93 个）
cd apps/web
npx vitest run \
  src/engine/__tests__/consistency-check-section.test.tsx \
  src/engine/__tests__/multi-grid-workspace.test.tsx \
  src/engine/__tests__/character-sheet-workspace.test.tsx \
  src/engine/__tests__/frame-study-workspace.test.tsx \
  src/engine/__tests__/capability-selfcheck-panel.test.tsx \
  src/engine/__tests__/preset-section-picker.test.tsx \
  src/engine/__tests__/picture-size-preset-chip.test.tsx \
  src/engine/__tests__/blocking-preset-panel.test.tsx

# 只跑 §7 修复涉及的 3 个文件（45 个用例）
npx vitest run \
  src/engine/__tests__/consistency-check-section.test.tsx \
  src/engine/__tests__/frame-study-workspace.test.tsx \
  src/engine/__tests__/multi-grid-workspace.test.tsx

# 全量（沿用仓库既有 vitest.config.ts 的 include 口径）
npx vitest run
```

测试文件位置统一放在 `apps/web/src/engine/__tests__/`：该目录已被
`apps/web/vitest.config.ts` 的 `include` 覆盖，因此**不需要修改任何配置**；
`packages/director3d` 的组件测试也放在这里（沿用既有
`director3d-camera-move-library-panel.test.tsx` 的做法）。

---

## 2. barrel mock 手法（本批测试的地基）

### 2.1 为什么要 mock

既有缺陷（本次**只报不改**）：`packages/shared/src/index.ts`（barrel）re-export 了 8 个
**不存在**的 `data/*` 模块：

```
emotion-presets / shot-move-families / creative-asset-presets / character-face-rig-presets /
playbook-definitions / camera-presets / shot-lexicon-taxonomy / provider-registry
```

任何经 `@nx9/shared` 的 import 在本机都会在**解析期**失败。基线全量跑的 84 个失败文件
（含 2 个断言失败）全部是这一个根因，错误签名只有 3 种、内容同一句
`Failed to resolve import "./data/emotion-presets" from "packages/shared/src/index.ts"`。

### 2.2 做法：把 barrel 指到**真实源码模块**

```ts
vi.mock('@nx9/shared', async () => {
  const { buildSharedBarrelMock } = await import('./support/shared-barrel-mock');
  return buildSharedBarrelMock();
});
```

`apps/web/src/engine/__tests__/support/shared-barrel-mock.ts` 维护一份
「shared 运行时符号 → 源码模块」清单（31 个模块，例如 `utils/multi-grid-plan`、
`utils/character-sheet-plan`、`utils/frame-study-plan`、`utils/preset-entrypoints`、
`utils/consistency-report`、`utils/blocking-layout` …），工厂把它们的命名空间合并成一个对象。

**关键点：断言对着真实实现与真实词表，不用桩数据。** 例：

- 多格/设定表/拉片的**格数**来自 `buildMultiGridPlanForMode` / `buildCharacterSheetPlan` /
  `buildFrameStudyPlan` 的真实输出（测试里从词表读 `cellCount`，不硬编码 9 / 4 / 3）；
- 一致性报告的**问题条目**来自真实 `buildConsistencyReport` / `pickBestCell`；
- 尺寸预设 chip 写回的字段用真实 `pictureSizePresetPatch` 反查后比对；
- `PresetSectionPicker` 的注入文本用真实 `withSectionPrompt` / `buildSectionPrompt`。

清单与「被测组件真正会取值的符号白名单」都在同一个文件里；缺符号会**点名报错**，
而不是让 vitest 抛难懂的 `No export defined`。

### 2.3 额外处理：被污染的一条依赖链

反过来还有一处**不在 barrel 那 8 个之列**的缺失依赖（同样只报不改）：

```
utils/collect-used-assets.ts
  → utils/asset-library.ts
  → utils/creative-asset-prompts.ts
  → data/creative-asset-presets.ts        ← 不存在
```

`CharacterSheetWorkspace` 需要 `stripAssetPinRevision`（住在 `collect-used-assets.ts`），
所以它的测试额外做了两件事：

1. `vi.mock('.../utils/creative-asset-prompts')` 把这条链的**叶子**换成一个
   「一被调用就抛错」的哨兵——宁可炸也不静默给错值；
2. `loadPoisonedBarrelExtras()` 在叶子被 mock 之后**动态取回真实的 `collect-used-assets`**，
   因此 `stripAssetPinRevision` 仍是真实实现。

被测路径全程不触碰那个叶子（测试里断言 `poisons.resolveAssetPromptText` 未被调用）。

### 2.4 组件侧的其他替身（都在测试文件内，不进产品代码）

| 替身 | 用途 | 说明 |
| --- | --- | --- |
| `@xyflow/react` | `useNodes` / `useEdges` / `useNodesData` / `useReactFlow` | 一个「内存流图」：`updateNodeData` 是 spy，且**真的写进节点 data 并触发重渲染**，因此可以断言「点按钮 → 到底写了哪些字段名」，也能验证幂等与清除（写 `undefined`） |
| `../api/client` | 网络边缘 | 只打桩真正会出网的出口（如 `probeMediaDuration` / `analyzeFaces`）；`consistency-check` 的限流与失败归一、`probeFrameStudyDuration` 的成功/失败归一仍走真实代码 |
| `useDirectorStore` | 3D 导演台状态 | **不桩**，用真实 zustand 实例，断言「点按钮 → 真的写进 `project.cameras` / `project.objects`」 |

---

## 3. 覆盖矩阵

| 组件 | 测试文件 | 覆盖的交互 | 未覆盖 / 原因 |
| --- | --- | --- | --- |
| `engine/.../tool/MultiGridWorkspace.tsx` | `multi-grid-workspace.test.tsx`（15） | ① 无源图空态：主 CTA 禁用、概览「待源图」、「未连接上游图像…」中文引导、**不产生任何写回**；② 有源图自动出计划：格数 = 真实模式表格数、逐格提示词框、一致性校验因无图禁用；③ 切模式写入**固定字段组**（`multiGridMode` + `multiGridPlan/Cells/SendToVideoIndex/ShotTargets` 全部 `undefined` + 行列）并幂等清除，重渲染后格数/专属参数跟着变；④ 宫格规格 5×5 同时改模式与行列；⑤ 焦段/宽高比/参考强度/逐格并发写回并回显；⑥ 数值清空回落默认（不写 0/NaN）；⑦ 画面推演模式前置/后续秒数写回；⑧ 逐格提示词编辑写入 `multiGridPlan + multiGridCells`（`promptEdited` + 中英同源）并出现「已改」；⑨ 「恢复默认提示词」写 `undefined` + 操作日志；⑩ 切模式不沿用旧改写；⑪ 无上游镜表：`生成并写回分镜` 禁用 + title = 真实原因、逐格「写入分镜 / 送入视频生成」禁用 + title；⑫ 接触表空态：导出/下载/入库/回收站逐条禁用与真实 title；⑬ **接触表计数口径（§7 B4）**：未出图 `0/<计划格数>`、部分出图只数「真的出图」的计划格（失败格不计入）、计划外残留格图不计入分子 | 实际出图 / 写回分镜 / 接触表拼合：需要 `runCascadeFromBlock` 与图生图服务端，属**运行器层**（既有 `multi-grid-*` 纯函数与运行器测试覆盖），本次不触及；BGM 节拍分析面板走 `api.beatAnalyze`，已有 `beat-grid.test.ts` 与 `CameraMoveTimelineEditor` 的组件级覆盖 |
| `engine/.../tool/CharacterSheetWorkspace.tsx` | `character-sheet-workspace.test.tsx`（13） | ① 无参考图空态：「纯文字设定表」中文说明、写回类按钮逐条禁用 + 真实 title；② 默认版面格数/概览/主 CTA（无需参考图也能出图）；③ 切版面写入固定字段组 + 格数变化；④ 切一致性档位写 `consistency`，概览「一致性强度」按真实档位从 0.72 → 0.58；⑤ 「恢复默认提示词」写 `undefined` + 日志；⑥ 行列/宽高比/并发/画风/负面词写回；⑦ 行列清空或 0 回落默认；⑧ 行列只改几何、容不下时**回落并在面板告警**；⑨ 逐格提示词编辑（`promptEdited` + 中英同源 + 「已改」）；⑩ 切换版面不沿用旧改写；⑪ 选中素材库角色带入设定/参考图并清空改写稿，日志区分「有参考图 / 纯文字」；⑫ 角色已不在素材库 → 中文 toast 且**不写回错角色** | 批量出图 / 登记参考图：需要运行器与素材库写入服务端，本次不触及（`character-sheet-closure` 已有纯函数覆盖） |
| `engine/.../tool/FrameStudyWorkspace.tsx` | `frame-study-workspace.test.tsx`（16） | ① 无视频空态：主 CTA / 探测时长**不再被禁用态挡住**（§7 B3：点得动、点击即给中文提示，且零请求零写回）+ 中文引导、导出与送入分镜禁用 + 真实 title；② 参数区手工指定视频地址写入 `frameStudyVideoUrl` 并解锁入口；③ 探测成功：写入时长与备注、toast、概览显示真实秒数；④ 探测**抛异常**：回落「时长未知」并带真实错误原因；⑤ 服务端 `ok:false`：不编造时长，失败备注直接渲染在面板；**带 `message` 时原样带上服务端原因（§7 B2）**；⑥ 切抽帧策略写入策略 + 该策略默认值并作废上一策略的计划/结果，参数区口径（帧数 ↔ 间隔）跟着变；⑦ 抽帧数/宽高比/并发/上下文写回并回显；⑧ 抽帧数非法回落默认；⑨ 「清空拉片表」写 5 个 `undefined` + 日志；⑩ 逐帧卡片按真实时间码渲染、无帧图帧标「无帧图」且「重推」禁用 + 原因；⑪ 编辑某帧提示词重建拉片表（其余帧原样、`frameStudyFrameUrls` 同步）；⑫ 清空某帧；⑬ 复制某帧到剪贴板（时间码 + 中英）；⑭ 剪贴板不可用 → 如实报错可手动复制 | 真正的抽帧/逐帧反推：走服务端视觉管线，属运行器层（`frame-study-plan` 已有纯函数覆盖）；「重推该帧」需要 runtime + 服务端，本次只覆盖其禁用分支 |
| `engine/.../consistency/ConsistencyCheckSection.tsx` | `consistency-check-section.test.tsx`（14） | ① 空态：按钮禁用 + 中文 title、说明文案在、**不发任何请求**、「挑最优格」禁用 + 真实 title；② 校验传参（全量格、下标对齐）与报告落地、操作日志；③ 人脸有无不一致 → 错误级条目 + 对照格号 + 「证据」展开看逐格原始值 + 「跳到该格」回调格号；④ 外观偏离基线 → 警告级 + 证据取值；⑤ 全一致 → 「未发现格间不一致」（不假报）；⑥ 个别格失败 → 逐格 `cell-unanalyzed` 带真实原因、不假报一致，且原因**不重复列两遍**；⑦ 只有 1 格可用 → 「不出结论」且推荐理由写明「未做格间比较」；**1 成功 2 失败时逐格失败原因照样逐条可见（§7 B1）**；⑧ 全部失败 → 「无法推荐」且不出现跳转入口；⑨ 请求 reject → 逐格落「请求失败 + 真实原因」且**不出兜底 toast**；⑩ 取数壳层抛异常 → 兜底 toast + 日志、不生成报告、busy 复位；⑪ 优先格被选中并写入日志；⑫ 格图变化 → 「报告可能已过期」，重新校验后消失 | 人脸分析的**服务端实现**（`/api/tools/analyze-faces`）本身不在前端测试范围 |
| `engine/stage-deck/chrome/CapabilitySelfcheckPanel.tsx` | `capability-selfcheck-panel.test.tsx`（7） | ① `report=null` 不渲染弹窗；② 标题/摘要/正文、遮罩与 Esc 关闭、其它按键不关闭；③ 逐项渲染严重度徽标（通过/警告/错误）+ `data-check-id`/`data-severity` 与真实严重度一致、说明、证据逐条、无证据不渲染空列表、口径声明与取数时间；④ `complete=false` 横幅且检查项照旧展示、无取数时间不渲染尾巴；⑤ `checks` 为空仍有口径声明（不出现空白成功态）；⑥ 传入 `onRerun` 才有按钮、点击回调、`busy` 禁用并改文案；⑦ 不传 `onRerun` 无入口 | 自检**取数**（`import.meta.glob ?raw` 读源码）已有 `capability-selfcheck-shell.test.tsx` 覆盖，本次不重复 |
| `engine/.../generation/PresetSectionPicker.tsx` | `preset-section-picker.test.tsx`（11） | ① 默认触发器名、未选中时的「未选择…」预览、清除按钮禁用；② `disabled` 时不可展开；③ **选中态由提示词文本反推**（成行注入 → 触发器计数与勾选态一致）；④ 用户手动删行 → 勾选自动消失（界面与文本不会不一致）；⑤ 点选注入真实片段（既有提示词保留、不新增字段名）；⑥ 多选叠加且顺序与选择顺序一致；⑦ 再点取消该条、其余保留；⑧ 「清除该段」移除整行并回落；⑨ 分组渲染按真实词表；⑩ 搜索按 id/标签/片段过滤 + 无命中中文空态；⑪ `resetKey` 变化清空搜索框 | 真实写回目标（生成工作台 `applyText` / 分镜草稿）由调用方测试覆盖，本组件是受控的 |
| `engine/.../generation/picture/PictureSizePresetChip.tsx` | `picture-size-preset-chip.test.tsx`（7） | ① 默认显示「尺寸预设」且不高亮；② 宽高比非 `custom` 时**不做反查**（不与宽高比 chip 抢显示语义）；③ `custom` + 宽高命中 → 显示预设名、高亮、弹层内该项 active（命中判定用真实 `matchPictureGenSize` 先自检）；④ 不命中回落「尺寸预设」；⑤ 列出全部真实尺寸预设、点选写入**恰为** `aspectRatio:'custom' + width + height`（字段名逐一对齐真实 `pictureSizePresetPatch`，不新增字段）；⑥ 选择后弹层关闭、可重新打开；⑦ 每条预设都能写回且与真实映射一一对应 | `resolveImageRequestSize` 的消费方解析已有纯函数测试覆盖 |
| `packages/director3d/src/ui/BlockingPresetPanel.tsx` | `blocking-preset-panel.test.tsx`（10） | ① 机位/走位两组按钮按真实词表逐条渲染 + 真实口径 title、未套用无提示；② 点机位写入当前镜头的 `name/fov/target/position`，**不动** rotation/scale，且不切换激活镜头，如实提示「已套用机位…」；③ 逐条机位都能套用且只写同一份 `project.cameras`；④ 场景无镜头 → 明确中文提示且不改数据；⑤ 走位按真实 `solveBlockingLayout` 结果移动可见演员、锁定演员原地不动、不动 scale、如实报告移动/跳过人数；⑥ 全锁定 → 不移动并说明原因；⑦ 无可见演员 → 提示先添加演员；⑧ 隐藏演员不参与且不计入人数；⑨ 已套用布局的 `is-on` 选中态随下一次套用转移；⑩ 套用机位后 `undo` 能回退（写的是同一份 store，不是旁路状态） | 面板本身不需要 WebGL；**3D 舞台的实际渲染**（站位预览）不在 jsdom 覆盖范围 |

---

## 4. 本次**未覆盖**的组件与理由

### 4.1 任务清单内、但**已有既有覆盖**（不重复新增）

| 组件 | 既有测试 | 既有覆盖内容 | 本次处置 |
| --- | --- | --- | --- |
| `packages/director3d/src/ui/CameraMoveLibraryPanel.tsx` | `apps/web/src/engine/__tests__/director3d-camera-move-library-panel.test.tsx`（296 行） | 家族分组 / 搜索过滤 / 代理近似标注 / 套用写入 `project.cameras`（首帧=当前取景、末帧更近、不切激活机位）/ 重复套用只保留一批 / 移除关键帧 / 与运镜时间轴交接 / undo | **未新增测试**（避免重复）；`BlockingPresetPanel`（同目录、原本零覆盖）本次补上 |

### 4.2 同目录其他工作区（本次未覆盖，理由逐条）

| 组件 | 规模 | 未覆盖理由 |
| --- | --- | --- |
| `tool/ToolWorkspace.tsx`、`tool/GridComposeWorkspace.tsx`、`tool/LinkParserWorkspace.tsx`、`tool/LocalEnhanceWorkspace.tsx`、`tool/ReferenceBoardWorkspace.tsx` | 76–242 行 | **不在本次指定清单内**。可达（依赖与已覆盖面板同族：`@xyflow/react` + store），后续可按同一 mock 手法增量补 |
| `generation/GenerationWorkspace.tsx`、`generation/CaptionWorkspace.tsx`、`generation/InpaintWorkspace.tsx` | 133–305 行 | 同上（不在本次清单）。其中 Inpaint/Caption 会牵出 `media-pin` 与局部重绘取数链，mock 成本高于本批均值 |
| `generation/picture/PictureWorkspace.tsx`（1626 行）、`generation/video/VideoWorkspace.tsx`（808 行） | 极大 | 不在本次清单，且是「生成工作台」总壳：单文件体量与分支数是本批组件的 4–8 倍，mock 面（模型连接 / 提示词 / 参考图 / 任务轮询 / 内联子面板）远超本次预算；其内部已被本批拆出的 `PresetSectionPicker` / `PictureSizePresetChip` / `ConsistencyCheckSection` 单独覆盖 |
| `packages/director3d/src/panels/AddDrawer.tsx`、`panels/EnvDrawer.tsx` | 110 / 289 行 | 不在本次清单；依赖 `director3d` 内置资产目录与场景 store 的深链（添加对象 / 环境预设），断言价值与成本比低于本批组件 |
| `packages/director3d/src/ui/CameraRigPanel.tsx`、`CameraPresetBar.tsx`、`StageRail.tsx`、`StageMobileDock.tsx` | 80–224 行 | 与 `BlockingPresetPanel` 同族、**理论可测**，但本次清单未列；本次优先补零覆盖的 `BlockingPresetPanel` |
| `packages/director3d/src/ui/StageDeckShell.tsx`、`canvas/SceneContent.tsx` | 599 / 484 行 | **不可在 jsdom 覆盖**：直接依赖 `three` / `@react-three/fiber` / `@react-three/drei`，需要真实 WebGL 上下文；其状态映射已由 `director3d-*` 系列 store/纯函数测试覆盖 |
| `engine/stage-deck/chrome/*` 里依赖 Canvas/WebGL 的舞台外壳 | — | 同上：jsdom 无 WebGL，不代表覆盖空白不存在，而是测试环境边界 |

> 说明：本批**没有**任何「为了凑数」的空断言测试；未覆盖项一律在此列出理由，而不是用快照或
> `expect(true).toBe(true)` 掩盖。

---

## 5. 验证结果

### 5.0 新增文件清单

| 文件 | 行数 | 类型 |
| --- | --- | --- |
| `apps/web/src/engine/__tests__/support/shared-barrel-mock.ts` | 223 | 测试基建（非测试文件，不被 `include` 收集） |
| `apps/web/src/engine/__tests__/consistency-check-section.test.tsx` | 338 | 新增测试 |
| `apps/web/src/engine/__tests__/multi-grid-workspace.test.tsx` | 415 | 新增测试 |
| `apps/web/src/engine/__tests__/character-sheet-workspace.test.tsx` | 451 | 新增测试 |
| `apps/web/src/engine/__tests__/frame-study-workspace.test.tsx` | 521 | 新增测试 |
| `apps/web/src/engine/__tests__/capability-selfcheck-panel.test.tsx` | 161 | 新增测试 |
| `apps/web/src/engine/__tests__/preset-section-picker.test.tsx` | 254 | 新增测试 |
| `apps/web/src/engine/__tests__/picture-size-preset-chip.test.tsx` | 163 | 新增测试 |
| `apps/web/src/engine/__tests__/blocking-preset-panel.test.tsx` | 238 | 新增测试 |
| `docs/NX9-UI-COMPONENT-TEST-COVERAGE.md` | 263 | 文档（本文） |

**合计新增 3027 行**（测试 2541 + 测试基建 223 + 文档 263）。
本次**没有修改任何产品代码**：`git status` 里的 `M` 条目全部是会话开始前就已存在的改动
（与任务开始时的快照一致）；`packages/shared/src/index.ts` 与那 8 个 `data/*` 路径的
mtime 都在本次会话之前，未被创建也未被修改。

### 5.1 新增用例逐个文件结果

命令：`cd apps/web && npx vitest run <8 个文件> --reporter=verbose`

| 文件 | 用例 | 结果 |
| --- | --- | --- |
| `consistency-check-section.test.tsx` | 13 | ✅ 通过 |
| `multi-grid-workspace.test.tsx` | 12 | ✅ 通过 |
| `character-sheet-workspace.test.tsx` | 13 | ✅ 通过 |
| `frame-study-workspace.test.tsx` | 14 | ✅ 通过 |
| `capability-selfcheck-panel.test.tsx` | 7 | ✅ 通过 |
| `preset-section-picker.test.tsx` | 11 | ✅ 通过 |
| `picture-size-preset-chip.test.tsx` | 7 | ✅ 通过 |
| `blocking-preset-panel.test.tsx` | 10 | ✅ 通过 |
| **合计** | **87** | `Test Files 8 passed (8)` / `Tests 87 passed (87)`，**exit code 0** |

### 5.2 反向对照（故意写错断言 → 必须失败）

| 对照 | 改动 | 结果 |
| --- | --- | --- |
| A | `capability-selfcheck-panel.test.tsx`：把 `catalog` 项的严重度断言从 `'ok'` 改成 `'error'` | ❌ 失败：`AssertionError: expected 'ok' to be 'error'`（exit 1） |
| B | `multi-grid-workspace.test.tsx`：把期望补丁里的字段名 `multiGridRows` 改成 `multiGridRowCount` | ❌ 失败：`AssertionError: expected { …(7) } to deeply equal { …(7) }`（exit 1） |

两个对照文件均**用拷贝恢复**（拷贝存于系统临时目录，未用 `git show HEAD:file > file`），
恢复后重跑：`Test Files 2 passed (2)` / `Tests 19 passed (19)`，exit code 0。

### 5.3 全量回归前后基线对照

| 指标 | 改前（baseline） | 改后（after） | 判定 |
| --- | --- | --- | --- |
| 收集到的测试文件 | 167 | 175 | +8 = 本次新增文件数 |
| **失败文件数** | **84** | **84** | ✅ 零回归 |
| 通过文件数 | 83 | 91 | +8 |
| 用例总数 | 1190 | 1277 | +87 |
| 通过 / 失败 / 跳过 用例 | 1187 / 2 / 1 | 1274 / 2 / 1 | 失败与跳过**数量与内容均未变**，通过数 +87 |
| 失败错误签名（去重） | 3 种（全为 `data/emotion-presets` 解析失败的不同包装） | 3 种，逐字相同 | ✅ 签名一致 |

逐文件比对（按归一化路径）：**新失败 0 个、不再失败 0 个、签名变化 0 个**。
即「通过文件 / 用例数增量 == 本次新增」，且既有 84 个失败文件与错误签名一字未动。

全量命令的 exit code 为 **1**——与改前一致，全部来自那 84 个既有 barrel 解析失败文件，
**不是**本次新增引入。本次**没有**声称全量/构建/端到端通过。

---

## 6. 过程中发现的产品观察（只报不改）

> 以下均在测试过程中**实际复现**或由代码路径确认，本次未修改任何产品代码。

1. **缺失依赖不止 barrel 里那 8 个（已复现）**
   `utils/collect-used-assets.ts → utils/asset-library.ts → utils/creative-asset-prompts.ts
   → data/creative-asset-presets.ts（不存在）`。
   因此 `collect-used-assets.test.ts` 也在基线 84 个失败文件里；任何间接引入
   `collect-used-assets` / `asset-library` 的组件在测试里都需要额外处理。
   影响面：`stripAssetPinRevision`、`parseAssetMentions` 等**真实实现**在测试中默认不可 import。

2. **`ConsistencyCheckSection`：可用分析格 < 2 时，逐格失败原因不会出现在面板上（已复现）**
   此时 `buildConsistencyReport` 返回 `unavailable` 且 `issues: []`，面板只渲染 `unavailable` 文案，
   于是「某些格分析失败」的**逐格原因被丢弃**。而组件注释写的是
   「服务端不可用 / 网络失败：逐格如实显示原因（该格标「未分析」）」。
   实测：3 格中 1 成功 2 失败时看不到任何逐格原因；改成 2 成功 1 失败才看得到。
   **→ 已在 §7 B1 修复**（`unavailable` 分支也把逐格 `reasonZh` 列出）。

3. **`ConsistencyCheckSection`：「挑最优格」与报告口径不完全一致（已复现）**
   报告写「不出结论（少于 2 格无法比较）」时，「挑最优格」仍可能给出**「推荐格」**
   （唯一候选，理由里写「仅此格有可用分析，未做格间比较」）。理由有披露，但两条文案
   一个说「不出结论」、一个给「推荐」，读起来互相拉扯。

4. **`FrameStudyWorkspace`：两处「无视频」toast 从 UI 不可达（已复现）**
   「探测时长」按钮 `disabled={!videoUrl}`、主 CTA `runDisabled={!videoUrl}`，
   因此 `handleProbeDuration` 的「未连接上游视频：…」与 `handleRun` 的
   「逐帧拉片缺少上游视频：…（禁止空成功）」两条 toast 分支在当前 UI 上点不到。
   属防御性分支（不空成功，方向正确），但会给人「提示有效」的错觉。
   **→ 已在 §7 B3 修复**（两处入口改为「未禁用但点击即提示」，不空成功保持不变）。

5. **`FrameStudyWorkspace`：时长探测 `ok:false` 时丢弃服务端 message（已复现）**
   `probeFrameStudyDuration` 在 `res.ok !== true` 时固定返回
   「时长探测失败：服务端未能解析该视频（时间码将留空）」，**不使用**服务端给的 `message`；
   只有「请求抛异常」路径才带真实原因（`时长探测失败：<error>（时间码将留空）`）。
   即：服务端已经说清原因的场景，前端反而更模糊。
   **→ 已在 §7 B2 修复**（`ok:false` 且带 `message` 时原样照说，无 `message` 才回落固定文案）。

6. **`MultiGridWorkspace`：接触表标题的「完成 N/M 格有图」分母是「已跑过的格」（已复现）**
   分母取自 `data.multiGridCells` / `data.gridCells`，未跑过时为 `0`，
   于是 3×3 版面在未出图时显示 `3×3 · 0/0 格有图`，而不是计划格数 `0/9`。
   **→ 已在 §7 B4 修复**（分母 = 计划格数，分子 = 计划格里真的出图的格数）。

7. **`MultiGridWorkspace`：`handleRun` 在 `runtime === null` 时静默 return（未复现，代码路径确认）**
   没有 toast / 日志。真实运行时 `runtime` 恒非空，故未构造用例；仅记录。

8. **`PresetSectionPicker` 的选中态反推依赖一条不变量（已确认）**
   「同一 section 内不存在一条预设片段是另一条的连续子串」——该不变量由既有
   `preset-entrypoints.test.ts` 断言。本次测试会在词表变化时通过 `bg-brand/10` 勾选断言
   立刻暴露违约（附带记录，无需改动）。

9. **`BlockingPresetPanel`：`notice` / `activeLayout` 是组件内 `useState`（未复现）**
   若上层在不重挂面板的情况下替换 `project`，上一轮的提示与 `is-on` 选中态不会重置。
   测试里 `beforeEach` 会重挂组件，故未观察到实际错乱；仅记录。
