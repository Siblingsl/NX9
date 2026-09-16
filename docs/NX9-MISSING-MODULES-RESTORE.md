# NX9 缺失模块恢复指引（8 个 `packages/shared/src/data/*.ts`）

> 体检工具：`node scripts/nx9-missing-modules-doctor.mjs`（`--json` 机器可读，`--strict` 有缺失即 exit 1）
> 单测：`apps/web/src/engine/__tests__/missing-modules-doctor.test.ts`（相对路径直取脚本，**不依赖 barrel**）
>
> 本文件是**恢复指引**，不是恢复本身：项目《约束开发要求》禁止臆猜业务数据集，
> 8 个模块的内容**必须从备份 / 另一台机器 / 交付包取回**，任何在本仓库「照着接口猜着写」的做法都不被接受。

---

## 0. 一句话结论

`packages/shared/src/index.ts`（barrel）里 **8 个 `./data/*` 相对 import 指向不存在的文件**，
导致 `@nx9/shared` 在 **src 与 dist 两条解析路径上整体不可用**：

| 影响面 | 事实 |
| --- | --- |
| `pnpm --filter @nx9/shared build` | 第一步就失败（`tsc` 报 8 × TS2307 `Cannot find module '../data/...'`） |
| `apps/web` 全量单测 | **161 个测试文件里 84 个在加载期失败**（占 52%），全部错误签名都是 `Failed to resolve import "./data/emotion-presets"` |
| 浏览器 dev | 任何经 barrel 的模块加载即报错 |
| 服务端 | `@nx9/shared` 解析到过期 `dist`，加载即报 `Cannot find module './data/emotion-presets'` |

**恢复动作本身很小**：把 8 个文件放回 `packages/shared/src/data/`。难的是**内容从哪来**——它不在本仓库里（见 §1）。

---

## 1. 根因与证据

### 1.1 根因

`packages/shared/src/data/` 下的文件被 `.gitignore` 里的一条**未锚定**规则 `data/` 匹配
（该规则本意是忽略仓库根的本地数据目录），于是这些**产品源码**既没被 `git add`、也没进任何提交。
本会话已把该规则改为**锚定根目录**的 `/data/`：

```diff
 # local data
-data/
+/data/
 storage/
```

> 注意：这条修复只对**以后**生效。历史提交里从来没有这些文件，改 `.gitignore` 不会把它们变出来。

### 1.2 证据（可复现）

**(a) 当前工作树里这些路径确实不存在**（node 逐条 `fs.existsSync`，不用 grep）：

```bash
node -e "const fs=require('fs');const n=['emotion-presets','shot-move-families','creative-asset-presets','character-face-rig-presets','playbook-definitions','camera-presets','shot-lexicon-taxonomy','provider-registry','shot-library-seeds'];for(const x of n){const p='packages/shared/src/data/'+x+'.ts';console.log(p,fs.existsSync(p)?'EXISTS':'MISSING')}"
```

实测输出（前 8 条 MISSING，最后 1 条 EXISTS）：

```
packages/shared/src/data/emotion-presets.ts MISSING
packages/shared/src/data/shot-move-families.ts MISSING
packages/shared/src/data/creative-asset-presets.ts MISSING
packages/shared/src/data/character-face-rig-presets.ts MISSING
packages/shared/src/data/playbook-definitions.ts MISSING
packages/shared/src/data/camera-presets.ts MISSING
packages/shared/src/data/shot-lexicon-taxonomy.ts MISSING
packages/shared/src/data/provider-registry.ts MISSING
packages/shared/src/data/shot-library-seeds.ts EXISTS
```

**(b) 旧 `.gitignore` 规则确实会吞掉这个目录**（`git check-ignore` 可复现）：

在系统临时目录建一个 scratch 仓库，只放 **HEAD 版** `.gitignore`，再探测路径：

```bash
# HEAD 版（规则 `data/`）
git show HEAD:.gitignore   # 第 12 行是 `data/`
# 把该内容写进 scratch/.gitignore 后：
git check-ignore -v --no-index packages/shared/src/data/emotion-presets.ts
```

实测结果：

| 使用的 `.gitignore` | `git check-ignore` exit | 输出 |
| --- | --- | --- |
| HEAD 版（`data/`） | **0**（= 被忽略） | `.gitignore:12:data/	packages/shared/src/data/emotion-presets.ts` |
| 当前工作树版（`/data/`） | **1**（= 不被忽略） | （空） |

**(c) 全历史（含 `origin/main`）从未登记过这 8 个文件**：

```bash
git log --all --oneline -- packages/shared/src/data/emotion-presets.ts   # 空
git ls-files --error-unmatch packages/shared/src/data/emotion-presets.ts # 报错（未跟踪）
```

对 8 个模块 + `shot-library-seeds.ts` 逐个执行，结果一致：**history=无 / tracked=否**。
本仓库共 3 个 ref（`main`、`origin/main`、`origin/HEAD`），无其他远端。
`packages/shared/src/data/` 下历史上登记过的文件只有 13 个（`gen-models` / `workflow-templates` /
`backlot-templates` / `anime-tag-presets` / `blocking-presets` / `character-sheet-presets` / `comfy-presets` /
`fal-models` / `light-rig-presets` / `portrait-presets` / `pose-presets` / `prompt-presets` / `prompt-templates`），
**不含**这 8 个。

**(d) dist 里也没有编译产物**（`packages/shared/dist/esm/data/` 只有 `shot-library-seeds.{js,d.ts,d.ts.map}`）。

> 结论：**这 8 个模块的内容只存在于仓库之外**（作者的备份 / 另一台机器 / 交付包）。
> 本仓库内不存在任何可"拼"出它们的完整副本——所以必须**取回**，不能"重写"。

---

## 2. 照单恢复清单

恢复位置固定为 `packages/shared/src/data/`。**不要改 `packages/shared/src/index.ts` 里已有的 import**，
只需要让文件存在并且导出下列名字（`*type*` = 必须是类型导出）。

| # | 文件（放回 `packages/shared/src/data/`） | 必须导出（`*type*` 为类型导出） | 导出数 | 消费方文件数 |
| --- | --- | --- | --- | --- |
| 1 | `emotion-presets.ts` | `BUILTIN_EMOTION_PRESETS` · *type* `EmotionPreset` | 2 | 1 |
| 2 | `shot-move-families.ts` | `SHOT_MOVE_FAMILIES` · `shotMoveFamilyLabel` · `inferShotMoveFamilyFromGroup` | 3 | 3 |
| 3 | `creative-asset-presets.ts` | `CAC_EXPRESSION_PRESETS` · `CAC_POSE_PRESETS` · `CAC_ANGLE_PRESETS` · `CAC_HOOK_TYPES` · `CAC_SHOT_SIZES` · `CAC_VOICE_GENDERS` · `CAC_VOICE_EMOTIONS` · `defaultCharacterVariants` · `mergeVariantSlots` · `CAC_SHEET_EXPRESSION_PRESETS` · `CAC_MICRO_EXPRESSION_PRESETS` · `CAC_SHEET_POSE_PRESETS` · `CAC_SHEET_HEAD_ANGLE_PRESETS` · `CAC_COSTUME_DETAIL_PRESETS` · `CAC_HAND_REF_PRESETS` · `CAC_COSTUME_VARIANT_PRESETS` | 16 | 5 |
| 4 | `character-face-rig-presets.ts` | `FACE_RIG_DEADZONE` · `FACE_RIG_MIN` · `FACE_RIG_MAX` · `FACE_RIG_GROUPS` · `FACE_RIG_PARAMS` · `FACE_RIG_PARAMS_BY_ID` · `CHARACTER_FACE_RIG_PRESETS` · `FACE_RIG_PRESETS_BY_ID` · `faceRigParamsOfGroup` · *type* `FaceRigGroupDef` · *type* `FaceRigDriver` · *type* `FaceRigParamDef` · *type* `FaceRigPreset` | 13 | 9 |
| 5 | `playbook-definitions.ts` | `PLAYBOOK_DEFINITIONS` · *type* `PlaybookId` · *type* `PlaybookStepAction` · *type* `PlaybookStepDef` · *type* `PlaybookDefinition` | 5 | 21 |
| 6 | `camera-presets.ts` | `CAMERA_PRESETS` · `lookupCameraPreset` · *type* `CameraPreset` | 3 | 1 |
| 7 | `shot-lexicon-taxonomy.ts` | `SHOT_LEXICON_SYSTEMS` · `shotLexiconSystemLabel` · `listShotLexiconCategories` · `shortenShotLexiconCategory` · *type* `ShotLexiconSystem` | 5 | 4 |
| 8 | `provider-registry.ts` | `PROVIDER_REGISTRY` · `resolveDefaultModel` · `DEFAULT_PICTURE_MODEL` · `DEFAULT_VIDEO_MODEL` · `DEFAULT_TTS_MODEL` · *type* `ProviderDef` · `VIDEO_EDIT_PROVIDERS` · `DEFAULT_VIDEO_EDIT_PROVIDER` · `resolveVideoEditProvider` · *type* `VideoEditProviderDef` · `VIDEO_TRACE_PROVIDERS` · `DEFAULT_VIDEO_TRACE_PROVIDER` · `resolveVideoTraceProvider` · *type* `VideoTraceProviderDef` | 14 | 4 |
| | **合计** | | **61**（value 47 / type 14） | **42**（去重后） |

> 上表的导出名与分类，全部由体检工具从 barrel 的 import 语句**静态解析**得出（含 `export { X, type Y }`
> 这种混排），不是人工抄写；改动 barrel 后重跑工具会给出新清单。
> 消费方时点合计 **95 处 / 42 个文件**。

### 2.1 每个模块的仓库内权威线索（**只指路，不代写**）

恢复者应当打开这些来源**自己核对内容**；工具只负责确认这些路径真实存在（当前 49 条线索路径 0 条缺失）。

**1. `emotion-presets.ts`**
- `apps/web/src/panels/asset-library/AssetDetailFields.tsx` — 真实消费点：`BUILTIN_EMOTION_PRESETS.map((p) => …)`
  读 `p.id` / `p.label` / `p.promptEn`，写入 `emotionTags`。
- `packages/shared/src/types/creative-asset-center.ts` — `ShotCreativeExtension.emotionTags` / `recommendedEmotion` 语义注释。
- `packages/shared/src/utils/creative-asset-prompts.ts` — `buildEmotionPrompt` / `getEmotionCreative`：预设最终注入 Prompt 的形态。
- `packages/shared/src/data/character-sheet-presets.ts` — 同目录既有预设文件的字段风格参照（**注意语义不同**：那是角色表情格）。

**2. `shot-move-families.ts`**
- `packages/shared/src/types/creative-asset-center.ts` — `export type ShotMoveFamily = 'static' | 'dolly' | 'pan_tilt' | 'track' | 'crane' | 'orbit' | 'special'`：**族 id 的权威闭集**。
- `packages/shared/src/data/shot-library-seeds.ts` / `docs/nx9-shot-seeds-neutral.json` — 117 条种子的 `moveFamily` 分布，可反查哪些族真的在用。
- `apps/web/src/panels/asset-library/modal/AssetLibraryStatusRail.tsx` / `AssetDetailFields.tsx` — 真实消费点 `fam.id` / `fam.label`。
- `packages/shared/src/data/camera-move-library.ts` — 运镜族中英标签的写法参照（游标不同：镜头库族 ≠ 词典族）。

**3. `creative-asset-presets.ts`**
- `packages/shared/src/utils/creative-asset-factory.ts`、`.../creative-asset-prompts.ts` — **直连消费方**（`../data/creative-asset-presets`），只用到 `defaultCharacterVariants` / `mergeVariantSlots` / `CAC_COSTUME_VARIANT_PRESETS`。
- `packages/shared/src/types/creative-asset-center.ts` — `CreativeVariantEntry` 形状 + `DEFAULT_SCENE_VARIANTS` / `DEFAULT_PROP_VARIANTS`（同族默认槽的既有写法）。
- `packages/shared/src/data/pose-presets.ts` — 同目录既有预设文件风格参照。
- `docs/NX9-DORMANT-PRESET-ENTRYPOINTS.md` — 说明哪种预设是词表、哪种是提示词片段。

**4. `character-face-rig-presets.ts`**
- `packages/shared/src/utils/character-face-rig.ts` — **直连消费方**，`FACE_RIG_*` / `FaceRigParamDef` 的全部用法（字段与语义可逐条反推）。
- `apps/web/src/engine/__tests__/character-face-rig.test.ts` — **契约钉子**：`FACE_RIG_PARAMS.length === 45`、id 唯一、每项 `low`/`high` 非空、`heightFeel` 与 `shoulderWidth` 的 `driver === 'bone'`。
- `docs/8.12/NX9-CHARACTER-FACE-SCULPT-2026-08-12.md` — 「45 项字典 + `driver`」锚点表。
- `packages/director3d/src/sculpt/sculpt-contract.ts` — `driver`（`morph`/`bone`/`material`/`prompt`）在 3D 侧的实际使用。
- `packages/shared/src/types/creative-asset-center.ts` — `FaceRigGroupId` 闭集（shape/eyes/brows/nose/mouth/surface/body）。
- `apps/web/src/panels/asset-library/CharacterFaceRigSection.tsx` — 真实消费点 `p.quick` / `p.labelZh` / `p.low` / `p.high`、`group.labelZh`、`CHARACTER_FACE_RIG_PRESETS[].id/.label`。

**5. `playbook-definitions.ts`**（消费方最多，21 个文件）
- `packages/shared/src/utils/playbook-readiness.ts` — **直连消费方**；`readinessKey` 的取值由文件末尾 `readinessRegistry` 的键给出。
- `packages/shared/src/schema/convert-def-to-schema.ts` — **直连消费方**；逐字段读取 `id` / `steps` / `shortLabel` / `label` / `optional` / `canvasNodeKinds` / `stepIndex` / `readinessKey`。
- `packages/shared/src/utils/playbook-step-visual.ts`、`.../playbook-episode-progress.ts`、`packages/shared/src/types/workspace.ts` — 其余直连消费方（`PlaybookId` 类型来源）。
- `apps/server/test/f030-acceptance.test.ts` — 验收钉子：`pb-viral-short` 必须存在且含 `id: 'smart-edit'` 步骤、`kind: 'clip-editor'`、注释含 `F-030`。
- `docs/NX9-AI-SHORT-FILM-WORKFLOW-GAP-ANALYSIS.md` — `pb-ai-short-film` 等 id 的产品来源。

**6. `camera-presets.ts`**
- `apps/server/test/f018-acceptance.test.ts` — 验收钉子：`length >= 6`；每项 `id`/`label`/`position[3]`/`target[3]`/`fov`；label 必含「过肩」「低机位」「特写」「全景」「荷兰角」；`lookupCameraPreset('dutch').label === '荷兰角'`；未知 id 返回 `undefined`。
- `packages/director3d/src/ui/CameraPresetBar.tsx` — director3d 内**同源内联副本**（注释写明「与 @nx9/shared CAMERA_PRESETS 对齐」），8 条 `id/name/position/target/fov` 可直接对齐。
- `packages/shared/src/data/camera-move-library.ts` — `LEGACY_CAMERA_PRESET_TO_MOVE` / `cameraMoveFromLegacyPresetId`：旧机位预设 id 的合法集合。

**7. `shot-lexicon-taxonomy.ts`**
- `docs/nx9-shot-seeds-neutral.json`（209 KB，117 条）— **权威来源**：`systemId` / `system` / `category` 三元组可直接推出体系表与各体系分类表。
- `packages/shared/src/data/shot-library-seeds.ts` — 同一份数据已入库的 TS 版本。
- `packages/shared/src/types/creative-asset-center.ts` — `lexiconSystemId` 注释（`system1` 实拍 / `system2` AI·CG）、`lexiconSystem` 全称、`lexiconCategory` 形如「基础推拉变焦运镜」。
- `apps/web/src/panels/asset-library/AssetDetailFields.tsx`、`.../modal/use-asset-library-catalog.ts` — 真实消费点（含 `listShotLexiconCategories('all')` 分支）。

**8. `provider-registry.ts`**
- `apps/web/src/engine/__tests__/video-edit-provider-registry.test.ts` — **契约钉子**：`supportsFrameTracking: boolean`、`inputKeys.video` / `.prompt` 非空、`inputKeys.maskVideo` 存在、未知 id 必须回落到已注册供应商、`VIDEO_TRACE_PROVIDERS[].inputKeys.mask` 非空。
- `apps/web/src/engine/__tests__/se-deep-honesty.test.ts` — 源码门禁：文件文本必须含 `supportsFrameTracking: boolean`、`supportsFrameTracking: true`、`maskVideo`、`fal-ai/sam2/video`、`id: 'wan-vace'`。
- `packages/shared/src/types/settings.ts` — `BUILTIN_CONNECTION_PRESETS`（provider/baseUrl/model 既有真源）+ `ModelConnection.kind` 闭集。
- `packages/shared/src/data/gen-models.ts` / `video-gen-models.ts` / `audio-models.ts` — `DEFAULT_PICTURE_MODEL` / `DEFAULT_VIDEO_MODEL` / `DEFAULT_TTS_MODEL` 的取值来源。
- `apps/web/src/hooks/use-auto-configure.ts`、`apps/server/src/modules/montage/video-edit.service.ts` — 真实消费点。
- `docs/8.12/NX9-SMART-EDIT-OPEN-LOOPS-IMPLEMENTATION-LOG-2026-08-12.md` — 记录「仍只有 `wan-vace`；没有选型依据，不能臆造第二家模型」。

---

## 3. 三步恢复流程

### 第 1 步：取回文件（**不要现写**）

从下列任一来源取回 8 个文件的**原始内容**：

1. 作者备份 / 另一台开发机的同一工作树；
2. 交付包 / 离线归档（dist 里没有，已核实；但完整工作副本里有）；
3. 编辑器本地历史 / 回收站（若还在）。

取回后**逐文件校验导出名**是否覆盖 §2 表格（可让体检工具告诉你缺谁）。

### 第 2 步：放进仓库

```
packages/shared/src/data/
  emotion-presets.ts
  shot-move-families.ts
  creative-asset-presets.ts
  character-face-rig-presets.ts
  playbook-definitions.ts
  camera-presets.ts
  shot-lexicon-taxonomy.ts
  provider-registry.ts
```

- 文件名必须与 barrel 的 specifier 一致；
- **不要改** `packages/shared/src/index.ts`（已有的 8 条 import 是正确目标）；
- 顺手把同目录下那批「未被 git 登记」的文件一并 `git add`（见 §4）。

### 第 3 步：验证

```bash
# ① 体检工具自检（有缺失即 exit 1）
node scripts/nx9-missing-modules-doctor.mjs --strict
#   期望：结论行变成「barrel 引用的相对模块**全部存在**，无缺失。」+ exit 0

# ② 机器可读核对（缺失模块数应为 0）
node scripts/nx9-missing-modules-doctor.mjs --json

# ③ shared 包构建（恢复前第一步就失败）
pnpm --filter @nx9/shared build
#   期望：exit 0

# ④ 全量单测（恢复前 84 个文件加载期失败 → 期望降到 0）
pnpm --filter @nx9/web exec vitest run
#   期望：failed 文件数 = 0

# ⑤ 体检工具自身的单测
pnpm --filter @nx9/web exec vitest run src/engine/__tests__/missing-modules-doctor.test.ts
#   注意：⑤ 在恢复后会**红 1 个用例**，这是预期行为 —— 见下。
```

> **关于 ⑤ 的诚实说明**：`missing-modules-doctor.test.ts` 里有一组「当前事实」用例**故意钉住
> 『恰好 8 个缺失模块』**（`totals.missingModuleCount === 8`、8 个 slug、61 个导出名）。
> 恢复完成后这一组会失败——这正是它的价值：它证明「恢复确实改变了事实」。
> 恢复者应当**把这组断言改成 `missingModuleCount === 0` 并保留**（不要删测试），
> 让体检从「缺失清单」切换成「回归哨兵」。

**恢复前后的全量基线（本会话实测，供对照）**

| 指标 | 恢复前（改动前实测） | 本次交付后（实测） | 恢复后（目标值） |
| --- | --- | --- | --- |
| vitest 文件总数 | **161** | 162（+1：本次新增体检单测） | 162 |
| 失败文件数 | **84** | **84** | **0** |
| 通过文件数 | 77 | 78 | 162 |
| 用例失败数 | 2（`DirectorDeskBlock` / `ScriptDeskBlock` 渲染；加载期失败的连带） | 2（同一对） | 0 |
| 通过用例数 | 969 | 1000（+31：本次新增） | — |
| 错误签名 | `Failed to resolve import "./data/emotion-presets" from "../../packages/shared/src/index.ts". Does the file exist?` | 完全一致 | 无 |
| vitest exit code | 1 | 1 | 0 |

**前后失败文件集合 diff = 空集**（无新增失败、无转绿），失败用例与错误签名逐条一致 → **零回归**。

---

## 4. 旁支问题：barrel 依赖里「已在磁盘、但未被 git 登记」的文件

同一份体检报告还列出 **20 个 barrel 依赖文件在磁盘上存在、但 `git ls-files` 无记录**——
本地能构建，**新克隆会缺**：

```
packages/shared/src/data/audio-models.ts
packages/shared/src/data/camera-move-library.ts
packages/shared/src/data/llm-models.ts
packages/shared/src/data/model-catalog.ts
packages/shared/src/data/shot-library-seeds.ts
packages/shared/src/data/video-gen-models.ts
packages/shared/src/types/camera-move-timeline.ts
packages/shared/src/types/character-sheet.ts
packages/shared/src/types/multi-grid.ts
packages/shared/src/utils/beat-grid-plan.ts
packages/shared/src/utils/blocking-layout.ts
packages/shared/src/utils/camera-move-merge.ts
packages/shared/src/utils/camera-move-parse.ts
packages/shared/src/utils/camera-move-timeline.ts
packages/shared/src/utils/capability-selfcheck.ts
packages/shared/src/utils/character-sheet-plan.ts
packages/shared/src/utils/consistency-report.ts
packages/shared/src/utils/multi-grid-plan.ts
packages/shared/src/utils/multi-grid-to-shots.ts
packages/shared/src/utils/preset-entrypoints.ts
```

**成因分两类，工具不替你做判断，但证据是分开的**：

- `data/` 下的 **6 个**：旧 `.gitignore` 的 `data/` 规则会静默忽略它们（§1.2(b) 已复现）→
  在那个规则生效期间，`git add` 会被忽略规则挡下，因此从未入库；
- 其余 **14 个**不在 `data/` 下，不受该规则影响，更可能就是「还没 `git add`」的未提交新文件。

> ⚠️ **只恢复 8 个文件并不能让"新克隆"跑起来**：还要把这 6 个（至少 6 个 `data/` 下的）
> 一并纳入版本控制，否则下一台机器上 barrel 依旧会因为 `./data/audio-models` 等 6 条 import 失败。
> 这正是把这一段放进恢复指引的原因。

复现命令：

```bash
git status --short -- packages/shared/src/data/
git ls-files -- packages/shared/src/data/        # 只有 13 个
```

---

## 5. 为什么我不能代为恢复

1. **项目硬约束**：`约束开发要求.md` 禁止臆猜业务数据集。这 8 个模块全是**业务数据/契约**
   （117 条镜头种子的体系与分类、45 项捏脸参数字典与中英修饰词、33 条 playbook 的步骤与就绪键、
   机位预设的坐标与焦距、供应商注册表……），猜出来的东西能过类型检查却会**污染产品语义**。
2. **没有权威副本**：§1 已核实——git 全历史（含 `origin/main`）、`dist`、本仓库其它目录都不存在这些文件。
   仅凭 barrel 的导出名与消费点用法，能确定**接口形状**，但**确定不了取值**。
   （例如 `SHOT_MOVE_FAMILIES` 能推出 7 个族 id，但「每族的中文标签到底是什么」只有原始文件说了算。）
3. **本任务明确禁止**：不得创建/修改这 8 个路径 + `shot-library-seeds.ts`，不得改 barrel 指向它们的 import。
   本次交付因此严格限定为「**体检 + 指路**」：给清单、给线索路径、给验证命令，内容由仓库所有者取回。

**仓库内权威线索能帮你核对到什么程度**（都能在工作树里直接读到，不是我的推测）：

| 模块 | 线索能确定 | 线索**不能**确定 |
| --- | --- | --- |
| `shot-move-families` | 7 个族 id 的闭集；标签写法风格 | 每个族的中文 label 原文 |
| `shot-lexicon-taxonomy` | 体系 id（`system1`/`system2`…）、体系全称、分类名全集（种子 JSON 里逐条都有） | `shortenShotLexiconCategory` 的缩写规则（需看原实现） |
| `camera-presets` | 至少 6 条、8 条同源内联副本的 id/坐标/fov、5 个必含 label | 其余预设是否存在 |
| `character-face-rig-presets` | 恰好 45 项、id 唯一、每项 low/high 非空、`driver` 语义 | 45 个 id 与中英修饰词的完整清单 |
| `provider-registry` | `wan-vace` 单供应商、位字段名、默认模型取值来源 | 第二供应商（文档明写「不能臆造」） |
| `emotion-presets` | 字段名（`id`/`label`/`promptEn`） | 预设条目本身 |
| `creative-asset-presets` | 用到哪几个导出、`CreativeVariantEntry` 形状 | 各词表的具体取值 |
| `playbook-definitions` | `PlaybookStepDef` 全部字段名、`readinessKey` 合法取值范围、`pb-viral-short` 必须含 `smart-edit` | 各 playbook 的步骤编排原文 |

---

## 6. 恢复后自检

### 6.1 体检工具

```bash
node scripts/nx9-missing-modules-doctor.mjs           # 人类可读：结论行应为「全部存在」
node scripts/nx9-missing-modules-doctor.mjs --strict  # exit 0
node scripts/nx9-missing-modules-doctor.mjs --json    # totals.missingModuleCount === 0
```

**预期变化**：

| 字段 | 恢复前 | 恢复后 |
| --- | --- | --- |
| `totals.missingModuleCount` | 8 | 0 |
| `totals.moduleCount` | 8 | 0（模块全部存在 → 不再进入缺失清单） |
| `index.missingSpecifiers` | 8 条 | `[]` |
| `totals.untrackedExistingCount` | 20 | 取决于是否 `git add`；仍 >0 说明还有未入库依赖 |

### 6.2 上一批的「能力自检」配合核对

本会话之前的增量已经落了两件**不依赖 barrel** 的能力自检产物，恢复后可与本次工具交叉核对：

```bash
# 纯函数 + 浏览器取数壳层（59 例；相对路径直取源码，不依赖 barrel）
pnpm --filter @nx9/web exec vitest run src/engine/__tests__/capability-selfcheck.test.ts \
  src/engine/__tests__/capability-selfcheck-shell.test.tsx
```

- `packages/shared/src/utils/capability-selfcheck.ts`（纯函数）与 `apps/web/src/engine/capability-selfcheck.ts`（取数壳层）；
- 其结论表见 `docs/NX9-CAPABILITY-GUIDE.md` 第 6 节——那里明确写了「**不检查模块解析**，
  barrel 的 8 个缺失模块**不在自检范围内，必须人工核对**」。
- **分工**：能力自检回答「节点/模板/接线是否自洽」；**本次体检工具回答「barrel 能不能解析」**。
  两者互补，恢复后应**同时**绿：
  1. `nx9-missing-modules-doctor --strict` → exit 0（模块齐了）；
  2. `capability-selfcheck.test.ts` + shell → 全绿（接线没被恢复动作破坏）；
  3. `pnpm --filter @nx9/shared build` → exit 0（类型层面真的对得上）。

### 6.3 别忘了这两件（很容易漏）

1. **把这 8 个文件连同 §4 的未登记依赖一起 `git add` 并提交**——否则下一个人克隆时完全重演同一个故障。
   可以顺手加一条提交前校验：`node scripts/nx9-missing-modules-doctor.mjs --strict`。
2. **把 `missing-modules-doctor.test.ts` 里那组「当前事实 = 恰好 8 个缺失」断言改成 `0`**
   （见 §3 第 3 步的说明），让体检从「缺失清单」切换成「回归哨兵」。

---

## 7. 本次交付物（体检工具 + 指引 + 单测）实测结果

### 7.1 工具输出摘要（真实运行，当前工作树）

```
$ node scripts/nx9-missing-modules-doctor.mjs
NX9 缺失模块体检报告（静态分析；未加载 barrel）
barrel: packages/shared/src/index.ts（绑定块 192 个，其中相对引用 160 个）
参与扫描的源文件: 1076

结论：barrel 引用了 8 个**不存在的模块** → @nx9/shared 整体不可解析。
...
── 总览 ──
缺失模块: 8 / 8
必需导出合计: 61（value 47 / type 14）
消费方合计: 95 处，覆盖 42 个文件
无消费方（仅 barrel）的模块: 无
线索合计: 49 条，其中路径不存在的 0 条

── 旁支：barrel 依赖里「已在磁盘、但未被 git 登记」的 20 个文件 ──
（本地能构建；但新克隆会缺这些文件。`git ls-files` 无记录，请一并 `git add`。）
  - packages/shared/src/data/audio-models.ts   ← ./data/audio-models
  ...
```

`DOCTOR_EXIT=0`（默认报告模式不判失败）；`--strict` 在当前状态下 `exit 1`。

### 7.2 单测

```bash
$ cd apps/web && node_modules/.bin/vitest run src/engine/__tests__/missing-modules-doctor.test.ts
 ✓ src/engine/__tests__/missing-modules-doctor.test.ts (31 tests) 153ms
 Test Files  1 passed (1)
      Tests  31 passed (31)
EXIT=0
```

覆盖：绑定解析的 value/type 区分（整块 `export type` / 整块 `export` / 混排 `{ X, type Y }` / 别名 / 多行块与行号）、
specifier 解析（`.js`→`.ts` 回退、包名入口表、未知包不误报、候选优先级）、
消费方归属（barrel vs 直连、未导出的名字不计入、barrel 自身不算消费方）、
缺文件如实标记（`unreadableFiles` + 备注）、`fileExists` 恒 false 的诚实边界、
同名导出重复、空/脏输入不抛异常、`--json` 结构稳定 + 确定性（两次运行逐字节一致、无时间戳）、
`formatReport` 渲染，以及**真实 barrel 的现状钉子**（8 个模块 / 61 个导出 / 42 个消费方文件 / 49 条线索路径全在）。

### 7.3 反向对照（证明单测有牙）

把 6 条**故意写错的断言**写成临时 mutant 测试（缺失数写 7、`EmotionPreset` 当 value、消费方写 0、
报告含「全部存在」、未登记数写 0、模块路径写 `utils/`），实测：

```
$ cd apps/web && node_modules/.bin/vitest run src/engine/__tests__/missing-modules-doctor.mutant.test.ts
 FAIL  src/engine/__tests__/missing-modules-doctor.mutant.test.ts > 反向对照 mutant（这些断言必须失败） > M1…M6
 Tests  6 failed (6)
MUTANT_EXIT=1
```

| mutant | 故意写错 | 实测 |
| --- | --- | --- |
| M1 | `missingModuleCount === 7` | 失败（实际 8） |
| M2 | `EmotionPreset` 是 value | 失败（实际 type） |
| M3 | `consumerCount === 0` | 失败（实际 95） |
| M4 | 报告含「全部存在」 | 失败（实际报 8 个缺失） |
| M5 | `untrackedExistingCount === 0` | 失败（实际 20） |
| M6 | 模块路径在 `utils/` | 失败（实际 `data/`） |

6 条错误断言全部失败、exit 1 → 单测确实能抓到「工具算错 / 事实变了」。
（该 mutant 文件是临时对照物，跑完即从工作树移除，不属于交付内容。）

### 7.4 全量回归前后对照

见 §3 第 3 步的基线表：**失败文件数 84、失败用例、错误签名在两轮里完全一致（零回归）**，
失败文件集合 diff 为空集；本轮新增的 1 个测试文件（31 例）全绿且不在失败集合中。

### 7.5 本次**未**做的事（不谎报）

- **没有**创建/修改这 8 个模块 + `shot-library-seeds.ts`，**没有**改 barrel 的既有 import；
- **没有**让 `pnpm --filter @nx9/shared build` 通过（不可能：缺文件）；
- **没有**让全量单测转绿（84 个 barrel 加载期失败依旧存在）；
- **没有**修复 §4 的未登记文件（未改任何现有文件的 git 状态）；
- **没有**做端到端 / 浏览器验证（barrel 坏着，dev 起不来）。
