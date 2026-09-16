/**
 * character-sheet-closure.ts — 「角色设定表」生产闭环的纯函数层。
 *
 * 设计口径：**复用 multi-grid-closure 的通用部分**（逐格 URL、后台待续查任务、
 * 续查合并、失败 / 待续查文案），本文件只补两处本节点特有的逻辑：
 * 1. 逐格状态机：本节点的计划 cells 存在 `characterSheetCells`（不是 `multiGridCells`），
 *    因此不能直接复用 readMultiGridCellRunStates，需要按同一状态语义重读一次；
 * 2. 回写结构：`content` / `output` 取逐格**画像提示词**（角色设定表的产出语义），
 *    而不是多格推演的逐格视频提示词；同时写入本节点自己的待续查键名。
 *
 * 约束：本文件不做任何副作用 —— 出图、落盘、写回节点在 character-sheet-ops.ts 与
 * CharacterSheetWorkspace.tsx；对 `@nx9/shared` 只做 `import type`（打包时整体擦除）。
 */
import {
  compactCellUrls,
  readMultiGridCellUrls,
  readMultiGridPendingTasks,
  type MultiGridCellFailure,
  type MultiGridCellRunState,
  type MultiGridCellStatus,
  type MultiGridPendingCellTask,
} from './multi-grid-closure';
import type { CharacterSheetCell, CharacterSheetPlan } from '@nx9/shared';

/* ────────────────────────── ① 逐格状态机 ────────────────────────── */

function readPlanCellList(data: Record<string, unknown>): CharacterSheetCell[] {
  const stored = data.characterSheetCells;
  if (Array.isArray(stored) && stored.length > 0) return stored as CharacterSheetCell[];
  const plan = data.characterSheetPlan as { cells?: unknown } | undefined;
  if (plan && Array.isArray(plan.cells) && plan.cells.length > 0) {
    return plan.cells as CharacterSheetCell[];
  }
  return [];
}

/** 逐格图 URL，按格号对齐（缺格为空串）—— 读取既有 `gridCells`，不新增存放位置 */
export const readCharacterSheetCellUrls = readMultiGridCellUrls;

/**
 * 后台待续查任务（按格号升序）。
 *
 * 不能直接复用 readMultiGridPendingTasks：它只认 `multiGridPendingTasks` / `pendingImageTasks`，
 * 不认识本节点的 `characterSheetPendingTasks`（本节点同时写通用键名供图像续查链使用）。
 * 归一化口径与那条链完全一致：缺 taskId / 缺格号的条目跳过，同 taskId 去重。
 */
export function readCharacterSheetPendingTasks(
  data: Record<string, unknown>,
): MultiGridPendingCellTask[] {
  const raw = Array.isArray(data.characterSheetPendingTasks)
    ? (data.characterSheetPendingTasks as unknown[])
    : readMultiGridPendingTasks(data);
  const seen = new Set<string>();
  const out: MultiGridPendingCellTask[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as { taskId?: unknown; cellIndex?: unknown; prompt?: unknown };
    const taskId = typeof entry.taskId === 'string' ? entry.taskId.trim() : '';
    const cellIndex = Number(entry.cellIndex);
    if (!taskId || !Number.isInteger(cellIndex) || cellIndex < 0) continue;
    if (seen.has(taskId)) continue;
    seen.add(taskId);
    const prompt = typeof entry.prompt === 'string' ? entry.prompt.trim() : '';
    out.push({ taskId, cellIndex, ...(prompt ? { prompt } : {}) });
  }
  return out.sort((a, b) => a.cellIndex - b.cellIndex);
}

/**
 * 逐格状态机：与 multi-grid-closure 的 readMultiGridCellRunStates 同语义
 * （成功 > 后台 > 出图中 > 失败 > 待跑），只是计划格来源不同。
 */
export function readCharacterSheetCellRunStates(
  data: Record<string, unknown>,
): MultiGridCellRunState[] {
  const planCells = readPlanCellList(data);
  const urls = readCharacterSheetCellUrls(data);
  const failures = readCharacterSheetFailures(data);
  const failureByIndex = new Map(failures.map((f) => [f.index, f]));
  const pendingByIndex = new Map(
    readCharacterSheetPendingTasks(data).map((t) => [t.cellIndex, t]),
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

/** 上一轮失败账单（与 multi-grid 同结构：`lastResult.failures`） */
export function readCharacterSheetFailures(
  data: Record<string, unknown>,
): MultiGridCellFailure[] {
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
      role: typeof entry.role === 'string' ? entry.role : `第 ${index + 1} 格`,
      error: typeof entry.error === 'string' ? entry.error : '生成失败',
    });
  }
  return out;
}

/* ────────────────────────── ② 回写结构 ────────────────────────── */

/**
 * 逐格结果 → 节点 data 回写补丁。
 *
 * 与多格推演的回写同构（下游契约不变：gridCells / gridReverseResult / splitUrls / pictures），
 * 差异只有两处：
 * - `content` / `output` 取逐格**画像提示词**（角色设定表的产出语义）；
 * - 待续查键名用本节点自己的 `characterSheetPendingTasks`，同时保留通用
 *   `pendingImageTasks`（图像节点续查链读这个键）。
 */
export function buildCharacterSheetResultPatch(input: {
  kind: string;
  cellCount: number;
  cellUrls: (string | undefined)[];
  cells: CharacterSheetCell[];
  failures: MultiGridCellFailure[];
  gridCells: unknown[];
  gridReverseResult: unknown;
  pendingTasks?: MultiGridPendingCellTask[];
  model?: string;
  message?: string;
  progress?: { done: number; total: number };
}): Record<string, unknown> {
  const filled = compactCellUrls(input.cellUrls);
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
    content: input.cells.map((c) => c.imagePromptZh).filter(Boolean).join('\n\n'),
    output: input.cells.map((c) => c.imagePrompt).filter(Boolean).join('\n\n'),
    lastResult: {
      count: filled.length,
      total,
      urls: filled,
      failures: input.failures,
      model: input.model,
      mode: input.kind,
    },
    batchProgress: input.progress ?? { done: total, total },
    characterSheetPendingTasks: pendingTasks.length ? pendingTasks : undefined,
    pendingImageTasks: pendingTasks.length
      ? pendingTasks.map((t) => ({
          taskId: t.taskId,
          prompt: t.prompt,
          cellIndex: t.cellIndex,
        }))
      : undefined,
    pendingImageTaskId: pendingTasks[0]?.taskId,
    message: input.message,
  };
}

/* ────────────────────────── ③ 版面签名 ────────────────────────── */

/**
 * 「已登记的角色参考图」与新一批结果是否仍然对得上。
 * 结构（kind + 参考图 + 逐格提示词 + 逐格图）变化即失效 —— 面板据此提示重新登记。
 */
export function buildCharacterSheetSignature(
  plan: Pick<CharacterSheetPlan, 'kind' | 'sourceRef' | 'consistencyLock' | 'cells'> | undefined,
  urls: (string | undefined)[],
): string {
  if (!plan) return '';
  const cells = plan.cells
    .map((c, i) => `${i}:${c.role}:${c.imagePromptZh}:${(urls[i] ?? '').trim()}`)
    .join('|');
  return `${plan.kind}|${plan.sourceRef}|${plan.consistencyLock}|${cells}`;
}

/** 登记记录（存在节点 data，`characterSheetReference`） */
export interface CharacterSheetReferenceState {
  characterId: string;
  characterName: string;
  imageUrl: string;
  /** 登记时的一致性锁定短语，供面板核对 */
  consistencyPrompt: string;
  signature: string;
  at: string;
  /** 是否同时写入了角色档案的一致性描述 */
  wroteConsistency: boolean;
}
