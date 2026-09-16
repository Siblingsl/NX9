# NX9 休眠预设接入（有数据、没入口）

本文件记录一次**纯增量**的功能补齐：把 `packages/shared/src/data/*` 中已定义、
已从 barrel 再导出、但仓库内没有任何消费方的预设数组，接成前端可用入口。

- 全部改动为「新增文件」或「既有文件末尾追加」，未删改任何既有导出与行为。
- 预设数组本身**未被修改**（只做只读引用 / 只读适配）。
- 不新增第三方依赖。
- 注入一律写入**既有提示词字段 / 既有节点数据字段**，不新增持久化字段名。

---

## 1. 复核结论：这些预设真的未被消费吗？

复核方式：用 Node 脚本遍历 `apps/web/src`、`apps/server`、`packages/*`
（跳过 `node_modules` / `dist`）全部 `.ts` / `.tsx`，对每个符号做词边界匹配，
逐条列出命中位置（不使用 grep/Select-String，避免 MSYS 管道假绿/假阴）。
扫描文件数：**1011**。

| 预设 | 复核结论 | 命中位置 |
| --- | --- | --- |
| `CINEMA_PROMPT_PRESETS` | **确认未消费** | 仅 `data/prompt-presets.ts`（定义）+ `index.ts:1160`（barrel 再导出） |
| `LIGHT_RIG_PRESETS` | **确认未消费** | 仅定义 + `index.ts:1185` |
| `buildLightRigPrompt` | **部分消费，但入口缺失**（见下） | `engine/flow-runner-ops/tool-ops.ts:2,200` + 定义 + barrel |
| `BLOCKING_CAMERA_PRESETS` | **确认未消费** | 仅定义 + `index.ts:1190` |
| `BLOCKING_LAYOUTS` | **确认未消费** | 仅定义 + `index.ts:1191` |
| `PORTRAIT_PRESETS` | **确认未消费** | 仅定义 + `index.ts:1182` |
| `buildPortraitPrompt` | **确认未消费** | 仅定义（`portrait-presets.ts:23`）+ barrel |
| `PICTURE_GEN_SIZES` | **确认未消费** | 仅定义（`gen-models.ts:135`）+ `index.ts:1218` |
| `ANIME_TAG_PRESETS` | **确认未消费** | 仅定义 + `index.ts:1157` |
| `FAL_MODELS` | **确认未消费** | 仅定义 + `index.ts:1158` |
| `COMFY_PRESETS` | **确认未消费** | 仅定义 + `index.ts:1159` |

### `buildLightRigPrompt` 的特殊情况（重要）

它不是「完全没用」，而是**「有算的、没得选」**：

```ts
// apps/web/src/engine/flow-runner-ops/tool-ops.ts:198-209
if (kind === 'light-rig') {
  const presetId = (d.lightPresetId as string) ?? 'three-point-soft';
  const content = buildLightRigPrompt(presetId, (d.extra as string) || ...);
  ...
  meta: { lightPresetId: presetId },
}
```

全仓检索 `lightPresetId` 只有 **2 处命中**，都在这个执行器里（读值 + 写 meta）：
**没有任何 UI 能写 `lightPresetId`**。也就是说 `LIGHT_RIG_PRESETS` 的 6 条灯光里，
用户永远只能拿到硬编码兜底的 `three-point-soft`，其余 5 条不可达。

因此本次**不修改** `tool-ops.ts`，只补上缺失的**选择入口**
（复用 `buildLightRigPrompt`，见 §2）。

### 未接入项及原因

| 符号 | 原因 |
| --- | --- |
| `FAL_MODELS` | 与既有 `PICTURE_GEN_MODELS` / `resolvePictureModelForRequest` 的模型解析链职责重叠；插入第二条模型来源会造成「两套模型真源」，收益为负，**未接入**。 |
| `COMFY_PRESETS` | 字段为 `hint` / `workflowHint`，是**操作指引文案**而非可注入的提示词片段；其真实消费点是 ComfyUI workflow JSON 粘贴框（`workflowHint` 只是提示语）。在没有 Comfy 节点 UI 的情况下接入等于放一句说明文字，**未接入**。 |
| `CAMERA_PROMPT_PRESETS` | 已有 `CAMERA_MOVE_LIBRARY`（50+ 条）与 `CameraMovePicker` 覆盖，且 `camera-move-library.ts` 已提供 `LEGACY_CAMERA_PRESET_TO_MOVE` 升级映射。**不重复接入**。 |

---

## 2. 接入清单（原缺口 → 接在哪里 → 注入形态）

### 2.1 生成工作区的前缀预设

**新增** `packages/shared/src/utils/preset-entrypoints.ts`（注入核心，纯函数）
**新增** `apps/web/.../generation/PresetSectionPicker.tsx`（通用选择器 UI）

| section | 词表 | 前缀（成行标识） | 片段构造函数 | 接入位置 |
| --- | --- | --- | --- | --- |
| `cinema` | `CINEMA_PROMPT_PRESETS` | `cinematic style:` | `buildCinemaPresetPrompt` | 图片工作台 / 视频工作台 |
| `lighting` | `LIGHT_RIG_PRESETS` | `lighting:` | `buildLightRigMultiPrompt`（**复用 `buildLightRigPrompt`**） | 图片工作台 / 视频工作台 |
| `portrait` | `PORTRAIT_PRESETS` | `portrait:` | `buildPortraitPresetPrompt`（**复用 `buildPortraitPrompt`**） | 图片工作台 / 视频工作台 |
| `anime` | `ANIME_TAG_PRESETS` | `anime style:` | `buildAnimeTagPrompt` | **仅图片工作台**（见 §5） |

注入形态示例（写回既有提示词字段）：

```
一位剑客站在雨夜的巷口
camera movement: slow dolly in (total 6s, beat-aligned)
cinematic style: film noir contrast, hard shadows, venetian blind light patterns, moody low-key lighting
lighting: Rembrandt lighting, dramatic triangle highlight on cheek, moody shadows, classical portrait
portrait: long hair, flowing, soft eyes, gentle gaze
```

落库路径：与 `CameraMovePicker` 完全一致 ——
`onApply` → `useLocalNodePrompt.applyText` → 写回既有提示词字段
（字段名由 `resolveNodePromptField(data)` 解析，不新增字段）。

**注入契约**（`apps/web/src/engine/__tests__/preset-entrypoints.test.ts` 逐条断言）：

1. **幂等**：同 section 反复套用只保留一行（按前缀识别并替换）。一次/两次/三次结果完全相同。
2. **可清除**：`ids = []` 时移除该 section 行，正文与其它 section 原样保留；反复「注入→清除」不留累积空行。
3. **空选择不变更**：`ids = []` 且原文无该 section 行时**逐字节原样返回**（不做空行归一化）。
4. **组合顺序稳定**：section 一律按 `PRESET_SECTION_KEYS = ['cinema','lighting','portrait','anime']`
   规范顺序落行，与套用先后无关；同一 section 内片段按**词表顺序**输出，与选中先后无关（乱序 + 重复 + 空值全部归一）。
5. **互不覆盖**：只识别并重写本模块拥有的 4 个前缀。`camera movement:` / `运镜：`
   （大师运镜、运镜时间轴、节拍对齐）等外部注入行作为正文原样保留，双向都不覆盖。
6. **未知 id 不静默兜底**：未知 id 被忽略；灯光的未知 id **不会**回退成首条预设
   （`buildLightRigPrompt` 内部对未知 id 会回退到 `LIGHT_RIG_PRESETS[0]`，
   因此 `buildLightRigMultiPrompt` 先按词表校验 id 再调用，避免「选错了却看似成功」）。

### 2.2 出图尺寸预设

**新增** `apps/web/.../generation/picture/PictureSizePresetChip.tsx`
（接入图片工作台底栏，紧邻既有的宽高比 chip）

`PICTURE_GEN_SIZES` 的 id 本身就是 `宽x高`，因此直接映射到**既有三字段**：

```ts
{ aspectRatio: 'custom', width: 1024, height: 1792 }
```

这与既有尺寸控件**同源同字段**：`PictureParamChips` 的宽高比 chip 写 `aspectRatio`，
高级面板的自定义 W/H 输入写 `width` / `height`，唯一消费方
`resolveImageRequestSize({ aspectRatio, width, height, ... })`（`packages/shared/src/utils/image-gen-params.ts`）
行为不变。chip 上显示的「当前尺寸」是由既有字段**反查**得出（`matchPictureGenSize`），
不是独立状态 —— 用户改宽高比或手改 W/H 后显示会自动跟随。

### 2.3 走位 / 机位预设（3D 导演台）

**新增** `packages/shared/src/utils/blocking-layout.ts`（纯几何解算，可测）
**新增** `packages/director3d/src/ui/BlockingPresetPanel.tsx`（舞台 UI）
**追加** `packages/director3d/src/ui/StageDeckShell.tsx:482` 之后渲染该面板

- `BLOCKING_CAMERA_PRESETS` → 面板「场面调度机位」一组按钮
  （全景主镜 / 中景 / 过肩左 / 过肩右 / 低角度，fov 42–55）。
- `BLOCKING_LAYOUTS` → 面板「走位布局」一组按钮
  （一字排开 / 对话对峙 / 三角站位），按当前**可见且未锁定**的演员人数解算站位。

#### 与既有 `CameraPresetBar` 的差异与取舍（关键决策）

**不做第二套机位来源。** 取舍如下：

| | `CameraPresetBar`（既有，未改动） | `BlockingPresetPanel`（新增） |
| --- | --- | --- |
| 词表口径 | 通用机位角度：正面 / 过肩 / 低机位 / 荷兰角 / 侧拍 / 全景 / 特写 / 正俯 | 场面调度取景：全景主镜 / 中景 / 过肩左 / 过肩右 / 低角度 |
| 用途 | 快速换视角构图 | 与走位布局**配套**：先排站位、再取景 |
| 写入对象 | `project.cameras[activeCameraId]` | **同一个** `project.cameras[activeCameraId]` |
| 调用动作 | `updateCamera(id, patch)` | **同一个** `updateCamera(id, patch)` |
| 持久化字段 | `name` / `fov` / `target` / `transform.position` | **同字段**，无新增 |

即：**一个持久化真源、一个 store 动作**，只是多了一组带明确口径标注的按钮。
面板不复制任何机位状态；`CameraPresetBar` 一行未改。

走位解算只写 `position` / `rotation`（不动 `scale`、不动其它字段），
且**跳过 `locked` 的演员**，跳过数量在面板上如实显示，不做「静默成功」；
场景无可见演员时给出明确提示而不是无反应。

几何约定：演员站在地面（`y = 0`），`rotation[1]` 为 yaw，`yaw = 0` 面向 `+Z`。
- `line`：沿 X 轴等间距居中，全部面向 `+Z`；
- `dialogue`：左右两列（x = ∓1.4），左列朝 `+X`、右列朝 `-X`，沿 Z 轴展开；
- `triangle`：正前 / 左后 / 右后三个锚点，半径 1.8，每人 yaw 指向原点；超过 3 人按环外扩。

`count <= 0` 返回空数组（合法输入）；传入非法布局 id **抛错**，不返回空数组假装成功。

### 2.4 动漫标签预设

`ANIME_TAG_PRESETS` 接入为可选标签，注入既有提示词字段（同 §2.1）。

---

## 3. 新增 / 改动文件清单

### 新增

| 文件 | 作用 |
| --- | --- |
| `packages/shared/src/utils/preset-entrypoints.ts` | 4 个前缀 section 的幂等注入核心 + 出图尺寸映射 |
| `packages/shared/src/utils/blocking-layout.ts` | 场面调度机位词表访问 + 走位布局几何解算 |
| `apps/web/.../generation/PresetSectionPicker.tsx` | 通用分组/搜索/多选/预览/清除选择器 |
| `apps/web/.../generation/picture/PictureSizePresetChip.tsx` | 出图尺寸预设 chip |
| `packages/director3d/src/ui/BlockingPresetPanel.tsx` | 3D 导演台「场面调度机位 + 走位布局」面板 |
| `apps/web/src/engine/__tests__/preset-entrypoints.test.ts` | 57 条回归断言 |
| `docs/NX9-DORMANT-PRESET-ENTRYPOINTS.md` | 本文件 |

### 追加（既有文件仅追加，未删改既有内容）

| 文件 | 追加内容 |
| --- | --- |
| `packages/shared/src/index.ts` | 末尾追加 2 段 `export { ... } from './utils/preset-entrypoints' / './utils/blocking-layout'` |
| `apps/web/.../generation/picture/PictureWorkspace.tsx` | 2 行 import + 底栏 4 个选择器（电影感/灯光/人像/动漫标签）+ 尺寸 chip |
| `apps/web/.../generation/video/VideoWorkspace.tsx` | 1 行 import + 底栏 3 个选择器（电影感/灯光/人像） |
| `packages/director3d/src/ui/StageDeckShell.tsx` | 1 行 import + `<BlockingPresetPanel />` |
| `packages/director3d/src/index.ts` | 末尾追加 `export { BlockingPresetPanel }` |
| `packages/director3d/src/styles/stage-deck.css` | 末尾追加 `.nx9-stage-blocking-note` 一条规则 |

**未触碰**：`emotion-presets`、`shot-move-families`、`creative-asset-presets`、
`character-face-rig-presets`、`playbook-definitions`、`camera-presets`
（这 6 个路径在仓库中**不存在**）、`shot-library-seeds`、`shot-lexicon-taxonomy`、
`provider-registry`；`index.ts` 中指向它们的既有 import 一行未改。
`CameraPresetBar.tsx`、`CameraMovePicker.tsx`、`tool-ops.ts`、`PictureParamChips.tsx`、
`PromptBatchPanel.tsx` 一行未改。

---

## 4. 验证记录（真实命令 + exit code）

### 4.1 新增单测

```
pnpm --filter @nx9/web exec vitest run src/engine/__tests__/preset-entrypoints.test.ts --reporter=dot
```

结果：**exit 0**，`Test Files 1 passed (1)` / `Tests 57 passed (57)`。

**反向对照**（证明测试可失败、不是假绿）：临时加入一条故意错误的断言
（`expect(withCinemaPrompt('base', [id])).toBe('base')`），
运行结果 `Tests 1 failed (1)`，**exit 1**，随后删除该临时文件。

### 4.2 新增 shared 工具的隔离类型检查

barrel 不可用，故只对新增的两个纯逻辑文件做隔离 `tsc`：

```
pnpm --filter @nx9/web exec tsc --noEmit --strict --skipLibCheck \
  --target es2022 --module esnext --moduleResolution bundler \
  ../../packages/shared/src/utils/preset-entrypoints.ts \
  ../../packages/shared/src/utils/blocking-layout.ts
```

结果：**exit 0**（无输出）。

### 4.3 新增/改动文件语法解析

用 esbuild（自 `node_modules/.pnpm/esbuild@0.25.12` 解析）对 11 个新增/改动文件
做 `loader: tsx` 变换：

结果：**exit 0**，`parsed 11 files, failures = 0`。

### 4.4 整体回归（含基线对照）

```
pnpm --filter @nx9/web exec vitest run --reporter=dot
```

| | Test Files | Tests |
| --- | --- | --- |
| **改动前**（仅移除我在 `index.ts` 末尾追加的两段 export） | `84 failed \| 71 passed (155)` | `2 failed \| 853 passed \| 1 skipped (856)` |
| **改动后** | `84 failed \| 71 passed (155)` | `2 failed \| 853 passed \| 1 skipped (856)` |

两次运行的**错误签名完全一致**，均只有一种根因：

```
Error: Failed to resolve import "./data/emotion-presets" from "../../packages/shared/src/index.ts"
Error: Cannot find module './data/emotion-presets' imported from .../packages/shared/src/index.ts
```

→ **本次改动零回归**：84 个失败文件与 2 个失败测试全部是既有缺陷所致。

### 4.5 既有缺陷的独立证据（与本次改动无关）
用 esbuild 打包 `packages/shared/src/index.ts` 作为独立探针：

```
BARREL BUNDLE: FAILED
  packages/shared/src/index.ts:587:7  ERROR: Could not resolve "./data/emotion-presets"
  packages/shared/src/index.ts:622:7  ERROR: Could not resolve "./data/shot-move-families"
  packages/shared/src/index.ts:640:7  ERROR: Could not resolve "./data/creative-asset-presets"
  packages/shared/src/index.ts:655:7  ERROR: Could not resolve "./data/character-face-rig-presets"
  packages/shared/src/index.ts:884:7  ERROR: Could not resolve "./data/playbook-definitions"
  ...（共 12 个错误）
```

这 8 个模块（`emotion-presets`、`shot-move-families`、`creative-asset-presets`、
`character-face-rig-presets`、`playbook-definitions`、`camera-presets`、
`shot-lexicon-taxonomy`、`provider-registry`）在整个仓库中**不存在于任何路径**
（全盘遍历确认，`shot-library-seeds` 是唯一存在的那个）。
`apps/web/vite.config.ts` 把 `@nx9/shared` 无条件 alias 到该源码 barrel，
`vitest.config.ts` 同样 —— 因此**任何 import `@nx9/shared` 的模块/测试都无法解析**。
本次任务明确禁止创建/修改这 9 个路径，故**不修**，仅如实记录。

### 4.6 「既有行保留」的逐行证据

`git diff --numstat` 的合计值**包含本会话开始前就存在的未提交改动**，
不能直接当作本次改动的行数。为区分归属，对本次改动的 6 个既有文件做了逐行核对：

```
git diff -U0 -- packages/shared/src/index.ts packages/director3d/src/index.ts \
  packages/director3d/src/ui/StageDeckShell.tsx packages/director3d/src/styles/stage-deck.css \
  apps/web/.../picture/PictureWorkspace.tsx apps/web/.../video/VideoWorkspace.tsx
```

- 按本次标记（`PresetSectionPicker` / `PictureSizePresetChip` / `BlockingPresetPanel` /
  `preset-entrypoints` / `blocking-layout` / `nx9-stage-blocking-note` / 新增中文注释）
  筛出的**本次新增行 = 23 行**：图片工作台 10、视频工作台 5、StageDeckShell 3、
  director3d `index.ts` 1、CSS 3、shared `index.ts` 2。
- 这 6 个文件 diff 里出现的 **29 行删除全部属于本会话之前的既有改动**
  （`emitState` 重构、`buildCameraPrompt` 引入移除、`useUpstreamMedia` 解构改写、
  视频模型选项改写、CSS 尾括号重排等），**没有一行由本次改动删除**。
- 原文锚点逐一复核，结果全部 PRESENT：
  `import { CameraMovePicker } from '../CameraMovePicker';`、
  `handoffSourceLabel="图片工作台"` / `"视频工作台"`、
  `<PictureParamChips blockId={blockId} onPatch={handlePatch} />`、
  `<VideoParamChips blockId={blockId} onPatch={handlePatch} />`、
  `<CameraPresetBar />`、`export function StageDeckShell`、
  `} from './utils/consistency-report';`、`/** @deprecated use DirectorProject */`。
- CSS 花括号平衡：`128 open / 128 close`（balanced），新规则已包含在内。

---

## 5. 偏差与未完成项（逐条）

1. **动漫标签只接了一处**。`ANIME_TAG_PRESETS` 接入**图片工作台**，未接入视频工作台，
   也未接入 `PromptBatchPanel`。理由：`PromptBatchPanel` 是 `PromptWorkspace` 的
   批处理/全局前缀编排器，与具体生成模态无关，把「动漫风格标签」塞进去属越权；
   `PictureParamChips` 管的是节点参数（quality/aspect/strength），不是提示词文本。
   按「选一处接入」的要求，选择模态最贴合的图片工作台。
2. **`FAL_MODELS` / `COMFY_PRESETS` 未接入**，理由见 §1「未接入项及原因」。
3. **UI 新增部分没有通过的自动化测试覆盖**。所有会渲染 `PictureWorkspace` /
   `StageDeckShell` 的测试文件都在那 84 个因 barrel 缺陷而失败的文件里
   （如 `stage-composer-camera.test.ts`、`director3d-node.test.ts`、`vg-r2-p2/p3.test.ts`）。
   新增 UI 只做了 esbuild 语法解析验证（§4.3），**未做浏览器/GUI 实测**，
   不声称 UI 端到端可用。
4. **未声称构建通过**。`pnpm build` / `pnpm typecheck` 未运行也不通过 ——
   根因是同一个 barrel 缺陷（`pnpm build` 第一步就是 `--filter @nx9/shared build`）。
5. **`PresetSectionPicker` 的选中态由提示词文本反推**（与 `CameraMovePicker`
   另存 session 选中态的做法不同，这是有意改进：用户手动删掉注入行后勾选会自动消失，
   「界面有勾、词里没有」在结构上不可能出现）。前提是同一 section 内不存在
   「一条片段是另一条的连续子串」—— 该不变量已由测试断言保护
   （当前 4 个 section 共 36 条片段，冲突数为 0）。若**将来**词表新增片段违反此前提，
   测试会失败并提示。
6. **`preset-entrypoints.ts` 与 `blocking-layout.ts` 未加入 barrel 之外的其他索引**，
   也未改动任何 `package.json` `exports`；仅通过 `packages/shared/src/index.ts` 末尾
   追加的 export 暴露（该 barrel 修好后即可用）。

---

## 6. 整体回归命令

```bash
# 新增单测（不依赖 barrel，可独立运行）
pnpm --filter @nx9/web exec vitest run src/engine/__tests__/preset-entrypoints.test.ts --reporter=dot   # exit 0

# 全量回归（当前受既有 barrel 缺陷影响，失败签名与改动前完全一致）
pnpm --filter @nx9/web exec vitest run --reporter=dot                                                    # exit 1（既有缺陷）
```
