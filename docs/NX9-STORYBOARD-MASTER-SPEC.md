# NX9 Storyboard 完整主规格书（Master Spec · 唯一施工 SSOT）

> **版本**：v3.0 · 2026-07-10  
> **地位**：Storyboard 模式**唯一**可施工文档；**取代** `NX9-STORYBOARD-UI-IMPLEMENTATION-SPEC.md` 与 `NX9-STORYBOARD-FULL-REDESIGN-SPEC-v2.md` 作为实现依据  
> **战略层**：仍参考 `NX9-STORYBOARD-FIRST-REFACTOR-PLAN.md`  
> **硬约束**：Infinite Canvas · Storyboard/Workflow 互斥 · **Workflow 代码零删除**  
> **对照**：用户截图（步 13 导出 + 画布「暂无镜头数据」+ 底栏/Rail 双导出按钮）= **当前 v2 半成品，不合格**

---

# 卷零：你截图里是什么 · 为什么不合格

## 0.1 截图逐区解读

| 区域 | 你看到的内容 | 问题 |
|------|-------------|------|
| 顶栏 | 漫画工作室 + 工作区 Tab + 已保存 | 工作区 Tab 仍占首屏，像 IDE |
| 步骤条 | 仅数字 1–13，13 高亮 | **无步骤中文名**；不可点击跳转；无 ! 错误态 |
| 画布 | 大字「暂无镜头数据」 | **步 13 不应出现此空态**；应显示阻断页或成片预览墙 |
| 右 Rail | 导出 Tab + MP4/ZIP + 「导出并下载」 | 与底栏 **重复** |
| 底栏 | 「第 13 步：导出成片」+ 「导出 MP4 并下载」 | 与 Rail **重复**；且 export 步 `use-step-guide` 调的是 `runBatch()` **错误** |
| 逻辑矛盾 | 步 10 有 ✓，但步 13 无镜头 | **advance 未门禁**；前面步可能「空前进」 |

## 0.2 代码根因清单（必须修）

| # | Bug | 文件 | 行/逻辑 |
|---|-----|------|---------|
| B1 | 步 13 无 shots 仍可达 | `advancePlaybookStep` / readiness | `export` 步未强制 `has_storyboard_shots` |
| B2 | 画布空态文案不对 | `StepLayerRouter.tsx` L29-30 | 应用 `StepBlocker` 替代裸「暂无镜头数据」 |
| B3 | 导出双按钮 | `StepGuideBar` + `ExportDock` | 步 13 GuideBar 只能「打开导出设置」，下载仅在 Rail |
| B4 | 导出 CTA 调错 API | `use-step-guide.ts` L67-68 | `export` 应 `runExportPack` 或 `requestRailTab('step')` |
| B5 | 步骤条仅数字 | `StoryboardFlowRail.tsx` L24 | 当前步须显示 `shortLabel` |
| B6 | 步 ⑦–⑫ 无专属 Layer | `StepLayerRouter.tsx` | 缺 ReviewStrip / TimelinePreview / ExportPreviewWall |
| B7 | 角色步开错 Rail | `use-step-guide.ts` L39-40 | 应 `librarySub: 'character'` |
| B8 | CharacterWall overlay marginTop:-60 | `StepLayerRouter.tsx` L35 | 布局 hack，应改 flex 结构 |
| B9 | TaskSummaryBar 与 GuideBar 叠层 | `AppShell` + `StoryboardShell` | 固定 bottom 冲突 |
| B10 | Celebration 条件过严 | `StoryboardShell.tsx` L73 | 需 `export_ready` 且 exported |

## 0.3 合格 Storyboard 一句话

> **画布上永远是「你的漫剧」（卷轴/场次/镜头墙）；步骤条导航；底栏 1 个主 CTA；右侧编辑；缺数据时阻断并告诉回哪一步修。**

---

# 卷一：产品定义

## 1.1 定位

| 对外 | AI 漫剧创作工作室 |
|------|------------------|
| 默认模式 | Storyboard（Playbook 用户） |
| 高级模式 | Workflow（`settings.workflowEnabled`，ModuleDock + 节点链） |
| 画布 | Infinite Canvas（pan/zoom），Storyboard 与 Workflow **互斥渲染** |

## 1.2 Workflow 神圣边界（禁止改动清单）

```text
apps/web/src/engine/flow-runner.ts
apps/web/src/engine/FlowSurface.tsx 内 ReactFlow 块（nodes/edges/onConnect/…）
apps/web/src/engine/stage-deck/chrome/ModuleDock.tsx
apps/web/src/blocks/**/*
apps/web/src/engine/stage-deck/chrome/InspectorRailPanel.tsx
apps/web/src/engine/stage-deck/chrome/CommandPalette.tsx（Storyboard 下禁用即可）
packages/shared/src/data/playbook-definitions.ts（只读；改门禁另开任务）
apps/server/**/*
```

**允许改动**：`storyboard/v2/**`、`AppShell.tsx` 分支、`FlowSurface.tsx` 仅 `{canvasView==='storyboard' ? <StoryboardShell/> : <ReactFlow/>}` 与去掉重复 Rail、`ContextRail` 在 storyboard 下不挂载（已实现）。

---

# 卷二：设计系统 DS-SB（完整）

## 2.1 CSS 变量（`styles/storyboard-v2.css` 补全）

```css
:root {
  /* 画布 */
  --sb-canvas-bg: #F7F5F2;
  --sb-canvas-dot: rgba(0,0,0,0.04);

  /* 泳道 */
  --sb-scene-lane-bg: #FFFFFF;
  --sb-scene-lane-border: #E8E4DF;
  --sb-scene-lane-radius: 12px;
  --sb-scene-lane-pad: 16px;

  /* 镜头卡 */
  --sb-shot-w: 220px;
  --sb-shot-aspect: 16/9;
  --sb-shot-gap: 12px;
  --sb-shot-radius: 12px;

  /* 布局 */
  --sb-topbar-h: 48px;
  --sb-flow-rail-h: 44px;
  --sb-guide-h: 56px;
  --sb-taskbar-h: 28px;
  --sb-rail-w: 380px;
  --sb-ws-collapsed: 56px;

  /* 步骤态 */
  --sb-step-done: #2E8B57;
  --sb-step-error: #DC2626;
  --sb-step-wait: #D97706;
  --sb-step-current: var(--brand);

  /* 卷轴/空态 */
  --sb-scroll-w: 640px;
  --sb-blocker-w: 480px;
}
```

## 2.2 字体与间距

| Token | 值 | 用途 |
|-------|-----|------|
| `--sb-text-h1` | 15px/600 | 顶栏项目名 |
| `--sb-text-h2` | 13px/600 | 场次标题 |
| `--sb-text-body` | 12px/400 | 镜头描述 |
| `--sb-text-caption` | 10px/400 | 状态徽章 |
| `--sb-space-section` | 24px | 泳道间距 |
| `--sb-space-inline` | 12px | 卡片间距 |

## 2.3 组件 Catalog（Storyboard 专用 · 全部在 `storyboard/v2/`）

| 组件 | 状态 | 职责 |
|------|------|------|
| `StoryboardShell` | ✅ 已有 | 根布局 |
| `StoryboardTopBar` | ✅ 已有 | 极简顶栏 |
| `StoryboardFlowRail` | ⚠️ 需改 | 步骤导航 |
| `StoryboardViewport` | ✅ 已有 | pan/zoom |
| `StepGuideBar` | ⚠️ 需改 | **唯一**主 CTA（步 13 例外见下） |
| `StoryboardRail` | ✅ 已有 | 右栏 |
| `StoryboardLauncher` | ✅ 已有 | 选模式 |
| `StepLayerRouter` | ⚠️ 需改 | 画布层路由 |
| `StepBlocker` | ❌ 新建 | 缺数据阻断页 |
| `SceneLane` / `ShotCard` | ✅ 已有 | 泳道/卡片 |
| `ScriptScroll` | ✅ 已有 | 步① |
| `SceneChipRow` | ✅ 已有 | 步② |
| `CharacterWall` | ⚠️ 需改 | 步④ |
| `EnvironmentWall` | ⚠️ 需改 | 步⑤ |
| `CameraLinkBoard` | ✅ 已有 | 步⑥ |
| `KeyframeProgressBoard` | ❌ 新建 | 步⑦ |
| `ReviewStrip` | ❌ 新建 | 步⑧⑫ |
| `VideoProgressBoard` | ❌ 新建 | 步⑨ |
| `ConsistencyPinLayer` | ❌ 新建 | 步⑩ |
| `TimelinePreview` | ❌ 新建 | 步⑪ |
| `ExportPreviewWall` | ❌ 新建 | 步⑬ 画布 |
| `ExportDock` | ⚠️ 需改 | 步⑬ Rail（**唯一下载入口**） |
| `CelebrationOverlay` | ✅ 已有 | 完成 |

---

# 卷三：全局布局（像素级 · 每态）

## 3.1 Storyboard 激活态布局

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ StoryboardTopBar                                    h=48  z=50             │
│ [≡] NX9 漫剧工作室 │ 《项目名》 │ 草稿▾ │ ────── │ ⚙ 设置 │ 👤           │
├────┬───────────────────────────────────────────────────────────┬───────────┤
│ WR │ StoryboardViewport (flex-1, overflow hidden, pan/zoom)    │ Rail 380  │
│ 56 │  ┌─ FlowRail sticky top=56 center ─────────────────────┐ │           │
│    │  │ ①剧本 ②场次 [③分镜] … ⑬导出  ← 当前步显示中文       │ │ Tab       │
│    │  └─────────────────────────────────────────────────────┘ │ 当前步    │
│    │  ┌─ StepLayer content (transform) ──────────────────────┐ │ 检查      │
│    │  │  SceneLane × N  /  ScriptScroll /  Blocker …        │ │ 任务      │
│    │  └─────────────────────────────────────────────────────┘ │           │
├────┴───────────────────────────────────────────────────────────┴───────────┤
│ StepGuideBar  h=56  │ 第3步·分镜 │ … │ [ 主 CTA → ]                          │
├────────────────────────────────────────────────────────────────────────────┤
│ TaskBar h=28（仅 generating）│ 图片 3/9 · 点击查看                          │
└────────────────────────────────────────────────────────────────────────────┘
```

## 3.2 三区职责（禁止重复）

| 区域 | 唯一职责 | 禁止 |
|------|----------|------|
| **FlowRail** | 步骤导航、状态色、点击跳转已完成步 | 放 CTA 按钮 |
| **GuideBar** | 1 个主 CTA + 步说明 | 步 13 **不放**下载按钮 |
| **Rail** | 编辑表单、导出格式选择、**唯一下载** | 完成 checklist |
| **Viewport** | 创作内容预览 | 导出表单 |

## 3.3 步 13 导出特殊规则（修截图问题）

| 位置 | 内容 |
|------|------|
| **Viewport** | `ExportPreviewWall`：有 shots → 全片缩略条；无 shots → `StepBlocker`「请先完成分镜」→ 跳步 ③ |
| **GuideBar** | 主 CTA = **「查看导出选项」** → 仅 `setTab('step')` 聚焦 Rail，**不下载** |
| **ExportDock** | MP4/ZIP 选择 + **唯一**「导出并下载」按钮 |

---

# 卷四：状态机（完整）

## 4.1 项目级

```text
NO_PLAYBOOK → ACTIVE(step 1..N) → COMPLETED(export_ready) → EXPORTED → Celebration
                     ↓ error/waiting 子态
              BLOCKED(stepBlocker)
```

## 4.2 步级（每步统一）

```text
empty → editing → waiting_confirm → generating → done
                  ↘ error → retry
```

## 4.3 步进门禁（**新增 · 修 B1**）

在 `advancePlaybookStep` 或 `use-playbook-auto-advance` 前强制：

| 目标步 | 必须满足（readinessKey） |
|--------|-------------------------|
| ② scene-split | has_source_text |
| ③ storyboard | has_scene_split |
| ④ character | has_storyboard_shots |
| ⑤ environment | has_character_bibles |
| ⑥ camera | has_environment_bibles |
| ⑦ keyframe | has_camera_blocks（optional 可跳过则标记 skipped） |
| ⑧ review-frame | has_keyframes |
| ⑨ video | all_keyframes_approved |
| ⑩ consistency | has_video_assets |
| ⑪ episode | consistency_resolved |
| ⑫ review-gate | has_video_takes（13步）/ has_video_assets（11步） |
| ⑬ export | all_videos_approved |

**禁止**：`currentStepId === 'export'` 且 `shots.length === 0`。

---

# 卷五：13 步完整规格（每步 5 块：原型 · UI · 逻辑 · 用法 · 代码）

> 以下真人/3D 共用；⑥⑨ 差异见 §5.14。

---

## 步 ① 剧本 `script`

### 5.1.1 原型（画布）

```text
┌─ ScriptScroll w=640 居中 ─────────────────────┐
│  📜 我的剧本                                    │
│  ───────────────────────────────────────────  │
│  空态：虚线框 + 「在右侧粘贴你的故事」            │
│  有内容：前 500 字 fade + 右下角「共 N 字」       │
└───────────────────────────────────────────────┘
背景：暖灰 + 可选纸纹（CSS background-image 5% opacity）
```

### 5.1.2 UI 规格

| 元素 | 规格 |
|------|------|
| ScriptScroll | max-w `--sb-scroll-w`；padding 32px；圆角 16px；白底 shadow-sm |
| 空态图标 | FileText 48px，`text-ink/15` |
| 预览区 | max-h 320px scroll；font 14px/1.7 |

### 5.1.3 逻辑

- 进入：自动 `StoryboardRail` Tab=step → `ScriptStudioPanel`
- 保存：`scriptPlan.sourceText` debounce 300ms → persist workspace
- advance：`has_source_text` → 步 ② + Layer 切 `SceneChipRow` + Toast「剧本已保存」

### 5.1.4 用户用法

1. 选模式后自动到此步  
2. 右侧粘贴剧本  
3. 底栏无需点（自动前进）；若未配置 API Key → FlowRail 步① `error` + Inspection「去设置 AI 模型」

### 5.1.5 代码

| 文件 | 动作 |
|------|------|
| `layers/ScriptScroll.tsx` | 已有；加字数 badge、纸纹背景 |
| `use-step-guide.ts` case script | `requestRailTab('script')` ✅ |
| `playbook-bootstrap.ts` | 启动后 `requestRailTab('script')` ✅ |

---

## 步 ② 场次 `scene-split`

### 5.2.1 原型

```text
横向 scroll SceneChip 160×100：
[ S01 雨夜 ] [ S02 办公室 ] [ + 添加 ]
空态：单 chip「点击 AI 拆分场次」
```

### 5.2.2 UI

| SceneChip | 160×100；圆角 12px；选中 border-brand |
| 场次名 | 12px/600；摘要 10px/400 两行截断 |

### 5.2.3 逻辑

- GuideBar「AI 拆分场次」→ 调 `POST /api/agent/scene-split`（ScriptStudioPanel 同款）
- `waiting`：预览待确认 → GuideBar「确认并继续 (N 场)」
- advance：`has_scene_split`

### 5.2.4 用法

拆分 → 预览 → 确认写入 → 自动进步 ③

### 5.2.5 代码

| `SceneChipRow.tsx` | 接 agent API；显示 scenes from scriptPlan |
| `SceneSplitPanel` | Rail 内展开（ScriptStudioPanel 子区） |

---

## 步 ③ 分镜 `storyboard`

### 5.3.1 原型（**核心默认视觉 · 此后一直保留**）

```text
┌ Scene S01 · 雨夜重逢 ───────────────────────────────► horizontal scroll
│ [Shot1][Shot2][Shot3][+]
└──────────────────────────────────────────────────────
┌ Scene S02 · … ───────────────────────────────────────►
│ ...
```

### 5.3.2 UI · ShotCard（完整）

```text
宽 220px；圆角 12px；border #E8E4DF
┌─────────────────────┐
│ 16:9 缩略图区        │  ← firstFrameAssetId or 占位
│ [状态角标 右上]      │  ← linkedBlockId ✓ / error !
├─────────────────────┤
│ #03  状态pill        │
│ 描述 2 行            │
│ [步级按钮 0-2 个]    │  ← 由 stepId 决定，见 ShotCardActions
└─────────────────────┘
```

### 5.3.3 逻辑

- GuideBar「AI 生成分镜表」→ agent storyboard-table → 写入 shots
- advance：`has_storyboard_shots`（≥3）
- **从本步起**：`StepLayerRouter` 底层 **始终** 渲染 SceneLaneStack（除非 StepBlocker）

### 5.3.4 用法

生成分镜 → 画布出现场次泳道 → 自动进步 ④

### 5.3.5 代码

| `SceneLane.tsx` | horizontal flex overflow-x |
| `ShotCard.tsx` | 已有；接 `ShotCardActions` |
| `ShotCardActions.tsx` | 按 stepId 返回按钮列表 |
| `StepLayerRouter` | 步≥③ 永远尝试渲染 lanes |

---

## 步 ④ 角色 `character-bible`

### 5.4.1 原型

```text
顶部 CharacterWall h=120 horizontal scroll（z=10，不遮挡泳道）
[ 林晓 ! ] [ 陈默 ✓ ] [ + ]
下方 SceneLane 半透明 opacity-90
```

### 5.4.2 逻辑

- GuideBar「从剧本提取角色」→ agent extract-assets
- Rail：`CharacterBibleStepPanel`
- advance：`has_character_bibles`

### 5.4.3 代码 fix

`use-step-guide.ts` L39：`librarySub: 'character'` **不是 templates**

---

## 步 ⑤ 环境 `environment-bible`

### 5.5.1 原型

EnvironmentWall：场景卡 180×140，referenceUrls 网格 最多 6 张

### 5.5.2 逻辑

- 缺 referenceUrls → FlowRail 步⑤ `blocked` + badge `!`
- advance：`has_environment_bibles`（含 referenceUrls）

### 5.5.3 代码

`EnvironmentWall.tsx`：读 `environments.environments`；点击开 Rail EnvironmentBiblePanel

---

## 步 ⑥ 机位 `camera-3d` / `camera-live`

### 5.6.1 原型

SceneLane + CameraLinkBoard 顶栏：「已关联 5/9 镜（需 ≥50%）」

ShotCard 角标：🔗 / ⚠

### 5.6.2 差异

| 3D | GuideBar → Director3dPanel |
| 真人 | GuideBar → merge tpl-shot-script-desk |

### 5.6.3 advance

`has_camera_blocks`；**人工确认**可选

---

## 步 ⑦ 关键帧 `keyframe-gen`

### 5.7.1 原型 · 新建 `KeyframeProgressBoard`

```text
顶栏：关键帧 7/9  ███████░░  78%
SceneLane：无图镜头 card 边框 amber pulse
```

### 5.7.2 逻辑

- GuideBar「批量生成关键帧」→ `runtime.runBatch` 仅 picture-gen 节点
- TaskBar 显示进度
- 失败：步⑦ `error` + ShotCard 红框

---

## 步 ⑧ 审帧 `keyframe-review`

### 5.8.1 原型 · 新建 `ReviewStrip`

选中镜头放大 280px；按钮「通过」「重做」

### 5.8.2 逻辑

- GuideBar「进入审阅模式」→ viewMode=review
- advance：`all_keyframes_approved`

---

## 步 ⑨ 视频 `video-gen`

### 5.9.1 原型 · 新建 `VideoProgressBoard`

同⑦，维度 videoAssetId / videoStatus

### 5.9.2 逻辑

- 3D：`runCascade motion-story`；真人：`clip-gen`
- **GAP-007 修复**：scope 当前 playbook shots only

---

## 步 ⑩ 连贯 `consistency`

### 5.10.1 原型 · `ConsistencyPinLayer`

问题镜头上红色 pin；点击 Inspection

### 5.10.2 逻辑

GuideBar「运行检查」/ secondary「跳过」

---

## 步 ⑪ 成片 `episode-studio`（13步）

### 5.11.1 原型 · 新建 `TimelinePreview`

```text
宽 min(900px, 90vw)
▶ ━━━●━━━━━━━━  0:42 / 2:15
[S01][S01][S02]…
```

### 5.11.2 逻辑

GuideBar「打开成片工作室」→ EpisodeStudioPanel

---

## 步 ⑫ 审阅 `review-gate`

### 5.12.1 原型

复用 `ReviewStrip`，维度 `videoStatus`

---

## 步 ⑬ 导出 `export`（**修截图核心**）

### 5.13.1 原型 · 新建 `ExportPreviewWall`

**有 shots：**

```text
┌ 成片预览 ─────────────────────────────────────────────►
│ [▶ thumb1][thumb2][thumb3]…  总 9 镜 · 约 2:15
└──────────────────────────────────────────────────────
```

**无 shots（不应到达；若到达）：**

```text
┌ StepBlocker ────────────────────────────────────────┐
│  ⚠ 还没有分镜，无法导出                              │
│  [ 回到第 3 步 · 生成分镜 ]                          │
└──────────────────────────────────────────────────────
```

### 5.13.2 UI · ExportDock（Rail 内 · 唯一下载）

- Tab：时间线 MP4 | ZIP 打包
- **不显示** HF/Remotion 按钮；一行灰字「更多格式即将推出」
- **唯一**主按钮：「导出并下载」
- 成功：`setProjectStatus('exported')` + CelebrationOverlay

### 5.13.3 GuideBar（步 13）

- primaryLabel = **「查看导出选项」**
- onPrimary = `StoryboardRail` 内 `setTab('step')` + scroll to ExportDock
- **禁止** primaryLabel = 「导出 MP4 并下载」

### 5.13.4 逻辑 fix

```typescript
// use-step-guide.ts case 'export':
case 'export':
  // 仅聚焦 Rail，不 runBatch
  break; // 由 StoryboardRail 暴露 focusExport() 或通过 context

// ExportDock handleExport — 唯一下载入口
await runExportPack({ mode: 'ffmpeg-episode', shots, ... });
```

---

## 5.14 步 ⑥⑨ 模式差异

| 步 | pb-ai-comic-3d | pb-ai-comic-live | pb-anime |
|----|----------------|------------------|----------|
| ⑥ | camera-3d | camera-live | **无** |
| ⑨ | motion-story | clip-gen | clip-gen |
| ⑪ | episode-studio | episode-studio | **无** |
| 总步 | 13 | 13 | 11 |

`StoryboardFlowRail` 动态 `def.steps.length`；`step-guide-config` 按 step.id 键控。

---

# 卷六：StoryboardFlowRail 完整 UI（修 B5）

## 6.1 视觉

```text
胶囊容器：bg-white/90 blur；rounded-full；px-3 py-1.5；shadow-sm
每步：
  - done: 绿 ✓
  - current: brand 底 + 白字 + shortLabel（如「分镜」）+ 序号
  - error: 红 ! 
  - waiting: 黄 …
  - future: 灰序号
步间：连接线 12px
```

## 6.2 交互

| 点击 | 行为 |
|------|------|
| done 步 | 跳转 `currentStepId`（不 advance）+ 打开对应 Rail |
| current | scroll GuideBar into view |
| blocked | Tooltip 缺什么 + 「去修复」 |
| error | 打开 Inspection |

## 6.3 代码

```typescript
// StoryboardFlowRail.tsx
<button onClick={() => jumpToStep(step.id)} title={step.description}>
  {state === 'done' ? <Check/> : state === 'error' ? '!' : null}
  {isCurrent ? step.shortLabel : index + 1}
</button>
```

---

# 卷七：StepBlocker（新建 · 修空态）

## 7.1 Props

```typescript
interface StepBlockerProps {
  title: string;
  reason: string;
  fixLabel: string;
  fixStepId: string; // playbook step id to jump
}
```

## 7.2 使用场景

| 条件 | 文案 | 跳转 |
|------|------|------|
| export && shots.length===0 | 还没有分镜，无法导出 | storyboard |
| keyframe-gen && shots.length===0 | 请先生成分镜 | storyboard |
| video-gen && !has_keyframes | 请先生成关键帧 | keyframe-gen |
| !API Key | 请先配置 AI 模型 | settings drawer |

## 7.3 代码路径

`storyboard/v2/StepBlocker.tsx`；在 `StepLayerRouter` 开头判断，**替代** L29-30 裸文案。

---

# 卷八：StoryboardLauncher / Celebration

## 8.1 Launcher

- 全屏居中；3 张 Featured 卡片 + 更多折叠
- 文案：「开始你的 AI 漫剧」
- API Key 警告条
- 高级：「启用流程编辑模式」→ settings

## 8.2 CelebrationOverlay

- 条件：`projectStatus === 'exported'` **或** readiness export_ready + 下载成功
- 内容：项目名、镜数、时长、[下载成片][新建项目][流程编辑]
- **禁止** Rail 内 NextStepBanner 13 步 checklist（Storyboard 不渲染 NextStepBanner）

---

# 卷九：StoryboardRail 完整 Tab 映射

| step.id | Panel |
|---------|-------|
| script, scene-split | ScriptStudioPanel |
| storyboard, camera-*, keyframe-*, video-gen, review-gate | StoryboardRailPanel |
| character-bible | CharacterBibleStepPanel |
| environment-bible | EnvironmentBiblePanel |
| consistency | InspectionPanel |
| episode-studio | 内嵌按钮开 EpisodeStudioPanel |
| export | ExportDock |

Tab 名动态：`TAB_LABEL[stepId]`（已有）

---

# 卷十：逻辑 · SSOT · Hooks

## 10.1 数据 SSOT

```text
playbook-definitions.ts
  → playbook-readiness.ts (20 keys)
  → workspace-document (scriptPlan, storyboard.shots, characters, environments, playbookSession)
  → evaluateAllStepVisualStates()
  → StoryboardFlowRail | StepGuideBar | StepBlocker | InspectionPanel
```

## 10.2 Hooks

| Hook | 文件 | 职责 |
|------|------|------|
| usePlaybookReadinessCtx | hooks/use-playbook-readiness-ctx.ts | 组装 ctx |
| useCurrentPlaybookStep | hooks/use-current-playbook-step.ts | step+states+allDone |
| useSceneLanes | hooks/use-scene-lanes.ts | scene 分组 |
| useStepGuide | hooks/use-step-guide.ts | CTA 行为 **需按卷五修正** |
| useStoryboardViewport | hooks/use-storyboard-viewport.ts | pan/zoom |
| useStepBlocker | hooks/use-step-blocker.ts | **新建** 判断是否阻断 |

## 10.3 auto-advance（保留 use-playbook-auto-advance.ts）

- 500ms debounce
- 步进后：FlowRail flash + Toast + 自动 Rail Tab
- **新增**：步进前跑门禁表（卷四 §4.3）

## 10.4 jumpToStep（新建 store 动作）

```typescript
// workspace-document.ts 新增
jumpPlaybookStep: (stepId: string) => void; // 仅改 currentStepId，不 mark complete
```

供 FlowRail 点击已完成步、StepBlocker 回跳。

---

# 卷十一：功能使用手册（用户 · 13 步真人）

| 步 | 你要做什么 | 看哪里 | 点哪里 | 怎样算完成 |
|----|------------|--------|--------|------------|
| 0 | 选模式 | Launcher | 真人 13 步 | 进步 1 |
| 1 | 写剧本 | 卷轴 | 右侧输入 | 自动进步 2 |
| 2 | 拆场次 | chips | 底栏拆分→确认 | 进步 3 |
| 3 | 分镜 | 泳道 | 底栏生成分镜 | ≥3 镜 |
| 4 | 角色 | 人物墙 | Rail 角色卡 | 有参考 |
| 5 | 环境 | 场景墙 | 上传参考图 | ≥1 环境有图 |
| 6 | 机位 | 镜头角标 | 导演台/3D | ≥50% 关联 |
| 7 | 关键帧 | 卡片缩略 | 批量生成 | ≥80% 有图 |
| 8 | 审帧 | 审阅条 | 通过/重做 | 全 approved |
| 9 | 视频 | 视频缩略 | 生成视频 | ≥1 有 video |
| 10 | 连贯 | pin 标记 | 检查/跳过 | 无 issue |
| 11 | 成片 | 时间线 | 打开工作室 | 可播放 |
| 12 | 审视频 | 审阅条 | 全部通过 | video approved |
| 13 | 导出 | 预览墙 | Rail「导出并下载」| MP4 下载 |

---

# 卷十二：代码实现方案（完整 · 按优先级）

## 12.1 现有 v2 文件清单（31 文件）

已存在 — 见 `apps/web/src/engine/stage-deck/storyboard/v2/`

## 12.2 P0 修复（1–2 天 · 解决截图问题）

| 任务 | 文件 | 具体改动 |
|------|------|----------|
| P0-1 阻断页 | 新建 `StepBlocker.tsx` | 替代「暂无镜头数据」 |
| P0-2 导出不重复 | `step-guide-config.ts` L23 | primaryLabel→「查看导出选项」 |
| P0-3 导出 API | `use-step-guide.ts` case export | 删除 runBatch；聚焦 Rail |
| P0-4 唯一下载 | `ExportDock.tsx` | 保留；GuideBar 不下载 |
| P0-5 步条中文 | `StoryboardFlowRail.tsx` | current 显示 shortLabel |
| P0-6 门禁 | `use-playbook-auto-advance.ts` | 步进前校验卷四表 |
| P0-7 回跳 | `workspace-document.ts` | 新增 jumpPlaybookStep |
| P0-8 Export 画布 | 新建 `ExportPreviewWall.tsx` | 步 13 专用 |
| P0-9 角色 Rail | `use-step-guide.ts` L39 | character subtab |

## 12.3 P1 补全 Layer（3–5 天）

| 新建文件 | 步 |
|----------|-----|
| `KeyframeProgressBoard.tsx` | ⑦ |
| `ReviewStrip.tsx` | ⑧⑫ |
| `VideoProgressBoard.tsx` | ⑨ |
| `ConsistencyPinLayer.tsx` | ⑩ |
| `TimelinePreview.tsx` | ⑪ |
| `use-step-blocker.ts` | 全局 |

`StepLayerRouter.tsx` 重写为：

```typescript
export function StepLayerRouter({ stepId }: { stepId: string }) {
  const blocker = useStepBlocker(stepId);
  if (blocker) return <StepBlocker {...blocker} />;

  const overlay = STEP_OVERLAY[stepId]; // 步专属顶层
  const showLanes = STEP_HAS_LANES[stepId]; // 步③+ true

  return (
    <div className="nx9-step-layer-root p-6 min-w-max">
      {showLanes && <SceneLaneStack />}
      {overlay && <div className="nx9-step-overlay">{createElement(overlay)}</div>}
      {stepId === 'script' && <ScriptScroll />}
      {stepId === 'scene-split' && <SceneChipRow />}
      {stepId === 'export' && <ExportPreviewWall />}
    </div>
  );
}
```

## 12.4 P2 体验（5–7 天）

| 任务 | 文件 |
|------|------|
| FlowRail 点击跳转 | `StoryboardFlowRail` + jumpPlaybookStep |
| TaskBar 不叠 GuideBar | `StoryboardShell` flex 顺序；TaskBar 在 GuideBar 上方或合并 |
| NextStepBanner 禁用 | `NextStepBanner.tsx` 首行 `if canvasView==='storyboard' return null` |
| v1 删除 | `storyboard/StoryboardStage.tsx` 等 |
| E2E | `e2e/e2e-storyboard-13.spec.ts` |

## 12.5 FlowSurface 允许 diff（最小）

```typescript
// 已有：
{isStageDeck && ready && canvasView === 'storyboard' && <StoryboardShell />}
{!isStageDeck || canvasView !== 'storyboard' ? <ReactFlow .../> : null}

// 确保没有：
{isStageDeck && ready && <CanvasFlowRail />}  // Storyboard 下不要
```

## 12.6 AppShell 允许 diff（已有）

```typescript
{canvasView === 'storyboard' ? <StoryboardTopBar /> : <StudioTopBar ... />}
{canvasView === 'flow' && <ModuleDock ... />}
{canvasView !== 'storyboard' && <ContextRail ... />}
{canvasView === 'storyboard' && <TaskSummaryBar />}
```

## 12.7 禁止 diff 的文件

见卷一 §1.2。

---

# 卷十三：ShotCardActions 按步矩阵

| stepId | 卡片上显示按钮 |
|--------|----------------|
| keyframe-gen | 「生成」单镜 |
| keyframe-review | 「通过」「重做」 |
| video-gen | 「生成视频」 |
| review-gate | 「通过」「重做」 |
| 其他 | 无（操作在 GuideBar） |

实现：`cards/ShotCardActions.tsx` 扩展 `getShotActions(stepId, shot)`。

---

# 卷十四：测试与验收

## 14.1 自动化

| ID | 断言 |
|----|------|
| SB-001 | Storyboard 无 `.react-flow__viewport` |
| SB-002 | 步 1 打开 Script Rail |
| SB-003 | 无 shots 时步 13 显示 StepBlocker 非「暂无镜头数据」 |
| SB-004 | 步 13 仅 ExportDock 有一个下载 button |
| SB-005 | FlowRail current 含 shortLabel 文本 |
| SB-006 | shots=0 无法 auto-advance 到 export |
| SB-007 | 切 Workflow 后 ModuleDock 可见 |

## 14.2 产品走查 15 条

1. 不像向导中间卡片  
2. 步 ≥3 见泳道  
3. pan/zoom 可用  
4. 每步 GuideBar 仅 1 CTA  
5. 导出无双按钮  
6. 无 shots 不能导出且有回跳  
7. 步骤条有中文  
8. 完成只有 Celebration  
9. Workflow 完整  
10. 30 秒测试 PASS  
11. 缺环境图有 !  
12. 生成有 TaskBar  
13. 顶栏无 ModeCapsule  
14. 无 ModuleDock  
15. 无 NextStepBanner checklist  

---

# 卷十五：施工排期（2+3 周）

| 阶段 | 天 | 交付 |
|------|-----|------|
| **P0** | 1–2 | 修截图全部问题（Blocker/导出/门禁/步条） |
| **P1** | 3–7 | 补全 7 个 Layer + StepLayerRouter 重写 |
| **P2** | 8–12 | FlowRail 跳转、E2E、删 v1、走查 |

---

# 附录 A：与旧文档关系

| 文档 | 状态 |
|------|------|
| **本文 Master Spec** | ✅ 唯一施工 SSOT |
| NX9-STORYBOARD-FULL-REDESIGN-SPEC-v2.md | 归档参考 |
| NX9-STORYBOARD-UI-IMPLEMENTATION-SPEC.md | 归档 |
| NX9-STORYBOARD-FIRST-REFACTOR-PLAN.md | 战略层有效 |

---

# 附录 B：约束开发要求 对接

施工 AI **必须 100% 按本文档**；§12 P0 为最高优先级；Workflow 禁止改动清单违反即 reject。

**文档状态**：完整主规格 · 确认后先执行 P0（修你截图里的全部问题）再 P1 Layer 补全。
