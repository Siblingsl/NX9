# NX9 大师运镜库（camera-move-library）

> 画布工作台可直选的结构化运镜词库 + 选择器：按家族分组、可搜索、可多选叠加，
> 选中即把运镜片段注入**既有**图片 / 视频提示词字段。
> 本文只描述 NX9 自身能力与实现边界。

## 1. 能力范围

1. **结构化词库**：`packages/shared/src/data/camera-move-library.ts`，**56 条**经典影视运镜，覆盖
   固定 / 推镜 / 拉镜 / 摇镜 / 俯仰 / 移镜 / 升降 / 环绕 / 变焦 / 手持 / 航拍 / 特殊 共 **12 个家族**：

   | 家族 | 条数 | 代表条目 |
   | --- | ---: | --- |
   | 固定 static | 3 | 固定锁机、静态群像、前景框定 |
   | 推镜 push | 5 | 缓推、快推、推穿空间、推至特写、擦过前景推进 |
   | 拉镜 pull | 4 | 缓拉、拉出揭示、拉远孤立、后退穿越 |
   | 摇镜 pan | 4 | 慢摇、快摇、跟摇、摇镜揭示 |
   | 俯仰 tilt | 3 | 上摇、下摇、竖摇揭示 |
   | 移镜 track | 5 | 左/右横移、跟拍主体、侧面平行跟移、边走边谈跟移 |
   | 升降 crane | 4 | 升镜、降镜、升降揭示、摇臂弧线 |
   | 环绕 orbit | 5 | 1/4 环绕、半环绕、全环绕、弧线推进、螺旋上升环绕 |
   | 变焦 zoom | 5 | 变焦推近、变焦拉远、急推变焦、猛推变焦、滑动变焦（希区柯克变焦） |
   | 手持 handheld | 4 | 手持跟拍、肩扛纪实、紧张手持、手持推近 |
   | 航拍 aerial | 6 | 航拍拉远、航拍前飞、航拍环绕、俯冲下降、升起揭示、FPV 穿越 |
   | 特殊 special | 8 | 甩镜、上下甩摇、跟焦转移、视差滑动、滚转倾斜、人体固定机位、时间切片、撞击震机 |

   每条含：中/英文名、中文说明、**中英双语可直接拼进提示词的片段**、家族、建议景别、
   时长提示区间、难度与标签。

2. **检索与拼装 API**（`lookupCameraMove` / `cameraMovesByFamily` / `searchCameraMoves` /
   `buildCameraMovePrompt`），以及**幂等注入**helper `withCameraMovePrompt`。
3. **选择器 UI**：`CameraMovePicker`（家族分组 + 搜索 + 多选 + 中/英切换 + 注入预览 + 清除）。
4. **接入点**：视频工作台、图片工作台、分镜编辑弹窗（见 §3）。
5. **兼容适配器**：把运镜映射成既有 `PromptPreset` 形状，并把既有 `CAMERA_PROMPT_PRESETS`
   的 8 个 id、3D 导演台 `CameraMoveId` 的 15 个枚举映射到本词库，**不替换**任何既有数组/枚举。

## 2. 数据结构

```ts
export type CameraMoveFamily =
  | 'static' | 'push' | 'pull' | 'pan' | 'tilt' | 'track'
  | 'crane' | 'orbit' | 'zoom' | 'handheld' | 'aerial' | 'special';

export interface CameraMoveDef {
  id: string;                 // kebab-case，唯一，多选去重键
  labelZh: string;            // 中文名（用于分组列表与选中徽标）
  labelEn: string;            // 英文名
  descZh: string;             // 中文说明：做什么、常见用途
  promptZh: string;           // 中文提示词片段
  promptEn: string;           // 英文提示词片段（默认注入语言）
  family: CameraMoveFamily;
  shotSizes?: string[];       // 建议景别，沿用 NX9 词表 ECU/CU/MS/FS/WS/OTS
  durationHintSec?: [number, number];  // 成片时长经验区间（提示，非硬参数）
  difficulty?: 'basic' | 'advanced' | 'pro';
  tags?: string[];
}
```

### 拼装与注入语义

| 函数 | 行为 |
| --- | --- |
| `buildCameraMovePrompt(ids, opts)` | 按**传入顺序**拼接、**去重（保留首次出现位置）**、跳过未知 id；空输入返回 `''`。`lang: 'en' \| 'zh' \| 'both'`（默认 `en`），`separator` 可覆盖（默认英文 `, `、中文 `、`、双语 ` / `），`onUnknown: 'throw'` 可改为抛错。 |
| `withCameraMovePrompt(existing, ids, opts)` | 把片段追加为独立一行（英文前缀 `camera movement: `、中文前缀 `运镜：`）；**已存在运镜行时按前缀识别并替换**，因此反复点击不会堆叠；`ids` 为空时移除运镜行、其余内容原样保留。纯字符串操作，不修改入参。 |

### 兼容适配器（不替换既有数组）

| 导出 | 用途 |
| --- | --- |
| `cameraMoveToPromptPreset(def)` / `cameraMovePromptPresets(defs?)` | 映射到既有 `PromptPreset` 形状（`id/label/text/group`，`text` 取英文片段、`group` 取家族中文名），供既有消费方按需复用。 |
| `LEGACY_CAMERA_PRESET_TO_MOVE` / `cameraMoveFromLegacyPresetId(id)` | 既有 8 条 `CAMERA_PROMPT_PRESETS` → 本词库条目（如 `cam-dolly-in → push-slow`）。 |
| `DIRECTOR_CAMERA_MOVE_TO_MOVE` / `cameraMoveFromDirectorMoveId(id)` | 3D 导演台 15 个 `CameraMoveId` → 本词库条目（如 `orbit → orbit-180`、`pedestal-up → crane-up`）。属**最近等价映射**，不改变导演台既有 `MOVE_PHRASE` 行为。 |

## 3. UI 入口

| 入口 | 位置 | 行为 |
| --- | --- | --- |
| 视频工作台 | `attached-workspace/generation/video/VideoWorkspace.tsx`（工具栏 chips 行，`VideoParamChips` 右侧） | 多选运镜 → `withCameraMovePrompt(draft, ids)` → `applyText` 写回该节点**既有提示词字段**（`resolveNodePromptField`，通常是 `prompt`/`content`）。 |
| 图片工作台 | `.../generation/picture/PictureWorkspace.tsx`（工具栏，`PictureParamChips` 右侧） | 同上，写回图片节点既有提示词字段。 |
| 分镜编辑 | `blocks/craft/storyboard-desk/shot-edit-modal.tsx`（景别/运镜所在栅格下方新增一行） | 只读浏览 + 插入：写回 `editDraft.videoPrompt`，随 `onSave` 走既有分镜写回路径；不改既有表单字段与校验。 |

选择器组件本体：`.../generation/CameraMovePicker.tsx`（`variant: 'toolbar' | 'header' | 'inline'`）。

**落库约定**：不新增任何持久化字段名。选中态是会话内 UI 状态（切换节点即重置）；
真正落库的是注入后的**提示词文本本身**，因此下游提示词组装链路（`clip-gen-request` /
`core-pipeline-runner` / `picture-gen-executor`）**无需改动**即可消费。

## 4. 与既有运镜能力的关系

| 既有 | 关系 | 是否改动 |
| --- | --- | --- |
| `CAMERA_PROMPT_PRESETS`（8 条，`data/prompt-presets.ts`） | 保留原样。本库提供更完整词表 + `PromptPreset` 适配器 + id 升级映射。 | 未改动（仅经 `index.ts` 追加导出本库） |
| `CINEMA_PROMPT_PRESETS`（8 条） | 题材是光线/调色/节奏，与运镜不重叠。 | 未改动 |
| 3D 导演台 `CameraMoveId` / `MOVE_PHRASE`（15 个枚举，`director3d/src/schema/cameraGeometry.ts`） | 保留原样。本库提供 `CameraMoveId → 词库条目` 映射供需要完整运镜短语时升级复用。 | 未改动 |
| 分镜字段 `director3dGuide.cameraPrompt`（既有运镜提示词落库字段，被 `core-pipeline-runner` / `picture-gen-executor` / `director-desk-runner` 读取） | 本库不写入该字段（它由 3D 导演台提交链路产生）；分镜侧走 `videoPrompt` 注入，二者在同一提示词里自然共存。 | 未改动 |
| `SHOT_LIBRARY_SEEDS`（117 条「镜头库」种子，`data/shot-library-seeds.ts`，含 `cameraMove` / `promptZh` / `promptEn`）与 `docs/fcml-yunjing-prompts.*`（117 种运镜归档） | **存在主题重叠**：它们以「镜头条目/词典绑定」形态存在（`shot-edit-modal` 的「镜头库绑定」即消费 `SHOT_LIBRARY_SEEDS`）。本库是**运行时可多选叠加的运镜片段词库**，分类体系（12 家族）与条目**均为独立编写**，**未与上述 117 条逐条对齐或去重**。是否合并为单一事实源需产品决策（见 §6）。 | 未改动 |

## 5. 已实现 / 未实现

**已实现**

- 56 条运镜的结构化定义 + 家族检索 + 关键字检索 + 多选拼装 + 幂等注入；
- 选择器 UI（家族分组 / 搜索 / 多选 / 中英切换 / 注入预览 / 清除）；
- 视频工作台、图片工作台、分镜编辑三处入口；
- 兼容适配器（`PromptPreset` 形状、既有 8 条预设 id、导演台 15 个 `CameraMoveId`）；
- 单测 `apps/web/src/engine/__tests__/camera-move-library.test.ts`（26 例）。

**未实现（明确边界）**

- **不驱动 3D 导演台的机位**：选择器只影响提示词文本，不写入 `director3dGuide`、不改变 `CameraShot` 动画轨道；
- **不做逐镜批量运镜**：视频批量出片按镜头走既有路径，未提供「按镜选择运镜」的批量面板；
- **不做时间轴分镜编排**：未把运镜与 `durationHintSec` 写成时间轴/关键帧；
- **不做运镜与模型的参数映射**：不同厂商模型对运镜的响应差异不做适配表；
- **选择态不落库**：见 §3 落库约定（UI 状态，非持久字段）；
- **未与 `SHOT_LIBRARY_SEEDS` / `docs/fcml-yunjing-prompts.*` 合并去重**：见 §4、§6；
- `durationHintSec` / `shotSizes` 仅为**经验提示**，不是对具体模型的实测结论。

## 6. 待决事项（需产品/需求确认，本次未实现）

1. **单一事实源**：运镜词库是否需要与 `SHOT_LIBRARY_SEEDS`（117 条镜头库种子，含运镜字段）合并，
   或明确分工（种子＝镜头词典条目；本库＝可叠加运镜片段）？
2. **是否把选择态落库**（如节点 `cameraMoveIds` 或分镜 `director3dGuide` 扩展），
   以支持「重开工作台恢复选中」「按镜批量指定运镜」——当前按需求约定不新增持久化字段名。
3. **是否延伸到 3D 导演台**：把选定运镜映射为导演台机位预设/动画轨道。

## 7. 验证方式（隔离验证说明）

> `packages/shared/src/index.ts` 目前引用 8 个不存在的 `data/*` 模块（`emotion-presets`、
> `shot-move-families`、`creative-asset-presets`、`character-face-rig-presets`、
> `playbook-definitions`、`camera-presets`、`shot-lexicon-taxonomy`、`provider-registry`），
> 属**既有缺陷**：`pnpm --filter @nx9/shared build`、`pnpm --filter @nx9/web typecheck`
> 以及一切走 barrel 的测试当前都无法通过。本功能与之解耦验证：

| 验证 | 命令 | 结果 |
| --- | --- | --- |
| 词库类型检查（隔离 tsconfig，仅含 `prompt-presets.ts` + 新文件） | `packages/shared && tsc -p tsconfig.camera-move-check.json` | exit 0 |
| 选择器组件类型检查（隔离 tsconfig，`@nx9/shared` 经 paths 只指向新文件） | `apps/web && tsc -p tsconfig.camera-move-check.json` | exit 0 |
| 单测（相对路径直取源码，不走 barrel） | `apps/web && npx vitest run src/engine/__tests__/camera-move-library.test.ts` | 26 passed，exit 0 |
| TSX/TSX 语法解析 | esbuild `--loader:.tsx=tsx` 解析 4 个改动/新增前端文件 | exit 0 |

**未验证项**：`pnpm --filter @nx9/shared build`、`pnpm --filter @nx9/web typecheck`、
浏览器中的实际点击链路（受上述既有缺陷阻断，未跑通）。
