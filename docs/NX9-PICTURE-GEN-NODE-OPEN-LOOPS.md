# NX9 图像生成节点 · 未闭环功能分析

> **日期**：2026-08-12
> **范围**：画布「图像生成」节点（`picture-gen`）：L1 摘要卡、底部工作区（PictureWorkspace）、执行链路、参数落点、结果回流
> **依据**：仓库现行代码（working tree）
> **原则**：以「用户可触发 → 参数真实生效 → 结果可回流可追溯」为闭环标准，不以「字段/按钮已存在」为准

---

## ✅ 闭环记录（2026-08-12 修复批次）

本批次按 P0→P3 全量闭环，下文 §4 各票保留原始分析供追溯，**当前状态以本表为准**：

| 票 | 状态 | 落点 |
|---|---|---|
| PG-01 双实现漂移 | ✅ 已闭环 | 唯一实现收敛到 `executors/picture-gen-executor.ts`（补齐 F-017/F-024/F-032、环境注入、resolutionTier、usedAssetIds+pins 回流）；`flow-runner.ts` picture-gen 分支改为委托调用 |
| PG-02 异步图片单次轮询 | ✅ 已闭环 | `picture-gen-runner.ts` processing 分支改用 `pollVideoUntilDone` 完整轮询（60×5s，支持 AbortSignal）；`pollClipTask` 同步升级为循环版 |
| PG-03 风格参考不可达 | ✅ 已闭环 | 工作区工具栏新增「风格」上传入口（`patchStyleImageUrl` 锁定/回落模式），参考条风格图带紫色标记；死组件 `PictureWorkspaceToolbar/Header/PictureGenModeChip` 已删除 |
| PG-04 节点级取消缺失 | ✅ 已闭环 | `FlowRunSignal.abortSignal` 贯通 cascade→runFlowBatch→executor→runner→轮询；运行中工具栏显示「停止」，取消后节点收回 idle 不落 error |
| PG-05 Seed/Negative 部分生效 | ✅ 已闭环 | Seed 输入按 provider 禁用并提示「仅 FLUX/fal 系生效」；Negative 提示注入方式；执行端 fal 走参数、其余 provider 拼文本，不再重复注入 |
| PG-06 假高清 | ✅ 已闭环 | 全部文案改为「图片放大 / 插值放大 2×/4×（不新增细节）」；放大模式隐藏强度条与模型选择，提示词占位说明不参与 |
| PG-07 多参考策略分裂 | ✅ 已闭环 | gemini/openai 原生多图直传不拼贴；fal 拼贴全部参考（≤9 张，>3 张走网格）并在 prompt 标注 |
| PG-08 全景覆盖 firstFrame | ✅ 已闭环 | executor 写回镜头前守卫 `pictureGenMode !== 'panorama-720'` |
| PG-09 未配置连接裸奔 | ✅ 已闭环 | `handleRun` 前置拦截：toast + 直接打开连接设置 |
| PG-10 结果条动作缺失 | ✅ 已闭环 | 结果条新增「下载」「入库·场景」「入库·道具」（带图入库 `upsertBacklotWorkspace`，coverUrl+referenceUrls） |
| PG-11 + 打磨 | ✅ 已闭环 | Seed 输入仅收数字；上游断开自动清理 `excludedRefUrls` 残留；fal n>1 语义在 runner 标注收敛 |

验证：`pnpm typecheck`（本批次改动文件 0 错误）；`vitest run src/engine/__tests__` 20 文件 126 用例全过 + 新增 `picture-gen-style-ref.test.ts` 4 用例。

---

## 0. 判定口径

沿用素材库开放环文档的四问，针对生成节点改写：

| # | 问句 | 失败即未闭环 |
|---|------|--------------|
| 1 | **触得到** | UI 有入口，用户能真实触发该能力 |
| 2 | **传得真** | UI 写入的参数在实际执行链路里被消费，而不是被静默丢弃 |
| 3 | **跑得完** | 同步/异步任务都能跑到终态（成功/失败/取消），不会假失败、假运行 |
| 4 | **流得回** | 结果能写回该去的地方（镜表 firstFrame、usedAssetIds 账本、素材库） |

状态符号：✅ 闭环 · ⚠ 半闭环 · ❌ 断点 · ⏸ 可后置

---

## 1. 一句话结论

图像生成节点的**基础主路径（文生图 / 图生图 / 多参考自动判定 + 专业动作模板 + 多提示词批量 + 720 全景）是闭环的**；但存在 **1 个架构级断点（双实现漂移，导致出图 `usedAssetIds` 回流在真实链路上没生效）**、**1 个任务级断点（Magic Hour 异步图片只轮询一次必失败）**，以及一批「UI 存在但链路断掉」的半闭环（风格参考模式不可达、节点级取消缺失、Seed/Negative 仅部分模型生效、图片高清是假超分等）。

---

## 2. 真实执行链路（先对齐事实）

```
PictureWorkspace「生成」按钮 / CanvasNodeShell 运行
  → runCascadeFromBlock (stage-deck/execution/cascade-runner.ts)   [signal: cancelled + abortSignal]
    → runFlowBatch → flow-runner.ts `kind === 'picture-gen'` 分支
      → runPictureGenExecutor (executors/picture-gen-executor.ts) ★ 唯一实现（PG-01 后）
        → runPictureGenJob (picture-gen-runner.ts)
          → fal：api.proxyFal（seed / negative / strength 生效）
          → gemini / openai / magic-hour：api.proxyImage（referenceImageUrls / imageSizeTier 生效）
            → processing 态：pollVideoUntilDone 完整轮询（PG-02 后）
          → upscale-hd：api.upscaleImage（sharp 插值放大）
```

~~**注意**：`runPictureGenExecutor` 没有任何调用方，是死代码。~~ **PG-01 修复后已反转**：executor 是唯一实现，flow-runner 分支委托调用。

---

## 3. 已闭环清单（勿再开票）

| 能力 | 说明 |
|------|------|
| ✅ 文生图 / 图生图 / 多参考自动判定 | 按「上传参考 + 上游图 − 排除」数量 0/1/≥2 自动切模式（`picture-gen-modes.ts`），UI 与运行时口径一致 |
| ✅ 上传参考（≤9 张）/ 移除 / 清空 | 首张进 `referenceImageUrl`，其余进 `referenceImageUrls` |
| ✅ 上游图排除 / 恢复 | `excludedRefUrls`，模式判定与执行两端都过滤 |
| ✅ @生成 / @上游 本地媒体引用 | 光标插入 + 运行时解析成参考图 |
| ✅ @角色 / @场景 / @服装 / @道具 素材引用 | prompt enrich（角色上下文 + 环境后缀 + 库条目） |
| ✅ 专业动作 18 种模板 | 选中→注入模板/比例/质量，运行拼接 promptSuffix，可清除 |
| ✅ 生成多图（多提示词批量） | 每条独立 prompt 逐张生成，条数即张数 |
| ✅ 720° 全景 | 专用 suffix + 各 provider 尺寸适配 + resize 归一 2048×1024 + 写 `panoramaUrl` 供 3D 导演台 |
| ✅ 图生图专用模型自动换（文生图时 flux-i2i → flux-dev） | UI 运行前 + 执行内双保险 |
| ✅ 分辨率档位 1K/2K/4K | flow-runner 传 `resolutionTier` → gemini `imageSizeTier`；4K 联动 quality/aspect |
| ✅ 比例 / 质量 / 自定义尺寸 / 16px 对齐 | `resolveImageRequestSize` 统一折算 |
| ✅ 构图强约束（F-017）与参考板约束（F-032） | 上游分镜台 enforceComposition 无模板 → 阻断；reference-board 约束注入/阻断 |
| ✅ 绑定镜头写回 firstFrame | 链镜表 SSOT + 分镜台节点 chainStoryboard 同步 |
| ✅ 生成结果条：选中 / 双击放大 / 拖出钉板 / 移入回收站（30 天） | 含确认弹窗 |
| ✅ 模型下拉 ↔ 设置连接联动 | 切模型回写连接默认，未配置时引导去设置 |
| ✅ Ctrl+Enter 运行 / 提示词历史 / 级联执行 | — |

---

## 4. 未闭环明细

### ❌ PG-01 · P0 · 双实现漂移：新能力写进了死代码，真实链路缺账

**现象**：`picture-gen` 有两份执行实现：

| | `flow-runner.ts` 内联分支（★ 真实链路） | `executors/picture-gen-executor.ts`（死代码） |
|---|---|---|
| 被调用 | ✅ cascade-runner → runFlowBatch | ❌ 无调用方 |
| 出图写 `usedAssetIds` + `characterRevisionPins` | **❌ 缺失** | ✅ 有（连镜表 patch 一起写） |
| 全景不写镜头 firstFrame 的守卫 | **❌ 缺失**（全景也会覆盖 firstFrame） | ✅ 有 `pictureGenMode !== 'panorama-720'` |
| F-017 构图模板 / F-032 参考板约束 / F-024 @block 引用 / 环境后缀 | ✅ 有 | ❌ 缺失 |
| `resolutionTier` 透传 | ✅ 有 | ❌ 缺失 |
| 默认模型 | `gemini-2.5-flash-image` | `dall-e-3`（不一致） |

**后果**：
1. **出图的资产回流账本（`usedAssetIds` / revision pin）在真实运行中没有生效**。`NX9-ASSET-LIBRARY-OPEN-LOOPS.md` 将 OL-01/OL-03 的「出图」侧标为 ✅，锚点列了两份文件，但 live 分支（flow-runner L661–676 的 `updateNodeData` 与 L652–659 的镜表 patch）均不含 `usedAssetIds` / `characterRevisionPins`。素材库健康页的「未使用」口径对图像生成节点是**假数字**。
2. 两份实现继续各自演进，谁改谁漏，回归风险持续放大。

**修复建议**：二选一收敛——(a) 把 flow-runner 的 picture-gen 分支整体迁到 executor 并接线（executor 需补齐 F-017/F-024/F-032/环境后缀/resolutionTier）；或 (b) 删除 executor，把 `usedAssetIds`/pins/全景守卫补进 flow-runner。**先补 live 链路缺账（改动小），再做架构合并。**

---

### ❌ PG-02 · P0 · Magic Hour 异步图片任务只轮询一次，必假失败

**现象**：`picture-gen-runner.ts` L153–158：`proxyImage` 返回 `status: 'processing' + taskId` 时，调 `pollClipTask(taskId)` **单次**；未完成即抛「Magic Hour 图片仍在生成中」。视频链路有 `pollVideoUntilDone`（60 次 × 5s，`poll-task.ts`），图片没有。`core-pipeline-runner.ts` L257–262 自己包了个同名函数，同样只 poll 一次。

**后果**：任何生成耗时超过一次往返的异步图片任务在用户侧表现为立即失败，任务实际还在跑，钱花了图丢了。

**修复建议**：图片路径复用 `pollVideoUntilDone`（或抽通用 `pollTaskUntilDone`），带尝试上限与间隔。

---

### ❌ PG-03 · P1 · 「风格参考」模式用户不可达（含两个死组件）

**现象**：
- `styleImageUrl` 在 PictureWorkspace 里**只有清除逻辑，没有任何写入入口**（上传按钮只写 `referenceImageUrl(s)`）。
- 18 个专业动作中没有一个设置 `pictureGenMode: 'style-ref'` 或 `multi-ref`。
- 能手动切模式的 `PictureGenModeChip` 只被 `PictureWorkspaceToolbar` 引用，而 `PictureWorkspaceToolbar` / `PictureWorkspaceHeader` **没有任何调用方**（死组件）。

**后果**：`picture-gen-modes.ts` 中 `style-ref` 的定义、执行链（runner 里 style+ref 双图拼 prompt、`[Style reference attached]`）、模式芯片 UI 全部存在，但用户从图像节点**无法触发**。「多参考」只能靠 ≥2 张参考自动进入，无法手动锁定。

**修复建议**：给参考条或工具栏加「设为风格图」入口（写 `styleImageUrl` + `pictureGenMode: 'style-ref'`）；或产品定性砍掉 style-ref，删除模式定义与死组件，避免下次审计再误判。

---

### ❌ PG-04 · P1 · 生成中无法取消（节点级）

**现象**：
- `PictureWorkspace.handleRun` / `CanvasNodeShell` 调 `runCascadeFromBlock` 不传 `signal`；运行中「生成」按钮只是 `running` 态，无停止入口。
- `runPictureGenJob` 的 `signal?: AbortSignal` 参数**全仓库无人传**；api client 支持 signal、服务端有 ClientAbortFilter，链路两头都准备好了，中间没接。
- FlowSurface 全局运行有 `{ cancelled }` 标志，但只在块与块之间检查，不 abort 在途 HTTP。

**后果**：选错模型/写错 prompt 后只能干等大图生成完成；批量多提示词时代价放大 N 倍。

**修复建议**：工作区持有 AbortController，running 态把「生成」变「停止」；`cancelled` 标志与 AbortSignal 打通，flow-runner picture 分支把 signal 透传给 `runPictureGenJob`。

---

### ⚠ PG-05 · P2 · Seed / Negative Prompt 仅对 fal 系模型真实生效

**现象**（`picture-gen-runner.ts`）：
- fal：`seed`、`negative_prompt` 进参数 ✅；但 flow-runner 已经把 `Negative: …` 拼进 prompt 文本（L564–565），fal 路径**双重注入**。
- gemini / openai / magic-hour：`proxyImage` 请求体不含 seed / negative（服务端 gateway 也没有对应字段）；seed **静默丢弃**，negative 只剩 prompt 文本弱约束。

**后果**：高级面板的 Seed 输入对默认模型（gemini）完全无效，用户以为可复现实际不可复现；UI 无任何「该参数当前模型不支持」提示。

**修复建议**：按 provider 能力表在 UI 上禁用/提示不生效参数；fal 路径去掉 prompt 文本里的重复 Negative 注入。

---

### ⚠ PG-06 · P2 · 「图片高清」是插值放大，不是超分

**现象**：`image-ops.service.ts upscaleImage` = sharp `resize(lanczos3)`，上限 4096。无任何超分模型。且该模式下：强度芯片仍显示但无效（`PictureParamChips.showStrength` 含 upscale-hd）；模型下拉仍可选但无效。

**后果**：「放大并增强清晰度」的文案不成立，2K→4K 只是像素插值，用户对比后会认为功能是坏的。

**修复建议**：短期改文案为「无损插值放大」；中期接真实超分（fal 有现成 upscale 端点）；隐藏该模式下无效的强度/模型控件。

---

### ⚠ PG-07 · P2 · 多参考 >4 张静默降级，且各 provider 行为不一致

**现象**：上传上限 9 张；多参考模式把「主参考+额外参考」拼贴成横条，**只取前 4 张**（`mergeImages slice(0,4)`），第 5–9 张不进拼贴、无提示。拼贴后 gemini 还会同时收到拼贴图 + 全部原始 refs（重复注入）；fal i2i 端点只吃单图 `image_url`，额外 refs 全部丢弃。

**修复建议**：统一多参考策略（gemini 原生多图就别拼贴；fal 才拼贴），超过可用张数时 toast 明示；上限与拼贴数对齐。

---

### ⚠ PG-08 · P2 · 全景图会覆盖绑定镜头的 firstFrame（live 路径无守卫）

**现象**：flow-runner L653：`if (linkedPicShot && urls[0])` 直接写 `firstFrameAssetId`，不区分全景模式；2:1 等距柱状图会顶掉镜头首帧并把镜头状态推到 review。死代码 executor 已有守卫（`pictureGenMode !== 'panorama-720'`），live 没有。随 PG-01 一并修。

---

### ⚠ PG-09 · P3 · 未配置图片连接时运行不前置拦截

**现象**：模型下拉未配置时显示「未配置图片连接 · 点此去设置」并引导，但「生成」按钮不做前置检查，照样发请求，靠服务端报错回显。半闭环：有引导、无门禁。

**修复建议**：`handleRun` 里 `hasConnections === false` 时 toast + 打开连接设置，不发请求。

---

### ⚠ PG-10 · P3 · 生成结果缺少「入库」动作

**现象**：结果条动作 = 选中 / 放大 / 拖出钉板 / 移入回收站。**没有**「存入素材库 / 设为角色定妆 / 设为场景参考 / 下载」。生成一张满意的角色图想入库，只能拖成画布钉板再绕路，或去素材库里重新生成。回流（四问之 4）在「素材库方向」是断的——目前只有镜表 firstFrame 一条回流路。

**修复建议**：结果缩略图 hover 菜单加「入库为…（角色定妆 / 场景 / 道具参考）」与「下载」。

---

### ⚠ PG-11 · P3 · 张数（imageCount）语义残留

**现象**：普通路径 handleRun 强制 `imageCount: 1`（底栏已去掉张数选择，注释明确「多张走生成多图」）；但 fal 路径无论 `n` 传多少都只返回 1 张（`res.url` 单值），openai/gemini 才吃 `n`。若未来恢复张数入口，fal 会静默给 1 张。属产品口径已收敛、代码语义未清理的残留。

---

### 其他打磨项（P3，随手修）

| 项 | 说明 |
|----|------|
| Seed 输入无校验 | 非数字 → `Number()` 得 NaN，fal 侧 `Number.isFinite` 静默忽略，用户无感知 |
| `excludedRefUrls` 不随上游断开清理 | 残留 URL 无害（仅过滤用），但节点 data 会越攒越长 |
| 死代码/死组件清理 | `picture-gen-executor.ts`（随 PG-01）、`PictureWorkspaceToolbar.tsx`、`PictureWorkspaceHeader.tsx`、`PictureGenModeChip.tsx`（随 PG-03 定性） |
| 回收站删除后 prompt 内 @生成 引用需手动清理 | 弹窗文案已声明，属已知交互债 |

---

## 5. 修复优先级建议

| 优先 | 项 | 理由 |
|------|----|------|
| P0 | PG-01 live 链路补 `usedAssetIds`/pins + 全景守卫（PG-08） | 素材库健康账本对出图是假数字，直接违反已宣称的 OL-03 |
| P0 | PG-02 图片异步轮询循环 | 花钱丢图的假失败 |
| P1 | PG-04 节点级取消 | 长任务体验断崖 |
| P1 | PG-03 style-ref 定性（做入口或删模式） | 死路径留着必再踩 |
| P2 | PG-05 / PG-06 / PG-07 | 参数可信度与文案诚实化 |
| P3 | PG-09 / PG-10 / PG-11 + 打磨项 | 门禁与回流补全 |

---

## 附：关键代码锚点

| 主题 | 路径 |
|------|------|
| 真实执行分支 | `apps/web/src/engine/flow-runner.ts` L375–678 |
| 死代码执行器 | `apps/web/src/engine/executors/picture-gen-executor.ts` |
| 生成请求路由 | `apps/web/src/engine/picture-gen-runner.ts`（单次轮询在 L153–158） |
| 底部工作区 | `.../attached-workspace/generation/picture/PictureWorkspace.tsx` |
| 模式判定 | `.../picture/picture-gen-modes.ts` |
| 专业动作目录 | `.../picture/picture-pro-actions.ts` |
| 参数芯片 | `.../picture/PictureParamChips.tsx` |
| 死组件 | `.../picture/PictureWorkspaceToolbar.tsx`、`PictureWorkspaceHeader.tsx`、`PictureGenModeChip.tsx` |
| 放大/拼贴服务 | `apps/server/src/modules/image-ops/image-ops.service.ts` |
| 级联执行/取消标志 | `apps/web/src/engine/stage-deck/execution/cascade-runner.ts`、`FlowSurface.tsx` L937–973 |
