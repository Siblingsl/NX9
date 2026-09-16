/**
 * 角色设定表生产闭环纯函数层回归（逐格状态机 / 回写结构 / 版面签名）。
 *
 * 注意：本文件走相对路径直取源码，不经过 '@nx9/shared' barrel（既有缺陷）。
 * character-sheet-closure 对 shared 只做 `import type`（打包时擦除），因此可独立单测。
 */
import { describe, expect, it } from 'vitest';
import {
  buildCharacterSheetResultPatch,
  buildCharacterSheetSignature,
  readCharacterSheetCellRunStates,
  readCharacterSheetCellUrls,
  readCharacterSheetFailures,
  readCharacterSheetPendingTasks,
} from '../character-sheet-closure';

const CELLS = [
  { cellIndex: 0, row: 0, col: 0, role: '三视图 · 正面', section: 'turnaround' },
  { cellIndex: 1, row: 0, col: 1, role: '三视图 · 3/4 侧', section: 'turnaround' },
  { cellIndex: 2, row: 0, col: 2, role: '三视图 · 侧面', section: 'turnaround' },
];

describe('角色设定表：逐格读取', () => {
  it('逐格图 URL 按格号对齐（读取既有 gridCells）', () => {
    const data = {
      gridCells: [
        { index: 0, cellImageUrl: '/a.png' },
        { index: 1, cellImageUrl: '  ' },
        { index: 2, cellImageUrl: '/c.png' },
      ],
    };
    expect(readCharacterSheetCellUrls(data)).toEqual(['/a.png', '', '/c.png']);
    expect(readCharacterSheetCellUrls({})).toEqual([]);
  });

  it('后台待续查任务读本节点键名，也兼容通用 pendingImageTasks', () => {
    expect(
      readCharacterSheetPendingTasks({
        characterSheetPendingTasks: [{ taskId: 't2', cellIndex: 2, prompt: 'p' }],
      }),
    ).toEqual([{ taskId: 't2', cellIndex: 2, prompt: 'p' }]);
    expect(
      readCharacterSheetPendingTasks({
        pendingImageTasks: [{ taskId: 't1', cellIndex: 1 }],
      }),
    ).toEqual([{ taskId: 't1', cellIndex: 1 }]);
    // 无格号的历史任务无法定位，直接跳过
    expect(readCharacterSheetPendingTasks({ pendingImageTasks: [{ taskId: 't9' }] })).toEqual([]);
  });

  it('失败账单从 lastResult.failures 解析（非法项跳过）', () => {
    expect(
      readCharacterSheetFailures({
        lastResult: {
          failures: [
            { index: 1, role: '表情 · 平静', error: '超时' },
            { index: -1, error: 'x' },
            null,
            'nope',
          ],
        },
      }),
    ).toEqual([{ index: 1, role: '表情 · 平静', error: '超时' }]);
    expect(readCharacterSheetFailures({})).toEqual([]);
  });
});

describe('角色设定表：逐格状态机', () => {
  const base = { characterSheetCells: CELLS, status: 'idle' };

  it('成功 > 后台 > 出图中 > 失败 > 待跑', () => {
    const states = readCharacterSheetCellRunStates({
      ...base,
      gridCells: [{ index: 0, cellImageUrl: '/a.png' }],
      characterSheetPendingTasks: [{ taskId: 't1', cellIndex: 1 }],
      lastResult: { failures: [{ index: 2, role: CELLS[2]!.role, error: '失败原因' }] },
    });
    expect(states.map((s) => s.status)).toEqual(['success', 'remote', 'failed']);
    expect(states.map((s) => s.url)).toEqual(['/a.png', '', '']);
    expect(states.map((s) => s.role)).toEqual(CELLS.map((c) => c.role));
    expect(states[1]!.taskId).toBe('t1');
    expect(states[2]!.error).toBe('失败原因');
  });

  it('节点 running 时未出图格显示为出图中；有图的格仍是成功', () => {
    const states = readCharacterSheetCellRunStates({
      ...base,
      status: 'running',
      gridCells: [{ index: 0, cellImageUrl: '/a.png' }],
    });
    expect(states.map((s) => s.status)).toEqual(['success', 'running', 'running']);
  });

  it('计划格缺失时回落到 data.characterSheetPlan.cells', () => {
    const states = readCharacterSheetCellRunStates({
      status: 'idle',
      characterSheetPlan: { kind: 'turnaround', sourceRef: '', cells: CELLS },
    });
    expect(states).toHaveLength(3);
    expect(states[0]!.role).toBe('三视图 · 正面');
    expect(states[0]!.status).toBe('idle');
  });

  it('没有任何计划 / 结果时返回空状态（不抛异常）', () => {
    expect(readCharacterSheetCellRunStates({})).toEqual([]);
  });

  it('缺 role 的格用「第 N 格」兜底', () => {
    const states = readCharacterSheetCellRunStates({
      status: 'idle',
      characterSheetCells: [{ cellIndex: 0, row: 0, col: 0 }],
    });
    expect(states[0]!.role).toBe('第 1 格');
  });
});

describe('角色设定表：回写结构', () => {
  const cells = CELLS.map((c) => ({
    ...c,
    imagePromptZh: `${c.role} 中文提示词`,
    imagePrompt: `${c.role} english prompt`,
  })) as never;

  it('产出下游契约字段：gridCells / gridReverseResult / splitUrls / pictures', () => {
    const gridCells = [{ index: 0, videoPrompt: 'v', videoPromptZh: 'vz' }];
    const patch = buildCharacterSheetResultPatch({
      kind: 'turnaround',
      cellCount: 3,
      cellUrls: ['/a.png', undefined, '/c.png'],
      cells,
      failures: [],
      gridCells,
      gridReverseResult: { ok: true, rows: 1, cols: 3 },
      model: 'gemini-2.5-flash-image',
      progress: { done: 2, total: 3 },
    });
    expect(patch.gridCells).toBe(gridCells);
    expect(patch.gridReverseResult).toEqual({ ok: true, rows: 1, cols: 3 });
    expect(patch.splitUrls).toEqual(['/a.png', '/c.png']);
    expect(patch.pictures).toEqual(['/a.png', '/c.png']);
    expect(patch.previewUrls).toEqual(['/a.png', '/c.png']);
    expect(patch.previewUrl).toBe('/a.png');
    expect(patch.imageCount).toBe(2);
    expect(patch.batchProgress).toEqual({ done: 2, total: 3 });
    expect((patch.lastResult as { mode: string }).mode).toBe('turnaround');
    expect((patch.lastResult as { count: number; total: number }).count).toBe(2);
    expect((patch.lastResult as { failures: unknown[] }).failures).toEqual([]);
  });

  it('content / output 取逐格画像提示词（不是逐格视频提示词）', () => {
    const patch = buildCharacterSheetResultPatch({
      kind: 'turnaround',
      cellCount: 3,
      cellUrls: [],
      cells,
      failures: [],
      gridCells: [{ videoPrompt: 'video-only', videoPromptZh: 'video-only-zh' }],
      gridReverseResult: undefined,
    });
    const content = String(patch.content);
    const output = String(patch.output);
    expect(content).toContain('三视图 · 正面 中文提示词');
    expect(content).toContain('三视图 · 侧面 中文提示词');
    expect(content).not.toContain('video-only-zh');
    expect(output).toContain('三视图 · 正面 english prompt');
    expect(output).not.toContain('video-only');
  });

  it('无待续查任务时待续查键为 undefined（不写空数组）', () => {
    const patch = buildCharacterSheetResultPatch({
      kind: 'pose',
      cellCount: 5,
      cellUrls: [],
      cells: [],
      failures: [],
      gridCells: [],
      gridReverseResult: undefined,
    });
    expect(patch.characterSheetPendingTasks).toBeUndefined();
    expect(patch.pendingImageTasks).toBeUndefined();
    expect(patch.pendingImageTaskId).toBeUndefined();
  });

  it('有待续查任务时同时写本节点键名与通用键名', () => {
    const patch = buildCharacterSheetResultPatch({
      kind: 'pose',
      cellCount: 5,
      cellUrls: [],
      cells: [],
      failures: [],
      gridCells: [],
      gridReverseResult: undefined,
      pendingTasks: [{ taskId: 't1', cellIndex: 0, prompt: 'p' }],
      message: '部分失败',
    });
    expect(patch.characterSheetPendingTasks).toEqual([
      { taskId: 't1', cellIndex: 0, prompt: 'p' },
    ]);
    expect(patch.pendingImageTasks).toEqual([{ taskId: 't1', cellIndex: 0, prompt: 'p' }]);
    expect(patch.pendingImageTaskId).toBe('t1');
    expect(patch.message).toBe('部分失败');
  });
});

describe('角色设定表：版面签名', () => {
  const plan = {
    kind: 'turnaround' as const,
    sourceRef: '/ref.png',
    consistencyLock: 'lock-phrase',
    cells: CELLS as never,
  };

  it('结构 / 参考图 / 锁定短语 / 逐格图任一变化即失效', () => {
    const sig = buildCharacterSheetSignature(plan, ['/a.png', '', '']);
    expect(sig).toContain('turnaround');
    expect(sig).toContain('/ref.png');
    expect(sig).toContain('lock-phrase');
    expect(buildCharacterSheetSignature(plan, ['/b.png', '', ''])).not.toBe(sig);
    expect(buildCharacterSheetSignature({ ...plan, sourceRef: '/other.png' }, [
      '/a.png',
      '',
      '',
    ])).not.toBe(sig);
    expect(buildCharacterSheetSignature({ ...plan, consistencyLock: 'other' }, [
      '/a.png',
      '',
      '',
    ])).not.toBe(sig);
    expect(buildCharacterSheetSignature(plan, ['/a.png', '', ''])).toBe(sig);
  });

  it('无计划时返回空串（面板据此不做陈旧判断）', () => {
    expect(buildCharacterSheetSignature(undefined, [])).toBe('');
  });
});
