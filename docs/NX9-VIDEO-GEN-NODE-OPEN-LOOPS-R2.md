# NX9 视频生成节点 · 未闭环功能分析（第二轮 R2）

> **日期**：2026-08-12
> **前置**：第一轮 VG-01～VG-12 已主体闭环（见 `NX9-VIDEO-GEN-NODE-OPEN-LOOPS.md` 顶部收口表）；VG-08 `audioUrl` 仍为产品口径待定
> **范围**：R1 修复后的复检 + 视野外扩——参考媒体可达性、批量语义诚实性、网关轮询治理、僵尸旁路、模式入口缺口
> **判定口径**：沿用四问（设得上 / 送得到 / 收得进 / 回得来），状态符号：✅ 闭环 · ⚠ 半闭环 · ❌ 断点 · ⏸ 可后置 · 🧟 死代码

## 本轮已修（VG-18 → VG-13/14 → VG-17/15/16）

| 票 | 状态 | 落点 |
|---|---|---|
| VG-18 | ✅ | `proxyVideo` 拿到 processing+taskId 立即返回；HTTP `pollVideo` 改为单次 `fetchVideoTaskStatus`；删除 18×5s 内嵌长轮询 |
| VG-13 | ✅ | `reference_videos` 与图片同一归一：本地桥 `/media` → data URI（补视频 MIME）；云端 loopback/相对路径提交前拒绝并明示 |
| VG-14 | ✅ | 携带参考图/参考视频/尾帧时禁止 Magic Hour 回落；无参考的纯文生/单图生视频回落时在 `message` 标明实际通道 |
| VG-17 | ✅ | 玩法 `userExtras` 改为 `input.prompt`（节点 `content` 仅作未传 prompt 兜底） |
| VG-15 | ✅ | `keyframeSource: 'shot'`：批量/导演批次/多镜按镜首帧；节点 FrameStrip 仅覆盖单镜 `node` 源 |
| VG-16 | ✅ | `collectClipGenUpstream` 接入批量预检与 `runShot`（参考板 + 上游图/视频；排除本批镜级首帧以免灌参考） |

## 本轮已修（VG-20/21 → VG-25/22 → VG-23/24/26）

| 票 | 状态 | 落点 |
|---|---|---|
| VG-20 | ✅ | `videoFrameStripSlots`：keyframe→首/尾，image-ref/omni-ref→Ref；`VideoFrameStrip` 按槽渲染 |
| VG-21 | ✅ | Bridge 显示 `VideoSourceStrip`；工作台与级联缺源阻断，禁止静默回落单镜 |
| VG-22 | ✅ | `proxyVideo`/`pollVideo` 接 `AbortSignal`；`awaitProxyVideo`；工作台 `onStop`；批量/级联透传取消 |
| VG-25 | ✅ | 级联四处（导演批次/Bridge/多镜/单镜）捕获 `VideoPollTimeoutError` → `pendingVideoTasks` 或节点 `taskId`，状态 `running` |
| VG-23 | ✅ | 批量取消 4–8s 时长硬钳，按时长原值经组装器下发 |
| VG-24 | ✅ | `orientationFromAspect`：`9:16`→portrait size；网关 `normalizeOpenAiVideoSize` 按 aspect 竖屏映射 |
| VG-26 | ✅ | `resolveClipGenPromptMentions` 接入批量 prompt 拼装 |

## 本轮已修（VG-19/31 → VG-32/29/33/30/34/27）

| 票 | 状态 | 落点 |
|---|---|---|
| VG-19 | ✅ | 删除不可达 `motion-story`/`seedance-chain` 旁路分支与 `clip-chain-runner`；旧 kind 经 `migrateBlockKind`→`clip-gen` |
| VG-31 | ✅ | 同上：不再假成功组链；迁移后走真实 clip-gen 出片 |
| VG-32 | ✅ | 删除孤儿 `GenConfigPillBar.tsx` |
| VG-29 | ✅ | 死卡 `ClipGenBlock.run` 委托 `runFlowBatch`（组装器路径），去掉自建 `proxyVideo`/`audioUrl` |
| VG-33 | ✅ | 工作台并发芯片对齐代码 1–8 |
| VG-30 | ✅ | `proxyVideo` 返回 `providerBaseUrl`；pending/单镜落盘；poll/resume 带回 |
| VG-34 | ✅ | `resumePendingVideoTasks`：若镜上已有更新成片，旧 task 只归档 candidate 不覆盖 |
| VG-27 | ✅ | 删除 `CLIP_GEN_MODE_CONFIGS` 的 `episode-queue`；批出保持工作台隐式行为 |
| VG-28 | ⏸ | `audioUrl` 产品口径仍待定（死卡已不再宣称送出） |

---

## 1. 一句话结论

R1 把「UI 字段进不了 `proxyVideo`」这条主断链收了：组装器统一了 A/B 路径，seed / 尾帧 / 玩法参考数组 / 并发重试 / 任务恢复都能送到请求体。第二轮暴露的问题集中在三类：

1. **送到了但上游吃不到**——参考视频仍是相对路径、Magic Hour 回落丢参考（VG-13/14），深度复刻玩法在云端通道上仍会静默失败；
2. **批量语义与单镜组装器打架**——首尾帧用节点级图盖掉每镜首帧、上游参考板不进批量、玩法 prompt 覆盖镜级 prompt（VG-15/16/17）；
3. **运行治理缺口**——网关内嵌 90s 长轮询与客户端轮询嵌套、停止不中断在途请求、级联路径超时不可恢复（VG-18/22/25）。

无新的 P0（基础文生/图生视频仍可出片）。最严重的是 VG-13：R1 宣称 VG-01 已闭环，但「字段进了 payload」不等于「provider 拿得到深度视频」。

---

## 2. 复检确认已闭环（R1 修复有效性）

| 复检点 | 结论 |
|---|---|
| A/B 路径统一经 `buildClipGenVideoRequest` | ✅ `core-pipeline-runner` / `flow-runner` clip-gen 三处 + Bridge |
| 玩法装配 + enforce 预检阻断 | ✅ 批量开跑前 `preflight`；级联 `blocked` 即停 |
| 首尾帧 / 图生视频缺图阻断 / 参考数组 | ✅ 组装器分发；网关 `last_frame_url` |
| seed / negativePrompt / modelParams | ✅ 前端发送 + `applyVideoPayloadExtras` |
| generateAudio | ✅ OpenAI 兼容通道显式透传；Magic Hour 原生 |
| ×N 芯片 | ✅ `VideoParamChips` 已移除 |
| 并发池 + maxRetries 单轨 | ✅ 批量 1–8 / 按镜重试；UI 写 `maxRetries` |
| Bridge 芯片 + `videoMode` 对齐 | ✅ 工作台有入口；有上游视频时走抽尾帧 |
| 批量 usedAssetIds + revision pin | ✅ `collectClipUsedAssets` 与级联同口径 |
| 轮询超时 → pendingVideoTasks +「继续查询」 | ✅ 批量 + 级联（VG-25） |
| 批量 prompt 优先级 | ✅ `videoPromptPro > videoPromptEn > promptEn > descriptionZh`；但玩法开启时被 VG-17 覆盖 |
| 孤儿 Header/Toolbar 已删 | ✅；另发现新孤儿 `GenConfigPillBar`（VG-32） |

测试口径仍成立：`clip-gen-request.test.ts`（11）+ `video-payload-extras.test.ts`（7）。本轮未改代码。

---

## 3. 新发现未闭环明细

### ✅ VG-13 · P1 · 参考媒体对上游不可达（R1 VG-01 的真实落点缺口）

**位置**：`gateway.service.ts` `proxyVideo`（`reference_videos` 直传 ≈L756；`imageUrlForOpenAiVideo` ≈L268）

R1 把 `referenceImages` / `referenceVideos` 写进了请求体，但网关转给 provider 时：

| 字段 | 现状 | 云端官方 API | 本地 Grok 桥 |
|---|---|---|---|
| `imageUrl` / `referenceImages` / `lastFrameUrl` | `/media/...` → `http://HOST:PORT/media/...`；仅 **本地桥 + grok-imagine-video** 转 data URI | 拿不到本机 HTTP | 图可走 data URI |
| `referenceVideos` | **原样透传**，不走 `publicMediaUrl`，更无 data URI | 相对路径直接 404 | 同样不可解析 |

深度复刻玩法的深度视频典型是 `/media/depth/xxx.mp4`。字段进了 `reference_videos`，Veo / xAI 官方接口读不到；本地桥也没有视频版 `mediaUrlToDataUri`（该函数 MIME 只认 png/webp/jpeg）。

连带：`publicMediaUrl` 拼出的 `http://127.0.0.1:PORT/...` 对公网 provider 同样不可达。网关对 xAI + localhost 图片有专门报错（≈L819），**参考视频没有对等检查**，失败表现为上游「没吃到参考」而非明确错误。

**后果**：热门玩法「深度视频动作复刻」在默认云端通道上仍是普通文生/图生视频；用户看到槽位已绿、请求体有字段，成片却没有动作迁移。

**修法**：
1. `reference_videos` 与图片走同一可达性归一：本地桥转 data URI（补视频 MIME），云端先落公网 URL 或拒绝并明示「深度视频需可公网访问 / 请用本地桥」；
2. 提交前对相对路径 / localhost 做预检，玩法 enforce 未可达则阻断，不要静默出片。

---

### ✅ VG-14 · P1 · Magic Hour 回落静默丢参考 / 尾帧 / 高级参数

**位置**：`proxyVideo` 三处回落（模型指定 ≈L721、缺 Key ≈L728、404/405 ≈L799）→ `proxyVideoMagicHour`（≈L859）

`proxyVideoMagicHour` 只消费 `prompt / model / duration / aspect_ratio / resolution / generateAudio / imageUrl`。以下字段全部丢弃、无日志、无提示：

- `referenceImages` / `referenceVideos`（深度复刻核心）
- `lastFrameUrl`（首尾帧）
- `seed` / `negativePrompt` / `modelParams`

触发条件很宽：未配 primary key 且模型为 `veo` 时，`shouldUseMagicHour` 直接走 MH；官方通道 404/405 也会静默切 MH。用户仍以为在跑 Seedance / Veo 参考通道。

**修法**：回落前检查是否携带参考数组或尾帧——有则拒绝回落并返回「当前通道不支持参考视频/尾帧，请配置 OpenAI 兼容视频端点」；无参考的纯文生/单图生视频才允许 MH 兜底。回落时至少在响应 `message` 里标明实际通道。

---

### ✅ VG-15 · P1 · 批量「首尾帧」用节点级图覆盖每镜首帧

**位置**：`clip-gen-request.ts` keyframe 分发（≈L139）× `core-pipeline-runner.ts` `runShot`（≈L565）

组装器在 `videoGenMode === 'keyframe'` 时：

```
imageUrl = data.startFrameUrl || input.imageUrl
lastFrameUrl = data.endFrameUrl
```

批量路径把每镜引导合成图作为 `input.imageUrl` 传入，但节点工作台 `VideoFrameStrip` 上传的是**一份** `startFrameUrl` / `endFrameUrl`。结果：

- 用户在工作台贴了首/尾图 → **整批所有镜头共用这两张图**，镜级 `firstFrameAssetId` 被丢掉；
- 没贴节点级首图 → 回退镜级首帧（尾帧仍空），「首尾帧」批量实际退化成图生视频。

级联单镜路径这个语义成立；批量按镜出片时不成立。

**修法**：组装器增加 `keyframeSource: 'node' | 'shot'`（或批量调用时 `applyModeDispatch` 对 keyframe 只取 `lastFrameUrl` 的节点级覆盖、首帧强制用 `input.imageUrl`）。批量 keyframe 应按镜取 `shot.firstFrameAssetId` + 可选的镜级尾帧；节点级 FrameStrip 仅用于无上游的单镜。

---

### ✅ VG-16 · P1 · 批量路径不传上游参考板 / 上游图视频

**位置**：`core-pipeline-runner.ts` `buildClipGenVideoRequest` 调用（≈L565）对比 `flow-runner.ts`（≈L510 / L672 / L731）

| 参数 | 级联 B | 批量 A |
|---|---|---|
| `upstreamReferencePack` | ✅ `findUpstreamReferencePack` | ❌ 未传 |
| `upstreamPictures` | ✅ | ❌ |
| `upstreamClips` | ✅ | ❌ |

批量是有上游镜表时的**主路径**（`VideoWorkspace.handleRun`：有 shotIds 且非 bridge → 走批量）。连了 `reference-board` 或上游图片/视频节点时，级联能吃到参考，批量完全忽略——同一画布、同一节点、换入口行为分叉。

预检 `preflight` 同样不传这些字段，玩法走本地 slots 能拦住；**仅连参考板、不选热门玩法**时，预检放行、出片无参考。

**修法**：批量入口用 `clipGenBlockId` + 当前图 `findUpstreamReferencePack` / `gatherUpstream`，把 pack 与 pictures/clips 传入预检和 `runShot`。

---

### ✅ VG-17 · P1 · 玩法装配用节点 `content` 覆盖每镜 prompt（VG-11 回退）

**位置**：`clip-gen-request.ts` ≈L113–131

```
userExtras = (data.content ?? input.prompt).trim()
activePack = buildClipGenPlaybookPack(playbook, userExtras, genPack)
prompt = activePack.assembledPrompt || input.prompt
```

玩法开启时，最终 prompt **只认节点工作台补句**（`data.content`），调用方精心组装的镜级 `videoPromptPro + 角色 + 场景 + 引导` 被丢掉。批量 20 镜会全部拿到同一句玩法模板。

`data.content` 有值时 `??` 根本走不到 `input.prompt`。R1 VG-11 的镜级优先级只在「没选玩法」时成立。

**修法**：`userExtras` 改为 `input.prompt`（调用方已拼好镜级正文 + 工作台补句）；节点 `content` 只作为调用方未传 prompt 时的兜底。单测补「玩法 + 镜级 prompt 并存」断言 `assembledPrompt` 含镜级正文。

---

### ✅ VG-18 · P1 · 网关 `pollVideo` 内嵌 90s 长轮询，与客户端嵌套

**位置**：`gateway.service.ts` `pollVideoTask`（18 × 5s ≈ 90s，且**先 sleep 再查**）；`proxyVideo` 提交后同步调用（≈L838）；HTTP `pollVideo` 再次调用（≈L990）；客户端 `pollVideoUntilDone`（60 × 5s）

三层叠在一起：

1. `POST /api/gateway/video` 上游返回 taskId 后，服务端先自己轮 90s 才把 `processing` 还给浏览器；
2. 客户端再对同一 taskId 调 `POST /api/gateway/video/poll`，**每次 poll HTTP 自己再堵最多 90s**；
3. 客户端间隔 5s、最多 60 次。

最坏情况单次出片 HTTP 占用数十分钟；反向代理 / 浏览器常见 60–120s 超时，表现为「请求失败」而任务其实在跑。VG-10 的「继续查询」走的也是这条会堵 90s 的 poll。`pollVideoTask` 第一次循环先 `sleep(5000)` 再拉取，成功任务至少白等 5s。

**修法**：
- `proxyVideo` 拿到 processing + taskId **立即返回**，不要内嵌 `pollVideoTask`；
- HTTP poll 改为**单次查询**（一次 `fetchVideoTaskStatus`），把节奏交给客户端；
- `pollVideoTask` 仅保留给明确需要服务端代等的内部调用，并取消「先睡后查」。

---

### ✅ VG-19 · P2 · `motion-story` / `clip-chain-runner` 旁路组装器

**位置**：`flow-runner.ts` `RUNNABLE_BLOCKS` 含 `motion-story`（≈L129）与完整分支（≈L2033）；`clip-chain-runner.ts`

`migrate-block-kinds.ts` 已把 `motion-story` → `clip-gen`，注释写「chain/motion 已下线假批出」，但：

- 旧图画布上的 `motion-story` 仍可运行；
- `runClipChain` 硬编码 `model: 'seedance'`，把**上一段视频 URL 当作 `imageUrl`**，不传画幅/时长/参考/高级参数，不走组装器，不写 `usedAssetIds`。

`seedance-chain` 更极端：只 `shotsToClipChain` 写回状态，**根本不调 `proxyVideo`**（VG-31）。

**修法**：`motion-story` 执行改为委托 clip-gen 组装器（或运行前自动迁移节点类型并提示）；`clip-chain-runner` 的续拍首帧改为抽尾帧（与 Bridge 同口径），禁止把 mp4 当 imageUrl。不能改行为则从 `RUNNABLE_BLOCKS` 移除并在画布标「请替换为视频生成节点」。

**落点**：删除不可达旁路分支与 `clip-chain-runner.ts`；`executeBlock` 开头 `migrateBlockKind` 已把二者映射到 `clip-gen`。`RUNNABLE_BLOCKS` 保留旧 kind 以便未重载图仍可点运行并走迁移后路径。

---

### ✅ VG-20 · P2 · `image-ref` / `omni-ref` 无参考图入口

**位置**：`video-gen-modes.ts` `showVideoFrameStrip` 仅 `mode === 'keyframe'`；`VideoWorkspace` 据此决定是否渲染 `VideoFrameStrip`

组装器在 `image-ref` / `omni-ref` 时读取 `data.referenceFrameUrl` 并入参考数组。但 FrameStrip（含 Ref 槽）只在首尾帧模式显示，用户切到「图片参考 / 全能参考」后**无法上传 Ref**。

`omni-ref` 与 `image-ref` 在组装器里行为相同（都只 extra 一张 `referenceFrameUrl`），芯片上却是两个模式，执行无区分。

**修法**：`showVideoFrameStrip` 对 `keyframe | image-ref | omni-ref` 显示；image-ref 只显示 Ref 槽，keyframe 显示首/尾，omni-ref 显示 Ref + 说明「上游图/视频一并作为参考」。若 omni 暂无独立语义，合并芯片或在 UI 标明差异。

**落点**：`videoFrameStripSlots` + `VideoFrameStrip.slots`；omni-ref 与 image-ref 同 Ref 槽（语义差异仍待产品定）。

---

### ✅ VG-21 · P2 · Bridge 工作台无源视频选择，缺上游时静默回落单镜

**位置**：`VideoWorkspace.handleRun`（bridge 时跳过批量 → 级联）；`flow-runner` Bridge 分支（≈L569）

级联 Bridge 条件：`videoMode === 'bridge' && (upstream.clips[0] || data.sourceClipUrl)`。工作台：

- 没有 `sourceClipUrl` 上传槽（只在死卡 `ClipGenBlock` 里有）；
- 无上游视频时条件失败，**掉进下方单镜文生/图生**，节点仍显示「Bridge 续拍」，用户以为在续拍；
- 有上游镜表但无 clip 时，`handleRun` 因 `videoGenMode === 'bridge'` 不走批量，级联又续不上，同样静默单镜。

**修法**：Bridge 模式显示源视频槽（上传或挑上游 clip）；无源视频时 **blocked**（与图生视频缺首图同级），禁止回落。

**落点**：`VideoSourceStrip` + 工作台/级联缺源阻断。

---

### ✅ VG-22 · P2 · 「停止」不中断在途视频请求

**位置**：`api.proxyVideo` 无 `signal`（`client.ts` ≈L168）；`flow-runner` clip-gen 的 `pollVideoUntilDone` 不传 `signal`；批量只在**镜与镜之间**看 `phase === 'cancelled'`

对比：图片 executor 已把 `abortSignal` 传到 `proxyImage` 与轮询。视频：

- 画布停止 / 工作台无停止按钮（`VideoWorkspace` 无 abort）；
- 批量点队列取消后，正在 `proxyVideo` 或 60 次轮询的那一镜继续烧钱直到自然结束；
- 级联路径完全不看取消信号。

**修法**：`proxyVideo` / `pollVideo` 对齐图片，接 `AbortSignal`；clip-gen 与批量 `pollVideoUntilDone({ signal })`；`VideoWorkspace` 运行中提供停止（持 `AbortController`）。取消后应把已提交的 taskId 记入 `pendingVideoTasks`，避免结果黑洞。

**落点**：`awaitProxyVideo` + 工作台 `onStop` + 批量/级联透传 `signal`；中止时有 taskId → `VideoPollTimeoutError` 进恢复表。

---

### ✅ VG-23 · P2 · 批量时长钳制 4–8s，与 UI 选项冲突

**位置**：`core-pipeline-runner.ts` ≈L569；`VIDEO_DURATION_OPTIONS = [5, 6, 10, 15, 30]`；级联不钳

批量：`Math.min(8, Math.max(4, shot.durationSec || node.durationSec || 5))`。用户在芯片选 10 / 15 / 30s → 静默变成 8s。级联单镜按原值发送。同一节点两种入口时长不一致。

**修法**：取消硬钳，或按当前模型能力表钳并在预检/日志写明「已按模型上限截为 Ns」。UI 选项与钳制共用一份模型能力配置。

**落点**：批量按 `shot.durationSec || node.durationSec || 5` 原值下发。

---

### ✅ VG-24 · P2 · 画幅 `aspect` 与 `size` / `orientation` 脱节

**位置**：`resolveVideoGenParams`（`packages/shared/src/utils/video-gen-params.ts`）；`VideoParamChips` 只写 `aspect`，从不写 `orientation`

`size` 由 `orientation` 决定，缺省 **landscape → 1280×720**。用户选 `9:16` 时：

- `aspect_ratio` 正确为 `9:16`；
- `size` 仍是横屏 `1280x720`。

Grok 的 `normalizeOpenAiVideoSize` 只对 `16:9` 做分辨率映射，竖屏组合无校正。provider 若优先 `size`，成片仍是横屏。

**修法**：由 `aspect` 反推 `orientation`（`9:16`→portrait，`1:1`→square，其余 landscape），或 UI 增加横竖屏芯片并与 aspect 双向同步。网关 size 归一按 aspect 优先。

**落点**：`orientationFromAspect` + 网关竖屏 size 映射。

---

### ✅ VG-25 · P2 · 级联 / 导演批次 / 单镜不捕获 `VideoPollTimeoutError`

**位置**：`flow-runner.ts` 四处 `pollVideoUntilDone`（导演批次 ≈L533、Bridge ≈L599、多镜 ≈L686、单镜 ≈L744）均未 `instanceof VideoPollTimeoutError`

R1 VG-10 只接了批量路径。级联超时会当普通错误把节点打成 `error`，`taskId` 可能写在 `lastResult` 里但工作台「继续查询」看的是 `pendingVideoTasks` 或「有 taskId 且无 videoUrl」。

导演关键帧批次：单镜超时抛错，整批 `failedCount` 上升，已成功的镜有回执，超时那镜的 taskId **不进恢复表**。

单镜成功时会写 `taskId`；超时抛错则不一定留下可恢复态。

**修法**：级联四处与批量同一 catch：记 `pendingVideoTasks` 或节点级 `taskId`，状态 `running` + message「可继续查询」，不要标失败。

**落点**：四处改 `awaitProxyVideo`；超时写 `pendingVideoTasks`/`taskId`，硬失败与 pending 分流。

---

### ✅ VG-26 · P2 · 批量工作台补句 `@mention` 不解析

**位置**：`core-pipeline-runner.ts` 直接把 `userExtra` 拼进 prompt（≈L536）；级联对 prompt 走 `resolveMentionsForPrompt`

工作台 `AssetMentionInput` 鼓励 `@` 引用角色/场景。批量把补句当字面量发送，`@林小雨` 进模型原文。级联单镜会解析。`collectClipUsedAssets` 对未解析的 `@名` 记账不完整。

**修法**：批量拼 prompt 前对 `userExtra`（及镜级 prompt）走与级联相同的 mention resolver + 角色 enrich。

**落点**：`resolveClipGenPromptMentions` 接入批量 `runShot`。

---

### ✅ VG-27 · P3 · `episode-queue` 仍仅常量（R1 VG-07 遗留）

`CLIP_GEN_MODE_CONFIGS` 有「本集批出」，工作台模式芯片未接。有上游时 `handleRun` 已隐式批量，产品可决定：要么芯片化并只出缺视频镜头，要么删常量避免词表三轨。

**落点**：删除 `episode-queue` 常量；批出继续由工作台隐式批量承担。

---

### ⏸ VG-28 · P3 · `audioUrl` 音画对齐（R1 VG-08 遗留）

网关无此通道；死卡仍收集上游音频并宣称送出。在产品未定「口型/音画对齐走哪家 API」之前保持后置；死卡文案随 VG-29 一并删。

**落点（部分）**：VG-29 后死卡不再发送 `audioUrl`；网关通道与产品口径仍待定。

---

### ✅ VG-29 · P3 · 死卡 `ClipGenBlock` 完整 `run()` 与活跃路径持续漂移

`canvasFirst` 下 `shouldUseCompactNodeShell('clip-gen')` → 只渲染 `CanvasNodeShell`，`ClipGenBlock` 不挂载，但其 `run()` 仍是另一套 `proxyVideo`（含 `audioUrl`、无组装器、无 seed）。后续改组装器不会同步到死卡，审计时容易误判「功能已有」。

**修法**：卡面改为纯展示（或删除 `run`），注释指向 `buildClipGenVideoRequest`；registry 仍可保留组件供非 canvasFirst 回退。

**落点**：`run()` 委托 `runFlowBatch` → `flow-runner` clip-gen（组装器路径）。

---

### ✅ VG-30 · P3 · `pollVideo` 使用「当前」provider 而非创建任务时的通道

`pollVideo` 用 `resolveVideoProvider(baseUrlOverride ?? {})` 读**此刻**设置。用户出片后改了 Base URL / Key，继续查询会打到错误上游。`PendingVideoTask` 只存了 `taskId / prompt / model`，没有 `baseUrl` / provider kind。

**修法**：提交成功时把 `providerBaseUrl`（或 kind）写入 pending 记录，poll 时带回。

**落点**：网关返回 `providerBaseUrl`；pending/节点落盘；`pollVideo`/`resume` 透传。

---

### ✅ VG-31 · P3 · `seedance-chain` 只组链不出片

`flow-runner` `kind === 'seedance-chain'`：把镜头编成 `clipChain` 后直接 `status: 'success'`，无 `proxyVideo`。旧图节点点运行会显示成功、没有任何视频。

**修法**：与 VG-19 一并：迁移为 clip-gen + seedance 模型，或运行时提示已下线。

**落点**：旁路分支删除；`migrateBlockKind('seedance-chain') === 'clip-gen'`。

---

### ✅ VG-32 · P3 · `GenConfigPillBar` 孤儿（含已删除的 ×N）

`apps/web/src/engine/stage-deck/chrome/attached-workspace/generation/GenConfigPillBar.tsx` 全仓库无引用，embedded 模式仍有 `imageCount` ×N（R1 VG-05 已从 VideoParamChips 移除）。与已删的 Header/Toolbar 同类。

**修法**：删除文件。

**落点**：已删除。

---

### ✅ VG-33 · P3 · 并发芯片 1–4 vs 代码允许 1–8

批量 `concurrency` clamp 1–8，默认 2；工作台 select 只有 `[1,2,3,4]`。不是断链，是能力藏了。要么 UI 放到 8，要么代码上限改 4 并写进文档。

**落点**：工作台并发选项改为 1–8。

---

### ✅ VG-34 · P3 · 恢复任务可能覆盖更新一轮的成片

`resumePendingVideoTasks` 成功后 `appendStoryboardVideoVersion`，不校验该镜是否已有更新的 `videoAssetId`。场景：镜 A 超时进 pending → 用户点单镜重试并出了新片 → 再点「继续查询」→ 旧 task 完成，追加/采用旧版本。

R1 已在**本轮成功/失败时 delete pending**；漏的是「超时后用户重试成功、旧任务后到」。

**修法**：恢复前若镜上已有更新 `createdAt` 的版本，旧 task 只归档为 candidate、不自动 adopt，并清 pending。

**落点**：`submittedAt` + 版本比对；有更新成片时只写 `videoVersions` candidate。

---

## 4. 优先级汇总

| 票 | 级别 | 一句话 |
|---|---|---|
| VG-13 | P1 | ✅ 参考视频/本机图对云端不可达，深度复刻名存实亡 |
| VG-14 | P1 | ✅ Magic Hour 回落静默丢参考、尾帧、seed |
| VG-15 | P1 | ✅ 批量首尾帧用节点级图盖掉每镜首帧 |
| VG-16 | P1 | ✅ 批量不传上游参考板 / 图 / 视频 |
| VG-17 | P1 | ✅ 玩法 prompt 覆盖镜级正文（VG-11 回退） |
| VG-18 | P1 | ✅ 网关 90s 长轮询与客户端嵌套，易超时黑洞 |
| VG-19 | P2 | ✅ motion-story / clip-chain 旁路组装器 |
| VG-20 | P2 | ✅ image-ref / omni-ref 无 Ref 上传槽 |
| VG-21 | P2 | ✅ Bridge 无源视频入口，静默回落单镜 |
| VG-22 | P2 | ✅ 停止不中断在途视频请求与轮询 |
| VG-23 | P2 | ✅ 批量时长 4–8s 钳制 vs UI 10/15/30s |
| VG-24 | P2 | ✅ aspect 竖屏但 size 仍横屏 |
| VG-25 | P2 | ✅ 级联/导演批次超时不进恢复表 |
| VG-26 | P2 | ✅ 批量补句 @mention 不解析 |
| VG-27 | P3 | ✅ episode-queue 常量未接 UI |
| VG-28 | P3 | ⏸ audioUrl 产品未定 |
| VG-29 | P3 | ✅ 死卡 run() 持续漂移 |
| VG-30 | P3 | ✅ poll 打到当前 provider 而非任务通道 |
| VG-31 | P3 | ✅ seedance-chain 假成功不出片 |
| VG-32 | P3 | ✅ GenConfigPillBar 孤儿 |
| VG-33 | P3 | ✅ 并发 UI 1–4 / 代码 1–8 |
| VG-34 | P3 | ✅ 旧 pending 恢复可能盖住新成片 |

**建议修复顺序**：VG-18（轮询治理，改动面小、收益大）→ VG-13/14（参考可达 + 禁止脏回落，否则深度复刻无法验收）→ VG-17/15/16（批量语义与组装器对齐）→ VG-20/21/25/22 → VG-23/24/26 → P3 批（删孤儿、僵尸节点迁移）。

---

## 5. 范围外备注（不开票）

- **剪辑台 `SmartReplacePanel`** 直调 `api.proxyVideo`（prompt + imageUrl + duration），不经组装器。属 `clip-editor` 产品域的「局部重生成」，与 clip-gen 节点不是双实现；若日后要统一高级参数再抽共享提交函数。
- **`bridge-clip` 节点**只抽尾帧写 `continuationPrompt`，真正出片在 clip-gen Bridge 分支——职责分离，不算断链。
- 服务端其它模块（image-ops / montage）与本轮无关。
- 并行会话中的素材库 / 剧本台 typecheck 报错不在本范围。
