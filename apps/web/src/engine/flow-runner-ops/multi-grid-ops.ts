/**
 * multi-grid 执行器 —— 「多格推演」唯一实现。
 *
 * 职责：
 * 1. 取上游源图（关键帧 / 图片），按模式组装 MultiGridPlan（多机位 9/25 · 剧情四宫格 · 画面推演）；
 * 2. 复用图像同源运行器 runPictureGenJob 逐格批量出图（源图作为参考图，保持主体一致）；
 * 3. 回写与 GridReversePromptsResult 兼容的结构 + 每格图 URL + 每格视频提示词，供下游
 *    clip-gen / grid-compose 直接消费。
 *
 * 口径：
 * - 面板中编辑过的格子提示词（multiGridPlan.cells）在模式 / 源图 / 角色标签仍一致时优先采用；
 * - 部分失败保留已成功格子并在 message 中说明（不假绿）；一图未出直接抛错（禁止空成功）；
 * - 「画面推演」的当前格复用源图，不重复出图；
 * - AbortSignal 透传到在途请求。
 *
 * 生产闭环追加（本文件下半部分）：
 * - 异步图片任务的 taskId 按格落盘（multiGridPendingTasks），供「续查未完成格」取回；
 * - 逐格重试 / 续查：成功格一律保留，只重跑失败 / 后台 / 待跑格，回写结构与首轮批量出图同构。
 *
 * 有界并发追加（2026-09-15）：
 * - 逐格出图改走 flow-runner-ops/cell-gen-batch.ts 的有界并发内核（worker 池），25 格不再串行；
 * - 并发上限取节点 data.concurrency（缺省 2，范围 1–4；口径见 cell-gen-batch.resolveCellGenConcurrency）；
 *   未显式传并发的调用方仍是串行（cell-gen-batch 自身缺省 limit = 1），既有默认行为不变；
 * - 进度 / 失败账单 / 待续查账单一律按格号对齐与升序返回，逐格重试与续查语义与串行版一致；
 * - 取消：未开始的格不再启动，在途格跑完；已完成格**先落盘再抛「已取消」**，不再丢弃已完成结果。
 */
import {
  DEFAULT_PICTURE_GEN_MODEL_ID,
  buildMultiGridPlanForMode,
  planCellsToGridCellPrompts,
  planToGridReverseResult,
  readMultiGridMode,
  resolveImageRequestSize,
  resolvePictureModelForRequest,
  type MultiGridCell,
  type MultiGridPlan,
  type MultiGridPlanOptions,
  type StoryBeatInput,
} from '@nx9/shared';
import { runPictureGenJob, resumePendingImageTasks, type PendingImageTask } from '../picture-gen-runner';
import { VideoPollTimeoutError } from '../poll-task';
import { resolveCellGenConcurrency, runCellGenBatch } from './cell-gen-batch';
import {
  applyCellUrls,
  buildMultiGridResultPatch,
  compactCellUrls,
  describeMultiGridFailures,
  describeMultiGridPending,
  mergeResumedCellUrls,
  pairResumedTaskUrls,
  readMultiGridCellRunStates,
  readMultiGridCellUrls,
  readMultiGridPendingTasks,
  selectMultiGridRetryIndexes,
  type MultiGridCellFailure,
  type MultiGridPendingCellTask,
} from '../multi-grid-closure';
import type { FlowExecuteDeps } from './types';

interface MultiGridRunResult {
  /** 按格下标对齐；未出图的格子为 undefined */
  slots: (string | undefined)[];
  /** 实际新生成（不含复用源图）的格子数 */
  generatedCount: number;
  failures: MultiGridCellFailure[];
  /** 落盘待续查的异步任务（taskId → 格号），按格号升序 */
  pendingTasks: MultiGridPendingCellTask[];
  /** 本轮是否被取消中断（未跑完；已完成格照常保留，调用方据此落盘后再抛「已取消」） */
  cancelled: boolean;
}

function resolveSourceUrl(d: Record<string, unknown>, upstreamPictures: string[]): string {
  const upstream = (upstreamPictures ?? []).find((u) => typeof u === 'string' && u.trim());
  if (upstream) return upstream.trim();
  const pinned = typeof d.sourceUrl === 'string' ? d.sourceUrl.trim() : '';
  if (pinned) return pinned;
  const preview = typeof d.previewUrl === 'string' ? d.previewUrl.trim() : '';
  return preview;
}

function readStoredPlan(value: unknown): MultiGridPlan | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const plan = value as MultiGridPlan;
  if (!Array.isArray(plan.cells) || plan.cells.length === 0) return undefined;
  if (typeof plan.mode !== 'string' || typeof plan.sourceUrl !== 'string') return undefined;
  if (!plan.cells.every((c) => c && typeof c === 'object' && typeof c.role === 'string')) {
    return undefined;
  }
  return plan;
}

function resolveMultiCamGeometry(
  d: Record<string, unknown>,
  fallbackRows: number,
  fallbackCols: number,
): { rows: number; cols: number } {
  const rows = Math.trunc(Number(d.multiGridRows ?? fallbackRows));
  const cols = Math.trunc(Number(d.multiGridCols ?? fallbackCols));
  if ((rows === 3 && cols === 3) || (rows === 5 && cols === 5)) return { rows, cols };
  return { rows: fallbackRows, cols: fallbackCols };
}

function resolvePlanOptions(
  d: Record<string, unknown>,
  mode: string,
  rowsFallback: number,
  colsFallback: number,
): MultiGridPlanOptions {
  const { rows, cols } =
    mode === 'multi-cam-9' || mode === 'multi-cam-25'
      ? resolveMultiCamGeometry(d, rowsFallback, colsFallback)
      : { rows: rowsFallback, cols: colsFallback };
  const focalMin = Number(d.multiGridFocalMinMm);
  const focalMax = Number(d.multiGridFocalMaxMm);
  const beforeSec = Number(d.frameBeforeSec);
  const afterSec = Number(d.frameAfterSec);
  return {
    rows,
    cols,
    focalRange: [
      Number.isFinite(focalMin) && focalMin > 0 ? focalMin : 18,
      Number.isFinite(focalMax) && focalMax > 0 ? focalMax : 100,
    ],
    aspectRatio: (d.aspectRatio as string) || '16:9',
    direction: typeof d.storyDirection === 'string' ? d.storyDirection : undefined,
    directionEn: typeof d.storyDirectionEn === 'string' ? d.storyDirectionEn : undefined,
    beats: Array.isArray(d.storyBeats) ? (d.storyBeats as StoryBeatInput[]) : undefined,
    beforeSec: Number.isFinite(beforeSec) && beforeSec > 0 ? beforeSec : 5,
    afterSec: Number.isFinite(afterSec) && afterSec > 0 ? afterSec : 3,
    motionZh: typeof d.frameMotion === 'string' ? d.frameMotion : undefined,
  };
}

/** 剧情方向缺省时，采用节点文本 / 上游文本，让上游剧本自然驱动四宫格节拍 */
function effectiveData(
  d: Record<string, unknown>,
  upstreamPrompts: string[],
): Record<string, unknown> {
  if (String(d.storyDirection ?? '').trim()) return d;
  const nodeText = typeof d.content === 'string' ? d.content.trim() : '';
  const upstreamText = (upstreamPrompts ?? []).map((p) => String(p ?? '').trim()).filter(Boolean);
  const direction = nodeText || upstreamText.join(' / ');
  return direction ? { ...d, storyDirection: direction } : d;
}

/** 解析本次运行实际使用的计划：编辑稿在模式/源图/角色一致时优先，否则按当前参数重建 */
export function resolveMultiGridRunPlan(
  d: Record<string, unknown>,
  sourceUrl: string,
): MultiGridPlan {
  const mode = readMultiGridMode(d.multiGridMode);
  const geometry =
    mode === 'multi-cam-25'
      ? { rows: 5, cols: 5 }
      : mode === 'multi-cam-9'
        ? { rows: 3, cols: 3 }
        : { rows: 2, cols: 2 };
  const built = buildMultiGridPlanForMode(
    mode,
    sourceUrl,
    resolvePlanOptions(d, mode, geometry.rows, geometry.cols),
  );
  const stored = readStoredPlan(d.multiGridPlan);
  if (!stored) return built;
  if (stored.mode !== built.mode || stored.sourceUrl !== built.sourceUrl) return built;
  if (stored.cells.length !== built.cells.length) return built;
  if (!built.cells.every((c, i) => stored.cells[i]?.role === c.role)) return built;
  return { ...built, cells: stored.cells.map((c, i) => ({ ...c, cellIndex: i })) };
}

/** 逐格批量出图（源图作为参考；复用格直接取源图）—— 出图循环交给有界并发内核 */
export async function runMultiGridCells(options: {
  cells: MultiGridCell[];
  sourceUrl: string;
  modelId: string;
  size: string;
  strength: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** PG-28 口径：taskId 一拿到就回调，供面板/节点落盘待续查 */
  onPendingChange?: (tasks: MultiGridPendingCellTask[]) => void;
  /** 逐格批量时只跑这些格（缺省全跑）；用于「重试失败格」不重打成功格 */
  indexes?: number[];
  /** 并发上限 1–4；缺省 1 = 串行。节点级缺省值由 resolveCellGenConcurrency(data) 给出 */
  concurrency?: number;
}): Promise<MultiGridRunResult> {
  const { cells, sourceUrl, modelId, size, strength, signal } = options;
  const batch = await runCellGenBatch<MultiGridCell>({
    cells,
    sourceUrl,
    indexes: options.indexes,
    concurrency: options.concurrency,
    signal,
    onProgress: options.onProgress,
    onPendingChange: options.onPendingChange,
    generate: ({ cell, signal: cellSignal, onTaskId }) =>
      runPictureGenJob({
        prompt: cell.imagePrompt,
        modelId,
        size,
        referenceImageUrl: sourceUrl,
        strength,
        mode: 'standard',
        negativePrompt: cell.negativePrompt,
        n: 1,
        signal: cellSignal,
        // PG-28：异步任务 id 一拿到就登记，不等超时——刷新 / 重挂后仍可续查
        onMeta: (meta) => {
          if (cellSignal?.aborted || !meta.taskId) return;
          onTaskId(meta.taskId);
        },
      }),
    // 轮询超时 = 任务仍在后台：把 taskId 登记进待续查账单（与既有口径一致）
    readErrorTaskId: (e) => (e instanceof VideoPollTimeoutError ? e.taskId : undefined),
  });

  return {
    slots: batch.slots,
    generatedCount: batch.generatedCount,
    failures: batch.failures,
    pendingTasks: batch.pendingTasks,
    cancelled: batch.cancelled,
  };
}

/** 模型解析：多格推演始终把源图作为参考（图生图） */
function resolveMultiGridModelRequest(d: Record<string, unknown>): {
  modelId: string;
  modelFallbackNote?: string;
} {
  const requestedModel = ((d.model as string) || '').trim() || DEFAULT_PICTURE_GEN_MODEL_ID;
  const requestedDef = resolvePictureModelForRequest(requestedModel);
  // fal 文生图端点吃不到参考时必须换模型，否则会静默退化成文生图、丢掉主体一致性。
  if (requestedDef.provider === 'fal' && !requestedDef.supportsReference) {
    return {
      modelId: 'gemini-2.5-flash-image',
      modelFallbackNote: `fal 端点 ${requestedDef.id} 不支持参考图，已改用 gemini-2.5-flash-image 以保持主体一致`,
    };
  }
  return { modelId: requestedModel };
}

/** 出图尺寸 / 强度：与首轮批量出图同口径，重试与续查不得另立规则 */
function resolveMultiGridRenderOptions(d: Record<string, unknown>, plan: MultiGridPlan): {
  size: string;
  strength: number;
} {
  const quality = (d.quality as string) || 'auto';
  const resolvedSize = resolveImageRequestSize({ quality, aspectRatio: plan.aspectRatio });
  const strengthRaw = Number(d.imageStrength);
  return {
    size: resolvedSize.size,
    strength:
      Number.isFinite(strengthRaw) && strengthRaw > 0 && strengthRaw <= 1 ? strengthRaw : 0.85,
  };
}

/** 节点级负面提示词叠加到每格（不覆盖计划内默认负面项） */
function applyExtraNegative(cells: MultiGridCell[], extraNegative: string): MultiGridCell[] {
  if (!extraNegative) return cells;
  return cells.map((c) => ({
    ...c,
    negativePrompt: [c.negativePrompt, extraNegative].filter(Boolean).join(', '),
  }));
}

export async function executeMultiGridOps(deps: FlowExecuteDeps): Promise<void> {
  const { block, upstream, updateNodeData, ctx } = deps;
  const d = (block.data ?? {}) as Record<string, unknown>;
  const signal = ctx?.abortSignal;

  const sourceUrl = resolveSourceUrl(d, upstream.pictures ?? []);
  if (!sourceUrl) {
    throw new Error(
      '多格推演缺少上游关键帧 / 图片：请连接上游图像，或在面板中指定源图（禁止空成功）',
    );
  }

  const plan = resolveMultiGridRunPlan(effectiveData(d, upstream.prompts ?? []), sourceUrl);
  const total = plan.cells.length;

  const { modelId, modelFallbackNote } = resolveMultiGridModelRequest(d);
  const { size: resolvedSize, strength } = resolveMultiGridRenderOptions(d, plan);

  updateNodeData(block.id, {
    status: 'running',
    error: undefined,
    message: undefined,
    multiGridMode: plan.mode,
    multiGridPlan: plan,
    multiGridCells: plan.cells,
    batchProgress: { done: 0, total },
    effectiveModel: modelId,
  });

  const extraNegative = typeof d.negativePrompt === 'string' ? d.negativePrompt.trim() : '';
  const runCells = applyExtraNegative(plan.cells, extraNegative);
  // 上一轮遗留的后台任务：本批全程保留（本批已出图的格在最终回写时再剔除），
  // 否则重跑中途被停止会丢掉用户的待续查清单。
  const carriedPendingTasks = readMultiGridPendingTasks(d);

  const result = await runMultiGridCells({
    cells: runCells,
    sourceUrl,
    modelId,
    size: resolvedSize,
    strength,
    signal,
    // 节点级并发（缺省 2，范围 1–4）：25 格不再串行
    concurrency: resolveCellGenConcurrency(d),
    onProgress: (done, all) => {
      updateNodeData(block.id, { status: 'running', batchProgress: { done, total: all } });
    },
    // PG-28 口径：taskId 一拿到就落盘，刷新 / 重挂后仍可续查未完成格
    onPendingChange: (tasks) => {
      const live = [
        ...carriedPendingTasks.filter((t) => !tasks.some((x) => x.taskId === t.taskId)),
        ...tasks,
      ].sort((a, b) => a.cellIndex - b.cellIndex);
      updateNodeData(block.id, {
        status: 'running',
        multiGridPendingTasks: live,
        pendingImageTasks: live.map((t) => ({ ...t })),
        pendingImageTaskId: live[0]?.taskId,
      });
    },
  });

  const orderedUrls = result.slots;
  // 本批已出图的格丢弃其遗留任务（已不再需要续查），其余与本批新任务合并；
  // 避免「重跑整批」把用户仍在后台的图 URL 丢掉。
  const carriedPending = carriedPendingTasks.filter(
    (t) => !((orderedUrls[t.cellIndex] ?? '').trim()),
  );
  const pendingTasks = [...carriedPending, ...result.pendingTasks]
    .filter((t, i, all) => all.findIndex((x) => x.taskId === t.taskId) === i)
    .sort((a, b) => a.cellIndex - b.cellIndex);
  const planNote = { multiGridMode: plan.mode, multiGridPlan: plan, multiGridCells: plan.cells };

  // 取消：已完成格先落盘（与既有结果合并，不丢已完成结果），随后按既有口径抛「已取消」；
  // 未开始的格不被改动，仍可由「逐格重试」单独补跑。
  if (result.cancelled) {
    const produced = result.slots
      .map((url, i) => ({ cellIndex: i, url: (url ?? '').trim() }))
      .filter((u) => u.url.length > 0);
    const merged = mergeResumedCellUrls(readMultiGridCellUrls(d), produced, total).urls.slice(
      0,
      total,
    );
    const cancelNote = `已取消本轮逐格出图：${compactCellUrls(merged).length}/${total} 格有图（已完成格保留，未开始格未改动，可逐格重试）`;
    updateNodeData(block.id, {
      ...planNote,
      effectiveModel: modelId,
      modelFallbackNote,
      ...buildMultiGridResultPatch({
        mode: plan.mode,
        cellCount: total,
        cellUrls: merged,
        failures: result.failures,
        gridCells: planCellsToGridCellPrompts(plan, merged),
        gridReverseResult: planToGridReverseResult(plan, merged, cancelNote),
        pendingTasks,
        model: modelId,
        message: [cancelNote, modelFallbackNote].filter(Boolean).join(' · '),
        progress: { done: compactCellUrls(merged).length, total },
      }),
    });
    throw new Error('已取消');
  }

  // 一图未出但仍有后台任务：如实停在 running，供「续查未完成格」取回（不假绿、也不假红）
  if (result.generatedCount === 0 && pendingTasks.length > 0) {
    const pendingNote = describeMultiGridPending(pendingTasks);
    updateNodeData(block.id, {
      ...planNote,
      status: 'running',
      error: undefined,
      effectiveModel: modelId,
      modelFallbackNote,
      ...buildMultiGridResultPatch({
        mode: plan.mode,
        cellCount: total,
        cellUrls: orderedUrls,
        failures: result.failures,
        gridCells: planCellsToGridCellPrompts(plan, orderedUrls),
        gridReverseResult: planToGridReverseResult(plan, orderedUrls, pendingNote),
        pendingTasks,
        model: modelId,
        message: [pendingNote, modelFallbackNote].filter(Boolean).join(' · ') || undefined,
        progress: { done: compactCellUrls(orderedUrls).length, total },
      }),
    });
    return;
  }

  if (result.generatedCount === 0) {
    // 失败格与原因先落盘（面板据此逐格重试），仍按既有口径抛错，禁止空成功
    updateNodeData(block.id, {
      ...planNote,
      effectiveModel: modelId,
      modelFallbackNote,
      ...buildMultiGridResultPatch({
        mode: plan.mode,
        cellCount: total,
        cellUrls: orderedUrls,
        failures: result.failures,
        gridCells: [],
        gridReverseResult: undefined,
        model: modelId,
      }),
    });
    throw new Error(result.failures[0]?.error ?? '多格推演未产出任何新图，禁止空成功');
  }

  const partialNote = describeMultiGridFailures(result.failures, total);
  const pendingNote = describeMultiGridPending(pendingTasks);
  const gridCells = planCellsToGridCellPrompts(plan, orderedUrls);
  const gridReverseResult = planToGridReverseResult(plan, orderedUrls, partialNote);

  updateNodeData(block.id, {
    ...planNote,
    status: 'success',
    error: undefined,
    effectiveModel: modelId,
    modelFallbackNote,
    ...buildMultiGridResultPatch({
      mode: plan.mode,
      cellCount: total,
      cellUrls: orderedUrls,
      failures: result.failures,
      gridCells,
      gridReverseResult,
      pendingTasks,
      model: modelId,
      message: [partialNote, pendingNote, modelFallbackNote].filter(Boolean).join(' · ') || undefined,
      progress: { done: total, total },
    }),
  });
}

/* ────────────── ② 生产闭环：逐格重试 / 续查未完成格 / 删除单格 ────────────── */

/** 重试与续查统一的写回入口：与首轮批量出图同构（下游契约不变） */
function commitMultiGridCells(options: {
  blockId: string;
  plan: MultiGridPlan;
  cellUrls: (string | undefined)[];
  failures: MultiGridCellFailure[];
  pendingTasks: MultiGridPendingCellTask[];
  model: string;
  modelFallbackNote?: string;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  /** 额外写回字段（状态 / 提示等） */
  extraPatch?: Record<string, unknown>;
}): { urls: string[]; message?: string } {
  const total = options.plan.cells.length;
  const partialNote = describeMultiGridFailures(options.failures, total);
  const pendingNote = describeMultiGridPending(options.pendingTasks);
  const message =
    [partialNote, pendingNote, options.modelFallbackNote].filter(Boolean).join(' · ') || undefined;
  const patch = buildMultiGridResultPatch({
    mode: options.plan.mode,
    cellCount: total,
    cellUrls: options.cellUrls,
    failures: options.failures,
    gridCells: planCellsToGridCellPrompts(options.plan, options.cellUrls),
    gridReverseResult: planToGridReverseResult(options.plan, options.cellUrls, partialNote),
    pendingTasks: options.pendingTasks,
    model: options.model,
    message,
    progress: { done: compactCellUrls(options.cellUrls).length, total },
  });
  options.updateNodeData(options.blockId, {
    multiGridMode: options.plan.mode,
    multiGridPlan: options.plan,
    multiGridCells: options.plan.cells,
    effectiveModel: options.model,
    modelFallbackNote: options.modelFallbackNote,
    ...patch,
    ...(options.extraPatch ?? {}),
  });
  return { urls: compactCellUrls(options.cellUrls), message };
}

function resolveRetrySourceUrl(
  d: Record<string, unknown>,
  upstreamPictures: string[],
  pinned?: string,
): string {
  return (pinned ?? '').trim() || resolveSourceUrl(d, upstreamPictures);
}

/**
 * 逐格重试：只重跑指定格（失败 / 后台 / 待跑），成功格一律原样保留。
 * 复用首轮的模型解析、出图尺寸与源图参考口径，不另立一条出图链。
 */
export async function runMultiGridCellRetry(options: {
  blockId: string;
  data: Record<string, unknown>;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  /** 指定要重跑的格号；缺省 = 全部非成功格 */
  indexes?: number[];
  upstreamPictures?: string[];
  /** 面板已解析的源图（上游优先），缺省按节点 data 解析 */
  sourceUrl?: string;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ ok: boolean; reason?: string; urls: string[]; failures: MultiGridCellFailure[] }> {
  const { blockId, data, updateNodeData } = options;
  const states = readMultiGridCellRunStates(data);
  const targets = selectMultiGridRetryIndexes(states, options.indexes);
  if (states.length === 0) {
    return { ok: false, reason: '尚无推演计划：请先选择模式并批量出图', urls: [], failures: [] };
  }
  if (targets.length === 0) {
    return { ok: false, reason: '没有需要重跑的格：已出图的格不会被重打', urls: [], failures: [] };
  }

  const sourceUrl = resolveRetrySourceUrl(data, options.upstreamPictures ?? [], options.sourceUrl);
  if (!sourceUrl) {
    return {
      ok: false,
      reason: '多格推演缺少源图：请连接上游图像，或在面板指定源图（禁止空成功）',
      urls: [],
      failures: [],
    };
  }

  const plan = resolveMultiGridRunPlan(effectiveData(data, []), sourceUrl);
  const { modelId, modelFallbackNote } = resolveMultiGridModelRequest(data);
  const { size, strength } = resolveMultiGridRenderOptions(data, plan);
  const extraNegative =
    typeof data.negativePrompt === 'string' ? data.negativePrompt.trim() : '';
  const cells = applyExtraNegative(plan.cells, extraNegative);

  const existingUrls = readMultiGridCellUrls(data);
  const existingPending = readMultiGridPendingTasks(data).filter(
    (t) => !targets.includes(t.cellIndex),
  );

  const result = await runMultiGridCells({
    cells,
    sourceUrl,
    modelId,
    size,
    strength,
    indexes: targets,
    // 重试同样走节点级并发（缺省 2）：多格重跑不再串行
    concurrency: resolveCellGenConcurrency(data),
    signal: options.signal,
    onProgress: options.onProgress,
    onPendingChange: (tasks) => {
      const all = [...existingPending, ...tasks].sort((a, b) => a.cellIndex - b.cellIndex);
      updateNodeData(blockId, {
        status: 'running',
        multiGridPendingTasks: all,
        pendingImageTasks: all.map((t) => ({ ...t })),
        pendingImageTaskId: tasks[0]?.taskId,
      });
    },
  });

  const refreshed = result.slots
    .map((url, i) => ({ cellIndex: i, url: (url ?? '').trim() }))
    .filter((u) => u.url.length > 0);
  const merged = mergeResumedCellUrls(existingUrls, refreshed, plan.cells.length);
  // 本轮参与重试的格由本轮重新定论，不得沿用上一轮的失败账单
  const failures = [
    ...readFailuresOutside(data, targets),
    ...result.failures,
  ].sort((a, b) => a.index - b.index);
  const pendingTasks = [...existingPending, ...result.pendingTasks].sort(
    (a, b) => a.cellIndex - b.cellIndex,
  );

  const committed = commitMultiGridCells({
    blockId,
    plan,
    cellUrls: merged.urls,
    failures,
    pendingTasks,
    model: modelId,
    modelFallbackNote,
    updateNodeData,
    extraPatch: {
      status: resolveCellRetryStatus(failures.length, merged.urls),
      error: undefined,
    },
  });

  // 取消：已完成的格与失败账单照常落盘（上面 commit 已做，不丢已完成结果），
  // 随后按既有口径抛「已取消」，未开始的格保持原状、仍可逐格重试。
  if (result.cancelled) throw new Error('已取消');

  return { ok: result.failures.length === 0, urls: committed.urls, failures: result.failures };
}

/** 重试后的节点状态：有图即 success；无图但有失败账单为 error；其余收回 idle */
function resolveCellRetryStatus(
  failureCount: number,
  urls: (string | undefined)[],
): 'success' | 'error' | 'idle' {
  if (urls.some((u) => (u ?? '').trim())) return 'success';
  return failureCount > 0 ? 'error' : 'idle';
}

/** 上一轮失败账单里「本轮未参与重试」的格子（参与本轮重试的由本轮结果重新定论） */
function readFailuresOutside(
  data: Record<string, unknown>,
  skipIndexes: number[],
): MultiGridCellFailure[] {
  const skip = new Set(skipIndexes);
  const last = data.lastResult as { failures?: unknown } | undefined;
  const raw = Array.isArray(last?.failures) ? (last!.failures as unknown[]) : [];
  const out: MultiGridCellFailure[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as { index?: unknown; role?: unknown; error?: unknown };
    const index = Number(entry.index);
    if (!Number.isInteger(index) || skip.has(index)) continue;
    out.push({
      index,
      role: typeof entry.role === 'string' ? entry.role : `第 ${index + 1} 格`,
      error: typeof entry.error === 'string' ? entry.error : '生成失败',
    });
  }
  return out;
}

/**
 * 续查未完成格：复用 resumePendingImageTasks（与图像节点同一条续查链），
 * 按 taskId → 格号把取回的图补进结果数组；仍在后台的继续登记，成功格不受影响。
 */
/** 后台任务 → 带格号的闭环保留任务（缺格号的历史任务无法定位，返回 undefined） */
function toCellPendingTask(task: PendingImageTask): MultiGridPendingCellTask | undefined {
  if (!Number.isInteger(task.cellIndex) || (task.cellIndex as number) < 0) return undefined;
  return {
    taskId: task.taskId,
    cellIndex: task.cellIndex as number,
    ...(task.prompt ? { prompt: task.prompt } : {}),
  };
}

export async function resumeMultiGridPendingCells(options: {
  blockId: string;
  data: Record<string, unknown>;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  /** 面板已解析的源图（上游优先），缺省按节点 data 解析 */
  sourceUrl?: string;
  signal?: AbortSignal;
}): Promise<{
  fetched: number[];
  stillPending: MultiGridPendingCellTask[];
  failed: MultiGridPendingCellTask[];
}> {
  const { blockId, data, updateNodeData } = options;
  const tasks: PendingImageTask[] = readMultiGridPendingTasks(data);
  if (tasks.length === 0) {
    return { fetched: [], stillPending: [], failed: [] };
  }
  const result = await resumePendingImageTasks(tasks, options.signal);
  const modelId = ((data.model as string) || '').trim() || DEFAULT_PICTURE_GEN_MODEL_ID;
  const sourceUrl = resolveRetrySourceUrl(data, [], options.sourceUrl);
  const plan = sourceUrl
    ? resolveMultiGridRunPlan(effectiveData(data, []), sourceUrl)
    : undefined;

  const pairs = pairResumedTaskUrls(tasks, result.stillPending, result.failed, result.urls)
    .map(({ task, url }) => ({ cellIndex: task.cellIndex as number, url }))
    .filter((p) => Number.isInteger(p.cellIndex));
  const stillPending = result.stillPending
    .map(toCellPendingTask)
    .filter((t): t is MultiGridPendingCellTask => Boolean(t));
  const failed = result.failed
    .map(toCellPendingTask)
    .filter((t): t is MultiGridPendingCellTask => Boolean(t));

  if (plan) {
    const merged = mergeResumedCellUrls(readMultiGridCellUrls(data), pairs, plan.cells.length);
    // 已取回的格不再是失败格；仍在后台 / 已失败的格继续留在账单里
    const settled = new Set(pairs.map((p) => p.cellIndex));
    const carried = readFailuresOutside(data, [...settled])
      .filter((f) => !stillPending.some((t) => t.cellIndex === f.index));
    commitMultiGridCells({
      blockId,
      plan,
      cellUrls: merged.urls,
      failures: carried,
      pendingTasks: stillPending,
      model: modelId,
      updateNodeData,
      extraPatch: {
        status: stillPending.length ? 'running' : carried.length ? 'error' : 'success',
        error: undefined,
      },
    });
    return { fetched: merged.filled, stillPending, failed };
  }

  // 无法重建计划（源图已断开）时只落盘任务状态，不动既有结果
  updateNodeData(blockId, {
    multiGridPendingTasks: stillPending.length ? stillPending : undefined,
    pendingImageTasks: stillPending.length ? stillPending : undefined,
    pendingImageTaskId: stillPending[0]?.taskId,
    status: stillPending.length ? 'running' : 'idle',
  });
  return { fetched: [], stillPending, failed };
}

/** 单格软删（回收站）：清掉该格图并重建回写结构，成功格不受影响 */
export function dropMultiGridCell(options: {
  blockId: string;
  data: Record<string, unknown>;
  index: number;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  /** 面板已解析的源图（上游优先），缺省按节点 data 解析 */
  sourceUrl?: string;
}): boolean {
  const { blockId, data, index, updateNodeData } = options;
  const urls = readMultiGridCellUrls(data);
  if (!(urls[index] ?? '').trim()) return false;
  // 优先用上次实际出图用的计划（源图已断开也能重建逐格结构，避免「已进回收站但画面还在」）
  const sourceUrl = resolveRetrySourceUrl(data, [], options.sourceUrl);
  const stored = readStoredPlan(data.multiGridPlan);
  const plan = stored
    ? { ...stored, cells: stored.cells.map((c, i) => ({ ...c, cellIndex: i })) }
    : sourceUrl
      ? resolveMultiGridRunPlan(effectiveData(data, []), sourceUrl)
      : undefined;
  if (!plan?.cells[index]) return false;
  const existingPending = readMultiGridPendingTasks(data).filter((t) => t.cellIndex !== index);
  const modelId = ((data.model as string) || '').trim() || DEFAULT_PICTURE_GEN_MODEL_ID;
  commitMultiGridCells({
    blockId,
    plan,
    cellUrls: applyCellUrls(urls, [{ cellIndex: index, url: undefined }], plan.cells.length),
    failures: readFailuresOutside(data, [index]),
    pendingTasks: existingPending,
    model: modelId,
    updateNodeData,
  });
  return true;
}
