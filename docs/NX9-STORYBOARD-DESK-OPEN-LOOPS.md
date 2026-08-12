# NX9 分镜台 · 未闭环功能清单

> **日期**：2026-08-12
> **范围**：分镜台节点全链（拆镜 → 镜表 → 线稿构图 → 确认交接 → 导演台消费）
> **依据**：仓库现行代码逐文件核对（`use-storyboard-desk.tsx` 3811 行 + 4 面板 + runner + 嵌入预览 + 导演台消费端）
> **对照基线**：`NX9-STORYBOARD-DESK-PRODUCTION-GAP-ANALYSIS.md`（2026-08-03 施工说明书）
> **原则**：以「生产闭环可验收」为准，不以「字段/按钮已存在」为准

---

## 实施进度（2026-08-12 收口轮）

| ID | 项 | 状态 | 落点 |
|----|----|------|------|
| SB-OL-01 | 合镜首镜崩溃 | ✅ 已修 | `grid-panel.tsx` 改用已导入的 `toastError` |
| SB-OL-02 | 嵌入预览写回不摘确认 | ✅ 已修 | 桌面侧不变量守护：本集帧签名变化且本集仍「已确认」→ 自动 `stripEpisodeConfirmation`（覆盖一切绕过 handler 的写回入口） |
| SB-OL-03 | 清除线稿清了等于没清 | ✅ 已修 | 追加清 `sketchUrl` + `removeFramesForShotIds` 移除对应帧；chain 由 applyDeskBreakdown 按空 previewImageUrl 覆盖（`'' ?? x` 不放行空串，已核实） |
| SB-OL-04 | spawn 交接字段错位 | ✅ 已修 | spawn 分支改写 `lastHandoff`（含 `hashSchemaVersion` / `lastHandoffStatus`），与 focus 分支同 key |
| SB-OL-05 | 切集闭包摘错集确认 | ✅ 已修 | `setShotFrameUrl` / `generateShotLineArt` / 两个批量函数 deps 补 `currentEpisodeId` |
| SB-OL-06 | 队列「跳过」不生效 | ✅ 已修 | 每集独立 AbortController（链接外层 signal）；运行中点跳过即中止在途请求，循环顶部读 `skipped` 列表跳集，与「取消」区分 |
| SB-OL-07 | 删镜/批删孤儿帧 | ✅ 已修 | runner 新增纯函数 `removeFramesForShotIds`，删镜/批删/清线稿统一清帧并重算 `previewUrls`（含测例 6 条） |
| SB-OL-08 | 就绪条/未连图像 chip 陈旧 | ✅ 已修 | `readiness` / `connectedPictureGenId` 改依赖响应式 `useNodes()/useEdges()` |
| SB-OL-09 | 导入旧镜表 stale 永不触发 | ✅ 已修 | 导入后写 `breakdownJob.sourcePackageHash = 'legacy-import'` 哨兵值，上游有确认成稿即诚实提示不同步 |
| SB-OL-10 | 宫格不认「缺图优先」且不可停 | ✅ 已修 | 宫格路径按 `isShotComposed` 过滤 + `runPictureGenJob` 透传 `signal`（`pollVideoUntilDone` 同步支持 abort） |
| SB-OL-11 | 主文件 3811 行工程债 | ✅ 已拆（第一步） | 拆出 `shot-edit-modal.tsx`（编辑弹窗 ~620 行）与 `stale-banner.tsx`（Stale Banner），主文件降至 ~3530 行；DevPack/pipeline 后续再拆 |
| SB-OL-12 | 关台取消任务覆盖不全 | ✅ 已修 | 单镜线稿、增量补拆各挂 AbortController；拼版用代际号（`sheetEpochRef`）拦截关台后的写回；关台取消统一 abort 全部 |
| SB-OL-13 | 撤销按钮态滞后 | ✅ 已修 | 栈深入 state（`undoDepth`），GridPanel 改收 `canUndo` |
| SB-OL-14 | 增量补拆疑似重复无提示 | ✅ 已修 | 预览弹窗按「正文/标题归一化」比对现有镜，命中标「⚠ 疑似重复」并汇总提示，弹窗转 danger 色 |
| SB-OL-15 | DevPack Prompt 不落盘 | ✅ 已修 | 挂载时从节点 data 水合，编辑/导入/恢复默认写回 `scriptBreakdownPrompts`（拆镜路径读的正是该字段，即改即生效） |
| SB-OL-16 | 覆盖率统计跨台取图 | ✅ 已修 | `confirmCurrentEpisode` 改读本台 `readChainStoryboard(props.data)`，不再 `getAllChainShots` 扫全画布 |
| SB-OL-17 | 合镜漏清帧 | ✅ 已修 | 合镜成功后 `cleanupFramesForShots` 清退役 id；`retiredShotIds` 纯函数可测；失败（同引用）不写不摘 |
| SB-OL-18 | 构图把关键帧当线稿 | ✅ 已修 | `deskLineArtUrl` 只读 `lineArtUrl`；确认/宫格/卡片/故事板大图均不再回退 `firstFrameAssetId` |
| SB-OL-19 | 撤销不含改字段/重置 | ✅ 已修 | 撤销快照扩为 `DeskUndoSnapshot`（镜表+预览+确认态）；`saveShotEdit` / 重置本台入栈；撤销 tip 写明范围 |
| SB-OL-20 | 镜表/构图双入口含糊 | ✅ 已修 | 镜表 hint + 构图说明 + 卡片 tip：批量以构图为准，卡片 ✨ 为单镜快捷，结果同一份 |
| SB-OL-11b | 主文件继续拆 | ✅ 已拆 | 再拆 `pipeline-bar.tsx`、`desk-dev-pack.tsx`；主文件再降约 200 行 |
| SB-OL-21 | 会话草稿只存镜表 | ✅ 已修 | `serializeDeskSessionDraft` v2 含预览+确认态；恢复走 applyDeskBreakdown；兼容 v1 裸 payload |
| SB-OL-22 | ContinuityCheck 多链串台 | ✅ 已修 | 跳转/重生成改 `resolveUpstreamChainDesk`；读镜 `allowGlobalFallback=false` |
| SB-OL-23 | 三台串联契约测 | ✅ 已补 | vitest `script-storyboard-director-handoff.test.ts`（handoff 校验/改稿失效/线稿哈希隔离/多链定位/草稿 v2）；浏览器主路径仍见 `e2e-script-storyboard-director.spec.ts` |

验证：上述测例 + `StoryboardDeskBlock.test.tsx` + frame-cleanup；分镜台/连贯性改动相关 lint 干净。

---

## 0. 怎么读本文

### 0.1 「闭环」判定（四问）

| # | 问句 | 失败即未闭环 |
|---|------|--------------|
| 1 | **拆得进** | 成稿变化可感知，可选范围重拆，任务可停可续 |
| 2 | **改得动** | 增删拆合排序可用、可悔、可定位 |
| 3 | **状态真** | 确认态与镜表/线稿真实一致，无假绿 |
| 4 | **交得出** | 下游导演台拿到的交接数据完整可校验 |

### 0.2 状态符号

| 符号 | 含义 |
|------|------|
| ✅ 已闭环 | 主路径可验收 |
| ⚠ 半闭环 | 有入口/字段，但链路断一截 |
| ❌ 断点 | 功能失效或状态撒谎 |
| ⏸ 后置 | 明确可延后 |

---

## 1. 一句话结论

上一轮施工说明书的 Phase A/B **绝大多数 ID 已落地**（Stale Banner、确认失效、按集故事板、删镜、批量可停、互锁、门禁、撤销、拖拽、spawn 导演台、审片包、测例等均在）。

但逐行核对后发现 **4 个 P0 级断点**：

1. **合镜首镜报错崩溃**（`useToast` 未 import，运行时 ReferenceError）
2. **嵌入线稿预览写回不摘确认**（X-02 在构图 Tab 有一条大缝）
3. **「清除线稿」清了等于没清**（frames / chain 残留，徽章仍「已出图」）
4. **spawn 导演台交接字段错位**（`handoff` vs `lastHandoff`，首次创建后校验必失败）

以及若干 P1 级闭环缝（切集闭包摘错集、队列跳过无效、孤儿帧、就绪条陈旧等）。

---

## 2. 已闭环对照（勿再开票）

对照 2026-08-03 施工文档逐 ID 核实，以下**确认已落地**：

| ID | 项 | 代码锚点 |
|----|----|---------|
| X-01 | 顶栏 Stale Banner（含差异摘要 / 只拆新增 / 重拆全部 / 仅未确认 / 稍后） | `use-storyboard-desk.tsx` `sg3-stale-banner` |
| X-02/X-23 | Desk 内所有写镜表/线稿路径统一 `stripEpisodeConfirmation` + unconfirm banner | runner L460 + 各 handler（**嵌入预览除外，见 SB-OL-02**） |
| X-03/X-16 | `contactSheetsByEpisode` 按集存取 + 嵌入预览 frames 按 `episodeShotIds` 过滤 | `getEpisodeContactSheet` / `scopeStoryboardPreviewFrames` |
| G-01/X-05 | 删镜（confirmDelete + 重排 index + 禁删最后一镜）+ 批量删 | runner `removeShotFromBreakdown` |
| C-01/C-02/X-04 | 批量线稿 / 宫格线稿 AbortController +「停止」按钮，已成功保留 | `lineArtAbortRef` + ComposePanel |
| X-15 | `deskBusy` 互锁（重拆/导入/删镜/确认统一 disabled） | hook L324 |
| S-02 | `beforeunload` 拦截 + 关台二次确认（拆镜可转后台继续） | hook L337 / `handleCloseStudio` |
| H-01/X-20 | 确认门禁：未绑定列表 + 缺图镜号列表 + 覆盖率 60% 软阈 + 可选硬阈值开关 | `confirmCurrentEpisode` + HandoffPanel |
| X-06 | 本地撤销栈（20 步，busy 禁用） | `undoStackRef` / `pushUndo` |
| X-07 | 镜卡拖拽排序 + 库卡拖入绑定（OL-16） | GridPanel `handleDrop` |
| X-08/F-05 | embedded 预览隐藏评分/重生低分/提交批审/3D | `StoryboardPreviewWorkspace` `!embedded` 分支 |
| X-09 | 打开导演台：有则 focus + 写 `lastHandoff`；无则 spawn + 连边（**字段错位见 SB-OL-04**） | `openDirectorDesk` |
| X-10 | `confirmHardThreshold` 硬门禁开关 | HandoffPanel |
| X-11/B-03 | 增量补拆先预览新增镜列表再合并 | `runIncrementalBreakdown` |
| X-12 | 快捷键 ↑↓/E/L/Del（输入框 focus 免抢键） | hook L1886 |
| X-13 | 审片包导出（CSV + MD + 故事板 PNG） | `exportReviewPackage` |
| X-14 | 底栏总时长 / 平均镜长 | `sg3-foot` |
| X-17 | 清除线稿入口（**实效见 SB-OL-03**） | `handleClearLineArt` |
| X-18 | 诊断点击 → 选中并滚动到镜卡 | BreakdownPanel diagnostics |
| X-19 | 「未连图像」内联 chip（**刷新时机见 SB-OL-08**） | ComposePanel |
| X-21 | 撤回本集确认（header 按钮） | ScreenModal headerRight |
| X-22/C-03/C-07 | 批量范围「缺图/全部」切换 +「重试失败 N」 | `batchScopeMode` / `lastBatchFailures` |
| X-24 | 合镜失败提示（**崩溃缺陷见 SB-OL-01**） | GridPanel `handleMergeShot` |
| X-25/H-05 | 顶栏「已确认 a/b 集 · 本集构图 %」 | pipeline episode meta |
| B-02 | `window.confirm` 全部替换为 askConfirm/confirmDelete（分镜台文件已零命中） | grep 验证 |
| B-04/B-05 | 重拆策略（全部/仅未确认/只拆新增）+ 队列失败重试 | breakdown 系列 handler |
| F-01/F-02 | 步骤条完成态 + 冷启动三步引导 | pipeline `is-done` / `sg3-onboard` |
| F-06 | 切集故事板不串（per-episode map 不回退他集，有测例） | 测试 `getEpisodeContactSheet` |
| F-07/F-08 | 导航点击滚动 + 筛选计数「未构图 (N)」 | `sg3-nav` |
| G-03/G-04/G-05 | 复制镜/多选批量、线稿(Sparkles)与编辑(Pencil)图标区分、覆盖图前确认 | ShotStoryCell |
| S-01 | 会话草稿（sessionStorage 自动存/恢复） | `draftKey` effect |
| S-03 | 重置本台（清镜表/预览/确认态） | GridPanel `handleReset` |
| Q-02 | runner 纯函数 + 契约测例 20+（删镜重排/摘确认/按集大图/hash/scope 边界） | `StoryboardDeskBlock.test.tsx` 421 行 |
| Q-04 | chain SSOT，不再回退全局 `workspace.storyboard.shots` | hook `storyboardShots` |
| — | 后台拆镜：关台继续、完成回询、卡片显示后台进度、脏 running 状态挂载清理 | `offerReturnAfterBreakdown` |

---

## 3. 未闭环明细

### 3.1 P0 · 状态撒谎 / 功能失效 / 运行时错误

#### SB-OL-01 ❌ 合镜首镜直接崩溃（`useToast` 未导入）

```117:121:apps/web/src/blocks/craft/storyboard-desk/grid-panel.tsx
    const idx = visibleShots.findIndex((s) => s.id === selectedId);
    if (idx < 1) {
      useToast.getState().push({ message: '请选择非首镜与前镜合并', variant: 'error' });
      return;
    }
```

`grid-panel.tsx` 的 import 只有 `toastError, toastSuccess`，没有 `useToast`。选中首镜点「合镜」时抛 `ReferenceError: useToast is not defined`（X-24 的实现引入的回归）。
**修复**：改用已导入的 `toastError('请选择非首镜与前镜合并')`。

#### SB-OL-02 ❌ 嵌入线稿预览写回不摘本集确认（X-02 大缝）

构图 Tab 嵌入的 `StoryboardPreviewWorkspace`（补缺图 / 单帧重生 / 同步）写 `storyboardPreview.frames` 时，整个 `storyboard-preview` 目录 **零处** 调用 `stripEpisodeConfirmation` / 不动 `confirmedEpisodeIds`。
Desk 自己的路径（单镜/批量/宫格/上传）都摘确认，唯独用户最常用的嵌入预览网格出图**不摘** → 已确认集出了新线稿仍显示「已确认」，交下游即错交付。
**修复**：给 Workspace 加 `onFramesWriteBack` 回调（或在 embedded 模式下由 desk 注入摘确认逻辑），任一帧成功写回即 `stripEpisodeConfirmation(data, currentEpisodeId)`。

#### SB-OL-03 ❌ 「清除线稿」清了等于没清

`handleClearLineArt` 只清 `shot.previewImageUrl / referenceImageUrl`：

- `storyboardPreview.frames` 里该镜的 frame（含 `imageUrl`）原样保留 → `isShotComposed` 命中 frame，徽章仍「已出图」、覆盖率不降、卡片仍显示图（`storyboardUrl` 兜底）；
- `chainStoryboard` 的 `lineArtUrl` 经 `mergeChainShot` 的 `base.lineArtUrl ?? normalized.lineArtUrl` 回填旧值，同样留存。

X-17 验收句「清除后徽章变缺图、覆盖率下降」**不成立**。
**修复**：清除时同步删除/置空对应 frame 的 `imageUrl`，并对 chain shot 显式 `lineArtUrl: null`（`mergeChainShot` 需允许显式 null 覆盖）。

#### SB-OL-04 ❌ spawn 导演台交接字段错位（`handoff` ≠ `lastHandoff`）

`openDirectorDesk` 无节点时走 `requestSpawn('director-desk', undefined, { connectToSource, handoff })`；`FlowSurface` 把 `pending.data` 原样展开进新节点 data → 导演台拿到的是 `data.handoff`。
但消费端（`DirectorDeskBlock` / `Director3dPanel` / `director-3d-stage-embed`）**只读 `data.lastHandoff`** → 首次 spawn 后交接校验必报「缺少交接数据」，`episodeConfirmed=false`，批出被阻断；用户必须回分镜台**再点一次**「打开导演台」（此时走 focus 分支写 `lastHandoff`）才通。
**修复**：spawn 时把 key 改为 `lastHandoff`（与 focus 分支一致），或导演台挂载时迁移 `data.handoff → lastHandoff`。

### 3.2 P1 · 闭环缝与可靠性

#### SB-OL-05 ⚠ 切集后闭包摘错集的确认

`setShotFrameUrl`（deps：`[getNodes, payload, props.id, updateNodeData]`）与 `generateShotLineArt` 的 deps 均**不含 `currentEpisodeId`**，而切集只改 `activeEpisodeId`、`payload` 引用不变 → 回调不重建。切到 B 集后上传图/单镜出线稿，`stripEpisodeConfirmation` 用的是**旧闭包里的 A 集 id**：摘掉 A 集确认、B 集保持「已确认」——反向撒谎。
**修复**：deps 补 `currentEpisodeId`，或在 `updateNodeData` 函数式回调里从 live data 现算当前集。

#### SB-OL-06 ⚠ 拆镜队列「跳过」不生效

`queueSkipEpisode` 只推进 `state.index`，但 `runQueueForEpisodes` 循环用**本地 `idx`**，两者不同步；且 `queueResumeRef` 仅在暂停挂起时被赋值，运行中点「跳过」什么都不发生。当前集照常拆完，进度显示与实际错位。
**修复**：循环内读 `queueStateRef.current.skipped`，本轮开始前若当前 episodeId 已被标 skip 则 `idx++ continue`；或把 skip 语义改成「中止当前集请求（abort）+ 标 skip」。

#### SB-OL-07 ⚠ 删镜/批量删/重置不清理孤儿帧

X-05 施工步骤明确「同步清理该 shot 在 `storyboardPreview.frames` 中对应帧」，现 `handleDeleteShot` / `handleDeleteSelected` 只改 breakdown。孤儿帧留存于 `frames` 与 `previewUrls`：本集统计因按 shotId 过滤暂不受影响，但复制镜→删原镜、导出、以及任何不带过滤的 frames 消费方都会吃到幽灵图。
**修复**：删除路径同步 `frames.filter(f => f.sourceShotId !== shotId)`。

#### SB-OL-08 ⚠ 就绪条 / 「未连图像」chip 不随画布变化刷新

`readiness` 与 `connectedPictureGenId` 的 `useMemo` deps 是 `[props.id, getNodes, getEdges]` —— 三者都是稳定引用，**首渲后永不重算**。用户连上图像节点 / 补齐上游设定后：功能路径没问题（生成时现查），但就绪条、「未连图像」chip、以及 `breakdownFromPackage` 里用的预检 gate 全是陈旧快照，硬模式可能凭旧数据误阻断/误放行。
**修复**：改用 `useNodes()/useEdges()`（组件已因 helpers 订阅而随画布重渲）或在关键动作前现查（gate 处已部分现查，展示层需修）。

#### SB-OL-09 ⚠ 导入旧镜表后 stale 检测永不触发

`packageStale` 依赖 `breakdownJob.sourcePackageHash`；`importLegacyBreakdown` → `applyBreakdownPayload` 不写 `breakdownJob` → 导入旧镜表的台子上游改稿**永远没有 Banner**。
**修复**：导入时若上游有 confirmed package，写入当时 hash（明知不同步则写空并直接显示「建议重拆」提示）。

#### SB-OL-10 ⚠ 宫格线稿不支持「缺图优先」且中途不可停

`generateBatchGridLineArt` 忽略 `batchScopeMode`，永远全量重出（已有线稿的镜也重打）；出图调用 `runPictureGenJob` 不接 `signal`，「停止」只能在页与页之间生效，单页 4 镜的出图请求无法中断。
**修复**：宫格路径同样按 `isShotComposed` 过滤缺图镜；`runPictureGenJob` 透传 AbortSignal。

#### SB-OL-11 ⚠ 工程债：主文件 3811 行且「hook 实为组件」

`useStoryboardDesk(props)` 直接返回 JSX，被 `StoryboardDeskBlock` 当组件调用。面板拆分（Q-01）做了一半：四个 Tab 面板已拆出，但编辑弹窗（约 600 行 JSX）、Stale Banner、pipeline、DevPack 仍堆在主文件里，比上一轮审计（2780 行）**反而更大**。HMR 后 Vite 空 chunk 风险（见仓库排障规则）随体量上升。
**修复**：至少拆出 `shot-edit-modal.tsx` 与 `stale-banner.tsx`；函数改名为组件命名。

### 3.3 P2 · 打磨

| ID | 项 | 说明 |
|----|----|------|
| SB-OL-12 | 关台「取消任务」覆盖不全 | 只 abort 批量线稿；单镜线稿、故事板合成、增量补拆的请求继续后台完成并写回（提示语「关闭会取消进行中任务」不完全成立） |
| SB-OL-13 | 撤销按钮态滞后 | disabled 读 `undoStackRef.current.length`，ref 变化不触发重渲；另字段编辑（saveShotEdit）不入撤销栈（按拍板仅结构变更，可接受但 tip 未说明） |
| SB-OL-14 | 增量补拆去重靠 shot id | AI 每次生成新 id，同段文本重复补拆会重复镜；有预览弹窗兜底，但预览里无「疑似重复」提示 |
| SB-OL-15 | DevPack Prompt 编辑不落盘 | `StoryboardDeskDevPack` 的 prompts 只存组件 state，从不 `updateNodeData` 写 `scriptBreakdownPrompts` → 界面可编辑但对实际拆镜无效（仅开发功能） |
| SB-OL-16 | 确认时覆盖率统计跨台取图 | `confirmCurrentEpisode` 的 urlMap 优先级 2 用 `getAllChainShots(getNodes())` 扫全画布，多分镜台并存时理论上会吃他台镜图（id 空间通常隔离，低风险） |

---

## 4. 建议收口顺序

### Phase 1（本轮必修，全部一天量级）

`SB-OL-01`（一行 import）→ `SB-OL-04`（改 spawn key）→ `SB-OL-03`（清帧 + chain null）→ `SB-OL-02`（嵌入预览摘确认）→ `SB-OL-05`（deps 补 currentEpisodeId）

### Phase 2（可靠性）

`SB-OL-06` 队列 skip → `SB-OL-07` 孤儿帧 → `SB-OL-08` 就绪条刷新 → `SB-OL-09` 导入 hash → `SB-OL-10` 宫格范围/可停

### Phase 3（工程）

`SB-OL-11` 拆文件 → P2 全项

---

## 5. 验收口诀（收口后逐条点选）

1. 选中首镜点「合镜」→ 出提示不崩溃。
2. 确认本集 → 在构图 Tab 嵌入预览里补一张缺图 → 顶栏/底栏立即不再「已确认」。
3. 清除某镜线稿 → 徽章变「缺图」、覆盖率下降、嵌入预览该帧消失。
4. 空画布只有分镜台 → 确认后点「打开导演台」→ 导演台**一次**就能通过交接校验并批出。
5. A 集确认 → 切 B 集上传一张图 → A 集仍「已确认」，B 集被摘。
6. 队列拆 3 集，第 2 集运行中点「跳过」→ 第 2 集请求中止、标记跳过、直接进第 3 集。
7. 删 1 镜 → `storyboardPreview.frames` 无该镜残帧。
8. 断开图像节点再重连 → 「未连图像」chip 实时消失。
9. 导入旧镜表后上游改稿并确认 → Stale Banner 出现。
10. 已有 10 张线稿点宫格「缺图」→ 只对缺图镜出图；出图中点停止 → 当页结束即停。
11. 两镜都有线稿后合镜 → 预览不再残留旧镜帧；新镜为缺图（需重出）。
12. 导演台已出彩图、分镜台无线稿 → 覆盖率不含该镜，徽章「缺图」。
13. 编辑镜字段后点撤销 → 字段与确认态恢复；重置本台后点撤销 → 镜表/预览/确认态回来。
14. 镜表顶栏可见「批量出线稿以构图为准」；构图 info 也写清卡片 ✨ 为快捷入口。
15. 清空节点镜表后刷新 → 会话草稿恢复镜表、线稿帧与确认态。
16. 画布两套「分镜→连贯性」链 → 连贯性跳转只 focus 本链上游 desk。

---

## 6. 明确不做（沿用产品拍板，禁止回潮）

- 分镜台恢复「试出」/ 彩色批出 / 底栏四按钮 / 嵌入预览 3D 主入口
- 评分 / 批审主路径回分镜台（留导演台）
- 第二套平行分镜台 / 新 Desk kind
- 写回全局 `workspace.storyboard` 作为主真相

---

## 附：关键代码锚点

| 主题 | 路径 |
|------|------|
| 主 hook（实为组件） | `apps/web/src/blocks/craft/storyboard-desk/use-storyboard-desk.tsx` |
| 四面板 | 同目录 `breakdown-panel / grid-panel / compose-panel / handoff-panel` |
| 镜卡片 | `apps/web/src/blocks/craft/storyboard-desk/shot-story-cell.tsx` |
| 结构纯函数 | `apps/web/src/engine/storyboard-desk-runner.ts` |
| 嵌入预览 | `apps/web/src/engine/stage-deck/chrome/attached-workspace/storyboard-preview/StoryboardPreviewWorkspace.tsx` |
| 交接消费 | `apps/web/src/blocks/core/DirectorDeskBlock.tsx`（`data.lastHandoff` + `validateDirectorHandoff`） |
| spawn 落地 | `apps/web/src/engine/FlowSurface.tsx`（`pending.data` 直接展开） |
| 队列 | `packages/shared/src/utils/episode-breakdown-queue.ts` |
| 按集大图 / chain | `packages/shared/src/utils/chain-storyboard.ts`（`mergeChainShot` 回填语义） |
| 测试 | `apps/web/src/blocks/craft/__tests__/StoryboardDeskBlock.test.tsx` |

---

**文档结论**：分镜台主链骨架与上一轮 Phase A/B 排期项基本收口；当前风险集中在 **4 个 P0 断点**（合镜崩溃、嵌入预览确认缝、清除线稿失效、spawn 交接错位）与若干闭环缝。按 §4 顺序收口后，分镜台可达「状态诚实、可停可悔、交接一次通」的生产级判定。
