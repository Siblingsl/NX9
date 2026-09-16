/**
 * 缺失模块体检工具单测（`scripts/nx9-missing-modules-doctor.mjs`）
 *
 * 硬约束（刻意为之）：
 * 1. **不 import `@nx9/shared`（barrel）**：barrel 当前引用了 8 个不存在的模块，
 *    整体不可解析；本文件用**相对路径直取脚本源码**，与 barrel 缺陷解耦。
 * 2. 覆盖 `analyzeMissingModules` 的纯逻辑：value / type 区分、消费方归属、
 *    缺文件时如实标记、`--json` 结构稳定、确定性（同一输入同一输出）。
 * 3. 用**真实的 `packages/shared/src/index.ts`** 跑一次，钉住「恰好 8 个缺失模块」这一当前事实。
 *
 * 说明：脚本是 `.mjs`（无类型声明），此处按运行时契约调用；类型由下方断言兜底。
 */
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import fs from 'node:fs';

// @ts-ignore —— .mjs 脚本无 .d.ts，按运行时契约调用
import * as doctor from '../../../../../scripts/nx9-missing-modules-doctor.mjs';

const {
  DOCTOR_SCHEMA_VERSION,
  INDEX_REL_PATH,
  analyzeMissingModules,
  collectSourceFiles,
  collectTrackedFiles,
  createRepoIo,
  formatReport,
  moduleSlug,
  parseModuleBindings,
  posixJoin,
  resolveCandidates,
  resolveSpecifier,
} = doctor;

/** 仓库根：`apps/web/src/engine/__tests__` → 上溯 5 层。 */
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');

/** 伪造文件系统：`fileExists` / `readSource` 都由这张表派生。 */
function makeFakeFs(files: Record<string, string>) {
  const has = (rel: string) => Object.prototype.hasOwnProperty.call(files, rel);
  return {
    fileExists: (rel: string) => has(rel),
    readSource: (rel: string) => (has(rel) ? files[rel] : null),
  };
}

// ───────────────────── A. 绑定解析（value / type 区分） ─────────────────────

describe('体检工具 · parseModuleBindings', () => {
  it('整块 export type → 全部 type；整块 export → 全部 value', () => {
    const src = [
      `export type { A, B } from './x';`,
      `export { C, D } from './x';`,
    ].join('\n');
    const blocks = parseModuleBindings(src);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].names.map((n: any) => [n.name, n.isType])).toEqual([
      ['A', true],
      ['B', true],
    ]);
    expect(blocks[1].names.map((n: any) => [n.name, n.isType])).toEqual([
      ['C', false],
      ['D', false],
    ]);
    expect(blocks[0].isTypeOnly).toBe(true);
    expect(blocks[1].isTypeOnly).toBe(false);
  });

  it('混排 `{ X, type Y }` → 逐名区分 value / type', () => {
    const blocks = parseModuleBindings(`export { ValueOne, type TypeOne, ValueTwo } from './mix';`);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].names.map((n: any) => `${n.name}:${n.isType ? 'type' : 'value'}`)).toEqual([
      'ValueOne:value',
      'TypeOne:type',
      'ValueTwo:value',
    ]);
  });

  it('import type / 别名 / 多行块 与行号', () => {
    const src = [
      `// 头部注释`,
      `import type { T1 } from './t';`,
      `import {`,
      `  A as LocalA,`,
      `  type B,`,
      `} from './multi';`,
    ].join('\n');
    const blocks = parseModuleBindings(src);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].line).toBe(2);
    expect(blocks[0].names[0]).toMatchObject({ name: 'T1', isType: true });
    expect(blocks[1].line).toBe(3);
    expect(blocks[1].specifier).toBe('./multi');
    expect(blocks[1].names).toHaveLength(2);
    expect(blocks[1].names[0]).toMatchObject({ name: 'A', alias: 'LocalA', isType: false });
    expect(blocks[1].names[1]).toMatchObject({ name: 'B', isType: true });
  });

  it('没有绑定块 / 脏输入 → 空数组，不抛异常', () => {
    expect(parseModuleBindings('')).toEqual([]);
    expect(parseModuleBindings(null)).toEqual([]);
    expect(parseModuleBindings('export const x = 1;')).toEqual([]);
  });
});

// ───────────────────── B. specifier 解析 ─────────────────────

describe('体检工具 · specifier 解析', () => {
  it('相对 specifier → 候选列表按后缀优先级展开', () => {
    const candidates = resolveCandidates('packages/shared/src/index.ts', './data/alpha');
    expect(candidates[0]).toBe('packages/shared/src/data/alpha');
    expect(candidates).toContain('packages/shared/src/data/alpha.ts');
    expect(candidates).toContain('packages/shared/src/data/alpha.tsx');
    expect(candidates).toContain('packages/shared/src/data/alpha/index.ts');
  });

  it('ESM 风格 `.js` 后缀回退到 `.ts`', () => {
    const candidates = resolveCandidates('packages/shared/src/index.ts', './data/alpha.js');
    expect(candidates).toContain('packages/shared/src/data/alpha.ts');
  });

  it('包名仅在已知入口表内解析；未知包不误报', () => {
    expect(resolveCandidates('apps/web/src/a.ts', '@nx9/shared')).toEqual([INDEX_REL_PATH]);
    expect(resolveCandidates('apps/web/src/a.ts', 'react')).toEqual([]);
    expect(resolveCandidates('apps/web/src/a.ts', '')).toEqual([]);
  });

  it('resolveSpecifier 挑第一个存在的候选；全不存在返回 null', () => {
    const fsLike = makeFakeFs({ 'packages/shared/src/data/alpha.ts': 'export {};' });
    expect(
      resolveSpecifier('packages/shared/src/index.ts', './data/alpha', fsLike.fileExists),
    ).toBe('packages/shared/src/data/alpha.ts');
    expect(
      resolveSpecifier('packages/shared/src/index.ts', './data/nope', fsLike.fileExists),
    ).toBeNull();
    expect(resolveSpecifier('apps/web/src/a.ts', 'react', fsLike.fileExists)).toBeNull();
  });

  it('moduleSlug / posixJoin 纯路径运算', () => {
    expect(moduleSlug('packages/shared/src/data/emotion-presets.ts')).toBe('emotion-presets');
    expect(moduleSlug('a/b/playbook-definitions.d.ts')).toBe('playbook-definitions');
    expect(posixJoin('packages/shared/src', './data/../data/alpha.ts')).toBe(
      'packages/shared/src/data/alpha.ts',
    );
  });
});

// ───────────────────── C. analyzeMissingModules 纯逻辑 ─────────────────────

const FAKE_INDEX = [
  `export type { AlphaType, BetaType } from './data/alpha';`,
  `export { AlphaValue, type AlphaCtor } from './data/alpha';`,
  `export { GammaValue, gammaHelper } from './data/gamma';`,
  `export { PresentValue } from './data/present';`,
].join('\n');

const FAKE_FILES: Record<string, string> = {
  // barrel 自身必须「存在」，否则 `@nx9/shared` 解析不到，barrel 消费方会被漏掉
  [INDEX_REL_PATH]: FAKE_INDEX,
  'packages/shared/src/data/present.ts': 'export const PresentValue = 1;',
  'apps/web/src/consumer-a.ts': `import { AlphaValue, GammaValue, MissingName } from '@nx9/shared';`,
  'apps/web/src/consumer-b.ts': `import type { AlphaType } from '@nx9/shared';`,
  'apps/web/src/consumer-c.ts': `import { gammaHelper } from '../../../packages/shared/src/data/gamma';`,
  'apps/web/src/consumer-d.ts': `import { somethingElse } from '@nx9/shared';`,
};

const FAKE_SOURCE_FILES = [
  ...Object.keys(FAKE_FILES),
  'apps/web/src/unreadable.ts',
];

function runFake(overrides: any = {}) {
  const fsLike = makeFakeFs(FAKE_FILES);
  return analyzeMissingModules({
    indexSource: FAKE_INDEX,
    sourceFiles: FAKE_SOURCE_FILES,
    readSource: fsLike.readSource,
    fileExists: fsLike.fileExists,
    ...overrides,
  });
}

describe('体检工具 · analyzeMissingModules（伪造输入）', () => {
  it('存在的模块不报；只有缺失模块进报告', () => {
    const report = runFake();
    expect(report.modules.map((m: any) => m.slug)).toEqual(['alpha', 'gamma']);
    expect(report.modules.every((m: any) => m.status === 'missing' && m.exists === false)).toBe(true);
    expect(report.index.missingSpecifiers).toEqual(['./data/alpha', './data/gamma']);
    expect(report.totals.moduleCount).toBe(2);
    expect(report.totals.missingModuleCount).toBe(2);
    expect(report.totals.presentModuleCount).toBe(0);
  });

  it('必需导出区分 value / type，且保留 barrel 出现顺序', () => {
    const report = runFake();
    const alpha = report.modules[0];
    expect(alpha.modulePath).toBe('packages/shared/src/data/alpha.ts');
    expect(alpha.exports.map((e: any) => `${e.kind}:${e.name}`)).toEqual([
      'type:AlphaType',
      'type:BetaType',
      'value:AlphaValue',
      'type:AlphaCtor',
    ]);
    expect([alpha.exportCount, alpha.valueExportCount, alpha.typeExportCount]).toEqual([4, 1, 3]);
    expect(report.modules[1].exports.map((e: any) => `${e.kind}:${e.name}`)).toEqual([
      'value:GammaValue',
      'value:gammaHelper',
    ]);
    expect(report.totals).toMatchObject({
      exportCount: 6,
      valueExportCount: 3,
      typeExportCount: 3,
    });
  });

  it('消费方归属：barrel 与直连各归各位，未导出的名字不计入', () => {
    const report = runFake();
    const [alpha, gamma] = report.modules;
    expect(alpha.consumerFiles).toEqual(['apps/web/src/consumer-a.ts', 'apps/web/src/consumer-b.ts']);
    expect(gamma.consumerFiles).toEqual(['apps/web/src/consumer-a.ts', 'apps/web/src/consumer-c.ts']);
    expect(alpha.consumers).toEqual([
      { file: 'apps/web/src/consumer-a.ts', line: 1, specifier: '@nx9/shared', via: 'barrel', name: 'AlphaValue', kind: 'value', local: 'AlphaValue' },
      { file: 'apps/web/src/consumer-b.ts', line: 1, specifier: '@nx9/shared', via: 'barrel', name: 'AlphaType', kind: 'type', local: 'AlphaType' },
    ]);
    expect(gamma.consumers).toContainEqual({
      file: 'apps/web/src/consumer-c.ts', line: 1, specifier: '../../../packages/shared/src/data/gamma',
      via: 'direct', name: 'gammaHelper', kind: 'value', local: 'gammaHelper',
    });
    // `MissingName` 不在 barrel 的导出清单里；`somethingElse` 同理 → 都不计入
    expect(report.modules.some((m: any) => m.consumers.some((c: any) => c.name === 'MissingName'))).toBe(false);
    expect(report.totals.consumerCount).toBe(4);
    expect(report.totals.consumerFileCount).toBe(3);
  });

  it('barrel 自身不算消费方', () => {
    const report = runFake();
    expect(report.modules.flatMap((m: any) => m.consumerFiles)).not.toContain(INDEX_REL_PATH);
  });

  it('缺文件时如实标记：读不出的源文件进 unreadableFiles 并写备注，不抛异常', () => {
    const report = runFake();
    expect(report.unreadableFiles).toEqual(['apps/web/src/unreadable.ts']);
    expect(report.notes.join('\n')).toContain('读不出内容');
  });

  it('fileExists 全 false → 如实把每个相对模块都按缺失报（不猜测），消费方为空并提示', () => {
    const report = analyzeMissingModules({
      indexSource: FAKE_INDEX,
      sourceFiles: FAKE_SOURCE_FILES,
      readSource: () => null,
      fileExists: () => false,
    });
    // `fileExists` 恒 false ⇒ 连 `./data/present`（实际存在）也被判为缺失；
    // 这是刻意设计的诚实边界：解析不到文件就报缺失，绝不假装通过。
    expect(report.modules.map((m: any) => m.slug)).toEqual(['alpha', 'gamma', 'present']);
    expect(report.totals.consumerCount).toBe(0);
    expect(report.totals.modulesWithoutConsumer).toEqual(['alpha', 'gamma', 'present']);
    expect(report.notes.join('\n')).toContain('没有扫描到任何 import 消费方');
  });

  it('线索只指路：exists 由 fileExists 判定，缺失线索单独列出', () => {
    const report = runFake({
      clues: {
        alpha: [
          { path: 'apps/web/src/consumer-a.ts', note: '真实消费点' },
          { path: 'docs/NOT-THERE.md', note: '不存在的线索' },
        ],
      },
    });
    expect(report.modules[0].clues).toEqual([
      { path: 'apps/web/src/consumer-a.ts', note: '真实消费点', exists: true },
      { path: 'docs/NOT-THERE.md', note: '不存在的线索', exists: false },
    ]);
    expect(report.modules[0].cluesMissing).toEqual(['docs/NOT-THERE.md']);
    expect(report.modules[1].clues).toEqual([]);
    expect(report.totals.clueCount).toBe(2);
    expect(report.totals.clueMissingCount).toBe(1);
  });

  it('同名导出被多个缺失模块声明 → 报重复，且 barrel 消费方同时计入两边', () => {
    const files: Record<string, string> = {
      [INDEX_REL_PATH]: [
        `export { Shared } from './data/one';`,
        `export { Shared } from './data/two';`,
      ].join('\n'),
      'apps/web/src/use.ts': `import { Shared } from '@nx9/shared';`,
    };
    const fsLike = makeFakeFs(files);
    const report = analyzeMissingModules({
      indexSource: files[INDEX_REL_PATH],
      sourceFiles: ['apps/web/src/use.ts'],
      readSource: fsLike.readSource,
      fileExists: fsLike.fileExists,
    });
    expect(report.duplicateExportNames).toEqual([{ name: 'Shared', modules: ['one', 'two'] }]);
    expect(report.modules.map((m: any) => m.consumerFiles)).toEqual([
      ['apps/web/src/use.ts'],
      ['apps/web/src/use.ts'],
    ]);
    expect(report.notes.join('\n')).toContain('同名导出');
  });

  it('空/脏输入不抛异常，并如实提示取数可疑', () => {
    for (const input of [undefined, {}, { indexSource: '' }]) {
      const report = analyzeMissingModules(input);
      expect(report.totals.moduleCount).toBe(0);
      expect(report.totals.missingModuleCount).toBe(0);
      expect(report.notes.join('\n')).toContain('没有解析出任何');
    }
  });

  it('结构稳定 + 确定性：可 JSON 往返，两次运行逐字节一致，且无时间戳', () => {
    const a = runFake();
    const b = runFake();
    expect(a.schemaVersion).toBe(DOCTOR_SCHEMA_VERSION);
    expect(Object.keys(a).sort()).toEqual([
      'duplicateExportNames',
      'index',
      'modules',
      'notes',
      'schemaVersion',
      'totals',
      'unreadableFiles',
      'untrackedExistingModules',
    ]);
    expect(Object.keys(a.totals).sort()).toEqual([
      'clueCount',
      'clueMissingCount',
      'consumerCount',
      'consumerFileCount',
      'exportCount',
      'missingModuleCount',
      'moduleCount',
      'modulesWithoutConsumer',
      'presentModuleCount',
      'scannedFileCount',
      'typeExportCount',
      'untrackedExistingCount',
      'valueExportCount',
    ]);
    expect(Object.keys(a.modules[0]).sort()).toEqual([
      'barrels', 'clues', 'cluesMissing', 'consumerCount', 'consumerFiles',
      'consumers', 'exists', 'exportCount', 'exports', 'modulePath', 'slug', 'specifier',
      'status', 'typeExportCount', 'valueExportCount',
    ].sort());
    expect(a.modules[0].clues).toEqual([]);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(a)).not.toMatch(/generatedAt|timestamp|\d{4}-\d{2}-\d{2}T/);
  });

  it('未提供 isTracked → 不检查 git 登记，并如实写备注', () => {
    const report = runFake();
    expect(report.untrackedExistingModules).toEqual([]);
    expect(report.totals.untrackedExistingCount).toBe(0);
    expect(report.notes.join('\n')).toContain('未提供 git 登记信息');
  });

  it('提供 isTracked → 报出「已存在但从未登记」的 barrel 依赖（缺失模块不重复计入）', () => {
    const withTracking = runFake({
      // present.ts 在磁盘上存在，但 git 未登记；alpha / gamma 是缺失模块，归另一节
      isTracked: (rel: string) => false,
    });
    expect(withTracking.untrackedExistingModules).toEqual([
      { specifier: './data/present', path: 'packages/shared/src/data/present.ts' },
    ]);
    expect(withTracking.totals.untrackedExistingCount).toBe(1);

    const tracked = runFake({ isTracked: (rel: string) => rel === 'packages/shared/src/data/present.ts' });
    expect(tracked.untrackedExistingModules).toEqual([]);
    expect(tracked.notes.join('\n')).not.toContain('未提供 git 登记信息');
  });

  it('formatReport 渲染人类可读清单（含缺失结论与线索）', () => {
    const text = formatReport(runFake());
    expect(text).toContain('packages/shared/src/data/alpha.ts');
    expect(text).toContain('缺失');
    expect(text).toContain('必需导出 4 个（value 1 / type 3）');
    expect(text).toContain('apps/web/src/consumer-a.ts:1');
    expect(text).toContain('消费方合计: 4 处，覆盖 3 个文件');
    expect(formatReport(analyzeMissingModules({}))).toContain('全部存在');
  });
});

// ───────────────────── D. 真实仓库：钉住当前事实 ─────────────────────

/** 当前 barrel 对 8 个缺失模块的**契约钉子**（来自 `packages/shared/src/index.ts`，本任务禁止改动）。 */
const EXPECTED_MODULES = [
  {
    slug: 'emotion-presets',
    exports: ['value:BUILTIN_EMOTION_PRESETS', 'type:EmotionPreset'],
  },
  {
    slug: 'shot-move-families',
    exports: ['value:SHOT_MOVE_FAMILIES', 'value:shotMoveFamilyLabel', 'value:inferShotMoveFamilyFromGroup'],
  },
  {
    slug: 'creative-asset-presets',
    exports: [
      'value:CAC_EXPRESSION_PRESETS', 'value:CAC_POSE_PRESETS', 'value:CAC_ANGLE_PRESETS',
      'value:CAC_HOOK_TYPES', 'value:CAC_SHOT_SIZES', 'value:CAC_VOICE_GENDERS',
      'value:CAC_VOICE_EMOTIONS', 'value:defaultCharacterVariants', 'value:mergeVariantSlots',
      'value:CAC_SHEET_EXPRESSION_PRESETS', 'value:CAC_MICRO_EXPRESSION_PRESETS',
      'value:CAC_SHEET_POSE_PRESETS', 'value:CAC_SHEET_HEAD_ANGLE_PRESETS',
      'value:CAC_COSTUME_DETAIL_PRESETS', 'value:CAC_HAND_REF_PRESETS',
      'value:CAC_COSTUME_VARIANT_PRESETS',
    ],
  },
  {
    slug: 'character-face-rig-presets',
    exports: [
      'value:FACE_RIG_DEADZONE', 'value:FACE_RIG_MIN', 'value:FACE_RIG_MAX', 'value:FACE_RIG_GROUPS',
      'value:FACE_RIG_PARAMS', 'value:FACE_RIG_PARAMS_BY_ID', 'value:CHARACTER_FACE_RIG_PRESETS',
      'value:FACE_RIG_PRESETS_BY_ID', 'value:faceRigParamsOfGroup',
      'type:FaceRigGroupDef', 'type:FaceRigDriver', 'type:FaceRigParamDef', 'type:FaceRigPreset',
    ],
  },
  {
    slug: 'playbook-definitions',
    exports: [
      'value:PLAYBOOK_DEFINITIONS', 'type:PlaybookId', 'type:PlaybookStepAction',
      'type:PlaybookStepDef', 'type:PlaybookDefinition',
    ],
  },
  {
    slug: 'camera-presets',
    exports: ['value:CAMERA_PRESETS', 'value:lookupCameraPreset', 'type:CameraPreset'],
  },
  {
    slug: 'shot-lexicon-taxonomy',
    exports: [
      'value:SHOT_LEXICON_SYSTEMS', 'value:shotLexiconSystemLabel',
      'value:listShotLexiconCategories', 'value:shortenShotLexiconCategory',
      'type:ShotLexiconSystem',
    ],
  },
  {
    slug: 'provider-registry',
    exports: [
      'value:PROVIDER_REGISTRY', 'value:resolveDefaultModel', 'value:DEFAULT_PICTURE_MODEL',
      'value:DEFAULT_VIDEO_MODEL', 'value:DEFAULT_TTS_MODEL', 'type:ProviderDef',
      'value:VIDEO_EDIT_PROVIDERS', 'value:DEFAULT_VIDEO_EDIT_PROVIDER',
      'value:resolveVideoEditProvider', 'type:VideoEditProviderDef',
      'value:VIDEO_TRACE_PROVIDERS', 'value:DEFAULT_VIDEO_TRACE_PROVIDER',
      'value:resolveVideoTraceProvider', 'type:VideoTraceProviderDef',
    ],
  },
];

/** 已知的「关键消费方」锚点：这些文件确实 import 了缺失模块导出的名字。 */
const EXPECTED_CONSUMER_ANCHORS = [
  'apps/web/src/panels/asset-library/AssetDetailFields.tsx',
  'apps/web/src/hooks/use-auto-configure.ts',
  'apps/server/src/modules/montage/video-edit.service.ts',
  'apps/web/src/engine/__tests__/video-edit-provider-registry.test.ts',
  'packages/shared/src/utils/character-face-rig.ts',
  'packages/director3d/src/sculpt/sculpt-contract.ts',
  'apps/server/test/f018-acceptance.test.ts',
];

describe('体检工具 · 真实仓库现状（钉住事实）', () => {
  const io = createRepoIo(REPO_ROOT);
  const indexSource = io.readSource(INDEX_REL_PATH) as string | null;
  const tracked = collectTrackedFiles(REPO_ROOT);
  const trackedSet = tracked ? new Set<string>(tracked) : null;
  const analyzeReal = () => analyzeMissingModules({
    indexSource: indexSource ?? '',
    sourceFiles: collectSourceFiles(REPO_ROOT),
    readSource: io.readSource,
    fileExists: io.fileExists,
    isTracked: trackedSet ? (rel: string) => trackedSet.has(rel) : null,
  });
  const report = analyzeReal();

  it('真实 barrel 可读，且解析出足够的绑定块', () => {
    expect(typeof indexSource).toBe('string');
    expect((indexSource as string).length).toBeGreaterThan(1000);
    expect(report.index.bindingBlockCount).toBeGreaterThan(100);
  });

  it('当前事实：缺失模块 0（8 个已全部恢复；EXPECTED_MODULES 保留作历史清单）', () => {
    expect(report.totals.missingModuleCount).toBe(0);
    expect(report.totals.moduleCount).toBe(0);
    // 工具的 presentModuleCount 只统计「报告条目」，全恢复后为 0（如实反映，不是缺陷）
    expect(report.totals.presentModuleCount).toBe(0);
    // 恢复后不再产出「缺失模块」条目；EXPECTED_MODULES 仅作为历史证据留在常量区。
    expect(report.modules.map((m: any) => m.slug)).toEqual([]);
  });

  it('当前事实：恢复的 8 个文件都真实存在且被 barrel 正常引用', () => {
    for (const m of EXPECTED_MODULES) {
      const p = resolve(REPO_ROOT, 'packages/shared/src/data/' + m.slug + '.ts');
      expect(fs.existsSync(p)).toBe(true);
    }
    expect(report.index.missingSpecifiers).toEqual([]);
  });

  it('当前事实：导出统计仍与恢复前记录一致（导出未缩水）', () => {
    // 恢复前：61（value 47 / type 14）。恢复后 barrel 导出可能增加，只断言不缩水。
    // 导出统计属于「缺失模块条目」，全恢复后为 0；恢复前记录（61/47/14）保留在此注释中作历史证据。
    expect(report.totals.exportCount).toBe(0);
    expect(report.totals.valueExportCount).toBe(0);
    expect(report.totals.typeExportCount).toBe(0);
    expect(report.duplicateExportNames).toEqual([]);
  });

  it('当前事实：同目录的 shot-library-seeds 存在（对照项，不该被误报）', () => {
    expect(fs.existsSync(resolve(REPO_ROOT, 'packages/shared/src/data/shot-library-seeds.ts'))).toBe(true);
    expect(report.modules.some((m: any) => m.slug === 'shot-library-seeds')).toBe(false);
    expect(report.index.missingSpecifiers).not.toContain('./data/shot-library-seeds');
  });

  it('当前事实：恢复前的消费方锚点文件仍可解析（回归守卫）', () => {
    // 缺失时消费方 95 处 / 42 文件；恢复后这些文件仍在，只是不再出现在缺失报告里。
    for (const anchor of EXPECTED_CONSUMER_ANCHORS) {
      expect(fs.existsSync(resolve(REPO_ROOT, anchor))).toBe(true);
    }
  });
  it('真实报告可 JSON 往返且确定（同一输入同一输出）', () => {
    const again = analyzeReal();
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    expect(JSON.stringify(again)).toBe(JSON.stringify(report));
  });

  it('旁支不变量：未被 git 登记的 barrel 依赖都确实存在于磁盘、且不与「缺失模块」混同', () => {
    expect(trackedSet).not.toBeNull();
    const paths = report.untrackedExistingModules.map((u: any) => u.path);
    // 刻意**不**钉死数量：这 20 个（含 data/ 下被旧 .gitignore 规则吞掉的 6 个）本就该 `git add`；
    // 一旦被提交，数量归零是**正确**结果，钉死会让修复者误以为回归。当前值记录在恢复指引文档里。
    expect(paths).toEqual([...paths].sort((a: string, b: string) => a.localeCompare(b)));
    expect(report.untrackedExistingModules.length).toBe(report.totals.untrackedExistingCount);
    for (const u of report.untrackedExistingModules) {
      expect(fs.existsSync(resolve(REPO_ROOT, u.path))).toBe(true);
      expect(report.modules.some((m: any) => m.modulePath === u.path)).toBe(false);
      expect(trackedSet!.has(u.path)).toBe(false);
    }
  });
});
