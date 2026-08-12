# NX9 视频生成节点（clip-gen）· 未闭环功能清单

> **日期**：2026-08-12
> **范围**：`clip-gen` 节点（画布紧凑卡 + 挂载 VideoWorkspace）+ 三条执行路径 + 网关视频代理
> **依据**：仓库现行代码逐行核对（不以「字段/按钮已存在」为准，以「参数真的送到出片请求」为准）
> **关联台账**：`NX9-REAL-COMPLETION-LEDGER.md`（F-004 100% / F-048 58% / F-049 45%）、`NX9-REQUIREMENTS-DEPTH-VIDEO-ACTION-REPLICA.md`
> **第二轮**：R1 收口后的复检见 [`NX9-VIDEO-GEN-NODE-OPEN-LOOPS-R2.md`](./NX9-VIDEO-GEN-NODE-OPEN-LOOPS-R2.md)（VG-13～VG-34）

---

## 收口状态（2026-08-12 修复批次）

收口抓手：新增共享组装器 `apps/web/src/engine/clip-gen-request.ts`（`buildClipGenVideoRequest`），A（批量）/ B（级联，含 Bridge）两条活跃路径统一经它组装 `proxyVideo` 请求体；服务端新增 `gateway/video-payload.util.ts` 归一化扩展参数。

| 条目 | 状态 | 落点 |
|------|------|------|
| VG-01 玩法执行断链 | ✅ 已收口 | 组装器读 `readClipGenPlaybook` → `buildClipGenPlaybookPack`（含 gen-pack 装配、enforce 阻断）、参考图/视频数组透传；A 路径开跑前预检阻断 |
| VG-02 生成模式分发 | ✅ 已收口 | keyframe → `startFrameUrl`/`lastFrameUrl`；image-to-video 缺首图阻断；image-ref/omni-ref 接 `referenceFrameUrl` + 参考数组；服务端映射 `last_frame_url` |
| VG-03 seed/negativePrompt/modelParams | ✅ 已收口 | 前端随组装器发送；网关 `applyVideoPayloadExtras` 解析（modelParams 支持 JSON / key=value，禁改 model/prompt） |
| VG-04 generateAudio | ✅ 已收口 | OpenAI 兼容通道透传 `generate_audio`（true/false 均显式），Magic Hour 维持原生支持 |
| VG-05 ×N 芯片 | ✅ 已收口 | 从视频参数条移除（视频路径不消费 imageCount） |
| VG-06 并发/重试 | ✅ 已收口 | 单轨 `maxRetries`（兼容读旧 `maxRetry`）；批量路径实现并发池（1-8，默认 2）+ 按镜重试 |
| VG-07 模式词表三轨 | ✅ 主体收口 | 工作台模式芯片新增「Bridge 续拍」，`patchVideoGenMode` 同步写 `videoMode`；Seedance S 级校验进组装器（超限阻断）。`episode-queue` 常量仍未接 UI（保持隐式批量行为） |
| VG-08 audioUrl 音画对齐 | ⏸ 遗留 | 产品口径未定（网关无此通道）；死卡宣称文案随 C 路径处置一并解决 |
| VG-09 批量 usedAssetIds | ✅ 已收口 | 批量路径按镜 `collectClipUsedAssets`（与级联同口径，含 revision pin）写回链镜表 |
| VG-10 任务恢复 | ✅ 已收口 | 轮询超时抛 `VideoPollTimeoutError`，批量记 `pendingVideoTasks`（含 prompt/model）；工作台「继续查询」按钮 + `resumePendingVideoTasks`；单镜 taskId 也可查 |
| VG-11 批量 prompt 口径 | ✅ 已收口 | 优先级 `videoPromptPro > videoPromptEn > promptEn > descriptionZh`；工作台补句作为全局附加句拼入每镜 |
| VG-12 死代码与小缺陷 | ✅ 主体收口 | `retryShot`/`handleRun` 依赖数组修复；删除孤儿 `VideoWorkspaceHeader/Toolbar`；seedance hint 改为 S 级参考上限说明。死卡 `ClipGenBlock` 本体保留（canvasFirst 下不渲染），待专项迁移 |

测试：`apps/web/src/engine/__tests__/clip-gen-request.test.ts`（11 例）、`apps/server/test/video-payload-extras.test.ts`（7 例）全绿；web 全量 168 例通过。

---

## 0. 怎么读本文

### 0.1 「闭环」判定（视频节点版四问）

| # | 问句 | 失败即未闭环 |
|---|------|--------------|
| 1 | **设得上** | UI 上能设置该参数/模式，并持久化到节点 data |
| 2 | **送得到** | 执行路径真的读取该字段并放进 `proxyVideo` 请求 |
| 3 | **收得进** | 服务端网关解析该字段并转给上游 provider |
| 4 | **回得来** | 结果/失败/任务态能写回节点与链镜表，可恢复可追溯 |

### 0.2 状态符号

| 符号 | 含义 |
|------|------|
| ✅ 已闭环 | 四问全过 |
| ⚠ 半闭环 | UI 存在，但执行/服务端断一截 |
| ❌ 断点 | 产品主链需要，实际是死 UI 或死代码 |
| 🧟 死代码 | 完整实现存在但在当前产品面不可达 |

---

## 1. 先厘清架构：一个节点、三套执行、一套死卡

当前 `canvasFirst = true`（`apps/web/src/config/product-surface.ts`），`clip-gen` 在画布上渲染为**紧凑舞台卡**（截图中的「视频生成 / 暂无视频」即 `CanvasNodeShell` → `CanvasNodeBody`），全部操作 UI 在节点下方挂载的 **VideoWorkspace**。

实际存在 **三条执行实现 + 一套不再渲染的旧卡**：

| 路径 | 入口 | 文件 | 状态 |
|------|------|------|------|
| A. 批量出片 | VideoWorkspace 运行（有上游镜表时）/ 单镜重生成 | `core-pipeline-runner.ts` `batchGenerateVideosFromShots` | 活跃主路径 |
| B. 级联单镜 | VideoWorkspace 运行（无上游镜表时）→ cascade-runner → flow-runner | `flow-runner.ts` `kind === 'clip-gen'` 分支 | 活跃 |
| C. 旧卡 run() | 旧 ClipGenBlock 卡面按钮 | `blocks/core/ClipGenBlock.tsx` | 🧟 canvasFirst 下不渲染（`shouldUseCompactNodeShell('clip-gen')=true`，`compactCanvas: true`） |
| 服务端 | `/api/gateway/video` | `gateway.service.ts` `proxyVideo` | 活跃 |

**核心结构性问题：功能最全的实现（C）恰恰是不可达的那条。** 玩法装配、参考图/参考视频数组、S 级参考数校验、音画对齐、任务查询按钮、401 引导开设置，全部只写在旧卡 run() 里。工作台的 A/B 两条活跃路径都没有这些逻辑。

---

## 2. 总览矩阵

| 能力 | 设得上 | 送得到 | 收得进 | 回得来 | 总评 |
|------|:----:|:----:|:----:|:----:|------|
| 基础文生/图生视频（prompt+首帧+画幅+时长+清晰度） | ✅ | ✅ | ✅ | ✅ | **✅ 闭环** |
| F-004 链镜表双轨 / 禁全局批出 | ✅ | ✅ | — | ✅ | **✅ 闭环** |
| F-008 审片（批准/打回必填原因/版本采用/重生成） | ✅ | ✅ | — | ✅ | **✅ 闭环** |
| 深度视频转换（上传源片→转深度） | ✅ | ✅ | ✅ `/api/montage/depth-video` | ✅ | **✅ 闭环** |
| 拖出媒体钉 / 分镜引导图合成 / @mention 解析（B 路径） | ✅ | ✅ | ✅ | ✅ | **✅ 闭环** |
| 热门玩法「深度视频动作复刻」**执行** | ✅ | ❌ | ✅（网关支持） | ❌ | **❌ 断点（最严重）** |
| 生成模式芯片（文生/全能参考/图生/首尾帧/图片参考） | ✅ | ❌ | ❌ | — | **❌ 死 UI** |
| 首尾帧 `startFrameUrl`/`endFrameUrl`/`referenceFrameUrl` | ✅ | ❌ | ❌（无 last_frame 字段） | — | **❌ 死 UI** |
| Seed / Negative Prompt / Provider 参数 | ✅ | ❌ | ❌ | — | **❌ 死 UI** |
| 有声/无声 `generateAudio` | ✅ | ✅ | ⚠ 仅 Magic Hour 通道 | — | **⚠ 半闭环** |
| ×N 条数芯片（`imageCount`） | ✅ | ❌ | — | — | **❌ 死 UI（视频不消费）** |
| F-048 并发/重试 | ✅（双轨字段还不一致） | ❌ | — | — | **❌ 死 UI** |
| F-049 Bridge 续拍 | —（入口只在死卡） | ✅（B 路径实现在） | ✅ | ✅ | **⚠ 无入口** |
| F-049 episode-queue 模式 | ❌ | ❌ | — | — | **❌ 仅常量定义** |
| F-049 Seedance（参考图×9/视频×3） | ⚠ 模型可选 | ❌ | ✅ | — | **❌ 参考数组断链** |
| 音画对齐 `audioUrl`（上游音频） | 🧟 仅死卡收集 | ❌ | ❌ 网关不读 | — | **❌ 双重断链** |
| `usedAssetIds` 生成回流记账 | — | ⚠ 仅 B 路径写 | — | ⚠ | **⚠ A 路径缺账** |
| 异步任务恢复（刷新后 taskId 找回） | ❌ | — | ✅（`/video/poll` 在） | ❌ | **❌ 断点** |

---

## 3. 未闭环明细

### VG-01 ❌ 热门玩法「深度视频动作复刻」执行断链（P0）

**现象**：玩法菜单、槽位工具（深度/人物/场景）、深度转换、readiness 门禁（未就绪禁运行）、「运行 · 深度复刻」按钮标签全部就绪；点运行后**深度视频、人物图、场景图根本不会送到出片请求**，实际只出普通文生视频。

**断在中间层**：
- 槽位数据由 `VideoWorkspace` 写入节点 `videoPlaybookSlots` ✅
- 装配函数 `buildClipGenPlaybookPack`（组 prompt + `referenceVideos`/`characterUrls`/`sceneUrl`）**只被死卡 `ClipGenBlock.run()` 调用**（另有 `apps/server/test/req-dv-depth-action-replica.test.ts` 只测装配纯函数）
- 活跃路径 A（`batchGenerateVideosFromShots`）与 B（`flow-runner` clip-gen 分支）**均无一处** `readClipGenPlaybook` / `playbook` 引用
- A/B 两条路径的 `api.proxyVideo` 调用**都不传 `referenceImages`/`referenceVideos`**
- 服务端 `proxyVideo` 明明已支持 `reference_images`/`reference_videos`/`video_urls` ✅ —— 白支持

**需求文档口径**：`NX9-REQUIREMENTS-DEPTH-VIDEO-ACTION-REPLICA.md` §3.1 第 4 条「运行时装配提示词 + 参考图/视频送入视频连接」——未落地到活跃路径。

**收口方向**：把死卡 run() 里的装配段（`getGenPack('gen-depth-action-replica')` → `buildClipGenPlaybookPack` → `referenceImages/referenceVideos` 注入）抽成共享执行函数，flow-runner clip-gen 分支与批量路径统一调用；enforce 阻断逻辑一并迁移。

---

### VG-02 ❌ 生成模式芯片是纯 UI 状态（P1）

`videoGenMode`（文生视频/全能参考/图生视频/首尾帧/图片参考，`video-gen-modes.ts`）只被 `VideoWorkspace`/`VideoWorkspaceToolbar` 读取用于渲染芯片和显隐 FrameStrip；**没有任何 runner 读它**。五种模式点了之后执行完全一样。

连带：
- 「首尾帧」模式的 `VideoFrameStrip` 写 `startFrameUrl`/`endFrameUrl`/`referenceFrameUrl` 三字段，**全仓库没有读取者**（flow-runner 里的 `endFrameUrl` 是 Bridge 路径自己抽帧写的，不是读用户上传的）
- 服务端 payload 只有单 `image_url`（首帧）；**没有尾帧字段**，即使前端送了也无处安放
- 「图生视频」模式与自动挑上游首图的现行为无区分；「全能参考/图片参考」与 VG-01 的参考数组断链是同一件事

**收口方向**：按模式分发参数——`keyframe` → 首/尾帧字段进 payload（网关加 `last_frame_url` 类字段或按 provider 映射）；`image-to-video` → 强制要求首图；`omni-ref`/`image-ref` → 走 VG-01 的参考数组通道；否则就砍掉芯片，别留死 UI。

---

### VG-03 ❌ Seed / Negative Prompt / Provider 参数不生效（P1）

工作台「高级」面板可填 `seed`、`negativePrompt`、`modelParams`（`VideoWorkspace.tsx` toolbarAdvanced），三条执行路径**都不发送**，服务端 `proxyVideo` 也**不解析**这三个字段（对比：图像通道两端都支持 seed/negativePrompt）。

**收口方向**：A/B 路径把三字段放进 `proxyVideo` body；网关透传（`seed`、`negative_prompt`，`modelParams` 解析 JSON/key=value 后合并 payload）。

---

### VG-04 ⚠ 「有声/无声」只对 Magic Hour 生效（P2）

`generateAudio` 客户端各路径都传了；服务端只有 `proxyVideoMagicHour` 消费（`audio: generateAudio`）。走 OpenAI 兼容通道（veo / grok）时 payload 不含任何音频参数——芯片选「有声」无效且无提示。

**收口方向**：网关按 provider 能力映射（如 veo 的 `generate_audio`），不支持的通道在响应 message 里明示「该模型不支持音频开关」。

---

### VG-05 ❌ ×N 条数芯片对视频无效（P2）

`VideoParamChips` 提供 ×1~×4 芯片写 `imageCount`；该字段只被**图像**执行器（`picture-gen-executor` / flow-runner picture 分支）当 `n` 消费。视频路径永远出 1 条。死 UI。

**收口方向**：要么实现同 prompt 多 take（循环 N 次出片、写入版本列表），要么从视频参数条移除该芯片。

---

### VG-06 ❌ F-048 并发/重试：双轨字段 + 执行层零消费（P1）

- 死卡写 `concurrency`/`maxRetries`（1–8 / 0–5）；工作台写 `concurrency`/`maxRetry`（1–4 / 0–3）——**字段名都不一致**（台账 F-048「单轨唯一源未证实」，实况比台账更差）
- 唯一批量实现 `batchGenerateVideosFromShots` 是**串行 for 循环**：无并发池、无失败重试，`concurrency`/`maxRetry(ies)` 一处都没读

**收口方向**：统一字段名（建议 `concurrency`/`maxRetries`）；批量循环改并发池 + 按 `maxRetries` 重试（导演台 `runDirectorDeskBatch` 已有同款参数与队列可参照）；补单测。

---

### VG-07 ⚠/❌ F-049 三模式：Bridge 无入口、episode-queue 仅常量、Seedance 断参考（P1）

| 子项 | 实况 |
|------|------|
| Bridge 续拍 | flow-runner 有真实实现（上游视频抽尾帧 → 续拍 prompt → 图生视频）✅；**但触发条件 `videoMode === 'bridge'` 只能在死卡上设置**，工作台没有任何 UI 写 `videoMode` → canvas-first 下用户根本进不去这条路径 |
| episode-queue | `seedance-bridge.ts` 定义了 `ClipGenMode: 'episode-queue'` 与配置，**无 UI、无 runner 分支消费**；现在的批量是「有上游镜表就批」的隐式行为，与模式常量脱钩 |
| Seedance | 模型下拉可选 `seedance`；S 级参考限制（图≤9 / 视频≤3，`validateSClassReferences`）**只在死卡里校验**；活跃路径不传参考数组（VG-01），校验与上限均为死代码 |

另注意：仓库有**三套互不相认的模式词表**——死卡 `videoMode`(single/bridge/seedance)、工作台 `videoGenMode`(5 种)、shared `ClipGenMode`(4 种含 episode-queue)。收口时应合并为一套。

---

### VG-08 ❌ 音画对齐 audioUrl 双重断链（P2）

死卡 run() 收集上游 sound-gen 输出传 `audioUrl` 并在卡面显示「已连接上游音频 · 已传入音画对齐」；实况：① 该收集逻辑在活跃路径不存在；② 服务端 `proxyVideo` **完全不读 `audioUrl`**。即使旧卡还在渲染，这个提示也是假的。

**收口方向**：先定产品口径（视频模型侧音画对齐 vs 后期在剪辑节点混音）。若走后者，删掉假提示，把音频对齐交给 clip-editor / montage。

---

### VG-09 ⚠ usedAssetIds 回流只覆盖 B 路径（P1）

素材库台账 OL-03「Clip/视频写 usedAssetIds ✅」只对 flow-runner 路径成立（`collectClipUsedAssets` 三处调用全在 flow-runner）。**A 路径（批量，即接上游镜表后的工作台主路径）写镜头版本但不写 `usedAssetIds`**——大多数真实产片走的恰恰是 A。素材健康「未使用」口径在批量出片场景会出假账。

**收口方向**：`batchGenerateVideosFromShots` 出片成功时按镜头组装 `collectClipUsedAssets` 同款账本，随 `appendStoryboardVideoVersion` 一起 patch。

---

### VG-10 ❌ 异步任务不可恢复（P1）

- 出片轮询是**进程内阻塞**：`pollVideoUntilDone` 最多 60×5s；批量路径逐镜阻塞等
- 工作台**没有「查询任务」入口**（死卡才有 `taskId` + 查询按钮 + `pollClipTask`）
- 刷新/关页后：taskId 只在节点 data（B 路径写了 `taskId`；A 路径根本不写），镜头停在 `videoStatus:'draft'` 或 `failed`，无任何恢复动线；无持久任务表

**收口方向**：A 路径把 `taskId` 写进镜头版本草稿；工作台对 `status==='running'/processing' 且有 taskId` 的节点/镜头提供「继续查询」；可选：后端任务表 + 启动时对账。

---

### VG-11 ⚠ 批量与单镜 prompt 组装口径漂移（P2）

同一个节点两条活跃路径的 prompt 来源不一致：

| | A 批量 | B 级联单镜 |
|---|---|---|
| 镜头 prompt | `videoPromptEn → promptEn → descriptionZh` | `videoPrompt → imagePrompt → 节点 prompt` |
| `videoPromptPro` | ❌ 不用（死卡用） | ❌ 不用 |
| 用户在工作台输入的补句 | **❌ 完全忽略**（有上游镜表时 draft 不进 prompt） | ✅ 作为回退 |
| @mention 解析 | ❌ 无 | ✅ 有 |
| 角色/场景/运镜注入 | ✅（3D guide + placement + scene） | ⚠ 仅角色 enrich |

用户感知：接了分镜台之后，在输入框里打的字「没用了」，且无任何提示。

**收口方向**：统一镜头 prompt 优先级函数（shared 已有类似 helper）；有上游镜表时把用户 draft 作为全局附加句拼进每镜，或 UI 明示「批量模式下输入框仅作玩法补句」。

---

### VG-12 小缺陷与死代码清理（P3）

1. `VideoWorkspace.retryShot` 的 `useCallback` 依赖只有 `[blockId]`，闭包内使用 `shots` —— 重试可能携带**过期链镜表**
2. `VideoWorkspaceHeader.tsx` / `VideoWorkspaceToolbar.tsx` 无任何引用（旧壳遗留孤儿）
3. 死卡 `ClipGenBlock.tsx`（716 行）在 canvasFirst 下不可达：其独有能力（401 打开连接设置、角色选择徽章、聚焦智能剪辑、`bridgeRefs` 收集）要么迁移进工作台要么随卡清理；保留期间每次改动都是双倍维护
4. `CLIP_GEN_MODELS` 里 `seedance` 的 hint 还写着「分镜连续链请用 motion-story」，而 motion/chain 已下线（flow-runner 注释「chain/motion 已下线假批出」）——文案误导

---

## 4. 已闭环（勿再开票）

- **F-004 双轨与作用域**：无上游链 → 空镜表 + 拒绝写全局；写回一律进上游 desk `chainStoryboard`（卡面/工作台/批量/轮询四处一致）
- **F-008 审片回路**：批准 / 全部批准 / 打回必填原因 / 多版本切换与采用 / 单镜重生成（含 keyframe 未批审禁重生成）
- **关键帧门禁**：导演台来源 + 未批审镜头 → `ReviewGateBlockedError` 阻断
- **分镜引导**：箭头/标注合成进参考帧 + prompt 文案引导（A/B 路径都有）
- **深度视频转换**：上传源片 → `/api/montage/depth-video` → 深度槽就绪（VG-01 断的是消费不是转换）
- **网关容错**：404/405 回退 Magic Hour、grok 需首图明示、本机 URL 提示、轮询双端点、结果落地本地 media
- **媒体钉**：生成结果与审片格可拖出为画布 clip 钉

---

## 5. 收口优先级建议

| 批次 | 项 | 理由 |
|------|----|------|
| P0 | VG-01 玩法执行断链 | 有完整 UI + 完整服务端，只差中间 50 行装配调用；是「名义闭环、实则断」的最大单点 |
| P1 | VG-07 Bridge 入口 / VG-06 并发重试 / VG-09 批量 usedAssetIds / VG-10 任务恢复 / VG-03 高级参数 | 全是主产片路径的账实不符 |
| P2 | VG-02 模式芯片分发（或裁剪）/ VG-04 音频开关 / VG-08 audioUrl 定性 / VG-11 prompt 口径 / VG-05 ×N | 体验债 + 口径债 |
| P3 | VG-12 死代码与小缺陷 | 随批次顺手清 |

**统一收口抓手**：抽一个共享的「clip-gen 请求组装器」（输入：节点 data + 链镜头 + 玩法槽位 + 上游媒体；输出：完整 `proxyVideo` body），A/B 路径与未来入口都调它——VG-01/02/03/05/07 的根因都是「三套组装逻辑各写各的」。

---

## 6. 验收口诀

1. 选「深度视频动作复刻」补齐槽位点运行 → 网关请求体里能看到 `reference_videos`（深度）+ `reference_images`（人物/场景）。
2. 首尾帧模式上传首/尾图 → 请求体有对应字段；不支持的 provider 有明确报错而不是静默忽略。
3. 填 seed=42 连出两次 → 请求体带 seed；负面词出现在请求里。
4. 并发 3 + 重试 2 批 10 镜 → 网关日志出现并行请求；单镜失败自动重试后才标 failed。
5. 批量出完 10 镜 → 素材库健康「未使用」不再把刚用过的角色/场景算未使用（A 路径记账）。
6. 出片中刷新页面 → 工作台能对 processing 任务继续查询，不留永久 draft。
7. 接上游镜表后在输入框打字 → 要么进 prompt，要么 UI 明说不进。

---

## 附：关键代码锚点

| 主题 | 路径 |
|------|------|
| 紧凑卡（截图节点） | `apps/web/src/blocks/shared/CanvasNodeShell.tsx` / `CanvasNodeBody.tsx` |
| 工作台 | `apps/web/src/engine/stage-deck/chrome/attached-workspace/generation/video/VideoWorkspace.tsx` |
| 模式芯片/首尾帧/参数芯片 | 同目录 `video-gen-modes.ts` / `VideoFrameStrip.tsx` / `VideoParamChips.tsx` |
| 玩法菜单/槽位/深度转换 | 同目录 `VideoPlaybookMenu.tsx` / `VideoPlaybookTools.tsx` / `video-playbooks.ts` |
| 审片网格 | 同目录 `VideoShotReviewGrid.tsx` |
| A 批量路径 | `apps/web/src/engine/core-pipeline-runner.ts` `batchGenerateVideosFromShots` |
| B 级联路径 | `apps/web/src/engine/flow-runner.ts` `kind === 'clip-gen'` 分支（L680–940） |
| C 死卡 | `apps/web/src/blocks/core/ClipGenBlock.tsx` |
| 轮询 | `apps/web/src/engine/poll-task.ts` / `picture-gen-runner.ts` `pollClipTask` |
| 玩法装配纯函数 | `packages/shared/src/utils/reference-playbook.ts` `buildClipGenPlaybookPack` |
| 模式常量（三套之一） | `packages/shared/src/utils/seedance-bridge.ts` |
| 服务端视频代理 | `apps/server/src/modules/gateway/gateway.service.ts` `proxyVideo`（L709–）/ `pollVideo` |
| 深度转换 API | `apps/server/src/modules/montage/montage.service.ts` `convertDepthVideo` |

---

**文档结论**：视频生成节点的**基础出片与审片回路已闭环**；未闭环集中在两类——① 「UI 在、执行不读」的死参数群（模式芯片/首尾帧/seed/负面词/并发重试/×N/音频），② 「实现最全的旧卡不可达」导致的玩法与参考数组断链。根因是三套执行组装逻辑并存，建议以共享请求组装器为抓手统一收口。
