# NX9 · 休眠能力接线 R2

> 本批目标：继续找出**「有实现、无入口」的休眠能力**并接线成开箱可用功能。
> 全部增量追加，不留 TODO，不新增第三方依赖，不新增持久化字段名。
>
> 硬边界（遵守，未触碰）：`packages/shared/src/data/{emotion-presets,shot-move-families,creative-asset-presets,character-face-rig-presets,playbook-definitions,camera-presets,shot-library-seeds,shot-lexicon-taxonomy,provider-registry}.ts`
> 9 个缺失模块与 `packages/shared/src/index.ts` 中指向它们的既有 import 一律未创建、未修改。

---

## 1. 扫描方法

三类扫描全部用 **node** 完成（本机 `grep`/`Select-String` 不可靠，会假绿/假阴），判定只看退出码。
扫描脚本置于系统临时目录（`%TEMP%/nx9scan/`），未用任何删除类命令。

| 脚本 | 作用 |
| --- | --- |
| `common.js` | 文件遍历（排除 `node_modules`/`dist`/`__tests__` 等）、去注释、词边界匹配 |
| `scan-api.js` | 解析 `apps/web/src/api/client.ts` 的 `api` 对象块，逐方法匹配 `api *.* name`（**容忍换行/空白**），统计全仓调用方 |
| `scan-engine.js` | 从 `apps/web/src/main.tsx` 做**模块可达性 BFS**（静态 + 动态 import + 相对/别名解析），并统计 engine 目录导出符号的引用 |
| `scan-engine-runtime.js` | 区分 runtime 导出与纯 type 导出，剔除「只被测试引用」 |
| `scan-shared.js` | `packages/shared/src/utils/**` 导出符号的生产引用（排除测试） |
| `scan-refine.js` | 对每个「零引用」导出补测**同文件内**引用次数，剔除「只是导出多余」的假阳性 |

### 关键方法论修正（避免假结论）

1. **`api.probeProviders` 假阳**：初版正则 `\bapi\.name` 无法跨换行，`SettingsModal.tsx:1452` 的
   `api\n  .probeProviders()` 被误判为死代码。改为 `\bapi\s*\.\s*name` 后死方法从 **36 → 32**。
2. **同文件引用假阳**：`script-consistency.ts` 的 9 个 `check*` 由同文件 `runConsistencyChecks` 聚合调用，
   并非休眠；engine 层 156 个「生产零引用」导出里有 **83** 个属于此类。真正的零引用为 **73**。
3. **barrel 缺陷影响**：`packages/shared/src/index.ts` 当前有 365 行未提交新增，其中 8 处 import 指向不存在的
   `./data/*` 模块，导致 `@nx9/shared` 解析失败（vitest 别名指向该源码）。因此**本批所有新增模块与单测
   一律相对路径直取源码**，不依赖 barrel。

---

## 2. 扫描原始结论

### 2.1 API 层（`apps/web/src/api/client.ts`）

- 导出方法总数：**135**
- 全仓无调用方：**32**（且都不是「另有 fetch 直连」——逐条比对过 HTTP path 字符串）
- 本轮接线：**0**

<details>
<summary>32 项清单</summary>

`getSettingsRaw` `/api/settings/raw`；`getConnectionStatus` `/api/settings/connection-status`；
`proxyLlmStream` `/api/gateway/llm/stream`；`readGenPack`；`reindexSkills` `/api/skills/reindex`；
`agentShotScript`、`dialogueParse`、`storyboardTable`、`directorPlan`、`materializeShots`、`sceneSplit`、
`extractEnvironments`、`scriptSkill`、`novelEvents`、`scriptSkeleton`、`scriptAdaptation`（`/api/agent/**`）；
`seedSeedanceSkills` `/api/skills/seed/seedance`；`gridGenerate`、`gridShotSketch`（`/api/grid/**`）；
`quickMontage`、`replicateVideo`（`/api/tools/**`）；`exportContactSheet`、`checkReviewGate`、`exportTimelineJson`
（`/api/montage/**`）；`ffmpegStatus` `/api/montage/ffmpeg`；`listAssets` `/api/assets/uploads`；
`listTasks` `/api/tasks`；`exportWorkspaceJson`、`importWorkspaceJson`；`bootstrapUser` `/api/users/bootstrap`；
`cancelMontageTask`、`cancelRemotionTask`。

</details>

**逐项判定（全部「不接」，理由）**：

| 类别 | 项 | 不接理由 |
| --- | --- | --- |
| 画布/工作区归档 | `exportWorkspaceJson` / `importWorkspaceJson` | 与已接的**工作流 ZIP 归档**（见 3.1）语义重叠。再接会形成**第二套导出/恢复来源**，违反「不造第二套同类来源」。二者只能取一，本批取粒度更完整（含内嵌资源）的 ZIP。 |
| 剪辑/分镜产物 | `exportContactSheet` / `exportTimelineJson` | 全仓无既有控件位；「导出」区已由 `ExportPackBlock`（ZIP / FFmpeg / 多轨 / HF / Studio 包）与 `useStoryboardSheetExportOps` 覆盖，新增入口即第二套导出源。 |
| 审核闸门 | `checkReviewGate` | 审核闸门已有既有真源：`director-desk-runner.syncDirectorReviewGateFromShots` + `review-gate-session.openReviewGateSession`（均在用）。再接服务端闸门会产生**两套闸门判定**。 |
| 剧本生产链 | `directorPlan` / `materializeShots` / `sceneSplit` / `extractEnvironments` / `storyboardTable` / `agentShotScript` / `dialogueParse` / `novelEvents` / `scriptSkeleton` / `scriptAdaptation` / `scriptSkill` | 编剧台 / 分镜台已有完整在用的生产链（`script-desk-runner`、`script-breakdown-runner`、`storyboard-desk-runner`）。这些是**同能力的另一入口**，接线即双真源。 |
| 出图/出视频 | `gridGenerate` / `gridShotSketch` / `quickMontage` / `replicateVideo` | 需新建独立面板；且 `MultiGridBlock` / `MultiGridWorkspace` 已覆盖多格推演，`tpl-link-replicate` 配方已覆盖链接复刻。属**新功能**而非「接线」。 |
| 供应商/连接 | `getSettingsRaw` / `getConnectionStatus` / `proxyLlmStream` / `reindexSkills` / `seedSeedanceSkills` / `readGenPack` | 属服务端运维/诊断面；`SettingsModal` 已有「探测模型」（`api.probeProviders`，实际在用）覆盖用户可感知部分。`proxyLlmStream` 的流式能力已由 `scriptDeskChatStream` / `scriptScreenplayStream` 覆盖。 |
| 任务与用户 | `listTasks` / `cancelMontageTask` / `cancelRemotionTask` / `listAssets` / `bootstrapUser` / `ffmpegStatus` | 取消/列表能力已被既有轮询与历史（`ExportPackBlock` 导出历史、`useTaskPoll`、`use-task-stream`）覆盖；`bootstrapUser` 已被 `authRegister`/`authLogin` 流程取代。 |

### 2.2 引擎层（`apps/web/src/engine/**`）

- engine 源文件（排除测试）：**219**
- 从 `main.tsx` **不可达**的模块：**23**（整棵子树为孤儿）
- 导出符号「生产零引用」：**156** → 剔除「仅同文件使用」后**真正零引用：73**

<details>
<summary>23 个不可达模块（均为孤儿，本轮不接）</summary>

`blocking-3d-sync.ts`、`core-pipeline-graph.ts`、`NodeActionBar.tsx`、`one-click-agent.ts`、
`use-bible-image-gen.ts`、`use-chain-storyboard.ts`、`use-unified-mentions.ts`、
`stage-deck/index.ts`、`stage-deck/chrome/{PromptBar,ComposerDeck,PlaybookStepBar}.tsx`、
`stage-deck/chrome/prompt-bar/{PromptBarRouter,PromptBarEditors,PromptBarAssetStrip,PromptBarGenFooter,PromptComposer}.tsx`、
`stage-deck/chrome/attached-workspace/{WorkspaceAiTools,WorkspaceHeader}.tsx`、
`stage-deck/interaction/mention-editor.ts`、`stage-deck/modes/explore-mode.ts`、
`stage-deck/stores/{canvas-agent-store,canvas-view}.ts`、`stage-deck/utils/generation-history.ts`

**不接理由**：这是一整棵被替换掉的旧 prompt-bar / shell 组件树（现役入口是 `attached-workspace` 下的
`prompt/*`、`ComposerWorkspaceShell`、`PromptWorkspace`）。接回去等于**并行启用两套输入面板**，
是典型的「造第二套同类来源」；且其中多个文件与现役实现职责重叠（如 `mention-editor` vs
`AssetMentionInput`、`use-unified-mentions` vs 现役 @ 提及）。属**应清理**而非应接线。

</details>

**73 项真正零引用导出的判定**：

| 子类 | 项数（示例） | 判定 |
| --- | --- | --- |
| 本轮**接入** | `suggestCameraPosition`、`exportWorkflowZip`、`downloadBlob`、`buildCharacterCandidatePrompt`、`buildSceneCandidatePrompt`、`scriptCandidateCharacterKeys`、`copyTextWithLog`（7 项） | **接**，见第 3 节 |
| 薄包装 / 重复真源 | `applyBibleDraftsToLibrary`（= `syncBibleAssets` 的别名）、`pollClipTask`（= `pollVideoUntilDone` 包装）、`getGenPackSync`、`mapStepStatus`/`mapStepToStatus`（= `evaluateStepVisualState` 的重复映射，另见 2.3） | 不接：**重复真源** |
| 纯内部工具 / 常量 | `CONSISTENCY_FACE_CACHE_MAX`、`BEAT_GRID_CACHE_MS`、`MAX_PICTURE_PREVIEW_URLS`、`MAX_PICTURE_GENERATION_HISTORY`、`PROVIDER_NATIVE_REF_LIMIT`、`providerRefLimit`、`CELL_GEN_*_CONCURRENCY`、`PANORAMA_720_PROMPT_SUFFIX`、`CONTACT_SHEET_METRICS`、`LOCAL_MEDIA_MENTION_PREFIX`、`MENTION_TOKEN_RE`、`COMPOSER_PROMPT_BODY_CLASS`、`SCENE_GROUP_PAD/HEADER`、`pictureProActionsByCategory`、`lookupPictureGenModeDef`、`modeNeedsStyleRef`、`modeAllowsMultiRef`、`interactionClassOf`、`nodeRect`、`blockLabel`、`filterBlockKindsForHandle`、`getLoopConfig`、`parseLoopVariants`、`collectDownstreamWithin`、`computeUpstreamInputHash`、`collectUpstreamIds`、`mapEdgesToChannel`、`displayScaleForFrame` | 不接：**纯内部工具**（其中多数是「导出多余」，同文件已在用） |
| 测试专用钩子 | `resetFirstLaneForTests`、`clearBeatGridCache`、`readCachedBeatGrid`、`beatGridInflightCount`、`beatsToBoundaries`、`clearConsistencyFaceCache`、`consistencyFaceCacheSize`、`getBlockRunAbortSignal`、`retiredShotIds`、`DESK_SESSION_DRAFT_VERSION`、`resolveMultiGridCellShotId`、`previewNodePatch`、`runRoundsWithConcurrency` | 不接：**仅测试口径**，无用户价值 |
| 需新建 UI 才能用 | `auditCorePipeline` / `repairCorePipeline`、`runOneClickAgent`、`exportWorkflowZip`（已接）、`collectGenerationHistoryItems`、`runCharacterSceneSkill`、`validateTimeline`、`calibrateTimeline`、`detectSuggestionConflicts`、`resolvePerfToastFromGraph`、`projectBreakdownToWorkspace`、`suggestedTrialCap`、`timelineCellsFromShots`、`syncBlockingToDirector3d` / `syncDirector3dToBlocking`、`extractDirectorCharacterPlacements`、`resolveCharacterSheetRunPlan`、`resolveMultiGridRunPlan`、`resolvePictureGenNodeForShot`、`ensureCorePipelineNodes`、`extractCostumeNames` / `extractPropNames`、`hookLabelsFromBrief`、`pushHookTextToBrief`、`renameCharacterInPendingPatch` | 不接：**需新建面板或流程**，超出「接线」范畴；且 `syncBlockingToDirector3d` 类与现役 `director3d-host-controller` 通道重叠，接入会形成双写 |
| 孤儿树内成员 | `PromptBar`、`ComposerDeck`、`PlaybookStepBar`、`WorkspaceAiTools`、`WorkspaceHeader`、`PromptBarEditorRouter`、`useCanvasAgentStore`、`useCanvasView`、`EXPLORE_MODE`、`isExploreMode`、`PRODUCE_MODE`、`REVIEW_MODE`、`createStageDeckNodeTypes`、`insertMentionToken`、`serializeMentionPrompt`、`detectMentionQuery`、`WorkflowZip` 相关外的 `exportWorkflowZip` 同目录成员、`useChainStoryboard`、`useBibleImageGen`、`useUnifiedMentions`、`runOneClickAgent`、`NodeActionBar`… | 不接：**孤立子树的成员**，接线等于复活整棵旧树（见上） |

### 2.3 共享工具层（`packages/shared/src/utils/**`）

- 文件数：**94**
- runtime 导出「生产零引用」：**15** → 剔除「仅同文件使用」（11 项，主要是 `script-consistency.ts` 的
  9 个 `check*`，由同文件 `runConsistencyChecks` 聚合）后，**真正零引用：4**
- 纯 type 导出零引用：**9**（分布于 7 个文件，均无用户价值）
- 本轮接线：**0**

| 项 | 原状 | 判定 | 理由 |
| --- | --- | --- | --- |
| `playbook-step-visual.mapStepStatus` | 零引用 | **不接** | 与同文件已在用的 `evaluateStepVisualState` 职责重复，只是多一层 status 映射 → **重复真源** |
| `playbook-step-visual.mapStepToStatus` | 零引用 | **不接** | 同上，是 `evaluateStepVisualState` 的直接转发 |
| `migrate-timeline-draft.migrateGlobalTimelineDraft` | 仅测试引用 | **不接** | 全局时间线草稿迁移已由 `timeline-migrate` / `clip-editor-render` 现役路径承担，接入会形成**第二套迁移真源** |
| `migrate-timeline-draft.clipEditorHasTimelineDraft` | 仅测试引用 | **不接** | 同上，且调用方需自行提供判定，属内部谓词 |
| `character-sheet-prompt.collectCharacterSheetPictures` 等 11 项「仅同文件使用」 | 同文件在用 | 不接 | **非休眠**，只是导出多余 |

---

## 3. 接入清单

三项接线，全部落在**既有工作区 / 既有控件位**，均不新增持久化字段名。

### 3.1 画布工作流归档导出 / 导入（引擎层）

| 项 | 内容 |
| --- | --- |
| **原名** | `stage-deck/utils/workflow-zip.ts`：`exportWorkflowZip`、`downloadBlob`（**全仓零调用方**）；`importWorkflowZip`（只被 `FlowSurface` 注册进 runtime，**没有任何 UI 触发**） |
| **原状** | 用户能「看到能力存在」但无法触发：导出侧连 runtime 都没注册；导入侧注册了却无按钮/命令 |
| **接入位置** | ① `stores/flow-runtime.ts` 的 `FlowRuntimeApi` 追加 `exportWorkflowZip(selectionOnly?)`；② `engine/FlowSurface.tsx` 实现并注册（与既有 `importWorkflowZip` 对称，走同一 `ref` 模式）；③ **既有** `stage-deck/chrome/CommandPalette.tsx`「命令」区追加 3 条命令：`导出 · 工作流归档` / `导出 · 工作流归档（仅选区）` / `导入 · 工作流归档`。命令面板是现役入口（`FlowSurface` 渲染 + `Ctrl/⌘+K`、`/` 热键） |
| **写入形态** | `exportWorkflowZip({ workspaceId, nodes, edges, viewport, nextBlockIndex, selectionOnly, v3Extras })` → Blob → `downloadBlob(blob, fileName)`。**不写任何工作区字段** |
| **幂等与清除** | 非注入类（一次性动作）。幂等性体现在**重复触发结果一致**：文件名由 `buildWorkflowArchiveFileName(workspaceId, new Date())` 生成；空画布 / 空选区由 `workflowArchiveBlockReason` **拒绝并抛错**（沿用仓库「禁止空成功」口径），不会产出空归档 |
| **新增纯逻辑** | `engine/workflow-archive.ts`：`WORKFLOW_ARCHIVE_EXTENSION`、`buildWorkflowArchiveFileName`、`workflowArchiveBlockReason` |

### 3.2 分镜「机位建议」幂等注入（引擎层）

| 项 | 内容 |
| --- | --- |
| **原名** | `engine/director-desk-runner.ts`：`suggestCameraPosition`（由景别 / 运镜 / 角度 / 镜头库绑定推导 3D 摆位文本建议） |
| **原状** | **全仓零调用方**（0 生产引用、0 同文件引用）—— 纯实现无入口 |
| **接入位置** | **既有**分镜台镜头编辑弹窗 `blocks/craft/storyboard-desk/shot-edit-modal.tsx`，紧接既有「运镜合流（只读）」区块之后新增一个 `sg-field` 区块（与既有「大师运镜库 / 运镜时间轴」同列同风格） |
| **写入形态** | 只写**既有** `videoPrompt` 字段：`setEditDraft({ ...editDraft, videoPrompt: withShotBlockingHint(editDraft.videoPrompt, source, suggestCameraPosition) })`。新增独立提示词行前缀 `机位建议：`，输出形如 `机位建议：客厅 · 推机位，焦段 1m · overhead · 1m` |
| **幂等与清除** | ① **幂等**：按前缀整行识别并替换，反复套用只保留一行、结果逐字相同（断言 `withShotBlockingHint(x, S) === withShotBlockingHint(withShotBlockingHint(x, S), S)`）；② **可清除**：弹窗「清除机位建议」按钮传 `null`，前缀行被移除且其余正文**逐字还原**；③ **不影响既有注入**：`camera movement:` / `运镜：`（大师运镜、运镜时间轴）与预设段落行（`cinematic style:` / `lighting:` / `portrait:` / `anime style:`）一律原样保留，且与 R1 的 `preset-entrypoints` 双向交叉验证（先预设后建议 / 先建议后预设 / 各自清除互不误删）；④ **无信号不注入**：镜头无描述、无景别/运镜/角度/镜头库绑定时不把 `suggestCameraPosition` 的兜底默认值当建议写入 |
| **新增纯逻辑** | `engine/shot-blocking-hint.ts`（**依赖注入**：不 import `director-desk-runner`，真实建议函数由弹窗传入；这样单测不经过含缺失模块的 barrel） |

### 3.3 候选设定 Prompt 一键复制（引擎层）

| 项 | 内容 |
| --- | --- |
| **原名** | `engine/script-asset-candidates.ts`：`buildCharacterCandidatePrompt`、`buildSceneCandidatePrompt`、`scriptCandidateCharacterKeys`、`copyTextWithLog` |
| **原状** | 4 项均**全仓零调用方**（同文件的 `sceneCandidateToWorkspaceItem`、`workspaceItemToEnvironmentProfile` 已在用，说明这 4 项是遗漏未接的同伴） |
| **接入位置** | **既有**「设定就绪」面板 `components/asset/AssetReadinessPanel.tsx`（由现役 `ScriptDeskBlock` 渲染），在既有「服装/道具警告层」之后、既有「操作按钮」之前追加一个新 `sd2-ready-section`，逐角色 / 逐场景一个复制 chip |
| **写入形态** | **只读复制**：`copyTextWithLog(buildCharacterCandidatePrompt(profile), appendLog, ...)` / `copyTextWithLog(buildSceneCandidatePrompt(env), ...)`。不写工作区任何字段（守卫测试断言其中不含 `upsertCharacter` / `upsertBacklotWorkspace` / `updateNodeData`） |
| **幂等与清除** | 非注入类。幂等体现为**同一档案重复点击产出同一段文本**（纯函数，无累计）。未入库条目 chip 置为 warn 态并禁用写入语义（点击给出 `toastError` 提示先建档） |
| **复用存量（不造第二套来源）** | 名单来源是面板**既有**的 `report.requiredCharacters` / `report.requiredScenes`；档案来源是**既有** `useWorkspaceDocument` 的 `characters.characters` 与 `environments.environments`；角色查档用 `scriptCandidateCharacterKeys`（name / nickname / aliases）以兼容别名命中 |
| **新增组件** | `components/asset/AssetCandidatePromptCopy.tsx` |

---

## 4. 未接清单与原因（摘要）

| 未接项 | 原因类别 |
| --- | --- |
| API 层 32 项 | ① 与已接能力语义重叠，再接即第二套来源（`exportWorkspaceJson`/`importWorkspaceJson`/`checkReviewGate`/`exportContactSheet`/`exportTimelineJson`）；② 与现役生产链重复（`/api/agent/**` 共 11 项）；③ 需新建面板（`gridGenerate`/`quickMontage`/`replicateVideo` 等）；④ 服务端运维/诊断面（`getSettingsRaw`/`getConnectionStatus`/`reindexSkills`/`seedSeedanceSkills` 等）；⑤ 已被现役轮询/历史覆盖（`listTasks`/`cancel*Task`/`listAssets`/`ffmpegStatus`） |
| engine 23 个不可达模块 | 被替换掉的旧 prompt-bar / shell 组件树；接回即并行两套输入面板，属应清理而非应接线 |
| engine 73 项零引用导出中的 66 项 | 薄包装 / 重复真源 / 纯内部工具 / 仅测试钩子 / 需新建 UI 或与现役通道重叠（双写风险） |
| shared utils 4 项 | `mapStepStatus`/`mapStepToStatus` 是 `evaluateStepVisualState` 的重复映射；`migrateGlobalTimelineDraft`/`clipEditorHasTimelineDraft` 与现役 `timeline-migrate` 路径构成第二套迁移真源 |
| shared utils 9 个纯 type 导出 | 无用户价值（无入口可接） |

对上述「未接」项已在单测中设置**反向守卫**（见 5.3），防止日后被无理由误接。

---

## 5. 验证口径

### 5.1 新单测（相对路径直取源码，不依赖 barrel）

```
apps/web/src/engine/__tests__/r2-shot-blocking-hint.test.ts        9 tests
apps/web/src/engine/__tests__/r2-dormant-wiring-guards.test.ts     9 tests
```

命令（`vitest` 未在 `apps/web/node_modules/.bin` 链接，故直取 pnpm store 内二进制；cwd = `apps/web`）：

```bash
cd apps/web
node ../../node_modules/.pnpm/vitest@4.1.10_@types+node@2_1560338524d7ac6987c854e41f5f3061/node_modules/vitest/vitest.mjs \
  run --config vitest.config.ts \
  src/engine/__tests__/r2-dormant-wiring-guards.test.ts \
  src/engine/__tests__/r2-shot-blocking-hint.test.ts
```

结果：`Test Files 2 passed (2)` / `Tests 18 passed (18)` / **exit code 0**。

覆盖点：

- **3.2 幂等性/清除/不影响既有注入**：连续注入 5 次逐字相同且仅一行；清除后与原文逐字一致；镜头切换只替换不堆叠；`camera movement:` / `运镜：` / 预设段落行在两种顺序下均保留；无信号不注入；既有注入行存在但镜头无信号时仍可清除；无尾空行堆积；空白字段归一。
- **与 R1 注入层交叉**：真实调用 `preset-entrypoints` 的 `withCinemaPrompt` / `withLightRigPrompt` / `readPresetSections`，验证双向互不覆盖、各自清除互不误删。
- **3.1 / 3.3 接线守卫（源码级，防退回零入口）**：`FlowRuntimeApi` 含 `exportWorkflowZip`；`FlowSurface` 使用 `exportWorkflowZip`/`downloadBlob`/`buildWorkflowArchiveFileName` 并注册；`CommandPalette` 含 3 条命令与对应 `run`；`AssetReadinessPanel` 挂载 `AssetCandidatePromptCopy` 并传入既有名单；复制组件引用 4 个被复活的构造器且不写任何字段。
- **5.3 未接守卫**：见下。

### 5.2 反向对照（证明测试有牙）

| # | 注入的错断言 | 期望 | 实测 |
| --- | --- | --- | --- |
| 1 | `r2-shot-blocking-hint.test.ts` 幂等用例：`toHaveLength(1)` → `toHaveLength(2)` | 必须失败 | **FAIL**，`AssertionError: expected [ Array(1) ] to have a length of 2 but got 1`，**exit code 1** |
| 2 | `r2-dormant-wiring-guards.test.ts` 未接守卫：`toEqual([])` → `toEqual(['NONEXISTENT'])` | 必须失败 | **FAIL**，`received []` vs `expected ['NONEXISTENT']`，**exit code 1** |

两次对照均**用临时副本回写恢复**（`%TEMP%/nx9scan/*.bak`），未使用 `git show HEAD:file > file`，
恢复后复跑均回到 `18 passed / exit 0`。

### 5.3 未接项守卫

`r2-dormant-wiring-guards.test.ts` 扫描 `apps/web/src` + `apps/server/src` + `packages/**/src`
（排除 `__tests__` 与 `*.test.*`），断言：

1. `mapStepStatus`、`mapStepToStatus`、`migrateGlobalTimelineDraft`、`clipEditorHasTimelineDraft`
   在定义文件之外**零引用**。若日后有人接线而不更新本文档的判定理由，该断言失败，并在失败信息里直接给出指引。
2. 反方向：本轮 7 个接入项在**定义文件之外必须有调用方**（防「接了又断」）。

### 5.4 全量回归前后基线对照

| 指标 | 变更前 | 变更后 | 差异 |
| --- | --- | --- | --- |
| 测试文件总数 | 155 | 157 | +2（本批新增 2 个测试文件） |
| 失败文件数 | **84** | **84** | **0** |
| 通过文件数 | 71 | 73 | +2 |
| 用例总数 | 856 | 874 | +18（本批新增） |
| 失败用例数 | **2** | **2** | **0** |
| 通过用例数 | 853 | 871 | +18 |
| 失败错误签名差异（共有失败文件） | — | — | **0** |
| 新增失败文件 | — | — | **0** |
| 转为通过的文件 | — | — | **0** |

- 84 个失败文件**全部且仅由已知硬缺陷**导致：`Failed to resolve import "./data/<x>" from "packages/shared/src/index.ts"`
  （即本批禁止修复的 8 个缺失模块），逐一比对错误签名一致。
- 类型检查（`apps/web`: `tsc -b --noEmit`）：本批新增/新增改动的 R2 文件 **0 错误**；
  改动前后总错误行 **228 → 222**（-6，全部是新增测试文件自身已修掉的 `readdirSync` 类型错误）；
  其余错误（stale `dist/esm/index.d.ts` 导致的 `@nx9/shared` 缺导出等）为既有，未增未减。

---

## 6. 改动文件清单

### 新增（全部为本批）

| 文件 | 行数 |
| --- | --- |
| `apps/web/src/engine/shot-blocking-hint.ts` | 182 |
| `apps/web/src/engine/workflow-archive.ts` | 59 |
| `apps/web/src/components/asset/AssetCandidatePromptCopy.tsx` | 156 |
| `apps/web/src/engine/__tests__/r2-shot-blocking-hint.test.ts` | 149 |
| `apps/web/src/engine/__tests__/r2-dormant-wiring-guards.test.ts` | 230 |
| `docs/NX9-DORMANT-CAPABILITY-WIRING-R2.md` | 本文件 |

### 既有文件（**纯追加，0 删除**）

| 文件 | `git diff --numstat` 新增 | 其中本批 R2 | 会话前未提交（非本批） |
| --- | --- | --- | --- |
| `apps/web/src/blocks/craft/storyboard-desk/shot-edit-modal.tsx` | 224 | **104** | 120 |
| `apps/web/src/engine/FlowSurface.tsx` | 65 | **65** | 0 |
| `apps/web/src/engine/stage-deck/chrome/CommandPalette.tsx` | 42 | **42** | 0 |
| `apps/web/src/components/asset/AssetReadinessPanel.tsx` | 9 | **9** | 0 |
| `apps/web/src/stores/flow-runtime.ts` | 2 | **2** | 0 |
| **小计** | **342** | **222** | **120** |

**逐行归属说明**：`git diff --numstat` 会混入会话前既有未提交改动。上表对 5 个文件全部按
「本批插入区块在文件中的实际行范围」逐块量取（区块定位脚本见 `%TEMP%/nx9scan/count-mine.js`）：

- `shot-edit-modal.tsx`：本批 4 处插入 —— 导入 9 行（L28–35 区间内）、机位建议 memo 33 行（L117–149）、
  UI 区块 63 行（L331–393）；其余 120 行为会话前既有改动（该文件在会话开始时就已处于 `M` 状态）。
- `FlowSurface.tsx`：导入 7 行（L85–91）、导出实现 57 行（L685–741）、runtime 注册 1 行（L1822）= 65，
  与会话开始时的 `git status` 一致（该文件不在初始 `M` 列表中）。
- `CommandPalette.tsx`：`pickWorkflowArchive` 19 行（L98–116）+ 3 条命令 23 行（L254–276）= 42。
- `AssetReadinessPanel.tsx`：导入 1 行 + 挂载区块 8 行 = 9。
- `flow-runtime.ts`：接口新增 2 行。

**本批实际新增行数合计**：新文件 776 行（不含本文件）+ 既有文件追加 222 行 = **998 行**。

---

## 7. 偏差 / 未完成 / 未验证项

1. **基线口径偏差（已说明）**：变更前基线是在两个**新增、且当时无任何 import 的**模块
   （`shot-blocking-hint.ts` 初版、`workflow-archive.ts`）落盘之后采集的。二者不被任何测试引用，
   对结果无影响；基线的「155 个测试文件」与原始口径一致可佐证。
2. **未运行服务端测试套件**：本批未新增/修改任何服务端代码，但 4 个服务端测试会以
   `toContain` 方式读取本批改动过的 web 源码（`f017`→`shot-edit-modal.tsx`、`f005`/`f051`→
   `AssetReadinessPanel.tsx`、`ux-first-lane`/`f010`→`CommandPalette.tsx`）。已逐条核对断言目标字符串
   未被触碰，但因本批未采集服务端基线，**未做前后对照**，此项为未验证。
3. **未做真实浏览器端到端验证**：三项入口的「可点到达」是用模块可达性 BFS + 源码级守卫测试证明的
   （`CommandPalette` ← `FlowSurface`，`AssetReadinessPanel` ← `ScriptDeskBlock`，`ShotEditModal` ←
   `use-storyboard-desk`），**未**在 dev server 上做人工点击验证。原因：`@nx9/shared` barrel 当前
   含 8 个缺失模块（禁止本批修复），dev server 无法正常解析。
4. **`flow-runtime.ts` 的 `FlowRuntimeApi` 新增必填成员**属接口扩大：目前只有 `FlowSurface` 构造该对象
   （类型检查已通过）；若日后有第三方以对象字面量实现该接口，需同步补齐。
5. **API 层本轮 0 接线**：这是经逐项判定后的结论（32/32 项均有明确「不接」理由），非遗漏。
   若后续希望补上「工作区级 JSON 导出」，需先撤销 3.1 的 ZIP 归档入口以避免两套来源。
6. `shot-edit-modal.tsx` 的 120 行会话前未提交改动、以及仓库其余 ~140 个未提交/未跟踪文件
   （`.gitignore`、`README.md`、`packages/director3d/**`、`packages/shared/src/index.ts` 等）
   **一律未触碰**，除上表 5 个文件的追加区块外。
7. **「禁止创建的 9 个路径」现状核实**：本批对 9 个路径**未创建、未修改任何一个**。
   核实结果：`emotion-presets` / `shot-move-families` / `creative-asset-presets` /
   `character-face-rig-presets` / `playbook-definitions` / `camera-presets` /
   `shot-lexicon-taxonomy` / `provider-registry` 共 8 个**仍不存在**；
   `shot-library-seeds.ts` **在会话开始前就已存在且未被 git 跟踪**（mtime `2026-09-15 14:54:58`，
   早于本次会话约 7.5 小时），本批没有读写它 —— 该文件是既往批次的既有产物，非本批新增。
   `packages/shared/src/index.ts` 的 `git diff --numstat` 仍为 `365 0`（与会话开始时一致），
   指向上述路径的既有 import 未改。
