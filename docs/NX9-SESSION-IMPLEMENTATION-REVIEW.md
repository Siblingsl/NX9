# NX9 本会话实现评审（对抗式）

- 评审对象：本次会话在工作树内新增 / 改动的实现（`git status` 可见的改名与新增文件）
- 评审方式：**先执行、再下结论**。所有「已复现」条目都给出了实际命令与真实输出；无法执行验证的一律标注「仅推断」
- 基线：`apps/web` 全量 vitest **84 failed / 75 passed（159 文件）**、**2 failed / 930 passed / 1 skipped（933 用例）**，全部失败都源自既有 barrel 缺陷（见 D-01）
- 结论概要：**未发现本会话引入的 error 级新缺陷**；发现 3 条 warn、5 条 info 级问题（其中 2 条已按低风险边界补丁修复、3 条仅改注释 / 文档），另有 1 条既有的 error 级缺陷（barrel）因硬边界不修

---

## 1. 评审范围与风险排序

| 优先级 | 风险面 | 主要文件 |
| --- | --- | --- |
| 高 | 持久化 schema 兼容与往返 | `packages/director3d/src/schema/directorProject.ts`（`Director3dCameraKey` / `cameraKeys?` / `activeCameraKeyId?` / `normalizeShotState` / `shotStateFromProject` / `projectFromShotState` / `restoreCommittedSnapshot` / `applySceneTemplateToShotState` / `normalizeDirectorProject`） |
| 高 | 有界并发 | `apps/web/src/engine/run-with-concurrency.ts`、`apps/web/src/engine/flow-runner-ops/cell-gen-batch.ts` |
| 高 | 公共接口追加与 kind 自洽 | `packages/shared/src/index.ts`、`packages/director3d/src/index.ts`、`packages/shared/src/catalog/*`、`apps/web/src/engine/flow-runner.ts` |
| 高 | 提示词注入幂等 / 共存 | `packages/shared/src/utils/preset-entrypoints.ts`、`utils/camera-move-timeline.ts`、`data/camera-move-library.ts`、`apps/web/src/engine/shot-blocking-hint.ts` |
| 中 | 新节点接线 | `multi-grid` / `character-sheet-desk` 的执行器、闭环纯函数层、工作区、模板与命令面板 |

---

## 2. 实际执行的检查（命令 + 输出摘要）

### 2.1 全量测试基线（改前）

```bash
cd apps/web && npx vitest run --reporter=dot          # 134.25s
```

```
Test Files  84 failed | 75 passed (159)
     Tests  2 failed | 930 passed | 1 skipped (933)
```

失败签名（`--reporter=json` 解析，脚本 `nx9-extract-signature.mjs`）：

```
failing file count: 84
distinct failure signatures:
  x81 Failed to resolve import "./data/emotion-presets" from "../../packages/shared/src/index.ts". Does the file exist?
  x2  (空签名 = 该文件里 2 个用例断言失败，同样是上面的解析错误)
  x1  Cannot find module './data/emotion-presets' imported from .../packages/shared/src/index.ts
individual failing tests:
 - src/blocks/core/__tests__/DirectorDeskBlock.test.tsx :: DirectorDeskBlock renders without crashing
 - src/blocks/nx9/__tests__/ScriptDeskBlock.test.tsx :: ScriptDeskBlock renders without crashing
```

### 2.2 barrel 可加载性（运行期探针，非静态推断）

```bash
cd apps/web && npx vite-node /tmp/nx9-review/barrel-probe.mts
```

```
BARREL_FAIL Cannot find module './data/emotion-presets' imported from 'C:/Admin/code/shilei/NX9/packages/shared/src/index.ts'
```

### 2.3 barrel 引用完整性（node 逐条核对文件是否存在）

```bash
node -e "... 对 packages/shared/src/index.ts 的 from './data/*' 逐个 existsSync ..."
```

```
MISS packages/shared/src/data/camera-presets.ts
MISS packages/shared/src/data/character-face-rig-presets.ts
MISS packages/shared/src/data/creative-asset-presets.ts
MISS packages/shared/src/data/emotion-presets.ts
MISS packages/shared/src/data/playbook-definitions.ts
MISS packages/shared/src/data/provider-registry.ts
MISS packages/shared/src/data/shot-lexicon-taxonomy.ts
MISS packages/shared/src/data/shot-move-families.ts
```

同一检查对 `git show HEAD:packages/shared/src/index.ts` 结果**完全一致** → 该缺陷在本次会话之前就存在。

### 2.4 类型检查

```bash
npx tsc -p packages/shared/tsconfig.esm.json --noEmit
# → 8 条 TS2307（index.ts:587/622/640/655/884/1036/1154/1378）+ 级联隐式 any

cd apps/web && npx tsc -p tsconfig.json --noEmit    # exit=2
# total tsc errors: 223
# by code: {"TS2307":2,"TS7006":134,"TS2305":50,"TS2739":2,"TS2724":24,"TS2552":2,"TS7031":2,"TS2345":1,"TS2339":6}
# 本次改动文件（directorProject / multi-grid-closure / cell-gen-batch / run-with-concurrency / shot-blocking-hint）错误数: 0
```

分特性类型检查配置（仓库既有，本次亦覆盖新能力）：

```bash
for f in apps/web/tsconfig.{camera-move,cammove-motion,character-sheet,director3d-multicam,movetl,multi-grid,multi-grid-shots,beat-grid,template-links}-check.json; do npx tsc -p "$f"; done
```

```
apps/web/tsconfig.camera-move-check.json          :: exit=0 errors=0
apps/web/tsconfig.multi-grid-check.json           :: exit=0 errors=0
apps/web/tsconfig.multi-grid-shots-check.json     :: exit=0 errors=0
packages/shared/tsconfig.camera-move-check.json   :: exit=0 errors=0
packages/shared/tsconfig.catalog-check.json       :: exit=0 errors=0
packages/shared/tsconfig.character-sheet-check.json :: exit=0 errors=0
packages/shared/tsconfig.multi-grid-check.json    :: exit=0 errors=0
packages/shared/tsconfig.multi-grid-shots-check.json :: exit=0 errors=0
apps/web/tsconfig.beat-grid-check.json            :: exit=2 errors=53   ← 既有（隐式 any 级联 + 无关既有文件）
apps/web/tsconfig.cammove-motion-check.json       :: exit=2 errors=46   ← 既有
apps/web/tsconfig.character-sheet-check.json      :: exit=2 errors=58   ← 既有
apps/web/tsconfig.director3d-multicam-check.json  :: exit=2 errors=44   ← 既有
apps/web/tsconfig.movetl-check.json               :: exit=2 errors=53   ← 既有
apps/web/tsconfig.template-links-check.json       :: exit=2 errors=1    ← 既有（shared barrel 缺 playbook-definitions）
```

（这些 `*-check.json` 的失败集合与本次改动无关：报错文件均为 `sculpt/*`、`workspace-document.ts`、`clip-editor/*` 等既有文件；没有任何一条落在本会话新增/改动文件上。）

### 2.5 导出名冲突（barrel 级，node 解析）

```bash
node -e "... 解析两处 barrel 的 export 块，统计重名与「同名值+类型」..."
```

```
#### packages/shared/src/index.ts  names=1471
  duplicate names: none
  value+type both: none
#### packages/director3d/src/index.ts  names=239
  duplicate names: none
  value+type both: none
```

新增导出名近似冲突扫描（编辑距离 ≤ 2）：仅命中 `*_MAX/_MIN`、`*_EN/_ZH`、`X/isX`、`Type/parseType` 等**刻意成对**命名，唯一大小写敏感项为 `BlockingCameraPatch`（类型）/ `blockingCameraPatch`（函数）——TS 中类型与值不同命名空间，不冲突（仅风格提示）。

### 2.6 kind 自洽（运行期直测 catalog）

`catalog/block-catalog.ts`、`socket-registry.ts`、`node-interaction.ts`、`attached-workspace.ts` 均无 barrel 运行时依赖，故可直测：

```
multi-grid           catalog={"label":"多格推演","glyph":"Grid3x3","category":"generate","native":true}
                     socket={"accepts":["picture","prompt"],"emits":["picture","prompt"]}
                     workspace.kind=multi-grid  interactionClass=logic  opensPromptBar=true
character-sheet-desk catalog={"label":"角色设定表","glyph":"UserSquare","category":"generate","native":true}
                     socket={"accepts":["picture","prompt"],"emits":["picture","prompt"]}
                     workspace.kind=character-sheet-desk  interactionClass=logic  opensPromptBar=true
dup kinds= []
invalid socket kinds= []      # 以 packages/shared/src/types/block.ts 的 SocketKind 联合为准
```

图标名可用性（`Glyph` 组件在名称缺失时会静默降级为空白/加号，故单独验证）：

```bash
node -e "import('lucide-react').then(I=>['Grid3x3','UserSquare'].forEach(n=>console.log(n,typeof I[n])))"
# Grid3x3 object / UserSquare object
```

RUNNABLE_BLOCKS 与执行分支成对性（源码解析）：

```
runnable= 63  dedicated branches= 73  group kinds= 72
runnable 无对应分支= ["preview-sink","motion-story","bridge-clip","seedance-chain"]
```

本次新增的 `multi-grid` / `character-sheet-desk` **成对**（`flow-runner.ts:85,86` 登记 + `:156,:162` 分支）；上述 4 个未接线 kind 为既有缺口（D-02）。

### 2.7 提示词注入（运行期直测）

```
readPresetSections(一次套用四类段落后)=
  {"cinema":"golden hour lighting, warm rim light, soft atmospheric haze, cinematic color grading",
   "lighting":"three-point soft lighting, key light 45° camera-left, gentle fill, subtle rim light, cinematic portrait",
   "portrait":"round face, youthful",
   "anime":"neon lights, rainy night city, cyberpunk anime"}
重复套用 once==twice? true
清除灯光后= "主角推门而入\ncamera movement: slow dolly in\n机位建议：客厅 · 推机位\ncinematic style: …\nportrait: …\nanime style: …"
用户手写 lighting 行 + 套用灯光预设 → "a warm scene\nkeep subject centered\nlighting: three-point soft lighting, …"   ← 用户行消失
用户手写 机位建议 行 + 清除注入 → "a warm scene\nkeep subject centered"                                    ← 用户行消失
blocking hint 与 preset 交替套用 → "body\n机位建议： 客厅 · eye-level · 2m\ncinematic style: …"            ← 两者都在
```

### 2.8 并发与逐格闭环（运行期直测）

```
取消时 progress= [[0,4],[0,4]]   outcome.done=2 cancelled=true      ← 无收尾回调
resolveRunConcurrency(Infinity,5)=1   1e9→5
cell-gen-batch：abort 期间抛「模型配额不足」→ failures=[] cancelled=true   ← 真实失败不进账单
gridCells index=2_000_000 → urls.length=2000001（25ms）
mergeResumedCellUrls / applyCellUrls 同口径 → length=2000001
character-sheet 与 multi-grid 状态机互不串台（各读自己的格字段）
computeContactSheetGridLayout({2,2,0}) → count=0，canvasW/H 有限
```

---

## 3. 缺陷清单（按严重度排序）

### D-01 · error · 既有（非本会话引入）· **仅推断可达面已复现** · 未修（硬边界）

- 位置：`packages/shared/src/index.ts:587,622,640,655,884,1036,1154,1378`
- 现象：barrel 的 8 条 `from './data/*'` 指向**不存在的模块**，导致 `@nx9/shared` 在 **src 与 dist 两处都不可加载**：
  - 源码经 vite alias（`apps/web/vite.config.ts` 把 `@nx9/shared` 指向 `packages/shared/src/index.ts`）→ dev 服与测试直接解析失败；
  - `packages/shared/dist/esm/index.js` 同样 `require('./data/emotion-presets')`，而 `dist/esm/data/` 下无对应产物 → dist 同样不可用；
  - 直接后果：`apps/web` 全量测试 **84/159 文件无法收集**；本会话所有「引擎层直连 barrel」的新功能（多格推演 / 角色设定表工作区、预设选择器、`flow-runner-ops/*`）在 dev 下不可运行。
- 复现：
  ```bash
  cd apps/web && npx vite-node /tmp/nx9-review/barrel-probe.mts
  node -e "...existsSync 逐条核对 from './data/*'..."        # 见 2.3
  npx tsc -p packages/shared/tsconfig.esm.json --noEmit      # 8×TS2307
  git show HEAD:packages/shared/src/index.ts | node -e "..."  # HEAD 同样是这 8 条
  ```
- 证据：见 2.2 / 2.3 / 2.4 输出。
- 是否本会话引入：**否**（HEAD 同一集合；`git log` 中这些文件从无历史）。
- 是否已修：**否**（硬边界：禁止创建 / 修改这 9 个 `data/*` 路径与其既有 import）。
- 影响提示：本次会话往 barrel 追加了 412 个导出名，这些导出**在当前 barrel 状态下无法通过 `@nx9/shared` 取用**；新测试全部改用相对路径直取源码，属于对该缺陷的既有绕行口径（仓库多处既有注释亦如此说明）。

### D-02 · warn · 既有（非本会话引入）· 已复现 · 未修

- 位置：`apps/web/src/engine/flow-runner.ts:23-…`（`RUNNABLE_BLOCKS`）与 `:213`（兜底 `status: 'skipped'`）
- 现象：`preview-sink`、`motion-story`、`bridge-clip`、`seedance-chain` 被登记为「可运行」，但 `executeBlock` 里没有任何分支，运行到它们时静默落到 `updateNodeData(block.id, { status: 'skipped' })`：既不产出、也不解释原因，而它们仍参与层调度与进度统计。
- 复现：见 2.6 的源码解析（`runnable=63`、`dispatched` 共 73 条字面量，缺 4 个）。
- 严重度：warn（既有；`multi-grid` / `character-sheet-desk` 本次**成对**，未引入新缺口）。
- 是否已修：否（修法要么补执行器、要么从 `RUNNABLE_BLOCKS` 摘除，属产品决策）。

### D-03 · warn · **已复现（函数级）** · 仅推断（产品级可达性）· 未修

- 位置：`packages/shared/src/utils/preset-entrypoints.ts:35`（`lighting:` 所有权）对照
  `packages/director3d/src/presets/lightingPresets.ts:564`（`buildLightingPromptFragment` → `lighting: …`）、
  `packages/shared/src/utils/scene-card-prompt.ts:37`、`packages/shared/src/utils/creative-asset-prompts.ts:221`、
  `apps/web/src/engine/director-desk-runner.ts:929`
- 现象：「灯光」section 以整行前缀 `lighting:` 认领所有权（识别 / 替换 / 清除）。而仓库内另有 4 处**同样产出 `lighting: …` 行**的既有生产者。一旦两者写进**同一文本字段**，套用 / 清除灯光预设会把另一方的 `lighting:` 行**整体删掉或替换**，且 UI 选中态（由文本反推）会显示为「未选择」而掩盖已丢失的灯光描述。
- 复现与证据（函数级，已执行）：
  ```ts
  withLightRigPrompt('a warm scene\nlighting: warm afternoon sun through blinds\nkeep subject centered', ['three-point-soft'])
  // → 'a warm scene\nkeep subject centered\nlighting: three-point soft lighting, …'   ← 用户行被替换
  withLightRigPrompt(同上, [])                                                          // ← 用户行被整体删除
  ```
  同一口径也命中「用户手写 `机位建议：…` 行」（`withShotBlockingHint(…, null, …)` 会删掉它）——已写成刻画型用例。
- 产品级可达性：**未复现**。已逐条追踪：3D 导演台的灯光片段进入 `candidate.prompt` / `cameraPrompt`（`directorStore.ts:862`、`CameraPresetBar.tsx:63`、`StageDeckShell.tsx:188`、commit adapter `director3d-commit-adapter.ts:59` → `shot.director3dGuide.cameraPrompt`），场景卡 / 创意素材的 `lighting:` 行经 `, ` 拼成一行（行首非 `lighting:`，不被认领）；均**未与预设选择器管辖的字段（`videoPrompt` / 图像节点提示词）共享**。因此当前只具备「用户手写 / 粘贴 `lighting:` 行」这一条真实触发路径。
- 是否已修：否（改前缀 = 契约变更，需产品决策；建议见 §5）。

### D-04 · warn · **已复现** · 未修

- 位置：`packages/director3d/src/schema/directorProject.ts:632`（`camerasFromCameraKeys` 姿态回落）
- 现象：`activeCameraKeyId` 缺失（老 `committedSnapshot`、被外部写入方清空）+ **两台机位姿态完全相同**时，激活机位会回落到**首个同姿态帧**（id 变化）。画面不变，但当前机位对象发生切换，后续编辑作用到另一台机位。
- 复现：
  ```ts
  const p = projectWith([cam('c1',[0,1,5]), cam('c2',[0,1,5]), cam('c3',[9,1,5])], 'c2');
  const s = shotStateFromProject(p, 'shot-1');            // activeCameraKeyId === 'c2'
  projectFromShotState({ ...s, activeCameraKeyId: null }, p).activeCameraId  // → 'c1'
  ```
- 严重度：warn（属已声明的回落顺序「id → 姿态 → 首帧」的必然结果，触发条件苛刻：需姿态完全重合）。
- 是否已修：否（属语义选择）。

### D-05 · warn · **已复现** · 未修（仅更正注释）

- 位置：`apps/web/src/engine/flow-runner-ops/cell-gen-batch.ts:145`（`if (signal?.aborted) throw e;`）与 `:166`（`cancelled = outcome.cancelled || outcome.failed > 0`）
- 现象：只要 `signal.aborted` 为真，**任何**异常都被上抛给并发池记账、整轮按「已取消」上报，于是「取消期间某个格的真实失败」**不会出现在 `failures` 账单里**，用户只看到「已取消」。原注释「并发池里只有取消类异常会逃出 worker（其余都记进 failures）」与实现不符。
- 复现：
  ```ts
  await runCellGenBatch({ cells:[{role:'r0',…},{role:'r1',…}], sourceUrl:'src', concurrency:2,
    signal: ac.signal,
    generate: async ({index}) => { if (index===0) { ac.abort(); throw new Error('模型配额不足'); } return ['u1']; } });
  // failures=[]  cancelled=true
  ```
- 严重度：warn（仅影响诊断与文案；失败格仍可由「逐格重试」按非成功格补跑，不会假绿成成功）。
- 是否已修：**代码未改**（收紧判定会回归「abort 引发的网络错误被误报为格失败」，属契约变更）；**注释已按实际行为更正**。

### D-06 · warn · **已复现** · 未修（仅更正契约注释）

- 位置：`apps/web/src/engine/run-with-concurrency.ts:114-116`（`if (!stoppedEarly) options.onProgress?.(done, total)`）
- 现象：被取消而提前收场时**不补收尾回调**，最后一次 `onProgress` 停在「最后启动项之前」的计数（示例中 `done=2` 但进度停在 `0`）。调用方若直接用最后一次回调渲染进度，取消后会显示 0%。
  - 本仓库实际调用方（`multi-grid-ops.ts` 的取消分支）会用 `progress: { done: compactCellUrls(merged).length, total }` 覆盖，故**未观察到用户可见影响**。
- 复现：见 2.8 第 1 行。
- 是否已修：代码未改（补回调会改变对调用方可见的契约）；文件头契约描述已按实际行为更正。

### D-09 · warn · **已复现** · **已修（低风险边界补丁）**

- 位置：`apps/web/src/engine/multi-grid-closure.ts`（`readMultiGridCellUrls` / `mergeResumedCellUrls` / `applyCellUrls`）
- 现象：结果数组按格号**逐位补空**撑出来（`while (urls.length <= index) urls.push('')`），而格号直接取自持久化数据（`gridCells[].index`、待续查任务 `cellIndex`）。异常的百万级格号会一次性分配百万级数组（实测 `index: 2_000_000` → `length: 2_000_001`，25ms / 约 16MB），在浏览器里足以造成卡顿 / 内存飙升。
- 复现：
  ```ts
  readMultiGridCellUrls({ gridCells: [{ index: 2_000_000, cellImageUrl: 'u' }] }).length   // → 2000001
  mergeResumedCellUrls(['a'], [{ cellIndex: 2_000_000, url: 'x' }], 4).length              // → 2000001
  applyCellUrls(['a'], [{ cellIndex: 2_000_000, url: 'x' }], 4).length                     // → 2000001
  ```
- 是否已修：**是**（见 §4 R-1）。

### D-07 · info · **已复现** · 当前不可达 · 未修

- 位置：`packages/shared/src/utils/preset-entrypoints.ts:205-233`（`composePresetSections`）+ `:79-85`（`pickByCatalog` 静默丢弃未知 id）
- 现象：传入的 id **全部**不在词表内时，片段为空 → 该 section 被**静默移除**（既不报错也不提示），例如 `withCinemaPrompt(已注入文本, ['cine-golden-hour-typo'])` 返回原文去掉 `cinematic style:` 行。
- 复现与证据：
  ```
  withCinemaPrompt('body', ['cine-golden-hour'])              → 含 'cinematic style: …'
  withCinemaPrompt(上面结果, ['cine-golden-hour-typo'])        → 'body'（行被删）
  withCameraMovePrompt('body', ['push-slow'])                 → 含 'camera movement: …'
  withCameraMovePrompt(上面结果, ['dolly-in-typo'])            → 'body'（行被删）
  ```
- 严重度：info（UI 只传词表 id：`PresetSectionPicker` 的 id 来自 `PRESET_SECTION_PRESETS` 与文本反推，`CameraMovePicker` 来自运镜词库；`buildMotionCameraPrompt` 对未知 `moveId` 另有「回落 fallbackMove」的正确处理）。
- 是否已修：否（若改为「未知 id 报错」会改变 API 契约）。

### D-08 · info · **已复现** · 未修

- 位置：`apps/web/src/engine/run-with-concurrency.ts:46-52`
- 现象：`resolveRunConcurrency(Infinity, 5) === 1`（**串行**），而 `1e9 → 5`。`Infinity` 直觉上应表示「不限并发」。
- 复现：`resolveRunConcurrency(Number.POSITIVE_INFINITY, 5) // → 1`
- 严重度：info（文件头已声明「非有限值 = 1」，且无调用方传 `Infinity`；`resolveCellGenConcurrency` 已把节点级并发裁到 1–4）。
- 是否已修：否（属已文档化契约）。

### D-10 · info · **仅推断（未复现）** · 未修

- 位置：`apps/web/.../tool/MultiGridWorkspace.tsx:511-516`（`handleStop` 无条件 `status:'idle'`）、`CharacterSheetWorkspace.tsx:396-399`（同构）、`flow-runner-ops/multi-grid-ops.ts:372-394`（零产出 + 有后台任务时显式写 `status:'running'` 并 return）
- 现象（推断）：在「所有格都已启动、无一产出、但登记了后台任务」的窗口里按「停止」，`handleRun` 因 `controller.signal.aborted` 只写日志不落状态，而 runner 已把 `status:'running'` 写回且取消补丁**不含 status** → 节点可能停在「出图中」而无在途运行，需要再按一次「停止」（`handleStop` 会无条件置 idle）才能复位。
- 为何仅推断：需要真实浏览器 / React 运行时才能确认时序；该工作区 import `@nx9/shared`，在测试环境无法加载（D-01）。
- 严重度：info（可自愈：连按两次停止即可；`handleStop` 的 `had=false` 分支本身就是「收回空闲」入口）。
- 是否已修：否（修法涉及会话级「已停止」标记与迟到回调抑制，属行为变更）。

### D-11 · info · **已复现（脏数据前提）** · 未修

- 位置：`apps/web/src/engine/multi-grid-closure.ts:97-105`
- 现象：`gridCells` 条目格号非法（如 `index: -1`、`index: 'x'`）时按「按位序号」回落；若该条目同时带图 URL，会写到**同位的另一格**上，可能覆盖合法格图。
- 复现：
  ```ts
  readMultiGridCellUrls({ gridCells: [ {index:2, cellImageUrl:'c'}, {index:'x', cellImageUrl:'b'}, {index:-1, cellImageUrl:'bad'} ] })
  // → ['', 'b', 'bad']   ← 'bad' 落在位置 2，与 {index:2} 冲突时按写入顺序覆盖
  ```
- 严重度：info（需持久化数据出现非法格号；既有测试「乱序 / 缺格不错位」覆盖的是正常范围）。
- 是否已修：否（改判法会改变「缺 index 的条目」的既有回落语义）。

---

## 4. 已做的低风险修复（逐条说明 + 验证）

### R-1 · 逐格结果数组的格号上界（健壮性补丁）

- 文件：`apps/web/src/engine/multi-grid-closure.ts`
- 改动：新增 `MAX_CELL_INDEX = 1024`、`readCellIndex()`、`isWritableCellIndex()`；`readMultiGridCellUrls` 用 `readCellIndex(cell.index, i)`；`mergeResumedCellUrls` / `applyCellUrls` 先过滤越界格号再算 `length`。
- 为什么低风险：**合法输入完全等价**——多格推演最大 25 格（多机位 5×5），角色设定表同量级，任何真实计划格号都 < 1024；越界格号此前的行为是「按位回落（读）」与「把数组撑到 index+1（写）」，前者保持不变，后者本就不可能命中计划的格（调用方都会传 `cellCount`）。
- 验证：`session-review-probe2.test.ts` 断言 `index: 2_000_000` → `['u']`、`merge/apply` 长度 = `cellCount`，并复跑既有 `multi-grid-closure.test.ts` / `character-sheet-closure.test.ts` / `multi-grid-concurrency.test.ts`（全绿）。
- 修复前对照（同一函数）：`length = 2000001` → 修复后 `length = 1`（读）/ `4`（写）。

### R-2 · `projectFromShotState` 不再把非法画幅写进工程（纯函数边界修正）

- 文件：`packages/director3d/src/schema/directorProject.ts:693-707`
- 改动：`viewportAspectRatio` 由「直接透传 `state.camera.aspectRatio`」改为「合法则原样透传；非法则回落基准工程画幅，基准也非法则 `16:9`」。
- 为什么低风险：`ViewportAspectRatio` 只有 3 个合法取值；合法路径逐字符等价（有线测试覆盖），仅对「老数据 / 手改数据里的脏画幅」改变行为（此前会把 `'garbage'` 一路写进 3D 工程与机位关键帧的 `aspectRatio`）。
- 验证：`session-review-probe.test.ts` 三条断言（合法透传 / 回落基准 / 基准缺失兜底）+ 复跑 `director3d-multi-camera-persist.test.ts`（绿）。

### R-3 · 更正 `cell-gen-batch` 的取消记账注释

- 文件：`apps/web/src/engine/flow-runner-ops/cell-gen-batch.ts:163-166`
- 改动：注释从「只有取消类异常会逃出 worker」改为如实描述（取消类异常 + abort 期间任何异常都上抛、按取消上报，代价是 abort 期间的真实失败不进账单）。
- 为什么低风险：**纯注释**，零行为变化。
- 验证：D-05 的复现脚本输出与注释一致。

### R-4 · 更正两处契约描述

- `apps/web/src/engine/run-with-concurrency.ts:9-10`：把「收尾必有一次 (总完成数, total)」改为「跑满时收尾一次；被取消提前收场时不补收尾回调，调用方需用 `outcome.done` 收尾」。
- `packages/director3d/src/schema/directorProject.ts:734`：`syncShotStateWithProject` 头注释中「脏标记与时间戳由调用方补」改为「脏标记由调用方补，`updatedAt` 由本函数刷新」（与实现一致）。
- 为什么低风险：纯注释 / 文档，零行为变化。

### R-5 · 新增 39 条边界回归用例

- `apps/web/src/engine/__tests__/session-review-probe.test.ts`（26 例）：持久化画幅与机位序列边界、并发布界账目（进度/取消/失败隔离/上限归一）、注入共存-幂等-清除与已知前缀误伤刻画。
- `apps/web/src/engine/__tests__/session-review-probe2.test.ts`（13 例）：新 kind 四处自洽 + SocketKind 合法性 + RUNNABLE/分支成对（含 4 个既有缺口的刻画）、格号上界修复回归、状态机隔离与账单去重、联系表 0 格安全。
- 说明：两个文件由评审探针演化而来，文件名保留 `probe`；其中「characterization」断言是把**已确认的现状**钉住并指向本文件的 D 编号，避免下次改动无声改变口径——**不是**认可缺陷。
- 验证：见 §6。

---

## 5. 建议但未改的项（逐条说明为何不擅自改）

| 编号 | 建议修法 | 为何不擅自改 |
| --- | --- | --- |
| D-01 | 补 8 个 `data/*` 模块（或删掉对应 export 块） | **硬边界**明确禁止创建 / 修改这 9 个路径与 barrel 中指向它们的既有 import；且属跨会话的存量缺陷 |
| D-02 | 给 4 个 kind 补执行分支，或从 `RUNNABLE_BLOCKS` 摘除 | 两条路都要业务决策（摘除会让既有画布节点彻底不可运行）；本次新增的 2 个 kind 已正确成对 |
| D-03 | 把预设段落前缀 `lighting:` 改成 `light rig:`（或反向改 3D / 场景卡的前缀） | 前缀是**已落库文本的契约**（用户提示词里可能已有该行），改动会破坏既有提示词的往返识别 → 需产品决策 + 迁移方案 |
| D-04 | 让所有写入方都写 `activeCameraKeyId`，恢复时不再按姿态猜 | 「按姿态回落」是有意设计（兼容 Agent 只改 `camera` 的写入方，见 `directorProject.ts:611-619` 注释），改掉会引入另一类不一致 |
| D-05 | 把 `signal?.aborted` 的兜底判定收紧为 `isCancelError` | 会让「abort 引发的网络错误」被误报成格失败（正是当前判定要避免的）→ 需要更细的判定规则（例如按 `AbortError` / 取消文案 / running 中触发的 timeout 分类） |
| D-06 | 取消时补一次 `onProgress(done, total)` | 会改变对调用方可见的回调契约（调用方可能据此判断收场）→ 建议随下一次并发改造统一 |
| D-07 | 非词表 id 改为告警 / 抛错 | 会改变公共 API 契约（既有行为是静默过滤，`onUnknown` 语义已在 `buildCameraMovePrompt` 里另有实现） |
| D-08 | `Infinity` 映射为「不限」 | 已文档化，且收紧 / 放宽都无现实调用方 |
| D-10 | 会话级「已停止」标记 + 抑制迟到回调 | 涉及状态机与 UI 行为变更；且需浏览器验证才能确认收益 |
| D-11 | 非法格号改为「丢弃该条目」而非按位回落 | 会改变「缺 index 的 gridCells 条目」的既有可读性契约 |
| 其他 | `apps/web` 223 条既有 tsc 报错、6 个 `*-check.json` 的既有失败 | 与本会话改动无关（0 条落在改动文件上），属存量债务 |

---

## 6. 验证

### 6.1 新增 / 补测命令与退出码

```bash
cd apps/web && npx vitest run src/engine/__tests__/session-review-probe.test.ts \
                            src/engine/__tests__/session-review-probe2.test.ts
# EXIT=0
#  Test Files  2 passed (2)
#       Tests  39 passed (39)
```

改动直接影响面的复跑：

```bash
cd apps/web && npx vitest run \
  src/engine/__tests__/multi-grid-closure.test.ts \
  src/engine/__tests__/character-sheet-closure.test.ts \
  src/engine/__tests__/multi-grid-concurrency.test.ts \
  src/engine/__tests__/run-with-concurrency.test.ts \
  src/engine/__tests__/director3d-multi-camera-persist.test.ts \
  src/engine/__tests__/preset-entrypoints.test.ts \
  src/engine/__tests__/r2-dormant-wiring-guards.test.ts \
  src/engine/__tests__/r2-shot-blocking-hint.test.ts \
  src/engine/__tests__/multi-grid-block-map.test.ts \
  src/engine/__tests__/multi-grid-plan.test.ts \
  src/engine/__tests__/multi-grid-to-shots.test.ts \
  src/engine/__tests__/character-sheet-plan.test.ts \
  src/engine/__tests__/character-sheet-block-map.test.ts \
  src/engine/__tests__/director3d-lighting.test.ts \
  src/engine/__tests__/director3d-move-timeline-keys.test.ts \
  src/engine/__tests__/camera-move-timeline.test.ts \
  src/engine/__tests__/camera-move-library.test.ts \
  src/engine/__tests__/camera-move-parse.test.ts
#  Test Files  18 passed (18)
#       Tests  446 passed (446)
```

类型检查（改动文件 0 报错）：

```bash
cd apps/web && npx tsc -p tsconfig.json --noEmit      # 223 条既有报错，0 条落在改动文件
npx tsc -p apps/web/tsconfig.multi-grid-check.json    # exit=0
npx tsc -p apps/web/tsconfig.multi-grid-shots-check.json  # exit=0
npx tsc -p apps/web/tsconfig.camera-move-check.json   # exit=0
```

### 6.2 全量回归前后基线对照

| 指标 | 改前基线 | 改后 | 判定 |
| --- | --- | --- | --- |
| 测试文件 | 84 failed / 75 passed（159） | 84 failed / 77 passed（161） | 失败数一致；+2 = 本次新增的两个测试文件 |
| 用例 | 2 failed / 930 passed / 1 skipped（933） | 2 failed / 969 passed / 1 skipped（972） | 失败数一致；+39 = 本次新增用例 |
| 失败签名 | `Failed to resolve import "./data/emotion-presets" …` ×84 文件 | 同一签名、同一 84 个文件 | **零回归** |
| 逐条失败用例 | `DirectorDeskBlock renders without crashing`、`ScriptDeskBlock renders without crashing` | 同名同因 | **零回归** |
| `apps/web` tsc | 223 条（既有） | 223 条 | 一致 |

失败文件清单与逐条失败用例由 `--reporter=json` 导出后程序化比对（脚本与产物在系统临时目录：`nx9-baseline-report.json` / `nx9-after-report.json` / `nx9-extract-signature.mjs`）：

```
baseline failing files: 84 after: 84
only in baseline: []
only in after: []
identical list: true
failing tests identical: true
after passed: 969 skipped: 1 tests: 972 suites: 404
```

> 说明：上表「失败数一致」不是「测试全绿」。`apps/web` 当前的 84 个失败文件**全部**源于 D-01 的 barrel 缺陷，本次评审未触碰该缺陷（硬边界），因此基线即为红。

### 6.3 临时产物（需人工清理）

评审过程中为比对基线，向仓库根复制了一份改前全量测试日志（未被 `.gitignore` 覆盖）：

```
nx9-baseline-tmp.txt        # 44KB，改前 vitest 原始输出（唯一落在仓库内的临时文件）
```

因本机安全策略禁止在 shell 中执行删除命令，未删除。确认本评审结论后可直接：

```bash
rm nx9-baseline-tmp.txt
```

其余探针脚本与 JSON 报告都写在系统临时目录（`%TEMP%\nx9-*`），不在仓库内。


---

## 7. 未覆盖面（明确未验证的风险面）

1. **浏览器 / GUI 层**：所有 import `@nx9/shared` 的工作区（`MultiGridWorkspace`、`CharacterSheetWorkspace`、`PresetSectionPicker`、`CameraMovePicker/TimelineEditor`、`LightingPanel` 等）在测试环境**无法加载**，因此未做交互级验证：按钮态、停止/重试时序、无水印与空数据提示文案、Toast 文案、进度条行为。D-10 因此只能是「仅推断」。
2. **真实链路**：未跑真实图片 / 视频 / LLM / TTS 供应商 API；未跑 `apps/server`（需 DB、文件、第三方 key）。
3. **E2E**：未跑 `pnpm --filter @nx9/web exec playwright test`（需 dev server + server + 浏览器）。
4. **3D 视觉**：导演台布光 / 机位关键帧的**实际画面**未验证（只验证了数据结构与提示词文本）。
5. **桌面（Electron）打包链路**：未涉及。
6. **并发时序压力**：`runWithConcurrency` 只做了确定性时序用例（手动放行 Promise），未做高并发压力 / 定时抖动下的长稳测试。
7. **多会话并发写**：同一节点被两个窗口同时运行 / 续查的竞争（本地无多窗口环境）。
8. **性能**：D-09 只测了单点分配规模，未做 25 格真实出图下的内存/耗时基线。
9. **`packages/shared` 全量类型健康**：barrel 缺陷使 `tsc` 大面积级联（隐式 any），因此「类型是否真的自洽」在受影响文件上**无法判定**（只能判定「改动文件 0 报错」）。
