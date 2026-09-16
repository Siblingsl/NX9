/**
 * 多格推演「生产闭环」回归：逐格状态机 / 续查合并 / 镜表回写 payload / 接触表拼版。
 *
 * 注意：本文件与 multi-grid-plan.test.ts 同口径，走**相对路径直取源码**，
 * 绕开 packages/shared/src/index.ts 引用 8 个不存在模块的既有缺陷（barrel 无法解析）。
 * 被测模块 multi-grid-closure.ts 本身只做 `import type`，不引入 shared 运行时。
 */
import { describe, expect, it } from 'vitest';
import {
  CONTACT_SHEET_METRICS,
  MULTI_GRID_NO_UPSTREAM_REASON,
  applyCellUrls,
  buildContactSheetCells,
  buildContactSheetFileName,
  buildMultiGridAssetEntry,
  buildMultiGridAssetLabelBase,
  buildMultiGridContactSheetSignature,
  buildMultiGridResultPatch,
  buildMultiGridShotPatch,
  buildMultiGridWriteBackPlan,
  compactCellUrls,
  computeContactSheetGridLayout,
  describeMultiGridFailures,
  describeMultiGridPending,
  mergeResumedCellUrls,
  pairResumedTaskUrls,
  readMultiGridCellRunStates,
  readMultiGridCellUrls,
  readMultiGridPendingTasks,
  resolveMultiGridCellShotId,
  selectMultiGridRetryIndexes,
  summarizeMultiGridProgress,
  type MultiGridCellRunState,
} from '../multi-grid-closure';

const SOURCE = '/media/uploads/keyframe-01.png';

function gridCells(urls: (string | undefined)[], offset = 0) {
  return urls.map((url, i) => ({
    index: i + offset,
    row: 0,
    col: i,
    cellImageUrl: url ?? '',
    imagePrompt: `i${i}`,
    imagePromptZh: `图${i}`,
    needsEndFrame: false,
    endFramePrompt: '',
    endFramePromptZh: '',
    videoPrompt: `shot ${i}`,
    videoPromptZh: `镜 ${i}`,
  }));
}

function planCells(roles: string[], reuseSourceImage: number[] = []) {
  return roles.map((role, i) => ({
    cellIndex: i,
    row: 0,
    col: i,
    role,
    imagePrompt: '',
    imagePromptZh: '',
    needsEndFrame: false,
    endFramePrompt: '',
    endFramePromptZh: '',
    reuseSourceImage: reuseSourceImage.includes(i),
  }));
}

const ROLES9 = [
  '左前 45° · 近景',
  '正前 0° · 近景',
  '右前 45° · 近景',
  '左前 45° · 中景',
  '正前 0° · 中景',
  '右前 45° · 中景',
  '左前 45° · 全景',
  '正前 0° · 全景',
  '右前 45° · 全景',
];

describe('① 逐格状态机', () => {
  it('九格全空且未运行 → 全部待跑，进度 0/9', () => {
    const data = { multiGridCells: planCells(ROLES9), status: 'idle' };
    const states = readMultiGridCellRunStates(data);
    expect(states).toHaveLength(9);
    expect(states.every((s) => s.status === 'idle')).toBe(true);
    expect(states[0]!.role).toBe('左前 45° · 近景');
    expect(summarizeMultiGridProgress(states)).toEqual({
      total: 9,
      done: 0,
      failed: 0,
      running: 0,
      remote: 0,
      idle: 9,
      outstanding: 9,
    });
  });

  it('在跑一轮：已出图格 = 成功，其余 = 出图中', () => {
    const data = {
      multiGridCells: planCells(ROLES9),
      gridCells: gridCells(['/media/gen/0.png', '/media/gen/1.png', ...Array(7).fill(undefined)]),
      status: 'running',
    };
    const states = readMultiGridCellRunStates(data);
    expect(states[0]!.status).toBe('success');
    expect(states[0]!.url).toBe('/media/gen/0.png');
    expect(states[1]!.status).toBe('success');
    expect(states.slice(2).every((s) => s.status === 'running')).toBe(true);
    const summary = summarizeMultiGridProgress(states);
    expect(summary.done).toBe(2);
    expect(summary.running).toBe(7);
    expect(summary.outstanding).toBe(7);
  });

  it('部分失败：失败格标 failed 且带原因，成功格保留图', () => {
    const data = {
      multiGridCells: planCells(ROLES9),
      gridCells: gridCells(['/media/gen/0.png', undefined, '/media/gen/2.png', ...Array(6).fill(undefined)]),
      status: 'success',
      lastResult: {
        failures: [
          { index: 1, role: '正前 0° · 近景', error: '模型超时' },
          { index: 5, role: '右前 45° · 中景', error: '内容审核' },
        ],
      },
    };
    const states = readMultiGridCellRunStates(data);
    expect(states[1]!.status).toBe('failed');
    expect(states[1]!.error).toBe('模型超时');
    expect(states[5]!.status).toBe('failed');
    expect(states[0]!.status).toBe('success');
    expect(states[3]!.status).toBe('idle');
    expect(summarizeMultiGridProgress(states)).toMatchObject({ done: 2, failed: 2, idle: 5 });
  });

  it('后台异步任务格标 remote 并带 taskId（不假绿成成功）', () => {
    const data = {
      multiGridCells: planCells(ROLES9),
      gridCells: gridCells([undefined, undefined]),
      status: 'running',
      multiGridPendingTasks: [
        { taskId: 'task-a', cellIndex: 3, prompt: 'p' },
        { taskId: 'task-b', cellIndex: 7 },
      ],
    };
    const states = readMultiGridCellRunStates(data);
    expect(states[3]!.status).toBe('remote');
    expect(states[3]!.taskId).toBe('task-a');
    expect(states[7]!.status).toBe('remote');
    expect(states[0]!.status).toBe('running');
    expect(summarizeMultiGridProgress(states)).toMatchObject({ remote: 2, running: 7 });
  });

  it('历史任务缺格号时不乱标：其余格按待跑处理', () => {
    const data = {
      multiGridCells: planCells(ROLES9),
      status: 'idle',
      pendingImageTasks: [{ taskId: 'legacy-no-index' }],
    };
    const states = readMultiGridCellRunStates(data);
    expect(readMultiGridPendingTasks(data)).toEqual([]);
    expect(states.every((s) => s.status === 'idle')).toBe(true);
  });

  it('「画面推演」复用源图的格也计入完成（源图即结果）', () => {
    const data = {
      multiGridCells: planCells(['5 秒前', '当前（源图）', '3 秒后'], [1]),
      gridCells: gridCells(['/media/gen/before.png', SOURCE, '/media/gen/after.png']),
      status: 'success',
    };
    const states = readMultiGridCellRunStates(data);
    expect(states[1]!.reuseSourceImage).toBe(true);
    expect(states[1]!.status).toBe('success');
    expect(summarizeMultiGridProgress(states).done).toBe(3);
  });

  it('重试选择：成功格一律保留，只挑失败 / 后台 / 待跑格', () => {
    const states: MultiGridCellRunState[] = [
      { index: 0, role: 'a', status: 'success', url: '/u0.png', reuseSourceImage: false },
      { index: 1, role: 'b', status: 'failed', url: '', error: 'x', reuseSourceImage: false },
      { index: 2, role: 'c', status: 'remote', url: '', taskId: 't', reuseSourceImage: false },
      { index: 3, role: 'd', status: 'idle', url: '', reuseSourceImage: false },
      { index: 4, role: 'e', status: 'running', url: '', reuseSourceImage: false },
    ];
    expect(selectMultiGridRetryIndexes(states)).toEqual([1, 2, 3, 4]);
    // 显式指定：只重指定格，且剔除已成功 / 正在跑的格
    expect(selectMultiGridRetryIndexes(states, [0, 1, 4])).toEqual([1]);
    // 指定非法格号被忽略
    expect(selectMultiGridRetryIndexes(states, [99])).toEqual([]);
  });

  it('gridCells 读取按 index 对齐，乱序 / 缺格不错位', () => {
    const data = {
      gridCells: [
        { index: 2, cellImageUrl: '/u2.png' },
        { index: 0, cellImageUrl: '/u0.png' },
      ],
      multiGridCells: planCells(['a', 'b', 'c']),
    };
    expect(readMultiGridCellUrls(data)).toEqual(['/u0.png', '', '/u2.png']);
  });
});

describe('② 续查合并', () => {
  it('pairResumedTaskUrls 按「未落入 stillPending / failed」还原成功任务次序', () => {
    const tasks = [
      { taskId: 't0', cellIndex: 2 },
      { taskId: 't1', cellIndex: 5 },
      { taskId: 't2', cellIndex: 8 },
    ];
    const pairs = pairResumedTaskUrls(
      tasks,
      [tasks[0]!],
      [tasks[2]!],
      ['/media/gen/cell-5.png'],
    );
    expect(pairs).toEqual([{ task: tasks[1]!, url: '/media/gen/cell-5.png' }]);
  });

  it('mergeResumedCellUrls 补齐指定格，既有格图原样保留', () => {
    const existing = ['/u0.png', undefined, '/u2.png'];
    const merged = mergeResumedCellUrls(
      existing,
      [
        { cellIndex: 1, url: '/resumed-1.png' },
        { cellIndex: 3, url: '/resumed-3.png' },
      ],
      4,
    );
    expect(merged.urls).toEqual(['/u0.png', '/resumed-1.png', '/u2.png', '/resumed-3.png']);
    expect(merged.filled).toEqual([1, 3]);
    expect(merged.length).toBe(4);
    // 不修改入参
    expect(existing).toEqual(['/u0.png', undefined, '/u2.png']);
  });

  it('mergeResumedCellUrls 不覆盖已有格图（后台结果不覆盖用户已确认的格）', () => {
    const merged = mergeResumedCellUrls(['/u0.png'], [{ cellIndex: 0, url: '/late.png' }], 1);
    expect(merged.urls).toEqual(['/late.png']);
    expect(merged.filled).toEqual([]);
  });

  it('applyCellUrls 支持逐格覆盖与清空（回收站软删用）', () => {
    const next = applyCellUrls(
      ['/u0.png', '/u1.png'],
      [
        { cellIndex: 0, url: '/retry-0.png' },
        { cellIndex: 1, url: undefined },
      ],
      2,
    );
    expect(next).toEqual(['/retry-0.png', undefined]);
    expect(compactCellUrls(next)).toEqual(['/retry-0.png']);
  });
});

describe('③ 镜表回写 payload', () => {
  it('逐格写入：默认「同序号镜头」，越界回落第 1 镜，用户指定优先', () => {
    const shotIds = ['s0', 's1'];
    expect(resolveMultiGridCellShotId(0, shotIds)).toBe('s0');
    expect(resolveMultiGridCellShotId(1, shotIds)).toBe('s1');
    expect(resolveMultiGridCellShotId(5, shotIds)).toBe('s0');
    expect(resolveMultiGridCellShotId(5, shotIds, { '5': 's1' })).toBe('s1');
    // 指定的镜已不在上游镜表 → 不静默回落到别的镜
    expect(resolveMultiGridCellShotId(0, shotIds, { '0': 'gone' })).toBe('s0');
  });

  it('shot patch 与 writePictureShotPatch 同义：首帧 + 审阅态', () => {
    expect(buildMultiGridShotPatch('/media/gen/cell-3.png')).toEqual({
      firstFrameAssetId: '/media/gen/cell-3.png',
      keyframeStatus: 'review',
      status: 'review',
    });
  });

  it('无上游链镜表 → 明确原因，不静默失败', () => {
    const plan = buildMultiGridWriteBackPlan({
      cellUrls: ['/u0.png'],
      shotIds: [],
    });
    expect(plan.ok).toBe(false);
    expect(plan.reason).toBe(MULTI_GRID_NO_UPSTREAM_REASON);
    expect(plan.reason).toContain('上游未连接分镜台镜表');
    expect(plan.targets).toEqual([]);
    expect(plan.unassigned).toEqual([0]);
  });

  it('无已出图的格 → 明确原因', () => {
    const plan = buildMultiGridWriteBackPlan({ cellUrls: [undefined, ''], shotIds: ['s0'] });
    expect(plan.ok).toBe(false);
    expect(plan.reason).toContain('没有已出图的格');
  });

  it('逐格写入按格序映射，空格自动跳过', () => {
    const plan = buildMultiGridWriteBackPlan({
      cellUrls: ['/u0.png', undefined, '/u2.png'],
      shotIds: ['s0', 's1', 's2'],
    });
    expect(plan.ok).toBe(true);
    expect(plan.targets).toEqual([
      { cellIndex: 0, shotId: 's0' },
      { cellIndex: 2, shotId: 's2' },
    ]);
  });

  it('整组写入按「格序 ↔ 镜序」，镜数不足如实跳过（不在同一镜上反复覆盖）', () => {
    const plan = buildMultiGridWriteBackPlan({
      cellUrls: ['/u0.png', '/u1.png', '/u2.png'],
      shotIds: ['s0', 's1'],
      spread: true,
    });
    expect(plan.targets).toEqual([
      { cellIndex: 0, shotId: 's0' },
      { cellIndex: 1, shotId: 's1' },
    ]);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0]!.reason).toContain('上游只有 2 镜');
    // 用户显式指定的格即使越界也照写
    const overridden = buildMultiGridWriteBackPlan({
      cellUrls: ['/u0.png', '/u1.png', '/u2.png'],
      shotIds: ['s0', 's1'],
      spread: true,
      overrides: { '2': 's0' },
    });
    expect(overridden.targets).toContainEqual({ cellIndex: 2, shotId: 's0' });
  });

  it('指定镜头已不在上游镜表 → 跳过并给出原因，不写错镜', () => {
    const plan = buildMultiGridWriteBackPlan({
      cellIndexes: [1],
      cellUrls: [undefined, '/u1.png'],
      shotIds: ['s0'],
      spread: true,
      overrides: { '1': 'gone' },
    });
    expect(plan.ok).toBe(false);
    expect(plan.skipped[0]!.reason).toContain('已不在上游镜表');
  });
});

describe('④ 接触表拼版尺寸', () => {
  it('3×3 九格：画布 = 内边距 + 3 格宽 + 2 间隙', () => {
    const layout = computeContactSheetGridLayout({ rows: 3, cols: 3, cellCount: 9 });
    expect(layout.cols).toBe(3);
    expect(layout.rows).toBe(3);
    expect(layout.count).toBe(9);
    expect(layout.canvasW).toBe(CONTACT_SHEET_METRICS.pad * 2 + 3 * 480 + 2 * 10);
    expect(layout.canvasW).toBe(1488);
    expect(layout.canvasH).toBe(28 + 3 * (28 + 300) + 2 * 10);
    expect(layout.canvasH).toBe(1032);
    expect(layout.cells[0]).toEqual({ index: 0, left: 14, top: 14 });
    expect(layout.cells[4]).toEqual({ index: 4, left: 14 + 490, top: 14 + 338 });
  });

  it('5×5 廿五格：行高叠加正确', () => {
    const layout = computeContactSheetGridLayout({ rows: 5, cols: 5, cellCount: 25 });
    expect(layout.canvasW).toBe(28 + 5 * 480 + 4 * 10);
    expect(layout.canvasH).toBe(28 + 5 * 328 + 4 * 10);
    expect(layout.cells).toHaveLength(25);
    expect(layout.cells[24]).toEqual({ index: 24, left: 14 + 4 * 490, top: 14 + 4 * 338 });
  });

  it('1×3 画面推演：单行高度不含行间隙', () => {
    const layout = computeContactSheetGridLayout({ rows: 1, cols: 3, cellCount: 3 });
    expect(layout.rows).toBe(1);
    expect(layout.canvasW).toBe(1488);
    expect(layout.canvasH).toBe(28 + 328);
  });

  it('格数超过行列容量时补行，不满行不虚增', () => {
    const layout = computeContactSheetGridLayout({ rows: 2, cols: 2, cellCount: 5 });
    expect(layout.rows).toBe(3);
    expect(layout.cols).toBe(2);
    expect(layout.cells).toHaveLength(5);
    const empty = computeContactSheetGridLayout({ rows: 3, cols: 3, cellCount: 0 });
    expect(empty.cells).toHaveLength(0);
    expect(empty.rows).toBe(3);
    expect(empty.canvasH).toBe(28 + 3 * 328 + 2 * 10);
  });

  it('缺图格用源图占位以保住格位对位，并如实登记占位格号', () => {
    const cells = buildContactSheetCells({
      cells: [
        { cellIndex: 0, role: '左前 45° · 中景' },
        { cellIndex: 1, role: '正前 0° · 中景' },
        { cellIndex: 2, role: '右前 45° · 中景' },
      ],
      urls: ['/u0.png', undefined, '/u2.png'],
      sourceUrl: SOURCE,
    });
    expect(cells.imageUrls).toEqual(['/u0.png', SOURCE, '/u2.png']);
    expect(cells.labels).toEqual([
      '1. 左前 45° · 中景',
      '2. 正前 0° · 中景',
      '3. 右前 45° · 中景',
    ]);
    expect(cells.placeholderIndexes).toEqual([1]);
  });

  it('过期签名随格图 / 角色变化而变化', () => {
    const roles = ['a', 'b'];
    const before = buildMultiGridContactSheetSignature(['/u0.png', '/u1.png'], roles);
    expect(buildMultiGridContactSheetSignature(['/u0.png', '/u1.png'], roles)).toBe(before);
    expect(buildMultiGridContactSheetSignature(['/u0.png', '/u2.png'], roles)).not.toBe(before);
    expect(buildMultiGridContactSheetSignature(['/u0.png'], roles)).not.toBe(before);
  });

  it('导出命名沿用 <kind>-sheet-<ts> 约定，扩展名跟随服务端产物', () => {
    expect(buildContactSheetFileName('/media/images/compose-1700000000000.jpg', 42)).toBe(
      'multi-grid-sheet-42.jpg',
    );
    expect(buildContactSheetFileName('/media/exports/contact-1.png', 7)).toBe(
      'multi-grid-sheet-7.png',
    );
    expect(buildContactSheetFileName('', 9)).toBe('multi-grid-sheet-9.png');
  });
});

describe('⑤ 结果回写 payload', () => {
  it('与首轮批量出图同构：splitUrls / pictures / previewUrl / lastResult 齐备', () => {
    const urls = ['/u0.png', undefined, '/u2.png'];
    const patch = buildMultiGridResultPatch({
      mode: 'multi-cam-9',
      cellCount: 3,
      cellUrls: urls,
      failures: [{ index: 1, role: 'b', error: '超时' }],
      gridCells: gridCells(urls),
      gridReverseResult: { ok: true, rows: 1, cols: 3, sourceUrl: SOURCE, splitUrls: ['/u0.png', '/u2.png'], cells: [] },
      model: 'gemini-2.5-flash-image',
      message: '1/3 格出图失败',
      progress: { done: 3, total: 3 },
    });
    expect(patch.splitUrls).toEqual(['/u0.png', '/u2.png']);
    expect(patch.pictures).toEqual(['/u0.png', '/u2.png']);
    expect(patch.previewUrls).toEqual(['/u0.png', '/u2.png']);
    expect(patch.previewUrl).toBe('/u0.png');
    expect(patch.imageCount).toBe(2);
    expect(patch.content).toBe('镜 0\n\n镜 1\n\n镜 2');
    expect(patch.output).toBe('shot 0\n\nshot 1\n\nshot 2');
    expect(patch.lastResult).toMatchObject({
      count: 2,
      total: 3,
      urls: ['/u0.png', '/u2.png'],
      model: 'gemini-2.5-flash-image',
      mode: 'multi-cam-9',
    });
    expect(patch.batchProgress).toEqual({ done: 3, total: 3 });
    expect(patch.message).toBe('1/3 格出图失败');
    expect(JSON.parse(JSON.stringify(patch))).toEqual(patch);
  });

  it('无图时 previewUrl 为 undefined、imageCount 为 0（不假绿）', () => {
    const patch = buildMultiGridResultPatch({
      mode: 'multi-cam-9',
      cellCount: 2,
      cellUrls: [undefined, ''],
      failures: [],
      gridCells: gridCells([undefined, undefined]),
      gridReverseResult: { ok: false },
    });
    expect(patch.previewUrl).toBeUndefined();
    expect(patch.imageCount).toBe(0);
    expect(patch.splitUrls).toEqual([]);
  });

  it('后台待续查任务落盘：multiGridPendingTasks 带格号，兼容 pendingImageTasks', () => {
    const patch = buildMultiGridResultPatch({
      mode: 'frame-predict',
      cellCount: 3,
      cellUrls: [undefined, SOURCE, undefined],
      failures: [],
      gridCells: gridCells([undefined, SOURCE, undefined]),
      gridReverseResult: { ok: true },
      pendingTasks: [{ taskId: 't7', cellIndex: 2, prompt: 'p' }],
    });
    expect(patch.multiGridPendingTasks).toEqual([{ taskId: 't7', cellIndex: 2, prompt: 'p' }]);
    expect(patch.pendingImageTasks).toEqual([{ taskId: 't7', prompt: 'p', cellIndex: 2 }]);
    expect(patch.pendingImageTaskId).toBe('t7');
  });

  it('失败汇总 / 后台文案：前 3 条具名，其余计数', () => {
    const failures = [1, 2, 3, 4].map((i) => ({ index: i, role: `格${i}`, error: `错${i}` }));
    const text = describeMultiGridFailures(failures, 9)!;
    expect(text).toContain('4/9 格出图失败');
    expect(text).toContain('格1（错1）');
    expect(text).not.toContain('格4');
    expect(text).toContain('等 4 格');
    expect(describeMultiGridFailures([], 9)).toBeUndefined();
    expect(describeMultiGridPending([{ taskId: 't', cellIndex: 0 }])).toContain('仍在后台生成');
    expect(describeMultiGridPending([])).toBeUndefined();
  });
});

describe('⑥ 资产库登记', () => {
  it('入库条目与 upsertBacklotWorkspace 同构：封面 + 参考图 = 该格图', () => {
    const entry = buildMultiGridAssetEntry({
      url: '/media/gen/cell-4.png',
      label: '多机位 9 宫格 · 正前 0° · 中景',
      prompt: 'prompt text',
      now: 1700000000000,
    });
    expect(entry.kind).toBe('scene');
    expect(entry.revision).toBe(1);
    expect(entry.creative.coverUrl).toBe('/media/gen/cell-4.png');
    expect(entry.creative.referenceUrls).toEqual(['/media/gen/cell-4.png']);
    expect(entry.id.startsWith('ws-1700000000000-')).toBe(true);
    expect(JSON.parse(JSON.stringify(entry))).toEqual(entry);
  });

  it('空 label 有兜底，不产生无名条目', () => {
    const entry = buildMultiGridAssetEntry({ url: '/u.png', label: '   ', prompt: '' });
    expect(entry.label).toBe('多格推演结果');
    expect(entry.promptEn).toBe('');
  });

  it('label 基名优先「模式 · 格角色」，缺角色回落提示词首行', () => {
    expect(
      buildMultiGridAssetLabelBase({ modeLabel: '剧情推演四宫格', role: '转折', prompt: 'x' }),
    ).toBe('剧情推演四宫格 · 转折');
    expect(buildMultiGridAssetLabelBase({ role: '', prompt: '  雨夜街头的第一行\n第二行' })).toBe(
      '雨夜街头的第一行',
    );
  });
});
