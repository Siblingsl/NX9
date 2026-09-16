/**
 * run-with-concurrency.ts —— NX9 有界并发原语（worker 池），**无副作用、无外部依赖**。
 *
 * 用途：把「一批互相独立的任务」按受限并发跑完，同时保证：
 * 1. **不超限** —— 同时在跑的 worker 数 <= limit（缺省 1 = 串行，与既有逐项循环等价）；
 * 2. **不吞错** —— 单项失败只记在该项名下（results / errors 按下标对齐），不打断其它在途任务；
 * 3. **可取消** —— 观察到取消后不再启动新任务，已在途的任务跑完并各自记账；
 * 4. **可观测** —— onProgress(done, total) 的 done 单调不减：每启动一项前回调一次，
 *    跑满时收尾再回调一次 (total, total)。**被取消而提前收场时不再补收尾回调**
 *    （最后一次回调是「最后启动的那一项之前」的计数，调用方需自行用 outcome.done 收尾）。
 *
 * 与 flow-runner.ts 的 `runLayerConcurrent`（模块私有 worker 池，PARALLEL_LIMIT = 3）语义一致：
 * 同样是「先取号再 await」的游标池、同样尊重取消标记。此处独立成文件是为了让逐格出图这类
 * 非图层批处理也能复用它，并且可在 vitest 里以相对路径直测（barrel 缺陷不影响本文件）。
 * flow-runner.ts 的既有实现**未改动**（见 docs/NX9-CELL-GEN-CONCURRENCY.md「为什么没有回填」）。
 */

/** 取消类异常的默认判定标记（与逐格出图既有口径一致） */
const CANCEL_MARKERS = ['已取消', '已中止'];

export interface RunWithConcurrencyOptions {
  /** 并发上限（同刻 worker 数）；缺省 1 = 串行。会被裁剪到 [1, items.length]。 */
  limit?: number;
  /** 取消信号：aborted 之后不再启动新任务（在途任务跑完）。 */
  signal?: AbortSignal;
  /** 额外取消判定（与 signal 取或），用于 FlowRunSignal.cancelled 这类非 AbortSignal 标记。 */
  isCancelled?: () => boolean;
  /** 进度：done = 已完成（含失败 / 未产出）项数。启动每一项前回调，跑满时收尾再回调一次。 */
  onProgress?: (done: number, total: number) => void;
}

export interface RunWithConcurrencyOutcome<R> {
  /** 按下标对齐的返回值；失败项与未跑项为 undefined */
  results: (R | undefined)[];
  /** 按下标对齐的异常；成功项与未跑项为 undefined */
  errors: (unknown | undefined)[];
  /** 实际启动的项数 */
  started: number;
  /** 已完成（成功 + 失败）项数 */
  done: number;
  /** 失败项数 */
  failed: number;
  /** 因取消而未跑完（started < items.length）；跑满时为 false */
  cancelled: boolean;
}

/** 并发上限归一：缺省 / 非有限值 = 1（串行）；上限不超过项数；空输入 = 0（不启 worker）。 */
export function resolveRunConcurrency(limit: unknown, itemCount: number): number {
  const total = Math.trunc(Number(itemCount));
  if (!Number.isFinite(total) || total <= 0) return 0;
  const raw = limit == null ? NaN : Number(limit);
  const n = Number.isFinite(raw) ? Math.trunc(raw) : 1;
  return Math.min(Math.max(n, 1), total);
}

/** 取消类异常判定（既有口径：文案含「已取消 / 已中止」） */
export function isCancelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!message) return false;
  return CANCEL_MARKERS.some((marker) => message.includes(marker));
}

/**
 * 有界并发执行一批互相独立的任务。**本函数不抛错**：worker 的异常按项收进 `errors`，
 * 由调用方决定是「单项失败继续」还是「取消中断」。
 */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R> | R,
  options: RunWithConcurrencyOptions = {},
): Promise<RunWithConcurrencyOutcome<R>> {
  const total = items.length;
  const results: (R | undefined)[] = new Array(total).fill(undefined);
  const errors: (unknown | undefined)[] = new Array(total).fill(undefined);
  const isCancelled = () => Boolean(options.signal?.aborted) || options.isCancelled?.() === true;

  if (total === 0) {
    // 空输入：与串行循环收尾一次 (0, 0) 同口径，不启 worker
    options.onProgress?.(0, 0);
    return { results, errors, started: 0, done: 0, failed: 0, cancelled: false };
  }

  let cursor = 0;
  let started = 0;
  let done = 0;
  let failed = 0;

  const runWorker = async (): Promise<void> => {
    while (cursor < total) {
      if (isCancelled()) return;
      const index = cursor;
      cursor += 1;
      started += 1;
      options.onProgress?.(done, total);
      let threw = false;
      let thrown: unknown;
      try {
        results[index] = await worker(items[index] as T, index);
      } catch (e) {
        threw = true;
        thrown = e;
      }
      done += 1;
      if (threw) {
        errors[index] = thrown;
        failed += 1;
      }
    }
  };

  const limit = resolveRunConcurrency(options.limit, total);
  await Promise.all(Array.from({ length: limit }, () => runWorker()));

  const stoppedEarly = started < total;
  if (!stoppedEarly) options.onProgress?.(done, total);
  return { results, errors, started, done, failed, cancelled: stoppedEarly };
}
