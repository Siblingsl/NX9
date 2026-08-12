# NX9 图像生成节点 · 未闭环功能分析（第二轮 R2）

> **日期**：2026-08-12
> **前置**：第一轮 PG-01～PG-11 已全部闭环（见 `NX9-PICTURE-GEN-NODE-OPEN-LOOPS.md` 顶部闭环记录）
> **范围**：R1 修复后的复检 + 视野外扩——节点批量语义、跨路径出图一致性、服务端参数落点、取消/超时/历史等运行治理面
> **判定口径**：沿用四问（触得到 / 传得真 / 跑得完 / 流得回），状态符号：✅ 闭环 · ⚠ 半闭环 · ❌ 断点 · ⏸ 可后置

---

## 闭环记录（R2 修复，2026-08-12）

按 PG-13 → PG-14 → PG-12 → PG-15/16/17 → PG-18 → P3 批全部落地：

| 票 | 修法摘要 |
|---|---|
| PG-13 | executor 逐条 try/catch；有成功即写回 previewUrls + `lastResult.failures`；全失败才 throw |
| PG-14 | `packPictureRefs` 按 gemini 3 / openai 4 裁剪；风格图占主参考后安全位；服务端回传 `truncatedRefs` |
| PG-12 | `batchGenerateKeyframesFromShots` 逐镜调用 `runPictureGenExecutor`；链镜表 SSOT；AbortSignal 跟队列取消 |
| PG-15 | style-ref × fal 自动切 Gemini；图生图/多参考在 fal 文生图端点同样切换 |
| PG-16 | FlowSurface 持 AbortController，画布停止 abort 在途请求 |
| PG-17 | 超时文案分图片/视频；`pendingImageTaskId` 持久化；工作区「继续查询」 |
| PG-18 | image-ops 对外链 / data URL 先下载落地再 sharp |
| PG-19 | `generationHistory` 环形 8 轮；结果条「历史」可恢复 |
| PG-20 | 放大模式只留 2×/4× chip |
| PG-21 | `batchProgress` 写回，运行按钮显示 `生成 n/N` |
| PG-22 | 仅风格图走 style-only 注记，不再把风格图当主体兜底 |
| PG-23 | 入库·角色（定妆 + revision+1）；场景/道具 label 冲突追加序号 |

---

## 1. 一句话结论

R1 修复后，**节点主路径（工作区触发 → 唯一 executor → runner → provider → 回流记账）已闭环**。第二轮暴露的问题集中在三类：

1. **旁路出图不走唯一实现**——核心流水线（core-pipeline-runner）自带一套关键帧出图，绕过约束/记账/取消（PG-12）；
2. **批量与配额的诚实性**——部分成功全丢（PG-13）、服务端参考图静默截断（PG-14）、style-ref 在 fal 文生图上静默失效（PG-15）；
3. **运行治理缺口**——画布级停止不中断在途请求（PG-16）、异步超时任务不可恢复（PG-17）、生成历史不可回溯（PG-19）。

无新的 P0。

---

## 2. 复检确认已闭环（R1 修复有效性）

| 复检点 | 结论 |
|---|---|
| flow-runner picture 分支委托 executor，双实现消除 | ✅ 唯一调用方 `executors/index` |
| usedAssetIds / characterRevisionPins 写回节点 + 链镜表 | ✅ 且被 `asset-library-health.ts` / `collect-node-asset-refs.ts` 消费，账本有下游 |
| 异步 processing 态完整轮询（60×5s，可中断） | ✅ `pollVideoUntilDone({ signal })` |
| 工作区「停止」→ AbortSignal → fetch/轮询中断 → 节点收回 idle | ✅ |
| 风格图入口 / 模式锁定与回落 / 参考条标记 | ✅ 4 条单测过 |
| fal seed / negative 原生参数；非 fal 文本注入不重复 | ✅ `falInput.seed`、executor 按 provider 分流 |
| gemini/openai 原生多图直传；fal 网格拼贴 ≤9 | ✅（但见 PG-14 服务端截断） |
| 全景不写 firstFrame；未配置连接前置拦截；下载/入库 | ✅ |
| imageCount 语义 | ✅ 仅多提示词批量写入，常规运行重置为 1 |

---

## 3. 新发现未闭环明细

### ✅ PG-12 · P1 · 核心流水线关键帧出图绕过唯一实现

**位置**：`apps/web/src/engine/core-pipeline-runner.ts`（≈L120–212）

核心流水线「批量出关键帧」自带一套 prompt 组装 + `runPictureGenJob` 直调，与 picture 节点 executor 平行存在，规则完全不同步：

| 能力 | executor（节点路径） | core-pipeline（流水线路径） |
|---|---|---|
| F-017 构图强约束 / F-032 参考板约束 | ✅ | ❌ 无 |
| usedAssetIds + revision pin 记账 | ✅ | ❌ 无 |
| seed / negative / resolutionTier | ✅ | ❌ 不传 |
| 镜表写回 | 链镜表（F-003 SSOT） | **全局 `doc.updateShot`**（回退全局，方向相反） |
| 取消 | AbortSignal 中断在途 | 仅队列级：镜头之间检查 `phase === 'cancelled'`，在途请求继续跑 |
| picture 参数来源 | 当前节点 data | **画布上找到的第一个 picture-gen 节点**（多节点时取谁不确定） |

**后果**：同一镜头经流水线出的图没有资产账本、不受约束阻断，且写进全局镜表与链镜表分叉；素材库健康度检查会漏掉这批图的引用。

**修法**：core-pipeline 的关键帧段改为逐镜头调用 `runPictureGenExecutor`（构造临时 block ctx 或抽出「按镜头出图」共享函数），镜表写回统一走 `patchUpstreamShot`；参数来源改为镜头绑定的 picture 节点或显式指定的节点 id。

---

### ✅ PG-13 · P1 · 批量部分成功即全丢

**位置**：`executors/picture-gen-executor.ts` 主循环

多提示词批量 / promptBatch 逐条生成时，第 N 条抛错（限流、内容拦截、超时）→ 整个 executor throw → **前 N−1 条已生成并已计费的 urls 留在局部变量里被丢弃**，节点落 error，previewUrls 不更新。

**修法**：逐条 try/catch 收集 `{ok, url | error}`；只要有成功条目就写回 previewUrls + `lastResult.failures`，节点状态用 success-with-warnings 或在 content 里标注「N 成功 / M 失败」；全部失败才 throw。

---

### ✅ PG-14 · P1 · 服务端参考图数量静默截断，风格图最先被截掉

**位置**：`apps/server/src/modules/gateway/gateway.service.ts`（openai `slice(0, 4)` ≈L428；gemini `slice(0, 3)` ≈L601）

客户端允许上传 ≤9 张参考 + 风格图 + 上游图并全部随请求发送（PG-07 修复后 gemini/openai 原生直传），但服务端：

- gemini 只取前 **3** 张、openai 只取前 **4** 张，超出静默丢弃，无任何提示；
- R1 里风格图作为 extraRefs **追加在数组末尾** → 参考较多时风格图恰好是最先被截掉的那张，而 prompt 里的「Last reference image is a style reference」注记仍在，**注记指向了错误的图**。

**修法**：
1. 客户端在 executor 按 provider 限额（gemini 3 / openai 4）裁剪并在节点 content/log 中明示「已按模型上限取前 N 张」；
2. 风格图排到截断安全位（主参考之后第一位），注记改为按下标指认；
3. 服务端截断时在响应里回传 `truncatedRefs: n`，前端 toast。

---

### ✅ PG-15 · P2 · style-ref × fal 文生图模型：风格图静默失效

**位置**：`picture-gen-runner.ts` fal 分支（仅 `def.supportsReference` 端点吃 `image_url`）+ executor 模型自动切换（只覆盖 `text-to-image / panorama-720`）

风格参考模式下如果当前模型是 fal 文生图端点（如 flux-dev）：请求照发，但风格图根本不进请求体——用户以为在用风格图，实际是纯文生图。

**修法**：executor 里 style-ref 模式增加链路校验——模型不吃参考图时，自动切到可吃图模型（gemini 默认）或运行前报「当前模型不支持风格参考」；至少在节点 log 标注降级。

---

### ✅ PG-16 · P2 · 画布级「停止」不中断在途请求

**位置**：`FlowSurface.tsx` `stopRun`（≈L1009）及其三处 `signal: { get cancelled() {...} }`

R1 给信号类型加了 `abortSignal` 字段并在工作区接通，但画布工具栏的批量运行 / 级联 / 重跑下游仍只传 `{cancelled}`：点「停止」只能拦住**下一个块**，正在跑的图片/视频请求与轮询会继续烧钱直到自然结束。

**修法**：FlowSurface 持 `AbortController`，`stopRun` 时 `abort()`，三处 signal 补 `abortSignal: controller.signal`（图片链路即刻生效；视频链路见 PG-17 备注）。

---

### ✅ PG-17 · P2 · 异步图片任务超时即黑洞，且超时文案是视频口径

**位置**：`poll-task.ts`（`VideoPollTimeoutError`）＋ picture 链路无 taskId 持久化

轮询 60 次仍 processing → 抛 `VideoPollTimeoutError`（消息文案「视频轮询超时…」，对图片任务误导）。视频链路有待恢复表可续查（VG-10），**图片链路没有持久化 taskId**：超时后任务可能在上游完成，但结果永远取不回。

**修法**：executor 捕获 `VideoPollTimeoutError`，把 `taskId` 写入节点 data（如 `pendingImageTaskId`），工作区提供「继续查询」；超时文案按媒体类型区分。

---

### ✅ PG-18 · P2 · image-ops 仅支持本地 /media URL，外链参考静默缺图

**位置**：`apps/server/src/common/media-path.ts`（只解析 `/media/...`）；`image-ops.service.ts` merge/upscale/resize 全依赖它

生成图都会落地为 `/media/images/...`，但**用户粘贴的外链 / 外部导入资产**参与拼贴时会被 `filter(Boolean)` 静默剔除（拼贴图少图无提示）；用于「图片放大」时直接抛「无有效图片」，文案无法让用户理解是外链不支持。

**修法**：image-ops 对非 `/media` URL 先下载落地再处理（服务端已有 `fetchWithRetry` + 落盘基建，复用即可）；或前端上送前预检并提示。

---

### ✅ PG-19 · P3 · 生成历史不可回溯：每次运行整体覆盖 previewUrls

executor 成功后 `previewUrls: urls` 全量替换。上一轮生成的图**失去所有 UI 引用**（文件仍在磁盘）：没进回收站（回收站只收手动删除）、没有历史面板。提示词历史只能帮你重跑，不能找回已生成的旧图。

**修法**：写回前把旧 `previewUrls` 归档进 `data.generationHistory`（环形保留最近 N 轮，含时间戳/prompt 摘要），结果条加「历史」入口；或旧图自动转入回收站（30 天）。

---

### ✅ PG-20 · P3 · 放大模式残留无效参数位

`PictureParamChips`：放大模式已隐藏强度（R1），但**比例 / 质量 chips 仍展示且不参与放大**；分辨率档 1K 与 2K 都映射 2×（executor 只判 `=== '4k'`），1K 档语义空转。

**修法**：upscale 模式下 chips 收敛为单一「倍率 2×/4×」chip；或比例/质量置灰加提示。

---

### ✅ PG-21 · P3 · 批量运行无逐条进度

多提示词批量（最多 9 条）运行期间节点只有整体 running 态，无「第 n/N 条」进度、无逐条失败标注（与 PG-13 同源）。修法：executor 每条完成后 `updateNodeData({ batchProgress: { done, total } })`，工作区运行态显示进度。

---

### ✅ PG-22 · P3 · 仅有风格图（无主体参考）时，风格图被当主体参考

executor 的 refImage 兜底链最后落到 `styleImageUrl`；runner 的风格注记只在「style ≠ 主参考」时添加。只传风格图运行 → gemini 把它当主体图编辑，容易复制风格图主体而不是「按风格重画」。

**修法**：style 为唯一参考时也附加「reference is style-only; do not copy its subject」注记。

---

### ✅ PG-23 · P3 · 入库动作缺「角色定妆」路径，label 无去重

R1 的入库只有场景/道具（`upsertBacklotWorkspace`）。把生成图存为**某角色的定妆/参考**（写 `characters` 库、触发 revision）没有入口；入库 label 取 prompt 首行前 20 字，重复入库会产生同名条目。

**修法**：入库菜单加「角色…」二级选择（列出角色库，写入 referenceUrls 并 revision+1）；label 冲突时追加序号。

---

### ✅ PG-24 · 已顺手闭环 · excludedRefUrls 清理守卫

本轮自检发现 R1 新增的排除项自动清理在「上游图瞬时为空」（断连/迁移瞬间）会误清合法排除项，已加守卫：仅在 `upstreamPictures.length > 0` 时执行清理（`PictureWorkspace.tsx`）。

---

## 4. 优先级汇总

| 票 | 级别 | 状态 |
|---|---|---|
| PG-12 | P1 | ✅ 闭环 |
| PG-13 | P1 | ✅ 闭环 |
| PG-14 | P1 | ✅ 闭环 |
| PG-15 | P2 | ✅ 闭环 |
| PG-16 | P2 | ✅ 闭环 |
| PG-17 | P2 | ✅ 闭环 |
| PG-18 | P2 | ✅ 闭环 |
| PG-19 | P3 | ✅ 闭环 |
| PG-20 | P3 | ✅ 闭环 |
| PG-21 | P3 | ✅ 闭环 |
| PG-22 | P3 | ✅ 闭环 |
| PG-23 | P3 | ✅ 闭环 |
| PG-24 | — | ✅ 闭环 |

**建议修复顺序**：PG-13 → PG-14 → PG-12（改动面最大，放在两个纯前端票之后）→ PG-15/16/17 → PG-18 → P3 批。

---

## 5. 范围外备注（不开票）

- `DirectorDeskBlock.tsx`、`StoryboardDeskBlock.test.tsx`、`asset-library-health.ts`、`VoiceCastBlock.tsx` 当前 typecheck 报错，均由并行会话实时编辑中，非图片节点范围。
- `AssetLibraryModal` / `storyboard-desk` / `director-desk-runner` / `storyboard-preview-runner` 直调 `runPictureGenJob` 属各自产品域（定妆 / 线稿 / 导演台），共享 L2 runner 是设计内复用，不算双实现；只有 core-pipeline 与 picture 节点**写同一份镜表数据**才构成 PG-12。
