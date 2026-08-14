# NX9 分镜台 · 深度开环（第二轮）实施日志

> 日期：2026-08-12
> 范围：`docs/8.12/NX9-STORYBOARD-DESK-DEEP-LOOPS.md` 全部 12 张票
> 状态：SB-D-01～12 已闭环（SB-D-11 已于 2026-08-13 完成巨石拆分）

## 票项总览

| 票号 | 优先级 | 符号 | 状态 | 主要落点 |
|------|--------|------|------|----------|
| SB-D-01 | P0 | ❌ | 已闭环 | `chain-storyboard-utils.ts` + `use-storyboard-desk.tsx` |
| SB-D-02 | P1 | ⚠ | 已闭环 | `storyboard-desk-runner.ts` 复制纯函数 |
| SB-D-03 | P1 | ⚠ | 已闭环 | `use-storyboard-desk.tsx` 签名比对 + 面板文案 |
| SB-D-04 | P1 | ⚠ | 已闭环 | `use-storyboard-desk.tsx` 自动推送 + 统一构建 |
| SB-D-05 | P1 | ⚠ | 已闭环 | `storyboard-desk-runner.ts` 深拷贝纯函数 |
| SB-D-06 | P1 | ⚠ | 已闭环 | 删除 `GridGeneratePanel.tsx` 孤儿旁路 |
| SB-D-07 | P1 | ⚠ | 已闭环 | `setShotFrameUrl` 单次函数式原子写 |
| SB-D-08 | P2 | 打磨 | 已闭环 | 清线稿入撤销栈、批删文案诚实化 |
| SB-D-09 | P2 | 打磨 | 已闭环 | 会话草稿 300ms 防抖 + 失败静默降级 |
| SB-D-10 | P2 | 打磨 | 已闭环 | `review-gate-session.ts` 按链定位导演台 |
| SB-D-11 | P2 | 工程 | 已闭环 | 主 hook 3427→1469 行，拆为 5 个 ops 模块 |
| SB-D-12 | P2 | 打磨 | 已闭环 | 清线稿/复制镜统一写 `null` |

## 逐票实施记录

### SB-D-01 打开导演台按出边定位

- 改动文件：`apps/web/src/engine/chain-storyboard-utils.ts`（新增 `resolveDownstreamDirectorDeskId`，L93）、`apps/web/src/blocks/craft/storyboard-desk/use-storyboard-desk.tsx`（`openDirectorDesk` L1553 改用该函数）
- 行为变化：修复前全画布 `find('director-desk')` 取第一个，两套链并存时会写错台；修复后沿本节点出边 BFS，遇到 `storyboard-desk/storyboard-preview/grid-split` 停止下钻，找不到返回 `null` 再走 `requestSpawn`。
- 测试：`script-storyboard-director-handoff.test.ts` 两套链定位 + 普通中间节点可达 + 找不到返回 null，已通过。
- UI 自检：待人工复验两套分镜→导演链画布，B 台打开导演台只 focus B 下游。

### SB-D-02 复制镜清空媒体字段

- 改动文件：`apps/web/src/engine/storyboard-desk-runner.ts`（`copyShotInBreakdown` L631 / `copyShotsInBreakdown` L653）、`use-storyboard-desk.tsx`（`handleCopyShot` L1895 / `handleCopySelected` L1908）
- 行为变化：修复前浅拷贝保留 `previewImageUrl/referenceImageUrl/sketchUrl` 且 `status` 沿用旧值；修复后复制镜显式清空三项媒体字段并回 `draft`，原 payload 深拷贝后再重排 `index`。
- 测试：`storyboard-desk-breakdown-mutations.test.ts` 复制/批量复制断言原 payload 不被就地改写、新镜缺图、index 正确，已通过。
- UI 自检：待人工复验复制有线稿镜后新镜徽章显示缺图、覆盖率不升。

### SB-D-03 故事板大图过期态

- 改动文件：`use-storyboard-desk.tsx`（L2655 `contactSheetStale` 实时签名比对）、`compose-panel.tsx`（Tab 过期 chip + 大图 Tab 过期提示）、`handoff-panel.tsx`（交接 checklist「已过期 · 需重出」）
- 行为变化：修复前删镜/合镜/清线稿后旧大图 URL 与 signature 仍显示「已生成」；修复后展示层比较 `buildDeskContactSheetSignature(liveCells)` 与存盘 signature，不一致即标「过期」并引导重出。
- 测试：新增 `storyboard-desk-contact-sheet-stale.test.ts`，覆盖清线稿缺图签名变化、删镜签名变化，已通过。
- UI 自检：待人工复验出大图 → 删 1 镜 → 交接区显示「已过期 · 需重出」→ 重出后恢复「已生成」。

### SB-D-04 确认后自动推送交接

- 改动文件：`apps/web/src/engine/storyboard-desk-runner.ts`（`buildDirectorHandoff` L455 统一字段与哈希）、`use-storyboard-desk.tsx`（`confirmCurrentEpisode` L1405 自动推送、`pushDirectorHandoff` L1385、`buildDirectorHandoffForNode` L1351）
- 行为变化：修复前 `lastHandoff` 只在打开导演台时写；修复后确认本集即写 `handoffVersion+1` 并推送下游导演台，交接哈希使用含新确认位的链数据（显式传 `nextChain`，不依赖旧 props），`validateDirectorHandoff` 可立即通过。
- 测试：`script-storyboard-director-handoff.test.ts` SB-D-04 用已确认链断言 `storyboardHash`/`lineartVersion` 与链一致且校验通过，已通过。
- UI 自检：待人工复验确认后不点打开导演台，直接切到导演台看到 `lastHandoffStatus=ready` 且版本递增。

### SB-D-05 复制/批删不可变改写

- 改动文件：`storyboard-desk-runner.ts`（`copyShotInBreakdown`/`copyShotsInBreakdown`/`removeShotsFromBreakdown` L631/653/682）、`use-storyboard-desk.tsx`（复制/批删改调纯函数）
- 行为变化：修复前浅拷贝 `forEach` 就地改原 payload 的 `shot.index`；修复后 `clonePayload` 深拷贝后重排，原 payload 镜头对象引用与 index 全程不变。
- 测试：`storyboard-desk-breakdown-mutations.test.ts` 断言原对象引用/index 不变、新 payload index 正确，已通过。

### SB-D-06 删除画布宫格切分全局旁路

- 改动文件：删除 `apps/web/src/engine/stage-deck/chrome/GridGeneratePanel.tsx`（仓库内无任何引用）
- 行为变化：修复前该旁路写全局 `workspace.storyboard`，多台并存时存在跨台读图风险；修复后旁路整体移除，分镜台构图/宫格线稿入口只走链镜表 SSOT。
- 测试：`rg GridGeneratePanel` 无引用；回归由 web 全量测试兜底。
- UI 自检：待人工复验画布宫格切分入口不再出现，分镜台构图 Tab 宫格按钮仍在。

### SB-D-07 setShotFrameUrl 单次原子写

- 改动文件：`use-storyboard-desk.tsx`（`setShotFrameUrl` L1734）
- 行为变化：修复前先 `applyScriptBreakdownPayload` 再 `updateNodeData` 两步写，中间存在「已确认 + 新帧」假绿窗口；修复后单次 `updateNodeData(props.id, (node) => ...)` 内完成 breakdown 写回、`storyboardPreview.frames` 同步、chain `patchChainShot`、`stripEpisodeConfirmation` 同 tick 落盘。
- 测试：`storyboard-desk-frame-cleanup.test.ts` 及相关 5 文件共 52 用例通过。

### SB-D-08 清线稿入撤销栈 + 批删文案

- 改动文件：`use-storyboard-desk.tsx`（`handleClearLineArt` L1871、`handleDeleteSelected` L1922）
- 行为变化：修复前清线稿无 `pushUndo`、批删文案写「不可撤销」；修复后清线稿先 `pushUndo(base)` 再写回，批删文案改为「删除后可用撤销恢复镜表、预览与确认态」。
- 测试：`storyboard-desk-breakdown-mutations.test.ts` 覆盖不可变删除路径。

### SB-D-09 会话草稿防抖

- 改动文件：`use-storyboard-desk.tsx`（L245 草稿 key，L257-267 300ms `setTimeout` 防抖）
- 行为变化：修复前每次确认态/帧签名变化都整包 `JSON.stringify` 进 `sessionStorage`；修复后 300ms 防抖合并连续写入，写失败 catch 静默降级不阻塞编辑。
- 测试：`script-storyboard-director-handoff.test.ts` 会话草稿 v2 序列化/恢复契约通过。

### SB-D-10 审阅门闸多链定位

- 改动文件：`apps/web/src/engine/stage-deck/utils/review-gate-session.ts`（L98-107）
- 行为变化：修复前 `runtime.getNodes().find(director-desk)` 取第一个；修复后优先 `opts.sourceChainDeskId`，否则从前一个待审 shot 的 desk 解析，再用 `resolveDownstreamDirectorDeskId` 定位本链导演台。
- 测试：`dd-r01-keyframe-gate.test.ts` 断言审片会话无全局回退，已通过。

### SB-D-11 主 hook 体积（工程债记档）

- 状态：已闭环（2026-08-13 完成拆分）
- 拆法：`use-storyboard-desk.tsx` 3427→1469 行，拆出 `storyboard-desk/breakdown-queue-ops.ts`（743 行）、`line-art-ops.ts`（795 行）、`handoff-ops.ts`（497 行）、`shot-writeback-ops.ts`（284 行）、`sheet-export-ops.ts`（277 行）；行为不变。
- 验证：web typecheck 通过；全量 vitest 76 文件 480 通过；分镜台 E2E `e2e-script-storyboard-director.spec.ts` 2/2 通过（多集切换、并发关键帧批出、视频推送、网络中断重试）。
- 锚点：`apps/web/src/blocks/craft/storyboard-desk/use-storyboard-desk.tsx`

### SB-D-12 无图语义统一 null

- 改动文件：`storyboard-desk-runner.ts`（`cloneShotForCopy`）、`use-storyboard-desk.tsx`（`handleClearLineArt`）
- 行为变化：修复前清线稿写 `previewImageUrl: ''`；修复后清线稿与复制镜统一写 `null`，避免 `''`/`null` 两种「无图」语义在哈希与序列化中分叉。
- 测试：`storyboard-desk-breakdown-mutations.test.ts` 断言复制镜 `previewImageUrl/referenceImageUrl/sketchUrl` 均为 `null`。

## 验证结果

- `pnpm --filter @nx9/web typecheck`：通过。
- 定向 vitest（5 文件）：52 passed，包含交接契约、多链定位、breakdown 不可变复制/删除、帧清理、关键帧门禁、StoryboardDeskBlock。
- 新增 `storyboard-desk-contact-sheet-stale.test.ts`：2 passed。
- web 全量 vitest（`apps/web`）：65 files passed，398 passed / 1 skipped；唯一 unhandled error 为 `ScriptDeskBlock.test.tsx` 既有的 `/api/settings` 环境噪声（测试文件本身通过，非本轮回归）。

## 建议人工 UI 复验清单

1. 两套分镜→导演链并存：分镜 B 打开导演台只写/focus 导演 B；导演 A 的 `lastHandoff.fromId` 不变。
2. 复制有线稿镜：新镜缺图徽章、覆盖率不升；清原镜线稿不影响副本。
3. 出故事板大图 → 删 1 镜或清线稿：构图 Tab 与交接 checklist 出现「过期 / 已过期 · 需重出」，重出后恢复。
4. 确认本集后不点打开导演台：直接切到下游导演台，`lastHandoffStatus=ready`、`handoffVersion` 递增、批出门禁可通过。
5. 批量删除：原 payload 不可变（单测已锁），UI 撤销可恢复镜表/预览/确认态。
6. 宫格切分旁路入口不再出现，分镜台构图 Tab 宫格按钮仍正常出线稿并写链镜表。

# NX9 分镜台深度开环完票报告

## 统计

- 总票数：12 | 已闭环：12 | ⏸ 记档：0 | 部分闭环：0

## 未闭环 = 0 声明

本人已对照 `docs/8.12/NX9-STORYBOARD-DESK-DEEP-LOOPS.md` 全文与明细，下列票均已处理：

- 已闭环：SB-D-01、SB-D-02、SB-D-03、SB-D-04、SB-D-05、SB-D-06、SB-D-07、SB-D-08、SB-D-09、SB-D-10、SB-D-11、SB-D-12
- ⏸ 记档：无

## ⏸ 后置项

- 无

## 回归风险

- 复制 / 批删改为不可变纯函数后，任何依赖原对象引用就地变异的旧调用会失效；仓库已全部改调纯函数。
- 确认即推送交接后，`lastHandoff` 不再依赖打开导演台；旧会话里未推送的确认态需重新确认一次。
- 画布宫格切分旁路已删，分镜台构图 Tab 仍是唯一宫格入口。

## 建议人工复验清单（浏览器）

按本文件上方 6 条清单执行，重点核对多链定位、交接自动推送与过期大图状态。
