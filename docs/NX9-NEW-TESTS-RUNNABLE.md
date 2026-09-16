# NX9 新测试可独立运行说明

> 范围：本会话新增的 28 个测试文件，在不依赖 `@nx9/shared` / `@nx9/director3d` 两个坏 barrel 的前提下
> 可独立加载并运行。本文只描述测试与导入层面的约定，不涉及任何产品逻辑变更。

---

## 1. 背景：为什么要绕开 barrel

仓库存在一个**既有缺陷**（本文不改、不掩盖）：

`packages/shared/src/index.ts` 引用了 9 个不存在 / 不应改动的模块：

| 缺失模块（`packages/shared/src/data/…`） |
| --- |
| `emotion-presets` |
| `shot-move-families` |
| `creative-asset-presets` |
| `character-face-rig-presets` |
| `playbook-definitions` |
| `camera-presets` |
| `shot-lexicon-taxonomy` |
| `provider-registry` |

因此任何 `import … from '@nx9/shared'` 都会在 **Vite 解析期** 直接失败：

```
Error: Failed to resolve import "./data/emotion-presets"
       from "../../packages/shared/src/index.ts". Does the file exist?
  File: packages/shared/src/index.ts:587:7
```

**连带效应**：`packages/director3d/src/index.ts` 的传递闭包里有多个模块**值导入** `@nx9/shared`。

实测：从 `index.ts` 可达 **65** 个模块，其中带 `@nx9/shared` 值导入的有 8 个：

| 可达模块 | 值导入 | 来源 |
| --- | --- | --- |
| `sculpt/sculpt-contract.ts` | `FACE_RIG_PARAMS` | ✅ 被 index.ts 直接 re-export |
| `sculpt/procedural-base-model.ts` | `FACE_RIG_PARAMS` | ✅ 同上 |
| `sculpt/pack-mpfb-character-base.ts` | `FACE_RIG_PARAMS` | ✅ 同上 |
| `sculpt/apply-face-rig.ts` | `@nx9/shared` | ✅ 同上 |
| `sculpt/CharacterSculptScene.ts` | `emptyFaceRig`, `getFaceRig` | ✅ 同上 |
| `sculpt/sculpt-handles.ts` | `@nx9/shared` | ✅ 同上 |
| `runtime/stage-body-bridge.ts` | `faceRigValue` | ✅ 同上 |
| `runtime/StageActor.tsx` | `emptyFaceRig` | ⚠️ 非具名 re-export，但经 `canvas/DirectorCanvas → canvas/SceneContent` **可达** |

`FACE_RIG_PARAMS` 正属于上面的缺失模块。所以任何 `import … from '@nx9/director3d'` 的测试
在**加载期**就整体失败，连一个用例都收集不到。

---

## 2. 绕开方式：相对路径直取源码

测试一律用**相对路径**直接指向源文件，不经过任何 barrel。

从 `apps/web/src/engine/__tests__/` 出发，仓库根是**上 5 级**：

```ts
// packages/shared
import { parseCameraMovePrompt } from '../../../../../packages/shared/src/utils/camera-move-parse';
// packages/director3d
import { KEY_LIGHT_PRESETS } from '../../../../../packages/director3d/src/presets/lightingPresets';
```

从 `apps/web/src/blocks/craft/__tests__/` 出发同理（仍是上 5 级）。

含中文注释的文件头会注明「本文件 import 走相对路径直取源码，而不是 `@nx9/xxx`」及原因，
现状见 `camera-move-parse.test.ts`、`cameraMoveMotion.ts`、`cameraMoveTimelineKeys.ts` 等。

### 2.1 为什么 `director3d/src/schema/*` 相对路径是安全的

`packages/director3d/src/schema/directorProject.ts:3` 对 shared 只有一行：

```ts
import type { CharacterFaceRig } from '@nx9/shared';
```

这是**类型专用导入**（`import type`），esbuild 在 transform 阶段整行剥离，不会进入
`vite:import-analysis`，因此不会触发 barrel 解析。

以 `directorProject.ts` 为根做传递闭包追踪，`presets/lightingPresets`、`presets/builtinAssets`、
`presets/builtinScenes`、`schema/cameraGeometry`、`store/directorStore` 这 5 个入口合计只触及
**14 个模块**，其中出现 `@nx9/` 字样的仅 3 行——1 行是真导入（`directorProject.ts` 的
`import type`），另 2 行是 `cameraMoveMotion.ts` / `cameraMoveTimelineKeys.ts` 注释里提到
barrel 缺陷的文字。**没有缺失的相对模块，也没有任何 barrel 值导入。**
这是 §4.1 两个测试能改造成功的依据。

---

## 3. 测试专用入口：结论是「不需要」

任务书允许在 `apps/web/src/engine/__tests__/` 下新增一个测试专用 re-export 入口
（如 `_shared-src.ts`）来集中转发源码模块。

**本次没有创建该文件**，原因是实测不需要：改造后跨包引用最多出现在 4 个模块之间，
用 4 条相对路径 import 即可，引入一层转发入口反而会增加一层间接、降低可读性。
若后续有测试需要同时跨 shared + director3d + remotion 多个包，再考虑引入；
一旦引入，约束是：

- 只能放在 `__tests__/` 目录内，**不得**放进产品代码路径；
- 文件头必须注明「测试专用，禁止被产品代码 import」；
- 只做 re-export，不得包含任何逻辑。

---

## 4. 如何运行

### 4.1 全量（本会话 28 个新增测试）

在仓库根执行：

```bash
cd apps/web && npx vitest run \
 src/blocks/craft/__tests__/CameraMoveTimelineEditor.test.tsx \
 src/engine/__tests__/beat-grid.test.ts \
 src/engine/__tests__/builtin-llm-audio-models.test.ts \
 src/engine/__tests__/builtin-video-models.test.ts \
 src/engine/__tests__/camera-move-library.test.ts \
 src/engine/__tests__/camera-move-parse.test.ts \
 src/engine/__tests__/camera-move-timeline.test.ts \
 src/engine/__tests__/character-sheet-block-map.test.ts \
 src/engine/__tests__/character-sheet-closure.test.ts \
 src/engine/__tests__/character-sheet-plan.test.ts \
 src/engine/__tests__/consistency-check.test.ts \
 src/engine/__tests__/consistency-report.test.ts \
 src/engine/__tests__/consistency-wiring.test.ts \
 src/engine/__tests__/director3d-builtin-assets.test.ts \
 src/engine/__tests__/director3d-camera-move-library-panel.test.tsx \
 src/engine/__tests__/director3d-camera-move-motion.test.ts \
 src/engine/__tests__/director3d-lighting.test.ts \
 src/engine/__tests__/director3d-move-timeline-keys.test.ts \
 src/engine/__tests__/director3d-multi-camera-persist.test.ts \
 src/engine/__tests__/multi-grid-block-map.test.ts \
 src/engine/__tests__/multi-grid-closure.test.ts \
 src/engine/__tests__/multi-grid-concurrency.test.ts \
 src/engine/__tests__/multi-grid-plan.test.ts \
 src/engine/__tests__/multi-grid-to-shots.test.ts \
 src/engine/__tests__/recipe-picker-overlay.test.tsx \
 src/engine/__tests__/run-with-concurrency.test.ts \
 src/engine/__tests__/workflow-templates-links.test.ts \
 src/engine/__tests__/workflow-templates-new.test.ts
```

### 4.2 全量套件（含既有测试）

```bash
cd apps/web && npx vitest run
```

> 注意：`apps/web/vitest.config.ts` 里 `@nx9/shared` / `@nx9/director3d` 两个 alias 仍指向
> 坏 barrel。**不要**为了跑新测试去改这两个 alias——那会波及既有测试与产品路径。
> 新测试靠相对路径自洽，与 alias 无关。

### 4.3 单文件

```bash
cd apps/web && npx vitest run src/engine/__tests__/director3d-lighting.test.ts
```

---

## 5. 当前结果

### 5.1 本会话 28 个新增测试（全部可独立运行）

命令：§4.1 ｜ **exit code = 0**

```
 Test Files  28 passed (28)
      Tests  637 passed (637)
```

逐文件：

| # | 文件 | 用例数 | 结果 |
| --- | --- | ---: | --- |
| 1 | `blocks/craft/__tests__/CameraMoveTimelineEditor.test.tsx` | 20 | ✅ pass |
| 2 | `engine/__tests__/beat-grid.test.ts` | 50 | ✅ pass |
| 3 | `engine/__tests__/builtin-llm-audio-models.test.ts` | 13 | ✅ pass |
| 4 | `engine/__tests__/builtin-video-models.test.ts` | 14 | ✅ pass |
| 5 | `engine/__tests__/camera-move-library.test.ts` | 26 | ✅ pass |
| 6 | `engine/__tests__/camera-move-parse.test.ts` | 54 | ✅ pass |
| 7 | `engine/__tests__/camera-move-timeline.test.ts` | 49 | ✅ pass |
| 8 | `engine/__tests__/character-sheet-block-map.test.ts` | 13 | ✅ pass |
| 9 | `engine/__tests__/character-sheet-closure.test.ts` | 14 | ✅ pass |
| 10 | `engine/__tests__/character-sheet-plan.test.ts` | 29 | ✅ pass |
| 11 | `engine/__tests__/consistency-check.test.ts` | 15 | ✅ pass |
| 12 | `engine/__tests__/consistency-report.test.ts` | 45 | ✅ pass |
| 13 | `engine/__tests__/consistency-wiring.test.ts` | 14 | ✅ pass |
| 14 | `engine/__tests__/director3d-builtin-assets.test.ts` | 12 | ✅ pass（本次改造） |
| 15 | `engine/__tests__/director3d-camera-move-library-panel.test.tsx` | 14 | ✅ pass |
| 16 | `engine/__tests__/director3d-camera-move-motion.test.ts` | 39 | ✅ pass |
| 17 | `engine/__tests__/director3d-lighting.test.ts` | 15 | ✅ pass（本次改造） |
| 18 | `engine/__tests__/director3d-move-timeline-keys.test.ts` | 15 | ✅ pass |
| 19 | `engine/__tests__/director3d-multi-camera-persist.test.ts` | 24 | ✅ pass |
| 20 | `engine/__tests__/multi-grid-block-map.test.ts` | 11 | ✅ pass |
| 21 | `engine/__tests__/multi-grid-closure.test.ts` | 33 | ✅ pass |
| 22 | `engine/__tests__/multi-grid-concurrency.test.ts` | 13 | ✅ pass |
| 23 | `engine/__tests__/multi-grid-plan.test.ts` | 20 | ✅ pass |
| 24 | `engine/__tests__/multi-grid-to-shots.test.ts` | 44 | ✅ pass |
| 25 | `engine/__tests__/recipe-picker-overlay.test.tsx` | 6 | ✅ pass |
| 26 | `engine/__tests__/run-with-concurrency.test.ts` | 11 | ✅ pass |
| 27 | `engine/__tests__/workflow-templates-links.test.ts` | 9 | ✅ pass |
| 28 | `engine/__tests__/workflow-templates-new.test.ts` | 15 | ✅ pass |

### 5.2 既有测试（未改造，如实记录）

命令：`cd apps/web && npx vitest run` ｜ **exit code = 1**

```
 Test Files  84 failed | 70 passed (154)
      Tests  2 failed | 796 passed | 1 skipped (799)
```

拆开看：

| 分类 | 文件数 | 通过 | 失败 | 用例数 |
| --- | ---: | ---: | ---: | ---: |
| 本会话新增 | 28 | 28 | 0 | 637 |
| 既有 | 126 | 42 | 84 | 162 |

- `799` 个收集到的用例里 `637` 来自本会话新增测试，既有测试实际只跑起来 `162` 个——
  因为 84 个既有文件在**收集阶段**就崩了，`0 test`。
- **86 个失败全部由 barrel 缺陷引起**，无一例外（逐条核对过错误信息，见 §5.3）。
  本仓库目前没有与 barrel 无关的失败测试。

### 5.3 仍不可运行的既有测试（84 个文件，原因 100% 是 barrel）

84 个失败文件中，82 个是「收集期失败、`0 test`」，2 个是「收集到用例但在用例内 import 失败」：
`blocks/core/__tests__/DirectorDeskBlock.test.tsx`、`blocks/nx9/__tests__/ScriptDeskBlock.test.tsx`
（各 1 个用例失败，报错同样是 `emotion-presets` 解析失败，即 §5.2 里那 `2 failed`）。

**未修复这些文件**——按任务边界，只改本会话新增测试，不动既有测试。

根因分两类：

- 直接 `import … from '@nx9/shared'`（大多数）
- 直接 `import … from '@nx9/director3d'`，或 import 的产品模块（如 `@/engine/flow-runner`）
  传递依赖到上面两个 barrel

完整清单（相对 `apps/web/src/`）：

```
blocks/core/__tests__/DirectorDeskBlock.test.tsx
blocks/craft/__tests__/StoryboardDeskBlock.test.tsx
blocks/nx9/__tests__/ScriptDeskBlock.test.tsx
blocks/nx9/__tests__/chat-stage.test.tsx
blocks/nx9/__tests__/connected-llm-models.test.ts
blocks/nx9/__tests__/connected-video-models.test.ts
blocks/nx9/__tests__/desk-helpers.test.ts
blocks/nx9/__tests__/script-desk-closure.test.ts
blocks/nx9/__tests__/script-desk-panels.test.tsx
blocks/shared/__tests__/generic-block.test.tsx
blocks/utility/__tests__/MediaFileInfoPanel.test.tsx
engine/__tests__/agent-director3d-bridge.test.ts
engine/__tests__/asset-library-health.test.ts
engine/__tests__/asset-library-modal-split-guard.test.ts
engine/__tests__/asset-library-p3.test.ts
engine/__tests__/asset-library-p3b.test.ts
engine/__tests__/asset-readiness-costume-prop.test.ts
engine/__tests__/asset-readiness-visual.test.ts
engine/__tests__/asset-ref-rebind.test.ts
engine/__tests__/bible-library-sync-p2.test.ts
engine/__tests__/chain-storyboard-hygiene.test.ts
engine/__tests__/character-face-rig.test.ts
engine/__tests__/character-model-loader.test.ts
engine/__tests__/character-sculpt-p1.test.ts
engine/__tests__/clip-editor-render.test.ts
engine/__tests__/clip-gen-request.test.ts
engine/__tests__/collect-used-assets.test.ts
engine/__tests__/dd01-video-gate.test.ts
engine/__tests__/dd03-director3d-semantics.test.ts
engine/__tests__/dd09-batch-progress.test.ts
engine/__tests__/director-desk-runner.test.ts
engine/__tests__/director-keyframe-batch-runner.test.ts
engine/__tests__/director3d-character-sync.test.ts
engine/__tests__/director3d-commit-adapter.test.ts
engine/__tests__/director3d-node.test.ts
engine/__tests__/director3d-split.test.ts
engine/__tests__/director3d-state.test.ts
engine/__tests__/dr01-chain-approval.test.ts
engine/__tests__/dr03-chain-export.test.ts
engine/__tests__/export-pack-honesty.test.ts
engine/__tests__/face-p3-lock-export.test.ts
engine/__tests__/face-sculpt-health.test.ts
engine/__tests__/face-sculpt-material-driver.test.ts
engine/__tests__/face-sculpt-p2-handles.test.ts
engine/__tests__/flow-runner-split-guard.test.ts
engine/__tests__/generate-character-base-model.test.ts
engine/__tests__/inpaint-continuity-honesty.test.ts
engine/__tests__/keyframe-color-check.test.ts
engine/__tests__/loop-executor.test.ts
engine/__tests__/media-pin-items.test.ts
engine/__tests__/ol19-sound-resolve.test.ts
engine/__tests__/pack-mpfb-character-base.test.ts
engine/__tests__/picture-gen-commit-accounting.test.ts
engine/__tests__/picture-gen-node-resolve.test.ts
engine/__tests__/picture-gen-refs.test.ts
engine/__tests__/probe-body-geometry.test.ts
engine/__tests__/script-desk-error-code.test.ts
engine/__tests__/script-desk-r3-merge.test.ts
engine/__tests__/script-desk-rename-pending.test.ts
engine/__tests__/script-storyboard-director-handoff.test.ts
engine/__tests__/sculpt-blender-refine.test.ts
engine/__tests__/sculpt-external-glb-validate.test.ts
engine/__tests__/sculpt-live-glb-smoke.test.ts
engine/__tests__/sculpt-preview-render.test.ts
engine/__tests__/se-deep-honesty.test.ts
engine/__tests__/se-edit-anim.test.ts
engine/__tests__/se-edit-subtitles.test.ts
engine/__tests__/shot-lexicon-desk-map.test.ts
engine/__tests__/stage-actor-pose.test.ts
engine/__tests__/stage-body-bridge.test.ts
engine/__tests__/stage-composer-camera.test.ts
engine/__tests__/storyboard-desk-breakdown-mutations.test.ts
engine/__tests__/storyboard-desk-contact-sheet-stale.test.ts
engine/__tests__/storyboard-desk-frame-cleanup.test.ts
engine/__tests__/storyboard-preview-confirmation.test.ts
engine/__tests__/storyboard-preview-score-honesty.test.ts
engine/__tests__/timeline-mask.test.ts
engine/__tests__/timeline-transitions.test.ts
engine/__tests__/timeline-v3.test.ts
engine/__tests__/upstream-dialogue.test.ts
engine/__tests__/vg-r2-p2.test.ts
engine/__tests__/vg-r2-p3.test.ts
engine/__tests__/vg-r3.test.ts
engine/__tests__/video-edit-provider-registry.test.ts
```

### 5.4 彻底修好 barrel 之后会怎样（未验证，仅说明方向）

补齐 §1 那 9 个缺失模块、或从 `packages/shared/src/index.ts` 摘掉指向它们的 export，
`@nx9/shared` 与 `@nx9/director3d` 即可恢复解析，§5.3 的 84 个文件大概率随之恢复。
**本次未做此改动**（超出任务边界），因此这一点没有实测证据，不作通过声明。

---

## 6. 边界与不变量

本次改动遵守：

- ✅ 只改**测试文件**与其中的 import 写法；
- ✅ 不新建 9 个缺失模块，不改 `packages/shared/src/index.ts` 指向它们的 import；
- ✅ 不改 `packages/director3d/src/index.ts` 的既有导出（那是公共契约）；
- ✅ 不改任何产品逻辑，不减任何断言、不删任何用例；
- ✅ 不新增第三方依赖，不改 `vitest.config.ts` 的 alias；
- ✅ 未创建 `_shared-src.ts` 类转发入口（不需要），故也不存在「测试专用入口泄漏到产品路径」的问题。

---

## 7. 一句话结论

本会话 28 个新增测试已全部改为相对路径直取源码，**28 files / 637 tests 全绿、exit 0**；
仓库全量套件仍为 **84 failed | 70 passed（154 files）**，86 个失败项**全部**由
`packages/shared/src/index.ts` 的既有缺失模块缺陷引起，与本次改动无关，也未被本次改动掩盖。
