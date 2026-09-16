/**
 * 组件级测试专用的 `@nx9/shared` barrel 替身（**只给测试用，不参与产品运行时**）。
 *
 * 背景（既有缺陷，本次只报不改）：
 * `packages/shared/src/index.ts` re-export 了 8 个尚不存在的 `data/*` 模块
 * （emotion-presets / shot-move-families / creative-asset-presets / character-face-rig-presets /
 *  playbook-definitions / camera-presets / shot-lexicon-taxonomy / provider-registry），
 * 任何经 `@nx9/shared` 的 import 在本机都会在**解析期**失败。
 *
 * 手法（沿用仓库既有先例 `apps/web/src/blocks/craft/__tests__/CameraMoveTimelineEditor.test.tsx`）：
 * 把 barrel 工厂指到**真实的 shared 源码模块**，断言依旧对着真实实现与真实数据，
 * 不用桩数据。这里把「哪些符号住在哪个模块」集中成一份清单，供多个组件测试文件复用。
 *
 * 清单来源：对被测组件做相对 import 传递闭包扫描，收集其 `from '@nx9/shared'` 的**运行时**符号，
 * 再把每个符号定位到 shared 源码里的定义模块（`import type` 在编译期抹除，故无需提供）。
 * 所有列出的模块都不在 `import type` 之外引用那 8 个缺失模块，因此在测试里可以真实 import。
 */

/* ───────────────── 清单：shared 运行时符号 → 源码模块 ───────────────── */

/** 多格推演 / 角色设定表：模式、计划、宫格 → 提示词映射 */
import * as multiGridPlan from '../../../../../../packages/shared/src/utils/multi-grid-plan';
/** 多格计划 → 分镜镜头（写回镜表） */
import * as multiGridToShots from '../../../../../../packages/shared/src/utils/multi-grid-to-shots';
/** 角色设定表：种类、一致性档位、计划构造 */
import * as characterSheetPlan from '../../../../../../packages/shared/src/utils/character-sheet-plan';
/** 逐帧拉片：策略、计划、导出、时间码 */
import * as frameStudyPlan from '../../../../../../packages/shared/src/utils/frame-study-plan';
/** 跨格一致性报告与「挑最优格」（ConsistencyCheckSection 的判定层） */
import * as consistencyReport from '../../../../../../packages/shared/src/utils/consistency-report';
/** 预设分组 / 画幅尺寸预设（PresetSectionPicker、PictureSizePresetChip） */
import * as presetEntrypoints from '../../../../../../packages/shared/src/utils/preset-entrypoints';
/** 画幅与出图尺寸解析 */
import * as imageGenParams from '../../../../../../packages/shared/src/utils/image-gen-params';
/** BGM 节拍 → 逐格时长 */
import * as beatGridPlan from '../../../../../../packages/shared/src/utils/beat-grid-plan';
/** 链式分镜台交接（写回镜表相关） */
import * as chainStoryboard from '../../../../../../packages/shared/src/utils/chain-storyboard';
/** 剧本拆解 → 镜头：资产绑定 / 扁平化 */
import * as scriptBreakdown from '../../../../../../packages/shared/src/types/script-breakdown';
/** 剧本拆解生产化：配置与提示词模板归一 */
import * as scriptBreakdownProduction from '../../../../../../packages/shared/src/utils/script-breakdown-production';
/** 分镜台存档 / 回收站 */
import * as assetTrash from '../../../../../../packages/shared/src/utils/asset-trash';
import * as scriptDeskArchives from '../../../../../../packages/shared/src/utils/script-desk-archives';
/** 剧本包（ScreenplayPackage）判定与全文 */
import * as screenplayPackage from '../../../../../../packages/shared/src/types/screenplay-package';
/** 工作区 / 剧本字典的空态与迁移 */
import * as storyboardTypes from '../../../../../../packages/shared/src/types/storyboard';
import * as characterTypes from '../../../../../../packages/shared/src/types/character';
import * as soundTypes from '../../../../../../packages/shared/src/types/sound-library';
import * as styleTypes from '../../../../../../packages/shared/src/types/style-library';
import * as environmentTypes from '../../../../../../packages/shared/src/types/environment';
import * as backlotTemplates from '../../../../../../packages/shared/src/data/backlot-templates';
import * as canvasTheme from '../../../../../../packages/shared/src/utils/canvas-theme';
/** 出品方 / 模型连接（useConnectedPictureModels 走这里） */
import * as genModels from '../../../../../../packages/shared/src/data/gen-models';
/** 上游取数 / 节点交互 / 块目录 / 运行标签 */
import * as flowGraph from '../../../../../../packages/shared/src/engine/flow-graph';
import * as nodeInteraction from '../../../../../../packages/shared/src/catalog/node-interaction';
import * as blockCatalog from '../../../../../../packages/shared/src/catalog/block-catalog';
import * as runLabels from '../../../../../../packages/shared/src/utils/run-labels';
import * as resolveUpstreamShots from '../../../../../../packages/shared/src/utils/resolve-upstream-shots';
/** 手册进度 / 下一步建议 */
import * as playbookEpisodeProgress from '../../../../../../packages/shared/src/utils/playbook-episode-progress';
import * as playbookReadiness from '../../../../../../packages/shared/src/utils/playbook-readiness';
/** 3D 导演台：遮挡布局预设（BlockingPresetPanel 用） */
import * as blockingLayout from '../../../../../../packages/shared/src/utils/blocking-layout';

const MODULES: ReadonlyArray<Record<string, unknown>> = [
  multiGridPlan,
  multiGridToShots,
  characterSheetPlan,
  frameStudyPlan,
  consistencyReport,
  presetEntrypoints,
  imageGenParams,
  beatGridPlan,
  chainStoryboard,
  scriptBreakdown,
  scriptBreakdownProduction,
  assetTrash,
  scriptDeskArchives,
  screenplayPackage,
  storyboardTypes,
  characterTypes,
  soundTypes,
  styleTypes,
  environmentTypes,
  backlotTemplates,
  canvasTheme,
  genModels,
  flowGraph,
  nodeInteraction,
  blockCatalog,
  runLabels,
  resolveUpstreamShots,
  playbookEpisodeProgress,
  playbookReadiness,
  blockingLayout,
];

/**
 * 被测组件真正会**在运行时取值**的符号白名单。
 * 只有出现在这里（或被 MODULES 覆盖）的符号才可能在渲染期被读到；
 * 缺符号时给出点名报错，而不是让 vitest 抛出难懂的「No export defined」。
 */
const REQUIRED_VALUE_SYMBOLS = [
  // multi-grid-plan
  'MULTI_GRID_CLIP_SEC', 'MULTI_GRID_MODES', 'buildMultiGridPlanForMode', 'lookupMultiGridModeDef',
  'planCellsToGridCellPrompts', 'planToGridReverseResult', 'readMultiGridMode',
  // multi-grid-to-shots
  'buildMultiGridShotPreviewRows', 'insertMultiGridShotsIntoBreakdown', 'planMultiGridShots',
  // character-sheet-plan
  'CHARACTER_SHEET_CONSISTENCY_LEVELS', 'CHARACTER_SHEET_KINDS', 'buildCharacterSheetPlan',
  'characterSheetPlanToGridCells', 'characterSheetPlanToGridResult', 'characterSheetSubjectFromProfile',
  'lookupCharacterSheetKindDef', 'readCharacterSheetConsistency', 'readCharacterSheetKind',
  // frame-study-plan
  'FRAME_STUDY_DEFAULT_ASPECT', 'FRAME_STUDY_STRATEGIES', 'buildFrameStudyExportFileName',
  'buildFrameStudyPlan', 'buildFrameStudyShotPreviewRows', 'describeFrameStudyPlan',
  'formatFrameStudyTimecode', 'frameStudyToStoryboardShots', 'lookupFrameStudyStrategy',
  'mergeFrameStudyReversals', 'planFrameStudyShots', 'readFrameStudyMode', 'serializeFrameStudy',
  // consistency-report
  'buildConsistencyReport', 'pickBestCell',
  // preset-entrypoints
  'PICTURE_SIZE_PRESET_OPTIONS', 'PRESET_SECTION_LABELS', 'PRESET_SECTION_PRESETS',
  'buildSectionPrompt', 'groupPromptPresets', 'matchPictureGenSize', 'pictureSizePresetPatch',
  'readPresetSections', 'withSectionPrompt',
  // image-gen-params
  'IMAGE_ASPECT_OPTIONS', 'resolveImageRequestSize',
  // beat-grid-plan
  'distributeSegmentBoundaries', 'planCellDurationsFromBeats', 'sanitizeBeats',
  // chain-storyboard
  'CHAIN_STORYBOARD_HANDOFF_HASH_SCHEMA_VERSION', 'activeChainEpisodeShots', 'buildChainStoryboardPayload',
  'chainStoryboardHash', 'hygieneChainStoryboard', 'lineArtVersionHash',
  'mergeStoryboardShotFromBreakdown', 'migrateGlobalToChainStoryboard', 'patchChainShot',
  'readChainStoryboard',
  // script-breakdown / production
  'bindStoryboardShotAssets', 'flattenScriptBreakdownShots', 'storyboardShotsFromScriptBreakdown',
  'normalizeScriptBreakdownConfig', 'normalizeScriptBreakdownPrompts',
  // 资产 / 存档
  'createMediaTrashItem', 'purgeAssetById', 'purgeExpiredAssets', 'restoreAssetById', 'softDeleteAssetById',
  'createScriptDeskFolderSnapshot', 'renameScriptDeskDraft', 'restoreScriptDeskFolderFromTrash',
  'trashScriptDeskFolder', 'upsertScriptDeskWorkingDraft',
  // 剧本包
  'isScreenplayPackage', 'screenplayFullText',
  // 字典空态 / 迁移
  'activeEpisodeShots', 'createEpisodeMeta', 'emptyStoryboard', 'emptyVoice', 'listEpisodeMetas',
  'migrateStoryboardPayload', 'resolveActiveEpisodeId', 'emptyCharacterLibrary', 'emptySoundLibrary',
  'emptyStyleLibrary', 'emptyBacklotCustom', 'emptyBacklotWorkspace', 'migrateEnvironmentProfile',
  'DEFAULT_CANVAS_APPEARANCE', 'resolveNextStep',
  'hydrateEpisodePlaybookProgress', 'switchPlaybookEpisode', 'syncCurrentEpisodePlaybookProgress',
  // 模型 / 连线
  'DEFAULT_PICTURE_GEN_MODEL_ID', 'listConnectedPictureModels', 'resolvePictureModelForRequest',
  // 图 / 节点
  'gatherUpstream', 'resolveNodeInteraction', 'lookupBlock', 'resolveRunLabel',
  'resolveUpstreamShotsFromGraph',
  // 3D 遮挡布局
  'blockingCameraPatch', 'blockingLayoutLabel', 'listBlockingCameraPresets', 'listBlockingLayouts',
  'solveBlockingLayout',
];

/**
 * 「被污染」符号：只有这一类符号所在的模块，其**运行时**依赖链会碰到缺失的
 * `data/creative-asset-presets`（`utils/collect-used-assets.ts` → `utils/asset-library.ts`
 * → `utils/creative-asset-prompts.ts` → 缺失）。默认 MODULES 里刻意不含它。
 *
 * 需要它的测试文件（角色设定表工作区）在文件顶部额外 `vi.mock` 掉那条链上的**叶子**
 * `utils/creative-asset-prompts`，再用 `loadPoisonedBarrelExtras()` 在 mock 生效后动态取
 * **真实的** `collect-used-assets`：因此 `stripAssetPinRevision` 仍是真实实现，只有那个
 * 无人调用的叶子 `resolveAssetPromptText` 被换成「一被调用就抛错」的哨兵
 * （宁可炸，也不静默给错值）。
 */
export const POISONED_VALUE_SYMBOLS = ['stripAssetPinRevision'] as const;

/**
 * 被污染的叶子模块（在 `src/engine/__tests__/*.test.tsx` 里 `vi.mock` 时用这个字符串；
 * `vi.mock` 的路径按**调用它的测试文件**解析，故这里是 5 级上跳）。
 */
export const POISONED_LEAF_SPECIFIER =
  '../../../../../packages/shared/src/utils/creative-asset-prompts';

let cached: Record<string, unknown> | null = null;

/** 在叶子被 mock 之后，把「被污染」符号的真实实现取回来当作 barrel 追加项 */
export async function loadPoisonedBarrelExtras(): Promise<Record<string, unknown>> {
  const mod = await import('../../../../../../packages/shared/src/utils/collect-used-assets');
  const extras: Record<string, unknown> = {};
  for (const name of POISONED_VALUE_SYMBOLS) {
    const value = (mod as Record<string, unknown>)[name];
    if (typeof value === 'undefined') {
      throw new Error(`被污染模块未导出 ${name}：请核对 POISONED_VALUE_SYMBOLS 清单`);
    }
    extras[name] = value;
  }
  return extras;
}

/**
 * 合并所有真实 shared 模块，得到可直接当作 `@nx9/shared` 的命名空间对象。
 * 结果做单次缓存：同一测试文件内多次调用返回同一份对象。
 */
export function buildSharedBarrelMock(
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  if (cached) return cached;
  const merged: Record<string, unknown> = {};
  for (const mod of MODULES) {
    for (const [key, value] of Object.entries(mod)) {
      if (key === 'default') continue;
      merged[key] = value;
    }
  }
  Object.assign(merged, extras);
  const missing = REQUIRED_VALUE_SYMBOLS.filter((name) => typeof merged[name] === 'undefined');
  if (missing.length > 0) {
    throw new Error(
      'barrel 替身缺少运行时导出（请把对应模块加进 MODULES）：' + missing.join(', '),
    );
  }
  cached = merged;
  return merged;
}
