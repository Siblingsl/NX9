# NX9 功能借鉴 · 行业拆解 · 节点完善总纲

> **文档用途**：从 `Reference_Projects` 与 AI 短剧/漫剧/图文平台借鉴能力，**融入 NX9 身份**（Lane + Take + 故事板 + Recipe），并给出**全节点**增强、Bug 修复、实现与验收规范。  
> **读者**：产品/开发者（人类）+ 实现代码的 AI Agent。  
> **关联**：`STAGE-DECK-NODES-INTERACTIONS.md` · `STAGE-DECK-CANVAS-REDESIGN.md` · `NX9-PRD.md` · `packages/shared/src/catalog/block-catalog.ts`  
> **更新**：2026-07-08

---

## 0. 如何使用本文档

### 0.1 人类阅读路径

| 你想… | 跳转到 |
|--------|--------|
| 了解「借鉴什么、不抄什么」 | §1 + §2 总结表 |
| 看短剧/漫剧竞品能力怎么落到 NX9 | §3 + §4 Epic 路线图 |
| 修某个节点 Bug / 加功能 | §6 节点 Playbook（按 `kind` 搜） |
| 让 AI 写代码前对齐规范 | §5 **强制规范**（必须整段粘贴进 Agent 任务） |
| 跑验收 | §5.3 测试命令 + 各节点「验收清单」 |

### 0.2 AI Agent 阅读路径（强制）

实现任一任务前，**必须**在 PR/commit 描述中引用：

1. **任务 ID**（如 `EPIC-S01` / `NODE-PIC-001` / `BUG-SND-002`）
2. **融合原则**（§1.2 检查：是否违反「禁止抄袭 UI」）
3. **实现方案**（§5.1 模板填完整）
4. **验收命令**（§5.3 至少跑 `typecheck` + 节点手测步骤）
5. **Bug 修复协议**（§5.4：若失败，先定位层再改）

> **禁止**：复制 Reference 项目的布局（T8 左栏 256px、13 主题、Placement Bar UI、NodeID 角标等）。**允许**：复制「生产语义」（分镜表结构、S-Class 分组、审阅门控、Take 多版本）。

---

## 1. NX9 身份与融合原则

### 1.1 一句话定位

**Stage Deck Canvas = 空间工作流（节点图）+ 泳道语义 + Take 审片 + 故事板双向绑定 + Recipe 默认入口。**

不是：线性 11 步向导（huobao）、不是五 Tab 桌面（moyin）、不是 T8 节点 1:1 镜像。

### 1.2 禁止抄袭 vs 允许借鉴

| ❌ 禁止（形式抄袭） | ✅ 允许（语义融入） |
|-------------------|---------------------|
| T8 左栏 Module 列表 256px | Dock 28 + CommandPalette 进阶模块 |
| 13 套主题 / 游戏化 overlay | 固定 NX9 品牌 token |
| waoowaoo 纯 Tab 无画布 | PipelineCapsule + 画布 Recipe |
| huobao 整页 11 步替换画布 | 11 步 **readiness 映射** 到 PipelineCapsule |
| 照搬竞品 Logo/文案/配色 | 能力拆解后用 NX9 节点名与交互 |
| 浏览器直连 API Key | NestJS `api` proxy（现有架构） |

### 1.3 融入 NX9 的固定挂载点

| 能力类型 | NX9 挂载位置 | 持久化 |
|----------|-------------|--------|
| 生产阶段 | `PipelineCapsule` + `stage-readiness.ts` | workspace v3 |
| 多版本 | `take-store.ts` + TakeRail | `takes[]` |
| 批审 | `review-gate` + Storyboard `approved` | `storyboard.shots[].status` |
| 角色一致 | `character-sheet` + Backlot | `characters` + block `data` |
| 配方入口 | `RecipePickerOverlay` + `WORKFLOW_TEMPLATES` | 模板 id |
| 进阶模块 | `concealed` + CommandPalette | catalog |

---

## 2. Reference_Projects 借鉴矩阵

**目录**：`Reference_Projects/`（7 项，无 libtv）

| 项目 | 范式 | 最值得借鉴的 3 点 | NX9 融入方案（Epic ID） |
|------|------|------------------|------------------------|
| **T8-penguin-canvas** | 节点图 | Director 分镜时间线；Bridge 镜头；上游 exclude 芯片 | `EPIC-T01` motion-story 约束；`NODE-DSK-002` |
| **infinite-canvas-main** | 双画布 JS | Loop 轮次隔离；ComfyUI 工作流；PS/Chrome 采集 | `EPIC-I01` comfy 块；`EPIC-I02` 采集扩展 |
| **infinite-canvas-main1** | React 本地 | Canvas Agent 确认卡；Gen-config 聚合；Prompt 库同步 | `EPIC-I03` AgentRail；Backlot 远程模板 |
| **waoowaoo** | SaaS 阶段 | Stage readiness；工作流 lease；下游 stale 一键重跑 | `EPIC-W01` Pipeline 点击修复 Recipe |
| **moyin-creator** | 5 面板 | Character Bible 6 层；S-Class ≤15s；三层 prompt 融合 | `EPIC-M01` Bible；`EPIC-M02` S-Class 编译器 |
| **huobao-drama** | 11 步 + Agent | SKILL.md 剧本改写；宫格→切分→绑定；FFmpeg 合成 | `EPIC-H01` shot-script Agent；`EPIC-H02` 成片导出 |
| **storyai-3d-director** | 3D 预演 | Capture 元数据；全景背景绑定；Pose 库 | `EPIC-3D01` Take.meta 相机字段 |

### 2.1 按优先级排序的 Epic（实施顺序）

| 优先级 | Epic ID | 标题 | 来源 | 预计迭代 |
|--------|---------|------|------|----------|
| **P0** | EPIC-M02 | Seedance S-Class 分组 + 约束校验 UI | moyin | 1 |
| **P0** | EPIC-H01 | shot-script LLM 填充（SKILL 方法论） | huobao | 1 |
| **P0** | BUG-BATCH | 节点/Runner 一致性 Bug 清零 | 内部 | 1 |
| **P1** | EPIC-M01 | Character Bible → Backlot 六层锚点 | moyin | 2 |
| **P1** | EPIC-H02 | 单集 FFmpeg compose + export-pack 串联 | huobao | 2 |
| **P1** | EPIC-T01 | Bridge 镜头 / 多参考 clip 链 | T8 | 2 |
| **P1** | EPIC-W01 | stale →「重跑下游链」一键 | waoowaoo | 2 |
| **P2** | EPIC-I01 | `comfy-workflow` 服务端提交块 | infinite-canvas | 3 |
| **P2** | EPIC-3D01 | director-3d 截图 meta → clip-gen 运镜 | storyai | 3 |
| **P2** | EPIC-I02 | 浏览器采集 → `/api/assets/import` | infinite-canvas tools | 3 |
| **P3** | EPIC-I03 | GitHub Prompt 包 → Backlot | main1 | 4 |

---

## 3. 行业平台功能拆解（开源/商业）

> 以下为用户侧能力拆解，**非代码移植**；实现均映射到 NX9 节点 + 故事板 + 服务端。

### 3.1 能力分层模型

```text
L0 创意输入    小说 / 梗概 / 参考视频 URL
L1 结构化      剧本 / 分镜表 / 角色卡 / 场景卡
L2 资产生成    定妆 / 三视图 / mood board / 配音采样
L3 镜头生成    静帧 / I2V / 口播 / 多 Take
L4 审阅        网格批审 / Take pick / review-gate
L5 后期        调色 / 混音 / 字幕 / 节拍
L6 交付        竖屏 9:16 成片 / ZIP / EDL / 时间线 JSON
```

### 3.2 竞品能力对照（2025–2026 主流）

| 能力 | 剧火AI / 多财多亿 | MkAnime / Lumen Flow | 可灵 / 即梦类 | NX9 现状 | NX9 目标实现 |
|------|------------------|---------------------|--------------|----------|-------------|
| 小说→分镜 | ✓ 一键 | ✓ | △ | shot-script 手填 | EPIC-H01 Agent 填充 |
| 角色一致性 | 虚拟演员库 | 角色复用 | 参考图 | character-sheet + @mention | EPIC-M01 Bible |
| 逐镜视频 | Seedance 集成 | 关键帧→视频 | 强 | motion-story / clip-gen | EPIC-M02 S-Class |
| 单镜重试 | ✓ | ✓ 只重做一镜 | ✓ | Take + 重跑 | TakeRail 已有 |
| 竖屏成片 | ✓ 9:16 | ✓ | ✓ | export-pack 部分 | EPIC-H02 |
| 配音+口型 | 内置 | 口型同步 | △ | photo-speak, sound-gen | 增强 LuxTTS 绑定 |
| 批量 100 集 | 商业流水线 | Lumen 10万字 | ✗ | iterator + 队列 | EPIC-W02 任务队列 |
| 审阅门控 | △ | △ | ✗ | review-gate ✓ | 批审后自动续跑 |
| 零 Prompt | 商业强调 | ✓ | △ | Recipe 入口 ✓ | PipelineCapsule 引导 |

### 3.3 图文 / 热门视频制作平台（能力借镜）

| 平台类型 | 代表能力 | NX9 映射 |
|----------|----------|----------|
| 小红书/抖音图文 | 模板排版、多图拼接、风格滤镜 | `grid-compose` + `style-lab` Recipe |
| 剪映/CapCut | 时间线、转场、字幕轨 | `clip-editor` + `subtitle-burn` + Remotion |
| Midjourney/即梦 | 多图参考、角色 cref | `picture-gen` 多参考 + character-sheet |
| ComfyUI 社区 | 工作流 JSON 复用 | EPIC-I01 comfy-workflow |
| 爆款复刻 | 链接→结构→分镜 | `link-parser` + chat-model + shot-script |

---

## 4. 路线图与 Recipe 扩展

### 4.1 已有 Recipe（`WORKFLOW_TEMPLATES`）

| ID | 用途 |
|----|------|
| `tpl-nx9-character-pipeline` | 角色设定→出图（空画布默认） |
| `tpl-nx9-review-pipeline` | 分镜→审阅关卡→交付 |
| `tpl-shot-script-desk` | 镜头脚本→导演台→动效 |
| 其余 | 文生图、宫格、口播等 |

### 4.2 待增 Recipe（文档规划，非必须一次实现）

| ID | 链 | Epic |
|----|-----|------|
| `tpl-sclass-seedance` | shot-script → director-desk → motion-story (分组) → review-gate | EPIC-M02 |
| `tpl-novel-import` | chat-model → shot-script → 一键开拍 | EPIC-H01 |
| `tpl-vertical-episode` | clip-gen×N → clip-editor → audio-mix → export-pack (9:16) | EPIC-H02 |
| `tpl-contact-sheet` | story-grid → grid-split → continuity-check | 已有组件，补 Recipe |

---

## 5. AI 实施强制规范

### 5.1 实现方案模板（每个任务必填）

```markdown
### 任务 ID: NODE-XXX-NNN / EPIC-XXX

**目标**：一句话

**融合检查**（§1.2）：
- [ ] 未复制禁止 UI
- [ ] 数据写入 node.data / workspace v3 / take-store

**改动文件**（预期）：
- packages/shared/...
- apps/web/src/blocks/...
- apps/web/src/engine/flow-runner.ts（若可运行）
- apps/server/...（若新 API）

**实现步骤**：
1. ...
2. ...

**数据契约**（node.data 字段）：
| 字段 | 类型 | 说明 |
|------|------|------|

**非目标**（明确不做）：
- ...
```

### 5.2 代码约束

1. **单任务单 diff**：一个 PR/会话只做一个 Epic 或一组 Bug ID。
2. **Runner 与 Block 同步**：可运行块必须在 `RUNNABLE_BLOCKS` + `flow-runner.executeBlock` + Block UI 三处一致。
3. **Stage Deck**：新 UI 控件放在**节点内**或 **TakeRail/ContextRail**，不恢复底部 ComposerDeck。
4. **shared 变更**：先 `npm run build -w @nx9/shared`，再 `npm run typecheck -w @nx9/web`。
5. **PowerShell**：命令用 `;` 不用 `&&`。

### 5.3 验收命令（最低门槛）

```powershell
cd f:\code\project\NX9
npm run build -w @nx9/shared
npm run typecheck -w @nx9/web
# 若改 server：
npm run build -w @nx9/server
```

**手测清单（Stage Deck 工作区）**：

- [ ] 空画布 Recipe 可加载
- [ ] 生产模式折叠卡正常；审片模式 TakeRail 出现
- [ ] 运行选中 / Cascade 无 console 红错
- [ ] 刷新后 node.data / takes / storyboard 持久化
- [ ] CommandPalette 可搜到 concealed 模块

### 5.4 Bug 修复协议（四层定位）

| 层 | 症状 | 查什么 | 怎么修 |
|----|------|--------|--------|
| **L1 UI** | 按钮无反应 | Block 组件 `onClick` / `updateNodeData` | 补事件、nodrag 区域 |
| **L2 Runner** | UI 成功但批量失败 | `flow-runner.ts` `executeBlock` | 对齐 block 内逻辑；补 upstream gather |
| **L3 API** | 500 / 空 URL | `apps/server` + `api/client.ts` | 修 DTO、FFmpeg 路径、轮询 |
| **L4 数据** | 刷新丢失 | `flow-payload.ts` v3 字段 | 补 persist / hydrate |

**修复后必须**：更新 §6 或 §8 对应 Bug 行状态为 `fixed` + 手测步骤。

---

## 6. 全节点 Playbook

**图例**：

- **Dock**：`getDockBlocks()` 可见（28）
- **Pal**：CommandPalette 可 spawn（含 concealed）
- **状态**：`ok` | `partial` | `stub` | `deprecated`
- **Bug**：`BUG-XXX-NNN`

### 6.1 素材 Source

#### `asset-import`（Dock · ok）

| 维度 | 内容 |
|------|------|
| **增强** | 拖入自动识别 mediaKind；粘贴 URL；与 Backlot 绑定标签 |
| **Bug** | BUG-AST-001 大文件无进度条 |
| **实现** | `AssetImportBlock.tsx` + upload API |
| **验收** | 拖 PNG → `data.assetUrl` 有值 → preview-sink 可显示 |
| **修复** | L3 查 `/api/assets/upload` |

#### `preview-sink`（Dock · ok）

| 维度 | 内容 |
|------|------|
| **增强** | 支持多上游 picture 网格预览；Take 主版镜像 |
| **Bug** | BUG-PRV-001 仅显示第一张 |
| **验收** | picture-gen → preview-sink 缩略图更新 |

#### `asset-watch`（Pal · partial）

| 维度 | 内容 |
|------|------|
| **增强** | URL hash 变更触发 `dag-stale` 下游 |
| **Bug** | BUG-AWT-001 未接 cascade 自动重跑 |
| **实现** | `AssetWatchBlock` + `flow-runner` 轮询 optional |
| **验收** | 改 URL → 下游节点 stale 橙标 |

#### `mesh-import` / `mesh-viewer`（Pal · partial）

| 维度 | 内容 |
|------|------|
| **增强** | 与 director-3d 一键发送 |
| **Bug** | BUG-MESH-001 大 glb 预览卡顿 |
| **验收** | 上传 glb → mesh-viewer 可旋转预览 |

---

### 6.2 生成 Generate（核心产能）

#### `prompt`（Dock · ok）

| 维度 | 内容 |
|------|------|
| **借鉴** | infinite-canvas @mention 批出图 |
| **增强** | 行级绑定上游素材；Backlot 模板行注入 |
| **Bug** | BUG-PRM-001 多行与 iterator 并联时索引错位 |
| **验收** | 3 行 prompt + 3 张 ref → picture-gen 出 3 张 |
| **修复** | L2 `gatherUpstream` 与 PromptBlock row 对齐 |

#### `picture-gen`（Dock · partial→ok）

| 维度 | 内容 |
|------|------|
| **借鉴** | moyin 多参考；T8 exclude 芯片 |
| **增强** | FLUX i2i 参考预览 ✓；加「排除某张参考」chip；失败重试计数 |
| **Bug** | BUG-PIC-001 轮询超时仍 success；BUG-PIC-002 @角色 未解析 |
| **实现** | `picture-gen-runner.ts` 统一 runner；Block 只调 runner |
| **验收** | 选 FLUX → 运行 → Take 追加 → pick 主版 thumb 更新 |
| **修复** | L3 `pollVideo`/`generateImage` 超时设 error |

#### `clip-gen`（Dock · partial）

| 维度 | 内容 |
|------|------|
| **借鉴** | Seedance @Image/@Video 约束（moyin S-Class） |
| **增强** | 宽高比/时长 ✓；**约束校验 UI**（≤9 图 ≤3 视频）；轮询按钮 ✓ |
| **Bug** | BUG-CLP-001 异步 task 未 poll 假成功 |
| **验收** | 提交 Veo → 点查询 → URL 写入 → Take |
| **修复** | L2 与 picture-gen 共用 poll  helper |

#### `motion-story`（Dock · partial）

| 维度 | 内容 |
|------|------|
| **借鉴** | moyin S-Class ≤15s 分组；T8 bridge timeline |
| **增强** | EPIC-M02：分组预览、Seedance prompt 编译、失败单组重跑 |
| **Bug** | BUG-MST-001 未读 storyboard linkedShotId |
| **验收** | director-desk 绑定镜头 → motion-story 用镜头 prompt |

#### `director-desk`（Dock · ok）

| 维度 | 内容 |
|------|------|
| **借鉴** | waoowaoo 多候选；T8 director storyboard |
| **增强** | 并发进度条；与 review-gate 联动标记 |
| **Bug** | BUG-DSK-001 部分 provider 错误未写 node.data.error |
| **验收** | 绑定 shot → 运行 → storyboard 状态 generating→review |

#### `sound-gen`（Dock · partial）

| 维度 | 内容 |
|------|------|
| **现状** | TTS/LuxTTS ✓；**明确非 Suno 音乐** |
| **增强** | 角色默认音色；批量对白 iterator 模式 |
| **Bug** | BUG-SND-001 LuxTTS 无 ref 报错文案已 ok；BUG-SND-002 BGM 需求误用本节点 |
| **验收** | 文本 + ref 音频 → `/media/...wav` → 下游 clip-editor |
| **修复** | 文档/Recipe 引导 BGM 用外部或未来 `music-gen` concealed |

#### `chat-model`（Dock · ok）

| 维度 | 内容 |
|------|------|
| **增强** | Skill 注入开关；输出「写入 shot-script」一键 |
| **Bug** | BUG-LLM-001 流式中断 status 卡 running |
| **验收** | Skill 注入 → 输出 → 复制到 prompt 块 |

#### `photo-speak`（Dock · ok）

| 维度 | 内容 |
|------|------|
| **借鉴** | 小云雀口播；MkAnime 口型 |
| **增强** | LuxTTS 声线 + 口播视频一条龙状态机 |
| **Bug** | BUG-PSP-001 ref 音频路径需手填 |
| **验收** | tpl-photo-speak 全链跑通 |

#### `clip-editor`（Dock · partial）

| 维度 | 内容 |
|------|------|
| **借鉴** | T8 clip editor timeline |
| **增强** | 转场 preset；从 storyboard 按序导入 clip |
| **Bug** | BUG-CED-001 多片段 concat 失败 silent |
| **验收** | 2 clip 上游 → 拼接 URL 输出 |

#### `shot-script`（Dock · ok）

| 维度 | 内容 |
|------|------|
| **借鉴** | huobao script agent；moyin script parser |
| **增强** | 一键开拍 ✓；**EPIC-H01** LLM 从小说填充表 |
| **Bug** | BUG-SCR-001 重复写入 storyboard 未 dedupe index |
| **验收** | 填 3 行 → 一键开拍 → storyboard +3 + director-desk spawn |

---

### 6.3 NX9 生产链 Craft / NX9 blocks

#### `character-sheet`（Dock · ok）

| 维度 | 内容 |
|------|------|
| **借鉴** | moyin Character Bible；MkAnime 角色库 |
| **增强** | 设定图上传 ✓；Vision 填档案 ✓；**EPIC-M01** 六层锚点导出 Backlot |
| **Bug** | BUG-CSH-001 大 sheet 图 OCR 超时无重试 |
| **验收** | 上传设定图 → 识别 → @角色 在 picture-gen 生效 |

#### `reference-board`（Dock · ok）

| 维度 | 内容 |
|------|------|
| **增强** | 多图 mood board 网格；输出约束 prompt 到下游 |
| **Bug** | BUG-REF-001 仅支持 URL 字符串非上传 |
| **验收** | 2 张 mood → picture-gen 风格一致 |

#### `prompt-studio` / `style-lab`（Dock · ok）

| 维度 | 内容 |
|------|------|
| **增强** | 肖像/姿势 Tab ✓；preset 多选记忆到 node.data |
| **Bug** | BUG-PST-001 deprecated kind 迁移 tab 丢失 |
| **验收** | cinema-prompt 旧工作区打开 → prompt-studio cinema tab |

#### `story-grid` / `grid-split` / `grid-compose`（Dock · ok/partial）

| 维度 | 内容 |
|------|------|
| **借鉴** | huobao 宫格→切分→绑定 |
| **增强** | GridGeneratePanel → assign shot；frame role first/last |
| **Bug** | BUG-GRD-001 split 行列与 story-grid 不一致 |
| **验收** | P2-05 宫格流程手测 |

#### `continuity-check`（Dock · partial）

| 维度 | 内容 |
|------|------|
| **增强** | 输出 diff 报告 markdown；跳转可疑 shot |
| **Bug** | BUG-CNT-001 LLM 失败无 partial 报告 |
| **验收** | 2 picture 上游 → 报告含光影/服装项 |

---

### 6.4 审阅 / 协作 Support

#### `review-gate`（Dock · ok）

| 维度 | 内容 |
|------|------|
| **借鉴** | OpenMontage 审阅门控；PRD P0 |
| **增强** | 阻塞自动批审 ✓；**待做** 批审通过后 Cascade 自动续跑 |
| **Bug** | BUG-RVG-001 批量 error 覆盖 blocked（已修 ReviewGateBlockedError） |
| **验收** | tpl-nx9-review-pipeline → 未 approve → blocked → 网格批审 → 重新检查 pass |

#### `memo`（Dock · ok）

| 维度 | 内容 |
|------|------|
| **增强** | 绑定 linkedShotId 显示镜头备注 |
| **验收** | 纯文本 persist |

#### `variant-fork` / `recipe-spawn` / `prompt-diff`（Pal · partial）

| 维度 | 内容 |
|------|------|
| **增强** | variant A/B Take 对比；recipe-spawn 合并到 RecipePicker |
| **Bug** | BUG-VAR-001 fork 未复制子图仅标记 |
| **验收** | prompt-diff 两路 prompt → mergeSuggestion |

---

### 6.5 后期 Utility（concealed 为主）

| kind | 状态 |  top 增强 | top Bug |
|------|------|----------|---------|
| `subtitle-burn` | partial | SRT 时间轴导入 | BUG-SUB-001 仅纯文本 |
| `audio-mix` | partial | 多轨电平 UI | BUG-AMX-001 单轨 fail 全 fail |
| `color-grade` | partial | LUT preset | BUG-CLR-001 仅 sliders |
| `beat-sync` | partial | 导入 BPM 文件 | BUG-BTS-001 无 clip 上游空切点 |
| `export-pack` | ok | 含 takes + storyboard manifest | BUG-EXP-001 跨域 URL 下载 fail |
| `local-enhance` | partial | Topaz 队列状态 | BUG-LOC-001 |
| `bg-remove` | ok | Fal BiRefNet | BUG-BGR-001 大图 timeout |
| `iterator` | ok | Loop 轮次 Take 隔离 EPIC-W01 | BUG-ITR-001 parallel 模式 edge 丢失 |
| `text-chunker` | ok | 章节 detect | — |
| `link-parser` | partial | 抖音/B 站适配器分平台 | BUG-LNK-001 部分站点失效 |
| `batch-runner` | stub | 与 iterator 合并文档说明 | — |

---

### 6.6 空间 Spatial

| kind | 状态 | 增强 | Bug |
|------|------|------|-----|
| `director-3d` | ok | EPIC-3D01 capture meta → clip prompt | BUG-3D-001 截图未写 Take meta |
| `blocking-stage` | partial | 机位序列导出 prompt | BUG-BLK-001 |
| `light-rig` | partial | preset → prompt ✓ | — |
| `depth-pass` | partial | server depth API | BUG-DEP-001 ffmpeg 不可用时报错不清 |
| `panorama-sphere` | partial | 与 director-3d 全景 sync | BUG-PAN-001 |

---

### 6.7 集成 Integrate

| kind | 状态 | 说明 |
|------|------|------|
| `model-market` | partial | 合并 fal/comfy；需统一 runner |
| `fal-market` / `comfy-market` | deprecated | 迁移到 model-market |
| **规划** `comfy-workflow` | — | EPIC-I01 新 kind，concealed |

---

### 6.8 Deprecated（仅迁移）

`cinema-prompt` 等 → `prompt-studio` / `style-lab`；加载时 `migrateBlockKinds()`。**验收**：旧 ZIP 导入后无 GenericBlock 占位（除真正 stub）。

---

## 7. 跨节点 Bug 总表（优先修复）

| ID | 严重性 | 描述 | 层 | 状态 | 负责人任务 |
|----|--------|------|-----|------|------------|
| BUG-PIC-001 | P0 | 图像异步未 poll 假 success | L2 | open | 统一 poll helper |
| BUG-CLP-001 | P0 | 视频同上 | L2 | open | 同上 |
| BUG-SCR-001 | P1 | shot-script 重复 append 镜头 | L4 | open | addShots dedupe |
| BUG-RVG-002 | P1 | 批审通过后无自动续跑 | L2 | open | FlowSurface resume cascade |
| BUG-3D-001 | P2 | 截图缺少 camera meta | L4 | open | EPIC-3D01 |
| BUG-GRD-001 | P2 | 宫格行列不一致 | L1 | open | grid-split 读 meta |
| BUG-EXP-001 | P2 | export 跨域 CORS | L3 | open | server proxy download |
| BUG-ITR-001 | P2 | iterator parallel 丢边 | L2 | open | loop-executor |

---

## 8. Epic 详细实现摘要（供 AI 直接开工）

### EPIC-M02 Seedance S-Class 编译器（P0）

**目标**：`motion-story` / `director-desk` 按 ≤15s 分组 storyboard shots，生成合规 Seedance prompt。

**文件**：`packages/shared/src/utils/sclass-compiler.ts`（新）、`MotionStoryBlock.tsx`、`shot-grouping.ts`

**验收**：
1. 导入 tpl-shot-script-desk，20s+30s 两镜头 → 分为 2 组
2. 超 9 张参考图 → UI 阻断并提示
3. typecheck 通过

---

### EPIC-H01 shot-script Agent 填充（P0）

**目标**：从小说文本/粘贴章节 → 填充 `scriptRows`。

**文件**：`apps/server/src/modules/agent/`、`ShotScriptBlock.tsx` 加「AI 拆镜」

**借鉴**：`Reference_Projects/huobao-drama-master/skills/script_rewriter/SKILL.md`（方法论，不拷代码）

**验收**：
1. 粘贴 500 字 → ≥3 行 scriptRows
2. durationSec/shotType 合法
3. 失败显示 error 非 silent

---

### EPIC-H02 竖屏单集合成（P1）

**目标**：`export-pack` 或新 `episode-compose` 调 server concat + mix audio + 9:16。

**文件**：`montage.service.ts`、`ExportPackBlock.tsx`

**验收**：3 clip + 1 audio → 单 mp4 URL；storyboard requireApproved  respected

---

### EPIC-W01 stale 一键重跑下游（P1）

**目标**：节点 stale 时 ContextRail / 右键「重跑下游链」。

**文件**：`dag-stale.ts`、`FlowContextMenu.tsx`、`cascade-runner.ts`

**验收**：改 prompt 上游 → 下游 stale → 一键 cascade → 仅下游+本节点执行

---

## 9. 文档维护规则

1. 每合并一个 Epic / Bug fix，更新 §6 状态或 §7 表。
2. 新增 `kind` 必须同时更新：`block-catalog.ts`、`registry.tsx`、`socket-registry.ts`、`RUNNABLE_BLOCKS`（若可运行）、§6 一节。
3. 新 Recipe 写入 `workflow-templates.ts` + §4.1 表 + `RecipePickerOverlay` FEATURED（若面向空画布）。

---

## 10. 快速命令索引

```powershell
# 统计 Dock 节点数
node -e "const { getDockBlocks, getSpawnableBlocks } = require('./packages/shared/dist/cjs/catalog/block-catalog.js'); console.log('dock', getDockBlocks().length, 'spawn', getSpawnableBlocks().length)"

# 全量校验
npm run build -w @nx9/shared; npm run typecheck -w @nx9/web

# 启动开发（若已有 script）
npm run dev -w @nx9/web
```

---

*本文档为 NX9 功能演进的单一事实来源（SSOT）补充件；与 PRD 冲突时以 PRD 硬约束为准，以本文档实施细节为准。*
