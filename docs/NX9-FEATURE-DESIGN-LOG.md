# NX9 功能设计日志（追加式）

> **文档性质**：画布侧 / 成片侧功能的详细设计与实现方案沉淀处。  
> **维护规则**：只追加、不覆盖。新增功能请在文末继续加「功能 N」章节；已定稿章节仅允许勘误补丁（在同节末追加「修订记录」），禁止整段重写抹掉历史。  
> **真相源优先级**（与 `AGENTS.md` 一致）：用户当次指令 → 本仓库 `docs/` → `约束开发要求.md` → 现有代码行为。  
> **产品身份**：NX9 独立自研；方案只描述本仓库能力与缺口，不引用外部产品对照。

---

## 文档使用说明

| 项 | 约定 |
|----|------|
| 命名 | 功能章节标题：`## 功能 N · 〈中文名〉（kind / 模块）` |
| 必备小节 | 背景与目标、现状盘点、产品定位、原型、UI、功能清单、逻辑、算法、集成、数据契约、分阶段实现、验收、风险与存疑 |
| 状态标记 | `[存量]` 仓库已有 · `[改造]` 在存量上改 · `[新增]` 尚未实现 · `[存疑]` 需产品确认 |
| 实现时 | 以对应功能章节为开发依据；未写明处不得脑补业务 |

---

## 总览 · 已定稿功能索引与主链示意

> 本节随追加更新；**不替代**各功能专章。实现以专章为准。

### 已定稿功能索引

| 功能 | 标题 | kind / 模块 | 主链角色 | 状态 |
|------|------|-------------|---------|------|
| 1 | 智能剪辑 | `clip-editor` | 成片编排 / 渲染 | 设计定稿待实现（含 §1.16 命名勘误） |
| 2 | 统一导演台 | `director-desk`（←`director-3d`） | 3D + 整集关键帧批出 | 设计定稿待实现（含 §2.16 边界勘误） |
| 3 | 编剧台 | `script-desk`（←`dialogue-sheet`） | 成稿 + Bible draft | 设计定稿待实现 |
| 4 | 分镜台改造 | `storyboard-desk` | 拆镜 + 构图确认 | 设计定稿待实现 |
| 5 | 素材就绪门禁 | 素材库 + `asset-gate` | 制作级资产 SSOT + 放行 | 设计定稿待实现（主链缺口） |
| 6 | 视频生成主链 | `clip-gen` | 关键帧→镜头视频 | 设计定稿待实现（主链缺口） |
| 7 | 交付打包 | `export-pack` | 交付物打包 / 与智能剪辑切分 | 设计定稿待实现（主链缺口） |
| 8 | 内部提示词与 Dev Prompt Pack | 横切约定 | Agent system / 开发热调窗口 | 设计定稿（横切 · 非独立画布节点） |

### 漫剧主链示意（SSOT 交接）

```
┌─ 编剧台 script-desk ─────────────────────────┐
│  ScreenplayPackage (confirmed)               │
│  + Bible draft（叙事层，默认不入库）            │
└───────────────┬──────────────────────────────┘
                │
                ▼
┌─ 设定检查 asset-gate + 素材库 ────────────────┐
│  对照 draft / 镜级需求 ↔ 库内角色·场景        │
│  补齐参考图等制作资产后「放行」                 │
└───────────────┬──────────────────────────────┘
                │
                ▼
┌─ 分镜台 storyboard-desk ─────────────────────┐
│  从成稿拆镜 → ScriptBreakdownPayload          │
│  镜表编辑 / 绑定 → 线稿构图 → 确认本集         │
└───────────────┬──────────────────────────────┘
                │ workspace.storyboard.shots
                ▼
┌─ 导演台 director-desk ───────────────────────┐
│  3D guide（可选）→ 整集批出关键帧 → 审阅        │
│  firstFrameAssetId / keyframeStatus            │
└───────────────┬──────────────────────────────┘
                │ 送视频 / 连线
                ▼
┌─ 视频生成 clip-gen ──────────────────────────┐
│  linkedShot + 关键帧参考 → 镜头 mp4             │
└───────────────┬──────────────────────────────┘
                │ clips / shots 成片字段
                ▼
┌─ 智能剪辑 clip-editor ───────────────────────┐
│  TimelinePayload → FFmpeg / Remotion / HF     │
└───────────────┬──────────────────────────────┘
                │ 同一 timeline 或上游媒资
                ▼
┌─ 交付打包 export-pack ───────────────────────┐
│  zip / ffmpeg-episode / HF / Remotion bundle  │
└──────────────────────────────────────────────┘
```

**旁路（非本主链专章，可后补）**：爆款/图文复刻 ≈ `link-parser` / `reference-board` → `picture-gen`/`clip-gen` → 智能剪辑 → 导出（可跳过编剧台–分镜台–导演台完整链）。

### 建议实现同发顺序（跨章）

| 波次 | 内容 | 原因 |
|------|------|------|
| P0-A | 功能 3+4 拆镜桥（成稿↔拆镜） | 切断编剧台拆镜后的防断链 |
| P0-A′ | 功能 8（编剧/分镜 DEFAULT prompts + Dev 双闸） | 与 3/4 同发，避免 Agent 无稳定 system |
| P0-B | 功能 5（库 + 门禁读 Bible） | 分镜/导演锁资产依赖库 |
| P0-C | 功能 2 合并壳（可与 B 并行） | 批出主权 |
| P1 | 功能 6 批镜视频 + 功能 1 时间线 | 出片 |
| P1/P2 | 功能 7 与功能 1 职责收口 | 避免双出口混乱 |

### 跨章待决清单（`[存疑]` 汇总）

> 产品确认后：在对应专章「修订记录」勾销，并更新本表状态。**禁止**未确认就当默认实现。

| ID | 来源 | 议题 | 建议默认（未确认前） | 状态 |
|----|------|------|---------------------|------|
| O-1 | 功能1 | Remotion 服务端是否含 Chrome | P2 仅客户端 bundle + Player | 待决 |
| O-2 | 功能1 | Timeline 附着 WS 壳是否就绪 | P0 用 Episode Studio 顶上 | 待决 |
| O-3 | 功能1 | Agent 写 Hyperframes 模板协议 | 另开功能章；本阶段不做 | 待决 |
| O-4 | 功能2 | desk↔3d 双 scene 合并策略 | 3d 覆盖空 desk，否则保留 desk 并提示 | 待决 |
| O-5 | 功能2 | Modal 内 WebGL dispose / stage 全屏 | open=false 必 dispose；宽度先试 stage | 待决 |
| O-6 | 功能2 | Agent 3D 摆位协议 | P2；无自动桥 | 待决 |
| O-7 | 功能3 | Agent 会话是否外置 blob | P0 节点内；超阈再外置 | 待决 |
| O-8 | 功能3 | `script-desk` 文件名 vs 演进改名 | 允许文件演进改名 | 待决 |
| O-9 | 功能3 | Rail Script Studio 删除时机 | P0 隐藏，P1 删 | 待决 |
| O-10 | 功能4 | 重拆是否覆盖手改未确认镜 | 覆盖前二次确认 | 待决 |
| O-11 | 功能4 | 拆镜是否自动入库候选 | **否**（与功能3/5一致） | 待决（倾向否） |
| O-12 | 功能4 | sourceSnapshot 是否落盘 | 默认不落全文 | 待决 |
| O-13 | 功能5 | 门禁「一键入库」是否默认开 | 默认**关**；仅显式同步 | 待决（倾向关） |
| O-14 | 功能5 | 未放行是否硬阻断分镜台拆镜 | 警告可绕过；导演台锁参考可硬 | 待决 |
| O-15 | 功能6 | 整集批出视频在 clip-gen 还是新节点 | **强化 clip-gen**，不新 kind | 待决（倾向强化） |
| O-16 | 功能7 | 成片主出口：智能剪辑 vs export-pack | 剪辑=编排渲染；pack=打包交付 | 待决（见功能7） |
| O-17 | 功能8 | Dev Prompt Pack 开关载体 | `import.meta.env.DEV` + Settings「开发者选项」双闸 | 待决（倾向双闸） |
| O-18 | 功能8 | 覆盖落点：节点 data vs workspace blob | P0 节点 `*PromptPack`；超长再外置 | 待决 |

> **横切提示词**：功能 1–7 的内部 System / 开发热调窗口统一以 **功能 8** 为准；生产面镜级 `imagePrompt`/`videoPrompt` 仍由各台产品 UI 编辑，不归 Dev Pack。

---

# 功能 1 · 智能剪辑（`clip-editor` → Smart Edit）

- **状态**：设计定稿待实现（2026-07-21）
- **产品柱**：AI 漫剧成片 · 爆款/图文复刻轻剪导出
- **节点 kind**：保持 `clip-editor`（**不新建 kind**）；目录文案由「视频剪辑」升级为「智能剪辑」
- **交互壳约束**：本节点**不是** ScreenModal 弹窗节点；底部工作区类型保持 `timeline` / `media-editor`（见 `attached-workspace.ts`）。**禁止**压成 Prompt Bar。
- **相关存量面**：`EpisodeStudioPanel`、`export-pack`、`TimelinePayload`、`montage` API、`@nx9/remotion-compositions`、`@hyperframes/producer`

---

## 1.1 背景与目标

### 问题

当前 `clip-editor` 实质是「多段 FFmpeg 拼接 + 混音 + 调色」三模式工具卡，与「智能成片」产品预期不符：

| 缺口 | 代码事实 |
|------|----------|
| 无统一时间线 SSOT | 节点只持有 `extraClips[]` / `transition` 字符串；工作区 `timelineDraft` 主要由 Episode Studio 使用 |
| 智能几乎为零 | 仅「从故事板导入已出片镜头」+ 硬切/有限转场拼接 |
| 引擎割裂 | Remotion 预览在 Episode Studio；Hyperframes 渲染在 montage / export-pack；节点卡只调 `concatClips` |
| 双产品柱未分流 | 漫剧（分镜结构化）与爆款复刻（模板/花字）挤在同一套「拼接」心智 |

### 目标（一句话）

把 `clip-editor` 升级为**智能编排层**：自动/半自动生成 `TimelinePayload`，人确认后按场景选择 **FFmpeg / Remotion / Hyperframes** 之一渲染；**不做第三套完整 NLE**。

### 非目标（明确不做）

- 不做 Premiere 级多轨精剪（关键帧修剪、复杂特效曲线、无限插件）
- 不把 Remotion 与 Hyperframes 混成一套拖拽 UI
- 不删除 / 改壳现有 ScreenModal 弹窗节点
- 不把 Episode Studio 整页搬进节点卡（节点卡保持 compact；深度编辑走附着 Timeline WS + 打开成片工作室）

---

## 1.2 现状盘点（查档结果）

### 前端

| 资产 | 路径 | 现状 |
|------|------|------|
| 节点 UI | `apps/web/src/blocks/core/ClipEditorBlock.tsx` | 模式：`concat` / `audio` / `grade`；转场枚举；`api.concatClips` / `mixAudio` / `colorGrade`；Film 按钮打开 Remotion UI |
| 成片工作室 | `apps/web/src/panels/EpisodeStudioPanel.tsx` | `@remotion/player` + `Nx9Episode`；HTML5 fallback；导出：FFmpeg 快速 / HF 异步 / Remotion 工程 ZIP / FCPXML / inputProps |
| 批量执行 | `apps/web/src/engine/flow-runner.ts` | `clip-editor` 分支同节点逻辑；`export-pack` 走 `export-pack-runner` |
| 导出 runner | `apps/web/src/engine/export-pack-runner.ts` | `zip` \| `ffmpeg-episode` \| `hyperframes-episode` \| `remotion-bundle` |
| 目录 | `packages/shared/src/catalog/block-catalog.ts` | label「视频剪辑」，hint「拼接转场 · 混音 · 调色」 |
| 附着工作区 | `attached-workspace.ts` | `workspaceType: 'timeline'`，`showRun: false`，`showPreview: true`，phase P3 |
| Socket | `socket-registry.ts` | accepts `clip/sound/picture`，emits `clip/sound` |
| 迁移 | `migrate-block-kinds.ts` | `audio-mix` / `color-grade` / `beat-sync` / `clip-sink` → `clip-editor` |

### 共享类型与工具

| 资产 | 路径 | 现状 |
|------|------|------|
| 时间线模型 | `packages/shared/src/types/timeline.ts` | `TimelinePayload`：tracks、clips、`renderPreset`、`transitionOut` |
| 从镜头构建 | `timeline-export.ts` | `buildTimelineFromShots` / `buildTimelineFromShotsV2`（字幕 cues、默认转场） |
| Remotion 桥 | `remotion-export.ts` | `timelineToRemotionInputProps`、`timelineToRemotionStudioBundle`、`validateRemotionTimeline` |
| Hyperframes 桥 | `hyperframes-export.ts` | `timelineToHyperFramesHtml` / `Vars`；模板列表 `nx9-vertical-episode` 等 |
| Remotion 组件 | `packages/remotion-compositions/` | `Nx9Episode` + Video/Image/Subtitle clips |

### 服务端

| 资产 | 路径 | 现状 |
|------|------|------|
| Montage API | `montage.controller.ts` | `concat-clips`、`concat-episode`、`mix-audio`、`color-grade`、`render-hyperframes`、`hyperframes-preview`、`render-remotion`（**异步任务骨架，未真渲**） |
| HF 服务 | `hyperframes.service.ts` | HTML → `@hyperframes/producer.render`；失败则 FFmpeg 黑场占位 |
| 依赖 | `apps/server/package.json` | `@hyperframes/core` / `producer` `^0.7.64` |

### 已知缺口（文档/审计已记，实现时需关闭）

- 服务端 `POST render-remotion` 仍为入队骨架（无 `@remotion/renderer` 真渲）
- HF producer 不可用时退化为黑场占位（非真实镜头）
- 节点 concat 与 `TimelinePayload.transitionOut` 未统一
- `timelineDraft` 与节点 `extraClips` 双写风险

---

## 1.3 产品定位与引擎分工

```
┌─────────────────────────────────────────────────────────┐
│  智能剪辑（编排层 · clip-editor）                          │
│  输入：上游 clip/sound/picture · 故事板镜头 · 素材库引用     │
│  输出：TimelinePayload（SSOT）+ 渲染任务结果 URL            │
└───────────────┬─────────────────────┬───────────────────┘
                │                     │
     ┌──────────▼──────────┐  ┌───────▼────────────┐
     │ Remotion 后端        │  │ Hyperframes 后端    │
     │ 漫剧默认              │  │ 爆款/模板默认        │
     │ 结构化时间线预览      │  │ HTML 模板 · 花字     │
     │ React 成片结构        │  │ Agent 可写片模板     │
     └──────────┬──────────┘  └───────┬────────────┘
                │                     │
                └──────────┬──────────┘
                           │
                  ┌────────▼────────┐
                  │ FFmpeg 快速路径  │
                  │ 硬切/简单转场    │
                  │ 预览与兜底       │
                  └─────────────────┘
```

| 引擎 | 适用场景 | 不适用 |
|------|----------|--------|
| **Remotion** | AI 漫剧整集：分镜序、字幕轨、固定片头片尾、可交互预览 | Agent 随手写复杂 HTML 排版 |
| **Hyperframes** | 爆款复刻短片：竖屏模板、字幕条/花字、封面式合成 | 当完整时间线 NLE |
| **FFmpeg** | 秒级预览、批量硬切、无 Chrome/Remotion 环境时的兜底 | 复杂字幕排版与 React 动效 |

**对外名称**：智能剪辑。  
**对内结构**：**一个编排层 + 三个渲染后端**（FFmpeg / Remotion / Hyperframes）。

---

## 1.4 原型（信息架构与主流程）

### 1.4.1 画布节点卡（Compact）原型

```
┌──────────────────────────────────────┐
│ ✂ 智能剪辑                    [···]  │
├──────────────────────────────────────┤
│ 场景：[漫剧成片 ▼] [爆款模板 ▼]       │  ← profile
│ 引擎：○自动 ●Remotion ○HF ○FFmpeg   │
│ 时间线：12 镜 · 48.2s · 9:16         │
│ ┌──────────────────────────────────┐ │
│ │ ▌▌▌▌▌▌▌▌····  迷你轨缩略（只读） │ │
│ └──────────────────────────────────┘ │
│ 建议：3 条待确认（节奏 / 转场 / 字幕） │
│                                      │
│ [智能编排] [打开时间线] [成片工作室]   │
│ [渲染导出]                            │
└──────────────────────────────────────┘
```

说明：

- 迷你轨**只读**；精细拖拽只在附着 Timeline Workspace / Episode Studio。
- 「智能编排」触发生成/刷新 `TimelinePayload`（不立刻重渲）。
- 「渲染导出」按当前引擎提交任务，成功后写回 `outputUrl` / `videoUrl`。

### 1.4.2 附着 Timeline Workspace 原型（底部，节点选中时）

```
┌─ Preview ──────────────────┬─ Timeline ─────────────────────────────┐
│  Remotion Player / Fallback │  V1 ████ ████ ████                     │
│  或 HF HTML preview iframe  │  S1 ····字幕····                       │
│                             │  A1 ~~~~~~~~配音~~~~~~~~               │
│  [◀][▶/❚❚] 00:12 / 00:48   │  A2 ~~BGM~~                            │
│                             │  ── playhead ──                        │
├─────────────────────────────┴───────────────────────────────────────┤
│ 智能建议面板（可折叠）                                                 │
│  ☐ 镜 3→4 建议 dissolve 0.4s     [采纳] [忽略]                        │
│  ☐ 字幕轨：对齐配音 Whisper cues  [采纳] [忽略]                        │
│  ☐ BGM ducking：对白段 -6dB      [采纳] [忽略]                        │
├─────────────────────────────────────────────────────────────────────┤
│ 渲染栏：引擎 [自动▼]  模板 [竖屏成片▼]  [校验] [渲染] [同步到 export-pack] │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.4.3 成片工作室（Episode Studio）关系

```
智能剪辑节点 ──打开──▶ EpisodeStudioPanel（右侧栏，存量）
         │                    │
         │  读写同一 timelineDraft（SSOT）
         ▼                    ▼
   workspace-document.timelineDraft
```

**规则**：Episode Studio **保留**为漫剧步⑪深度预览面；智能剪辑是画布编排入口，二者共享 `timelineDraft`，禁止各写各的片段列表。

### 1.4.4 主用户旅程

**旅程 A · AI 漫剧**

1. 分镜出片 + 配音完成 → Dock 放置 / 管线已有 `clip-editor`
2. 点「智能编排」→ `buildTimelineFromShotsV2` + 配音轨对齐 → 写入 `timelineDraft`
3. 底部时间线确认建议（转场/字幕）
4. 默认引擎 Remotion → Player 预览 → 渲染（P1 先 FFmpeg/HF；P2 服务端 Remotion）
5. `export-pack` 可同步同一 timeline（`ffmpeg-episode` / `remotion-bundle` / `hyperframes-episode`）

**旅程 B · 爆款复刻**

1. `link-parser` / 素材导入 → 上游 clips 进智能剪辑
2. profile = 爆款模板 → 选 HF 模板 `nx9-vertical-episode`
3. 智能编排：按参考节奏切点（可选调用 `analyze-reference`）+ 花字字幕轨
4. 引擎 Hyperframes → 异步渲染 → 节点产出 URL

---

## 1.5 UI 规格

### 1.5.1 目录与文案

| 字段 | 现值 | 目标值 |
|------|------|--------|
| `kind` | `clip-editor` | **不变** |
| `label` | 视频剪辑 | **智能剪辑** |
| `hint` | 拼接转场 · 混音 · 调色 | 智能编排时间线 · Remotion/HF/FFmpeg 成片 |
| `glyph` | `Scissors` | 可改为 `Sparkles` 或保留 Scissors（实现时二选一，默认保留 Scissors 降低视觉噪音） |

### 1.5.2 节点卡控件

| 控件 | 类型 | 行为 |
|------|------|------|
| `profile` | 分段：`drama` \| `viral` | 切换默认引擎与建议策略；写 `node.data.profile` |
| `engine` | radio：`auto` \| `remotion` \| `hyperframes` \| `ffmpeg` | `auto`：drama→remotion，viral→hyperframes |
| 时间线摘要 | 只读文本 | 镜数 / 时长 / aspect；无 timeline 时显示「未编排」 |
| 迷你轨 | 只读条带 | 按 track 比例着色，点击打开 Timeline WS |
| 建议角标 | badge | `pendingSuggestions` 数量 |
| 智能编排 | primary button | 调用编排算法，不渲染 |
| 打开时间线 | secondary | 聚焦附着 Timeline WS |
| 成片工作室 | icon（存量 Film） | `useRemotionUi.setOpen(true)` |
| 渲染导出 | primary（有 timeline 时） | 按引擎提交；running 态禁用 |

### 1.5.3 存量能力降级安置

混音 / 调色 **不删能力**，迁入 Timeline WS 的「工具」折叠区或节点 overflow 菜单：

| 旧 `editorMode` | 新位置 |
|-----------------|--------|
| `concat` | 被「智能编排 + 渲染」取代；FFmpeg concat 仍作 `engine=ffmpeg` 路径 |
| `audio` | Timeline WS → 工具 → 混音（仍调 `mix-audio`） |
| `grade` | Timeline WS → 工具 → 调色（仍调 `color-grade`） |

兼容：旧画布 `editorMode` 字段读取时映射到工具面板打开态，避免已存文档空白。

### 1.5.4 视觉与交互约束

- 遵循现有 BlockShell / 品牌色；不新增第二套设计语言
- 节点卡保持 **compact**（`attached-workspace` 已约定）
- 禁止把完整 Player + 多轨塞进节点卡高度
- 长时间渲染必须走任务轮询 UI（复用 `useTaskPoll`，与 Episode Studio HF 一致）

### 1.5.5 与 ScreenModal 节点的边界

智能剪辑**不得**改造成 ScreenModal。深度 UI = 底部 Timeline WS + 现有 Episode Studio 侧栏。

---

## 1.6 功能清单

### P0 · 编排与 SSOT

| ID | 功能 | 标记 |
|----|------|------|
| SE-P0-01 | `timelineDraft` 作为工作区时间线唯一真相；节点只存 `timelineRef` 元数据（或同步指针） | `[改造]` |
| SE-P0-02 | 「智能编排」：故事板镜头 → `buildTimelineFromShotsV2` | `[存量]`+`[改造]` |
| SE-P0-03 | 「智能编排」：上游 `clips[]` 无故事板时 → 顺序拼轨 + 探测时长 | `[新增]` |
| SE-P0-04 | 节点卡 / Timeline WS / Episode Studio 三读同一 `timelineDraft` | `[改造]` |
| SE-P0-05 | 校验：`validateRemotionTimeline` 结果展示 warnings | `[存量]`+`[改造]` |
| SE-P0-06 | 目录 label/hint 升级为智能剪辑 | `[改造]` |

### P1 · 双引擎可用路径

| ID | 功能 | 标记 |
|----|------|------|
| SE-P1-01 | `engine=ffmpeg`：由 timeline 导出 clip 列表 → `concat-clips` / `concat-episode`（带 transition） | `[改造]` |
| SE-P1-02 | `engine=hyperframes`：`render-hyperframes` + 任务轮询 → `outputUrl` | `[存量]`+`[改造]` |
| SE-P1-03 | HF preview：节点/WS 可打开 `hyperframes-preview?workspaceId=` | `[存量]` |
| SE-P1-04 | profile 默认引擎映射 + 模板选择（`listHyperFramesTemplates`） | `[改造]` |
| SE-P1-05 | 建议面板：转场建议 / 字幕对齐（可采纳写入 timeline） | `[新增]` |
| SE-P1-06 | 节点产出写入 socket 下游（`videoUrl`/`outputUrl`）供 `export-pack` | `[存量]`+`[改造]` |

### P2 · Remotion 真渲与节奏智能

| ID | 功能 | 标记 |
|----|------|------|
| SE-P2-01 | 服务端 `render-remotion` 真渲（`@remotion/renderer` + `@nx9/remotion-compositions`） | `[新增]` |
| SE-P2-02 | 爆款：`analyze-reference` 节奏切点建议写入 timeline | `[存量]`+`[改造]` |
| SE-P2-03 | BGM ducking / 响度建议（可选，基于 probe） | `[新增]` |
| SE-P2-04 | Agent/技能：根据 profile 生成 HF HTML 模板变量补丁 | `[新增]` `[存疑：技能协议需另开功能章]` |

### 明确延后

- 多机位剪辑、曲线调色、自由关键帧 NLE
- 云端协作时间线锁

---

## 1.7 逻辑（状态机与数据流）

### 1.7.1 节点 data 契约（目标）

```ts
// clip-editor node.data（目标形态；实现时落在 shared types）
interface SmartEditNodeData {
  profile: 'drama' | 'viral';
  engine: 'auto' | 'remotion' | 'hyperframes' | 'ffmpeg';
  templateId?: string;           // HF 模板
  status?: 'idle' | 'running' | 'success' | 'error';
  error?: string;
  // 编排结果不在节点内复制整份 timeline；以工作区为准
  timelineSyncedAt?: string;     // ISO，上次编排或采纳建议时间
  pendingSuggestionIds?: string[];
  renderTaskId?: string;
  renderBackend?: 'ffmpeg' | 'remotion' | 'hyperframes';
  outputUrl?: string;
  videoUrl?: string;             // 与 outputUrl 对齐，兼容下游
  outputSound?: string;          // 混音工具路径
  // 兼容旧字段（只读迁移）
  editorMode?: 'concat' | 'audio' | 'grade';
  extraClips?: string[];
  transition?: string;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  normalize?: boolean;
  title?: string;
}
```

### 1.7.2 工作区 SSOT

```ts
// workspace-document（已有 timelineDraft）
timelineDraft: TimelinePayload | null
setTimelineDraft(t: TimelinePayload | null): void
```

规则：

1. **写**：仅「智能编排」「建议采纳」「Timeline WS 用户编辑」「Episode Studio 显式保存」可写 `timelineDraft`。
2. **读**：节点摘要、Player、渲染、export-pack 的 HF/Remotion 模式一律读 `timelineDraft`。
3. **旧 `extraClips`**：若存在且 `timelineDraft` 为空，编排前先 hydrate 为临时 timeline，再写入 draft。

### 1.7.3 引擎解析

```
resolveEngine(profile, engine):
  if engine != auto: return engine
  if profile == drama: return remotion
  if profile == viral: return hyperframes
```

### 1.7.4 渲染状态机

```
idle ──[render]──▶ running(taskId)
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
      success       error       (poll timeout→error)
         │
         └─▶ 写 outputUrl/videoUrl，status=success
```

- FFmpeg：同步或短轮询（现有 `concatClips` 同步返回）
- Hyperframes / Remotion：`taskId` + `GET tasks/:id` 或 `remotion-tasks/:id`

### 1.7.5 flow-runner 行为

批量跑 `clip-editor` 时：

1. 若无 `timelineDraft` → 自动执行一次智能编排（drama 用故事板；否则用上游 clips）
2. `resolveEngine` → 调对应 API
3. 成功写节点产出；失败抛错阻断下游（与现 runner 一致）

混音/调色：仅当显式 `editorMode` 遗留或工具面板触发时走旧分支；默认主路径不再进入。

---

## 1.8 算法

### 1.8.1 漫剧编排算法 `orchestrateDramaTimeline`

**输入**：`storyboard.shots`、可选配音 URL / Whisper cues、aspect、approvedOnly  
**输出**：`TimelinePayload` + `SmartSuggestion[]`

```
1. shots ← sort by index; optionally filter approved
2. timeline ← buildTimelineFromShotsV2(shots, title, {
     aspect, subtitleEnabled: true, transcribeCues?, defaultTransition?
   })
3. 对白轨：若 shot.audioAssetId 存在，按镜 startSec 铺 A1
4. BGM：若工作区有全局 BGM，铺 A2，duration = timeline.durationSec
5. 建议生成：
   a. 相邻镜 duration 差 > 2×median → 建议调整 trim（仅建议，不自动改）
   b. 无 transitionOut → 建议 fade 0.3s（viral/HF preset 已有类似逻辑）
   c. 有 cues 且字幕轨空 → 建议写入字幕
6. renderPreset ← 'remotion-studio'（drama）
7. return { timeline, suggestions }
```

复用：`buildTimelineFromShotsV2`、`validateRemotionTimeline`。

### 1.8.2 爆款/上游片段编排 `orchestrateViralTimeline`

**输入**：`clips: string[]`、可选 `analyze-reference` 结果、HF `templateId`  
**输出**：同上

```
1. for each clipUrl:
     dur ← probeDuration(clipUrl)   // POST montage/probe-duration
     失败则 dur = DEFAULT_CLIP_SEC (例如 3)
2. 顺序铺 V1：startSec 累加；transitionOut 默认 fade 0.25s
3. 若有 reference 分析（analyze-reference）：
     按 targetShotCount / beat 提示重切 start/duration（clamp 到源时长）
4. 字幕：从上游文案或 link-parser 结构化字段生成 S1（无则空）
5. renderPreset ← 'hyperframes-vertical'
6. aspect 默认 9:16
7. return { timeline, suggestions }
```

### 1.8.3 建议模型

```ts
interface SmartSuggestion {
  id: string;
  kind: 'transition' | 'subtitle' | 'trim' | 'ducking' | 'beat-cut';
  targetClipIds: string[];
  message: string;          // 中文说明
  patch: Partial<TimelinePayload> | TimelineClipPatch;
  confidence: number;       // 0..1，仅展示
}
```

**采纳**：深合并 patch → `setTimelineDraft` → 从 `pendingSuggestionIds` 移除。  
**忽略**：仅移除 pending，不改 timeline。

### 1.8.4 Timeline → FFmpeg concat 投影

```
1. 取主视频轨 clips（type=video），按 startSec 排序
2. transition ← 若全部 transitionOut.kind 相同则映射到 concatClips 的 transition 字符串
   映射：fade/dissolve→dissolve|fade；wipe→wipe；其余→none（硬切）
3. 调用 concatClips(urls, title, transition)
```

说明：FFmpeg 路径**无法**完整表达多轨字幕；字幕需 HF/Remotion 或后续 `subtitle-burn` 节点。UI 在选 FFmpeg 时提示「不含字幕轨」。

### 1.8.5 校验算法（存量封装）

调用 `validateRemotionTimeline(timeline)`：

- 无媒体 / 时长 0 / 缺 URL → warnings
- 渲染前：warnings 可继续但需二次确认；error 级（若后续扩展）则阻断

---

## 1.9 集成

### 1.9.1 API 一览（存量 + 改造）

| 方法 | 路径 | 用途 | 变更 |
|------|------|------|------|
| POST | `/api/montage/concat-clips` | FFmpeg 引擎 | 保持；transition 与 timeline 投影对齐 |
| POST | `/api/montage/concat-episode` | 故事板整集成片 | Episode Studio / export-pack 共用 |
| POST | `/api/montage/probe-duration` | 编排测长 | 编排算法依赖 |
| POST | `/api/montage/analyze-reference` | 爆款节奏 | P2 建议 |
| POST | `/api/montage/render-hyperframes` | HF 渲染 | 节点主路径接入 |
| GET | `/api/montage/hyperframes-preview` | HF HTML 预览 | WS 可嵌 |
| GET | `/api/montage/tasks/:taskId` | HF 任务状态 | 轮询 |
| POST | `/api/montage/render-remotion` | Remotion 渲染 | **P2 由骨架改为真渲** |
| GET | `/api/montage/remotion-tasks/:taskId` | Remotion 任务 | P2 |
| POST | `/api/montage/mix-audio` | 混音工具 | 保留 |
| POST | `/api/montage/color-grade` | 调色工具 | 保留 |
| POST | `/api/montage/transcribe` | 字幕 cues | 编排可选 |

### 1.9.2 前端模块集成点

| 模块 | 集成方式 |
|------|----------|
| `ClipEditorBlock.tsx` | 改造为智能剪辑卡（§1.5） |
| 新建 `smart-edit-orchestrator.ts`（建议 `apps/web/src/engine/`） | 编排 + 建议 + engine resolve |
| `EpisodeStudioPanel.tsx` | 继续读写 `timelineDraft`；入口文案可注明「与智能剪辑共享时间线」 |
| `flow-runner.ts` | 主路径改走 orchestrate → render |
| `export-pack-runner.ts` | 已依赖 `timelineDraft`；编排后即可用 HF/Remotion 模式 |
| `useTaskPoll` | 节点渲染复用 |
| Timeline WS（P3 底部工作区） | 按 `NX9-BOTTOM-WORKSPACE-REFACTOR-SPEC-v1` / `attached-workspace` 实现 media-editor 壳；本功能往壳内填 Smart Edit 内容 |

### 1.9.3 共享包

| 包 | 职责 |
|----|------|
| `@nx9/shared` | `TimelinePayload`、build/validate、HF HTML、Remotion inputProps/bundle |
| `@nx9/remotion-compositions` | `Nx9Episode` 预览与（P2）服务端渲染入口 |
| `@hyperframes/producer` | 服务端 HTML→MP4 |

### 1.9.4 与管线 / Playbook

| 步 | 现约定 | 智能剪辑后 |
|----|--------|------------|
| ⑪ Episode Studio | `clip-editor` 为锚点 | 仍锚 `clip-editor`；打开工作室 = 共享 draft |
| ⑬ export-pack | 四模式 | 编排完成后 HF/Remotion 模式不再报「无时间线」 |
| 核心管线 kinds | 含 `clip-editor` | kind 不变，仅能力升级 |

### 1.9.5 与素材库 / 弹窗节点

- 角色/场景：素材库 SSOT（已迁出画布节点）；智能剪辑**不**再依赖 `character-sheet` / `scene-card`
- 分镜台 / 导演台等 ScreenModal：**零改壳**；智能剪辑只消费其产出的镜头视频/音频资产 ID

---

## 1.10 数据与文件落盘

| 产物 | 位置 | 说明 |
|------|------|------|
| HF 工作 HTML | `media/exports/hf-work-* /index.html` | 存量 |
| HF/FFmpeg 成片 | `media/exports/*.mp4` | URL `/media/exports/...` |
| Remotion 工程 ZIP | 浏览器下载 | 存量客户端导出 |
| Remotion 服务端成片（P2） | 同 exports 目录 | 新 |
| `timelineDraft` | workspace JSON | 持久化随工作区 |

---

## 1.11 分阶段实现计划

### 阶段 A（P0）— 编排统一 · 预计小步

1. 扩展 `SmartEditNodeData` 类型与 catalog 文案  
2. 实现 `smart-edit-orchestrator.ts`（drama + viral hydrate）  
3. 改造 `ClipEditorBlock` 主按钮为智能编排 / 打开时间线 / 工作室  
4. 消灭「节点 extraClips 与 draft 双真相」：编排后写 draft，摘要读 draft  
5. 单测：编排纯函数（shared 或 web engine）— 给定 shots fixture → 轨数量/时长

### 阶段 B（P1）— 可渲染闭环

1. 节点「渲染导出」接 FFmpeg / HF  
2. 建议面板最小集（转场 + 字幕）  
3. flow-runner 对齐  
4. export-pack 在无 draft 时提示「先在智能剪辑编排」  
5. E2E 或集成测：编排 → HF task → done（可用 mock producer）

### 阶段 C（P2）— Remotion 真渲与节奏

1. `render-remotion` 接 `@remotion/renderer`  
2. analyze-reference → beat-cut 建议  
3. （可选）技能写 HF 模板变量  

每阶段合并前：`pnpm --filter @nx9/shared build` + `@nx9/web typecheck` + 相关 server test。

---

## 1.12 验收标准

| # | 验收项 | 通过条件 |
|---|--------|----------|
| AC-1 | kind 稳定 | 仍为 `clip-editor`；旧文档可加载 |
| AC-2 | 漫剧编排 | 有出片镜头时一点「智能编排」得到可播放 `timelineDraft` |
| AC-3 | 三面一致 | 节点摘要时长 = Episode Studio 时长 = draft.durationSec |
| AC-4 | FFmpeg 路径 | engine=ffmpeg 产出可下载 mp4，节点 `outputUrl` 有值 |
| AC-5 | HF 路径 | engine=hyperframes 提交 task 并可轮询到 done（或明确错误态） |
| AC-6 | export-pack | 编排后 `hyperframes-episode` / `remotion-bundle` 不再因无 timeline 失败 |
| AC-7 | 非目标 | 节点卡内无完整多轨精剪；ScreenModal 节点 UI 未被改动 |
| AC-8 | 兼容 | 旧 `editorMode=audio|grade` 仍可从工具入口触发 |

---

## 1.13 风险、存疑与八荣八耻自检

| 项 | 说明 |
|----|------|
| `[存疑]` Remotion 服务端渲染资源 | 需确认部署环境是否含 Chrome；无则 P2 可仅保留客户端 bundle + Player |
| `[存疑]` Timeline WS 是否已有可复用壳 | `attached-workspace` 标 P3；若壳未落地，P0 可先用 Episode Studio 承担深度编辑，WS 随后填 |
| `[存疑]` Agent 写 HF 模板 | 技能协议未在本功能内定稿，标 P2 可选，另开功能章 |
| 以臆猜为耻 | 上表 API/路径均来自本仓库现码；未实现处已标 `[新增]` |
| 以复用为荣 | 不新造时间线模型；不新造 kind；复用 montage / Episode Studio / export-pack |
| 以分步为荣 | P0→P1→P2；禁止一次做完整 NLE |
| 以乱改架构为耻 | 不改 ScreenModal 弹窗设计；不推翻 workspace-document SSOT |

---

## 1.14 关键文件清单（实现时对照）

**改造**

- `packages/shared/src/catalog/block-catalog.ts`
- `apps/web/src/blocks/core/ClipEditorBlock.tsx`
- `apps/web/src/engine/flow-runner.ts`
- `apps/web/src/panels/EpisodeStudioPanel.tsx`（文案/共享说明，慎改结构）
- `apps/server/src/modules/montage/montage.controller.ts`（P2 Remotion）
- `docs/NX9-NODE-INTERACTION-REGISTRY.md` / `NX9-ATTACHED-WORKSPACE-REGISTRY.md`（文案同步，另提交）

**新增（建议）**

- `apps/web/src/engine/smart-edit-orchestrator.ts`
- `packages/shared/src/types/smart-edit.ts`（节点 data + suggestion 类型）
- `apps/web/src/panels/smart-edit/`（建议面板、迷你轨等，按需）

**测试**

- shared：timeline 编排 fixture
- server：`test-hf` 扩展；P2 remotion task
- web：节点编排 → draft 写入的单元/组件测

---

## 1.15 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-21 | 首版追加：智能剪辑详细设计（原型/UI/功能/逻辑/算法/集成） |
| 2026-07-21 | 追加 §1.16：对齐功能 3「编剧台」命名与主链示意 |
| 2026-07-21 | 指针：内部提示词/Dev 窗见功能 8；本节点**不**开产品级 system 编辑器 |

---

## 1.16 勘误补丁（对齐编剧台命名 · 2026-07-21）

| 原文语境 | 勘误后效力 |
|----------|------------|
| 上游「剧本 / 分镜」口语 | 漫剧上游正式名为 **编剧台 → 分镜台 → 导演台 → clip-gen → 本节点** |
| 与 ScreenModal 边界表述中的旧节点名 | 弹窗族含 **编剧台 / 设定检查 / 分镜台 / 导演台** 等；本节点仍**不是** ScreenModal |
| 「从故事板导入」 | 数据源仍为工作区 `storyboard.shots`（由分镜台投影）；不依赖已废弃的「剧本拆分」镜表产出 |

**不改**：引擎三分（FFmpeg / Remotion / Hyperframes）、TimelinePayload SSOT、非 ScreenModal 约束。

---

# 功能 2 · 统一导演台（`director-desk` ← 合并 `director-3d`）

- **状态**：设计定稿待实现（2026-07-21）
- **产品柱**：AI 漫剧 · 关键帧一致性生产（3D 机位引导 → 批出 → 审阅 → 送视频）
- **节点 kind**：保留并强化 **`director-desk`**；**`director-3d` 迁入后从 Dock 移除**（`migrate-block-kinds`：`director-3d` → `director-desk`）
- **交互壳约束**：继续采用 **画布摘要卡 + ScreenModal**（与现行导演台一致，属弹窗节点族）。**禁止**改成底部 Prompt Bar / Attached Workspace 主壳；**禁止**拆回两个 Dock 节点。
- **UI 硬要求**：在**当前导演台**（`DirectorDeskBlock` + `director-desk.css` + desk 色板）基础上**必须升级**原型与视觉，与全画布 Desk 语言一致（`desk-palette.css` 的 `--desk-*`）；3D 视口可深色舞台，但外框/工具条/队列区必须走同一 desk token，禁止两套互不相关的视觉系统并排。
- **相关存量**：`director-desk-runner.ts`、`@nx9/director3d`（`StageDeckShell` / `DirectorProject`）、`Director3dPanel` 写回、`StoryboardDirector3dGuide`、socket `isDirector3dDeskLink`

---

## 2.1 背景与目标

### 问题（查档）

仓库里并存两套「导演」入口，能力互补但产品心智分裂：

| 节点 | 强项 | 弱项 |
|------|------|------|
| `director-desk` 导演台 | 本集关键帧队列、批出/重试、角色·场景·风格锁、优先 3D 参考、送 `clip-gen`、批完审阅；ScreenModal 生产台 | 3D 摆位不在本台内，只能消费 `shot.director3dGuide`；摘要卡信息密度偏低 |
| `director-3d` 3D 导演台 | 全屏 3D 舞台、机位/角色/道具/全景、截图写回 `director3dGuide`、连分镜预览 | 无批出队列；Dock 为 concealed；与生产台双节点连线成本高 |

二者已有**弱耦合**：`prefer3dRef` 读 `shot.director3dGuide.captureUrl`；socket 允许 `director-desk` ↔ `director-3d` 互连；故事板可分别 spawn 两个节点。用户要做「有 3D 引导的关键帧批产」必须理解两套 UI。

### 目标（一句话）

合并为**一个更强、更集中的导演台**：同一节点完成 **3D 机位设计 → 写回镜头 → 策略批出关键帧 → 审阅 → 送视频**；对外只保留「导演台」。

### 非目标

- 不删除 `@nx9/director3d` 包能力（舞台引擎复用，只收口入口）
- 不做通用 3D DCC（绑定/骨骼动画时间线等）
- 不把导演台改成非 ScreenModal 的底部工作区主交互
- 不合并 `storyboard-desk` / `dialogue-sheet`（分镜表与剧本拆分仍独立）

---

## 2.2 现状盘点（查档结果）

### 导演台（`director-desk`）

| 资产 | 路径 | 事实 |
|------|------|------|
| 节点 UI | `apps/web/src/blocks/core/DirectorDeskBlock.tsx` | 摘要卡 + `ScreenModal`（`variant="default"`，`width=980`，`className="dd-modal"`） |
| 样式 | `director-desk.css` | 已绑定 `--desk-*` token |
| 批出引擎 | `apps/web/src/engine/director-desk-runner.ts` | 队列筛选、并发、重试、强制角色/场景参考、风格锁、优先 3D、送视频、审阅会话 |
| 附着约定 | `attached-workspace.ts` | `workspaceType: 'none'`，`attachToNode: false`，自有 ScreenModal |
| 目录 | `block-catalog.ts` | label「导演台」，hint 含批出/锁/优先3D/送视频，`nx9Native` |

**ScreenModal 内已有能力（须保留并升级呈现）**：进度四格、筛选芯片、跳过策略、并发/重试、参考锁、风格补充与 seed、镜头队列列表、预览、批出/停/重试失败/送视频/开审阅。

### 3D 导演台（`director-3d`）

| 资产 | 路径 | 事实 |
|------|------|------|
| 节点 UI | `apps/web/src/blocks/spatial/Director3dBlock.tsx` | 摘要预览卡；点击打开全屏舞台 |
| 打开逻辑 | `director3d-open.ts` | 解析绑定分镜帧、全景、角色摆位 → `useDirector3dUi` |
| 宿主面板 | `Director3dPanel.tsx` | `onCapture` 写 `shot.director3dGuide` / preview frame |
| 引擎包 | `packages/director3d/` | `DirectorProject`、机位、捕获、网格/全景、StageDeckShell |
| 目录 | `block-catalog.ts` | 「3D 导演台」，`category: spatial`，`concealed: true` |
| 迁移入边 | `migrate-block-kinds.ts` | 旧 spatial kinds → `director-3d` |

### 共享数据桥（合并后仍是 SSOT）

```ts
// packages/shared/src/types/storyboard.ts
StoryboardDirector3dGuide {
  sourceBlockId, captureId, captureUrl, cameraPrompt,
  cameraPosition?, cameraRotation?, cameraFov?,
  panoramaUrl?, characterPlacements?, appliedAt
}
```

镜头级 `shot.director3dGuide` 为跨分集可还原的机位真相；合并后 `sourceBlockId` 一律指向统一 `director-desk` 节点 id。

### 画布视觉真相源

- `apps/web/src/styles/desk-palette.css`：全节点统一 Desk 色板（浅：暖纸 + 古铜金；深：炭黑 + 暖金）
- 弹窗节点族（剧本拆分 / 设定检查 / 现行导演台）共享 desk token；升级 UI **必须**继续吃这套变量，不得另起品牌色。

---

## 2.3 产品定位与信息架构

```
┌──────────────────────────────────────────────────────────────┐
│  统一导演台 · director-desk（唯一 Dock 入口）                   │
│                                                              │
│  ┌─ 画布摘要卡 ─────────────────────────────────────────────┐ │
│  │ 进度 · 3D覆盖率 · 策略芯片 · 一键开台 / 快速批出           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                           │ 开台                               │
│                           ▼                                    │
│  ┌─ ScreenModal（升级壳）───────────────────────────────────┐ │
│  │  Tab / 模式：【生产】 【3D 舞台】 【送出】（可选第三页）     │ │
│  │                                                          │ │
│  │  生产：队列批出 / 锁 / 审阅（演进自现 deskBody）            │ │
│  │  3D：  嵌入 StageDeckShell（演进自 director-3d）           │ │
│  │  送出：一键写回 picture-gen · 推 clip-gen · 开审阅         │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
         │ writeback                          │ batch
         ▼                                    ▼
  shot.director3dGuide                 firstFrameAssetId
  + node.data.scene (DirectorProject)  + review / clip-gen
```

**对外名称**：导演台。  
**对内结构**：**一个节点 + 一个 ScreenModal 双模式（生产 / 3D）+ 复用 `@nx9/director3d` 引擎**。

---

## 2.4 原型（必须相对现行导演台升级）

### 2.4.1 画布摘要卡（升级版 · 替换现行 `dd-summary-card`）

现行：眉题「导演台」+「关键帧批生产」+ 四格 stat 芯片 +「点击进入」。

**升级目标**：一眼可读「生产进度 × 3D 覆盖 × 下游就绪」，并符合 desk 卡片语言。

```
┌─────────────────────────────────────────────┐
│  ▌导演台                          · 本集 EP  │  ← eyebrow + 集标
│  关键帧导演工作台                               │  ← 主标题（升级文案）
│                                             │
│  ┌──────────┐  已出 8/12 · 3D 5 · 失败 1    │
│  │ 预览缩略  │  ████████░░  67%             │  ← 左媒区 + 右进度
│  │ (末次帧/  │  角色锁 · 场景锁 · 优先3D     │
│  │  3D截图)  │                              │
│  └──────────┘                               │
│  [批出未完成]              [开台]            │  ← 主次 CTA
└─────────────────────────────────────────────┘
```

升级点（相对现状）：

1. **左媒区**：优先显示 `previewUrl` → 末次成功关键帧 → 当前镜 3D capture；空态用 desk `media-bg` + Clapperboard，禁止空洞纯文字块。
2. **双进度语义**：出帧进度条 + 「3D 覆盖」次级指标（`with3d/total`）。
3. **策略芯片**保留，但视觉改为 desk soft chip（与剧本拆分/设定检查同族），减少杂乱 pill。
4. **双 CTA**：幽灵「批出」+ 实心「开台」（开台进升级 Modal）；运行中批出变停止。

### 2.4.2 ScreenModal 总布局（升级版）

现行：单栏纵向堆叠（进度 → 芯片 → 队列 → 预览 → 底栏），宽 980。

**升级为「左队列 / 右工作面」+ 顶栏模式切换**（仍用 `ScreenModal`，建议 `width: min(1200px, 100vw-32px)`，`variant` 可按模式切换：生产用 `default`/`desk`，进入 3D 全屏舞台时可用 `stage` 或 Modal 内全高暗区）。

```
┌─ ScreenModal · 导演台 ─────────────────────────────────────────┐
│ 标题：导演台 · 关键帧导演工作台                                     │
│ 副标题：3D 机位 → 批出 → 审阅 → 送视频     [生产] [3D舞台] [送出] │
├──────────────────┬──────────────────────────────────────────────┤
│ 左栏 · 镜头队列   │ 右栏 · 工作面（随 Tab 变）                      │
│ (两模式共用)      │                                                │
│ 筛选芯片          │  【生产】                                      │
│ 进度条            │   策略面板（锁/并发/风格）                       │
│ 镜列表+状态徽标   │   大预览（关键帧 / 3D 参考对比）                   │
│ ☑ #3 待出 ·有3D  │   主操作：批出 / 停 / 重试失败                    │
│ ☐ #4 通过        │                                                │
│ …                │  【3D 舞台】                                    │
│                  │   StageDeckShell 视口（全高）                     │
│                  │   顶：机位/变换/截图写回当前镜                     │
│                  │                                                │
│                  │  【送出】                                        │
│                  │   写回图像生成 · 推视频生成 · 开审阅 · 摘要        │
├──────────────────┴──────────────────────────────────────────────┤
│ 底栏状态：出图节点 · 视频节点 · 当前镜 #n · 任务进度                  │
└──────────────────────────────────────────────────────────────────┘
```

**3D 沉浸子态（可选 P1）**：在「3D 舞台」Tab 点「沉浸」→ Modal 内容区几乎全屏仅留顶栏返回；底层仍是同一 `director-desk`，不新开节点。

### 2.4.3 主用户旅程（合并后）

1. 分镜台产出本集镜头 → Dock 放「导演台」（或管线已有）
2. 开台 → 选镜 #3 → 切「3D 舞台」→ 摆角色/机位 → **截图写回** → `shot.director3dGuide` 更新，队列徽标「有3D」
3. 切「生产」→ 确认「优先3D / 角色·场景锁」→ **批出未完成**
4. 批完自动/手动开审阅 → 通过后「送出」推 `clip-gen`
5. （可选）无 3D 也可纯生产批出（`allowWithout3d` 默认 true，与现 runner 一致）

### 2.4.4 旧双节点旅程（废弃）

```
旧：director-3d 摆位 ──连线──▶ director-desk 批出
新：director-desk 内完成摆位与批出（无第二节点）
```

---

## 2.5 UI 规格（在现行导演台上升级 · 对齐画布 Desk）

### 2.5.1 目录与迁移

| 字段 | 现值 | 目标 |
|------|------|------|
| 主 kind | `director-desk` | **不变** |
| `label` | 导演台 | 导演台（不变） |
| `hint` | 关键帧批出 · … · 优先3D · 可送视频 | **3D 机位 · 关键帧批出 · 风格锁 · 审阅 · 送视频** |
| `director-3d` | concealed spatial | **migrate → `director-desk`**；Dock 不再出现 |
| glyph | `Clapperboard` | 保留 Clapperboard（集中品牌识别） |
| accent | `#A13D63`（catalog） | 节点壳仍跟 catalog；**Modal/摘要内部**强制 `--desk-accent`（古铜/暖金），与 desk 族一致 |

迁移规则（实现时写入 `migrate-block-kinds.ts`）：

```
'director-3d' → 'director-desk'
```

数据补丁：

- 将旧节点 `data.scene`（`DirectorProject`）合并进目标 `director-desk.data.scene`（若 desk 已有 scene，以「捕获更多 / updatedAt 更新」策略合并，**存疑项见 §2.13**）
- `lastCaptureUrl` / `lastCameraPrompt` / `linkedStoryboardPreviewFrameId` 迁到 desk
- `migratedFrom: 'director-3d'` 标记；日志提示「3D 导演台已并入导演台」

历史曾指向 `director-3d` 的 spatial 旧 kind（`blocking-stage` 等）最终落到 `director-desk`（可两跳或改表直迁）。

### 2.5.2 交互壳（硬约束）

| 项 | 规格 |
|----|------|
| 画布 | 摘要卡，**非** compact Prompt；`compactCanvas: false` |
| 主工作台 | `ScreenModal`，**不**走 `attached-workspace` |
| 3D | Modal 内嵌 `StageDeckShell`；可另开沉浸，但 **不是**独立 Dock 节点 |
| Escape | 先关沉浸/浮层，再关 Modal（与现 ScreenModal 一致并扩展） |

**说明**：用户此前要求「现有弹窗节点不准改壳」——本功能是**产品主动升级统一导演台的 Modal 内容与布局**；壳组件仍为 `ScreenModal`，不换成别的容器类型。若实现阶段需改 `ScreenModal` API，仅允许加法（如 `tabs` slot），禁止破坏其他弹窗节点默认行为。

### 2.5.3 视觉升级细则（对齐 `desk-palette`）

| 区域 | 规格 |
|------|------|
| Token | 全部 `dd-*` 继续映射 `--desk-*`；新增布局 class 前缀建议 `dd2-`（避免与旧类冲突，可渐进替换） |
| 摘要卡 | `desk-card-bg` 渐变、`desk-shadow` / 选中 `desk-shadow-sel`；圆角与剧本拆分迷你表同级（约 12–14px） |
| 主色 | 操作强调用 `--desk-accent`；成功/警告/运行用 `--desk-ok/warn/run` |
| 深色主题 | 跟随 `.nx9-theme-dark`；3D 视口背景可用更深 `--desk-stage-bg`，但顶栏/队列仍 desk |
| 禁止 | 紫霓虹、多层级玻璃拟态、与 desk 无关的第二套圆角 pill 体系 |
| 动效 | 进度条与批出中 `dd-pulse` 可保留；Tab 切换轻 fade；3D 打开不做夸张全屏闪白 |

### 2.5.4 模式 Tab 文案

| Tab id | 标签 | 副文案 |
|--------|------|--------|
| `produce` | 生产 | 队列 · 批出 · 锁 |
| `stage3d` | 3D 舞台 | 摆位 · 机位 · 截图写回 |
| `deliver` | 送出 | 写回出图 · 推视频 · 审阅 |

默认 Tab：`produce`。若当前选中镜无 3D 且用户点「优先3D」批出失败提示，提供 CTA「去 3D 舞台补参考」。

### 2.5.5 生产 Tab（相对现 `deskBody`）

保留全部现控件，信息架构调整为：

- **左**：筛选 + 队列（现 `dd-queue`）
- **右上**：策略折叠（锁 / 并发 / 重试 / 风格）——默认折叠「常用锁」一行，高级进抽屉
- **右下**：大预览，支持 **关键帧 | 3D 参考 | 并排对比** 三段切换（新增）

队列行升级：

- 徽标：未出 / 已出 / 待审 / 通过 / 失败 / **有3D**（现有）
- 行内快捷：**出本镜** · **进 3D**（切 Tab 并 `linkedShotId=该镜`）· 聚焦故事板

### 2.5.6 3D 舞台 Tab

- 复用 `@nx9/director3d` 的 `StageDeckShell` / `DirectorCanvas`
- 顶栏增加「当前镜 #n」选择器（数据源 = 本集 `activeEpisodeShots`），与左队列选择双向同步
- 截图写回：走与 `Director3dPanel.handleCapture` 同等逻辑，写入 **故事板 shot**（主）+ 若存在分镜预览帧则同步 frame guide
- 场景工程：`node.data.scene: DirectorProject` 存在 desk 节点上（从 3d 节点迁入）
- 性能：沿用 `performanceMode` / `crowdMax`；Modal 不可见时暂停/隐藏 canvas（现 StageDeckShell 已有 visibility 处理，需接到 Modal open 态）

### 2.5.7 送出 Tab

集中现行底栏次要动作，避免生产页按钮过载：

- 风格立即写回 `picture-gen`（`syncStyleToPictureGen`）
- 推关键帧到 `clip-gen`（`pushKeyframesToClipGen`）
- 打开审阅（`openReviewAfterDirectorBatch`）
- 只读摘要：成功/失败/跳过、末次 `lastResults`

---

## 2.6 功能清单

### P0 · 合并收口 + UI 升级骨架

| ID | 功能 | 标记 |
|----|------|------|
| DD-P0-01 | `director-3d` → `director-desk` 迁移表 + 数据补丁 | `[新增]` |
| DD-P0-02 | Dock / registry 移除独立 `director-3d` 加载器（或保留文件仅供迁移期） | `[改造]` |
| DD-P0-03 | 摘要卡升级（媒区 + 双进度 + desk 视觉） | `[改造]` |
| DD-P0-04 | ScreenModal 升级为左右分栏 + 三 Tab 壳 | `[改造]` |
| DD-P0-05 | 生产 Tab 迁入现有批出/队列/锁（行为不变） | `[改造]` |
| DD-P0-06 | 3D Tab 嵌入 StageDeckShell；scene 存 desk | `[改造]` |
| DD-P0-07 | 截图写回 `shot.director3dGuide`（sourceBlockId=desk） | `[存量]`+`[改造]` |
| DD-P0-08 | Storyboard / camera-block-spawn 只 spawn `director-desk` | `[改造]` |
| DD-P0-09 | socket：取消 desk↔3d 专用互连需求；desk 接受原 3d 的 picture/mesh 语义 | `[改造]` |

### P1 · 能力拧成一条链

| ID | 功能 | 标记 |
|----|------|------|
| DD-P1-01 | 队列行「进 3D」与 Tab/选镜联动 | `[新增]` |
| DD-P1-02 | 预览「关键帧 / 3D / 对比」 | `[新增]` |
| DD-P1-03 | 批出缺 3D 时引导补参考（不强制） | `[改造]` |
| DD-P1-04 | 送出 Tab 收纳写回/推视频/审阅 | `[改造]` |
| DD-P1-05 | 3D 沉浸子态 | `[新增]` |
| DD-P1-06 | 工作区角色同步进舞台（复用 `prepareDirectorProjectForShot`） | `[存量]` |
| DD-P1-07 | 素材库场景参考 / 720 全景加载到舞台（复用 open 逻辑） | `[存量]`+`[改造]` |

### P2 · 增强（可选）

| ID | 功能 | 标记 |
|----|------|------|
| DD-P2-01 | 按镜保存多机位预设条（Filmstrip 与队列对齐） | `[新增]` |
| DD-P2-02 | 批出前「仅有3D的镜」筛选 | `[新增]` |
| DD-P2-03 | Agent 技能：根据剧本生成摆位建议（对接 `production-director-plan` 需另定协议） | `[存疑]` |
| DD-P2-04 | 舞台 UI 皮肤完全 desk 化（替换 `stage-deck.css` 中与 desk 冲突的硬编码） | `[改造]` |

---

## 2.7 逻辑（状态机与数据流）

### 2.7.1 节点 data 契约（目标）

```ts
interface UnifiedDirectorDeskData {
  // ── 生产（存量字段保留）──
  status?: 'idle' | 'running' | 'success' | 'error';
  error?: string;
  previewUrl?: string;
  queueFilter?: 'missing' | 'failed' | 'selected' | 'all';
  skipExisting?: boolean;      // default true
  skipApproved?: boolean;      // default true
  concurrency?: number;        // 1|2|3
  maxRetries?: number;
  forceCharacterRef?: boolean;
  forceSceneRef?: boolean;
  styleLock?: boolean;
  prefer3dRef?: boolean;
  allowWithout3d?: boolean;
  autoOpenReview?: boolean;
  syncStyleToPicture?: boolean;
  stylePrompt?: string;
  styleSeed?: number | null;
  linkedShotId?: string | null;
  lastResults?: Array<{ shotId: string; ok: boolean; url?: string; error?: string }>;

  // ── 3D（从 director-3d 迁入）──
  scene?: DirectorProject;           // @nx9/director3d
  lastCaptureUrl?: string;
  lastCameraPrompt?: string;
  linkedStoryboardPreviewId?: string | null;
  linkedStoryboardPreviewFrameId?: string | null;

  // ── 统一 UI ──
  studioTab?: 'produce' | 'stage3d' | 'deliver';
  previewMode?: 'keyframe' | 'guide3d' | 'compare';
  migratedFrom?: 'director-3d' | string;
}
```

### 2.7.2 打开 / 关闭

```
摘要卡 [开台] / 双击
  → studioOpen=true
  → 恢复 studioTab（默认 produce）
  → 若 tab=stage3d：mount StageDeckShell（prepareDirectorProjectForShot）

关闭 Modal
  → flush scene → node.data.scene
  → dispose WebGL（mount handle.dispose）
  → studioOpen=false
```

### 2.7.3 选镜联动

```
focusShot(shotId):
  selectShot(shotId)                    // 故事板 UI
  updateNodeData({ linkedShotId })
  若 tab=stage3d：reload project placements from shot.director3dGuide
  更新右栏预览
```

### 2.7.4 截图写回算法入口

```
onCapture(payload):
  shotId ← linkedShotId || 当前队列选中
  guide ← {
    sourceBlockId: deskId,
    captureId, captureUrl (upload dataUrl → media URL),
    cameraPrompt, cameraPosition, cameraRotation, cameraFov,
    panoramaUrl?: scene.panorama?.url,
    characterPlacements: from project objects,
    appliedAt: now
  }
  patch storyboard.shots[shotId].director3dGuide = guide
  同步 preview frame（若有 linkedStoryboardPreview）
  updateNodeData({ lastCaptureUrl, lastCameraPrompt, previewUrl: captureUrl })
```

### 2.7.5 批出（存量，行为锁定）

继续调用 `runDirectorDeskBatch`：

- `prefer3dRef` 时优先把 `director3dGuide.captureUrl` 注入参考图
- 角色/场景锁走 `enrichPromptWithCharacters` / `enrichPromptWithEnvironment` + `pickReferenceImage`
- 并发池 + `maxRetries`；`shouldAbort` 支持停止
- 完成后按 `autoOpenReview` 开审阅会话

### 2.7.6 flow-runner / 批量跑

若 runner 含 `director-desk`：保持「按节点策略跑 missing 队列」；**不**在无头环境强开 WebGL。3D 场景仅持久化，批出不依赖舞台已 mount。

---

## 2.8 算法

### 2.8.1 3D 覆盖率

```
with3d = count(shots where director3dGuide?.captureUrl)
coverage = total==0 ? 0 : with3d/total
```

摘要卡与生产页展示；可用于 P2 筛选「仅有3D」。

### 2.8.2 参考图优先级（批出，存量逻辑文档化）

```
refs = []
if prefer3d && shot.director3dGuide.captureUrl: push captureUrl (highest)
if forceCharacterRef: push character ref sheets
if forceSceneRef: push environment / scene refs
merge pictureNode upstream pictures
dedupe → runPictureGenJob
```

### 2.8.3 场景合并（迁移 / 双节点历史）

当工作区同时存在旧 `director-3d` 与 `director-desk`：

```
1. 选主节点 = director-desk（若无则把 3d 改写成 desk）
2. scene ← mergeDirectorProjects(desk.scene, d3.scene)
   - cameras: 按 id 并集；captures 按 createdAt 追加
   - objects: 按 id 并集；冲突保留 locked=true 优先
   - panorama: 非空优先；避免把 2D 关键帧误当 panorama（沿用 open 逻辑校验）
3. 重挂边：原连到 director-3d 的边改连 desk
4. 删除多余 3d 节点（或标记 migrated 隐藏）
```

### 2.8.4 队列可见性（存量）

```
filter missing → missing keyframe OR failed
filter failed → keyframe failed only
filter selected → selectedIds
filter all → activeEpisodeShots
```

---

## 2.9 集成

### 2.9.1 模块集成图

| 模块 | 角色 |
|------|------|
| `DirectorDeskBlock.tsx` | 唯一节点 UI；升级摘要卡 + Modal |
| `director-desk.css` / 新 `dd2` 布局 | Desk 视觉升级 |
| `director-desk-runner.ts` | 批出 SSOT（尽量不改算法，只改调用方） |
| `@nx9/director3d` | 舞台引擎；经 desk 宿主挂载，不再经独立 Block 为唯一入口 |
| `Director3dPanel.tsx` | P0 可改为 desk 内部宿主，或抽 `Director3dHost` 供 Modal 复用后删面板重复 |
| `director3d-open.ts` | 改为 `openDirectorStageForDesk(deskId, …)` |
| `director3d-ui` store | 可保留全屏沉浸；或收敛为 Modal 内状态 |
| `StoryboardPanel` / `camera-block-spawn` | 只 spawn `director-desk`；文案「导演台」 |
| `FlowSurface` | 去掉「点击 director-3d 开舞台」专支，改为 desk 开台 |
| `socket-registry` | desk emits/accepts 合并原 3d 能力；删除 desk↔3d 特殊互连或改为 no-op |
| `migrate-block-kinds` | `director-3d` → `director-desk` |
| `block-catalog` / `registry.tsx` | 下架 3d 条目 |
| 测试 | `test-pipe` 等去掉双节点断言，改为单 desk |

### 2.9.2 与素材库 / 分镜

- 角色网格/参考：素材库为角色主入口；舞台 `prepareDirectorProjectForShot` 读工作区角色
- 场景/全景：素材库场景 + preview `panorama720`；写入 guide.panoramaUrl
- `storyboard-desk`：仍负责分镜表；导演台消费 shots，不替代分镜台

### 2.9.3 与智能剪辑（功能 1）关系

导演台产出关键帧 /（经 clip-gen）镜头视频；智能剪辑消费成片时间线。二者串行，不合并节点。

### 2.9.4 ScreenModal 与其它弹窗节点

| 节点 | 关系 |
|------|------|
| `dialogue-sheet` / `asset-gate` / `storyboard-desk` / `continuity-check` | **不改其弹窗设计**；仅统一导演台自身升级 |
| `ScreenModal` 组件 | 允许加法扩展（tabs slot / size）；默认行为保持兼容 |

---

## 2.10 数据与持久化

| 数据 | 位置 |
|------|------|
| 批出策略与队列状态 | `director-desk` node.data |
| 3D 工程 | `node.data.scene`（`DirectorProject`） |
| 机位写回 | `workspace.storyboard.shots[].director3dGuide` |
| 捕获图 | 上传至 media，URL 进 guide.captureUrl |
| 审阅 | 现有 `keyframeStatus` / review session |

---

## 2.11 分阶段实现计划

### 阶段 A（P0）— 合并与壳升级

1. 迁移表 + catalog/registry/spawn 收口  
2. 摘要卡视觉与信息升级  
3. Modal 左右分栏 + Tab 壳；生产 Tab 行为对齐旧版  
4. 3D Tab 挂载引擎；写回 guide  
5. 加载含旧 `director-3d` 的工作区，验证迁移  
6. `pnpm --filter @nx9/shared build` + web typecheck；更新 pipe 测试

### 阶段 B（P1）— 链路打通

1. 队列 ↔ 3D 选镜联动、对比预览、缺 3D 引导  
2. 送出 Tab  
3. 沉浸子态 + WebGL dispose 稳健性  
4. 手工验收：摆位 → 批出 → 审阅 → 送视频 一条龙

### 阶段 C（P2）— 增强

1. 有3D筛选、多机位条、stage CSS desk 化  
2. （可选）导演规划技能对接  

---

## 2.12 验收标准

| # | 验收项 | 通过条件 |
|---|--------|----------|
| AC-1 | 单入口 | Dock 仅「导演台」；无「3D 导演台」 |
| AC-2 | 迁移 | 旧工作区 `director-3d` 打开后变为 desk 且 scene/guide 不丢 |
| AC-3 | 弹窗壳 | 仍为 ScreenModal；其它弹窗节点视觉/交互未被改坏 |
| AC-4 | 生产能力 | 旧批出/锁/重试/送视频/审阅路径可用 |
| AC-5 | 3D 能力 | Modal 内可摆位截图；`shot.director3dGuide` 有 captureUrl |
| AC-6 | 优先3D | 开启后批出参考含 3D 截图 |
| AC-7 | UI 升级 | 摘要卡含媒区+双进度；Modal 为分栏+Tab；颜色走 `--desk-*` |
| AC-8 | 画布风格 | 与剧本拆分/设定检查等 desk 节点同族，无第二套荧光风格 |

---

## 2.13 风险、存疑与八荣八耻自检

| 项 | 说明 |
|----|------|
| `[存疑]` 双 scene 合并策略 | 若 desk 与 3d 都有复杂 scene，自动合并可能丢对象；P0 可「3d 覆盖 desk 空 scene，否则保留 desk 并提示手动」 |
| `[存疑]` Modal 内 WebGL 性能 | 大画布+Modal 同时存在；必须在 `open=false` 时 dispose |
| `[存疑]` ScreenModal 宽度 | 3D 需要更大视口；是否对 desk 使用 `variant=stage` 全屏需实现时试一次，避免影响其它节点默认 |
| `[存疑]` Agent 摆位 | 技能 `production-director-plan` 仅文本规划，与 3D 工程无自动桥，P2 另开协议 |
| 以臆猜为耻 | API/字段均来自现码；合并方案经用户当次指令确认方向 |
| 以复用为荣 | 复用 runner、director3d 包、guide 类型、desk 色板；不新造批出引擎 |
| 以乱改架构为耻 | 保留 ScreenModal 弹窗族；不改其它弹窗节点 |
| 以分步为荣 | P0 合并+壳 → P1 链路 → P2 增强 |

---

## 2.14 关键文件清单（实现时对照）

**改造**

- `packages/shared/src/catalog/block-catalog.ts`
- `packages/shared/src/catalog/migrate-block-kinds.ts`
- `packages/shared/src/catalog/socket-registry.ts`
- `packages/shared/src/catalog/attached-workspace.ts`（3d 条目删除或注迁移）
- `apps/web/src/blocks/registry.tsx`
- `apps/web/src/blocks/core/DirectorDeskBlock.tsx`
- `apps/web/src/blocks/core/director-desk.css`
- `apps/web/src/engine/director3d-open.ts`
- `apps/web/src/panels/Director3dPanel.tsx`（抽宿主或内嵌）
- `apps/web/src/panels/StoryboardPanel.tsx`
- `apps/web/src/engine/camera-block-spawn.ts`
- `apps/web/src/engine/FlowSurface.tsx`
- `apps/server/test/test-pipe*.ts` / fixtures

**复用（尽量不改算法）**

- `apps/web/src/engine/director-desk-runner.ts`
- `packages/director3d/**`
- `apps/web/src/styles/desk-palette.css`

**可删/下架（P0 末）**

- Dock 入口与 registry 中的 `director-3d`
- 独立 `Director3dBlock` 可留文件一版迁移期，或改为薄包装转发 desk（不推荐长期双实现）

---

## 2.15 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-21 | 首版追加：统一导演台（合并 3D）详细设计（原型/UI 升级/功能/逻辑/算法/集成） |
| 2026-07-21 | 追加 §2.16 勘误补丁：对齐功能 3 编剧台、功能 4 分镜台边界与命名（不改合并方案本体） |
| 2026-07-21 | 追加 §2.17：内部提示词策略指针（详功能 8） |

---

## 2.16 勘误补丁（对齐功能 3 / 功能 4 · 2026-07-21）

> **性质**：勘误与边界补强。上文 §2.1–§2.14 **合并 3D + 批出本体仍然有效**，不整章重写。  
> **触发**：功能 3 将 `dialogue-sheet` 升级为编剧台并切断拆镜；功能 4 将分镜台定为「成稿拆镜 + 构图确认」，并把整集关键帧批出收归本台。

### 2.16.1 命名替换（实现与文案一律按新名）

| 原文用语（§2.x） | 勘误后 |
|-----------------|--------|
| `dialogue-sheet` / 「剧本拆分」 | **`script-desk` / 「编剧台」**（旧 kind 仅迁移期） |
| 「与剧本拆分同族」 | 「与 **编剧台 / 分镜台 / 设定检查** 等 desk 弹窗同族」 |
| 「分镜台产出本集镜头」 | 「**分镜台确认本集**（镜表 + 构图确认）后，导演台批出」 |

### 2.16.2 非目标勘误（替换 §2.1 对应句之效力）

原文：「不合并 `storyboard-desk` / `dialogue-sheet`（分镜表与剧本拆分仍独立）」

**勘误后生效表述**：

- 不合并 **`storyboard-desk`（分镜台）** / **`script-desk`（编剧台）**
- 导演台**不**做成稿写作、Bible draft、拆镜、镜表主编辑
- 导演台**是**整集工业级关键帧批出 + 3D 机位写回的唯一主入口（相对分镜台「试出图」）

### 2.16.3 主用户旅程勘误（替换 §2.4.3 效力）

```
编剧台确认成稿
  → 分镜台从成稿拆镜 → 镜表编辑 / 资产绑定 → 线稿构图（+ 少量试出图）
  → 分镜台「确认本集」
  → 导演台开台：3D 摆位（可选）→ 策略批出关键帧 → 审阅 → 送 clip-gen
  →（可选）智能剪辑
```

废弃心智：`剧本拆分拆镜 → 分镜台同步 → 分镜台全部关键帧`（与功能 3/4 冲突）。

### 2.16.4 与分镜台 / 编剧台职责矩阵（补强 §2.9.2）

| 能力 | 编剧台 | 分镜台 | **导演台（本功能）** |
|------|--------|--------|----------------------|
| 成稿 / Bible draft | ✅ | 只读 | ❌ |
| 拆镜 / 镜表 SSOT | ❌ | ✅ | 只读消费 |
| 批量线稿（构图） | ❌ | ✅ 主路径 | ❌ |
| 单镜/少量试出关键帧 | ❌ | ✅ 次路径 | 可审阅已有帧 |
| **整集 / 队列批出关键帧** | ❌ | ❌ 主 CTA 已撤 | ✅ **唯一主路径** |
| 3D 摆位写 `director3dGuide` | ❌ | 只读徽章 | ✅ |
| 确认本集可生产 | 确认成稿 | ✅ 确认本集 | 消费确认态开队 |

**队列数据源优先序（实现约束）**：

1. 工作区 `storyboard.shots`（由分镜台 apply/投影）
2. 优先展示 / 默认筛选 **已在分镜台 `confirmedEpisodeIds` 中的集**
3. 无确认集时允许警告级开队（可配置），但摘要卡提示「分镜台尚未确认本集」

### 2.16.5 与分镜台「试出图」不抢权（补功能项）

| ID | 项 | 说明 |
|----|----|------|
| DD-REV-01 | 批出主权 | 本台保留并强化「批出未完成 / 全部队列」；**不**因分镜台曾有批出按钮而削弱 |
| DD-REV-02 | 已有试出帧 | 分镜台试出图若已写入 shot / preview frame，批出策略默认「跳过已有成功帧」（沿用现 runner 跳过逻辑）；用户可强制重出 |
| DD-REV-03 | 深链开台 | 支持从分镜台交接 Tab「打开导演台」聚焦本节点并打开 ScreenModal（生产 Tab）；P0 可先 `fitView`+开台，P1 带 `episodeId` |
| DD-REV-04 | 反深链 | 本台可提供「回分镜台改镜」（可选 P1），不在本台内嵌镜表全量编辑 |

### 2.16.6 集成表勘误（替换 §2.9.4 表之效力）

| 节点 | 关系（勘误后） |
|------|----------------|
| `script-desk`（编剧台） | **不改其弹窗实现于本任务**；本台不读其镜表（编剧台亦无镜表）；不依赖其 `legacyScriptBreakdown` |
| `storyboard-desk`（分镜台） | **不改其弹窗实现于本任务**（其 UI 升级归功能 4）；本台消费其确认后的 shots / guide |
| `asset-gate` / `continuity-check` | 仍不改壳；仅数据/文案交接 |
| 说明 | 功能 2 定稿时的「其它弹窗零改」约束，指 **实现功能 2 时的改动范围**；功能 3/4 已各自授权升级对应节点，互不吞并 |

### 2.16.7 验收补强（追加于 §2.12）

| # | 验收项 | 通过条件 |
|---|--------|----------|
| AC-9 | 上下游命名 | 产品文案不再引导「从剧本拆分同步到导演台」；链路为编剧台 → 分镜台 → 导演台 |
| AC-10 | 批出主权 | 分镜台无「全部关键帧」主 CTA 时，本台仍能完成整集批出 |
| AC-11 | 确认集优先 | 存在 `confirmedEpisodeIds` 时，默认队列/摘要对齐已确认集 |

### 2.16.8 明确不改动的部分

- `director-3d` → `director-desk` 合并、三 Tab 壳、runner 批出算法、`StoryboardDirector3dGuide` SSOT、desk 色板升级：**仍以 §2.1–§2.14 为准**
- 不把拆镜、Agent 编剧、素材库主编辑并入导演台

---

## 2.17 勘误补丁（内部提示词策略 · 2026-07-21）

> **详章**：功能 8。本处只定导演台边界。

| 项 | 约定 |
|----|------|
| 重 Agent multi-skill system | **不做**（与编剧台不同） |
| 需要的内部文案 | 关键帧拼装规则：`enrichPromptWithCharacters` / `enrichPromptWithEnvironment`、风格锁、3D guide 并入方式；以代码常量为准 |
| Dev 窗 | **可选极简**：仅暴露短模板字段（一致性后缀等）；**禁止**整页 system 编辑器进产品主 Tab |
| P2 Agent 摆位（O-6） | 若做，技能 system 归功能 8 的 Dev Pack key；协议另开，本台不提前开窗 |

---

# 功能 3 · 编剧台（`dialogue-sheet` → `script-desk` · Agent）

- **状态**：设计定稿待实现（2026-07-21）
- **产品柱**：AI 漫剧故事入口 · 爆款短脚本捷径（上传/粘贴成稿）
- **节点 kind**：目录对外改名为 **「编剧台」**；实现期 **新增/迁到 `script-desk`**，`migrate-block-kinds`：`dialogue-sheet` → `script-desk`（旧工程可加载）。过渡期允许代码内仍读 `dialogue-sheet` 文件名，但 **Dock / 文案 / 交付物契约必须以编剧台为准**。
- **交互壳约束**：继续采用 **画布摘要卡 + ScreenModal**（现行「剧本拆分」同族弹窗节点）。**禁止**改成底部 Prompt Bar 主壳。本功能章节授权对本节点 **升级 UI**（用户当次指令）；**禁止**借机改动其它 ScreenModal 节点（设定检查 / 分镜台 / 连贯性检查等）的弹窗设计。
- **UI 硬要求**：在**当前剧本拆分**（`DialogueSheetBlock` + `dialogue-sheet.css` + `--desk-*`）基础上**必须升级**原型与视觉，与全画布 Desk 语言一致；Agent 对话区可略深，但外框、侧栏、成稿区、Bible 表必须走同一 desk token。
- **职责硬边界**：**不再负责剧本→分镜拆解**；镜级拆解完全交给 **分镜台**（`storyboard-desk`，另章改造）。编剧台交付物是 **成稿剧本包 + 叙事 Bible draft**，不是 `ScriptBreakdownPayload` 镜头表。
- **相关存量**：`DialogueSheetBlock.tsx`、`script-breakdown-runner.ts`、`productionScriptBreakdown` API、`ScriptStudioPanel`（Rail 双轨待收口）、`asset-gate`、素材库、`ScriptPlanPayload` / `script-breakdown.ts` 类型

---

## 3.1 背景与目标

### 问题（查档）

| 现象 | 代码 / 文档事实 |
|------|-----------------|
| 名实不符 | kind=`dialogue-sheet`，旧文档写「对白表」；UI 称「剧本拆分」；能力实为导演锁 + 多集文本 + **分镜拆解** |
| 职责过载 | 同一节点既写剧本约束又产出镜表；分镜台只能「同步上游 `scriptBreakdown`」 |
| 双轨入口 | Rail `ScriptStudioPanel`（骨架→改编→剧本→导演计划→分镜表）与画布拆分节点并行，`scriptPlan` 与 `scriptBreakdown` 两套模型 |
| 与素材库关系不清 | 拆分结果含角色/场景候选，易与素材库 SSOT、设定检查门禁抢权 |
| Agent 能力散落 | `scriptSkeleton` / `scriptAdaptation` / `screenplay` / `extractAssets` 等 API 在 Rail 半残向导里，未收成画布主节点 |

### 目标（一句话）

把现行「剧本拆分」升级为 **编剧台 Agent 节点**：双入口（Agent 共创 / 上传·粘贴成稿）产出 **可交接的剧本包 + 人物/场景叙事设定（Bible draft）**；**不产出镜头表**；下游由设定检查 / 素材库完善资产，由分镜台做拆镜。

### 非目标

- 不做 Premiere 式写作 IDE；不做无限多文档协作
- **不在本节点做** `productionScriptBreakdown` 镜级拆解（API 可复用，但调用权归分镜台）
- 不在本节点维护制作级资产 SSOT（参考图、三视图、Environment 多图锁定等 → 素材库）
- 不把设定检查、分镜台、导演台并入本弹窗
- 不改其它弹窗节点 UI

---

## 3.2 现状盘点（查档结果）

### 画布节点（现行「剧本拆分」）

| 资产 | 路径 | 事实 |
|------|------|------|
| 节点 UI | `apps/web/src/blocks/nx9/DialogueSheetBlock.tsx` | 摘要卡 + ScreenModal；Tab：`style`（导演控制可锁）→ `text`（多集）→ `result`（镜/角/场） |
| 样式 | `dialogue-sheet.css` | 已绑定 `--desk-*`；暗色工作台 + 迷你表摘要 |
| 执行 | `script-breakdown-runner.ts` + `flow-runner` `dialogue-sheet` 分支 | 调 `api.productionScriptBreakdown`，写 `scriptBreakdown`，并衍生角色/场景候选 |
| 目录 | `block-catalog.ts` | label「剧本拆分」，hint「小说/剧本 → 集 · 镜 · 角色 · 场景」 |
| 附着 | `attached-workspace.ts` | `workspaceType: 'table'`，`attachToNode: false`，自有 ScreenModal |
| Socket | `socket-registry.ts` | accepts `prompt`，emits `prompt`/`meta` |

### Rail / Agent API

| 资产 | 路径 | 事实 |
|------|------|------|
| Script Studio | `ScriptStudioPanel.tsx` | 5 步：骨架 / 改编 / 剧本 / 导演计划 / 分镜表；写 `scriptPlan` |
| Agent | `agent.service.ts` | `scriptSkeleton`、`scriptAdaptation`、`screenplay`、`storyboardTable`、`productionScriptBreakdown`、`extractAssets` |
| 类型 | `script-plan.ts` / `script-breakdown.ts` | `ScriptPlanPayload` vs 生产向 `ScriptBreakdownPayload`（含 shots） |

### 下游依赖（改造后必须改交接）

| 下游 | 现行依赖 | 改造后 |
|------|----------|--------|
| `asset-gate` | 读上游 `scriptBreakdown` 角色/场景 | 读编剧台 **Bible draft**（+ 成稿文本） |
| `storyboard-desk` | `syncFromUpstream` 拷贝 `scriptBreakdown` | 读 **ScreenplayPackage**，**在本台内**跑拆镜生成 `ScriptBreakdownPayload` / 等价镜表 |
| 素材库 | 手工或候选入库 | 打开角色/场景时挂载 **剧本支撑**（Bible + 成稿摘录） |
| Playbook / ModuleDock | `script` / `script-breakdown` → `dialogue-sheet` | 指向 `script-desk` |

---

## 3.3 产品定位

### 一句话

**编剧台 = 故事与剧本的 Agent 工位**；交付「能拍之前」的叙事资产，不交付「怎么拍」的镜头表。

### 双入口（必须并列，不可把上传埋进向导末尾）

```
┌─────────────────────────────────────────────┐
│  A. Agent 共创     │  B. 成稿直达              │
│  选题→…→生成剧本   │  上传/粘贴剧本 → 解析Bible │
│  （可跳步）         │  （可跳过全部 Agent 技能）  │
└──────────────┬──────┴──────────┬──────────────┘
               ▼                 ▼
        ScreenplayPackage（同一 SSOT）
               │
       ┌───────┴────────┐
       ▼                ▼
  设定检查/素材库      分镜台（拆镜）
  （Bible→资产）       （成稿→镜表）
```

### 能力域（Agent 技能，不是十个必经 Tab）

| 技能 id | 名称 | 产出写入包内字段 | 是否必经 |
|---------|------|------------------|----------|
| `topic` | 选题策划 | `brief.topic` / logline / 平台定位 | 否 |
| `world` | 世界观构建 | `bible.world` | 否（漫剧长篇建议开） |
| `character` | 人物构建 | `bible.characters[]`（叙事 draft） | 建议有成稿前至少 1 次或从成稿抽取 |
| `plot` | 剧情构建 | `brief.plotOutline` / acts | 否 |
| `pacing` | 节奏构建 | `brief.pacing` / 集时长目标 | 否 |
| `dialogue` | 对白构建 | 写入/改写 `screenplay` 对白层 | 否 |
| `hooks` | 爆点构建 | `brief.hooks[]` | 否（短视频/漫剧钩子常用） |
| `consistency` | 叙事一致性 | `diagnostics[]`（人设/时间线/称谓） | 否（确认成稿前建议跑） |
| `generate` | 生成剧本 | `screenplay`（分集正文） | 与上传二选一核心路径 |
| `ingest` | 上传/粘贴 | `screenplay` + 可选自动抽取 Bible | 与生成并列核心路径 |

**交互原则**：单一 Agent 对话面 + 可勾选技能芯片 + 右侧「成稿 / Bible」结构化面板；**禁止**做成必须点完 10 步的 Wizard。

### 人物 / 场景分层（已对齐产品讨论）

| 层 | 工位 | 内容 |
|----|------|------|
| **A. 叙事设定 Bible draft** | **编剧台** | 身份、关系、动机、外观关键词、场景戏剧功能、时代/空间文字 |
| **B. 制作资产 Asset card** | **素材库**（经设定检查门禁） | 参考图、三视图、锁定 Prompt、Environment 多图等 |
| **C. 镜级 Casting** | **分镜台** | 每镜出场角色、场次码；拆镜时补漏 → 回写候选，不在此从零写完整圣经 |

编剧台 **必须设计** 人物与场景（层 A），并作为素材库完善时的 **剧本支撑**；**不得**在编剧台做层 B 的完整编辑器。

---

## 3.4 原型

### 3.4.1 画布摘要卡（升级自现行 `ds-summary-card`）

```
┌──────────────────────────────────────────┐
│ 状态: 成稿已确认 │ 2 集 · 5 角 · 4 场     │
├──────────────────────────────────────────┤
│  [点击打开编剧台]                          │
│  ┌────────────────────────────────────┐  │
│  │ 眉题：成稿 / Agent 草稿              │  │
│  │ 标题：〈剧名〉                        │  │
│  │ 一行 logline 或最近对白摘录           │  │
│  │                         成稿 ✓ / 草 │  │
│  └────────────────────────────────────┘  │
│  统计：集数 | 字数 | Bible 角/场 | 诊断   │
│  芯片：题材 · 平台 · 节奏（desk soft chip）│
│  底栏：待送设定检查 / 可送分镜台           │
└──────────────────────────────────────────┘
```

状态机文案（替换「待导演 / 可拆分 / 已出表」）：

| 状态 | 条件 |
|------|------|
| 待输入 | 无成稿且无有效 Agent 会话 |
| Agent 中 | 会话进行中 |
| 成稿草稿 | 有 `screenplay` 未确认 |
| 成稿已确认 | `package.status === 'confirmed'` |
| 有诊断 | `diagnostics` 含 error/warning |

**不再显示「镜数」**（拆镜不归本节点）。

### 3.4.2 ScreenModal 总布局（升级）

在现行「左流程 / 右内容」思路上升级为 **左栏导航 + 中 Agent + 右产物**：

```
┌─ ScreenModal · 编剧台 · desk 外壳 ─────────────────────────────┐
│ 标题：编剧台 · 〈剧名〉     [入口: Agent | 上传成稿]  [确认成稿] │
├────────┬──────────────────────────────┬────────────────────────┤
│ 左栏    │ 中：Agent 工作区              │ 右：结构化产物           │
│ 280px  │                              │ 360–420px               │
│        │  · 消息流 / 流式回复           │  · 成稿预览（分集）       │
│ 技能   │  · 输入框 + @素材（只读引用）  │  · Bible：人物 | 场景    │
│ 芯片   │  · 「应用此步产出」确认条      │  · 诊断列表              │
│        │                              │  · 导出 MD / JSON        │
│ 会话   │                              │                        │
│ 列表   │                              │                        │
│        │                              │                        │
│ 快捷   │                              │                        │
│ 上传   │                              │                        │
│ 粘贴   │                              │                        │
└────────┴──────────────────────────────┴────────────────────────┘
```

**上传成稿模式**：中栏切换为大文本/文件区（拖放 .txt/.md）；右侧仍为 Bible（可「从成稿抽取」）。

### 3.4.3 与分镜台交接原型（契约示意，分镜台 UI 另章）

```
编剧台 [确认成稿] → meta/prompt 边 → 分镜台
分镜台打开时：若本地无镜表且上游有 confirmed package → CTA「从成稿拆镜」
（调用原 breakdown 能力，结果写入分镜台节点 data，不写回编剧台镜表）
```

### 3.4.4 素材库剧本支撑（联动示意）

素材库打开某角色/场景时：侧栏或顶栏只读块显示

- 来自 `bible.characters[i]` / `bible.scenes[j]` 的叙事字段  
- 成稿中命中该名的 1–3 段摘录（算法见 3.8）

**不在素材库内嵌完整 Agent。**

---

## 3.5 UI 规格（必须升级 · 对齐画布 Desk）

### 设计原则

1. **复用** `desk-palette.css` 的 `--desk-*`；CSS 类可从 `.ds-*` 演进为 `.sd-*`（script-desk），或保留 `.ds-*` 但去掉「分镜表」隐喻。
2. **与设定检查 / 统一导演台同族**：摘要卡渐变、`desk-shadow`、soft chip、主按钮主色；禁止青光 HUD / 扫描线。
3. **Agent 区**：消息气泡用 `--desk-panel` / `--desk-bg-2`；用户/助手层级靠左边线与字重，不靠荧光。
4. **成稿区**：等宽或略紧排版的预览；分集折叠头与现行 desk 表头一致。
5. **Bible 表**：表格/卡片二态；字段密度参考现行 result 子 Tab，但列改为叙事字段（无 imagePrompt/videoPrompt 镜列）。
6. **Modal 尺寸**：建议宽 ≥ 1080（Agent+双栏），高度与现行拆分台同级；过大时右栏可折叠为 Drawer。
7. **画布卡**：去掉「镜」主指标；主指标改为「成稿状态 + 集数 + Bible 角/场」。

### 文案

| 旧 | 新 |
|----|----|
| 剧本拆分 | 编剧台 |
| 导演控制（先锁再拆） | 可选「创作偏好」芯片（非拆镜前置锁死；偏好写入 `brief`） |
| 分镜表 / 已出表 | 成稿 / Bible |
| 拆分中 | 生成中 / 抽取中 |

### 明确删除的 UI（本节点内）

- 镜列表、景别/运镜列、imagePrompt/videoPrompt 编辑（迁分镜台）
- 「锁定导演后才能保存文本才能拆分」的强制三步锁（改为：确认成稿前可随时改；偏好可选）

---

## 3.6 功能清单

### P0 — 换壳 + 契约 + 双入口（可演示主链）

| ID | 项 | 类型 | 说明 |
|----|----|------|------|
| SD-P0-01 | 目录改名 + kind 迁移 | `[改造]` | label「编剧台」；`dialogue-sheet`→`script-desk` |
| SD-P0-02 | 摘要卡升级 | `[改造]` | 成稿状态；无镜数 |
| SD-P0-03 | ScreenModal 三栏壳 | `[改造]` | 左技能/中 Agent 或上传/右成稿+Bible |
| SD-P0-04 | `ScreenplayPackage` 类型 | `[新增]` | 见 3.9；节点 data 主字段 |
| SD-P0-05 | 上传/粘贴成稿 | `[改造]` | 多集文本保存为 package.screenplay |
| SD-P0-06 | 从成稿抽取 Bible | `[改造]` | 复用/演进 `extractAssets` + 规范化为 draft |
| SD-P0-07 | 确认成稿 | `[新增]` | status=confirmed；下游可读 |
| SD-P0-08 | 停止本节点拆镜 | `[改造]` | UI/flow-runner 不再调 `productionScriptBreakdown` |
| SD-P0-09 | 下游临时桥 | `[改造]` | asset-gate / storyboard-desk 可读 package；**分镜台**侧保留「拆镜」入口（可暂调原 API） |
| SD-P0-10 | Script Studio 收口声明 | `[改造]` | Rail 入口改为「打开编剧台」或隐藏五步向导（P0 至少不再引导拆镜表） |

### P1 — Agent 技能闭环

| ID | 项 | 类型 | 说明 |
|----|----|------|------|
| SD-P1-01 | Agent 会话持久化 | `[新增]` | 消息写入节点或 workspace，可恢复 |
| SD-P1-02 | 技能芯片调度 | `[新增]` | topic/world/character/plot/pacing/dialogue/hooks/generate |
| SD-P1-03 | 「应用此步产出」 | `[新增]` | 模型结构化结果经用户确认写入 package |
| SD-P1-04 | 生成完整剧本 | `[改造]` | 收口 `screenplay` API + 分集写入 |
| SD-P1-05 | 叙事一致性检查 | `[新增]` | diagnostics；与画面 `continuity-check` 文案区分 |
| SD-P1-06 | 送设定检查 | `[改造]` | 边数据带 bible drafts |
| SD-P1-07 | 素材库剧本支撑 UI | `[改造]` | 详情页只读挂载 |

### P2 — 增强

| ID | 项 | 类型 | 说明 |
|----|----|------|------|
| SD-P2-01 | 多集续写 / 选集再生成 | `[新增]` | |
| SD-P2-02 | 爆点轨可视化 | `[新增]` | hooks 时间线示意（非分镜） |
| SD-P2-03 | 导出剧本包 ZIP | `[新增]` | md + bible json |
| SD-P2-04 | @引用素材库只读 | `[新增]` | 生成时注入已有角色锁定描述（不反向改库） |
| SD-P2-05 | 旧 `scriptBreakdown` 只读迁移提示 | `[改造]` | 历史节点提示「镜表请在分镜台查看/重拆」 |

---

## 3.7 逻辑

### 3.7.1 节点 data（逻辑模型）

```ts
// 逻辑示意 — 正式类型落在 packages/shared（见 3.9）
interface ScriptDeskNodeData {
  status: 'idle' | 'running' | 'success' | 'error';
  content: string; // 摘要一行
  entryMode: 'agent' | 'ingest';
  package: ScreenplayPackage;
  agentSession?: ScriptDeskAgentSession;
  /** 迁移期只读：旧拆镜结果，本台不再生成 */
  legacyScriptBreakdown?: ScriptBreakdownPayload;
  directorBrief?: string; // 旧字段可映射到 brief.notes
}
```

### 3.7.2 打开 / 关闭

- 画布卡点击 → `studioOpen=true` ScreenModal  
- 关闭不丢 session / package（已写入 node data / workspace）  
- `attachToNode: false` 保持，避免 CanvasNodeShell 盖掉摘要卡（现行约束）

### 3.7.3 确认成稿状态机

```
empty → drafting（有正文或 Bible）→ confirmed
confirmed 后编辑正文 → 自动回退 drafting（并 toast「成稿已失效，需重新确认」）
```

`confirmed` 是下游分镜台「允许拆镜」、设定检查「允许批量对照」的门闩（可配置警告级绕过，默认建议门闩）。

### 3.7.4 Agent 一步写入规则

1. 用户点技能或输入自然语言 → 服务端返回 **结构化 patch**（JSON）+ 助手解说  
2. UI 展示 diff（成稿段落 / Bible 行）  
3. 用户点「应用」才 merge 进 `package`  
4. 禁止静默覆盖已 `confirmed` 的正文（先降级状态）

### 3.7.5 人物/场景 draft 与库的关系

- 编剧台 **只写** `package.bible`  
- **不**直接 `upsertCharacter` / `setEnvironments` 作为默认成功路径（避免再现「拆完自动入库破坏门禁」）  
- 设定检查：对比 bible vs 库 → 用户确认后入库  
- 素材库：保存资产时可选「从 bible 同步叙事字段」，参考图仍只在库内编辑

### 3.7.6 与分镜台

- 编剧台 **不**调用 `runProductionScriptBreakdown`  
- 分镜台：输入 = `ScreenplayPackage`（confirmed）；输出 = 镜表（可继续用 `ScriptBreakdownPayload` 形态存在分镜台节点上）  
- 迁移期：若上游仍是旧节点且仅有 `legacyScriptBreakdown`，分镜台可一键导入旧表并提示「建议改为从成稿重拆」

---

## 3.8 算法

### 3.8.1 成稿分集切分（ingest）

复用现行 `composeSourceText` / `splitSourceIntoEpisodeChunks` 思路：

1. 优先识别「第 N 集」显式标题  
2. 否则按 `brief.episodeCount` 或长度启发式切片  
3. 结果写入 `screenplay.episodes[]`，**不**生成 shots

### 3.8.2 从成稿抽取 Bible

1. 调 `extractAssets` 或新 `scriptBibleExtract`（推荐新 endpoint，返回稳定 schema）  
2. Normalize：人名去重、别名合并、场景 code 初值  
3. Merge 策略：同名保留用户已编辑字段，空字段填模型值  
4. 质量闸：人物 0 且正文 > N 字 → warning diagnostic

### 3.8.3 叙事一致性（P1）

输入：`bible` + `screenplay` 全文  
检查（规则 + LLM 混合）：

- 出场人物是否都在 bible（或标记为龙套）  
- 称谓/姓名漂移  
- 场景时代与 world 冲突  
- 爆点 hooks 是否在成稿中有落点（弱检查）

输出：`diagnostics[]`，不自动改稿（可提供「一键修复建议」补丁，仍需应用）。

### 3.8.4 素材库摘录检索

给定角色名 / 场景名：

1. 在 `screenplay` 各集正文做窗口检索（姓名/别名）  
2. 取最长匹配或含对白的片段，截断 120–200 字  
3. 缓存到资产详情的 view-model，不写回 package（除非用户「钉选摘录」）

### 3.8.5 Agent 技能提示词组装

```
system = 技能专用 system（选题/人物/…）
user = {
  brief, bible, screenplay摘要,
  用户本轮指令,
  创作偏好 chips,
  输出 JSON schema 强制
}
```

禁止一次技能直接输出镜级 prompt 列表。

---

## 3.9 数据契约

### 3.9.1 `ScreenplayPackage`（新 SSOT · 建议路径）

`packages/shared/src/types/screenplay-package.ts` `[新增]`

```ts
export type ScreenplayPackageStatus = 'empty' | 'drafting' | 'confirmed';

export interface ScreenplayBrief {
  title?: string;
  logline?: string;
  topic?: string;
  targetPlatforms?: string[];
  pacing?: 'slow' | 'balanced' | 'fast';
  targetEpisodeDurationSec?: number;
  episodeCount?: number;
  plotOutline?: string;
  hooks?: string[];
  notes?: string;
  /** 原导演控制芯片的降维：创作偏好，非拆镜锁 */
  creativePrefs?: Partial<ScriptDirectorControls>; // 或瘦身版
}

export interface ScreenplayEpisode {
  id: string;
  index: number;
  title: string;
  bodyMd: string;       // 场次头+动作+对白，剧本正文
  updatedAt: string;
}

export interface ScreenplayCharacterDraft {
  id: string;
  name: string;
  aliases?: string[];
  identity?: string;
  appearance?: string;
  personality?: string;
  relationships?: string;
  goal?: string;
  voiceNotes?: string;
  fixedVisualKeywords?: string;
  /** 未入库 | 已在库（只读标记，由门禁回写） */
  libraryStatus?: 'draft' | 'in_library' | 'missing';
  libraryCharacterId?: string;
}

export interface ScreenplaySceneDraft {
  id: string;
  name: string;
  code?: string;
  summary?: string;
  era?: string;
  location?: string;
  dramaticFunction?: string;
  sensoryNotes?: string;
  libraryStatus?: 'draft' | 'in_library' | 'missing';
  libraryEnvironmentId?: string;
}

export interface ScreenplayWorldDraft {
  era?: string;
  location?: string;
  worldview?: string;
  visualStyleNotes?: string;
  rules?: string[];
}

export interface ScreenplayBible {
  world?: ScreenplayWorldDraft;
  characters: ScreenplayCharacterDraft[];
  scenes: ScreenplaySceneDraft[];
}

export interface ScreenplayDiagnostic {
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  episodeId?: string;
  entityId?: string;
}

export interface ScreenplayPackage {
  schema: 'nx9-screenplay-package';
  version: 1;
  status: ScreenplayPackageStatus;
  brief: ScreenplayBrief;
  bible: ScreenplayBible;
  screenplay: {
    episodes: ScreenplayEpisode[];
    sourceType?: 'generated' | 'uploaded' | 'pasted' | 'mixed';
  };
  diagnostics?: ScreenplayDiagnostic[];
  confirmedAt?: string;
  updatedAt: string;
}
```

### 3.9.2 与旧类型关系

| 旧 | 关系 |
|----|------|
| `ScriptBreakdownPayload` | **不再由编剧台产出**；归属分镜台（可由 package 生成） |
| `ScriptPlanPayload` | Rail 遗留；P0/P1 映射导入 package 后废弃写入 |
| `ScriptBreakdownCharacterProfile` | 可适配为 `ScreenplayCharacterDraft` 的字段超集来源 |

### 3.9.3 Socket / meta 发射

确认成稿后 emits meta 建议包含：

```ts
{
  type: 'screenplay-package',
  packageId: blockId,
  status: 'confirmed',
  title, episodeCount,
  characterDraftCount, sceneDraftCount,
}
```

---

## 3.10 集成

| 模块 | 动作 |
|------|------|
| `block-catalog.ts` | label/hint/glyph；kind `script-desk` |
| `migrate-block-kinds.ts` | `dialogue-sheet` → `script-desk`；data 迁移：旧 `sourceEpisodes`+正文 → package；旧 `scriptBreakdown` → `legacyScriptBreakdown` |
| `registry.tsx` | 加载 ScriptDeskBlock（可由 DialogueSheetBlock 演进改名） |
| `attached-workspace.ts` | kind 键更新；note 改为编剧台 Agent |
| `socket-registry.ts` | 键更新；仍 prompt/meta |
| `flow-runner.ts` | 去掉拆镜；可改为「抽取 Bible」或 no-op success |
| `script-breakdown-runner.ts` | **调用方改为分镜台**；编剧台不再 import 主路径 |
| `asset-gate-runner.ts` | 输入改为 bible drafts |
| `StoryboardDeskBlock` | 「从成稿拆镜」替代「从剧本拆分同步」 |
| `ScriptStudioPanel` | 降级为打开编剧台 / 删除拆镜步 |
| `ModuleDock` / playbook | script 步绑定 `script-desk` |
| `AssetLibraryModal` | 角色/场景详情挂剧本支撑 |
| Agent API | 新增 `script-desk/chat` 或按技能拆 endpoint；复用 skeleton/adaptation/screenplay/extract |
| 功能 2 导演台 | 不依赖本节点镜表；仍读故事板 / 分镜台镜头 |
| 功能 1 智能剪辑 | 不直接依赖编剧台 |

### 弹窗族约束

| 节点 | 本功能是否改其弹窗 |
|------|-------------------|
| 编剧台（本节点） | **升级**（本章授权） |
| asset-gate / storyboard-desk / continuity-check | **不改弹窗壳**；仅改数据交接与 CTA 文案（分镜台拆镜能力另章） |

---

## 3.11 数据持久化

| 数据 | 位置 |
|------|------|
| `ScreenplayPackage` | 节点 `data.package`（主） |
| Agent 会话 | `data.agentSession`；过长可外置 workspace blob `[存疑：体积]` |
| Bible draft | 包内；入库后库内为 SSOT，draft 上打 `libraryStatus` |
| 旧拆镜 | `legacyScriptBreakdown` 只读，不在本台刷新 |

---

## 3.12 分阶段实现

### 阶段 P0（建议优先）

1. 类型 `ScreenplayPackage` + 迁移函数（旧节点 → package）  
2. UI 换壳：摘要卡 + 三栏 Modal；上传/粘贴 + 抽取 Bible + 确认成稿  
3. 切断本节点拆镜；分镜台加「从成稿拆镜」最小桥（可调原 API）  
4. asset-gate 读 bible  
5. 目录/迁移/Dock/playbook 文案  

### 阶段 P1

1. Agent 会话 + 技能芯片 + 应用补丁  
2. 一致性诊断  
3. 素材库剧本支撑  
4. Script Studio 彻底收口  

### 阶段 P2

续写、导出包、@库只读、旧镜表迁移体验。

**依赖**：分镜台「成稿→拆镜」主改造可与 P0 桥并行，但 **完整拆镜 UX 以分镜台专章为准**；本章不代替分镜台设计。

---

## 3.13 验收标准

| ID | 条件 |
|----|------|
| AC-1 | Dock 可见「编剧台」，旧「剧本拆分」工程打开后 kind 迁移成功 |
| AC-2 | 上传/粘贴剧本可不经 Agent 技能得到 package，并能确认成稿 |
| AC-3 | Agent 路径至少能完成「生成/改写成稿 + 人物/场景 draft」之一并写入 package |
| AC-4 | 确认成稿后，本节点 **不会** 出现新的镜列表 / 不调用拆镜 API |
| AC-5 | 分镜台能从 confirmed package 触发拆镜（P0 桥即可） |
| AC-6 | 设定检查能基于 bible draft 列出缺失角色/场景，默认不自动入库 |
| AC-7 | 素材库角色/场景详情可见剧本支撑（P1） |
| AC-8 | UI 使用 `--desk-*`，与画布 desk 族一致；无第二套荧光风 |
| AC-9 | 其它 ScreenModal 节点弹窗结构未被本任务改动 |

---

## 3.14 风险与存疑

| 项 | 说明 |
|----|------|
| 主链空窗 | 若分镜台桥未上就切断拆镜 → 漫剧链路断；**P0 必须同发桥** |
| Agent 成本与时长 | 多技能串行费 token；需可跳步与「一键成稿」 |
| 会话体积 | 长对话进节点 JSON 可能膨胀 → `[存疑]` 是否外置 |
| kind 重命名面 | 测试夹具、e2e、文档多处 `dialogue-sheet` 需扫 |
| 创作偏好 vs 旧导演锁 | 旧用户习惯「先锁再拆」；需迁移说明 |
| `[存疑]` 是否保留独立 `script-desk` 文件名 | 或 DialogSheet 文件演进改名即可 |
| `[存疑]` Rail Script Studio 删除时机 | P0 隐藏 vs P1 删除 |
| 以臆猜为耻 | 拆镜归属、Bible 分层、双入口均来自用户当次对齐；API 路径来自现码盘点 |
| 以复用为荣 | 复用 desk 色板、ScreenModal、extract/screenplay API、分集切分算法 |
| 以乱改架构为耻 | 不吞并分镜台/素材库；其它弹窗冻结 |
| 以分步为荣 | P0 契约与双入口 → P1 Agent → P2 增强 |

---

## 3.15 关键文件清单（实现时对照）

**改造**

- `packages/shared/src/catalog/block-catalog.ts`
- `packages/shared/src/catalog/migrate-block-kinds.ts`
- `packages/shared/src/catalog/attached-workspace.ts`
- `packages/shared/src/catalog/socket-registry.ts`
- `apps/web/src/blocks/nx9/DialogueSheetBlock.tsx`（演进为编剧台）
- `apps/web/src/blocks/nx9/dialogue-sheet.css`
- `apps/web/src/engine/flow-runner.ts`
- `apps/web/src/engine/asset-gate-runner.ts`
- `apps/web/src/blocks/craft/StoryboardDeskBlock.tsx`（交接 CTA）
- `apps/web/src/engine/stage-deck/chrome/rail/ScriptStudioPanel.tsx`
- `apps/web/src/panels/AssetLibraryModal.tsx` / `asset-library/*`（P1）
- `apps/web/src/engine/core-pipeline-graph.ts` / ModuleDock / playbook
- `apps/server/src/modules/agent/agent.controller.ts` / `agent.service.ts`

**新增（建议）**

- `packages/shared/src/types/screenplay-package.ts`
- `apps/web/src/engine/script-desk-runner.ts`（Agent 应用补丁、确认成稿、抽取）
- `apps/server`：`script-desk` 技能路由或 chat 聚合 endpoint

**调用权转移**

- `script-breakdown-runner.ts` / `productionScriptBreakdown` → **分镜台**主调用

**测试**

- 迁移：旧 dialogue-sheet 工程 → package  
- 上传成稿 → confirm → 分镜台拆镜桥  
- bible 不自动入库  
- Agent 应用补丁幂等

---

## 3.16 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-21 | 首版追加：编剧台 Agent（改名、去拆镜、Bible 叙事层、双入口、UI 升级、与分镜台/素材库交接） |
| 2026-07-21 | 追加 §3.17：内部提示词 / Dev Prompt Pack（详功能 8） |

---

## 3.17 勘误补丁（内部提示词 · 2026-07-21）

> **详章**：功能 8。§3.8.5「Agent 技能提示词组装」仍然有效，本补丁补充落点与 UI 边界。

| 项 | 约定 |
|----|------|
| 内部提示词 | **必须有**：按技能拆分 `DEFAULT_SCRIPT_DESK_SKILL_PROMPTS`（选题/世界观/人物/剧情/节奏/对白/爆点/一致性/生成剧本等） |
| 旧拆分 system | `episodePlannerSystem` / `episodeBreakdownSystem` **迁出本台** → 归分镜台（功能 4 + 功能 8） |
| 产品 UI | 用户主路径是 Agent 对话 + 成稿/Bible；**禁止**把整段 system 当默认主 Tab |
| Dev 窗 | **要**：Dev-only Prompt Pack（导入/导出 JSON）；闸门见功能 8 |
| 上传成稿 | 可不调 Agent，故可不读技能 system；一旦走技能芯片则必须走 DEFAULT + 覆盖合并 |

---

# 功能 4 · 分镜台改造（`storyboard-desk` · 成稿拆镜 → 构图确认 → 交导演台）

- **状态**：设计定稿待实现（2026-07-21）
- **产品柱**：AI 漫剧主链（成稿 → 镜表 → 构图 → 导演批出 → 智能剪辑）
- **节点 kind**：保持 `storyboard-desk`（**不新建 kind**）；目录 hint 由「分镜表 + 关键帧预览出图」升级为「成稿拆镜 · 镜表 · 构图确认」
- **交互壳约束**：继续采用 **画布摘要卡 + ScreenModal**（现行分镜台同族弹窗）。**禁止**压成 Prompt Bar。本章授权对本节点 **升级 UI**（用户当次指令）；**禁止**借机改动其它 ScreenModal 节点（编剧台 / 设定检查 / 统一导演台 / 连贯性检查等）的弹窗设计。
- **上游契约**：消费功能 3 的 `ScreenplayPackage`（`status: confirmed`）；迁移期兼容旧 `scriptBreakdown` / `legacyScriptBreakdown`
- **下游契约**：本集确认后，镜头表供功能 2 统一导演台批出；预览帧可少量试出，**整集工业级关键帧流水线归导演台**
- **相关存量面**：`StoryboardDeskBlock`、`script-breakdown-runner`、`storyboard-preview-runner`、`StoryboardPreviewWorkspace`、`StoryboardPanel` / Rail、`ScriptBreakdownPayload`、工作区 `storyboard.shots`

---

## 4.1 背景与目标

### 问题（查档 + 与功能 3 边界对齐后的客观结论）

| 问题 | 代码 / 产品事实 |
|------|-----------------|
| **无拆镜主权** | 现行主路径是 `useUpstreamBreakdown` + `sync()` 拷贝上游 `scriptBreakdown`；自身不调用 `runProductionScriptBreakdown`。功能 3 切断编剧台拆镜后，若不改造，主链空窗 |
| **与导演台抢「批关键帧」** | 顶栏/底栏同时有「可见/全部/缺图」关键帧批出；导演台（功能 2）定位正是整集工业级关键帧批生产 → 双入口心智冲突 |
| **分集 Tab 过薄** | `episodes` Tab 仅列表切换，能力已被顶栏「当前分集」下拉覆盖 → 占位冗余 |
| **多 SSOT 易漂移** | 节点 `scriptBreakdown` + `storyboardPreview` + 工作区 `storyboard.shots` 三处写；同步/出图/确认路径各自 patch |
| **Rail 双轨** | `StoryboardPanel` / Rail 仍有独立线稿批出与镜表编辑，与弹窗台并行 |
| **批量按钮过载** | 顶 `sg-batch-bar` 5 钮 + 底栏再重复线稿/关键帧 → 认知负担高 |
| **未接 ScreenplayPackage** | 上游探测只认 `scriptBreakdown.version === 1`，不认功能 3 成稿包 |
| **线稿→关键帧定位模糊** | 线稿有价值（构图确认），但与「批量关键帧」并列为主 CTA，用户难区分「确认构图」vs「开拍出图」 |

### 目标（一句话）

把分镜台升级为：**成稿 → 镜级拆解与编辑 → 资产绑定 → 构图确认（线稿 / 少量试出图）→ 确认本集可交导演台** 的唯一拆镜与构图台。

一句话职责：**管「怎么分镜、构图对不对」；不管「整集工业级关键帧流水线」（那是导演台）。**

### 非目标（明确不做）

- 不吞并编剧台（不写 `ScreenplayPackage` 正文 / Bible draft 主编辑）
- 不吞并导演台（不把功能 2 的队列批出 / 3D 舞台搬进本 Modal）
- 不吞并素材库（角色/场景主档仍在库；本台只做镜级 casting 与 @引用）
- 不做第三套完整故事板 NLE（时间轴精剪归智能剪辑）
- 不删除 ScreenModal 壳；不改其它弹窗节点壳
- 不以「同步上游旧镜表」作为漫剧主路径（仅迁移 / 兼容）

---

## 4.2 现状盘点（查档结果）

### 前端节点

| 资产 | 路径 | 现状 |
|------|------|------|
| 节点 UI | `apps/web/src/blocks/craft/StoryboardDeskBlock.tsx` | 摘要卡 + ScreenModal；Tab：`grid` / `episodes` / `preview`；同步上游、镜编辑、单/批量线稿与关键帧、确认本集 |
| 样式 | `apps/web/src/blocks/craft/storyboard-desk.css` | `--sg-*` 映射 `--desk-*`；摘要卡已与剧本拆分同族；批量条 / 宫格 / 编辑抽屉齐全 |
| 上游探测 | 同文件 `useUpstreamBreakdown` | 仅边入边扫 `data.scriptBreakdown` |
| 同步 | `sync()` | 拷贝 upstream → 本地 `scriptBreakdown`，并 `setStoryboard` 写工作区 shots |
| 确认 | `confirmCurrentEpisode` | 写 `confirmedEpisodeIds` / `gridConfirmed` |
| 出图 | `generateStoryboardFrameImage` + `buildLineArtShotPrompt` | 依赖顶口连接 `picture-gen` |
| 预览嵌入 | `StoryboardPreviewWorkspace` | preview Tab 内嵌；含评分、3D guide 面板入口等 |

### 引擎与类型

| 资产 | 路径 | 现状 |
|------|------|------|
| 拆镜 runner | `apps/web/src/engine/script-breakdown-runner.ts` | `runProductionScriptBreakdown` / `applyScriptBreakdownPayload` / profiles·environments 派生；**现行主调用方仍偏剧本拆分**，功能 3 要求调用权迁本台 |
| 预览 runner | `storyboard-preview-runner.ts` | 找连接图像节点、生成帧 |
| 镜表类型 | `packages/shared/src/types/script-breakdown.ts` | `ScriptBreakdownPayload` v1（episodes/shots/characters/scenes…） |
| 工作区故事板 | `packages/shared/src/types/storyboard.ts` | `storyboard.shots`；可含 `director3dGuide` |
| 预览载荷 | shared storyboard-preview 相关 | `StoryboardPreviewPayload.frames` 与 breakdown 双写 |

### 目录 / 壳 / 迁移

| 资产 | 现状 |
|------|------|
| `block-catalog.ts` | label「分镜台」，hint「分镜表 + 关键帧预览出图」 |
| `attached-workspace.ts` | `workspaceType: 'preview'`，`attachToNode: false`；note 含「关键帧预览出图 + 顶部 exec-picture」 |
| `migrate-block-kinds.ts` | `story-grid` / `storyboard-preview` / `shot-script` → `storyboard-desk`（已合并历史节点） |
| `socket-registry.ts` | accepts/emits `prompt/picture/meta` |

### 双轨面

| 资产 | 现状 | 本功能态度 |
|------|------|------------|
| `StoryboardPanel.tsx` | 独立镜表 + 线稿批出 | P0 降级入口 / 指向开台；P1 收口，避免第二编辑面 |
| Rail `StoryboardRailPanel` | playbook 步 | 主 CTA 改为打开分镜台 ScreenModal |
| 功能 2 导演台 | 批出 SSOT | 本台「全部关键帧」降为次级或跳转导演台 |
| 功能 3 编剧台 | 成稿包 | 本台主输入 |

---

## 4.3 产品定位与信息架构

### 4.3.1 管线位置

```
编剧台 (ScreenplayPackage confirmed)
        ↓ meta / prompt
设定检查 / 素材库（可选，资产就绪）
        ↓
分镜台 (本功能) ──拆镜──▶ ScriptBreakdownPayload（节点内 SSOT）
        │                 + 工作区 storyboard.shots（下游消费投影）
        │ 构图确认（线稿 / 试出图）
        │ 确认本集
        ↓
导演台 (批出关键帧 / 3D)
        ↓
智能剪辑 / export-pack
```

### 4.3.2 职责矩阵（与功能 2 / 3 对齐）

| 能力 | 编剧台 | **分镜台** | 导演台 | 素材库 |
|------|--------|------------|--------|--------|
| 成稿正文 / Bible draft | ✅ | 只读引用 | ❌ | 读支撑文案 |
| `productionScriptBreakdown` | ❌ | ✅ **主调用** | ❌ | ❌ |
| 镜字段编辑 / 增删合拆 | ❌ | ✅ | 只读队列 | ❌ |
| 镜级 casting（出场角色/场） | draft 名单 | ✅ 绑定 | 锁引用 | 主档 |
| 批量线稿（构图） | ❌ | ✅ 主路径 | ❌ | ❌ |
| 整集批量关键帧 | ❌ | 试出图 / 降级 | ✅ **主路径** | ❌ |
| 3D 摆位写回 | ❌ | 可读 guide | ✅ 主路径 | ❌ |
| 确认本集可生产 | 确认成稿 | ✅ 确认本集 | 消费确认态 | — |

### 4.3.3 节点内 SSOT 规则（改造后）

| 数据 | 角色 |
|------|------|
| `data.scriptBreakdown` | **镜表 SSOT**（本台产出与编辑；可由成稿拆镜生成） |
| `data.storyboardPreview` | **构图/试出图派生态**（frames、评分）；不得单独成为「无 breakdown 的镜表来源」 |
| 工作区 `storyboard.shots` | **下游投影**（导演台 / 剪辑 / 3D）；由 `applyScriptBreakdownPayload` / 确认时统一投影，禁止第三方静默改写为本台真相 |
| 上游 `ScreenplayPackage` | **只读输入**；拆镜结果**不写回**编剧台 |

---

## 4.4 原型（必须相对现行分镜台升级）

### 4.4.1 画布摘要卡（升级版 · 替换现行 `sg-summary-card` 语义）

现行：眉题「分镜台/等待拆分」+ 镜数 + 关键帧统计 +「同步/开台」；空态文案仍写「连接剧本拆分」。

**升级目标**：一眼可读「成稿是否可拆 / 镜表进度 / 构图覆盖 / 本集是否可交导演」。

```
┌─────────────────────────────────────────────────┐
│  ▌分镜台                         · EP01 未确认   │
│  拆镜与构图工作台                                  │
│                                                 │
│  ┌──────────┐  成稿已接 · 已拆 24 镜              │
│  │ 线稿/试出 │  构图 18/24 · 试出图 6             │
│  │ 缩略拼贴  │  ████████░░  构图 75%             │
│  └──────────┘  角色绑定 20 · 场绑定 22            │
│                                                 │
│  [从成稿拆镜]              [开台]                 │
└─────────────────────────────────────────────────┘
```

升级点（相对现状）：

1. **空态主文案**改为「连接编剧台成稿」；仅当探测到旧 `scriptBreakdown` 时显示次级「导入旧镜表」。
2. **左媒区**：优先线稿拼贴 → 试出关键帧 → desk media 空态；禁止长期「等待拆分」纯字卡。
3. **指标**：镜数 + **构图覆盖**（有线稿或已确认构图的镜占比）为主；「关键帧张数」降为次级（避免暗示本台是批出主场）。
4. **双 CTA**：主钮「开台」；有 confirmed package 且无本地镜表时主幽灵钮「从成稿拆镜」；旧上游镜表时「导入旧表」降级。

### 4.4.2 ScreenModal 总布局（升级版）

现行：宽 980；顶 Tab 三分（分镜表 / 分集 / 关键帧）+ 顶栏 5 个批出按钮 + 底栏再重复。

**升级为「左镜列 / 右工作面」+ 顶模式**（仍 `ScreenModal`，建议 `width: min(1120px, 100vw-32px)`，与导演台升级同族）：

```
┌─ ScreenModal · 分镜台 ────────────────────────────────────────────┐
│ 标题：分镜台 · 拆镜与构图          副标：成稿→镜表→构图→交导演台      │
│ [拆镜] [镜表] [构图] [交接]     分集切换 EP01 ▾   本集未确认 ·徽章   │
├──────────────┬────────────────────────────────────────────────────┤
│ 左栏 · 镜列表 │ 右栏 · 随模式变                                      │
│ 筛选：未构图/  │                                                    │
│ 未绑定/全部    │ 【拆镜】                                            │
│ #01 MS 推     │  成稿摘要只读 · 拆镜参数（时长/风格锁）               │
│ #02 CU 固定 ✓ │  [从成稿拆镜] [增量补拆选中场] [导入旧表…]            │
│ #03 …         │  进度与诊断（漏场、空对白、时长异常）                 │
│              │                                                    │
│              │ 【镜表】                                            │
│              │  宫格或表格式编辑（复用现 ShotStoryCell / 编辑抽屉）   │
│              │  增镜 / 合镜 / 拆镜（P1）· @角色 @场景 绑定            │
│              │                                                    │
│              │ 【构图】                                            │
│              │  线稿主操作：单镜 / 可见批量                          │
│              │  试出图：单镜或「缺图补试出」（刻意不叫「全部关键帧」） │
│              │  嵌入预览评分（复用 StoryboardPreviewWorkspace 子集） │
│              │                                                    │
│              │ 【交接】                                            │
│              │  本集就绪检查清单 · 确认本集 · 打开导演台（深链）     │
├──────────────┴────────────────────────────────────────────────────┤
│ 底栏：图像节点已连 · 线稿进度 · [批量线稿] [确认本集]                 │
│       （无「全部关键帧」主按钮；需要时「去导演台批出」）                │
└───────────────────────────────────────────────────────────────────┘
```

### 4.4.3 主用户旅程（改造后）

1. 编剧台确认成稿 → 连线到分镜台（或管线自动边）
2. 开台 → **拆镜** Tab →「从成稿拆镜」→ 写入本地 `scriptBreakdown` + 投影 `storyboard.shots`
3. **镜表** Tab：改景别/运镜/提示词；@绑定角色与场景（对齐素材库 id）
4. **构图** Tab：批量线稿确认站位与机位；个别镜「试出图」抽检
5. **交接** Tab：清单全绿 →「确认本集」→ CTA「打开导演台」进入功能 2 批出

### 4.4.4 废弃 / 降级旅程

```
旧主路径：剧本拆分拆镜 → 分镜台「同步」→ 本台「全部关键帧」
新主路径：编剧台成稿 → 分镜台「从成稿拆镜」→ 构图确认 → 导演台批出
迁移路径：旧 scriptBreakdown 上游 → 「导入旧镜表」一次性拷贝（可提示建议重拆）
```

---

## 4.5 UI 规格（在现行分镜台上升级 · 对齐画布 Desk）

### 4.5.1 目录与文案

| 项 | 现行 | 升级后 |
|----|------|--------|
| label | 分镜台 | 分镜台（不变） |
| hint | 分镜表 + 关键帧预览出图 | 成稿拆镜 · 镜表编辑 · 构图确认 |
| Modal 标题 | 分镜台 | 分镜台 · 拆镜与构图 |
| 空态 | 连接剧本拆分 | 连接编剧台成稿（或导入旧镜表） |
| 主批出文案 | 全部关键帧 | 移除主 CTA；改「试出图」+「去导演台批出」 |

### 4.5.2 交互壳（硬约束）

| 项 | 规格 |
|----|------|
| 壳 | `ScreenModal` + 画布摘要卡；`attached-workspace` 保持 `attachToNode: false` |
| 底栏工作区 | 不作为主编辑面；可保留兼容 preview 附着，但主路径进 Modal |
| CSS | 继续 `--sg-*` ← `--desk-*`；与功能 2/3 desk 族一致；禁止第二套荧光 HUD |
| 宽度 | 建议升至 ~1120；左栏约 240–280px |
| 分集 | **取消独立「分集」主 Tab**；并入顶栏分集切换 + 交接清单中的分集状态 |

### 4.5.3 视觉升级细则

1. **摘要卡**：对齐功能 3 编剧台 / 功能 2 导演台升级卡（眉题 + 主标题 + 左媒 + 进度 + 双 CTA）。
2. **模式 Tab**：四态文字清晰；当前态用 `desk-accent` 底线，不用彩色胶囊堆。
3. **左镜列**：状态点三色——未编辑 / 已构图 / 已试出；选中行 `accent-soft`。
4. **批处理条瘦身**：顶栏最多保留「批量线稿」「可见试出」；删除与底栏重复的五钮阵列。
5. **交接页**：清单式（非又一张宫格）；主按钮唯「确认本集」。

### 4.5.4 模式文案

| Tab | 用途 |
|-----|------|
| 拆镜 | 成稿输入、拆镜参数、执行/重拆/导入旧表、诊断 |
| 镜表 | 宫格/列表编辑、绑定、提示词 |
| 构图 | 线稿 + 有限试出图 + 评分抽检 |
| 交接 | 就绪检查、确认本集、深链导演台 |

---

## 4.6 功能清单

### P0（必须与功能 3 拆镜切断同发或紧随）

| ID | 功能 | 状态 | 说明 |
|----|------|------|------|
| SB-P0-01 | 上游探测 `ScreenplayPackage` | `[新增]` | 边入边扫 `type==='screenplay-package'` 或节点 `data.package.status==='confirmed'` |
| SB-P0-02 | 「从成稿拆镜」 | `[新增]` | 调用 `runProductionScriptBreakdown`（或等价），**结果写入本节点** `scriptBreakdown`，不写回编剧台 |
| SB-P0-03 | 切断「同步」主路径文案 | `[改造]` | `sync()` 保留为「导入旧镜表」；默认 CTA 不再是同步 |
| SB-P0-04 | 摘要卡 / Modal 壳升级 | `[改造]` | 见 4.4 / 4.5；仍 ScreenModal |
| SB-P0-05 | 去掉独立分集 Tab | `[改造]` | 能力并入顶栏 + 交接 |
| SB-P0-06 | 批量条瘦身 | `[改造]` | 线稿主批；关键帧「全部」降级/移除主入口 |
| SB-P0-07 | 确认本集 → 交接语义 | `[改造]` | 确认后 emits meta 供导演台；CTA 打开导演台 |
| SB-P0-08 | 目录 hint / attached note | `[改造]` | 对齐新定位 |
| SB-P0-09 | 投影工作区 shots | `[存量加固]` | 拆镜成功与镜编辑保存均走统一 `apply` + `bindStoryboardShotAssets` |

### P1

| ID | 功能 | 状态 | 说明 |
|----|------|------|------|
| SB-P1-01 | 拆镜诊断面板 | `[新增]` | 空对白、超长镜、未绑定角色/场、漏场 |
| SB-P1-02 | 增量补拆 | `[新增]` | 按场/按选中段落补镜，合并进现表（冲突策略可确认） |
| SB-P1-03 | 增镜 / 合镜 / 拆镜 | `[新增]` | 手工结构调整 |
| SB-P1-04 | 构图覆盖率算法展示 | `[新增]` | 见 4.8 |
| SB-P1-05 | Rail / StoryboardPanel 收口 | `[改造]` | 主 CTA「打开分镜台」；隐藏重复批出 |
| SB-P1-06 | 试出图配额提示 | `[新增]` | 如「本集试出建议 ≤ N 镜，完整批出去导演台」 |
| SB-P1-07 | 与素材库绑定健康度 | `[改造]` | 镜角色名 ↔ 库 id；未入库标黄并一键开库 |

### P2

| ID | 功能 | 状态 | 说明 |
|----|------|------|------|
| SB-P2-01 | 多集批量拆镜队列 | `[新增]` | 按集串行，可暂停 |
| SB-P2-02 | 构图模板 / 参考板约束 | `[新增]` | 读 `reference-board` 风格锁到线稿提示词 |
| SB-P2-03 | 旧工程一键「建议重拆」向导 | `[改造]` | 有 legacy 表时引导 |
| SB-P2-04 | 预览工作区能力裁剪开关 | `[改造]` | Modal 构图态默认隐藏导演级批出入口 |

---

## 4.7 逻辑（状态机与数据流）

### 4.7.1 节点 data 契约（目标）

```ts
// storyboard-desk node.data（关键字段）
{
  status: 'idle' | 'running' | 'success' | 'error',
  content?: string,
  output?: string,

  /** 镜表 SSOT */
  scriptBreakdown?: ScriptBreakdownPayload,

  /** 构图/试出派生 */
  storyboardPreview?: StoryboardPreviewPayload,

  /** 本集确认 */
  confirmedEpisodeIds?: string[],
  gridConfirmed?: boolean,       // 兼容旧字段；语义=至少一集已确认
  confirmedAt?: string,

  /** 拆镜运行态 */
  breakdownJob?: {
    phase: 'idle' | 'running' | 'done' | 'error',
    sourcePackageId?: string,
    sourcePackageHash?: string,  // 成稿变更检测
    startedAt?: string,
    error?: string,
  },

  /** 可选：上次拆镜使用的配置快照 */
  breakdownConfig?: ScriptBreakdownConfig,
}
```

### 4.7.2 上游解析优先级

```
1. 已连接 script-desk 且 package.status === 'confirmed' → 可拆镜
2. 已连接旧节点且仅有 scriptBreakdown / legacyScriptBreakdown → 可「导入旧表」
3. 仅有设定检查边、无成稿 → 可编辑已有本地表；拆镜 CTA 禁用并提示先接编剧台
4. 本地已有 scriptBreakdown → 开台可直接进镜表；成稿 hash 变化时提示「成稿已更新，是否重拆」
```

### 4.7.3 从成稿拆镜（主路径）

```
guard: package.confirmed
→ set breakdownJob.running
→ 组装 productionScriptBreakdown 请求：
     正文 = package 成稿（多集拼接规则与旧 runner 对齐）
     约束 = package.bible drafts（人物/场景名、禁止漂移提示）
     + 节点 breakdownConfig
→ API 成功
→ normalize prompts
→ applyScriptBreakdownPayload(blockId, payload)
   （内含：写节点 scriptBreakdown、投影 storyboard.shots、可选候选角色/场景——
     注意：功能 3 后默认不自动入库；候选只作绑定提示，入库走素材库）
→ 初始化/对齐 storyboardPreview.frames 骨架
→ breakdownJob.done
→ 切换到「镜表」Tab
```

**重拆策略（P0 最小）**：整集覆盖本地镜表前二次确认；已确认集默认保护（需显式勾选「含已确认集」）。

### 4.7.4 导入旧镜表（迁移）

```
upstream.scriptBreakdown → clone → applyScriptBreakdownPayload
提示：建议改为从编剧台成稿重拆以获得与 Bible 对齐的镜表
```

### 4.7.5 镜编辑与投影

- 单镜保存：`patchShotInPayload` → `applyScriptBreakdownPayload`（保持现逻辑，避免只改本地 state 不同步工作区）
- 绑定：`bindStoryboardShotAssets` 在 apply / 确认前执行
- **禁止**：只改 `storyboardPreview.frames` 却不回写 breakdown 的 `storyboardImageUrl` 类字段（现有 `writeBackBreakdownPreviewImage` 路径保留并单测）

### 4.7.6 构图批处理

| 动作 | 允许 | 说明 |
|------|------|------|
| 单镜线稿 / 可见批量线稿 | ✅ 主路径 | 需连接 picture-gen |
| 单镜试出关键帧 / 缺图补试出 | ✅ 次路径 | UI 文案用「试出」 |
| 全部镜头批量关键帧 | ❌ 主 CTA 移除 | P0 改为「去导演台批出」；内部函数可保留供迁移期隐藏入口 |

### 4.7.7 确认本集状态机

```
本集有 ≥1 镜
且（P0）无硬阻断错误
→ enable「确认本集」
→ 写入 confirmedEpisodeIds
→ emit meta:
   { type: 'storyboard-episode-ready', episodeId, shotCount, compositionCoverage, deskId }
→ 交接 Tab 显示「打开导演台」
```

硬阻断（P0 建议）：镜数为 0。  
软警告（不阻断，清单标黄）：构图覆盖 &lt; 阈值、未绑定角色、无 picture-gen 连接（不影响确认，但影响构图）。

### 4.7.8 flow-runner

- `storyboard-desk`：若需批量跑，P0 可定义为「若有 confirmed package 且无本地表 → 拆镜」；**不要**在 flow 里默认全量关键帧批出。
- 与导演台 flow 职责分离。

---

## 4.8 算法

### 4.8.1 构图覆盖率

```
compositionCoverage = counted / totalShotsInEpisode

counted = 镜满足任一：
  - 有线稿图（sketch / line-art frame）
  - 或用户标记「构图已确认」（P1 字段；P0 可用「有线稿或有试出图」近似）

展示：摘要卡与交接清单百分比；阈值默认 0.6 为软警告（可配置）
```

### 4.8.2 成稿变更检测

```
sourcePackageHash = hash(stableStringify({
  packageId, updatedAt | confirmedAt, episodeTexts
}))
若本地 breakdownJob.sourcePackageHash !== 当前 hash → UI「成稿已更新」
```

### 4.8.3 拆镜请求组装（复用存量）

优先复用 `script-breakdown-runner` 内已有：

- 多集正文拼接
- `normalizeScriptBreakdownConfig` / `normalizeScriptBreakdownPrompts`
- `storyboardShotsFromScriptBreakdown` + `bindStoryboardShotAssets`

增量（P0）：从 `ScreenplayPackage` 映射为 runner 所需 `sourceText` + 角色/场景名列表（来自 bible drafts），**不**再要求上游节点带 `scriptBreakdown`。

### 4.8.4 试出图配额（P1）

```
suggestedTrialCap = min(6, max(2, ceil(episodeShotCount * 0.2)))
超过仍允许，但 toast / 交接页提示完整批出去导演台
```

### 4.8.5 左栏排序 / 筛选

- 默认故事序
- 筛选：`uncomposed` / `unbound` / `all`
- 绑定判定：characters/scene 能 resolve 到库 id 或环境 id

---

## 4.9 集成

### 4.9.1 模块集成图

```
script-desk.package (confirmed)
        │
        ▼
StoryboardDeskBlock ──▶ runProductionScriptBreakdown (调用权在本台)
        │
        ├─▶ data.scriptBreakdown (SSOT)
        ├─▶ workspace.storyboard.shots (投影)
        ├─▶ storyboardPreview.frames (构图派生)
        │
        ├─▶ picture-gen（线稿/试出）
        └─▶ director-desk（确认后批出）
```

### 4.9.2 与功能 3 编剧台

| 项 | 约定 |
|----|------|
| 输入 | `ScreenplayPackage` confirmed |
| 输出 | 不写回 package；不在编剧台显示镜列表 |
| 迁移 | 旧 `legacyScriptBreakdown` 仅可导入 |

### 4.9.3 与功能 2 导演台

| 项 | 约定 |
|----|------|
| 导演台读 | 工作区 / 连线 shots；优先已确认集 |
| 分镜台不内嵌 | 批出队列、3D 舞台沉浸（可读 guide 只读徽章即可） |
| 深链 | 交接 Tab「打开导演台」聚焦对应 desk 节点或 spawn |

### 4.9.4 与素材库 / 设定检查

- 拆镜后的人物/场景 **默认不自动入库**（与功能 3 一致）；清单提供「去素材库补全」
- 镜级 @引用使用现有 `AssetMentionInput`
- 设定检查可继续消费 bible；分镜台消费库内就绪资产做绑定

### 4.9.5 与智能剪辑（功能 1）

- 不直接依赖；剪辑消费导演台/成片后再导入时间线
- 分镜台不生成 `TimelinePayload`

### 4.9.6 ScreenModal 与其它弹窗

| 节点 | 本功能是否改其弹窗 |
|------|-------------------|
| 分镜台（本节点） | **升级**（本章授权） |
| 编剧台 / 导演台 / 设定检查 / 连贯性检查 | **不改弹窗壳**；仅数据交接与深链 CTA |

### 4.9.7 Rail / 双轨收口

| 阶段 | 动作 |
|------|------|
| P0 | Rail 文案改为打开分镜台；StoryboardPanel 顶部加「在分镜台编辑」横幅 |
| P1 | 隐藏 Panel 内与本台重复的批量线稿/关键帧主按钮；保留只读或精简 |
| P2 | 评估删除 Panel 重编辑能力，仅留导航 |

---

## 4.10 数据与持久化

| 数据 | 位置 |
|------|------|
| 镜表 | 节点 `data.scriptBreakdown` |
| 构图帧 | 节点 `data.storyboardPreview` |
| 确认集 | `confirmedEpisodeIds` |
| 下游投影 | `useWorkspaceDocument.storyboard` |
| 拆镜作业 | `breakdownJob` |
| 成稿 | 仅存引用 id/hash，不拷贝全文进分镜台（正文临时组装请求即可；若离线重拆需要可缓存 `sourceSnapshot` `[存疑：体积]`） |

---

## 4.11 分阶段实现计划

### 阶段 P0（与功能 3 P0 桥对齐）

1. 上游 package 探测 +「从成稿拆镜」接入 `script-breakdown-runner`  
2. 「同步」降级为「导入旧镜表」；摘要卡/空态文案替换  
3. Modal IA：四模式骨架 + 去掉分集 Tab + 批条瘦身 + 底栏去「全部关键帧」主钮  
4. 确认本集 meta +「去导演台」CTA  
5. catalog / attached-workspace note / 简单测例  

### 阶段 P1

1. 诊断、增量补拆、手工增合拆  
2. 构图覆盖率与试出配额  
3. Rail / Panel 收口  
4. 绑定健康度  

### 阶段 P2

多集队列、参考板约束、旧工程向导、预览能力裁剪。

**依赖**：功能 3 至少提供 confirmed package 可读；功能 2 可后于 P0，但「去导演台」在导演台未合并前可深链现有 `director-desk`。

---

## 4.12 验收标准

| ID | 条件 |
|----|------|
| AC-1 | 无上游 `scriptBreakdown`、仅有编剧台 confirmed package 时，能完成拆镜并得到可编辑镜表 |
| AC-2 | 拆镜结果写入分镜台节点，**编剧台节点不出现新镜列表** |
| AC-3 | 旧工程「导入旧镜表」仍可用，且文案标明迁移路径 |
| AC-4 | UI 无独立「分集」主 Tab；分集切换仍可用 |
| AC-5 | 主界面不存在「全部关键帧」作为主 CTA；完整批出引导至导演台 |
| AC-6 | 批量线稿（可见）仍可用（在已连 picture-gen 时） |
| AC-7 | 确认本集后下游可感知就绪（meta 或 confirmedEpisodeIds） |
| AC-8 | 镜编辑保存后工作区 `storyboard.shots` 与节点镜表一致 |
| AC-9 | `--desk-*` / `--sg-*` 视觉与 desk 族一致；其它 ScreenModal 壳未被改动 |
| AC-10 | flow 默认不触发整集关键帧批出 |

---

## 4.13 风险、存疑与八荣八耻自检

| 项 | 说明 |
|----|------|
| 主链空窗 | 功能 3 先切断拆镜而本台 P0 未上 → 漫剧断链；**必须同发或本台先行桥** |
| 用户习惯 | 「分镜台出完全部关键帧」习惯被打破；需交接页说清导演台分工 |
| 三处数据 | 若 apply 路径不统一，漂移依旧；P0 必须收敛写入口 |
| Rail 双轨 | 只改弹窗不收 Panel → 问题复发；P1 必收口 |
| `[存疑]` 重拆是否保留手改镜 | 默认保护已确认集；手改未确认集覆盖策略需产品确认 |
| `[存疑]` 拆镜是否写候选入库 | 默认否；与功能 3 一致 |
| `[存疑]` sourceSnapshot 是否落盘 | 体积 vs 离线重拆 |
| 以臆猜为耻 | 上游字段、runner、批出重叠均来自现码；边界来自功能 2/3 与用户对齐 |
| 以复用为荣 | 复用 ScreenModal、desk 色板、breakdown runner、ShotStoryCell、PreviewWorkspace |
| 以乱改架构为耻 | 不吞编剧/导演/素材库；其它弹窗冻结 |
| 以分步为荣 | P0 主链桥 + IA 瘦身 → P1 诊断与收口 → P2 增强 |

---

## 4.14 关键文件清单（实现时对照）

**改造**

- `apps/web/src/blocks/craft/StoryboardDeskBlock.tsx`
- `apps/web/src/blocks/craft/storyboard-desk.css`
- `apps/web/src/engine/script-breakdown-runner.ts`（调用方与 package→请求映射）
- `apps/web/src/engine/storyboard-preview-runner.ts`（如需试出配额）
- `packages/shared/src/catalog/block-catalog.ts`
- `packages/shared/src/catalog/attached-workspace.ts`
- `packages/shared/src/catalog/socket-registry.ts`（若 meta 声明需扩）
- `apps/web/src/engine/flow-runner.ts`
- `apps/web/src/engine/core-pipeline-graph.ts` / ModuleDock / playbook 文案
- `apps/web/src/panels/StoryboardPanel.tsx`（P1 收口）
- `apps/web/src/engine/stage-deck/chrome/rail/StoryboardRailPanel.tsx`
- `apps/web/src/blocks/nx9/DialogueSheetBlock.tsx` / 编剧台（仅交接 CTA，不改其壳之外的授权范围外大改）

**新增（建议）**

- `apps/web/src/engine/storyboard-desk-runner.ts`（拆镜编排、hash、确认 meta、覆盖率）
- `packages/shared`：`screenplayPackageToBreakdownRequest` 映射工具（可与功能 3 类型同包）

**测试**

- package confirmed → 拆镜 → 节点有表、编剧台无表  
- 导入旧表  
- 线稿批出仍通  
- 确认本集 meta  
- 无「全部关键帧」主 CTA  
- 其它弹窗节点无 diff  

---

## 4.15 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-21 | 首版追加：分镜台改造（接管拆镜、构图确认定位、与导演台分工、UI 升级、IA 四模式、双轨收口） |
| 2026-07-21 | 追加 §4.16：内部提示词双层约定（详功能 8） |

---

## 4.16 勘误补丁（内部提示词双层 · 2026-07-21）

> **详章**：功能 8。§4.8.3 复用 `normalizeScriptBreakdownPrompts` 仍然有效。

| 层 | 内容 | 谁改 | UI |
|----|------|------|-----|
| **A. 内部 System** | 拆镜 Agent：`episodePlannerSystem`（若仍用）/ `episodeBreakdownSystem`；**随拆镜调用权迁入本台** | 开发者 / Dev Pack | Dev-only「提示词」面；复用存量 `ScriptBreakdownPromptTemplates` + 导入导出包 |
| **B. 生产镜级 prompt** | `imagePrompt` / `videoPrompt` / `sketchPrompt` / `negativePrompt` | **用户常态** | 镜表编辑（产品主路径） |
| **C. 拼装模板** | `buildLineArtShotPrompt` 等 | 代码常量；可选全局 Dev 覆盖 | **不**单独开整页编辑器 |

**禁止**：把 A/B 混在同一编辑器；禁止正式用户默认看到 A。

---

# 功能 5 · 素材就绪门禁（素材库 + `asset-gate`）

- **状态**：设计定稿待实现（2026-07-21）· **主链缺口专章**
- **产品柱**：AI 漫剧资产就绪（叙事 draft → 制作级资产 → 放行下游）
- **模块**：
  - **素材库**：`AssetLibraryModal` + `backlotWorkspace` / `characters` / `environments`（**非画布节点**，全局 SSOT UI）
  - **设定检查**：画布节点 `asset-gate`（ScreenModal 弹窗族）
- **交互壳约束**：
  - `asset-gate`：继续 **摘要卡 + ScreenModal**；本章授权对其 **UI 升级**（对齐编剧台/分镜台 desk 族）；**禁止**压成 Prompt Bar
  - 素材库：继续独立 Modal；视觉升级吃 `--desk-*`；**禁止**借机改其它弹窗节点壳
- **上游**：功能 3 `ScreenplayPackage.bible` drafts（主）；迁移期兼容旧 `scriptBreakdown` 角色/场景列表
- **下游**：放行后供分镜台绑定、导演台锁参考、clip-gen 身份锁定
- **相关存量**：`AssetGateBlock` / `asset-gate.css` / `asset-gate-runner.ts`、`AssetLibraryModal`、`script-asset-candidates.ts`

---

## 5.1 背景与目标

### 问题（查档）

| 问题 | 事实 |
|------|------|
| 输入过时 | `AssetGateBlock` 仅 `useUpstreamBreakdown` 读 `scriptBreakdown`；功能 3 后编剧台不再产镜表 |
| 入库过猛 | `syncBreakdownAssets` 默认把缺失角色/场景写入工作区（`applyScriptBreakdownPayload(..., { syncAssets: true })`），与「Bible draft 默认不自动入库」冲突 |
| 双 SSOT 叙事 | 库（制作级）与 draft（叙事级）交接未产品化；素材库已是角色/场景主入口，门禁仍像「拆分结果同步器」 |
| 文案陈旧 | 错误提示仍写「请先连接剧本拆分节点」 |
| UI | 已有 desk 色板与摘要卡，但相对功能 3/4 的升级台偏旧：缺「剧本支撑」面板、缺打开素材库深链、缺放行 meta |

### 目标（一句话）

把 **设定检查** 升级为「对照编剧台 Bible / 分镜需求 ↔ 素材库」的**放行台**；把 **素材库** 明确为制作级角色/场景 SSOT，并承接 draft 的完善与参考图锁定。

### 非目标

- 不在门禁内做完整角色三视图工坊（工坊在库内 / picture-gen）
- 不替代分镜台拆镜、导演台批出
- 不把素材库改回画布 `character-sheet` / `scene-card` 节点

---

## 5.2 现状盘点（查档结果）

| 资产 | 路径 | 现状 |
|------|------|------|
| 门禁 UI | `apps/web/src/blocks/craft/AssetGateBlock.tsx` | 摘要卡 + ScreenModal；Tab：overview / characters / scenes；`runCheck`→`syncBreakdownAssets` |
| 样式 | `asset-gate.css` | `--ag-*` ← `--desk-*` |
| Runner | `asset-gate-runner.ts` | `inspectBreakdownAssets` / `syncBreakdownAssets` |
| 素材库 | `AssetLibraryModal.tsx` + `asset-library/*` | 角色/场景等 kind；场景已与 `EnvironmentProfile` 同步 |
| 目录 | `block-catalog` | label「设定检查」 |
| 附着 | `attached-workspace` | `attachToNode: false`，自有 ScreenModal |
| Socket | accepts/emits `prompt`/`meta` | |

---

## 5.3 产品定位

```
编剧台 Bible draft ──只读──▶ 设定检查（对照 + 可选入库）
                                │ 缺口 CTA
                                ▼
                           素材库（制作 SSOT：参考图/锁定字段）
                                │ 放行 meta
                                ▼
                     分镜台绑定 / 导演台锁 / clip-gen 身份
```

| 层 | 谁 | 写什么 |
|----|----|--------|
| 叙事 draft | 编剧台 | 人设/场景文字、关系、禁忌漂移 |
| 门禁 | 设定检查 | 缺口报告、放行状态、**显式**同步候选 |
| 制作资产 | 素材库 | 参考图、多视图、Environment 多图、锁定提示词 |

---

## 5.4 原型（必须相对现行设定检查 / 库 UI 升级）

### 5.4.1 设定检查 · 画布摘要卡（升级）

```
┌─────────────────────────────────────────────┐
│  ▌设定检查                      · 未放行    │
│  资产门禁工作台                               │
│  ┌──────┐  角色 12 · 缺 2                   │
│  │盾牌/ │  场景  8 · 缺 1                   │
│  │进度  │  ████████░░  就绪 82%             │
│  └──────┘  源：编剧台成稿 · Bible            │
│  [检查]                      [开台]          │
└─────────────────────────────────────────────┘
```

空态：「连接编剧台（或分镜台）」；不再写「剧本拆分」。

### 5.4.2 设定检查 · ScreenModal（升级 · 对齐 desk 族）

在现行三 Tab 上升级为四区（仍 ScreenModal，宽建议 ~1040）：

```
┌─ ScreenModal · 设定检查 ───────────────────────────────┐
│ [总览] [角色] [场景] [剧本支撑]                         │
│ 左：缺口列表    右：详情 + [在素材库打开] [补候选入库]   │
│ 底栏：[仅检查不入库] [放行] [打开素材库]                 │
└────────────────────────────────────────────────────────┘
```

**相对现行升级点**：

1. 摘要卡进度条 + 源徽章（Bible / 旧镜表）
2. 「剧本支撑」Tab：只读展示 draft 原文要点（身份/外观/禁忌）
3. 每行「在素材库打开」深链（kind+query）
4. **默认检查不入库**；「补候选入库」二次确认（对齐 O-13）
5. 「放行」写 `assetGate.passed` + emit meta，供下游

### 5.4.3 素材库（升级要点，非新壳）

| 项 | 升级 |
|----|------|
| 角色/场景详情 | 显式「来自编剧台 draft」只读块 +「采用到资产字段」 |
| 入口文案 | 继续强调主入口；Rail/门禁 CTA 统一「打开素材库」 |
| 视觉 | 头栏/侧栏/表单对齐 `--desk-*`（与弹窗 desk 同族，避免第三套灰白后台风） |

---

## 5.5 UI 规格

| 项 | 规格 |
|----|------|
| 门禁壳 | ScreenModal + 摘要卡；`ag-*` token 保持映射 desk |
| 主按钮 | 「检查」≠「入库」；「放行」独立 |
| 目录 hint | 「Bible/镜需求对照 · 缺口补齐 · 放行」 |
| 其它弹窗 | 编剧台/分镜台/导演台：**本任务不改其壳**（各有专章） |

---

## 5.6 功能清单

### P0

| ID | 功能 | 状态 |
|----|------|------|
| AG-P0-01 | 上游改读 `ScreenplayPackage.bible`（+ 可选分镜台镜级角色/场名） | `[改造]` |
| AG-P0-02 | `inspect` 与 `sync` 分离；默认检查不写库 | `[改造]` |
| AG-P0-03 | 摘要卡/文案去「剧本拆分」 | `[改造]` |
| AG-P0-04 | Modal 升级：剧本支撑 + 开库深链 + 放行 | `[改造]` |
| AG-P0-05 | 放行 meta：`type:'asset-gate-passed'` | `[新增]` |
| AG-P0-06 | 素材库详情挂 draft 支撑块 | `[改造]` |

### P1

| ID | 功能 | 状态 |
|----|------|------|
| AG-P1-01 | 健康度：无参考图 / 无一致性提示词标黄 | `[新增]` |
| AG-P1-02 | 批量「采用 draft 字段」到已有库条目（不覆盖参考图） | `[新增]` |
| AG-P1-03 | 未放行时分镜台/导演台警告条（软门禁） | `[改造]` |

### P2

| ID | 功能 | 状态 |
|----|------|------|
| AG-P2-01 | 硬门禁开关（可配置阻断拆镜/批出） | `[存疑]` 见 O-14 |
| AG-P2-02 | 服装/道具 kind 纳入门禁 | `[新增]` |

---

## 5.7 逻辑

### 5.7.1 需求名解析优先级

```
1. 上游 script-desk.package.bible.characters[].name / scenes[].name|code
2. 若连分镜台：本地 scriptBreakdown 镜级 characters/scene（补漏）
3. 迁移：旧 scriptBreakdown.characters / episodes.scenes
```

### 5.7.2 检查 vs 入库

```
inspect(names) → missing* / required* / passedPreview
sync(names, { mode: 'explicit' }) → 仅对勾选或「同步全部缺口」写入
gate.release() → assetGate.passed=true, checkedAt, emit meta
```

**废除默认路径**：打开检查即 `syncBreakdownAssets` 全量入库。

### 5.7.3 匹配算法（存量加固）

- 角色：name / nickname / aliases（现 `characterKeys`）
- 场景：name / sceneCode / backlot label
- 规范化：trim、全半角、大小写折叠（P1）

---

## 5.8 算法 · 就绪率

```
readyRate = (required - missingHealthy) / max(required, 1)
missingHealthy = 名称缺失 ∪（P1：有名但无参考图且策略要求图）
```

摘要卡与总览展示 `readyRate`。

---

## 5.9 集成

| 模块 | 动作 |
|------|------|
| `asset-gate-runner.ts` | 新增 `inspectScreenplayBible` / `syncBibleDraftsExplicit` |
| 功能 3 | draft 只读输入 |
| 功能 4 | 绑定前可读放行态（软警告） |
| 功能 2 | 角色/场景锁参考读库 |
| `AssetLibraryModal` | draft 支撑 + 深链落地 |
| flow-runner | asset-gate：默认 inspect；sync 需 flag |

---

## 5.10 数据契约

```ts
data.assetGate = {
  source: 'bible' | 'breakdown' | 'mixed',
  requiredCharacters: string[],
  requiredScenes: string[],
  missingCharacters: string[],
  missingScenes: string[],
  syncedCharacters?: number,
  syncedScenes?: number,
  passed: boolean,
  checkedAt?: string,
  autoSync: false, // 默认 false
}
```

---

## 5.11 分期与验收

**P0**：Bible 输入、检查/入库分离、UI 升级、放行 meta、开库深链、文案。  
**P1**：健康度、批量采用、下游警告条。

| AC | 条件 |
|----|------|
| AC-1 | 仅连编剧台 confirmed+bible 时可检查出缺口 |
| AC-2 | 默认检查不新增库条目 |
| AC-3 | 显式同步后库中出现候选且可开库编辑 |
| AC-4 | 放行后 meta/节点态可被下游读取 |
| AC-5 | UI 为 desk 族；其它 ScreenModal 壳无无关 diff |

---

## 5.12 风险与存疑

见总览 O-13、O-14。另：旧工程依赖「检查即入库」——迁移提示一次。

---

## 5.13 关键文件

- `AssetGateBlock.tsx` / `asset-gate.css` / `asset-gate-runner.ts`
- `AssetLibraryModal.tsx` / `asset-library/*`
- `block-catalog` / `flow-runner` / playbook 文案
- 功能 3/4 交接 CTA

## 5.14 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-21 | 首版：主链缺口 · 素材库 + 设定检查 |
| 2026-07-21 | 指针：无产品级 system 窗；可选 extractAssets system 归功能 8 全局 Dev 覆盖 |

---

# 功能 6 · 视频生成主链强化（`clip-gen`）

- **状态**：设计定稿待实现（2026-07-21）· **主链缺口专章**
- **产品柱**：AI 漫剧 · 关键帧→镜头视频
- **节点 kind**：保持 `clip-gen`（**不新建 kind**）；hint 升级为「单镜/续拍 · 本集批出 · 回写镜头」
- **交互壳约束**：**不是** ScreenModal；保持 `attached-workspace` generation + 画布紧凑卡（见 `attached-workspace.ts`）。本章升级**卡片与附着区视觉/信息架构**至 desk 语言；**禁止**改成弹窗台；**禁止**借机改 ScreenModal 节点。
- **上游**：导演台送出 / 工作区 `shots[].firstFrameAssetId` + `videoPrompt*`；可选 picture/sound 边
- **下游**：镜头 `clip` URL → 智能剪辑 / export-pack
- **相关存量**：`ClipGenBlock.tsx`、`director-desk-runner` 送视频、`pollClipTask`、`buildStudioVideoPrompt`

---

## 6.1 背景与目标

### 问题

| 问题 | 事实 |
|------|------|
| 主链批出弱 | UI 以单节点单镜为主；`chain/motion` 已下线；整集批视频依赖人工逐点 |
| 与导演台交接薄 | runner 有「写到 clip-gen」逻辑，节点卡未产品化「本集队列」 |
| 回写不清 | 出片后与 `shot` 成片字段 / 时间线导入契约未专章固定 |
| 视觉 | 通用 gen 卡，未对齐 desk 摘要信息密度 |

### 目标

强化 `clip-gen` 为导演台之后的**镜头视频执行器**：单镜、Bridge 续拍、**本集队列批出**、成功回写 shot；视觉升级但不改壳类型。

### 非目标

- 不做第二套导演台 / 不分镜
- 不把整集工业级关键帧搬回本节点
- 不改为 ScreenModal

---

## 6.2 现状盘点

| 资产 | 现状 |
|------|------|
| `ClipGenBlock` | 模式 single/bridge；模型/画幅/时长；上游 prompt/图；`api`+`pollClipTask` |
| 导演台 | `push` 类逻辑写 `linkedShotId` + refs |
| 迁移 | motion-story / seedance-chain / … → `clip-gen` |
| 附着 | `workspaceType: 'generation'`，`attachToNode: true` |

---

## 6.3 产品定位

```
导演台（关键帧已审）──送出 / 边──▶ clip-gen（队列批出视频）──▶ 智能剪辑
```

| 模式 | 用途 |
|------|------|
| single | 当前 linkedShot 一键出片 |
| bridge | 续拍（存量 bridgeRefs） |
| episode-queue（新） | 本集已通过关键帧且缺视频的镜串行/有限并发 |

---

## 6.4 原型与 UI（升级画布卡 · desk 语言）

**不**做编剧台式 ScreenModal；升级为 desk 信息卡 + 原有底部 generation 附着：

```
┌─ clip-gen 卡 ───────────────────────────────┐
│ ▌视频生成 · 本集执行器                       │
│ 当前镜 #12 · 有关键帧 · 模型 veo               │
│ 队列 3/18 · 成功 14 · 失败 1                 │
│ [单镜出片] [批出本集缺片] [打开附着设置]      │
└─────────────────────────────────────────────┘
```

附着区升级：镜头选择器（来自已确认集）、参考图预览、提示词（@角色）、队列列表迷你表。

视觉：边框/字阶/进度条用 `--desk-*`；与 gen 节点可共用 `GenSettingsPills` 但外壳去「杂乱多 pill」。

---

## 6.5 功能清单

### P0

| ID | 功能 | 状态 |
|----|------|------|
| CG-P0-01 | 卡片信息升级 + desk 样式 | `[改造]` |
| CG-P0-02 | 明确消费 `firstFrameAssetId` / directorDeskRefs | `[存量加固]` |
| CG-P0-03 | 成功回写 shot 视频字段（见 6.7） | `[改造]` |
| CG-P0-04 | 导演台「送出」深链聚焦本节点 | `[改造]` |
| CG-P0-05 | 目录 hint 文案 | `[改造]` |

### P1

| ID | 功能 | 状态 |
|----|------|------|
| CG-P1-01 | episode-queue 批出（跳过已有视频/未过审关键帧） | `[新增]` |
| CG-P1-02 | 失败重试 / 并发上限 | `[新增]` |
| CG-P1-03 | 批完提示「去智能剪辑」 | `[新增]` |

### P2

| ID | 功能 | 状态 |
|----|------|------|
| CG-P2-01 | 音画对齐（sound-gen 上游）增强 | `[改造]` |
| CG-P2-02 | S-Class 多参考校验 UX | `[存量加固]` |

---

## 6.6 逻辑与状态机

```
idle → running(single|queue) → success|error
queue: for shot in eligible:
  guard: firstFrameAssetId && keyframe approved? (可配置)
  build prompt (buildStudioVideoPrompt + enrich)
  submit + poll
  writeback shot.clip / videoAssetId
```

**eligible（默认）**：当前 `activeEpisodeId` 集内；有关键帧；无视频或失败；可选「仅已确认集」。

---

## 6.7 数据契约

```ts
// node.data 增量
{
  videoMode: 'single' | 'bridge' | 'episode-queue',
  linkedShotId?: string,
  directorDeskRefs?: string[],
  queue?: { shotId: string, status: string, error?: string }[],
  videoUrl?: string,
  taskId?: string,
}

// shot 回写（字段名以实现时 shared 类型为准，P0 需查档对齐现有 StoryboardShot）
shot.videoAssetId | shot.clipUrl | 等价字段 = 成功 url
```

> 以查档为荣：实现前核对 `StoryboardShot` 现有视频字段，**禁止臆造第二字段**；若仅有松散 url，则规范化到单一字段并迁移。

---

## 6.8 算法

- 提示词组装：复用 `buildStudioVideoPrompt` + `enrichPromptWithCharacters` + guide overlay（存量）
- 批出顺序：故事序；失败不阻断后续（记 queue）
- 跳过：已有成功视频（与导演台 skipExisting 同族）

---

## 6.9 集成

| 方 | 关系 |
|----|------|
| 功能 2 | 送出写 linkedShot / refs；批出关键帧主权仍在导演台 |
| 功能 1 | 从 shots 视频建时间线 |
| 功能 7 | 可收 clips 边或读 shots |
| picture-gen | 仅作参考图上游，不替代关键帧主路径 |

---

## 6.10 分期 · 验收 · 风险

P0：卡升级、回写、导演深链。P1：本集队列。  

| AC | 条件 |
|----|------|
| AC-1 | 有关键帧的 linkedShot 可单镜出片并回写 |
| AC-2 | 导演台送出后本卡显示正确镜与参考 |
| AC-3 | P1：一本集缺片可批出且跳过已有 |
| AC-4 | 未改为 ScreenModal；其它弹窗无无关 diff |

风险：供应商配额与长时 poll；O-15 确认不新 kind。

## 6.11 关键文件

- `ClipGenBlock.tsx`、generation 附着样式、`director-desk-runner.ts` 送出、`flow-runner`、`block-catalog`
- shared：`StoryboardShot` 视频字段核对

## 6.12 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-21 | 首版：主链缺口 · clip-gen 强化 |
| 2026-07-21 | 指针：用户改生产/附着 prompt；**不开**节点内 system Tab；enrich 热调见功能 8 全局 Dev |

---

# 功能 7 · 交付打包（`export-pack`）与智能剪辑边界

- **状态**：设计定稿待实现（2026-07-21）· **主链缺口专章**
- **产品柱**：漫剧/复刻交付出口
- **节点 kind**：保持 `export-pack`
- **交互壳约束**：**不是** ScreenModal；`workspaceType: 'config'`，`attachToNode: true`。升级紧凑卡与配置区至 desk 语言；**禁止**改成弹窗台；深度成片预览仍归功能 1 / Episode Studio
- **相关存量**：`ExportPackBlock.tsx`、`export-pack-runner.ts`、功能 1 `TimelinePayload` / montage API

---

## 7.1 背景与目标

### 问题

| 问题 | 事实 |
|------|------|
| 与智能剪辑重叠 | 二者都能 FFmpeg 成片 / HF / Remotion bundle；用户不知主入口 |
| 卡面简陋 | 前缀 + 四模式按钮；无时间线来源说明、无审阅门禁提示产品化 |
| 数据源分裂 | `ffmpeg-episode` 走 `shots`+`requireApproved`；HF/Remotion 走 `timelineDraft`；ZIP 走上游边 |

### 目标

明确：**智能剪辑 = 编排与渲染预览主场；交付打包 = 按模式吐交付物（ZIP/工程包/成片文件）**。本节点升级为清晰的交付配置台。

### 非目标

- 不做第二套时间线编辑器
- 不吞并 Episode Studio
- 不改为 ScreenModal

---

## 7.2 现状盘点

| 模式 | runner 行为 |
|------|-------------|
| `zip` | 上游图/视/音打包 + manifest |
| `ffmpeg-episode` | `api.concatEpisode(shots, requireApproved)` |
| `hyperframes-episode` | `timelineDraft` → `renderHyperframes` |
| `remotion-bundle` | `timelineDraft` → studio ZIP 下载 |

---

## 7.3 产品定位与边界（对功能 1）

| 能力 | 智能剪辑（功能1） | 交付打包（本功能） |
|------|------------------|-------------------|
| 编辑 TimelinePayload | ✅ 主 | ❌ 只读消费 |
| 预览 Player | ✅ | ❌（可深链打开剪辑/工作室） |
| 快速出 mp4 试看 | ✅ | 可选「使用当前时间线渲染」快捷 |
| ZIP 素材包 | 次 | ✅ 主 |
| Remotion 工程包 | 可触发 | ✅ 主交付态 |
| HF 异步成片任务 | 可触发 | ✅ 主交付态 |
| 审阅门禁 concat | 可调 | ✅ 保留 shots 路径 |

**推荐旅程**：剪辑台确认时间线 →「同步指针到 export-pack」或连线 → 本节点选模式导出。

---

## 7.4 原型与 UI（desk 升级）

```
┌─ export-pack 卡 ────────────────────────────┐
│ ▌交付打包                                    │
│ 时间线：已同步 · 18 镜 · 审阅门禁开           │
│ 模式：[ZIP] [FFmpeg成片] [HF] [Remotion包]   │
│ 源说明：ZIP←上游边 · 成片←shots/时间线       │
│ [导出] [打开智能剪辑]                        │
└─────────────────────────────────────────────┘
```

附着配置区：前缀、音频轨 URL、是否 requireApproved、模板 id（HF）、上次结果链接。

---

## 7.5 功能清单

### P0

| ID | 功能 | 状态 |
|----|------|------|
| EP-P0-01 | 卡面 desk 升级 + 模式源说明 | `[改造]` |
| EP-P0-02 | 与功能1边界文案/深链 | `[新增]` |
| EP-P0-03 | 导出前校验分模式（无时间线禁用 HF/Remotion） | `[改造]` |
| EP-P0-04 | catalog hint：「交付 ZIP / 成片 / 工程包」 | `[改造]` |

### P1

| ID | 功能 | 状态 |
|----|------|------|
| EP-P1-01 | 「从智能剪辑同步 timelineRef」 | `[新增]` |
| EP-P1-02 | 导出历史列表（最近 N 次 url/taskId） | `[新增]` |
| EP-P1-03 | HF 任务轮询状态展示 | `[改造]` |

### P2

| ID | 功能 | 状态 |
|----|------|------|
| EP-P2-01 | 多集打包 | `[新增]` |
| EP-P2-02 | 清单 PDF/CSV（可选） | `[新增]` |

---

## 7.6 逻辑

```
validate(mode):
  zip → 需至少一侧媒资
  ffmpeg-episode → shots.length>0
  hyperframes|remotion → timelineDraft 存在且 validateRemotion/HF 通过
run → runExportPack
persist lastExportAt, episodeUrl, taskId, exportCount
```

---

## 7.7 算法

- 复用现 runner；P0 不改打包算法，只加前置校验与 UX
- `requireApproved`：与现 concatEpisode 一致；失败态 `blocked` 产品文案「先在导演台通过审阅」

---

## 7.8 集成

| 方 | 关系 |
|----|------|
| 功能 1 | timeline SSOT；本节点只读；可互深链 |
| 功能 6 | ZIP 可收 clip 边；成片也可读 shot 视频 |
| 功能 2 | 审阅态影响 ffmpeg-episode |
| montage API | 不变 |

---

## 7.9 分期 · 验收 · 风险

P0：边界+校验+UI。P1：同步指针+历史。  

| AC | 条件 |
|----|------|
| AC-1 | 无 timeline 时 HF/Remotion 按钮禁用并说明 |
| AC-2 | 有 shots 时可 FFmpeg 成片（门禁行为与现一致） |
| AC-3 | 卡面标明与智能剪辑分工 |
| AC-4 | 非 ScreenModal；无其它弹窗无关 diff |

风险：O-16 双入口；用文案+深链降低；禁止两处做两套时间线编辑。

## 7.10 关键文件

- `ExportPackBlock.tsx`、`export-pack-runner.ts`、`block-catalog`、`attached-workspace` note
- 功能 1 节点增加「送到交付打包」CTA（实现时改功能1，本处定义契约）

## 7.11 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-21 | 首版：主链缺口 · export-pack 与智能剪辑边界 |
| 2026-07-21 | 指针：无 LLM system；无 Dev Prompt 窗（功能 8） |

---

# 功能 8 · 内部提示词与 Dev Prompt Pack（横切约定）

- **状态**：设计定稿（2026-07-21）· **横切专章**（非独立 Dock 节点）
- **产品柱**：支撑编剧台 / 分镜台 Agent 质量与可调试性；约束主链其余节点不滥开提示词编辑面
- **范围**：内部 System / 技能提示词、拼装模板、**仅开发期**可改的外部窗口；**不含**用户常态编辑的镜级 `imagePrompt`/`videoPrompt`（那是生产面，归功能 3/4/6 产品 UI）
- **存量锚点**：`ScriptBreakdownPromptTemplates`、`DEFAULT_SCRIPT_BREAKDOWN_PROMPTS`、`normalizeScriptBreakdownPrompts`、`ScriptBreakdownWorkspace` 的 prompts Tab / 提示词包导入导出、`buildLineArtShotPrompt`、`enrichPromptWithCharacters` / `enrichPromptWithEnvironment`、`buildStudioVideoPrompt`

---

## 8.1 背景与目标

### 问题

| 问题 | 事实 |
|------|------|
| 两层提示词易混 | 内部 system 与镜级生产 prompt 若不分离，产品面会塞进开发调试器，契约难测 |
| 编剧台升级为 Agent | 多技能需要稳定 DEFAULT system（§3.8.5 已写组装，缺落点与 Dev 策略） |
| 拆镜迁分镜台 | 旧 `episode*System` 仍在 `script-breakdown.ts`，调用权迁走后归属须写清 |
| 主链缺口节点 | 门禁/clip-gen/剪辑/打包若各自开「提示词 Tab」，冗余且违背「仅开发」 |

### 目标

1. 明确：**谁必须有内部提示词、谁只要拼装模板、谁完全不需要**  
2. 约定 **Dev-only Prompt Pack** 的闸门、数据形状、导入导出（复用存量包范式）  
3. 禁止为功能 1/5/6/7 各造一套产品级 system 编辑器  

---

## 8.2 概念分层（强制）

| 层 | 名称 | 定义 | 默认可见性 |
|----|------|------|------------|
| **L0** | 内部 System / 技能提示词 | 驱动 LLM 输出结构化 JSON / Agent patch 的 system | 代码 DEFAULT；Dev 窗可覆盖 |
| **L1** | 拼装 / enrich 模板 | 确定性字符串拼装（角色锁、线稿模板、视频 builder） | 代码常量；可选全局 Dev key |
| **L2** | 生产面提示词 | 镜头/生成任务可拍文案 | **用户产品 UI 常态编辑** |

**规则**：L0/L1 的外部修改窗 **仅开发**；L2 永远是产品能力，不叫 Dev Pack。

---

## 8.3 产品定位（按节点矩阵）

| 节点 / 模块 | 功能章 | L0 内部 system | L1 拼装模板 | Dev 外部窗 | 产品侧提示词编辑 |
|-------------|--------|----------------|-------------|------------|------------------|
| 编剧台 `script-desk` | 3 | **必须**（按技能） | 弱 | **要**（节点 Dev Pack） | 用户指令在对话里；不成整段 system 主 Tab |
| 分镜台 `storyboard-desk` | 4 | **必须**（拆镜；迁自旧 prompts） | `buildLineArtShotPrompt` 等 | **要**（节点 Dev Pack，复用存量） | **要**（镜表 L2） |
| 导演台 `director-desk` | 2 | 默认无重 Agent system | **要**（enrich / 风格锁） | **可选极简**短字段 | 可调镜摘要/送出前文案；非 system |
| 设定检查 + 素材库 | 5 | 通常无；`extractAssets` 可选 | 规则为主 | **不要**节点窗；可选全局 key | 库内「锁定提示词」属资产字段（L2 变体） |
| `clip-gen` | 6 | 通常无 | `buildStudioVideoPrompt` + enrich | **不要**节点窗；enrich 用全局 Dev | **要**（附着区生产 prompt） |
| 智能剪辑 | 1 | 现阶段无（O-3 另章） | 渲染确定性 | **不要** | 时间线元数据，非 LLM system |
| 交付打包 | 7 | 无 | 无 | **不要** | 导出配置 |

---

## 8.4 原型

### 8.4.1 编剧台 / 分镜台 · Dev Prompt Pack 面（非默认主路径）

```
┌─ ScreenModal ─────────────────────────────────────────┐
│ 主路径：Agent / 拆镜 / 镜表 …                          │
│                                                        │
│ [⋯ 开发者] ← 仅双闸打开后可见                          │
│   ┌─ Dev · Prompt Pack ─────────────────────────────┐ │
│   │ 技能/槽位列表 │ 大文本编辑 DEFAULT 覆盖          │ │
│   │ [恢复默认] [导入 JSON] [导出 JSON] [保存到节点]  │ │
│   └─────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### 8.4.2 全局 Dev Overrides（门禁 / clip-gen enrich 等）

```
Settings → 开发者选项（或独立 Dev drawer）
  ├─ 启用 Prompt 热调
  ├─ key: clipGen.enrichSuffix     [textarea]
  ├─ key: assetGate.extractSystem  [textarea]  （若启用）
  └─ [导出全部覆盖] [清空]
```

**禁止**：在 clip-gen / asset-gate / export-pack / clip-editor 卡片上再开「提示词」主 Tab。

### 8.4.3 导演台（可选极简）

```
Dev 面板内仅：
  · consistencySuffix
  · styleLockAppendix
（无多技能列表）
```

---

## 8.5 UI 规格

| 规则 | 说明 |
|------|------|
| 双闸 | `import.meta.env.DEV` **且** Settings「开发者选项 / 启用 Prompt 热调」为真（O-17） |
| 生产构建 | 正式包默认 **编译剔除或永久隐藏** Dev Pack UI；覆盖字段若误写入节点，`normalize` 仍可忽略未知键 |
| 视觉 | Dev 面使用 desk token，但加「开发」眉题与警告色左边线，避免被当成正式技能 Tab |
| 与存量对齐 | 分镜台优先复用 `ScriptBreakdownWorkspace` prompts Tab 的交互与 import/export；迁入 ScreenModal 后仍 **默认折叠/隐藏**，仅双闸显示 |
| ScreenModal 约束 | 不借机改其它弹窗壳；只在已授权升级的编剧台/分镜台内加 Dev 入口 |

---

## 8.6 功能清单

### P0

| ID | 项 | 标记 |
|----|-----|------|
| PP-P0-01 | 文档矩阵落地：实现时按 §8.3 决定是否开窗 | `[新增]` 约定 |
| PP-P0-02 | `DEFAULT_SCRIPT_DESK_SKILL_PROMPTS` + `normalizeScriptDeskPrompts` | `[新增]` |
| PP-P0-03 | 拆镜 prompts 归属分镜台；编剧台不再持有 `episodeBreakdownSystem` 为生产路径 | `[改造]` |
| PP-P0-04 | 分镜台 Dev Pack：复用 `ScriptBreakdownPromptTemplates` + 提示词包 parse/export | `[改造]` |
| PP-P0-05 | 双闸隐藏 Dev UI | `[新增]` |
| PP-P0-06 | 功能 1/5/6/7：**禁止**新增节点级 system 编辑 Tab | `[约定]` |

### P1

| ID | 项 | 标记 |
|----|-----|------|
| PP-P1-01 | 全局 `DevPromptOverrides` store（localStorage 或 workspace meta） | `[新增]` |
| PP-P1-02 | 导演台可选短模板 Dev 字段 | `[新增]` 可选 |
| PP-P1-03 | Prompt Pack 版本号 + 校验（非法包拒绝） | `[改造]` 存量包已有雏形 |

### P2

| ID | 项 | 标记 |
|----|-----|------|
| PP-P2-01 | 服务端同样接受可选 system 覆盖（仅非生产环境） | `[存疑]` 安全 |
| PP-P2-02 | O-3 Agent 写 HF 模板协议若开章，其 system 纳入本 Pack 体系 | `[存疑]` |

---

## 8.7 逻辑

### 8.7.1 合并优先级

```
effectiveSystem =
  normalize(
    DEFAULT_*(skillOrSlot),
    node.data.*PromptPack?.[skillOrSlot],   // 节点覆盖
    globalDevOverrides[key]                 // 全局覆盖，最后赢或按策略
  )
```

建议：**全局覆盖优先于节点覆盖**（便于一次热调全项目）；若冲突需在 Dev UI 标明「当前生效来源」。

### 8.7.2 写入规则

- Dev「保存到节点」→ 写入 `data.scriptDeskPromptPack` / `data.scriptBreakdownPrompts`（存量键可保留）
- 「恢复默认」→ 删除覆盖键，不是写空字符串冒充默认
- 正式用户路径 **从不** 打开保存 UI；误带入的覆盖：开发者可清，产品不依赖其存在

### 8.7.3 与 Agent 组装（编剧台）

```
system = effectiveSystem(skillId)          // L0
user   = { brief, bible, screenplay摘要, 用户本轮指令, prefs, JSON schema }
```

禁止一次技能输出镜级 prompt 列表（仍守 §3.8.5）。

### 8.7.4 与拆镜组装（分镜台）

继续 `normalizeScriptBreakdownPrompts` → runner；Dev 覆盖写入同一结构。

---

## 8.8 算法 / 数据契约

### 8.8.1 编剧台 Pack（建议）

```ts
// packages/shared — 建议路径
export interface ScriptDeskSkillPromptPack {
  version: 1;
  skills: Partial<Record<ScriptDeskSkillId, string>>; // system 全文
}

export const DEFAULT_SCRIPT_DESK_SKILL_PROMPTS: Record<ScriptDeskSkillId, string>;
export function normalizeScriptDeskPrompts(
  input?: Partial<ScriptDeskSkillPromptPack> | null,
): ScriptDeskSkillPromptPack;
```

`ScriptDeskSkillId` 对齐功能 3 技能表（topic / world / character / plot / pacing / dialogue / hooks / consistency / generate 等）。

### 8.8.2 分镜台 Pack（存量）

```ts
ScriptBreakdownPromptTemplates {
  episodePlannerSystem: string;
  episodeBreakdownSystem: string;
}
DEFAULT_SCRIPT_BREAKDOWN_PROMPTS  // packages/shared/src/types/script-breakdown.ts
```

迁移说明：planner 若编剧台不再用，可保留键以兼容旧包；**运行时拆镜主路径只保证 breakdown system 被分镜台消费**。

### 8.8.3 全局 Overrides（建议）

```ts
type DevPromptOverrideKey =
  | 'clipGen.enrichSuffix'
  | 'directorDesk.consistencySuffix'
  | 'directorDesk.styleLockAppendix'
  | 'assetGate.extractSystem'
  | `scriptDesk.skill.${ScriptDeskSkillId}`
  | 'storyboard.episodeBreakdownSystem'
  | 'storyboard.episodePlannerSystem';

interface DevPromptOverridesState {
  enabled: boolean;
  values: Partial<Record<DevPromptOverrideKey, string>>;
}
```

### 8.8.4 导入导出包

- 分镜：继续存量「NX9 剧本拆分提示词包」形状；改名文案可为「分镜台拆镜提示词包」但不强制破旧包  
- 编剧：新 envelope `{ kind: 'nx9-script-desk-prompt-pack', version: 1, skills: {...} }`  
- 非法 JSON / 缺 version → 拒绝并 toast，不静默部分应用  

---

## 8.9 集成

```
功能 3 编剧台 ──L0──▶ DEFAULT_SCRIPT_DESK_* + Dev Pack
功能 4 分镜台 ──L0──▶ ScriptBreakdownPromptTemplates（迁入）
         └──L2──▶ 镜表 image/video/sketch（产品）
功能 2 导演台 ──L1──▶ enrich* / 可选短 Dev 字段
功能 6 clip-gen ──L1──▶ buildStudioVideoPrompt；L2 附着区；全局 Dev 可选
功能 5 / 1 / 7 ──默认无 L0 窗──▶ 功能 8 矩阵禁止开窗
```

| 方 | 关系 |
|----|------|
| `script-breakdown-runner` | 继续吃 prompts 参数；调用方改为分镜台 |
| Agent `llmJsonObject(system, user)` | system 来自 normalize 后的 Pack |
| SettingsDrawer | 增加开发者选项双闸（实现时） |
| 功能 1 O-3 | 若未来开 Agent 写 HF，system 纳入本体系，不另造第三套窗 |

---

## 8.10 分阶段实现

| 阶段 | 内容 |
|------|------|
| P0 | 约定进开发清单；编剧 DEFAULT 技能 prompts；分镜承接 breakdown prompts + Dev 双闸；砍掉主链缺口节点的 system Tab 冲动 |
| P1 | 全局 DevOverrides；导演可选短字段；Pack 校验加强 |
| P2 | 服务端覆盖策略（若需要）；HF Agent 协议并入 |

---

## 8.11 验收标准

| # | 条件 |
|---|------|
| AC-1 | 编剧台：无 Dev 闸时界面看不到整段 skill system；开闸后可改、可恢复默认、可导出包 |
| AC-2 | 分镜台：拆镜实际使用的 system 与 Pack 一致；镜表 L2 编辑不依赖 Dev 闸 |
| AC-3 | 导演台：无多技能 system 主 Tab |
| AC-4 | clip-gen / asset-gate / clip-editor / export-pack：无新增「内部提示词」产品 Tab |
| AC-5 | 生产构建默认无法打开 Dev Pack（或开关不可用） |
| AC-6 | 导入非法 Pack 失败且不污染节点 data |

---

## 8.12 风险、存疑与八荣八耻自检

| 风险 | 缓解 |
|------|------|
| Dev 覆盖泄漏进用户工程文件 | 双闸 + normalize 文档说明；可选导出时 strip Dev 字段 |
| 全局覆盖难复现 | 导出 Pack 时附带 effective 来源；测试夹具固定 DEFAULT |
| 服务端接受任意 system（P2） | 默认关闭；仅非生产（O 存疑） |

| 存疑 | 见总览 |
|------|--------|
| O-17 | 双闸载体 |
| O-18 | 节点 vs blob |
| PP-P2-01 | 服务端覆盖 |

| 八荣八耻 | 体现 |
|----------|------|
| 以查档为荣 | 锚定存量 `ScriptBreakdownPromptTemplates` / Workspace prompts Tab |
| 以复用为荣 | 不新造第三套提示词包格式（分镜）；编剧只增 envelope |
| 以新增冗余为耻 | 主链缺口不开四套窗 |
| 以分步为荣 | P0 台内 Pack → P1 全局 |

---

## 8.13 关键文件清单（实现时对照）

- `packages/shared/src/types/script-breakdown.ts`（DEFAULT / templates）
- `packages/shared/src/utils/script-breakdown-production.ts`（normalize）
- `apps/web/.../ScriptBreakdownWorkspace.tsx`（prompts Tab / import export）
- `apps/web/src/engine/script-breakdown-runner.ts`
- 功能 3：`script-desk` runner / Block（新增 skill prompts）
- 功能 4：`StoryboardDeskBlock` Dev 入口
- `apps/web/src/panels/SettingsDrawer.tsx`（开发者选项）
- `packages/shared`：`character-prompt` / `environment-prompt` / `line-art-prompt` / `studio-prompt-builder`（L1）

---

## 8.14 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-21 | 首版追加：内部提示词分层、三台与主链缺口矩阵、Dev-only Prompt Pack、全局 Overrides、与功能 2/3/4 勘误指针对齐 |

---

<!--
后续功能请从这里向下追加，例如：

# 功能 9 · 〈名称〉
...
-->
