/**
 * session-review-probe2.test.ts —— 本会话「对抗式实现评审」新增的边界回归
 * （第 2 组：新节点 kind 自洽 / 运行接线成对 / 逐格闭环边界）。
 *
 * 命名同 probe1：由评审探针演化而来。文件内的 characterization 断言指向
 * `docs/NX9-SESSION-IMPLEMENTATION-REVIEW.md` 的缺陷条目。
 *
 * 依赖形态：`catalog/*` 与 `multi-grid-closure` / `character-sheet-closure` 均无
 * 运行时对 `@nx9/shared` barrel 的依赖（只做 `import type` 或本地相对导入），
 * 因此可直测；flow-runner 无法在测试里加载（会拉入 barrel），故其接线用源码解析断言。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BLOCK_CATALOG,
  lookupBlock,
} from '../../../../../packages/shared/src/catalog/block-catalog';
import { SOCKET_REGISTRY } from '../../../../../packages/shared/src/catalog/socket-registry';
import {
  ATTACHED_WORKSPACE_REGISTRY,
  resolveAttachedWorkspace,
} from '../../../../../packages/shared/src/catalog/attached-workspace';
import {
  resolveNodeInteraction,
  resolveNodeInteractionClass,
} from '../../../../../packages/shared/src/catalog/node-interaction';
import {
  applyCellUrls,
  compactCellUrls,
  computeContactSheetGridLayout,
  mergeResumedCellUrls,
  readMultiGridCellRunStates,
  readMultiGridCellUrls,
  readMultiGridPendingTasks,
  selectMultiGridRetryIndexes,
} from '../multi-grid-closure';
import { readCharacterSheetCellRunStates } from '../character-sheet-closure';

/** 与 `packages/shared/src/types/block.ts` 的 `SocketKind` 联合严格一致 */
const SOCKET_KINDS = ['prompt', 'picture', 'clip', 'sound', 'mesh', 'meta', 'param', 'wildcard'] as const;
const NEW_KINDS = ['multi-grid', 'character-sheet-desk'] as const;

/* ───────────────── ③ 新节点 kind 自洽 ───────────────── */

describe('新节点 kind：目录 / socket / 工作区 / 交互类四处自洽', () => {
  it('两个新 kind 都登记进目录、socket、工作区，且工作区 kind 与键一致', () => {
    for (const kind of NEW_KINDS) {
      const def = lookupBlock(kind);
      expect(def, `${kind} 未登记进 BLOCK_CATALOG`).toBeTruthy();
      expect(def!.label.trim()).not.toBe('');
      expect(def!.hint.trim()).not.toBe('');
      expect(def!.glyph.trim()).not.toBe('');
      expect(def!.accent.trim()).not.toBe('');
      expect(def!.nx9Native).toBe(true);
      expect(def!.category).toBe('generate');

      expect(SOCKET_REGISTRY[kind], `${kind} 缺少 socket 契约`).toBeTruthy();
      expect(ATTACHED_WORKSPACE_REGISTRY[kind]?.kind).toBe(kind);
      expect(resolveAttachedWorkspace(kind)).toEqual(ATTACHED_WORKSPACE_REGISTRY[kind]);
      // attachToNode → 底部跟随工作区（与既有 tool 型节点同口径）
      expect(resolveNodeInteraction(kind).opensPromptBar).toBe(true);
      expect(resolveNodeInteractionClass(kind)).toBe('logic');
    }
  });

  it('socket 契约只使用既有 SocketKind 联合内的取值，且不重复', () => {
    const valid = new Set<string>(SOCKET_KINDS);
    const invalid: string[] = [];
    const dupes: string[] = [];
    for (const [kind, profile] of Object.entries(SOCKET_REGISTRY)) {
      for (const list of [profile.accepts ?? [], profile.emits ?? []]) {
        const seen = new Set<string>();
        for (const socket of list) {
          if (!valid.has(socket)) invalid.push(`${kind}:${socket}`);
          if (seen.has(socket)) dupes.push(`${kind}:${socket}`);
          seen.add(socket);
        }
      }
    }
    expect(invalid).toEqual([]);
    expect(dupes).toEqual([]);
    // 新节点的入 / 出必须与本次补的注释一致（源图入、逐格图 + 逐格提示词出）
    for (const kind of NEW_KINDS) {
      expect(SOCKET_REGISTRY[kind]).toEqual({ accepts: ['picture', 'prompt'], emits: ['picture', 'prompt'] });
    }
  });

  it('目录内 kind 唯一（新增节点不覆盖既有登记）', () => {
    const kinds = BLOCK_CATALOG.map((block) => block.kind);
    expect(kinds.filter((kind, i) => kinds.indexOf(kind) !== i)).toEqual([]);
  });
});

describe('新节点 kind：RUNNABLE_BLOCKS 与执行分支成对（源码解析）', () => {
  const source = readFileSync(resolve(__dirname, '../flow-runner.ts'), 'utf8');
  const runnable = [
    ...(/export const RUNNABLE_BLOCKS = new Set\(\[([\s\S]*?)\]\)/.exec(source)?.[1] ?? '')
      .matchAll(/'([^']+)'/g),
  ].map((m) => m[1]!);
  /** executeBlock 里所有 `kind === 'x'` 字面量与分组条件里的 kind */
  const dispatched = new Set([...source.matchAll(/kind === '([^']+)'/g)].map((m) => m[1]!));

  it('两个新 kind 同时出现在 RUNNABLE_BLOCKS 与 executeBlock 分支里', () => {
    for (const kind of NEW_KINDS) {
      expect(runnable, `${kind} 未登记为可运行`).toContain(kind);
      expect(dispatched, `${kind} 没有执行分支（会静默落到 status: skipped）`).toContain(kind);
      expect(source).toContain(`executeMultiGridOps`);
    }
  });

  it('characterization：既有 4 个 kind 登记为可运行但没有执行分支（评审文档 D-08，本批不修）', () => {
    // 该断言的作用是「新增未接线 kind 时立刻红」，而不是认可这 4 个缺口。
    const missing = runnable.filter((kind) => !dispatched.has(kind)).sort();
    expect(missing).toEqual(['bridge-clip', 'motion-story', 'preview-sink', 'seedance-chain']);
  });
});

/* ───────────────── ⑤ 逐格闭环：格号上界（评审修复项） ───────────────── */

describe('逐格闭环边界：异常格号不再撑爆结果数组', () => {
  it('gridCells 出现百万级 index 时按「非法格号」回落为按位序号，不再补空百万项', () => {
    const start = Date.now();
    const urls = readMultiGridCellUrls({
      gridCells: [{ index: 2_000_000, cellImageUrl: 'u' }],
    });
    expect(urls).toEqual(['u']);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('mergeResumedCellUrls / applyCellUrls 忽略超出上界的格号，长度只由 cellCount 决定', () => {
    const merged = mergeResumedCellUrls(['a'], [{ cellIndex: 2_000_000, url: 'x' }], 4);
    expect(merged.length).toBe(4);
    expect(merged.filled).toEqual([]);
    expect(merged.urls).toEqual(['a', undefined, undefined, undefined]);
    expect(applyCellUrls(['a'], [{ cellIndex: 2_000_000, url: 'x' }], 4)).toHaveLength(4);
  });

  it('既有合法行为不变：乱序 / 缺格按 index 对齐，逐格覆盖与清空照旧', () => {
    expect(
      readMultiGridCellUrls({
        gridCells: [
          { index: 2, cellImageUrl: '/u2.png' },
          { index: 0, cellImageUrl: '/u0.png' },
        ],
      }),
    ).toEqual(['/u0.png', '', '/u2.png']);
    expect(applyCellUrls(['a', 'b', 'c'], [{ cellIndex: 1, url: undefined }], 3)).toEqual([
      'a',
      undefined,
      'c',
    ]);
    expect(compactCellUrls(['', ' a ', undefined])).toEqual(['a']);
  });

  it('25 格（多机位 5×5）读取与拼版口径不变', () => {
    const cells = Array.from({ length: 25 }, (_, i) => ({ index: i, cellImageUrl: `/u${i}.png` }));
    const urls = readMultiGridCellUrls({ gridCells: cells });
    expect(urls).toHaveLength(25);
    expect(urls[24]).toBe('/u24.png');
    expect(computeContactSheetGridLayout({ rows: 5, cols: 5, cellCount: 25 }).rows).toBe(5);
  });
});

describe('逐格闭环边界：状态机与账单', () => {
  it('角色设定表与多格推演的格列表互不串台（各读自己的字段）', () => {
    const data = {
      multiGridCells: [{ role: 'mg0' }],
      characterSheetCells: [{ role: 'cs0' }, { role: 'cs1' }],
      status: 'idle',
    };
    expect(readMultiGridCellRunStates(data).map((s) => s.role)).toEqual(['mg0']);
    expect(readCharacterSheetCellRunStates(data).map((s) => s.role)).toEqual(['cs0', 'cs1']);
  });

  it('后台任务账单去重 + 丢弃非法格号（不把脏数据当待续查）', () => {
    const tasks = readMultiGridPendingTasks({
      multiGridPendingTasks: [
        { taskId: 't1', cellIndex: 2, prompt: 'p' },
        { taskId: 't1', cellIndex: 3, prompt: '重复 taskId' },
        { taskId: '', cellIndex: 1 },
        { taskId: 't2', cellIndex: -1 },
        { taskId: 't3', cellIndex: 1.5 },
      ],
    });
    expect(tasks).toEqual([{ taskId: 't1', cellIndex: 2, prompt: 'p' }]);
  });

  it('重试只挑非成功格；指定格号越界 / 重复时安全收敛', () => {
    const states = readMultiGridCellRunStates({
      multiGridCells: [{ role: 'r0' }, { role: 'r1' }, { role: 'r2' }],
      gridCells: [{ index: 0, cellImageUrl: 'u0' }],
      lastResult: { failures: [{ index: 1, role: 'r1', error: 'x' }] },
      status: 'idle',
    });
    expect(selectMultiGridRetryIndexes(states)).toEqual([1, 2]);
    expect(selectMultiGridRetryIndexes(states, [0])).toEqual([]);
    expect(selectMultiGridRetryIndexes(states, [99])).toEqual([]);
    expect(selectMultiGridRetryIndexes(states, [2, 2, 1])).toEqual([1, 2]);
  });

  it('联系表布局对 0 格安全（不出现除零 / NaN）', () => {
    const layout = computeContactSheetGridLayout({ rows: 2, cols: 2, cellCount: 0 });
    expect(layout.count).toBe(0);
    expect(layout.cells).toEqual([]);
    expect(Number.isFinite(layout.canvasW)).toBe(true);
    expect(Number.isFinite(layout.canvasH)).toBe(true);
  });
});
