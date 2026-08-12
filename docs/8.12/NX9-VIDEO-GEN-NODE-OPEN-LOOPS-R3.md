# NX9 视频生成节点 · 未闭环功能分析（第三轮 R3 · 深度）

> **日期**：2026-08-12  
> **目录**：`docs/8.12/`  
> **前置**：R1（VG-01～12）、R2（VG-13～34，除 VG-28）均已主体闭环  
> **范围**：R2 落地后的**深度复检**——工作台批出 vs 级联/画布跑批分叉、链镜表媒体未进 `gatherUpstream`、版本写回不一致、入口诚实性、迁移僵尸语义  
> **判定口径**：四问（设得上 / 送得到 / 收得进 / 回得来），状态符号：✅ 闭环 · ⚠ 半闭环 · ❌ 断点 · ⏸ 可后置 · 🧟 死代码  
> **原则**：不以「组装器已统一」「工作台能出片」跳过细缝；级联 / 死卡委托 / 导演批次与工作台必须同口径才算闭环

---

## 1. 一句话结论

参数进 payload、参考可达性、停止/超时恢复、Bridge 缺源阻断等 **R1/R2 主战场已收口**。  
第三轮挖到的问题集中在 **「工作台一条真路径，级联/画布另走一套」** 以及 **写回账本不完备**：

1. **级联几乎不读 `chainStoryboard` 的首帧/成片**，多镜常坍缩成单镜出片  
2. **级联 / 导演批次写回不走 `videoVersions`**，审片「采纳历史版本」对这两条路径失效  
3. **Bridge / 单镜成功会改写 `content`**，用户补句被 continuation / 拼装 prompt 污染  
4. **单镜「继续查询」成功不写链镜表**

没有新的「完全不能出片」P0（工作台有上游时批出仍可用）。有 **4 个 P1 诚实性/路径分叉断点**，建议先修。

---

## 2. 复检确认仍有效（勿再开票）

| 复检点 | 结论 |
|---|---|
| A（批量）/ B（级联含 Bridge）经 `buildClipGenVideoRequest` | ✅ |
| VG-13/14 参考可达 + Magic Hour 带参考拒回落 | ✅ |
| VG-15/16/17 批量 keyframeSource / collectClipGenUpstream / 玩法 prompt | ✅ **仅批量主路径**；级联多镜见 VG-39 |
| VG-18/22/25 网关短返回 + Abort + 级联超时进 pending | ✅ |
| VG-19/31 旁路删除；`clip-chain-runner` / `GenConfigPillBar` 已不存在 | ✅ |
| VG-29 死卡 `run` 委托 `runFlowBatch` | ✅ 委托有效；但委托进的是**级联分叉**，见 VG-35 |
| VG-30/34 providerBaseUrl + resume 不盖更新成片 | ✅ 批量 pending；单镜 resume 写回见 VG-38 |
| VG-20/21/23/24/26/27/32/33 | ✅ |
| VG-28 `audioUrl` | ⏸ 仍待产品口径 |

---

## 3. 深度发现明细

### ❌ VG-35 · P1 · 级联/画布跑批与工作台批出分叉：链镜多镜坍缩成单镜

**位置**：

- 工作台真路径：`VideoWorkspace.handleRun` → `batchGenerateVideosFromShots`（读 `useUpstreamShots` → `chainStoryboard`）
- 级联假路径：`flow-runner` `kind === 'clip-gen'` 在导演批次 / Bridge 之后，仅当  
  `breakdownShots.length > 1 && upstream.pictures.length > 1` 才按镜循环  
- `gatherUpstream`（`packages/shared/src/engine/flow-graph.ts`）对 `storyboard-desk`：**只收集 preview 帧进 `pictures`，不收集 `chain.shots[].firstFrameAssetId` / `videoAssetId`**

**现象**：

| 入口 | 多镜有批审首帧的 chain | 实际行为 |
|---|---|---|
| 工作台点「生成」 | ✅ | 按镜批出（并发/重试/pending） |
| 画布运行 / 级联 / 死卡 `runFlowBatch` | ⚠/❌ | 无 preview 多图 → 走单镜分支，**只出 1 条视频** |
| 仅有 chain、无 `storyboardPreview` / 无 scriptBreakdown | ❌ | `pictures=[]`、`breakdownShots` 空或短 → 单镜文生/乱首图 |

导演台直连 clip-gen 时，`gatherUpstream` 对 `director-desk` 只推 `previewUrl` / `directorDeskRefs`，同样**不展开上游链镜首帧**。

| 问 | 结果 |
|---|---|
| 设得上 | 工作台有镜表审片网格 |
| 送得到 | 工作台 ✅；级联 ❌ 常只送一镜 |
| 收得进 | 单条 URL 可进节点 |
| 回得来 | 其余镜 `videoAssetId` 仍空，审片网格显示未生成 |

**修法**：

1. `gatherUpstream` 对 storyboard/director 上游：把 chain 的 `firstFrameAssetId` → pictures、`videoAssetId` → clips（可去重）；或  
2. 级联 clip-gen 在检测到上游 `shotIds`/`chainStoryboard` 时**直接委托** `batchGenerateVideosFromShots`（与工作台同入口），删掉 `breakdown×pictures` 启发式批出。

---

### ❌ VG-36 · P1 · 级联 / 导演批次写回不走 `videoVersions`（与批量账本分叉）

**位置**：

- 批量：`core-pipeline-runner.runShot` → `appendStoryboardVideoVersion` ✅  
- 级联多镜 / 单镜：`patchFlowShot` / 节点 data 只写 `videoAssetId` + `videoStatus: 'review'`  
- 导演批次：`director-keyframe-batch-runner` 同样只写 `videoAssetId`，**无 versions**

**后果**：

- 工作台 `VideoShotReviewGrid` 的「历史版本 / 采纳」对级联、导演消费出来的成片**没有条目可点**  
- VG-34「旧 pending 归档为 candidate」依赖 versions；级联路径本身就不建 versions，恢复语义与批量不对齐  
- 智能剪辑 / 导出若读 adopted version，级联产物可能「镜上有 URL、版本表空」

| 问 | 结果 |
|---|---|
| 设得上 | 审片网格有版本 UI |
| 送得到 | 成片 URL 有 |
| 收得进 | ⚠ 只进 `videoAssetId` |
| 回得来 | ❌ 无 `videoVersions`，采纳链路空转 |

**修法**：三级联写回统一走 `appendStoryboardVideoVersion`（或抽 `commitClipToShot(shot, { url, prompt, model })`），导演 `shotPatch` 也必须带 version。

---

### ❌ VG-37 · P1 · Bridge / 单镜成功改写 `content`（入口诚实性，对标图像 PG-37）

**位置**：`flow-runner.ts` clip-gen Bridge 分支与单镜成功分支

```ts
// Bridge
content: continuationPrompt,  // 抽帧后
content: finalPrompt,         // 出片后

// 单镜
content: singleReq.prompt,
```

导演批次结束还会把 `content` 写成摘要文案（`导演关键帧批次 m/n`）。

**后果**：`useLocalNodePrompt` 未聚焦时会把节点 `content` 同步回输入框 → 用户补句被续拍拼装 / 角色 enrich / 玩法装配结果覆盖。下一轮批量把污染后的 `content` 当 `userExtra` 拼进每镜（VG-11），二次污染。

| 问 | 结果 |
|---|---|
| 设得上 | 工作台有独立 prompt |
| 传得真 | ❌ 运行后输入框被改写 |
| 跑得完 | 出片成功 |
| 流得回 | ⚠ 历史可能存到污染正文 |

**修法**：assembled / continuation 写入 `lastCompiledPrompt` / `continuationPrompt` / `message`，**禁止**成功路径 `content = finalPrompt`；Bridge 中间态也不要覆盖用户草稿。

---

### ❌ VG-38 · P1 · 单镜「继续查询」成功不写链镜表、不建 version

**位置**：`VideoWorkspace.resumeTasks` 单镜分支

成功时仅：

```ts
updateNodeData(blockId, { status: 'success', videoUrl: res.url, error: undefined });
```

对比：级联单镜成功会 `patchFlowShot`；批量 resume 会 `appendStoryboardVideoVersion`。

**后果**：有上游镜表时，超时后点「继续查询」→ 节点绿了、审片格仍无片；用户以为恢复失败，再点生成可能重复扣费。也不清 `taskId`（靠 `!videoUrl` 隐藏按钮，字段仍脏）。

| 问 | 结果 |
|---|---|
| 设得上 | 有「继续查询」 |
| 送得到 | poll 可取 URL |
| 收得进 | ⚠ 只进节点 `videoUrl` |
| 回得来 | ❌ 链镜 / versions 不更新 |

**修法**：单镜 resume 成功后：若有 `linkedShotId`/上游唯一镜，走与批量相同的 `appendStoryboardVideoVersion` + 清 `taskId`/`message`；多镜场景应引导走 `resumePendingVideoTasks`。

---

### ⚠ VG-39 · P2 · 级联多镜仍把全部 `upstream.pictures` 灌进每镜参考（VG-16 只修了批量）

**位置**：`flow-runner` 多镜循环 `buildClipGenVideoRequest({ upstreamPictures: upstream.pictures, ... })`

批量路径会用 `shotFrameUrls` 过滤本批首帧，避免把每镜 keyframe 再塞进 `referenceImages`。级联多镜**未过滤**，且条件触发时 pictures 往往来自 preview 全帧 → 每镜请求参考数组膨胀，Seedance S 级易被 `validateSClassReferences` 误伤，或云端吃到「别人的首帧」当风格参考。

**修法**：级联与批量共用 `collectClipGenUpstream` + 同款 shot-frame 排除；或删级联自建循环、委托批量（VG-35）。

---

### ⚠ VG-40 · P2 · 「文生视频」模式下批量仍强制带首帧 `imageUrl`

**位置**：`buildClipGenVideoRequest` 对非 image-to-video/keyframe 模式**不清除** `input.imageUrl`；`batchGenerateVideosFromShots` 恒传 `guideImageUrl = firstFrame`

工作台模式芯片可显示「文生视频」，有上游批出时请求体仍带分镜首图 → 实际是图生视频。用户以为关掉了参考图约束。

**修法**：`text-to-video` 时 body 不传 `imageUrl`（或显式 `stripImage: true`）；有上游批出时 UI 自动升到 `image-to-video` 并提示「批出依赖已批审首帧」。

---

### ⚠ VG-41 · P2 · 首尾帧模式缺尾帧不阻断；image-ref / omni-ref 无 Ref 不阻断

**位置**：`clip-gen-request.ts` mode 分发

- `keyframe`：只要求首图，`lastFrameUrl` 可选 → 无尾帧时静默退化成图生视频，芯片仍写「首尾帧」  
- `image-ref` / `omni-ref`：无 `referenceFrameUrl` 且无上游参考时不 `blocked`，等同文生/图生

**修法**：keyframe 缺尾帧 → blocked 或 UI 降级芯片；image-ref 无任何参考图 → blocked；omni-ref 无图且无视频 → blocked。

---

### ⚠ VG-42 · P2 · `modelParams` 解析失败静默丢弃

**位置**：`parseModelParams` 返回 `null` 时 `applyVideoPayloadExtras` 跳过；工作台无校验提示

用户填了非法 JSON，以为 Provider 参数已生效，实际请求无该字段。

**修法**：组装器或工作台失焦校验；非法时 `blocked` 或 chip 旁红字；网关可在 `message` 带回 `modelParamsIgnored`。

---

### ⚠ VG-43 · P2 · 批出跳过未批审镜仅 activity log，工作台无汇总

**位置**：`batchGenerateVideosFromShots`：`unapproved` 只 `log`；`targets` 过滤后可能为空或部分

用户点生成，部分镜静默跳过；节点可能仍 `success`（其余镜已有片或本轮成功），审片格混杂「未动 / 已出」无顶栏说明。

**修法**：返回 `{ ok, fail, skipped }` 写回节点 `message`；工作台 toast/条：「跳过 N 镜（关键帧未批审）」。

---

### ⚠ VG-44 · P2 · `linkedShotIds` 自动全选覆盖；`retryShot` 无取消信号

**位置**：`VideoWorkspace` `useEffect` 同步全部 `shotIds` → `linkedShotIds`；`retryShot` 调批量不传 `signal`

- 无法在工作台取消勾选子集再批出（键帧门禁 / 下游若读 linked 也会以为全选）  
- 单镜重试无法被工作台「停止」打断

**修法**：仅在空/`undefined` 时默认全选，保留用户编辑；`retryShot` 复用 `runAbortRef`。

---

### ⚠ VG-45 · P2 · Bridge / omni-ref 吃不到链上已有成片作源

**位置**：`gatherUpstream` storyboard 分支不推 `videoAssetId` → `clips`

Bridge 依赖 `upstream.clips` 或手动 `sourceClipUrl`。上游镜表已有成片、但未再连一个 clip-gen/media-pin 时，VG-21 会阻断或缺源——**链上其实有片却不可见**。

**修法**：与 VG-35 同源——chain 成片进入 `clips`；`VideoSourceStrip` 可列出上游镜视频供选。

---

### 🧟 VG-46 · P3 · `bridge-clip` 执行分支仍是假成功僵尸

**位置**：`flow-runner.ts` `if (kind === 'bridge-clip')`：只抽尾帧 + 写 continuation，`status: 'success'`，**不出片**

`migrateBlockKind('bridge-clip') → 'clip-gen'`，正常加载图进不了该分支；若有人绕过 migrate 或测试直接喂 type，仍会假绿。

**修法**：删除分支；或 `throw`「已弃用，请用 clip-gen + Bridge 模式」。

---

### 🧟 VG-47 · P3 · 迁移补丁留下的孤儿 `videoMode`（chain / motion / lipsync …）

**位置**：`BLOCK_KIND_MIGRATION_PATCHES`：`seedance-chain → videoMode:'chain'`，`motion-story → 'motion'`，以及 lipsync/photo-speak 等

执行层只认 `bridge` / 默认单镜；UI `readVideoGenMode` 只认 `bridge` + `videoGenMode` 词表。迁移后节点带着无意义的 `videoMode`，芯片显示「文生视频」，与历史预期不符（seedance-chain 至少应保留 `model: 'seedance'`——此项已有；motion 语义全丢）。

**修法**：迁移补丁改为 `videoMode:'single'|'bridge'` + 需要的 `videoGenMode`；清扫历史 data 或启动时 normalize。

---

### ⏸ VG-48 · 产品后置 · `audioUrl` 音画对齐（承接 VG-08/28）

工作台无入口；组装器不发送；死卡已不再宣称。保持后置，待产品定义「参考音 / 配乐轨 / 口型」哪一种后再开票实现，**禁止**再在 UI 假宣称。

---

## 4. 优先级与建议修序

| 序 | 票 | 优先级 | 一句话 |
|---|---|---|---|
| 1 | VG-35 | P1 | 级联委托批量 / gatherUpstream 补链帧，消灭多镜坍缩 |
| 2 | VG-36 | P1 | 所有写回统一 `appendStoryboardVideoVersion` |
| 3 | VG-37 | P1 | 禁止出片写 `content` |
| 4 | VG-38 | P1 | 单镜 resume 写链 + version |
| 5 | VG-39/45 | P2 | 级联参考过滤 + chain 成片进 clips |
| 6 | VG-40/41 | P2 | 模式芯片与真实请求对齐 / 缺前置阻断 |
| 7 | VG-42/43/44 | P2 | modelParams 校验、跳过汇总、linked 可编辑、retry 可停 |
| 8 | VG-46/47 | P3 | 删僵尸分支、normalize 迁移 videoMode |
| 9 | VG-48 | ⏸ | audioUrl 产品口径 |

建议下一轮落地顺序：**VG-35 → VG-36 → VG-37/38 → VG-39/45 → VG-40/41 → 其余**。

---

## 5. 验收清单（修完后应全绿）

- [ ] 仅 chain 有多镜批审首帧、无 preview 时，画布运行 clip-gen 出片数 = 可出镜数（与工作台一致）  
- [ ] 级联 / 导演 / 批量三条路径镜上均有 `videoVersions`，审片可采纳  
- [ ] Bridge / 单镜跑完后工作台 textarea 仍是用户原文  
- [ ] 单镜超时 → 继续查询 → 链镜 `videoAssetId` + version 更新  
- [ ] 文生视频模式请求体无 `imageUrl`；或 UI 已升为图生并明示  
- [ ] keyframe 无尾帧 / image-ref 无 Ref 时阻断或降级芯片  
- [ ] `flow-runner` 无 `kind === 'bridge-clip'` 假成功分支  
- [ ] 相关测例：`clip-gen-request` / 新增 `vg-r3-*.test.ts`（级联委托、version 写回、content 不污染）

---

## 6. 关联文档

- R1：`docs/NX9-VIDEO-GEN-NODE-OPEN-LOOPS.md`  
- R2：`docs/NX9-VIDEO-GEN-NODE-OPEN-LOOPS-R2.md`  
- 同目录深挖索引：`NX9-DEEP-OPEN-LOOPS-2026-08-12.md`（其中 DEEP-01/02 关于 seedance-chain/motion-story 的描述以 **R2 已删旁路** 为准，勿再开票；本 R3 的 VG-35+ 才是现行断点）
