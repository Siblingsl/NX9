/**
 * multi-grid-closure.ts — 「多格推演」生产闭环的纯函数层。
 *
 * 职责（全部无副作用，输入输出可 JSON 序列化）：
 * 1. 逐格状态机：从节点 data 推导每格「待跑 / 出图中 / 成功 / 失败 / 后台待续查」；
 * 2. 续查合并：把 resumePendingImageTasks 的返回按 taskId → 格号合并回结果数组；
 * 3. 镜表回写：算「哪一格写哪一镜」，并给出与 writePictureShotPatch 同义的 shot patch；
 * 4. 接触表：按既有宫格拼合服务（/api/grid/compose）的版面口径预算画布尺寸与格位。
 *
 * 约束：本文件**不引入任何运行时依赖**——对 `@nx9/shared` 只做 `import type`（打包时整体擦除），
 * 因此可在 packages/shared barrel 缺陷未修复前用相对路径直接单测；
 * 出图、落盘、写回节点等副作用一律留在 multi-grid-ops.ts 与 MultiGridWorkspace.tsx。
 */
import type { MultiGridCell } from '@nx9/shared';

/* ────────────────────────── ① 逐格状态机 ────────────────────────── */

export type MultiGridCellStatus = 'idle' | 'running' | 'success' | 'failed' | 'remote';

export interface MultiGridCellRunState {
  index: number;
  role: string;
  status: MultiGridCellStatus;
  /** 该格当前图 URL（成功格才有） */
  url: string;
  error?: string;
  /** 后台异步任务 id（状态为 remote 时必有） */
  taskId?: string;
  /** 该格直接复用源图，不出图 */
  reuseSourceImage: boolean;
}

export interface MultiGridCellFailure {
  index: number;
  role: string;
  error: string;
}

/** 每格一条的后台待续查任务（taskId → 格号） */
export interface MultiGridPendingCellTask {
  taskId: string;
  cellIndex: number;
  prompt?: string;
}

export interface MultiGridProgressSummary {
  total: number;
  /** 已拿到图（含复用源图）的格数 */
  done: number;
  failed: number;
  running: number;
  remote: number;
  idle: number;
  /** 尚未拿到图的格数 = total - done */
  outstanding: number;
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 格号上限：计划格数最大 25（多机位 25 宫格），这里给一个远高于任何真实计划的宽裕上界。
 *
 * 用途：结果数组是按格号逐位补空撑出来的（`while (urls.length <= index) urls.push('')`），
 * 若持久化 / 手改数据里出现异常格号（如 `index: 2000000`），逐位补空会一次性分配百万级元素
 * 并卡住渲染。超出上界的格号一律按「非法」处理，回落为按位序号（与既有非法值口径一致）。
 */
const MAX_CELL_INDEX = 1024;

/** 读取格号：非整数 / 负数 / 超上界 → 回落为传入的按位序号。 */
function readCellIndex(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > MAX_CELL_INDEX) return fallback;
  return n;
}

/** 写入时是否接受该格号（与 `readCellIndex` 同一上界，避免越界补空） */
function isWritableCellIndex(index: unknown): index is number {
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index <= MAX_CELL_INDEX;
}

function readCellList(data: Record<string, unknown>): MultiGridCell[] {
  const stored = data.multiGridCells;
  if (Array.isArray(stored) && stored.length > 0) return stored as MultiGridCell[];
  const plan = data.multiGridPlan as { cells?: unknown } | undefined;
  if (plan && Array.isArray(plan.cells) && plan.cells.length > 0) {
    return plan.cells as MultiGridCell[];
  }
  return [];
}

/**
 * 逐格图 URL，按格号对齐（缺格为空串）。
 * 读取既有 `gridCells`（GridCellPrompt[]），不新增存放位置。
 */
export function readMultiGridCellUrls(data: Record<string, unknown>): string[] {
  const cells = Array.isArray(data.gridCells) ? (data.gridCells as unknown[]) : [];
  const urls: string[] = [];
  cells.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return;
    const cell = raw as { index?: unknown; cellImageUrl?: unknown };
    const index = readCellIndex(cell.index, i);
    while (urls.length <= index) urls.push('');
    const url = toTrimmedString(cell.cellImageUrl);
    if (url) urls[index] = url;
  });
  return urls;
}

/** 后台待续查任务（按格号升序）；缺格号的历史任务无法定位，直接跳过。 */
export function readMultiGridPendingTasks(
  data: Record<string, unknown>,
): MultiGridPendingCellTask[] {
  const raw = Array.isArray(data.multiGridPendingTasks)
    ? (data.multiGridPendingTasks as unknown[])
    : Array.isArray(data.pendingImageTasks)
      ? (data.pendingImageTasks as unknown[])
      : [];
  const seen = new Set<string>();
  const out: MultiGridPendingCellTask[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as { taskId?: unknown; cellIndex?: unknown; prompt?: unknown };
    const taskId = toTrimmedString(entry.taskId);
    const cellIndex = Number(entry.cellIndex);
    if (!taskId || !Number.isInteger(cellIndex) || cellIndex < 0) continue;
    if (seen.has(taskId)) continue;
    seen.add(taskId);
    const prompt = toTrimmedString(entry.prompt);
    out.push({ taskId, cellIndex, ...(prompt ? { prompt } : {}) });
  }
  return out.sort((a, b) => a.cellIndex - b.cellIndex);
}

function readFailureList(data: Record<string, unknown>): MultiGridCellFailure[] {
  const last = data.lastResult as { failures?: unknown } | undefined;
  const raw = Array.isArray(last?.failures) ? (last!.failures as unknown[]) : [];
  const out: MultiGridCellFailure[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as { index?: unknown; role?: unknown; error?: unknown };
    const index = Number(entry.index);
    if (!Number.isInteger(index) || index < 0) continue;
    out.push({
      index,
      role: toTrimmedString(entry.role) || `第 ${index + 1} 格`,
      error: toTrimmedString(entry.error) || '生成失败',
    });
  }
  return out;
}

/**
 * 从节点 data 推导逐格状态。
 * 优先级：有图 = 成功 > 该格有后台任务 = remote > 本轮在跑 = running > 在失败清单 = failed > idle。
 * 历史任务无法定位格号时不会把格子误标成 remote（宁可显示待跑，也不假绿）。
 */
export function readMultiGridCellRunStates(
  data: Record<string, unknown>,
): MultiGridCellRunState[] {
  const planCells = readCellList(data);
  const urls = readMultiGridCellUrls(data);
  const failures = readFailureList(data);
  const failureByIndex = new Map(failures.map((f) => [f.index, f]));
  const pendingByIndex = new Map(
    readMultiGridPendingTasks(data).map((t) => [t.cellIndex, t]),
  );
  const running = data.status === 'running';
  const total = Math.max(planCells.length, urls.length);
  const states: MultiGridCellRunState[] = [];
  for (let i = 0; i < total; i += 1) {
    const cell = planCells[i];
    const url = (urls[i] ?? '').trim();
    const pending = pendingByIndex.get(i);
    const failure = failureByIndex.get(i);
    let status: MultiGridCellStatus;
    if (url) status = 'success';
    else if (pending) status = 'remote';
    else if (running) status = 'running';
    else if (failure) status = 'failed';
    else status = 'idle';
    states.push({
      index: i,
      role: cell?.role?.trim() || `第 ${i + 1} 格`,
      status,
      url,
      ...(failure && !url && !pending && !running ? { error: failure.error } : {}),
      ...(pending ? { taskId: pending.taskId } : {}),
      reuseSourceImage: cell?.reuseSourceImage === true,
    });
  }
  return states;
}

export function summarizeMultiGridProgress(
  states: MultiGridCellRunState[],
): MultiGridProgressSummary {
  const summary: MultiGridProgressSummary = {
    total: states.length,
    done: 0,
    failed: 0,
    running: 0,
    remote: 0,
    idle: 0,
    outstanding: 0,
  };
  for (const state of states) {
    if (state.status === 'success') summary.done += 1;
    else if (state.status === 'failed') summary.failed += 1;
    else if (state.status === 'running') summary.running += 1;
    else if (state.status === 'remote') summary.remote += 1;
    else summary.idle += 1;
  }
  summary.outstanding = summary.total - summary.done;
  return summary;
}

/**
 * 选出需要重跑的格号：成功格一律保留，绝不重打。
 * - 传 requested 时：只在其范围内，且剔除已成功 / 正在跑的格；
 * - 不传时：全部非成功格（失败 / 后台待续查 / 待跑）。
 */
export function selectMultiGridRetryIndexes(
  states: MultiGridCellRunState[],
  requested?: number[],
): number[] {
  const byIndex = new Map(states.map((s) => [s.index, s]));
  const candidates = Array.isArray(requested)
    ? [...new Set(requested)].filter((i) => Number.isInteger(i) && byIndex.has(i)).sort((a, b) => a - b)
    : states.map((s) => s.index);
  return candidates.filter((i) => {
    const state = byIndex.get(i)!;
    if (state.status === 'success') return false;
    if (state.status === 'running' && Array.isArray(requested)) return false;
    return true;
  });
}

/* ────────────────────────── ② 续查合并 ────────────────────────── */

/** resumePendingImageTasks 的返回值中，我们只消费这三项 */
export interface ResumedPendingTasksResult<T> {
  urls: string[];
  stillPending: T[];
  failed: T[];
}

/**
 * `resumePendingImageTasks` 只返回成功 URL 列表（不带 taskId），
 * 这里按「未出现在 stillPending / failed 里的任务」还原成功任务的先后次序——
 * 与实现同序（成功即 push url，其余分入两个数组），因此可稳定配对。
 */
export function pairResumedTaskUrls<T extends { taskId: string }>(
  tasks: T[],
  stillPending: T[],
  failed: T[],
  urls: string[],
): { task: T; url: string }[] {
  const settled = new Set<string>();
  for (const t of [...stillPending, ...failed]) settled.add(t.taskId);
  const succeeded = tasks.filter((t) => !settled.has(t.taskId));
  const pairs: { task: T; url: string }[] = [];
  for (let i = 0; i < succeeded.length && i < urls.length; i += 1) {
    const url = toTrimmedString(urls[i]);
    if (url) pairs.push({ task: succeeded[i]!, url });
  }
  return pairs;
}

/**
 * 续查合并：把后台取回的 URL 按格号写回结果数组（既有格图保留），
 * 返回新数组与「哪些格被补齐」。不修改入参。
 */
export function mergeResumedCellUrls(
  existingUrls: (string | undefined)[],
  pairs: { cellIndex: number; url: string }[],
  cellCount?: number,
): { urls: (string | undefined)[]; filled: number[]; length: number } {
  const valid = Array.isArray(pairs) ? pairs.filter((p) => isWritableCellIndex(p?.cellIndex)) : [];
  const maxIndex = valid.reduce((max, p) => Math.max(max, p.cellIndex), -1);
  const length = Math.max(cellCount ?? 0, existingUrls.length, maxIndex + 1);
  const urls: (string | undefined)[] = [];
  for (let i = 0; i < length; i += 1) {
    const url = toTrimmedString(existingUrls[i]);
    urls.push(url ? url : undefined);
  }
  const filled: number[] = [];
  for (const pair of valid) {
    const url = toTrimmedString(pair.url);
    if (!url) continue;
    if (!urls[pair.cellIndex]?.trim()) filled.push(pair.cellIndex);
    urls[pair.cellIndex] = url;
  }
  return { urls, filled: filled.sort((a, b) => a - b), length };
}

/** 把某几格的图替换 / 追加进结果数组（逐格重试与删除共用），不修改入参。 */
export function applyCellUrls(
  existingUrls: (string | undefined)[],
  updates: { cellIndex: number; url: string | undefined }[],
  cellCount?: number,
): (string | undefined)[] {
  const valid = Array.isArray(updates) ? updates.filter((u) => isWritableCellIndex(u?.cellIndex)) : [];
  const maxIndex = valid.reduce((max, u) => Math.max(max, u.cellIndex), -1);
  const length = Math.max(cellCount ?? 0, existingUrls.length, maxIndex + 1);
  const urls: (string | undefined)[] = [];
  for (let i = 0; i < length; i += 1) {
    const url = toTrimmedString(existingUrls[i]);
    urls.push(url ? url : undefined);
  }
  for (const update of valid) {
    if (update.cellIndex >= length) continue;
    const url = toTrimmedString(update.url);
    urls[update.cellIndex] = url ? url : undefined;
  }
  return urls;
}

/** 密排非空格图（下游 splitUrls / pictures 用） */
export function compactCellUrls(urls: (string | undefined)[]): string[] {
  return urls.map((u) => toTrimmedString(u)).filter((u) => u.length > 0);
}

/* ────────────────────────── ③ 镜表回写 ────────────────────────── */

/** 与 StoryboardShot 首帧三字段同构的镜头补丁形状（供 writePictureShotPatch 的 Partial<StoryboardShot> 位） */
export interface MultiGridShotPatch {
  firstFrameAssetId: string;
  keyframeStatus: 'review';
  status: 'review';
}

/**
 * 与 writePictureShotPatch 同义的镜头补丁：只写首帧与审阅态，
 * 不改动既有镜表字段契约（与图像工作区逐字一致）。
 */
export function buildMultiGridShotPatch(url: string): MultiGridShotPatch {
  return {
    firstFrameAssetId: url,
    keyframeStatus: 'review',
    status: 'review',
  };
}

export interface MultiGridWriteTarget {
  cellIndex: number;
  shotId: string;
}

export interface MultiGridWriteBackPlan {
  ok: boolean;
  /** 不 ok 时的明确原因（用于面板提示，不静默失败） */
  reason: string;
  targets: MultiGridWriteTarget[];
  /** 有图但没能定位镜头的格号 */
  unassigned: number[];
  /** 镜数不足被跳过的格号（整组写入） */
  skipped: { cellIndex: number; reason: string }[];
}

export const MULTI_GRID_NO_UPSTREAM_REASON =
  '上游未连接分镜台镜表（chainStoryboard）：请把分镜台 / 导演台连到本节点左侧，或先把本节点接到分镜链下游';

/**
 * 逐格写入目标：优先用户指定，其次「同序号镜头」，越界回落第 1 镜。
 * 多机位 / 画面推演只锁 1 镜时，所有格默认都指向该镜，逐格点选即可。
 */
export function resolveMultiGridCellShotId(
  cellIndex: number,
  shotIds: string[],
  overrides?: Record<string, string> | undefined,
): string | undefined {
  const ids = shotIds.map((id) => toTrimmedString(id)).filter(Boolean);
  if (ids.length === 0) return undefined;
  const override = toTrimmedString(overrides?.[String(cellIndex)]);
  if (override && ids.includes(override)) return override;
  return ids[cellIndex] ?? ids[0];
}

/**
 * 计算本次写入的镜表落点。
 * - cellIndexes 缺省 = 全部已出图的格；
 * - 逐格写入（spread=false）：每格按 resolveMultiGridCellShotId；
 * - 整组写入（spread=true）：按「格序 ↔ 镜序」一一对应，镜数不足的格如实跳过（不回落同镜反复覆盖）。
 */
export function buildMultiGridWriteBackPlan(options: {
  cellIndexes?: number[];
  cellUrls: (string | undefined)[];
  shotIds: string[];
  overrides?: Record<string, string> | undefined;
  spread?: boolean;
}): MultiGridWriteBackPlan {
  const { cellUrls, shotIds, overrides } = options;
  const spread = options.spread === true;
  const ids = shotIds.map((id) => toTrimmedString(id)).filter(Boolean);
  const withImage = (options.cellIndexes ?? cellUrls.map((_, i) => i)).filter((i) => {
    const url = toTrimmedString(cellUrls[i]);
    return url.length > 0;
  });

  if (ids.length === 0) {
    return {
      ok: false,
      reason: MULTI_GRID_NO_UPSTREAM_REASON,
      targets: [],
      unassigned: withImage,
      skipped: [],
    };
  }
  if (withImage.length === 0) {
    return {
      ok: false,
      reason: '当前没有已出图的格：请先出图，再写入分镜',
      targets: [],
      unassigned: [],
      skipped: [],
    };
  }

  const targets: MultiGridWriteTarget[] = [];
  const skipped: { cellIndex: number; reason: string }[] = [];
  let unassigned: number[] = [];
  for (const cellIndex of withImage) {
    const override = toTrimmedString(overrides?.[String(cellIndex)]);
    if (spread && !override) {
      const shotId = ids[cellIndex];
      if (!shotId) {
        skipped.push({
          cellIndex,
          reason: `上游只有 ${ids.length} 镜，第 ${cellIndex + 1} 格没有对应镜头`,
        });
        continue;
      }
      targets.push({ cellIndex, shotId });
      continue;
    }
    if (override && !ids.includes(override)) {
      skipped.push({ cellIndex, reason: '指定的目标镜头已不在上游镜表中' });
      continue;
    }
    const shotId = resolveMultiGridCellShotId(cellIndex, ids, overrides);
    if (!shotId) {
      unassigned.push(cellIndex);
      continue;
    }
    targets.push({ cellIndex, shotId });
  }

  return {
    ok: targets.length > 0,
    reason: targets.length > 0 ? '' : '未解析到任何可写入的镜头',
    targets,
    unassigned,
    skipped,
  };
}

/** 目标镜头在镜表里的可读名（面板文案与日志共用） */
export function describeMultiGridShotTarget(shot: { index?: number } | undefined): string {
  const index = Number(shot?.index);
  return Number.isInteger(index) ? `镜头 #${index + 1}` : '目标镜头';
}

/* ────────────────────────── ④ 接触表拼版 ────────────────────────── */

/**
 * 店面口径镜像：apps/server/src/modules/grid/grid.service.ts#composeGrid。
 * 单测按同一公式校验，客户端只做「预算版面 / 估尺寸」，实际拼合仍走服务端。
 */
export const CONTACT_SHEET_METRICS = {
  cellW: 480,
  cellH: 300,
  titleH: 28,
  gap: 10,
  pad: 14,
} as const;

export interface ContactSheetGridLayout {
  rows: number;
  cols: number;
  count: number;
  cellW: number;
  cellH: number;
  titleH: number;
  gap: number;
  pad: number;
  canvasW: number;
  canvasH: number;
  cells: { index: number; left: number; top: number }[];
}

export function computeContactSheetGridLayout(options: {
  rows: number;
  cols: number;
  cellCount: number;
}): ContactSheetGridLayout {
  const metrics = CONTACT_SHEET_METRICS;
  const cellCount = Math.max(0, Math.trunc(options.cellCount));
  const safeCols = Math.max(1, Math.trunc(options.cols));
  const safeRows = Math.max(1, Math.trunc(options.rows), Math.ceil(cellCount / safeCols) || 1);
  const panelW = metrics.cellW;
  const panelH = metrics.titleH + metrics.cellH;
  const canvasW = metrics.pad * 2 + safeCols * panelW + (safeCols - 1) * metrics.gap;
  const canvasH = metrics.pad * 2 + safeRows * panelH + (safeRows - 1) * metrics.gap;
  const count = Math.min(cellCount, safeRows * safeCols);
  const cells: { index: number; left: number; top: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const r = Math.floor(i / safeCols);
    const c = i % safeCols;
    cells.push({
      index: i,
      left: metrics.pad + c * (panelW + metrics.gap),
      top: metrics.pad + r * (panelH + metrics.gap),
    });
  }
  return {
    rows: safeRows,
    cols: safeCols,
    count,
    cellW: metrics.cellW,
    cellH: metrics.cellH,
    titleH: metrics.titleH,
    gap: metrics.gap,
    pad: metrics.pad,
    canvasW,
    canvasH,
    cells,
  };
}

export interface ContactSheetCells {
  /** 与格位一一对应的图 URL；缺图格用源图占位以保住格位对齐 */
  imageUrls: string[];
  labels: string[];
  /** 用占位图顶上的格号 */
  placeholderIndexes: number[];
}

/**
 * 组装接触表的逐格输入（服务端 /api/grid/compose 会按数组顺序铺格）。
 * 缺图格用源图占位：既保住「第 N 格 = 第 N 机位 / 第 N 节拍」的对位，也不假绿——
 * 占位格号由调用方在 message 中如实播报。
 */
export function buildContactSheetCells(options: {
  cells: { cellIndex: number; role: string }[];
  urls: (string | undefined)[];
  sourceUrl: string;
}): ContactSheetCells {
  const { cells, urls } = options;
  const sourceUrl = toTrimmedString(options.sourceUrl);
  const imageUrls: string[] = [];
  const labels: string[] = [];
  const placeholderIndexes: number[] = [];
  cells.forEach((cell, i) => {
    const index = Number.isInteger(cell.cellIndex) ? cell.cellIndex : i;
    const url = toTrimmedString(urls[index]);
    if (url) {
      imageUrls.push(url);
    } else {
      imageUrls.push(sourceUrl);
      placeholderIndexes.push(index);
    }
    labels.push(`${index + 1}. ${cell.role}`);
  });
  return { imageUrls, labels, placeholderIndexes };
}

/** 与既有分镜故事板大图同口径的过期签名（结构 / 图序变更即失效） */
export function buildMultiGridContactSheetSignature(
  urls: (string | undefined)[],
  roles: string[],
): string {
  return urls
    .map((url, i) => `${i}:${toTrimmedString(url)}:${toTrimmedString(roles[i])}`)
    .join('|');
}

/** 导出文件名沿用既有 `<kind>-sheet-<ts>.<ext>` 约定，扩展名跟随服务端产物 */
export function buildContactSheetFileName(url: string, now = Date.now()): string {
  const match = /\.(png|jpe?g|webp)(\?|$)/i.exec(url ?? '');
  const ext = match ? match[1]!.toLowerCase().replace('jpeg', 'jpg') : 'png';
  return `multi-grid-sheet-${now}.${ext}`;
}

/* ────────────────────────── ⑤ 结果回写 payload ────────────────────────── */

/**
 * 逐格结果 → 节点 data 回写补丁（与首轮批量出图完全同构，下游契约不变）。
 * gridCells / gridReverseResult 由调用方用 shared 的纯转换器算好传入，
 * 本函数只做「取非空图、汇总失败、写进度」，不碰 shared 运行时。
 */
export function buildMultiGridResultPatch(input: {
  mode: string;
  cellCount: number;
  cellUrls: (string | undefined)[];
  failures: MultiGridCellFailure[];
  gridCells: unknown[];
  gridReverseResult: unknown;
  pendingTasks?: MultiGridPendingCellTask[];
  model?: string;
  message?: string;
  progress?: { done: number; total: number };
}): Record<string, unknown> {
  const filled = compactCellUrls(input.cellUrls);
  const gridCells = Array.isArray(input.gridCells)
    ? (input.gridCells as { videoPromptZh?: string; videoPrompt?: string }[])
    : [];
  const pendingTasks = input.pendingTasks ?? [];
  const total = input.cellCount;
  return {
    gridCells: input.gridCells,
    gridReverseResult: input.gridReverseResult,
    splitUrls: filled,
    pictures: filled,
    previewUrls: filled,
    previewUrl: filled[0],
    imageCount: filled.length,
    content: gridCells
      .map((c) => c.videoPromptZh || c.videoPrompt)
      .filter(Boolean)
      .join('\n\n'),
    output: gridCells.map((c) => c.videoPrompt).filter(Boolean).join('\n\n'),
    lastResult: {
      count: filled.length,
      total,
      urls: filled,
      failures: input.failures,
      model: input.model,
      mode: input.mode,
    },
    batchProgress: input.progress ?? { done: total, total },
    multiGridPendingTasks: pendingTasks.length ? pendingTasks : undefined,
    pendingImageTasks: pendingTasks.length
      ? pendingTasks.map((t) => ({ taskId: t.taskId, prompt: t.prompt, cellIndex: t.cellIndex }))
      : undefined,
    pendingImageTaskId: pendingTasks[0]?.taskId,
    message: input.message,
  };
}

/** 逐格失败汇总文案（前 3 条具名，其余计数） */
export function describeMultiGridFailures(
  failures: MultiGridCellFailure[],
  total: number,
): string | undefined {
  if (failures.length === 0) return undefined;
  const head = failures
    .slice(0, 3)
    .map((f) => `${f.role}（${f.error}）`)
    .join('；');
  const rest = failures.length > 3 ? ` 等 ${failures.length} 格` : '';
  return `${failures.length}/${total} 格出图失败：${head}${rest}`;
}

/** 后台待续查文案（与图像工作区同口径） */
export function describeMultiGridPending(
  pendingTasks: MultiGridPendingCellTask[],
): string | undefined {
  if (pendingTasks.length === 0) return undefined;
  return `${pendingTasks.length} 格的图片任务仍在后台生成，可点「续查未完成格」取回`;
}

/* ────────────────────────── ⑥ 资产库登记 ────────────────────────── */

/** 与 upsertBacklotWorkspace 入参同构（kind 只取场景 / 道具，沿用图像工作区入库口径） */
export interface MultiGridAssetEntry {
  id: string;
  kind: 'scene' | 'prop';
  label: string;
  promptEn: string;
  revision: number;
  creative: { coverUrl: string; referenceUrls: string[] };
}

/**
 * 单格结果入库条目：封面与参考图同为该格图，label 由调用方去重后传入
 * （去重复用既有 uniqueLibraryLabel，不另造轮子）。
 */
export function buildMultiGridAssetEntry(options: {
  url: string;
  label: string;
  prompt: string;
  kind?: 'scene' | 'prop';
  now?: number;
}): MultiGridAssetEntry {
  const now = options.now ?? Date.now();
  const url = toTrimmedString(options.url);
  return {
    id: `ws-${now}-${Math.random().toString(36).slice(2, 6)}`,
    kind: options.kind ?? 'scene',
    label: toTrimmedString(options.label) || '多格推演结果',
    promptEn: toTrimmedString(options.prompt),
    revision: 1,
    creative: { coverUrl: url, referenceUrls: url ? [url] : [] },
  };
}

/** 单格入库 label 基名：优先格角色，其次提示词首行（与图像工作区同名规则） */
export function buildMultiGridAssetLabelBase(options: {
  role: string;
  prompt: string;
  modeLabel?: string;
}): string {
  const promptHead = toTrimmedString(options.prompt).split('\n')[0]?.slice(0, 20).trim() ?? '';
  return (
    [toTrimmedString(options.modeLabel), toTrimmedString(options.role)]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 40) || promptHead || '多格推演结果'
  );
}
