# NX9 Storyboard First 重构方案（基于事实文档）

> **文档性质**：产品架构 + 前端架构 + 交互设计 · 可执行重构蓝图（仅文档，不含代码改动）  
> **审计基线**：2026-07-10 · 仓库 `f:\code\project\NX9`  
> **事实来源**：`Product Optimization.md` · `docs/NX9-PROJECT-FULL-INVENTORY-AND-GAP-ANALYSIS.md` · `docs/NX9-PRODUCT-REFACTOR-SPEC.md` · `docs/NX9-CAPABILITY-AUDIT-SPEC.md` · `需求.txt` · 当前代码（`AppShell.tsx` · `FlowSurface.tsx` · `StoryboardCanvasView.tsx` · `ModuleDock.tsx` · `CanvasFlowRail.tsx` · `playbook-definitions.ts`）  
> **核心约束**：Infinite Canvas 不可移除；Storyboard 与 Workflow **互斥**、**共享同一无限画布**；目标是把现有 ~73% 工程能力串成 ~可用 的产品体验，而非堆新功能。

---

## 执行摘要

| 维度 | 现状 | 目标 |
|------|------|------|
| 工程/能力层 | ~73% | 维持，优先「串起来」 |
| 产品体验层 | ~42% | P0 四周内达到「新手能走完 13 步闭环」 |
| 用户心智 | 「我在配 AI 工作流」 | 「我在写一部漫剧，当前第 X 步」 |
| 画布心智 | 节点链 + 侧栏表单 | Storyboard 默认：场次/镜头卡片；Workflow 可选：节点链 |

**一句话方向**：把 `StoryboardCanvasView`（已存在）提升为**默认画布渲染层**，把 `ModuleDock` + XYFlow 节点链折叠为**设置可开的 Workflow 高级视图**；用 `playbook-definitions.ts` + `playbook-readiness.ts` 作为步骤 SSOT，补齐 auto-advance、六态步骤条、任务中心与项目状态。

---

# 第一部分：产品定位 / UI 问题与重构建议

## 1.1 问题分析：为什么当前 UI 仍像 Workflow 编辑器

### 1.1.1 视觉与信息架构层面的根因

依据 `NX9-PROJECT-FULL-INVENTORY-AND-GAP-ANALYSIS.md` 六大根因（R1–R6）与 `AppShell.tsx` 实际挂载情况：

| 现象 | 用户感知 | 代码/文档证据 |
|------|----------|---------------|
| 首屏同时出现 WorkspaceRail、ModuleDock、XYFlow 节点、Context Rail、StudioTopBar 多按钮 | 「不知道先点哪里」 | `AppShell.tsx` 同时挂载 10+ 面板/抽屉；Dock 目录 38 项默认可见（`block-catalog.ts`） |
| 画布主视觉是横向 13 个 Block 节点 + 连线 | 「我在搭流程，不是在写剧」 | `tpl-pipeline-13-*` replace 模板；Workflow 模板 30 个 |
| 故事内容在 Rail/Panel，生产在画布节点 | 「剧本写完了，下一步去哪？」 | `workspace-document`（Story）与 `flow-runner`（节点执行）双轨 |
| 步骤条 `CanvasFlowRail` 与节点/ Rail 状态可能不同步 | 「步骤是假的装饰」 | 四态 CSS 为主；readiness 与 `currentStepId` 分离维护 |
| 技术词汇裸露（Node、Workflow、Prompt、Execute、Provider） | 「这是给工程师用的」 | `NX9-PRODUCT-REFACTOR-SPEC.md` §2.2 用户词典未全量落地 |
| 无项目首页、无任务中心、无项目状态 | 「不知道进度、失败在哪」 | `HomeDashboard.tsx` 未挂载；`TaskCenterPanel` partial；`projectStatus` 缺失；`queue` 未注册 |

### 1.1.2 「30 秒测试」当前结论

> 新用户打开 http://127.0.0.1:5173 → 自动创建「默认工作区」→ 看到 WorkspaceRail + ModuleDock + 空/乱画布 + 顶栏多按钮。

**不能通过**「我在写漫剧第 X 步」测试（`NX9-PRODUCT-REFACTOR-SPEC.md` §1.2 P6）。  
缺：默认 Storyboard 视图、步骤驱动首屏、降噪文案、单一主 CTA。

### 1.1.3 已有但未产品化的能力（可复用，非新建）

| 能力 | 位置 | 现状 |
|------|------|------|
| Storyboard 画布视图 | `StoryboardCanvasView.tsx` + `FlowSurface.tsx` `canvasView` | 存在，但需手动点「📋 故事板 / 🔀 流程图」切换，**非默认** |
| Playbook 步骤定义 | `playbook-definitions.ts` | 13/11 步完整，含 `canvasNodeKinds`、`readinessKey` |
| 步骤视觉七态枚举 | `playbook-step-visual.ts` | 类型已定义 `error/waiting/skipped`，UI 未全量渲染 |
| ModuleDock 按当前步过滤 | `ModuleDock.tsx` `STEP_KINDS` | Playbook 激活时 Dock 默认收起，但 Storyboard 模式下仍占位 |
| 环境多参考图 | `EnvironmentBiblePanel` · `referenceUrls` ≤6 | ✅ 已实现（`需求.txt` #1） |
| 13 步模板单链 | `tpl-pipeline-13-3d/live` | 模板层 13 节点 12 边已修复；旧工作区/E2E 未自动化 |

---

## 1.2 重构建议：Storyboard First 产品定位

### 1.2.1 统一定位（对外 / 对内）

```text
对外：AI 漫剧创作工作室（AI Story Studio）
对内：Story-first UI（默认） + Workflow Engine（底层，可开关）
```

- **Storyboard**：默认新手模式。第一次进入、选 Playbook 后，**默认且持续**停留在 Storyboard，除非用户在设置中开启 Workflow 高级视图并主动切换。
- **Workflow**：高进阶模式。保留 Block 目录 100 kinds、ModuleDock 38 项、XYFlow 节点编辑、CommandPalette、Recipe 等。**不删除**，默认关闭/隐藏。
- **Infinite Canvas**：两种视图共享 `StageDeckSurface` / `FlowSurface` 同一画布容器与视口（pan/zoom）；仅**渲染层**互斥：
  - Storyboard 层：`StoryboardCanvasView`（按 `sceneCode` 分组 Shot 卡片）
  - Workflow 层：XYFlow 节点 + 边（`tpl-pipeline-*` 单链或自由模式自建）

### 1.2.2 视图互斥规则（强制）

| 规则 | 说明 |
|------|------|
| **互斥** | 同一时刻只渲染 Storyboard **或** Workflow 之一 |
| **共享** | 同一 `workspace-document`、同一 Playbook Session、同一 Take Store |
| **默认** | 新用户 / 新工作区 / 选 Featured Playbook → `canvasView = 'storyboard'` |
| **切换** | Workflow 仅在「设置 → 高级创作 → 启用 Workflow 视图」为 ON 时，顶栏出现切换入口 |
| **自由模式** | `pb-blank-advanced`：无步骤条时默认 Workflow；可用 `PipelineCapsule` 迷你进度（已有） |

### 1.2.3 用户词典（UI 文案强制替换）

来源：`NX9-PRODUCT-REFACTOR-SPEC.md` §2.2，落地范围 = 所有用户可见文案（顶栏、Rail、Block 标签、Toast、步骤条 Tooltip）。

| 禁止（工程术语） | 改为（用户心智） | 适用范围 |
|------------------|------------------|----------|
| Node / 节点 | **步骤模块** / **制作步骤** | 画布、Dock、Inspector |
| Workflow | **创作流程** / **高级流程编辑** | Launcher、设置 |
| Prompt | **AI 描述** | Block、Rail |
| Asset | **素材** | 库、导出 |
| Execute / Run | **开始生成** | 按钮 |
| Dependency | （不展示） | 仅开发者日志 |
| Provider | **AI 模型** | 设置抽屉 |
| Pipeline | **制作进度** | 步骤条 |
| Playbook | **创作模式** | Launcher |
| Take | **生成结果** | TakeRail |
| Block kind | （不展示 kind 字符串） | 仅显示中文 label |

### 1.2.4 四层 UI 与默认可见性

来源：`NX9-PRODUCT-REFACTOR-SPEC.md` §4.1，结合 Storyboard First 调整：

| 层 | Storyboard 默认 | Workflow 高级模式 |
|----|-----------------|-------------------|
| **Story** | PlaybookLauncher、CanvasFlowRail、Context Rail（当前步 Tab） | 同左 + 可聚焦对应节点 |
| **Production** | 当前步解锁的生成/审阅（picture-gen、review、Episode Studio） | 全节点可 Run |
| **Asset** | Backlot / Library Rail（按步打开 character/environment） | 全库 |
| **Engine** | **隐藏** | ModuleDock 38 项 + Inspector 全量 + CommandPalette |

**Storyboard 首屏目标控件 ≤7**（`TEST-PO-P0-002`）：

1. 项目名称 / 工作区标题  
2. CanvasFlowRail（当前步 + 制作进度）  
3. NextStepBanner 主 CTA（1 个）  
4. Context Rail 当前步面板（如 Script / 分镜 / 环境）  
5. 设置（含 API Key 入口）  
6. 任务进度指示（批量生成时，来自 `ProductionProgressWall` 或 Task Center 摘要）  
7. （可选）Undo  

其余全部折叠、移入设置或 Workflow 模式。

---

## 1.3 应删除 / 隐藏 / 折叠 / 合并 / 保留 入口清单

**图例**：🗑 删除 · 👁‍🗨 默认隐藏 · 📁 折叠 · 🔀 合并 · ✅ 保留

### 1.3.1 Storyboard 默认必须隐藏或折叠

| 入口 | 处置 | 原因 | 高级模式 |
|------|------|------|----------|
| **ModuleDock**（38 项） | 👁‍🗨 Storyboard 下**不渲染**；Workflow 下 ✅ 保留 | R2 信息过载；新手应跟步骤条走 | 设置「启用 Workflow 视图」后显示 |
| **FlowSurface 浮动「故事板/流程图」按钮** | 📁 移入设置；Storyboard 默认无此按钮 | 避免新手误切 Workflow | Workflow 模式下可保留切换回 Storyboard |
| **StudioTopBar · 批量 Run** | 👁‍🗨 Storyboard 隐藏 | 应对应当前步 `primaryAction`，非全局 Run | Workflow 显示 |
| **StudioTopBar · Workflow 模板按钮** | 🔀 合并至 Library Rail · workflow 子 Tab | `PO-UI-003` 已规划 | Workflow 可从 Rail 访问 |
| **StudioTopBar · Skills 抽屉** | 👁‍🗨 默认隐藏 | Engine 层；普通创作用不到 | 设置「Skill 编辑」开关 |
| **StudioTopBar · Remotion 预览** | 📁 合并至 Episode Studio 步 ⑪ 内 | 避免顶栏堆叠 | 步 ⑪ 内打开 |
| **StudioTopBar · 用量面板** | 📁 移入设置 | 非创作主路径 | 设置内 |
| **InspectorRailPanel · 节点原始 JSON/ kind** | 👁‍🗨 Storyboard 不展示 Inspector | 工程术语 | Workflow 完整 Inspector |
| **CommandPalette（Cmd+K）** | 👁‍🗨 Storyboard 禁用或仅搜索「当前项目内容」 | 不应 spawn 任意 Block | Workflow 全功能 |
| **RecipePickerOverlay / RecipeSpawn** | 👁‍🗨 Storyboard 隐藏 | 进阶配方 | Workflow + 自由模式 |
| **CanvasAppearancePanel 浮动入口** | 📁 已在 SettingsDrawer | — | 设置 |
| **LogPanel 底栏** | 📁 折叠为 Dock 小图标（已有 `LogDockButton`） | 保留调试，不占首屏 | 同 |
| **TakeRail** | 📁 Storyboard 下合并进 Shot 卡片缩略图 | 避免双轨预览 | Workflow 保留 TakeRail |
| **CompareLightbox / GridGeneratePanel** | 📁 按步出现（审帧/宫格步） | 渐进披露 | Workflow 常显 |

### 1.3.2 互斥 / 合并关系

| A | B | 关系 | 处置 |
|---|---|------|------|
| **StoryboardPanel**（全屏 B） | **StoryboardRailPanel** | 🔀 重复 | Storyboard 默认只用 Rail Tab；全屏 Panel 仅快捷键 B，且与 Rail 同源数据 |
| **StoryboardCanvasView** | **XYFlow 节点链** | **互斥渲染** | 同一画布容器，二选一 |
| **CanvasFlowRail**（Playbook 步） | **PipelineCapsule**（自由模式） | 互斥 | 有 Playbook 显示 Rail；`pb-blank-advanced` 显示 Capsule |
| **NextStepBanner** | **InspectionPanel** | 同源 SSOT | 均读 `playbook-readiness` + `currentStepId` |
| **BacklotLibraryPanel** | **Library Rail · templates/character** | 🔀 合并入口 | Storyboard 按步打开 Rail 子 Tab；Backlot 全屏为进阶 |
| **ProductionProgressWall** | **TaskCenterPanel** | 🔀 合并 | P0 统一为 Task Center Rail Tab + 顶栏摘要 |

### 1.3.3 保留但降噪的入口

| 入口 | 模式 | 默认 | 说明 |
|------|------|------|------|
| PlaybookLauncherOverlay | Storyboard | ✅ 空画布弹出 | 选模式后 replace 模板 + 进入 Storyboard |
| CanvasFlowRail | Storyboard | ✅ 画布中央顶部 | 按模式 13/11/7/… 步动态展示 |
| Context Rail | Storyboard | ✅ 当前步 Tab 自动打开 | `primaryAction.open_rail` |
| SettingsDrawer | 全局 | ✅ 折叠 | API Key 必填提示友好化 |
| WorkspaceRail | 全局 | 📁 可收窄 | 多项目；P2 接 HomeDashboard |
| EpisodeStudioPanel | Storyboard 步 ⑪ | 按步 | 成片预览 |
| Director3dPanel | 3D 步 ⑥ | 按步 | 3D 机位 |
| AssetLibraryPanel | Asset | 📁 Library Rail 优先 | 顶栏入口降级 |

### 1.3.4 不应删除的能力（仅 conceal）

| 能力 | 原因 |
|------|------|
| ModuleDock 38 + concealed 34 | 高阶用户自由模式、自定义链；`block-catalog.ts` 已标记 concealed |
| 30 个 Workflow 模板 | Library · workflow 子 Tab |
| flow-runner / cascade / review-gate | 生产引擎核心 |
| CommandPalette | Workflow 模式 |
| `pb-blank-advanced` 自由模式 | 进阶用户空白画布 |
| Comfy / FAL / Skills | 设置开关，默认 conceal |

### 1.3.5 设置项（需新增，名称用通用概念）

在现有 `SettingsDrawer` 增加 **「创作偏好」** 分组：

| 设置项 | 默认 | 说明 |
|--------|------|------|
| 默认画布视图 | Storyboard | 新工作区默认 |
| 启用 Workflow 高级视图 | OFF | 开启后才显示 ModuleDock + 节点链 + 视图切换 |
| 显示 Engine 调试信息 | OFF | Log、kind、Runner 状态 |
| 步骤完成自动前进 | ON | 控制 auto-advance |
| 生成任务通知 | ON | Task Center Toast |

持久化：写入现有 `WorkspacePayload` / 用户 settings JSON（不新增 API 名，沿用 `settings` 模块）。

---

# 第二部分：13 步流程断链点与 auto-advance 设计

## 2.1 问题分析：当前断链根因

| 类型 | 表现 | 证据 |
|------|------|------|
| 步骤与画布脱节 | 步骤条亮但节点未连/顺序乱 | 旧工作区；E2E MANUAL（`TEST-PIPE-UX-E2E-001`） |
| auto-advance 不完整 | 剧本保存后不跳步 ② | `ScriptStudioPanel` 部分调用 `advancePlaybookStep`；`use-playbook-auto-advance` 存在但非全步骤覆盖 |
| readiness 真但 UX 假 | 环境缺参考图 readiness false，用户不知去哪 | `EnvironmentBiblePanel` 有面板，无步骤条强制 CTA |
| 错误态不足 | 关键帧失败仅 blocked，非 error 红态 | `CanvasFlowRail` CSS 四态为主 |
| 生产范围错误 | 视频步跑全剧 | GAP-007 `motion-story` |
| Stub 断链 | 导出/Remotion/HF | GAP-003/004/009 |

---

## 2.2 逐步说明（13 步 · 真人 / 3D 共用，⑥⑨ 有差异）

**SSOT**：`packages/shared/src/data/playbook-definitions.ts` · `playbook-readiness.ts`

### 步 ① 剧本 · `script`

| 项 | 内容 |
|----|------|
| 作用 | 录入故事原文，作为全链路输入 |
| 输入 | 用户粘贴文本 / AI 编剧（Script Studio） |
| 输出 | `scriptPlan.sourceText` |
| 完成条件 | `has_source_text` → sourceText 非空 |
| 画布节点 | `shot-script`（Workflow 可见；Storyboard 不强调节点） |
| 易断链 | 未配置 Settings API Key → 后续 AI 步全失败 |
| UI 反馈 | 进行中：Rail Script 编辑；完成：步条 ✓；错误：API Key 缺失 → 步条 ⚠ + Inspection CTA「去设置 AI 模型」 |
| auto-advance | **自动**：debounce 保存成功且 sourceText 非空 → `advancePlaybookStep` + 打开步 ② Tab |

### 步 ② 场次 · `scene-split`

| 项 | 内容 |
|----|------|
| 作用 | AI 拆分场次，写入 `scriptPlan.scenes` |
| 输入 | sourceText |
| 输出 | ≥1 个 `SceneSplitRecord` |
| 完成条件 | `has_scene_split` |
| 画布节点 | `text-chunker` |
| 易断链 | 用户未点「确认写入」；拆场 API 失败无 error 步态 |
| UI | 等待：显示场次预览待确认；完成：✓；错误：红态 + 重试 |
| auto-advance | **半自动**：AI 拆场完成后 **等待用户确认** → 确认写入后自动进步 ③ |

### 步 ③ 分镜 · `storyboard`

| 项 | 内容 |
|----|------|
| 作用 | 生成分镜表，写入 `storyboard.shots`（≥3 镜） |
| 输入 | scenes + sourceText |
| 输出 | shots 列表 |
| 完成条件 | `has_storyboard_shots` |
| 画布节点 | `story-grid` |
| 易断链 | story-grid 与 storyboard 弱绑定（GAP-014）；用户只在 Rail 编辑未物化 |
| UI | Storyboard 画布显示空态「去生成分镜」；完成后 Scene 泳道出现 |
| auto-advance | **半自动**：分镜表写入且 ≥3 镜 → 自动进步 ④ + Storyboard 画布刷新 |

### 步 ④ 角色 · `character-bible`

| 项 | 内容 |
|----|------|
| 作用 | 主角 Bible + 参考图 |
| 输入 | 剧本提取 / 手动 |
| 输出 | `characters` ≥1 主角有 appearance 或 referenceImageUrl |
| 完成条件 | `has_character_bibles` |
| 画布节点 | `character-sheet` |
| 易断链 | 用户跳过参考图；picture-gen 后续 @角色失效（GAP-005） |
| UI | 人物卡（非表单）；缺参考图步条 `!` |
| auto-advance | **等待确认**：用户点「角色准备好了」或 readiness 满足 → 进步 ⑤ |

### 步 ⑤ 环境 · `environment-bible`

| 项 | 内容 |
|----|------|
| 作用 | 环境设定卡 + **多参考图**（≤6，`referenceUrls`） |
| 输入 | 场次 |
| 输出 | `environments` ≥1 且含参考图 |
| 完成条件 | `has_environment_bibles`（含 referenceUrls） |
| 画布节点 | `scene-card` |
| 易断链 | **高频**：用户不知去 Library/环境卡上传（`需求.txt` 已修复能力，UX 未强制引导） |
| UI | 场景卡网格上传；步条 `!` + Tooltip「缺少场景参考图」+ 一键打开 EnvironmentBiblePanel |
| auto-advance | readiness 满足 → 自动进步 ⑥（`EnvironmentBiblePanel` 已有 advance 调用） |

### 步 ⑥ 机位 · `camera-3d` / `camera-live`

| 项 | 内容 |
|----|------|
| 作用 | 3D：Director3D 摆位；真人：导演台关联镜头 |
| 输入 | shots |
| 输出 | ≥50% 镜有 `linkedBlockId` |
| 完成条件 | `has_camera_blocks` |
| 画布节点 | `director-3d` / `director-desk` |
| 易断链 | **手动关联 linkedBlockId**；真人需 merge `tpl-shot-script-desk` |
| UI | 3D 打开 Director3dPanel；真人 Rail 提示「关联镜头」清单 |
| auto-advance | **等待确认**：linked 比例达标后用户确认或自动检测 → 进步 ⑦ |

### 步 ⑦ 关键帧 · `keyframe-gen`

| 项 | 内容 |
|----|------|
| 作用 | 批量 picture-gen 生成首帧 |
| 输入 | 角色/环境/分镜 prompt |
| 输出 | ≥80% 镜 `firstFrameAssetId` |
| 完成条件 | `has_keyframes` |
| 画布节点 | `picture-gen` |
| 易断链 | 批量失败无 error 步态；无角色/环境时 Run 不应可点（PO-NODE-001） |
| UI | Task Center 显示进度；失败镜 Shot 卡片红框；步条 error |
| auto-advance | **自动**：批量完成且达标 → 进步 ⑧；部分失败 → error 态不前进，CTA「重试失败镜头」 |

### 步 ⑧ 关键帧审阅 · `keyframe-review`

| 项 | 内容 |
|----|------|
| 作用 | 全部 keyframeStatus = approved |
| 输入 | 关键帧 Take |
| 输出 | 审阅通过 |
| 完成条件 | `all_keyframes_approved` |
| 画布节点 | `review-gate` |
| 易断链 | 用户不知进 review 模式 |
| UI | 切换 `viewMode=review`；Shot 卡片批审 |
| auto-advance | **等待确认**：全部 approved → 进步 ⑨ |

### 步 ⑨ 视频 · `video-gen`

| 项 | 内容 |
|----|------|
| 作用 | 3D：`motion-story`；真人：`clip-gen` |
| 输入 | 已审关键帧 |
| 输出 | ≥1 镜 videoAssetId |
| 完成条件 | `has_video_assets` |
| 易断链 | GAP-007 跑全剧；API 失败 |
| UI | Task Center；步条 error + 「换 AI 模型」 |
| auto-advance | 生成达标 → 进步 ⑩；**必须先修 GAP-007 限定当前镜/节点 scope** |

### 步 ⑩ 连贯 · `consistency`

| 项 | 内容 |
|----|------|
| 作用 | continuity-check，无 open issues |
| 完成条件 | `consistency_resolved` |
| auto-advance | 无 issue 或用户跳过 optional → 进步 ⑪ |

### 步 ⑪ 成片 · `episode-studio`

| 项 | 内容 |
|----|------|
| 作用 | Episode Studio 时间线预览 |
| 完成条件 | `has_video_takes` |
| 易断链 | Remotion 服务端 stub（GAP-003）；降级播放 |
| auto-advance | 时间线可播放 → 进步 ⑫ |

### 步 ⑫ 门控 · `review-gate`

| 项 | 内容 |
|----|------|
| 作用 | 全部 videoStatus = approved |
| 完成条件 | `all_videos_approved` |
| auto-advance | **等待确认** 批审通过 → 进步 ⑬ |

### 步 ⑬ 导出 · `export`

| 项 | 内容 |
|----|------|
| 作用 | export-pack 导出 |
| 完成条件 | `export_ready` |
| 易断链 | GAP-004 HF/Remotion 分支 stub |
| auto-advance | 导出成功 → `projectStatus = exported` + 庆祝 UI |

---

## 2.3 11 步动漫 · 与 13 步差异

来源：`pb-anime` · `tpl-pipeline-11-anime`

| 对比 | 13 步（3D/真人） | 11 步（动漫） |
|------|------------------|---------------|
| 步数 | 13 | 11 |
| 机位步 | ⑥ camera-3d / camera-live | **无** |
| 成片步 | ⑪ episode-studio | **无** |
| 视频节点 | motion-story / clip-gen | clip-gen |
| 步序 | ①–⑬ | ①–⑤ 同；⑥=keyframe-gen … ⑪=export |
| 模板 | tpl-pipeline-13-* | tpl-pipeline-11-anime |

**统一规则**：`CanvasFlowRail` 读取 `PLAYBOOK_DEFINITIONS[playbookId].steps.length` 动态渲染，不硬编码 13。

---

## 2.4 自由模式 · `pb-blank-advanced`

| 项 | 内容 |
|----|------|
| 步骤条 | 无 13 步；显示 `PipelineCapsule`（已有） |
| 默认视图 | **Workflow**（用户自选节点） |
| ModuleDock | 设置开启后全量 38 项 |
| auto-advance | 不适用；无 readiness 驱动 |

---

## 2.5 步骤 UI 六态（统一反馈）

来源：`playbook-step-visual.ts` 已定义，需在 `CanvasFlowRail` **全量渲染**：

| 态 | 含义 | 视觉 | 典型场景 |
|----|------|------|----------|
| `done` | 已完成 | 绿/✓ | readiness true |
| `current` | 当前步 | 高亮/脉冲 | index === currentStepId |
| `waiting` | 等待用户确认 | 黄/… | 拆场待确认、审阅待批 |
| `error` | 失败可修复 | 红/! | 生成失败、API 错误 |
| `blocked` | 前置未完成 | 灰/锁 | index > current 且前置未 ready |
| `future` | 未到达 | 淡灰 | 后续步 |
| `skipped` | 可选跳过 | 虚线 | optional 步 |

**节点侧对齐**：Block `data.executionStatus` 与当前步 `canvasNodeKinds` 映射；Run 失败 → 写 `playbookSession.failedStepIds` → 步条 error。

---

## 2.6 SSOT：步骤状态 = 画布状态

```text
playbook-definitions.ts (步定义 + canvasNodeKinds)
        ↓
playbook-readiness.ts (20 readinessKey)
        ↓
workspace-document.playbookSession (currentStepId, failed/waiting/skipped)
        ↓
evaluateAllStepVisualStates() → CanvasFlowRail / NextStepBanner / InspectionPanel
        ↓
flow-runner 写回 block.data.executionStatus + storyboard.shots.*Status
```

**禁止**：UI 组件各自计算「是否完成」。  
**允许**：`use-playbook-auto-advance` 订阅 readiness 变化，统一调用 `advancePlaybookStep(ctx)`。

---

## 2.7 最小可行 auto-advance 规则（P0 可落地）

| # | 触发事件 | 条件 | 动作 | 人工/自动 |
|---|----------|------|------|-----------|
| A1 | scriptPlan 持久化 | `has_source_text` | 进步 ② + 打开 scene-split Tab | 自动 |
| A2 | 场次确认写入 | `has_scene_split` | 进步 ③ + 打开 storyboard Tab | 确认后自动 |
| A3 | shots 写入 | `has_storyboard_shots` | 进步 ④ + Library character | 自动 |
| A4 | 角色 readiness | `has_character_bibles` | 进步 ⑤ | 自动或点「下一步」 |
| A5 | 环境 readiness | `has_environment_bibles` | 进步 ⑥ | 自动 |
| A6 | 机位 linked 比例 | `has_camera_blocks` | 进步 ⑦ | **确认** |
| A7 | 批量 picture-gen 结束 | `has_keyframes` | 进步 ⑧ | 自动；失败 → error 不前进 |
| A8 | 全部 keyframe approved | `all_keyframes_approved` | 进步 ⑨ | 确认后自动 |
| A9 | 视频生成结束 | `has_video_assets` | 进步 ⑩ | 自动 |
| A10 | consistency 无 open | `consistency_resolved` | 进步 ⑪（13 步）或 ⑩（11 步） | 自动/跳过 |
| A11 | 时间线可播 | `has_video_takes` | 进步 ⑫ | 自动 |
| A12 | 视频全 approved | `all_videos_approved` | 进步 ⑬ | 确认后自动 |
| A13 | export 成功 | `export_ready` | projectStatus=exported + Toast | 自动 |

**防抖**：沿用手 `use-playbook-auto-advance` 的 `setTimeout` 300ms，避免输入中误触。

**失败处理**：任何 Run 失败 → `failedStepIds.add(currentStepId)` → 步条 error + Inspection 展示 gateway lastError + 「重试」。

---

## 2.8 避免「步骤条与节点不对应、连线不通、顺序乱」

| 措施 | 说明 |
|------|------|
| Playbook 选用 replace 模板 | `bootstrapTemplates mode: replace` 加载 `tpl-pipeline-13-*`，保证 13 节点 12 边 |
| stepIndex 布局 | 启动 Playbook 后 auto layout（`PO-LAY-001` / dagre col=stepIndex） |
| 步条点击 | `focusStepNodes()` 聚焦对应 kind 节点（已有 `playbook-focus.ts`） |
| Storyboard 模式 | **隐藏** XYFlow 边/节点视觉，但保留数据；步骤条仍绑定 `canvasNodeKinds` |
| 旧工作区迁移 | 检测无 playbookSession 或节点数≠步数 → 提示「重新加载创作模式模板」 |

---

# 第三部分：P0 — 四周内必须做的 5 件事

> 原则：不堆新功能；优先打通 **Storyboard 默认闭环 · 13 步推进 · 项目状态 · 任务可见 · 可导出**。

---

## P0-1 · Storyboard First 视图互斥与首屏降噪

**为什么必须做**  
R1/R2 根因：用户首屏看到 Workflow 编辑器。已有 `StoryboardCanvasView` 但未默认化，ModuleDock 仍占位。

**做到什么程度**  
- 新工作区 / 选 Featured Playbook 后：`canvasView='storyboard'`，不渲染 ModuleDock、不渲染 XYFlow 节点层（数据保留）。  
- `SettingsDrawer` 增加「启用 Workflow 高级视图」开关，默认 OFF。  
- Storyboard 首屏可交互控件 ≤7（`TEST-PO-P0-002`）。  
- 用户词典替换顶栏 + 步骤条 + Rail 主路径文案。

**验收标准**  
- [ ] 新用户选「AI 漫剧·真人」→ 只见 Scene 分组 Shot 卡片 + 中央步骤条 + 右侧 Script Rail，**不见** ModuleDock 展开态与节点链  
- [ ] 设置开启 Workflow 后，顶栏出现「切换到高级流程编辑」，切换后见 ModuleDock + 节点链  
- [ ] 两种视图切换不丢失 workspace 数据；pan/zoom 可选持久化  
- [ ] `TEST-PO-P0-002` PASS（DOM 计数）  
- [ ] 30 秒测试：用户能回答「我在写漫剧第 3 步·分镜」

**失败判定**  
- Storyboard 与 Workflow 同时显示节点链 + 卡片墙  
- 默认仍见 38 项 Dock 或顶栏 Run Batch  
- 切换视图丢数据或需手动 reload 模板

**主要改动面（实施时）**  
`AppShell.tsx` · `FlowSurface.tsx` · `SettingsDrawer` · `canvas-view` store · `stage-deck-flag`

---

## P0-2 · 13 步 SSOT + 六态步骤条 + 最小 auto-advance

**为什么必须做**  
R4 + `需求.txt` #2/#3：步骤条不参与流程、不连贯。Readiness 与 advance 已有碎片实现。

**做到什么程度**  
- `CanvasFlowRail` 渲染七态（至少 done/current/waiting/error/blocked/future）。  
- 实现 A1–A13 最小 auto-advance 表（§2.7）。  
- 步条点击 → 打开对应 Rail Tab + Storyboard 聚焦相关 Scene/Shot。  
- 11 步 / 13 步 / 自由模式动态步数。

**验收标准**  
- [ ] `TEST-PO-P0-001`：选真人 13 步 → 步 ① active  
- [ ] `TEST-PO-P0-003`：保存剧本 → 自动进步 ②  
- [ ] `TEST-PO-P0-007`：3D vs live 步 ⑥⑨ 节点 kind 不同  
- [ ] 关键帧批量失败 → 步 ⑦ error 红态 + Inspection 有原因  
- [ ] 缺环境参考图 → 步 ⑤ `!` + 一键打开 EnvironmentBiblePanel（`TEST-PO-P0-005`）

**失败判定**  
- 保存剧本不进步  
- 错误仍仅显示 blocked 灰态  
- 11 步模式仍显示 13 个步点

**主要改动面**  
`CanvasFlowRail.tsx` · `canvas-flow-rail.css` · `use-playbook-auto-advance.ts` · `ScriptStudioPanel` · `SceneSplitPanel` · `playbook-runner.ts`

---

## P0-3 · 项目状态机（Project Status）

**为什么必须做**  
R6：`projectStatus` 缺失（`NX9-PRODUCT-REFACTOR-SPEC` PO-PROJ-001）。用户不知项目整体进度。

**做到什么程度**  
- `WorkspacePayload.projectStatus`：`draft | generating | paused | completed | exported | archived`  
- 规则：`draft` 默认；进入步 ⑦⑨ 批量生成 → `generating`；全部 approved → `completed`；export 成功 → `exported`  
- StudioTopBar 显示状态徽章（中文：草稿/生成中/已完成/已导出）

**验收标准**  
- [ ] 新建工作区 = 草稿  
- [ ] 触发 picture-gen 批量 → 生成中  
- [ ] 导出成功 → 已导出  
- [ ] 状态持久化到 workspace API，刷新后保持

**失败判定**  
- 状态仅内存、不持久  
- 与步骤条状态矛盾（如已导出但步 ③ current）

**主要改动面**  
`packages/shared` WorkspacePayload 类型 · `workspace-document.ts` · `StudioTopBar.tsx`

---

## P0-4 · Task Center 最小闭环（可见 / 可重试）

**为什么必须做**  
R6 + PRD #15/#19：任务仅 `execution-queue` 内存 + 顶栏 batchProgress，无列表、无重试。

**做到什么程度**  
- 完善 `TaskCenterPanel`（Context Rail Tab 已存在）：展示进行中的 image/video/export 任务  
- 数据源：`execution-queue` + flow-runner batch + `/api/tasks` 轮询（已有 `useTaskStream`）  
- 顶栏摘要：「图片生成中 2/5」  
- 失败行：错误信息 + 「重试」按钮（重新 Run 对应 shot/node）

**验收标准**  
- [ ] `TEST-PO-P0-006`：批量 3 picture-gen → 列表 3 条 running→done  
- [ ] 关闭 Rail 仍可见顶栏进度  
- [ ] 失败任务可重试且步条进入 error

**失败判定**  
- 批量生成无列表、仅 Loading  
- 重试按钮不存在或重跑全图而非失败镜

**主要改动面**  
`TaskCenterPanel.tsx` · `execution-queue.ts` · `ProductionProgressWall.tsx`（合并） · `StudioTopBar.tsx`

---

## P0-5 · 导出闭环 + 已知 Stub 降级

**为什么必须做**  
13 步最后一步；GAP-004/008 导致「不能用」感。P0 不要求实现全部导出模式，但**主路径必须可下载**。

**做到什么程度**  
- 步 ⑬ 聚焦 `export-pack`  
- **至少一种**导出模式 E2E 可用（建议：时间线 FFmpeg concat，已有 montage `concat-episode`）  
- HF/Remotion stub 模式：UI **隐藏或禁用** + 说明「即将推出」，禁止假按钮  
- 修复或规避 GAP-007：步 ⑨ 视频仅当前 Playbook 镜头 scope  
- 导出成功 → A13 auto-advance + `projectStatus=exported`

**验收标准**  
- [ ] 从空工作区走通 13 步（可用手动 + 假数据 FIXTURE）至下载文件  
- [ ] 导出失败有明确 error + 修复指引（如缺 API Key）  
- [ ] 不可用导出模式不可点击  
- [ ] `TEST-PO-P0-008`：主路径点击次数 ≤15（自动步不计）

**失败判定**  
- 导出按钮可点但 appendLog「待实现」  
- 视频步跑全剧导致超时/额度爆炸  
- 无任何可下载输出

**主要改动面**  
`ExportPackBlock` · `flow-runner` motion-story scope · montage 调用链 · `export-pack` readiness

---

### P0 四周排期建议

| 周 | 交付 |
|----|------|
| W1 | P0-1 Storyboard 互斥 + 设置开关 + 首屏降噪 |
| W2 | P0-2 六态步骤条 + auto-advance A1–A6 |
| W3 | P0-2 续 A7–A13 + P0-4 Task Center |
| W4 | P0-3 项目状态 + P0-5 导出闭环 + 手动 13 步冒烟 |

---

# 第四部分：可写入「产品宪法」的强制开发要求清单

> 摘自并扩展 `NX9-PRODUCT-REFACTOR-SPEC.md` §1 + Storyboard First 约束。  
> **冲突时以本章为准。**

## 4.1 🚫 永远不要（红线）

| ID | 红线 | 验收 |
|----|------|------|
| C1 | 为增加功能而增加按钮；每 PR 必须说明删/并/藏了哪个入口 | PR 模板字段 |
| C2 | Storyboard 默认展示 ModuleDock、XYFlow 节点链、Inspector kind | 新用户首屏截图 |
| C3 | Storyboard 与 Workflow 同时渲染两种画布层 | E2E 视图互斥检查 |
| C4 | 步骤状态在组件内各算各的 | 必须读 `playbook-readiness` SSOT |
| C5 | 硬编码 13 步 UI | 必须读 `PLAYBOOK_DEFINITIONS` |
| C6 | 向用户展示 Node/Workflow/Prompt/Execute/Dependency/Provider | 文案审计 |
| C7 | 生成无反馈（仅 Loading） | Task Center 或 Toast 必现 |
| C8 | 错误无修复路径 | Inspection 必含 CTA |
| C9 | 主任务超过三级点击（剧本→导出） | `TEST-PO-P0-008` |
| C10 | 新增能力无域归属 | 必答 Story/Production/Asset/Engine/Project |
| C11 | 新增入口未回答「新手为什么需要」 | PR 必填 |
| C12 | 删除 Infinite Canvas 或改为纯表单页 | 架构评审 reject |
| C13 | 删除 ModuleDock 38 项 | 仅允许 conceal + 设置开关 |
| C14 | 未配置 API Key 时 silent fail | 必须步条 error + 设置 CTA |

## 4.2 ✅ 永远坚持（原则）

| ID | 原则 | 锚点 |
|----|------|------|
| P1 | **Storyboard First**：默认视图 Storyboard，Infinite Canvas 上渲染 Scene/Shot | `StoryboardCanvasView` |
| P2 | **Workflow Advanced**：互斥、设置可开、ModuleDock 保留 | `SettingsDrawer` |
| P3 | 一个步骤一个明确目标 + `verifyHint` | `playbook-definitions.ts` |
| P4 | AI 优先，用户确认（审阅/拆场/机位） | auto-advance 表「确认」行 |
| P5 | 默认简单，按需高级 | `concealed: true` |
| P6 | 状态 SSOT 五层 | Project/Workflow/Step/Node/Task |
| P7 | 每步即时反馈 | 步条六态 + Shot 卡片状态 |
| P8 | 可中断、恢复、重试 | Task Center |
| P9 | Playbook + CanvasFlowRail + NextStepBanner 三件套 | 不可删任一 |
| P10 | 新工作区第一次使用默认 Storyboard + PlaybookLauncher |  onboarding |

## 4.3 新增功能必答清单（PR 模板）

1. 属于哪一层？Story / Production / Asset / Engine / Project  
2. 新手是否需要？若否 → 必须 concealed + 设置开关  
3. 替代了哪个旧入口？（C1）  
4. 步骤 SSOT 字段是什么？  
5. 失败时用户看到什么 error + 什么 CTA？  
6. 是否破坏视图互斥？  
7. 测试 ID：TEST-PO-xxx 或 TEST-PIPE-xxx

## 4.4 Cursor / AI 施工约束

```text
开工前：读本文档 + NX9-PRODUCT-REFACTOR-SPEC 对应 PO-xxx
只改任务列出的文件（最小 diff）
禁止：Storyboard 模式引入新 Dock 项默认可见
必须：typecheck + 相关 TEST-PO-P0-* PASS
```

---

# 第五部分：原型稿（文字 Wireframe）

> 三屏关键原型；均基于现有组件名，不编造新页面。

---

## 5.1 新手 Storyboard 默认首页

**场景**：用户首次打开 / 无选中项目 / 应进入项目选择（P2 前用收窄版 WorkspaceRail 代替 HomeDashboard）

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ NX9  AI 漫剧创作工作室          [设置]                         [用户]        │
├──────────┬──────────────────────────────────────────────────────────────────┤
│          │                                                                  │
│ 工作区   │              欢迎开始你的第一部 AI 漫剧                           │
│ (收窄)   │                                                                  │
│          │     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│ · 默认   │     │ AI漫剧·真人 │  │ AI漫剧·3D   │  │ AI漫剧·动漫 │            │
│ · +新建  │     │   13 步     │  │   13 步     │  │   11 步     │            │
│          │     └─────────────┘  └─────────────┘  └─────────────┘            │
│          │                                                                  │
│          │     更多模式 ▸  （爆款短视频 / 线稿单集 / 声音剧 …）               │
│          │                                                                  │
│          │     ⚠ 首次使用请先配置 AI 模型  [去设置]                           │
│          │                                                                  │
└──────────┴──────────────────────────────────────────────────────────────────┘
```

| 区域 | 内容 | 折叠/常驻 |
|------|------|-----------|
| 左 | WorkspaceRail **收窄**（仅标题列表 + 新建） | 常驻，可 hover 展开 |
| 中 | **PlaybookLauncherOverlay** 内容（非空画布时弹层） | 空画布常驻 |
| 右 | **无** Context Rail | 隐藏 |
| 顶 | 产品名 + 设置 + 用户 | 常驻 ≤3 控件 |
| 隐藏 | ModuleDock、步骤条、TakeRail、Log 底栏 | 全部 |

**说明**：`HomeDashboard.tsx` 存在但未挂载；P0 可用 PlaybookLauncher + 收窄 WorkspaceRail 达成同等心智；P2 再接入完整 Project Dashboard。

---

## 5.2 Storyboard 创作画布（默认工作态）

**场景**：用户已选「AI 漫剧·真人」，步 ③ 分镜，Storyboard 视图

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 《默认工作区》  草稿 ▾          制作进度 ①②[③]④⑤⑥⑦⑧⑨⑩⑪⑫⑬   [设置]      │
├──────────┬──────────────────────────────────────────────┬──────────────────┤
│          │  ┌─ CanvasFlowRail（画布中央顶部悬浮）────────┐  │                  │
│ 工作区   │  │ ①剧本 ②场次 [③分镜] ④角色 … ⑬导出        │  │  Context Rail    │
│ (收窄)   │  └──────────────────────────────────────────┘  │                  │
│          │                                              │  Tab: 分镜        │
│          │   ┌─ 场景 S01 · 雨夜重逢 ─────────────────┐  │                  │
│          │   │ [镜1 草稿] [镜2 待生成] [镜3 +添加]    │  │  · 分镜表        │
│          │   └────────────────────────────────────────┘  │  · AI 生成分镜   │
│          │   ┌─ 场景 S02 · … ─────────────────────────┐  │                  │
│          │   │ [镜4 …]                                 │  │  NextStepBanner  │
│          │   └────────────────────────────────────────┘  │  「生成 9 镜」   │
│          │         ↑ Infinite Canvas pan/zoom            │                  │
│          │                                              │  Inspection (折叠) │
│          │   （无 ModuleDock · 无 XYFlow 节点 · 无连线）  │                  │
├──────────┴──────────────────────────────────────────────┴──────────────────┤
│ 图片生成中 2/5  ▸ 点击展开任务中心                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

| 区域 | 内容 |
|------|------|
| **左** | WorkspaceRail 收窄；**无 ModuleDock** |
| **中** | Infinite Canvas + `StoryboardCanvasView` Scene 泳道 + Shot 卡片；**CanvasFlowRail** 悬浮中顶 |
| **右** | Context Rail：**仅当前步**相关 Tab（本例 storyboard）；NextStepBanner 单一 CTA |
| **顶** | 项目名 + **projectStatus 徽章** + 制作进度步条 + 设置 |
| **底** | 任务摘要条（非完整 Log） |
| **常驻** | 步条、当前 Rail、主 CTA、画布 |
| **折叠** | Inspection、Log、TakeRail、Backlot 全屏、Episode Studio（未到步 ⑪） |
| **隐藏** | ModuleDock、节点链、Batch Run、Skills、Workflow 模板顶栏按钮 |

**步 ③ 未完成态**：步条 ③ 显示 `current`；①② `done`；④+ `future`；若分镜 <3 → ③ 显示 `!` + Tooltip。

---

## 5.3 Workflow 高级模式画布

**场景**：用户在设置开启「Workflow 高级视图」并切换；或 `pb-blank-advanced` 自由模式

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 《默认工作区》  生成中 ▾   [📋 切回故事板]   制作进度 …   [⌘K] [设置]        │
├──────────┬──────────────────────────────────────────────┬──────────────────┤
│ Module   │  ┌─ CanvasFlowRail ─────────────────────────┐  │ Inspector        │
│ Dock     │  └──────────────────────────────────────────┘  │ · 选中节点属性   │
│ ┌──────┐ │                                              │ · AI 描述        │
│ │角色  │ │    [shot-script]──[text-chunker]──[story-grid]│                  │
│ │场景  │ │         │              │              │      │ Task Center Tab  │
│ │生成  │ │         └──── … 13 节点单链 … ───[export]│  │ · 3 running      │
│ │输出  │ │              XYFlow 节点 + 连线           │                  │
│ └──────┘ │         Infinite Canvas                   │ Workflow Rail      │
│ 38项    │                                              │ · 模板 · Recipe  │
├──────────┴──────────────────────────────────────────────┴──────────────────┤
│ TakeRail（缩略图轨）                              Log ▸                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

| 区域 | 内容 |
|------|------|
| **左** | **ModuleDock 全量** 38 项（concealed 仅 CommandPalette）；Lane：角色/场景/生成/输出 |
| **中** | XYFlow **节点 + 边**；CanvasFlowRail；Infinite Canvas |
| **右** | InspectorRailPanel 全量；Task Center；WorkflowRailPanel |
| **顶** | **「切回故事板」** + CommandPalette + 制作进度 + Batch Run（可选） |
| **底** | TakeRail + Log 折叠 |
| **常驻** | Dock、节点链、Inspector |
| **互斥** | 不渲染 StoryboardCanvasView Scene 泳道 |

**自由模式**：无 13 步条时换 `PipelineCapsule`；Dock 全量；无 auto-advance。

---

# 第六部分：可持续增强方向（非首批必须，预留架构）

> 基于 `NX9-PRODUCT-REFACTOR-SPEC.md` §7 P1/P2/P3 与现有缺口；**P0 完成后**按优先级推进。

| 方向 | 现状 | 建议时机 | 预留方式 |
|------|------|----------|----------|
| **Project Dashboard** | `HomeDashboard.tsx` 未挂载 | **P2** | 路由或 AppShell 条件渲染；复用 `workspace-catalog` |
| **Task Center** | partial | **P0 最小版** → P1 持久化 | 抽象 `ProductionTask`；后续接 `queue` 模块 |
| **Story Timeline** | Episode Studio + Timeline v2 partial | **P1** | Scene 轨 UI；不新建 Store，扩 `storyboard` |
| **Asset Graph** | Take Store 分散 | **P2** | `PO-ASSET-001 AssetRecord`；Library Rail 统一 |
| **Character Memory** | character bible + consistencyPrompt | **P1** | 扩 `characters` 与 picture-gen @角色（修 GAP-005） |
| **AI Director** | agent director-plan 无完整向导 | **P3** | Script Studio Agent Rail；`PO-AI-003` |
| **Template Presets** | 30 workflow templates 已有 | **P1** | PlaybookLauncher 二级；不增新模板系统 |
| **Prompt 管理与版本** | PromptLibraryPanel 已有 | **P2** | conceal 默认；Workflow 模式可见 |
| **导出与复用** | export-pack partial | **P0 主路径** → P1 多格式 | 统一 ExportJob SSOT |
| **生成过程可视化** | ProductionProgressWall | **P0 任务条** → P1 队列动画 | 与 Task Center 合并 |

**建议延后**（避免分散 P0）：  
- 服务端 `queue` BullMQ 持久化（P2，`queue` 模块现未注册）  
- `workflow.schema.json` 动态画布（P2，`PO-SCH-001`）  
- AI 一键开拍 Agent 跑 ①–⑦（P3）  
- Comfy 市场浏览（能力 audit：无市场 UI）  
- Hub 类 6 个 deprecated GenericBlock  

**现在应预留的架构点**（P0 做时不阻塞，但接口留好）：  
1. `WorkspacePayload.projectStatus` 字段  
2. `canvasView: 'storyboard' | 'flow'` 与设置 preference 持久化  
3. `ProductionTask[]` 与 execution-queue 解耦的上层类型  
4. `playbookSession.failedStepIds / waitingStepIds` 已存在，保持 SSOT  

---

## 附录 A：事实对照速查

| 用户诉求（`需求.txt`） | 本方案对应 |
|------------------------|------------|
| 场景库多参考图 | 步 ⑤ + EnvironmentBiblePanel；P0-2 强制引导 |
| 步骤条画布中央顶部、按模式步数 | P0-2 CanvasFlowRail 动态步数 |
| 13 步连贯、顺序、连线 | P0-2 模板 replace + Storyboard 隐藏节点视觉 + auto-advance |
| 不要 Workflow 编辑器 | P0-1 Storyboard First 互斥 |
| ModuleDock 保留 | Workflow 设置开关，不删除 |

## 附录 B：P0 测试 ID 映射

| TEST ID | 对应 P0 项 |
|---------|------------|
| TEST-PO-P0-001 ~ 008 | P0-1 ~ P0-5 验收 |
| TEST-PIPE-UX-E2E-001 | 四周末 13 步手动冒烟 → 转自动化 |

---

**文档状态**：待你确认后，按 P0-1 → P0-5 顺序改仓库。  
**下一步**：确认本方案 → 实施 P0-1（Storyboard 视图互斥 + 设置开关）。
