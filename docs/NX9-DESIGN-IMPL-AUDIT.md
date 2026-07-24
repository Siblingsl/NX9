# NX9 设计对照实现查档报告

> **文档性质**：对照 `docs/NX9-FEATURE-DESIGN-LOG.md` 各章功能清单，核对仓库**实际代码**的查档结论。  
> **查档日期**：2026-07-21  
> **口径**：只报「已落地 / 未落地 / 半落地」事实，**不使用完成度百分比**。  
> **真相源**：用户当次指令 → `docs/NX9-FEATURE-DESIGN-LOG.md` → `约束开发要求.md` → 现有代码行为（与 `AGENTS.md` 一致）。  
> **维护**：本报告可追加修订记录；不替代设计日志正文。若实现发生变化，请追加「修订」节，勿静默改写结论。

---

## 1. 总览

主链骨架在代码中**已串通**：

```
编剧台 → 设定检查 → 分镜台 → 导演台 → 视频生成 → 智能剪辑 → 交付打包
```

缺口主要集中在：

| 区域 | 典型缺口 |
|------|----------|
| 分镜台 | 增镜 / 合镜 / 拆镜、增量补拆 |
| 设定检查 | Bible 显式入库未接线；下游软门禁警告缺失 |
| 视频生成 | 批出重试 / 并发；「去智能剪辑」非真深链 |
| 交付打包 | HF 轮询状态、导出历史 |
| 导演台 | 关键帧/3D 对比预览、沉浸、多机位预设 |

**说明**：设计日志总览中曾写「功能 6 本集批出已关」——与代码一致；若写「P0/P1 缺口全部关闭」则**偏乐观**，详见下文各章。

跨章 `[存疑]` / `O-*` 待决项仍以设计日志「跨章待决清单」为准；**未确认前不应当默认实现**。

---

## 2. 功能 1 · 智能剪辑（`clip-editor`）

**设计专章**：`NX9-FEATURE-DESIGN-LOG.md` · 功能 1

### 2.1 已落地

| 清单项（摘要） | 代码事实 |
|----------------|----------|
| `timelineDraft` 为工作区时间线 SSOT | 节点读 `useWorkspaceDocument.timelineDraft` |
| 漫剧 / 爆款智能编排 | `orchestrateDramaTimeline` / `orchestrateViralTimeline` |
| 目录文案「智能剪辑」 | `block-catalog.ts` |
| 引擎 FFmpeg / Hyperframes / Remotion | 节点 `handleRender` 分支；Remotion 为**客户端** Studio bundle ZIP + Chrome 提示 |
| 建议面板采纳 / 忽略 | 深合并 `patch` → `setTimelineDraft`；更新 `pendingSuggestionIds` |
| 同步到 export-pack | 写入对方节点 `timelineDraft` + `syncedFrom` |
| beat-cut / ducking / template-patch | `smart-edit-orchestrator.ts` 生成对应 `SmartSuggestion` |

### 2.2 未落地 / 半落地

| 清单项 | 结论 | 依据 |
|--------|------|------|
| SE-P2-01 服务端 `render-remotion` 真渲 | **未落地**（备选路径已做） | `montage.controller.ts` 返回「异步任务骨架」文案；未接 `@remotion/renderer`。当前产品路径是客户端 bundle，对应设计 O-1 备选，**不是**设计原文的服务端真渲 |
| Timeline 附着 WS 深度编辑 | **半落地** | `attached-workspace` 标 `timeline`；深度编辑仍主要靠 Episode Studio（O-2） |

### 2.3 查档路径

- `apps/web/src/blocks/core/ClipEditorBlock.tsx`
- `apps/web/src/engine/smart-edit-orchestrator.ts`
- `apps/server/src/modules/montage/montage.controller.ts`

---

## 3. 功能 2 · 统一导演台（`director-desk`）

**设计专章**：功能 2

### 3.1 已落地

| 清单项（摘要） | 代码事实 |
|----------------|----------|
| `director-3d` → `director-desk` 迁移 | `migrate-block-kinds.ts`；Dock 下架独立 3D |
| ScreenModal 生产 / 3D / 送出 | `DirectorDeskBlock` 三 Tab |
| 3D 嵌入舞台 | `Director3dStageEmbed` + `Director3dShell`；截图写回 `director3dGuide` |
| 队列进 3D、筛选「仅有3D」 | 队列行切 Tab；`filter === '3donly'` |
| 送出推 clip-gen | `pushKeyframesToClipGen` |
| Dev 短字段 + 来源标签 | `DirectorDeskDevFields` |

### 3.2 未落地

| 清单项 | 结论 |
|--------|------|
| DD-P1-02 预览「关键帧 / 3D / 对比」 | **已补齐**（预览区三段切换：关键帧 / 3D 参考 / 并排对比） |
| DD-P1-05 3D 沉浸子态 | **已补齐**（沉浸按钮 → Modal 全屏 3D 视口 + 顶栏返回） |
| DD-P2-01 按镜多机位预设条 | **未落地**（P2） |
| DD-P2-03 Agent 摆位 | **未落地**（O-6 待决 · P2） |

### 3.3 查档路径

- `apps/web/src/blocks/core/DirectorDeskBlock.tsx`
- `apps/web/src/engine/director-desk-runner.ts`

---

## 4. 功能 3 · 编剧台（`script-desk`）

**设计专章**：功能 3

### 4.1 已落地

| 清单项（摘要） | 代码事实 |
|----------------|----------|
| kind 迁移、`ScreenplayPackage`、三栏壳 | `ScriptDeskBlock` + shared types |
| 确认成稿；本节点不再拆镜 | `status=confirmed`；拆镜在分镜台 |
| Agent 会话、「应用此步产出」、技能芯片 | `runScriptDeskSkill` / `applyPendingMessagePatch` |
| topic / plot / pacing / hooks | LLM `api.scriptSkill`（失败可降级本地） |
| generate / dialogue | `api.scriptScreenplay` |
| character / world | `extractAssets` 路径 |
| consistency | **本地规则** `runConsistencyCheck`（非 LLM） |
| 续写单集、爆点轨 UI | `handleRegenEpisode`；`sd-hook-timeline` |
| 导出 JSON / MD / ZIP | 本地 + `api.scriptExport` |
| `@` 插入、legacy 提示、Dev Pack | `@` 插本台 Bible 名；`ScriptDeskDevPackOverlay` |

### 4.2 未落地 / 半落地

| 清单项 | 结论 |
|--------|------|
| SD-P2-04 `@` 引用**素材库**锁定描述并注入生成 | **已补齐**：`@` 下拉并列显示素材库人物/场景；`enrichPromptWithAssetMentions` 注入锁定描述 |
| consistency 作为 Agent LLM 技能 | **已补齐**：LLM + 本地规则双合诊断，故障降级纯规则回退 |
| Rail Script Studio 删除（O-9 P1） | **已补齐**（P0 隐藏）：组件返回 null |

### 4.3 查档路径

- `apps/web/src/blocks/nx9/ScriptDeskBlock.tsx`
- `apps/web/src/engine/script-desk-runner.ts`
- `apps/web/src/engine/stage-deck/chrome/rail/ScriptStudioPanel.tsx`

---

## 5. 功能 4 · 分镜台（`storyboard-desk`）

**设计专章**：功能 4

### 5.1 已落地

| 清单项（摘要） | 代码事实 |
|----------------|----------|
| 探测 confirmed `ScreenplayPackage` | 上游边 / 节点 package |
| 「从成稿拆镜」写入本台 `scriptBreakdown` | 不写回编剧台 |
| 确认交接、打开导演台 | handoff Tab |
| 诊断、构图覆盖率、试出配额 | `diagnostics` / `compositionCoverage` / `trialCap` |
| 批量条瘦身（线稿主、关键帧试出） | UI 文案与配额拦截 |
| Dev Prompt Pack | 导入 / 导出 / 恢复默认 |

### 5.2 未落地

| 清单项 | 结论 |
|--------|------|
| SB-P1-02 增量补拆 | **已补齐**（粘贴文本补拆镜合并进现表） |
| SB-P1-03 增镜 / 合镜 / 拆镜结构调整 | **已补齐**（增镜/合镜/拆镜按钮与逻辑） |
| SB-P2-01 多集批量拆镜队列 | **未落地**（P2） |
| SB-P2-02 构图模板 / reference-board 约束 | **未落地**（P2） |
| Dev Pack「生效来源」逐字段标注 | **已补齐**（逐字段显示 DEFAULT / 节点 Pack / 全局 Override） |

### 5.3 查档路径

- `apps/web/src/blocks/craft/StoryboardDeskBlock.tsx`
- `apps/web/src/engine/storyboard-desk-runner.ts`

---

## 6. 功能 5 · 素材就绪门禁（素材库 + `asset-gate`）

**设计专章**：功能 5

### 6.1 已落地

| 清单项（摘要） | 代码事实 |
|----------------|----------|
| 上游读 `ScreenplayPackage.bible` | `inspectBibleAssets` |
| 默认检查不写库 | `syncBibleAssets(..., { autoIngest: false })` |
| 放行 meta `asset-gate-passed` | 放行按钮写 `meta.type` |
| 开库深链；素材库剧本支撑块 | `ScreenplaySupportPanel` 挂角色/场景详情 |

### 6.2 未落地 / 重要缺口

| 清单项 | 结论 | 依据 |
|--------|------|------|
| 显式「同步入库」（`autoIngest: true`） | **已补齐** | 门禁 Modal 中「同步入库」按钮调用 `autoIngest: true` |
| AG-P1-01 健康度（无参考图等）标黄 | **已补齐** | 概览 Tab 显示缺参考图/提示词的库条目 |
| AG-P1-02 批量「采用 draft 字段」到已有库条目 | **已补齐** | 「采用 draft 字段」按钮合并 Bible 叙事字段 |
| AG-P1-03 未放行时分镜台 / 导演台警告条 | **已补齐** | 两卡片显示「上游设定检查未放行」警告 |
| AG-P2-01 硬门禁、AG-P2-02 服装/道具纳入 | **未落地**（含 O-14 · P2） |

### 6.3 查档路径

- `apps/web/src/blocks/craft/AssetGateBlock.tsx`
- `apps/web/src/engine/asset-gate-runner.ts`
- `apps/web/src/panels/asset-library/ScreenplaySupportPanel.tsx`

---

## 7. 功能 6 · 视频生成主链（`clip-gen`）

**设计专章**：功能 6

### 7.1 已落地

| 清单项（摘要） | 代码事实 |
|----------------|----------|
| `episode-queue` 本集批出 | 跳过无关键帧 / 已有视频；串行批出、进度、停止 |
| 消费关键帧 / directorDeskRefs | `firstFrameAssetId` 等 |
| 成功回写 shot 视频字段 | `videoAssetId` / `videoStatus` |
| 目录 hint「本集批出」 | `block-catalog.ts` |
| 批完「去智能剪辑」文案 | 按钮存在 |

### 7.2 未落地 / 半落地

| 清单项 | 结论 |
|--------|------|
| CG-P1-02 失败重试 / 并发上限 | **已补齐**（并发 2 + 自动重试 1 + 不阻断） |
| 「去智能剪辑」真深链 | **已补齐**（`fitView` 聚焦 clip-editor 节点） |
| 导演台送出后画布聚焦 clip-gen | **已补齐**（`sendToVideo` 调用 `fitView` 聚焦 clip-gen 节点） |

### 7.3 查档路径

- `apps/web/src/blocks/core/ClipGenBlock.tsx`
- `apps/web/src/engine/director-desk-runner.ts`（`pushKeyframesToClipGen`）

---

## 8. 功能 7 · 交付打包（`export-pack`）

**设计专章**：功能 7

### 8.1 已落地

| 清单项（摘要） | 代码事实 |
|----------------|----------|
| 卡面 / 模式前提校验 | 无 timeline 时禁用 HF / Remotion |
| 与智能剪辑边界文案 | 模式源说明 |
| 「打开智能剪辑」深链 | `fitView` 聚焦 `clip-editor` |
| 接收 synced timeline | `timelineDraft` + `syncedFrom` |

### 8.2 未落地

| 清单项 | 结论 |
|--------|------|
| EP-P1-02 导出历史列表（最近 N 次） | **已补齐**（展开式历史列表） |
| EP-P1-03 HF 任务轮询状态展示 | **已补齐**（`useTaskPoll` 展示排队/渲染/完成/失败态） |
| EP-P2-01 多集打包、EP-P2-02 清单 PDF/CSV | **未落地**（P2） |
| O-16 双出口心智 | **待决**（实现层边界文案已有） |

### 8.3 查档路径

- `apps/web/src/blocks/nx9/ExportPackBlock.tsx`
- `apps/web/src/engine/export-pack-runner.ts`

---

## 9. 功能 8 · 内部提示词与 Dev Prompt Pack

**设计专章**：功能 8

### 9.1 已落地

| 清单项（摘要） | 代码事实 |
|----------------|----------|
| 双闸 | `import.meta.env.DEV` + Settings「启用 Prompt 热调」 |
| 编剧台 / 分镜台 Dev Pack | 各自 Modal / details 面板 |
| 导演台短 Dev 字段 | `consistencySuffix` / `styleLockAppendix` |
| 全局 Override store | `stores/dev-prompt-overrides.ts` |
| 编剧台 / 导演台「生效来源」 | DEFAULT / 节点 Pack / 全局 Override 文案 |
| 功能 1/5/6/7 无产品级 system Tab | 符合横切约定 |

### 9.2 未落地 / 半落地

| 清单项 | 结论 |
|--------|------|
| 分镜台 Dev UI「生效来源」标注 | **未落地** |
| 分镜 Pack 与拆镜 runner 的稳定落点闭环 | **待复核**：面板多为本地 state；是否写入节点 data 并参与 `normalizeScriptBreakdownPrompts` 合并，需在下次改动时再验 |

### 9.3 查档路径

- `apps/web/src/stores/dev-prompt-overrides.ts`
- `apps/web/src/panels/SettingsModal.tsx`
- `ScriptDeskBlock` / `StoryboardDeskBlock` / `DirectorDeskBlock` 内 Dev 面板

---

## 10. 建议补齐顺序（实现向）

> 仅按缺口影响排序；不替代产品确认 `O-*`。

| 优先级 | 项 | 原因 |
|--------|----|------|
| 高 | 设定检查显式 `autoIngest: true` 入库按钮 | runner 已有、UI 未调；主链「补齐入库」断 |
| 高 | 分镜台增镜 / 合镜 / 拆镜 + 增量补拆 | 设计 P1；镜表无法结构调整 |
| 中 | clip-gen 批出重试 / 并发；「去智能剪辑」真聚焦 | 批出已有，运维与闭环不完整 |
| 中 | 未放行软警告条（分镜台 / 导演台） | AG-P1-03 |
| 中 | export-pack HF 轮询 + 导出历史 | EP-P1 |
| 低 | 导演台对比预览 / 沉浸 / 多机位 | DD-P1 / P2 |
| 低 | 服务端 Remotion 真渲 | 仅当否决 O-1「客户端即可」时再做 |

---

## 11. 与设计日志的关系

| 文档 | 职责 |
|------|------|
| `docs/NX9-FEATURE-DESIGN-LOG.md` | 功能设计与实现方案（追加式 SSOT） |
| **本文** `docs/NX9-DESIGN-IMPL-AUDIT.md` | 设计 ↔ 代码对照查档结论 |

实现补齐后：在本报告末追加修订记录；必要时在设计日志对应章「修订记录」中引用本报告日期与结论，**勿**用百分比覆盖设计正文。

---

## 12. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-21 | 初版：按功能 1–8 清单查档；不含完成度百分比 |
| 2026-07-22 | 功能 2 DD-P1-02 + DD-P1-05 已补齐；更新 §3.2 状态 |
| 2026-07-22 | 功能 3 SD-P2-04 @素材库引用 + consistency LLM + Rail 隐藏已补齐；更新 §4.2 状态 |
| 2026-07-22 | 功能 4 SB-P1-02 增量补拆 + SB-P1-03 增镜/合镜/拆镜 + Dev Pack 生效来源已补齐；更新 §5.2 状态 |
| 2026-07-22 | 功能 4 SB-P1-02 增量补拆 + SB-P1-03 增镜/合镜/拆镜 + Dev Pack 生效来源标注已补齐；更新 §5.2 状态 |
| 2026-07-22 | 功能 5 同步入库按钮 + 健康度 + 批量采用 draft + 未放行警告条已补齐；更新 §6.2 状态 |
| 2026-07-22 | 功能 7 EP-P1-02 导出历史 + EP-P1-03 HF 轮询状态展示已补齐；更新 §8.2 状态 |
| 2026-07-22 | 功能 6 CG-P1-02 并发/重试 + CG-P1-03 去智能剪辑深链 + 导演台聚焦 clip-gen 已补齐；更新 §7.2 状态 |
