/**
 * MultiGridWorkspace —— 组件行为回归（多格推演工作区）。
 *
 * 覆盖边界（本次新增）：多格推演此前只有纯函数层测试（`multi-grid-plan` / `multi-grid-closure` /
 * `multi-grid-to-shots` / `multi-grid-block-map`），**面板的 React 交互、参数写回与中文提示零覆盖**。
 *
 * mock 手法：
 * - `@nx9/shared` 走 barrel 替身（既有缺陷：barrel 引用了 8 个不存在的 data/* 模块），
 *   替身指向**真实源码模块** → 计划构造 / 模式表 / 宫格规则都是真实实现；
 * - `@xyflow/react` 只用到一个「内存流图」：`updateNodeData` 是 spy 且会真的写进节点 data
 *   并触发重渲染，因此断言的是「点按钮 → 真的写了哪些字段名」这条真实链路；
 * - `../api/client` 打桩：连接设置/模型列表走不到真实网络。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

type FlowNode = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

const flow = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state: { nodes: FlowNode[]; edges: Array<Record<string, unknown>> } = {
    nodes: [],
    edges: [],
  };
  const emit = () => listeners.forEach((fn) => fn());
  const updateNodeData = vi.fn(
    (
      id: string,
      patchOrUpdater:
        | Record<string, unknown>
        | ((node: { id: string; data: Record<string, unknown> }) => Record<string, unknown>),
    ) => {
      const at = state.nodes.findIndex((node) => node.id === id);
      if (at < 0) throw new Error('updateNodeData：未知节点 ' + id);
      const node = state.nodes[at]!;
      const next =
        typeof patchOrUpdater === 'function'
          ? patchOrUpdater({ id, data: node.data })
          : patchOrUpdater;
      const data = { ...node.data, ...next };
      state.nodes = state.nodes.map((item, i) => (i === at ? { ...item, data } : item));
      emit();
    },
  );
  return { state, listeners, updateNodeData };
});

vi.mock('@nx9/shared', async () => {
  const { buildSharedBarrelMock } = await import('./support/shared-barrel-mock');
  return buildSharedBarrelMock();
});

vi.mock('@xyflow/react', async () => {
  const React = await import('react');
  const useFlowNodes = () =>
    React.useSyncExternalStore(
      (fn: () => void) => {
        flow.listeners.add(fn);
        return () => flow.listeners.delete(fn);
      },
      () => flow.state.nodes,
      () => flow.state.nodes,
    );
  return {
    useNodes: useFlowNodes,
    useEdges: () => flow.state.edges,
    useNodesData: (id: string) => useFlowNodes().find((node) => node.id === id),
    useReactFlow: () => ({ updateNodeData: flow.updateNodeData }),
  };
});

vi.mock('../../api/client', () => {
  const ok = vi.fn(async () => ({ ok: true }));
  return {
    api: new Proxy(
      { analyzeFaces: ok, beatAnalyze: vi.fn(async () => ({ ok: false, message: '测试未接服务端' })) },
      { get: (target: Record<string, unknown>, key: string) => target[key] ?? ok },
    ),
  };
});

import { MultiGridWorkspace } from '../stage-deck/chrome/attached-workspace/tool/MultiGridWorkspace';
import { useActivityLog } from '../../stores/activity-log';
import { useToast } from '../../stores/toast';
import { MULTI_GRID_NO_UPSTREAM_REASON } from '../multi-grid-closure';
import {
  MULTI_GRID_MODES,
  lookupMultiGridModeDef,
} from '../../../../../packages/shared/src/utils/multi-grid-plan';

const BLOCK_ID = 'mg-1';

/** 词库 / 模式表用真实数据，避免把文案硬编码进断言 */
function modeDef(id: string) {
  const def = MULTI_GRID_MODES.find((m) => m.id === id);
  if (!def) throw new Error('测试前置失败：模式表缺少 ' + id);
  return def;
}
const MODE_9 = modeDef('multi-cam-9');
const MODE_25 = modeDef('multi-cam-25');
const MODE_STORY = modeDef('story-predict-4');
const MODE_FRAME = modeDef('frame-predict');

function setNodeData(data: Record<string, unknown>) {
  flow.state.nodes = [
    { id: BLOCK_ID, type: 'multi-grid', position: { x: 0, y: 0 }, data },
  ];
  flow.state.edges = [];
}

function nodeData(): Record<string, unknown> {
  return flow.state.nodes[0]!.data;
}

/** 最近一次写回节点的补丁（字段名与形态断言用这个） */
function lastPatch(): Record<string, unknown> {
  const call = flow.updateNodeData.mock.calls.at(-1);
  if (!call) throw new Error('本用例未发生任何 updateNodeData');
  expect(call[0]).toBe(BLOCK_ID);
  return call[1] as Record<string, unknown>;
}

/** 打开右侧「更多设置」参数面板（默认折叠） */
function openAdvanced() {
  fireEvent.click(screen.getByTitle('更多设置'));
}

/** 展开参数面板 → 返回参数面板内的查询域 */
function advancedScope(): ReturnType<typeof within> {
  openAdvanced();
  const panel = document.querySelector('.nx9-composer-popover');
  if (!panel) throw new Error('参数面板未渲染');
  return within(panel as HTMLElement);
}

beforeEach(() => {
  flow.updateNodeData.mockClear();
  flow.listeners.clear();
  setNodeData({});
  useActivityLog.setState({ lines: [], open: false });
  useToast.setState({ items: [] });
});

describe('MultiGridWorkspace：空态 / 无上游', () => {
  it('无源图：主 CTA 禁用、概览写「待源图」、给出中文引导，且不产生任何写回', () => {
    render(<MultiGridWorkspace blockId={BLOCK_ID} kind="multi-grid" />);

    const run = screen.getByRole('button', {
      name: `${MODE_9.label} · 批量出图`,
    }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);

    expect(
      screen.getByText('连接一张关键帧 / 图片后自动生成推演计划；也可在右侧参数区调整模式与规格。'),
    ).toBeTruthy();
    expect(
      screen.getByText('未连接上游图像：请把关键帧 / 图片节点连到本节点左侧，或先在右侧指定源图'),
    ).toBeTruthy();

    const params = advancedScope();
    expect(params.getByText(new RegExp(`${MODE_9.label} · 待源图`))).toBeTruthy();
    // 空态只是展示，不得偷偷写回节点
    expect(flow.updateNodeData).not.toHaveBeenCalled();
  });

  it('无上游镜表：镜头写回入口逐条给出真实不可用原因（不是空白成功态）', () => {
    setNodeData({ sourceUrl: '/media/keyframe.png' });
    render(<MultiGridWorkspace blockId={BLOCK_ID} kind="multi-grid" />);

    const generate = screen.getByRole('button', { name: '生成并写回分镜' }) as HTMLButtonElement;
    expect(generate.disabled).toBe(true);
    expect(generate.getAttribute('title')).toBe(MULTI_GRID_NO_UPSTREAM_REASON);
    expect(screen.getByText(MULTI_GRID_NO_UPSTREAM_REASON)).toBeTruthy();

    expect(screen.getAllByText('未连接上游镜表：写入分镜不可用（需先连接分镜台 / 导演台）')).toHaveLength(
      MODE_9.cellCount,
    );
    const disabledWrite = screen.getAllByRole('button', { name: '写入分镜' });
    expect(disabledWrite.length).toBe(MODE_9.cellCount);
    for (const button of disabledWrite) expect((button as HTMLButtonElement).disabled).toBe(true);
    // 未出图 → 送入视频生成也不可用
    for (const button of screen.getAllByRole('button', { name: '送入视频生成' })) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(button.getAttribute('title')).toBe('该格尚未出图');
    }
  });

  it('有源图后自动出计划：格数、概览与逐格提示词按真实模式表生成', () => {
    setNodeData({ sourceUrl: '/media/keyframe.png' });
    render(<MultiGridWorkspace blockId={BLOCK_ID} kind="multi-grid" />);

    // 每格一张提示词编辑框 → 格数 = 模式定义格数
    const promptBoxes = screen.getAllByTitle('编辑后该格按此文本出图（中英同源）');
    expect(promptBoxes).toHaveLength(MODE_9.cellCount);
    expect(promptBoxes[0]).toHaveProperty('tagName', 'TEXTAREA');

    const params = advancedScope();
    expect(
      params.getByText(new RegExp(`${MODE_9.label} · ${MODE_9.rows}×${MODE_9.cols} · ${MODE_9.cellCount} 格`)),
    ).toBeTruthy();

    // 未连接上游镜表 → 一致性校验没有可校验的格
    expect((screen.getByRole('button', { name: /一致性校验/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe('MultiGridWorkspace：模式与规格写回', () => {
  it('切模式写入固定字段组，并清空上一模式的计划 / 逐格稿 / 格序映射（幂等清除）', () => {
    setNodeData({ sourceUrl: '/media/keyframe.png', multiGridRows: 3, multiGridCols: 3 });
    render(<MultiGridWorkspace blockId={BLOCK_ID} kind="multi-grid" />);

    fireEvent.click(screen.getByRole('button', { name: MODE_STORY.label }));

    expect(lastPatch()).toEqual({
      multiGridMode: MODE_STORY.id,
      multiGridPlan: undefined,
      multiGridCells: undefined,
      sendToVideoIndex: undefined,
      multiGridRows: MODE_STORY.rows,
      multiGridCols: MODE_STORY.cols,
      multiGridShotTargets: undefined,
    });
    // 重渲染后格数跟着模式走（4 格），且该模式独有的「剧情方向」参数出现
    expect(screen.getAllByTitle('编辑后该格按此文本出图（中英同源）')).toHaveLength(
      MODE_STORY.cellCount,
    );
    const params = advancedScope();
    expect(params.getByText('剧情方向（写入四格节拍，可留空）')).toBeTruthy();
    expect(
      params.getByPlaceholderText('例：雨夜追逐，男主发现线索指向旧友'),
    ).toBeTruthy();
    // 四宫格模式不再显示「宫格规格 / 焦段」这类多机位专属参数
    expect(params.queryByText('宫格规格')).toBeNull();
  });

  it('宫格规格 5×5：同时改写模式 / 行列并清空计划稿', () => {
    setNodeData({ sourceUrl: '/media/keyframe.png' });
    render(<MultiGridWorkspace blockId={BLOCK_ID} kind="multi-grid" />);
    const params = advancedScope();

    fireEvent.click(params.getByRole('button', { name: `5×5（${MODE_25.cellCount} 格）` }));

    expect(lastPatch()).toEqual({
      multiGridRows: MODE_25.rows,
      multiGridCols: MODE_25.cols,
      multiGridMode: MODE_25.id,
      multiGridPlan: undefined,
      multiGridCells: undefined,
      multiGridShotTargets: undefined,
    });
    expect(screen.getAllByTitle('编辑后该格按此文本出图（中英同源）')).toHaveLength(
      MODE_25.cellCount,
    );
    expect(
      screen.getByRole('button', { name: `${MODE_25.label} · 批量出图` }),
    ).toBeTruthy();
  });
});

describe('MultiGridWorkspace：参数控件写回与重渲染', () => {
  it('焦段 / 宽高比 / 参考强度 / 逐格并发：控件变更写入同名 data 字段并回显', () => {
    setNodeData({ sourceUrl: '/media/keyframe.png' });
    render(<MultiGridWorkspace blockId={BLOCK_ID} kind="multi-grid" />);
    const params = advancedScope();

    const numbers = params.getAllByRole('spinbutton') as HTMLInputElement[];
    // [焦段 min, 焦段 max, 参考强度]
    expect(numbers).toHaveLength(3);
    fireEvent.change(numbers[0]!, { target: { value: '24' } });
    expect(lastPatch()).toEqual({ multiGridFocalMinMm: 24 });
    fireEvent.change(numbers[1]!, { target: { value: '135' } });
    expect(lastPatch()).toEqual({ multiGridFocalMaxMm: 135 });
    fireEvent.change(numbers[2]!, { target: { value: '0.6' } });
    expect(lastPatch()).toEqual({ imageStrength: 0.6 });

    const selects = params.getAllByRole('combobox') as HTMLSelectElement[];
    const aspect = selects.find((s) => Array.from(s.options).some((o) => o.value === '9:16'))!;
    fireEvent.change(aspect, { target: { value: '9:16' } });
    expect(lastPatch()).toEqual({ aspectRatio: '9:16' });

    const concurrency = params.getByTitle(
      '逐格出图的有界并发上限（1–4，缺省 2）；本批与逐格重跑都按它执行',
    ) as HTMLSelectElement;
    fireEvent.change(concurrency, { target: { value: '4' } });
    expect(lastPatch()).toEqual({ concurrency: 4 });

    // 写回真的生效并回显（不是只调用不落地）
    expect(aspect.value).toBe('9:16');
    expect(concurrency.value).toBe('4');
    expect(params.getByText(new RegExp(`${MODE_9.label}.*9:16`))).toBeTruthy();
  });

  it('清空数值控件时回落默认值（禁止写入 0 / NaN 之类无效参数）', () => {
    setNodeData({ sourceUrl: '/media/keyframe.png' });
    render(<MultiGridWorkspace blockId={BLOCK_ID} kind="multi-grid" />);
    const params = advancedScope();
    const numbers = params.getAllByRole('spinbutton') as HTMLInputElement[];

    fireEvent.change(numbers[0]!, { target: { value: '' } });
    expect(lastPatch()).toEqual({ multiGridFocalMinMm: 18 });
    fireEvent.change(numbers[1]!, { target: { value: '' } });
    expect(lastPatch()).toEqual({ multiGridFocalMaxMm: 100 });
    fireEvent.change(numbers[2]!, { target: { value: '' } });
    expect(lastPatch()).toEqual({ imageStrength: 0.85 });
  });

  it('画面推演模式独有参数：前置 / 后续秒数写回 frameBeforeSec / frameAfterSec', () => {
    setNodeData({ sourceUrl: '/media/keyframe.png', multiGridMode: MODE_FRAME.id });
    render(<MultiGridWorkspace blockId={BLOCK_ID} kind="multi-grid" />);
    const params = advancedScope();

    const numbers = params.getAllByRole('spinbutton') as HTMLInputElement[];
    // 画面推演模式不显示焦段（[前置, 后续, 参考强度]）
    expect(numbers).toHaveLength(3);
    fireEvent.change(numbers[0]!, { target: { value: '7' } });
    expect(lastPatch()).toEqual({ frameBeforeSec: 7 });
    fireEvent.change(numbers[1]!, { target: { value: '4' } });
    expect(lastPatch()).toEqual({ frameAfterSec: 4 });
  });
});

describe('MultiGridWorkspace：逐格提示词编辑与恢复默认', () => {
  it('改一格提示词：写入 multiGridPlan + multiGridCells，带 promptEdited 与中英同源', () => {
    setNodeData({ sourceUrl: '/media/keyframe.png' });
    render(<MultiGridWorkspace blockId={BLOCK_ID} kind="multi-grid" />);
    const boxes = screen.getAllByTitle('编辑后该格按此文本出图（中英同源）') as HTMLTextAreaElement[];

    fireEvent.change(boxes[0]!, { target: { value: '第一格：自定义提示词' } });

    const patch = lastPatch();
    expect(Object.keys(patch).sort()).toEqual(['multiGridCells', 'multiGridPlan']);
    const cells = patch.multiGridCells as Array<Record<string, unknown>>;
    expect(cells).toHaveLength(MODE_9.cellCount);
    expect(cells[0]).toMatchObject({
      imagePromptZh: '第一格：自定义提示词',
      imagePrompt: '第一格：自定义提示词',
      promptEdited: true,
    });
    // 其余格原样带过，不产生额外改写
    expect(cells[1]?.promptEdited).toBeUndefined();

    // 改写后展示「已改」徽标与「原始发送稿」折叠块
    expect(screen.getByText('已改')).toBeTruthy();
    expect(screen.getByText('原始发送稿')).toBeTruthy();
    expect((boxes[0] as HTMLTextAreaElement).value).toBe('第一格：自定义提示词');
  });

  it('「恢复默认提示词」把编辑稿清空（写 undefined）并记日志，徽标随之消失', () => {
    setNodeData({ sourceUrl: '/media/keyframe.png' });
    render(<MultiGridWorkspace blockId={BLOCK_ID} kind="multi-grid" />);
    const boxes = screen.getAllByTitle('编辑后该格按此文本出图（中英同源）') as HTMLTextAreaElement[];
    fireEvent.change(boxes[0]!, { target: { value: '临时改写' } });
    expect(screen.getByText('已改')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '恢复默认提示词' }));

    expect(lastPatch()).toEqual({ multiGridPlan: undefined, multiGridCells: undefined });
    expect(screen.queryByText('已改')).toBeNull();
    expect(useActivityLog.getState().lines.some((l) => l.includes('多格推演 · 已恢复默认提示词'))).toBe(
      true,
    );
  });

  it('模式切换后编辑稿不被沿用（计划回到按参数实时生成）', () => {
    setNodeData({ sourceUrl: '/media/keyframe.png' });
    render(<MultiGridWorkspace blockId={BLOCK_ID} kind="multi-grid" />);
    const boxes = screen.getAllByTitle('编辑后该格按此文本出图（中英同源）') as HTMLTextAreaElement[];
    fireEvent.change(boxes[0]!, { target: { value: '九宫格专属改写' } });
    expect(screen.getByText('已改')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: MODE_STORY.label }));
    // 新模式重新生成计划 → 旧改写不再出现在任何一格里
    expect(screen.queryByText('已改')).toBeNull();
    const fresh = screen.getAllByTitle('编辑后该格按此文本出图（中英同源）') as HTMLTextAreaElement[];
    expect(fresh).toHaveLength(MODE_STORY.cellCount);
    for (const box of fresh) expect(box.value).not.toContain('九宫格专属改写');
  });
});

describe('MultiGridWorkspace：接触表空态', () => {
  it('一格未出图：导出接触表禁用、下载 / 入库 / 回收站入口禁用并给出真实原因', () => {
    setNodeData({ sourceUrl: '/media/keyframe.png' });
    render(<MultiGridWorkspace blockId={BLOCK_ID} kind="multi-grid" />);

    const exportSheet = screen.getByRole('button', { name: '一键导出接触表' }) as HTMLButtonElement;
    expect(exportSheet.disabled).toBe(true);
    expect(
      screen.getByText('逐格图拼成一张接触表（复用宫格拼合），导出后可下载 / 入库 / 回收站。'),
    ).toBeTruthy();

    const download = screen.getByRole('button', { name: '下载' }) as HTMLButtonElement;
    expect(download.disabled).toBe(true);
    expect(download.getAttribute('title')).toBe('尚无接触表');
    // 「入库 / 回收站」在逐格卡片里也有同名按钮：接触表那两个用 title 区分
    const sheetLibrary = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('title') === '尚无接触表');
    expect(sheetLibrary).toHaveLength(3); // 下载 + 入库 + 回收站（后两个是图标/文案按钮）
    for (const button of sheetLibrary) expect((button as HTMLButtonElement).disabled).toBe(true);

    // 接触表计数：分子 0（一格都没出图）；分母是**计划格数**，未出图时不是 0
    expect(
      screen.getByText(new RegExp(`${MODE_9.cols}×${MODE_9.rows} · 0/${MODE_9.cellCount} 格有图`)),
    ).toBeTruthy();
    expect(screen.queryByText(/已有接触表/)).toBeNull();
    expect(screen.queryByText(/已有接触表已过期/)).toBeNull();
  });

  it('部分出图 / 部分失败：分子只数真正有图的计划格，失败格不计入', () => {
    setNodeData({
      sourceUrl: '/media/keyframe.png',
      // 第 1、3 格有图；第 2 格跑过但失败（无图）
      gridCells: [
        { index: 0, cellImageUrl: '/media/cells/000.png' },
        { index: 1, cellImageUrl: '' },
        { index: 2, cellImageUrl: '/media/cells/002.png' },
      ],
      lastResult: {
        count: 2,
        total: MODE_9.cellCount,
        failures: [{ index: 1, role: '第 2 格', error: '服务端超时' }],
      },
    });
    render(<MultiGridWorkspace blockId={BLOCK_ID} kind="multi-grid" />);

    expect(
      screen.getByText(
        new RegExp(`${MODE_9.cols}×${MODE_9.rows} · 2/${MODE_9.cellCount} 格有图`),
      ),
    ).toBeTruthy();
    // 失败格没被算成「有图」
    expect(screen.queryByText(new RegExp(`${MODE_9.cols}×${MODE_9.rows} · 3/`))).toBeNull();
  });

  it('全部格跑过但都失败：分子仍为 0（「跑过」不等于「有图」）', () => {
    setNodeData({
      sourceUrl: '/media/keyframe.png',
      gridCells: Array.from({ length: MODE_9.cellCount }, (_, i) => ({
        index: i,
        cellImageUrl: '',
      })),
      lastResult: {
        count: 0,
        total: MODE_9.cellCount,
        failures: Array.from({ length: MODE_9.cellCount }, (_, i) => ({
          index: i,
          role: `第 ${i + 1} 格`,
          error: '出图失败：禁止空成功',
        })),
      },
    });
    render(<MultiGridWorkspace blockId={BLOCK_ID} kind="multi-grid" />);

    expect(
      screen.getByText(new RegExp(`${MODE_9.cols}×${MODE_9.rows} · 0/${MODE_9.cellCount} 格有图`)),
    ).toBeTruthy();
  });

  it('计划外的残留格图不计入分子（分子分母都按当前计划格算）', () => {
    setNodeData({
      sourceUrl: '/media/keyframe.png',
      // 曾跑过 25 宫格：切回 9 格后 data.gridCells 仍留着 9 格之外的旧格图
      gridCells: [
        ...Array.from({ length: MODE_9.cellCount }, (_, i) => ({
          index: i,
          cellImageUrl: `/media/cells/${i}.png`,
        })),
        { index: 9, cellImageUrl: '/media/cells/9.png' },
        { index: 10, cellImageUrl: '/media/cells/10.png' },
      ],
    });
    render(<MultiGridWorkspace blockId={BLOCK_ID} kind="multi-grid" />);

    expect(
      screen.getByText(
        new RegExp(`${MODE_9.cols}×${MODE_9.rows} · ${MODE_9.cellCount}/${MODE_9.cellCount} 格有图`),
      ),
    ).toBeTruthy();
  });
});
