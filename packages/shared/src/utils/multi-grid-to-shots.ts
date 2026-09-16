/**
 * multi-grid-to-shots.ts — 「多格推演 → 分镜镜头」映射纯函数层（增量新增）。
 *
 * 职责：把一次多格推演计划（`MultiGridPlan`）映射成可写入分镜台的镜头数据。
 * 本文件**只做纯数据转换与纯数据插入**，不落库、不开弹层、不写节点：
 * - `multiGridCellsToShots` / `planMultiGridShots`：计划 → `StoryboardShot[]`（镜表面）；
 * - `multiGridShotsToBreakdownShots` / `insertMultiGridShotsIntoBreakdown`：
 *   镜头 → 分镜台拆镜结构（`ScriptBreakdownShot`），供分镜台按自身口径重算链镜表；
 * - `describeMultiGridShotPlan` / `buildMultiGridShotPreviewRows`：写回前的人工确认摘要。
 *
 * 约定（与 multi-grid-plan / multi-grid-closure 同口径）：
 * - 纯函数：无 IO、无副作用、不改入参、输入输出可 JSON 序列化、**不抛异常**；
 * - **不编造源头**：源图缺失 / 格图缺失 / 上游镜表缺失 / 景别标签未命中映射表时，
 *   如实返回 `warnings` 并把对应字段留空，绝不假绿；
 * - **不新增持久化字段**：机位坐标、焦距、高度等推演建议值只写进既有字段
 *   （`descriptionZh` / `notes` / `cameraMove`），不落地任何新字段名；
 * - 出图、写节点、写全局镜表等副作用一律留在调用方（MultiGridWorkspace）。
 *
 * 与 multi-grid-closure 的图层面回写分工：
 * - 本文件负责「镜头」这一层（新增镜、序号、景别、时长、提示词）；
 * - `multi-grid-closure.buildMultiGridShotPatch` 负责「图」这一层（已出图的格 → 既有镜首帧）。
 *   两者可先后使用：先建镜，再逐格写首帧。
 */
import type { MultiGridCell, MultiGridMode, MultiGridPlan } from '../types/multi-grid';
import type { ScriptBreakdownPayload, ScriptBreakdownShot } from '../types/script-breakdown';
import type { ShotType, StoryboardShot } from '../types/storyboard';
import { MULTI_GRID_CLIP_SEC, lookupMultiGridModeDef } from './multi-grid-plan';
import { buildCameraMovePrompt } from '../data/camera-move-library';

/* ────────────────────────── 常量 ────────────────────────── */

/** 生成镜头 id 前缀：与 `shot-*` / `shot-manual-*` / `shot-grid-*` 等既有前缀不冲突 */
export const MULTI_GRID_SHOT_ID_PREFIX = 'shot-mgrid';

/** 防重键前缀（随节点 data 持久化，用于「同一计划 + 同一批 id 不重复追加」） */
export const MULTI_GRID_SHOT_WRITEBACK_KEY_PREFIX = 'mgw';

/** 多机位 / 画面推演的单镜默认时长（秒），与既有宫格视频提示词口径一致 */
export const MULTI_GRID_SHOT_DEFAULT_DURATION_SEC = MULTI_GRID_CLIP_SEC;

/** 剧情推演四宫格各节拍时长（秒，起因 → 冲突 → 转折 → 收束），递增 */
export const MULTI_GRID_STORY_BEAT_DURATIONS_SEC: readonly number[] = [2, 3, 4, 5];

/** 单镜时长上限（秒）：超出按上限收敛并在告警里如实说明 */
export const MULTI_GRID_SHOT_MAX_DURATION_SEC = 120;

/** 景别标签 → StoryboardShot.shotType 映射表（先精确匹配，再关键词匹配） */
const SHOT_SIZE_EXACT: Record<string, ShotType> = {
  大远景: 'extreme-wide',
  远景: 'wide',
  全景: 'wide',
  中景: 'medium',
  近景: 'close',
  特写: 'close',
  ews: 'extreme-wide',
  els: 'extreme-wide',
  ws: 'wide',
  fs: 'wide',
  ls: 'wide',
  ms: 'medium',
  mcu: 'close',
  cu: 'close',
  ecu: 'close',
  ots: 'medium',
  'extreme wide shot': 'extreme-wide',
  'extreme wide': 'extreme-wide',
  'extreme long shot': 'extreme-wide',
  'wide shot': 'wide',
  'full shot': 'wide',
  'long shot': 'wide',
  wide: 'wide',
  'medium shot': 'medium',
  medium: 'medium',
  'medium close up': 'close',
  'medium closeup': 'close',
  'close shot': 'close',
  'close up': 'close',
  closeup: 'close',
  close: 'close',
};

/** 关键词兜底：按数组顺序命中即用（长词在前，避免「大远景」被「远景」截胡） */
const SHOT_SIZE_KEYWORDS: readonly { keyword: string; shotType: ShotType }[] = [
  { keyword: '大远景', shotType: 'extreme-wide' },
  { keyword: 'extreme wide', shotType: 'extreme-wide' },
  { keyword: 'extreme long', shotType: 'extreme-wide' },
  { keyword: '远景', shotType: 'wide' },
  { keyword: '全景', shotType: 'wide' },
  { keyword: 'wide', shotType: 'wide' },
  { keyword: 'full shot', shotType: 'wide' },
  { keyword: 'long shot', shotType: 'wide' },
  { keyword: '中景', shotType: 'medium' },
  { keyword: 'medium', shotType: 'medium' },
  { keyword: '特写', shotType: 'close' },
  { keyword: '近景', shotType: 'close' },
  { keyword: 'close', shotType: 'close' },
];

/** shotType → 分镜台拆镜景别枚举（拆镜结构没有 extreme-wide，收敛到 WS 并在文档中标注） */
const SHOT_TYPE_TO_BREAKDOWN_SIZE: Record<ShotType, ScriptBreakdownShot['shotSize']> = {
  close: 'CU',
  medium: 'MS',
  wide: 'WS',
  'extreme-wide': 'WS',
  custom: undefined,
};

/** shotType → 中文景别（预览行与摘要用） */
export const MULTI_GRID_SHOT_TYPE_LABELS_ZH: Record<ShotType, string> = {
  close: '近景',
  medium: '中景',
  wide: '全景',
  'extreme-wide': '大远景',
  custom: '自定义景别',
};

/** 分镜台拆镜结构允许的运镜枚举（写链时可自由文本，写拆镜结构必须落在这 7 个值里） */
const BREAKDOWN_CAMERA_MOVES = ['固定', '推', '拉', '摇', '移', '跟', '手持'] as const;

/** 剧情推演四宫格的节拍名（与构造器的四幕节拍一一对应） */
const STORY_SHOT_BEATS: readonly { zh: string; en: string }[] = [
  { zh: '起因', en: 'setup' },
  { zh: '冲突', en: 'escalation' },
  { zh: '转折', en: 'turn' },
  { zh: '收束 · 钩子', en: 'resolution and hook' },
];

/** 多机位 / 画面推演的建议运镜：构造器给的是「固定或微推」「保持同一机位」，这里取固定锁机 */
const MULTI_GRID_STATIC_MOVE_IDS = ['static-locked-off'];

/* ────────────────────────── 基础工具 ────────────────────────── */

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** 与 chain-storyboard 同族的稳定短哈希（本模块不依赖其运行时，故就地实现一份） */
function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** 景别标签归一化：小写、把 -_/ 视为空格、压缩空白 */
function normalizeShotSizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 景别标签 → shotType。命中映射表返回 `matched:true`；
 * 未命中（含标签为空 / 该模式没有景别语义）返回 `custom` 且 `matched:false`，由调用方如实告警。
 */
export function shotTypeFromShotSizeLabel(
  label: string | null | undefined,
): { shotType: ShotType; matched: boolean } {
  const normalized = normalizeShotSizeLabel(trimmed(label));
  if (!normalized) return { shotType: 'custom', matched: false };
  const exact = SHOT_SIZE_EXACT[normalized];
  if (exact) return { shotType: exact, matched: true };
  for (const item of SHOT_SIZE_KEYWORDS) {
    if (normalized.includes(item.keyword)) return { shotType: item.shotType, matched: true };
  }
  return { shotType: 'custom', matched: false };
}

/** 单镜时长收敛：[1, MULTI_GRID_SHOT_MAX_DURATION_SEC]，非有限值回落兜底值 */
function clampDurationSec(
  value: number,
  fallback: number,
): { durationSec: number; clamped: boolean } {
  if (!Number.isFinite(value) || value <= 0) return { durationSec: fallback, clamped: true };
  if (value > MULTI_GRID_SHOT_MAX_DURATION_SEC) {
    return { durationSec: MULTI_GRID_SHOT_MAX_DURATION_SEC, clamped: true };
  }
  if (value < 1) return { durationSec: 1, clamped: true };
  return { durationSec: round3(value), clamped: false };
}

function cellIndexOf(cell: MultiGridCell, fallback: number): number {
  const raw = Number(cell?.cellIndex);
  return Number.isInteger(raw) && raw >= 0 ? raw : fallback;
}

function timeOffsetOf(cell: MultiGridCell): number {
  const raw = Number(cell?.timeOffsetSec);
  return Number.isFinite(raw) ? raw : 0;
}

/* ────────────────────────── 类型 ────────────────────────── */

export type MultiGridShotWarningCode =
  | 'invalid-plan'
  | 'no-cells'
  | 'no-source-url'
  | 'no-upstream'
  | 'missing-cell-image'
  | 'unknown-shot-size'
  | 'no-shot-size-mode'
  | 'clamped-duration';

export interface MultiGridShotWarning {
  code: MultiGridShotWarningCode;
  messageZh: string;
}

/** 上游镜表可写目标（分集归属 + 序号续接基准） */
export interface MultiGridTargetEpisode {
  episodeId: string | null;
  episodeIndex: number | null;
  episodeTitle: string | null;
  /** 该分集的上游镜头（按 index 升序） */
  scopedShots: StoryboardShot[];
  /** 新镜头的起始序号（上游该集末镜序号 + 1） */
  startIndex: number;
}

export interface MultiGridShotIdInput {
  mode: MultiGridMode;
  plan: MultiGridPlan;
  cell: MultiGridCell;
  cellIndex: number;
  /** 本批内的生成次序（0 起，已按时间 / 格序排好） */
  order: number;
}

export interface MultiGridCellsToShotsOptions {
  /** 上游链镜表镜头：用于序号续接、分集继承、时间基准（缺省时按 1 起序号并告警） */
  upstreamShots?: readonly StoryboardShot[];
  /** 上游当前分集 id（如 chain.activeEpisodeId）；缺省按上游末镜所属分集 */
  episodeId?: string | null;
  episodeIndex?: number | null;
  episodeTitle?: string | null;
  /** 起始序号覆盖（缺省：上游该集末镜序号 + 1） */
  startIndex?: number;
  /** 统一单镜时长（秒）；按模式的默认建议值仍保留（缺省见各模式规则） */
  defaultDurationSec?: number;
  /** 逐格时长覆盖（按 cell.cellIndex 索引），优先级最高 */
  cellDurationsSec?: readonly (number | undefined)[];
  /** 已出图的格图 URL（按 cell.cellIndex 索引）；提供则写入对应镜的 firstFrameAssetId */
  cellImageUrls?: readonly (string | undefined)[];
  /** id 生成器注入（缺省 `buildMultiGridShotId`，同输入必同输出） */
  idFactory?: (input: MultiGridShotIdInput) => string;
}

export interface MultiGridShotPlanResult {
  ok: boolean;
  mode: MultiGridMode;
  /** 生成的镜头（不落库）；计划不可用时为空数组 */
  shots: StoryboardShot[];
  /** 首个镜头的序号 */
  startIndex: number;
  /** 末个镜头序号 + 1（供后续批次续号） */
  nextIndex: number;
  targetEpisode: MultiGridTargetEpisode;
  warnings: MultiGridShotWarning[];
  /** 防重键：同一计划 + 同一批镜头（id/序号/景别/时长）得到同一个键 */
  key: string;
  /** 可读摘要（供 UI 预览与确认） */
  summaryZh: string;
}

export interface MultiGridShotPreviewRow {
  index: number;
  /** 景别标签优先取计划里的原始标签，缺省回落 shotType 中文名 */
  shotSizeLabel: string;
  shotType: ShotType;
  durationSec: number;
  descriptionZh: string;
}

/* ────────────────────────── ① 上游分集 / 序号续接 ────────────────────────── */

/**
 * 解析生成镜头的分集归属与起始序号。
 * 优先级：显式 episodeId > 上游末镜所属分集；序号按「该分集末镜序号 + 1」续接。
 * 上游镜表不可得时如实返回 `startIndex: 1`（并由调用方告警，不假装续号成功）。
 */
export function resolveMultiGridTargetEpisode(
  upstreamShots: readonly StoryboardShot[] | undefined,
  options: {
    episodeId?: string | null;
    episodeIndex?: number | null;
    episodeTitle?: string | null;
    startIndex?: number;
  } = {},
): MultiGridTargetEpisode {
  const shots = Array.isArray(upstreamShots) ? upstreamShots.filter(Boolean) : [];
  const explicit = trimmed(options.episodeId) || null;
  const sorted = [...shots].sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0));
  const last = sorted[sorted.length - 1];
  const targetEpisodeId = explicit ?? (trimmed(last?.episodeId) || null);
  const scopedShots = targetEpisodeId
    ? sorted.filter((shot) => trimmed(shot.episodeId) === targetEpisodeId)
    : sorted;
  const anchor = scopedShots[scopedShots.length - 1] ?? last;
  const maxIndex = scopedShots.reduce(
    (max, shot) => (Number.isFinite(Number(shot.index)) ? Math.max(max, Number(shot.index)) : max),
    0,
  );
  const override = Number(options.startIndex);
  const overrideIndex = Number(options.episodeIndex);
  const overrideTitle = trimmed(options.episodeTitle);
  return {
    episodeId: targetEpisodeId,
    episodeIndex: Number.isFinite(overrideIndex) && overrideIndex > 0
      ? overrideIndex
      : Number.isFinite(Number(anchor?.episodeIndex))
        ? Number(anchor?.episodeIndex)
        : null,
    episodeTitle: overrideTitle || trimmed(anchor?.episodeTitle) || null,
    scopedShots,
    startIndex:
      Number.isInteger(override) && override > 0 ? override : maxIndex + 1,
  };
}

/* ────────────────────────── ② 单镜 id ────────────────────────── */

/**
 * 默认 id 生成器：`shot-mgrid-<mode>-<cellIndex>-<hash8>`。
 * 同一次推演（同模式 / 同源图 / 同格 / 同提示词）必得同一 id —— 这是防重与「重复写回」判定的一部分；
 * 提示词被改写后 id 随之改变，便于把改写结果作为新镜写回。
 */
export function buildMultiGridShotId(input: MultiGridShotIdInput): string {
  const { plan, cell, cellIndex } = input;
  const seed = [
    plan?.mode ?? '',
    trimmed(plan?.sourceUrl),
    String(cellIndex),
    trimmed(cell?.role),
    trimmed(cell?.imagePrompt),
    trimmed(cell?.shotSizeLabel),
    trimmed(cell?.cameraAngleLabel),
  ].join('|');
  return `${MULTI_GRID_SHOT_ID_PREFIX}-${plan?.mode ?? 'unknown'}-${cellIndex}-${stableHash(seed)}`;
}

/* ────────────────────────── ③ 文案（中英字段） ────────────────────────── */

function cameraSuggestionZh(cell: MultiGridCell): string {
  const parts: string[] = [];
  const focal = Number(cell?.focalLengthMm);
  const height = Number(cell?.cameraHeightM);
  if (Number.isFinite(focal) && focal > 0) parts.push(`等效焦距约 ${focal}mm`);
  if (Number.isFinite(height) && height > 0) parts.push(`机位高度约 ${height}m`);
  const hint = trimmed(cell?.cameraPositionHint);
  if (hint) parts.push(hint);
  return parts.join('；');
}

function notesForCell(input: {
  mode: MultiGridMode;
  modeLabel: string;
  cell: MultiGridCell;
  cellIndex: number;
  totalCells: number;
}): string {
  const { mode, modeLabel, cell, cellIndex, totalCells } = input;
  const parts = [`多格推演（${modeLabel}）第 ${cellIndex + 1}/${totalCells} 格`];
  if (trimmed(cell?.role)) parts.push(`格语义：${trimmed(cell.role)}`);
  if (mode === 'frame-predict') {
    const offset = timeOffsetOf(cell);
    parts.push(
      offset < 0
        ? `时间基准：源图前 ${Math.abs(offset)} 秒`
        : offset > 0
          ? `时间基准：源图后 ${offset} 秒`
          : '时间基准：源图当前帧（不重新出图）',
    );
  }
  const suggestion = cameraSuggestionZh(cell);
  if (suggestion) parts.push(`建议机位：${suggestion}`);
  if (cell?.reuseSourceImage === true) parts.push('本格直接复用源图');
  if (cell?.promptEdited === true) parts.push('提示词已在多格推演面板改写');
  parts.push('机位 / 焦距 / 高度均为推演建议值，非对源图的实测结论');
  return parts.join(' · ');
}

function descriptionForCell(input: {
  mode: MultiGridMode;
  modeLabel: string;
  cell: MultiGridCell;
  cellIndex: number;
  order: number;
  totalCells: number;
}): string {
  const { mode, modeLabel, cell, cellIndex, order, totalCells } = input;
  const head = `【${modeLabel} · 第 ${cellIndex + 1}/${totalCells} 格】`;
  const measure = [trimmed(cell?.cameraAngleLabel), trimmed(cell?.shotSizeLabel)]
    .filter(Boolean)
    .join(' · ');
  const focal = Number(cell?.focalLengthMm);
  const height = Number(cell?.cameraHeightM);
  const tail = [
    Number.isFinite(focal) && focal > 0 ? `${focal}mm` : '',
    Number.isFinite(height) && height > 0 ? `机位高 ${height}m` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  if (mode === 'frame-predict') {
    const offset = timeOffsetOf(cell);
    const when =
      offset < 0
        ? `时间回溯 ${Math.abs(offset)} 秒（源图之前）`
        : offset > 0
          ? `时间推进 ${offset} 秒（源图之后）`
          : '当前帧：直接引用源图，不重新出图';
    return `${head}${when}；与源图同一主体、同一场景、同一光线，动作与构图保持可衔接。`;
  }
  if (mode === 'story-predict-4') {
    const beat = STORY_SHOT_BEATS[order] ?? STORY_SHOT_BEATS[STORY_SHOT_BEATS.length - 1]!;
    return (
      `${head}${beat.zh}（${trimmed(cell?.role) || beat.zh}）：` +
      '以上游关键帧为同一主体与同一场景，本镜只推进剧情与人物动作，不改变人物身份与场景。'
    );
  }
  const moveZh = trimmed(cell?.cameraPositionHint);
  return (
    `${head}${measure ? `${measure}；` : ''}` +
    '以上游关键帧为同一主体与同一场景，本镜只改变机位与景别。' +
    (tail ? `（建议参数 ${tail}${moveZh ? `；${moveZh}` : ''}）` : '')
  );
}

function videoPromptForCell(input: {
  mode: MultiGridMode;
  cell: MultiGridCell;
  durationSec: number;
}): string {
  const { mode, cell, durationSec } = input;
  const moveEn = buildCameraMovePrompt(MULTI_GRID_STATIC_MOVE_IDS, { lang: 'en' });
  const moveClause = moveEn ? `${moveEn}; ` : '';
  const base = `about ${durationSec} seconds; subject, wardrobe, location and lighting match the reference frame`;
  if (mode === 'frame-predict') {
    const offset = timeOffsetOf(cell);
    const when =
      offset < 0
        ? `step back ${Math.abs(offset)} seconds in time`
        : offset > 0
          ? `advance ${offset} seconds in time`
          : 'hold the current frame';
    return (
      `${when}: ${moveClause}` +
      `continuous action and lighting, no jump cuts, same camera position, ${base}.`
    );
  }
  if (mode === 'story-predict-4') {
    return (
      `Story beat shot: advance the story action on this frame, end on this composition, ${base}.`
    );
  }
  const angle = trimmed(cell?.cameraAngleLabel) || trimmed(cell?.role);
  const size = trimmed(cell?.shotSizeLabel);
  return (
    `Multi-camera shot${angle ? `, ${angle}` : ''}${size ? `, ${size}` : ''}: ` +
    `${moveClause}only this camera position changes, ${base}.`
  );
}

/** 多机位 / 画面推演的建议运镜（写进既有 `cameraMove` 字段；剧情推演无运镜语义则不写） */
function cameraMoveForCell(mode: MultiGridMode): string | undefined {
  if (mode === 'story-predict-4') return undefined;
  return '固定';
}

/* ────────────────────────── ④ 主映射 ────────────────────────── */

function emptyTargetEpisode(): MultiGridTargetEpisode {
  return {
    episodeId: null,
    episodeIndex: null,
    episodeTitle: null,
    scopedShots: [],
    startIndex: 1,
  };
}

function failedPlan(mode: MultiGridMode, messageZh: string): MultiGridShotPlanResult {
  return {
    ok: false,
    mode,
    shots: [],
    startIndex: 1,
    nextIndex: 1,
    targetEpisode: emptyTargetEpisode(),
    warnings: [{ code: 'invalid-plan', messageZh }],
    key: '',
    summaryZh: messageZh,
  };
}

function modeOf(plan: MultiGridPlan | undefined | null): MultiGridMode {
  const mode = (plan as MultiGridPlan | undefined)?.mode;
  return mode === 'multi-cam-9'
    || mode === 'multi-cam-25'
    || mode === 'story-predict-4'
    || mode === 'frame-predict'
    ? mode
    : 'multi-cam-9';
}

/** 排序：画面推演按时间偏移（过去 → 当前 → 未来），其余按格序（行优先） */
function orderedCells(plan: MultiGridPlan): { cell: MultiGridCell; cellIndex: number }[] {
  const list = (plan.cells ?? []).map((cell, i) => ({ cell, cellIndex: cellIndexOf(cell, i) }));
  if (plan.mode === 'frame-predict') {
    return list.sort(
      (a, b) => timeOffsetOf(a.cell) - timeOffsetOf(b.cell) || a.cellIndex - b.cellIndex,
    );
  }
  return list.sort((a, b) => a.cellIndex - b.cellIndex);
}

/** 各模式默认单镜时长（在无逐格 / 全局覆盖时使用） */
function defaultDurationFor(input: {
  mode: MultiGridMode;
  cell: MultiGridCell;
  order: number;
}): number {
  const { mode, cell, order } = input;
  if (mode === 'story-predict-4') {
    return MULTI_GRID_STORY_BEAT_DURATIONS_SEC[order] ?? MULTI_GRID_SHOT_DEFAULT_DURATION_SEC;
  }
  if (mode === 'frame-predict') {
    const offset = Math.abs(timeOffsetOf(cell));
    if (offset > 0) return Math.min(offset, MULTI_GRID_SHOT_MAX_DURATION_SEC);
    return MULTI_GRID_SHOT_DEFAULT_DURATION_SEC;
  }
  return MULTI_GRID_SHOT_DEFAULT_DURATION_SEC;
}

/**
 * 计划 → 分镜镜头（含告警 / 防重键 / 分集与序号解析）。
 * 这是写回 UI 使用的完整结果；只要镜头生成成功，`ok` 为 true（告警不影响落库）。
 */
export function planMultiGridShots(
  plan: MultiGridPlan | undefined | null,
  options: MultiGridCellsToShotsOptions = {},
): MultiGridShotPlanResult {
  const mode = modeOf(plan);
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.cells)) {
    return failedPlan(mode, '推演计划不可用（缺少 cells）：未生成任何镜头（不编造）');
  }
  const modeLabel = lookupMultiGridModeDef(plan.mode).label;
  const warnings: MultiGridShotWarning[] = [];
  const cells = orderedCells(plan);
  const totalCells = cells.length;
  if (totalCells === 0) {
    return failedPlan(mode, '推演计划没有任何格：未生成镜头（请先在多格推演面板生成计划）');
  }

  const sourceUrl = trimmed(plan.sourceUrl);
  if (!sourceUrl) {
    warnings.push({
      code: 'no-source-url',
      messageZh:
        '计划缺少源图地址：复用源图的格不会写入首帧（firstFrameAssetId 留空，不编造素材）。',
    });
  }

  const targetEpisode = resolveMultiGridTargetEpisode(options.upstreamShots, {
    episodeId: options.episodeId,
    episodeIndex: options.episodeIndex,
    episodeTitle: options.episodeTitle,
    startIndex: options.startIndex,
  });
  if (targetEpisode.scopedShots.length === 0) {
    warnings.push({
      code: 'no-upstream',
      messageZh:
        '未取得上游链镜表（chainStoryboard）：本批序号从 1 开始，可能与该集既有镜头重号，请在分镜台核对后再写回。',
    });
  }

  const cellUrl = (cellIndex: number): string =>
    trimmed(options.cellImageUrls?.[cellIndex]);
  const perCellDuration = (cellIndex: number): number | undefined => {
    const raw = Number(options.cellDurationsSec?.[cellIndex]);
    return Number.isFinite(raw) && raw > 0 ? raw : undefined;
  };
  const globalDuration = (() => {
    const raw = Number(options.defaultDurationSec);
    return Number.isFinite(raw) && raw > 0 ? raw : undefined;
  })();

  const idFactory = options.idFactory ?? buildMultiGridShotId;
  const shots: StoryboardShot[] = [];
  let unknownSizeCount = 0;
  let missingImageCount = 0;
  let clampedCount = 0;

  cells.forEach(({ cell, cellIndex }, order) => {
    const sizeLabel = trimmed(cell?.shotSizeLabel);
    const mapped = shotTypeFromShotSizeLabel(sizeLabel);
    if (!mapped.matched) unknownSizeCount += 1;
    const fallbackDuration = defaultDurationFor({ mode, cell, order });
    const candidateDuration =
      perCellDuration(cellIndex) ?? globalDuration ?? fallbackDuration;
    const { durationSec, clamped } = clampDurationSec(candidateDuration, fallbackDuration);
    if (clamped) clampedCount += 1;

    const cellImageUrl = cellUrl(cellIndex);
    const reuseSource = cell?.reuseSourceImage === true;
    const firstFrameUrl = cellImageUrl || (reuseSource ? sourceUrl : '');
    const imagesProvided = Array.isArray(options.cellImageUrls);
    if (!firstFrameUrl && imagesProvided) missingImageCount += 1;
    else if (!firstFrameUrl && reuseSource && !sourceUrl) missingImageCount += 1;

    const descriptionZh = descriptionForCell({
      mode,
      modeLabel,
      cell,
      cellIndex,
      order,
      totalCells,
    });
    const videoPromptEn = videoPromptForCell({ mode, cell, durationSec });

    shots.push({
      id: idFactory({ mode, plan, cell, cellIndex, order }),
      episodeId: targetEpisode.episodeId,
      episodeIndex: targetEpisode.episodeIndex,
      episodeTitle: targetEpisode.episodeTitle,
      index: targetEpisode.startIndex + order,
      durationSec,
      shotType: mapped.shotType,
      descriptionZh,
      promptEn: trimmed(cell?.imagePrompt),
      videoPromptEn,
      firstFrameAssetId: firstFrameUrl || null,
      keyframeStatus: firstFrameUrl ? 'review' : 'draft',
      status: firstFrameUrl ? 'review' : 'draft',
      videoStatus: 'draft',
      cameraMove: cameraMoveForCell(mode),
      notes: notesForCell({ mode, modeLabel, cell, cellIndex, totalCells }),
      characterIds: [],
      characterNames: [],
    });
  });

  if (unknownSizeCount > 0) {
    warnings.push({
      code: mode === 'story-predict-4' || mode === 'frame-predict' ? 'no-shot-size-mode' : 'unknown-shot-size',
      messageZh:
        mode === 'story-predict-4' || mode === 'frame-predict'
          ? `该模式不在计划里给出景别：${unknownSizeCount} 个镜头的 shotType 记为 custom，可在分镜台按叙事需要调整。`
          : `有 ${unknownSizeCount} 个格的景别标签未命中映射表：shotType 记为 custom，请在分镜台核对。`,
    });
  }
  if (missingImageCount > 0) {
    warnings.push({
      code: 'missing-cell-image',
      messageZh: `有 ${missingImageCount} 个格还没有可用图：对应镜头 firstFrameAssetId 留空（请在分镜台或本面板补出图后再写首帧）。`,
    });
  }
  if (clampedCount > 0) {
    warnings.push({
      code: 'clamped-duration',
      messageZh: `有 ${clampedCount} 个镜头的时长超出 1–${MULTI_GRID_SHOT_MAX_DURATION_SEC}s 区间，已按边界收敛。`,
    });
  }

  const cleanWarnings = warnings.filter((w) => trimmed(w.messageZh).length > 0);
  const startIndex = targetEpisode.startIndex;
  return {
    ok: shots.length > 0,
    mode,
    shots,
    startIndex,
    nextIndex: startIndex + shots.length,
    targetEpisode,
    warnings: cleanWarnings,
    key: buildMultiGridShotWritebackKey(plan, shots),
    summaryZh: describeMultiGridShotPlan(shots),
  };
}

/** 计划 → 分镜镜头（不落库的纯数据；需要告警 / 防重键时用 `planMultiGridShots`） */
export function multiGridCellsToShots(
  plan: MultiGridPlan | undefined | null,
  options: MultiGridCellsToShotsOptions = {},
): StoryboardShot[] {
  return planMultiGridShots(plan, options).shots;
}

/* ────────────────────────── ⑤ 防重键 / 摘要 ────────────────────────── */

/**
 * 防重键：同一计划 + 同一批镜头（id / 序号 / 景别 / 时长）必得同一个键。
 * 记录在调用方节点 data（如 `multiGridShotWriteback.key`），用于「同一批不重复追加」判定。
 */
export function buildMultiGridShotWritebackKey(
  plan: MultiGridPlan | undefined | null,
  shots: readonly StoryboardShot[],
): string {
  const seed = [
    trimmed(plan?.mode),
    trimmed(plan?.sourceUrl),
    shots
      .map((shot) => `${trimmed(shot.id)}:${shot.index}:${shot.shotType}:${shot.durationSec}`)
      .join('|'),
  ].join('#');
  return `${MULTI_GRID_SHOT_WRITEBACK_KEY_PREFIX}-${stableHash(seed)}`;
}

/** 预览行（序号 / 景别 / 时长 / 描述），供 UI 确认清单直接渲染 */
export function buildMultiGridShotPreviewRows(
  shots: readonly StoryboardShot[],
): MultiGridShotPreviewRow[] {
  return (Array.isArray(shots) ? (shots as readonly StoryboardShot[]) : []).map((shot) => ({
    index: Number(shot.index),
    shotSizeLabel:
      MULTI_GRID_SHOT_TYPE_LABELS_ZH[shot.shotType] ?? MULTI_GRID_SHOT_TYPE_LABELS_ZH.custom,
    shotType: shot.shotType,
    durationSec: Number(shot.durationSec) || 0,
    descriptionZh: trimmed(shot.descriptionZh),
  }));
}

/** 可读摘要（首行汇总 + 逐镜一行），供写回前人工确认 */
export function describeMultiGridShotPlan(shots: readonly StoryboardShot[]): string {
  const list = Array.isArray(shots) ? (shots as readonly StoryboardShot[]).filter(Boolean) : [];
  if (list.length === 0) {
    return '本批没有可生成的镜头：请先连接源图并生成推演计划。';
  }
  const indices = list.map((shot) => Number(shot.index)).filter((n) => Number.isFinite(n));
  const minIndex = indices.length ? Math.min(...indices) : 0;
  const maxIndex = indices.length ? Math.max(...indices) : 0;
  const totalSec = round3(list.reduce((sum, shot) => sum + (Number(shot.durationSec) || 0), 0));
  const episode =
    trimmed(list[0]?.episodeTitle) || trimmed(list[0]?.episodeId) || '当前分集（未指定）';
  const head =
    `将新增 ${list.length} 个镜头到「${episode}」：序号 ${minIndex}–${maxIndex}，` +
    `时长合计 ${totalSec}s`;
  const rows = list.map((shot) => {
    const row = buildMultiGridShotPreviewRows([shot])[0]!;
    const desc = row.descriptionZh.length > 48
      ? `${row.descriptionZh.slice(0, 48)}…`
      : row.descriptionZh;
    return `#${row.index} ${row.shotSizeLabel} · ${row.durationSec}s · ${desc}`;
  });
  return [head, ...rows].join('\n');
}

/* ────────────────────────── ⑥ 分镜台拆镜结构插入 ────────────────────────── */

function breakdownCameraMove(value: string | null | undefined): ScriptBreakdownShot['cameraMove'] {
  const move = trimmed(value);
  return (BREAKDOWN_CAMERA_MOVES as readonly string[]).includes(move)
    ? (move as ScriptBreakdownShot['cameraMove'])
    : undefined;
}

function compactTitle(descriptionZh: string, fallback: string): string {
  const text = trimmed(descriptionZh).replace(/^【[^】]*】/, '').trim();
  return text.slice(0, 24) || fallback;
}

export interface MultiGridBreakdownConvertOptions {
  episodeId: string;
  episodeIndex: number;
  /** 插入锚点（该集末镜）：场次归属沿用锚点，缺省时空字符串 */
  anchor?: ScriptBreakdownShot | null;
}

/**
 * 镜头 → 分镜台拆镜镜头。
 * 场次（sceneId / sceneCode / scene）沿用锚点：多格推演以源图为同一主体与同一场景基准，
 * 锚点缺省时留空字符串（不编造场次）。
 */
export function multiGridShotsToBreakdownShots(
  shots: readonly StoryboardShot[],
  options: MultiGridBreakdownConvertOptions,
): ScriptBreakdownShot[] {
  const anchor = options.anchor ?? null;
  return (Array.isArray(shots) ? (shots as readonly StoryboardShot[]) : []).map((shot, i) => {
    const index = Number.isFinite(Number(shot?.index)) && Number(shot.index) > 0
      ? Number(shot.index)
      : i + 1;
    const size = SHOT_TYPE_TO_BREAKDOWN_SIZE[shot?.shotType ?? 'custom'];
    const move = breakdownCameraMove(shot?.cameraMove);
    return {
      id: trimmed(shot?.id),
      episodeId: options.episodeId,
      episodeIndex: options.episodeIndex,
      index,
      sceneId: anchor?.sceneId ?? '',
      sceneCode: anchor?.sceneCode ?? '',
      title: compactTitle(trimmed(shot?.descriptionZh), `多格推演 ${index}`),
      durationSec: Number(shot?.durationSec) > 0
        ? Number(shot.durationSec)
        : MULTI_GRID_SHOT_DEFAULT_DURATION_SEC,
      ...(size ? { shotSize: size } : {}),
      ...(move ? { cameraMove: move } : {}),
      characters: [],
      scene: anchor?.scene ?? '',
      scriptText: trimmed(shot?.descriptionZh),
      dialogue: [],
      imagePrompt: trimmed(shot?.promptEn),
      videoPrompt: trimmed(shot?.videoPromptEn),
      ...(trimmed(shot?.notes) ? { continuityNotes: [trimmed(shot?.notes)] } : {}),
      status: 'draft' as const,
    };
  });
}

export interface MultiGridBreakdownInsertResult {
  ok: boolean;
  /** 成功时为新的拆镜结构；未变更时为 undefined（调用方据此不做写回） */
  payload?: ScriptBreakdownPayload;
  episodeId: string | null;
  insertedIds: string[];
  reasonZh: string;
}

/**
 * 把生成镜头插入分镜台拆镜结构的指定分集（**纯函数**，返回新对象，不改入参）。
 * 分镜台的链镜表由拆镜结构派生，因此插入拆镜结构才能让新镜在分镜台 / 下游持久可见。
 */
export function insertMultiGridShotsIntoBreakdown(
  payload: ScriptBreakdownPayload | undefined,
  shots: readonly StoryboardShot[],
  options: { episodeId?: string | null } = {},
): MultiGridBreakdownInsertResult {
  const list = (Array.isArray(shots) ? (shots as readonly StoryboardShot[]) : []).filter((shot) => trimmed(shot?.id));
  if (!payload || !Array.isArray(payload.episodes) || payload.episodes.length === 0) {
    return {
      ok: false,
      episodeId: null,
      insertedIds: [],
      reasonZh: '分镜台还没有拆镜结果（scriptBreakdown）：无法把镜头写进分镜台（不静默失败）',
    };
  }
  if (list.length === 0) {
    return {
      ok: false,
      episodeId: null,
      insertedIds: [],
      reasonZh: '没有可插入的镜头：请先生成推演计划',
    };
  }
  const requestedId = trimmed(options.episodeId);
  const target =
    (requestedId ? payload.episodes.find((ep) => ep.id === requestedId) : undefined)
    ?? payload.episodes[0]!;
  if (requestedId && target.id !== requestedId) {
    return {
      ok: false,
      episodeId: null,
      insertedIds: [],
      reasonZh: `分镜台里没有分集「${requestedId}」：请在分镜台切到该集后重试（不写到别的集）`,
    };
  }

  const next = JSON.parse(JSON.stringify(payload)) as ScriptBreakdownPayload;
  const episode = next.episodes.find((ep) => ep.id === target.id)!;
  const existingIds = new Set(
    next.episodes.flatMap((ep) => ep.shots.map((shot) => trimmed(shot.id))),
  );
  const fresh = list.filter((shot) => !existingIds.has(trimmed(shot.id)));
  if (fresh.length === 0) {
    return {
      ok: false,
      episodeId: episode.id,
      insertedIds: [],
      reasonZh: '这批镜头已存在于分镜台镜表中（同 id）：未重复插入',
    };
  }
  const anchor = episode.shots[episode.shots.length - 1] ?? null;
  const inserted = multiGridShotsToBreakdownShots(fresh, {
    episodeId: episode.id,
    episodeIndex: episode.index,
    anchor,
  });
  episode.shots = [...episode.shots, ...inserted].map((shot, i) => ({ ...shot, index: i + 1 }));
  return {
    ok: true,
    payload: next,
    episodeId: episode.id,
    insertedIds: inserted.map((shot) => shot.id),
    reasonZh: '',
  };
}

/**
 * 从链镜表读「该分集末镜」锚点信息（分镜台拆镜结构插入的场次归属依据）。
 * 只读消费，不做推断；链镜表不可得时返回空锚点。
 */
export function resolveMultiGridBreakdownAnchor(
  payload: ScriptBreakdownPayload | undefined,
  episodeId: string | null | undefined,
): { episodeId: string | null; episodeIndex: number; anchor: ScriptBreakdownShot | null } {
  const episodes = payload?.episodes ?? [];
  const targetId = trimmed(episodeId);
  const episode =
    (targetId ? episodes.find((ep) => ep.id === targetId) : undefined) ?? episodes[0] ?? null;
  if (!episode) return { episodeId: null, episodeIndex: 0, anchor: null };
  return {
    episodeId: episode.id,
    episodeIndex: episode.index,
    anchor: episode.shots[episode.shots.length - 1] ?? null,
  };
}
