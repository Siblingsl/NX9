/**
 * 有界并发原语回归（engine/run-with-concurrency.ts）。
 *
 * 注意：本文件走**相对路径直取源码**，被测模块自身零依赖（不碰 @nx9/shared），
 * 因此不受 packages/shared barrel 既有缺陷影响（barrel 缺陷见 docs/NX9-CELL-GEN-CONCURRENCY.md）。
 * 覆盖：并发上限不超限 / 结果按下标归属 / 取消语义 / 单点失败隔离 / 空输入 /
 *       limit = 1 与串行等价 / 进度账目 / 下限归一 / 取消判定。
 */
import { describe, expect, it } from 'vitest';
import { isCancelError, resolveRunConcurrency, runWithConcurrency } from '../run-with-concurrency';

/** 手动放行的 Promise（用于精确控制「在途 / 完成」时序） */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** 让本轮微任务 + 定时器宏任务跑完（并发池推进需要） */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('runWithConcurrency：并发上限与归属', () => {
  it('同时在跑的项数不超过 limit，结果按下标对齐', async () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    let inFlight = 0;
    let maxInFlight = 0;
    const seen: number[] = [];

    const outcome = await runWithConcurrency(
      items,
      async (item) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        seen.push(item);
        await flush();
        inFlight -= 1;
        return item * 2;
      },
      { limit: 3 },
    );

    expect(maxInFlight).toBe(3);
    expect(outcome.results).toEqual(items.map((i) => i * 2));
    expect(outcome.done).toBe(25);
    expect(outcome.started).toBe(25);
    expect(outcome.failed).toBe(0);
    expect(outcome.cancelled).toBe(false);
    // 每项恰好跑一次，结果按下标归属而不是按完成顺序
    expect([...seen].sort((a, b) => a - b)).toEqual(items);
  });

  it('limit = 1 与串行逐项执行等价（顺序与进度完全一致）', async () => {
    const order: string[] = [];
    const progress: [number, number][] = [];

    const outcome = await runWithConcurrency(
      ['a', 'b', 'c', 'd'],
      async (item) => {
        order.push(item);
        return item.toUpperCase();
      },
      { limit: 1, onProgress: (done, total) => progress.push([done, total]) },
    );

    expect(order).toEqual(['a', 'b', 'c', 'd']);
    expect(outcome.results).toEqual(['A', 'B', 'C', 'D']);
    // 串行口径：进入第 n 项前报 (n, total)，收尾再报一次 (total, total)
    expect(progress).toEqual([
      [0, 4],
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ]);
  });

  it('空输入：不启 worker，进度按串行口径收尾一次 (0, 0)', async () => {
    const progress: [number, number][] = [];
    const outcome = await runWithConcurrency([], async () => 'x', {
      limit: 3,
      onProgress: (done, total) => progress.push([done, total]),
    });

    expect(outcome).toEqual({
      results: [],
      errors: [],
      started: 0,
      done: 0,
      failed: 0,
      cancelled: false,
    });
    expect(progress).toEqual([[0, 0]]);
  });

  it('并发下的进度账目：done 单调不减，收尾一次 (total, total)', async () => {
    const progress: [number, number][] = [];
    const outcome = await runWithConcurrency(
      [1, 2, 3, 4, 5],
      async (i) => {
        await flush();
        return i;
      },
      { limit: 2, onProgress: (done, total) => progress.push([done, total]) },
    );

    expect(progress.every(([, total]) => total === 5)).toBe(true);
    expect(progress[progress.length - 1]).toEqual([5, 5]);
    for (let i = 1; i < progress.length; i += 1) {
      expect(progress[i]![0]).toBeGreaterThanOrEqual(progress[i - 1]![0]);
    }
    expect(outcome.done).toBe(5);
  });
});

describe('runWithConcurrency：失败隔离', () => {
  it('单点失败只记在该项名下，不打断其它任务、不吞掉其它错误', async () => {
    const outcome = await runWithConcurrency(
      [0, 1, 2, 3],
      async (i) => {
        if (i === 1) throw new Error('第 2 项炸了');
        if (i === 3) throw new Error('第 4 项也炸了');
        await flush();
        return i;
      },
      { limit: 2 },
    );

    expect(outcome.results[0]).toBe(0);
    expect(outcome.results[2]).toBe(2);
    expect(outcome.results[1]).toBeUndefined();
    expect(outcome.results[3]).toBeUndefined();
    expect((outcome.errors[1] as Error).message).toBe('第 2 项炸了');
    expect((outcome.errors[3] as Error).message).toBe('第 4 项也炸了');
    expect(outcome.failed).toBe(2);
    expect(outcome.done).toBe(4);
    // 失败不算取消：跑满即 cancelled = false
    expect(outcome.cancelled).toBe(false);
    expect(outcome.started).toBe(4);
  });

  it('同步抛错同样被收敛到该项名下', async () => {
    const outcome = await runWithConcurrency(
      ['ok', 'bad'],
      (item) => {
        if (item === 'bad') throw new Error('同步失败');
        return item;
      },
      { limit: 2 },
    );

    expect(outcome.results[0]).toBe('ok');
    expect(outcome.failed).toBe(1);
    expect((outcome.errors[1] as Error).message).toBe('同步失败');
  });
});

describe('runWithConcurrency：取消语义', () => {
  it('取消后不启动未开始的任务，在途任务跑完并按项记账', async () => {
    const controller = new AbortController();
    const gates = Array.from({ length: 5 }, () => deferred<string>());
    let started = 0;

    const running = runWithConcurrency(
      [0, 1, 2, 3, 4],
      async (i) => {
        started += 1;
        return gates[i]!.promise;
      },
      { limit: 2, signal: controller.signal },
    );

    await flush();
    expect(started).toBe(2); // 2 个 worker，各自在途 1 项

    gates[0]!.resolve('r0');
    await flush();
    expect(started).toBe(3); // 空出的 worker 取了第 3 项

    controller.abort();
    gates[1]!.resolve('r1');
    gates[2]!.resolve('r2');
    const outcome = await running;

    expect(outcome.cancelled).toBe(true);
    expect(outcome.started).toBe(3);
    expect(outcome.done).toBe(3);
    expect(outcome.results[0]).toBe('r0');
    expect(outcome.results[1]).toBe('r1');
    expect(outcome.results[2]).toBe('r2');
    expect(outcome.results[3]).toBeUndefined();
    expect(outcome.results[4]).toBeUndefined();
    expect(outcome.failed).toBe(0);
  });

  it('开工前已取消：一项都不启动', async () => {
    const controller = new AbortController();
    controller.abort();
    let started = 0;

    const outcome = await runWithConcurrency(
      [0, 1, 2],
      async (i) => {
        started += 1;
        return i;
      },
      { limit: 2, signal: controller.signal },
    );

    expect(started).toBe(0);
    expect(outcome.started).toBe(0);
    expect(outcome.done).toBe(0);
    expect(outcome.cancelled).toBe(true);
  });

  it('isCancelled 判定与 signal 取或（FlowRunSignal.cancelled 口径）', async () => {
    let cancelled = false;
    const outcome = await runWithConcurrency(
      [0, 1, 2],
      async (i) => {
        if (i === 0) cancelled = true;
        return i;
      },
      { limit: 1, isCancelled: () => cancelled },
    );

    expect(outcome.started).toBe(1);
    expect(outcome.done).toBe(1);
    expect(outcome.cancelled).toBe(true);
  });
});

describe('并发上限归一与取消判定', () => {
  it('limit 缺省 / 非法 = 1（串行），不超过项数，空输入 = 0', () => {
    expect(resolveRunConcurrency(undefined, 5)).toBe(1);
    expect(resolveRunConcurrency(null, 5)).toBe(1);
    expect(resolveRunConcurrency(Number.NaN, 5)).toBe(1);
    expect(resolveRunConcurrency('abc', 5)).toBe(1);
    expect(resolveRunConcurrency(0, 5)).toBe(1);
    expect(resolveRunConcurrency(-3, 5)).toBe(1);
    expect(resolveRunConcurrency(2, 5)).toBe(2);
    expect(resolveRunConcurrency(3.9, 5)).toBe(3);
    expect(resolveRunConcurrency(9, 2)).toBe(2);
    expect(resolveRunConcurrency(2, 0)).toBe(0);
  });

  it('取消判定沿用逐格出图既有口径（已取消 / 已中止）', () => {
    expect(isCancelError(new Error('已取消'))).toBe(true);
    expect(isCancelError(new Error('任务已中止'))).toBe(true);
    expect(isCancelError('已取消')).toBe(true);
    expect(isCancelError(new Error('模型拒绝'))).toBe(false);
    expect(isCancelError(undefined)).toBe(false);
  });
});
