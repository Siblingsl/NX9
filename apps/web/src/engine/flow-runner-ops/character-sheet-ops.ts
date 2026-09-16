/**
 * character-sheet-ops —— 「角色设定表」唯一执行器。
 *
 * 职责：
 * 1. 取上游参考图（角色参考图 / 关键帧）与角色设定，按版面组装 CharacterSheetPlan
 *    （三视图 / 表情表 / 动作表 / 整套设定表）；
 * 2. **复用图像同源运行器** runPictureGenJob 与多格推演的逐格批量入口 runMultiGridCells
 *    逐格出图（参考图 + 一致性强度保持同一角色）；
 * 3. 回写与 GridReversePromptsResult 兼容的结构 + 每格图 URL + 逐格角色提示词，
 *    供 grid-compose / clip-gen 直接消费。
 *
 * 口径：
 * - 面板中编辑过的格子提示词（characterSheetPlan.cells）在版面 / 参考图 / 角色标签仍一致时优先采用；
 * - 逐格图生图强度取计划里的 consistencyStrength（一致性档位决定），不另立第二条出图链；
 * - 部分失败保留已成功格子并在 message 中说明（不假绿）；一图未出直接抛错（禁止空成功）；
 * - 无参考图时不抛错：按纯文字设定表出图，并在 message 中如实说明（参考图缺失已写入计划告警）；
 * - AbortSignal 透传到在途请求；异步图片任务 taskId 一拿到就落盘，供「续查未完成格」取回。
 *
 * 有界并发追加（2026-09-15）：
 * - 逐格出图与多格推演共用 flow-runner-ops/cell-gen-batch.ts 的有界并发内核，设定表不再逐格串行；
 * - 并发上限取节点 data.concurrency（缺省 2，范围 1–4；口径见 cell-gen-batch.resolveCellGenConcurrency）；
 * - 进度 / 失败账单 / 待续查账单在并发下按格号对齐，逐格重试与续查语义与串行版一致；
 * - 取消：未开始的格不再启动，在途格跑完；已完成格**先落盘再抛「已取消」**，不丢弃已完成结果。
 */
import {
  DEFAULT_PICTURE_GEN_MODEL_ID,
  buildCharacterSheetPlan,
  characterSheetPlanToGridCells,
  characterSheetPlanToGridResult,
  readCharacterSheetConsistency,
  readCharacterSheetKind,
  resolveImageRequestSize,
  resolvePictureModelForRequest,
  type CharacterSheetCell,
  type CharacterSheetPlan,
  type CharacterSheetSubject,
} from '@nx9/shared';
import type { PendingImageTask } from '../picture-gen-runner';
import { runMultiGridCells } from './multi-grid-ops';
import { resolveCellGenConcurrency } from './cell-gen-batch';
import {
  buildCharacterSheetResultPatch,
  readCharacterSheetCellRunStates,
  readCharacterSheetCellUrls,
  readCharacterSheetFailures,
  readCharacterSheetPendingTasks,
} from '../character-sheet-closure';
import {
  applyCellUrls,
  compactCellUrls,
  describeMultiGridFailures,
  describeMultiGridPending,
  mergeResumedCellUrls,
  pairResumedTaskUrls,
  selectMultiGridRetryIndexes,
  type MultiGridCellFailure,
  type MultiGridPendingCellTask,
} from '../multi-grid-closure';
import { resumePendingImageTasks } from '../picture-gen-runner';
import type { FlowExecuteDeps } from './types';

/** 参考图：上游图片优先，其次节点钉住的参考图，最后预览图 */
export function resolveCharacterSheetSourceRef(
  d: Record<string, unknown>,
  upstreamPictures: string[],
): string {
  const upstream = (upstreamPictures ?? []).find((u) => typeof u === 'string' && u.trim());
  if (upstream) return upstream.trim();
  for (const key of ['characterSheetRef', 'sourceUrl', 'characterSheetReferenceImage', 'previewUrl']) {
    const value = typeof d[key] === 'string' ? (d[key] as string).trim() : '';
    if (value) return value;
  }
  const subject = d.characterSheetSubject as CharacterSheetSubject | undefined;
  return (subject?.referenceImageUrl ?? '').trim();
}

function readStoredPlan(value: unknown): CharacterSheetPlan | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const plan = value as CharacterSheetPlan;
  if (!Array.isArray(plan.cells) || plan.cells.length === 0) return undefined;
  if (typeof plan.kind !== 'string' || typeof plan.sourceRef !== 'string') return undefined;
  if (!plan.cells.every((c) => c && typeof c === 'object' && typeof c.role === 'string')) {
    return undefined;
  }
  return plan;
}

/** 节点 data 里的角色设定（缺省为空对象：由构造器给出告警，不编造） */
function readSubject(d: Record<string, unknown>, upstreamPrompts: string[]): CharacterSheetSubject {
  const stored = d.characterSheetSubject as CharacterSheetSubject | undefined;
  const subject: CharacterSheetSubject = { ...(stored ?? {}) };
  if (!subject.name?.trim()) {
    const name = typeof d.characterName === 'string' ? d.characterName.trim() : '';
    if (name) subject.name = name;
  }
  // 无外观描述时，用上游文本 / 节点文本作为参考图描述（一致性锚点），不做加工
  if (!subject.appearanceZh?.trim() && !subject.referenceNoteZh?.trim()) {
    const upstreamText = (upstreamPrompts ?? [])
      .map((p) => String(p ?? '').trim())
      .filter(Boolean)
      .join(' / ');
    const nodeText = typeof d.content === 'string' ? d.content.trim() : '';
    const note = upstreamText || nodeText;
    if (note) subject.referenceNoteZh = note;
  }
  return subject;
}

function readPlanOptions(
  d: Record<string, unknown>,
  subject: CharacterSheetSubject,
  sourceRef: string,
) {
  const rows = Number(d.characterSheetRows);
  const cols = Number(d.characterSheetCols);
  const extraNegative =
    typeof d.negativePrompt === 'string' ? d.negativePrompt.trim() : '';
  const quality = (d.quality as string) || 'auto';
  return {
    subject,
    sourceRef,
    rows: Number.isFinite(rows) && rows >= 1 ? rows : undefined,
    cols: Number.isFinite(cols) && cols >= 1 ? cols : undefined,
    aspectRatio: (d.aspectRatio as string) || undefined,
    consistency: readCharacterSheetConsistency(d.consistency),
    extraNegative,
    styleNoteZh: typeof d.styleNote === 'string' ? d.styleNote : undefined,
    quality,
  };
}

/** 解析本次运行实际使用的计划：编辑稿在版面 / 参考图 / 角色一致时优先，否则按当前参数重建 */
export function resolveCharacterSheetRunPlan(
  d: Record<string, unknown>,
  upstreamPrompts: string[],
  sourceRef: string,
): CharacterSheetPlan {
  const kind = readCharacterSheetKind(d.characterSheetKind);
  const subject = readSubject(d, upstreamPrompts);
  const options = readPlanOptions(d, subject, sourceRef);
  const built = buildCharacterSheetPlan(kind, options);
  const stored = readStoredPlan(d.characterSheetPlan);
  if (!stored) return built;
  if (stored.kind !== built.kind || stored.sourceRef !== built.sourceRef) return built;
  if (stored.cells.length !== built.cells.length) return built;
  if (!built.cells.every((c, i) => stored.cells[i]?.role === c.role)) return built;
  return { ...built, cells: stored.cells.map((c, i) => ({ ...c, cellIndex: i })) };
}

/**
 * 模型解析：设定表始终把参考图作为图生图参考。
 * 仅当确实带参考图时才做 fal 降级 —— 没有参考图时不存在「参考被静默丢掉」的风险，不换模型、不给误导性说明。
 */
function resolveCharacterSheetModelRequest(
  d: Record<string, unknown>,
  hasReference: boolean,
): {
  modelId: string;
  modelFallbackNote?: string;
} {
  const requestedModel = ((d.model as string) || '').trim() || DEFAULT_PICTURE_GEN_MODEL_ID;
  const requestedDef = resolvePictureModelForRequest(requestedModel);
  // fal 文生图端点吃不到参考时必须换模型，否则会静默退化成文生图、丢掉角色一致性。
  if (hasReference && requestedDef.provider === 'fal' && !requestedDef.supportsReference) {
    return {
      modelId: 'gemini-2.5-flash-image',
      modelFallbackNote: `fal 端点 ${requestedDef.id} 不支持参考图，已改用 gemini-2.5-flash-image 以保持角色一致`,
    };
  }
  return { modelId: requestedModel };
}

/** 节点级负面提示词叠加到每格（不覆盖计划内默认负面项） */
function applyExtraNegative(cells: CharacterSheetCell[], extraNegative: string): CharacterSheetCell[] {
  if (!extraNegative) return cells;
  return cells.map((c) => ({
    ...c,
    negativePrompt: [c.negativePrompt, extraNegative].filter(Boolean).join(', '),
  }));
}

function commitCharacterSheetCells(options: {
  blockId: string;
  plan: CharacterSheetPlan;
  cellUrls: (string | undefined)[];
  failures: MultiGridCellFailure[];
  pendingTasks: MultiGridPendingCellTask[];
  model: string;
  modelFallbackNote?: string;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  extraPatch?: Record<string, unknown>;
}): { urls: string[]; message?: string } {
  const total = options.plan.cells.length;
  const partialNote = describeMultiGridFailures(options.failures, total);
  const pendingNote = describeMultiGridPending(options.pendingTasks);
  const message =
    [partialNote, pendingNote, options.modelFallbackNote].filter(Boolean).join(' · ') || undefined;
  const patch = buildCharacterSheetResultPatch({
    kind: options.plan.kind,
    cellCount: total,
    cellUrls: options.cellUrls,
    cells: options.plan.cells,
    failures: options.failures,
    gridCells: characterSheetPlanToGridCells(options.plan, options.cellUrls),
    gridReverseResult: characterSheetPlanToGridResult(options.plan, options.cellUrls, partialNote),
    pendingTasks: options.pendingTasks,
    model: options.model,
    message,
    progress: { done: compactCellUrls(options.cellUrls).length, total },
  });
  options.updateNodeData(options.blockId, {
    characterSheetKind: options.plan.kind,
    characterSheetPlan: options.plan,
    characterSheetCells: options.plan.cells,
    effectiveModel: options.model,
    modelFallbackNote: options.modelFallbackNote,
    ...patch,
    ...(options.extraPatch ?? {}),
  });
  return { urls: compactCellUrls(options.cellUrls), message };
}

/** 首轮批量出图：计划组装 → 逐格出图 → 回写 */
export async function executeCharacterSheetOps(deps: FlowExecuteDeps): Promise<void> {
  const { block, upstream, updateNodeData, ctx } = deps;
  const d = (block.data ?? {}) as Record<string, unknown>;
  const signal = ctx?.abortSignal;

  const sourceRef = resolveCharacterSheetSourceRef(d, upstream.pictures ?? []);
  const plan = resolveCharacterSheetRunPlan(d, upstream.prompts ?? [], sourceRef);
  const total = plan.cells.length;

  const { modelId, modelFallbackNote } = resolveCharacterSheetModelRequest(
    d,
    Boolean(sourceRef),
  );
  const quality = (d.quality as string) || 'auto';
  const { size } = resolveImageRequestSize({ quality, aspectRatio: plan.aspectRatio });
  const strength = plan.consistencyStrength;

  updateNodeData(block.id, {
    status: 'running',
    error: undefined,
    message: undefined,
    characterSheetKind: plan.kind,
    characterSheetPlan: plan,
    characterSheetCells: plan.cells,
    batchProgress: { done: 0, total },
    effectiveModel: modelId,
  });

  const extraNegative = typeof d.negativePrompt === 'string' ? d.negativePrompt.trim() : '';
  const runCells = applyExtraNegative(plan.cells, extraNegative);
  const carriedPendingTasks = readCharacterSheetPendingTasks(d);

  const result = await runMultiGridCells({
    cells: runCells,
    sourceUrl: sourceRef,
    modelId,
    size,
    strength,
    signal,
    // 节点级并发（缺省 2，范围 1–4）：设定表逐格出图不再串行
    concurrency: resolveCellGenConcurrency(d),
    onProgress: (done, all) => {
      updateNodeData(block.id, { status: 'running', batchProgress: { done, total: all } });
    },
    onPendingChange: (tasks) => {
      const live = [
        ...carriedPendingTasks.filter((t) => !tasks.some((x) => x.taskId === t.taskId)),
        ...tasks,
      ].sort((a, b) => a.cellIndex - b.cellIndex);
      updateNodeData(block.id, {
        status: 'running',
        characterSheetPendingTasks: live,
        pendingImageTasks: live.map((t) => ({ ...t })),
        pendingImageTaskId: live[0]?.taskId,
      });
    },
  });

  const orderedUrls = result.slots;
  const carriedPending = carriedPendingTasks.filter(
    (t) => !((orderedUrls[t.cellIndex] ?? '').trim()),
  );
  const pendingTasks = [...carriedPending, ...result.pendingTasks]
    .filter((t, i, all) => all.findIndex((x) => x.taskId === t.taskId) === i)
    .sort((a, b) => a.cellIndex - b.cellIndex);
  const planNote = {
    characterSheetKind: plan.kind,
    characterSheetPlan: plan,
    characterSheetCells: plan.cells,
  };

  // 取消：已完成格先落盘（与既有结果合并，不丢已完成结果），随后按既有口径抛「已取消」；
  // 未开始的格不被改动，仍可由「逐格重试」单独补跑。
  if (result.cancelled) {
    const produced = result.slots
      .map((url, i) => ({ cellIndex: i, url: (url ?? '').trim() }))
      .filter((u) => u.url.length > 0);
    const merged = mergeResumedCellUrls(readCharacterSheetCellUrls(d), produced, total).urls.slice(
      0,
      total,
    );
    const cancelNote = `已取消本轮逐格出图：${compactCellUrls(merged).length}/${total} 格有图（已完成格保留，未开始格未改动，可逐格重试）`;
    updateNodeData(block.id, {
      ...planNote,
      effectiveModel: modelId,
      modelFallbackNote,
      ...buildCharacterSheetResultPatch({
        kind: plan.kind,
        cellCount: total,
        cellUrls: merged,
        cells: plan.cells,
        failures: result.failures,
        gridCells: characterSheetPlanToGridCells(plan, merged),
        gridReverseResult: characterSheetPlanToGridResult(plan, merged, cancelNote),
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
      ...buildCharacterSheetResultPatch({
        kind: plan.kind,
        cellCount: total,
        cellUrls: orderedUrls,
        cells: plan.cells,
        failures: result.failures,
        gridCells: characterSheetPlanToGridCells(plan, orderedUrls),
        gridReverseResult: characterSheetPlanToGridResult(plan, orderedUrls, pendingNote),
        pendingTasks,
        model: modelId,
        message: [pendingNote, modelFallbackNote].filter(Boolean).join(' · ') || undefined,
        progress: { done: compactCellUrls(orderedUrls).length, total },
      }),
    });
    return;
  }

  if (result.generatedCount === 0) {
    updateNodeData(block.id, {
      ...planNote,
      effectiveModel: modelId,
      modelFallbackNote,
      ...buildCharacterSheetResultPatch({
        kind: plan.kind,
        cellCount: total,
        cellUrls: orderedUrls,
        cells: plan.cells,
        failures: result.failures,
        gridCells: [],
        gridReverseResult: undefined,
        model: modelId,
      }),
    });
    throw new Error(result.failures[0]?.error ?? '角色设定表未产出任何新图，禁止空成功');
  }

  const partialNote = describeMultiGridFailures(result.failures, total);
  const pendingNote = describeMultiGridPending(pendingTasks);
  const warningsNote = plan.warningsZh.length ? `口径提示：${plan.warningsZh[0]}` : '';

  updateNodeData(block.id, {
    ...planNote,
    status: 'success',
    error: undefined,
    effectiveModel: modelId,
    modelFallbackNote,
    ...buildCharacterSheetResultPatch({
      kind: plan.kind,
      cellCount: total,
      cellUrls: orderedUrls,
      cells: plan.cells,
      failures: result.failures,
      gridCells: characterSheetPlanToGridCells(plan, orderedUrls),
      gridReverseResult: characterSheetPlanToGridResult(plan, orderedUrls, partialNote),
      pendingTasks,
      model: modelId,
      message:
        [partialNote, pendingNote, modelFallbackNote, warningsNote].filter(Boolean).join(' · ') ||
        undefined,
      progress: { done: total, total },
    }),
  });
}

/* ────────────── 生产闭环：逐格重试 / 续查未完成格 / 清空单格 ────────────── */

/** 重试后的节点状态：有图即 success；无图但有失败账单为 error；其余收回 idle */
function resolveRetryStatus(
  failureCount: number,
  urls: (string | undefined)[],
): 'success' | 'error' | 'idle' {
  if (urls.some((u) => (u ?? '').trim())) return 'success';
  return failureCount > 0 ? 'error' : 'idle';
}

/** 上一轮失败账单里「本轮未参与重试」的格子 */
function readFailuresOutside(
  data: Record<string, unknown>,
  skipIndexes: number[],
): MultiGridCellFailure[] {
  const skip = new Set(skipIndexes);
  return readCharacterSheetFailures(data).filter((f) => !skip.has(f.index));
}

/**
 * 逐格重试：只重跑指定格（失败 / 后台 / 待跑），成功格一律原样保留。
 * 复用首轮的模型解析、出图尺寸与一致性强度口径，不另立一条出图链。
 */
export async function runCharacterSheetCellRetry(options: {
  blockId: string;
  data: Record<string, unknown>;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  indexes?: number[];
  upstreamPictures?: string[];
  upstreamPrompts?: string[];
  sourceRef?: string;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ ok: boolean; reason?: string; urls: string[]; failures: MultiGridCellFailure[] }> {
  const { blockId, data, updateNodeData } = options;
  const targets = selectMultiGridRetryIndexes(
    readCharacterSheetCellRunStates(data),
    options.indexes,
  );
  if (readCharacterSheetCellUrls(data).length === 0 && targets.length === 0) {
    return { ok: false, reason: '尚无设定表：请先选择版面并批量出图', urls: [], failures: [] };
  }
  if (targets.length === 0) {
    return {
      ok: false,
      reason: '没有需要重跑的格：已出图的格不会被重打',
      urls: [],
      failures: [],
    };
  }

  const sourceRef =
    (options.sourceRef ?? '').trim() ||
    resolveCharacterSheetSourceRef(data, options.upstreamPictures ?? []);
  const plan = resolveCharacterSheetRunPlan(data, options.upstreamPrompts ?? [], sourceRef);
  if (plan.cells.length === 0) {
    return { ok: false, reason: '当前版面没有可出图的格（不静默成功）', urls: [], failures: [] };
  }
  const { modelId, modelFallbackNote } = resolveCharacterSheetModelRequest(
    data,
    Boolean(sourceRef),
  );
  const quality = (data.quality as string) || 'auto';
  const { size } = resolveImageRequestSize({ quality, aspectRatio: plan.aspectRatio });
  const extraNegative =
    typeof data.negativePrompt === 'string' ? data.negativePrompt.trim() : '';
  const cells = applyExtraNegative(plan.cells, extraNegative);

  const existingUrls = readCharacterSheetCellUrls(data);
  const existingPending = readCharacterSheetPendingTasks(data).filter(
    (t) => !targets.includes(t.cellIndex),
  );

  const result = await runMultiGridCells({
    cells,
    sourceUrl: sourceRef,
    modelId,
    size,
    strength: plan.consistencyStrength,
    indexes: targets,
    // 重试同样走节点级并发（缺省 2）：多格重跑不再串行
    concurrency: resolveCellGenConcurrency(data),
    signal: options.signal,
    onProgress: options.onProgress,
    onPendingChange: (tasks) => {
      const all = [...existingPending, ...tasks].sort((a, b) => a.cellIndex - b.cellIndex);
      updateNodeData(blockId, {
        status: 'running',
        characterSheetPendingTasks: all,
        pendingImageTasks: all.map((t) => ({ ...t })),
        pendingImageTaskId: tasks[0]?.taskId,
      });
    },
  });

  const refreshed = result.slots
    .map((url, i) => ({ cellIndex: i, url: (url ?? '').trim() }))
    .filter((u) => u.url.length > 0);
  const merged = mergeResumedCellUrls(existingUrls, refreshed, plan.cells.length);
  const failures = [...readFailuresOutside(data, targets), ...result.failures].sort(
    (a, b) => a.index - b.index,
  );
  const pendingTasks = [...existingPending, ...result.pendingTasks].sort(
    (a, b) => a.cellIndex - b.cellIndex,
  );

  const committed = commitCharacterSheetCells({
    blockId,
    plan,
    cellUrls: merged.urls,
    failures,
    pendingTasks,
    model: modelId,
    modelFallbackNote,
    updateNodeData,
    extraPatch: {
      status: resolveRetryStatus(failures.length, merged.urls),
      error: undefined,
    },
  });

  // 取消：已完成的格与失败账单照常落盘（上面 commit 已做，不丢已完成结果），
  // 随后按既有口径抛「已取消」，未开始的格保持原状、仍可逐格重试。
  if (result.cancelled) throw new Error('已取消');

  return { ok: result.failures.length === 0, urls: committed.urls, failures: result.failures };
}

/**
 * 续查未完成格：复用 resumePendingImageTasks（与图像 / 多格推演同一条续查链），
 * 按 taskId → 格号把取回的图补进结果数组；仍在后台的继续登记，成功格不受影响。
 */
export async function resumeCharacterSheetPendingCells(options: {
  blockId: string;
  data: Record<string, unknown>;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  upstreamPictures?: string[];
  upstreamPrompts?: string[];
  sourceRef?: string;
  signal?: AbortSignal;
}): Promise<{
  fetched: number[];
  stillPending: MultiGridPendingCellTask[];
  failed: MultiGridPendingCellTask[];
}> {
  const { blockId, data, updateNodeData } = options;
  const tasks: PendingImageTask[] = readCharacterSheetPendingTasks(data);
  if (tasks.length === 0) {
    return { fetched: [], stillPending: [], failed: [] };
  }
  const result = await resumePendingImageTasks(tasks, options.signal);
  const modelId = ((data.model as string) || '').trim() || DEFAULT_PICTURE_GEN_MODEL_ID;
  const sourceRef =
    (options.sourceRef ?? '').trim() ||
    resolveCharacterSheetSourceRef(data, options.upstreamPictures ?? []);
  const plan = resolveCharacterSheetRunPlan(data, options.upstreamPrompts ?? [], sourceRef);

  const pairs = pairResumedTaskUrls(tasks, result.stillPending, result.failed, result.urls)
    .map(({ task, url }) => ({ cellIndex: task.cellIndex as number, url }))
    .filter((p) => Number.isInteger(p.cellIndex));
  const stillPending = result.stillPending
    .map(toCellPendingTask)
    .filter((t): t is MultiGridPendingCellTask => Boolean(t));
  const failed = result.failed
    .map(toCellPendingTask)
    .filter((t): t is MultiGridPendingCellTask => Boolean(t));

  if (plan.cells.length > 0) {
    const merged = mergeResumedCellUrls(
      readCharacterSheetCellUrls(data),
      pairs,
      plan.cells.length,
    );
    // 已取回的格不再是失败格；仍在后台 / 已失败的格继续留在账单里
    const settled = new Set(pairs.map((p) => p.cellIndex));
    const carried = readFailuresOutside(data, [...settled]).filter(
      (f) => !stillPending.some((t) => t.cellIndex === f.index),
    );
    commitCharacterSheetCells({
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

  // 无法重建版面（版面参数已改空）时只落盘任务状态，不动既有结果
  updateNodeData(blockId, {
    characterSheetPendingTasks: stillPending.length ? stillPending : undefined,
    pendingImageTasks: stillPending.length ? stillPending : undefined,
    pendingImageTaskId: stillPending[0]?.taskId,
    status: stillPending.length ? 'running' : 'idle',
  });
  return { fetched: [], stillPending, failed };
}

function toCellPendingTask(task: PendingImageTask): MultiGridPendingCellTask | undefined {
  if (!Number.isInteger(task.cellIndex) || (task.cellIndex as number) < 0) return undefined;
  return {
    taskId: task.taskId,
    cellIndex: task.cellIndex as number,
    ...(task.prompt ? { prompt: task.prompt } : {}),
  };
}

/** 单格清空：清掉该格图并重建回写结构，成功格不受影响 */
export function dropCharacterSheetCell(options: {
  blockId: string;
  data: Record<string, unknown>;
  index: number;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  sourceRef?: string;
  upstreamPictures?: string[];
  upstreamPrompts?: string[];
}): boolean {
  const { blockId, data, index, updateNodeData } = options;
  const urls = readCharacterSheetCellUrls(data);
  if (!(urls[index] ?? '').trim()) return false;
  const stored = readStoredPlan(data.characterSheetPlan);
  const sourceRef =
    (options.sourceRef ?? '').trim() ||
    resolveCharacterSheetSourceRef(data, options.upstreamPictures ?? []);
  const plan = stored
    ? { ...stored, cells: stored.cells.map((c, i) => ({ ...c, cellIndex: i })) }
    : resolveCharacterSheetRunPlan(data, options.upstreamPrompts ?? [], sourceRef);
  if (!plan.cells[index]) return false;
  const modelId = ((data.model as string) || '').trim() || DEFAULT_PICTURE_GEN_MODEL_ID;
  commitCharacterSheetCells({
    blockId,
    plan,
    cellUrls: applyCellUrls(urls, [{ cellIndex: index, url: undefined }], plan.cells.length),
    failures: readFailuresOutside(data, [index]),
    pendingTasks: readCharacterSheetPendingTasks(data).filter((t) => t.cellIndex !== index),
    model: modelId,
    updateNodeData,
  });
  return true;
}
