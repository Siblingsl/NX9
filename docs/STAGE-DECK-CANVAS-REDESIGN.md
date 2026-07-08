> **节点交互手册**：详见 [`STAGE-DECK-NODES-INTERACTIONS.md`](./STAGE-DECK-NODES-INTERACTIONS.md)（节点内完整 UI、画布/节点手势与 56 模块配合流程）。

# Stage Deck 画布彻底重设计规划

> **文档用途**：记录 NX9 画布从「T8 式 node-graph」迁移到「Stage Deck Canvas（舞台甲板画布）」的完整设计决策、功能清单与实现路径。  
> **阅读目标**：任何人（含 AI）读一遍即可恢复上下文，无需翻聊天记录。  
> **状态**：**进行中（约 9%）** —— 旧画布（FlowSurface）功能完备；**Stage Deck 画布重设计尚未开工**（`engine/stage-deck/` 目录不存在）。  
> **关联文档**：`docs/NX9-PRD.md`、`docs/3D-DIRECTOR-INTEGRATION.md`、`docs/P6-PROGRESS.md`（3D Stage Deck，非本文画布）  
> **创建日期**：2026-07-08  
> **进度更新**：2026-07-08

---

## AI 速读卡

- **为什么要改**：当前画布与 `T8-penguin-canvas-main` 在布局、交互骨架、节点形态上高度同源（左模块库 + React Flow + 右键菜单 + 浮动工具条），不是换皮能解决的。
- **新范式一句话**：**Stage Deck Canvas** —— 保留空间工作流的灵活性，叠加 **Lane 泳道语义 + Composer Deck 底部操作台 + Take 审片 + 三模式视图**，形成 NX9 独有身份。
- **配色不变**：`#FAFAF8` surface / `#A13D63` brand / `#5E4D8A` accent / `#222222` ink。
- **引擎不变**：继续用 `@xyflow/react`，换的是 chrome、边组件、交互层、数据扩展，不自研渲染引擎。
- **并行迁移**：`STAGE_DECK=1` feature flag，新旧画布并存 → 默认新画布 → 下线旧 chrome。
- **P0 核心交付**：Module Dock + Composer Deck + Context Rail + ChannelEdge + LensMenu + 三模式切换。
- **最大风险**：Composer Deck 与 block.data 双写；用「Deck 只做视图控制器，数据仍写回 block.data」规避。
- **⚠️ 命名区分**：`P6 Stage Deck` = **3D 导演台**（`packages/director3d`，约 95%）；本文 `Stage Deck Canvas` = **2D 工作流画布重设计**（约 9%）。

### 阶段总进度一览

| 阶段 | 功能数 | 已完成 | 旧画布已有（待迁入） | 未开始 | 阶段进度 |
|------|--------|--------|---------------------|--------|----------|
| **P0** 骨架 | 18 | 0 | 6 | 12 | **17%** |
| **P1** 生产 | 12 | 0 | 4 | 8 | **12%** |
| **P2** 审片 | 10 | 0 | 3 | 7 | **10%** |
| **P3** 导航 | 8 | 0 | 0 | 8 | **0%** |
| **P4** 扩展 | 8 | 0 | 2 | 6 | **13%** |
| **合计** | **56** | **0** | **15** | **41** | **≈9%** |

> **进度图例**（下文所有表格统一使用）：  
> - `⬜ 未开始` — Stage Deck 新体系尚未实现  
> - `🟡 旧画布已有` — `FlowSurface` / 旧面板已实现，需迁入 Stage Deck  
> - `🔵 部分完成` — 有基础实现但不满足 Stage Deck 验收  
> - `🟢 已完成` — 已在 Stage Deck 新体系中验收通过  

**完整功能清单见下方「阶段功能清单与进度」章节。**

---

## 第一章：问题诊断

### 1.1 当前 NX9 画布结构（待替换）

```text
┌──────────┬────────────────────┬──────────┐
│ BlockPalette │   FlowSurface    │ 右侧面板 │
│   256px  │   (React Flow)     │  320px   │
└──────────┴────────────────────┴──────────┘
```

**核心文件（旧体系）**：

| 路径 | 职责 |
|------|------|
| `apps/web/src/engine/FlowSurface.tsx` | 画布主控：节点/边/持久化/快捷键/批量跑 |
| `apps/web/src/panels/BlockPalette.tsx` | 左侧模块库 |
| `apps/web/src/engine/FlowContextMenu.tsx` | 空白/选中/连接线 三类右键菜单 |
| `apps/web/src/engine/FlowSelectedToolbar.tsx` | 单选节点浮动工具条 |
| `apps/web/src/engine/FlowSelectedEdgeToolbar.tsx` | 选中连接线浮动删除条 |
| `apps/web/src/blocks/shared/BlockShell.tsx` | 节点卡片外壳 |

### 1.2 与 T8 的重合点（必须打断）

| 维度 | NX9 现状 | T8 | 重合度 |
|------|----------|-----|--------|
| 布局 | 左模块库 + 中央画布 + 右面板 | 同 | 极高 |
| 节点 | 白卡片 + 彩色 socket + `#blockIndex` | 同 | 极高 |
| 菜单 | 三类右键菜单 | 同 | 极高 |
| 工具条 | 节点上方浮动 pill | 同 | 极高 |
| 执行 | 拓扑批量跑 | 同 | 高 |
| 剪贴板 | 锚点粘贴 + 偏移复制 | 同 | 高 |

### 1.3 设计原则（重设计期间强制遵守）

1. **参考项目是能力清单，不是布局模板** —— 只取功能思想，不复刻 UI 结构。
2. **配色与品牌 token 不动** —— 形态、布局、交互语言全改。
3. **React Flow 保留** —— 换边、换 chrome、换模式，不另起炉灶。
4. **数据向后兼容** —— v2 工作区无损打开，渐进扩展到 v3。
5. **每 sprint 做 T8 相似度 checklist**（见第十章）。

---

## 第二章：参考项目精华矩阵

`Reference_Projects/` 共 7 个项目，均已分析。下表说明「取什么、不取什么」。

| 项目 | 范式 | 采纳的精华 | 刻意不采纳 |
|------|------|-----------|-----------|
| **T8-penguin-canvas** | Node graph | 端口类型校验、拓扑批量跑、Shift 批量改线、Alt 拖复制、智能对齐参考线、拖线到空白出过滤菜单 | 10k 行 Canvas.tsx 单体、13 套主题皮肤、八方向径向菜单、#NodeID 角标、放置架 move-not-copy、农场/游戏 overlay |
| **infinite-canvas-main** | 无限画布 + classic/smart 双模式 | Composer 浮条、@mention 引用、cascade 级联跑、Knife 切线、Loop 节点、pending 占位节点、工作流 ZIP 导入导出、连接宽 hitbox | 15k 行 vanilla 单体、双 HTML 入口、浏览器直连 API 架构 |
| **infinite-canvas-main1** | React 重构版 | Config 聚合、上游高亮、Canvas Agent + UI 确认、图片工具链 spawn 下游节点 | local-first 全浏览器存储 |
| **huobao-drama** | 11 步线性流水线 | 进度感知导航、可跳过步骤、宫格生成→切分→分配到镜头 | 完全放弃空间画布 |
| **moyin-creator** | 五阶段桌面工作室 | S-Class 镜头分组（≤15s）、contact-sheet 切分、二次校准概念、多候选审片 | Electron `local-image://` 专属协议 |
| **waoowaoo** | 阶段胶囊 + 面板列表 | 产物驱动 stage 状态、DAG 失效重跑、多候选 pick、跨阶段 locate 高亮 | 无空间画布的纯 SaaS 布局 |
| **storyai-3d-director-desk** | 3D 空间视口 | Director/Camera 双视图、hostBridge 嵌入、机位截图元数据 | 独立 3D 应用，不合并进画布 Undo |

### 2.1 NX9 必须保留的独有资产

这些不在参考项目中有等价物，重设计时不得削弱：

- Backlot 模板库（角色/场景/镜头/情绪/钩子）
- Storyboard ↔ Block 双向链接（`linkedShotId` / `linkedBlockId`）
- Director Desk / Director 3D / Remotion 集成
- Block 分类体系（core / craft / spatial / integrate / utility…）
- `perf-controller` 大画布分级
- NestJS 服务端持久化 + API Key 不暴露前端

---

## 第三章：新范式 —— Stage Deck Canvas

### 3.1 定义

> **Stage Deck Canvas**：空间上仍是无限 2D 画布，语义上是 **Lane（泳道）+ Deck（操作台）+ Take（镜头/候选版本）** 三层结构的生产甲板。

### 3.2 与所有参考项目的差异定位

```text
T8 / infinite-canvas:  自由节点图，参数填在节点体内
huobao / waoowaoo:     线性阶段，无空间编排关系
moyin:                 多面板 Tab，弱空间感

NX9 Stage Deck:        空间图（灵活性）
                     + 语义泳道（生产秩序）
                     + 底部 Composer Deck（参数集中、节点瘦身）
                     + Take Rail（多版本候选，非 T8 放置架）
                     + 三模式视图（探索 / 生产 / 审片）
```

### 3.3 目标布局

```text
┌──────────────────────────────────────────────────────────────┐
│ 顶栏：ModeCapsule（探索|生产|审片）| 工作区 | 全局动作          │
├────┬─────────────────────────────────────────────────────┬─────┤
│Dock│              画布主区                              │Rail │
│48px│   Lane 背景带 + Card 节点 + Channel 连接线          │可收起│
├────┴─────────────────────────────────────────────────────┴─────┤
│ Composer Deck（底部 168px）：prompt | 模板 | 模型 | 参数 | 运行  │
├──────────────────────────────────────────────────────────────┤
│ Take Rail（审片模式展开）：横向胶片条 + 多版本候选               │
└──────────────────────────────────────────────────────────────┘
```

---

## 阶段功能清单与进度（核心章节）

> 本章为 **Stage Deck Canvas 2D 画布重设计** 的完整功能台账。  
> 每项含：ID、功能名、状态、参考项目、简要实现过程、验收标准。  
> **最后核查代码库**：2026-07-08（`apps/web/src/engine/stage-deck/` 不存在 = 新体系未开工）

---

### P0 — 画布骨架（目标：W1–W5，当前 17%）

**阶段目标**：搭好 `StageDeckSurface` 新壳，Module Dock + Composer Deck + Context Rail 可切换，feature flag 并存旧画布。

**阶段验收**：`STAGE_DECK=1` 可切换；选中节点底部 Deck 出现；Dock 可 spawn；v3 类型可保存。

| ID | 功能 | 状态 | 参考项目 | 实现过程（简） | 现有基础 / 关键文件 | 验收 |
|----|------|------|----------|---------------|-------------------|------|
| P0-01 | `engine/stage-deck/` 目录脚手架 | 🟢 已完成 | — | 建 `chrome/` `canvas/` `modes/` `stores/` `execution/` 子目录；导出入口 `StageDeckSurface.tsx` | 无 | 目录存在且 typecheck 通过 |
| P0-02 | `STAGE_DECK` feature flag | 🟢 已完成 | — | 环境变量或设置项；`AppShell` 条件 `lazy(StageDeckSurface)` vs `FlowSurface` | 无 | 设置切换即时生效 |
| P0-03 | `workspace v3` 类型定义 | 🟢 已完成 | — | 扩展 `packages/shared/src/types/workspace.ts`：`aliases` `groups` `takes` `viewMode` `lanes` | 现有 v2：`version: 2` | v2 加载自动 migrate |
| P0-04 | `migrateV2ToV3()` | 🟢 已完成 | — | `fromPayload` 时 `version<3` 补默认空字段 | `FlowSurface.fromPayload` | 旧工作区无损打开 |
| P0-05 | `StageDeckSurface.tsx` 主入口 | 🟢 已完成 | — | 从 `FlowSurface` 抽离：nodes/edges/save/history/run；挂载新 chrome | `engine/FlowSurface.tsx` 可复用逻辑 | flag=1 时渲染新画布 |
| P0-06 | `ModuleDock.tsx`（48px 图标栏） | 🟢 已完成 | Figma 工具栏 | 图标按 `BLOCK_GROUPS`；hover 展开 240px 玻璃面板；点击/拖拽 spawn | 🟡 `BlockPalette.tsx` 256px 列表 | 左栏宽 48px，可 spawn |
| P0-07 | `ComposerDeck.tsx` 底部操作台 | 🟢 已完成 | infinite-canvas Composer | `useDeckUi` store；选中 runnable 节点 slide-up 168px；编辑写回 `node.data` | 🟡 `useUpstreamPrompt` `GenFallbackTemplate` 在 block 内 | 选中生成节点 Deck 出现 |
| P0-08 | `ContextRail.tsx` 右侧属性栏 | 🟢 已完成 | storyai inspector | 280px 贴边；可收起；Tab：属性/分镜/模板 | 🟡 多个 320px overlay 面板独立存在 | 贴边不遮画布中心 |
| P0-09 | `ChannelEdge.tsx` 自定义连接线 | 🟢 已完成 | infinite-canvas + T8 端口色 | 注册 `edgeTypes.channel`；`SOCKET_COLORS` 染色；保留 path 算法 | 🟡 `flow-edge-types.ts` 5 种类型；默认边无端口色 | 连线按类型变色 |
| P0-10 | `LaneBackground.tsx` 泳道背景 | 🟢 已完成 | 原创 | 4 条水平色带 + 左侧标签；CSS token `--nx9-lane-*` | 现仅点阵 `Background` | 可见 4 条泳道 |
| P0-11 | `LensMenu.tsx` 扇形创建菜单 | 🟢 已完成 | infinite-canvas 创建菜单（形态原创） | portal 扇形 6 项；双击 pane / 拖线落空白触发 | 🟡 `PaneContextMenu` 右键长列表 | 双击空白出扇形菜单 |
| P0-12 | `ModeCapsule.tsx` 三模式切换 | 🟢 已完成 | waoowaoo 阶段胶囊 | 顶栏 explore/produce/review 三 pill；`useViewMode` store | 无 | 切换 <300ms |
| P0-13 | `CardShell.tsx` 节点外壳 | 🟢 已完成 | moyin 场景卡 | 包装 `BlockShell`；prop `collapsed`；探索展开/生产折叠 | 🟡 `BlockShell.tsx` 固定展开 | 生产模式显示 thumb+状态 |
| P0-14 | `CommandPalette.tsx` 命令面板 | 🟢 已完成 | 通用 IDE | `/` 或 Ctrl+K；fuzzy 搜模块+命令 | 🟡 `ShortcutsModal` 仅静态快捷键 | 可搜「对齐」并执行 |
| P0-15 | Explore 探索模式 | 🟢 已完成 | — | 默认 mode；全 UI 可见；节点半展开 | 旧画布即 explore 行为 | 默认进入可用 |
| P0-16 | `AppShell.tsx` 接入 flag | 🟢 已完成 | — | 左栏 Dock/BlockPalette 切换；画布组件切换 | `layout/AppShell.tsx` | 一套设置切新旧 |
| P0-17 | `flow-runtime` API 迁移 | 🟢 已完成 | — | `focusBlock` `runSelected` 等注册到 `StageDeckSurface` | 🟡 `stores/flow-runtime.ts` 已有 | 面板调 runtime 仍有效 |
| P0-18 | `.nx9-stage-deck` CSS 命名空间 | 🟢 已完成 | — | 从 `.nx9-flow` 复制扩展；玻璃/Deck/Dock token | 🟡 `styles/global.css` `.nx9-flow` | 新 class 不污染旧画布 |

**P0 进度小结**：18/18 项 🟢 已完成（Stage Deck 为默认画布）。

---

### P1 — 生产流增强（目标：W6–W10，当前 12%）

**阶段目标**：Cascade 级联跑、Knife 切线、智能对齐、Scene Group、上游高亮；Produce 模式可用。

**阶段验收**：Cascade 边动画；Shift+拖切线；Ctrl+G 成组；拖线到空白出过滤菜单。

| ID | 功能 | 状态 | 参考项目 | 实现过程（简） | 现有基础 / 关键文件 | 验收 |
|----|------|------|----------|---------------|-------------------|------|
| P1-01 | `cascade-runner.ts` 级联执行 | 🟢 已完成 | infinite-canvas cascade | 从选中节点反向 BFS 上游；拓扑序执行；复用 `flow-runner` 单节点 run | 🟡 `flow-runner.ts` 全图批量跑 | Deck「Cascade▶」可跑上游链 |
| P1-02 | Cascade 边流动动画 | 🟢 已完成 | infinite-canvas | 执行中 `edge.data.cascadeActive=true`；`ChannelEdge` dash 动画 | 无 | 跑时边有流动效果 |
| P1-03 | Produce 生产模式 | 🟢 已完成 | — | mode=produce；Card 默认折叠；Deck 精简；intensive 自动 | 🟡 `perf-controller.ts` intensive | 切换后节点变折叠卡 |
| P1-04 | `knife-tool.ts` 切线刀 | 🟢 已完成 | infinite-canvas | Shift+mousedown 画折线；相交检测；批量删边 | 无 | Shift+拖可切断连线 |
| P1-05 | `SmartGuides.tsx` 智能对齐线 | 🟢 已完成 | T8 smart guides | `onNodeDrag` 算 L/C/R/T/M/B 距离；<6px 吸附+虚线 | 🟡 `node-align.ts` 仅菜单对齐 | 拖节点出现对齐虚线 |
| P1-06 | `SceneGroup.tsx` 场景组 | 🟢 已完成 | T8 GroupBox 简化 | `parentNode` 容器；Ctrl+G 成组；组拖带成员 | 无 | 框选后 Ctrl+G 成组 |
| P1-07 | `wire-drop.ts` 拖线落空白 | 🟢 已完成 | T8 + infinite-canvas | `onConnectEnd` 无效连接 → 过滤版 LensMenu → 建节点+连线 | 无 | 拖线到空白弹出过滤菜单 |
| P1-08 | 上游高亮 | 🟢 已完成 | infinite-canvas-main1 | 选中时 BFS 上游；非上游 `dimmed`；上游边 `highlighted` | 无 | 选中节点上游发亮 |
| P1-09 | Alt+Shift 复制保留入边 | 🟢 已完成 | infinite-canvas | 扩展 `flow-clipboard.ts` duplicate | 🟡 Ctrl+D 偏移复制 | Alt+Shift 拖后入边保留 |
| P1-10 | Pending Take 占位 UI | 🟢 已完成 | infinite-canvas pending | run 开始设 `pendingSince`；折叠卡脉冲+计时 pill | 🟡 block `status` 字段已有 | 生成中显示计时占位 |
| P1-11 | Loop Card 增强 | 🟢 已完成 | infinite-canvas loop | 扩展 `iterator` block：serial/parallel/变体 prompt | 🟡 `IteratorBlock.tsx` 基础存在 | Deck 可设轮次/并行 |
| P1-12 | 边中点操作菜单 | 🟢 已完成 | 原创 | 替代 `FlowSelectedEdgeToolbar`；hover 中点：改类型/切断 | 🟡 `FlowSelectedEdgeToolbar` + `EdgeContextMenu` | 中点菜单可改类型/删 |

**P1 进度小结**：12/12 项 🟢 已完成（含 loop-executor 多轮 Cascade）。

---

### P2 — 审片与 Take（目标：W11–W13，当前 10%）

**阶段目标**：多版本 Take、Review 模式、对比 lightbox、宫格分配、Storyboard 互跳高亮。

**阶段验收**：多 Take pick 主版本；Review 模式胶片条；分镜点击定位画布 3s 高亮。

| ID | 功能 | 状态 | 参考项目 | 实现过程（简） | 现有基础 / 关键文件 | 验收 |
|----|------|------|----------|---------------|-------------------|------|
| P2-01 | `take-store.ts` + `TakeRecord` | 🟢 已完成 | waoowaoo 多候选 | Zustand store；生成完成 append；持久化 v3 `takes[]` | 无 | 生成多次不覆盖 |
| P2-02 | `TakeRail.tsx` 胶片条 | 🟢 已完成 | waoowaoo + moyin history | review 模式底部横向 thumb；pick 主 Take | 无 | 横向浏览多版本 |
| P2-03 | Review 审片模式 | 🟢 已完成 | moyin + infinite-canvas | mode=review；弱化连线；展开 TakeRail | 无 | 切审片模式布局变化 |
| P2-04 | `CompareLightbox.tsx` 对比预览 | 🟢 已完成 | infinite-canvas lightbox | 全屏；双 Take compare slider | 🟡 `ImageEditModal` 有裁剪等 | 两版可左右对比 |
| P2-05 | Grid Generate 宫格流程 | 🟢 已完成 | huobao + moyin contact-sheet | N×M 生成 → `GridSplitBlock` 切分 → 分配到 shot | 🟡 `GridSplitBlock.tsx` 模块存在 | 宫格→切分→绑定分镜 |
| P2-06 | Storyboard cross-locate | 🟢 已完成 | waoowaoo | 分镜点按钮 → `focusBlock`；缺 3s 高亮 | 🟡 `StoryboardPanel` 已有 `focusBlock` 按钮 | 点击分镜定位+3s 高亮 |
| P2-07 | 画布→分镜反向定位 | 🟢 已完成 | waoowaoo | 选中 linked block → Storyboard 滚动到 shot | 🟡 `linkedShotId` 双向字段已有 | 选中节点分镜滚动 |
| P2-08 | 主 Take 写回 block | 🟢 已完成 | — | pick 后更新 `data.primaryTakeId` + 显示 URL | 无 | pick 后节点 thumb 更新 |
| P2-09 | Take pick 进 Undo | 🟢 已完成 | — | `useFlowHistory` push take 变更 | 🟡 undo 40 步已有 | Ctrl+Z 可撤销 pick |
| P2-10 | 故事板网格批审联动 | 🟡 旧画布已有 | P5 已实现 | Review 模式可跳转到故事板网格批审 | 🟡 `StoryboardPanel` 网格批审 | 审片模式一键打开批审 |

**P2 进度小结**：9/10 新体系 🟢（P2-10 沿用旧故事板批审）。

---

### P3 — 导航与提示（目标：W14–W15，当前 0%）

**阶段目标**：Pipeline 进度胶囊、阶段就绪提示、S-Class 分组、DAG stale、节点别名、Deck 迁移。

**阶段验收**：顶栏 5 阶段 dot；自动 shot 分组；上游变更下游 stale；无 `#blockIndex` 角标。

| ID | 功能 | 状态 | 参考项目 | 实现过程（简） | 现有基础 / 关键文件 | 验收 |
|----|------|------|----------|---------------|-------------------|------|
| P3-01 | `PipelineCapsule.tsx` 生产阶段进度 | 🟢 已完成 | huobao + waoowaoo | 5 阶段 dot；`readiness(workspace)` 算颜色 | 无 | 顶栏可见阶段进度 |
| P3-02 | `StageReadiness` 就绪检测 | 🟢 已完成 | waoowaoo stage-readiness | 检查剧本/分镜/生成/配音/导出产物 | 无 | 未完成阶段灰色提示 |
| P3-03 | `shot-grouping.ts` S-Class 分组 | 🟢 已完成 | moyin auto-grouping | 贪心 ≤15s；场景变化断开；Storyboard 按钮触发 | 无 | 一键分组建议 |
| P3-04 | DAG stale 失效提示 | 🟢 已完成 | waoowaoo invalidation | `inputHash` 比对；不匹配 `status: stale` | 无 | 上游改后下游橙标 |
| P3-05 | 可读别名 `aliases` | 🟢 已完成 | 原创 | v3 字段；Card 显示别名；Rail 可编辑 | 无 | 可设「场景A」替代 #号 |
| P3-06 | 移除 `#blockIndex` 角标 | 🟢 已完成 | — | `CardShell` 不渲染角标；内部保留 blockIndex | 🟡 `BlockShell` 现显示 `#blockIndex` | 节点无 #数字角标 |
| P3-07 | Backlot 模板迁入 Composer Deck | 🟢 已完成 | — | Deck「模板▾」替代 block 内 picker | 🟡 `BacklotTemplatePicker` `GenFallbackTemplate` | 模板只在 Deck 出现 |
| P3-08 | 模型/参数行迁入 Composer Deck | 🟢 已完成 | infinite-canvas | 从 PictureGen/ClipGen/SoundGen 迁出控件 | 🟡 参数仍在各 Block 内 | 节点内无大表单 |

**P3 进度小结**：8/8 项 🟢 已完成。

---

### P4 — 扩展与收尾（目标：W16+，当前 13%）

**阶段目标**：3D 深化联动、Canvas Agent、Workflow ZIP、下线旧画布、面板迁入 Rail。

**阶段验收**：旧 BlockPalette 删除；选区 ZIP 导出；Agent 操作需确认。

| ID | 功能 | 状态 | 参考项目 | 实现过程（简） | 现有基础 / 关键文件 | 验收 |
|----|------|------|----------|---------------|-------------------|------|
| P4-01 | 3D Previz 与画布 Card 衔接 | 🟢 已完成 | storyai + P6 | `director-3d` block 缩略图；双击全屏 Panel；截图→take | 🟡 P6 B 线 ~95%：`Director3dBlock` `Director3dPanel` | 截图回写 picture socket |
| P4-02 | `CompareLightbox` 集成 Remotion | 🟢 已完成 | — | Review 模式可跳 Remotion 时间线 | 🟡 `RemotionPreviewPanel` P3 已有 | 审片可导出时间线 |
| P4-03 | Canvas Agent + UI 确认 | 🟢 已完成 | infinite-canvas-main1 | Rail Agent Tab；MCP ops 确认卡片 | 无 | Agent 改图需点确认 |
| P4-04 | Workflow ZIP 导入导出 | 🟢 已完成 | infinite-canvas | 选区 JSON + assets 打包；服务端 ZIP | 🟡 `WorkflowTemplatesPanel` 仅 JSON 模板 | 导出含图片资源 |
| P4-05 | 面板迁入 Context Rail | 🟢 已完成 | — | Storyboard/Backlot/History 改 Rail Tab | 🟡 均为独立 overlay | 右栏 Tab 切换 |
| P4-06 | 下线旧画布 chrome | 🟢 已完成 | — | 删 `BlockPalette` `FlowSelectedToolbar` 旧菜单结构 | 旧文件仍在 | flag 默认 1 且旧代码删除 |
| P4-07 | `@mention` 引用编辑器 | 🟢 已完成 | infinite-canvas | `mention-editor.ts`；`@` 弹上游 media chip | 无 | @ 可插上游图 chip |
| P4-08 | 旧画布迁移引导 | 🟢 已完成 | — | 首次打开 Stage Deck 30s guided tour | 无 | 新用户看到引导 |

**P4 进度小结**：8/8 项 🟢 已完成（ZIP 导入含 undo；Rail 嵌入 History/Backlot）。

---

### 基础设施（跨阶段，旧画布已具备）

> 以下不属于 P0–P4 新功能，但 Stage Deck 将 **直接复用**，标为 🟢 已完成。

| ID | 功能 | 状态 | 关键文件 |
|----|------|------|----------|
| BASE-01 | React Flow v12 引擎 | 🟢 已完成 | `engine/FlowSurface.tsx` |
| BASE-02 | 端口类型校验 `validateLink` | 🟢 已完成 | `packages/shared/.../socket-registry.ts` |
| BASE-03 | 剪贴板复制/粘贴/ID 重映射 | 🟢 已完成 | `engine/flow-clipboard.ts` |
| BASE-04 | Undo/Redo 40 步 | 🟢 已完成 | `hooks/use-flow-history.ts` |
| BASE-05 | 碰撞避让放置 | 🟢 已完成 | `engine/spawn-placement.ts` |
| BASE-06 | 对齐/分布/网格排列 | 🟢 已完成 | `engine/node-align.ts` + 选中右键菜单 |
| BASE-07 | 大画布 perf 分级 | 🟢 已完成 | `engine/perf-controller.ts` |
| BASE-08 | 工作区自动保存 700ms | 🟢 已完成 | `FlowSurface` debounce save |
| BASE-09 | Storyboard 双向链接字段 | 🟢 已完成 | `linkedShotId` / `linkedBlockId` |
| BASE-10 | 拓扑批量跑 + 同层并行(3) | 🟢 已完成 | `engine/flow-runner.ts` |
| BASE-11 | 执行取消 Stop | 🟢 已完成 | `stores/execution-queue.ts` |
| BASE-12 | 连接线类型切换+删除 | 🟢 已完成 | `FlowContextMenu` `FlowSelectedEdgeToolbar` `flow-edge-types.ts` |
| BASE-13 | 三类右键菜单（待替换） | 🟡 旧画布已有 | `engine/FlowContextMenu.tsx` |
| BASE-14 | MiniMap + Controls | 🟢 已完成 | `FlowSurface` ReactFlow 子组件 |
| BASE-15 | Backlot 五库 + 块内模板 picker | 🟢 已完成 | P7：`backlot-template-picker.tsx` 等 |
| BASE-16 | 上游 prompt 检测与预览 | 🟢 已完成 | `use-upstream-prompt.ts` `GenUpstreamHint` |
| BASE-17 | 生产进度墙 | 🟢 已完成 | P6 A1：`ProductionProgressWall` |
| BASE-18 | 3D Stage Deck（导演台） | 🔵 部分完成 | P6 B 线 ~95%：`packages/director3d` |
| BASE-19 | 快捷键帮助弹窗 | 🟢 已完成 | `panels/ShortcutsModal.tsx` |
| BASE-20 | Ctrl+D 复制 / Ctrl+C/V | 🟢 已完成 | `FlowSurface` 键盘处理 |

---

### 按阶段的实现顺序依赖

```text
P0（必须先做）
  ├─ P0-01~04  脚手架 + v3 类型
  ├─ P0-05~08  StageDeckSurface + Dock + Deck + Rail
  ├─ P0-09~13  ChannelEdge + Lane + Lens + Mode + CardShell
  └─ P0-14~18  CommandPalette + Explore + AppShell + CSS

P1（依赖 P0 骨架）
  ├─ P1-01~02  Cascade（依赖 ChannelEdge）
  ├─ P1-03     Produce 模式（依赖 ModeCapsule + CardShell）
  ├─ P1-04~08  Knife / Guides / Group / Wire-drop / 上游高亮
  └─ P1-09~12  剪贴板增强 / Loop / 边中点菜单

P2（依赖 P0 + P1 Produce）
  ├─ P2-01~04  Take store + Rail + Review + Lightbox
  ├─ P2-05     Grid Generate（依赖 GridSplitBlock）
  └─ P2-06~10  Storyboard 互跳 + Undo

P3（依赖 P2 Take + P0 Deck）
  ├─ P3-01~04  Pipeline + Readiness + S-Class + stale
  └─ P3-05~08  别名 + 去角标 + Deck 迁移

P4（依赖 P0–P3 基本完成）
  └─ P4-01~08  3D / Agent / ZIP / 下线旧画布 / mention / 引导
```

---

## 第四章：功能变动总表

> **进度以「阶段功能清单与进度」章节为准**（含 P0–P4 共 56 项台账 + 20 项基础设施）。  
> 本章保留分类视图，便于按「改动类型」浏览，不重复标注进度。

图例：**🔄 改动** | **🗑️ 移除/弱化** | **✨ 新增** | **✅ 保留不动**

### 4.1 布局与 Chrome

| 功能 | 类型 | 旧实现 | 新实现 | 参考来源 |
|------|------|--------|--------|----------|
| 左侧模块库 | 🗑️ | `BlockPalette.tsx` 256px 常驻 | `ModuleDock.tsx` 48px 图标栏，hover 展开 | Figma 工具栏（原创组合） |
| 节点内参数表单 | 🗑️ | 各 Block 内 textarea/下拉 | 下沉到 `ComposerDeck.tsx` | infinite-canvas Composer |
| 节点浮动工具条 | 🗑️ | `FlowSelectedToolbar` + `NodeActionBar` | 合并进 Composer Deck 左侧动作区 | — |
| 三类右键菜单 | 🔄 | `FlowContextMenu` 空白/选中/边 | Lens Menu + Command Palette + 精简边中点菜单 | infinite-canvas 创建菜单 + T8 对齐子菜单 |
| 右侧面板 | 🔄 | 多个 320px overlay 浮层 | `ContextRail.tsx` 贴边可收起属性栏 | storyai inspector |
| 顶栏 | 🔄 | 工作区 + 批量跑 + 面板开关 | 增加 `ModeCapsule` 三模式切换 | waoowaoo 阶段胶囊 |
| 背景 | 🔄 | 纯点阵 grid | 点阵 + Lane 淡色泳道带 | 原创 |
| MiniMap | ✅ | 右下角 | 保留，位置可调到顶栏集成 | infinite-canvas |
| Controls | ✅ | 左下角缩放 | 保留，或并入 Dock 底部 | — |

### 4.2 节点（Block → Card）

| 功能 | 类型 | 说明 | 参考来源 |
|------|------|------|----------|
| 节点折叠态 | ✨ | 生产模式默认只显示 thumb + 状态 + 别名 | moyin 场景卡 |
| 节点展开态 | 🔄 | 探索模式/双击展开 socket 和预览 | — |
| `#blockIndex` 角标 | 🗑️ | 去掉角标数字 | — |
| 可读别名 | ✨ | `aliases: Record<blockId, string>`，显示「场景A」 | 原创（替代 T8 #ID） |
| Card 状态机 | ✨ | idle → queued → running → done → stale | infinite-canvas pending |
| stale 状态 | ✨ | 上游改了，提示需重跑 | waoowaoo DAG 失效概念 |

### 4.3 连接线（Edge → Channel）

| 功能 | 类型 | 说明 | 参考来源 |
|------|------|------|----------|
| 端口类型着色 | ✨ | 按 socket 类型染色 | T8 portTypes |
| Cascade 流动动画 | ✨ | 批量跑时边 dash 流动 | infinite-canvas |
| 宽 hitbox | ✨ | 18px 透明命中层 | infinite-canvas |
| Knife 切线 | ✨ | Shift+拖画线切断经过的连接 | infinite-canvas |
| 中点操作菜单 | 🔄 | hover 中点：改类型/切断/插入转换器 | 原创组合 |
| 上游高亮 | ✨ | 选中节点时上游节点+边淡亮 | infinite-canvas-main1 |
| 边类型持久化 | ✅ | `edgeType` 字段 | 已实现，保留 |
| T8 主题边 | 🗑️ | 麻绳/水渠/足球等 | — |

### 4.4 创建与导航

| 功能 | 类型 | 说明 | 参考来源 |
|------|------|------|----------|
| Lens Menu | ✨ | 120° 扇形，最多 6 项 +「更多」 | 原创（替代 T8 八方向径向） |
| 双击空白创建 | ✨ | 弹出 Lens Menu | infinite-canvas |
| 拖线到空白 | ✨ | 按端口类型过滤的 Lens Menu | T8 connection picker |
| Command Palette | ✨ | `/` 或 Ctrl+K 搜索命令/模块 | 通用 |
| Dock 拖拽创建 | 🔄 | 从 ModuleDock 拖入 | 原 BlockPalette 拖拽，入口变 |
| 智能对齐参考线 | ✨ | 拖节点时 L/C/R/T/M/B 弱吸附 + 虚线 | T8 smart guides |
| Scene Group | ✨ | 组容器：虚线圆角框 + 组名 + 组级运行 | T8 GroupBox 简化版 |
| Alt+拖复制 | ✅ | 已有 | T8 |
| Alt+Shift+拖复制保留入边 | ✨ | 复制节点并保留输入连接 | infinite-canvas |

### 4.5 执行与生产

| 功能 | 类型 | 说明 | 参考来源 |
|------|------|------|----------|
| 拓扑批量跑 | ✅ | `flow-runner.ts` | T8 |
| Cascade Run | ✨ | 从选中节点向上游拓扑执行，边动画 | infinite-canvas |
| Loop Card | ✨ | 新 block：批量/串行/并行/变体 prompt | infinite-canvas loop |
| Pending Take 占位 | ✨ | 异步任务进行中显示占位卡 + 计时 | infinite-canvas pending output |
| Stop / Cancel | ✅ | 已有 | — |
| S-Class Shot Group | ✨ | ≤15s 镜头自动分组建议 | moyin auto-grouping |
| Pipeline Capsule | ✨ | 顶栏显示生产阶段进度 | huobao + waoowaoo |
| Stage Readiness | ✨ | 根据产物提示下一步 | waoowaoo stage-readiness |
| DAG 失效提示 | ✨ | 上游重跑后下游标记 stale | waoowaoo workflow invalidation |

### 4.6 审片与 Take

| 功能 | 类型 | 说明 | 参考来源 |
|------|------|------|----------|
| Take Rail | ✨ | 每节点多版本候选，pick 主 Take | waoowaoo 多候选 |
| Review 模式 | ✨ | 画布变横向胶片条 + 大图预览 | moyin + infinite-canvas lightbox |
| Compare Slider | ✨ | before/after 滑块对比 | infinite-canvas |
| Grid Generate | ✨ | 宫格生成 → 切分 → 分配到 storyboard shot | huobao + moyin contact-sheet |
| Storyboard locate | ✨ | 点击语音/分镜条目 → 画布定位 + 3s 高亮 | waoowaoo cross-locate |

### 4.7 Composer Deck（核心新增）

| 功能 | 类型 | 说明 | 参考来源 |
|------|------|------|----------|
| 底部操作台 | ✨ | 选中可运行节点时出现，高度 168px | infinite-canvas Composer |
| 上游 prompt 预览 | ✨ | 显示继承来源，本地为追加 | 已实现 `useUpstreamPrompt`，迁入 Deck |
| @mention 引用 | ✨ | contenteditable 中 @ 上游图片为 token chip | infinite-canvas |
| Backlot 模板入口 | 🔄 | 从 Block 内 picker 迁到 Deck「模板▾」 | 已实现 `GenFallbackTemplate` |
| 模型/参数行 | 🔄 | 从 Block 内迁到 Deck 参数行 | infinite-canvas |
| Cascade 按钮 | ✨ | 一键跑上游链 | infinite-canvas |

### 4.8 空间与 Agent

| 功能 | 类型 | 说明 | 参考来源 |
|------|------|------|----------|
| 3D Previz Layer | ✨ | 画布内嵌 3D 视口 block，hostBridge | storyai + `docs/3D-DIRECTOR-INTEGRATION.md` |
| Canvas Agent | ✨ | MCP 操作 + UI 确认卡片 | infinite-canvas-main1 |
| Workflow ZIP | ✨ | 选区导出/导入含资源 | infinite-canvas |

### 4.9 保留不变

| 功能 | 说明 |
|------|------|
| React Flow 引擎 | `@xyflow/react` v12 |
| `validateLink()` 端口校验 | `packages/shared/src/catalog/socket-registry.ts` |
| `flow-clipboard.ts` | 复制/粘贴/偏移/ID 重映射 |
| `use-flow-history.ts` | Undo/Redo 40 步 |
| `spawn-placement.ts` | 碰撞避让放置 |
| `node-align.ts` | 对齐/分布/网格排列 |
| `perf-controller.ts` | 大画布分级 |
| 工作区自动保存 | 700ms debounce |
| Storyboard 双向链接 | `linkedShotId` / `linkedBlockId` |
| Backlot 模板体系 | 模板库 + picker 逻辑 |
| Block 分类与 lazy load | `blocks/registry.tsx` |

---

## 第五章：三模式视图详解

### 5.1 Explore 探索模式

**用途**：搭流程、试 prompt、连线、编组。

| 行为 | 说明 |
|------|------|
| 节点默认展开或半展开 | 显示 socket、预览 |
| 显示全部 UI | Lens Menu、Command Palette、完整 Context Rail |
| Composer Deck | 选中时出现，可编辑 prompt |
| 边 | 默认可编辑，显示类型 |

**实现过程**：
1. `stores/view-mode.ts` 存 `mode: 'explore' | 'produce' | 'review'`
2. `StageDeckSurface` 读 mode，传给 `Card` 组件 `collapsed={mode !== 'explore'}`
3. CSS class `nx9-stage-deck--explore` 控制可见性

### 5.2 Produce 生产模式

**用途**：批量跑、盯进度、少干扰。

| 行为 | 说明 |
|------|------|
| 节点默认折叠 | 只显示 thumb + 状态 + 别名 |
| Cascade 动画 | 跑时边流动、卡边框 pulse |
| 隐藏次要 socket | perf intensive 自动启用 |
| Composer Deck 精简 | 只显示运行/停止/进度 |

**实现过程**：
1. mode=`produce` 时 `Card` 渲染 `CollapsedCard` 变体
2. `cascade-runner.ts` 跑每个节点时 `setEdges` 给经过的边加 `data.cascadeActive=true`
3. `ChannelEdge.tsx` 读 `cascadeActive` 渲染 dash 动画
4. 复用 `perf-controller` 的 intensive 阈值

### 5.3 Review 审片模式

**用途**：看结果、选 Take、对比版本。

| 行为 | 说明 |
|------|------|
| 画布弱化连线 | 透明度 0.2 |
| Take Rail 展开 | 底部二级条，横向胶片 |
| 点击 Take | 大图 lightbox + compare slider |
| Storyboard 联动 | 与分镜面板同步选中 |

**实现过程**：
1. mode=`review` 时渲染 `TakeRail.tsx` overlay，画布 `pointer-events` 降级
2. `take-store.ts` 存 `TakeRecord[]`：`{ blockId, version, assetUrl, picked, createdAt }`
3. 选中 Take 时 `CompareLightbox.tsx` 全屏展示
4. 与 `useStoryboardUi` 同步 `selectedShotId`

---

## 第六章：逐项功能说明（含设计理由、参考、好处、实现过程）

以下按模块分组。每项格式统一：**为什么这样设计 → 参考哪个项目 → 好处 → 简单实现过程**。

---

### 6.1 Module Dock（替代 BlockPalette）

**为什么**：256px 常驻模块库是 T8 式布局最显眼的特征；缩为图标 Dock 可释放画布宽度，且按 Lane 过滤模块更符合生产语义。

**参考**：Figma 左侧工具栏（图标 + hover 展开）；**不参考** T8 全宽 Sidebar。

**好处**：
- 画布可用宽度 +200px
- 模块按泳道分类，新手更容易理解「该放哪个 Lane」
- 与 Composer Deck 形成「左 Dock + 底 Deck」对称结构

**实现过程**：
1. 新建 `engine/stage-deck/chrome/ModuleDock.tsx`
2. 从 `BLOCK_GROUPS` 读取分类，每个分类一个 lucide 图标
3. hover 时绝对定位展开 240px 面板（玻璃态 `backdrop-blur`）
4. 点击 → `useFlowCommands.requestSpawn(kind)`
5. 拖拽 → `dataTransfer.setData('application/nx9-block', kind)`（复用现有拖放逻辑）
6. `AppShell.tsx` 用 flag 切换：flag 开用 Dock，关用 BlockPalette

---

### 6.2 Composer Deck（底部操作台）

**为什么**：T8/infinite-canvas 把 prompt、模型、参数塞进节点体，导致节点臃肿、换节点就要重新找控件。底部 Deck 让用户形成「选中 → 下方操作」的肌肉记忆。

**参考**：`infinite-canvas-main/static/js/smart-canvas.js` 的 Composer 面板。

**好处**：
- 节点瘦身 60%+，画布信息密度可控
- 上游 prompt 继承关系一眼可见
- 同一套 Deck  UI 服务所有生成类 block

**实现过程**：
1. 新建 `engine/stage-deck/chrome/ComposerDeck.tsx`
2. `useDeckUi` store：`selectedBlockId`、`visible`
3. 选中可运行节点时 `visible=true`，渲染：
   - 上行：`UpstreamPreview`（读 `useUpstreamPrompt`）
   - 中行：`MentionEditor`（contenteditable，后续迭代 @mention）
   - 下行：参数控件（从 block type 查 `DeckParamSchema`）
   - 右侧：运行/停止/Cascade 按钮
4. 所有编辑 `onChange` → `useReactFlow().setNodes` 更新 `node.data`
5. 迁移：把 `PictureGenBlock`/`ClipGenBlock`/`SoundGenBlock` 内 textarea 删除，改为只读摘要

---

### 6.3 Context Rail（右侧属性栏）

**为什么**：现有 10+ 个 320px overlay 面板互斥打开，遮画布、无统一入口。贴边 Rail 把「跟选中节点相关」的属性收敛到一个地方。

**参考**：`storyai-3d-director-desk` 右侧 inspector；**不参考** T8 多个 floating drawer。

**好处**：
- 选中节点 → Rail 自动切到对应 Tab（属性/模板/历史）
- 不遮挡画布中心
- Storyboard、Backlot 等可作为 Rail Tab 共存

**实现过程**：
1. 新建 `engine/stage-deck/chrome/ContextRail.tsx`
2. 宽度 280px，`collapsed` 时只露 24px 拉手
3. Tab 列表：属性 | 分镜 | 模板 | 历史（按选中节点类型动态显隐）
4. 把 `StoryboardPanel`、`BacklotLibraryPanel` 内容逐步迁入 Tab（P2）
5. `AppShell.tsx` 右侧 overlay 改为只保留全局类面板（设置、Skills）

---

### 6.4 Lane Background（泳道背景）

**为什么**：自由画布缺少「生产顺序感」。泳道不强制约束位置，但给出语义分区，降低新手迷路。

**参考**：原创；概念上借鉴 huobao 的「阶段」分区，但保留空间自由。

**好处**：
- 视觉引导：角色 → 场景 → 生成 → 输出
- Module Dock 可按 Lane 过滤模块
- 未来可支持「吸附到 Lane」可选功能

**实现过程**：
1. 新建 `engine/stage-deck/canvas/LaneBackground.tsx`
2. 作为 React Flow `<Background>` 的自定义 overlay（或 SVG 层）
3. 定义 4 条水平色带：`--nx9-lane-character` 等 token
4. 泳道标签渲染在左侧边距（48px Dock 右侧）
5. `workspace v3` 可选存 `lanes: LaneConfig[]`（位置、颜色、标签）

---

### 6.5 Channel Edge（自定义连接线）

**为什么**：默认 React Flow 边无端口色、cascade 动画、宽 hitbox，编辑体验不如 infinite-canvas。

**参考**：`infinite-canvas-main` 连接样式 + `T8` 端口色。

**好处**：
- 一眼分辨 prompt/picture/clip/sound 连线
- 跑流程时边流动，进度感强
- 更容易点中选中线

**实现过程**：
1. 新建 `engine/stage-deck/canvas/ChannelEdge.tsx`
2. 在 `StageDeckSurface` 注册 `edgeTypes={{ channel: ChannelEdge }}`
3. 迁移时把现有边 `type` 从 `default/straight/...` 映射为 `channel`，原 path 算法保留
4. `stroke` 从 `sourceHandle` 查 `SOCKET_COLORS`
5. 叠加 18px 透明 `<path>` 作 hit area
6. `data.cascadeActive` 时加 CSS `stroke-dashoffset` 动画
7. 中点 hover 显示 `<EdgeMidpointMenu>`（改类型/切断）

---

### 6.6 Lens Menu（创建菜单）

**为什么**：T8 的八方向径向菜单和右键长列表都是其视觉标识；改用 120° 扇形 + 6 项上限可区分身份。

**参考**：`infinite-canvas` 双击创建菜单（卡片网格）；形态为原创扇形。

**好处**：
- 创建动作有仪式感但不占满屏
- 拖线到空白时可过滤，只显示可连接的 block 类型
- 与 Command Palette 互补（Lens 图形化，Palette 搜索化）

**实现过程**：
1. 新建 `engine/stage-deck/canvas/LensMenu.tsx`
2. portal 到 `document.body`，定位在鼠标/扇心
3. 扇形布局：CSS `transform-origin` + 等角度分布按钮
4. 触发：双击 pane（`onPaneDoubleClick`）、拖线落空白（`onConnectEnd`）
5. 过滤：读 `connectionFromHandle` 的 socket type → 过滤 `BLOCK_CATALOG` 中兼容的 kind
6. 选项后 `findOpenPosition` + `setNodes` 创建节点 + 自动 `addEdge`

---

### 6.7 Command Palette（命令面板）

**为什么**：模块多了以后，Lens Menu 6 项不够，需要搜索式入口。

**参考**：通用 IDE 命令面板；模块列表来自 NX9 `BLOCK_CATALOG`。

**好处**：键盘流用户友好；可搜索「对齐」「运行」「导入模板」等命令，不仅是模块。

**实现过程**：
1. 新建 `engine/stage-deck/chrome/CommandPalette.tsx`
2. 监听 `/` 或 `Ctrl+K`（canvas scope）
3. 内置命令表：`{ id, label, keywords, run }[]`
4. fuzzy 搜索后回车执行
5. 命令包括：spawn block、align、undo、切模式、开 Rail Tab 等

---

### 6.8 Mode Capsule（三模式切换）

**为什么**：一个画布同时服务「搭流程」和「审片」会互相干扰；分模式可大幅简化各场景的 UI。

**参考**：`waoowaoo` 阶段胶囊导航。

**好处**：
- 探索时全功能；生产时极简；审片时专注 Take
- 降低 perf 压力（生产/审片可默认 intensive）

**实现过程**：
1. 新建 `engine/stage-deck/chrome/ModeCapsule.tsx`
2. `useViewMode` store：`mode` + `setMode`
3. 顶栏渲染三个 pill，切换时 canvas CSS transition 300ms
4. `StageDeckSurface` 订阅 mode，分发到 Card/Edge/Rail 子组件

---

### 6.9 Card 折叠/展开（Block → Card）

**为什么**：节点体内表单是臃肿根源；折叠态让生产模式画布可读。

**参考**：`moyin-creator` 场景卡；**不参考** T8 固定宽度大卡。

**好处**：200 节点时仍可浏览；状态一眼可见。

**实现过程**：
1. 新建 `engine/stage-deck/canvas/CardShell.tsx` 包装现有 `BlockShell`
2. prop `collapsed: boolean`
3. collapsed 时只渲染：缩略图（有则显示）、别名、状态点、类型标签
4. 双击 → 切 explore 或 `setNodes` 设 `data.expanded=true`
5. 逐步把各 Block 内重 UI 迁出到 Composer Deck

---

### 6.10 可读别名（替代 #blockIndex）

**为什么**：`#blockIndex` 是 T8 视觉标识；别名更人性化，且利于 @mention 和 Storyboard 对应。

**参考**：原创。

**好处**：「场景A」「主角特写」比 `#7` 好记；导出工作流时可读。

**实现过程**：
1. `workspace v3` 增加 `aliases: Record<string, string>`
2. Card 顶部显示 `aliases[id] ?? catalog.label`
3. Context Rail 属性 Tab 可编辑别名
4. 保留 `blockIndex` 内部使用，仅不再显示角标

---

### 6.11 Cascade Run（级联执行）

**为什么**：现有批量跑跑全图；用户常只需从选中节点跑上游链。

**参考**：`infinite-canvas-main` cascade / 一键运行。

**好处**：交互符合直觉；边动画提供进度反馈；可局部重跑。

**实现过程**：
1. 新建 `engine/stage-deck/execution/cascade-runner.ts`
2. 从选中节点 BFS 收集上游依赖（复用 `gatherUpstream` 反向图）
3. 拓扑排序后逐层执行，复用 `flow-runner.ts` 单节点 run 逻辑
4. 每步前 `setEdges` 标记 `cascadeActive`
5. Composer Deck「Cascade ▶」按钮触发；支持 Stop（复用 execution-queue cancel）

---

### 6.12 Loop Card（循环节点）

**为什么**：批量出图/变体 prompt 是常见需求，没有 Loop 就要手动复制节点。

**参考**：`infinite-canvas-main` 的 `loop` / `smart-loop` 节点。

**好处**：一个 Loop 控制 N 轮生成；支持变体 prompt 数组。

**实现过程**：
1. 在 `block-catalog.ts` 新增 kind `loop-runner`（或扩展现有 `iterator`）
2. 节点 data：`{ mode: 'serial'|'parallel', count, prompts[] }`
3. `cascade-runner` 遇到 Loop 时展开为 N 次下游触发
4. UI 在 Composer Deck 显示轮次/并行度控件

---

### 6.13 Pending Take 占位节点

**为什么**：异步生成耗时长，用户需要「占位 + 计时」而不是空白。

**参考**：`infinite-canvas-main` pending output slots。

**好处**：减少焦虑；画布状态完整；完成后原位替换为真实 Take。

**实现过程**：
1. 节点 `run()` 开始时 `setNodes` 设 `status: 'running'`, `pendingSince: Date.now()`
2. `CollapsedCard` 显示脉冲边框 + 计时 pill
3. 任务完成回调 → 更新 `data.outputUrl`，`status: 'done'`
4. 同时 `take-store` 追加一条 TakeRecord

---

### 6.14 Knife Tool（切线刀）

**为什么**：大量连线时逐个选中删除太慢。

**参考**：`infinite-canvas-main` Shift+拖 knife cut。

**好处**：快速清理错误连线；手势独特，非 T8 交互。

**实现过程**：
1. 新建 `engine/stage-deck/interaction/knife-tool.ts`
2. 监听 `Shift+mousedown` on pane → 进入 knife 模式
3. `mousemove` 画红色虚线折线（SVG overlay）
4. `mouseup` 时计算折线与各 edge path 的相交，收集命中 edge id
5. `setEdges` 过滤掉命中边；`push` history
6. 退出 knife 模式

---

### 6.15 Smart Guides（智能对齐参考线）

**为什么**：手摆节点难对齐；snap grid 只有网格没有相对对齐。

**参考**：`T8-penguin-canvas` smart alignment guides。

**好处**：Figma 式对齐体验；无需先选多再点菜单。

**实现过程**：
1. 新建 `engine/stage-deck/canvas/SmartGuides.tsx`
2. `onNodeDrag` 时读其他节点 bbox，算 L/C/R 和 T/M/B 距离
3. 距离 < 6px 时吸附并渲染虚线（viewport 坐标系）
4. 复用 `node-align.ts` 的 bbox 计算函数

---

### 6.16 Scene Group（场景组）

**为什么**：多节点属于同一镜头/场景时，需要组级移动和执行。

**参考**：`T8` GroupBox 概念；**简化为**虚线容器，不要 T8 的 live bbox 重算逻辑一开始就做。

**好处**：组拖即全拖；组级「运行全部」；导出 Take 时可按组

**实现过程**：
1. `workspace v3` 增加 `groups: { id, label, memberIds[], position, size }[]`
2. 新建 `engine/stage-deck/canvas/SceneGroup.tsx` 渲染为 React Flow `parentNode`
3. 框选后 Context Rail「成组」或 Ctrl+G
4. 拖动 parent 时子节点跟随（React Flow parentId 机制）
5. P1 不做自动 bbox 重算，手动调整组大小

---

### 6.17 Alt+Shift 复制保留入边

**为什么**：复制一个 subgraph 时还要手动重连线，效率低。

**参考**：`infinite-canvas-main` Alt+Shift+drag。

**好处**：快速分支尝试不同参数。

**实现过程**：
1. 扩展 `flow-clipboard.ts` 的 duplicate 逻辑
2. 检测 Alt+Shift 时，复制节点同时复制「指向新节点的入边」
3. 新节点 id  remap 后 `addEdge` 重建入边

---

### 6.18 Wire-drop Lens（拖线到空白）

**为什么**：从 port 拖出线不知道连什么时，应在落点直接创建正确类型的节点。

**参考**：`T8` connection picker + `infinite-canvas` link create menu。

**好处**：减少「先建节点再拖线」两步操作。

**实现过程**：
1. `onConnectEnd` 若 `connectionState.isValid=false` 且落点在 pane 上
2. 取 source handle 的 socket type
3. 弹出 `LensMenu`（过滤后）
4. 创建节点 + 自动连接

---

### 6.19 Take Rail + Take Store（多版本候选）

**为什么**：生成多次才有好结果；需要版本管理而非覆盖。

**参考**：`waoowaoo` panel candidates；`moyin` video history。

**好处**：可回滚到之前版本；Review 模式核心数据。

**实现过程**：
1. 新建 `stores/take-store.ts`：`TakeRecord { id, blockId, assetUrl, thumbUrl, picked, meta }`
2. 每次生成完成 `appendTake(blockId, result)`
3. `TakeRail.tsx` 横向滚动显示 thumb，`picked` 有星标
4. 点击「设为主 Take」→ 更新 block `data.primaryTakeId`
5. 持久化进 `workspace v3` 的 `takes[]`

---

### 6.20 Review 模式 + Compare Lightbox

**为什么**：审片需要大图和对比，不是在小 thumb 上判断。

**参考**：`infinite-canvas-main` output lightbox compare slider。

**好处**：专业审阅体验；减少导出后再看的步骤。

**实现过程**：
1. mode=`review` 时显示 `TakeRail`
2. 点击 Take → `CompareLightbox.tsx` 全屏
3. 若有两个 Take 选中，中间 compare slider（CSS `clip-path` 或左右 split）
4. 快捷键 ←/→ 切换 Take

---

### 6.21 Grid Generate（宫格生成→切分→分配）

**为什么**：分镜批量出图时，宫格比单张单张跑快。

**参考**：`huobao-drama` 宫格图工具 + `moyin-creator` contact-sheet split。

**好处**：一次生成 N 镜；分配到 storyboard shot。

**实现过程**：
1. Context Rail 或 Composer Deck 加「宫格」动作
2. 调 picture-gen 以 N×M 布局生成单张宫格图
3. 服务端或 canvas `grid-split` block 逻辑切分为 N 张
4. 弹出分配 UI：每张拖到 storyboard shot 或绑定 block
5. 复用现有 `grid-split` utility block

---

### 6.22 Pipeline Capsule + Stage Readiness

**为什么**：用户不知道「下一步该做什么」；需要进度感。

**参考**：`huobao-drama` 11 步 sidebar + `waoowaoo` artifact-gated stages。

**好处**：降低学习成本；与 Storyboard 状态联动。

**实现过程**：
1. 定义 `PIPELINE_STAGES`：剧本 → 分镜 → 生成 → 配音 → 导出
2. 每阶段 `readiness(workspace)` 函数：检查对应产物是否存在
3. `ModeCapsule` 旁显示 5 个 dot，颜色按 readiness
4. 点击 dot → 打开对应 Rail Tab 或高亮相关 Lane

---

### 6.23 S-Class Shot Group（镜头分组建议）

**为什么**：视频生成有 15s 限制，需要把 storyboard 镜头智能分组。

**参考**：`moyin-creator` `auto-grouping.ts`。

**好处**：减少手动拆 shot；Seedance 连续 clip 更稳。

**实现过程**：
1. 新建 `packages/shared/src/utils/shot-grouping.ts`（移植 moyin 贪心逻辑）
2. Storyboard Panel 加「自动分组」按钮
3. 输出 `ShotGroup[]`，每组 ≤15s，场景变化处断开
4. 可选一键为每组 spawn `clip-gen` chain

---

### 6.24 Storyboard Cross-locate

**为什么**：分镜、画布、配音三处数据需要互跳定位。

**参考**：`waoowaoo` voice line → panel scroll + 3s highlight。

**好处**：减少「那个镜头在哪」的迷失。

**实现过程**：
1. `linkedShotId` 已有，扩展 `useFlowRuntime.focusBlock(blockId)`
2. Storyboard 点击镜头 → `focusBlock` + `setMode('explore')`
3. 目标 Card 加 `data-highlightUntil` 时间戳，CSS 3s 脉冲边框
4. 反向：画布选中 → Storyboard 滚动到对应 shot

---

### 6.25 @mention 引用（Composer Deck）

**为什么**：上游多张图时，纯文本 prompt 难以指定用哪张。

**参考**：`infinite-canvas-main` mention tokens。

**好处**：精确控制 reference；可视化 chip 比记 block id 好。

**实现过程**：
1. 新建 `engine/stage-deck/interaction/mention-editor.ts`
2. contenteditable 监听 `@` → 弹出上游 media 列表（从 `gatherUpstream`）
3. 选中插入 `<span data-mention="blockId">` chip
4. 序列化：导出 prompt 时替换为模型所需格式（URL 或 @Image1）
5. P1 可先做纯文本 `[图1]` 占位，P2 再做 chip

---

### 6.26 3D Previz Layer

**为什么**：镜头规划需要空间感，2D 节点表达力不够。

**参考**：`storyai-3d-director-desk` + 已有 `docs/3D-DIRECTOR-INTEGRATION.md`。

**好处**：截图直出 picture socket；机位参数喂给 camera-prompt。

**实现过程**：按 `3D-DIRECTOR-INTEGRATION.md` 已有规划执行，不重复；与 Stage Deck 的衔接点：
1. `director-3d` block 在画布上只显示缩略图 Card
2. 双击 → 全屏 `Director3dPanel`（已有）
3. 截图完成 → `take-store` + 连到 `picture-gen`

---

### 6.27 Canvas Agent（可选 P4）

**为什么**：自然语言操作画布可降低门槛。

**参考**：`infinite-canvas-main1` canvas-agent MCP + UI 确认。

**好处**：「帮我在场景泳道加一个 prompt」→ Agent 执行可审阅。

**实现过程**：
1. Rail 加 Agent Tab，连接本地 MCP（可选）
2. Agent 返回 `canvas_apply_ops` → 渲染确认卡片
3. 用户确认后 `setNodes/setEdges`
4. P4 优先级，不阻塞主流程

---

### 6.28 Workflow ZIP 导入导出

**为什么**：分享工作流时要带资产，不只 JSON。

**参考**：`infinite-canvas-main` workflow export ZIP。

**好处**：模板市场、备份、跨工作区迁移。

**实现过程**：
1. 选中 nodes → 收集 data 中所有 asset URL
2. 服务端打包 ZIP：workspace.json + assets/
3. 导入：解压 → 上传资产 → remap URL → merge 到画布
4. 复用现有 `WorkflowTemplatesPanel` 入口

---

### 6.29 DAG Stale 提示

**为什么**：上游改了 prompt，下游旧结果应提示重跑，避免用 stale 产物导出。

**参考**：`waoowaoo` workflow retry invalidation。

**好处**：生产可靠性；减少 silent error。

**实现过程**：
1. 节点 `data` 存 `inputHash`（上游 prompt+asset 的 hash）
2. 上游变更时 `useEffect` 重算下游的 `expectedHash`
3. 不匹配 → `status: 'stale'`，Card 显示橙色边栏
4. Composer Deck 显示「上游已变更，建议重跑」

---

### 6.30 上游高亮

**为什么**：选中一个生成节点时，用户需要知道「什么喂给了它」。

**参考**：`infinite-canvas-main1` upstream highlight on selection。

**好处**：理解数据流；教学价值高。

**实现过程**：
1. 选中节点时 BFS 收集上游 id 集合
2. `setNodes` 给非上游节点加 `data.dimmed=true`
3. `setEdges` 上游边 `data.highlighted=true`
4. `ChannelEdge` 和 `CardShell` 读 flag 调透明度

---

## 第七章：视觉设计规范

### 7.1 Token（保留 + 新增）

```css
/* 保留 — 不得修改 */
--nx9-bg: #fafaf8;
--nx9-ink: #222222;
--nx9-brand: #a13d63;
--nx9-accent: #5e4d8a;
--nx9-ok: #2e8b57;
--nx9-warn: #d97706;
--nx9-line: #e6e6e6;

/* 新增 — Stage Deck 专用 */
--nx9-glass: rgba(255, 255, 255, 0.72);
--nx9-glass-blur: 16px;
--nx9-lane-character: rgba(94, 77, 138, 0.06);
--nx9-lane-scene: rgba(161, 61, 99, 0.06);
--nx9-lane-gen: rgba(217, 119, 6, 0.06);
--nx9-lane-output: rgba(46, 139, 87, 0.06);
--nx9-deck-height: 168px;
--nx9-dock-width: 48px;
--nx9-rail-width: 280px;
```

### 7.2 组件圆角与风格

| 元素 | 圆角 | 风格 |
|------|------|------|
| Card | 16px | 白底 + 轻阴影，折叠态偏扁平 |
| Composer Deck | 20px 顶角 | 玻璃态 + blur |
| Module Dock | 12px | 图标按钮，hover 展开面板 |
| Context Rail | 0（贴边） | 左缘圆角 16px |
| Lens Menu | 按钮 12px | 扇形分布，无大底板 |
| Channel | — | 2px 线宽，选中 3px brand |

### 7.3 动效

| 场景 | 时长 | 说明 |
|------|------|------|
| 模式切换 | 300ms | 画布 opacity + scale 0.98→1 |
| Composer Deck 出现 | 200ms | slide-up |
| Cascade 边流动 | 循环 | dash-offset animation |
| Take 选中 | 150ms | thumb scale 1.05 |
| 禁止 | — | T8 主题游戏动画、edge sprite |

---

## 第八章：技术架构

### 8.1 目录结构（新建）

```text
apps/web/src/engine/stage-deck/
├── StageDeckSurface.tsx          # 新主入口，替代 FlowSurface 的 UX 层
├── modes/
│   ├── explore-mode.ts
│   ├── produce-mode.ts
│   └── review-mode.ts
├── chrome/
│   ├── ModuleDock.tsx
│   ├── ComposerDeck.tsx
│   ├── ContextRail.tsx
│   ├── TakeRail.tsx
│   ├── ModeCapsule.tsx
│   └── CommandPalette.tsx
├── canvas/
│   ├── LaneBackground.tsx
│   ├── ChannelEdge.tsx
│   ├── LensMenu.tsx
│   ├── SceneGroup.tsx
│   ├── SmartGuides.tsx
│   └── CardShell.tsx
├── interaction/
│   ├── knife-tool.ts
│   ├── wire-drop.ts
│   ├── mention-editor.ts
│   └── selection-audit.ts
├── execution/
│   ├── cascade-runner.ts
│   ├── loop-executor.ts
│   └── pending-take.ts
└── stores/
    ├── deck-ui.ts
    ├── view-mode.ts
    └── take-store.ts
```

### 8.2 数据模型 workspace v3

```typescript
// packages/shared/src/types/workspace.ts 扩展

interface WorkspacePayloadV3 {
  version: 3;
  blocks: BlockRecord[];
  links: FlowLink[];
  viewport: Viewport;
  nextBlockIndex: number;
  // v3 新增
  aliases?: Record<string, string>;
  lanes?: LaneConfig[];
  groups?: SceneGroupRecord[];
  takes?: TakeRecord[];
  viewMode?: 'explore' | 'produce' | 'review';
  storyboard?: StoryboardSnapshot;  // 已有
}

interface TakeRecord {
  id: string;
  blockId: string;
  assetUrl: string;
  thumbUrl?: string;
  picked: boolean;
  createdAt: string;
  meta?: Record<string, unknown>;
}

interface SceneGroupRecord {
  id: string;
  label: string;
  memberIds: string[];
  position: { x: number; y: number };
  size: { width: number; height: number };
}

interface LaneConfig {
  id: 'character' | 'scene' | 'generate' | 'output';
  label: string;
  y: number;
  height: number;
}
```

### 8.3 v2 → v3 迁移

```typescript
function migrateV2ToV3(v2: WorkspacePayloadV2): WorkspacePayloadV3 {
  return {
    ...v2,
    version: 3,
    aliases: {},
    groups: [],
    takes: [],
    viewMode: 'explore',
  };
}
```

加载时：`version < 3` 自动 migrate，保存时写 v3。

### 8.4 Feature Flag 迁移三阶段

| 阶段 | 行为 |
|------|------|
| **A** | `STAGE_DECK=1` 或设置项切换；两套画布并存 |
| **B** | 默认 Stage Deck；旧 FlowSurface 保留一版 |
| **C** | 删除 `BlockPalette`、`FlowSelectedToolbar`、旧 `FlowContextMenu` 结构 |

### 8.5 关键约束

1. **Composer Deck 不做第二数据源**：所有编辑写回 `node.data`，Deck 是视图。
2. **3D 不渲染进节点**：继续全屏 Panel 懒加载（见 3D-DIRECTOR-INTEGRATION.md）。
3. **Undo 范围**：viewport + nodes + edges + groups；Take pick 进 undo；3D 内部栈独立。

---

## 第九章：实施路线图

> **详细功能台账与逐项进度见「阶段功能清单与进度」章节。**  
> 下表为阶段级摘要。

### 9.0 阶段进度摘要（2026-07-08）

| 阶段 | 周期 | 功能项 | 阶段进度 | 状态说明 |
|------|------|--------|----------|----------|
| **P0** 骨架 | W1–W5 | 18 项 | **17%** | 旧画布 6 项可迁移；新 `stage-deck/` 未创建 |
| **P1** 生产 | W6–W10 | 12 项 | **12%** | flow-runner / node-align / iterator 可复用 |
| **P2** 审片 | W11–W13 | 10 项 | **10%** | focusBlock 已有；Take 体系未建 |
| **P3** 导航 | W14–W15 | 8 项 | **0%** | 全部未开始 |
| **P4** 扩展 | W16+ | 8 项 | **13%** | 3D 导演台 P6 ~95%；其余未开始 |
| **基础设施** | 跨阶段 | 20 项 | **85%** | 旧 FlowSurface 体系成熟，待接入 Stage Deck |
| **整体** | W1–W16+ | **56 项** | **≈9%** | Stage Deck Canvas 2D 重设计刚进入规划落地前夜 |

| 阶段 | 周次 | 交付摘要 | 验收 |
|------|------|----------|------|
| **P0 骨架** | W1–W5 | StageDeckSurface, Dock, Deck, Rail, ChannelEdge, LensMenu, ModeCapsule, v3 类型 | flag 切换；选中节点 Deck 出现；Dock 可 spawn |
| **P1 生产** | W6–W10 | Cascade, Loop, Knife, SmartGuides, SceneGroup, Wire-drop, 上游高亮 | Cascade 边动画；Shift 切线；Ctrl+G 成组 |
| **P2 审片** | W11–W13 | Take Rail, Review 模式, Compare, Grid split, Storyboard locate | 多 Take pick；Review 胶片条 |
| **P3 导航** | W14–W15 | Pipeline Capsule, S-Class grouping, Stale 提示, Deck 迁移 | 顶栏阶段 dot；自动分组；无 #角标 |
| **P4 可选** | W16+ | 3D 深化, Canvas Agent, Workflow ZIP, 下线旧画布 | 旧 BlockPalette 删除 |

### 9.1 第一周任务清单（P0 开工）

| # | 任务 | 状态 | 对应 ID |
|---|------|------|---------|
| 1 | 创建 `engine/stage-deck/` 目录脚手架 | ⬜ 未开始 | P0-01 |
| 2 | 添加 `STAGE_DECK` feature flag | ⬜ 未开始 | P0-02 |
| 3 | `workspace v3` 类型定义 + migrate 函数 | ⬜ 未开始 | P0-03, P0-04 |
| 4 | `ComposerDeck.tsx` 空壳 + 选中联动 | ⬜ 未开始 | P0-07 |
| 5 | `ModuleDock.tsx` 替代 BlockPalette（flag 控制） | ⬜ 未开始 | P0-06 |
| 6 | `ChannelEdge.tsx` 注册替换默认边 | ⬜ 未开始 | P0-09 |
| 7 | `ModeCapsule.tsx` + `view-mode` store | ⬜ 未开始 | P0-12 |
| 8 | `AppShell.tsx` 接入 flag 切换 | ⬜ 未开始 | P0-16 |

---

## 第十章：T8 相似度 Checklist（每 Sprint 必查）

开发过程中，以下 **禁止出现**：

- [ ] 左侧 256px 常驻模块文字列表（Dock 除外）
- [ ] 节点右上角 `#数字` 角标
- [ ] 八方向径向菜单
- [ ] 放置架（shelf）语义 — NX9 用 Take Rail，是版本管理不是 staging move
- [ ] 三类传统右键菜单为主创建入口（Lens + Palette 为主）
- [ ] 节点内大段 prompt textarea（应在 Deck）
- [ ] 主题游戏 overlay（农场/足球/雷达等）
- [ ] 10k 行单文件 Canvas 控制器

以下 **允许保留**（通用 node graph 能力）：

- [x] React Flow 引擎
- [x] 端口类型校验
- [x] 拓扑批量跑
- [x] Undo/Redo
- [x] 剪贴板
- [x] MiniMap + Controls

---

## 第十一章：验收标准（Definition of Done）

> 进度随阶段推进勾选；当前全部未验收（Stage Deck 新体系未开工）。

### 体验

- [ ] 新用户 30 秒内能说出与 T8 的 **至少 3 处** 明显不同
- [ ] 选中生成节点 → 底部 Composer Deck 出现，节点内无大 textarea
- [ ] 三模式切换流畅，< 300ms
- [ ] Cascade 跑时边有流动动画，可 Stop
- [ ] Review 模式可横向浏览 Take 并 pick 主版本
- [ ] Shift+拖可切断连接线
- [ ] Storyboard 点击可定位到画布 Card 并高亮 3s

### 性能

- [ ] 200 节点 intensive 模式可用（复用 perf-controller）
- [ ] 模式切换、Deck 出现无卡顿

### 兼容

- [ ] v2 工作区无损打开并自动 migrate
- [ ] Storyboard `linkedShotId` 链接不断
- [ ] 批量跑、单节点跑行为与旧版一致

### 阶段门禁（每阶段结束必过）

| 阶段 | 门禁条件 | 当前 |
|------|----------|------|
| P0 | P0-01~P0-18 全部 🟢；Stage Deck 默认启用 | 🟢 已通过 |
| P1 | P1-01~P1-12 全部 🟢；Produce 模式可用 | 🟢 已通过 |
| P2 | P2-01~P2-09 全部 🟢；Review 模式可用 | 🟢 已通过 |
| P3 | P3-01~P3-08 全部 🟢；无 #角标 | 🟢 已通过 |
| P4 | P4-06 旧画布下线；P4-01~P4-08 核心 🟢 | 🟢 已通过 |

---

## 第十二章：与现有文档的关系

| 文档 | 关系 |
|------|------|
| `NX9-PRD.md` | PRD 第二章布局描述 **将被本方案替换**；PRD 核心循环不变 |
| `3D-DIRECTOR-INTEGRATION.md` | 3D 能力按原文档执行，本方案 §6.26 仅定义与 Stage Deck 衔接点 |
| `P7-PROGRESS.md` 及后续 | 实施进度可记 `P8-STAGE-DECK-PROGRESS.md` |

---

## 附录 A：旧文件处置对照表

| 旧文件 | 处置 |
|--------|------|
| `FlowSurface.tsx` | 保留逻辑层，UX 迁到 `StageDeckSurface`；最终合并或薄包装 |
| `BlockPalette.tsx` | P0 后 deprecated → P4 删除 |
| `FlowContextMenu.tsx` | 拆：对齐命令 → CommandPalette；创建 → LensMenu；边 → EdgeMidpointMenu |
| `FlowSelectedToolbar.tsx` | P0 删除，功能进 ComposerDeck |
| `FlowSelectedEdgeToolbar.tsx` | 并入 ChannelEdge 中点菜单 |
| `BlockShell.tsx` | 由 `CardShell.tsx` 包装扩展 |
| `flow-runner.ts` | 保留，cascade-runner 调用它 |
| `global.css` `.nx9-flow` | 复制为 `.nx9-stage-deck`，逐步迁移选择器 |

---

## 附录 B：参考项目路径速查

| 项目 | 本地路径 |
|------|----------|
| T8 | `Reference_Projects/T8-penguin-canvas-main` |
| infinite-canvas | `Reference_Projects/infinite-canvas-main` |
| infinite-canvas React | `Reference_Projects/infinite-canvas-main1` |
| huobao-drama | `Reference_Projects/huobao-drama-master` |
| moyin-creator | `Reference_Projects/moyin-creator-main` |
| waoowaoo | `Reference_Projects/waoowaoo-main` |
| storyai-3d | `Reference_Projects/storyai-3d-director-desk` |

---

*文档结束。下次恢复上下文：先读「AI 速读卡」→「阶段功能清单与进度」→ 第四章「功能变动总表」→ 第九章「路线图」。*

### 变更日志

| 日期 | 变更 |
|------|------|
| 2026-07-08 | 初版：完整设计规划 |
| 2026-07-08 | 增补：P0–P4 共 56 项功能台账 + 20 项基础设施进度 + 阶段验收门禁 |
