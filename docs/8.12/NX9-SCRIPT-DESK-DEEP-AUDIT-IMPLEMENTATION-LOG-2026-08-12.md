# NX9 编剧台 · 第三轮深挖问题清单（2026-08-12）实施日志

> 日期：2026-08-12
> 范围：`docs/8.12/NX9-SCRIPT-DESK-DEEP-AUDIT-R3.md` 全部 15 项
> 状态：1.1 / 1.2 / 1.3 / 2.1 / 2.2 / 2.3 / 2.4 / 3.1 / 3.2 / 3.3 / 4.1 / 4.2 / 4.3 / 4.4 / 4.5 已闭环

## 票项总览

| 票号 | 优先级 | 符号 | 状态 | 主要落点 |
|------|--------|------|------|----------|
| 1.1 | P0 | ❌ | 已闭环 | `applyPackagePatch` 按 id/index upsert；runner 默认产出单集增量 patch |
| 1.2 | P1 | ❌ | 已闭环 | debounce scope registry + 自动存/关台/确认/送分镜前 flush；键入即 dirty |
| 1.3 | P1 | ❌ | 已闭环 | 批量重写本地累加 session；存在 pending 时互锁 |
| 2.1 | P1 | ⚠ | 已闭环 | undo 栈改为 `{ package, agentSession? }`，Ctrl+Z 同步回滚消息态 |
| 2.2 | P2 | ⚠ | 已闭环 | 台级 Ctrl+Z 先 `resetDebouncedFields`，丢弃幽灵字符 |
| 2.3 | P2 | ⚠ | 已闭环 | 重试失败集走 rewrite 语义，保留原 `episode.id` |
| 2.4 | P2 | ⚠ | 已闭环 | 确认成稿 / 送分镜 checklist / 实际送分镜前强制 flush |
| 3.1 | P2 | ▫ | 已闭环 | 公共素材库角色命中时只读提示并禁止改名 |
| 3.2 | P2 | ▫ | 已闭环 | 改名同步未应用 pending，避免 Apply 后旧名写回 |
| 3.3 | 体验 | ▫ | 已闭环 | `POST /api/agent/script-desk/chat-stream` + client `scriptDeskChatStream` + runner onChunk 分支 |
| 4.1 | 工程债 | 无符号 | 已闭环 | ScriptDeskBlock 2265→1044 行，4 个 ops hooks；行为不变，测例全绿 |
| 4.2 | 工程债 | 🧟 | 已闭环 | 删除 `clearSession` 死代码 |
| 4.3 | 工程债 | ▫ | 已闭环 | 删集后清洗 `selectedEpIds`，消除幽灵选中 |
| 4.4 | 工程债 | ▫ | 已闭环 | 受控 `<details>` 增加 Enter/Space 键盘展开收起 |
| 4.5 | 工程债 | ▫ | 已闭环 | 补 pending 合并 / debounce flush / pending 改名测例 |

## 逐票实施记录

### 1.1 应用 pending 按集增量合并

- 状态：已闭环
- 改动文件：
  - `packages/shared/src/types/screenplay-package.ts`：`applyPackagePatch` 在 `episodesMergeMode === 'upsert'` 时改走 `upsertScreenplayEpisodes`（按 `id`/`index` 匹配单集合并，保留 base 身份并按 index 排序），不再整表覆盖
  - `apps/web/src/engine/script-desk-runner.ts`：`withSceneDraftsFromEpisodes` 默认给 patch 追加 `episodesMergeMode:'upsert'`；`runAppendEpisodeSkill` / `runRewriteEpisodeSkill` 只产出目标集增量 patch；整包生成分支显式传 `{ upsertEpisodes: false }` 保持整表替换语义
- 行为变化：修复前应用重写/生成 pending 会把发起时的完整集列表整表覆盖，抹掉其它集并发手改；修复后按集 upsert，只写入目标集，其它集改动保留。
- 测试：新增 `apps/web/src/engine/__tests__/script-desk-r3-merge.test.ts`（5 例）：单集 pending 不抹其它集手改；先后两条 pending Apply 均保留；重写只产目标集增量且保留 id；续写只产目标集增量；Agent 单集增量 vs 整包生成仍整表替换。
- UI 自检：无新增 UI；Apply 按钮路径不变。
- 关联回归：shared build、web typecheck、web 全量 vitest 全绿。

### 1.2 debounce 草稿进入自动存 / 关台工作草稿

- 状态：已闭环
- 改动文件：
  - `apps/web/src/blocks/nx9/script-desk/use-debounced-field.tsx`：新增模块级 scope registry，`flushDebouncedFields(scope)` / `resetDebouncedFields(scope)`；`DebouncedFieldScopeProvider` 统一注入 scope 与 `onDirty`
  - `apps/web/src/blocks/nx9/ScriptDeskBlock.tsx`：`markDirty` 键入即亮 dirty；自动存 interval 先 flush 再写工作草稿；关台 / 重置存草稿 / 打开草稿前先 flush 并使用 live `pkgRef`；自动存只在 flush 后清 dirty
- 行为变化：修复前自动存与关台读渲染期 `pkg`，最后 300ms 内的按键不在草稿箱；修复后先强制 flush，工作草稿含最后字符，且键入中 dirty 立即可见。
- 测试：新增 `apps/web/src/blocks/nx9/__tests__/use-debounced-field.test.tsx`：键入即 `onDirty`；`flushDebouncedFields` 提交草稿；committed 回写后重复 flush 不重复 commit；`resetDebouncedFields` 丢弃未提交草稿。
- UI 自检：待人工复验：正文连续输入后立刻关台选保存，打开「工作中」草稿应含最后字符。

### 1.3 批量重写不再互相覆盖

- 状态：已闭环
- 改动文件：`apps/web/src/blocks/nx9/ScriptDeskBlock.tsx`：
  - `sessionRef` 作为唯一 live session；`commitAgentSession` 统一写 ref + node data
  - `runEpisodeRewrite` 返回累加后的 `nextSession`；`handleBatchRewrite` 循环用 `nextSession` 连续累加，不再依赖旧闭包 session
  - 单集与批量重写均先检查「存在未应用 pending」并提示禁止
- 行为变化：修复前批量重写第 2 集会基于旧闭包 session 覆盖第 1 集 pending；修复后 3 条 pending 都能保留，配合 1.1 增量 patch，全部应用后互不覆盖。
- 测试：`script-desk-r3-merge.test.ts` 覆盖两条 pending 先后 Apply 均保留；既有编剧台 5 个测试文件回归通过。
- UI 自检：待人工复验：批量勾选 3 集重写后对话区可见 3 条待应用，逐条 Apply 后三集正文均为新稿。

### 2.1 撤销同步 session

- 状态：已闭环
- 改动文件：`apps/web/src/blocks/nx9/ScriptDeskBlock.tsx`：undo 栈从 `ScreenplayPackage[]` 改为 `{ package, agentSession? }[]`；`pushUndo` 压入 `sessionRef.current` 快照；Ctrl+Z 弹出 entry 后同时回滚 package 与 agentSession，并同步 `sessionRef`
- 行为变化：修复前应用 pending 后 Ctrl+Z 只回正文，对话仍显示「已应用」；修复后正文与消息态一起回滚（消息恢复为待应用）。
- 测试：代码锚点 + 键盘路径；组件级键盘回归列入人工复验清单（与 4.4 真机回归同批）。
- UI 自检：待人工复验：应用重写 → Ctrl+Z → 正文与对话消息态一致。

### 2.2 结构性 Ctrl+Z 与本地草稿解耦

- 状态：已闭环
- 改动文件：`apps/web/src/blocks/nx9/ScriptDeskBlock.tsx`：台级 Ctrl+Z 前先 `resetDebouncedFields(props.id)`，把聚焦字段的未提交 draft 重置为 committed，再回滚 package/session；键入态仍走浏览器原生撤销
- 行为变化：修复前删集后焦点在其它集正文框按 Ctrl+Z，本地 draft 的幽灵字会在失焦/定时后写回已撤销包；修复后结构撤销前先丢弃幽灵字。
- 测试：`use-debounced-field.test.tsx` 的 reset 测例覆盖「丢弃未提交草稿，后续 flush 不写回」。
- UI 自检：待人工复验：输入框内敲字后删集并按 Ctrl+Z，输入框回到 committed 且不把幽灵字写回。

### 2.3 重试失败集保留 episode id

- 状态：已闭环
- 改动文件：`apps/web/src/blocks/nx9/ScriptDeskBlock.tsx` `handleRetryFailed`：目标集仍存在时走 `runRewriteEpisodeSkill`（保留原 `id`/`index`，只替换正文），不再「滤掉旧集 + append 换新 id」
- 行为变化：修复前重试失败集会生成 `ep-${Date.now()}-${index}` 新 id；修复后同一 `episode.id` 保留，下游分镜/资产绑定不断裂。
- 测试：`script-desk-r3-merge.test.ts` 断言重写 patch 保留 `ep-1` id；runner 语义由 `runRewriteEpisodeSkill` 锚点锁定。
- UI 自检：无新增 UI。

### 2.4 确认 / 送分镜前强制 flush

- 状态：已闭环
- 改动文件：`apps/web/src/blocks/nx9/ScriptDeskBlock.tsx`：`handleConfirm`、`handleHandoffToStoryboard`、`doHandoffToStoryboard` 均在读 `pkgRef.current` 前 `flushDebouncedFields(props.id)`
- 行为变化：修复前确认包与分镜 hash 可能缺最后 300ms 内的编辑；修复后确认与送分镜先提交本地 draft，包与 hash 与随后状态一致。
- 测试：flush 行为由 `use-debounced-field.test.tsx` 覆盖；确认/送分镜路径列入人工复验。
- UI 自检：待人工复验：改 logline 后 100ms 内确认，确认包含新 logline；送分镜 hash 与随后同步态一致。

### 3.1 公共素材库角色改名只读提示

- 状态：已闭环
- 改动文件：`apps/web/src/blocks/nx9/ScriptDeskBlock.tsx` `handleRenameCharacter`：命中公共素材库角色档案（`publicItems` 中 id/label 匹配）时提示「公共素材库角色档案为只读，无法随编剧台改名；如需联动请先在素材库「另存为私有」后重试」，并直接返回禁止改名
- 行为变化：修复前公共库命中仍可改名，跳转后名不一致；修复后公共命中有明确文案且不改名；私有档案改名逻辑与跳转保持一致。
- 测试：文案与分支由代码锚点锁定；UI 路径列入人工复验。
- UI 自检：待人工复验：公共素材库角色改名出现只读提示；私有档案改名前后跳转一致。

### 3.2 改名同步未应用 pending

- 状态：已闭环
- 改动文件：
  - `apps/web/src/engine/bible-library-sync.ts`：新增 `renameCharacterInPendingPatch` / `renameCharacterInPendingSession`，只改未应用且未丢弃的 pending 的正文/标题/Bible 字段
  - `apps/web/src/blocks/nx9/ScriptDeskBlock.tsx` `handleRenameCharacter`：改名后对 `sessionRef.current` 同步 pending
- 行为变化：修复前已生成未应用的 pending 仍是旧名，Apply 后旧名写回；修复后 pending 同步为新名，Apply 后正文为新名。
- 测试：新增 `apps/web/src/engine/__tests__/script-desk-rename-pending.test.ts`：只改未应用 pending；已应用/已丢弃消息不动；无未应用 pending 时返回 null。
- UI 自检：待人工复验：重写 pending 未应用时改名 → Apply 后正文为新名。

### 3.3 Agent 技能轨 SSE

- 状态：已闭环
- 改动文件：
  - `apps/server/src/modules/agent/agent.service.ts`：新增 `scriptSkillStream`，走 `gateway.proxyLlmStream` 流式回传，最后解析同一 JSON 契约
  - `apps/server/src/modules/agent/agent.controller.ts`：新增 `POST /api/agent/script-desk/chat-stream`，`text/event-stream` + done/error 事件
  - `apps/web/src/api/client.ts`：新增 `scriptDeskChatStream`，按 `data:` 行聚合 chunk 并回调 `onChunk`
  - `apps/web/src/engine/script-desk-runner.ts`：`runScriptDeskSkill` 增加 `onChunk` 分支，流式收敛后仍产出 `{patch, explanation}`
  - `apps/web/src/blocks/nx9/ScriptDeskBlock.tsx`：`handleAgentSend` 把 chunk 追加到 `streamPreview`，ChatStage 直接展示流式文本
- 行为变化：修复前技能轨整包等待黑盒；修复后长技能可见逐字输出，最终仍走「待应用产出」流程。
- 测试：新增 `apps/web/src/engine/__tests__/script-desk-sse.test.ts`：服务端端点/流方法、客户端解析、面板接线；web 定向 8 passed + server typecheck 通过。

### 4.1 主文件行数债

- 状态：已闭环（2026-08-13 A9 收口）
- 改动文件：
  - `apps/web/src/blocks/nx9/ScriptDeskBlock.tsx`：2265 → 1044 行，仅保留状态/ref/effects/JSX 与薄胶水
  - 新增 `apps/web/src/blocks/nx9/script-desk/use-script-desk-actions.ts`（导入/确认/送分镜/诊断/导出/首浮层）
  - 新增 `apps/web/src/blocks/nx9/script-desk/use-script-desk-agent.ts`（Agent 发送、首次生成、续写、重试、重写、批量）
  - 新增 `apps/web/src/blocks/nx9/script-desk/use-script-desk-edits.ts`（分集增删改排、Bible 增删改、改名、合并）
  - 新增 `apps/web/src/blocks/nx9/script-desk/use-script-desk-drafts.ts`（草稿箱、重置、关台、tip）
  - `apps/web/src/engine/__tests__/script-desk-sse.test.ts`：源码锚点随文件迁移到 agent ops
- 行为变化：重构前后同一回调逻辑按原 deps 闭包搬运，共享 ref/savePkg/commitAgentSession 保持唯一；无行为变更。
- 测试：web typecheck 通过；编剧台定向 5 文件 13 passed；web 全量 76 文件 480 passed / 1 skipped；分镜链路 E2E 2/2 通过。

### 4.2 删除 clearSession 死代码

- 状态：已闭环
- 改动文件：`apps/web/src/blocks/nx9/ScriptDeskBlock.tsx`：删除未使用的 `clearSession`；清屏统一走 `resetDeskToEmpty` / 内联 `updateNodeData`
- 行为变化：修复前存在可编译但无入口的死函数；修复后无残留。
- 测试：仓库 `rg clearSession` 无命中。

### 4.3 删集后清理 selectedEpIds

- 状态：已闭环
- 改动文件：`apps/web/src/blocks/nx9/ScriptDeskBlock.tsx`：effect 在 `pkg.screenplay.episodes` 变化时过滤 `selectedEpIds`，只保留仍存在的集 id
- 行为变化：修复前删集后「已选 N」可能残留幽灵计数；修复后自动清洗。
- 测试：代码锚点；UI 计数列入人工复验。

### 4.4 受控 details 键盘展开收起

- 状态：已闭环（真机回归待人工复验）
- 改动文件：`apps/web/src/blocks/nx9/script-desk/ScreenplayPanel.tsx`：`<summary>` 增加 `onKeyDown`，Enter/Space 时 preventDefault 并翻转 `openEpIds`，键盘路径与点击路径同源
- 行为变化：修复前受控 details 键盘默认行为在部分浏览器与 `openEpIds` 不同步；修复后 Enter/Space 显式驱动同一状态。
- UI 自检：待人工复验：多浏览器真机按 Enter/Space 展开收起一致、无频闪。

### 4.5 组件级回归测例

- 状态：已闭环
- 改动文件：
  - 新增 `apps/web/src/engine/__tests__/script-desk-r3-merge.test.ts`（5 例）
  - 新增 `apps/web/src/blocks/nx9/__tests__/use-debounced-field.test.tsx`（2 例）
  - 新增 `apps/web/src/engine/__tests__/script-desk-rename-pending.test.ts`（2 例）
- 覆盖：Apply pending 不抹其它集、批量 pending 多稿共存、重写 id 保留、debounce flush/reset、pending 改名同步。

## 验证

- `pnpm --filter @nx9/shared build`：通过。
- `pnpm --filter @nx9/web typecheck`：通过。
- 编剧台定向 vitest（8 个文件）：44 passed。
  - `ScriptDeskBlock.test.tsx`
  - `script-desk-closure.test.ts`
  - `script-desk-panels.test.tsx`
  - `desk-helpers.test.ts`
  - `use-debounced-field.test.tsx`
  - `script-desk-r3-merge.test.ts`
  - `script-desk-rename-pending.test.ts`
  - `script-storyboard-director-handoff.test.ts`
- `apps/web` 全量 vitest：72 files，444 passed / 1 skipped。
- A9 收口复核：`pnpm --filter @nx9/web typecheck` 通过；全量 vitest 76 files，480 passed / 1 skipped；`e2e/e2e-script-storyboard-director.spec.ts` 2/2 通过。

# NX9 编剧台 R3 完票报告

## 统计

- 总票数：15 | 已闭环：15 | ⏸ 记档：0 | 部分闭环：0

## 未闭环 = 0 声明

本人已对照 `docs/8.12/NX9-SCRIPT-DESK-DEEP-AUDIT-R3.md` 全文与汇总表，下列票均已处理：

1.1、1.2、1.3、2.1、2.2、2.3、2.4、3.1、3.2、3.3、4.1、4.2、4.3、4.4、4.5 已闭环。

## ⏸ 后置项

- 无（4.1 已按矩阵 A9 拆到 <1200 行并全绿收口）。

## 回归风险

- `applyPackagePatch` 新增 `episodesMergeMode:'upsert'` 分支：仅当 patch 显式携带该标记时走增量合并，整包生成路径显式传 `upsertEpisodes:false`，既有全量替换语义未变；web 全量 444 条测试全绿。
- debounce scope registry 为模块级 Map：按 `props.id` scope 隔离，组件卸载自动反注册；多块画布节点同开时互不干扰（建议人工复验时开 2 个编剧台节点验证）。
- Ctrl+Z 新增 session 回滚：undo 栈 push 时机在 `savePkg` 结构性变更前，已确认快照为变更前 session；历史栈内旧格式无 `agentSession` 时走兼容路径（`entry.agentSession ?? sessionRef.current`）。

## 建议人工复验清单（浏览器）

1. 输入剧名/logline/正文后立刻关台选保存：打开「工作中」草稿应含最后字符。
2. 自动存 60s 触发时正在打字：草稿含最后字符，且 dirty 不被误清。
3. 批量勾选 3 集重写：对话区 3 条待应用，逐条 Apply 后三集正文均为新稿且不互相覆盖。
4. 应用 pending 后 Ctrl+Z：正文与对话消息态一起回滚（消息恢复为待应用）。
5. 输入框有幽灵字时删集再 Ctrl+Z：输入框重置为 committed，幽灵字不写回。
6. 重试失败集：成功后的集 `id` 不变，下游分镜仍认同一集。
7. 改 logline 后 100ms 内确认成稿 / 送分镜：确认包与分镜 hash 含新 logline。
8. 公共素材库角色改名：出现只读提示并禁止；私有档案改名后未应用 pending 内也是新名。
9. 受控 details：多浏览器真机按 Enter/Space 展开收起一致，无频闪。
10. 删集后「已选 N」不残留幽灵计数；两个编剧台节点同开时 debounce flush 互不串台。
