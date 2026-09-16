/**
 * FrameStudyWorkspace —— 组件行为回归（逐帧拉片工作区）。
 *
 * 覆盖边界（本次新增）：逐帧拉片此前只有纯函数层测试（`frame-study-plan` / `frame-study-block-map`），
 * **面板交互、时长探测与逐帧编辑的中文提示零覆盖**。
 *
 * mock 手法：
 * - `@nx9/shared` 走 barrel 替身（既有缺陷），指向真实源码模块 → 抽帧计划 / 时间码 / 合并
 *   逐帧结果都是真实实现；
 * - `@xyflow/react` 用内存流图（`updateNodeData` 是 spy 且真的落 data 并触发重渲染）；
 * - `../api/client` 只打桩「时长探测」这一个网络出口，`probeFrameStudyDuration` 的
 *   成功 / 失败归一仍是真实代码。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

type FlowNode = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

const probes = vi.hoisted(() => ({
  /** 服务端时长探测：由各用例注入成功 / 失败 */
  duration: vi.fn(),
}));

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
  const idle = vi.fn(async () => ({ ok: true }));
  const table: Record<string, unknown> = {
    probeMediaDuration: (url: string) => probes.duration(url),
  };
  return {
    api: new Proxy(table, {
      get: (target: Record<string, unknown>, key: string) => target[key] ?? idle,
    }),
  };
});

import { FrameStudyWorkspace } from '../stage-deck/chrome/attached-workspace/tool/FrameStudyWorkspace';
import { useActivityLog } from '../../stores/activity-log';
import { useToast } from '../../stores/toast';
import { useFlowRuntime } from '../../stores/flow-runtime';
import {
  FRAME_STUDY_STRATEGIES,
  buildFrameStudyPlan,
  mergeFrameStudyReversals,
  lookupFrameStudyStrategy,
} from '../../../../../packages/shared/src/utils/frame-study-plan';

const BLOCK_ID = 'fs-1';
const VIDEO = '/media/videos/take-01.mp4';

function strategy(id: string) {
  const found = FRAME_STUDY_STRATEGIES.find((s) => s.id === id);
  if (!found) throw new Error('测试前置失败：抽帧策略缺少 ' + id);
  return found;
}
const BY_COUNT = strategy('count');
const BY_INTERVAL = strategy('interval');

/** 已跑过一轮的拉片表：3 帧，第 2 帧没有帧图（用于覆盖「无帧图」分支）。
 *
 * 帧数由 `frameStudyPipelineTimecodes` 决定（count=8 → 服务端步长 3s，时长 6s → 0/3/6 三帧），
 * 因此这里用 value=8 + duration=6 得到稳定的 3 帧。 */
function landedFrameStudy() {
  const plan = buildFrameStudyPlan({
    mode: 'count',
    value: BY_COUNT.defaultValue,
    durationSec: 6,
    sourceUrl: VIDEO,
    aspectRatio: '16:9',
  });
  const result = mergeFrameStudyReversals(plan, [
    {
      index: 0,
      timeSec: plan.timeSec[0],
      thumbnailUrl: '/media/frames/001.jpg',
      reversePromptZh: '第 1 帧中文提示词',
      reversePromptEn: 'frame one prompt',
    },
    {
      index: 1,
      timeSec: plan.timeSec[1],
      thumbnailUrl: '',
      reversePromptZh: '',
      reversePromptEn: '',
    },
    { index: 2, timeSec: plan.timeSec[2], thumbnailUrl: '/media/frames/003.jpg' },
  ]);
  return {
    frameStudyMode: 'count',
    frameStudyValue: BY_COUNT.defaultValue,
    frameStudyVideoUrl: VIDEO,
    frameStudyDurationSec: 6,
    frameStudyPlan: plan,
    frameStudyItems: result.items,
    frameStudyResult: result,
  };
}

function setNodeData(data: Record<string, unknown>) {
  flow.state.nodes = [
    { id: BLOCK_ID, type: 'frame-study', position: { x: 0, y: 0 }, data },
  ];
  flow.state.edges = [];
}

function lastPatch(): Record<string, unknown> {
  const call = flow.updateNodeData.mock.calls.at(-1);
  if (!call) throw new Error('本用例未发生任何 updateNodeData');
  expect(call[0]).toBe(BLOCK_ID);
  return call[1] as Record<string, unknown>;
}

function advancedScope(): ReturnType<typeof within> {
  fireEvent.click(screen.getByTitle('更多设置'));
  const panel = document.querySelector('.nx9-composer-popover');
  if (!panel) throw new Error('参数面板未渲染');
  return within(panel as HTMLElement);
}

beforeEach(() => {
  flow.updateNodeData.mockClear();
  flow.listeners.clear();
  probes.duration.mockReset();
  setNodeData({});
  useActivityLog.setState({ lines: [], open: false });
  useToast.setState({ items: [] });
  useFlowRuntime.setState({
    runtime: {
      updateNodeData: (id: string, patch: Record<string, unknown>) =>
        flow.updateNodeData(id, patch),
      getNodes: () => flow.state.nodes,
      getEdges: () => flow.state.edges,
    } as never,
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => {}) },
  });
});

describe('FrameStudyWorkspace：空态 / 无上游视频', () => {
  it('没有视频：给出中文引导，导出与写入入口逐条禁用', () => {
    render(<FrameStudyWorkspace blockId={BLOCK_ID} kind="frame-study" />);

    // 主 CTA 不再靠「禁用」把用户挡在门外：点击即提示（见下方单独用例），这里只核对引导文案
    const run = screen.getByRole('button', { name: '抽帧并逐帧反推' }) as HTMLButtonElement;
    expect(run.disabled).toBe(false);
    expect(
      screen.getByText(/逐帧拉片需要一段参考视频：连接上游视频节点后，本面板会按抽帧策略逐帧拆解，\s*并为每一帧反推出可复用的提示词。/),
    ).toBeTruthy();

    // 没有视频地址 → 探测入口同样「可点但只提示」，绝不发明「探测 0 秒」这类空成功
    const probe = screen.getByRole('button', { name: '探测时长' }) as HTMLButtonElement;
    expect(probe.disabled).toBe(false);
    expect(probe.getAttribute('title')).toBe(
      '还没有视频：点击会提示先连接上游视频（或在本行右侧指定视频地址），不会发出探测请求',
    );
    expect(
      screen.getByText(
        '未连接上游视频：请把「视频生成 / 素材导入」等节点的视频连到本节点左侧，或在右侧指定视频地址',
      ),
    ).toBeTruthy();

    for (const name of ['导出 JSON', '导出 CSV']) {
      const button = screen.getByRole('button', { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.getAttribute('title')).toBe('还没有拉片表');
    }

    // 参数区：待视频 / 时长未知 / 真实策略标签
    const params = advancedScope();
    expect(
      params.getByText(
        new RegExp(`${BY_COUNT.label} · 待视频 · 时长未知 · 模型由服务端视觉通道决定`),
      ),
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: '送入分镜' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(flow.updateNodeData).not.toHaveBeenCalled();
  });

  it('没有视频：主 CTA 与「探测时长」点得动，点击即得到中文提示（提示可达），但仍不空成功', () => {
    render(<FrameStudyWorkspace blockId={BLOCK_ID} kind="frame-study" />);

    // 主 CTA 的无视频分支：点得到、说清楚、且不写节点状态（handleRun 在此之前就已 return）
    fireEvent.click(screen.getByRole('button', { name: '抽帧并逐帧反推' }));
    expect(
      useToast
        .getState()
        .items.some(
          (i) =>
            i.message ===
              '逐帧拉片缺少上游视频：请把视频连到本节点左侧，或在面板指定视频地址（禁止空成功）' &&
            i.variant === 'error',
        ),
    ).toBe(true);

    // 探测入口的无视频分支同理：点得到、说清楚，且**一个请求都不发**
    fireEvent.click(screen.getByRole('button', { name: '探测时长' }));
    expect(
      useToast
        .getState()
        .items.some(
          (i) =>
            i.message ===
              '未连接上游视频：请先把视频节点连到本节点左侧，或在下方指定视频地址' &&
            i.variant === 'error',
        ),
    ).toBe(true);
    expect(probes.duration).not.toHaveBeenCalled();

    // 两个入口都没有写任何节点状态、也没有假日志
    expect(flow.updateNodeData).not.toHaveBeenCalled();
    expect(useActivityLog.getState().lines).toHaveLength(0);
  });

  it('在参数区可手工指定视频地址（上游不可用时的兜底），写入 frameStudyVideoUrl', () => {
    render(<FrameStudyWorkspace blockId={BLOCK_ID} kind="frame-study" />);

    fireEvent.change(screen.getByPlaceholderText('/media/videos/… 视频地址'), {
      target: { value: VIDEO },
    });

    expect(lastPatch()).toEqual({ frameStudyVideoUrl: VIDEO });
    // 指定后主 CTA 与探测入口都解锁
    expect((screen.getByRole('button', { name: '抽帧并逐帧反推' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect((screen.getByRole('button', { name: '探测时长' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});

describe('FrameStudyWorkspace：时长探测', () => {
  it('探测成功：写入时长与备注，概览显示真实秒数并提示成功', async () => {
    setNodeData({ frameStudyVideoUrl: VIDEO });
    probes.duration.mockResolvedValue({ ok: true, durationSec: 12.5 });
    render(<FrameStudyWorkspace blockId={BLOCK_ID} kind="frame-study" />);

    fireEvent.click(screen.getByRole('button', { name: '探测时长' }));

    await waitFor(() => {
      expect(lastPatch()).toEqual({
        frameStudyVideoUrl: VIDEO,
        frameStudyDurationSec: 12.5,
        frameStudyDurationNote: undefined,
      });
    });
    expect(probes.duration).toHaveBeenCalledWith(VIDEO);
    expect(useToast.getState().items.some((i) => i.message === '视频时长约 12.5s')).toBe(true);
    expect(
      useActivityLog.getState().lines.some((l) => l.includes('已探到视频时长 12.5s')),
    ).toBe(true);
    expect(advancedScope().getByText(/时长约 12\.5s/)).toBeTruthy();
  });

  it('探测请求抛异常：如实回落「时长未知」并带上真实错误原因，不编造时长', async () => {
    setNodeData({ frameStudyVideoUrl: VIDEO });
    probes.duration.mockRejectedValue(new Error('未检测到 ffprobe'));
    render(<FrameStudyWorkspace blockId={BLOCK_ID} kind="frame-study" />);

    fireEvent.click(screen.getByRole('button', { name: '探测时长' }));

    await waitFor(() => {
      expect(lastPatch()).toEqual({
        frameStudyVideoUrl: VIDEO,
        frameStudyDurationSec: null,
        frameStudyDurationNote: '时长探测失败：未检测到 ffprobe（时间码将留空）',
      });
    });
    expect(
      useToast
        .getState()
        .items.some((i) => i.message === '时长探测失败：未检测到 ffprobe（时间码将留空）'),
    ).toBe(true);
    expect(
      useActivityLog
        .getState()
        .lines.some((l) => l.includes('时长探测失败：未检测到 ffprobe（时间码将留空）')),
    ).toBe(true);
    expect(advancedScope().getAllByText(/时长未知/).length).toBeGreaterThan(0);
  });

  it('服务端 ok:false：同样不编造时长，面板直接展示失败备注', async () => {
    setNodeData({ frameStudyVideoUrl: VIDEO });
    probes.duration.mockResolvedValue({ ok: false, durationSec: null });
    render(<FrameStudyWorkspace blockId={BLOCK_ID} kind="frame-study" />);

    fireEvent.click(screen.getByRole('button', { name: '探测时长' }));

    await waitFor(() => {
      expect(
        useToast
          .getState()
          .items.some(
            (i) => i.message === '时长探测失败：服务端未能解析该视频（时间码将留空）',
          ),
      ).toBe(true);
    });
    // 失败备注直接渲染在面板上（不只在 toast 里一闪而过）
    expect(
      screen.getByText('时长探测失败：服务端未能解析该视频（时间码将留空）'),
    ).toBeTruthy();
  });

  it('服务端 ok:false 且给出 message：原样带上服务端原因，不吞成固定文案', async () => {
    setNodeData({ frameStudyVideoUrl: VIDEO });
    probes.duration.mockResolvedValue({
      ok: false,
      durationSec: 0,
      message: '未检测到 ffprobe：请安装 ffmpeg 后重试',
    });
    render(<FrameStudyWorkspace blockId={BLOCK_ID} kind="frame-study" />);

    fireEvent.click(screen.getByRole('button', { name: '探测时长' }));

    const expected = '时长探测失败：未检测到 ffprobe：请安装 ffmpeg 后重试（时间码将留空）';
    await waitFor(() => {
      expect(lastPatch()).toEqual({
        frameStudyVideoUrl: VIDEO,
        frameStudyDurationSec: null,
        frameStudyDurationNote: expected,
      });
    });
    expect(useToast.getState().items.some((i) => i.message === expected)).toBe(true);
    expect(useActivityLog.getState().lines.some((l) => l.includes(expected))).toBe(true);
    // 服务端原话直接落在面板上（不只在 toast 里一闪而过）
    expect(screen.getByText(expected)).toBeTruthy();
    // 服务端说得出原因时，不得回落到「服务端未能解析该视频」这句固定文案
    expect(screen.queryByText('时长探测失败：服务端未能解析该视频（时间码将留空）')).toBeNull();
  });
});

describe('FrameStudyWorkspace：策略与参数写回', () => {
  it('切抽帧策略：写入策略 + 该策略默认值，并作废上一策略的拉片表 / 计划 / 逐帧结果', () => {
    setNodeData({ frameStudyVideoUrl: VIDEO });
    render(<FrameStudyWorkspace blockId={BLOCK_ID} kind="frame-study" />);

    fireEvent.click(screen.getByRole('button', { name: BY_INTERVAL.label }));

    expect(lastPatch()).toEqual({
      frameStudyMode: BY_INTERVAL.id,
      frameStudyValue: BY_INTERVAL.defaultValue,
      frameStudyPlan: undefined,
      frameStudyItems: undefined,
      frameStudyResult: undefined,
      frameStudyFrameUrls: undefined,
    });
    // 参数区口径跟着策略变（帧数 → 间隔，并给出真实上限）
    const params = advancedScope();
    expect(params.getByText(`${BY_INTERVAL.valueLabel}`)).toBeTruthy();
    expect(
      params.getByText(new RegExp(`1–${BY_INTERVAL.maxValue} 秒（服务端按 fps=1/N 采样`)),
    ).toBeTruthy();
  });

  it('抽帧数 / 宽高比 / 并发 / 上下文：控件变更写入同名 data 字段并回显', () => {
    setNodeData({ frameStudyVideoUrl: VIDEO });
    render(<FrameStudyWorkspace blockId={BLOCK_ID} kind="frame-study" />);
    const params = advancedScope();

    const count = params.getByRole('spinbutton') as HTMLInputElement;
    // 注意：新值必须与当前值不同，否则 React 不会派发 onChange（默认值就是 8）
    fireEvent.change(count, { target: { value: '12' } });
    expect(lastPatch()).toEqual({ frameStudyValue: 12 });
    expect(count.value).toBe('12');

    const aspect = params.getAllByRole('combobox')[0] as HTMLSelectElement;
    fireEvent.change(aspect, { target: { value: '9:16' } });
    expect(lastPatch()).toEqual({ aspectRatio: '9:16' });

    const concurrency = params.getByTitle(
      '逐帧反推的有界并发上限（1–4，缺省 2）；与执行器共用同一解析口径（data.concurrency）',
    ) as HTMLSelectElement;
    fireEvent.change(concurrency, { target: { value: '4' } });
    expect(lastPatch()).toEqual({ concurrency: 4 });

    fireEvent.change(params.getByPlaceholderText('例：雨夜追逐，手持跟拍，冷调霓虹'), {
      target: { value: '雨夜追逐' },
    });
    expect(lastPatch()).toEqual({ frameStudyContext: '雨夜追逐' });
  });

  it('抽帧数清空 / 归零时回落到该策略默认值（禁止写入非法帧数）', () => {
    setNodeData({ frameStudyVideoUrl: VIDEO });
    render(<FrameStudyWorkspace blockId={BLOCK_ID} kind="frame-study" />);
    const params = advancedScope();
    const count = params.getByRole('spinbutton') as HTMLInputElement;

    fireEvent.change(count, { target: { value: '' } });
    expect(lastPatch()).toEqual({ frameStudyValue: BY_COUNT.defaultValue });
    fireEvent.change(count, { target: { value: '0' } });
    expect(lastPatch()).toEqual({ frameStudyValue: BY_COUNT.defaultValue });
  });

  it('「清空拉片表」写 undefined 并记日志（计划 / 逐帧结果 / 回写记录一并作废）', () => {
    setNodeData(landedFrameStudy());
    render(<FrameStudyWorkspace blockId={BLOCK_ID} kind="frame-study" />);

    fireEvent.click(screen.getByRole('button', { name: '清空拉片表' }));

    expect(lastPatch()).toEqual({
      frameStudyPlan: undefined,
      frameStudyItems: undefined,
      frameStudyResult: undefined,
      frameStudyFrameUrls: undefined,
      frameStudyShotWriteback: undefined,
    });
    expect(
      useActivityLog
        .getState()
        .lines.some((l) => l.includes('已清空拉片表（计划与逐帧结果一并作废）')),
    ).toBe(true);
  });
});

describe('FrameStudyWorkspace：逐帧表渲染与编辑', () => {
  it('逐帧卡片按真实时间码渲染；无帧图的帧明确标「无帧图」且「重推」不可用', () => {
    setNodeData(landedFrameStudy());
    render(<FrameStudyWorkspace blockId={BLOCK_ID} kind="frame-study" />);

    // 帧号 / 时间码来自真实 formatFrameStudyTimecode 与实际抽帧管线落点（0/3/6s）
    expect(screen.getAllByText('#1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('#2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('#3').length).toBeGreaterThan(0);
    expect(screen.getByText('00:00.000')).toBeTruthy();
    expect(screen.getByText('00:03.000')).toBeTruthy();
    expect(screen.getByText('00:06.000')).toBeTruthy();

    // 帧 2 无帧图
    expect(screen.getByText('无帧图')).toBeTruthy();
    const rerun = screen.getAllByRole('button', { name: '重推' }) as HTMLButtonElement[];
    expect(rerun[1]!.disabled).toBe(true);
    expect(rerun[1]!.getAttribute('title')).toBe('该帧没有帧图，无法重推');
    expect(rerun[0]!.disabled).toBe(false);

    // 已落盘的中文提示词回显
    expect(
      (screen.getAllByPlaceholderText('中文提示词（可编辑）')[0] as HTMLTextAreaElement).value,
    ).toBe('第 1 帧中文提示词');
  });

  it('编辑某帧中文提示词：重建拉片表（其余帧原样保留），并同步 frameStudyFrameUrls', () => {
    setNodeData(landedFrameStudy());
    render(<FrameStudyWorkspace blockId={BLOCK_ID} kind="frame-study" />);

    fireEvent.change(screen.getAllByPlaceholderText('中文提示词（可编辑）')[0]!, {
      target: { value: '改写后的第 1 帧' },
    });

    const patch = lastPatch();
    const items = patch.frameStudyItems as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      reversePromptZh: '改写后的第 1 帧',
      thumbnailUrl: '/media/frames/001.jpg',
      timeSec: 0,
    });
    // 其余帧不被牵动（空字符串字段会被真实合并逻辑省略，故用 ?? '' 归一）
    expect(items[1]).toMatchObject({ timeSec: 3 });
    expect((items[1] as Record<string, unknown>).thumbnailUrl ?? '').toBe('');
    expect(items[2]).toMatchObject({ thumbnailUrl: '/media/frames/003.jpg', timeSec: 6 });
    // 逐帧图清单只含有图的帧（下游消费口径）
    expect(patch.frameStudyFrameUrls).toEqual(['/media/frames/001.jpg', '/media/frames/003.jpg']);

    expect(
      (screen.getAllByPlaceholderText('中文提示词（可编辑）')[0] as HTMLTextAreaElement).value,
    ).toBe('改写后的第 1 帧');
  });

  it('清空某帧：写入补丁并提示成功，其余帧保留', () => {
    setNodeData(landedFrameStudy());
    render(<FrameStudyWorkspace blockId={BLOCK_ID} kind="frame-study" />);

    fireEvent.click(screen.getAllByTitle('清空该帧的帧图与提示词（其余帧不受影响）')[0]!);

    const items = lastPatch().frameStudyItems as Array<Record<string, unknown>>;
    expect(items[0]?.thumbnailUrl ?? '').toBe('');
    expect(items[0]?.reversePromptZh ?? '').toBe('');
    expect(items[2]?.thumbnailUrl).toBe('/media/frames/003.jpg');
    expect(useToast.getState().items.some((i) => i.message === '已清空该帧')).toBe(true);
    expect(useActivityLog.getState().lines.some((l) => l.includes('已清空第 1 帧'))).toBe(true);
  });

  it('「复制」某帧：把时间码与中英提示词写入剪贴板并提示成功', async () => {
    setNodeData(landedFrameStudy());
    render(<FrameStudyWorkspace blockId={BLOCK_ID} kind="frame-study" />);

    fireEvent.click(screen.getAllByRole('button', { name: '复制' })[0]!);

    await waitFor(() =>
      expect(useToast.getState().items.some((i) => i.message === '已复制第 1 帧提示词')).toBe(true),
    );
    const writeText = navigator.clipboard.writeText as unknown as ReturnType<typeof vi.fn>;
    const text = writeText.mock.calls[0]![0] as string;
    expect(text).toContain('第 1 帧 · 00:00.000');
    expect(text).toContain('中文：第 1 帧中文提示词');
    expect(text).toContain('英文：frame one prompt');
  });

  it('剪贴板不可用时如实报错（可手动复制），不静默成功', async () => {
    setNodeData(landedFrameStudy());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {
          throw new Error('clipboard blocked');
        }),
      },
    });
    render(<FrameStudyWorkspace blockId={BLOCK_ID} kind="frame-study" />);

    fireEvent.click(screen.getAllByRole('button', { name: '复制' })[0]!);

    await waitFor(() => {
      const items = useToast.getState().items;
      expect(
        items.some(
          (i) =>
            i.message === '复制失败：clipboard blocked（可手动选中文本复制）' && i.variant === 'error',
        ),
      ).toBe(true);
    });
  });
});
