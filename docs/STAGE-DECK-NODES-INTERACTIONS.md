# Stage Deck Canvas — 节点交互与模块手册

> **文档用途**：NX9 Stage Deck Canvas 的节点中心 UI 交互规范与 56+ 模块（`BLOCK_CATALOG`）完整参考。  
> **阅读目标**：开发者 / AI 无需翻代码即可理解画布手势、菜单、端口类型与各 block 的行为。  
> **前提**：Composer Deck 底部 Prompt 栏已移除（`ComposerDeck` 为空组件）；**所有操作控件均在节点体内**。  
> **关联**：`docs/STAGE-DECK-CANVAS-REDESIGN.md`、`packages/shared/src/catalog/block-catalog.ts`  
> **功能借鉴与节点完善 SSOT**：`docs/NX9-FEATURE-BORROWING-AND-NODE-PLAYBOOK.md`（Reference 项目 + 行业拆解 + 全节点 Bug/验收）  
> **更新**：2026-07-08

---

## 文档速览

| 章节 | 内容 |
|------|------|
| §1 | 设计原则 |
| §2 | 画布 / 节点 / 连接线交互总表 |
| §3 | 空白画布菜单、LensMenu、CommandPalette |
| §4 | 选中模块右键菜单 |
| §5 | 按分类的 block kind 详述（`BLOCK_CATALOG` 全部条目） |
| §6 | 典型工作流 Recipes |
| §7 | 探索 / 生产 / 审片三模式差异 |
| §8 | 实现架构与关键路径 |
| §9 | **节点谱系发散**：相对 T8 的可删 / 可合并 / 可新增建议 |
| — | **功能借鉴 · 行业拆解 · 节点 Playbook**：见 `NX9-FEATURE-BORROWING-AND-NODE-PLAYBOOK.md` |

**端口颜色（ChannelEdge / SOCKET_COLORS）**：

| 端口类型 | 颜色 | 含义 |
|----------|------|------|
| `prompt` | `#5E4D8A` 紫 | 文本 / 提示词 |
| `picture` | `#A13D63` 品红 | 图像 |
| `clip` | `#D97706` 琥珀 | 视频 |
| `sound` | `#2E8B57` 绿 | 音频 |
| `mesh` | `#5E4D8A` 紫 | 3D 模型 |
| `meta` | `#222222` 墨 | 元数据 |
| `param` | `#5E4D8A` 紫 | RH 参数 |
| `wildcard` | `#E6E6E6` 灰 | 任意透传 |

---

## 1. 设计原则

### 1.1 节点内完整操作，无底部 Prompt 栏

- **节点即操作台**：模型选择、Prompt 编辑、运行按钮、模板选取、分镜绑定等全部在 block 组件内完成。
- **Composer Deck 已废弃**：`apps/web/src/engine/stage-deck/chrome/ComposerDeck.tsx` 返回 `null`；`useDeckUi` 仅保留兼容引用，不再渲染底部 168px 操作条。
- **数据写回 `node.data`**：运行结果、预览图、Take 主版本等均持久化到工作区 v3 payload，不依赖外部 Deck 状态。
- **节点内滚动隔离**：节点体使用 `nowheel` / `nodrag` / `nopan` class，滚轮在节点上时不缩放画布。

### 1.2 探索 / 生产 / 审片三模式

| 模式 | ID | 节点形态 | 额外 UI |
|------|-----|----------|---------|
| **探索** | `explore` | 节点完全展开，显示全部表单与端口 | Module Dock、Context Rail、智能对齐线 |
| **生产** | `produce` | 默认 **折叠 CardShell**（180px 缩略卡）；双击或右键「展开模块」恢复完整 UI | 自动 `intensive` 渲染分级 |
| **审片** | `review` | 同生产折叠；选中节点时底部浮出 **TakeRail** 胶片条 | Take 灯箱、对比、故事板网格批审入口 |

模式切换：`ModeCapsule` 顶栏三 pill，或 CommandPalette「切换 · xxx 模式」。

### 1.3 端口着色 ChannelEdge

- Stage Deck 下所有新连线类型为 `channel`（`ChannelEdge.tsx`）。
- **描边颜色**取自 **源端口 handle** 的 `SocketKind`（`sourceHandleId`），与 `SOCKET_COLORS` 一致。
- **路径样式**存于 `edge.data.pathType`：贝塞尔 / 直线 / 平滑折线 / 直角折线 / 简单曲线。
- **级联执行**时 `edge.data.cascadeActive=true` 触发虚线流动动画。
- **DAG 失效**时下游节点与边可标记 `dimmed` / `stale` 状态。

---

## 2. 画布交互总表

### 2.1 空白画布（Pane）

| 手势 | 行为 | 备注 |
|------|------|------|
| **滚轮** | 缩放画布 | 鼠标在节点上时 `zoomOnScroll=false`，滚轮留给节点内滚动 |
| **左键拖拽** | 平移画布 | `panOnDrag` 默认开启 |
| **左键双击** | 打开 **LensMenu** 扇形创建菜单 | 仅 `react-flow__pane` 目标；`zoomOnDoubleClick=false` |
| **右键** | **PaneContextMenu** 空白菜单 | 快速添加模块、粘贴、整理选中 |
| **Shift + 拖拽** | **Knife 切线**：在画布上划折线，命中连接线则删除 | `knife-tool.ts`；`StageDeckInteractionBridge` |
| **拖入文件 / 资源** | 落点生成节点 | 资源库 URL → `asset-import`；Dock 拖拽 → 对应 kind |
| **拖线到空白** | 端口过滤后的 **LensMenu**（最多 6 项） | `wire-drop.ts` + `onConnectEnd` |

**框选**：`Ctrl/Cmd + 左键拖拽`（`selectionKeyCode`）；`selectionOnDrag=false` 故普通左拖为平移。

**快捷键（画布级）**：

| 快捷键 | 动作 |
|--------|------|
| `Ctrl/Cmd+Z` | 撤销 |
| `Ctrl/Cmd+Shift+Z` / `Ctrl+Y` | 重做 |
| `Ctrl/Cmd+C` | 复制选中 |
| `Ctrl/Cmd+V` | 粘贴（锚点为上次右键位置） |
| `Ctrl/Cmd+D` | 快速复制（偏移粘贴） |
| `Delete` / `Backspace` | 删除选中边或节点 |
| `Ctrl/Cmd+G` | 创建 **场景组** scene-group（≥2 节点） |
| `Ctrl/Cmd+K` 或 `/` | CommandPalette |
| `Escape` | 关闭菜单 / 灯箱 |

### 2.2 节点（Node）

| 手势 | 行为 | 备注 |
|------|------|------|
| **左键** | 选中节点；`Ctrl/Cmd` 多选 | 拖拽标题栏区域移动 |
| **右键** | **SelectionContextMenu** | 多选时右键任一节点的选中集 |
| **双击** | **探索**：聚焦节点（`focusBlock`）<br>**生产**：切换 `data.expanded` 展开/收起<br>**director-3d**：打开 3D 预演全屏 | `onNodeDoubleClick` |
| **Alt+Shift+拖拽** | 复制节点并 **保留入边** 到新节点 | 仅 Stage Deck；每节点拖拽仅触发一次 |
| **滚轮** | 节点内滚动（`nowheel`） | 不触发画布缩放 |
| **拖线出端口** | 合法连接则创建 `channel` 边；落空白出 LensMenu | `validateLink` 端口兼容校验 |

**生产模式折叠卡**：显示缩略图 + 状态点 + pending 计时；端口在折叠时隐藏（`hideSockets`）。

### 2.3 连接线（Edge）

| 手势 | 行为 | 备注 |
|------|------|------|
| **左键** | 选中连接线 | 取消节点选中 |
| **右键** | **EdgeContextMenu**：切换路径类型、删除 | |
| **中点悬停** | **EdgeMidpointMenu** 浮层 | 快速改线型 / 切断 |
| **Shift+刀划** | 批量删除被划中的边 | 见 §2.1 |

**连接线类型**（`FLOW_EDGE_TYPES`）：贝塞尔曲线（默认）、直线、平滑折线、直角折线、简单曲线。

---

## 3. 空白画布菜单

### 3.1 PaneContextMenu（右键空白）

文件：`apps/web/src/engine/FlowContextMenu.tsx` → `PaneContextMenu`

| 菜单项 | 条件 | 动作 |
|--------|------|------|
| **快速添加模块** ×7 | 始终 | 在右键位置 spawn：`prompt`、`picture-gen`、`clip-gen`、`chat-model`、`sound-gen`、`asset-import`、`director-desk` |
| **粘贴 (N)** | 剪贴板非空 | 在右键锚点粘贴 |
| **整理选中** | 已选 ≥2 节点 | 网格排列选中模块 |

### 3.2 LensMenu（双击空白 / 拖线落空白）

文件：`apps/web/src/engine/stage-deck/canvas/LensMenu.tsx`

- **形态**：Portal 扇形，半径 72px，最多 **6** 项。
- **双击空白**：显示目录前 6 个非 `concealed` 模块。
- **拖线落空白**：`filterBlocksForWireDrop` 按源端口 `emits` 与目标 `accepts` 过滤后取前 6 项。
- **交互**：点击项 → 在光标处 spawn 节点；拖线场景自动连边。

### 3.3 CommandPalette（Ctrl+K / `/`）

文件：`apps/web/src/engine/stage-deck/chrome/CommandPalette.tsx`

- **分组**：配方 Recipe → 生产模块（Dock 28）→ 进阶模块（concealed，仅搜索时显示）→ 命令
- **配方**：全部 `WORKFLOW_TEMPLATES` 可搜可加载（默认 merge）
- **命令**：三模式切换、故事板 / 网格批审、工作流 Rail、对齐、撤销、批量运行

| 命令类别 | 示例 |
|----------|------|
| **添加模块** | 所有非 concealed 的 `BLOCK_CATALOG` 项（fuzzy 搜索 kind / label / hint） |
| **对齐** | 左对齐、水平居中、网格排列（需选中节点） |
| **模式** | 切换探索 / 生产 |
| **全局** | 撤销、批量运行 |

操作：↑↓ 选择，Enter 执行，Esc 关闭。

---

## 4. 选中模块右键菜单 SelectionContextMenu

文件：`apps/web/src/engine/FlowContextMenu.tsx` → `SelectionContextMenu`  
触发：节点右键、多选区域右键（`onSelectionContextMenu`）。

### 4.1 菜单结构

| 菜单项 | 条件 | 动作 |
|--------|------|------|
| **对齐 / 整理** → 子菜单 | 始终 | 见下表 |
| **停止运行** | `isRunning` | 中止批量执行 |
| **运行选中 (N)** | 可执行数 >0 | `runSelected`；N = `RUNNABLE_BLOCKS` 命中数 |
| **级联运行 (Cascade)** | 单选且为可执行块 | `runCascade`：上游拓扑链 + 边流动画 |
| **展开模块 / 收起模块** | 生产模式 + 单选 | 切换 `data.expanded` |
| **发送到故事板** | 选中含分镜输出块且有关联镜头 | 打开故事板并定位 `linkedShotId` |
| **复制** | 始终 | 写入剪贴板 |
| **快速复制** | 始终 | 复制 + 偏移粘贴 |
| **删除** | 始终 | 删除节点及关联边；清理 `linkedBlockId` |

**对齐子菜单**：

| 对齐 | 最少节点数 |
|------|-----------|
| 左 / 水平中 / 右 / 上 / 垂直中 / 下 | 2 |
| 水平等距 / 垂直等距 | 3 |
| 吸附网格 | 1 |
| 整理网格 | 2 |

### 4.2 Cascade 与展开/收起说明

- **Cascade**：从选中节点反向 BFS 收集上游链，拓扑序执行；若链中存在 `iterator` 则走 `loop-executor` 多轮变体。实现：`cascade-runner.ts`。
- **展开/收起**：仅 **生产模式** 显示；探索模式始终展开，无需此菜单项。

---

## 5. 模块分类详述（BLOCK_CATALOG）

> 下列条目来自 `packages/shared/src/catalog/block-catalog.ts`（含 `concealed` 隐藏项）。  
> **实现路径**：有专属组件 → `apps/web/src/blocks/**`；无 loader → `apps/web/src/blocks/shared/GenericBlock.tsx`（占位 UI，待专项实现）。  
> **外壳**：Stage Deck 经 `stage-deck-node-types.tsx` 包装；探索/展开态用各 Block + `BlockShell`；生产折叠态用 `CardShell`。

**通用左键/右键**（无特殊说明时）：

- 左键：选中；拖拽移动。
- 右键：SelectionContextMenu。
- 双击：探索→聚焦；生产→展开/收起。

---

### 5.1 source — 素材

#### asset-import · 素材导入

- **功能说明**：上传或拖入图像 / 视频 / 音频；输出对应媒体端口。
- **输入/输出端口**：无输入；输出随 `mediaKind` 动态：`picture` / `clip` / `sound` / `mesh`。
- **节点内 UI 控件**：文件选择按钮、预览图（可编辑）、更换文件。
- **左键/右键行为**：标准；拖入文件到节点区域亦可上传。
- **典型配合流程**：
  1. `asset-import` → `picture-gen`（参考图生图）
  2. `asset-import(clip)` → `frame-endpoints` → `picture-gen`
  3. 资源库拖入画布 → 自动 `asset-import` 落点
- **实现要点**：`apps/web/src/blocks/input/AssetImportBlock.tsx`

#### mesh-import · 3D 导入

- **功能说明**：上传 glb/gltf/obj 等 3D 模型。
- **输入/输出端口**：无输入；`mesh` 输出。
- **节点内 UI 控件**：模型上传、文件名显示。
- **典型配合流程**：`mesh-import` → `mesh-viewer` / `director-3d`
- **实现要点**：`apps/web/src/blocks/spatial/MeshImportBlock.tsx`

#### mesh-viewer · 3D 预览

- **功能说明**：预览 3D 模型并导出快照为图像。
- **输入/输出端口**：`mesh` → `picture`
- **节点内 UI 控件**：内嵌查看器、截图按钮。
- **典型配合流程**：`mesh-import` → `mesh-viewer` → `picture-gen`
- **实现要点**：`apps/web/src/blocks/spatial/MeshViewerBlock.tsx`

#### asset-bundle · 素材集合

- **功能说明**：多素材打包、排序后按 `bundleKind` 输出单一类型流。
- **输入/输出端口**：`prompt,picture,clip,sound` → 随 bundle 配置输出对应类型。
- **节点内 UI 控件**：条目列表、排序、类型切换。
- **典型配合流程**：多个 `asset-import` → `asset-bundle` → `iterator`
- **实现要点**：`apps/web/src/blocks/input/AssetBundleBlock.tsx`

#### render-slot · 渲染占位

- **功能说明**：预设 AI 结果落位框，占位等待上游填充。
- **输入/输出端口**：`prompt,picture` → `picture`
- **节点内 UI 控件**：占位框、绑定提示。
- **典型配合流程**：`prompt` → `render-slot` → `grid-compose`
- **实现要点**：`apps/web/src/blocks/input/RenderSlotBlock.tsx`

#### preview-sink · 结果预览

- **功能说明**：上游产物终端预览，汇聚多类型输入。
- **输入/输出端口**：`prompt,picture,clip,sound,mesh,wildcard` → `wildcard`
- **节点内 UI 控件**：多类型预览区。
- **典型配合流程**：任意生成链末端 → `preview-sink`
- **实现要点**：`apps/web/src/blocks/input/PreviewSinkBlock.tsx`

---

### 5.2 generate — 生成

#### prompt · 提示词 ⭐

- **功能说明**：多行提示词编辑、上游图文合并、三种派发模式批量出图任务。
- **输入/输出端口**：`prompt,picture,clip,sound` → `prompt`
- **节点内 UI 控件**：
  - 批量行编辑器（每行可绑图）
  - 派发模式：`batch`（一行一图）/ `single`（多素材合成）/ `broadcast`（同 prompt × 多图）
  - `composeAction`：generate / merge / merge-then-generate
  - Backlot 模板选取（scene / emotion / hook）
  - 上游同步按钮
- **左键/右键行为**：标准；编辑区 `nodrag`。
- **典型配合流程**：
  1. `cinema-prompt` → `prompt` → `picture-gen`（文生图）
  2. `asset-import` ×N → `prompt(broadcast)` → `picture-gen`
  3. `chat-model` → `prompt` → `clip-gen`
- **实现要点**：`apps/web/src/blocks/core/PromptBlock.tsx`；合并逻辑 `@nx9/shared` `collectUpstreamForPromptMerge`

#### picture-gen · 图像生成 ⭐

- **功能说明**：多模型图像生成；支持批量、角色注入、分镜绑定、局部编辑。
- **输入/输出端口**：`prompt,picture` → `picture`
- **节点内 UI 控件**：
  - 模型下拉（`dall-e-3` 等）
  - `MentionEditor` 本地 prompt（`@角色` / `@镜头`）
  - 上游 prompt 提示、`GenFallbackTemplate`
  - 角色选择、`CharacterBadge`
  - 运行按钮、预览网格、`EditableImage` 编辑
  - `linkedShotId` 分镜关联
- **典型配合流程**：
  1. `prompt` → `picture-gen`
  2. `style-atelier` → `picture-gen`
  3. `director-3d` 截图 → `picture-gen`
- **实现要点**：`apps/web/src/blocks/core/PictureGenBlock.tsx`；执行 `flow-runner` `proxyImage`

#### clip-gen · 视频生成 ⭐

- **功能说明**：Veo / Grok 等视频生成。
- **输入/输出端口**：`prompt,picture,clip,sound` → `clip`
- **节点内 UI 控件**：模型选择、时长、比例、首帧/尾帧预览、运行。
- **典型配合流程**：
  1. `picture-gen` → `clip-gen`（图生视频）
  2. `camera-prompt` → `clip-gen`
  3. `sound-gen` → `clip-gen`（配音轨）
- **实现要点**：`apps/web/src/blocks/core/ClipGenBlock.tsx`

#### clip-editor · 视频剪辑 ⭐

- **功能说明**：多片段拼接、转场、导出合成视频。
- **输入/输出端口**：`clip` → `clip`
- **节点内 UI 控件**：片段列表、排序、转场、预览、导出。
- **典型配合流程**：`clip-gen` ×N → `clip-editor` → `preview-sink`
- **实现要点**：`apps/web/src/blocks/core/ClipEditorBlock.tsx`

#### motion-story · 动效分镜 ⭐

- **功能说明**：Seedance 2.0 风格分镜视频生成。
- **输入/输出端口**：`prompt,picture,clip,sound` → `clip`
- **节点内 UI 控件**：分镜参数、镜头列表、运行。
- **典型配合流程**：`story-grid` → `motion-story`；`director-desk` → `motion-story`
- **实现要点**：`apps/web/src/blocks/core/MotionStoryBlock.tsx`

#### director-desk · 导演台 ⭐

- **功能说明**：多镜头并发分镜生成；与故事板双向链接。
- **输入/输出端口**：`prompt,picture,clip,sound` → `clip,prompt`
- **节点内 UI 控件**：镜头选择器、`linkedShotId` 绑定、角色徽章、首帧生成、打开故事板。
- **左键/右键行为**：标准；绑定镜头后写入 `storyboard.shots[].linkedBlockId`。
- **典型配合流程**：
  1. 故事板镜头 → `director-desk` → 审片 Take
  2. `cinema-prompt` → `director-desk` → `motion-story`
- **实现要点**：`apps/web/src/blocks/core/DirectorDeskBlock.tsx`

#### sound-gen · 音频生成 ⭐

- **功能说明**：Suno 全模式音乐 / 音效 / 人声生成。
- **输入/输出端口**：`prompt,sound` → `sound`
- **节点内 UI 控件**：模式切换、风格、歌词、运行、波形预览。
- **典型配合流程**：`prompt` → `sound-gen` → `clip-editor`
- **实现要点**：`apps/web/src/blocks/core/SoundGenBlock.tsx`

#### chat-model · 对话模型 ⭐

- **功能说明**：LLM 流式对话；可消费图像/视频上下文。
- **输入/输出端口**：`prompt,picture,clip` → `prompt`
- **节点内 UI 控件**：消息历史、流式输出、模型选择、清空。
- **典型配合流程**：
  1. `memo` → `chat-model` → `text-chunker`
  2. `asset-import` → `chat-model`（图生文）→ `prompt`
- **实现要点**：`apps/web/src/blocks/core/ChatModelBlock.tsx`

#### photo-speak · 照片说话

- **功能说明**：照片 + 文案 → 口播视频。
- **输入/输出端口**：`prompt,picture,sound` → `clip,sound`
- **节点内 UI 控件**：人像预览、文案、音色、运行。
- **典型配合流程**：`asset-import` + `sound-gen` → `photo-speak`
- **实现要点**：`apps/web/src/blocks/core/PhotoSpeakBlock.tsx`

---

### 5.3 spatial — 空间

#### director-3d · 3D 导演台 ⭐

- **功能说明**：3D 预演、摆位、多机位截图；输出截图与机位 prompt。
- **输入/输出端口**：`picture,mesh` → `picture,prompt`
- **节点内 UI 控件**：最近截图缩略、场景统计、**打开 3D 预演** 按钮。
- **左键/右键行为**：**双击** 直接打开 3D 全屏（`director3d-ui`）；与普通双击聚焦互斥优先 3D。
- **典型配合流程**：
  1. `mesh-import` → `director-3d` 截图 → `picture-gen`
  2. `director-3d` → `camera-prompt` → `clip-gen`
  3. 绑定 `linkedShotId` → 故事板回写
- **实现要点**：`apps/web/src/blocks/spatial/Director3dBlock.tsx`；`@nx9/director3d`

#### panorama-sphere · 3D 全景

- **功能说明**：360° 全景图预览与导出。
- **输入/输出端口**：`picture` → `picture`
- **节点内 UI 控件**：球面预览、导出。
- **典型配合流程**：`asset-import(全景图)` → `panorama-sphere` → `picture-gen`
- **实现要点**：`apps/web/src/blocks/spatial/PanoramaSphereBlock.tsx`

#### multi-view-3d · 多角度 3D `concealed`

- **功能说明**：3D 多视角渲染（遗留隐藏模块）。
- **输入/输出**：`prompt,picture` → `picture`
- **实现要点**：**占位 UI，待专项实现** — `GenericBlock`

#### panorama-flat · 720 全景 `concealed`

- **功能说明**：720° 全景图（遗留）。
- **输入/输出**：`prompt` → `picture`
- **实现要点**：**占位 UI，待专项实现** — `GenericBlock`

#### scene-group · 场景组（仅画布）

- **功能说明**：将多个节点框入虚线组，便于整组移动；**不在 BLOCK_CATALOG / Dock 中**。
- **输入/输出端口**：无
- **节点内 UI 控件**：组标题标签、可调宽高边框。
- **创建方式**：框选 ≥2 节点 → `Ctrl/Cmd+G`。
- **典型配合流程**：同场景 `picture-gen` ×9 成组 → 批量对齐
- **实现要点**：`apps/web/src/engine/stage-deck/canvas/SceneGroup.tsx`；`type: 'scene-group'`

---

### 5.4 hub — RunningHub

#### workflow-hub · Workflow Hub

- **功能说明**：执行 RunningHub 工作流。
- **输入/输出端口**：`prompt,picture,clip,sound,param` → `picture,clip`
- **实现要点**：**占位 UI，待专项实现** — `GenericBlock`

#### wallet-hub · Wallet Hub

- **功能说明**：RH 钱包应用工作流。
- **输入/输出端口**：`prompt,picture,clip,sound,param` → `picture,clip`
- **实现要点**：**占位 UI，待专项实现** — `GenericBlock`

#### param-inject · 参数注入 `concealed`

- **功能说明**：RH 参数注入节点。
- **输入/输出**：`prompt,picture,clip,sound` → `param`
- **实现要点**：**占位 UI，待专项实现** — `GenericBlock`

#### hub-market · Hub 超市

- **功能说明**：RH 应用启动器。
- **输入/输出端口**：`prompt,picture,clip,sound` → `picture,clip,sound`
- **实现要点**：**占位 UI，待专项实现** — `GenericBlock`

#### hub-toolkit · Hub 工具箱

- **功能说明**：精选 RH 工具集合。
- **输入/输出端口**：全类型 → 全类型
- **实现要点**：**占位 UI，待专项实现** — `GenericBlock`

#### vibe-workbench · Vibe 工作台

- **功能说明**：嵌入 VibeX 视频工作台。
- **输入/输出端口**：全类型 → 全类型
- **实现要点**：**占位 UI，待专项实现** — `GenericBlock`

---

### 5.5 integrate — 集成

#### fal-market · FAL 超市

- **功能说明**：Fal.ai 模型能力面板。
- **输入/输出端口**：全类型 → 全类型 + `mesh`
- **节点内 UI 控件**：模型浏览、参数、运行（部分实现）。
- **实现要点**：`apps/web/src/blocks/integrate/FalMarketBlock.tsx`

#### grok-agent · Grok Agent

- **功能说明**：xAI OAuth 多模态 Agent。
- **输入/输出端口**：全类型 → 全类型
- **实现要点**：**占位 UI，待专项实现** — `GenericBlock`

#### codex-agent · Codex Agent

- **功能说明**：Codex CLI 工作台。
- **输入/输出端口**：全类型 → 全类型 + `mesh`
- **实现要点**：**占位 UI，待专项实现** — `GenericBlock`

#### codex-picture · Codex 生图

- **功能说明**：Codex imagegen 工作台。
- **输入/输出端口**：`prompt,picture` → `picture,prompt`
- **实现要点**：**占位 UI，待专项实现** — `GenericBlock`

#### comfy-market · ComfyUI 超市

- **功能说明**：ComfyUI 应用库浏览与运行。
- **输入/输出端口**：全类型 → 全类型
- **实现要点**：`apps/web/src/blocks/integrate/ComfyMarketBlock.tsx`

#### comfy-builder · ComfyUI 制作

- **功能说明**：Workflow JSON 转应用。
- **输入/输出端口**：无 → `prompt`
- **实现要点**：**占位 UI，待专项实现** — `GenericBlock`

---

### 5.6 craft — 创作 / 灵感

#### style-atelier · 风格工坊 ⭐

- **功能说明**：从参考图提取画风 token + 反推 prompt。
- **输入/输出端口**：`prompt` → `prompt,picture`
- **节点内 UI 控件**：参考图预览、提取结果、**提取画风 + 反推 Prompt** 按钮。
- **典型配合流程**：`asset-import` → `style-atelier` → `picture-gen`
- **实现要点**：`apps/web/src/blocks/craft/StyleAtelierBlock.tsx`

#### tag-atelier · 标签工坊

- **功能说明**：动漫标签图库检索，增强 prompt。
- **输入/输出端口**：`prompt,picture` → `prompt,picture`
- **实现要点**：`apps/web/src/blocks/craft/TagAtelierBlock.tsx`

#### cinema-prompt · 电影感 ⭐

- **功能说明**：电影感 preset 多选组合 prompt。
- **输入/输出端口**：`prompt` → `prompt`
- **节点内 UI 控件**：分组 preset 芯片、补充说明、Backlot 情绪模板、`DoubleClickText` 预览。
- **典型配合流程**：`cinema-prompt` → `prompt` → `picture-gen`
- **实现要点**：`apps/web/src/blocks/craft/CinemaPromptBlock.tsx`；`CINEMA_PROMPT_PRESETS`

#### camera-prompt · 运镜 ⭐

- **功能说明**：视频运镜 prompt 组合器。
- **输入/输出端口**：`prompt,picture` → `prompt`
- **节点内 UI 控件**：运镜 preset、参考图、合成预览。
- **典型配合流程**：`director-3d` 机位 → `camera-prompt` → `clip-gen`
- **实现要点**：`apps/web/src/blocks/craft/CameraPromptBlock.tsx`

#### angle-visual · 多角度

- **功能说明**：可视化角度调节，输出角度描述 prompt。
- **输入/输出端口**：`picture` → `prompt`
- **实现要点**：`apps/web/src/blocks/craft/AngleVisualBlock.tsx`

#### portrait-craft · 肖像设计

- **功能说明**：肖像 Prompt 设计器。
- **输入/输出端口**：`prompt,meta` → `prompt,meta`
- **实现要点**：**占位 UI，待专项实现** — `GenericBlock`

#### pose-craft · 姿势设计

- **功能说明**：人体姿态编辑器。
- **输入/输出端口**：`prompt,picture,meta` → `picture,prompt,meta`
- **实现要点**：**占位 UI，待专项实现** — `GenericBlock`

#### story-grid · 分镜网格 ⭐

- **功能说明**：分镜九宫格编排与生成。
- **输入/输出端口**：`picture` → `picture`
- **节点内 UI 控件**：网格槽位、镜头绑定、批量生成。
- **典型配合流程**：`picture-gen` 宫格 → `story-grid` → `grid-split`
- **实现要点**：`apps/web/src/blocks/craft/StoryGridBlock.tsx`

#### grid-prompt-reverse · 宫格反推

- **功能说明**：宫格逐格 Vision 三层 Prompt 反推。
- **输入/输出端口**：`picture` → `prompt,picture`
- **实现要点**：`apps/web/src/blocks/craft/GridPromptReverseBlock.tsx`

#### portrait-flow · 肖像流程 `concealed`

- **功能说明**：肖像专用流程（遗留）。
- **实现要点**：**占位 UI，待专项实现** — `GenericBlock`

#### portrait-meta · 肖像元数据 `concealed`

- **功能说明**：肖像参数元数据（遗留）。
- **输入/输出**：`picture` → `meta`
- **实现要点**：**占位 UI，待专项实现** — `GenericBlock`

---

### 5.7 utility — 工具

#### iterator · 迭代器 ⭐

- **功能说明**：遍历上游队列，串行/并行驱动下游多轮生成；支持变体 prompt 行。
- **输入/输出端口**：`prompt,picture,clip,sound` → 同类型全集
- **节点内 UI 控件**：模式（串行/并行）、轮次、变体 textarea、步进器、**运行** / **Cascade** 按钮。
- **典型配合流程**：
  1. `text-chunker` → `iterator` → `picture-gen`（逐段出图）
  2. `prompt` → `iterator(loopVariants)` → `picture-gen`（同图多风格）
- **实现要点**：`apps/web/src/blocks/utility/IteratorBlock.tsx`；`loop-executor.ts`

#### picker · 选取器 ⭐

- **功能说明**：从上游 `iterItems` 队列按索引取单项。
- **输入/输出端口**：全类型 → 全类型
- **节点内 UI 控件**：索引数字输入、当前项预览。
- **典型配合流程**：`grid-split` → `picker(index=3)` → `picture-gen`
- **实现要点**：`apps/web/src/blocks/utility/PickerBlock.tsx`

#### text-chunker · 文本切分 ⭐

- **功能说明**：长文本按段落/行/句子/正则切分为 `chunks`。
- **输入/输出端口**：`prompt` → `prompt`
- **节点内 UI 控件**：模式选择、正则输入、源文本、**切分** 按钮、结果列表。
- **典型配合流程**：`chat-model` → `text-chunker` → `iterator` → `picture-gen`
- **实现要点**：`apps/web/src/blocks/utility/TextChunkerBlock.tsx`

#### grid-split · 宫格切分 ⭐

- **功能说明**：将单张图按 rows×cols 切分为多张。
- **输入/输出端口**：`picture` → `picture`
- **节点内 UI 控件**：行/列、源图预览、切分结果网格、运行。
- **典型配合流程**：`picture-gen(3×3宫格)` → `grid-split` → `picker` → 分镜
- **实现要点**：`apps/web/src/blocks/utility/GridSplitBlock.tsx`；`api.gridSplit`

#### grid-compose · 宫格编辑 ⭐

- **功能说明**：多图拼接为宫格或反向拆分编辑。
- **输入/输出端口**：`picture` → `picture`
- **节点内 UI 控件**：布局、间距、合并/拆分、预览。
- **典型配合流程**：`grid-split` 各格 → `grid-compose` 校对 → `story-grid`
- **实现要点**：`apps/web/src/blocks/utility/GridComposeBlock.tsx`

#### sketch-pad · 画板

- **功能说明**：图层手绘标注，输出标注图。
- **输入/输出端口**：`picture` → `picture`
- **实现要点**：`apps/web/src/blocks/utility/SketchPadBlock.tsx`

#### web-view · 网页 `concealed`

- **功能说明**：内嵌浏览器。
- **输入/输出**：无 → `prompt,picture`
- **实现要点**：**占位 UI，待专项实现** — `GenericBlock`

#### picture-diff · 图像对比

- **功能说明**：双图滑动对比分析。
- **输入/输出端口**：`picture` → `picture`
- **实现要点**：`apps/web/src/blocks/utility/PictureDiffBlock.tsx`

#### frame-sampler · 抽帧 `concealed`

- **功能说明**：视频均匀抽帧。
- **输入/输出**：`clip` → `picture`
- **实现要点**：`apps/web/src/blocks/utility/FrameSamplerBlock.tsx`（部分实现）

#### frame-endpoints · 首尾帧

- **功能说明**：提取视频首帧/尾帧为图像。
- **输入/输出端口**：`clip` → `picture`
- **典型配合流程**：`clip-gen` → `frame-endpoints` → `picture-gen`（尾帧续作）
- **实现要点**：`apps/web/src/blocks/utility/FrameEndpointsBlock.tsx`

#### scale-fit · 尺寸调整

- **功能说明**：图像缩放至目标尺寸。
- **输入/输出端口**：`picture` → `picture`
- **实现要点**：`apps/web/src/blocks/utility/ScaleFitBlock.tsx`

#### picture-merge · 图像合并

- **功能说明**：多图横向/纵向合并。
- **输入/输出端口**：`picture` → `picture`
- **实现要点**：`apps/web/src/blocks/utility/PictureMergeBlock.tsx`

#### bg-remove · 抠图

- **功能说明**：Fal BiRefNet 背景移除。
- **输入/输出端口**：`picture` → `picture`
- **实现要点**：`apps/web/src/blocks/utility/BgRemoveBlock.tsx`

#### upscale-lite · 放大

- **功能说明**：Lanczos 轻量图像放大。
- **输入/输出端口**：`picture` → `picture`
- **实现要点**：`apps/web/src/blocks/utility/UpscaleLiteBlock.tsx`

#### link-parser · 链接解析

- **功能说明**：自媒体链接解析为素材/文本。
- **输入/输出端口**：`prompt` → `prompt,picture,clip,sound`
- **实现要点**：`apps/web/src/blocks/utility/LinkParserBlock.tsx`

#### batch-runner · 批量处理

- **功能说明**：批量驱动素材处理管线。
- **输入/输出端口**：`picture,clip,sound,mesh` → 无
- **实现要点**：`apps/web/src/blocks/utility/BatchRunnerBlock.tsx`

#### topaz-picture · Topaz 图像

- **功能说明**：Topaz Gigapixel 本地放大。
- **输入/输出端口**：`picture` → `picture`
- **实现要点**：`apps/web/src/blocks/utility/TopazPictureBlock.tsx`

#### topaz-clip · Topaz 视频

- **功能说明**：Topaz Video AI 本地视频增强。
- **输入/输出端口**：`clip` → `clip`
- **实现要点**：`apps/web/src/blocks/utility/TopazClipBlock.tsx`

---

### 5.8 support — 辅助

#### memo · 备忘 ⭐

- **功能说明**：灵感记录；输出为 `prompt` 供下游消费。
- **输入/输出端口**：无 → `prompt`
- **节点内 UI 控件**：多行 textarea。
- **典型配合流程**：`memo` → `chat-model` / `prompt`
- **实现要点**：`apps/web/src/blocks/core/MemoBlock.tsx`

#### passthrough · 透传 ⭐

- **功能说明**：原样中转上游数据，用于整理拓扑或绕过类型限制。
- **输入/输出端口**：`wildcard` → `wildcard`
- **节点内 UI 控件**：上游计数只读显示。
- **典型配合流程**：复杂汇聚 → `passthrough` → `preview-sink`
- **实现要点**：`apps/web/src/blocks/core/PassthroughBlock.tsx`

#### blueprint · 蓝图

- **功能说明**：流程蓝图注释与规划。
- **输入/输出端口**：`prompt` → `prompt`
- **实现要点**：`apps/web/src/blocks/support/BlueprintBlock.tsx`

#### watermark-clean · 去 AI 水印

- **功能说明**：清理水印与元数据。
- **输入/输出端口**：`picture,clip,sound` → 多类型
- **实现要点**：`apps/web/src/blocks/support/WatermarkCleanBlock.tsx`

#### touch-up · 局部编辑 `concealed`

- **功能说明**：图像局部 inpainting 编辑。
- **输入/输出**：`prompt,picture` → `picture`
- **实现要点**：**占位 UI，待专项实现** — `GenericBlock`

#### clip-sink · 视频输出 `concealed`

- **功能说明**：视频终端展示。
- **输入/输出**：`clip` → 无
- **实现要点**：`apps/web/src/blocks/support/ClipSinkBlock.tsx`

---

### 5.9 GenericBlock 占位模块一览

下列 kind 在 `registry.tsx` 无专属 loader，渲染 **占位 UI，待专项实现**：

`workflow-hub`、`wallet-hub`、`param-inject`、`hub-market`、`hub-toolkit`、`vibe-workbench`、`grok-agent`、`codex-agent`、`codex-picture`、`comfy-builder`、`web-view`、`portrait-craft`、`pose-craft`、`multi-view-3d`、`panorama-flat`、`portrait-flow`、`portrait-meta`、`touch-up`

占位 UI 内容：施工图标 + hint 文案 +「标记就绪」按钮（写 `status: 'ready'`）。

---

## 6. 典型工作流 Recipes

### 6.1 文生图单链

```text
[cinema-prompt] ──prompt──▶ [prompt] ──prompt──▶ [picture-gen] ──picture──▶ [preview-sink]
```

1. `cinema-prompt` 勾选电影感 preset  
2. `prompt` 补充分镜描述（batch 模式一行一图）  
3. `picture-gen` 选模型，节点内运行  
4. 审片模式在 `picture-gen` 上 Pick Take

### 6.2 提示词批量 + picture-gen

```text
[memo / chat-model] ──▶ [text-chunker] ──▶ [prompt(batch)] ──▶ [picture-gen]
```

- `text-chunker` 切分长剧本  
- `prompt` 每 chunk 一行，`composeAction=generate`  
- `picture-gen` 自动 `resolvePromptBatch` 逐 job 调用 API

### 6.3 iterator loop 变体

```text
[prompt] ──▶ [iterator] ──▶ [picture-gen]
              ↑ loopVariants:
                日落
                夜景
                雨景
```

- `iterator` 设 `loopCount` 或填写变体行  
- 节点内点 **Cascade** 或右键 Cascade  
- `loop-executor` 按轮次更新 `content` 再跑下游

### 6.4 分镜绑定 storyboard

```text
Storyboard Shot #3 ──linkedShotId──▶ [director-desk] ──▶ [motion-story]
```

1. 故事板镜头关联 `director-desk` 节点  
2. 导演台节点内选镜头 / 生成首帧  
3. 右键「发送到故事板」回定位  
4. `data.linkedShotId` 双向写入 `shot.linkedBlockId`

### 6.5 宫格切分分配

```text
[picture-gen] ──▶ [grid-split 3×3] ──▶ [picker] ──▶ [director-desk]
```

1. 生成 contact sheet 大图  
2. `grid-split` 得 9 张子图  
3. `picker` 按索引取单格  
4. 接入各镜头 `director-desk`

### 6.6 3D 预演截图 → 生图

```text
[mesh-import] ──mesh──▶ [director-3d] ──picture──▶ [picture-gen]
                         └──prompt──▶ [prompt-studio(运镜)] ──▶ [clip-gen]
```

1. 双击 `director-3d` 摆机位截图  
2. 截图 URL 写入 `lastCaptureUrl`  
3. `picture-gen` 以截图为参考生成分镜帧

### 6.7 Review Take pick

```text
[picture-gen] ──运行多次──▶ take-store 追加 Take
                审片模式选中节点 ──▶ TakeRail 双击 pick
```

1. 切 **审片模式**  
2. 选中 `picture-gen` → 底部 TakeRail 显示候选  
3. 单击灯箱预览，**双击** pick 为主 Take（`picked=true`）  
4. `pickTake` 回写 `node.data.previewUrl` 等

**TakeRail 快捷操作（审片模式）**：最新 Take 设主版 · 对比最近两版 · 重跑模块 · 故事板网格批审

### 6.7b 审阅关卡阻塞（review-gate）

```text
[director-desk] ──▶ [review-gate] ──blocked──▶ 故事板网格批审
                              └──passed──▶ [export-pack]
```

1. 批量/Cascade 运行到 `review-gate` 时检查故事板全部 `approved`  
2. 未通过 → 节点 `status=blocked`，自动切 **审片模式** + 打开故事板网格  
3. 在故事板批审通过后，节点内 **重新检查** 或继续 Cascade  
4. 模板：`tpl-nx9-review-pipeline`

### 6.8 镜头脚本 → 导演台 → 交付（§9.4 NX9 独有）

```text
[shot-script] ──prompt,meta──▶ [director-desk] ──▶ [motion-story] ──▶ [export-pack]
```

1. `shot-script` 填写镜头表 → **写入故事板**  
2. 链至 `director-desk` 并绑定 `linkedShotId`  
3. `motion-story` 跑 Seedance 分镜链  
4. `export-pack` 打包 ZIP 交付

模板：`tpl-shot-script-desk`

### 6.9 参考板 + 角色设定 → 连贯性审片（§9.4）

```text
[reference-board] ──▶ [picture-gen] ◀── [character-sheet]
                              └──▶ [continuity-check]
```

1. `reference-board` 汇聚 mood 图与色板  
2. `character-sheet` 输出 `@角色` 一致性 prompt  
3. `picture-gen` MentionEditor 引用角色  
4. 审片模式批量跑 `continuity-check`

模板：`tpl-reference-picture`

---

## 7. 三模式差异

| 维度 | explore 探索 | produce 生产 | review 审片 |
|------|-------------|-------------|------------|
| **节点展开** | 始终完整 `BlockShell` | 默认 `CardShell` 折叠；`data.expanded` 或双击展开 | 同生产 |
| **端口显示** | 显示 | 折叠时隐藏；展开后显示 | 同生产 |
| **底部栏** | 无 Composer Deck | 无 | **TakeRail**（选中节点时） |
| **性能** | 标准 | 自动 `intensive` 分级 | 同生产 |
| **双击节点** | 聚焦（滚动画布对准） | 切换展开/收起 | 同生产 |
| **右键菜单** | 无展开项 | 有「展开/收起模块」 | 同生产 |
| **边/节点高亮** | 上游高亮可选 | DAG stale 灰显 | Take 对比时相关块高亮 |
| **CSS 类** | `nx9-stage-deck--explore` | `nx9-stage-deck--produce` | `nx9-stage-deck--review` |

**折叠卡面（CardShell）元素**：accent 点、别名/标签、状态（running/done/stale/error）、pending 计时、16:9 缩略图。

---

## 8. 实现架构简述

### 8.1 组件层次

```text
AppShell
└── StageDeckSurface (= FlowSurface variant="stage-deck")
    ├── ReactFlow 画布
    │   ├── nodeTypes ← stage-deck-node-types（CardShell 折叠包装）
    │   ├── edgeTypes.channel ← ChannelEdge
    │   ├── LaneBackground / SmartGuides
    │   └── StageDeckInteractionBridge（Knife 切线）
    ├── LensMenu / CommandPalette
    ├── PaneContextMenu / SelectionContextMenu / EdgeContextMenu
    ├── TakeRail + TakeLightboxHost（review）
    └── ModuleDock / ContextRail / ModeCapsule（chrome，AppShell 层）
```

### 8.2 关键路径

| 路径 | 职责 |
|------|------|
| `apps/web/src/engine/FlowSurface.tsx` | 画布主控：持久化、手势、菜单、spawn、运行 |
| `apps/web/src/engine/stage-deck/StageDeckSurface.tsx` | 入口薄包装 |
| `apps/web/src/engine/stage-deck/canvas/CardShell.tsx` | 生产折叠卡 + 端口着色 |
| `apps/web/src/blocks/shared/BlockShell.tsx` | 探索态节点外壳 |
| `apps/web/src/blocks/registry.tsx` | 56+ kind → 懒加载组件 / GenericBlock |
| `apps/web/src/engine/FlowContextMenu.tsx` | 三类右键菜单 |
| `apps/web/src/engine/flow-runner.ts` | 单节点/批量执行、`RUNNABLE_BLOCKS` |
| `apps/web/src/engine/stage-deck/execution/cascade-runner.ts` | Cascade 上游链执行 |
| `apps/web/src/engine/stage-deck/execution/loop-executor.ts` | Iterator 多轮循环 |
| `apps/web/src/engine/stage-deck/stores/take-store.ts` | Take 候选 CRUD、pick、灯箱 |
| `packages/shared/src/catalog/block-catalog.ts` | 模块目录 |
| `packages/shared/src/catalog/socket-registry.ts` | 端口类型与校验 |

### 8.3 数据流

```text
用户操作（节点内 UI）
    → updateNodeData / runSelected / runCascade
    → flow-runner（API proxy）
    → node.data 更新 + take-store.appendTake
    → workspace v3 持久化（nodes/edges/takes/viewMode）
```

### 8.4 连接校验

`validateLink(sourceKind, targetKind, sourceData)`：

- 同源同目标（除 `passthrough`）禁止  
- `iterator` → `preview-sink` 禁止  
- `resolveEmits` ∩ `resolveAccepts` 非空，或含 `wildcard`

---

## 9. 节点谱系发散：降低 T8 相似度 & 增强实用性

> **实施状态（2026-07-08）**：**§9.5 全阶段 ✅ · §9.4 A/B/C/D 全部落地 ✅** — 含 Prompt Studio 肖像/姿势 Tab、9 个生产节点、3 个空间扩展节点。

> **目的**：在保留 Stage Deck 独有身份（三模式、Take 审片、Cascade/Loop、故事板双向绑定、`director-3d`）的前提下，收敛与 `Reference_Projects/T8-penguin-canvas-main` 的 **1:1 节点镜像**，并把 Dock 空间让给 **NX9 差异化能力**。  
> **依据**：`packages/shared/src/catalog/block-catalog.ts` 注释已写明 *feature parity with source project, renamed identifiers*；T8 对照表见 `Reference_Projects/.../src/config/nodeRegistry.ts`。  
> **原则**：删 ≠ 丢能力 —— 优先 **合并到 Rail / 故事板 / 现有核心节点**，其次 **conceal + 迁移**，最后才 **catalog 移除**。

### 9.1 T8 ↔ NX9 映射速览

| 重合度 | 说明 | 数量级 |
|--------|------|--------|
| **极高** | kind 改名 + 端口/分类一一对应（如 `text`→`prompt`，`loop`→`iterator`） | ~45 |
| **高** | 功能同构、仅 NX9 命名/外壳不同（Hub 全家桶、Comfy/FAL/Codex/Grok） | ~12 |
| **中** | T8 隐藏、NX9 可见或实现更深（`story-grid`、`bg-remove`、`upscale-lite`） | ~5 |
| **NX9 独有** | T8 无对应或仅弱对应 | ~6 |

**NX9 独有 / 应保留并放大的节点**（差异化锚点）：

| kind | 相对 T8 的差异 |
|------|----------------|
| `director-3d` | T8 无 3D 导演台；与 `@nx9/director3d`、机位 prompt、故事板联动 |
| `scene-group` | 画布语义组框；T8 无等价物 |
| `photo-speak` | 口播视频链；T8 无专用节点 |
| `grid-prompt-reverse` | 宫格 Vision 反推；T8 无 |
| Stage Deck 三模式 + Take | 交互范式不同，非单节点但影响节点形态 |
| `director-desk` + 故事板 | 同名能力但 NX9 强调 `linkedShotId` / Take / Rail |

---

### 9.2 建议删除的节点（降低相似度）

按 **删除优先级** 排序。实施时建议：**P0 conceal → P1 工作区迁移脚本 → P2 从 catalog 移除**。

#### P0 — 建议直接移除（占位 + T8 镜像 + 无 NX9 差异化） ✅ 已标记 `deprecated`

| kind | T8 对应 | 删除理由 | 能力去向 | 迁移目标 |
|------|---------|----------|----------|----------|
| `workflow-hub` | `runninghub` | GenericBlock 占位 | Context Rail → Workflow | `passthrough` |
| `wallet-hub` | `runninghub-wallet` | 同上 | 删除 | `passthrough` |
| `hub-market` | `rh-tools` | 占位 | Rail Backlot | `passthrough` |
| `hub-toolkit` | `rh-toolbox` | 占位 | 维护者 manifest | `passthrough` |
| `vibe-workbench` | `vibex` | 占位 | 顶栏外链 | `passthrough` |
| `grok-agent` | `grok-oauth-agent` | 占位 | Integrate Rail | `passthrough` |
| `codex-agent` | `codex-cli-agent` | 占位 | 同上 | `passthrough` |
| `codex-picture` | `codex-image-conjure` | 占位 | picture-gen / Rail | `picture-gen` |
| `comfy-builder` | `comfyui-app-maker` | 占位 | dev only | `comfy-market` |
| `param-inject` | `rh-config` | 已 concealed | RH 内联表单 | `passthrough` |

**预计减少可见节点**：Hub 5 + Integrate 占位 4 = **9 个**（Dock 立刻变「干净」）。

#### P1 — 建议移除（遗留 concealed + 双项目均隐藏）

| kind | T8 对应 | 删除理由 | 能力去向 |
|------|---------|----------|----------|
| `multi-view-3d` | `multi-angle-3d` | 双端 hidden + GenericBlock | `director-3d` 多机位 / 截图 |
| `panorama-flat` | `panorama-720` | 同上 | `panorama-sphere` 或 `director-3d` 全景 |
| `portrait-flow` | `penguin-portrait` | 同上 | 故事板 + `picture-gen` 角色 |
| `portrait-meta` | `portrait-metadata` | 同上 | `CharacterBadge` / 角色库 |
| `web-view` | `browser` | 双端 hidden；安全与维护成本高 | 外链 + `link-parser` |
| `frame-sampler` | `frame-extractor` | 双端 hidden | `frame-endpoints` + `clip-editor` 时间轴抽帧 |
| `touch-up` | `edit` | 双端 hidden | `picture-gen` 内 `EditableImage` / 局部编辑 API |
| `clip-sink` | `video-output` | 与 `preview-sink` 重复 | **`preview-sink` 统一终端** |

**预计减少 catalog 条目**：**8 个**（加载时 `migrateBlockKinds()` 自动改写 `node.type`）。

#### P2 — 建议移除或合并 ✅ 已落地

| kind | 合并为 | 状态 |
|------|--------|------|
| `cinema-prompt` / `camera-prompt` / `angle-visual` / `portrait-craft` / `pose-craft` | **`prompt-studio`** | ✅ deprecated + 迁移 |
| `style-atelier` / `tag-atelier` | **`style-lab`** | ✅ |
| `topaz-picture` / `topaz-clip` | **`local-enhance`** | ✅ |
| `fal-market` / `comfy-market` | **`model-market`** | ✅ |
| `blueprint` | **`memo`** | ✅ deprecated |
| `render-slot` / `asset-bundle` | **`preview-sink`** / **`iterator`** | ✅ deprecated |
| `passthrough` | 保留 | ✅ **concealed**（CommandPalette 可唤起） |

**若执行 P2 合并**：可见 craft/support 节点可从 **13 → 4～5**，与 T8「工具箱 6 + 灵感 2」形态脱钩。

#### P3 — 慎删（有实现、用户可能依赖）

| kind | 说明 | 建议 |
|------|------|------|
| `batch-runner` | T8 `batch-processor` 镜像，但有独立 Block | 保留；或改为 **Rail 批处理抽屉** |
| `topaz-picture` / `topaz-clip` | 本地 Topaz 链 | 合并为 **`local-enhance`**（图像/视频 tab） |
| `link-parser` | T8 `aggregate-parser` | 保留；改名为 **「素材采集」** 降低 T8 用语 |
| `fal-market` / `comfy-market` | 有 partial 实现 | 合并为 **`model-market`**（FAL/Comfy 源切换） |
| `bg-remove` / `upscale-lite` | T8 隐藏、NX9 可见 | **保留** — 反而应作为 NX9 差异化快捷工具 |
| `story-grid` | T8 hidden、NX9 可见 | **保留并强化** — 绑定故事板网格审片 |

---

### 9.3 删除后的目标 catalog 轮廓（示意）

```text
素材(4)     asset-import · mesh-import · mesh-viewer · preview-sink
生成(8)     prompt · picture-gen · clip-gen · clip-editor · motion-story
            director-desk · sound-gen · chat-model · photo-speak
空间(2)     director-3d · panorama-sphere
集成(1)     model-market          ← 原 fal/comfy/grok/codex/hub 收敛
创作(3)     prompt-studio · style-lab · story-grid   ← 原 6+ craft 收敛
工具(10)    iterator · picker · text-chunker · grid-split · grid-compose
            frame-endpoints · scale-fit · picture-merge · picture-diff · local-enhance
辅助(2)     watermark-clean · sketch-pad
```

约 **30 个可见 kind**（现 57），**相似度体感下降 ~45%**，Dock 聚焦「分镜生产链」。

---

### 9.4 建议新增的节点（增强实用性 & NX9 身份）

下列节点 **T8 无直接同名物**，且与 Stage Deck（故事板、Take、三模式、3D 导演）协同。

#### A. 生产链增强（优先 P0）

| 建议 kind | 中文名 | 功能 | 端口 | 与现有模块配合 |
|-----------|--------|------|------|----------------|
| `shot-script` | 镜头脚本 | 结构化 beat/镜头表：时长、景别、对白、动作；可 **一键 spawn 故事板镜头 + director-desk** | `prompt` → `prompt,meta` | → `director-desk` → `motion-story`；Rail Storyboard 双向写 |
| `reference-board` | 参考板 | 多图/色板/字体 mood board，输出 **风格约束 prompt + 参考图集** | `picture,prompt` → `prompt,picture` | → `style-lab` / `picture-gen`；替代散落的 `asset-import` ×N |
| `character-sheet` | 角色设定 | 三视图 + 色板 + 禁止项；输出 **一致性 prompt 包** 与 `@角色` 元数据 | `picture,prompt,meta` → `prompt,meta` | → `picture-gen` MentionEditor；Backlot 角色库 |
| `continuity-check` | 连贯性检查 | 多镜头输入 → LLM/Vision **服装/光影/轴线** 差异报告 | `picture,clip,prompt` → `prompt,meta` | 审片模式批量跑；→ `director-desk` 重生成标记镜头 |
| `export-pack` | 交付打包 | 按命名规则导出选中链路的 **成片/静帧/音频/EDL** | 多类型 in → 无（文件） | `preview-sink` / Take pick 结果；Workflow ZIP 姊妹能力 |

#### B. 音视频后期（优先 P1）

| 建议 kind | 中文名 | 功能 | 端口 | 配合 |
|-----------|--------|------|------|------|
| `subtitle-burn` | 字幕烧录 | 文本/ SRT + clip → 带字幕 clip | `prompt,clip` → `clip` | `sound-gen` 对白 → `clip-editor` |
| `audio-mix` | 音频混音 | 多轨 ducking、响度归一 | `sound` ×N → `sound` | → `clip-editor` |
| `color-grade` | 调色 | LUT / 曲线 / 品牌色约束 | `picture,clip` → 同型 | 审片 Take 对比前后 |
| `beat-sync` | 节拍对齐 | 音频 beat 检测 → **时间码 meta** 驱动 clip 切点 | `sound,clip` → `clip,meta` | MV / 广告节奏化剪辑 |

#### C. 工作流与协作（优先 P1～P2）

| 建议 kind | 中文名 | 功能 | 说明 |
|-----------|--------|------|------|
| `variant-fork` | 方案分叉 | 复制子图并标记 A/B，Take 侧对比 | 差异化 **审片 + Cascade** |
| `review-gate` | 审阅关卡 | 运行到此暂停，Rail 弹 Take 决策后继续 | 把 **review 模式** 嵌入 DAG |
| `recipe-spawn` | 配方一键 | 从 Rail Recipe 在光标处生成标准子图 | 替代 T8 式「堆节点」上手路径 |
| `prompt-diff` | Prompt 对比 | 多路上游 prompt diff + 合并建议 | → `prompt` batch 行 |
| `asset-watch` | 素材监听 | 文件夹/URL 变更触发下游重跑 | 批广告、连载更新 |

#### D. 3D / 空间扩展（优先 P2，强化现有 `director-3d`）

| 建议 kind | 中文名 | 功能 | 说明 |
|-----------|--------|------|------|
| `blocking-stage` | 场面调度 | 简化 3D 人形/blocking，输出机位序列 | 轻量版 `director-3d`，非 T8 路线 |
| `light-rig` | 灯光方案 | HDRI / 三点光 preset → prompt + 截图 | → `picture-gen` 光影一致 |
| `depth-pass` | 深度通道 | mesh/图 → depth/normal 图供 ControlNet 类模型 | 技术向，与 `mesh-viewer` 分工 |

---

### 9.5 新增 vs 删除：决策矩阵

| 维度 | 多删 T8 镜像 | 多增 NX9 专属 |
|------|--------------|---------------|
| Dock 认知负担 | ↓ 节点少、上手快 | ↑ 需 Recipe / Rail 引导 |
| 与 T8 相似度 | ↓↓ | ↓↓ |
| 分镜/审片叙事 | 中性 | ↑↑ |
| 实现成本 | 低（删占位）～中（合并 UI） | 中～高（新 runner + Rail） |
| 旧工作区兼容 | 需 kind 映射表 | 新 kind 无负担 |

**推荐组合**：

1. **短期（1 迭代）**：P0 删除 9 个 Hub/Integrate 占位 + P1 清理 8 个 concealed legacy。  
2. **中期（2～3 迭代）**：P2 合并 craft → `prompt-studio` + `style-lab`；Topaz 双节点 → `local-enhance`。  
3. **长期**：落地 §9.4 中 **P0 新增 5 节点**（`shot-script`、`reference-board`、`character-sheet`、`continuity-check`、`export-pack`），并在 §6 Recipes 写专用链路。

---

### 9.6 实施要点（简单方案）

| 步骤 | 做法 | 状态 |
|------|------|------|
| **1. Catalog 分层** | `deprecated` / `concealed` / `nx9Native`；Dock 只显示 `getDockBlocks()`（~28） | ✅ |
| **2. 加载兼容** | `registry.tsx` + `GenericBlock` + `studioEmbed` 嵌入面板 | ✅ |
| **3. 工作区迁移** | `migrateBlockKinds()` + `MIGRATION_PATCHES`（含 tab 字段） | ✅ |
| **4. 文档同步** | §9 / §6 Recipe / 附录 | ✅ |
| **5. 验收** | Dock **28**；CommandPalette spawnable **~54**；空画布 Recipe 入口；≥6 条 NX9 Recipe | ✅ |

**T8 1:1 建议刻意保留的核心链**（删了会伤基本产能，仅 rename/UX 差异化）：

`asset-import` · `prompt` · `picture-gen` · `clip-gen` · `sound-gen` · `chat-model` · `iterator` · `director-desk` · `preview-sink`

其余尽量 **合并、移 Rail、或 NX9 原生替换**。

---

## 附录 A：RUNNABLE_BLOCKS 可执行清单

下列 kind 可被「运行选中」/ Cascade 调度（`flow-runner.ts`）。

`prompt`、`picture-gen`、`clip-gen`、`chat-model`、`sound-gen`、`passthrough`、`preview-sink`、`director-desk`、`director-3d`、`grid-split`、`grid-compose`、`story-grid`、`memo`、`asset-import`、`text-chunker`、`iterator`、`picker`、`clip-editor`、`frame-endpoints`、`scale-fit`、`picture-merge`、`link-parser`、`prompt-studio`、`style-lab`、`local-enhance`、`model-market`、`batch-runner`、`grid-prompt-reverse`、`photo-speak`、`bg-remove`、`upscale-lite`、`watermark-clean`、`motion-story`、`shot-script`、`reference-board`、`character-sheet`、`continuity-check`、`export-pack`、`subtitle-burn`、`audio-mix`、`color-grade`、`beat-sync`、`review-gate`、`variant-fork`、`prompt-diff`、`blocking-stage`、`light-rig`、`depth-pass`

---

## 附录 B：concealed / deprecated 模块

**P0 deprecated（Hub/Integrate 占位）**：

`workflow-hub`、`wallet-hub`、`hub-market`、`hub-toolkit`、`vibe-workbench`、`grok-agent`、`codex-agent`、`codex-picture`、`comfy-builder`、`param-inject`

**concealed + deprecated（P1）**：

`param-inject`、`web-view`、`frame-sampler`、`touch-up`、`clip-sink`、`multi-view-3d`、`panorama-flat`、`portrait-flow`、`portrait-meta`

**P2 合并后 deprecated（加载时迁移 + tab 补丁）**：

`cinema-prompt`、`camera-prompt`、`angle-visual`、`portrait-craft`、`pose-craft`、`style-atelier`、`tag-atelier`、`topaz-picture`、`topaz-clip`、`fal-market`、`comfy-market`、`blueprint`、`render-slot`、`asset-bundle`

**concealed（CommandPalette 可 spawn，Dock 不显示）**：

`mesh-import`、`mesh-viewer`、`light-rig`、`depth-pass`、`subtitle-burn`、`audio-mix`、`color-grade`、`beat-sync`、`variant-fork`、`recipe-spawn`、`prompt-diff`、`asset-watch`、`model-market`、`grid-prompt-reverse`、`local-enhance`、`sketch-pad`、`picture-diff`、`frame-endpoints`、`picker`、`scale-fit`、`picture-merge`、`upscale-lite`、`link-parser`、`batch-runner`、`watermark-clean`、`panorama-sphere`、`passthrough`

**仅 concealed + deprecated**：见上表 P1 项。

迁移表：`packages/shared/src/catalog/migrate-block-kinds.ts`（含 `BLOCK_KIND_MIGRATION_PATCHES`）

---

## 附录 C：模块统计（§9 全阶段 + Dock 收敛后）

| 分类 | Dock 可见 | palette 可 spawn | deprecated | catalog 合计 |
|------|-----------|------------------|------------|--------------|
| source | 2 | 5 | 2 | 7 |
| generate | 10 | 12 | 0 | 12 |
| spatial | 2 | 5 | 2 | 7 |
| hub | 0 | 0 | 6 | 6 |
| integrate | 0 | 1 | 5 | 6 |
| craft | 6 | 8 | 7 | 15 |
| utility | 6 | 20 | 2 | 22 |
| support | 2 | 5 | 4 | 9 |
| **合计** | **28** | **~54** | **32** | **87** |

- **Dock 可见** = `getDockBlocks()`（ModuleDock / LensMenu / 连线拖放菜单）
- **palette 可 spawn** = `getSpawnableBlocks()`（CommandPalette，含 concealed）
- **空画布入口**：`RecipePickerOverlay` 展示精选 Recipe（默认 `tpl-nx9-character-pipeline`）
- **nx9Native** 标记：`director-3d`、`blocking-stage`、`light-rig`、`depth-pass`、`photo-speak`、`story-grid`、`grid-prompt-reverse`、`prompt-studio`、`style-lab`、`local-enhance`、`model-market`、`shot-script`、`reference-board`、`character-sheet`、`continuity-check`、`export-pack`、`subtitle-burn`、`audio-mix`、`color-grade`、`beat-sync`、`variant-fork`、`review-gate`、`recipe-spawn`、`prompt-diff`、`asset-watch`

另：**scene-group** 为画布专用节点，不计入 catalog。**recipe-spawn** / **asset-watch** 以 UI 交互为主，未列入 RUNNABLE_BLOCKS。

---

*本文档随 `BLOCK_CATALOG` 与 Stage Deck 实现演进更新；占位模块实现后请替换对应 §5 小节并移除 GenericBlock 标注。节点增删以 §9 为规划参考，落地时需同步迁移脚本与 Recipe。*
