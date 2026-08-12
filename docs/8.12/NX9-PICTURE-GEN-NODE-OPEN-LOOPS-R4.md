# NX9 图像生成节点 · 未闭环功能分析（第四轮 R4）

> **日期**：2026-08-12  
> **目录**：`docs/8.12/`  
> **前置**：R1（PG-01～11）、R2（PG-12～24）、R3（PG-25～36）均已闭环  
> **范围**：R3 落地后的**深度复检**——工作区入口诚实性、注入参考可见性、多镜绑定副作用、删除/恢复写回完备性、旁路出图与节点账本一致性  
> **判定口径**：四问（触得到 / 传得真 / 跑得完 / 流得回），状态符号：✅ 闭环 · ⚠ 半闭环 · ❌ 断点 · ⏸ 可后置

---

## 1. 一句话结论

执行器主路径在 R3 后是诚实的（不污染 `content`、发送参考与模式同源、`taskId` 即时落盘）。  
第四轮挖到的问题集中在 **工作区入口与执行器出口之间的「第二层谎言」**，以及 **R3 补丁本身引入的绑定副作用**：

1. **工作区点「生成」仍会先改写 `content`**（专业模板 / 多图首条）——执行器不写，入口写  
2. **定妆/场景注入后模式芯片仍显示「文生图」**，参考条也不展示注入图  
3. **自动绑镜会把 spawn 指定的 `linkedShotId` 强行改成上游第一镜**  
4. **删图 / 继续查询 / 警告文案** 仍有半闭环写回或不可见

没有新的「完全不能出图」P0；有 **2 个 P1 诚实性断点**，建议先修。

---

## 2. 复检确认仍有效（勿再开票）

| 复检点 | 结论 |
|---|---|
| flow-runner / core-pipeline → `runPictureGenExecutor` | ✅ |
| 执行器成功 patch 不写 `content`，走 `lastCompiledPrompt` / `message` | ✅ 执行侧；工作区入口见 PG-37 |
| `resolvePictureSendRefs` 不含 `shot.firstFrame`；定妆可注入升模式 | ✅ 执行侧；UI 可见性见 PG-38 |
| `onMeta.taskId` 即时落盘；继续查询可取回预览 + firstFrame | ✅ 预览/镜表；账本见 PG-42 |
| Magic Hour 静默降级带参考拒绝；显式 MH 回 `truncatedRefs` | ✅ |
| 强度芯片仅 fal；结果条展示 `failures`；角色入库保留 `referenceUrls` | ✅ |
| 风格注记不在 executor+runner 双拼 | ✅ |

---

## 3. 深度发现明细

### ❌ PG-37 · P1 · 工作区运行前仍把专业模板 / 多图首条写入 `content`（PG-25 入口回归）

**位置**：`PictureWorkspace.tsx` `handleRun` / `handleMultiPromptsChange`

R3 只修了 **executor 出口**。工作区入口仍在：

```ts
// 专业动作：把 suffix 拼进 content 再跑
prePatch.content = composePictureProPrompt(draft, proAction);

// 多图：每次改槽位 / 开跑都写 content = filled[0]
prePatch.content = filled[0];
```

`useLocalNodePrompt` 未聚焦时会把节点 `content` 同步回输入框 → 用户原文被模板后缀或「多图第一条」替换。下一轮 cascade / 画布批量再读 `d.content`，等于把专业约束当用户正文再 enrich 一次。

| 问 | 结果 |
|---|---|
| 触得到 | 选专业工具或「生成多图」后点生成必现 |
| 传得真 | ❌ 输入框与可编辑提示词被改写 |
| 跑得完 | 出图成功 |
| 流得回 | ⚠ 历史归档也可能存到被污染的 content |

**修法**：运行前只把 composed prompt 交给 cascade/executor 的 `prompt` 入参（或临时字段 `runPrompt`），**禁止** `prePatch.content = composed`；多图槽位只写 `multiPrompts`，主 `content` 保留用户当前编辑的那一条或独立 `primaryPrompt`。

---

### ❌ PG-38 · P1 · 注入参考对 UI 不可见，模式芯片仍显示文生图（PG-26 半闭环）

**位置**：`resolvePictureSendRefs`（执行侧）↔ `PictureWorkspace` 模式同步 / `refStripItems`（UI）

执行器在绑定镜头有角色定妆或场景参考时会：

1. 把 URL 注入发送集合  
2. 把模式从 `text-to-image` 升为 `image-to-image` / `multi-ref`  
3. 成功后写入 `injectedRefs`

但工作区：

- 模式芯片只按「上传 + 上游」算 `resolveRuntimePictureGenMode`，**不读 `injectedRefs`**  
- 参考条 `refStripItems` **不展示** 注入的定妆/场景图  
- 成功 patch **不回写** `pictureGenMode` 为实际发送模式  

结果：芯片写「文生图」，模型在做图生图；用户无法排除或确认注入图。

| 问 | 结果 |
|---|---|
| 触得到 | 镜头绑了有定妆的角色、用户未上传参考时必现 |
| 传得真 | ❌ UI 模式与真实发送不一致 |
| 跑得完 | 出图成功 |
| 流得回 | `injectedRefs` 在 data 里，界面不消费 |

**修法**：

- 参考条展示 `injectedRefs`（标「定妆」「场景」，可排除）  
- 模式同步与 `handleRun` 预判与 `resolvePictureSendRefs` 同源  
- 成功 patch 写回实际 `pictureGenMode`（或 `lastSendMode`）

---

### ❌ PG-39 · P1 · 自动绑镜覆盖 spawn 指定的 `linkedShotId`（R3 PG-29 副作用）

**位置**：`PictureWorkspace.tsx` 自动绑定 `useEffect`

从分镜「生成模块」spawn 时，`FlowSurface` 会写入精确的 `linkedShotId`（如第 5 镜）。  
PG-29 对齐视频工作区后，有上游链镜表即：

```ts
linkedShotId: shotIds[0]  // 永远第一镜
```

只要 `prevSingle !== shotIds[0]`，就会把用户/spawn 指定的镜 **强行改成第一镜**。多镜 desk 上「只想重画第 N 镜」会写错 firstFrame。

视频节点批量出片吃全部 `linkedShotIds`，副作用较小；图像节点单次只写一镜，副作用是写错镜。

| 问 | 结果 |
|---|---|
| 触得到 | spawn 指定镜 + 连分镜台打开工作区 |
| 传得真 | ❌ 绑定目标被换成第一镜 |
| 跑得完 | 出图成功 |
| 流得回 | firstFrame 写到错误镜头 |

**修法**：

- 若已有 `linkedShotId` 且仍在 `shotIds` 内 → **保留**，不要重置为 `[0]`  
- 仅当缺失或不在上游集合时才默认第一镜  
- 多镜时提供镜选择器（不要只有「写回第 1/N 镜」文案）

---

### ❌ PG-40 · P2 · 删除生成图不同步镜表 `firstFrameAssetId`

**位置**：`handleDeleteGenerated`

只更新 `previewUrls` / `previewUrl`，并把文件丢进回收站。若该 URL 已是绑定镜头的 `firstFrameAssetId`，镜表仍指向已回收地址 → 分镜台/预览裂图。

**修法**：删除后若 `removed === linkedShot.firstFrame`，同步 `writePictureShotPatch` 清掉或回退到 `previewUrls[0]` / `keyframePreviousUrl`。

---

### ❌ PG-41 · P2 · `message` / `lastCompiledPrompt` / 降级注记工作区不可见

**位置**：`buildPictureGenSuccessPatch` 写 `message`、`lastCompiledPrompt`、`modelFallbackNote`；`PictureWorkspace` / `CanvasNodeShell` **不渲染**

目前用户可见反馈仅有：

- `truncatedRefs` toast  
- 结果条 `failures`  

「已切换模型」「N 成功 / M 失败」总述、「可继续查询」等在 `message` 里，工作区无展示；`lastCompiledPrompt` 无法审计实际发送稿（角色 enrich、构图、Negative 文本版）。

**修法**：工作区顶栏或高级区展示 `message`；提供「查看发送稿」折叠（只读 `lastCompiledPrompt`）。

---

### ⚠ PG-42 · P2 · 继续查询 / 恢复历史仍缺 `usedAssetIds` / revision pin（PG-27 半闭环）

**位置**：`commitPicturePreviewUrls`

已补：预览、历史归档、`firstFrame`。  
仍缺：executor 成功路径里的 `usedAssetIds`、`characterRevisionPins`。超时取回的图进了镜表，资产账本与 revision 钉仍停在超时前状态。

**修法**：继续查询成功时复用 executor 的 `collectUsedAssetIds` 逻辑，或至少把节点上已有 `usedAssetIds` 写回镜表。

---

### ⚠ PG-43 · P2 · 多镜只有文案、没有选镜，且非第一镜无法稳定绑定

**位置**：`linkedShotLabel` + PG-39 的强制 `[0]`

R3 写了「多镜时标明写给哪一镜」，目前只有静态文案，没有切换。结合 PG-39，非第一镜几乎绑不住。

**修法**：镜下拉；选择结果写入 `linkedShotId`，自动绑定 effect 尊重用户选择（见 PG-39）。

---

### ⚠ PG-44 · P3 · 分镜预览 / 导演关键帧仍直调 `runPictureGenJob`

**位置**：`storyboard-preview-runner.ts`、`director-desk-runner.ts`

R3 范围外备注仍成立，但深度上：

- 不走构图强约束 / 参考板 / `usedAssetIds` 节点账本  
- 与图像节点争同一镜 `firstFrame` 时，导演 provenance 与节点 `usedAssetIds` 可能互相覆盖、口径不一致  

**修法（可选）**：争用链镜表的路径改为委托 executor（带 `linkedShotId`），或明确文档化为「导演域独立账本、不以 picture-gen 节点为准」。

---

### ⚠ PG-45 · P3 · 历史只恢复 URL，不恢复提示词；归档 prompt 可能已是污染稿

**位置**：`restorePictureGeneration` / `handleRestoreHistory`

恢复只换 `previewUrls`（+ 镜表 firstFrame）。`entry.prompt` 来自归档时的 `content`——若当时已被 PG-37 污染，历史条目本身不可信；即使用户想「连提示词一起回退」也做不到。

**修法**：归档时存 `userPrompt`（未 enrich）与可选 `compiledPrompt`；恢复提供「仅图 / 图+提示词」选项。

---

### ⏸ PG-46 · P3 · 全景成功把节点 `aspectRatio` 写成 `2:1` 后粘滞

**位置**：`buildPictureGenSuccessPatch` panorama 分支

出全景后节点比例被写成 `2:1`；切回普通文生图时比例芯片仍可能停在 `2:1`，直到用户手动改。行为可预期但易误导。

**修法**：全景比例只写 `panoramaUrl` / 专用字段，或切模式时恢复用户上次非全景比例。

---

## 4. 优先级汇总

| 票 | 级别 | 状态 | 一句话 |
|---|---|---|---|
| PG-37 | P1 | ❌ | 工作区入口仍污染 `content`（PG-25 回归口） |
| PG-38 | P1 | ❌ | 注入参考不可见，模式芯片撒谎 |
| PG-39 | P1 | ❌ | 自动绑镜覆盖 spawn 的精确 `linkedShotId` |
| PG-40 | P2 | ❌ | 删生成图不清理镜表 firstFrame |
| PG-41 | P2 | ❌ | message / 发送稿工作区不可见 |
| PG-42 | P2 | ⚠ | 继续查询缺 usedAssetIds / revision pin |
| PG-43 | P2 | ⚠ | 多镜无选镜能力 |
| PG-44 | P3 | ⚠ | 预览/导演旁路与节点账本不一致 |
| PG-45 | P3 | ⚠ | 历史不还原提示词且可能存污染稿 |
| PG-46 | P3 | ⏸ | 全景比例粘滞 |

**建议修复顺序**：PG-39 → PG-37 → PG-38 → PG-40/41 → PG-42/43 → P3 批。

（PG-39 放最前：R3 引入的写错镜，比提示词污染更伤分镜数据。）

---

## 5. 与 R3 的关系

| R3 票 | R4 关系 |
|---|---|
| PG-25 | 执行器已闭环；**入口**未闭环 → PG-37 |
| PG-26 | 发送侧已闭环；**UI 可见/模式芯片**未闭环 → PG-38 |
| PG-27 | 预览+firstFrame 已闭环；账本未齐 → PG-42 |
| PG-29 | 自动绑定已接上，但 **覆盖精确绑定** → PG-39；选镜缺失 → PG-43 |

---

## 6. 范围外（本轮仍不开票）

- OpenAI `n>1` / fal 单张返回：能力边界已知，非常规路径  
- 工作区 AbortController 与画布 AbortController 分立：行为可预期  
- 资产库 Bible 定妆一键出图（`asset-bible-image`）：独立产品域，不写图像节点 `content`  
- 浏览器扩展噪声、Vite `lazy → undefined`：按仓库排障口诀处理，不属节点闭环
