#!/usr/bin/env node
/**
 * NX9 缺失模块体检（doctor / 差异工具）
 *
 * 背景：`packages/shared/src/index.ts`（barrel）re-export 了若干**不存在的**
 * `./data/*` 模块，导致 `@nx9/shared` 整体不可解析（src 与 dist 都一样）。
 * 本工具**不加载 barrel**（加载不了），只用 Node 做静态分析：
 *
 *   1. 解析 barrel 里每个 `export ... from '<specifier>'`，解析 specifier 到真实文件路径；
 *      文件不存在 → 记为「缺失模块」。
 *   2. 对每个缺失模块，列出 barrel 要求的**必需导出名**，并区分
 *      `value`（`export { X }` / `export { X } from`）与 `type`（`export type { X }` / `{ type X }`）。
 *   3. 全仓扫描消费方：哪些文件 import 了这些名字、import 自哪里（barrel 还是直连模块路径）。
 *   4. 列出**仓库内可推断线索**（权威来源文件的相对路径 + 一句话说明），
 *      **只指路，不代写内容**（项目《约束开发要求》禁止臆猜业务数据集）。
 *   5. 旁支：barrel 依赖里**已存在于磁盘、但未被 git 登记**的文件 —— 本地能构建、新克隆必缺。
 *      （其中 `data/` 下的那几个是旧 `.gitignore` 规则吞掉的；其余多半只是「还没 git add」。
 *        工具只如实列出，不替调用方判定成因。）
 *
 * 设计约束：
 * - 核心逻辑全部是**纯函数**（无 fs / 无 DOM / 无时间 / 无随机），IO 一律由调用方注入回调，
 *   便于单测用伪造的 index 文本直接调用；本文件底部才是 IO 壳。
 * - 不抛异常：读不到文件 / 解析不出内容 → 如实标记（`exists: false` / `unreadable: true`），不编造通过。
 * - 输出确定：不含时间戳，同一输入必得同一份报告（`--json` 可稳定 diff）。
 *
 * 用法：
 *   node scripts/nx9-missing-modules-doctor.mjs             # 人类可读清单
 *   node scripts/nx9-missing-modules-doctor.mjs --json      # 机器可读 JSON
 *   node scripts/nx9-missing-modules-doctor.mjs --strict    # 有缺失模块 → exit 1（用于恢复后自检）
 *
 * 退出码：默认恒 0（纯报告）；`--strict` 且存在缺失模块时 exit 1。
 * 注意：`--strict` 只看「缺失模块」；「未登记的既有依赖」只报告不判失败（不影响本地构建）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** 报告结构版本；结构变化时必须递增，单测钉住该值。 */
export const DOCTOR_SCHEMA_VERSION = 1;

/** 仓库根（本文件位于 <root>/scripts/ 下）。 */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** barrel 相对路径（`@nx9/shared` 在 vitest / vite 里指向这里）。 */
export const INDEX_REL_PATH = 'packages/shared/src/index.ts';

/** 包名 → 包入口文件（仓库内已知的 path alias / vitest alias 事实）。 */
export const DEFAULT_PACKAGE_ENTRIES = {
  '@nx9/shared': INDEX_REL_PATH,
  '@nx9/director3d': 'packages/director3d/src/index.ts',
  '@nx9/remotion-compositions': 'packages/remotion-compositions/src/index.ts',
};

/** 扫描消费方时纳入的扩展名。 */
export const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.mjs', '.js', '.jsx'];

/** 扫描时跳过的目录名（依赖 / 构建产物 / 版本库）。 */
export const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.vite', '.turbo']);

/** 解析相对 specifier 时尝试的候选后缀（顺序即优先级）。 */
export const RESOLVE_SUFFIXES = ['', '.ts', '.tsx', '.d.ts', '/index.ts', '/index.tsx'];

/**
 * 仓库内**可推断线索**（按模块 slug 分组）。
 *
 * 说明：这里只登记「哪一个既有文件/文档能确定该模块的形状」，
 * **不登记任何内容**。恢复者必须自己打开这些来源核对，禁止照抄本工具的猜测。
 */
export const DEFAULT_CLUES = {
  'emotion-presets': [
    {
      path: 'apps/web/src/panels/asset-library/AssetDetailFields.tsx',
      note: '真实消费点：`BUILTIN_EMOTION_PRESETS.map((p) => …)` 读到 `p.id` / `p.label` / `p.promptEn`，写入 `emotionTags`。',
    },
    {
      path: 'packages/shared/src/types/creative-asset-center.ts',
      note: '`ShotCreativeExtension.emotionTags` / `recommendedEmotion` 的语义注释（「表演/氛围标签」，不替代角色表情格）。',
    },
    {
      path: 'packages/shared/src/utils/creative-asset-prompts.ts',
      note: '`buildEmotionPrompt` / `getEmotionCreative`：预设最终注入 Prompt 的形态。',
    },
    {
      path: 'packages/shared/src/data/character-sheet-presets.ts',
      note: '同目录既有 `CHARACTER_EXPRESSION_PRESETS`：同类预设文件的字段风格参照（注意：那是**角色表情格**，与 BUILTIN_EMOTION_PRESETS 语义不同）。',
    },
  ],
  'shot-move-families': [
    {
      path: 'packages/shared/src/types/creative-asset-center.ts',
      note: '`export type ShotMoveFamily = \'static\' | \'dolly\' | \'pan_tilt\' | \'track\' | \'crane\' | \'orbit\' | \'special\'` —— 族 id 的**权威闭集**。',
    },
    {
      path: 'packages/shared/src/data/shot-library-seeds.ts',
      note: '`ShotLibrarySeed.moveFamily: ShotMoveFamily` 117 条种子的族分布；可由 `moveFamily` 反查出现的族集合。',
    },
    {
      path: 'docs/nx9-shot-seeds-neutral.json',
      note: '种子原始数据（`moveFamily` 字段）；`node scripts/promote-shot-library-seeds.mjs` 的输入。',
    },
    {
      path: 'packages/shared/src/data/camera-move-library.ts',
      note: '`CameraMoveFamily` / `CAMERA_MOVE_FAMILY_LABELS` / `CAMERA_MOVE_FAMILY_ORDER`：运镜族的中英标签写法参照（游标不同：一个是镜头库族，一个是词典族）。',
    },
    {
      path: 'apps/web/src/panels/asset-library/modal/AssetLibraryStatusRail.tsx',
      note: '真实消费点：`SHOT_MOVE_FAMILIES.map((fam) => … fam.id / fam.label)` 用于三级筛选条。',
    },
  ],
  'creative-asset-presets': [
    {
      path: 'packages/shared/src/utils/creative-asset-factory.ts',
      note: '**直连消费方**（`../data/creative-asset-presets`）：只用 `defaultCharacterVariants` 与 `mergeVariantSlots`。',
    },
    {
      path: 'packages/shared/src/utils/creative-asset-prompts.ts',
      note: '**直连消费方**：`defaultCharacterVariants` / `mergeVariantSlots` / `CAC_COSTUME_VARIANT_PRESETS`。',
    },
    {
      path: 'packages/shared/src/types/creative-asset-center.ts',
      note: '`CreativeVariantEntry` 形状 + `DEFAULT_SCENE_VARIANTS` / `DEFAULT_PROP_VARIANTS`（同族默认槽的既有写法）。',
    },
    {
      path: 'packages/shared/src/utils/creative-asset-prompts.ts',
      note: '`CAC_*` 各词表在 Prompt 编译里的实际读取字段（id / label / prompt）。',
    },
    {
      path: 'packages/shared/src/data/pose-presets.ts',
      note: '同目录既有预设文件的字段风格参照（POSE_PRESETS / buildPosePrompt）。',
    },
    {
      path: 'docs/NX9-DORMANT-PRESET-ENTRYPOINTS.md',
      note: '既有「休眠预设接入」记录：说明了哪种预设是词表、哪种是提示词片段。',
    },
  ],
  'character-face-rig-presets': [
    {
      path: 'packages/shared/src/utils/character-face-rig.ts',
      note: '**直连消费方**：`FACE_RIG_DEADZONE` / `FACE_RIG_GROUPS` / `FACE_RIG_MAX` / `FACE_RIG_MIN` / `FACE_RIG_PARAMS` / `FACE_RIG_PARAMS_BY_ID` / `FACE_RIG_PRESETS_BY_ID` / `FaceRigParamDef` 的**全部用法**（字段名与语义可从读取方式逐条反推）。',
    },
    {
      path: 'apps/web/src/engine/__tests__/character-face-rig.test.ts',
      note: '契约钉子：`FACE_RIG_PARAMS.length === 45`、id 唯一、每项 `low` / `high` 非空、`heightFeel` 与 `shoulderWidth` 的 `driver === \'bone\'`。',
    },
    {
      path: 'docs/8.12/NX9-CHARACTER-FACE-SCULPT-2026-08-12.md',
      note: '「45 项字典 + `driver`」的锚点表与文件地图（P0 阶段交付记录）。',
    },
    {
      path: 'packages/director3d/src/sculpt/sculpt-contract.ts',
      note: '`FACE_RIG_PARAMS` 的 `id` / `driver`（`morph` | `bone` | `material` | `prompt`）在 3D 侧的实际使用。',
    },
    {
      path: 'packages/shared/src/types/creative-asset-center.ts',
      note: '`FaceRigGroupId` 闭集（shape/eyes/brows/nose/mouth/surface/body）与 `CharacterFaceRig.values` 结构。',
    },
    {
      path: 'apps/web/src/panels/asset-library/CharacterFaceRigSection.tsx',
      note: '真实消费点：`p.quick` / `p.labelZh` / `p.low` / `p.high`、`group.labelZh`、`CHARACTER_FACE_RIG_PRESETS[].id/.label`。',
    },
  ],
  'playbook-definitions': [
    {
      path: 'packages/shared/src/utils/playbook-readiness.ts',
      note: '**直连消费方**：`PlaybookStepDef.readinessKey` 的取值范围由 `readinessRegistry` 的键给出（该文件末尾即注册表）。',
    },
    {
      path: 'packages/shared/src/schema/convert-def-to-schema.ts',
      note: '**直连消费方**：逐字段读取 `PlaybookDefinition.id` / `.steps`；`PlaybookStepDef.id` / `.shortLabel` / `.label` / `.optional` / `.canvasNodeKinds` / `.stepIndex` / `.readinessKey`。',
    },
    {
      path: 'packages/shared/src/utils/playbook-step-visual.ts',
      note: '**直连消费方**：`PLAYBOOK_DEFINITIONS.find(p => p.id === session.playbookId)`、`playbook.steps.map(...)`。',
    },
    {
      path: 'packages/shared/src/utils/playbook-episode-progress.ts',
      note: '**直连消费方**：`PlaybookDefinition` 在逐步迁移逻辑里的使用。',
    },
    {
      path: 'packages/shared/src/types/workspace.ts',
      note: '**直连消费方**：`import type { PlaybookId }`（`PlaybookSession.playbookId` 的类型来源）。',
    },
    {
      path: 'apps/server/test/f030-acceptance.test.ts',
      note: '验收钉子：`pb-viral-short` 必须存在且含 `id: \'smart-edit\'` 步骤、含 `kind: \'clip-editor\'`、注释含 `F-030`；并断言 `evaluateStepVisualState` 的行为。',
    },
    {
      path: 'packages/shared/src/utils/playbook-export.ts',
      note: '会话导出：`exportPlaybookSessionJson` 对 playbook 结构的读取口径。',
    },
    {
      path: 'docs/NX9-AI-SHORT-FILM-WORKFLOW-GAP-ANALYSIS.md',
      note: '记录了 `pb-ai-short-film` 等 playbook id 的产品来源与新增理由。',
    },
  ],
  'camera-presets': [
    {
      path: 'apps/server/test/f018-acceptance.test.ts',
      note: '验收钉子：`CAMERA_PRESETS.length >= 6`、每项有 `id` / `label` / `position[3]` / `target[3]` / `fov`；label 必含「过肩」「低机位」「特写」「全景」「荷兰角」；`lookupCameraPreset(\'dutch\').label === \'荷兰角\'`；未知 id 返回 `undefined`。',
    },
    {
      path: 'packages/director3d/src/ui/CameraPresetBar.tsx',
      note: 'director3d 内的**同源内联副本**（注释写明「与 @nx9/shared CAMERA_PRESETS 对齐」）：8 条 id/name/position/target/fov 直接可对齐。',
    },
    {
      path: 'packages/shared/src/data/camera-move-library.ts',
      note: '`LEGACY_CAMERA_PRESET_TO_MOVE` / `cameraMoveFromLegacyPresetId`：既有「旧机位预设 id → 运镜词条 id」的升级映射表，可反查合法的旧预设 id。',
    },
    {
      path: 'apps/web/src/engine/__tests__/director3d-camera-move-library-panel.test.tsx',
      note: '导演台运镜面板的既有回归，涉及机位/运镜映射的实际用法。',
    },
  ],
  'shot-lexicon-taxonomy': [
    {
      path: 'docs/nx9-shot-seeds-neutral.json',
      note: '**权威来源**：117 条种子的 `systemId` / `system` / `category` 三元组可直接推出体系表与各体系分类表（`systemId: system1|system2…`）。',
    },
    {
      path: 'packages/shared/src/data/shot-library-seeds.ts',
      note: '同一份数据的已入库 TS 版本（`SHOT_LIBRARY_SEEDS`），字段与 JSON 一致且**已在仓库内**。',
    },
    {
      path: 'packages/shared/src/types/creative-asset-center.ts',
      note: '`ShotCreativeExtension.lexiconSystemId` 注释：`system1` 实拍 / `system2` AI·CG；`lexiconSystem` 为体系全称；`lexiconCategory` 形如「基础推拉变焦运镜」。',
    },
    {
      path: 'apps/web/src/panels/asset-library/AssetDetailFields.tsx',
      note: '真实消费点：`SHOT_LEXICON_SYSTEMS.map(sys => sys.id / sys.fullName / sys.label)`；`listShotLexiconCategories(systemId | \'all\')` 返回**分类全名字符串数组**；`shortenShotLexiconCategory(cat)` 返回展示用短名。',
    },
    {
      path: 'apps/web/src/panels/asset-library/modal/use-asset-library-catalog.ts',
      note: '真实消费点：`listShotLexiconCategories(shotSystemId)`（含默认 `\'all\'` 分支）。',
    },
    {
      path: 'apps/web/src/engine/__tests__/asset-library-modal-split-guard.test.ts',
      note: '既有回归对 `SHOT_LEXICON_SYSTEMS` 的断言口径。',
    },
  ],
  'provider-registry': [
    {
      path: 'apps/web/src/engine/__tests__/video-edit-provider-registry.test.ts',
      note: '**契约钉子**：`VIDEO_EDIT_PROVIDERS[].supportsFrameTracking: boolean`、`inputKeys.video` / `inputKeys.prompt` 非空、`inputKeys.maskVideo` 存在；`resolveVideoEditProvider(未知 id)` 必须回落到已注册供应商；`VIDEO_TRACE_PROVIDERS[].inputKeys.mask` 非空。',
    },
    {
      path: 'packages/shared/src/types/settings.ts',
      note: '`BUILTIN_CONNECTION_PRESETS`（provider / baseUrl / model / kind 的既有真源）与 `ModelConnection.kind` 闭集：`PROVIDER_REGISTRY` / `DEFAULT_*_MODEL` 必须与之自洽。',
    },
    {
      path: 'packages/shared/src/data/gen-models.ts',
      note: '`DEFAULT_PICTURE_GEN_MODEL_ID` / `PICTURE_GEN_MODELS`：`DEFAULT_PICTURE_MODEL` 的取值来源。',
    },
    {
      path: 'packages/shared/src/data/video-gen-models.ts',
      note: '`DEFAULT_BUILTIN_VIDEO_MODEL_ID` / `VIDEO_GEN_MODELS`：`DEFAULT_VIDEO_MODEL` 的取值来源。',
    },
    {
      path: 'packages/shared/src/data/audio-models.ts',
      note: '`DEFAULT_AUDIO_VOICE_ID` / `AUDIO_MODELS`：`DEFAULT_TTS_MODEL` 的取值来源。',
    },
    {
      path: 'packages/shared/src/data/model-catalog.ts',
      note: '内置模型分组与连接合并口径；`resolveDefaultModel` 必须与 `listBuiltin*Options` 一致。',
    },
    {
      path: 'apps/web/src/hooks/use-auto-configure.ts',
      note: '真实消费点：`resolveDefaultModel(kind: \'picture\' | \'video\' | \'tts\')`。',
    },
    {
      path: 'apps/server/src/modules/montage/video-edit.service.ts',
      note: '服务端同源消费：`VIDEO_EDIT_PROVIDERS.some(...)` / `resolveVideoTraceProvider` / 未知供应商拒绝文案。',
    },
    {
      path: 'apps/web/src/engine/__tests__/se-deep-honesty.test.ts',
      note: '源码门禁：要求 `provider-registry.ts` 文本含 `supportsFrameTracking: boolean`、`supportsFrameTracking: true`、`maskVideo`、`fal-ai/sam2/video`、`id: \'wan-vace\'`。',
    },
    {
      path: 'docs/8.12/NX9-SMART-EDIT-OPEN-LOOPS-IMPLEMENTATION-LOG-2026-08-12.md',
      note: '记录「`provider-registry.ts` 仍只有 `wan-vace`；没有产品/供应商选型依据，不能臆造第二家模型」。',
    },
  ],
};

// ────────────────────────────── 纯函数区 ──────────────────────────────

/** 把 Windows / POSIX 路径统一成正斜杠。 */
export function toPosix(p) {
  return String(p ?? '').replace(/\\/g, '/');
}

/** 目录部分（POSIX 语义，无尾斜杠）。 */
export function posixDirname(p) {
  const s = toPosix(p);
  const i = s.lastIndexOf('/');
  return i < 0 ? '' : s.slice(0, i);
}

/** 拼接 + 归一化（只处理 `.` / `..`，不落到文件系统）。 */
export function posixJoin(base, rel) {
  const parts = (toPosix(base) + '/' + toPosix(rel)).split('/');
  const out = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

/** 文件名（含扩展名）。 */
export function posixBasename(p) {
  const s = toPosix(p);
  const i = s.lastIndexOf('/');
  return i < 0 ? s : s.slice(i + 1);
}

/** 去掉已知源码扩展名，得到模块 slug（`data/emotion-presets.ts` → `emotion-presets`）。 */
export function moduleSlug(filePath) {
  const base = posixBasename(filePath);
  for (const ext of ['.d.ts', '.ts', '.tsx', '.mts', '.cts', '.mjs', '.js', '.jsx']) {
    if (base.endsWith(ext)) return base.slice(0, -ext.length);
  }
  return base;
}

/** 行号（1 基）由字符偏移算得。 */
function lineAt(source, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1;
  }
  return line;
}

const BINDING_RE = /\b(export|import)\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;

/**
 * 解析源码里所有 `import { … } from '<spec>'` / `export [type] { … } from '<spec>'` 绑定块。
 *
 * 每个条目：`{ specifier, statement, isTypeOnly, names: [{ name, isType, alias }], line }`。
 * 单个名字前写 `type`（`{ type Foo }`）即该名字是类型导入，与整块 `export type { … }` 等价。
 */
export function parseModuleBindings(source) {
  const text = String(source ?? '');
  const out = [];
  BINDING_RE.lastIndex = 0;
  let match = BINDING_RE.exec(text);
  while (match) {
    const [full, statement, typeKeyword, rawNames, specifier] = match;
    const isTypeOnly = Boolean(typeKeyword);
    const names = [];
    for (const raw of rawNames.split(',')) {
      let token = raw.trim();
      if (!token) continue;
      let isType = isTypeOnly;
      if (/^type\s+/.test(token)) {
        isType = true;
        token = token.replace(/^type\s+/, '').trim();
      }
      const asMatch = token.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (asMatch) {
        names.push({ name: asMatch[1], alias: asMatch[2], isType });
        continue;
      }
      const plain = token.match(/^([A-Za-z_$][\w$]*)$/);
      if (plain) names.push({ name: plain[1], alias: plain[1], isType });
    }
    out.push({
      specifier,
      statement,
      isTypeOnly,
      names,
      line: lineAt(text, match.index),
      raw: full.trim(),
    });
    match = BINDING_RE.exec(text);
  }
  return out;
}

/**
 * 解析一个 specifier 到仓库内相对路径候选（纯字符串运算）。
 * 返回**候选列表**（按优先级），由调用方用 `fileExists` 挑第一个存在的。
 */
export function resolveCandidates(fromRelPath, specifier, packageEntries = DEFAULT_PACKAGE_ENTRIES) {
  const spec = toPosix(specifier).trim();
  if (!spec) return [];
  if (spec.startsWith('.')) {
    const base = posixJoin(posixDirname(fromRelPath), spec);
    const normalized = spec.endsWith('.js') ? [base, base.slice(0, -3) + '.ts'] : [base];
    const candidates = [];
    for (const b of normalized) {
      for (const suffix of RESOLVE_SUFFIXES) candidates.push(b + suffix);
    }
    return [...new Set(candidates)];
  }
  if (Object.prototype.hasOwnProperty.call(packageEntries, spec)) {
    return [toPosix(packageEntries[spec])];
  }
  return [];
}

/**
 * 解析一个 specifier 到仓库内真实文件（用 `fileExists` 挑第一个存在的候选）。
 * 返回 `null` 表示解析不到（外部包 / 不存在的路径）。
 */
export function resolveSpecifier(fromRelPath, specifier, fileExists, packageEntries = DEFAULT_PACKAGE_ENTRIES) {
  for (const candidate of resolveCandidates(fromRelPath, specifier, packageEntries)) {
    if (fileExists(candidate)) return candidate;
  }
  return null;
}

/**
 * 体检主函数（纯函数）。
 *
 * @param {object} input
 * @param {string} input.indexSource        barrel 源码文本（必填）
 * @param {string} [input.indexPath]        barrel 仓库相对路径
 * @param {string[]} [input.sourceFiles]    参与消费方扫描的仓库相对路径清单
 * @param {(rel:string)=>string|null} [input.readSource]  读取源文本；读不到返回 null
 * @param {(rel:string)=>boolean} [input.fileExists]      路径存在性
 * @param {(rel:string)=>boolean} [input.isTracked]       路径是否已被 git 登记（可选；
 *        提供后会额外报出「已存在于磁盘、但从未提交」的 barrel 依赖）
 * @param {Record<string, Array<{path:string, note:string}>>} [input.clues]  线索表（按 slug）
 * @param {Record<string,string>} [input.packageEntries]  包名 → 入口文件
 * @returns {{schemaVersion:number, index:object, modules:object[], untrackedExistingModules:object[], totals:object, duplicateExportNames:object[], notes:string[]}}
 */
export function analyzeMissingModules(input) {
  const {
    indexSource = '',
    indexPath = INDEX_REL_PATH,
    sourceFiles = [],
    readSource = () => null,
    fileExists = () => false,
    isTracked = null,
    clues = DEFAULT_CLUES,
    packageEntries = DEFAULT_PACKAGE_ENTRIES,
  } = input ?? {};

  const indexBindings = parseModuleBindings(indexSource);
  const indexBlocks = indexBindings.length;

  // 1) 找出 barrel 引用但文件不存在的模块（按 specifier 去重，保留 barrel 首次出现顺序）。
  /** @type {Map<string, {specifier:string, modulePath:string|null, candidates:string[], bundles:any[]}>} */
  const missingBySpec = new Map();
  const resolvedSpecs = new Map();
  for (const binding of indexBindings) {
    if (resolvedSpecs.has(binding.specifier)) {
      resolvedSpecs.get(binding.specifier).push(binding);
      continue;
    }
    resolvedSpecs.set(binding.specifier, [binding]);
  }

  for (const [specifier, bindings] of resolvedSpecs) {
    if (!specifier.startsWith('.')) continue; // 只看相对引用（barrel 内部模块）
    const candidates = resolveCandidates(indexPath, specifier, packageEntries);
    // 首选 `.ts` 候选作为「应该存在的文件路径」，便于恢复者照单建文件。
    const primary = candidates.find((c) => c.endsWith('.ts') && !c.endsWith('.d.ts')) ?? candidates[0] ?? null;
    const exists = candidates.some((c) => fileExists(c));
    if (exists) continue;
    missingBySpec.set(specifier, {
      specifier,
      modulePath: primary,
      candidates,
      bundles: bindings,
    });
  }

  // 2) 每个缺失模块的必需导出（value / type 分开），并建立「导出名 → 模块」反查。
  const modules = [];
  const nameToSlugs = new Map();
  for (const entry of missingBySpec.values()) {
    const exports = [];
    const seen = new Set();
    for (const binding of entry.bundles) {
      for (const n of binding.names) {
        const key = n.name;
        if (seen.has(key)) continue;
        seen.add(key);
        exports.push({ name: n.name, kind: n.isType ? 'type' : 'value', line: binding.line });
      }
    }
    const slug = moduleSlug(entry.modulePath ?? entry.specifier);
    for (const e of exports) {
      if (!nameToSlugs.has('#' + e.name)) nameToSlugs.set('#' + e.name, []);
      nameToSlugs.get('#' + e.name).push(slug);
    }
    modules.push({
      slug,
      specifier: entry.specifier,
      modulePath: entry.modulePath,
      exists: false,
      status: 'missing',
      barrels: entry.bundles.map((b) => ({ line: b.line, statement: b.statement, isTypeOnly: b.isTypeOnly })),
      exports,
      exportCount: exports.length,
      valueExportCount: exports.filter((e) => e.kind === 'value').length,
      typeExportCount: exports.filter((e) => e.kind === 'type').length,
      consumers: [],
      consumerFiles: [],
      consumerCount: 0,
      clues: [],
      cluesMissing: [],
    });
  }

  const moduleBySlug = new Map(modules.map((m) => [m.slug, m]));
  const fileList = [...new Set(sourceFiles.map(toPosix))];

  // 缺失模块的**候选路径 → slug** 反查表。
  // 注意：不能用 `resolveSpecifier` 判断直连消费方 —— 缺失文件永远解析不到；
  // 必须比较「候选路径集合」是否覆盖该模块的候选路径。
  const missingByCandidate = new Map();
  for (const mod of modules) {
    const entry = missingBySpec.get(mod.specifier);
    for (const candidate of entry?.candidates ?? []) missingByCandidate.set(candidate, mod.slug);
  }

  // 3) 消费方扫描：只看「真的从 barrel / 缺失模块路径 import 了该名字」的文件。
  const unreadable = [];
  for (const file of fileList) {
    if (file === toPosix(indexPath)) continue; // barrel 自身不算消费方
    const source = readSource(file);
    if (typeof source !== 'string') {
      unreadable.push(file);
      continue;
    }
    const bindings = parseModuleBindings(source);
    if (bindings.length === 0) continue;
    for (const binding of bindings) {
      const candidates = resolveCandidates(file, binding.specifier, packageEntries);
      if (candidates.length === 0) continue;
      let via = null;
      let slugs = null;
      if (candidates.includes(toPosix(indexPath))) {
        via = 'barrel';
        slugs = [];
      } else {
        const found = [...new Set(candidates.map((c) => missingByCandidate.get(c)).filter(Boolean))];
        if (found.length === 0) continue;
        via = 'direct';
        slugs = found;
      }
      for (const n of binding.names) {
        const owners = via === 'barrel' ? nameToSlugs.get('#' + n.name) ?? [] : slugs;
        for (const ownerSlug of owners) {
          const mod = moduleBySlug.get(ownerSlug);
          if (!mod) continue;
          mod.consumers.push({
            file,
            line: binding.line,
            specifier: binding.specifier,
            via,
            name: n.name,
            kind: n.isType ? 'type' : 'value',
            local: n.alias ?? n.name,
          });
        }
      }
    }
  }

  // 4) 折叠消费方（去重 + 排序）与线索存在性。
  for (const mod of modules) {
    const uniq = new Map();
    for (const c of mod.consumers) {
      const key = `${c.file}:${c.line}:${c.name}:${c.via}`;
      if (!uniq.has(key)) uniq.set(key, c);
    }
    mod.consumers = [...uniq.values()].sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.name.localeCompare(b.name),
    );
    mod.consumerFiles = [...new Set(mod.consumers.map((c) => c.file))].sort();
    mod.consumerCount = mod.consumers.length;
    const clueList = Array.isArray(clues?.[mod.slug]) ? clues[mod.slug] : [];
    mod.clues = clueList.map((c) => ({
      path: toPosix(c.path),
      note: c.note ?? '',
      exists: Boolean(fileExists(toPosix(c.path))),
    }));
    mod.cluesMissing = mod.clues.filter((c) => !c.exists).map((c) => c.path);
  }

  // 5) 同一导出名被多个缺失模块声明 → 消费方归属会歧义，如实报出。
  const duplicateExportNames = [];
  for (const [key, slugs] of nameToSlugs) {
    if (!key.startsWith('#')) continue;
    const uniq = [...new Set(slugs)];
    if (uniq.length > 1) duplicateExportNames.push({ name: key.slice(1), modules: uniq.sort() });
  }
  duplicateExportNames.sort((a, b) => a.name.localeCompare(b.name));

  // 6) 同一根因的旁支：barrel 依赖的相对模块**存在于磁盘但从未提交**（新克隆同样会缺）。
  const untrackedExistingModules = [];
  if (typeof isTracked === 'function') {
    for (const specifier of resolvedSpecs.keys()) {
      if (!specifier.startsWith('.')) continue;
      const candidates = resolveCandidates(indexPath, specifier, packageEntries);
      const found = candidates.find((c) => fileExists(c));
      if (!found) continue; // 已缺失的模块归第 2 节，不在这里重复
      if (isTracked(found)) continue;
      untrackedExistingModules.push({ specifier, path: found });
    }
    untrackedExistingModules.sort((a, b) => a.path.localeCompare(b.path));
  }

  const totals = {
    moduleCount: modules.length,
    missingModuleCount: modules.filter((m) => !m.exists).length,
    presentModuleCount: modules.filter((m) => m.exists).length,
    exportCount: modules.reduce((s, m) => s + m.exportCount, 0),
    valueExportCount: modules.reduce((s, m) => s + m.valueExportCount, 0),
    typeExportCount: modules.reduce((s, m) => s + m.typeExportCount, 0),
    consumerCount: modules.reduce((s, m) => s + m.consumerCount, 0),
    consumerFileCount: new Set(modules.flatMap((m) => m.consumerFiles)).size,
    modulesWithoutConsumer: modules.filter((m) => m.consumerCount === 0).map((m) => m.slug),
    clueCount: modules.reduce((s, m) => s + m.clues.length, 0),
    clueMissingCount: modules.reduce((s, m) => s + m.cluesMissing.length, 0),
    untrackedExistingCount: untrackedExistingModules.length,
    scannedFileCount: fileList.length,
  };

  const notes = [];
  if (indexBlocks === 0) notes.push(`barrel（${toPosix(indexPath)}）里没有解析出任何 import/export-from 绑定块，请核对输入文本。`);
  if (totals.consumerCount === 0 && totals.missingModuleCount > 0) {
    notes.push('没有扫描到任何 import 消费方：若这是真实仓库，说明 sourceFiles / readSource 注入有误。');
  }
  if (duplicateExportNames.length > 0) {
    notes.push(`存在同名导出被多个缺失模块声明（${duplicateExportNames.map((d) => d.name).join(', ')}）：barrel 消费方会被同时计入这些模块。`);
  }
  if (unreadable.length > 0) notes.push(`有 ${unreadable.length} 个源文件读不出内容，已跳过（不计入消费方）。`);
  if (typeof isTracked !== 'function') {
    notes.push('未提供 git 登记信息（isTracked）→ 本次**未**检查「已在磁盘但从未提交」的 barrel 依赖；这部分需另外人工核对。');
  }

  return {
    schemaVersion: DOCTOR_SCHEMA_VERSION,
    index: {
      path: toPosix(indexPath),
      bindingBlockCount: indexBlocks,
      relativeSpecifierCount: [...resolvedSpecs.keys()].filter((s) => s.startsWith('.')).length,
      missingSpecifiers: [...missingBySpec.keys()],
    },
    modules,
    untrackedExistingModules,
    totals,
    duplicateExportNames,
    unreadableFiles: unreadable,
    notes,
  };
}

/** 渲染人类可读清单（纯函数：输入报告，输出字符串）。 */
export function formatReport(report, { repoRoot = '' } = {}) {
  const lines = [];
  const t = report.totals;
  lines.push('NX9 缺失模块体检报告（静态分析；未加载 barrel）');
  lines.push(`barrel: ${report.index.path}（绑定块 ${report.index.bindingBlockCount} 个，其中相对引用 ${report.index.relativeSpecifierCount} 个）`);
  lines.push(`参与扫描的源文件: ${t.scannedFileCount}`);
  lines.push('');
  if (t.missingModuleCount === 0) {
    lines.push('结论：barrel 引用的相对模块**全部存在**，无缺失。');
  } else {
    lines.push(`结论：barrel 引用了 ${t.missingModuleCount} 个**不存在的模块** → @nx9/shared 整体不可解析。`);
  }
  lines.push('');

  report.modules.forEach((m, i) => {
    lines.push(`[${i + 1}/${report.modules.length}] ${m.modulePath ?? m.specifier}   → ${m.status === 'missing' ? '缺失' : '存在'}`);
    lines.push(`    必需导出 ${m.exportCount} 个（value ${m.valueExportCount} / type ${m.typeExportCount}）:`);
    for (const e of m.exports) lines.push(`      - ${e.kind === 'type' ? 'type ' : '      '}${e.name}   (barrel L${e.line})`);
    lines.push(`    消费方 ${m.consumerCount} 处 / ${m.consumerFiles.length} 个文件:`);
    if (m.consumerCount === 0) lines.push('      （仓库内无 import 消费方；仅 barrel re-export）');
    for (const c of m.consumers) {
      lines.push(`      - ${c.file}:${c.line}  ← ${c.specifier} [${c.via}]  ${c.name}(${c.kind})`);
    }
    lines.push(`    仓库内可推断线索 ${m.clues.length} 条:`);
    for (const c of m.clues) lines.push(`      - ${c.exists ? '✔' : '✘(缺失)'} ${c.path}\n          ${c.note}`);
    if (m.cluesMissing.length > 0) lines.push(`    ⚠ 线索路径不存在: ${m.cluesMissing.join(', ')}`);
    lines.push('');
  });

  lines.push('── 总览 ──');
  lines.push(`缺失模块: ${t.missingModuleCount} / ${t.moduleCount}`);
  lines.push(`必需导出合计: ${t.exportCount}（value ${t.valueExportCount} / type ${t.typeExportCount}）`);
  lines.push(`消费方合计: ${t.consumerCount} 处，覆盖 ${t.consumerFileCount} 个文件`);
  lines.push(`无消费方（仅 barrel）的模块: ${t.modulesWithoutConsumer.length === 0 ? '无' : t.modulesWithoutConsumer.join(', ')}`);
  lines.push(`线索合计: ${t.clueCount} 条，其中路径不存在的 ${t.clueMissingCount} 条`);
  if (report.untrackedExistingModules.length > 0) {
    lines.push('');
    lines.push(`── 旁支：barrel 依赖里「已在磁盘、但未被 git 登记」的 ${report.untrackedExistingModules.length} 个文件 ──`);
    lines.push('（本地能构建；但新克隆会缺这些文件。`git ls-files` 无记录，请一并 `git add`。）');
    for (const u of report.untrackedExistingModules) lines.push(`  - ${u.path}   ← ${u.specifier}`);
  }
  if (report.notes.length > 0) {
    lines.push('');
    lines.push('── 备注 ──');
    for (const n of report.notes) lines.push(`- ${n}`);
  }
  lines.push('');
  lines.push('恢复位置: packages/shared/src/data/<slug>.ts（不要改 barrel 里已有的 import）');
  if (repoRoot) lines.push(`仓库根: ${repoRoot}`);
  return lines.join('\n');
}

/** 判断模块是否作为「主入口」被执行（而非被单测 import）。 */
export function isMainModule(metaUrl, argv1 = process.argv?.[1]) {
  if (!argv1) return false;
  try {
    return metaUrl === pathToFileURL(argv1).href;
  } catch {
    return false;
  }
}

// ────────────────────────────── IO 壳 ──────────────────────────────

/** 在仓库里递归收集源文件（仓库相对 POSIX 路径）。 */
export function collectSourceFiles(root) {
  const out = [];
  const roots = ['apps', 'packages', 'services', 'scripts'];
  const stack = roots.map((r) => path.join(root, r)).filter((p) => fs.existsSync(p));
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(path.join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      if (!SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
      out.push(toPosix(path.relative(root, path.join(dir, entry.name))));
    }
  }
  out.sort();
  return out;
}

/** 组装真实仓库的 IO 回调。 */
export function createRepoIo(root = REPO_ROOT) {
  const abs = (rel) => path.join(root, toPosix(rel).split('/').join(path.sep));
  return {
    root,
    fileExists(rel) {
      try {
        return fs.statSync(abs(rel)).isFile();
      } catch {
        return false;
      }
    },
    readSource(rel) {
      try {
        return fs.readFileSync(abs(rel), 'utf8');
      } catch {
        return null;
      }
    },
  };
}

/** 用 `git ls-files` 取仓库已登记文件（仓库相对 POSIX 路径）；git 不可用时返回 null。 */
export function collectTrackedFiles(root = REPO_ROOT) {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return out.split('\0').filter(Boolean).map(toPosix);
  } catch {
    return null;
  }
}

/** 跑一次真实仓库体检（IO 壳，供 CLI 与文档复现）。 */
export function runDoctor({ root = REPO_ROOT, indexPath = INDEX_REL_PATH } = {}) {
  const io = createRepoIo(root);
  const indexSource = io.readSource(indexPath);
  if (typeof indexSource !== 'string') {
    throw new Error(`读不到 barrel：${indexPath}（仓库根 ${root}）`);
  }
  const tracked = collectTrackedFiles(root);
  const trackedSet = tracked ? new Set(tracked) : null;
  return analyzeMissingModules({
    indexSource,
    indexPath,
    sourceFiles: collectSourceFiles(root),
    readSource: io.readSource,
    fileExists: io.fileExists,
    isTracked: trackedSet ? (rel) => trackedSet.has(toPosix(rel)) : null,
  });
}

function main(argv) {
  const args = new Set(argv.slice(2));
  const asJson = args.has('--json');
  const strict = args.has('--strict');
  const report = runDoctor({});
  if (asJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(formatReport(report, { repoRoot: REPO_ROOT }) + '\n');
  }
  if (strict && report.totals.missingModuleCount > 0) {
    process.stderr.write(`--strict：仍有 ${report.totals.missingModuleCount} 个缺失模块 → exit 1\n`);
    return 1;
  }
  return 0;
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main(process.argv);
}
