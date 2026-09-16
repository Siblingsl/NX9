/**
 * 运镜时间轴编排器 —— 组件行为回归（增量新增能力）。
 *
 * 为什么需要 mock：
 * - `@nx9/shared` barrel（index.ts）引用了若干尚不存在的 data/* 模块（既有缺陷），
 *   直接 import 会在测试里解析失败；这里用工厂把 barrel 指到**真实源码模块**
 *   （运镜词库 + 时间轴类型/纯函数），断言依旧对着真实数据，不用桩数据。
 * - `@nx9/director3d` 只用到交接用的 `useMoveTimelineStore`，用桩记录交接内容
 *   （组件与 3D 舞台在真实运行时的耦合已由 director3d-move-timeline-keys.test.ts 覆盖）。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({
  pushed: [] as Array<{ segments: number; label?: string; durationSec: number }>,
  /** 节拍分析的服务端调用桩：由各用例注入成功 / 失败结果 */
  beatAnalyze: vi.fn(),
}));

/** 真实节拍分析走既有 api client；这里只桩掉 `beatAnalyze` 一个方法 */
vi.mock('../../../api/client', () => ({
  api: { beatAnalyze: (audioUrl: string) => hoisted.beatAnalyze(audioUrl) },
}));

vi.mock('@nx9/shared', async () => {
  const library = await import('../../../../../../packages/shared/src/data/camera-move-library');
  const timelineUtils = await import('../../../../../../packages/shared/src/utils/camera-move-timeline');
  const timelineTypes = await import('../../../../../../packages/shared/src/types/camera-move-timeline');
  // 追加：真实节拍网格纯函数（编辑器「从 BGM 分析节拍」用），既有映射一字未改
  const beatGridPlan = await import('../../../../../../packages/shared/src/utils/beat-grid-plan');
  return { ...library, ...timelineUtils, ...timelineTypes, ...beatGridPlan };
});

vi.mock('@nx9/director3d', () => {
  const state = {
    timeline: null,
    sourceLabel: null,
    pushedAt: null,
    keys: [],
    applied: false,
    clearTimeline: () => {},
    setKeys: () => {},
    setApplied: () => {},
    pushTimeline: (timeline: { segments: unknown[]; durationSec: number }, label?: string) => {
      hoisted.pushed.push({ segments: timeline.segments.length, label, durationSec: timeline.durationSec });
    },
  };
  return {
    useMoveTimelineStore: (selector: (s: typeof state) => unknown) => selector(state),
  };
});

import {
  CameraMoveTimelineEditor,
} from '../../../engine/stage-deck/chrome/attached-workspace/generation/CameraMoveTimelineEditor';
import { clearBeatGridCache } from '../../../engine/beat-grid';
import { lookupCameraMove } from '../../../../../../packages/shared/src/data/camera-move-library';

/** 词库实体的真实短语（避免把提示词文案硬编码进断言） */
function def(id: string) {
  const d = lookupCameraMove(id);
  if (!d) throw new Error('测试前置失败：运镜词库缺少 ' + id);
  return d;
}

function openEditor(
  props: Partial<React.ComponentProps<typeof CameraMoveTimelineEditor>> = {},
  opts: { click?: boolean } = {},
) {
  const onApply = vi.fn();
  const rendered = render(
    <CameraMoveTimelineEditor
      value=""
      onApply={onApply}
      resetKey="node-1"
      shotDurationSec={8}
      {...props}
    />,
  );
  if (opts.click !== false) {
    fireEvent.click(screen.getByRole('button', { name: /运镜时间轴/ }));
  }
  return { onApply, ...rendered };
}

/** 从注入文本里取总时长（秒），用于容忍 2 位小数舍入 */
function totalSecOf(text: string): number {
  const m = text.match(/total ([\d.]+)s/);
  if (!m) throw new Error('注入文本缺少总时长：' + text);
  return Number(m[1]);
}

function addMove(label: RegExp) {
  // 添加面板是折叠的：仅在未展开时点开，避免第二次点击又把它收起
  if (!screen.queryByPlaceholderText(/搜索运镜/)) {
    fireEvent.click(screen.getByRole('button', { name: /添加运镜/ }));
  }
  fireEvent.click(screen.getByRole('button', { name: label }));
}

beforeEach(() => {
  hoisted.pushed.length = 0;
  hoisted.beatAnalyze.mockReset();
  clearBeatGridCache();
});

describe('CameraMoveTimelineEditor：添加 / 注入', () => {
  it('未添加片段时不写入提示词（按钮禁用），添加后可注入英文运镜行', () => {
    const { onApply } = openEditor();
    expect((screen.getByRole('button', { name: '写入提示词' }) as HTMLButtonElement).disabled).toBe(true);

    addMove(/^缓推/);
    const apply = screen.getByRole('button', { name: '写入提示词' }) as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
    fireEvent.click(apply);

    expect(onApply).toHaveBeenCalledTimes(1);
    const text = onApply.mock.calls[0][0] as string;
    expect(text.startsWith('camera movement: ')).toBe(true);
    expect(text).toContain('slow dolly push-in');
    expect(text).toContain('total');
  });

  it('多段按添加顺序写入，且中英双语都齐备', () => {
    const { onApply } = openEditor();
    addMove(/^缓推/);
    addMove(/^半环绕/);
    fireEvent.click(screen.getByRole('button', { name: '写入提示词' }));

    const en = onApply.mock.calls[0][0] as string;
    expect(en.indexOf('slow dolly push-in')).toBeGreaterThan(-1);
    expect(en.indexOf('slow dolly push-in')).toBeLessThan(en.indexOf('180-degree orbit'));

    // 切中文再注入：同一行槽位，中文前缀 + 中文短语
    fireEvent.click(screen.getByRole('button', { name: '中文' }));
    fireEvent.click(screen.getByRole('button', { name: '写入提示词' }));
    const zh = onApply.mock.calls[1][0] as string;
    expect(zh.startsWith('运镜：')).toBe(true);
    expect(zh).toContain(def('push-slow').promptZh);
    expect(zh).toContain(def('orbit-180').promptZh);
    expect(zh).toContain('秒');
  });

  it('已有提示词内容被保留，运镜行只占一行（替换而非叠加）', () => {
    const { onApply } = openEditor({
      value: '主体描述第一行\n\ncamera movement: 旧运镜行',
    });
    addMove(/^缓推/);
    fireEvent.click(screen.getByRole('button', { name: '写入提示词' }));
    const text = onApply.mock.calls[0][0] as string;
    expect(text).toContain('主体描述第一行');
    expect(text).not.toContain('旧运镜行');
    expect(text.split('\n').filter((l) => l.trim().toLowerCase().startsWith('camera movement:')).length).toBe(1);
  });

  it('「清除运镜行」只移除运镜行，其余内容不动', () => {
    const { onApply } = openEditor({
      value: '主体描述\ncamera movement: slow dolly in',
    });
    fireEvent.click(screen.getByRole('button', { name: '清除运镜行' }));
    expect(onApply).toHaveBeenCalledWith('主体描述');
  });

  it('排序：↓ 交换相邻两段顺序后注入顺序随之变化', () => {
    const { onApply } = openEditor();
    addMove(/^缓推/);
    addMove(/^半环绕/);
    fireEvent.click(screen.getAllByTitle('下移（更晚）')[0]);
    fireEvent.click(screen.getByRole('button', { name: '写入提示词' }));
    const en = onApply.mock.calls[0][0] as string;
    expect(en.indexOf('180-degree orbit')).toBeLessThan(en.indexOf('slow dolly push-in'));
  });

  it('删除：删掉一段后提示词里不再出现该段', () => {
    const { onApply } = openEditor();
    addMove(/^缓推/);
    addMove(/^半环绕/);
    fireEvent.click(screen.getAllByTitle('删除该段')[0]);
    fireEvent.click(screen.getByRole('button', { name: '写入提示词' }));
    const en = onApply.mock.calls[0][0] as string;
    expect(en).not.toContain('slow dolly push-in');
    expect(en).toContain('180-degree orbit');
  });

  it('清空编排：列表清空、写入按钮重新禁用', () => {
    openEditor();
    addMove(/^缓推/);
    fireEvent.click(screen.getByRole('button', { name: '清空编排' }));
    expect((screen.getByRole('button', { name: '写入提示词' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryAllByTitle('删除该段')).toHaveLength(0);
  });
});

describe('CameraMoveTimelineEditor：时长绑定 / 节拍', () => {
  it('改单段时长 → 总时长与提示词同步变化', () => {
    const { onApply } = openEditor({ shotDurationSec: undefined });
    addMove(/^缓推/);
    fireEvent.change(screen.getByLabelText('片段时长'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '写入提示词' }));
    const en = onApply.mock.calls[0][0] as string;
    expect(en).toContain('total 3s');
  });

  it('「等比铺开」按镜头时长铺满（末段终点 = 镜头时长）', () => {
    const { onApply } = openEditor({ shotDurationSec: 8 });
    addMove(/^缓推/);
    addMove(/^半环绕/);
    fireEvent.click(screen.getByRole('button', { name: '等比铺开' }));
    fireEvent.click(screen.getByRole('button', { name: '写入提示词' }));
    const en = onApply.mock.calls[0][0] as string;
    expect(Math.abs(totalSecOf(en) - 8)).toBeLessThan(0.05);
  });

  it('勾选「绑定镜头时长」后等比铺开（无上游时长时用默认时长）', () => {
    const { onApply } = openEditor({ shotDurationSec: undefined, defaultDurationSec: 5 });
    addMove(/^缓推/);
    addMove(/^半环绕/);
    fireEvent.click(screen.getByLabelText(/绑定镜头时长/));
    fireEvent.click(screen.getByRole('button', { name: '写入提示词' }));
    const en = onApply.mock.calls[0][0] as string;
    expect(Math.abs(totalSecOf(en) - 5)).toBeLessThan(0.05);
  });

  it('节拍对齐：开启后提示词带上 beat-aligned，且段落边界吸附到节拍网格', () => {
    const { onApply } = openEditor({ shotDurationSec: 8 });
    addMove(/^缓推/);
    addMove(/^半环绕/);
    fireEvent.click(screen.getByRole('button', { name: '等比铺开' }));
    fireEvent.click(screen.getByLabelText(/节拍对齐/));
    fireEvent.change(screen.getByTitle('节拍数'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: '写入提示词' }));
    const en = onApply.mock.calls[0][0] as string;
    expect(en).toContain('beat-aligned');
    // 总时长 8s / 4 拍 = 2s 网格 → 每段起止都落在偶数秒上
    const spans = [...en.matchAll(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)s/g)];
    expect(spans.length).toBeGreaterThan(0);
    for (const m of spans) {
      expect(Number(m[1]) % 2).toBe(0);
      expect(Number(m[2]) % 2).toBe(0);
    }
  });

  it('拖拽片段右边缘手柄改变时长', () => {
    const { onApply } = openEditor({ shotDurationSec: undefined });
    addMove(/^缓推/);
    const handle = screen.getByLabelText(/调整「缓推」时长/);
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 220 });
    fireEvent.pointerUp(window, {});
    fireEvent.click(screen.getByRole('button', { name: '写入提示词' }));
    const en = onApply.mock.calls[0][0] as string;
    // 面板宽 520px，时间轴条接近该宽度 → 120px 对应 ≥ 1s 的增量
    expect(en).toContain('total');
    expect(en).not.toContain('total 1.5s');
  });
});

describe('CameraMoveTimelineEditor：交接 3D 导演台', () => {
  it('点交接后把归一化时间轴推给中转站，带段数 / 时长 / 来源', () => {
    openEditor();
    addMove(/^缓推/);
    addMove(/^半环绕/);
    fireEvent.click(screen.getByRole('button', { name: '交接 3D 导演台' }));
    expect(hoisted.pushed).toHaveLength(1);
    expect(hoisted.pushed[0].segments).toBe(2);
    expect(hoisted.pushed[0].label).toBe('视频 / 图片工作台');
    expect(screen.getByText(/已交接 2 段/)).toBeTruthy();
  });

  it('未添加片段时交接按钮禁用', () => {
    openEditor();
    expect((screen.getByRole('button', { name: '交接 3D 导演台' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('enableDirectorHandoff=false 时不渲染交接入口', () => {
    openEditor({ enableDirectorHandoff: false });
    expect(screen.queryAllByRole('button', { name: '交接 3D 导演台' })).toHaveLength(0);
  });
});

describe('CameraMoveTimelineEditor：真实节拍（BGM 分析 → 对齐）', () => {
  it('分析成功：显示 BPM / 节拍数，并在时间轴上标出真实节拍点', async () => {
    hoisted.beatAnalyze.mockResolvedValue({ ok: true, beats: [1, 2, 3, 4, 5, 6], tempo: 120 });
    openEditor({ audioCandidates: ['/media/bgm-01.mp3'], shotDurationSec: 6 });
    addMove(/^缓推/);
    addMove(/^半环绕/);
    // 铺满到 6s：6 个整数秒拍点全部落在时间轴范围内
    fireEvent.click(screen.getByRole('button', { name: '等比铺开' }));

    fireEvent.change(screen.getByLabelText('BGM 音频地址'), { target: { value: '/media/bgm-01.mp3' } });
    fireEvent.click(screen.getByRole('button', { name: /从 BGM 分析节拍/ }));

    expect((await screen.findAllByText(/约 120 BPM/)).length).toBeGreaterThan(0);
    expect(hoisted.beatAnalyze).toHaveBeenCalledWith('/media/bgm-01.mp3');
    expect(screen.getAllByTitle(/真实节拍 #/)).toHaveLength(6);
  });

  it('未填地址且无上游音频候选 → 如实提示，且不发请求', async () => {
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: /从 BGM 分析节拍/ }));
    expect(await screen.findByText(/请先选择或输入 BGM 音频地址/)).toBeTruthy();
    expect(hoisted.beatAnalyze).not.toHaveBeenCalled();
  });

  it('分析失败：展示服务端真实原因，且「对齐到真实节拍」不可用', async () => {
    hoisted.beatAnalyze.mockResolvedValue({ ok: false, message: '未检测到 FFmpeg，禁止空成功' });
    openEditor({ audioCandidates: ['/media/bgm-01.mp3'] });
    addMove(/^缓推/);
    fireEvent.click(screen.getByRole('button', { name: /从 BGM 分析节拍/ }));

    const hits = await screen.findAllByText(/未检测到 FFmpeg，禁止空成功/);
    expect(hits.length).toBeGreaterThan(0);
    expect(
      (screen.getByRole('button', { name: '对齐到真实节拍' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('对齐到真实节拍：各段边界贴到真实拍点，注入的运镜行标记 beat-aligned', async () => {
    hoisted.beatAnalyze.mockResolvedValue({ ok: true, beats: [1, 2, 3, 4, 5, 6], tempo: 120 });
    const { onApply } = openEditor({ audioCandidates: ['/media/bgm-01.mp3'] });
    addMove(/^缓推/);
    addMove(/^半环绕/);

    // 未填地址时用第一个上游音频候选
    fireEvent.click(screen.getByRole('button', { name: /从 BGM 分析节拍/ }));
    await screen.findAllByText(/约 120 BPM/);
    fireEvent.click(screen.getByRole('button', { name: '对齐到真实节拍' }));
    expect(hoisted.beatAnalyze).toHaveBeenCalledWith('/media/bgm-01.mp3');
    expect(screen.getByText(/已按真实节拍对齐/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '写入提示词' }));
    const en = onApply.mock.calls[0][0] as string;
    expect(en).toContain('beat-aligned');
    const spans = [...en.matchAll(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)s/g)];
    expect(spans.length).toBeGreaterThan(0);
    // 节拍点为整数秒 → 各段边界必须都落在整数秒上（没有假刻度）
    for (const m of spans) {
      expect(Number(m[1]) % 1).toBe(0);
      expect(Number(m[2]) % 1).toBe(0);
    }
  });

  it('取消对齐后不再按真实节拍吸附，回到普通时间轴', async () => {
    hoisted.beatAnalyze.mockResolvedValue({ ok: true, beats: [1, 2, 3, 4, 5, 6], tempo: 120 });
    openEditor({ audioCandidates: ['/media/bgm-01.mp3'] });
    addMove(/^缓推/);
    addMove(/^半环绕/);

    fireEvent.click(screen.getByRole('button', { name: /从 BGM 分析节拍/ }));
    await screen.findAllByText(/约 120 BPM/);
    fireEvent.click(screen.getByRole('button', { name: '对齐到真实节拍' }));
    fireEvent.click(screen.getByRole('button', { name: '取消对齐' }));

    expect(screen.queryAllByRole('button', { name: '取消对齐' })).toHaveLength(0);
    expect(screen.getByText(/已取消真实节拍对齐/)).toBeTruthy();
  });
});
