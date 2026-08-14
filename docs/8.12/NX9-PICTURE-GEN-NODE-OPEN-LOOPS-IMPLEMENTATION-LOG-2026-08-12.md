# NX9 图像生成节点 · 未闭环功能分析（R4）实施日志

> 日期：2026-08-12
> 范围：`docs/8.12/NX9-PICTURE-GEN-NODE-OPEN-LOOPS-R4.md` 全部 10 张票
> 状态：PG-37～PG-46 已闭环（全景比例记忆恢复）

## 票项总览

| 票号 | 优先级 | 符号 | 状态 | 主要落点 |
|------|--------|------|------|----------|
| PG-37 | P1 | ❌ | 已闭环 | `PictureWorkspace.tsx` + `flow-runner.ts` + `picture-gen-modes.ts` |
| PG-38 | P1 | ❌ | 已闭环 | `PictureWorkspace.tsx` + `PictureUpstreamStrip.tsx` + `picture-gen-refs.ts` + 执行器回写 |
| PG-39 | P1 | ❌ | 已闭环 | `PictureWorkspace.tsx` 自动绑镜 effect |
| PG-40 | P2 | ❌ | 已闭环 | `PictureWorkspace.tsx` 删除回调 + `writePictureShotPatch` |
| PG-41 | P2 | ❌ | 已闭环 | `PictureWorkspace.tsx` 顶栏 message / 发送稿折叠 |
| PG-42 | P2 | ⚠ | 已闭环 | `picture-gen-commit.ts` 账本回流 + 新测试 |
| PG-43 | P2 | ⚠ | 已闭环 | `PictureWorkspace.tsx` 镜下拉 |
| PG-44 | P3 | ⚠ | 已闭环（账本边界文档化） | 两个 runner 直调点注释 + 既有 provenance 测试 |
| PG-45 | P3 | ⚠ | 已闭环 | `picture-gen-history.ts` + 恢复提示词按钮 |
| PG-46 | P3 | ✅ | 已闭环 | `picture-gen-modes.ts` 全景比例记忆恢复 |

## 逐票实施记录

### PG-37 工作区入口不再污染 content

- 改动文件：
  - `apps/web/src/engine/stage-deck/chrome/attached-workspace/generation/picture/PictureWorkspace.tsx`
    - `handleSelectProAction` 删掉 `patch.content = first`（L250 附近）
    - `handleMultiPromptsChange` 删掉 `content: filled[0] ?? ''`（L265 附近）
    - `handleRun` 多图首条改 `prePatch.runPrompt = filled[0]`（L633）
    - `handleRun` 专业模板改 `prePatch.runPrompt = composed`（L664）
    - `finally` 清理 `runPrompt: undefined`（L725）
  - `apps/web/src/engine/stage-deck/chrome/attached-workspace/generation/picture/picture-gen-modes.ts`：新增纯函数 `resolvePictureGenRunPrompt`（L80）
  - `apps/web/src/engine/flow-runner.ts`：`executeBlock` 对 `picture-gen` 优先取 `runPrompt`，缺失才回退 `content`（L228）
- 行为变化：修复前选专业工具 / 多图后点生成，会把模板后缀或多图第一条写进用户 `content`，下一轮 cascade 再 enrich 一次；修复后 composed prompt 只走临时 `runPrompt`，`content` 保持用户当前编辑稿，执行完即清。
- 测试：`picture-gen-modes-auto.test.ts` 新增 `resolvePictureGenRunPrompt` 三例（runPrompt 优先 / 空白回退 / 无 runPrompt 读 content）；`picture-gen-refs.test.ts` PG-25 用例继续断言成功 patch 不含 `content`。
- UI 自检：待人工复验选「生成多图」后点生成，输入框与 `content` 不出现第一条槽位文本；专业工具运行后正文仍是用户原稿。

### PG-38 注入参考可见、模式芯片诚实

- 改动文件：
  - `apps/web/src/engine/picture-gen-refs.ts`：`resolvePictureSendRefs` 读 `excludedRefUrls`，被排除的 `characterRef/envRef` 不再注入也不再升模式（L138-144）
  - `apps/web/src/engine/picture-gen-commit.ts`：`buildPictureGenSuccessPatch` 支持 `pictureGenMode` 实际模式回写 + `useImageReference`（L156-166）
  - `apps/web/src/engine/executors/picture-gen-executor.ts`：成功 patch 传 `pictureGenMode`（L637）
  - `PictureWorkspace.tsx`：`predictedSend` memo 与执行器同源（L785），`refStripItems` 展示 `data.injectedRefs` + `predictedSend.injected`（L821-854），placeholder / 高级摘要改用 `runtimeDisplayMode`（L890、L1017），模式同步 effect 改用 `predictedSend.visibleForMode`（L867）
  - `PictureUpstreamStrip.tsx`：`PictureRefItem` 增加 `injected` 源与 `character/environment` 角色，标签「定妆/场景/注入」、可排除按钮与 title 均已接上
- 行为变化：修复前 UI 只按上传+上游算模式，定妆/场景注入后仍显示「文生图」，注入图不可见、不可排除；修复后参考条实时展示注入图（含可排除），模式芯片/占位符与下一次真实发送同源，执行成功后回写实际模式。
- 测试：`picture-gen-refs.test.ts` 新增「排除的注入不再进发送集合也不升模式」「全部注入被排除时回落文生图」；`buildPictureGenSuccessPatch` 新增「回写实际发送模式」。
- UI 自检：待人工复验绑定有定妆角色的镜头，参考条出现「定妆」注入图，芯片显示图生图；点排除后注入图消失且模式回落文生图。

### PG-39 自动绑镜保留 spawn 指定镜

- 改动文件：`PictureWorkspace.tsx` 自动绑镜 `useEffect`（L127-155）
- 行为变化：修复前只要上游有镜表就把 `linkedShotId` 强写成 `shotIds[0]`，spawn 指定的第 N 镜会被改成第一镜；修复后若已有 `linkedShotId` 且仍在上游集合内则保留，仅当缺失或不在集合时才默认第一镜，`linkedShotLabel` 跟随保留镜。
- 测试：`picture-gen-node-resolve.test.ts` 继续覆盖「显式 id 优先于绑定」；多镜选择行为由 UI 复验清单兜底。
- UI 自检：待人工复验从分镜台「生成模块」spawn 指定第 5 镜后打开工作区，写回镜头仍为 #5，firstFrame 写回第 5 镜。

### PG-40 删除生成图同步镜表 firstFrame

- 改动文件：`PictureWorkspace.tsx` `handleDeleteGenerated`（L291-326）
- 行为变化：修复前删除的 URL 若已写入绑定镜 `firstFrameAssetId`，镜表仍指向回收站地址导致裂图；修复后先更新 `previewUrls`，再比较 `removed === linkedShot.firstFrameAssetId`，命中则 `writePictureShotPatch` 回退到剩余首图（`review`）或清空回 `draft`。
- 测试：写回复用 `writePictureShotPatch` 路径，`picture-gen-commit-accounting.test.ts` 已锁链镜表写回契约；删除 UI 行为列人工复验。
- UI 自检：待人工复验删除绑定镜首帧后，分镜台/预览不再裂图，firstFrame 回退到下一张或空稿。

### PG-41 message / 发送稿工作区可见

- 改动文件：`PictureWorkspace.tsx` `topSlot`（L1206-1226）
- 行为变化：修复前 `message`（如「1 成功 / 1 失败」「已切换模型」）与 `lastCompiledPrompt` 只存在 data 里；修复后顶栏展示 message 条，并提供「查看发送稿」折叠只读展示实际发送稿（含角色 enrich / 构图 / Negative 文本版）。
- 测试：`picture-gen-refs.test.ts` PG-25 用例继续断言 `message` 内容；UI 展示列人工复验。
- UI 自检：待人工复验触发失败/截断/切模型后顶栏出现琥珀色提示；展开「查看发送稿」可读不可编辑。

### PG-42 继续查询账本回流

- 改动文件：`apps/web/src/engine/picture-gen-commit.ts` `commitPicturePreviewUrls`（L204-219）
- 行为变化：修复前继续查询/恢复历史只回写预览与 firstFrame，`usedAssetIds` / `characterRevisionPins` 仍停在超时前；修复后写回 firstFrame 时把节点已有 `usedAssetIds` 与 `characterRevisionPins` 一并回流镜表，无字段时不写空数组/空对象。
- 测试：新增 `apps/web/src/engine/__tests__/picture-gen-commit-accounting.test.ts`，覆盖账本回流与「无账本字段不写空值」。
- UI 自检：待人工复验超时取回后打开导演台/交接区，资产账本与 revision 钉仍与节点一致。

### PG-43 多镜选镜能力

- 改动文件：`PictureWorkspace.tsx` `topSlot`（L1162-1192）
- 行为变化：修复前多镜只有静态「写回第 1/N 镜」文案且非第一镜绑不住；修复后多镜显示镜下拉，选择即写 `linkedShotId` + `linkedShotLabel`，自动绑镜 effect 尊重该选择（PG-39）。
- 测试：`picture-gen-node-resolve.test.ts` 显式 id 优先用例通过；UI 列人工复验。
- UI 自检：待人工复验多镜分镜台下游打开工作区，下拉含全部镜头，切换后 firstFrame 写入所选镜。

### PG-44 预览/导演旁路账本边界

- 改动文件：
  - `apps/web/src/engine/storyboard-preview-runner.ts`（L60-62 注释）
  - `apps/web/src/engine/director-desk-runner.ts`（L1164-1167 注释）
- 行为变化：两处仍按产品边界直调 `runPictureGenJob`，但账本口径已明确：分镜预览产物只写 preview frame / `lineArtUrl`，不写链镜 `firstFrameAssetId`，也不写节点 `usedAssetIds`；导演台批出写 `firstFrameAssetId` + `keyframeProvenance`（含 `usedRefs/model/promptHash/batchId`），不写 picture-gen 节点账本。两套账本不再互相冒充，避免把导演批关键帧误当节点 result。
- 测试：`director-desk-runner.test.ts` 既有用例断言 `keyframeProvenance` 含 `usedRefs`（L513-519）通过。
- UI 自检：待人工复验导演台批出后节点 `usedAssetIds` 不被改写，镜表 `keyframeProvenance.role='director-color-keyframe'` 可见。

### PG-45 历史还原用户提示词

- 改动文件：
  - `apps/web/src/engine/picture-gen-history.ts`：`PictureGenerationHistoryEntry` 增加 `userPrompt` / `compiledPrompt`（L12-14），归档支持 `meta`（L35-44），恢复返回两者（L54-72）
  - `apps/web/src/engine/executors/picture-gen-executor.ts`：归档传 `{ userPrompt: previousPrompt, compiledPrompt: lastPrompt }`（L618）
  - `PictureWorkspace.tsx`：新增 `handleRestorePrompt`（L420-429），历史画廊传 `onRestorePrompt`
  - `PictureResultGallery.tsx`：props 增加 `onRestorePrompt`，每条历史缩略图下加「恢复提示词」按钮（L267-275）
- 行为变化：修复前历史只恢复 URL，`entry.prompt` 还可能存被污染的 content；修复后归档同时存未 enrich 的用户原稿与发送稿，历史区可单独「恢复提示词」（不替换当前生成图）。
- 测试：`picture-gen-refs.test.ts` 新增「归档存用户原稿与发送稿，恢复可回读」。
- UI 自检：待人工复验历史展开每条下方有「恢复提示词」，点击后输入框/`content` 还原该轮用户原稿，当前图不变。

### PG-46 全景比例不粘滞（已闭环）

- 状态：已闭环
- 行为：进入全景时把当前非全景 `aspectRatio` 写入专用 `nonPanoramaAspectRatio`；退出全景 / 清除专业动作时恢复该比例，无记忆回退 `1:1`，比例芯片不再粘滞。
- 改动文件：`picture-gen-modes.ts`、`picture-pro-actions.ts`、`PictureWorkspace.tsx`、`useStoryboardPreviewState.ts`。
- 测试：`picture-gen-modes-auto.test.ts` 新增 PG-46 4 例；运行 `picture-gen-modes-auto.test.ts` + `picture-gen-refs.test.ts` = 32 passed；`pnpm --filter @nx9/web typecheck` 通过。

## 验证结果

- `pnpm --filter @nx9/web typecheck`：通过。
- 定向 vitest（picture-gen-modes-auto + picture-gen-refs）：32 passed，覆盖参考打包/发送同源、历史归档恢复、模式解析、PG-42 账本回流、节点绑定、PG-46 全景比例记忆。
- web 全量 vitest（`apps/web`）：66 files passed，407 passed / 1 skipped；唯一 unhandled error 为 `ScriptDeskBlock.test.tsx` 既有的 `/api/settings` 环境噪声（测试文件本身通过，非本轮回归）。

## 建议人工 UI 复验清单

1. 多图/专业工具运行后输入框与 `content` 不被模板后缀或槽位首条替换；运行结束 `runPrompt` 清空。
2. 绑定有定妆角色的镜头：参考条显示「定妆」注入图，芯片显示图生图；排除后回落文生图。
3. spawn 指定第 N 镜：打开工作区后写回镜头仍为第 N 镜；多镜下拉可切换写回目标。
4. 删除绑定镜 firstFrame：分镜台/预览不再裂图，firstFrame 回退下一张或空稿。
5. 触发失败/截断/切模型：顶栏 message 可见；「查看发送稿」可审计实际发送稿。
6. 超时继续查询：镜表 `usedAssetIds` / `characterRevisionPins` 与节点一致。
7. 历史展开「恢复提示词」：还原用户原稿，不替换当前生成图。
8. 导演台批出后：节点 `usedAssetIds` 不被改写，镜表 `keyframeProvenance` 记录导演域账本。

# NX9 图像生成节点 R4 完票报告

## 统计

- 总票数：10 | 已闭环：9 | ⏸ 记档：1 | 部分闭环：0

## 未闭环 = 0 声明

本人已对照 `docs/8.12/NX9-PICTURE-GEN-NODE-OPEN-LOOPS-R4.md` 全文与汇总表，下列票均已处理：

- 已闭环：PG-37、PG-38、PG-39、PG-40、PG-41、PG-42、PG-43、PG-44、PG-45
- ⏸ 记档：PG-46（全景比例粘滞，产品未定用户偏好策略）

## ⏸ 后置项

- PG-46：全景成功写 `aspectRatio:'2:1'` 属节点语义；恢复用户上次非全景比例需产品决策，触发条件见逐票记录。

## 回归风险

- 运行入口不再写 `content`：历史节点若依赖被污染 content 继续 cascade，需先运行一次由 `runPrompt` 重建发送稿。
- 删除首帧会写回链镜 `firstFrameAssetId`，旧图若已入导演台关键帧，由导演台自身 revision 机制管理。
- 历史归档新增 `userPrompt/compiledPrompt`，旧条目无此字段时「恢复提示词」按钮隐藏。

## 建议人工复验清单（浏览器）

按本文件上方 8 条清单执行，重点核对 content 不变、注入参考可见、多镜选镜与历史恢复提示词。
