/**
 * 逐格出图有界并发回归（engine/flow-runner-ops/cell-gen-batch.ts）——
 * 「多格推演」「角色设定表」共用的逐格批量内核。
 *
 * 范围说明（如实）：
 * - 出图器由内核**注入**，本文件用 mock 出图器验证并发语义（调用次数 / 上限 / 台账 / 取消 / 重试）；
 * - 两个执行器 multi-grid-ops.ts / character-sheet-ops.ts 会在 import 期解析 `@nx9/shared` barrel，
 *   该 barrel 当前引用了 8 个不存在的 data/* 模块（既有缺陷，见 docs/NX9-CELL-GEN-CONCURRENCY.md），
 *   因此在 vitest 里**无法直接 import 执行器**，真实出图链路（runPictureGenJob）本文件不覆盖；
 * - 执行器侧的接线由末尾「源码级接线守卫」按源码文本断言（沿用 flow-runner 拆分守卫同款做法）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CELL_GEN_CONCURRENCY_OPTIONS,
  CELL_GEN_DEFAULT_CONCURRENCY,
  CELL_GEN_MAX_CONCURRENCY,
  resolveCellGenConcurrency,
  runCellGenBatch,
  type CellGenCell,
} from '../flow-runner-ops/cell-gen-batch';

const SOURCE = '/media/uploads/keyframe-01.png';
const OPS_DIR = resolve(__dirname, '..', 'flow-runner-ops');

function readOp(file: string): string {
  return readFileSync(resolve(OPS_DIR, file), 'utf8');
}

/** 让本轮微任务 + 定时器宏任务跑完（并发池推进需要） */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** 造一批格子；reuse 里的格标记为「复用源图，不出图」 */
function makeCells(count: number, reuse: number[] = []): CellGenCell[] {
  return Array.from({ length: count }, (_, i) => ({
    role: `格 ${i + 1}`,
    imagePrompt: `prompt ${i}`,
    negativePrompt: `neg ${i}`,
    reuseSourceImage: reuse.includes(i),
  }));
}

describe('逐格出图并发：上限与调用次数', () => {
  it('25 格（含 1 格复用源图）：同时在跑的格数不超过并发上限，出图器只被调用 24 次', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let calls = 0;

    const result = await runCellGenBatch({
      cells: makeCells(25, [12]),
      sourceUrl: SOURCE,
      concurrency: 2,
      generate: async ({ cell }) => {
        calls += 1;
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await flush();
        inFlight -= 1;
        return [`/media/${cell.role}.png`];
      },
    });

    expect(calls).toBe(24);
    expect(maxInFlight).toBe(2);
    expect(result.generatedCount).toBe(24);
    expect(result.slots[12]).toBe(SOURCE); // 复用格直接取源图，不重复出图
    expect(result.slots.filter((u) => (u ?? '').trim()).length).toBe(25);
    expect(result.slots[0]).toBe('/media/格 1.png');
    expect(result.failures).toEqual([]);
    expect(result.cancelled).toBe(false);
    expect(result.total).toBe(25);
    expect(result.done).toBe(25);
  });

  it('只跑指定格（逐格重试口径）：非指定格不出图', async () => {
    const called: number[] = [];
    const result = await runCellGenBatch({
      cells: makeCells(6),
      sourceUrl: SOURCE,
      concurrency: 3,
      indexes: [5, 1, 1],
      generate: async ({ index }) => {
        called.push(index);
        return [`/media/r${index}.png`];
      },
    });

    expect([...called].sort((a, b) => a - b)).toEqual([1, 5]); // 去重后只跑 1 / 5
    expect(result.total).toBe(2);
    expect(result.slots[1]).toBe('/media/r1.png');
    expect(result.slots[5]).toBe('/media/r5.png');
    expect(result.slots[0]).toBeUndefined();
  });

  it('不传并发上限 = 串行（既有默认行为不变）', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await runCellGenBatch({
      cells: makeCells(5),
      sourceUrl: SOURCE,
      generate: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await flush();
        inFlight -= 1;
        return ['/media/one.png'];
      },
    });
    expect(maxInFlight).toBe(1);
  });
});

describe('逐格出图并发：进度账目', () => {
  it('并发下进度账目正确：done 单调不减、收尾为 (完成数, 总数)，失败格也计入完成数', async () => {
    const progress: [number, number][] = [];
    const result = await runCellGenBatch({
      cells: makeCells(6),
      sourceUrl: SOURCE,
      concurrency: 3,
      onProgress: (done, total) => progress.push([done, total]),
      generate: async ({ index, cell }) => {
        await flush();
        if (index === 2) throw new Error('模型拒绝');
        if (index === 5) return []; // 空成功：必须被当成失败，不假绿
        return [`/media/${cell.role}.png`];
      },
    });

    expect(progress.every(([, total]) => total === 6)).toBe(true);
    expect(progress[progress.length - 1]).toEqual([6, 6]);
    for (let i = 1; i < progress.length; i += 1) {
      expect(progress[i]![0]).toBeGreaterThanOrEqual(progress[i - 1]![0]);
    }
    expect(result.done).toBe(6);
    expect(result.generatedCount).toBe(4);
    expect(result.failures).toEqual([
      { index: 2, role: '格 3', error: '模型拒绝' },
      { index: 5, role: '格 6', error: '图像生成未返回 URL，禁止空成功' },
    ]);
  });

  it('失败账单按格号升序（与完成顺序无关）', async () => {
    const result = await runCellGenBatch({
      cells: makeCells(8),
      sourceUrl: SOURCE,
      concurrency: 4,
      generate: async ({ index }) => {
        // 让高格号先返回失败：串行顺序被打乱，账单仍须按格号
        await flush();
        if (index === 1 || index === 6) throw new Error('瞬时失败');
        return [`/media/g${index}.png`];
      },
    });

    expect(result.failures.map((f) => f.index)).toEqual([1, 6]);
  });
});

describe('逐格出图并发：失败可逐格重试', () => {
  it('部分失败 → 落失败账单 → 只重跑失败格，成功格不重打', async () => {
    const list = makeCells(6);
    const first = await runCellGenBatch({
      cells: list,
      sourceUrl: SOURCE,
      concurrency: 3,
      generate: async ({ index }) => {
        await flush();
        if (index === 1 || index === 4) throw new Error('瞬时失败');
        return [`/media/ok${index}.png`];
      },
    });

    expect(first.failures.map((f) => f.index)).toEqual([1, 4]);
    expect(first.generatedCount).toBe(4);
    expect(first.slots[0]).toBe('/media/ok0.png');

    const retried: number[] = [];
    const second = await runCellGenBatch({
      cells: list,
      sourceUrl: SOURCE,
      concurrency: 3,
      indexes: first.failures.map((f) => f.index),
      generate: async ({ index }) => {
        retried.push(index);
        await flush();
        return [`/media/retry${index}.png`];
      },
    });

    expect([...retried].sort((a, b) => a - b)).toEqual([1, 4]);
    expect(second.failures).toEqual([]);
    expect(second.slots[1]).toBe('/media/retry1.png');
    expect(second.slots[4]).toBe('/media/retry4.png');
    expect(second.slots[0]).toBeUndefined(); // 本轮未参与的格不出图、由调用方与既有结果合并
  });
});

describe('逐格出图并发：取消语义', () => {
  it('取消：未开始的格不再启动，已完成格不丢失，取消不进失败账单', async () => {
    const controller = new AbortController();
    const gates = Array.from({ length: 25 }, () => deferred<string[]>());
    const running = runCellGenBatch({
      cells: makeCells(25),
      sourceUrl: SOURCE,
      concurrency: 2,
      signal: controller.signal,
      generate: ({ index }) => gates[index]!.promise,
    });

    await flush();
    gates[0]!.resolve(['/media/c0.png']);
    await flush();
    gates[1]!.resolve(['/media/c1.png']);
    gates[2]!.resolve(['/media/c2.png']);
    controller.abort();
    const result = await running;

    expect(result.cancelled).toBe(true);
    expect(result.total).toBe(25);
    expect(result.done).toBe(3);
    expect(result.generatedCount).toBe(3);
    expect(result.slots[0]).toBe('/media/c0.png');
    expect(result.slots[1]).toBe('/media/c1.png');
    expect(result.slots[2]).toBe('/media/c2.png');
    expect(result.slots[3]).toBeUndefined();
    expect(result.failures).toEqual([]);
    // 已完成的 3 格不因取消而丢失（调用方据此先落盘再抛「已取消」）
    expect(result.slots.filter((u) => (u ?? '').trim()).length).toBe(3);
  });

  it('开工前已取消：一格都不出图', async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const result = await runCellGenBatch({
      cells: makeCells(4),
      sourceUrl: SOURCE,
      concurrency: 2,
      signal: controller.signal,
      generate: async () => {
        calls += 1;
        return ['/media/none.png'];
      },
    });

    expect(calls).toBe(0);
    expect(result.cancelled).toBe(true);
    expect(result.done).toBe(0);
    expect(result.generatedCount).toBe(0);
  });
});

describe('逐格出图并发：待续查台账', () => {
  it('taskId 一拿到就登记（不等超时）；异常携带的 taskId 也登记；账单按格号升序', async () => {
    const snapshots: number[][] = [];
    const result = await runCellGenBatch({
      cells: makeCells(4),
      sourceUrl: SOURCE,
      concurrency: 2,
      onPendingChange: (tasks) => snapshots.push(tasks.map((t) => t.cellIndex)),
      generate: async ({ index, onTaskId }) => {
        await flush();
        if (index === 1) {
          // 轮询超时：任务仍在后台，异常里带 taskId
          throw Object.assign(new Error('图片轮询超时，任务可能仍在后台运行'), {
            taskId: 'timeout-1',
          });
        }
        onTaskId(`task-${index}`);
        await flush();
        return [`/media/p${index}.png`];
      },
      readErrorTaskId: (e) => (e as { taskId?: string } | undefined)?.taskId,
    });

    expect(snapshots[0]).toEqual([0]); // 首个回调：taskId 一到手就登记
    expect(snapshots[snapshots.length - 1]).toEqual([0, 1, 2, 3]);
    expect(result.pendingTasks.map((t) => t.taskId)).toEqual([
      'task-0',
      'timeout-1',
      'task-2',
      'task-3',
    ]);
    expect(result.pendingTasks.map((t) => t.cellIndex)).toEqual([0, 1, 2, 3]);
    expect(result.pendingTasks[0]!.prompt).toBe('prompt 0');
    // 后台任务照常计入失败账单（不假绿）
    expect(result.failures.map((f) => f.index)).toEqual([1]);
  });
});

describe('逐格出图并发：串行与并发等价性', () => {
  it('limit = 1（串行）与 limit = 2（并发）逐格结果完全一致', async () => {
    const run = (concurrency: number) =>
      runCellGenBatch({
        cells: makeCells(9, [3]),
        sourceUrl: SOURCE,
        concurrency,
        generate: async ({ index }) => {
          await flush();
          if (index % 4 === 2) throw new Error('失败');
          return [`/media/${index}.png`];
        },
      });

    const serial = await run(1);
    const parallel = await run(2);

    expect(parallel.slots).toEqual(serial.slots);
    expect(parallel.failures).toEqual(serial.failures);
    expect(parallel.generatedCount).toBe(serial.generatedCount);
    expect(parallel.pendingTasks).toEqual(serial.pendingTasks);
    expect(parallel.done).toBe(serial.done);
    expect(parallel.cancelled).toBe(serial.cancelled);
    expect(parallel.total).toBe(serial.total);
  });
});

describe('节点级并发口径', () => {
  it('data.concurrency 覆盖缺省 2，裁剪到 1–4；UI 选项与执行器同源', () => {
    expect(CELL_GEN_DEFAULT_CONCURRENCY).toBe(2);
    expect(CELL_GEN_MAX_CONCURRENCY).toBe(4);
    expect([...CELL_GEN_CONCURRENCY_OPTIONS]).toEqual([1, 2, 3, 4]);

    expect(resolveCellGenConcurrency(undefined)).toBe(2);
    expect(resolveCellGenConcurrency({})).toBe(2);
    expect(resolveCellGenConcurrency({ concurrency: undefined })).toBe(2);
    expect(resolveCellGenConcurrency({ concurrency: null })).toBe(2);
    expect(resolveCellGenConcurrency({ concurrency: '' })).toBe(2);
    expect(resolveCellGenConcurrency({ concurrency: 'abc' })).toBe(2);
    expect(resolveCellGenConcurrency(null)).toBe(2);
    expect(resolveCellGenConcurrency({ concurrency: 1 })).toBe(1);
    expect(resolveCellGenConcurrency({ concurrency: 3 })).toBe(3);
    expect(resolveCellGenConcurrency({ concurrency: 4 })).toBe(4);
    expect(resolveCellGenConcurrency({ concurrency: '3' })).toBe(3);
    expect(resolveCellGenConcurrency({ concurrency: 9 })).toBe(4);
    expect(resolveCellGenConcurrency({ concurrency: 0 })).toBe(1);
    expect(resolveCellGenConcurrency({ concurrency: -2 })).toBe(1);
  });
});

describe('执行器接线守卫（源码级）', () => {
  it('两个执行器的首轮批量与逐格重试都把节点级并发交给逐格出图内核', () => {
    for (const file of ['multi-grid-ops.ts', 'character-sheet-ops.ts']) {
      const src = readOp(file);
      expect(src).toContain("from './cell-gen-batch'");
      // 各 2 处：首轮 executeXxxOps（读 d）+ 逐格重试 runXxxCellRetry（读 data）
      expect((src.match(/concurrency: resolveCellGenConcurrency\(/g) ?? []).length).toBe(2);
    }

    const multiGrid = readOp('multi-grid-ops.ts');
    expect(multiGrid).toContain('concurrency: resolveCellGenConcurrency(d)');
    expect(multiGrid).toContain('concurrency: resolveCellGenConcurrency(data)');
    // 取消：先落盘已完成格，再按既有口径抛「已取消」
    expect(multiGrid).toContain("if (result.cancelled) throw new Error('已取消')");

    const characterSheet = readOp('character-sheet-ops.ts');
    expect(characterSheet).toContain('concurrency: resolveCellGenConcurrency(d)');
    expect(characterSheet).toContain('concurrency: resolveCellGenConcurrency(data)');
    expect(characterSheet).toContain("if (result.cancelled) throw new Error('已取消')");
  });

  it('flow-runner 的 runLayerConcurrent 保持原样（未回填，避免改动既有图层并发语义）', () => {
    const src = readFileSync(resolve(OPS_DIR, '..', 'flow-runner.ts'), 'utf8');
    expect(src).toContain('const workers = Array.from({ length: Math.min(PARALLEL_LIMIT, ids.length) }, async () => {');
    expect(src).not.toContain('runWithConcurrency');
  });
});
