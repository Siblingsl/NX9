# NX9 节点交互分类总表

> 生成自 `block-catalog.ts`（100 kind）+ `node-interaction.ts`  
> 路径：`docs/NX9-NODE-INTERACTION-REGISTRY.md`

## 当前代码行为

| 条件 | 画布 | 选中后 |
|------|------|--------|
| kind ∈ `PROMPT_BAR_KINDS`（20） | 紧凑卡片 | 节点下方 **Prompt Bar** + Inspector |
| 其他 kind（80） | **完整 Block UI** | 仅 Inspector（生产模式可双击展开） |

---

## 一、Prompt Bar 白名单

| # | kind | 中文名 | catalog 分类 | 交互类型 | 生成参数底栏 |
|---|------|--------|-------------|----------|-------------|
| 1 | `bridge-clip` | Bridge 续拍 | craft | 逻辑型 | — |
| 2 | `caption-asr` | 语音转字幕 | utility | AI 型 | — |
| 3 | `chat-model` | 对话模型 | generate | AI 型 | — |
| 4 | `clip-gen` | 视频生成 | generate | 输入型 | ✅ |
| 5 | `director-desk` | 导演台 | generate | 输入型 | — |
| 6 | `grid-prompt-reverse` | 宫格反推 | craft | AI 型 | — |
| 7 | `inpaint-edit` | 局部重绘 | craft | 输入型 | ✅ |
| 8 | `motion-story` | 动效分镜 | generate | 输入型 | ✅ |
| 9 | `music-gen` | BGM 生成 | utility | 逻辑型 | ✅ |
| 10 | `photo-speak` | 照片说话 | generate | 输入型 | ✅ |
| 11 | `picture-gen` | 图像生成 | generate | 输入型 | ✅ |
| 12 | `prompt` | 提示词 | generate | 输入型 | — |
| 13 | `prompt-studio` | Prompt 工作室 | craft | 输入型 | — |
| 14 | `scene-card` | 场景设定卡 | craft | 输入型 | — |
| 15 | `seedance-chain` | Seedance 连续 Clip | generate | AI 型 | — |
| 16 | `shot-script` | 镜头脚本 | generate | 输入型 | — |
| 17 | `sound-gen` | AI 配音 | generate | 输入型 | ✅ |
| 18 | `story-grid` | 分镜网格 | craft | 输入型 | — |
| 19 | `style-lab` | 风格实验室 | craft | 输入型 | — |
| 20 | `thumbnail-maker` | 封面制作 | craft | 输出型 | — |

---

## 二、非 Prompt Bar（完整原节点 UI）

### 2.1 可_spawn 节点（48）

| # | kind | 中文名 | catalog 分类 | 交互类型 | 隐藏 |
|---|------|--------|-------------|----------|------|
| 1 | `asset-import` | 素材导入 | source | 输入型 |  |
| 2 | `asset-watch` | 素材监听 | source | 逻辑型 | 是 |
| 3 | `audio-mix` | 音频混音 | utility | 配置型 |  |
| 4 | `batch-runner` | 批量处理 | utility | 逻辑型 | 是 |
| 5 | `beat-sync` | 节拍对齐 | utility | 逻辑型 | 是 |
| 6 | `bg-remove` | 抠图 | utility | 逻辑型 |  |
| 7 | `blocking-stage` | 场面调度 | spatial | 配置型 |  |
| 8 | `character-sheet` | 角色设定 | craft | 输入型 |  |
| 9 | `clip-editor` | 视频剪辑 | generate | 输入型 |  |
| 10 | `color-grade` | 调色 | utility | 配置型 | 是 |
| 11 | `comfy-workflow` | Comfy 工作流 | integrate | 配置型 | 是 |
| 12 | `continuity-check` | 连贯性检查 | craft | AI 型 |  |
| 13 | `control-preprocess` | ControlNet 预处理 | spatial | 配置型 | 是 |
| 14 | `depth-pass` | 深度通道 | spatial | 配置型 | 是 |
| 15 | `dialogue-sheet` | 对白表 | craft | 输入型 |  |
| 16 | `director-3d` | 3D 导演台 | spatial | 配置型 |  |
| 17 | `export-pack` | 交付打包 | utility | 配置型 |  |
| 18 | `frame-endpoints` | 首尾帧 | utility | 逻辑型 |  |
| 19 | `grid-compose` | 宫格编辑 | utility | 逻辑型 |  |
| 20 | `grid-split` | 宫格切分 | utility | 逻辑型 |  |
| 21 | `iterator` | 迭代器 | utility | 逻辑型 |  |
| 22 | `light-rig` | 灯光方案 | spatial | 配置型 | 是 |
| 23 | `link-parser` | 素材采集 | utility | 逻辑型 |  |
| 24 | `lipsync-pass` | 口型同步 | support | 配置型 | 是 |
| 25 | `local-enhance` | 本地增强 | utility | 逻辑型 | 是 |
| 26 | `memo` | 备忘 | support | 输出型 |  |
| 27 | `mesh-import` | 3D 导入 | source | 输入型 |  |
| 28 | `mesh-viewer` | 3D 预览 | source | 输出型 |  |
| 29 | `model-market` | 模型超市 | integrate | 配置型 | 是 |
| 30 | `panorama-sphere` | 3D 全景 | spatial | 配置型 | 是 |
| 31 | `passthrough` | 透传 | support | 逻辑型 | 是 |
| 32 | `picker` | 选取器 | utility | 逻辑型 | 是 |
| 33 | `picture-diff` | 图像对比 | utility | 逻辑型 |  |
| 34 | `picture-merge` | 图像合并 | utility | 逻辑型 | 是 |
| 35 | `preview-sink` | 结果预览 | source | 输出型 |  |
| 36 | `prompt-diff` | Prompt 对比 | craft | 逻辑型 | 是 |
| 37 | `recipe-spawn` | 配方一键 | support | 逻辑型 | 是 |
| 38 | `reference-analyze` | 参考片反推 | utility | AI 型 | 是 |
| 39 | `reference-board` | 参考板 | craft | 输入型 |  |
| 40 | `review-gate` | 审阅关卡 | support | 逻辑型 |  |
| 41 | `scale-fit` | 尺寸调整 | utility | 逻辑型 | 是 |
| 42 | `sketch-pad` | 画板 | utility | 逻辑型 | 是 |
| 43 | `subtitle-burn` | 字幕烧录 | utility | 配置型 |  |
| 44 | `text-chunker` | 文本切分 | utility | 逻辑型 |  |
| 45 | `upscale-lite` | 放大 | utility | 逻辑型 | 是 |
| 46 | `variant-fork` | 方案分叉 | support | 逻辑型 | 是 |
| 47 | `voice-cast` | 多角色配音 | craft | 输入型 |  |
| 48 | `watermark-clean` | 去 AI 水印 | support | 输出型 | 是 |

### 2.2 已废弃（deprecated，32）

| kind | 中文名 | Prompt Bar |
|------|--------|------------|
| `angle-visual` | 多角度 | ❌ |
| `asset-bundle` | 素材集合 | ❌ |
| `blueprint` | 蓝图 | ❌ |
| `camera-prompt` | 运镜 | ❌ |
| `cinema-prompt` | 电影感 | ❌ |
| `clip-sink` | 视频输出 | ❌ |
| `codex-agent` | Codex Agent | ❌ |
| `codex-picture` | Codex 生图 | ❌ |
| `comfy-builder` | ComfyUI 制作 | ❌ |
| `comfy-market` | ComfyUI 超市 | ❌ |
| `fal-market` | FAL 超市 | ❌ |
| `frame-sampler` | 抽帧 | ❌ |
| `grok-agent` | Grok Agent | ❌ |
| `hub-market` | Hub 超市 | ❌ |
| `hub-toolkit` | Hub 工具箱 | ❌ |
| `multi-view-3d` | 多角度 3D | ❌ |
| `panorama-flat` | 720 全景 | ❌ |
| `param-inject` | 参数注入 | ❌ |
| `portrait-craft` | 肖像设计 | ❌ |
| `portrait-flow` | 肖像流程 | ❌ |
| `portrait-meta` | 肖像元数据 | ❌ |
| `pose-craft` | 姿势设计 | ❌ |
| `render-slot` | 渲染占位 | ❌ |
| `style-atelier` | 风格工坊 | ❌ |
| `tag-atelier` | 标签工坊 | ❌ |
| `topaz-clip` | Topaz 视频 | ❌ |
| `topaz-picture` | Topaz 图像 | ❌ |
| `touch-up` | 局部编辑 | ❌ |
| `vibe-workbench` | Vibe 工作台 | ❌ |
| `wallet-hub` | Wallet Hub | ❌ |
| `web-view` | 网页 | ❌ |
| `workflow-hub` | Workflow Hub | ❌ |

---

## 三、全量 100 节点（按 catalog 分类）

### 素材 source（7）

| kind | 中文名 | 交互类型 | Prompt Bar | 画布 UI | 废弃 | 隐藏 | hint |
|------|--------|----------|------------|---------|------|------|------|
| `asset-bundle` | 素材集合 | 输入型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 多素材打包（已合并至迭代器） |
| `asset-import` | 素材导入 | 输入型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 图像 / 视频 / 音频 / 3D 上传 |
| `asset-watch` | 素材监听 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | URL 变更触发下游重跑 |
| `mesh-import` | 3D 导入 | 输入型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | glb/gltf/obj 等 3D 模型上传 |
| `mesh-viewer` | 3D 预览 | 输出型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 3D 模型预览与快照导出 |
| `preview-sink` | 结果预览 | 输出型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 上游结果终端预览 |
| `render-slot` | 渲染占位 | 输出型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 预设落位框（已合并至预览） |

### 生成 generate（11）

| kind | 中文名 | 交互类型 | Prompt Bar | 画布 UI | 废弃 | 隐藏 | hint |
|------|--------|----------|------------|---------|------|------|------|
| `chat-model` | 对话模型 | AI 型 | ✅ | 紧凑卡片 + 跟随 Prompt Bar |  |  | LLM 流式对话 |
| `clip-editor` | 视频剪辑 | 输入型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 多片段拼接与转场 |
| `clip-gen` | 视频生成 | 输入型 | ✅ | 紧凑卡片 + 跟随 Prompt Bar |  |  | Veo / Grok 等视频生成 |
| `director-desk` | 导演台 | 输入型 | ✅ | 紧凑卡片 + 跟随 Prompt Bar |  |  | 多镜头并发分镜生成 |
| `motion-story` | 动效分镜 | 输入型 | ✅ | 紧凑卡片 + 跟随 Prompt Bar |  |  | Seedance 2.0 分镜视频 |
| `photo-speak` | 照片说话 | 输入型 | ✅ | 紧凑卡片 + 跟随 Prompt Bar |  |  | 照片 + 文案 → 口播视频 |
| `picture-gen` | 图像生成 | 输入型 | ✅ | 紧凑卡片 + 跟随 Prompt Bar |  |  | 多模型图像生成 |
| `prompt` | 提示词 | 输入型 | ✅ | 紧凑卡片 + 跟随 Prompt Bar |  |  | 多行提示词 + 上游素材配对，批量出图 |
| `seedance-chain` | Seedance 连续 Clip | AI 型 | ✅ | 紧凑卡片 + 跟随 Prompt Bar |  |  | 按故事板顺序批量生成连续 Clip（自动前情续接） |
| `shot-script` | 镜头脚本 | 输入型 | ✅ | 紧凑卡片 + 跟随 Prompt Bar |  |  | 结构化镜头表 → 故事板 / 导演台 |
| `sound-gen` | AI 配音 | 输入型 | ✅ | 紧凑卡片 + 跟随 Prompt Bar |  |  | TTS / LuxTTS 声线克隆（非 Suno 音乐） |

### 创作 craft（23）

| kind | 中文名 | 交互类型 | Prompt Bar | 画布 UI | 废弃 | 隐藏 | hint |
|------|--------|----------|------------|---------|------|------|------|
| `angle-visual` | 多角度 | 输入型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已合并至 Prompt 工作室 |
| `bridge-clip` | Bridge 续拍 | 逻辑型 | ✅ | 紧凑卡片 + 跟随 Prompt Bar |  |  | 上一镜视频 + 下一镜 prompt → 抽尾帧 → continuat |
| `camera-prompt` | 运镜 | 输入型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已合并至 Prompt 工作室 |
| `character-sheet` | 角色设定 | 输入型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 完整设定图 + 档案 + 三视图上传 + 变体 |
| `cinema-prompt` | 电影感 | 输入型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已合并至 Prompt 工作室 |
| `continuity-check` | 连贯性检查 | AI 型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 多镜头服装/光影/轴线差异报告 |
| `dialogue-sheet` | 对白表 | 输入型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 从剧本提取对白行，编辑后驱动配音 |
| `grid-prompt-reverse` | 宫格反推 | AI 型 | ✅ | 紧凑卡片 + 跟随 Prompt Bar |  |  | 宫格逐格 Vision 三层 Prompt |
| `inpaint-edit` | 局部重绘 | 输入型 | ✅ | 紧凑卡片 + 跟随 Prompt Bar |  |  | 原图 + 蒙版 + prompt → Fal/Comfy 局部重绘 |
| `portrait-craft` | 肖像设计 | 输入型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已合并至 Prompt 工作室 |
| `portrait-flow` | 肖像流程 | 输入型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 | 是 | 已废弃 |
| `portrait-meta` | 肖像元数据 | 输入型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 | 是 | 已废弃 |
| `pose-craft` | 姿势设计 | 输入型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已合并至 Prompt 工作室 |
| `prompt-diff` | Prompt 对比 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | 多路 prompt diff + 合并建议 |
| `prompt-studio` | Prompt 工作室 | 输入型 | ✅ | 紧凑卡片 + 跟随 Prompt Bar |  |  | 电影感 / 运镜 / 角度 / 肖像 / 姿势 |
| `reference-board` | 参考板 | 输入型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | Mood board + 风格约束 prompt |
| `scene-card` | 场景设定卡 | 输入型 | ✅ | 紧凑卡片 + 跟随 Prompt Bar |  |  | 场景名、时代、光线、道具 → 场景约束 prompt |
| `story-grid` | 分镜网格 | 输入型 | ✅ | 紧凑卡片 + 跟随 Prompt Bar |  |  | 分镜九宫格 |
| `style-atelier` | 风格工坊 | 输入型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已合并至风格实验室 |
| `style-lab` | 风格实验室 | 输入型 | ✅ | 紧凑卡片 + 跟随 Prompt Bar |  |  | 艺术家风格 + 动漫标签检索 |
| `tag-atelier` | 标签工坊 | 输入型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已合并至风格实验室 |
| `thumbnail-maker` | 封面制作 | 输出型 | ✅ | 紧凑卡片 + 跟随 Prompt Bar |  | 是 | 从图片/视频抽帧 → 加标题 → 导出 9:16 封面 |
| `voice-cast` | 多角色配音 | 输入型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 对白表 → 角色音色配置 → 批量 TTS → 绑定镜头 |

### Hub hub（6）

| kind | 中文名 | 交互类型 | Prompt Bar | 画布 UI | 废弃 | 隐藏 | hint |
|------|--------|----------|------------|---------|------|------|------|
| `hub-market` | Hub 超市 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已废弃 |
| `hub-toolkit` | Hub 工具箱 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已废弃 |
| `param-inject` | 参数注入 | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 | 是 | 已废弃 |
| `vibe-workbench` | Vibe 工作台 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已废弃 |
| `wallet-hub` | Wallet Hub | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已废弃 |
| `workflow-hub` | Workflow Hub | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已废弃 |

### 集成 integrate（8）

| kind | 中文名 | 交互类型 | Prompt Bar | 画布 UI | 废弃 | 隐藏 | hint |
|------|--------|----------|------------|---------|------|------|------|
| `codex-agent` | Codex Agent | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已废弃 |
| `codex-picture` | Codex 生图 | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已废弃 |
| `comfy-builder` | ComfyUI 制作 | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已废弃 |
| `comfy-market` | ComfyUI 超市 | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已合并至模型超市 |
| `comfy-workflow` | Comfy 工作流 | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | 提交 ComfyUI Workflow JSON 到服务端运行（conc |
| `fal-market` | FAL 超市 | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已合并至模型超市 |
| `grok-agent` | Grok Agent | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已废弃 |
| `model-market` | 模型超市 | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | FAL / ComfyUI 模型切换运行 |

### 工具 utility（27）

| kind | 中文名 | 交互类型 | Prompt Bar | 画布 UI | 废弃 | 隐藏 | hint |
|------|--------|----------|------------|---------|------|------|------|
| `audio-mix` | 音频混音 | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 多轨混音 / 响度归一（单轨失败不拖死全局） |
| `batch-runner` | 批量处理 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | 批量素材处理 |
| `beat-sync` | 节拍对齐 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | BPM 切点 meta 驱动剪辑 |
| `bg-remove` | 抠图 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | Fal BiRefNet 背景移除 |
| `caption-asr` | 语音转字幕 | AI 型 | ✅ | 紧凑卡片 + 跟随 Prompt Bar |  |  | 视频/音频 → 自动语音识别 → SRT 字幕 |
| `color-grade` | 调色 | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | 亮度 / 对比 / 饱和度 |
| `export-pack` | 交付打包 | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 成片 / 静帧 / 音频批量导出 |
| `frame-endpoints` | 首尾帧 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 视频首帧/尾帧提取 |
| `frame-sampler` | 抽帧 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 | 是 | 已废弃 |
| `grid-compose` | 宫格编辑 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 宫格拼接拆分 |
| `grid-split` | 宫格切分 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 网格切图 |
| `iterator` | 迭代器 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 串联/并联驱动下游 |
| `link-parser` | 素材采集 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 自媒体链接解析为素材 |
| `local-enhance` | 本地增强 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | Topaz 图像 / 视频高清化 |
| `music-gen` | BGM 生成 | 逻辑型 | ✅ | 紧凑卡片 + 跟随 Prompt Bar |  | 是 | 情绪/风格 prompt → BGM 音频（非配音，与 sound-ge |
| `picker` | 选取器 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | 从集合取单项 |
| `picture-diff` | 图像对比 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 双图对比分析 |
| `picture-merge` | 图像合并 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | 多图合并 |
| `reference-analyze` | 参考片反推 | AI 型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | 参考视频 → 分镜草案 → shot-script |
| `scale-fit` | 尺寸调整 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | 图像缩放 |
| `sketch-pad` | 画板 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | 图层手绘标注 |
| `subtitle-burn` | 字幕烧录 | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 文本 + 视频 → 带字幕成片（支持 SRT 上传） |
| `text-chunker` | 文本切分 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 长文本分段 |
| `topaz-clip` | Topaz 视频 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已合并至本地增强 |
| `topaz-picture` | Topaz 图像 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已合并至本地增强 |
| `upscale-lite` | 放大 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | Lanczos 图像放大 |
| `web-view` | 网页 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 | 是 | 已废弃 |

### 辅助 support（10）

| kind | 中文名 | 交互类型 | Prompt Bar | 画布 UI | 废弃 | 隐藏 | hint |
|------|--------|----------|------------|---------|------|------|------|
| `blueprint` | 蓝图 | 输出型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 |  | 已合并至备忘 |
| `clip-sink` | 视频输出 | 输出型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 | 是 | 已废弃 |
| `lipsync-pass` | 口型同步 | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | 人像视频 + 音频 → 口型同步视频（依赖部署外部模型） |
| `memo` | 备忘 | 输出型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 灵感记录 / 蓝图注释 |
| `passthrough` | 透传 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | 数据中转（CommandPalette） |
| `recipe-spawn` | 配方一键 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | 加载 Rail Recipe 子图 |
| `review-gate` | 审阅关卡 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 故事板审阅通过后才继续 |
| `touch-up` | 局部编辑 | 输出型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 | 是 | 已废弃 |
| `variant-fork` | 方案分叉 | 逻辑型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | A/B 方案标记与 Take 对比 |
| `watermark-clean` | 去 AI 水印 | 输出型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | 水印/元数据清理 |

### 空间 spatial（8）

| kind | 中文名 | 交互类型 | Prompt Bar | 画布 UI | 废弃 | 隐藏 | hint |
|------|--------|----------|------------|---------|------|------|------|
| `blocking-stage` | 场面调度 | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 轻量 blocking + 机位序列 |
| `control-preprocess` | ControlNet 预处理 | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | 原图 → depth / canny / pose 控制图（替代 dep |
| `depth-pass` | 深度通道 | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | 图像 → depth / normal 图 |
| `director-3d` | 3D 导演台 | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  |  | 3D 预演、摆位与截图 |
| `light-rig` | 灯光方案 | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | HDRI / 三点光 preset → prompt |
| `multi-view-3d` | 多角度 3D | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 | 是 | 已废弃 |
| `panorama-flat` | 720 全景 | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） | 是 | 是 | 已废弃 |
| `panorama-sphere` | 3D 全景 | 配置型 | ❌ | 完整节点（探索常开 / 生产可折叠） |  | 是 | 360° 全景预览 |

---

## 四、待确认：分类冲突

### 在白名单但非「输入型」（可能不应有 Prompt Bar）

| kind | 中文名 | 实际交互类型 |
|------|--------|-------------|
| `chat-model` | 对话模型 | AI 型 |
| `bridge-clip` | Bridge 续拍 | 逻辑型 |
| `caption-asr` | 语音转字幕 | AI 型 |
| `seedance-chain` | Seedance 连续 Clip | AI 型 |
| `thumbnail-maker` | 封面制作 | 输出型 |
| `music-gen` | BGM 生成 | 逻辑型 |
| `grid-prompt-reverse` | 宫格反推 | AI 型 |

### 输入型/AI 型但不在白名单（当前用完整 UI）

| kind | 中文名 | 交互类型 | hint |
|------|--------|----------|------|
| `asset-import` | 素材导入 | 输入型 | 图像 / 视频 / 音频 / 3D 上传 |
| `mesh-import` | 3D 导入 | 输入型 | glb/gltf/obj 等 3D 模型上传 |
| `clip-editor` | 视频剪辑 | 输入型 | 多片段拼接与转场 |
| `reference-board` | 参考板 | 输入型 | Mood board + 风格约束 prompt |
| `character-sheet` | 角色设定 | 输入型 | 完整设定图 + 档案 + 三视图上传 + 变体 |
| `continuity-check` | 连贯性检查 | AI 型 | 多镜头服装/光影/轴线差异报告 |
| `dialogue-sheet` | 对白表 | 输入型 | 从剧本提取对白行，编辑后驱动配音 |
| `voice-cast` | 多角色配音 | 输入型 | 对白表 → 角色音色配置 → 批量 TTS → 绑定镜头 |
| `reference-analyze` | 参考片反推 | AI 型 | 参考视频 → 分镜草案 → shot-script |

---

## 五、修改方式

1. 调整 Prompt Bar 白名单：`packages/shared/src/catalog/node-interaction.ts` → `PROMPT_BAR_KINDS`
2. 重新生成本文档：`node scripts/gen-node-interaction-doc.mjs`
3. 画布渲染逻辑：`apps/web/src/engine/stage-deck/canvas/stage-deck-node-types.tsx`（`isPromptBarKind`）
