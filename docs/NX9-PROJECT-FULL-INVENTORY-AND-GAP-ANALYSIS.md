# NX9 项目全量盘点与「不可用感」根因分析

> **文档目的**：供外部 AI（如 ChatGPT）做产品/架构/原型/UI/逻辑/流程审查的**事实基线文档**。  
> **编写原则**：所有结论均标注来源（代码路径、测试报告、产品文档）；不臆造未实现功能。  
> **审计基线**：2026-07-10 · 仓库 `f:\code\project\NX9`  
> **关联 SSOT**：`Product Optimization.md` · `docs/NX9-PRODUCT-REFACTOR-SPEC.md` · `docs/NX9-CAPABILITY-AUDIT-SPEC.md` · `需求.txt`

---

## 一、执行摘要：为什么感觉「不能用」

### 1.1 一句话结论

NX9 **底层 AI 能力已较完整（工程成熟度约 73%）**，但 **产品体验层严重滞后（约 42%）**——用户进入后面对的是「工作流编辑器」而非「漫剧创作工作室」，主流程不清晰、信息过载、步骤与画布脱节，导致**有能力但难用起来**。

### 1.2 六大根因（按影响排序）

| # | 根因 | 用户感知 | 证据来源 |
|---|------|----------|----------|
| **R1** | **产品定位错位**：界面心智像 ComfyUI/Dify，不像漫剧工具 | 「我在配 AI，不是在写剧」 | `Product Optimization.md` §2.1；`NX9-PRODUCT-REFACTOR-SPEC.md` §3 #1（45%） |
| **R2** | **无主流程视觉焦点**：首屏同时出现 Dock(38项)、画布节点、左右 Rail、顶栏按钮 | 不知道先点哪里 | PRD §2.2；`AppShell.tsx` 同时挂载 10+ 面板/抽屉 |
| **R3** | **Story 与 Workflow 双轨并行**：故事板在 Rail，生产在画布节点，两处状态易不同步 | 做了剧本不知道下一步去哪 | `workspace-document` + `flow-runner` 两套状态；无 Scene 中心画布 |
| **R4** | **13 步管线体验断裂**（用户原话） | 步骤条与节点不对应、连线不通、顺序乱 | `需求.txt` #2/#3；部分已在 2026-07-10 修复但 E2E 未自动化验证 |
| **R5** | **关键能力为 Stub 或需外部配置** | 点了没反应 / 要自己去填 API Key | `NX9-CAPABILITY-AUDIT-SPEC.md` §2 GAP 表；Settings 必填 |
| **R6** | **缺平台级闭环**：无项目首页、无任务中心、无项目状态机 | 不知道进度、不知道失败在哪 | `HomeDashboard.tsx` 未挂载；`queue` 模块未注册；`projectStatus` 缺失 |

### 1.3 两个成熟度数字的矛盾（核心）

| 维度 | 完成度 | 含义 |
|------|--------|------|
| **工程/能力层** | ~73% | 节点执行、Gateway、故事板、Montage 等后端+执行引擎可用 |
| **产品体验层** | ~42% | 引导、渐进式 UI、步骤 SSOT、用户词典、任务可视化等缺口大 |

> **结论**：不是「没做」，而是「做了但没串成产品」。用户感到不可用，主要是**交互与流程问题**，不是单一 Bug。

### 1.4 用户三条直接反馈（`需求.txt`）与当前状态

| 反馈 | 期望 | 当前状态（2026-07-10） |
|------|------|------------------------|
| 场景库要支持多参考图 | 环境库可上传多张参考图 | ✅ 已实现：`EnvironmentProfile.referenceUrls`，最多 6 张（`TEST-PIPE-UX-ENV-*` PASS） |
| 步骤条应在画布中央顶部，按模式显示对应步数 | 真人 13 步 / 自由模式不同展示 | ⚠️ 部分实现：`CanvasFlowRail.tsx` 已建，单元测试 PASS，**全流程 E2E 仍为 MANUAL** |
| 13 步不连贯、连线不通、节点顺序乱 | 1→13 单链全连通 | ⚠️ 模板层已修复：`tpl-pipeline-13-3d/live` 13 节点 12 边（`TEST-PIPE-UX-TPL-*` PASS），**用户实际体验可能因旧工作区/未选 Playbook 仍看到乱画布** |

---

## 二、项目定位与边界

### 2.1 对外定位（目标）

```
AI 漫剧创作工作室（AI Story Studio）
```

### 2.2 对内架构（现实）

```
Story-first UI（部分） + Workflow Engine（完整） 底层
```

- **Workflow / Node / API** 对普通用户应隐藏，仅进阶用户通过 CommandPalette / 自由模式可见
- 源：`NX9-PRODUCT-REFACTOR-SPEC.md` §2.1

### 2.3 产品域划分

| 域 | 职责 | 主要实现位置 |
|----|------|--------------|
| **Story** | 剧本、场次、分镜、角色、环境 | ScriptStudioPanel、StoryboardPanel、Backlot |
| **Production** | 图/视/音生成、审阅、时间线 | picture-gen、clip-gen、Episode Studio |
| **Asset** | 素材库、Prompt 库、模型 | Backlot、Library Rail、AssetLibraryPanel |
| **Engine** | 画布、Runner、Recipe | Stage Deck、flow-runner（应 conceal） |
| **Project** | 项目、版本、协作、额度 | **缺失**（HomeDashboard 未接入） |

### 2.4 目标数据心智

```
Project → Story → Scene → Shot → Asset → Task → Output
```

| 层级 | 当前映射 | 缺口 |
|------|----------|------|
| Project | `workspace` + `WorkspacePayload` | 无 Draft/Generating/Exported 状态机 |
| Story | `storyboard.title` + `scriptPlan` | 弱绑定 |
| Scene | `SceneSplitRecord` + `EnvironmentProfile` | 画布非 Scene 分组 |
| Shot | `StoryboardShot` | 基本可用 |
| Asset | Take Store + media URLs | 无统一 Asset Manager |
| Task | flow-runner batch（内存） | 无持久 Task Center |
| Output | export-pack + timeline | 部分可用 |

---

## 三、技术架构总览

### 3.1 Monorepo 结构

```
NX9/
├── apps/
│   ├── server/          NestJS API (port 3001) + Prisma SQLite
│   └── web/             React 19 + Vite (port 5173) + XYFlow 画布
├── packages/
│   ├── shared/          类型、Block 目录、Playbook、Workflow 模板
│   ├── director3d/      Three.js / R3F 3D 导演
│   └── remotion-compositions/  Remotion 片段组件
├── skills/              17 个 SKILL.md Agent 提示词包
├── services/luxtts/     可选 LuxTTS Python 侧车
├── docs/                产品 Spec、测试报告
├── scripts/             测试脚本
└── data/                JSON 持久化（settings、skills、task queue 等）
```

### 3.2 启动方式

```bash
npm install
npm run dev   # 自动 build shared，并发启动 server + web
```

- 前端：http://127.0.0.1:5173  
- 后端：http://127.0.0.1:3001  
- **前置条件**：Settings 中配置 LLM/图像/视频 Provider API Key，否则生成功能不可用

### 3.3 前端应用结构（无 React Router）

- 入口：`apps/web/src/main.tsx` → `AppShell.tsx`
- **单页应用**：所有 UI 通过 overlay/drawer/rail 状态切换，无路由
- 画布：`FlowSurface.tsx` / `StageDeckSurface.tsx`
- 状态：Zustand stores（见 §八）

### 3.4 后端模块一览（19 个已注册 + 1 个未注册）

| 模块 | API 前缀 | 职责 | 状态 |
|------|----------|------|------|
| health | `/api/status` | 健康检查 | ok |
| workspace | `/api/workspaces` | 工作区 CRUD、导出、配音批量 | ok |
| settings | `/api/settings` | API Key、Provider 配置 | ok |
| assets | `/api/assets` | 文件上传、缩略图 | ok |
| gateway | `/api/gateway` | LLM/图像/视频/TTS/FAL/ComfyUI 代理 | ok |
| agent | `/api/agent` | AI 编剧：拆场、分镜表、角色提取等 | partial |
| skills | `/api/skills` | SKILL.md CRUD | ok |
| grid | `/api/grid` | 宫格切分/合成、线稿、反推 | ok |
| montage | `/api/montage` | FFmpeg 合成、字幕、HyperFrames、Remotion | partial |
| tasks | `/api/tasks` | 长任务进度轮询 | ok |
| users | `/api/users` | 多用户 | ok |
| usage | `/api/usage` | 用量统计 | ok |
| admin | `/api/admin` | 存储模式、JSON→Prisma 迁移 | ok |
| image-ops | `/api/image-ops` | Sharp 图像处理 | ok |
| tools | `/api/tools` | 链接解析、反推、快剪等 | ok |
| topaz | `/api/topaz` | Topaz 增强 | partial |
| **queue** | `/queue` | 生产任务队列（JSON 文件） | **未注册到 AppModule** |

### 3.5 数据库（Prisma SQLite）

| Model | 字段摘要 | 用途 |
|-------|----------|------|
| User | id, name, email?, createdAt | 用户 |
| Workspace | id, title, ownerId, payload(JSON), blockCount, shotCount | 工作区文档 |
| UsageEvent | id, userId?, kind, model?, units, metadata | 用量 |

> 大量数据仍走 JSON 文件（settings、skills）；workspace 支持 Prisma 与 JSON 双模式。

---

## 四、Playbook 创作流程（9 种模式）

**源文件**：`packages/shared/src/data/playbook-definitions.ts`  
**就绪检测**：`packages/shared/src/utils/playbook-readiness.ts`（20 个 readinessKey）  
**步骤视觉**：`packages/shared/src/utils/playbook-step-visual.ts`（done/current/blocked/future 四态，目标六态未完成）

### 4.1 Playbook 列表

| ID | 名称 | 步数 | Featured | Bootstrap 模板 |
|----|------|------|----------|----------------|
| `pb-ai-comic-3d` | AI 漫剧 · 3D | 13 | ✓ | `tpl-pipeline-13-3d` (replace) |
| `pb-ai-comic-live` | AI 漫剧 · 真人 | 13 | ✓ | `tpl-pipeline-13-live` (replace) |
| `pb-anime` | AI 漫剧 · 动漫 | 11 | ✓ | `tpl-pipeline-11-anime` (replace) |
| `pb-viral-short` | 爆款短视频 | 7 | ✓ | `tpl-link-replicate` (merge) |
| `pb-line-art-episode` | 线稿分镜单集 | 7 | ✓ | `tpl-line-art-storyboard` (merge) |
| `pb-character-ip` | 角色 IP 设定 | 5 | ✓ | `tpl-nx9-character-pipeline` (merge) |
| `pb-voice-drama` | 声音剧 | 6 | ✓ | `tpl-voice-drama` (merge) |
| `pb-seedance-sclass` | Seedance 连续镜头 | 6 | ✓ | `tpl-sclass-seedance` (merge) |
| `pb-blank-advanced` | 自由模式 | 0 | — | 无模板 |

### 4.2 13 步管线逐步说明（3D / 真人）

| 步 | ID | 名称 | Readiness Key | 画布节点 Kind | 主操作 | 完成条件 |
|----|-----|------|---------------|---------------|--------|----------|
| 1 | script | 剧本 | has_source_text | shot-script | 打开 Script Rail | scriptPlan.sourceText 非空 |
| 2 | scene-split | 场次 | has_scene_split | text-chunker | Script Rail 场次拆分 | ≥1 场 |
| 3 | storyboard | 分镜 | has_storyboard_shots | story-grid | Storyboard Rail | ≥3 镜 |
| 4 | character-bible | 角色 | has_character_bibles | character-sheet | Library/角色 | ≥1 主角有设定或参考图 |
| 5 | environment-bible | 环境 | has_environment_bibles | scene-card | Library/模板 | ≥1 环境 + **参考图** |
| 6 | camera-3d / camera-live | 3D机位/导演台 | has_camera_blocks | director-3d / director-desk | 打开 3D 面板 / 加载导演台模板 | ≥50% 镜有 linkedBlockId |
| 7 | keyframe-gen | 关键帧 | has_keyframes | picture-gen | 批量运行 picture-gen | ≥80% 镜有首帧 |
| 8 | keyframe-review | 关键帧审阅 | all_keyframes_approved | review-gate | 审片模式 | 全部 keyframeStatus=approved |
| 9 | video-gen | 视频 | has_video_assets | motion-story / clip-gen | cascade 视频链 | ≥1 镜有 videoAssetId |
| 10 | consistency | 连贯修复 | consistency_resolved | continuity-check | 聚焦连贯检查 | 无 open issues |
| 11 | episode-studio | 成片预览 | has_video_takes | clip-editor | 打开 Episode Studio | 时间线可播放 |
| 12 | review-gate | 审阅门控 | all_videos_approved | review-gate | 批量运行 | 全部 videoStatus=approved |
| 13 | export | 导出 | export_ready | export-pack | 聚焦导出 | 导出成功 |

**3D vs 真人差异**：仅步 ⑥（director-3d vs director-desk）和步 ⑨（motion-story vs clip-gen）。

### 4.3 11 步动漫管线

与 13 步相比：**无步 ⑥ 机位**、**无步 ⑪ 成片预览**（步序重新编号为 11 步）。模板：`tpl-pipeline-11-anime`。

### 4.4 Playbook 动作类型

| 动作 type | 含义 |
|-----------|------|
| open_rail | 打开 Context Rail 指定 Tab |
| open_panel | 打开全屏面板（storyboard-full / episode-studio / director-3d） |
| load_template | 加载 Workflow 模板 merge/replace |
| focus_block | 聚焦/生成指定 kind 的节点 |
| run_cascade | 从某 kind 开始级联执行 |
| run_batch | 批量运行指定 kinds |
| storyboard_action | 故事板批操作（approve_all / batch_line_art） |
| set_view_mode | 切换 explore/produce/review |
| spawn_camera_blocks | 生成机位相关节点 |
| wait_user | 等待用户手动完成 |

### 4.5 流程编排 UI 组件

| 组件 | 文件 | 职责 | 状态 |
|------|------|------|------|
| PlaybookLauncherOverlay | `PlaybookLauncherOverlay.tsx` | 空画布选模式 | ok |
| CanvasFlowRail | `CanvasFlowRail.tsx` | 画布中央步骤条 | partial（四态，非六态） |
| NextStepBanner | `NextStepBanner.tsx` | 下一步 CTA | partial |
| PlaybookStepBar | `PlaybookStepBar.tsx` | 薄包装 CanvasFlowRail | ok |
| PipelineCapsule | `PipelineCapsule.tsx` | 仅自由模式迷你进度 | ok |
| ProductionProgressWall | `ProductionProgressWall.tsx` | 批量生成进度墙 | partial |

---

## 五、Workflow 模板（30 个）

**源文件**：`packages/shared/src/data/workflow-templates.ts`

| ID | 名称 | 类别 |
|----|------|------|
| tpl-nx9-character-pipeline | 角色设定 → 出图 | story |
| tpl-text-to-picture | 文生图 | image |
| tpl-image-to-clip | 图生视频 | video |
| tpl-storyboard-grid | 分镜九宫格 | story |
| tpl-character-turnaround | 角色三视图 | story |
| tpl-grid-vision | 宫格三层反推 | story |
| tpl-photo-speak | 照片说话 | video |
| tpl-shot-script-desk | 镜头脚本 → 导演台 | story |
| tpl-nx9-review-pipeline | 分镜 → 审阅 → 交付 | story |
| tpl-reference-picture | 参考板生图 | story |
| tpl-batch-pictures | 批量生图 | tool |
| tpl-av-post | 音视频后期 | tool |
| tpl-spatial-pipeline | 空间生产链 | tool |
| tpl-sclass-seedance | S-Class Seedance 连续镜头 | story |
| tpl-novel-import | 小说拆镜 → 开拍 | story |
| tpl-vertical-episode | 竖屏单集合成 | video |
| tpl-contact-sheet | 宫格联系板 | story |
| tpl-voice-drama | 声音剧 | story |
| tpl-link-replicate | 爆款复刻 | video |
| tpl-bridge-sequence | Bridge 镜头序列 | video |
| tpl-cover-export | 封面导出 | image |
| tpl-toonflow-lite | AI 编剧流水线 | story |
| tpl-line-art-storyboard | 线稿分镜 | story |
| tpl-3d-preview | 3D 导演预演 | story |
| **tpl-pipeline-13-3d** | 13 步 3D 管线单链 | story |
| **tpl-pipeline-13-live** | 13 步真人管线单链 | story |
| **tpl-pipeline-11-anime** | 11 步动漫管线单链 | story |

---

## 六、画布模块（Block）全目录

**源文件**：`packages/shared/src/catalog/block-catalog.ts`（100 kinds）  
**注册表**：`apps/web/src/blocks/registry.tsx`（82 个有专属组件，18 个 GenericBlock 占位）

### 6.1 统计

| 指标 | 数量 |
|------|------|
| 目录总条目 | 100 |
| 有专属 React 组件 | 82 |
| GenericBlock 占位 | 18 |
| Deprecated（归档） | 32 |
| Concealed（Dock 默认隐藏） | 34 |
| Dock 默认可见 | 38 |
| flow-runner 可执行 | ~62 |

### 6.2 Source / 素材（7）

| kind | 标签 | 实现 | 说明 |
|------|------|------|------|
| asset-import | 素材导入 | ✓ | 图像/视频/音频/3D 上传 |
| mesh-import | 3D 导入 | ✓ | glb/gltf/obj |
| mesh-viewer | 3D 预览 | ✓ | 预览与快照 |
| preview-sink | 结果预览 | ✓ | 终端预览 |
| asset-watch | 素材监听 | ✓ | 监听上游变化 |
| asset-bundle | 素材集合 | † Generic | deprecated，合并至迭代器 |
| render-slot | 渲染占位 | † Generic | deprecated |

### 6.3 Generate / 生成（12）

| kind | 标签 | 实现 | 说明 |
|------|------|------|------|
| prompt | 提示词 | ✓ | 多行提示词 + 批量出图 |
| picture-gen | 图像生成 | ✓ | 多模型图像生成 |
| clip-gen | 视频生成 | ✓ | Veo/Grok 等 |
| clip-editor | 视频剪辑 | ✓ | 多片段拼接（无转场 GAP-011） |
| motion-story | 动效分镜 | ✓ | Seedance 2.0 |
| director-desk | 导演台 | ✓ | 多镜头并发分镜 |
| director-3d | 3D 导演台 | ✓ | 3D 预演摆位 |
| sound-gen | AI 配音 | ✓ | TTS/LuxTTS（**非音乐**） |
| chat-model | 对话模型 | ✓ | LLM 流式 |
| photo-speak | 照片说话 | ✓ | 照片+文案口播 |
| shot-script | 镜头脚本 | ✓ | 结构化镜头表 |
| seedance-chain | Seedance 链 | ✓ | 连续剧情 |

### 6.4 Spatial / 空间（10）

| kind | 标签 | 实现 | 说明 |
|------|------|------|------|
| blocking-stage | 场面调度 | ✓ | 轻量 blocking |
| light-rig | 灯光方案 | ✓ concealed | HDRI/三点光 |
| depth-pass | 深度通道 | ✓ concealed | depth/normal |
| control-preprocess | 控制预处理 | ✓ | ControlNet 预处理 |
| panorama-sphere | 全景球 | ✓ | 360° |
| multi-view-3d | 多视图 3D | □ Generic | 未实现 |
| panorama-flat | 平面全景 | □ Generic | 未实现 |

### 6.5 Craft / 工艺（22）

| kind | 标签 | 实现 | 说明 |
|------|------|------|------|
| prompt-studio | 提示词工作室 | ✓ | 结构化 Prompt |
| style-lab | 风格实验室 | ✓ | 风格提取 |
| reference-board | 参考板 | ✓ | Mood board |
| character-sheet | 角色设定 | ✓ | 六层设定 + 三视图 |
| continuity-check | 连贯性检查 | ✓ | 多镜头一致性 |
| scene-card | 场景设定卡 | ✓ | 场景约束 prompt |
| dialogue-sheet | 对白表 | ✓ | 对白管理 |
| voice-cast | 配音分配 | ✓ | TTS 音色 |
| bridge-clip | Bridge 镜头 | ✓ | 镜头衔接 |
| story-grid | 故事板网格 | ✓ | 九宫格分镜 |
| grid-prompt-reverse | 宫格反推 | ✓ | 视觉反推 prompt |
| inpaint-edit | 局部重绘 | ✓ | Inpaint |
| thumbnail-maker | 缩略图 | ✓ | 封面缩略 |
| prompt-diff | 提示词对比 | ✓ | A/B 对比 |
| cinema-prompt | 电影感提示词 | ✓† | 部分 deprecated |
| camera-prompt | 运镜提示词 | ✓† | |
| angle-visual | 角度视觉 | ✓† | |
| style-atelier | 风格工坊 | ✓† | |
| tag-atelier | 标签工坊 | ✓† | |
| portrait-craft | 肖像工艺 | □ Generic | 未实现 |
| pose-craft | 姿势工艺 | □ Generic | 未实现 |
| portrait-flow | 肖像流 | □ Generic | 未实现 |
| portrait-meta | 肖像元数据 | □ Generic | 未实现 |

### 6.6 Utility / 工具（24）

| kind | 标签 | 实现 | 说明 |
|------|------|------|------|
| link-parser | 链接解析 | ✓ | 视频链接分析 |
| text-chunker | 文本切分 | ✓ | 场次拆分 |
| iterator | 迭代器 | ✓ | 批量迭代 |
| picker | 选择器 | ✓ | 条件选择 |
| grid-split | 宫格切分 | ✓ | 切分网格 |
| grid-compose | 宫格合成 | ✓ | 合成网格 |
| picture-diff | 图像对比 | ✓ | |
| picture-merge | 图像合并 | ✓ | |
| frame-endpoints | 首尾帧 | ✓ | |
| bg-remove | 背景移除 | ✓ | |
| upscale-lite | 轻量放大 | ✓ | |
| batch-runner | 批量运行器 | ✓ | |
| sketch-pad | 手绘板 | ✓ | 未绑 shot（GAP-013） |
| local-enhance | 本地增强 | ✓ | |
| caption-asr | 字幕识别 | ✓ | ASR |
| reference-analyze | 参考分析 | ✓ | |
| music-gen | 音乐生成 | ✓ | **Stub：用 TTS 冒充 BGM（GAP-001）** |
| export-pack | 导出包 | ✓ | 四模式导出 |
| subtitle-burn | 字幕压制 | ✓ | 单行 SRT 限制（GAP-010） |
| audio-mix | 音频混合 | ✓ | |
| color-grade | 调色 | ✓ | |
| beat-sync | 节拍同步 | ✓ | |
| topaz-picture | Topaz 图像 | ✓† | |
| topaz-clip | Topaz 视频 | ✓† | |
| frame-sampler | 帧采样 | ✓† | |
| scale-fit | 缩放适配 | ✓ | |
| web-view | 网页视图 | □ Generic | 未实现 |

### 6.7 Support / 支撑（8）

| kind | 标签 | 实现 | 说明 |
|------|------|------|------|
| memo | 备忘录 | ✓ | |
| passthrough | 透传 | ✓ | |
| watermark-clean | 水印清理 | ✓ | |
| review-gate | 审阅门控 | ✓ | 阻断 cascade |
| variant-fork | 变体分支 | ✓ | |
| recipe-spawn | 配方生成 | ✓ | |
| clip-sink | 视频接收 | ✓† | |
| blueprint | 蓝图 | ✓† | |
| touch-up | 精修 | □ Generic | 未实现 |
| lipsync-pass | 口型同步 | ⚠️ **禁用** | 视频原样透传（GAP-002） |

### 6.8 Integrate / 集成（8）

| kind | 标签 | 实现 | 说明 |
|------|------|------|------|
| model-market | 模型市场 | ✓ | |
| comfy-workflow | Comfy 工作流 | ✓ | |
| fal-market | FAL 市场 | ✓† | partial |
| comfy-market | Comfy 市场 | ✓† | partial |
| grok-agent | Grok Agent | □ Generic | 未实现 |
| codex-agent | Codex Agent | □ Generic | 未实现 |
| codex-picture | Codex 图像 | □ Generic | 未实现 |
| comfy-builder | Comfy 构建器 | □ Generic | 未实现 |

### 6.9 Hub / 枢纽（6，全部 deprecated）

| kind | 标签 | 实现 |
|------|------|------|
| workflow-hub | 工作流枢纽 | □ Generic |
| wallet-hub | 钱包枢纽 | □ Generic |
| param-inject | 参数注入 | □ Generic |
| hub-market | 枢纽市场 | □ Generic |
| hub-toolkit | 枢纽工具包 | □ Generic |
| vibe-workbench | Vibe 工作台 | □ Generic |

**图例**：✓ 专属组件 · † deprecated · □ 仅 GenericBlock · ⚠️ 显式禁用

---

## 七、前端面板与 UI 组件全目录

### 7.1 顶层面板（`apps/web/src/panels/`）

| 面板 | 文件 | 职责 | 入口 |
|------|------|------|------|
| WorkspaceRail | WorkspaceRail.tsx | 左侧工作区列表 CRUD | 常驻 |
| StoryboardPanel | StoryboardPanel.tsx | 全屏故事板编辑器 | 快捷键 B / Rail |
| EpisodeStudioPanel | EpisodeStudioPanel.tsx | 时间线预览/Remotion | Playbook 步 ⑪ |
| Director3dPanel | Director3dPanel.tsx | 独立 3D 导演 | Playbook 步 ⑥ 3D |
| BacklotLibraryPanel | BacklotLibraryPanel.tsx | 角色/环境/镜头模板库 | Rail Library |
| AssetLibraryPanel | AssetLibraryPanel.tsx | 上传素材浏览 | 顶栏 |
| GenerationHistoryPanel | GenerationHistoryPanel.tsx | 生成历史 | 顶栏 |
| UsagePanel | UsagePanel.tsx | API 用量 | 顶栏 |
| SettingsDrawer | SettingsDrawer.tsx | API Key 配置 | 顶栏 |
| SkillsDrawer | SkillsDrawer.tsx | Skill 编辑器 | 顶栏 |
| LogPanel | LogPanel.tsx | 活动日志 | 底栏 |
| ShortcutsModal | ShortcutsModal.tsx | 快捷键帮助 | 菜单 |
| WorkflowTemplatesPanel | WorkflowTemplatesPanel.tsx | 模板选择器 | Rail |
| PromptLibraryPanel | PromptLibraryPanel.tsx | Prompt 库 | Rail |
| CharacterLibraryPanel | CharacterLibraryPanel.tsx | 角色库 | Rail |
| CanvasAppearancePanel | CanvasAppearancePanel.tsx | 画布主题 | 设置 |
| RemotionPreviewPanel | RemotionPreviewPanel.tsx | Remotion 预览 | 辅助 |
| StoryboardShotMenu | StoryboardShotMenu.tsx | 单镜上下文菜单 | 故事板内 |

### 7.2 Context Rail 面板（`engine/stage-deck/chrome/rail/`）

| 面板 | 职责 |
|------|------|
| InspectorRailPanel | 选中节点属性检查 |
| ScriptStudioPanel | 剧本 Tab：原文、AI 工具、Agent 对话 |
| SceneSplitPanel | 场次拆分子面板 |
| StoryboardRailPanel | 故事板 Rail Tab |
| LibraryRailPanel | 库 Tab 容器 |
| LibraryTemplatesSubPanel | Backlot/模板子导航 |
| LibraryWorkflowSubPanel | Workflow 模板子导航 |
| LibraryHistorySubPanel | 版本历史子导航 |
| CharacterBibleStepPanel | Playbook 步：角色设定 |
| EnvironmentBiblePanel | Playbook 步：环境设定（**多参考图 ≤6**） |
| BacklotRailPanel | Backlot 快捷入口 |
| AgentRailPanel | 画布 Agent 调整 |
| HistoryRailPanel | 工作区版本历史 |
| WorkflowRailPanel | Workflow 配方 |
| InspectionPanel | 管线检查 |
| TaskCenterPanel | 任务中心（**partial**） |
| NextStepBanner | 下一步 CTA |

### 7.3 画布 Chrome 组件

| 组件 | 职责 |
|------|------|
| ModuleDock | 左侧模块库（38 项可见） |
| CommandPalette | 命令面板（Cmd+K） |
| CanvasFlowRail | 中央步骤条 |
| TakeRail | Take 缩略图轨 |
| ProductionWall | 生产进度墙 |
| CompareLightbox | Take 对比 |
| GridGeneratePanel | 宫格生成 |
| RecipePickerOverlay | 配方选择 |
| StageDeckTour | 新手引导 |

### 7.4 未挂载/孤立页面

| 文件 | 问题 |
|------|------|
| `pages/HomeDashboard.tsx` | 存在但未接入路由；workspaceList 硬编码空数组；`/?workspace=id` 未被 AppShell 解析 |

---

## 八、状态管理（Stores）

### 8.1 应用级 Stores（`apps/web/src/stores/`）

| Store | 职责 |
|-------|------|
| workspace-catalog | 工作区列表、activeId、CRUD |
| workspace-document | **SSOT**：storyboard、scriptPlan、playbookSession、characters、environments 等 |
| flow-runtime | 画布 runtime、选中节点；嵌入 storyboardUi、remotionUi |
| flow-commands | spawn block、load template、playbook actions |
| execution-queue | 批量运行 phase/progress |
| credential-vault | 设置抽屉 |
| skill-vault | Skills 抽屉 |
| user-session | 多用户 |
| activity-log | UI 日志 |
| toast | 通知 |
| director3d-ui | 3D 面板 |
| backlot-library-ui | Backlot 可见性 |
| stage-deck-flag | Feature flag |
| version-history | 工作区快照 |

### 8.2 Stage Deck Stores（`engine/stage-deck/stores/`）

| Store | 职责 |
|-------|------|
| context-rail-ui | Rail Tab 请求 |
| canvas-view | 视口、playbook lens |
| view-mode | explore / produce / review |
| deck-ui | Deck chrome |
| take-store | 每节点 Take 记录 |
| alias-store | 节点别名 |
| edge-menu-ui | 边上下文菜单 |
| canvas-agent-store | 画布 Agent |

### 8.3 状态 SSOT 缺口

| 层 | 目标枚举 | 当前 |
|----|----------|------|
| Project | draft/generating/paused/completed/exported | **缺失** |
| Workflow | idle/running/blocked/done/error | partial（playbookSession） |
| Step | pending/active/done/error/waiting/skipped | **仅四态** done/current/blocked/future |
| Node | idle/running/success/error/waiting/skip | 混用 status + executionStatus |
| Task | queued/running/failed/cancelled/done | 内存 batch，无持久中心 |

---

## 九、执行引擎（flow-runner）

**主文件**：`apps/web/src/engine/flow-runner.ts`（~1500 行）

### 9.1 能力

- 拓扑分层并行执行（max 3 并发）
- 62 种 block 的 execute 分支
- ReviewGateBlockedError 阻断 cascade
- upstream gather 收集上游输出
- Take Store 写回生成结果

### 9.2 已知简易逻辑 / Stub（GAP 表）

| ID | 位置 | 问题 | 用户影响 |
|----|------|------|----------|
| GAP-001 | music-gen | TTS 冒充 BGM | 以为生成了音乐 |
| GAP-002 | lipsync-pass | 视频原样透传 | 口型同步无效 |
| GAP-003 | montage render-remotion | 返回「P2 待实现」 | 服务端无法渲 Remotion |
| GAP-004 | ExportPackBlock HF/Remotion | appendLog 待实现 | 导出模式假按钮 |
| GAP-005 | picture-gen | 不解析 prompt 内 @角色名 | 批量 @角色失效 |
| GAP-006 | picture-gen-runner | 未传 n 参数 | 多图慢 |
| GAP-007 | motion-story | shotsToClipChain(全部镜) | 单镜节点跑全剧 |
| GAP-008 | export-pack runner | 只设 exportReady | 批量不打包 ZIP |
| GAP-009 | hyperframes-preview GET | 静态空 HTML | HF 预览无效 |
| GAP-010 | subtitle-burn | 单行 SRT | 多句对白不对齐 |
| GAP-011 | clip-editor | FFmpeg 无转场 | 硬切 |
| GAP-012 | chat-model runner | 非流式 proxyLlm | 与 Block UI 不一致 |
| GAP-013 | sketch-pad | 未绑 linkedShotId | 手绘不进故事板 |
| GAP-014 | story-grid | 槽位绑定 storyboard 弱 | 宫格→分镜靠手动 |
| GAP-015 | HyperFrames | 无 producer 时 FFmpeg 静帧 fallback | 无转场动效 |

---

## 十、服务端 AI Agent API

**模块**：`apps/server/src/modules/agent/`  
**控制器端点**：

| 端点 | 职责 |
|------|------|
| POST shot-script | 生成镜头脚本 |
| POST dialogue-parse | 对白解析 |
| POST script/skeleton | 故事骨架 |
| POST script/adaptation | 改编策略 |
| POST script/screenplay | 分集剧本 |
| POST production/director-plan | 导演规划 |
| POST production/storyboard-table | 分镜表 |
| POST production/materialize-shots | 物化镜头写入故事板 |
| POST extract-assets | 提取角色资产 |
| POST scene-split | 场次拆分 |
| POST extract-environments | 提取环境（返回 referenceUrls） |
| POST novel-events | 小说事件 |
| POST script/chat | 剧本对话 SSE |

**UI 覆盖缺口**：adaptation/screenplay/director-plan **无完整向导**（Script Studio 仅 4 phase）。

---

## 十一、Gateway 代理能力

**模块**：`apps/server/src/modules/gateway/`

| 能力 | 说明 |
|------|------|
| LLM | 含流式 |
| 图像生成 | 多 Provider |
| 视频生成 | Veo/Grok/Seedance 等 |
| TTS | 含 LuxTTS 探测 |
| FAL | 市场模型 |
| ComfyUI | 工作流执行 |

**前置**：Settings 配置对应 API Key；无 Key 时相关节点 Run 失败。

---

## 十二、Montage / 成片能力

**模块**：`apps/server/src/modules/montage/`

| 端点/能力 | 状态 |
|-----------|------|
| concat-episode / concat-clips | ok |
| mix-audio / color-grade | ok |
| subtitle-burn | partial（单行） |
| photo-speak | ok |
| transcribe | ok |
| depth-pass | ok |
| hyperframes-preview | stub（GAP-009） |
| render-hyperframes | partial |
| render-remotion | stub（GAP-003） |
| export-timeline | ok |

**Episode Studio**：`EpisodeStudioPanel.tsx` — Remotion 不可用时降级提示。

---

## 十三、Skills 系统

### 13.1 仓库内 Skills（17 个 `skills/*/SKILL.md`）

| 文件夹 | 名称 |
|--------|------|
| script-skeleton | 故事骨架 |
| script-adaptation | 改编策略 |
| script-screenplay | 分集剧本 |
| script-rewriter | 剧本改写 |
| production-director-plan | 导演规划 |
| production-storyboard-table | 分镜表 |
| storyboard-breaker | 分镜拆解 |
| storyboard-sketch | 线稿分镜 |
| cinema-prompt | 电影感提示词 |
| prompt-polish | 提示词润色 |
| voice-assigner | 角色配音分配 |
| seedance-sequence | Seedance 连续剧情 |
| seedance-continuation | Seedance 续拍 |
| seedance-first-last-frame | Seedance 首尾帧 |
| seedance-reference-workflow | Seedance 多模态引用 |
| seedance-vocab-zh | Seedance 中文词汇 |
| seedance-examples-zh | Seedance 中文范例 |

### 13.2 服务端

- CRUD：`/api/skills`
- 种子：`POST /api/skills/seed/seedance`

---

## 十四、Director3D 包

**路径**：`packages/director3d/`

| 组件 | 职责 |
|------|------|
| DirectorCanvas | Three.js 场景 |
| TransformRail | 变换控制 |

**成熟度**：partial 65% — mesh 可见，depth 简化。

---

## 十五、Remotion 包

**路径**：`packages/remotion-compositions/`

- ImageClip、VideoClip 等组合
- 服务端 render-remotion 未完整实现
- 前端 Episode Studio 可降级播放

---

## 十六、测试覆盖现状

### 16.1 服务端 Vitest（16 suites）

覆盖：pipeline readiness、playbook orchestration、agent、flow domain、storyboard、grid、montage、gateway、hyperframes、remotion、review-gate、workflow templates、workspace、view-mode、tools。

### 16.2 前端 Playwright（2 specs）

| Spec | 覆盖 |
|------|------|
| e2e-001 | 创建工作区 → 添加 prompt 节点 |
| e2e-playbook | 选择线稿 Playbook → 步骤条可见 |

### 16.3 关键缺口

- **无 13 步全流程 E2E**（TEST-PIPE-UX-E2E-001 = MANUAL）
- 无 `apps/web/src/` 单元测试
- queue 模块无测试
- director3d / remotion 仅 typecheck

---

## 十七、PRD 20 条问题对照（产品体验）

| # | 问题 | 完成% | 状态 |
|---|------|-------|------|
| 1 | 像 Workflow 编辑器不像漫剧工具 | 45% | partial |
| 2 | 无主流程/无视觉焦点 | 55% | partial |
| 3 | 信息密度过高 | 40% | partial |
| 4 | 顶栏步骤不参与流程 | 70% | partial |
| 5 | 模式切换画布不变 | 65% | partial |
| 6 | 非配置驱动 Workflow | 50% | partial |
| 7 | 节点无依赖/门禁 | 35% | partial |
| 8 | 无完成感 | 20% | missing |
| 9 | 节点像后台表单 | 45% | partial |
| 10 | 画布利用率低 | 55% | partial |
| 11 | 非 Storyboard 中心 | 40% | partial |
| 12 | 缺时间轴 | 55% | partial |
| 13 | 状态管理差 | 50% | partial |
| 14 | 无自动推进 | 60% | partial |
| 15 | 无全局任务系统 | 10% | missing |
| 16 | 检查中心无价值 | 35% | partial |
| 17 | 缺自动保存 | 80% | ok |
| 18 | 缺项目状态 | 5% | missing |
| 19 | 生成过程不可视 | 40% | partial |
| 20 | 无产品节奏 | 15% | missing |

**加权产品体验层整体：约 42%**

---

## 十八、典型用户流程（现状）

### 18.1 新用户首次进入（实际）

```
打开 5173
  → 自动创建「默认工作区」
  → 看到：左侧 WorkspaceRail + ModuleDock(38项) + 空/乱画布 + 顶栏多按钮 + 右侧 Context Rail
  → 可能弹出 PlaybookLauncher（若画布空且未 dismiss）
  → 用户迷茫：不知道先配置 API 还是先选模式
```

### 18.2 理想 13 步流程（设计意图）

```
PlaybookLauncher 选「AI 漫剧·真人」
  → replace 加载 tpl-pipeline-13-live（13 节点单链）
  → CanvasFlowRail 显示 13 步 + 完成状态
  → 按步：Script Rail 写剧本 → 拆场 → 分镜 → 角色库 → 环境库(多参考图) → 导演台 → 批量关键帧 → 审帧 → 视频 → 连贯 → 成片 → 门控 → 导出
```

### 18.3 断链点（用户易卡住的位置）

| 步骤 | 断链原因 |
|------|----------|
| 全局 | 未配置 Settings API Key |
| ① 剧本 | 保存后未自动跳到 ②（auto-advance 不完整） |
| ⑤ 环境 | 缺参考图时 readiness false，但用户可能不知道要去哪张卡上传 |
| ⑥ 机位 | director-desk 需手动关联 linkedBlockId |
| ⑦ 关键帧 | 批量运行失败无红色步骤态（仅 blocked） |
| ⑨ 视频 | motion-story 可能跑全剧而非当前镜（GAP-007） |
| ⑪ 成片 | Remotion 降级 / HF stub |
| ⑬ 导出 | 部分导出模式未实现 |

---

## 十九、给 ChatGPT 的审查提示（可直接复制）

请将 NX9 视为「AI 漫剧创作工作室」，底层能力约 73% 完成，产品体验约 42%。请基于上文事实，分析：

### 19.1 产品定位

1. 当前 UI 为何仍像 Workflow 编辑器？哪些组件应删除或 conceal？
2. 「30 秒测试」（新用户能否说「我在写漫剧第 X 步」）能否通过？不能则缺什么？

### 19.2 信息架构 / UI

1. 首屏应保留哪 ≤7 个控件？其余如何渐进披露？
2. ModuleDock 38 项是否应默认隐藏？替代入口是什么？
3. StoryboardPanel 全屏 vs StoryboardRail 是否重复？
4. 用户词典（Node→步骤、Workflow→创作流程）哪些文案未替换？

### 19.3 流程 / 逻辑

1. 13/11 步 Playbook 与画布节点、Rail 操作是否一一对应？还有哪些 desync？
2. readiness 20 个 key 的判定是否合理？假阳性/假阴性？
3. 自动推进（剧本保存→拆场）应发生在哪些 hook？
4. 节点依赖引擎最小版应阻断哪些越级 Run？

### 19.4 原型 / 交互

1. CanvasFlowRail 四态是否足够？六态 error/waiting 应如何表现？
2. 环境库多参考图交互是否符合「场景卡」心智？
3. blocked 步 tooltip +「去修复」是否覆盖所有卡点？

### 19.5 架构 / 重构优先级

1. P0（4-6 周）应做哪 5 件事才能「一个完整闭环」？
2. `workflow.schema.json` 是否应替代硬编码 Playbook？
3. queue 模块注册 + Task Center 是否 P0 必须？
4. HomeDashboard 应如何接入？

### 19.6 强制要求（可写入开发规范）

1. 哪些行为应写入「产品宪法」红线？
2. 每个 PR 应如何证明「删了什么入口」？
3. 完成定义：§8 手动走查脚本 M1-M8 应包含什么？

---

## 二十、关键源文件索引

| 类别 | 路径 |
|------|------|
| 产品 PRD | `Product Optimization.md` |
| 重构总规范 | `docs/NX9-PRODUCT-REFACTOR-SPEC.md` |
| 能力审计 | `docs/NX9-CAPABILITY-AUDIT-SPEC.md` |
| 13 步 Spec | `docs/NX9-13STEP-PRODUCTION-PIPELINE-SPEC.md` |
| 画布流程 Spec | `docs/NX9-PIPELINE-CANVAS-FLOW-SPEC.md` |
| Playbook 定义 | `packages/shared/src/data/playbook-definitions.ts` |
| Workflow 模板 | `packages/shared/src/data/workflow-templates.ts` |
| Block 目录 | `packages/shared/src/catalog/block-catalog.ts` |
| Block 注册 | `apps/web/src/blocks/registry.tsx` |
| 执行引擎 | `apps/web/src/engine/flow-runner.ts` |
| 工作区 SSOT | `apps/web/src/stores/workspace-document.ts` |
| 应用壳 | `apps/web/src/layout/AppShell.tsx` |
| 画布 | `apps/web/src/engine/FlowSurface.tsx` |
| 步骤条 | `apps/web/src/engine/stage-deck/chrome/CanvasFlowRail.tsx` |
| 测试报告 | `docs/test-reports/TEST-PIPE-UX-RUN-2026-07-10.md` |

---

## 二十一、版本说明

| 字段 | 值 |
|------|-----|
| 文档版本 | v1.0 |
| 生成日期 | 2026-07-10 |
| 项目版本 | nx9@0.1.0 |
| 下次更新触发 | 完成 PO-FLOW-001/PO-UI-003 或 13 步 E2E PASS 后 |

---

*本文档仅描述仓库现状与已记录缺口，不包含未经验证的优化方案。实施请以 `NX9-PRODUCT-REFACTOR-SPEC.md` 为 SSOT。*
