# NX9 全项目未闭环问题 · 全面审计报告（第二轮深挖增强版）

> **日期**：2026-08-12（第二轮深挖，覆盖并取代同日第一轮结论）
> **范围**：节点体系、五大主链节点、智能剪辑台、素材库、**工具类节点全量**、**声音链全量**、**导出/渲染服务端全量**、持久化与工程债
> **方法**：第一轮以文档对照代码；第二轮**逐分支重读 flow-runner 全部 kind 分支 + 服务端模块 + 工作树新增文件**。工作树在两轮之间发生了大规模收口（智能剪辑台整层重做、DirectorKeyframeBatch、A 路径组装器、director-3d 独立节点等均已落地），**本文以当前工作树实况为准，第一轮标 P0 的项目大量转为 ✅，切勿按旧结论开票**。
> **原则**：以「生产闭环可验收」为准，不以「字段 / 按钮 / 文档已存在」为准
> **判定符号**：❌ 断点（缺能力或状态撒谎）· ⚠ 半闭环 · ✅ 已修复/已闭环（本轮代码级核实）· 🧟 死代码 · ⏸ 明确后置 · ❓ 本轮未复核（维持上轮判定，使用前需再验）

---

## 0. 总体结论（一页读完）

1. **上一轮的六大 P0 几乎全部已在工作树修复**（代码级证实）：合镜崩溃 ✅、清线稿残留 ✅、图像 usedAssetIds/全景守卫 ✅、A 批量路径组装器+并发重试+记账 ✅、DirectorKeyframeBatch 消费闭环 ✅、独立 director-3d 节点 ✅。
2. **智能剪辑台已整层重做**（工作树新增 `blocks/core/clip-editor/` 8 文件）：真多轨时间轴（移动/裁剪/分割/涟漪/转场/静音/锁轨）、`@remotion/player` 帧精确预览、撤销重做、快捷键、probe 时长校准、结构化建议 ops、轨道 ID v3 迁移、服务端 Remotion 渲染+轮询、生成式智能替换（抽帧→蒙版→图编→图生视频→对比→回写）——旧报告 §7「整层缺失」结论作废。
3. **当前最大的一类现行缺陷是「假成功」，全部集中在声音与渲染服务端**：
   - **SRV-01** BGM 网关 sleep 3 秒返回不存在的 mp3（仍在）；
   - **SRV-02（新发现，P0）** HyperFrames 服务端 producer 不可用时用 FFmpeg 渲一条**纯黑视频**并标 `done`；
   - **SRV-03（新发现）** HyperFrames `cancelTask` 只改状态字段，渲染协程跑完后把 `cancelled` 覆写回 `done`（F-046 缺口的代码实锤）；
   - **SND-01（新发现，P0）** sound-gen 画布 Run 完全无视 `soundMode`：BGM 模式节点从画布跑会**把 BGM 描述文字念成配音**并标 success；多角色模式退化为单轨 TTS。
4. **第二大类是「画布 Run 与台内实现漂移」**：智能剪辑台重做后，flow-runner 的 clip-editor 分支没有跟进——remotion 引擎下画布 Run 直接标 success 但零产出（**SE-01，P0**）；drama 编排读全局 storyboard；ffmpeg 路径无视时间线。同类漂移还有 inpaint-edit（工作台不做 shot 写回）与 sound-gen。
5. **工具类节点深挖新增一批中低危**：iterator 单跑不自增、loop 并行=串行、export-pack 读全局镜表、电商包空 zip 假成功（F-033 实锤）、continuity-check 硬编码模型+静默丢图。
6. **工程债**：编剧台拆分已启动（2,296 行，拆出 7 个子文件）；**`use-storyboard-desk.tsx` 涨到 4,166 行仍未拆**，仍是最高危文件。
7. **两轮之间的教训**：审计文档必须随工作树滚动复核——第一轮结论在数小时内已有 >60% 失效。

---

## 1. 节点体系盘点

### 1.1 ✅ NODE-01 · `director-3d` 独立节点已落地（勿再开票）

本轮核实：`block-catalog.ts` L136 新增 `spatial` 分类条目「3D 导演台」；`registry.tsx` L17 映射到独立 `Director3dBlock`；`director3d-feature.ts` **`DIRECTOR_3D_ENABLED = true`**；`migrate-block-kinds.ts` L269–285 实装**受控反迁移**（仅纯 3D 数据节点自动恢复身份，已产生导演批出数据的保留待显式拆分）；`director3d-open.ts` 已改读 `shot.lineArtUrl`（DD-P0-06 同步修复）。
**残留**：DD-P1-10 的「四条宿主路径解析漂移 / 唯一 host controller」是否随新 Block 收口 ❓ 未逐项复核。

### 1.2 ✅ NODE-02 · P2 · 遗留 kind 的「明示不可用」分支（已定性）

`music-gen` / `lipsync-pass` 在 `flow-runner` 仍 throw，文案已指向迁移目标（sound-gen BGM / clip-gen）。`migrate-block-kinds` 打开旧画布时会自动改写；此分支为未迁移兜底，**禁止假成功**。与 sound-gen music 路径并存，属诚实阻断而非缺口。

### 1.3 ✅ NODE-03 · P1 · 旧 `ClipGenBlock`「死卡」定性（已销票）

复核：`ClipGenBlock` 仍注册为 `clip-gen` 节点组件，卡面注释明确「仅保留单镜生成；批量在 VideoWorkspace」。非 canvasFirst 死代码，而是**卡面兜底 + 附加工作台分工**；勿再以「死卡」开票。

---

## 2. 编剧台（script-desk）

| ID | 项 | 本轮核实 |
|----|----|----------|
| §3.1 查找替换绕过确认 | ✅ 已修复（上轮已证） | 勿再开票 |
| §3.2 角色全局改名 | ✅ **已修复**：`renameCharacterInPackage` 在 `ScriptDeskBlock.tsx` L1176 真实调用，改名 UI 已接线 | 勿再开票 |
| §3.3 交接回程状态（H-02） | ✅ **已实装**：新增 `script-desk/storyboard-sync.ts`，`sourcePackageHash` 读取与回程状态逻辑存在，含 `__tests__/storyboard-sync.test.ts` | 浏览器级回归待记档 |
| §3.4 对话流式输出（C-06） | ⚠ 未做（跨 api/网关，单独立项） | P1 |
| §3.5 对话搜索/折叠/模型名可见 | ❓ 未复核 | P2 |
| §3.6 批量重写 / 剪贴板导入 | ❓ 未复核 | P2 |
| §3.7 单集字数目标注入 | ❓ 未复核 | P2 |
| §3.8 单文件工程债 | ⚠ **明显改善但未完**：`ScriptDeskBlock.tsx` 从 2,976 → **2,296 行**；`script-desk/` 已拆出 7 个文件（ScreenplayPanel / DraftsDrawer / DiagnosticsPanel / BiblePanel / desk-helpers / storyboard-sync / dev-pack-overlay）。组件级交互测试仍缺 | P1 工程 |
| §3.9 runner 错误无结构化 code | ❓ 未复核 | P2 |

---

## 3. 分镜台（storyboard-desk）

### 3.1 上轮 P0 复核结果

| ID | 项 | 本轮核实 |
|----|----|----------|
| SB-OL-01 | ✅ **已修复**：`grid-panel.tsx` L120 已改用 `toastError`（import 齐备），合镜首镜不再崩溃 | 勿再开票 |
| SB-OL-02 | ✅ **已修复**：`previewNodePatch` 写回时合并 `stripEpisodeConfirmation`；补图/改帧后对上游 desk 再剥一层集级确认。`writeBackBreakdownPreviewImage` 仍只改 shot 状态（预览中），集级徽章由 strip 负责失效 | 勿再开票 |
| SB-OL-03 | ✅ **已修复**：`handleClearLineArt`（L1787–1806）清 `previewImageUrl/referenceImageUrl/sketchUrl` + `stripEpisodeConfirmation` + `cleanupFramesForShots` 移除孤儿帧；注释明确 chain `lineArtUrl` 由 `applyDeskBreakdown` 重建覆盖 | 勿再开票 |
| SB-OL-04 | ✅ 已修复（上轮已证） | 勿再开票 |

### 3.2 上轮 P1 复核结果

| ID | 项 | 本轮核实 |
|----|----|----------|
| SB-OL-06 | ✅ **已修复**：`runQueueForEpisodes` 现读 `queueStateRef.current.skipped`（L991–992、L1097），跳过计数进入最终统计 | 勿再开票 |
| SB-OL-07 | ✅ **已修复**：删镜 / 批量删均调 `cleanupFramesForShots`（L1774、L1887），孤儿帧清理到位 | 勿再开票 |
| SB-OL-10 | ⚠ 疑似已修：`ComposePanel` 已接 `batchScopeMode` + `lineArtAbortRef`（L3372–3383），范围模式与中断句柄存在；行为回归待验证 | 待回归 |
| SB-OL-05 / 08 / 09 | ❓ 未复核，维持上轮判定 | P1 |

### 3.3 工程债

**`use-storyboard-desk.tsx` 已涨至 4,166 行**（上轮 4,042，继续恶化），「hook 实为组件」未改。编剧台已开拆而分镜台没有——这是当前仓库单文件债第一名，也是 `lazy → undefined` 排障规则点名的最高危对象。

---

## 4. 导演台（director-desk）与 3D 主链

### 4.1 P0 全线收口（代码级证实）

| ID | 本轮核实 |
|----|----------|
| DD-P0-01/02/03 | ✅ 维持已修 |
| DD-P0-04 | ✅ **已修复**：`DirectorKeyframeBatch`（version 1）实装；flow-runner clip-gen 分支 L348–462 完整消费链——`validateDirectorKeyframeBatch` 校验 stale（失效即 blocked + stale 回执 + pendingShots）、`consumeDirectorKeyframeBatch` 逐镜消费、`consuming/consumed` 状态、`receipt.videoUrlsByShotId` 回执。新增 `director-keyframe-batch-runner.ts` | 勿再开票 |
| DD-P0-05 | ✅ **已修复**：flag 开启 + 独立 Block + 目录条目 + 受控反迁移（见 §1.1） | 勿再开票 |
| DD-P0-06 | ✅ **已修复**：`director3d-open.ts` L66 改读 `shot?.lineArtUrl` | 勿再开票 |

### 4.2 残留

- ✅ **DD-R-01**：无批次门禁已改读连接链 `readUpstreamChainStoryboard` + `activeChainEpisodeShots`；缺画布上下文时 blocked，拒绝回退全局镜表。
- ✅ **DD-P1-01～P1-10**：契约 provenance + 像素 `colorCheck`、主预览按镜、宫格外审显式集、candidate 持久化边界、放弃修改/`committedSnapshot`、`sourceRevision`、commitId 幂等、胶片条管理、场景模板回读、`Director3dHostController` 统一宿主——均已在导演台缺口文档 §5 销票。
- ✅ **加深项**：像素级彩色质检（禁止静默失败）、3D 过期上传忽略 + WebGL context lost、成片音量关键帧、真实供应商 opt-in E2E 脚手架——见 `NX9-DIRECTOR-DESK-CURRENT-GAPS-AND-3D-NODE-PLAN-2026-08-12.md` §12。

---

## 5. 图像生成节点（picture-gen）

| ID | 项 | 本轮核实 |
|----|----|----------|
| PG-01 | ✅ **已修复**：flow-runner picture-gen 分支（L323–344）**唯一实现收敛到 `runPictureGenExecutor`**，死代码翻案成活代码。executor 内 `collectUsedAssetIds`（L438）+ 角色 revision pin 回流 + 新增 `collect-node-asset-refs.ts` / `collect-used-assets.test.ts` | 勿再开票 |
| PG-08 | ✅ **已修复**：executor L457 `if (linkedShot && urls[0] && pictureGenMode !== 'panorama-720')` 全景守卫实装；全景另走 `panoramaUrl` 字段（L502–505） | 勿再开票 |
| PG-02 | ✅ 维持已修（pollVideoUntilDone） | 勿再开票 |
| PG-03 | ✅ **已修复**：`styleImageUrl` 写入入口进 `PictureWorkspace.tsx` / `picture-gen-modes.ts`，含 `picture-gen-style-ref.test.ts` | 勿再开票 |
| PG-04 | ✅ **基本修复**：executor 全程接 `abortSignal`（L319/L425 传入 `runPictureGenJob`，L133 `throwIfAborted`）；UI 停止按钮联动待回归 | 待回归 |
| PG-05/06/07 | ✅ **已闭环**（域文档 R3 + 代码复核）：Seed 非 fal 禁用并提示；「插值放大」文案诚实且隐藏无效强度/模型；多参考 gemini/openai 原生直传、fal 拼贴≤9 | 勿再开票 |
| PG-09/10/11 | ❓ 未复核 | P2–P3 |

---

## 6. 视频生成节点（clip-gen）

| ID | 项 | 本轮核实 |
|----|----|----------|
| VG-01 | ✅ **已修复**：A 批量路径 `core-pipeline-runner.ts` 已接 `buildClipGenVideoRequest`（L17、L475 预检、L565 逐镜组装），preflight 失败即阻断；B 路径上轮已接 | 勿再开票 |
| VG-06 | ✅ **已修复**：并发池 + 重试实装（L487–491 `concurrency` 1–8 / `maxRetries` 兼容旧 `maxRetry` 字段名，L617 worker 池，L645 重试联动取消） | 勿再开票 |
| VG-09 | ✅ **已修复**：A 路径逐镜 `collectClipUsedAssets`（L605）记账写回 | 勿再开票 |
| VG-03 | ✅ **服务端半边已补**：`gateway.service.ts` L770 起解析 `seed / negative_prompt / modelParams / generate_audio / last_frame_url` | 各 provider 映射矩阵待验收 |
| VG-02 | ✅ **已闭环**：工作台「首尾帧」→ `clip-gen-request` `lastFrameUrl` → 网关 `last_frame_url` / `last_frame`；测例锁定 | 勿再开票 |
| VG-04 | ✅ **已闭环**：`VideoParamChips` 有声开关 → 组装器 `generateAudio` → 网关 `generate_audio`（OpenAI 兼容含 grok）+ Magic Hour `audio` | 勿再开票 |
| VG-07 | ⚠ **大半修复**：工作台新增 `video-gen-modes.ts`，含 **Bridge 续拍模式**且 `patchVideoGenMode` 显式对齐执行层 `videoMode` 词表（注释「与执行层 videoMode 词表对齐」）——三套词表合并进行中；episode-queue、Seedance S 级校验迁移 ❓ 未复核 | P1→P2 |
| VG-10 | ✅ **已闭环**：A 路径轮询超时写入 `pendingVideoTasks`；工作台「继续查询」调 `resumePendingVideoTasks` | 勿再开票 |
| VG-05/08/11/12 | ❓ 未复核 | P2–P3 |

---

## 7. 智能剪辑台（clip-editor）—— 已整层重做，旧结论作废

### 7.1 现状（工作树新增 `blocks/core/clip-editor/`，全部核实）

| 能力 | 实况 |
|------|------|
| 多轨时间轴编辑 | ✅ `TimelinePanel.tsx`（446 行）：`move-clip`（跨轨+吸附）、`trim-clip`、`add-track`、轨道静音/锁定；`InspectorPanel.tsx`：`set-clip`、`split-clip`、涟漪删除、`set-transition`、素材回滚 |
| 帧精确预览 | ✅ `PreviewPlayer.tsx` 真 `@remotion/player`，播放头与时间轴双向同步 |
| 撤销/重做 | ✅ `use-timeline-editor.ts`：不可变 op 应用 + 60 步撤销栈 + StrictMode 防双调 |
| 快捷键 | ✅ Space 播放、Delete/Shift+Delete 涟漪删、S 分割、Ctrl+Z/Y |
| D1 轨道 ID 三套并存 | ✅ `timeline-migrate.ts`：v3 迁移把 `video-1/track-bgm/A1` 统一为 `V/A/S/O` 前缀，幂等，字幕/贴片 kind 修正 |
| D2 建议空 patch | ✅ `smart-edit-orchestrator.ts` 建议携带结构化 `ops`（set-transition / duck-audio 等），EditDesk `acceptSuggestion` 走 `editor.apply(sg.ops)`；提示型建议明示「无时间线变更」 |
| D3 Remotion 服务端渲染 | ✅ `ClipEditorBlock.tsx` L199–220：`api.renderRemotion` 提交 + 2.5s 轮询 + 10min 超时 + 进度提示 |
| D4 时长估算 | ✅ `EditDesk.addMedia` 调 `api.probeMediaDuration` 校准（probe 失败才回退估算） |
| 生成式智能替换 | ✅ `SmartReplacePanel.tsx`：换背景/换人物/换物体/移除，抽帧→蒙版圈选→gemini-edit / fal-inpaint→图生视频重生成（或视频级直换）→对比→`replace-clip-asset` 回写（检查器可回滚） |
| 对白音轨注入 | ✅ `onInjectVoice` → `buildVoiceDramaTimeline`（F-034/F-014 链路） |
| 交付联动 | ✅ 「确认时间线并送交导出」同步下游 export-pack + fitView；有待确认建议时禁用确认（诚实门禁） |

### 7.2 现行缺陷（本轮新发现）

| ID | 级别 | 缺陷 |
|----|------|------|
| **SE-01** | **P0** | ✅ **已闭环**：画布 Run 与卡内共用 `renderClipEditorTimeline`；链隔离读上游镜表；无 Remotion 假成功 |
| SE-02 | P2 | ✅ **已闭环**：FFmpeg 引擎明示「粗预览不含裁剪/转场/多轨」；按钮文案「FFmpeg 粗预览」；渲染进度提示同步 |
| SE-03 | P2 | ✅ **已闭环**：`suggestion-conflict.ts` 检测目标重叠；全部采纳改为逐条 `apply`（撤销可分步）+ 冲突日志 |
| SE-04 | P3 | ✅ **已定性**：`editorMode=audio/grade` 保留为显式遗留工具路径（无剪辑台 UI 入口），meta 标记 `legacyTool`；主路径不受影响 |

---

## 8. 素材库

- ✅ **上轮唯一真断点已闭环**：出图（picture-gen executor）与批量出片（core-pipeline）均已写 `usedAssetIds`（§5 PG-01 / §6 VG-09），素材库「未使用」健康口径在两条主生产路径上恢复真实。工作树同时新增 `asset-ref-rebind.ts` / `asset-library-drag.ts` / `VirtualizedCardGrid.tsx` / `AssetBatchBar.tsx` / `AssetBlockingSummary.tsx`——批量操作、虚拟滚动、阻塞汇总均在推进。
- ❓ UX 残留清单（`NX9-ASSET-LIBRARY-UX-RESIDUAL.md` P1′ 七条 + P2 六条）本轮未逐项复核；鉴于工作树改动密集（AssetHealthBar / CharacterCardGrid / detail-primitives 等均有修改），**建议按该文档重新过一遍再定残留**。
- 镜头库 UI：维持「D0 壳 + 117 条种子已灌入，后续阶段可后置」判定。

---

## 9. 工具类节点深挖（本轮新增章节）

逐分支重读 flow-runner 全部工具 kind 后的新发现：

### 9.1 ❌ TOOL-01 · P1 · export-pack 画布运行读全局镜表（链隔离违规）

```1589:1591:apps/web/src/engine/flow-runner.ts
  if (kind === 'export-pack') {
    if (!ctx) throw new Error('export-pack 缺少画布上下文');
    const shots = activeEpisodeShots(useWorkspaceDocument.getState().storyboard);
```

`ffmpeg-episode` 模式导出的是**全局 active episode**，不是本节点连接链的镜表。多链画布上会把别的链的镜头拼进成片。与 F-003「链优先，禁止回退全局」原则冲突。

### 9.2 ❌ TOOL-02 · P1 · 电商包（ecom-pack）三重不诚实（F-033 代码实锤）

`export-pack-runner.ts` L90–118：
1. video 类规格把**图片 blob** 塞进 `.mp4` 文件名（L101–106），产物名实不符；
2. 无上游图时循环体一次都加不进文件，仍 `ok: true`——**空 zip 假成功**；
3. `exportCount` 数的是规格数不是文件数；单文件下载失败静默 skip。
另外 zip 通用模式 0 项也返回 `ok: true, exportCount: 0`，flow-runner 随即标 `exportReady: true`（F-047「无产物不得 ready」的现行反例）。

### 9.3 ⚠ TOOL-03 · P1 · export-pack hyperframes 模式「提交即 exportReady」

flow-runner L1634–1641：HyperFrames 任务**提交成功**就写 `status: 'success'` + `exportReady: true` + `hfTaskId`。卡面 `ExportPackBlock` L87–105 会轮询 taskId 并在完成时更新 episodeUrl（这半边 ✅），但节点状态在渲染完成前就是 success/ready——下游若依赖 `exportReady` 判断可取货即被骗。应为「submitted」中间态。

### 9.4 ✅ TOOL-04 · iterator 单跑自增 + loop 真并行

- iterator 画布 Run 输出当前项后 `advanceIteratorIndex`；`lastEmittedIndex` 记录刚发出的下标。
- `loop-executor` 并行走 `runRoundsWithConcurrency`（默认并发 3，上限 8）；串行 concurrency=1。工作台并行模式可调并发。

### 9.5 ✅ TOOL-05 · continuity-check 模型可配 + 超 4 图提示

`continuity-check-runner.ts`：未指定模型则省略 `model` 字段，网关走全局 `llmModel`；超出 `CONTINUITY_IMAGE_CAP` 写入 `imagesOmitted` / 提示文案。死 import `applyShotReviewFromReport` 已删，写回仍走链隔离 `patchUpstreamShot`。

### 9.6 ✅ TOOL-06 · inpaint-edit 双路径合一

`inpaint-edit-runner.ts` 为唯一执行链；工作台与画布 Run 均 `runInpaintEdit` + `writeBackInpaintShot`。默认模型可被 `inpaintModel` / `model` 覆盖。

### 9.7 ⚠ TOOL-07 · P3 · caption-asr 烧录时长疑点

burn 模式走 `renderShotMp4({ durationSec: (d.durationSec as number) ?? 4 })`（L1454–1459）——上游视频若非 4 秒，默认值是否截断/补齐需验证 `renderShotMp4` 语义；UI 无 durationSec 输入。

### 9.8 其余工具节点

grid-compose / grid-split / asset-import / link-parser / frame-endpoints / frame-sampler / scale-fit / picture-merge / thumbnail-maker / style-atelier / bridge-clip：链路完整、报错诚实，无新问题。`batch-runner` 的 resize 硬编码 1024×1024、grid-split 硬编码 2×2（P3 参数面）。

---

## 10. 声音链深挖（本轮新增章节）

### 10.1 ❌ SND-01 · **P0** · sound-gen 画布 Run 完全无视 `soundMode`

`SoundGenBlock` 有三模式：单轨 TTS / 多角色 cast / BGM music。但 flow-runner `sound-gen` 分支（L800–822）**只有单轨 TTS 逻辑**：

- **music 模式节点从画布 Run**：把 BGM 描述文字当配音文本送 TTS → 产出一段「朗读 BGM 描述」的音频并标 success——**错误产物假成功**；
- **cast 模式节点从画布 Run**（含被 `voice-cast → sound-gen` 迁移吞并的旧节点，`migrate-block-kinds.ts` L48/L135）：`lines`/`profileMap` 全部被忽略，退化为把合并文本读一遍。

收口：runner 按 `soundMode` 分发——cast 走多行循环（复用 VoiceCastBlock.run 逻辑下沉），music 走 BGM 网关或明确 blocked。

### 10.2 ❌ SND-02 · P1 · 「声音指令」是死参数

`SoundGenBlock` L318–324 的 instructions 输入框（「情绪/语调/语速变化等」）写入 `data.instructions`，但卡内 `run()`（L98–106）与 runner 的 `proxyTts` 调用**均不携带**。UI 参数无效——违反「能设置的参数必须进请求体或禁用」口诀。

### 10.3 ⚠ SND-03 · P1 · 卡与 runner 参数面漂移

卡内 run 传 `response_format`（audioFormat）与 `speed`（speechRate）；runner 分支两者都不传——画布 Run 出的音频无视格式与语速设置。且卡写 `status: 'done'`、runner 写 `status: 'success'`——状态词表漂移。

### 10.4 ⚠ SND-04 · P2 · voice-cast 双实现 + 一处死文件

- 🧟 `blocks/core/panels/VoiceCastPanel.tsx`：定义了另一份 `VoiceCastBlock`，**全仓库零 import**（活的那份在 `blocks/nx9/VoiceCastBlock.tsx`，经 SoundGenBlock lazy 嵌入）。删。
- flow-runner `voice-cast` 分支（L1509–1532）与活卡逻辑漂移：不识别 `char:` 前缀映射、不走角色参考音 LuxTTS 克隆（活卡有）。该 kind 已被迁移吞并，分支基本不可达——随 SND-01 收口时一并删除或对齐。

### 10.5 ❌ SRV-01 · P1 · BGM 网关假成功（维持，两轮均在）

`gateway-music.service.ts` L70–74：sleep 3 秒 → `done` + 指向不存在的 `/media/bgm/{taskId}.mp3`。文件头自己写着「禁止占位留存」。卡面 `generateBgm` 会诚实轮询它（最多 60s），最终拿到 404 音频显示「已生成」。**未接真实 provider 前必须改为明确 error**。

### 10.6 声音剧闭环（F-034）判定更新

对白注入时间线（`buildVoiceDramaTimeline` + EditDesk「注入对白音轨」）✅ 已接；卡内 TTS/LuxTTS 克隆 ✅；**断点集中在 SND-01（画布路径）与 SRV-01（BGM）**，修掉这两个后 F-034 全链路验收才有意义。

---

## 11. 渲染 / 导出服务端深挖（本轮新增章节）

### 11.1 ❌ SRV-02 · **P0** · HyperFrames 兜底渲染 = 纯黑视频假成功

```83:94:apps/server/src/modules/montage/hyperframes.service.ts
      } catch {
        // FFmpeg fallback: 将 HTML 转为静帧序列再编码
        this.logger.warn('@hyperframes/producer 不可用，使用 FFmpeg 占位渲染');
        const { execSync } = await import('child_process');
        execSync(
          `ffmpeg -f lavfi -i color=c=#000:s=${timeline.width}x${timeline.height}:d=${timeline.durationSec} -c:v libx264 -preset ultrafast "${outPath}"`,
          { stdio: 'ignore' },
        );
      }

      const url = `/media/exports/${outFilename}`;
      this.tasks.set(taskId, { status: 'done', url });
```

`@hyperframes/producer` 不可用（大概率是常态）时，产出一条**与时间线等长的全黑视频**并标 `done`。注释自称「占位渲染」——比 BGM 网关更隐蔽的假成功：文件真实存在、能播放，只是内容是黑的。必须改为 error（或明确降级标记）。

### 11.2 ❌ SRV-03 · P1 · HyperFrames 取消是装饰（F-046 代码实锤）

`cancelTask`（L47–51）只把状态字段置 `cancelled`；`processRender` 协程不检查取消标志，跑完后 L94 无条件 `set(taskId, { status: 'done', url })` **把 cancelled 覆写回 done**。F-046 台账「取消中任务不得变成功」的缺口在代码层坐实。收口：processRender 各阶段检查取消位，完成写入前做 CAS 判断。

### 11.3 ✅ SRV-04 · 渲染任务落盘 + Remotion 可取消

HyperFrames / Remotion 任务写入 `data/render-tasks/*.json`（原子 rename）；启动时加载。Remotion 增加 `cancelTask` + CAS（cancelled 不得被 done 覆写），`DELETE /api/montage/remotion-tasks/:taskId`。

### 11.4 ✅ 正面核实

- Remotion 渲染器：依赖缺失时返回清晰错误（不假成功）✅；
- `json-store.service.ts`：`tmp + renameSync` 原子写 ✅；
- `.gitignore` `dist/` 规则 `git check-ignore` 证实生效 ✅（会话快照中的 `?? apps\server\dist\*` 为陈旧快照噪声）。

### 11.5 ⚠ SRV-05′ · P3 · assets 无媒体回收

`assets.service.ts` 无任何 cleanup/GC：media 目录只增不减，删除素材库条目不清落盘文件。长期运行磁盘膨胀。

---

## 12. 完成度台账关联更新

| 台账项 | 本轮证据 |
|--------|----------|
| F-033 电商交付规格包 60% | **实况更差**：TOOL-02 三重不诚实（空 zip ok / mp4 装图 / exportCount 虚数） |
| F-046 Hyperframes 状态机 58% | **实锤**：SRV-03 取消覆写竞态 + SRV-02 黑片假成功 |
| F-047 export_ready 真成功 75% | **实锤**：TOOL-03 提交即 ready + zip 0 项 ready |
| F-048 并发重试单轨 58% | ✅ **已翻案**：VG-06 修复，台账应重评 |
| F-049 Bridge/队列/Seedance 45% | ⚠ Bridge 工作台入口已加（video-gen-modes），队列/Seedance 待评 |
| F-050 智能剪辑建议确认 75% | ✅ 建议系统已重做（真 ops + 确认门禁），台账应重评；剩 SE-03 冲突合并 |
| F-014 BGM | ❌ SRV-01 维持 |
| F-035 名实相符 | Bridge 入口补上后缺口缩小，公开配方 checklist 仍缺 |

---

## 13. 死代码 / 双实现清单（更新）

| 类别 | 条目 | 状态 |
|------|------|------|
| ~~死执行器 picture-gen-executor~~ | ✅ 已翻案为唯一实现 | 关闭 |
| 死卡 `blocks/core/ClipGenBlock.tsx` | ❓ 维持 | VG-12 |
| 🧟 `blocks/core/panels/VoiceCastPanel.tsx` | **新发现**，零引用 | SND-04 |
| 双实现：InpaintWorkspace vs flow-runner inpaint 分支 | **新发现**，工作台缺 shot 写回 | TOOL-06 |
| 双实现：SoundGenBlock.run vs flow-runner sound-gen 分支 | **新发现**，参数面漂移 | SND-03 |
| 双实现：ClipEditorBlock.handleRender vs flow-runner clip-editor 分支 | **新发现**，画布假成功 | SE-01 |
| flow-runner `voice-cast` 分支 | 迁移后基本不可达 | SND-04 |
| flow-runner clip-editor `audio/grade` legacy 路径 | 无 UI 入口 | SE-04 |
| 死 import：continuity-check 内 `applyShotReviewFromReport` | **新发现** | TOOL-05 |
| ~~死 import renameCharacterInPackage~~ | ✅ 已启用 | 关闭 |
| 明示不可用：music-gen / lipsync-pass throw | 维持 | NODE-02 |

---

## 14. 工程与测试债（更新）

| 项 | 现值 | 备注 |
|----|------|------|
| `use-storyboard-desk.tsx` | **4,166 行（↑，恶化）** | 仓库第一债，先拆再做新功能 |
| `ScriptDeskBlock.tsx` | 2,296 行（↓680，拆分进行中） | 继续拆 + 补交互测试 |
| `DirectorDeskBlock.tsx` | 1,214 行 | 观察 |
| 智能剪辑台 | ClipEditorBlock 428 + clip-editor/ 分层清晰 | ✅ 新模块拆分范例 |
| 新增测试 | storyboard-sync / collect-used-assets / asset-ref-rebind / shot-lexicon-desk-map / picture-gen-style-ref | ✅ 覆盖率回升中 |
| runner 错误码 / 浏览器级回归 / 真实供应商链验收 | 真实供应商：opt-in 脚手架已就绪（默认 skip）；浏览器级回归仍待记档 | RUN-003/006–010；见 REAL-PROVIDER-VALIDATION.md |

---

## 15. 建议收口顺序（重排）

### 第一批 · 消灭现存假成功（P0，均为小中改动）

1. **SRV-02** HyperFrames 黑片兜底 → 改 error；**SRV-03** 取消竞态 → 完成写入前 CAS。
2. **SRV-01** BGM 网关 → 未配置真实 provider 时明确 error。
3. **SND-01** sound-gen runner 按 `soundMode` 分发（music → BGM 网关或 blocked；cast → 多行循环）。
4. **SE-01** flow-runner clip-editor 分支对齐新剪辑台（remotion 假成功、全局镜表、hyperframes 无轮询、ffmpeg 无视时间线）。
5. **TOOL-02/03** 电商包与 export-pack 诚实化（空产物不得 ok、mp4 名实相符、提交 ≠ ready）。

### 第二批 · 链隔离与参数诚实（P1）— 2026-08-12 已收口

6. ✅ **TOOL-01** export-pack 改读连接链镜表；✅ **DD-R-01** 无批次门禁改按 chain 投影。
7. ✅ **SND-02/03** instructions / audioFormat / speechRate 已接通。
8. ✅ **SB-OL-02** 嵌入预览写回补集级 `stripEpisodeConfirmation`。
9. ✅ **TOOL-06** inpaint 双实现合一；✅ **TOOL-05** continuity 模型可配 + 超 4 图提示。
10. ✅ VG-02/04/10 接线锁定；✅ SRV-04 渲染任务落盘 + Remotion 取消。

### 第三批 · 假并行与体验 — 2026-08-12 已收口

11. ✅ **TOOL-04** loop 真并行 + iterator 单跑自增。
12. ✅ **SE-02/03/04** FFmpeg 粗预览诚实提示、建议冲突检测与逐条撤销、audio/grade 遗留工具定性；✅ **PG-05/06/07** 复核销票；✅ **NODE-02/03** 遗留 kind / ClipGen 卡面定性。

### 第四批 · 工程债与回归

13. **拆 `use-storyboard-desk.tsx`**（先拆再做任何分镜新功能）。
14. 素材库 UX 残留按文档重过；F-048/F-050 台账重评；浏览器级回归（H-02、SB-OL-05/08/09、PG-04 停止钮）补记档；VG-07 词表收口与 VG-05/08 等未复核项。

---

## 16. 验收口诀（更新版）

1. 渲染类服务**产物内容也要验**：文件存在 ≠ 成功（HyperFrames 黑片是现行反例）。
2. 取消必须贯穿执行协程：状态字段翻转不算取消（HyperFrames cancel 是现行反例）。
3. 同一节点的「卡内运行」与「画布 Run」必须同一执行链、同一产物、同一写回（clip-editor / sound-gen / inpaint-edit 是现行反例）。
4. 模式选择器的每个模式都要有对应执行分支（sound-gen 三模式 runner 只认一种是现行反例）。
5. 「提交成功」「导出就绪」只能在产物可取时置位（export-pack hyperframes / 空 zip 是现行反例）。
6. UI 参数要么进请求体要么禁用（「声音指令」是现行反例）。
7. 并行/重试等执行语义不许只在 UI 词表存在（loop 并行是现行反例）。
8. 审计结论必须随工作树滚动复核，修复后**及时销票**，防止重复开票与冤枉已修项。

---

## 附 A · 本轮新增证据锚点

| 结论 | 锚点 |
|------|------|
| director-3d 落地 | `block-catalog.ts` L136；`registry.tsx` L17 → Director3dBlock；`director3d-feature.ts` L2 = true；`migrate-block-kinds.ts` L269–285 反迁移 |
| picture 执行收敛 + 守卫 | `flow-runner.ts` L323–344；`picture-gen-executor.ts` L438/L457/L319 |
| DirectorKeyframeBatch 消费 | `flow-runner.ts` L346–462；`director-keyframe-batch-runner.ts` |
| 门禁残留全局读 | ✅ 已改 `readUpstreamChainStoryboard` + `activeChainEpisodeShots` |
| A 路径组装器/并发/记账 | `core-pipeline-runner.ts` L17–18/L475/L487–491/L565/L605/L617 |
| 网关视频参数 | `gateway.service.ts` L770 |
| Bridge 工作台入口 | `generation/video/video-gen-modes.ts` |
| 合镜已修 | `grid-panel.tsx` L120 |
| 清线稿已修 | `use-storyboard-desk.tsx` L1738–1806 |
| 队列 skip 已修 | `use-storyboard-desk.tsx` L991/L1097 |
| SB-OL-02 残留 | ✅ `previewNodePatch` + 上游 desk `stripEpisodeConfirmation` |
| 改名已接 | `ScriptDeskBlock.tsx` L29/L1176 |
| 回程状态 | `script-desk/storyboard-sync.ts` + 测试 |
| 剪辑台重做 | `blocks/core/clip-editor/`（EditDesk 609 / TimelinePanel 446 等 8 文件）；`timeline-migrate.ts`；`use-timeline-editor.ts`；`ClipEditorBlock.tsx` L199–220 |
| SE-01 画布漂移 | ✅ `renderClipEditorTimeline` 共用 |
| SE-02 FFmpeg 粗预览 | ✅ EditDesk 提示 + `clip-editor-render` 进度文案 |
| SE-03 建议冲突 | ✅ `suggestion-conflict.ts` + 逐条 apply |
| HyperFrames 黑片+取消竞态 | `hyperframes.service.ts` L83–94/L47–51 |
| BGM 假成功 | `gateway-music.service.ts` L70–74 |
| sound-gen 无视模式 | ✅ 第一批已修 |
| 死声卡 | `blocks/core/panels/VoiceCastPanel.tsx`（零 import） |
| iterator/loop | ✅ `advanceIteratorIndex` + `runRoundsWithConcurrency` |
| export-pack 全局镜表/假 ready | ✅ 第一批已修 |
| continuity 糙点 | ✅ `continuity-check-runner.ts` |
| inpaint 双实现 | ✅ `inpaint-edit-runner.ts` |
| music/lipsync 阻断 | ✅ NODE-02 明示迁移目标 |
| ClipGen「死卡」 | ✅ NODE-03 定性：卡面单镜 + VideoWorkspace 批量 |
| 大文件行数 | ScriptDeskBlock 2,296 / use-storyboard-desk 4,166 / DirectorDeskBlock 1,214 |

## 附 B · 引用文档索引

- 缺陷/验收 SSOT：`NX9-PROJECT-DEFECT-ANALYSIS.md`；完成度台账：`NX9-REAL-COMPLETION-LEDGER.md`
- 各域未闭环：`NX9-SCRIPT-DESK-OPEN-LOOPS.md` / `NX9-STORYBOARD-DESK-OPEN-LOOPS.md` / `NX9-DIRECTOR-DESK-CURRENT-GAPS-AND-3D-NODE-PLAN-2026-08-12.md` / `NX9-PICTURE-GEN-NODE-OPEN-LOOPS.md` / `NX9-VIDEO-GEN-NODE-OPEN-LOOPS.md` / `NX9-ASSET-LIBRARY-OPEN-LOOPS.md` / `NX9-ASSET-LIBRARY-UX-RESIDUAL.md`
- 规格目标态：`NX9-SMART-EDIT-DESK-SPEC.md`（已大部分落地，按 §7 重校）/ `NX9-SHOT-LIBRARY-UI-DESIGN.md` / `NX9-3D-DIRECTOR-DESK-DESIGN.md`
- 环境与运行：`NX9-MAIN-FLOW-RUNNABILITY-AUDIT-2026-08-05.md` / `REAL-PROVIDER-VALIDATION.md`

---

**文档结论（第四轮销票）**：第一～三批（假成功、链隔离/参数诚实、剪辑台体验与 NODE/PG 定性）均已在工作树收口。当前未闭环重心转为 **①拆 `use-storyboard-desk.tsx`、②素材库 UX 残留重过、③浏览器级回归记档、④VG 词表与未复核项**。
