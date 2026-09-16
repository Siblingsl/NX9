/**
 * cell-gen-batch.ts —— 逐格出图的**有界并发内核**（「多格推演」与「角色设定表」共用）。
 *
 * 职责：给一批格子按下标跑出图，并把「进度 / 逐格失败账单 / 后台待续查任务 / 取消」四本账记准。
 * 出图器由调用方注入（真实链路注入 runPictureGenJob），因此本模块**不依赖图片运行器、
 * 也不依赖 @nx9/shared 运行时**（只做 import type），可在 barrel 缺陷未修复前直接单测。
 *
 * 与逐格串行版的等价性（并发不改台账口径）：
 * - `slots` 按下标预分配 → 完成顺序不影响归属；
 * - `failures` / `pendingTasks` 一律按格号升序返回 → 与串行版的顺序口径一致，可逐格重试；
 * - `onProgress(done, total)` 的 done 口径 = 「已完成项数（含失败 / 复用源图）」，与串行版逐个
 *   进入下一项前的计数序列一致；跑满时收尾再回调一次 (total, total)；
 * - 取消：不再启动未开始的格，在途格跑完并记账，函数本身**返回** `cancelled: true` 而不抛错，
 *   由调用方决定「先落盘已完成格，再按既有口径抛取消」。
 */
import {
  isCancelError,
  resolveRunConcurrency,
  runWithConcurrency,
  type RunWithConcurrencyOutcome,
} from '../run-with-concurrency';
import type { MultiGridCellFailure, MultiGridPendingCellTask } from '../multi-grid-closure';

/** 节点级并发可选项（UI 下拉与执行器共用同一份，避免两处口径漂移） */
export const CELL_GEN_CONCURRENCY_OPTIONS = [1, 2, 3, 4] as const;
/** 节点级并发缺省值（与导演台批出的 `data.concurrency ?? 2` 同口径） */
export const CELL_GEN_DEFAULT_CONCURRENCY = 2;
/** 节点级并发上限（1–4；再高会打爆出图通道，不做无限放开） */
export const CELL_GEN_MAX_CONCURRENCY = CELL_GEN_CONCURRENCY_OPTIONS[CELL_GEN_CONCURRENCY_OPTIONS.length - 1];

/**
 * 节点级并发解析：`data.concurrency` 覆盖缺省值 2，裁剪到 [1, 4]。
 * 缺省 / 空串 / 非有限值 → 2；0 或负数 → 1（即串行）。
 */
export function resolveCellGenConcurrency(
  data: Record<string, unknown> | undefined | null,
): number {
  const raw = data ? data.concurrency : undefined;
  const n = raw == null || raw === '' ? NaN : Number(raw);
  const value = Number.isFinite(n) ? Math.trunc(n) : CELL_GEN_DEFAULT_CONCURRENCY;
  return Math.min(CELL_GEN_MAX_CONCURRENCY, Math.max(1, value));
}

/** 逐格出图所需的最小格信息（MultiGridCell / CharacterSheetCell 均满足） */
export interface CellGenCell {
  role: string;
  imagePrompt: string;
  negativePrompt?: string;
  /** 该格直接复用源图，不出图 */
  reuseSourceImage?: boolean;
}

export interface CellGenRequest<C extends CellGenCell> {
  cell: C;
  index: number;
  signal?: AbortSignal;
  /** 异步任务 id 一拿到就回调（供落盘待续查，不等轮询超时） */
  onTaskId: (taskId: string) => void;
}

export interface CellGenBatchOptions<C extends CellGenCell> {
  cells: C[];
  /** 源图（作为图生图参考；复用格直接取它） */
  sourceUrl: string;
  /** 只跑这些格（缺省全跑），用于「重试失败格」不重打成功格 */
  indexes?: number[];
  /** 并发上限；缺省 1 = 串行（保留既有默认行为）。节点级缺省值由 resolveCellGenConcurrency 给出。 */
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** 待续查任务变化（已按格号升序）；taskId 一拿到就会回调一次 */
  onPendingChange?: (tasks: MultiGridPendingCellTask[]) => void;
  /** 单格出图器（调用方注入；返回该格的图 URL 列表） */
  generate: (request: CellGenRequest<C>) => Promise<string[]>;
  /** 从异常里取回后台任务 id（如图片轮询超时携带的 taskId）；缺省不取 */
  readErrorTaskId?: (error: unknown) => string | undefined;
}

export interface CellGenBatchResult {
  /** 按格下标对齐；未出图的格子为 undefined */
  slots: (string | undefined)[];
  /** 实际新生成（不含复用源图）的格子数 */
  generatedCount: number;
  /** 失败账单（按格号升序） */
  failures: MultiGridCellFailure[];
  /** 落盘待续查的异步任务（按格号升序） */
  pendingTasks: MultiGridPendingCellTask[];
  /** 本轮是否被取消中断（未跑完；已完成格照常保留） */
  cancelled: boolean;
  /** 参与本轮出图的格数（= indexes 或全格） */
  total: number;
  /** 已完成项数（含失败 / 复用源图） */
  done: number;
}

function sortByCellIndex(tasks: MultiGridPendingCellTask[]): MultiGridPendingCellTask[] {
  return [...tasks].sort((a, b) => a.cellIndex - b.cellIndex);
}

/**
 * 逐格批量出图（有界并发）。函数不抛「单项失败」，只在取消时以 `cancelled: true` 返回。
 */
export async function runCellGenBatch<C extends CellGenCell>(
  options: CellGenBatchOptions<C>,
): Promise<CellGenBatchResult> {
  const { cells, sourceUrl, signal, onProgress, onPendingChange } = options;
  const total = cells.length;
  const slots: (string | undefined)[] = new Array(total).fill(undefined);
  const failures: MultiGridCellFailure[] = [];
  const pendingTasks: MultiGridPendingCellTask[] = [];
  const requested = Array.isArray(options.indexes)
    ? [...new Set(options.indexes)].filter((i) => Number.isInteger(i) && i >= 0 && i < total)
    : undefined;
  const order = requested ?? cells.map((_, i) => i);
  let generatedCount = 0;

  const notePending = (taskId: string, index: number, prompt: string) => {
    if (!taskId || pendingTasks.some((t) => t.taskId === taskId)) return;
    pendingTasks.push({ taskId, cellIndex: index, prompt: prompt.slice(0, 80) });
    onPendingChange?.(sortByCellIndex(pendingTasks));
  };

  const outcome: RunWithConcurrencyOutcome<undefined> = await runWithConcurrency(
    order,
    async (index) => {
      const cell = cells[index] as C;
      if (cell.reuseSourceImage) {
        // 「画面推演」的当前格复用源图，不重复出图（一样计入完成数）
        slots[index] = sourceUrl;
        return undefined;
      }
      try {
        const urls = await options.generate({
          cell,
          index,
          signal,
          onTaskId: (taskId) => notePending(taskId, index, cell.imagePrompt),
        });
        const first = urls.find((u) => typeof u === 'string' && u.trim());
        if (!first) throw new Error('图像生成未返回 URL，禁止空成功');
        slots[index] = first;
        generatedCount += 1;
      } catch (e) {
        // 取消类异常一律上抛给并发池记账（不混进失败账单）：调用方据此判定「本轮已取消」
        if (signal?.aborted) throw e;
        const message = e instanceof Error ? e.message : String(e);
        if (isCancelError(message)) throw e;
        // 轮询超时 = 任务仍在后台：登记以便续查，同时如实计入失败（不假绿）
        const taskId = options.readErrorTaskId?.(e);
        if (taskId) notePending(taskId, index, cell.imagePrompt);
        failures.push({ index, role: cell.role, error: message });
      }
      return undefined;
    },
    {
      limit: resolveRunConcurrency(options.concurrency, order.length),
      signal,
      onProgress,
    },
  );

  failures.sort((a, b) => a.index - b.index);
  // 并发池里逃出 worker 的异常一律按「取消」处理：取消类异常（已取消 / 已中止）与
  // 「signal 已 abort 期间抛出的任何异常」都会上抛（见上面的 worker catch）。
  // 因此 failed > 0 即表示本轮被取消；代价是 abort 期间某个格的真实失败不会进 failures 账单。
  const cancelled = outcome.cancelled || outcome.failed > 0;

  return {
    slots,
    generatedCount,
    failures,
    pendingTasks: sortByCellIndex(pendingTasks),
    cancelled,
    total: order.length,
    done: outcome.done,
  };
}
