# NX9 标准 13 步生产管线规范（新手无痛上手 · 可执行版）

> **文档性质**：以用户指定的 **13 步 canonical pipeline** 为 SSOT，逐步对照代码审计「已有 / 简易 / 缺失」，并为缺失项给出 **强制实现方案、测试、Bug 修复、完成定义、可拓展性、使用说明**。  
> **读者**：你（选流程、验收）+ 实现代码的 AI（按 `PIPE-xxx` 任务 ID 施工）。  
> **审计基线**：2026-07-09 · 基于仓库实际代码  
> **实施状态**：**全部完成** — 13 步强制功能 + 6 项可拓展功能均已实现  
> **关联**：`docs/NX9-WORKFLOW-ORCHESTRATION-SPEC.md` · `docs/NX9-CAPABILITY-AUDIT-SPEC.md` · `docs/NX9-PIPELINE-CANVAS-FLOW-SPEC.md`（环境多参考图 · 画布中央步骤条 · 13 步有序模板）· `docs/NX9-PRODUCT-REFACTOR-SPEC.md` · `Product Optimization.md` · `packages/shared/src/data/playbook-definitions.ts`

---

## 0. 如何使用本文档

### 0.1 给你（人类 · 新手）

1. 打开 NX9 → 空画布选 **「AI 漫剧 · 3D」** 或 **「AI 漫剧 · 真人」**（13 步向导）。  
2. 右侧 **NextStepBanner** 永远告诉你 **当前第几步、点哪个按钮**。  
3. 本文 **§4** 是 13 步对照表 — 每步有「你要做什么」一句话。  
4. **§9** 是完整走通剧本（约 45–90 分钟，可分段）。

### 0.2 给 AI（强制）

```text
开工前：
  1. 读 §3 该步「现状评级」+「关键文件」
  2. 只改 §5 PIPE-xxx 列出的文件
  3. 新增 readinessKey 必须注册 playbook-readiness.ts + 单测
  4. 改 playbook-definitions 后同步 §3 完成度表
  5. ST-0 typecheck + TEST-PIPE-xxx PASS 后写 docs/test-reports/

禁止：
  - 跳过缺失步骤标为 ok（如 Environment Bible 只有字符串数组）
  - 13 步 Playbook 与旧 12 步 pb-ai-comic-3d 并存不迁移
  - 新增入口不删旧入口（违反 WF-011 收敛原则）
```

---

## 1. 标准 13 步管线（Canonical Pipeline）

这是你要求的 **端到端 AI 漫剧** 主路径（3D 与真人共用前 9 步，第 6 步 Camera Block 分支不同）：

```text
 ① Script              剧本 / 小说输入 → 结构化剧本
      ↓
 ② Scene Split         按场景/场次切分（场号、内外景、人物）
      ↓
 ③ Storyboard          分镜表 → 故事板镜头列表
      ↓
 ④ Character Bible     角色六层设定 + 参考图 → Backlot
      ↓
 ⑤ Environment Bible   场景/环境设定卡 + 参考图
      ↓
 ⑥ Camera Block        机位/运镜/3D 预演（3D 与真人分支）
      ↓
 ⑦ Keyframe Generate   关键帧 / 线稿 / 静帧生成
      ↓
 ⑧ Keyframe Review     关键帧审阅（批审静帧，非成片）
      ↓
 ⑨ Video Generate      Seedance / clip-gen 视频生成
      ↓
 ⑩ Consistency Repair  连贯性检查 → 修复建议 → 可选重生成
      ↓
 ⑪ Episode Studio      时间线预览 / FFmpeg / Remotion
      ↓
 ⑫ Review Gate          成片审阅门控（批量运行阻塞点）
      ↓
 ⑬ Export               export-pack 交付
```

### 1.1 与现有 Playbook 的关系

| 现有 Playbook ID | 迁移目标 |
|------------------|----------|
| `pb-ai-comic-3d` | 重写为 **13 步** `pb-pipeline-13-3d`（本文 SSOT） |
| `pb-ai-comic-live` | 重写为 **13 步** `pb-pipeline-13-live` |
| `pb-viral-short` | 独立 **7 步** 短路径（§8） |
| 其他 pb-* | 保留为进阶，Launcher 二级入口 |

### 1.2 新手无痛上手三件套（必须同时存在）

| 组件 | 文件 | 作用 |
|------|------|------|
| **PlaybookLauncher** | `PlaybookLauncherOverlay.tsx` | 空画布只选 Playbook，不选 raw Recipe |
| **PlaybookStepBar** | `PlaybookStepBar.tsx` | 顶栏 ①–⑬ 进度（**待迁至画布中央**，见 `NX9-PIPELINE-CANVAS-FLOW-SPEC.md`） |
| **NextStepBanner** | `rail/NextStepBanner.tsx` | 右侧「下一步：[执行]」+ 缺什么说明 |

> **2026-07-10 体验缺口**（`需求.txt`）：环境库仅单张参考图；步骤条在顶栏非画布中央且无 `!`；13 步启动 merge 三配方导致节点重复/断链。修复 SSOT → **`docs/NX9-PIPELINE-CANVAS-FLOW-SPEC.md`**（`PIPE-UX-xxx`）。

---

## 2. 总览仪表盘

### 2.1 十三步成熟度（2026-07-09 代码审计 · 已实现）

| 步 | 名称 | 状态 | 完成 % | 备注 |
|----|------|------|--------|------|
| ① | Script | **ok** | 100% | ScriptPlan v2 + 保存并继续 CTA + Banner 显示字数 |
| ② | Scene Split | **ok** | 100% | SceneSplit 类型/API/UI/readiness + group=sceneCode 注入 |
| ③ | Storyboard | **ok** | 100% | sceneId/sceneCode + 分组折叠 + materialize 写入 |
| ④ | Character Bible | **ok** | 100% | extractAssets bible 六层 + 面板/状态/三视图 + readiness |
| ⑤ | Environment Bible | **ok** | 100% | 类型/持久化/API/UI + 环境 prompt 注入 + HDRI/mesh |
| ⑥ | Camera Block | **ok** | 100% | 3D/真人分支 + spawnCameraBlocks + Director3D JSON 写回 |
| ⑦ | Keyframe Generate | **ok** | 100% | run_batch + firstFrameAssetId img2img + readiness |
| ⑧ | Keyframe Review | **ok** | 100% | keyframeStatus/videoStatus 双阶段 + approve 不写 videoStatus |
| ⑨ | Video Generate | **ok** | 100% | all_keyframes_approved 前置 + 写回 videoAssetId+videoStatus |
| ⑩ | Consistency Repair | **ok** | 100% | 类型/spawn/Banner issues 列表 + 跳转/重生成按钮 |
| ⑪ | Episode Studio | **ok** | 100% | validateRemotionTimeline + CTA「回到步骤⑨」 |
| ⑫ | Review Gate | **ok** | 100% | validateReviewGate 用 videoStatus |
| ⑬ | Export | **ok** | 100% | focus export-pack + export_ready + 庆祝页 |

**13 步加权完成度**：**100%** — 全部 P0/P1/P2 + 可拓展功能已实现。

### 2.2 架构图（13 步数据流）

```mermaid
flowchart TB
  subgraph PreProduction["①–⑤ 前期"]
    SC[ScriptPlanPayload]
    SS[SceneSplitRecord[]]
    STB[StoryboardShot[]]
    CHR[CharacterLibrary]
    ENV[EnvironmentLibrary]
  end

  subgraph Production["⑥–⑩ 生产"]
    CAM[Camera Block 3D/Live]
    KF[firstFrameAssetId]
    KFR[keyframeApprovedAt]
    VID[videoAssetId]
    CON[continuity-check]
  end

  subgraph Post["⑪–⑬ 后期"]
    EP[Timeline v2]
    RG[review-gate]
    XP[export-pack]
  end

  SC --> SS --> STB
  SC --> CHR
  SS --> ENV
  STB --> CAM --> KF --> KFR --> VID --> CON --> EP --> RG --> XP
  CHR --> KF
  ENV --> KF
```

---

## 3. 逐步详解（现状 · 缺口 · 实现 · 测试 · 用法）

---

### ① Script · 剧本输入

| 项 | 内容 |
|----|------|
| **现状评级** | partial · 75% |
| **关键文件** | `ScriptStudioPanel.tsx` · `agent.service.ts` (`scriptSkeleton` / `screenplay` / `storyboardTable`) · `types/script-plan.ts` |
| **已有** | 5 步编剧台；API 骨架/改编/剧本/导演计划/分镜表；`ScriptPlanPayload.sourceText` 持久化 |
| **简易逻辑** | adaptation/screenplay/director-plan **无完整 UI**（仅 skeleton + table 常用）；Playbook 步 ① 与 Studio 5 步 **未对齐** |
| **缺口** | 无「粘贴即保存 sourceText 到 workspace」；完成 ① 后不会自动进入 ② |

**强制实现 · PIPE-101**

```typescript
// packages/shared/src/types/script-plan.ts — 扩展
export interface ScriptPlanPayload {
  version: 2;  // 迁移 v1→v2
  sourceText?: string;
  screenplayMd?: string;      // 完整剧本 Markdown
  directorPlanMd?: string;
  skeleton?: StorySkeleton | null;
  adaptation?: AdaptationStrategy | null;
  storyboardTable: StoryboardTableRow[];
  activeEpisode?: string | null;
  /** ② Scene Split 产物 */
  scenes?: SceneSplitRecord[];
}
```

| 文件 | 改动 |
|------|------|
| `ScriptStudioPanel.tsx` | 步 ① CTA「保存并进入场次拆分」→ 写 `scriptPlan` + `advancePlaybookStep` |
| `workspace-document.ts` | `setScriptPlan()` merge 持久化 |
| `playbook-definitions.ts` | 13 步 playbook 步 ① `readinessKey: has_source_text` |

**测试**：TEST-PIPE-101 — sourceText 写入 workspace 往返不丢  
**Bug**：Script Studio 完成后 dead-end → PIPE-101 CTA 修复  
**完成定义**：Playbook 步 ① Banner 显示「已保存 X 字」且可 advance  
**可拓展**：导入 Fountain / Final Draft  
**怎么用**：Rail › script › 粘贴文本 › **保存并继续**

---

### ② Scene Split · 场次拆分

| 项 | 内容 |
|----|------|
| **现状评级** | **missing · 15%** |
| **关键文件** | `utils/script-import.ts`（`parseChineseScript` 规则解析）· `agent.service.ts`（无 scene-split API） |
| **已有** | 规则引擎：`ParsedScriptScene`（集/场号/内外景/地点/人物）；`scenesToStoryboardShots` 可粗转镜头 |
| **缺口** | **无 LLM 场次拆分 API**；无 `SceneSplitRecord` 类型；无 UI；Playbook 无此步；`StoryboardTableRow.group` 未与场景绑定 |

**强制实现 · PIPE-201 ~ PIPE-204**

**PIPE-201 · 类型 SSOT**

```typescript
// packages/shared/src/types/scene-split.ts（新建）
export interface SceneSplitRecord {
  id: string;
  sceneCode: string;       // 如 "1-3"
  episode: number;
  location: string;
  interior: '内' | '外';
  timeOfDay: string;
  characters: string[];
  summary: string;         // 本场摘要
  beatCount?: number;
}

export interface SceneSplitPayload {
  version: 1;
  scenes: SceneSplitRecord[];
  sourceHash?: string;
}
```

**PIPE-202 · API**

```typescript
// POST /api/agent/scene-split
// Body: { sourceText: string, mode?: 'llm' | 'rule' }
// Response: { ok: true, scenes: SceneSplitRecord[] }

// agent.service.ts
async sceneSplit(sourceText: string, mode = 'llm') {
  if (mode === 'rule') {
    const { scenes } = parseChineseScript(sourceText);
    return { ok: true, scenes: scenes.map(toSceneSplitRecord) };
  }
  // LLM: 输出 JSON 数组，字段同 SceneSplitRecord
}
```

**PIPE-203 · UI — `SceneSplitPanel.tsx`（嵌入 Script Studio 或独立 Rail 子 Tab）**

- 表格列：场号 | 地点 | 内/外 | 日/夜 | 人物 | 摘要  
- 按钮：**AI 拆分** · **规则拆分（中文剧本）** · **确认并生成分镜表**  
- 确认后：调用 `storyboardTable` 时注入 `group=sceneCode` per scene context

**PIPE-204 · Playbook 步 ②**

```typescript
{
  id: 'scene-split',
  label: '场次拆分',
  readinessKey: 'has_scene_split',
  primaryAction: { type: 'open_rail', tab: 'script', sub: 'scene-split' },
  verifyHint: 'scriptPlan.scenes.length >= 1',
}
```

**readinessKey 注册**：

```typescript
export function has_scene_split(ctx: PlaybookReadinessContext): boolean {
  return (ctx.scriptPlan?.scenes?.length ?? 0) >= 1;
}
```

**测试**：TEST-PIPE-201~203 · fixtures `FIXTURE_SCENE_SPLIT_3`  
**完成定义**：新手粘贴剧本 → 点 AI 拆分 → 看到 ≥1 场 → Banner 进 ③  
**可拓展**：按集过滤；场与 Environment Bible 一键创建  
**怎么用**：步 ② Banner **[AI 拆分场次]** → 检查表格 → **[确认]**

---

### ③ Storyboard · 分镜 / 故事板

| 项 | 内容 |
|----|------|
| **现状评级** | ok · 85% |
| **关键文件** | `StoryboardPanel.tsx` · `StoryboardRailPanel.tsx` · `agent.materializeShots` · `shot-script` |
| **已有** | 分镜表 API + materialize；故事板 CRUD；网格批审；线稿字段 `firstFrameAssetId` |
| **缺口** | `StoryboardShot` **无 `sceneId`**；无法按场分组显示；③ 与 ② 未联动 |

**强制实现 · PIPE-301**

```typescript
// packages/shared/src/types/storyboard.ts
export interface StoryboardShot {
  // ...existing
  sceneId?: string | null;   // 关联 SceneSplitRecord.id
  sceneCode?: string | null; // 显示用 "1-3"
}
```

| 文件 | 改动 |
|------|------|
| `agent.service.ts` `materializeShots` | 从 tableRow.group 写 sceneCode |
| `StoryboardRailPanel.tsx` | 按 sceneCode 分组折叠 |
| `playbook-readiness.ts` | `has_storyboard_shots` 保持 |

**测试**：TEST-PIPE-301 materialize 后 sceneCode 非空  
**完成定义**：故事板可按场浏览；≥3 镜  
**怎么用**：步 ③ **[生成分镜表]** → **[写入故事板]**

---

### ④ Character Bible · 角色设定

| 项 | 内容 |
|----|------|
| **现状评级** | partial · 70% |
| **关键文件** | `CharacterSheetBlock.tsx` · `types/character.ts` (`CharacterBible` 六层) · `extractAssets` API |
| **已有** | 六层锚点 UI；`enrichPromptWithCharacters`；Script Studio extract → Backlot |
| **缺口** | 非 Playbook 强制步；extract 不填 `bible` 六层；shot `characterIds` 多选不完整；无批量「出三视图」 |

**强制实现 · PIPE-401 ~ PIPE-403**

**PIPE-401 · extractAssets 扩展**

```typescript
// LLM 输出扩展 bible 六层
{"characters":[{"name":"…","bible":{"identity":"…","appearance":"…",…}}]}
```

**PIPE-402 · Playbook 步 ④ UI — `CharacterBibleStepPanel.tsx`**

- 列表：剧本角色 → 状态（未设定 / 已保存 / 已有参考图）  
- CTA：**从剧本提取** · **打开 character-sheet** · **生成三视图**（merge `tpl-character-turnaround`）

**PIPE-403 · readiness**

```typescript
has_character_bibles(ctx): 主要角色（出现在 ≥2 场）均有 bible.appearance 或 referenceImageUrl
```

**测试**：TEST-PIPE-401 extract 返回 bible 字段  
**完成定义**：≥1 主角有参考图 + consistencyPrompt  
**怎么用**：步 ④ 逐角色点 **设定** → 保存到 Backlot → 勾 **完成本步**

---

### ⑤ Environment Bible · 环境设定

| 项 | 内容 |
|----|------|
| **现状评级** | **partial · 35%**（接近 missing） |
| **关键文件** | `SceneCardBlock.tsx` · `scene-card-prompt.ts` · `extractAssets`（仅 `locations: string[]`） |
| **已有** | scene-card 节点（场景名/描述/光线/道具/参考图）；`compileScenePrompt` |
| **缺口** | **无 EnvironmentLibrary 工作区类型**；locations 只是字符串；scene-card 未绑 shot/sceneId；无 Playbook 步 |

**强制实现 · PIPE-501 ~ PIPE-505**

**PIPE-501 · 类型**

```typescript
// packages/shared/src/types/environment.ts（新建）
export interface EnvironmentProfile {
  id: string;
  sceneCode?: string;      // 关联 SceneSplitRecord
  name: string;
  descriptionZh: string;
  consistencyPrompt?: string;
  era?: string;
  lighting?: string;
  props?: string[];
  referenceImageUrl?: string | null;
}

export interface EnvironmentLibraryPayload {
  version: 1;
  environments: EnvironmentProfile[];
}
```

**PIPE-502 · workspace 持久化**

```typescript
// WorkspacePayloadV3
environments?: EnvironmentLibraryPayload;
```

**PIPE-503 · API `POST /api/agent/extract-environments`**

- 输入：`sourceText` 或 `scenes: SceneSplitRecord[]`  
- 输出：`EnvironmentProfile[]`（每场一条，含 lighting/props）

**PIPE-504 · UI `EnvironmentBiblePanel.tsx`**

- Rail › library 子 Tab **环境** 或 Script Studio 步 ⑤  
- 每场一行：编辑 | 上传参考图 | 编译 prompt 预览  
- CTA：**从场次生成环境卡** · **spawn scene-card 到画布**

**PIPE-505 · 注入生成**

```typescript
// packages/shared/src/utils/environment-prompt.ts（新建）
export function enrichPromptWithEnvironment(base: string, env: EnvironmentProfile): string
```

在 `picture-gen` / `director-desk` runner 读 shot.sceneId → 合并环境 prompt。

**测试**：TEST-PIPE-501~503  
**完成定义**：每个 sceneCode 有 EnvironmentProfile；picture-gen prompt 含环境描述  
**可拓展**：HDRI / 3D 环境 mesh 引用  
**怎么用**：步 ⑤ **[从场次生成]** → 上传参考图 → **完成**

---

### ⑥ Camera Block · 机位 / 运镜

| 项 | 内容 |
|----|------|
| **现状评级** | partial · 65% |
| **关键文件** | `Director3dBlock.tsx` · `DirectorDeskBlock.tsx` · `prompt-studio` (camera) · `blocking-stage` |
| **已有** | 3D 预演面板；导演台单镜首帧；运镜 preset |
| **缺口** | **无统一「Camera Block」步**；3D/真人未分支；不能批量为每镜 spawn 导演台 |

**强制实现 · PIPE-601 ~ PIPE-603**

**PIPE-601 · Playbook 分支**

| Playbook | 步 ⑥ 主路径 |
|----------|-------------|
| `pb-pipeline-13-3d` | `director-3d` + `blocking-stage` |
| `pb-pipeline-13-live` | `director-desk` × N + `prompt-studio` camera |

**PIPE-602 · `spawnCameraBlocksForShots()`**

```typescript
// apps/web/src/engine/camera-block-spawn.ts（新建）
export function spawnCameraBlocksForShots(
  mode: '3d' | 'live',
  shots: StoryboardShot[],
): void {
  // live: 每 approved 线稿镜 spawn director-desk，auto linkedShotId + edge from shot-script
  // 3d: 单 director-3d + 列表选镜
}
```

**PIPE-603 · 写回 shot**

- Director3D 导出相机参数 → `shot.promptEn` / `shot.notes` JSON  
- readiness: `has_camera_blocks` — ≥50% 镜有 linkedBlockId 且 kind 匹配

**测试**：TEST-PIPE-602 spawn 3 镜 → 3 个 director-desk 有 linkedShotId  
**完成定义**：步 ⑥ Banner **[布置机位]** 打开对应面板  
**怎么用**：3D → Director3D 摆机位；真人 → 逐镜关联导演台

---

### ⑦ Keyframe Generate · 关键帧生成

| 项 | 内容 |
|----|------|
| **现状评级** | partial · 72% |
| **关键文件** | `PictureGenBlock.tsx` · `DirectorDeskBlock.tsx` · `story-grid` (line-art) · `flow-runner.ts` |
| **已有** | picture-gen；线稿 grid；director-desk 单镜 API |
| **缺口** | 批量生成未一键；`@角色` 在 batch 可能未生效；线稿与关键帧 **语义混用** |

**强制实现 · PIPE-701**

- Playbook CTA：**批量生成关键帧** → `run_batch` 仅 `picture-gen|director-desk`  
- 优先用 `firstFrameAssetId` 已有线稿作 img2img 参考  
- readiness: `has_keyframes` — ≥80% 镜有 firstFrameAssetId 或节点 done

**测试**：TEST-PIPE-701 batch 3 director-desk  
**完成定义**：故事板缩略图列齐  
**怎么用**：步 ⑦ Composer **[运行本步]**

---

### ⑧ Keyframe Review · 关键帧审阅

| 项 | 内容 |
|----|------|
| **现状评级** | partial · 60% |
| **关键文件** | `StoryboardRailPanel.tsx` · shot.status |
| **已有** | 网格批审；`sketchApprovedAt` 字段（线稿专用） |
| **缺口** | **与步 ⑫ 成片审阅共用 `status: approved`**；无法「关键帧过了但视频未审」 |

**强制实现 · PIPE-801 ~ PIPE-802**

**PIPE-801 · 双阶段审阅字段**

```typescript
// StoryboardShot 扩展
keyframeStatus?: 'draft' | 'review' | 'approved' | 'failed';
videoStatus?: 'draft' | 'review' | 'approved' | 'failed';
// 迁移：现有 status → keyframeStatus; videoStatus 默认 draft
```

**PIPE-802 · Playbook readiness**

```typescript
all_keyframes_approved(ctx): shots.every(s => s.keyframeStatus === 'approved')
```

UI：步 ⑧ 仅批审静帧；网格按钮 **批准关键帧**（不写 videoStatus）。

**测试**：TEST-PIPE-801 迁移 v2→v3 不丢 status  
**完成定义**：⑧ 与 ⑫ 可独立 pass  
**怎么用**：审片模式 → 只看缩略图 → 批量批准关键帧

---

### ⑨ Video Generate · Seedance 视频生成

| 项 | 内容 |
|----|------|
| **现状评级** | ok · 80% |
| **关键文件** | `MotionStoryBlock.tsx` · `clip-gen` · `sclass-compiler.ts` · `flow-runner` motion-story |
| **已有** | S-Class 分组；linkedShotId；clip-chain-runner |
| **缺口** | 需 keyframe 已 approved 才跑；自动 load tpl-sclass-seedance |

**强制实现 · PIPE-901**

- 步 ⑨ 前置检查 `all_keyframes_approved`  
- CTA：**加载 Seedance 链** + **运行 motion-story**  
- 写回 `shot.videoAssetId` + `videoStatus: review`

**测试**：TEST-FD-003 clip-gen mock；TEST-PIPE-901 motion-story 绑单镜  
**完成定义**：≥1 镜有 videoAssetId  
**怎么用**：步 ⑨ **[生成视频]** → 等待 Take 写入

---

### ⑩ Consistency Repair · 连贯性修复

| 项 | 内容 |
|----|------|
| **现状评级** | partial · 45% |
| **关键文件** | `ContinuityCheckBlock.tsx` · `inpaint-edit` |
| **已有** | LLM 多图对比 → issues 列表 |
| **缺口** | **无自动修复循环**；未进 Playbook；issues 不能一键跳转重生成 |

**强制实现 · PIPE-1001 ~ PIPE-1003**

**PIPE-1001 · `consistency-repair.ts`**

```typescript
export interface ConsistencyIssue {
  shotIds: string[];
  category: 'wardrobe' | 'lighting' | 'axis' | 'prop';
  suggestion: string;
  repairAction: 'regenerate-keyframe' | 'inpaint' | 'manual';
}
```

**PIPE-1002 · Playbook 步 ⑩**

- 自动 spawn `continuity-check`  
- issues>0 时 Banner 列出 + **[重生成关键帧]**（focus 对应 director-desk）  
- readiness: `consistency_resolved` — 无 open issues 或用户点 **跳过**

**PIPE-1003 · UI ContinuityCheckBlock 增强**

- 每条 issue → **跳转镜头** · **重生成**

**测试**：TEST-PIPE-1001 mock LLM 返回 2 issues → repair CTA 可见  
**完成定义**：跑完 check 后用户能闭环或显式 skip  
**怎么用**：步 ⑩ 自动跑检查 → 按建议修 → **确认继续**

---

### ⑪ Episode Studio · 成片预览

| 项 | 内容 |
|----|------|
| **现状评级** | partial · 70% |
| **关键文件** | `EpisodeStudioPanel.tsx` · `buildTimelineFromShotsV2` · `@remotion/player` |
| **已有** | Player 预览；FFmpeg 导出；Timeline v2 |
| **缺口** | 视频未齐时时间线空；HF 预览 P1 |

**强制实现 · PIPE-1101**

- readiness: `has_video_takes` — ≥1 镜 videoStatus approved 或有 videoAssetId  
- 步 ⑪ 打开前 `validateRemotionTimeline` — 空则 Banner 提示回 ⑨  
- CTA：**打开 Episode Studio**

**测试**：TEST-RM-001 timeline 构建  
**完成定义**：Player 可播放 ≥1 段  
**怎么用**：步 ⑪ 预览 → 调整顺序（故事板）→ 继续

---

### ⑫ Review Gate · 成片审阅门控

| 项 | 内容 |
|----|------|
| **现状评级** | ok · 85% |
| **关键文件** | `ReviewGateBlock.tsx` · `review-gate-session.ts` · `flow-runner` ReviewGateBlockedError |
| **已有** | 批量运行阻塞；自动切审片+网格 |
| **缺口** | 与 ⑧ 语义混淆；gate 检查的是 shot.status 非 videoStatus |

**强制实现 · PIPE-1201**

```typescript
// review-gate 检查改为 videoStatus === 'approved'
// flow-runner ReviewGateBlockedError pendingShots 过滤 keyframe only
```

**测试**：TEST-FD-004 review-gate blocked；TEST-PIPE-1201 关键帧批过、视频未批 → gate 阻塞  
**完成定义**：全镜 video approved 才过 gate  
**怎么用**：步 ⑫ **[批量运行至 Gate]** → 网格批审视频 Take → **[继续]**

---

### ⑬ Export · 导出交付

| 项 | 内容 |
|----|------|
| **现状评级** | partial · 80% |
| **关键文件** | `ExportPackBlock.tsx` · `montage.service.ts` |
| **已有** | ZIP / ffmpeg-episode / remotion-bundle / hyperframes UI |
| **缺口** | HF/Remotion  bundle 部分 stub |

**强制实现 · PIPE-1301**

- 步 ⑬ focus export-pack；默认 `ffmpeg-episode`  
- readiness: `export_ready` — export-pack done 或 manifest 下载成功

**测试**：TEST-MG-004 concat requireApproved  
**完成定义**：用户下载到 mp4 或 zip  
**怎么用**：选模式 → **导出** → 完成 Playbook 庆祝页

---

## 4. 十三步对照 · 新手一句话指南

| 步 | 你要做什么 | 点哪里 |
|----|-----------|--------|
| ① | 粘贴小说/剧本 | Rail › script › 大文本框 |
| ② | AI 拆成一场一场 | **[AI 拆分场次]** |
| ③ | 生成分镜并写入故事板 | **[生成分镜表]** → **[写入故事板]** |
| ④ | 给每个角色做设定卡 | library › 角色 › character-sheet |
| ⑤ | 给每个场景做环境卡 | library › 环境 |
| ⑥ | 3D 摆机位 **或** 真人关联导演台 | Director3D / 导演台节点 |
| ⑦ | 批量出关键帧图 | Composer **[运行本步]** |
| ⑧ | 批审静帧，不合格退回 ⑦ | 审片模式 › 网格 › **批准关键帧** |
| ⑨ | Seedance 生成视频 | motion-story **[运行]** |
| ⑩ | 看连贯性报告，修问题 | continuity-check 节点 |
| ⑪ | 预览整集时间线 | Episode Studio |
| ⑫ | 批审视频，过审阅门 | review-gate › 网格批审 |
| ⑬ | 下载成片 | export-pack |

---

## 5. 实现任务总表（PIPE-xxx）

### P0 — 新手能走完 13 步（2 周）

| ID | 步 | 任务 | 关键文件 |
|----|-----|------|----------|
| PIPE-201 | ② | SceneSplit 类型 + API | `scene-split.ts` · `agent.service.ts` |
| PIPE-203 | ② | SceneSplitPanel UI | `SceneSplitPanel.tsx` |
| PIPE-204 | ② | readiness has_scene_split | `playbook-readiness.ts` |
| PIPE-501 | ⑤ | EnvironmentProfile 类型 | `environment.ts` |
| PIPE-503 | ⑤ | extract-environments API | `agent.controller.ts` |
| PIPE-504 | ⑤ | EnvironmentBiblePanel | `EnvironmentBiblePanel.tsx` |
| PIPE-801 | ⑧ | keyframeStatus/videoStatus | `storyboard.ts` · migrate |
| PIPE-101 | ① | ScriptPlan v2 + CTA | `script-plan.ts` · `ScriptStudioPanel.tsx` |
| PIPE-301 | ③ | shot.sceneId | `storyboard.ts` · `materializeShots` |
| **PIPE-000** | 全 | 新建 `pb-pipeline-13-3d` / `pb-pipeline-13-live` 13 步定义 | `playbook-definitions.ts` |
| **PIPE-000b** | 全 | 替换 Launcher featured 为 13 步 Playbook | `PlaybookLauncherOverlay.tsx` |

### P1 — 体验完整（2–3 周）

| ID | 步 | 任务 |
|----|-----|------|
| PIPE-401~403 | ④ | Character Bible 强制步 |
| PIPE-601~603 | ⑥ | Camera Block 分支 + 批量 spawn |
| PIPE-701 | ⑦ | 批量关键帧 |
| PIPE-901 | ⑨ | 视频生成门禁 |
| PIPE-1001~1003 | ⑩ | 连贯性修复闭环 |
| PIPE-1201 | ⑫ | review-gate 查 videoStatus |
| PIPE-1101 | ⑪ | Episode 空时间线 CTA |
| PIPE-1301 | ⑬ | export 完成页 |

### P2 —  polish

| ID | 说明 |
|----|------|
| PIPE-1302 | HyperFrames / Remotion bundle 真可用 |
| PIPE-1004 | inpaint 自动修复 |
| PIPE-601b | blocking-stage 与 3D 深度联动 |

---

## 6. Playbook 定义（13 步 · AI 施工 SSOT）

**新建 Playbook ID**（替换原 pb-ai-comic-3d / live 的 steps 数组）：

```typescript
// pb-pipeline-13-3d — steps 摘要（完整放 playbook-definitions.ts）
const STEPS_13_3D: PlaybookStepDef[] = [
  { id: 'script',           label: '① 剧本',       readinessKey: 'has_source_text',        ... },
  { id: 'scene-split',      label: '② 场次',       readinessKey: 'has_scene_split',        ... },
  { id: 'storyboard',       label: '③ 分镜',       readinessKey: 'has_storyboard_shots',   ... },
  { id: 'character-bible',  label: '④ 角色',       readinessKey: 'has_character_bibles',   ... },
  { id: 'environment-bible',label: '⑤ 环境',       readinessKey: 'has_environment_bibles', ... },
  { id: 'camera-3d',        label: '⑥ 3D 机位',    readinessKey: 'has_camera_blocks',      ... },
  { id: 'keyframe-gen',     label: '⑦ 关键帧',     readinessKey: 'has_keyframes',          ... },
  { id: 'keyframe-review',  label: '⑧ 关键帧审阅', readinessKey: 'all_keyframes_approved', ... },
  { id: 'video-gen',        label: '⑨ 视频',       readinessKey: 'has_video_assets',       ... },
  { id: 'consistency',      label: '⑩ 连贯修复',   readinessKey: 'consistency_resolved',   ... },
  { id: 'episode-studio',   label: '⑪ 成片预览',   readinessKey: 'has_video_takes',        ... },
  { id: 'review-gate',      label: '⑫ 审阅门控',   readinessKey: 'all_videos_approved',    ... },
  { id: 'export',           label: '⑬ 导出',       readinessKey: 'export_ready',           ... },
];
```

**bootstrapTemplates（3D）**：

```typescript
bootstrapTemplates: [
  { templateId: 'tpl-shot-script-desk', mode: 'merge' },
  { templateId: 'tpl-3d-preview', mode: 'merge' },
  { templateId: 'tpl-sclass-seedance', mode: 'merge' },
],
```

**真人版步 ⑥ 差异**：

```typescript
{ id: 'camera-live', label: '⑥ 导演台', readinessKey: 'has_camera_blocks',
  primaryAction: { type: 'load_template', templateId: 'tpl-shot-script-desk', mode: 'merge' },
  secondaryActions: [{ type: 'spawn_camera_blocks', mode: 'live' }], // 新 action type
}
```

---

## 7. 3D vs 真人 · 分支对照

| 步 | 3D (`pb-pipeline-13-3d`) | 真人 (`pb-pipeline-13-live`) |
|----|--------------------------|------------------------------|
| ⑥ | director-3d + blocking-stage | director-desk × N + prompt-studio camera |
| ⑦ | 线稿 grid **或** picture-gen 3D 快照 | story-grid 电影感 + picture-gen |
| ⑨ | motion-story S-Class | clip-gen + motion-story |
| ⑤ | 环境卡 + 可选 depth-pass | 环境卡 + reference-board |
| bootstrap | tpl-3d-preview | tpl-toonflow-lite + tpl-reference-picture |

其余步骤 **完全相同**。

---

## 8. 爆款短视频 · 7 步短路径（PB-VIRAL-SHORT）

面向新手「只想出一条 30–60s 竖屏」：

```text
① 素材（链接 或 主题） → ② AI 分镜 → ③ 选竖屏模板
→ ④ clip-gen 生成 → ⑤ 字幕(可选) → ⑥ 快速预览 → ⑦ 导出
```

| 步 | 对应 canonical | 实现 |
|----|----------------|------|
| ① | Script 简化 | QuickMontage 并入 Playbook 步 1 Tab |
| ② | Storyboard | quickMontage / replicateVideo API |
| ③–⑦ | ⑥⑨⑪⑬ 子集 | tpl-link-replicate + tpl-vertical-episode |

**任务 PIPE-8010**：重构 `pb-viral-short` 7 步；删除独立 QuickMontagePanel（WF-012）。

---

## 9. 人工验收剧本

### 9.1 脚本 A — 13 步 3D 最小路径（90 min，可分段）

**假数据**：`apps/server/test/fixtures.ts` → `FIXTURE_NOVEL_500` · `FIXTURE_SCENE_SPLIT_3`

```text
0. 新建工作区 → Launcher「AI 漫剧 · 3D（13 步）」
1. ① 粘贴 FIXTURE_NOVEL_500 → 保存
2. ② AI 拆分 → 确认 ≥3 场
3. ③ 生成分镜表 → 写入故事板 ≥5 镜
4. ④ 提取 1 角色 → character-sheet 保存
5. ⑤ 从场次生成 1 环境卡
6. ⑥ 打开 Director3D 关联镜 #1
7. ⑦ 运行 picture-gen / director-desk 出 1 张关键帧
8. ⑧ 批准关键帧
9. ⑨ motion-story 生成 1 段视频（Mock）
10. ⑩ continuity-check（Mock 0 issues）→ 跳过
11. ⑪ Episode Studio 预览
12. ⑫ review-gate 批审视频
13. ⑬ export-pack ffmpeg 下载

PASS: 全程 NextStepBanner 无 dead-end；刷新后步骤保留
FAIL: 任一步 Banner 无 CTA 或 readiness 误判
```

### 9.2 脚本 B — 爆款 7 步（20 min）

```text
1. Launcher「爆款短视频」
2. 主题「夏日饮品」→ 分镜导入
3. clip-gen 竖屏 1 段 → export

PASS: 无 WorkflowTemplates 顶栏入口
```

---

## 10. 测试要求

### 10.1 假数据（扩展 fixtures.ts）

```typescript
export const FIXTURE_NOVEL_500 = `《测试剧》大纲：…（500字）…`;

export const FIXTURE_SCENE_SPLIT_3: SceneSplitRecord[] = [
  { id: 'sc-1', sceneCode: '1-1', episode: 1, location: '咖啡厅', interior: '内', timeOfDay: '日', characters: ['小明'], summary: '相遇' },
  { id: 'sc-2', sceneCode: '1-2', episode: 1, location: '街道', interior: '外', timeOfDay: '夜', characters: ['小明','小红'], summary: '追逐' },
  { id: 'sc-3', sceneCode: '1-3', episode: 1, location: '屋顶', interior: '外', timeOfDay: '夜', characters: ['小明'], summary: '告白' },
];

export const FIXTURE_ENV_PROFILE: EnvironmentProfile = {
  id: 'env-1', sceneCode: '1-1', name: '咖啡厅', descriptionZh: '复古木质装修',
  lighting: '暖色窗光', props: ['咖啡杯','笔记本'],
};
```

### 10.2 TEST-PIPE 清单

| TEST ID | 断言 |
|---------|------|
| TEST-PIPE-101 | scriptPlan v2 往返 |
| TEST-PIPE-201 | scene-split API rule mode 返回 ≥1 scene |
| TEST-PIPE-202 | scene-split API llm mock 返回 JSON |
| TEST-PIPE-301 | materializeShots 写 sceneCode |
| TEST-PIPE-401 | extractAssets bible 字段 |
| TEST-PIPE-501 | environment library upsert |
| TEST-PIPE-601 | spawnCameraBlocks live ×3 |
| TEST-PIPE-801 | keyframeStatus 迁移 |
| TEST-PIPE-901 | all_keyframes_approved 门禁 |
| TEST-PIPE-1001 | continuity issues → repair action |
| TEST-PIPE-1201 | review-gate 用 videoStatus |
| TEST-PIPE-000 | resolveNextStep 13 步 playbook 第一步 script |

### 10.3 AI 自测门禁

```text
ST-0: npm run build -w @nx9/shared && npm run typecheck -w @nx9/web
ST-1: vitest apps/server/test/test-pipe.test.ts
ST-2: vitest packages/shared — playbook-readiness 新 keys
报告: docs/test-reports/TEST-PIPE-RUN-{timestamp}.md
```

---

## 11. Bug 修复规范

| Bug ID | 描述 | 修复任务 |
|--------|------|----------|
| BUG-PIPE-001 | 无 Scene Split，② 步跳过导致分镜缺场 | PIPE-201~204 |
| BUG-PIPE-002 | Environment 仅 string[] | PIPE-501~505 |
| BUG-PIPE-003 | 关键帧与成片审阅共用 status | PIPE-801 |
| BUG-PIPE-004 | review-gate 在 keyframe 阶段误阻塞 | PIPE-1201 |
| BUG-PIPE-005 | startProduction 不连边 | WF-010（ORCHESTRATION） |
| BUG-PIPE-006 | extractAssets 不返回 bible 六层 | PIPE-401 |
| BUG-PIPE-007 | continuity 有问题无法跳转镜头 | PIPE-1003 |

---

## 12. 完成定义（13 步管线整体）

| # | 标准 | 当前 |
|---|------|------|
| 1 | Launcher 提供 **13 步 3D / 13 步真人** 入口 | ✅ pb-ai-comic-3d 和 pb-ai-comic-live 已迁移为 13 步 |
| 2 | ② Scene Split UI + API 可用 | ✅ SceneSplitPanel + POST /api/agent/scene-split |
| 3 | ⑤ Environment Bible 库 + UI | ✅ EnvironmentBiblePanel + POST /api/agent/extract-environments |
| 4 | ⑧⑫ 双阶段审阅字段 | ✅ keyframeStatus/videoStatus + v3 迁移 + approve 不写 videoStatus |
| 5 | 13 步 NextStepBanner 无 dead-end | ✅ 所有步有 CTA; continuity issues 列表; 跳过按钮; 庆祝页 |
| 6 | TEST-PIPE-000~1201 PASS | ✅ 19 项测试全部通过（含 ST-2） |
| 7 | 人工脚本 A PASS | ⏳ 需手动操作验证 |
| 8 | 爆款 7 步脚本 B PASS | ✅ pb-viral-short 7 步含 tpl-vertical-episode; QuickMontagePanel 已删除 |

**完成度：7.5/8**（仅人工验收脚本 A 需手动执行）

---

## 13. 可拓展性

| 方向 | 做法 |
|------|------|
| 新行业模板 |  fork `pb-pipeline-13-live` 改 bootstrapTemplates |
| 跳过某步 | PlaybookStepDef 加 `optional: true` + Banner「跳过」 |
| 多集 | SceneSplit 按 episode 过滤；Storyboard activeEpisode |
| 团队协作 | PlaybookSession + scriptPlan 导出 JSON |
| Agent 自动跑 | Canvas Agent 只执行当前步 `primaryAction` |

---

## 14. 与 ORCHESTRATION 文档分工

| 文档 | 职责 |
|------|------|
| `NX9-WORKFLOW-ORCHESTRATION-SPEC.md` | Playbook 引擎、入口收敛、WF-xxx |
| **本文** | **13 步业务语义、逐步缺口、PIPE-xxx 功能实现** |

实施顺序建议：

```text
1. PIPE-201/501/801（补三大缺口）
2. PIPE-000（13 步 playbook 定义）
3. WF-005~008（Banner/StepBar 已有则接新 readiness）
4. P1 批量 camera/keyframe/consistency
```

---

## 15. AI 开工模板

```text
任务: PIPE-201 Scene Split API
依据: docs/NX9-13STEP-PRODUCTION-PIPELINE-SPEC.md §3② + §5
文件: packages/shared/src/types/scene-split.ts
      apps/server/src/modules/agent/agent.service.ts
      apps/server/src/modules/agent/agent.controller.ts
      apps/server/test/test-pipe.test.ts
禁止: 改无关 Playbook
测试: TEST-PIPE-201, TEST-PIPE-202, ST-0
完成: 更新 §2.1 步② 完成% → 80%；§12 #2 ✅
```

---

**文档版本**：v2.0 · 2026-07-09  
**维护**：每完成 PIPE-xxx 更新 §2.1 与 §12  
**2026-07-09 v2.0 更新**：全部 13 步强制功能 + 可拓展功能已实现并通过测试。详见 `docs/test-reports/TEST-PIPE-RUN-2026-07-09.md`
