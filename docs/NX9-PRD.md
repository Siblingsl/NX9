# NX9 Studio 产品需求文档（PRD）

## AI 速读卡

- **产品一句话**：NX9 是一款 AI 节点画布工作流工具，让创作者用拖拽连线编排「剧本→分镜→生成→配音→成片」，而无需在多个工具间手动搬运素材。
- **核心循环**：导入文本/素材 → 画布编排模块 → 批量执行 → 故事板审阅 → 导出成片或工程包。
- **目标平台**：Web 优先（React + NestJS）；Electron 通过 `runtime-bridge` 后续接入，P0 不做桌面打包。
- **硬约束**：指定配色、无主题模板、NestJS 后端、画布 80+ 节点不卡顿、API Key 仅存服务端、故事板必须做、Skills 体系必须做、AI 配音必须做。
- **推荐默认**：故事板作为**右侧面板 + 画布模块**双入口；Seedance Skill OS 作为 Skills 种子包；配音走 gateway 代理 + 可选本地 Voicebox 桥接；Montage 参考其「审阅门控 + 时间线导出」而非整库移植。
- **发挥空间**：面板布局细节、空状态文案、动画、模块 UI 微交互、具体 provider 优先级。
- **P0 验收**：画布可执行数据流 + 故事板 CRUD/审阅 + Seedance Skills 可注入 + TTS 多角色配音 + 单镜合成导出 MP4。
- **最容易翻车**：故事板与画布双源数据不同步；大画布性能回退；异步视频任务无轮询导致假成功；Skill 注入污染用户原始 prompt。
- **超预期机会**：参考视频反推分镜结构；故事板 contact sheet 批审；Seedance 连续 clip 链一键生成；Backlot 式生产进度墙。

---

## 第一章：产品概述

**NX9 Studio 是一款 AI 节点画布工作流工具，让短视频/漫剧/广告创作者能够用可视化模块编排从剧本到成片的完整链路，而无需在 ChatGPT、ComfyUI、剪辑软件之间反复复制粘贴素材。**

### 1.1 差异化对比表

| 功能 | T8 / 参考短剧项目 | NX9 | 实现方式 |
|------|------------------|-----|----------|
| 产品形态 | T8 纯画布；短剧项目多为线性页面工作台 | 画布 + 故事板双视图，同一工作区数据 | 工作区 JSON 内嵌 `storyboard` 实体，与 blocks 双向同步 |
| 故事板 | T8 有导演台节点但偏画布内；短剧项目有完整 Panel 树 | 独立故事板面板 + `director-desk` 模块联动 | 右侧面板时间线 + 镜头卡片网格 |
| Skills | T8 无 Skill OS；Seedance 2.0 有独立 Skill 文档体系 | 内置 Skills 库 + Seedance 中文 Skill 种子 | `data/skills/` + ChatModel/Agent 注入 |
| AI 配音 | T8 有 audio 节点；Voicebox 是本地 TTS 桌面 | gateway TTS + 角色音色绑定 + 可选 Voicebox 桥接 | NestJS proxy + `speakerVoices` 映射 |
| 成片导出 | 短剧项目 FFmpeg 合成；OpenMontage Remotion 时间线 | P1 FFmpeg 单镜/整集；P2 轻量时间线 | 服务端 `ffmpeg` 模块 |
| 主题/UI | T8 13 套主题 | 固定品牌配色，无主题系统 | Tailwind token |
| 性能 | T8 v2.3.5 大画布护栏 | 分级 perf mode + 单工作区挂载 | `perf-controller` 已有 |

### 1.2 三类用户画像

**画像 A：独立短视频创作者**
- **核心目标**：把一段文案快速变成 30–60 秒带配音的视频。
- **最大不满**：分镜、生图、生视频、配音分散在 4 个以上工具。
- **切换理由**：故事板一键审阅 + 画布批量跑完 + 导出 MP4。

**画像 B：AI 漫剧/短剧工作室**
- **核心目标**：批量生产多集内容，角色和场景保持一致。
- **最大不满**：长链路任务中断后无法续跑；角色脸在不同镜头漂移。
- **切换理由**：Character Bible Skill + Seedance 连续 clip 模板 + 任务队列可恢复。

**画像 C：广告/品牌内容制作**
- **核心目标**：参考竞品视频结构，快速产出同风格样片。
- **最大不满**：反推结构靠人工；成本不可预估。
- **切换理由**：参考 OpenMontage 思路——粘贴参考视频 URL → 生成分镜草案 + 成本预估（P2）。

### 1.3 可行性边界

| 在范围内（及原因） | 明确排除在外（及原因） |
|-------------------|------------------------|
| Web 画布 + NestJS JSON 持久化（当前架构） | 多用户 SaaS 账号体系（P0 不做，避免 scope 膨胀） |
| 故事板：镜头列表、缩略图、状态、审阅门控 | 完整 NLE 非线性剪辑（Premiere 级，P0 不做） |
| Seedance Skill OS 方法论导入为 SKILL.md | 直接复制 seedance-2.0 仓库代码（仅借鉴文档结构） |
| TTS 经 gateway 代理；Voicebox 作为 Electron/本地可选后端 | 内置训练 TTS 模型（成本与体积不可控） |
| FFmpeg 服务端合成（需服务器安装 FFmpeg） | 浏览器内 ffmpeg.wasm 作为主路径（性能差、内存高） |
| 80+ 节点画布性能分级 | 13 套主题模板（用户明确要求不要） |
| OpenMontage 式「审阅门控 + 时间线导出」概念 | 整包移植 OpenMontage 12 pipeline（Python 栈与 NX9 不兼容） |

### 1.4 约束分层

| 硬约束 | 推荐默认 | 发挥空间 |
|--------|----------|----------|
| 配色 `#FAFAF8` / `#A13D63` / `#222222` 等 | 故事板默认 9 列网格 + 列表双视图 | 卡片 hover 动效、图标选择 |
| NestJS + React Flow + Zustand | Seedance 连续剧情 Skill 作为默认种子 | Skill 分类 UI 布局 |
| API Key 不暴露前端 | TTS 默认 OpenAI 兼容接口 | Voicebox 连接探测 UI |
| 画布 intensive 模式 ≥80 节点可用 | 故事板与画布选中镜头双向高亮 | 故事板拖拽排序动画 |
| 故事板、Skills、AI 配音为 P0 范围 | FFmpeg 合成 P1 | Remotion 级时间线 P3 |

---

## 第二章：整体布局与导航

### 2.1 主界面布局（桌面 ≥1280px）

```text
+--------------------------------------------------------------------------------+
| 顶栏 48px：工作区名 | 保存状态 | 批量运行 | 故事板开关 | 设置 | Skills        |
+----------+---------------------------------------------------------------------+
| 工作区   |  画布区 FlowSurface（flex-1，min-height 0）                          |
| 侧栏     |  +---------------------------------------------------------------+  |
| 200px    |  | React Flow：模块节点 + 连线 + MiniMap（重载时可隐藏）          |  |
|          |  +---------------------------------------------------------------+  |
| 侧栏·   |                                                                     |
| 工作区  |  +---------------------------------------------------------------+  |
| 列表    |  | 底部日志抽屉 120–240px 可拖拽高度                              |  |
|         |  +---------------------------------------------------------------+  |
| 侧栏·   |  +---------------------------------------------------------------+  |
| 模块    |                                                                     |
| 面板    |                                                                     |
| 240px   |                                                                     |
+----------+---------------------------------------------------------------------+
| 可选：故事板面板 360px（从右侧滑入，与模块面板互斥或分屏）                      |
+--------------------------------------------------------------------------------+
```

### 2.2 故事板面板布局（打开时）

```text
+-------------------------------- storyboard panel 360px ------------------------+
| 标签：列表 | 网格 | 时间线          筛选：全部 | 待生成 | 待审阅 | 已通过        |
+--------------------------------------------------------------------------------+
| 镜头 #01  （缩略图）  3s  中景  "女主推门进入"     状态：待审阅  生成 | 通过   |
| 镜头 #02  （缩略图）  4s  特写  "她看向窗外"       状态：已通过  重新生成       |
| ...                                                                             |
+--------------------------------------------------------------------------------+
| 底部：+ 插入镜头 | 从剧本解析 | 导出 contact sheet | 发送到 clip-gen          |
+--------------------------------------------------------------------------------+
```

### 2.3 导航与模式切换

```text
用户打开工作区
    |
    v
默认：画布视图（模块编排）
    |
    +-- 点击「故事板」--> 右侧滑出故事板面板（数据同源）
    |
    +-- 点击「Skills」--> 抽屉编辑 SKILL.md
    |
    +-- 点击「设置」--> API Key / TTS / 性能偏好
    |
    +-- 点击「批量运行」--> 拓扑执行可运行模块 + 更新故事板状态
```

### 2.4 信息架构

```text
Workspace（工作区）
├── blocks 数组          # 画布节点
├── edges 数组           # 连线
├── storyboard        # 故事板（首期新增）
│   ├── shots 数组
│   └── meta
├── assets 数组          # 引用的媒体 ID
└── settings          # 工作区级：画风、默认模型
```

---

## 第三章：核心模块详细设计

### 3.1 画布执行引擎（P0）

**目标**：让模块之间真正传递数据并可批量执行。

**UI 状态**：

```text
+-------------------------------- prompt 模块 --------------------------------+
|  提示词: "A woman opens the door..."                    运行 | 就绪           |
|  输出端口 prompt ──────────────────────────────────> picture-gen            |
+-----------------------------------------------------------------------------+
```

**正常流**：
1. 用户连接 `prompt` → `picture-gen` → `preview-sink`
2. 点击「批量运行」
3. 系统 Kahn 拓扑排序，按序执行
4. 每模块状态：idle → running → success/error
5. 输出写入模块 `data.outputs`，下游读取 `upstream`

**失败路径 A**：下游缺少必填输入 → 模块标记 error，日志写「缺少 picture 输入」，后续依赖节点 skip
**失败路径 B**：API 429 → 自动重试 2 次，间隔 3s/9s，仍失败则 error + 可手动重试

**状态机**：`idle | running | success | error | skipped`

**依赖**：gateway 模块、execution-queue store

**产品决策**：P0 串行执行即可；P1 同层无依赖节点并行（并发上限 3）。

**状态清单**：

| 状态 | 触发条件 | 视觉标记 | 退出条件 |
|------|----------|----------|----------|
| idle | 初始/运行结束 | 灰色边框 | 用户点击运行 |
| running | 进入执行队列 | 品牌色脉冲 + spinner | API 返回或超时 |
| success | 输出写入完成 | 绿色角标 | 下次运行覆盖 |
| error | API 失败或缺输入 | 红色角标 + 日志 | 用户重试或修复输入 |
| skipped | 上游 error | 虚线边框 | 上游 success 后手动重跑 |

**依赖关系**：gateway 模块、execution-queue store、workspace PATCH API

---

### 3.2 故事板（Storyboard）（P0 — 必做）

> **结论：必须做。** 你的 `需求.txt` 已明确「故事板功能要做」。对 NX9 而言，故事板不是可选功能，而是连接「文本策划」与「画布生成」的枢纽；没有它，Skills 输出的分镜表无处落地，Seedance 连续 clip 也无法管理。

**定位**：工作区内的**结构化镜头清单**，与画布模块双向同步；不是另起一个短剧 App 页面。

**镜头数据结构（单条 shot）**：

```json
{
  "id": "shot_001",
  "index": 1,
  "durationSec": 4,
  "shotType": "medium",           // 景别：close/medium/wide
  "descriptionZh": "女主推门进入房间",
  "promptEn": "medium shot, woman pushing door...",
  "videoPromptEn": "",            // Seedance 视频专用
  "firstFrameAssetId": null,
  "lastFrameAssetId": null,
  "videoAssetId": null,
  "audioAssetId": null,
  "status": "draft",              // draft | generating | review | approved | failed
  "characterIds": "char_01",
  "linkedBlockId": null           // 关联画布上的 director-desk / clip-gen 节点
}
```

**三种视图**：
1. **列表视图**：信息密度高，适合编辑文案和 prompt
2. **网格视图**：缩略图墙，适合 visual review（参考 OpenMontage contact sheet）
3. **时间线视图**：横轴按 durationSec 排列，适合看节奏（P1）

**与画布联动**：
- 从 `chat-model` + `storyboard-breaker` Skill 输出 → 一键「导入故事板」
- 故事板选中镜头 → 画布上对应 `director-desk` / `picture-gen` 高亮
- 画布生成完成 → 回写 `firstFrameAssetId` / `videoAssetId` 到 shot
- 「发送到 clip-gen」：为选中镜头在画布上 spawn 节点并连线

**审阅门控（参考 OpenMontage Backlot）**：
- 批量生成前可设 `pauseForReview: true`
- 生成完首帧后状态 → `review`，用户点「通过」才继续 video 步骤
- 防止一次性烧完 API 额度

**失败路径 A**：导入的分镜表格式不对 → 提示「需要 Markdown 表格或 JSON」，提供示例
**失败路径 B**：缩略图加载失败 → 显示占位 + assetId + 重试按钮

**依赖**：workspace API 扩展、`storyboard-breaker` Skill、assets 模块

**产品决策**：
- P0 不做 Remotion 时间线，只做镜头 CRUD + 状态 + 缩略图 + 导入导出
- `story-grid` 模块从 concealed 改为可见，与 `grid-split` / `grid-compose` 组成宫格链路

**待决问题**：故事板面板是否与模块面板同时显示？**推荐默认**：≥1440px 可并排；<1440px 互斥切换。

**状态清单**：

| 状态 | 触发条件 | 视觉标记 | 退出条件 |
|------|----------|----------|----------|
| draft | 新建/导入 | 灰色「草稿」 | 触发生成 |
| generating | 关联模块 running | 黄色 spinner | 资源回写 |
| review | reviewMode 且首帧完成 | 橙色「待审阅」 | 用户通过/打回 |
| approved | 用户确认 | 绿色勾 | 重新生成则回 review |
| failed | 生成/API 失败 | 红色 + 重试 | retry 成功 |

**依赖关系**：workspace API、assets 缩略图、storyboard-breaker Skill、director-desk 模块

---

### 3.3 Skills 体系 + Seedance Skill OS（P0）

**目标**：把 Seedance 2.0 Skill OS 方法论纳入 NX9 Skills 库，供 ChatModel 及未来的 Agent 模块调用。

**Seedance 种子 Skill 包（从文档提炼，不复制 AGPL 代码）**：

| Skill ID | 用途 | 来源参考 |
|----------|------|----------|
| `seedance-vocab-zh` | 中文提示词词汇与规则 | seedance-2.0 `skills/seedance-vocab-zh` |
| `seedance-examples-zh` | 中文范例 | seedance-2.0 examples |
| `seedance-sequence` | 三段以上连续剧情 | seedance-2.0 sequence |
| `seedance-continuation` | 续拍上一段视频 | seedance-2.0 continuation |
| `seedance-reference-workflow` | @Image/@Video/@Audio 引用规范 | reference-workflow.md |
| `seedance-first-last-frame` | 首帧/尾帧控制 | first-last-frame-guide.md |

**硬规则写入 Skill**：
- 参考标签如 Image1 引用、`@图1` 原样保留，不翻译
- 禁止空泛词堆砌；拆成景别/运镜/光源/材质
- 连续剧情：Clip 01 完成后再写 Clip 02

**UI**：

```text
+---------------------------- Skills 抽屉 --------------------------------+
|  分类：内置 | 我的 | Seedance                                            |
|  ┌ seedance-sequence ────────────────────────────────────────────────┐  |
|  |  三段以上连续剧情 · 注入到 ChatModel ▼                              |  |
|  └───────────────────────────────────────────────────────────────────┘  |
|  + 新建 Skill    从模板导入 Seedance 包                                  |
+-------------------------------------------------------------------------+
```

**正常流**：用户选 Skill → ChatModel 运行 → 输出分镜表 → 「导入故事板」

**失败路径 A**：Skill 文件损坏 → 跳过该文件，日志警告，不阻塞启动
**失败路径 B**：注入后超 token → 截断 Skill 为摘要模式 + 提示用户

**依赖**：现有 `skills` 模块、`seed-skills.ts` 扩展

**产品决策**：Seedance 包作为「可选种子」，首次启动提示导入，不强制覆盖用户已有 Skill。

**状态清单**：

| 状态 | 触发条件 | 视觉标记 | 退出条件 |
|------|----------|----------|----------|
| 未导入 | 首次启动 | Seedance 分类为空 + CTA | 点击导入种子包 |
| 已加载 | 文件存在于 data/skills | 列表可勾选注入 | 删除 Skill 文件 |
| 注入中 | ChatModel 运行 | Skill 名显示在模块头 | 运行结束 |

**依赖关系**：skills 模块、seed-skills.ts、ChatModel 注入逻辑

---

### 3.4 AI 配音（P0）

**目标**：多角色台词 TTS，绑定角色音色，输出到故事板镜头或 sound-gen 模块。

**参考 Voicebox 的能力概念**（不整包移植）：本地/远程 TTS、参考音频克隆、多角色管理。NX9 P0 实现 **gateway 代理 + 角色绑定**；P2 Electron 下可桥接本地 Voicebox API（若运行）。

**数据模型**：

```json
{
  "voiceProfile": {
    "id": "vp_01",
    "name": "女主",
    "provider": "openai-compatible",
    "voiceId": "alloy",
    "referenceAudioAssetId": null
  },
  "voiceLine": {
    "id": "vl_01",
    "shotId": "shot_001",
    "speaker": "女主",
    "text": "你终于来了。",
    "voiceProfileId": "vp_01",
    "audioAssetId": null,
    "status": "pending"
  }
}
```

（实际存储为 voiceProfiles / voiceLines 数组，上图为单条示例。）

**UI 流程**：

```text
剧本/故事板 --voice-analyze Skill--> 台词列表
      |
      v
角色音色绑定面板（speaker → voiceProfile）
      |
      v
批量生成配音 --> 写入 audioAssetId --> 挂到 storyboard.shots 对应镜头
```

**正常流**：ChatModel + `voice-assigner` Skill 分配音色 → 用户确认 → 批量 TTS → 试听

**失败路径 A**：TTS API 失败 → 单条 retry，不阻塞其他台词
**失败路径 B**：参考音频克隆 provider 不可用 → 降级为预设 voiceId

**依赖**：gateway TTS（已有）、`sound-gen` 模块增强、故事板

**产品决策**：P0 支持 OpenAI 兼容 TTS；参考音频克隆标记 P2（依赖 provider 能力）。

**状态清单**：

| 状态 | 触发条件 | 视觉标记 | 退出条件 |
|------|----------|----------|----------|
| pending | 台词解析完成 | 灰色待生成 | 进入队列 |
| generating | TTS API 调用中 | spinner | 返回 audio URL |
| ready | audioAssetId 写入 | 播放按钮可用 | — |
| failed | TTS 错误 | 红色 + 重试 | retry 成功 |

**依赖关系**：gateway TTS、voice-assigner Skill、assets 存储、故事板 shot 关联

---

### 3.5 生成模块族（P0–P1）

| 模块 | P0 范围 | 说明 |
|------|---------|------|
| `picture-gen` | 真实 image API | 替换 gateway stub |
| `clip-gen` | 异步视频 + 轮询 | Seedance/Veo 等 |
| `director-desk` | 与故事板联动 | 多镜头并发入口 |
| `grid-split` / `grid-compose` | 宫格切分/拼接 | 服务分镜批量出图 |
| `sound-gen` | 已有，增强多角色 | 见 3.4 |
| `chat-model` | 已有，Skill 注入 | 见 3.3 |

---

### 3.6 Montage 式导出（P1–P2，参考 OpenMontage）

**P1**：FFmpeg 单镜合成（视频 + 配音 + SRT 字幕）→ MP4
**P2**：整集 concat；镜头 contact sheet PNG 导出
**P3**：轻量 Remotion 或 timeline JSON 导出（供外部合成）

**审阅门控**（P1）：导出前检查所有 shot.status === `approved`

---

### 3.7 资源库与模板（P1）

- 工作区资产列表 UI
- 提示词模板库（分类 + 媒体）
- 工作流 JSON 导入/导出

---

## 第四章：超越竞品的差异化功能

### 4.1 画布 + 故事板双视图同源

**结构性原因**：T8 偏纯画布，短剧项目偏线性页面；NX9 用同一 `workspace.storyboard` 同时服务「节点编排派」和「镜头管理派」，避免两套数据。

### 4.2 Seedance Skill OS 内置

**结构性原因**：Seedance 2.0 文档是生产级中文视频 prompt 方法论，但独立仓库不在工作流里。NX9 把其变为可注入 Skill，与 ChatModel / 故事板导入直连。

### 4.3 审阅门控而非盲批量

**结构性原因**：OpenMontage Backlot 的核心 insight 是「生成前先让人看见」。NX9 在 intensive perf 画布上仍保留 storyboard review gate，避免 API 成本失控。

### 4.4 性能分级画布承载完整生产链

**结构性原因**：参考项目多为单页工作台或 100+ 节点卡顿。NX9 已有 perf-controller，故事板操作不增加画布节点数量，重载时仍可用列表视图管理镜头。

### 4.5 超预期机会

1. **参考视频反推**：粘贴 URL → 生成分镜节奏草案（P2，OpenMontage 思路）
2. **Seedance 连续 clip 链**：故事板按序生成 Clip 01→02→03，自动带入「已发生」上下文
3. **Contact sheet 一键批审**：网格视图勾选通过/打回
4. **生产进度墙**：批量运行时顶栏显示「3/12 镜头完成，等待审阅 #4」

---

## 第五章：数据模型

### 5.1 工作区顶层 schema

```json
{
  "version": 2,
  "id": "ws_abc123",
  "name": "默认工作区",
  "updatedAt": "2026-07-06T05:00:00.000Z",
  "blocks": "…",
  "edges": "…",
  "storyboard": {
    "version": 1,
    "title": "",
    "reviewMode": "manual",
    "shots": "…"
  },
  "voice": {
    "profiles": "…",
    "lines": "…"
  },
  "assets": "…",
  "preferences": {
    "artStylePrompt": "",
    "defaultImageModel": "",
    "defaultVideoModel": ""
  }
}
```

### 5.2 Shot 完整字段

见 3.2 节；`version` 字段用于未来迁移。

### 5.3 Task 记录（P1，服务端）

```json
{
  "version": 1,
  "id": "task_xyz",
  "workspaceId": "ws_abc123",
  "targetType": "shot",
  "targetId": "shot_001",
  "type": "image_gen",
  "status": "processing",
  "providerTaskId": "",
  "createdAt": "",
  "updatedAt": ""
}
```

### 5.4 Skill 文件

路径：`data/skills/{id}/SKILL.md`，YAML frontmatter + Markdown body（现有格式不变）。

---

## 第六章：技术架构

### 6.1  monorepo 结构（保持）

```text
NX9/
├── apps/server/          NestJS
│   ├── modules/workspace/    + storyboard CRUD
│   ├── modules/gateway/      + image/video/tts
│   ├── modules/tasks/        P1 任务队列
│   ├── modules/montage/      P1 FFmpeg
│   └── modules/skills/       + seedance seeds
├── apps/web/
│   ├── engine/FlowSurface
│   ├── panels/StoryboardPanel.tsx   P0 新增
│   ├── stores/storyboard-store.ts   P0 新增
│   └── blocks/...
└── packages/shared/
    └── types/storyboard.ts          P0 新增
```

### 6.2 关键 API（P0 新增）

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/workspaces/:id/storyboard` | 获取故事板 |
| PATCH | `/api/workspaces/:id/storyboard` | 更新 shots |
| POST | `/api/workspaces/:id/storyboard/import` | 从 Markdown/JSON 导入 |
| POST | `/api/workspaces/:id/voice/lines/generate` | 批量 TTS |
| POST | `/api/skills/seed/seedance` | 导入 Seedance 种子包 |

### 6.3 第三方依赖

| 依赖 | 用途 | 阶段 |
|------|------|------|
| FFmpeg | 视频合成 | P1，服务端必需 |
| sharp | 缩略图/宫格切分 | 已有 |
| OpenAI 兼容 API | LLM/TTS/Image | P0 |
| 异步视频 API | clip-gen | P0/P1 |

**可替换性**：provider 适配层可换；不变量：workspace.storyboard 语义、shot.status 状态机、Skill 注入接口。

**为何优于替代方案**：

| 方案 | 问题 | NX9 选择 |
|------|------|----------|
| 纯 JSON 文件无版本 | 迁移困难 | workspace version 字段 + 迁移函数 |
| 故事板独立数据库表 | P0 过度工程 | 嵌入 workspace JSON，单文件备份 |
| 前端直连 AI API | Key 泄露 | NestJS gateway 代理 |
| 浏览器 ffmpeg.wasm | 大文件 OOM | 服务端 FFmpeg（P1） |

**可替换技术原则**：
- 推荐默认：NestJS + JSON 持久化 + React Flow + Zustand
- 若后续引入 Redis/BullMQ，任务表语义不变（taskId、targetType、status）
- 若 Electron 接入 Voicebox，仅替换 TTS adapter 实现，voiceProfiles 模型不变
- 不可变：shot.status 状态机、Skill system 注入层、API Key 不暴露前端

---

## 第七章：交互细节

### 7.1 故事板 ↔ 画布联动

- 点击镜头行 → 画布 `fitView` 到 `linkedBlockId`
- 画布选中 `director-desk` → 故事板滚动到对应 shot
- 删除镜头 → 提示是否删除关联模块（默认仅 unlink）

### 7.2 导入分镜

- ChatModel 输出含 Markdown 表格 → 检测表头「镜号|景别|画面描述|英文提示词|时长」
- 一键导入，冲突策略：append / replace all（二次确认）

### 7.3 批量运行

- 顶栏按钮 → 确认弹窗：「将运行 N 个模块，预估 M 个 API 调用」
- reviewMode=manual 时，首帧生成后暂停

### 7.4 空状态

- 故事板无镜头：「从剧本生成分镜」按钮 → 打开 ChatModel 并预选 `storyboard-breaker` Skill

### 7.5 键盘快捷键

| 键 | 动作 | 阶段 |
|----|------|------|
| `B` | 切换故事板面板 | P0 |
| `Ctrl+Enter` | 运行选中模块 | P0 |
| `Ctrl+Z` / `Ctrl+Y` | 撤销 / 重做 | P0 |
| `Ctrl+S` | 手动保存工作区 | P0 |
| `Delete` | 删除选中模块或镜头 | P1 |
| `?` | 打开快捷键帮助 | P1 |

### 7.6 右键菜单

**画布空白处**：
- 添加模块（高频 7 项：prompt / picture-gen / clip-gen / chat-model / sound-gen / asset-import / director-desk）
- 粘贴（P1）
- 整理选中（P1）

**模块节点**：
- 运行 / 停止
- 复制 / 删除
- 发送到故事板（若模块含分镜输出）

**故事板镜头行**：
- 通过审阅 / 打回
- 在画布定位关联模块
- 重新生成首帧 / 视频 / 配音
- 删除镜头

---

## 第八章：导出与输出系统

### 支持的输出格式

| 导出类型 | 格式 | 阶段 | 内容 |
|----------|------|------|------|
| 工作区 | `.nx9.json` | P0 | blocks + edges + storyboard + voice |
| 故事板 | Markdown 表格 / CSV | P0 | shots 列表 |
| Contact sheet | PNG | P1 | 网格缩略图 + 镜号 |
| 单镜成片 | MP4 | P1 | video + audio + srt |
| 整集 | MP4 | P2 | concat approved shots |
| 时间线工程 | JSON | P3 | 供 Remotion/外部 NLE |

---

## 第九章：开发优先级

### P0

**目标**：最小可用产品 — 画布能跑、故事板能管、Skill 能注入、配音能生成。

**范围（4–6 周）**：
1. 画布执行引擎 + 模块间数据流
2. 故事板面板 + workspace schema v2
3. Seedance Skill 种子包 + 分镜 Markdown 导入
4. AI 配音：voice lines + 角色绑定 + 批量 TTS
5. picture-gen / clip-gen 真实 gateway（替换 stub）
6. Undo/Redo UI

### P1

**目标**：体验完整 — 审阅门控、宫格链路、FFmpeg 合成、任务队列。

**范围（4–6 周）**：
7. director-desk 与故事板双向联动
8. 宫格 generate / split / compose 链路
9. 审阅门控 + contact sheet 导出
10. FFmpeg 单镜合成 MP4
11. 任务队列 + 异步轮询 + SSE 进度
12. 资源库 UI + 工作流 JSON 导入导出

### P2（差异化）

13. Seedance 连续 clip 链（Clip 01→02→03 上下文传递）
14. 参考视频反推分镜结构（OpenMontage 思路）
15. Voicebox 本地桥接（Electron 阶段）
16. 整集 concat 导出 + 时间线 JSON

### P3（可选）

17. Remotion 预览
18. 多用户 / 数据库迁移（Prisma）
19. 计费与用量追踪

### 实现顺序建议

```text
Week 1-2: workspace v2 schema + StoryboardPanel + 导入分镜
Week 2-3: 画布执行引擎 + upstream 数据流 + Undo UI
Week 3-4: gateway image/video 真实 adapter + 任务状态
Week 4-5: Seedance Skill 种子 + voice lines + 批量 TTS
Week 5-6: director-desk 联动 + 验收剧本全绿
--- 分界线 ---
Week 7-8: 审阅门控 + 宫格链路 + FFmpeg 单镜
```

---

## 第十章：性能指标

| 指标 | 目标 | 测量方法 | 降级阈值 |
|------|------|----------|----------|
| 画布首屏可交互 | ≤2.5s（50 节点工作区） | Lighthouse TTI / 手动 | >4s 则检查 lazy chunk |
| 80+ 节点平移帧率 | ≥30fps | Chrome Performance | <24fps 强制 intensive |
| 故事板列表渲染 100 镜头 | ≤100ms 首次绘制 | React Profiler | 超 200ms 启用虚拟列表 |
| 工作区自动保存 | 700ms 防抖，保存请求 ≤500ms | Network | 保存失败 Toast + 重试 |
| 批量运行 UI 响应 | 任务启动反馈 ≤200ms | 点击到状态变 running | 超 500ms 显示 loading |
| TTS 单条生成 | 依赖 provider，UI 不阻塞 | 生成在 queue 内 | 单条失败可 retry |
| FFmpeg 单镜合成 15s 素材 | ≤30s（服务端） | 任务耗时日志 | 超时标记 failed |

---

## 第十一章：开发者交接说明

### a) 你先做什么

1. 扩展 `packages/shared` 的 `storyboard` 类型与 workspace version 迁移
2. 实现 `StoryboardPanel` + `storyboard-store`，API 走现有 workspace PATCH
3. 接画布执行引擎（拓扑排序 + upstream 数据传递）
4. 扩展 `seed-skills.ts` 导入 Seedance 六件套
5. 增强 `sound-gen` + voice lines 批量 API

### b) 不要擅自改动的

- 品牌配色与「无主题模板」原则
- API Key 仅存服务端
- 故事板数据必须在工作区 JSON 内，不要另起独立 App 路由
- Skill 注入不能 silent 覆盖用户输入区内容（仅追加 system 层）

### c) 可以自由发挥

- StoryboardPanel 具体布局、虚拟列表、拖拽排序实现
- 模块 UI 细节、空状态、Toast 文案
- provider 适配器内部实现，只要接口一致

### d) 已知的未知项

- Voicebox 本地 API 端口与协议需在 Electron 阶段实测，P0 仅预留 `runtime-bridge` hook
- 具体视频 provider（Seedance/Veo/Kling）以用户可用的 API 为准，adapter 需可配置
- FFmpeg 在 Windows 开发机是否预装需文档说明
- OpenMontage 参考视频反推依赖外部 transcript 能力，P2 再验证

### e) P0 验收剧本

**验收剧本 1：分镜导入闭环**
1. 启动 `npm run dev`，创建或打开工作区
2. ChatModel 选择 `storyboard-breaker` Skill，输入 ≥200 字故事
3. 输出含「镜号|景别|画面描述|英文提示词|时长」的 Markdown 表
4. 点击「导入故事板」→ 右侧面板显示 ≥3 镜头
5. 刷新浏览器 → 镜头数量与文案一致
6. **通过证据**：Network 中 PATCH storyboard 200；面板镜号连续

**验收剧本 2：画布执行与数据流**
1. 画布放置 prompt → picture-gen → preview-sink 并连线
2. prompt 填入英文描述，picture-gen 配置可用 image model
3. 点击「批量运行」
4. 观察模块状态 idle → running → success
5. preview-sink 或 picture-gen 显示生成图 URL
6. **通过证据**：activity log 无 error；picture-gen 角标绿色

**验收剧本 3：AI 配音**
1. 故事板至少 1 镜头绑定台词，或使用 voice-analyze 生成 2 条 voiceLines
2. 设置 ≥1 voiceProfile（speaker 名与台词一致）
3. 批量生成配音
4. 故事板或 sound-gen 模块可播放音频
5. **通过证据**：`data/media/audio/` 下新增文件；voiceLine.status = ready

**验收剧本 4：Seedance Skills**
1. 设置页或 Skills 抽屉点击「导入 Seedance 种子包」
2. 列表出现 seedance-sequence、seedance-vocab-zh 等
3. ChatModel 注入 seedance-sequence 后输出含「本段只拍」「不能提前出现」结构
4. **通过证据**：`data/skills/seedance-sequence/SKILL.md` 存在

**验收剧本 5：大画布性能**
1. 导入或生成含 ≥80 模块的工作区
2. 拖动画布平移 10 秒
3. perf 指示或控制台显示 intensive 模式
4. MiniMap 隐藏或边缘动画关闭
5. **通过证据**：无明显持续卡顿（主观 ≤1 次 >500ms 冻结）

---

*文档版本：1.0 | 日期：2026-07-06 | 基于 NX9 v0.1.0 与 Reference_Projects 分析*
