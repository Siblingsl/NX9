# NX9 新增能力入口索引（多格推演 / 角色设定表 / 运镜与节拍工作区能力）

本文只做一件事：**把本会话新增能力的位置列清楚，让用户知道从哪里一键拉起**。
每条能力给「节点 kind / 工作区 / 模板 id / 命令面板关键词 / 源码位置」五要素。

新增能力共 5 项：

| # | 能力 | 类型 | 一键拉起方式 |
|---|---|---|---|
| 1 | 多格推演（多机位 9 / 25 宫格、剧情四宫格、画面推演） | 画布节点 `multi-grid` | Dock「生成」分组 · 命令面板 · 3 条模板 |
| 2 | 角色设定表（三视图 / 表情表 / 动作表 / 整套） | 画布节点 `character-sheet-desk` | Dock「生成」分组 · 命令面板 · 1 条模板 |
| 3 | 运镜时间轴（多段运镜编排 + 注入提示词 + 交接 3D） | 工作区能力（非节点） | 图像生成 / 视频生成工作区 · 分镜台镜头编辑 |
| 4 | 大师运镜库（56 条运镜词库选型） | 工作区能力（非节点） | 同 3（同一行槽位） |
| 5 | BGM 节拍导入（真实节拍网格） | 工作区能力（非节点） | 运镜时间轴「从 BGM 分析节拍」· 多格推演「按节拍分配各格时长」 |

> 3 / 4 / 5 是**工作区能力**而不是画布节点，所以它们不出现在 Dock，也不会作为节点被模板连出来；
> 模板只负责把「BGM + 画面 + 剪辑 + 导出」这条链一次拉起，节拍与运镜编排在对应工作区里完成。

---

## 1. 多格推演 `multi-grid`

### 入口

| 入口 | 位置 | 关键词 |
|---|---|---|
| 画布 Dock | 「生成」分组（`BLOCK_GROUPS.generate`） | 多格推演 |
| 命令面板 | `Ctrl/Cmd+K` 或 `/` → 「添加 · 多格推演」 | `multi-grid`、推演、宫格、机位 |
| 模板选择器（空白画布） | 「推演与设定表」分组 | 多机位推演 / 剧情推演四宫格 / 画面推演 |
| 工作区 | 节点摘要卡下方跟随工作区（tool 壳层） | 模式 / 计划 / 批量出图 / 逐格送视频 |

### 四种模式（工作区内切换）

| 模式 id | 名称 | 几何 | 语义 |
|---|---|---|---|
| `multi-cam-9` | 多机位 9 宫格 | 3×3 | 3 方位 × 3 景别的机位矩阵 |
| `multi-cam-25` | 多机位 25 宫格 | 5×5 | 5 方位 × 5 景别精细矩阵 |
| `story-predict-4` | 剧情推演四宫格 | 2×2 | 起因 → 冲突 → 转折 → 收束 / 钩子 |
| `frame-predict` | 画面推演 | 1×3 | N 秒前 / 当前 / M 秒后（当前格复用源图，前后格互为收尾帧） |

### 一键拉起模板

| 模板 id | 名称 | 链路 |
|---|---|---|
| `tpl-multigrid-multicam` | 多机位推演（9 宫格） | 素材导入 → 多格推演（multi-cam-9）→ 视频生成 / 宫格 |
| `tpl-multigrid-story` | 剧情推演四宫格 | 分镜台 → 多格推演（story-predict-4）→ 视频生成 → 交付打包 |
| `tpl-multigrid-frame` | 画面推演（N 秒前 / M 秒后） | 素材导入 → 多格推演（frame-predict）→ 视频生成 → 交付打包 |

### 源码位置

- 目录登记：`packages/shared/src/catalog/block-catalog.ts:75`
- socket：`packages/shared/src/catalog/socket-registry.ts`（accepts `picture`/`prompt`，emits `picture`/`prompt`）
- 节点卡：`apps/web/src/blocks/core/MultiGridBlock.tsx`；注册 `apps/web/src/blocks/registry.tsx:18`
- 工作区：`apps/web/src/engine/stage-deck/chrome/attached-workspace/tool/MultiGridWorkspace.tsx`
- 执行器：`apps/web/src/engine/flow-runner-ops/multi-grid-ops.ts`；闭环 `apps/web/src/engine/multi-grid-closure.ts`
- 计划构造（纯函数）：`packages/shared/src/utils/multi-grid-plan.ts`
- 写回镜表：`packages/shared/src/utils/multi-grid-to-shots.ts`
- 说明文档：`docs/NX9-MULTI-GRID-DEDUCTION.md`、`docs/NX9-MULTI-GRID-TO-STORYBOARD.md`

---

## 2. 角色设定表 `character-sheet-desk`

### 入口

| 入口 | 位置 | 关键词 |
|---|---|---|
| 画布 Dock | 「生成」分组（`BLOCK_GROUPS.generate`） | 角色设定表 |
| 命令面板 | `Ctrl/Cmd+K` 或 `/` → 「添加 · 角色设定表」 | `character-sheet-desk`、三视图、表情表、动作表 |
| 模板选择器（空白画布） | 「推演与设定表」分组 | 角色设定表 |
| 工作区 | 节点摘要卡下方跟随工作区（tool 壳层） | 版面 / 一致性档位 / 逐格提示词 / 批量出图 / 登记角色参考图 |

### 四种版面（工作区内切换）

| 版面 id | 名称 | 格数 |
|---|---|---|
| `turnaround` | 三视图 | 4（1×4） |
| `expression` | 表情表 | 10（2×5） |
| `pose` | 动作表 | 5（1×5） |
| `full` | 整套设定表 | 19（4×5） |

一致性档位：`loose` / `standard` / `strict`（分别对应图生图强度 0.82 / 0.72 / 0.58，越低越贴参考图）。

### 一键拉起模板

| 模板 id | 名称 | 链路 |
|---|---|---|
| `tpl-character-sheet-desk` | 角色设定表（三视图 / 表情 / 动作） | 素材导入（角色参考图）+ 参考板 → 角色设定表（整套 / 严格档）→ 宫格 → 交付打包 |

### 源码位置

- 目录登记：`packages/shared/src/catalog/block-catalog.ts:84`
- 节点卡：`apps/web/src/blocks/core/CharacterSheetBlock.tsx`；注册 `apps/web/src/blocks/registry.tsx:19`
- 工作区：`apps/web/src/engine/stage-deck/chrome/attached-workspace/tool/CharacterSheetWorkspace.tsx`
- 执行器：`apps/web/src/engine/flow-runner-ops/character-sheet-ops.ts`；闭环 `apps/web/src/engine/character-sheet-closure.ts`
- 版面构造（纯函数）：`packages/shared/src/utils/character-sheet-plan.ts`
- 说明文档：`docs/NX9-CHARACTER-SHEET.md`

---

## 3. 运镜时间轴（CameraMoveTimelineEditor）

**不是节点**：它是挂在既有节点工作区里的一行编辑器，编排结果只写回既有提示词字段（不新增持久化字段），编辑器状态是会话级的。

| 入口 | 位置 |
|---|---|
| 图像生成工作区 | `apps/web/src/engine/stage-deck/chrome/attached-workspace/generation/picture/PictureWorkspace.tsx:1143`（大师运镜库）/ `:1149`（运镜时间轴） |
| 视频生成工作区 | `.../generation/video/VideoWorkspace.tsx:502` / `:508` |
| 分镜台镜头编辑 | `apps/web/src/blocks/craft/storyboard-desk/shot-edit-modal.tsx:209` / `:223` |

能力：从运镜库添加片段 → 横向时间轴（拖动改时长 / 排序 / 删除）→ 总时长与镜头绑定或对齐节拍 → 注入提示词（`buildComposedMovePrompt`）→ 交接 3D 导演台（`useMoveTimelineStore`）。

源码：`apps/web/src/engine/stage-deck/chrome/attached-workspace/generation/CameraMoveTimelineEditor.tsx`
文档：`docs/NX9-CAMERA-MOVE-TIMELINE.md`

---

## 4. 大师运镜库（CameraMovePicker）

| 入口 | 位置 |
|---|---|
| 与运镜时间轴同一行槽位 | 见上表（Picture / Video 工作区、分镜台镜头编辑） |

词库：`packages/shared/src/data/camera-move-library.ts`（56 条，按 family 分组）。
源码：`apps/web/src/engine/stage-deck/chrome/attached-workspace/generation/CameraMovePicker.tsx`
文档：`docs/NX9-CAMERA-MOVE-LIBRARY.md`、`docs/NX9-CAMERA-MOVE-PARSE-AND-MERGE.md`

---

## 5. BGM 节拍导入（beat-grid）

真实节拍来自服务端 ffmpeg 解码 + 能量 onset 检测（`POST /api/montage/beat-analyze`，见
`apps/server/src/modules/montage/montage.controller.ts:168`）。
**失败一律如实透传，不伪造节拍**（不拿 BPM 等分当节拍点）。

| 入口 | 位置 | 动作 |
|---|---|---|
| 运镜时间轴 | `CameraMoveTimelineEditor`（同上） | 「从 BGM 分析节拍」→ 时间轴标出真实节拍点 → 「对齐到真实节拍」 |
| 多格推演工作区 | `.../tool/MultiGridWorkspace.tsx:33`（接入）/ `:288`（分析） | 「按 BGM 节拍分配各格时长」 |

源码：`apps/web/src/engine/beat-grid.ts`；纯函数 `packages/shared/src/utils/beat-grid-plan.ts`
文档：`docs/NX9-BEAT-GRID-IMPORT.md`

---

## 6. 一键拉起模板总表（本会话新增 5 条）

全部追加在 `packages/shared/src/data/workflow-templates.ts` 的 `WORKFLOW_TEMPLATES` **末尾**
（既有 28 条原样保留，不动顺序、不动 id）。

| # | 模板 id | 名称 | category | status | 行号 |
|---|---|---|---|---|---|
| 1 | `tpl-multigrid-multicam` | 多机位推演（9 宫格） | video | ga | `:733` |
| 2 | `tpl-multigrid-story` | 剧情推演四宫格 | story | ga | `:762` |
| 3 | `tpl-multigrid-frame` | 画面推演（N 秒前 / M 秒后） | video | beta | `:789` |
| 4 | `tpl-character-sheet-desk` | 角色设定表（三视图 / 表情 / 动作） | story | ga | `:817` |
| 5 | `tpl-bgm-beat-camera` | BGM 节拍运镜成片（Beta） | video | beta | `:847` |

> 行号为追加时的实际位置（`WORKFLOW_TEMPLATES` 数组元素起始行）；模板顺序即模板选择器分组顺序。

三条消费入口都能拿到这 5 条：

1. **模板选择器**（空画布）：`apps/web/src/engine/stage-deck/chrome/RecipePickerOverlay.tsx:35` 追加
   `DEDUCTION_RECIPE_IDS`，渲染在 `:115` 的「推演与设定表」分组；既有 4 条推荐位顺序不变。
   未解锁首用单车道时不投放（与既有「首用只保留核心流程」口径一致）。
2. **命令面板**：`listWorkflowTemplates()` 全量收录，直接搜「多格推演 / 角色设定表 / BGM」即可。
3. **工作流模板面板**：`apps/web/src/panels/WorkflowTemplatesPanel.tsx` 按 `category` 分组，
   新模板自动落进「视频 / 分镜」两组（见该文件 `categories` 常量）。

## 7. 回归测试

| 测试 | 覆盖 |
|---|---|
| `apps/web/src/engine/__tests__/workflow-templates-new.test.ts` | 新模板存在 / id 唯一 / `build()` 端点自洽 / kind 真实 / 连线口型合法 / handle 不悬空 / 既有 28 条 id 与顺序逐条未变 / 新节点在 Dock 与生成分组可见 |
| `apps/web/src/engine/__tests__/recipe-picker-overlay.test.tsx` | 模板选择器投放新模板、既有推荐位未变、点击回调正确 id、单车道未解锁时不投放、空白画布入口仍在 |

两个测试都走**相对路径直取 shared 源码**（barrel `packages/shared/src/index.ts` 目前引用 8 个
不存在的 `data/*` 模块，属既有缺陷，与本次增量无关）。

> **为什么严格连线校验只加在新模板上**：对既有 28 条模板做同样的
> `validateLink(源 kind, 目标 kind)` 审计，会得到 **16 条既有非法口型对**（其中 12 条模板命中），
> 例如 `picture-gen → asset-import`（asset-import 不接任何口，多用于「结果预览」占位）、
> `picture-gen → picture-gen`、`clip-gen → asset-import`。
> 这是**既有缺陷**，且本任务明确要求「既有模板原样保留」，因此本次**不改**它们，
> 只把 `validateLink` + handle 归属校验加在新模板上（新模板已全部通过）。
> 既有这 16 条待你确认后单独开一轮修复。
>
> **【已修复 · 2026-09-15】** 上述既有非法边已在单独一轮中修复完毕：实测为 **12 条边 / 9 条模板**
> （本段旧记的「16 条 / 12 条模板」口径未能复现，见下文文档）。修复方式：5 条末端「结果预览位」
> `X → asset-import` 改为活跃 kind `media-pin`（保留连线与预览语义），7 条被 F-013 合并成同 kind 的
> 链式边删除并逐条留证；全量 `validateLink` 校验现为 0 非法边。
> 详见 `docs/NX9-TEMPLATE-LINK-REPAIR.md`；防回归测试
> `apps/web/src/engine/__tests__/workflow-templates-links.test.ts`。

```bash
cd apps/web
npx vitest run src/engine/__tests__/workflow-templates-new.test.ts
npx vitest run src/engine/__tests__/recipe-picker-overlay.test.tsx
```
