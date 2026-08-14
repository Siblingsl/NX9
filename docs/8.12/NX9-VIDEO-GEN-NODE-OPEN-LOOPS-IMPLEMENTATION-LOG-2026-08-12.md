# NX9 视频生成节点 · 未闭环功能分析（R3）实施日志

> 日期：2026-08-12
> 范围：`docs/8.12/NX9-VIDEO-GEN-NODE-OPEN-LOOPS-R3.md` 全部 14 张票
> 状态：VG-35～VG-47 已闭环；VG-48 按文档 ⏸ 记档（产品后置，本轮不实施）

## 票项总览

| 票号 | 优先级 | 符号 | 状态 | 主要落点 |
|------|--------|------|------|----------|
| VG-35 | P1 | ❌ | 已闭环 | `flow-graph.ts` gatherUpstream + `flow-runner.ts` 级联链镜优先逐镜出片 |
| VG-36 | P1 | ❌ | 已闭环 | `flow-runner.ts` 单/多镜 + `director-keyframe-batch-runner.ts` 统一 `appendStoryboardVideoVersion` |
| VG-37 | P1 | ❌ | 已闭环 | `flow-runner.ts` 三处 content 写回改为 `lastCompiledPrompt` / `batchSummary` |
| VG-38 | P1 | ❌ | 已闭环 | `VideoWorkspace.tsx` 单镜 resume 写链 + version + 清 taskId |
| VG-39 | P2 | ⚠ | 已闭环 | `flow-runner.ts` 级联多镜参考数组排除本批首帧 |
| VG-40 | P2 | ⚠ | 已闭环 | `clip-gen-request.ts` 文生视频不传 imageUrl + 工作台明示 |
| VG-41 | P2 | ⚠ | 已闭环 | `clip-gen-request.ts` keyframe 缺尾帧 / image-ref / omni-ref 缺参考阻断 |
| VG-42 | P2 | ⚠ | 已闭环 | `video-gen-params.ts` 校验 + 组装器 blocked + 工作台红字 |
| VG-43 | P2 | ⚠ | 已闭环 | `core-pipeline-runner.ts` 返回 skipped + 节点 message + 工作台/Studio 汇总 |
| VG-44 | P2 | ⚠ | 已闭环 | `VideoWorkspace.tsx` linked 保留子集 + retry 可停 |
| VG-45 | P2 | ⚠ | 已闭环 | `flow-graph.ts` chain 成片进 `clips` |
| VG-46 | P3 | 🧟 | 已闭环 | `flow-runner.ts` 删除 `bridge-clip` 假成功分支 |
| VG-47 | P3 | 🧟 | 已闭环 | `migrate-block-kinds.ts` 迁移补丁归一 + 孤儿 videoMode 清扫 |
| VG-48 | P3 | ⏸ | 记档 | `audioUrl` 音画对齐，产品后置 |

## 逐票实施记录

### VG-35 级联/画布跑批不再坍缩单镜

- 改动文件：
  - `packages/shared/src/engine/flow-graph.ts`：storyboard 分支把 `chain.shots[].firstFrameAssetId` 进 `pictures`、`videoAssetId` 进 `clips`（L221-226）；director-desk 分支同样展开链镜（L384-396）
  - `apps/web/src/engine/flow-runner.ts`：多镜分支改为「有链镜表时按 `readUpstreamChainStoryboard` + `activeChainEpisodeShots` 逐镜出片」，仅在无链时回退 `breakdown×pictures` 启发式（L733-739）
- 行为变化：修复前仅 chain 有批审首帧、无 preview 时 `pictures=[]` 走单镜，只出 1 条视频；修复后 chain 首帧进入 `upstream.pictures`，级联按链镜数量逐镜出片，链镜无首帧时逐镜取 `firstFrameAssetId`，不再乱配首图。
- 测试：`vg-r3.test.ts` 新增 `collectClipGenUpstream` 链首帧/成片收集用例；`apps/web` 全量回归通过。
- UI 自检：待人工复验画布运行 clip-gen（仅 chain、无 preview）出片数等于可出镜数。

### VG-36 三条路径统一 videoVersions 账本

- 改动文件：
  - `apps/web/src/engine/flow-runner.ts`：级联多镜与单镜成功写回改为 `...appendStoryboardVideoVersion(boardShot/linkedClipShot, version)`（L854-866、L958-970）
  - `apps/web/src/engine/director-keyframe-batch-runner.ts`：`consumeDirectorKeyframeBatch` 生成 `version`（含 prompt/model/keyframeRevision）并写 `videoVersions/videoAssetId/videoStatus`，继续保留 DD-D-01「不覆盖 keyframeStatus/status」（L119-131）
  - `apps/web/src/engine/flow-runner.ts` 导演批次调用传入 `model: modelId`
- 行为变化：修复前级联/导演批次只写 `videoAssetId`，审片「历史版本 / 采纳」无条目；修复后三条路径（批量 / 级联 / 导演批次）均建 `videoVersions`，可采纳、可归档 pending。
- 测试：`director-keyframe-batch-runner.test.ts` 新增 videoVersions 断言（长度 / url / model）；`vg-r3.test.ts` 源接线断言；11 文件定向 97 用例全绿。
- UI 自检：待人工复验级联与导演消费后，`VideoShotReviewGrid` 版本号按钮出现且可切换。

### VG-37 出片路径不再污染 content

- 改动文件：`apps/web/src/engine/flow-runner.ts`
  - Bridge 中间态 `content: continuationPrompt` → `lastCompiledPrompt`（L684）
  - Bridge 成功 / 超时 `content: finalPrompt` → `lastCompiledPrompt`（L706、L718）
  - 级联多镜结束 `content: breakdown?.title ?? prompt` → `lastCompiledPrompt`（L895-896）
  - 单镜成功 / 超时 `content: singleReq.prompt` → `lastCompiledPrompt`（L948-949、L978）
  - 导演批次结束 `content: 摘要` → `batchSummary`（L654）
- 行为变化：修复前 Bridge/单镜/级联跑完后 `useLocalNodePrompt` 会把拼装 prompt 同步回输入框，下一轮批量二次污染；修复后 `content` 恒为用户原稿，拼装稿只写 `lastCompiledPrompt` / `continuationPrompt` / `batchSummary`。
- 测试：`vg-r3.test.ts` 断言 `flow-runner` 不含 `content: singleReq.prompt / finalPrompt / continuationPrompt`。
- UI 自检：待人工复验 Bridge/单镜跑完后 textarea 仍是用户原文。

### VG-38 单镜「继续查询」写链 + 清脏字段

- 改动文件：`apps/web/src/engine/stage-deck/chrome/attached-workspace/generation/video/VideoWorkspace.tsx` `resumeTasks`（L320-348）
- 行为变化：修复前单镜 resume 成功只 `updateNodeData({status:'success', videoUrl})`，链镜表不更新、`taskId/providerBaseUrl/message` 残留；修复后按 `linkedShotId` 或唯一镜定位，`appendStoryboardVideoVersion` 写回链镜表，并清 `taskId/providerBaseUrl/message`。
- 测试：`vg-r3.test.ts` 源接线断言（`appendStoryboardVideoVersion(shot, version)` + `taskId: undefined`）。
- UI 自检：待人工复验单镜超时 → 继续查询 → 审片格出现成片与版本条目。

### VG-39 级联多镜参考过滤

- 改动文件：`apps/web/src/engine/flow-runner.ts` L757-763、L801-824
- 行为变化：修复前级联多镜把全部 `upstream.pictures` 灌进每镜 `referenceImages`，Seedance 易被 `validateSClassReferences` 误伤、云端吃到「别人的首帧」；修复后构建 `cascadeShotFrameUrls` 排除本批首帧，只把外部参考传入组装器。
- 测试：`apps/web` 全量回归通过；Seedance 上限逻辑既有 `clip-gen-request.test.ts` 覆盖。
- UI 自检：待人工复验级联多镜请求体参考数组不含本批 keyframe。

### VG-40 文生视频模式不带首帧

- 改动文件：
  - `apps/web/src/engine/clip-gen-request.ts`：`mode === 'text-to-video'` 时 `imageUrl = undefined`，body 对空 `imageUrl` 条件化不写键（L239-241、L350-352）
  - `VideoWorkspace.tsx`：文生视频且有上游时顶栏明示「不会携带分镜首帧」（L563-571）
- 行为变化：修复前芯片显示「文生视频」但请求体仍带分镜首图（实际图生）；修复后请求体无 `imageUrl`，上游图只进参考数组，UI 同步明示。
- 测试：`clip-gen-request.test.ts` 新增「文生视频模式不带首帧」；原「普通出片」用例显式切到 `image-to-video` 保留高级参数覆盖。
- UI 自检：待人工复验文生视频 + 上游批出时请求体无 imageUrl，顶栏出现提示条。

### VG-41 缺前置不再静默降级

- 改动文件：`apps/web/src/engine/clip-gen-request.ts`
  - keyframe 缺尾帧 → blocked「首尾帧模式需要上传尾图」（L264-272）
  - image-ref 无任何参考图 → blocked（L304-312）
  - omni-ref 无图无视频 → blocked（L314-322）
- 行为变化：修复前 keyframe 无尾帧静默退化成图生、image-ref/omni-ref 无参考伪装文生/图生；修复后组装器返回 `blocked`，调用方（级联 / 批量 preflight / 工作台）阻断并写回原因。
- 测试：`clip-gen-request.test.ts` 新增尾图 / 图片参考 / 全能参考三类阻断用例。
- UI 自检：待人工复验芯片显示「首尾帧 / 图片参考 / 全能参考」但缺前置时节点 error 文案明确。

### VG-42 Provider 参数非法不再静默丢弃

- 改动文件：
  - `packages/shared/src/utils/video-gen-params.ts`：新增 `validateVideoModelParams`（L55），与网关 `parseModelParams` 同口径（JSON 对象或 key=value 列表）
  - `apps/web/src/engine/clip-gen-request.ts`：非法参数返回 `blocked`（L370-381）
  - `VideoWorkspace.tsx`：Provider 参数输入框实时红字 + 错误边框（L177、L455-466）
- 行为变化：修复前 `modelParams='{broken'` 时网关 `parseModelParams` 返回 null 被静默跳过；修复后组装器/工作台提前报「Provider 参数 JSON 解析失败 / 需为 JSON 对象或 key=value 列表」，不再假装参数已生效。
- 测试：`clip-gen-request.test.ts` 新增非法参数 blocked；`vg-r3.test.ts` 覆盖 `validateVideoModelParams` 四例。
- UI 自检：待人工复验输入非法 JSON 后输入框红字，点生成节点 error 文案一致。

### VG-43 批出跳过镜上报汇总

- 改动文件：
  - `apps/web/src/engine/core-pipeline-runner.ts`：`batchGenerateVideosFromShots` 返回 `{ ok, fail, skipped }`，无链/空镜/无 target 分支补齐 `skipped`；节点 `message` 写「跳过 N 镜（关键帧未批审或无分镜图）」；结束日志带上 skipped（L482-862）
  - `VideoWorkspace.tsx` handleRun 按 `res.skipped` 拼接活动日志（L241-249）
  - `apps/web/src/pages/studio/useStudioDesk.ts` toast 带上跳过数
- 行为变化：修复前未批审镜只进 activity log，节点仍可能 success、审片格混杂；修复后返回值与节点 message、工作台日志、Studio toast 均含跳过数。
- 测试：`vg-r3.test.ts` 断言返回值类型与节点 message 文案。
- UI 自检：待人工复验部分镜未批审时点生成，工作台出现「跳过 N 镜」提示。

### VG-44 linkedShotIds 保留子集 + retry 可停

- 改动文件：`VideoWorkspace.tsx`
  - 自动绑镜 effect：仅在 `prev.length === 0` 时默认全选，保留导演台推送或用户编辑的子集（L140-142）
  - `retryShot`：纳入 `runAbortRef` 并传 `signal`，可被「停止」打断（L293-310）
- 行为变化：修复前 effect 每次 shotIds 变化都全量覆盖 `linkedShotIds`（导演台推送的子集被冲掉），retry 无取消信号；修复后子集保留、重试可停。
- 测试：`vg-r3.test.ts` 源接线断言。
- UI 自检：待人工复验导演台推送 N 镜后打开工作台，勾选/子集不被自动覆盖；单镜重试中可点停止。

### VG-45 Bridge / omni-ref 吃到链上成片

- 改动文件：`packages/shared/src/engine/flow-graph.ts` L221-226、L384-396（与 VG-35 同源）
- 行为变化：修复前 chain 已有 `videoAssetId` 不进 `clips`，Bridge/omni-ref 缺源被阻断；修复后链上成片进 `upstream.clips`，`VideoSourceStrip` 可列出上游镜视频供选。
- 测试：`vg-r3.test.ts` 收集用例同时断言 `clips` 含链上成片。
- UI 自检：待人工复验 Bridge 模式上游镜表有成片时源视频条可选该片。

### VG-46 删除 bridge-clip 假成功僵尸

- 改动文件：`apps/web/src/engine/flow-runner.ts` 删除 `if (kind === 'bridge-clip')` 整段（原只抽尾帧 + 写 continuation 后标 success、不出片）
- 行为变化：修复前绕过迁移直接喂 `bridge-clip` 会假绿；修复后该分支不存在，旧图加载经 `migrateBlockKind → clip-gen` 走真实 Bridge（`videoMode==='bridge'`）路径。
- 测试：`vg-r3.test.ts` 断言 `flow-runner` 无 `kind === 'bridge-clip'`。
- UI 自检：无新增 UI。

### VG-47 迁移补丁归一 videoMode

- 改动文件：`packages/shared/src/catalog/migrate-block-kinds.ts`
  - `BLOCK_KIND_MIGRATION_PATCHES`：motion-story/seedance-chain/lipsync-pass/photo-speak/frame-endpoints/frame-sampler 改为 `videoMode:'single'|'bridge'` + 合法 `videoGenMode`（L121-128）
  - `migrateBlockKinds` 对已是 `clip-gen` 且带孤儿 `videoMode`（chain/motion/lipsync/photo-speak/frame-endpoints）的节点启动时归一（L260-278、L344-350）
- 行为变化：修复前迁移后节点带着执行层不认的 `videoMode:'chain'/'motion'/'lipsync'`，芯片只显示「文生视频」、seedance-chain 语义丢；修复后迁移即得 `single/bridge + videoGenMode`，历史已迁移节点加载时自动清扫。
- 测试：`vg-r3.test.ts` 断言 seedance-chain/bridge-clip 补丁与 `migrateBlockKinds` 归一结果。
- UI 自检：待人工复验旧 seedance-chain 图打开后芯片显示「图生视频」且模型保留 seedance。

### VG-48 ⏸ 记档

- 状态：⏸ 产品后置，本轮不实施。
- 原因：`audioUrl` 音画对齐承接 VG-08/28，工作台无入口、组装器不发送；需产品先定义「参考音 / 配乐轨 / 口型」哪一种，再开票实现。
- 触发条件：产品给出音画对齐口径后，按 VG-48 重新开票。
- 锚点：`docs/8.12/NX9-VIDEO-GEN-NODE-OPEN-LOOPS-R3.md` §3 VG-48；现有 `generateAudio` 开关仅控制生成音轨，未承诺音画对齐。

## 验证

- `pnpm --filter @nx9/shared build`：通过（导出 `validateVideoModelParams` 后重建 dist）。
- `pnpm --filter @nx9/web typecheck`：通过。
- `apps/web` 定向 11 文件 vitest：97 passed。
- `apps/web` 全量 vitest：67 files，419 passed / 1 skipped；唯一 unhandled error 为既有 `/api/settings` 无 base URL 环境噪声（`ScriptDeskBlock.test.tsx`），非本轮回归。

## 建议人工复验清单（浏览器）

1. 仅 chain 多镜批审首帧、无 preview：画布运行 clip-gen 出片数 = 可出镜数。
2. 级联 / 导演批次消费后：审片网格出现版本按钮，可切换/采纳历史版本。
3. Bridge / 单镜 / 级联跑完后：textarea 仍是用户原文。
4. 单镜超时 → 继续查询：链镜 `videoAssetId` + version 更新，`taskId` 清除。
5. 文生视频 + 上游批出：请求体无 `imageUrl`，顶栏提示条可见。
6. keyframe 无尾帧 / image-ref 无 Ref / omni-ref 无图无视频：节点 error 文案明确。
7. Provider 参数输入非法 JSON：输入框红字，点生成节点 error 一致。
8. 部分镜未批审点生成：工作台/Studio 出现「跳过 N 镜」汇总。
9. 导演台推送子集后：`linkedShotIds` 不被自动全选覆盖；单镜重试可停止。
10. Bridge 模式链上已有成片：`VideoSourceStrip` 可选上游镜视频。
11. 旧 seedance-chain / motion-story 图打开：芯片与真实模式一致，模型保留。

# NX9 视频生成节点 R3 完票报告

## 统计

- 总票数：14 | 已闭环：13 | ⏸ 记档：1 | 部分闭环：0

## 未闭环 = 0 声明

本人已对照 `docs/8.12/NX9-VIDEO-GEN-NODE-OPEN-LOOPS-R3.md` 全文与汇总表，下列票均已处理：

- 已闭环：VG-35、VG-36、VG-37、VG-38、VG-39、VG-40、VG-41、VG-42、VG-43、VG-44、VG-45、VG-46、VG-47
- ⏸ 记档：VG-48（`audioUrl` 音画对齐，产品后置）

## ⏸ 后置项

- VG-48：网关无消费通道，产品需先定义「参考音 / 配乐轨 / 口型」口径；触发条件见逐票记录。

## 回归风险

- 级联/画布改走链镜逐镜出片：无链旧图回退启发式仍在，但优先链镜表；未连接分镜台的旧节点应接链后重跑。
- 统一 `videoVersions` 后，旧 `videoAssetId` 无版本条目；再次生成会补建版本。
- `bridge-clip` 分支删除后，旧图经 `migrateBlockKind` 归一为 clip-gen Bridge 路径。

## 建议人工复验清单（浏览器）

按本文件上方 11 条清单执行，重点核对级联出片数、版本账本、content 不污染与迁移后模式芯片。
