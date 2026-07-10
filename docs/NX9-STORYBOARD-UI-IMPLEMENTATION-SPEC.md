# NX9 Storyboard 完整重设计 · 原型 / UI / 逻辑 / 代码实现规格

> **文档性质**：Storyboard First 的**可施工 SSOT**（原型 + UI + 交互 + 逻辑 + 逐文件代码方案）  
> **前置文档**：`docs/NX9-STORYBOARD-FIRST-REFACTOR-PLAN.md`（战略层）  
> **审计基线**：2026-07-10 · 对照当前仓库实际代码  
> **读者**：产品验收 + Cursor 施工  
> **原则**：Infinite Canvas 不可移除；Storyboard / Workflow **互斥**、**共享同一画布**；不编造未存在模块名；代码方案对齐现有文件路径。

---

## 0. 执行摘要：为什么你现在感觉「Storyboard 不能用」

### 0.1 用户真实感受（与代码证据一一对应）

| 用户感受 | 根因（代码/结构） | 证据文件 |
|----------|-------------------|----------|
| UI 还是 Workflow 那套 | 顶栏仍写「AI Workflow」；探索/生产/审片胶囊常驻；顶栏仍有故事板/3D/批量运行/溢出菜单 | `StudioTopBar.tsx` L114、L122-124、L176-213 |
| 不知道下一步干什么 | **NextStepBanner 在右侧 Rail 底部**，默认 Tab 是「分镜」而非当前步；步 ① 画布中央显示「暂无镜头数据」 | `ContextRail.tsx` L25、L129-133；`StoryboardCanvasView.tsx` L58-63 |
| Storyboard 画布像空壳 | `StoryboardCanvasView` 仅 128 行：无步骤引导、无空态 CTA、无与 Playbook 步绑定 | `StoryboardCanvasView.tsx` |
| 检查/任务中心不存在 | `InspectionPanel`、`TaskCenterPanel` **已实现但未挂载** | 全仓库 grep 仅定义文件，无 import |
| 选了模式仍迷茫 | `startPlaybook` 只写 session，**不打开步 ① Script Rail** | `workspace-document.ts` L303-319 |
| 步骤条像装饰 | 步骤条在画布顶，但**主操作在右侧**；用户视觉焦点分裂 | `CanvasFlowRail` + `ContextRail` 分离 |
| 自动前进不可靠 | auto-advance 依赖 readiness 变化，但步 ① 保存、步 ② 确认等触发点分散 | `use-playbook-auto-advance.ts` + 各 Panel 零散 `advancePlaybookStep` |

### 0.2 已做但未「产品化」的部分（不是从零开始）

| 已有 | 状态 | 缺什么 |
|------|------|--------|
| `canvasView: 'storyboard' \| 'flow'` | 默认 storyboard | 步级空态、Rail 同步、顶栏降噪 |
| `ModuleDock` 仅在 flow 显示 | `AppShell.tsx` L193 | Storyboard 中央需 StepCanvas 替代节点链 |
| `CanvasFlowRail` | 七态 CSS 已有 | 中央需 **StepHero** 主 CTA；blocked 应更显眼 |
| `NextStepBanner` | 有逻辑 | 文案工程化；位置应在**画布中央**而非仅 Rail |
| `PlaybookLauncherOverlay` | 仅 `nodes.length===0` | 旧工作区有节点时不出现；文案「生产剧本」 |
| `projectStatus` | store 已有 | UI 徽章有，但未驱动画布空态 |
| `InspectionPanel` / `TaskCenterPanel` | 组件完整 | **未接入 ContextRail** |

### 0.3 设计目标（验收一句话）

> 新用户选「AI 漫剧·真人」后，**画布中央**始终显示：**当前第几步 · 要做什么 · 一个大按钮 · 完成标准**；右侧 Rail 自动打开对应编辑区；**不需要**理解节点、Workflow、ModuleDock。

---

# 第一部分：Storyboard 信息架构重设计

## 1.1 页面三区模型（Storyboard 模式唯一布局）

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ StudioTopBar（极简）：品牌 · 项目名 · 状态徽章 · [设置] · [用户]          │
├──────────┬──────────────────────────────────────────┬───────────────────┤
│ Workspace│  Infinite Canvas（Storyboard 渲染层）     │  Step Rail        │
│ Rail     │  ┌─ CanvasFlowRail（制作进度）──────────┐  │  （原 ContextRail │
│ （收窄） │  └──────────────────────────────────────┘  │   改名+改造）     │
│          │  ┌─ StepHero（当前步主任务区）───────────┐  │                   │
│          │  │  标题 / 说明 / 主 CTA / 完成条件       │  │  · 当前步编辑器   │
│          │  └──────────────────────────────────────┘  │  · 检查清单       │
│          │  ┌─ StepCanvas（步骤内容区）─────────────┐  │  · 任务中心       │
│          │  │  按步切换：剧本预览/场次/分镜墙/…     │  │                   │
│          │  └──────────────────────────────────────┘  │                   │
├──────────┴──────────────────────────────────────────┴───────────────────┤
│ TaskSummaryBar（底栏）：生成中 2/5 · 点击查看任务中心                    │
└─────────────────────────────────────────────────────────────────────────┘
```

**与 Workflow 模式的区别**

| 元素 | Storyboard | Workflow |
|------|------------|----------|
| ModuleDock | **不渲染** | 渲染 38 项 |
| XYFlow 节点链 | **不渲染**（数据保留） | 渲染 |
| StepHero + StepCanvas | **渲染** | 不渲染 |
| ModeCapsule 探索/生产/审片 | **隐藏**（按步自动切 viewMode） | 可选显示 |
| Inspector Tab | **隐藏** | 显示 |
| 顶栏「批量运行」 | **隐藏** | 显示 |

## 1.2 组件树（新建 + 改造）

```text
AppShell
├── StudioTopBarStoryboard          ← 改造 StudioTopBar（按 canvasView 分支）
├── WorkspaceRail（收窄模式）
├── main
│   ├── StageDeckSurface / FlowSurface
│   │   ├── PlaybookLauncherOverlay（条件：无 playbook 或 dismissed）
│   │   ├── CanvasFlowRail          ← 改造：更大、可点击、! 态
│   │   ├── StoryboardStage         ← 【新建】容器
│   │   │   ├── StepHero            ← 【新建】中央主 CTA
│   │   │   └── StepCanvas          ← 【新建】按步渲染
│   │   │       ├── ScriptStepCanvas
│   │   │       ├── SceneSplitStepCanvas
│   │   │       ├── StoryboardGridStepCanvas  ← 复用/扩展 StoryboardCanvasView
│   │   │       ├── CharacterStepCanvas
│   │   │       ├── EnvironmentStepCanvas
│   │   │       ├── CameraStepCanvas
│   │   │       ├── KeyframeStepCanvas
│   │   │       ├── ReviewStepCanvas
│   │   │       ├── VideoStepCanvas
│   │   │       ├── EpisodeStepCanvas
│   │   │       └── ExportStepCanvas
│   │   └── ReactFlow（仅 canvasView==='flow'）
│   └── StepRail                      ← 改造 ContextRail
│       ├── NextStepBanner            ← 降级为 Rail 内摘要（非主 CTA）
│       ├── StepEditorPanel           ← 【新建】当前步表单容器
│       ├── InspectionPanel           ← 挂载
│       └── TaskCenterPanel           ← 挂载
└── TaskSummaryBar                    ← 【新建】底栏
```

## 1.3 设计 Token（CSS 变量，追加到 `apps/web/src/styles/`）

新建 `storyboard-stage.css`：

```css
:root {
  --nx9-stage-padding: 24px;
  --nx9-step-hero-max-w: 720px;
  --nx9-step-hero-radius: 16px;
  --nx9-step-hero-bg: rgba(255, 255, 255, 0.95);
  --nx9-step-hero-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  --nx9-cta-height: 44px;
  --nx9-scene-lane-gap: 24px;
  --nx9-shot-card-w: 200px;
  --nx9-rail-width-storyboard: 360px; /* Storyboard 模式 Rail 略宽 */
}
```

---

# 第二部分：原型稿（逐步 · 文字 Wireframe）

## 2.1 全局：选模式（PlaybookLauncher 改造）

**触发**：`playbookSession` 为空或 `dismissed`；或新工作区。

```text
┌──────────────────────────────────────────────────────────────┐
│                    开始创作你的 AI 漫剧                       │
│         选一个模式，我们会一步步带你完成（不用搭流程）          │
│                                                              │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│   │ 🎬 真人 13步 │  │ 🎭 3D 13步   │  │ ✏️ 动漫 11步 │      │
│   └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│   ⚠ 首次使用请先配置 AI 模型  [ 去设置 ]                      │
│                                                              │
│   高级：自由模式（自行搭建流程） ▸                             │
└──────────────────────────────────────────────────────────────┘
```

**交互**：
- 点击卡片 → `startPlaybook` + `loadTemplate replace` + `canvasView='storyboard'` + `requestRailTab('script')` + 关闭 Launcher
- 「去设置」→ `SettingsDrawer`
- 「自由模式」→ `pb-blank-advanced` + `canvasView='flow'` + 提示开启 Workflow

**文案改造**（`PlaybookLauncherOverlay.tsx`）：
- 「选择生产剧本」→「开始创作你的 AI 漫剧」
- 「按步骤引导…」→ 保留

---

## 2.2 步 ① 剧本 · Script

### 画布中央（StepHero + StepCanvas）

```text
┌─ 制作进度 ─────────────────────────────────────────────────┐
│ ✓① 剧本  ○②场次  ○③分镜  …  ○⑬导出                        │
└────────────────────────────────────────────────────────────┘

┌─ StepHero ─────────────────────────────────────────────────┐
│  第 1 步 / 13 · 写剧本                                       │
│  粘贴小说或剧本，作为整部漫剧的起点                           │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ （剧本预览区：已保存时显示前 3 行 + 字数）               │  │
│  │  或：空态插画 + 「还没有剧本」                           │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  [ 在右侧编写剧本 ]  ← 主 CTA（聚焦 Rail Script）            │
│                                                              │
│  完成标准：已保存至少 1 段文字                                 │
└──────────────────────────────────────────────────────────────┘
```

### 右侧 Step Rail

```text
Tab: [ ① 剧本 ]  检查  任务
─────────────────────────
ScriptStudioPanel（全高）
· 原文输入框
· AI 编剧工具
· 保存后 Toast「已保存 · 即将进入场次拆分」
─────────────────────────
检查清单（InspectionPanel 折叠）
· 剧本 ✓/✗
```

**流程**：
1. 进入步 ① → 自动 `requestRailTab('script')`
2. 用户粘贴 → debounce 保存 `scriptPlan.sourceText`
3. `has_source_text` true → auto-advance 步 ② + Toast + Rail 切 scene-split

---

## 2.3 步 ② 场次 · Scene Split

### 画布中央

```text
第 2 步 / 13 · 拆分场次
AI 会把剧本拆成多个场景，请确认后写入

┌─ 场次预览卡片（横向 scroll）───────────────────────────────┐
│ [S01 雨夜重逢] [S02 办公室] [S03 …]  或 空态「尚未拆分」      │
└──────────────────────────────────────────────────────────────┘

[ 拆分场次 ]  → 调 Agent API
[ 确认并继续 ]  → 写入 scriptPlan.scenes + advance 步 ③
（确认前按钮 disabled，显示「等待确认」黄态）
```

### Rail：`ScriptStudioPanel` 内 `SceneSplitPanel` 子 Tab 自动展开

---

## 2.4 步 ③ 分镜 · Storyboard

### 画布中央（StepCanvas = 扩展 StoryboardCanvasView）

```text
第 3 步 / 13 · 生成分镜
目标：至少 3 个镜头

（有 shots 时显示 Scene 泳道 + Shot 卡片网格）
（无 shots 时）

     🎬
  还没有分镜
  [ AI 生成分镜表 ]  ← 调 storyboard-table API

完成：3/3 镜 ✓  →  auto-advance 步 ④
```

---

## 2.5 步 ④ 角色 · Character

```text
第 4 步 / 13 · 角色设定

┌ 人物墙（横向卡片）────────────────────────────┐
│ [林晓 缺参考图 !] [陈默 ✓] [+ 添加]            │
└───────────────────────────────────────────────┘

[ 从剧本提取角色 ]  [ 我准备好了，下一步 ]

Rail：CharacterBibleStepPanel
```

---

## 2.6 步 ⑤ 环境 · Environment

```text
第 5 步 / 13 · 场景环境
每个场景需要至少 1 张参考图（最多 6 张）

┌ 场景卡 ──────────────────────────────────────┐
│ S01 雨夜街头  [图][图][+]  或  ⚠ 缺参考图      │
└──────────────────────────────────────────────┘

[ 生成环境卡 ]  [ 上传参考图 ]

Rail：EnvironmentBiblePanel（referenceUrls）
步条 ! 态直到 referenceUrls.length >= 1
```

---

## 2.7 步 ⑥ 机位 · Camera（3D / 真人分支）

**3D**：
```text
第 6 步 / 13 · 3D 机位
已为 4/9 镜关联机位（需 ≥50%）

[ 打开 3D 导演台 ]  [ 自动关联全部镜头 ]
```

**真人**：
```text
第 6 步 / 13 · 导演台
[ 加载导演台模板 ]  [ 查看未关联镜头列表 ]
```

---

## 2.8 步 ⑦ 关键帧 · Keyframe

```text
第 7 步 / 13 · 生成关键帧
进度：7/9 镜已有首帧

（Shot 卡片墙，未生成显示「待生成」+ 单镜生成按钮）

[ 批量生成全部关键帧 ]  ← run_batch picture-gen
TaskSummaryBar：图片生成中 3/9
失败镜：红框 + 步条 error 态
```

---

## 2.9 步 ⑧ 审帧 · Keyframe Review

```text
第 8 步 / 13 · 审阅关键帧
请确认每一镜的静帧质量

（Shot 卡片进入 review 模式：通过 / 重做）

[ 进入审阅模式 ]  → set_view_mode review
[ 全部通过，继续 ]  → all_keyframes_approved
```

---

## 2.10 步 ⑨ 视频 · Video

```text
第 9 步 / 13 · 生成视频
（3D: motion-story / 真人: clip-gen）

[ 开始生成视频 ]  ← run_cascade（**必须 scoped 到当前 playbook shots**）
TaskCenter 列表可重试
```

---

## 2.11 步 ⑩ 连贯 · Consistency

```text
第 10 步 / 13 · 连贯检查
（问题列表 + 跳转/重生成）

[ 运行检查 ]  [ 跳过（可选）]
```

---

## 2.12 步 ⑪ 成片 · Episode Studio（仅 13 步）

```text
第 11 步 / 13 · 成片预览

┌ 迷你时间线预览 ──────────────────────────────┐
│ ▶ ━━━━━●━━━━━━━━  0:42                      │
└──────────────────────────────────────────────┘

[ 打开成片工作室 ]
```

---

## 2.13 步 ⑫ 门控 · Review Gate

```text
第 12 步 / 13 · 审阅视频
8/9 镜已通过

[ 进入审片模式 ]  [ 全部通过 ]
```

---

## 2.14 步 ⑬ 导出 · Export

```text
第 13 步 / 13 · 导出成片

┌ 导出选项（仅展示可用模式）────────────────────┐
│ ○ 时间线 MP4（推荐）✓ 可用                     │
│ ○ HyperFrames  （暂不可用，灰）                │
└──────────────────────────────────────────────┘

[ 导出并下载 ]
成功 → 全屏庆祝 + projectStatus=exported
```

---

# 第三部分：UI 规范（组件级）

## 3.1 StepHero（新建）

**路径**：`apps/web/src/engine/stage-deck/storyboard/StepHero.tsx`

**Props**：

```typescript
interface StepHeroProps {
  stepNumber: number;
  totalSteps: number;
  title: string;           // shortLabel
  description: string;
  verifyHint: string;
  visualState: StepVisualState;
  primaryLabel: string;    // 用户文案，非「执行下一步」
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  progress?: { done: number; total: number; unit: string };
  blockedReasons?: string[];
}
```

**视觉规则**：

| visualState | Hero 边框 | 主按钮 |
|-------------|-----------|--------|
| current | brand 2px | 实心 brand |
| waiting | amber 虚线 | 「确认并继续」 |
| error | red 2px + ! | 「重试」 |
| done | green 淡底 | 「查看结果」ghost |

**禁止**：显示 kind / node / playbook id。

## 3.2 StepCanvas（新建 · 路由）

**路径**：`apps/web/src/engine/stage-deck/storyboard/StepCanvas.tsx`

```typescript
const STEP_CANVAS: Record<string, React.ComponentType> = {
  script: ScriptStepCanvas,
  'scene-split': SceneSplitStepCanvas,
  storyboard: StoryboardGridStepCanvas,
  // … 映射 playbook step.id
};

export function StepCanvas({ stepId }: { stepId: string }) {
  const Cmp = STEP_CANVAS[stepId] ?? GenericStepCanvas;
  return <Cmp />;
}
```

## 3.3 StoryboardStage（新建 · 容器）

**路径**：`apps/web/src/engine/stage-deck/storyboard/StoryboardStage.tsx`

- 读取 `playbookSession.currentStepId` + `PLAYBOOK_DEFINITIONS`
- 渲染 `StepHero` + `StepCanvas`
- 无 playbook 时渲染 `PlaybookEmptyState`（引导选模式）

**替换**：`FlowSurface.tsx` 中直接挂载 `StoryboardCanvasView` 的逻辑 → 改为 `StoryboardStage`

## 3.4 CanvasFlowRail 改造

| 改造项 | 说明 |
|--------|------|
| 位置 | 保持 canvas 顶部居中，`top: 16px` |
| 尺寸 | 步数 > 11 时 shortLabel + 序号，hover 显示全名 |
| 当前步 | 放大 + pulse 动画 |
| blocked | 显示 `!` badge（已有 CSS） |
| 点击 current | 滚动 StepHero 到视口 + 打开 Rail |
| 点击 blocked | Tooltip + 「去修复」→ `executeStepAction` |

## 3.5 StepRail（改造 ContextRail）

**Tab 改造**（Storyboard 模式）：

| 旧 Tab | 新 Tab | 说明 |
|--------|--------|------|
| storyboard/script/library/inspector | **当前步**（动态名） | 如「① 剧本」「⑤ 环境」 |
| — | **检查** | `InspectionPanel` |
| — | **任务** | `TaskCenterPanel` |

**逻辑**：

```typescript
// 当前步 Tab 名
const stepTabLabel = currentStep?.shortLabel ?? '编辑';

// hiddenTabs: storyboard 模式隐藏 inspector
// 默认 tab：跟随 currentStepId 映射
const STEP_RAIL_TAB: Record<string, ContextRailTab | 'step'> = {
  script: 'script',
  'scene-split': 'script',
  storyboard: 'storyboard',
  'character-bible': 'library',
  // ...
};
```

## 3.6 StudioTopBar Storyboard 版

**Storyboard 模式仅保留**：

- Logo + 「AI 漫剧创作工作室」（替换 `AI Workflow`）
- 工作区标题（来自 catalog active item）
- `projectStatus` 徽章
- 设置
- 用户

**隐藏**：ModeCapsule、ProductionWall、故事板按钮、3D、批量运行、Workflow 切换（除非 workflowEnabled）

## 3.7 TaskSummaryBar（新建）

**路径**：`apps/web/src/components/TaskSummaryBar.tsx`

- 固定底栏 32px
- 显示 `execution-queue` 进度
- 点击 → `requestRailTab('tasks')` 或展开 TaskCenterPanel

## 3.8 NextStepBanner 降级

- 主 CTA **移到 StepHero**
- Banner 仅保留：步序号 + 一行摘要 + 「退出向导」
- 按钮「执行下一步」→ 删除，避免与 StepHero 重复

---

# 第四部分：逻辑与状态机

## 4.1 启动 Playbook 完整序列（必须实现）

**文件**：`FlowSurface.tsx` `onStartPlaybook` + `workspace-document.ts` `startPlaybook`

```typescript
function onStartPlaybook(playbookId: PlaybookId) {
  const def = PLAYBOOK_DEFINITIONS.find(p => p.id === playbookId);
  if (!def) return;

  // 1. Session
  useWorkspaceDocument.getState().startPlaybook(playbookId);
  useWorkspaceDocument.getState().setProjectStatus('draft');

  // 2. 模板
  if (def.bootstrapTemplates[0]) {
    void loadWorkflowTemplate(def.bootstrapTemplates[0].templateId, 'replace');
  }

  // 3. 视图
  useCanvasView.getState().setView('storyboard');

  // 4. 打开第一步 Rail（关键缺失项）
  const first = def.steps[0];
  if (first?.primaryAction.type === 'open_rail') {
    useContextRailUi.getState().requestTab(first.primaryAction.tab, ...);
  }

  // 5. 关闭 Launcher
  setRecipePickerDismissed(true);
}
```

## 4.2 步骤 → UI 映射表（SSOT）

| step.id | StepCanvas 组件 | Rail 面板 | viewMode 自动 |
|---------|-----------------|-----------|---------------|
| script | ScriptStepCanvas | ScriptStudioPanel | explore |
| scene-split | SceneSplitStepCanvas | ScriptStudioPanel + SceneSplit | explore |
| storyboard | StoryboardGridStepCanvas | StoryboardRailPanel | explore |
| character-bible | CharacterStepCanvas | CharacterBibleStepPanel | explore |
| environment-bible | EnvironmentStepCanvas | EnvironmentBiblePanel | explore |
| camera-3d / camera-live | CameraStepCanvas | Director3d / 提示 | explore |
| keyframe-gen | KeyframeStepCanvas | StoryboardRailPanel | produce |
| keyframe-review | ReviewStepCanvas | StoryboardRailPanel | review |
| video-gen | VideoStepCanvas | StoryboardRailPanel | produce |
| consistency | ConsistencyStepCanvas | InspectionPanel | produce |
| episode-studio | EpisodeStepCanvas | EpisodeStudioPanel | produce |
| review-gate | ReviewStepCanvas | StoryboardRailPanel | review |
| export | ExportStepCanvas | Export 内嵌 | explore |

## 4.3 auto-advance 触发点（与 UI 联动）

| 事件 | 触发位置 | advance 条件 |
|------|----------|--------------|
| scriptPlan 保存 | ScriptStudioPanel debounce | has_source_text |
| 场次确认 | SceneSplitPanel 确认按钮 | has_scene_split |
| 分镜写入 | StoryboardRailPanel / Agent | has_storyboard_shots |
| 环境 referenceUrls | EnvironmentBiblePanel | has_environment_bibles |
| 角色确认 | CharacterBibleStepPanel「准备好了」 | has_character_bibles |
| 机位确认 | CameraStepCanvas 按钮 | has_camera_blocks |
| 批量图完成 | execution-queue idle + readiness | has_keyframes |
| 审帧通过 | review action | all_keyframes_approved |
| 视频完成 | execution-queue | has_video_assets |
| 导出成功 | ExportStepCanvas | export_ready |

**统一**：以上均调用 `usePlaybookAutoAdvance` 或显式 `advancePlaybookStep(ctx)`，并 `pushToast`。

## 4.4 Readiness → 步条 + StepHero 同步

单一数据源：

```typescript
const stepStates = evaluateAllStepVisualStates(session, readinessCtx);
const current = stepStates.find(s => s.step.id === session.currentStepId);
// CanvasFlowRail、StepHero、InspectionPanel 均读此结果
```

## 4.5 Storyboard 模式禁止用户做的事

- 不可见 ModuleDock / 节点 / 连线
- 不可 spawn 任意 Block（CommandPalette disabled）
- 不可 Batch Run 全图（仅当前步 CTA）
- 不可切 Workflow（除非 settings.workflowEnabled）

---

# 第五部分：功能使用说明（用户视角 · 13 步真人）

| 步 | 用户做什么 | 点哪里 | 系统做什么 |
|----|------------|--------|------------|
| 0 | 选「AI 漫剧·真人」 | Launcher 卡片 | 加载 13 步模板、打开剧本 Rail |
| 1 | 粘贴剧本 | 右侧输入框 或 Hero「编写剧本」 | 保存、自动进步 2 |
| 2 | 拆分并确认场次 | Hero「拆分场次」「确认继续」 | 写 scenes、进步 3 |
| 3 | 生成分镜 | Hero「AI 生成分镜表」 | 写 shots、画布出现 Scene 墙、进步 4 |
| 4 | 提取角色、上传参考图 | Rail 角色卡 | 进步 5 |
| 5 | 环境卡 + 上传 1–6 张参考图 | Rail 环境卡 | 进步 6 |
| 6 | 关联导演台/3D | Hero 打开导演台 | linkedBlockId、进步 7 |
| 7 | 批量生成关键帧 | Hero 主按钮 | Task 进度、进步 8 |
| 8 | 审阅静帧 | 卡片通过/重做 | 进步 9 |
| 9 | 生成视频 | Hero 主按钮 | 进步 10 |
| 10 | 连贯检查 | 修复或跳过 | 进步 11 |
| 11 | 预览成片 | 打开 Episode Studio | 进步 12 |
| 12 | 审阅视频 | 审片模式 | 进步 13 |
| 13 | 导出 MP4 | 选可用格式下载 | exported 状态 |

---

# 第六部分：代码实现方案（逐文件 · 施工顺序）

## Phase 1 · 骨架（第 1 周）— 让用户「看见 Storyboard」

### 6.1 新建文件

| 文件 | 职责 |
|------|------|
| `engine/stage-deck/storyboard/StoryboardStage.tsx` | 主容器 |
| `engine/stage-deck/storyboard/StepHero.tsx` | 中央 Hero |
| `engine/stage-deck/storyboard/StepCanvas.tsx` | 步路由 |
| `engine/stage-deck/storyboard/step-canvas/ScriptStepCanvas.tsx` | 步 ① 空态+预览 |
| `engine/stage-deck/storyboard/step-canvas/SceneSplitStepCanvas.tsx` | 步 ② 场次预览 |
| `engine/stage-deck/storyboard/step-canvas/StoryboardGridStepCanvas.tsx` | 步 ③+（从 StoryboardCanvasView 迁移扩展） |
| `engine/stage-deck/storyboard/step-canvas/GenericStepCanvas.tsx` | 未实现步 fallback |
| `engine/stage-deck/storyboard/playbook-step-ui.ts` | stepId → 文案、CTA label |
| `styles/storyboard-stage.css` | 样式 |
| `components/TaskSummaryBar.tsx` | 底栏 |

### 6.2 修改文件

#### `FlowSurface.tsx`

```typescript
// 替换
{isStageDeck && ready && canvasView === 'storyboard' && (
  <StoryboardCanvasView />
)}

// 为
{isStageDeck && ready && canvasView === 'storyboard' && (
  <StoryboardStage />
)}

// onStartPlaybook 内增加 requestRailTab(firstStep) — 见 §4.1
```

#### `AppShell.tsx`

```typescript
// 增加 TaskSummaryBar（canvasView === 'storyboard' 时）
{canvasView === 'storyboard' && <TaskSummaryBar />}

// StudioTopBar 传 canvasView prop 用于分支渲染
```

#### `StudioTopBar.tsx`

```typescript
if (canvasView === 'storyboard') {
  return <StudioTopBarStoryboard ... />; // 同文件内函数组件或拆分
}
// 保留现有 Workflow 顶栏
```

**StudioTopBarStoryboard 内容**：§3.6

#### `ContextRail.tsx` → 重命名为 `StepRail.tsx`（或保留文件名改内容）

```typescript
import { InspectionPanel } from './rail/InspectionPanel';
import { TaskCenterPanel } from './rail/TaskCenterPanel';

// Storyboard tabs
type StoryboardRailTab = 'step' | 'inspect' | 'tasks';

// 挂载
{canvasView === 'storyboard' && tab === 'inspect' && <InspectionPanel />}
{canvasView === 'storyboard' && tab === 'tasks' && <TaskCenterPanel />}
```

#### `context-rail-ui.ts`

```typescript
export type ContextRailTab = 'inspector' | 'storyboard' | 'script' | 'library' | 'inspect' | 'tasks';
```

#### `PlaybookLauncherOverlay.tsx`

- 文案 §2.1
- `pb-blank-advanced` 卡片单独放「高级」区

#### `StoryboardCanvasView.tsx`

- 逻辑迁入 `StoryboardGridStepCanvas.tsx`
- 原文件 re-export 或删除（迁移后）

### 6.3 StepHero 与 playbook 绑定示例

```typescript
// StoryboardStage.tsx
export function StoryboardStage() {
  const session = useWorkspaceDocument(s => s.playbookSession);
  const playbook = useMemo(...);
  const currentStep = ...;
  const ctx = usePlaybookReadinessCtx(); // 抽 hook
  const stepStates = evaluateAllStepVisualStates(session, ctx);
  const currentState = stepStates.find(s => s.step.id === session?.currentStepId);

  const ui = getStepUi(currentStep.id); // playbook-step-ui.ts

  const handlePrimary = () => {
    executeStepAction(currentStep.primaryAction, ctx);
    // 不在这里 advance — 由 readiness 变化触发 auto-advance
  };

  return (
    <div className="nx9-storyboard-stage absolute inset-0 overflow-y-auto">
      <div className="nx9-storyboard-stage-inner max-w-5xl mx-auto px-6 pt-20 pb-8">
        <StepHero
          stepNumber={currentState.index + 1}
          totalSteps={playbook.steps.length}
          title={currentStep.shortLabel ?? currentStep.label}
          description={currentStep.description}
          verifyHint={currentStep.verifyHint}
          visualState={currentState.state}
          primaryLabel={ui.primaryLabel}
          onPrimary={handlePrimary}
          blockedReasons={currentState.state === 'blocked' ? getBlockReasons(...) : undefined}
        />
        <StepCanvas stepId={currentStep.id} />
      </div>
    </div>
  );
}
```

### 6.4 `playbook-step-ui.ts`（用户 CTA 文案）

```typescript
export const STEP_UI: Record<string, { primaryLabel: string; emptyTitle: string }> = {
  script: { primaryLabel: '编写剧本', emptyTitle: '还没有剧本' },
  'scene-split': { primaryLabel: '拆分场次', emptyTitle: '还没有场次' },
  storyboard: { primaryLabel: '生成分镜', emptyTitle: '还没有分镜' },
  'character-bible': { primaryLabel: '设置角色', emptyTitle: '还没有角色' },
  'environment-bible': { primaryLabel: '设置场景环境', emptyTitle: '还没有场景参考图' },
  'camera-live': { primaryLabel: '打开导演台', emptyTitle: '镜头尚未关联' },
  'camera-3d': { primaryLabel: '打开 3D 导演台', emptyTitle: '镜头尚未关联' },
  'keyframe-gen': { primaryLabel: '批量生成关键帧', emptyTitle: '还没有关键帧' },
  'keyframe-review': { primaryLabel: '审阅关键帧', emptyTitle: '等待审阅' },
  'video-gen': { primaryLabel: '生成视频', emptyTitle: '还没有视频' },
  consistency: { primaryLabel: '检查连贯性', emptyTitle: '尚未检查' },
  'episode-studio': { primaryLabel: '预览成片', emptyTitle: '时间线未就绪' },
  'review-gate': { primaryLabel: '审阅视频', emptyTitle: '等待审阅' },
  export: { primaryLabel: '导出成片', emptyTitle: '选择导出方式' },
};
```

---

## Phase 2 · 逐步 StepCanvas（第 2 周）

每个 `*StepCanvas.tsx` 最小实现：

| 文件 | 最小内容 |
|------|----------|
| ScriptStepCanvas | 字数统计 + 前 200 字预览 + 无数据空态 |
| SceneSplitStepCanvas | scenes 横向卡片；调 SceneSplitPanel 同款 API |
| StoryboardGridStepCanvas | Scene 泳道 + Shot 卡（现有逻辑） |
| CharacterStepCanvas | characters 人物墙缩略 |
| EnvironmentStepCanvas | environments 卡 + referenceUrls 缩略 |
| CameraStepCanvas | linked 进度条 + CTA |
| KeyframeStepCanvas | firstFrame 进度 + 批量按钮 |
| ReviewStepCanvas | 嵌入 review 快捷操作 |
| VideoStepCanvas | video 进度 |
| ExportStepCanvas | 嵌入 ExportPackBlock 简化 UI |

**共享 Hook**：`hooks/use-playbook-readiness-ctx.ts`

```typescript
export function usePlaybookReadinessCtx(): PlaybookReadinessContext {
  // 从 workspace-document + flow-runtime 组装，与 CanvasFlowRail 相同
}
```

---

## Phase 3 · 逻辑闭环（第 3 周）

### 6.5 `workspace-document.ts`

```typescript
startPlaybook: (playbookId) => {
  // 现有逻辑 +
  // 在 set 回调外同步（或 startPlaybook 改 async）：
  queueMicrotask(() => {
    const def = PLAYBOOK_DEFINITIONS.find(...);
    const first = def?.steps[0];
    if (first?.primaryAction.type === 'open_rail') {
      useContextRailUi.getState().requestTab(...);
    }
  });
},
```

### 6.6 `NextStepBanner.tsx`

- 删除主 CTA 按钮
- 保留步摘要 + 退出向导

### 6.7 `use-playbook-auto-advance.ts`

- 步进后 `scrollIntoView` StepHero
- milestone toast 保留

### 6.8 `InspectionPanel.tsx`

- 修复 action：`has_camera_blocks` 时 `requestRailTab('storyboard')` 而非 inspector

### 6.9 `TaskCenterPanel.tsx`

- 从 `execution-queue` 读 `currentLabel`
- 实现 retry：调 `runtime.runSelected([blockId])`

### 6.10 motion-story scope（GAP-007）

**文件**：`apps/web/src/blocks/core/MotionStoryBlock.tsx` 或 executor

```typescript
// 仅处理 linkedShotId 或节点 data.scopeShots
const shots = linkedShotId
  ? allShots.filter(s => s.id === linkedShotId)
  : allShots.filter(s => s.sceneCode === node.data.sceneCode);
```

---

## Phase 4 · 导出与 E2E（第 4 周）

### 6.11 `ExportStepCanvas.tsx`

- 只展示 montage 可用模式
- HF/Remotion stub → `disabled` + tooltip

### 6.12 测试

| TEST ID | 验证 |
|---------|------|
| TEST-SB-001 | 选真人 13 步 → StepHero 显示步 1 + Script Rail 打开 |
| TEST-SB-002 | Storyboard 模式 DOM 无 `.react-flow` |
| TEST-SB-003 | 保存剧本 → 步 2 + SceneSplit 可见 |
| TEST-SB-004 | InspectionPanel Tab 可打开 |
| TEST-SB-005 | TaskCenter 批量图有列表 |
| TEST-SB-006 | 首屏控件 ≤7 |

**E2E**：扩展 `apps/web/e2e/e2e-playbook.spec.ts`

---

# 第七部分：Workflow 模式（保持不变 + 开关）

- `SettingsDrawer` → `preferences.workflowEnabled`（已有）
- 仅 true 时：`StudioTopBar` 显示切换按钮、`AppShell` 可显示 ModuleDock
- 切换 `flow` 时渲染现有 ReactFlow，隐藏 `StoryboardStage`

---

# 第八部分：验收清单（产品走查 20 分钟）

1. [ ] 打开产品 → 看到 Launcher，不是节点画布  
2. [ ] 选真人 13 步 → 中央「第 1 步 写剧本」，右侧 Script 已打开  
3. [ ] 顶栏无「探索/生产/审片」、无 ModuleDock  
4. [ ] 粘贴剧本保存 → 自动到步 2，中央变为「拆分场次」  
5. [ ] 步 5 缺参考图 → 步条 ! + Hero 提示 + Inspection 一条  
6. [ ] 步 7 批量生成 → 底栏任务进度 + 任务 Tab 列表  
7. [ ] 全程用户能说出「我在第 X 步做什么」  
8. [ ] 设置开启 Workflow → 可看到节点链 + Dock  
9. [ ] 切回 Storyboard → 节点隐藏，Scene 墙恢复  

---

# 第九部分：与战略文档关系

| 文档 | 关系 |
|------|------|
| `NX9-STORYBOARD-FIRST-REFACTOR-PLAN.md` | 战略 / P0 五项 |
| **本文档** | Storyboard UI/原型/逻辑/逐文件施工 |
| `NX9-PRODUCT-REFACTOR-SPEC.md` | PO-xxx 任务 ID 对照 |
| `约束开发要求.md` | 施工必须以 SSOT 文档为准 |

**施工顺序建议**：

```text
Phase 1 骨架 → Phase 2 StepCanvas → Phase 3 逻辑 → Phase 4 导出/E2E
```

---

**文档状态**：待确认后开始 Phase 1 代码施工。  
**下一步**：确认后从 `StoryboardStage.tsx` + `StepHero.tsx` + `FlowSurface` 接入开始。
