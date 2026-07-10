# NX9 Storyboard 全量重设计规格书 v2.0

> **文档性质**：Storyboard 模式的**唯一施工 SSOT**（原型 · 视觉 · 交互 · 逻辑 · 逐文件代码 · 验收）  
> **替代关系**：取代 `NX9-STORYBOARD-UI-IMPLEMENTATION-SPEC.md` 中的「向导卡片」方案；战略层仍参考 `NX9-STORYBOARD-FIRST-REFACTOR-PLAN.md`  
> **审计基线**：2026-07-10 · 含用户截图反馈（当前 UI = 居中卡片 + 重复步骤条 + 右侧完成页 = **不合格**）  
> **硬约束**：  
> ① Infinite Canvas 不可移除 · ② Storyboard / Workflow **互斥渲染** · ③ **Workflow 路径代码零删除**（ReactFlow / ModuleDock / flow-runner / Block 组件 / Inspector 等保持可运行）

---

## 0. 对当前实现的诊断（对照你的截图）

### 0.1 截图里看到什么

| 区域 | 现状 | 问题 |
|------|------|------|
| 顶栏 | NX9 创作工作室 + 工作区 Tab + 已保存 | 工作区 Tab 占满左侧，像 IDE 不像创作工具 |
| 画布顶 | 13 步胶囊条（脚本→…→导出） | 步名与 `playbook-definitions` 不完全一致时用户更困惑 |
| 画布中 | **窄卡片 StepHero**「第 13 步 导出」+ 大按钮 | 像 SaaS 向导，不像「漫剧工作室」 |
| 卡片下 | ExportStepCanvas 表单（MP4/ZIP/HF/Remotion） | 与 Hero 按钮**功能重复**；HF/Remotion 灰掉仍占位 |
| 右侧 Rail | NextStepBanner「生产完成 🎉」+ 13 步 checklist + JSON 导出 | 与中央完成态**三重重复**；仍叫 Playbook |
| 底部 | 打开画板 / 打开成片工作室 | 用户已在「画板」上，文案矛盾 |

### 0.2 代码层根因（为何变成这样）

| 问题 | 文件 | 说明 |
|------|------|------|
| 向导卡片布局 | `StoryboardStage.tsx` | `max-width:720px` 居中 `StepHero` + `StepCanvas` 垂直堆叠 |
| 步骤条重复 | `FlowSurface.tsx` L1664 + `StoryboardStage.tsx` L129 | **CanvasFlowRail 渲染两次** |
| 完成页重复 | `NextStepBanner.tsx` + `StepHero` | Storyboard 模式应只保留一种完成 UI |
| 步 ⑧–⑫ 空壳 | `StepCanvas.tsx` | 5 步走 `GenericStepCanvas` 占位 |
| 无真正无限画布 | `StoryboardCanvasView.tsx` | `overflow-y-auto` 列表，**无 pan/zoom** |
| Workflow 未隔离思维 | `StudioTopBar.tsx` | Storyboard 分支不完整 |

### 0.3 v2 设计一句话

> **Storyboard = 在 Infinite Canvas 上按「场次泳道 + 镜头卡片」组织创作；步骤条是导航；右侧是编辑器；中央永远是「你的漫剧」，不是「表单向导」。**

---

# 第一部分：设计愿景与体验原则

## 1.1 产品心智

| 维度 | Workflow 模式（保留不动） | Storyboard 模式（全量重做） |
|------|---------------------------|------------------------------|
| 用户是谁 | 进阶 / 自由模式 | 默认所有 Playbook 用户 |
| 核心隐喻 | 节点流程图 | **胶片条 / 分镜墙 / 场次泳道** |
| 画布内容 | XYFlow 节点 + 边 | **SceneLane × ShotCard**（可 pan/zoom） |
| 步骤条 | 辅助 | **主导航**（可点、有 !、可跳转已完成步） |
| 主操作位置 | 节点 Run 按钮 | **ShotCard 上 + 右侧 Rail + 底部 GuideBar** |
| 禁止出现 | — | ModuleDock、节点、连线、Inspector kind、批量 Run |

## 1.2 六大体验原则（Storyboard 专属）

1. **Canvas First**：任何步 ≥③，画布主区域必须是 Scene/Shot 视觉内容，不能只显示表单。  
2. **One Primary Action**：每步只有 **1 个**主按钮（GuideBar），禁止 Hero 按钮 + StepCanvas 内再一个大按钮重复。  
3. **No Triple Repeat**：步骤完成态只出现 **1 次**（画布 CelebrationOverlay），Rail 不再列 13 个勾。  
4. **Editor on Rail**：输入/配置在右侧；画布只做**预览 + 操作入口**。  
5. **Progress Always Visible**：顶步骤条 + 底 GuideBar +（生成时）TaskBar，三处职责不同、不重复文案。  
6. **Workflow Sacred**：Storyboard 仅 **读/写** `workspace-document` 与 **调用** `flow-runtime` 公开 API，不改 runner 内部。

## 1.3 视图互斥（架构不变）

```text
FlowSurface (StageDeckSurface)
├── canvasView === 'storyboard'
│     └── StoryboardShell v2          ← 全新实现，替换 StoryboardStage
│           ├── StoryboardFlowRail    ← 唯一步骤条实例
│           ├── StoryboardViewport    ← Infinite pan/zoom
│           ├── StepGuideBar          ← 替代 StepHero（薄条，非卡片）
│           └── StepLayerRouter       ← 按步渲染画布层
└── canvasView === 'flow'
      └── [现有 ReactFlow 全部保留，一行不改逻辑]
```

---

# 第二部分：Storyboard 设计系统（DS-SB）

## 2.1 色彩（仅 Storyboard 层使用，不影响 Workflow）

| Token | 值 | 用途 |
|-------|-----|------|
| `--sb-canvas-bg` | `#F7F5F2` | 画布底色（暖灰，非纯白） |
| `--sb-scene-lane-bg` | `#FFFFFF` | 场次泳道 |
| `--sb-scene-lane-border` | `#E8E4DF` | 泳道边框 |
| `--sb-shot-aspect` | `16/9` | 镜头卡片比例 |
| `--sb-shot-w` | `220px` | 卡片宽 |
| `--sb-shot-gap` | `12px` | 卡片间距 |
| `--sb-brand` | 沿用 `--brand` | 主色 |
| `--sb-step-done` | `#2E8B57` | 步完成 |
| `--sb-step-error` | `#DC2626` | 步失败 |
| `--sb-step-wait` | `#D97706` | 等待确认 |
| `--sb-guide-h` | `56px` | 底栏 Guide 高度 |
| `--sb-rail-w` | `380px` | Storyboard 右栏宽 |

## 2.2 字体

| 级别 | 大小 | 权重 | 场景 |
|------|------|------|------|
| H1 项目标题 | 15px | 600 | 顶栏 |
| H2 场次名 | 13px | 600 | SceneLane 头 |
| H3 步引导 | 14px | 600 | GuideBar |
| Body | 12px | 400 | 镜头描述 |
| Caption | 10px | 400 | 状态徽章 |

## 2.3 组件库（Storyboard 专用 · 全部新建）

| 组件 | 路径 | 职责 |
|------|------|------|
| `StoryboardShell` | `storyboard/v2/StoryboardShell.tsx` | 根布局 |
| `StoryboardFlowRail` | `storyboard/v2/StoryboardFlowRail.tsx` | 步骤条（从 CanvasFlowRail 复制 UI 逻辑，Storyboard 专用样式） |
| `StoryboardViewport` | `storyboard/v2/StoryboardViewport.tsx` | pan/zoom 容器（`@use-gesture/react` 或 transform） |
| `StepGuideBar` | `storyboard/v2/StepGuideBar.tsx` | 底栏：当前步说明 + 单 CTA + 进度 |
| `SceneLane` | `storyboard/v2/lanes/SceneLane.tsx` | 单场横向 Shot 列 |
| `ShotCard` | `storyboard/v2/cards/ShotCard.tsx` | 单镜：缩略图/状态/步级操作 |
| `ScriptScroll` | `storyboard/v2/layers/ScriptScroll.tsx` | 步① 剧本卷轴视觉 |
| `SceneChipRow` | `storyboard/v2/layers/SceneChipRow.tsx` | 步② 场次 chips |
| `CharacterWall` | `storyboard/v2/layers/CharacterWall.tsx` | 步④ 人物墙 |
| `EnvironmentWall` | `storyboard/v2/layers/EnvironmentWall.tsx` | 步⑤ 场景卡墙 |
| `CameraLinkBoard` | `storyboard/v2/layers/CameraLinkBoard.tsx` | 步⑥ 关联状态板 |
| `ReviewStrip` | `storyboard/v2/layers/ReviewStrip.tsx` | 步⑧⑫ 审阅条 |
| `TimelinePreview` | `storyboard/v2/layers/TimelinePreview.tsx` | 步⑪ 迷你时间线 |
| `ExportDock` | `storyboard/v2/layers/ExportDock.tsx` | 步⑬ 导出（仅 Rail 内详细表单；画布只预览） |
| `CelebrationOverlay` | `storyboard/v2/CelebrationOverlay.tsx` | 全流程完成 |
| `StoryboardLauncher` | `storyboard/v2/StoryboardLauncher.tsx` | 选模式全屏 |
| `StoryboardRail` | `storyboard/v2/StoryboardRail.tsx` | 右栏壳（包装现有 Panel） |
| `PlaybookEmptyGuide` | `storyboard/v2/PlaybookEmptyGuide.tsx` | 无 playbook 引导 |

**命名空间**：全部在 `apps/web/src/engine/stage-deck/storyboard/v2/`，与 v1（当前 lazy 实现）并存，切换后删 v1。

---

# 第三部分：全局布局（像素级）

## 3.1 Storyboard 模式屏幕分区

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ StoryboardTopBar  h=48px                                                     │
│ [≡] NX9 漫剧工作室 │ 《项目名》 │ 草稿▾ │ ───────── │ [任务·] [设置] [用户]   │
├────┬─────────────────────────────────────────────────────────────┬───────────┤
│ WR │  StoryboardViewport (flex-1, pan/zoom)                        │ SB-Rail   │
│ 56 │  ┌ StoryboardFlowRail fixed top+12 center ────────────────┐  │ w=380     │
│ px │  │ ①②③…⑬  (sticky, z=30)                                  │  │           │
│    │  └────────────────────────────────────────────────────────┘  │ Tab:      │
│    │  ┌─ Layer Content (transform translate scale) ─────────────┐  │ [当前步]  │
│    │  │  SceneLane / ScriptScroll / CharacterWall / …          │  │ [检查]    │
│    │  │  （随步骤切换 Layer，≥③ 默认 SceneLane 叠放）            │  │ [任务]    │
│    │  └────────────────────────────────────────────────────────┘  │           │
│    │                                                              │ Panel     │
├────┴─────────────────────────────────────────────────────────────┴───────────┤
│ StepGuideBar  h=56px  │ 第3步·分镜 │ 说明… │ ████░░ 6/9 │ [生成分镜表 →]      │
├──────────────────────────────────────────────────────────────────────────────┤
│ TaskBar h=28px (仅 generating) │ 图片生成 3/9 · 点击查看                             │
└──────────────────────────────────────────────────────────────────────────────┘

WR = WorkspaceRail 收窄图标模式（56px，hover 展开 200px）
```

## 3.2 与 Workflow 布局对比

| 元素 | Storyboard v2 | Workflow（不动） |
|------|---------------|----------------|
| 顶栏 | `StoryboardTopBar` | 现有 `StudioTopBar` 全量 |
| 左 | 收窄 WorkspaceRail | WorkspaceRail + ModuleDock |
| 中 | StoryboardViewport | ReactFlow |
| 右 | StoryboardRail | ContextRail + Inspector |
| 底 | GuideBar + TaskBar | LogPanel 等 |

## 3.3 AppShell 分支（允许改动的唯一入口）

```typescript
// AppShell.tsx — 仅增加分支，不删 Workflow 分支
const canvasView = useCanvasView(s => s.view);

return (
  <>
    {canvasView === 'storyboard'
      ? <StoryboardTopBar ... />
      : <StudioTopBar ... />  /* 原样保留 */}
    ...
    {canvasView === 'flow' && <ModuleDock ... />}  /* 原样 */}
    <StageDeckSurface />
    {canvasView === 'storyboard' && <TaskBar />}
  </>
);
```

---

# 第四部分：页面状态机

## 4.1 顶层状态

```text
                    ┌─────────────┐
                    │  NO_SESSION │  无 playbook / dismissed
                    └──────┬──────┘
                           │ 选模式
                           ▼
                    ┌─────────────┐
         ┌─────────│   ACTIVE    │  playbookSession.active
         │         └──────┬──────┘
         │                │ 最后一步 export_ready
         │                ▼
         │         ┌─────────────┐
         │         │  COMPLETED  │  CelebrationOverlay
         │         └─────────────┘
         │
         └── workflowEnabled + 用户切换 → canvasView='flow'（Workflow 全保留）
```

## 4.2 步内子状态（每步统一）

```text
empty → editing → waiting_confirm → generating → done
                  ↘ error → retry
```

映射到 `StepVisualState`：`future/blocked/current/waiting/error/done/skipped`

---

# 第五部分：逐屏原型（13 步 · 真人/3D · 含三态）

> 每步列：**画布 Layer** · **GuideBar** · **Rail Panel** · **用户操作** · **系统逻辑**

---

## 5.0 态 A：无 Session · StoryboardLauncher

**何时**：`!playbookSession || dismissed` 且 `canvasView==='storyboard'`

```text
┌─ Viewport 全屏 ─────────────────────────────────────────────────┐
│                                                                 │
│              🎬  开始你的 AI 漫剧                                  │
│         选一个创作模式，我们带你一步步完成                          │
│                                                                 │
│    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │
│    │ 真人 · 13步  │ │  3D · 13步  │ │ 动漫 · 11步 │              │
│    │  预计 90min │ │  预计 90min │ │  预计 60min │              │
│    └─────────────┘ └─────────────┘ └─────────────┘              │
│                                                                 │
│    更多：爆款短视频 · 线稿单集 · 声音剧 …                           │
│                                                                 │
│    ⚠ 请先配置 AI 模型  [去设置]                                   │
│    高级创作者：[启用流程编辑模式] → settings.workflowEnabled       │
└─────────────────────────────────────────────────────────────────┘
```

**交互**：选卡片 → §7.1 启动序列  
**Rail**：隐藏或显示「最近项目」缩略（可选 P1）

---

## 5.1 步 ① 剧本 · `script`

### 画布 Layer：`ScriptScroll`

```text
┌─ Viewport ──────────────────────────────────────────────────────┐
│  （暖灰纸纹背景，可 subtle pan）                                  │
│                                                                 │
│     ┌─ 剧本卷轴卡片 w=640 ─────────────────────────────┐         │
│     │  📜 我的剧本                                      │         │
│     │  ─────────────────────────────────────────────  │         │
│     │  （空态：虚线框 + 「点击右侧开始写作」）            │         │
│     │  （有内容：前 500 字 +  fade + 总字数）            │         │
│     └─────────────────────────────────────────────────┘         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### GuideBar

| 态 | 文案 | CTA |
|----|------|-----|
| empty | 第 1 步 · 写下你的故事 | `打开剧本编辑器` → focus Rail script |
| editing | 已输入 N 字 | `保存并继续`（has_source_text 后 enabled） |
| done | 剧本已就绪 | `查看场次` → jump step 2 |

### Rail：`ScriptStudioPanel`（自动打开）

### 逻辑

- 保存：`scriptPlan.sourceText` debounce 300ms  
- auto-advance：`has_source_text` → step 2 + Toast + Layer 切 `SceneChipRow`

---

## 5.2 步 ② 场次 · `scene-split`

### 画布 Layer：`SceneChipRow`

```text
  横向 scroll 场次 chip（宽 160px × 高 100px）：
  ┌──────┐ ┌──────┐ ┌──────┐
  │ S01  │ │ S02  │ │ +    │
  │雨夜  │ │办公室│ │      │
  └──────┘ └──────┘ └──────┘
  空态：仅一个虚线「+ 拆分场次」
```

### GuideBar

| 态 | CTA |
|----|-----|
| empty | `AI 拆分场次` → 调 agent scene-split |
| waiting | `确认写入 (3 场)` → 写 scriptPlan.scenes |
| done | `进入分镜` |

### Rail：`ScriptStudioPanel` > `SceneSplitPanel` 展开

---

## 5.3 步 ③ 分镜 · `storyboard`

### 画布 Layer：`SceneLane` × N（**核心默认层，此后一直可见**）

```text
┌ Scene S01 · 雨夜重逢 ────────────────────────────────────────────►
│ ┌Shot1┐ ┌Shot2┐ ┌Shot3┐ ┌ ＋ ┐
│ │草稿 │ │待生成│ │待生成│ │添加│
│ └─────┘ └─────┘ └─────┘ └────┘
└──────────────────────────────────────────────────────────────────
┌ Scene S02 · … ───────────────────────────────────────────────────►
│ ...
```

**ShotCard 结构（220×190 含脚）**：

```text
┌─────────────────┐
│   aspect 16:9   │  ← 缩略图 or 占位图标
│   [状态角标]     │
├─────────────────┤
│ #03  镜号       │
│ 描述两行…       │
│ [步级动作按钮]   │  ← 本步只显示「生成」类
└─────────────────┘
```

### GuideBar

| 态 | CTA |
|----|-----|
| empty | `AI 生成分镜表` |
| partial | `继续生成` (shots<3) |
| done | `设置角色` |

### Rail：`StoryboardRailPanel`

### 逻辑

- shots ≥ 3 → advance 步 ④  
- **从本步起**，后续步骤画布**保留 SceneLane**，仅叠加/高亮不同信息（角色头像角标、视频 icon 等）

---

## 5.4 步 ④ 角色 · `character-bible`

### 画布：SceneLane（底层）+ `CharacterWall` 浮层（顶部 120px 高）

```text
┌ 角色 ────────────────────────────────────────────────────────────►
│ [林晓 !缺图] [陈默 ✓] [+]
└──────────────────────────────────────────────────────────────────
（下方 SceneLane 半透明，可点镜头）
```

### GuideBar：`从剧本提取角色` / `上传参考图` / `进入场景设置`

### Rail：`CharacterBibleStepPanel`

---

## 5.5 步 ⑤ 环境 · `environment-bible`

### 画布：SceneLane + `EnvironmentWall`

```text
┌ 场景参考 ────────────────────────────────────────────────────────►
│ [S01 雨夜 3/6 图] [S02 办公室 !0图] [+]
└──────────────────────────────────────────────────────────────────
```

### GuideBar：`生成环境卡` / `上传参考图`  
### 步条 ! 直到 `referenceUrls.length >= 1`  
### Rail：`EnvironmentBiblePanel`

---

## 5.6 步 ⑥ 机位 · `camera-3d` / `camera-live`

### 画布：SceneLane，ShotCard 角标显示链接状态

```text
ShotCard 右上角：🔗 已关联 / ⚠ 未关联
顶部汇总条：已关联 5/9 镜（需 ≥50%）
```

### GuideBar

| 模式 | CTA |
|------|-----|
| 3D | `打开 3D 导演台` |
| 真人 | `加载导演台` + `自动关联镜头` |

### Rail：提示列表 + 打开 `Director3dPanel`（3D）

---

## 5.7 步 ⑦ 关键帧 · `keyframe-gen`

### 画布：SceneLane，ShotCard 显示首帧缩略图 + 生成进度环

### GuideBar：`批量生成关键帧 (9)` → `run_batch picture-gen`  
### TaskBar：图片 3/9  
### 失败：ShotCard 红框 + 步条 error

---

## 5.8 步 ⑧ 审帧 · `keyframe-review`

### 画布：SceneLane + `ReviewStrip`（卡片放大 + 通过/重做）

### GuideBar：`进入审阅模式` → viewMode=review  
### 全部 approved → advance

---

## 5.9 步 ⑨ 视频 · `video-gen`

### 画布：SceneLane，ShotCard 显示 video 缩略 + ▶

### GuideBar：`生成视频` → cascade clip-gen / motion-story  
### **必须 scoped**（GAP-007）：仅当前 playbook shots

---

## 5.10 步 ⑩ 连贯 · `consistency`

### 画布：SceneLane + 问题 pin 标记在冲突镜头上

### GuideBar：`运行连贯检查` / `跳过`

---

## 5.11 步 ⑪ 成片 · `episode-studio`（13 步专属）

### 画布：SceneLane（灰）+ `TimelinePreview` 占宽 80%

```text
┌ Timeline ────────────────────────────────────────────────────────►
│ ▶ ━━━●━━━━━━━━━━━━  0:42 / 2:15
│ [S01][S01][S02][S02]…
└──────────────────────────────────────────────────────────────────
```

### GuideBar：`打开成片工作室` → EpisodeStudioPanel

---

## 5.12 步 ⑫ 门控 · `review-gate`

### 画布：同 5.8，videoStatus 维度

### GuideBar：`审阅全部视频` / `全部通过`

---

## 5.13 步 ⑬ 导出 · `export`

### 画布：**仅展示** SceneLane 全片缩略 + 时长，**不放导出表单**

```text
┌ 成片预览墙（所有 Shot 视频缩略）──────────────────────────────────►
│  总时长 2:15 · 9 镜 · 状态：可导出
└──────────────────────────────────────────────────────────────────
```

### GuideBar：单一 CTA `导出 MP4 并下载`（直接触发 ffmpeg 主路径）

### Rail Tab「当前步」：`ExportDock` 详细选项（MP4/ZIP；HF/Remotion 隐藏或折叠「即将推出」）

**禁止**：画布中央再堆 ExportStepCanvas 表单（截图中的问题）

---

## 5.14 完成态 · `CelebrationOverlay`

```text
┌─ 全屏半透明 ────────────────────────────────────────────────────┐
│                    🎉 漫剧制作完成                                │
│              《项目名》已导出 · 9 镜 · 2:15                       │
│         [ 下载成片 ]  [ 新建项目 ]  [ 切换到流程编辑 ]             │
└─────────────────────────────────────────────────────────────────┘
```

**Rail**：不再显示 NextStepBanner 13 步 checklist（**删除 Storyboard 模式下 Banner 完成 UI**）

---

## 5.15 11 步动漫 · 差异表

| 步 | 13步 3D/真人 | 11步动漫 |
|----|-------------|----------|
| ⑥ | camera-* | **无**（步序跳过） |
| ⑨ video | motion-story / clip-gen | clip-gen |
| ⑪ | episode-studio | **无** |
| ⑫ review-gate | 有 | 步 ⑩ |
| ⑬ export | 有 | 步 ⑪ |

`StoryboardFlowRail` 动态 `def.steps.length` + `shortLabel`

---

# 第六部分：Storyboard 右栏（StoryboardRail）

## 6.1 Tab 结构

| Tab | id | 内容 |
|-----|-----|------|
| 当前步 | `step` | 按 `currentStepId` 映射 Panel（见下表） |
| 检查 | `inspect` | `InspectionPanel` |
| 任务 | `tasks` | `TaskCenterPanel` |

**禁止 Tab**：inspector / workflow / 原 storyboard/script/library 多 Tab 并列（Storyboard 下合并为「当前步」动态名，如「① 剧本」「⑤ 环境」）

## 6.2 当前步 → Panel 映射

| step.id | Panel 组件（复用现有，不修改内部逻辑） |
|---------|--------------------------------------|
| script | `ScriptStudioPanel` |
| scene-split | `ScriptStudioPanel`（SceneSplit 子区） |
| storyboard | `StoryboardRailPanel` |
| character-bible | `CharacterBibleStepPanel` |
| environment-bible | `EnvironmentBiblePanel` |
| camera-* | `StoryboardRailPanel` + 3D 入口 |
| keyframe-gen | `StoryboardRailPanel` |
| keyframe-review | `StoryboardRailPanel` |
| video-gen | `StoryboardRailPanel` |
| consistency | `InspectionPanel` |
| episode-studio | 内嵌 Episode 快捷入口 |
| review-gate | `StoryboardRailPanel` |
| export | `ExportDock`（新建，包装 export-pack-runner） |

## 6.3 NextStepBanner 处置

| 模式 | 处置 |
|------|------|
| Storyboard | **不渲染** NextStepBanner；完成用 CelebrationOverlay |
| Workflow | **保留** NextStepBanner 原样 |

---

# 第七部分：逻辑与数据（不动 Workflow 引擎）

## 7.1 Playbook 启动序列（完整）

```typescript
// storyboard/v2/playbook-bootstrap.ts
export function bootstrapPlaybook(playbookId: PlaybookId, deps: {
  startPlaybook: typeof useWorkspaceDocument.getState().startPlaybook;
  loadTemplate: (id: string, mode: 'replace') => Promise<void>;
  setCanvasView: (v: 'storyboard') => void;
  requestRailTab: ContextRailUi['requestTab'];
  setProjectStatus: (s: ProjectStatus) => void;
}) {
  const def = PLAYBOOK_DEFINITIONS.find(p => p.id === playbookId);
  if (!def?.steps.length) return;

  deps.startPlaybook(playbookId);
  deps.setProjectStatus('draft');
  deps.setCanvasView('storyboard');

  if (def.bootstrapTemplates[0]) {
    void deps.loadTemplate(def.bootstrapTemplates[0].templateId, 'replace');
  }

  const first = def.steps[0];
  if (first.primaryAction.type === 'open_rail') {
    deps.requestRailTab(first.primaryAction.tab, ...);
  }
}
```

**FlowSurface 改动**：`onStartPlaybook` 调用 `bootstrapPlaybook`；**不修改** `loadWorkflowTemplate` 内部。

## 7.2 SSOT 数据流

```text
playbook-definitions.ts
    ↓
playbook-readiness.ts ← workspace-document (scriptPlan, shots, envs, chars)
    ↓
evaluateAllStepVisualStates()
    ↓
┌─────────────────┬──────────────────┬─────────────────┐
│ StoryboardFlowRail │ StepGuideBar   │ StoryboardRail  │
└─────────────────┴──────────────────┴─────────────────┘
    ↓
flow-runtime 公开 API（runBatch, runCascade, focusBlock, spawnBlockForShot）
    ↓
workspace-document 写回（shots.*Status, take URLs）
```

## 7.3 Hooks（新建，Storyboard 专用）

| Hook | 文件 | 职责 |
|------|------|------|
| `usePlaybookReadinessCtx` | `v2/hooks/use-playbook-readiness-ctx.ts` | 从 v1 提取 |
| `useCurrentPlaybookStep` | `v2/hooks/use-current-playbook-step.ts` | step + index + states |
| `useSceneLanes` | `v2/hooks/use-scene-lanes.ts` | scenes + shots 分组 |
| `useStepGuide` | `v2/hooks/use-step-guide.ts` | CTA label + disabled + onPrimary |
| `useStoryboardViewport` | `v2/hooks/use-storyboard-viewport.ts` | pan/zoom persist workspace |

## 7.4 auto-advance 规则（完整表）

| ID | 触发 | 条件 | 动作 |
|----|------|------|------|
| A1 | script debounce save | has_source_text | → ② + Layer SceneChipRow |
| A2 | scene confirm | has_scene_split | → ③ |
| A3 | shots written | has_storyboard_shots | → ④ + CharacterWall |
| A4 | character ready | has_character_bibles | → ⑤ |
| A5 | env refs | has_environment_bibles | → ⑥ |
| A6 | camera confirm | has_camera_blocks | → ⑦ |
| A7 | batch images done | has_keyframes | → ⑧ or error |
| A8 | keyframes approved | all_keyframes_approved | → ⑨ |
| A9 | videos done | has_video_assets | → ⑩ |
| A10 | consistency ok | consistency_resolved | → ⑪(13) / ⑩(11) |
| A11 | timeline ok | has_video_takes | → ⑫ |
| A12 | videos approved | all_videos_approved | → ⑬ |
| A13 | export ok | export_ready | Celebration + exported |

实现：保留 `use-playbook-auto-advance.ts`，Storyboard v2 订阅；**不改** advance 算法。

## 7.5 StoryboardViewport pan/zoom

```typescript
// v2/StoryboardViewport.tsx
interface ViewportState { x: number; y: number; zoom: number; }
// 持久化到 workspace-document.canvasAppearance 或新字段 storyboardViewport
// 手势：滚轮 zoom（cursor 为中心），拖拽 pan（左键空白区）
// 双击 SceneLane 标题：fit lane to width
```

---

# 第八部分：功能使用手册（用户视角 · 真人 13 步）

| 步 | 用户目标 | 看哪里 | 点哪里 | 完成标志 |
|----|----------|--------|--------|----------|
| 0 | 选模式 | 全屏 Launcher | 模式卡片 | 进入步① |
| 1 | 写剧本 | 卷轴预览 | 底栏「打开编辑器」/ 右侧输入 | 自动进步② |
| 2 | 拆场次 | 场次 chips | 底栏「AI 拆分」→「确认」 | 进步③ |
| 3 | 分镜 | 场次泳道 | 底栏「生成分镜表」 | ≥3 镜 |
| 4 | 角色 | 人物墙+泳道 | Rail 角色卡 / 提取 | 有参考图 |
| 5 | 环境 | 场景墙 | 上传参考图 | ≥1 环境有图 |
| 6 | 机位 | 镜头链接角标 | 3D/导演台 | ≥50% linked |
| 7 | 关键帧 | 卡片缩略图 | 批量生成 | ≥80% 有图 |
| 8 | 审帧 | 放大审阅条 | 通过/重做 | 全 approved |
| 9 | 视频 | 视频缩略 | 生成视频 | ≥1 有 video |
| 10 | 连贯 | 问题 pin | 修复/跳过 | 无 open issue |
| 11 | 成片 | 时间线 | 打开工作室 | 可播放 |
| 12 | 审视频 | 审阅条 | 全部通过 | video approved |
| 13 | 导出 | 成片墙预览 | 底栏「导出 MP4」| 下载成功 |

---

# 第九部分：代码实现方案

## 9.1 允许修改的文件（Storyboard 边界）

| 文件 | 改动类型 |
|------|----------|
| `AppShell.tsx` | 顶栏/TaskBar 分支 |
| `FlowSurface.tsx` | ① `canvasView==='storyboard'` 时 **不渲染** L1664 CanvasFlowRail；② 挂载 `StoryboardShell` 替 v1；③ onStartPlaybook 调 bootstrap |
| `canvas-view.ts` | 可增 `storyboardViewport` |
| `ContextRail.tsx` | Storyboard 模式下 **不渲染**（由 StoryboardRail 替代） |
| `context-rail-ui.ts` | 可增 `step` tab |
| `StudioTopBar.tsx` | 抽出 Workflow 分支，新增 `StoryboardTopBar.tsx` |
| `storyboard/v1/*` | 施工完成后 **删除** |
| `storyboard/v2/*` | **全部新建** |
| `styles/storyboard-v2.css` | 新建 DS-SB |
| `NextStepBanner.tsx` | 加 `if (canvasView==='storyboard') return null` |

## 9.2 禁止修改的文件（Workflow 神圣清单）

```text
apps/web/src/engine/flow-runner.ts
apps/web/src/engine/FlowSurface.tsx 内的 ReactFlow JSX 块（L1665-1743）
apps/web/src/engine/stage-deck/chrome/ModuleDock.tsx
apps/web/src/blocks/**/*
apps/web/src/engine/stage-deck/chrome/CommandPalette.tsx
apps/web/src/engine/stage-deck/chrome/InspectorRailPanel.tsx
packages/shared/src/data/playbook-definitions.ts  （仅可读，改需单独立项）
apps/server/**/*
```

## 9.3 v2 目录树（完整新建）

```text
apps/web/src/engine/stage-deck/storyboard/v2/
├── StoryboardShell.tsx
├── StoryboardFlowRail.tsx
├── StoryboardViewport.tsx
├── StepGuideBar.tsx
├── StoryboardRail.tsx
├── StoryboardTopBar.tsx          # 或 layout/StoryboardTopBar.tsx
├── StoryboardLauncher.tsx
├── CelebrationOverlay.tsx
├── PlaybookEmptyGuide.tsx
├── playbook-bootstrap.ts
├── step-layer-map.ts
├── step-rail-map.ts
├── step-guide-config.ts
├── hooks/
│   ├── use-playbook-readiness-ctx.ts
│   ├── use-current-playbook-step.ts
│   ├── use-scene-lanes.ts
│   ├── use-step-guide.ts
│   └── use-storyboard-viewport.ts
├── lanes/
│   ├── SceneLane.tsx
│   └── SceneLaneHeader.tsx
├── cards/
│   ├── ShotCard.tsx
│   └── ShotCardActions.tsx       # 按 stepId 决定显示哪些按钮
├── layers/
│   ├── ScriptScroll.tsx
│   ├── SceneChipRow.tsx
│   ├── CharacterWall.tsx
│   ├── EnvironmentWall.tsx
│   ├── CameraLinkBoard.tsx
│   ├── ReviewStrip.tsx
│   ├── TimelinePreview.tsx
│   └── ExportDock.tsx
└── utils/
    ├── shot-progress.ts
    └── step-block-reasons.ts       # 从 CanvasFlowRail 提取
```

## 9.4 核心文件实现要点

### 9.4.1 `StoryboardShell.tsx`

```typescript
export function StoryboardShell() {
  const session = useWorkspaceDocument(s => s.playbookSession);
  const canvasView = useCanvasView(s => s.view);
  if (canvasView !== 'storyboard') return null;

  if (!session || session.dismissed) {
    return <StoryboardLauncher />;
  }

  const { step, stepState, def, allDone } = useCurrentPlaybookStep();

  return (
    <div className="nx9-sb-shell absolute inset-0 flex flex-col bg-[var(--sb-canvas-bg)]">
      <StoryboardFlowRail />
      <div className="flex flex-1 min-h-0">
        <StoryboardViewport>
          <StepLayerRouter stepId={step.id} />
        </StoryboardViewport>
        <StoryboardRail stepId={step.id} />
      </div>
      <StepGuideBar step={step} state={stepState} />
      {allDone && <CelebrationOverlay playbook={def} />}
    </div>
  );
}
```

### 9.4.2 `StepLayerRouter.tsx`

```typescript
const LAYERS: Record<string, React.FC> = {
  script: ScriptScroll,
  'scene-split': SceneChipRow,
  storyboard: SceneLaneStack,      // SceneLane × N
  'character-bible': CharacterWallStack,  // CharacterWall + SceneLaneStack
  // … 见 step-layer-map.ts
  export: ExportPreviewWall,
};

// ≥③ 的步骤：始终渲染 SceneLaneStack 作为底层 z=0
// 步专属 layer 作为 z=10 overlay
```

### 9.4.3 `ShotCard.tsx` — 步级 actions

```typescript
// step-guide-config.ts
export function getShotActions(stepId: string, shot: StoryboardShot): ShotAction[] {
  switch (stepId) {
    case 'keyframe-gen':
      return [{ id: 'gen-frame', label: '生成', run: () => spawnBlockForShot(...) }];
    case 'keyframe-review':
      return [{ id: 'approve', label: '通过' }, { id: 'redo', label: '重做' }];
    case 'video-gen':
      return [{ id: 'gen-video', label: '生成视频' }];
    default:
      return []; // 其他步仅展示状态，操作在 GuideBar
  }
}
```

### 9.4.4 `FlowSurface.tsx` 最小 diff

```typescript
// 删除或条件化（Storyboard 时不渲染）：
{isStageDeck && ready && canvasView !== 'storyboard' && <CanvasFlowRail />}

// 替换：
{isStageDeck && ready && canvasView === 'storyboard' && (
  <StoryboardShell />
)}
// 删除 StoryboardStage import
```

### 9.4.5 `ExportDock.tsx`（Rail 内，非画布）

- 复用 `export-pack-runner.ts` 逻辑（从 v1 ExportStepCanvas 迁移）
- HF/Remotion：**不渲染按钮**，仅一行「更多格式即将推出」
- 导出成功：`setProjectStatus('exported')` + 打开 CelebrationOverlay

---

## 9.5 施工阶段（4 周）

| 周 | 交付 | 验收 |
|----|------|------|
| W1 | StoryboardShell + Viewport + FlowRail + GuideBar + TopBar + 删 v1 重复 rail | 选模式后见泳道/卷轴，无居中卡片 |
| W2 | SceneLane + ShotCard + 步 ①–⑤ layers + StoryboardRail | 步③ 见场次泳道；Rail 自动切 Tab |
| W3 | 步 ⑥–⑩ layers + TaskBar + Inspection + auto-advance 全链路 | 批量生成有底栏；无 NextStepBanner 完成页 |
| W4 | 步 ⑪–⑬ + Celebration + Export + E2E + 删 v1 | 导出无画布双表单；Workflow 回归测试 PASS |

---

## 9.6 测试用例

| ID | 步骤 | 期望 |
|----|------|------|
| SB-v2-001 | 选 3D 13 步 | 无 ModuleDock；无 ReactFlow DOM |
| SB-v2-002 | 步① | 卷轴空态 + 底栏 CTA + Script Rail |
| SB-v2-003 | 保存剧本 | 自动步②；画布切 chips |
| SB-v2-004 | 步③ 生成 | SceneLane 出现 |
| SB-v2-005 | 步⑬ | 画布无导出表单；Rail 有 ExportDock |
| SB-v2-006 | 完成 | CelebrationOverlay；无 Banner checklist |
| SB-v2-007 | 开 Workflow | 原 ReactFlow + Dock 完整 |
| SB-v2-008 | pan/zoom | 刷新后视口保持 |

---

# 第十部分：从 v1（当前 lazy 实现）迁移

| v1 文件 | v2 处置 |
|---------|---------|
| `StoryboardStage.tsx` | 删除 |
| `StepHero.tsx` | 删除（由 StepGuideBar 替代） |
| `step-canvas/*` | 逻辑迁入 `v2/layers/*` |
| `ExportStepCanvas.tsx` | 迁入 `ExportDock.tsx`（仅 Rail） |
| `storyboard-stage.css` | 替换为 `storyboard-v2.css` |

---

# 第十一部分：验收标准（产品 · 20 项）

1. [ ] 不像向导卡片（无 720px 居中 StepHero 大卡）  
2. [ ] 步 ≥③ 画布主视觉是场次泳道  
3. [ ] Infinite Canvas 可 pan/zoom  
4. [ ] 每步只有 1 个主 CTA（GuideBar）  
5. [ ] 步骤条只出现 1 次  
6. [ ] 完成态只出现 CelebrationOverlay  
7. [ ] 右侧 Rail Tab = 当前步 / 检查 / 任务  
8. [ ] 无「打开画板」矛盾文案  
9. [ ] 顶栏 Storyboard 极简（无 ModeCapsule）  
10. [ ] 用户能答「第 X 步做什么」  
11. [ ] 11 步动漫步数正确  
12. [ ] 导出 MP4 主路径可下载  
13. [ ] Workflow 切换后节点链完整  
14. [ ] ModuleDock 38 项仍在 Workflow  
15. [ ] flow-runner 文件无 diff  
16. [ ] Block 组件无 diff  
17. [ ] 缺环境图步条 ! + Inspection 一条  
18. [ ] 生成失败 Shot 红框 + 任务可重试  
19. [ ] 30 秒测试 PASS  
20. [ ] E2E 13 步冒烟 MANUAL→AUTO  

---

**文档状态**：v2 全量规格 · 待确认后按 W1 施工  
**与截图差异**：取消居中卡片堆叠 → 场次泳道 Infinite Canvas + 底栏 Guide + Rail 编辑  
**Workflow**：代码零删除，仅 `FlowSurface` 分支与 `AppShell` 顶栏条件渲染
