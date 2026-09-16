# NX9 能力总览（本会话增量 · 入口索引 + 接线自检）

> 本文只回答三件事：
> 1. **本会话新增了哪些能力**（逐项）；
> 2. **每个能力从哪里进入**（节点 kind / 工作区面板 / 模板 id / 命令面板命令 / 快捷键）；
> 3. **怎么一眼看到接线是否自洽**（「运行能力自检」），以及**自检查不到什么**。
>
> 本文所有入口都在源码里核对过（源码路径给到文件级）；未实跑 / 未验证的项在第 9 节**逐条**列出，不谎报。

---

## 0. 一键自检（先看这个）

| 步骤 | 操作 |
| --- | --- |
| 1 | 画布上按 `Ctrl/⌘+K`（或 `/`）打开命令面板 |
| 2 | 搜「**运行能力自检**」（关键词：自检 / 能力 / 接线 / wiring / 诊断） |
| 3 | 结果：① toast 给摘要；② 弹出「能力自检」面板，逐项列 8 个检查项 + 证据；有警告/错误时同时 `console.info` 全量报告 |

命令 id：`run-capability-selfcheck`（`apps/web/src/engine/stage-deck/chrome/CommandPalette.tsx`）。
面板：`apps/web/src/engine/stage-deck/chrome/CapabilitySelfcheckPanel.tsx`（复用既有 `ScreenModal`）。

自检读的是**源码文本**（`import.meta.glob(..., { query: '?raw' })`），不 import 这些模块本体，
因此**不受当前 barrel 缺陷影响**（见第 7 节）。**只在浏览器可用**：无 `document` 时直接返回，不在服务端执行。

---

## 1. 总表（本会话 19 项能力）

| # | 能力 | 一句话 | 主入口（最短路径） | 类型 |
| --- | --- | --- | --- | --- |
| 1 | 多格推演 | 多机位 9/25 宫格 · 剧情四宫格 · 画面推演（N 秒前 / M 秒后） | 画布节点 `multi-grid`（Dock「生成」） | 节点 |
| 2 | 角色设定表 | 三视图 / 表情表 / 动作表 / 整套设定表（角色一致性锁定） | 画布节点 `character-sheet-desk`（Dock「生成」） | 节点 |
| 3 | 大师运镜库 | 56 条运镜词库多选拼装 → 注入提示词 | 图片 / 视频工作区工具栏 · 分镜镜编辑 · 3D 舞台 | 工作区 |
| 4 | 运镜时间轴 | 多段运镜编排（时长 / 排序 / 节拍）→ 注入提示词 + 交接 3D | 同上（同一行槽位） | 工作区 |
| 5 | 运镜提示词反解 + 合流 | 把提示词里的运镜读回来，与 3D 通道合流（只读） | 分镜镜编辑「运镜合流」区块 | 工作区 |
| 6 | BGM 节拍导入 | 真实节拍检测 → 时间轴对齐 / 各格时长分配 | 运镜时间轴「从 BGM 分析节拍」· 多格推演「按 BGM 节拍分配各格时长」 | 工作区 |
| 7 | 跨格一致性校验 | 逐格人脸描述比对 + 挑最优格（只读报告） | 多格推演 / 角色设定表工作区结果区 | 工作区 |
| 8 | 逐格出图有界并发 | 1–4 并发出图 + 取消 | 两个工作区的并发下拉 | 工作区 |
| 9 | 多格推演 → 分镜台 | 推演结果按镜写回镜表（两层防重） | 多格推演工作区「生成分镜镜头」 | 工作区 |
| 10 | 内置 AI 模型目录 | 视频 / 文字 / 音频 + 音色内置目录，与「我的连接」合并 | 视频工作台模型下拉 · 配音音色下拉 | 数据 + 接线 |
| 11 | 3D 电影级灯光 | 24 主光位 + 9 轮廓光 + 整组布光 + 环境曝光 | 3D 舞台左侧「光」抽屉 | 3D 面板 |
| 12 | 3D 内置模型资产库 | 40 个内置模型，点击即放置（无需外部文件） | 3D 舞台「添加」抽屉 | 3D 面板 |
| 13 | 3D 内置场景模板 | 8 个内置场景一键搭景（含布光与机位） | 3D 舞台「环境与资源」抽屉 | 3D 面板 |
| 14 | 3D 走位 / 场面调度预设 | 5 个机位 + 3 种走位布局（按在场演员解算） | 3D 舞台「场面调度预设」面板 | 3D 面板 |
| 15 | 3D 大师运镜库 + 运镜时间轴轨 | 运镜 → 可预演机位轨迹 / 关键帧 / 时间轴 | 3D 舞台「运」抽屉 · 左栏「运镜时间轴」 | 3D 面板 |
| 16 | 休眠预设接线 | cinema / lighting / portrait / anime 前缀预设 + 出图尺寸预设 | 图片 / 视频工作区工具栏 · 图片底栏尺寸 chip | 工作区 |
| 17 | R2 休眠接线 | 工作流归档导入导出 · 机位建议 · 候选设定 Prompt 复制 | 命令面板（归档 3 条）· 分镜镜编辑 · 「设定就绪」面板 | 工作区 |
| 18 | 工作流模板增量 | 新增 5 条模板 + 修复既有 12 条非法连线 | 模板选择器「推演与设定表」· 命令面板搜模板名 | 数据 |
| 19 | 能力自检 | 源码级接线体检（8 项检查） | 命令面板「运行能力自检」 | 工具 |

> 3 / 4 / 5 / 6 / 7 / 8 / 16 / 17 是**工作区能力**（不是画布节点），因此不出现在 Dock，
> 也不会被模板连成节点。

---

## 2. 逐项明细

### 2.1 多格推演 `multi-grid`

- **一句话**：一次推演一格网格（3×3 / 5×5 / 2×2 / 1×3），每格带真实机位或节拍语义，可逐格出图、写回镜表。
- **入口**
  - 画布 Dock「生成」分组（目录 `packages/shared/src/catalog/block-catalog.ts`）
  - 命令面板：`Ctrl/⌘+K` 或 `/` → 搜「多格推演 / 宫格 / 机位」
  - 工作区：节点下侧跟随工作区（`attached-workspace/tool/MultiGridWorkspace.tsx`）
  - 模板：`tpl-multigrid-multicam` / `tpl-multigrid-story` / `tpl-multigrid-frame`
- **四种模式**：`multi-cam-9`（3×3）· `multi-cam-25`（5×5）· `story-predict-4`（2×2）· `frame-predict`（1×3）
- **关键源码**：`apps/web/src/blocks/core/MultiGridBlock.tsx` · `apps/web/src/engine/multi-grid-closure.ts` ·
  `apps/web/src/engine/flow-runner-ops/multi-grid-ops.ts` · 纯函数 `packages/shared/src/utils/multi-grid-plan.ts`
- **已知边界**（详见 `docs/NX9-MULTI-GRID-DEDUCTION.md`）：不做 3D 可视化预演（机位是**建议**数值）；
  不接 LLM 反推源图内容；接触表拼合依赖服务端在线；真实出图需凭据（**本环境未端到端验证**）。

### 2.2 角色设定表 `character-sheet-desk`

- **一句话**：按 4 种版面生成角色设定图，一致性锁定档位控制「换角度不换人」的强度。
- **入口**：画布 Dock「生成」· 命令面板搜「角色设定表 / 三视图 / 表情表 / 动作表」·
  底部跟随工作区（`tool/CharacterSheetWorkspace.tsx`）· 模板 `tpl-character-sheet-desk`
- **四版面**：`turnaround` 三视图（4 格）· `expression` 表情表（10 格）· `pose` 动作表（5 格）· `full` 整套（19 格）
- **一致性档位**：`loose` 0.82 / `standard` 0.72 / `strict` 0.58（越低越贴参考图）
- **关键源码**：`apps/web/src/blocks/core/CharacterSheetBlock.tsx` ·
  `apps/web/src/engine/character-sheet-closure.ts` · 纯函数 `packages/shared/src/utils/character-sheet-plan.ts`
- **重要坑**：kind 是 `character-sheet-desk`，**不是** `character-sheet`（后者是历史废弃 kind，会被迁移改写）。
- **已知边界**：登记为角色参考图**不会新建角色**；逐格入库 / 接触表式导出**未实现**；
  逐格出图默认**串行**（可用并发下拉提上限）；真实出图需凭据（**未端到端验证**）。

### 2.3 大师运镜库

- **一句话**：56 条运镜按家族分组、可搜索、可多选叠加，拼成一行提示词并**幂等**注入既有提示词字段。
- **入口**：图片工作区工具栏（`attached-workspace/generation/picture/PictureWorkspace.tsx`）·
  视频工作区工具栏（`.../video/VideoWorkspace.tsx`）· 分镜镜编辑（`blocks/craft/storyboard-desk/shot-edit-modal.tsx`）·
  3D 舞台**另有一套**（见 2.15）
- **关键源码**：词库 `packages/shared/src/data/camera-move-library.ts` · 选择器
  `apps/web/src/engine/stage-deck/chrome/attached-workspace/generation/CameraMovePicker.tsx`（标签「大师运镜」）
- **落库约定**：**不新增持久化字段**；选中态是会话级 UI 状态，落库的是**注入后的提示词文本**。
- **已知边界**：不驱动 3D 机位（那是 2.15 的落点之一）；不做逐镜批量运镜；`durationHintSec` 只是经验提示。

### 2.4 运镜时间轴

- **一句话**：把多段运镜排成时间轴（拖时长 / 排序 / 绑镜头时长 / 贴节拍），预览后写回提示词并交接 3D。
- **入口**：与 2.3 同一行槽位（图片 / 视频工作区工具栏、分镜镜编辑）
- **关键源码**：编辑器 `attached-workspace/generation/CameraMoveTimelineEditor.tsx` ·
  纯函数 `packages/shared/src/utils/camera-move-timeline.ts` · 类型 `packages/shared/src/types/camera-move-timeline.ts`
- **已知边界**：**时间轴本体（秒数 / 缓动 / 速度曲线）不跨会话**——刷新后只剩套用生成的 `movetl-*` 机位，
  没有「按秒 scrub」；片段之间无过渡（硬切）。

### 2.5 运镜提示词反解 + 两通道合流（只读）

- **一句话**：把提示词里的运镜读回来，和 3D 通道的 `cameraPrompt` 并排对照，**显式报冲突**。
- **入口**：分镜镜编辑弹窗「运镜合流」区块（`shot-edit-modal.tsx`）
- **关键源码**：`packages/shared/src/utils/camera-move-parse.ts` · `camera-move-merge.ts`
- **已知边界**：**只读**——不自动改写 `videoPrompt` / `director3dGuide.cameraPrompt`、不裁决冲突；
  不还原 `easing` / 片段备注；不做包含式模糊匹配。

### 2.6 BGM 节拍导入

- **一句话**：服务端 ffmpeg + 能量 onset 检测出**真实节拍**，时间轴按节拍吸附、多格按节拍分配各格时长。
- **入口**：运镜时间轴「从 BGM 分析节拍」/「对齐到真实节拍」· 多格推演「按 BGM 节拍分配各格时长」
- **关键源码**：取数 `apps/web/src/engine/beat-grid.ts`（调 `POST /api/montage/beat-analyze`）·
  纯函数 `packages/shared/src/utils/beat-grid-plan.ts`
- **诚实边界**：失败**一律如实透传**（不拿 BPM 等分冒充节拍）；节拍网格只在会话内；
  多格节拍时长**不写节点字段**，所以不会自动改变下游视频时长；**真实音频端到端未跑过**。

### 2.7 跨格一致性校验

- **一句话**：逐格比对「人脸描述里的外观关键词」，报冲突并给出「挑最优格」建议（只读报告）。
- **入口**：多格推演工作区结果区「一致性校验」· 角色设定表工作区结果区「一致性校验」
- **关键源码**：面板 `attached-workspace/consistency/ConsistencyCheckSection.tsx` ·
  取数 `apps/web/src/engine/consistency-check.ts` · 纯函数 `packages/shared/src/utils/consistency-report.ts`
- **已知边界**：全部判定是**启发式**（LLM 漏写 vs 真的没有无法区分，severity 固定 warn）；
  不做几何 / 像素比对；不跨节点比对；报告是会话内状态；**真实人脸分析端到端未跑**。

### 2.8 逐格出图有界并发

- **一句话**：逐格出图支持 1–4 并发的有界并发原语（含取消），替代此前的纯串行。
- **入口**：多格推演 / 角色设定表工作区的并发下拉
- **关键源码**：`apps/web/src/engine/run-with-concurrency.ts` · `apps/web/src/engine/flow-runner-ops/cell-gen-batch.ts`
- **已知边界**：未回填 `flow-runner.ts` 的 `runLayerConcurrent`（保持原样，有源码守卫）；
  不做按服务商差异化限流；**未覆盖真实出图端到端**。

### 2.9 多格推演 → 分镜台（镜头层面写回）

- **一句话**：把推演计划落成镜头（景别 / 时长 / 首帧 / 序号续接），两层防重写进镜表。
- **入口**：多格推演工作区「生成分镜镜头」面板
- **关键源码**：纯函数 `packages/shared/src/utils/multi-grid-to-shots.ts` · 写回在 `tool/MultiGridWorkspace.tsx`
- **已知边界**：分镜台重算会改写部分字段（`extreme-wide` → `wide`、`custom` → `medium`）；
  拆镜结构不承载首帧；不臆测场次 / 角色资产绑定。

### 2.10 内置 AI 模型目录

- **一句话**：三张内置目录（视频 / 文字 / 音频）+ 音色，与「我的连接」合并展示、按写入值去重。
- **入口**：视频工作台模型下拉（分组「内置模型 / 我的连接 / 配置视频连接…」）·
  AI 配音节点 `sound-gen` 音色下拉（`<optgroup>`）· 多角色配音节点 `voice-cast` 音色
- **关键源码**：`packages/shared/src/data/{video-gen-models,llm-models,audio-models,model-catalog}.ts` ·
  接线 `apps/web/src/hooks/use-connected-video-models.ts` ·
  `.../composer/ComposerModelSelect.tsx` · `apps/web/src/blocks/core/SoundGenBlock.tsx` · `apps/web/src/blocks/nx9/VoiceCastBlock.tsx`
- **写入字段未变**：视频仍写 `data.model`，音色仍写 `data.voice` / `profileMap`。
- **已知边界**：**文字模型下拉与音频引擎下拉未接线**（会错配 baseUrl / 密钥，或需要新增字段）；
  能力位（参考图 / 音频 / 时长 / 画幅）目前只是元数据。

### 2.11 3D 导演台 · 电影级灯光

- **一句话**：24 主光位 + 9 轮廓光 + 整组布光 + 环境 / 曝光，灯组随工程一起撤销 / 落盘。
- **入口**：3D 舞台左侧竖排「**光**」抽屉（移动端底栏「灯光」）· 面板内容「灯光 / 环境与曝光 / 单灯微调 / 环境光预设 / 提示词灯光片段（写入批出）」
- **关键源码**：`packages/director3d/src/panels/LightingPanel.tsx` · `presets/lightingPresets.ts`
- **已知边界**：不做视口内拖拽灯位 / 无 gizmo；色温用 hex 而非 K 值；不开放阴影质量参数；
  无 IES / 体积光；灯光只通过 `cameraPrompt` 的 `lighting:` 片段与镜头态快照体现，不单独写 `director3dGuide`。

### 2.12 3D 导演台 · 内置模型资产库

- **一句话**：40 个内置模型（家具 / 建筑构件 / 自然 / 载具 / 道具 / 屏幕板面），点击即放置到场景中心，原点贴地。
- **入口**：3D 舞台「添加」抽屉 →「内置模型（点击即放置，无需外部文件）」
- **关键源码**：`packages/director3d/src/presets/builtinAssets.ts` · 渲染 `packages/director3d/src/runtime/BuiltinPropMesh.tsx`
- **已知边界**：纯 `meshStandardMaterial` 单色部件，**无贴图 / UV**，不能导出为 glb。

### 2.13 3D 导演台 · 内置场景模板

- **一句话**：8 个内置场景（客厅 / 卧室 / 办公室 / 教室 / 街道 / 森林 / 审讯室 / 摄影棚片场）一键搭景，含布光与机位，保留当前角色。
- **入口**：3D 舞台「环境与资源」抽屉 →「内置场景模板（一键搭景，保留当前角色）」
- **关键源码**：`packages/director3d/src/presets/builtinScenes.ts` · `applyBuiltinScene()`

### 2.14 3D 导演台 · 走位 / 场面调度预设

- **一句话**：5 个场面调度机位 + 3 种走位布局（一字排开 / 对话对峙 / 三角站位），按当前可见且未锁定的演员数解算。
- **入口**：3D 舞台「场面调度预设」面板（`StageDeckShell` 内渲染）
- **关键源码**：`packages/director3d/src/ui/BlockingPresetPanel.tsx` · 纯几何 `packages/shared/src/utils/blocking-layout.ts`
- **已知边界**：**不造第二套机位来源**——与既有 `CameraPresetBar` 分工见 `docs/NX9-DORMANT-PRESET-ENTRYPOINTS.md`。

### 2.15 3D 导演台 · 大师运镜库 + 运镜时间轴轨

- **一句话**：舞台里选运镜 → 生成可预演的机位轨迹 / 套用为关键帧 / 加入时间轴 / 只写镜头语言。
- **入口**：舞台左侧「**运**」抽屉（移动端底栏 sheet「运镜」）· 左栏「运镜时间轴」轨
- **关键源码**：`packages/director3d/src/ui/CameraMoveLibraryPanel.tsx` ·
  `CameraMoveTimelineRail.tsx` · 机位运动 `packages/director3d/src/schema/cameraMoveMotion.ts` ·
  一镜多机位持久化 `packages/director3d/src/schema/cameraMoveTimelineKeys.ts`
- **已知边界**：13 条运镜是**代理近似**（面板显式标注 `representation: 'proxy'`，见
  `docs/NX9-3D-CAMERA-MOVE-INTEGRATION.md` 第 5 节）；舞台不做景深 / 运动模糊 / 升格；
  时间轴本体不落盘（只有套用生成的关键帧机位落盘）。

### 2.16 休眠预设接线（cinema / lighting / portrait / anime / 出图尺寸）

- **一句话**：把「有数据、没入口」的预设接成工作区里可选择的前缀注入行（幂等 / 可清除 / 互不覆盖）。
- **入口**：图片工作区 + 视频工作区工具栏（预设选择器：电影感 / 灯光 / 人像 / 动漫标签，**动漫仅图片**）·
  图片工作区底栏「出图尺寸」chip
- **关键源码**：注入核心 `packages/shared/src/utils/preset-entrypoints.ts` ·
  选择器 `.../generation/PresetSectionPicker.tsx` · `.../picture/PictureSizePresetChip.tsx`
- **注入行前缀**：`cinematic style:` / `lighting:` / `portrait:` / `anime style:`（与 `camera movement:` 各行独立）
- **未接入（有理由）**：`FAL_MODELS`（与既有模型解析链重叠）、`COMFY_PRESETS`（是操作指引文案而非提示词片段）、
  `CAMERA_PROMPT_PRESETS`（已被大师运镜库覆盖）。

### 2.17 R2 休眠接线（归档 / 机位建议 / 候选 Prompt 复制）

- **一句话**：把三处「有实现、零入口」的能力接成可用入口。
- **入口**
  - 命令面板 3 条：`导出 · 工作流归档` / `导出 · 工作流归档（仅选区）` / `导入 · 工作流归档`
  - 分镜镜编辑弹窗 →「机位建议」区块（幂等注入一行 `机位建议：…`，可清除）
  - 「设定就绪」面板（`components/asset/AssetReadinessPanel.tsx`）→ 逐角色 / 逐场景的复制 chip
- **关键源码**：`apps/web/src/engine/workflow-archive.ts` · `apps/web/src/engine/shot-blocking-hint.ts` ·
  `apps/web/src/components/asset/AssetCandidatePromptCopy.tsx`
- **已知边界**：归档导出走**既有 ZIP 通道**（不再造第二套 JSON 导出）；候选 Prompt 复制是**只读**；
  明确判「不接」的 32 个 API / 23 个孤儿模块 / 66 个零引用导出有反向守卫，理由见
  `docs/NX9-DORMANT-CAPABILITY-WIRING-R2.md` 第 4 节。

### 2.18 工作流模板：新增 5 条 + 修复既有非法连线

- **一句话**：新增 5 条一键拉起模板；修复既有 12 条 `validateLink` 非法边（9 条模板），全量校验现为 0 非法边。
- **入口**：模板选择器（空画布）「推演与设定表」分组 · 命令面板搜「配方 · …」· 工作流模板面板
- **关键源码**：`packages/shared/src/data/workflow-templates.ts` ·
  `apps/web/src/engine/stage-deck/chrome/RecipePickerOverlay.tsx`
- **已知边界**：既有 28 条模板的 id 与顺序**未动**；模板引用内部钉板 `media-pin` 作「结果预览位」是**设计如此**。

### 2.19 能力自检（本次收口新增）

- **一句话**：8 项源码级接线体检，把「有哪些能力、从哪进、接线是否自洽」一次说清。
- **入口**：命令面板「运行能力自检」（命令 id `run-capability-selfcheck`）；无快捷键（沿用面板热键 `Ctrl/⌘+K`、`/`）
- **关键源码**：纯函数 `packages/shared/src/utils/capability-selfcheck.ts`（**零 import**）·
  取数壳层 `apps/web/src/engine/capability-selfcheck.ts` · 面板
  `apps/web/src/engine/stage-deck/chrome/CapabilitySelfcheckPanel.tsx`
- **8 个检查项**：取数完整性 · 目录 kind ↔ 前端 loader · loader 孤儿 · 目录 kind ↔ socket 定义 ·
  kind ↔ 跟随工作区条目 · 模板引用的 kind 是否存在 · 本会话能力的测试文件 · concealed/deprecated 与可见性自洽
- **已知边界**：见第 6 节（能查 / 不能查）。

---

## 3. 本会话新增模板 id

| 模板 id | 名称 | category | status | 链路 |
| --- | --- | --- | --- | --- |
| `tpl-multigrid-multicam` | 多机位推演（9 宫格） | video | ga | 素材导入 → 多格推演（multi-cam-9）→ 视频生成 / 宫格 |
| `tpl-multigrid-story` | 剧情推演四宫格 | story | ga | 分镜台 → 多格推演（story-predict-4）→ 视频生成 → 交付打包 |
| `tpl-multigrid-frame` | 画面推演（N 秒前 / M 秒后） | video | beta | 素材导入 → 多格推演（frame-predict）→ 视频生成 → 交付打包 |
| `tpl-character-sheet-desk` | 角色设定表（三视图 / 表情 / 动作） | story | ga | 素材导入 + 参考板 → 角色设定表 → 宫格 → 交付打包 |
| `tpl-bgm-beat-camera` | BGM 节拍运镜成片（Beta） | video | beta | 配音 → 图像生成 → 视频生成 → 智能剪辑 → 交付打包 |

模板总数：**33 条**（既有 28 条 id 与顺序未变）。

---

## 4. 本会话新增的命令面板命令

| 命令 id | 标签 | 说明 |
| --- | --- | --- |
| `export-workflow-zip` | 导出 · 工作流归档 | 整画布导出 `.nx9zip` |
| `export-workflow-zip-selection` | 导出 · 工作流归档（仅选区） | 只导出选中节点 |
| `import-workflow-zip` | 导入 · 工作流归档 | 合并导入（`merge`） |
| `run-capability-selfcheck` | 运行能力自检 | 本次收口新增：8 项接线体检 |

---

## 5. 本会话新增测试

`apps/web/src/engine/__tests__/` 与 `apps/web/src/blocks/craft/__tests__/` 下**新增 33 个测试文件**
（31 个为本会话各批次所加，2 个为本次收口所加：`capability-selfcheck.test.ts`、
`capability-selfcheck-shell.test.tsx`）。

全部走**相对路径直取 shared / director3d 源码**，不依赖 `@nx9/shared` barrel（原因见第 7 节）。

```bash
cd apps/web
node_modules/.bin/vitest run src/engine/__tests__/capability-selfcheck.test.ts \
  src/engine/__tests__/capability-selfcheck-shell.test.tsx
```

---

## 6. 能力自检：能查什么 / 不能查什么

**能查（真实读源码文本后判定）**

| 检查项 | 判据 | 判定口径 |
| --- | --- | --- |
| 取数完整性 | 5 个源码 + 1 个声明 | 源取不到 / 取到但**解析不出任何条目**（解析口径失效）→ error；重复 kind、缺 kind/id 的脏条目 → warn |
| 目录 kind ↔ 前端 loader | `BLOCK_CATALOG` × `blocks/registry.tsx` | 可见 kind 无 loader → **error**；concealed/deprecated 无 loader → warn（预期） |
| loader 孤儿 | loader × 目录 | 不在目录且未声明为内部/别名（`media-pin`、`dialogue-sheet`）→ warn |
| 目录 kind ↔ socket 定义 | `SOCKET_REGISTRY` ∪ `VERTICAL_SOCKETS` | 可见 kind 无 socket 定义 → **error**（连线会静默失败）；已隐藏/废弃 → warn |
| kind ↔ 跟随工作区 | `ATTACHED_WORKSPACE_REGISTRY` | 本会话新增能力无工作区 → **error**；存量 kind 无工作区 → warn；非目录 kind 保留历史条目 → 按设计不判定 |
| 模板引用的 kind 是否存在 | 33 条模板 × `node('kind')` | 未知 kind / 无目录也无 loader → **error**；非目录（非内部）→ warn；已废弃 → warn |
| 本会话能力的测试文件 | 8 个能力 × 声明映射 | 声明能力不在目录 → **error**；无测试文件 → warn；未标记任何能力 → warn（未判定） |
| concealed/deprecated 与可见性 | 目录项标记 | deprecated 未 concealed（仍在 Dock）→ warn；非目录却 concealed → **error**；新增能力被隐藏 → warn |

**不能查（诚实边界）**

1. **不判断功能是否真的跑通**：只看源码接线，不出「可用 / 不可用」结论，也不代表端到端可用。
2. **不检查模块解析**：浏览器侧没有文件系统，`packages/shared/src/index.ts` 的 8 个缺失模块（第 7 节硬阻塞）
   **不在自检范围内**，必须人工核对。
3. **测试文件是声明式映射**：`apps/web/src/engine/capability-selfcheck.ts` 里的
   `SESSION_KIND_TEST_FILES` 是**人工维护**的清单；单测会用 `node:fs` 逐个核验文件存在，
   但**不能证明测试真的有牙 / 真的覆盖该能力的行为**。
4. **只看「有没有」，不看「对不对」**：socket 定义存在≠口型语义正确；工作区条目存在≠面板真的渲染；
   模板引用的 kind 存在≠连线口型合法（后者由 `workflow-templates-links.test.ts` 负责）。
5. **看不到历史数据兼容**：`ATTACHED_WORKSPACE_REGISTRY` 里 50+ 个非目录 kind 的历史条目按设计**不报问题**。
6. **看不到运行时开关**：`product-surface` 的能力位、首用单车道等运行时可见性不在判定内。

---

## 7. 硬阻塞（当前工作树 → 全量构建与端到端不可用）

**这 4 条与本次增量无关，是既有缺陷；但只要不修，`pnpm build` / `pnpm typecheck` / 浏览器端到端都跑不通。**

| # | 事实 | 证据 | 后果 |
| --- | --- | --- | --- |
| 1 | `packages/shared/src/index.ts` re-export 了 **8 个不存在的模块** | `./data/{emotion-presets,shot-move-families,creative-asset-presets,character-face-rig-presets,playbook-definitions,camera-presets,shot-lexicon-taxonomy,provider-registry}` | `@nx9/shared` **整体解析失败**；Vite dev 直接报错，任何经 barrel 的模块都加载不了 |
| 2 | 这 8 个文件曾因 `.gitignore` 的 `data/` 规则被**静默忽略**、从未入库 | `git check-ignore -v packages/shared/src/data/emotion-presets.ts` | 克隆出来的工作树必然缺这些文件；`.gitignore` 本会话已改为 `/data/`（只忽略仓库根），但**历史文件仍缺** |
| 3 | `apps/web/tsconfig.json` 的 `@nx9/shared` 指向**过期 dist** | `paths: {"@nx9/shared": ["../../packages/shared/dist/esm/index.d.ts"]}` | `tsc -b` 会报「has no exported member」（dist 落后于源码），全量类型检查不可信 |
| 4 | vitest 的 `@nx9/shared` 别名指向**源码 barrel** | `apps/web/vitest.config.ts` | **84 个既有测试文件在加载期失败**（错误签名 100% 是 `Failed to resolve import "./data/emotion-presets"`） |

**处置方向**：把这 8 个 `packages/shared/src/data/*.ts` 从完整工作副本恢复回仓库（本次任务**明令禁止**创建/修改它们），
然后 `pnpm --filter @nx9/shared build` + `pnpm typecheck` + `pnpm run verify:main-flow` 才有意义。

> 本次增量全部**相对路径直取源码**，所以即使 barrel 坏着，新增能力的单测也能独立运行（见第 8 节）。

---

## 8. 怎么跑（含实测结果）

```bash
cd apps/web

# ① 能力自检单测（59 项：纯函数边界 + 真实仓库取数 + 面板渲染 + 命令面板源码守卫）
node_modules/.bin/vitest run src/engine/__tests__/capability-selfcheck.test.ts \
  src/engine/__tests__/capability-selfcheck-shell.test.tsx
# → Test Files 2 passed (2) / Tests 59 passed (59) / exit 0

# ② 全量回归（含既有 84 个 barrel 失败文件，属既有缺陷）
node_modules/.bin/vitest run
```

**实测（本次收口前后对照）**

| 指标 | 变更前基线 | 变更后 | 差异 |
| --- | --- | --- | --- |
| 测试文件总数 | 157 | 159 | +2（本次新增 2 个） |
| 失败文件数 | **84** | **84** | **0** |
| 通过文件数 | 73 | 75 | +2 |
| 用例总数 | 874 | 933 | +59 |
| 失败用例数 | **2**（`DirectorDeskBlock` / `ScriptDeskBlock` 渲染） | **2**（同一对） | **0** |
| 失败文件集合 diff | — | — | **空集**（无新增失败、无转绿） |

> 84 个失败文件 100% 是加载期失败（`@nx9/shared` → `Failed to resolve import "./data/emotion-presets"`），
> 与本次增量无关；本次新增的两个测试文件在**不依赖 barrel** 的前提下全绿。

---

## 9. 未验证 / 未完成项（逐条）

1. **浏览器端到端全部未验证**：`@nx9/shared` barrel 缺失 8 个模块（第 7 节），
   `pnpm run dev` 起不来画布，因此**「运行能力自检」命令在真实浏览器里没有被点过**。
   已验证的是：面板能渲染真实报告（jsdom + `@testing-library/react`）、
   取数壳层能取到与 `node:fs` 一致的源码文本与结论（`runCapabilitySelfcheck()` 单测，同一套 Vite transform）；
   **命令面板本身**只有源码级守卫（因为它 import 了 barrel，jsdom 里必然解析失败）。
2. **`pnpm build` / `pnpm typecheck` / `verify:main-flow` 未跑通、也未声称通过**（被第 7 节阻塞）。
3. **AI 生成类能力（出图 / 出视频 / 人脸分析 / 节拍分析）无真实通道端到端**：
   需要凭据 / 服务端在线 / ffmpeg，本机不可执行；各能力的单测用注入 mock 验证行为与失败透传。
4. **`multi-grid` / `character-sheet-desk` 的 Dock 可见性与工作区跟随**：
   只按目录 + registry + attached-workspace 三个表核对（自检覆盖），**没有在浏览器里目视确认**。
5. **自检的测试映射是人工声明**（第 6 节第 3 条）：只核验文件存在，不核验覆盖度。
6. **既有 84 个失败测试文件未修复**（超出本次任务边界，且本次明令不得动那 8/9 个模块与 barrel import）。
7. 本文引用的「既有 5 步验收命令」等口径来自 `docs/` 与会话记录，**本次未实跑**。
