# NX9 图像生成节点 · 未闭环功能分析（第三轮 R3）

> **日期**：2026-08-12
> **前置**：R1（PG-01～PG-11）与 R2（PG-12～PG-24）已全部闭环
> **范围**：R2 修复后的复检——提示词字段诚实性、参考图实际发送集合、超时恢复写回、镜头绑定、Magic Hour 通道
> **判定口径**：四问（触得到 / 传得真 / 跑得完 / 流得回），状态符号：✅ 闭环 · ⚠ 半闭环 · ❌ 断点 · ⏸ 可后置

---

## 1. 一句话结论

节点主路径（工作区 → 唯一 executor → runner → provider → 镜表/账本）在 R1/R2 后是通的，**没有新的 P0**。

第三轮暴露的问题不再是「功能没接线」，而是 **R2 修完后仍会骗用户或把数据写错地方**：

1. **提示词字段被 enrich 结果覆盖**（下一轮会把角色/构图/警告再喂进去）
2. **模式判定用的参考集合 ≠ 真正发给模型的参考集合**（UI 文生图，请求却带旧关键帧/定妆）
3. **「继续查询」只补了预览条，镜表/账本/历史都没走**
4. **图像节点不像视频节点那样自动绑定上游镜头**，连了分镜台也不一定写得回 firstFrame

---

## 2. 复检确认仍有效（勿再开票）

| 复检点 | 结论 |
|---|---|
| flow-runner / core-pipeline 均委托 `runPictureGenExecutor` | ✅ |
| 批量部分成功保留 + `lastResult.failures` | ✅ 执行侧已写；UI 展示见 PG-33 |
| `packPictureRefs` 限额 + 风格安全位 + `truncatedRefs` toast | ✅ |
| style-ref × fal 切 Gemini | ✅ |
| 画布 AbortController / 工作区停止 | ✅ 各自持有控制器，工作区发起的运行由工作区停止 |
| 放大模式只留 2×/4× | ✅ |
| 入库·场景/道具 label 去重；入库·角色入口存在 | ✅ 入口在；覆盖行为见 PG-36 |
| 生成历史环形 8 轮 + 结果条可恢复预览 | ✅ 预览可恢复；镜表不同步见 PG-27 |

---

## 3. 新发现未闭环明细

### ✅ PG-25 · P1 · 出图成功把 enrich 后的 prompt 写回 `content`，污染用户原文

**位置**：`executors/picture-gen-executor.ts` 成功写回；`use-local-node-prompt.ts` 未聚焦时把 `content` 同步进输入框；`flow-runner.ts` 下次运行 `mergeUpstreamPrompt(..., d.content)`

executor 成功后：

```
content: warningParts.length ? `${lastPrompt}\n\n[${warningParts.join(' · ')}]` : lastPrompt
```

`lastPrompt` 是已经拼过的发送稿：角色 enrich、场景后缀、3D 机位、构图模板、专业动作、Negative 文本、风格注记。R2 还把「N 成功 / M 失败」「已裁掉 N 张参考图」追加进同一字段。

**四问**：

| 问 | 结果 |
|---|---|
| 触得到 | 每次成功出图都会发生 |
| 传得真 | ❌ 用户原文被替换；下一轮把约束/警告当提示词再 enrich 一次 |
| 跑得完 | 生成本身成功 |
| 流得回 | ⚠ 提示词历史里可能还留着原文，输入框已被污染 |

**连带**：`batchGenerateKeyframesFromShots` 把镜头 prompt 写进图像节点 `content`，批量出关键帧会覆盖用户在该节点写的正文。

**修法**：`content` 只保留用户原文（或另存 `lastCompiledPrompt`）；警告走 `message` / `lastResult`，不要拼进可编辑提示词。批量出图不要用镜头稿覆盖节点 `content`。

---

### ✅ PG-26 · P1 · 模式判定的参考集合 ≠ 实际发送的参考集合

**位置**：`picture-gen-executor.ts`

运行时模式用这组 URL 推断文生/图生/多参考：

```
nodeRef + multiRefs + styleImageUrl + upstreamPics
```

真正选主参考时却是：

```
job.imageUrls[0] → @提及图 → nodeRef → charRef → multiRefs[0]
charRef = 角色定妆 ?? 上游图 ?? 场景图 ?? 镜头已有 firstFrame
```

因此：

- 绑定镜头已有关键帧、用户没上传参考 → UI 仍是「文生图」，请求却把旧 firstFrame 当图生图主参考；
- 镜头挂了角色但用户没上传参考 → UI 文生图，请求却带定妆图。

**后果**：用户以为在「按新提示词重画」，模型实际在改旧图/跟定妆，和模式芯片撒谎。

**修法**：发送参考必须与 `resolveRuntimePictureGenMode` 同源；`shot.firstFrameAssetId` 不得在文生图模式当主参考（重绘应显式走图生图或「基于当前关键帧」开关）。角色定妆若要注入，模式应升为图生图/多参考并在参考条可见。

---

### ✅ PG-27 · P2 · 「继续查询」与「恢复历史」不走 executor 写回

**位置**：`PictureWorkspace.tsx` `handleResumePending` / `handleRestoreHistory`

PG-17 超时后可以取回 URL，但只 patch 了 `previewUrls`。对比 executor 成功路径，缺：

| 写回项 | executor | 继续查询 / 恢复历史 |
|---|---|---|
| `previewUrls` | ✅ | ✅ |
| 链镜表 `firstFrameAssetId` | ✅ | ❌ |
| `usedAssetIds` / revision pin | ✅ | ❌ |
| `generationHistory` | ✅ | ❌（恢复历史只换预览，不归档当前） |
| `lastResult` | ✅ | ❌ |

超时恢复是 PG-17 的主用户路径；取回图却不进镜表，等于「图在节点上、分镜仍缺帧」。

**修法**：恢复成功后复用 executor 的镜表/账本写回（抽 `commitPictureGenResult`），或至少在有 `linkedShotId` 时 patch firstFrame。

---

### ✅ PG-28 · P2 · 异步 taskId 只在超时后落盘，轮询中途刷新仍黑洞

**位置**：`picture-gen-runner.ts` 在 `processing` 时 `onMeta({ taskId })`；executor 的 `onMeta` **只累加 truncatedRefs，忽略 taskId**

`pendingImageTasks` 仅在 `catch (VideoPollTimeoutError)` 之后写入节点。轮询窗口（默认 60×5s）内若刷新/关页，taskId 从未落盘，PG-17 的「继续查询」没有对象。

**修法**：runner 一拿到 `taskId` 就 `updateNodeData({ pendingImageTasks, status: 'running' })`，不要等超时。

---

### ✅ PG-29 · P2 · 图像节点不自动绑定上游镜头（对比视频节点）

**位置**：`PictureWorkspace.tsx` 无绑定 effect；`VideoWorkspace.tsx` 会把上游 `shotIds` 写入 `linkedShotId(s)`

`linkedShotForBlock` 只认 `data.linkedShotId` 或 `shot.linkedBlockId === 本节点`。二者来源：

- 从镜头「生成模块」spawn（`FlowSurface` 写入 `linkedShotId` + 全局 `linkedBlockId`）
- 核心流水线临时塞 `linkedShotId`（不回写到节点 data，只在那一次 ctx 里）

用户在画布上 **分镜台 → 图像生成** 连线后点「生成」：没有自动绑定 → 图只留在节点 `previewUrls` → 镜表 firstFrame 不更新。视频节点同一操作会自动绑镜头。

**修法**：对齐视频工作区，有上游链镜表时写入 `linkedShotId`（单镜）或提供镜头选择；多镜时不要默默只写第一镜，至少在工作区标明写给哪一镜。

---

### ✅ PG-30 · P2 · Magic Hour 通道丢弃全部参考图

**位置**：`gateway.service.ts` `proxyImageMagicHour` 只收 `prompt/size/n`；`packPictureRefs` 对 `magichour` 限额为 0

- 用户显式选 Magic Hour：客户端会 toast「裁掉 N 张」，能力本身仍是纯文生图；
- **无 OpenAI 主 Key 时服务端把 openai 请求静默切 Magic Hour**（`proxyImage` 无 key 分支）：客户端按 openai 限额打包并发送参考，服务端全部丢弃且 **不回 `truncatedRefs`**。

图生图 / 风格参考在这条降级上等于没发生。

**修法**：静默切 MH 时若请求带参考图，应拒绝并提示换 Gemini/OpenAI，或回传 `truncatedRefs` + `routedProvider`；不要假装参考已生效。

---

### ✅ PG-31 · P3 · 风格注记写进 prompt 两次

executor 已 `finalPrompt += packed.styleNote`，又把原始 `styleImageUrl` 传给 runner；runner `packPictureRefs` 后再拼一次同样注记。图不会重复（URL 去重），提示词会。

**修法**：runner 入参已是 packed 列表时不再按 `styleImageUrl` 二次 pack；或 executor 不再预拼 `styleNote`。

---

### ✅ PG-32 · P3 · 图生图「强度」仅 fal 生效，Gemini/OpenAI 无提示

`PictureParamChips` 在图生图/多参考/风格模式下展示强度；`runPictureGenJob` 只在 fal 分支写入 `strength`。与 PG-05 的 Seed 同类：芯片看得到，非 fal 静默无效。

**修法**：非 fal 隐藏强度，或标注「仅 FLUX 系生效」（对齐 Seed）。

---

### ✅ PG-33 · P3 · 批量失败只进 `lastResult.failures` / 被污染的 content，结果条无逐条失败

R2 执行侧已收集 `{ index, error }`，结果条仍只渲染成功 URL。用户要到提示词末尾的 `[N 成功 / M 失败]` 才知道（而 PG-25 会把这段变成下一轮 prompt）。

**修法**：结果条旁列失败条目（第 n 条 + 错误摘要），不要依赖 content。

---

### ✅ PG-35 · P3 · Gemini 外链参考下载失败静默跳过

`proxyImageGemini` 对每张参考 `catch { /* 参考图可选 */ }`：fetch/读盘失败不计入 `truncatedRefs`。用户以为发了 3 张，模型可能只看到 1 张。

**修法**：失败计入 `truncatedRefs` 或单独 `droppedRefs`，前端 toast。

---

### ✅ PG-36 · P3 · 入库·角色覆盖主定妆，旧图不进列表

`handleSaveToCharacter` 直接写 `referenceImageUrl`，`fullSheetUrl` 仅在空时填入，不 append `referenceUrls`。旧定妆失去节点侧引用（文件仍在磁盘）。

**修法**：新图 prepend 到 `creative.referenceUrls`（或定妆历史），主参考替换时把旧 URL 留在列表里。

---

## 4. 优先级汇总

| 票 | 级别 | 状态 | 一句话 |
|---|---|---|---|
| PG-25 | P1 | ✅ | enrich/警告写回 `content`，下一轮重复注入 |
| PG-26 | P1 | ✅ | UI 文生图，请求却带旧关键帧/定妆 |
| PG-27 | P2 | ✅ | 继续查询/恢复历史不写镜表与账本 |
| PG-28 | P2 | ✅ | taskId 超时才落盘，中途刷新仍丢 |
| PG-29 | P2 | ✅ | 连了分镜台不自动绑镜头，firstFrame 经常不写 |
| PG-30 | P2 | ✅ | Magic Hour（含静默降级）丢参考图 |
| PG-31 | P3 | ✅ | 风格注记双重拼接 |
| PG-32 | P3 | ✅ | 强度芯片在 Gemini/OpenAI 空转 |
| PG-33 | P3 | ✅ | 批量失败无结果条展示 |
| PG-35 | P3 | ✅ | Gemini 参考下载失败静默 |
| PG-36 | P3 | ✅ | 角色入库覆盖旧定妆 |

**建议修复顺序**：PG-25 → PG-26 → PG-27/28 → PG-29 → PG-30 → P3 批。

---

## 5. 闭环记录（2026-08-12）

| 票 | 实现要点 |
|---|---|
| PG-25 | `buildPictureGenSuccessPatch` 只写 `lastCompiledPrompt` / `message` / `lastResult`，不碰 `content`；核心流水线关键帧也不再用镜头稿覆盖节点 `content` |
| PG-26 | `resolvePictureSendRefs`：发送集合与模式同源；`shot.firstFrame` 永不静默入列；角色定妆/场景图注入时升为图生图并记入 `injectedRefs` |
| PG-27 | `commitPicturePreviewUrls`：继续查询 / 恢复历史同步预览、历史归档与链镜表 `firstFrame` |
| PG-28 | executor `onMeta({ taskId })` 立刻 `updateNodeData(pendingImageTasks)` |
| PG-29 | `PictureWorkspace` 对齐视频工作区，上游链镜表自动写 `linkedShotId(s)` 并标明写回哪一镜 |
| PG-30 | `image-proxy-policy` + `proxyImage`：静默切 MH 带参考 → 拒绝；显式 MH 带参考 → `truncatedRefs` |
| PG-31 | executor 已 pack 后不再把 `styleImageUrl` 传给 runner，避免风格注记拼两次 |
| PG-32 | 强度芯片仅 `provider === 'fal'` 时展示 |
| PG-33 | 结果条展示 `lastResult.failures` |
| PG-35 | Gemini 参考下载/读盘失败计入 `truncatedRefs` |
| PG-36 | 入库·角色：新图置顶 `creative.referenceUrls`，旧主定妆保留在列表 |

单测：`picture-gen-refs.test.ts`（PG-25/26）、`image-proxy-policy.test.ts`（PG-30）。

---

## 6. 范围外备注（不开票）

- `director-desk-runner` / `AssetLibraryModal` / `storyboard-desk` / `storyboard-preview-runner` 仍直调 `runPictureGenJob`：属各自产品域复用 L2 runner，不写图像节点 `content`，不构成双实现。只有与 picture-gen **争同一份链镜表** 的路径才算节点闭环（R2 已收 core-pipeline）。
- OpenAI `n>1`、自定义宽高进高级面板：能力在，非常规路径，不单独开票。
- 工作区停止与画布停止是两套 AbortController：从工作区点生成须用工作区停止，从画布批量须用画布停止。行为可预期，不升票。
