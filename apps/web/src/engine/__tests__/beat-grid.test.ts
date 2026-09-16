/**
 * 音频节拍网格接入层回归（增量新增能力）。
 *
 * 为什么 mock `@nx9/shared`：
 * - `packages/shared/src/index.ts`（barrel）当前引用了 8 个尚不存在的 data/* 模块（既有缺陷），
 *   走 alias 直接 import 会在解析阶段失败。这里用工厂把 barrel 指到**真实源码模块**
 *   （beat-grid-plan / camera-move-timeline），断言依旧对着真实实现，不用桩数据。
 * - 时间轴回归本体（`snapMoveTimelineToBeats` 等）另走**相对路径直取源码**，与 barrel 缺陷解耦。
 *
 * 真实音频端到端**未**在本文件验证：需要 ffmpeg + 真实音频 + 运行中的服务端，
 * 这里只对注入的 mock api 验证引擎行为；端到端口径见 docs/NX9-BEAT-GRID-IMPORT.md。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@nx9/shared', async () => {
  const plan = await import('../../../../../packages/shared/src/utils/beat-grid-plan');
  const timeline = await import('../../../../../packages/shared/src/utils/camera-move-timeline');
  const timelineTypes = await import('../../../../../packages/shared/src/types/camera-move-timeline');
  return { ...timelineTypes, ...timeline, ...plan };
});

import {
  BEAT_ANALYZE_TIMEOUT_MS,
  analyzeAudioBeats,
  beatGridInflightCount,
  beatGridToMarkers,
  beatGridTotalDuration,
  beatIntervalStats,
  beatsToBoundaries,
  clearBeatGridCache,
  readCachedBeatGrid,
  type BeatAnalyzeApi,
  type BeatAnalyzeResponse,
  type BeatGrid,
} from '../beat-grid';
import {
  beatGridEndSec,
  distributeSegmentBoundaries,
  planCellDurationsFromBeats,
  sanitizeBeats,
  snapTimelineToBeatGrid,
} from '../../../../../packages/shared/src/utils/beat-grid-plan';
import {
  normalizeMoveTimeline,
  snapMoveTimelineToBeats,
} from '../../../../../packages/shared/src/utils/camera-move-timeline';

const AUDIO = '/media/uploads/bgm-01.mp3';

/** 只实现被消费的一个方法：与 `api.beatAnalyze` 同形 */
function stubApi(
  impl: (audioUrl: string) => Promise<BeatAnalyzeResponse>,
): BeatAnalyzeApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    beatAnalyze: (url: string) => {
      calls.push(url);
      return impl(url);
    },
  };
}

/** 成功网格：等间隔 1 秒的 6 拍 */
function gridOf(beats: number[], extra: Partial<BeatGrid> = {}): BeatGrid {
  return {
    ok: true,
    audioUrl: AUDIO,
    beats,
    analyzedAt: 1,
    ...extra,
  };
}

function timelineOf(spans: [number, number][]): {
  version: number;
  durationSec: number;
  segments: { id: string; moveId: string; startT: number; endT: number }[];
} {
  return {
    version: 1,
    durationSec: spans.length > 0 ? spans[spans.length - 1]![1] : 0,
    segments: spans.map(([startT, endT], i) => ({
      id: `seg-${i + 1}`,
      moveId: 'push-slow',
      startT,
      endT,
    })),
  };
}

beforeEach(() => {
  clearBeatGridCache();
});

afterEach(() => {
  clearBeatGridCache();
});

/* ────────────────────────── 引擎：分析 ────────────────────────── */

describe('analyzeAudioBeats：成功路径', () => {
  it('成功时产出结构化 BeatGrid（节拍 / BPM / 覆盖末端）', async () => {
    const api = stubApi(async () => ({ ok: true, beats: [0.5, 1, 1.5, 2], tempo: 120 }));
    const grid = await analyzeAudioBeats(AUDIO, { api });

    expect(grid.ok).toBe(true);
    expect(grid.audioUrl).toBe(AUDIO);
    expect(grid.beats).toEqual([0.5, 1, 1.5, 2]);
    expect(grid.tempo).toBe(120);
    expect(grid.durationSec).toBe(2);
    expect(grid.cached).toBeUndefined();
    expect(api.calls).toEqual([AUDIO]);
  });

  it('清洗服务端脏数据：排序 / 去重 / 丢弃非正与非有限值', async () => {
    const api = stubApi(async () => ({
      ok: true,
      beats: [1.5, 0.5, 0.5, Number.NaN, -1, 2, Number.POSITIVE_INFINITY],
    }));
    const grid = await analyzeAudioBeats(AUDIO, { api });
    expect(grid.ok).toBe(true);
    expect(grid.beats).toEqual([0.5, 1.5, 2]);
  });

  it('tempo 非法（0 / NaN / 缺失）时不写入 tempo，不编造 BPM', async () => {
    for (const bad of [0, Number.NaN, undefined]) {
      clearBeatGridCache();
      const api = stubApi(async () => ({ ok: true, beats: [1, 2], tempo: bad as number }));
      const grid = await analyzeAudioBeats(AUDIO, { api });
      expect(grid.ok).toBe(true);
      expect(grid.tempo).toBeUndefined();
      expect('tempo' in grid).toBe(false);
    }
  });

  it('地址两端空白被裁剪，且按裁剪后的地址请求', async () => {
    const api = stubApi(async () => ({ ok: true, beats: [1, 2] }));
    const grid = await analyzeAudioBeats(`  ${AUDIO}  `, { api });
    expect(grid.audioUrl).toBe(AUDIO);
    expect(api.calls).toEqual([AUDIO]);
  });
});

describe('analyzeAudioBeats：失败路径（禁止空成功）', () => {
  it('服务端 ok:false 时如实透传原因，且 beats 为空数组', async () => {
    const api = stubApi(async () => ({ ok: false, message: '未检测到 FFmpeg，禁止空成功' }));
    const grid = await analyzeAudioBeats(AUDIO, { api });
    expect(grid.ok).toBe(false);
    expect(grid.beats).toEqual([]);
    expect(grid.message).toBe('未检测到 FFmpeg，禁止空成功');
    expect(grid.durationSec).toBeUndefined();
  });

  it('服务端 ok:true 但节拍为空 → 判定失败，不把空节拍当成功', async () => {
    const api = stubApi(async () => ({ ok: true, beats: [] }));
    const grid = await analyzeAudioBeats(AUDIO, { api });
    expect(grid.ok).toBe(false);
    expect(grid.beats).toEqual([]);
    expect(grid.message).toBe('未检测到节拍（禁止空成功）');
  });

  it('ok:true 但节拍全为脏值（清洗后为空）→ 同样判定失败', async () => {
    const api = stubApi(async () => ({ ok: true, beats: [Number.NaN, -3, 0] }));
    const grid = await analyzeAudioBeats(AUDIO, { api });
    expect(grid.ok).toBe(false);
    expect(grid.beats).toEqual([]);
  });

  it('超时 → ok:false 且给出超时原因（不返回半截网格）', async () => {
    const api = stubApi(() => new Promise<BeatAnalyzeResponse>(() => {}));
    const grid = await analyzeAudioBeats(AUDIO, { api, timeoutMs: 30 });
    expect(grid.ok).toBe(false);
    expect(grid.beats).toEqual([]);
    expect(grid.message).toContain('超时');
  });

  it('timeoutMs<=0 时关闭超时（长任务不被中断）', async () => {
    const api = stubApi(async () => ({ ok: true, beats: [1, 2] }));
    const grid = await analyzeAudioBeats(AUDIO, { api, timeoutMs: 0 });
    expect(grid.ok).toBe(true);
    expect(BEAT_ANALYZE_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('请求抛错（网络 / 服务端 500）→ ok:false 且带出错误文本', async () => {
    const api = stubApi(async () => {
      throw new Error('beat analyze 500');
    });
    const grid = await analyzeAudioBeats(AUDIO, { api });
    expect(grid.ok).toBe(false);
    expect(grid.message).toContain('beat analyze 500');
  });

  it('空地址直接失败，且不发出请求', async () => {
    const api = stubApi(async () => ({ ok: true, beats: [1] }));
    const grid = await analyzeAudioBeats('   ', { api });
    expect(grid.ok).toBe(false);
    expect(api.calls).toEqual([]);
    expect(grid.message).toContain('音频地址为空');
  });
});

describe('analyzeAudioBeats：缓存与并发去重', () => {
  it('同 URL 第二次走缓存，不再请求；且缓存结果带 cached 标记', async () => {
    const api = stubApi(async () => ({ ok: true, beats: [1, 2], tempo: 100 }));
    const first = await analyzeAudioBeats(AUDIO, { api });
    const second = await analyzeAudioBeats(AUDIO, { api });

    expect(api.calls).toHaveLength(1);
    expect(first.cached).toBeUndefined();
    expect(second.cached).toBe(true);
    expect(second.beats).toEqual(first.beats);
    expect(second.tempo).toBe(100);
  });

  it('force=true 跳过缓存重新请求', async () => {
    const api = stubApi(async () => ({ ok: true, beats: [1, 2] }));
    await analyzeAudioBeats(AUDIO, { api });
    await analyzeAudioBeats(AUDIO, { api, force: true });
    expect(api.calls).toHaveLength(2);
  });

  it('失败结果同样短缓存（不反复打服务端），清缓存后可重试', async () => {
    const api = stubApi(async () => ({ ok: false, message: '未检测到 FFmpeg，禁止空成功' }));
    const first = await analyzeAudioBeats(AUDIO, { api });
    const second = await analyzeAudioBeats(AUDIO, { api });
    expect(api.calls).toHaveLength(1);
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);

    clearBeatGridCache(AUDIO);
    await analyzeAudioBeats(AUDIO, { api });
    expect(api.calls).toHaveLength(2);
  });

  it('并发调用同一 URL 只发一次请求（共享同一 Promise）', async () => {
    let release: (v: BeatAnalyzeResponse) => void = () => {};
    const api = stubApi(
      () =>
        new Promise<BeatAnalyzeResponse>((resolve) => {
          release = resolve;
        }),
    );
    const p1 = analyzeAudioBeats(AUDIO, { api });
    const p2 = analyzeAudioBeats(AUDIO, { api });
    expect(beatGridInflightCount()).toBe(1);
    release({ ok: true, beats: [1, 2, 3], tempo: 90 });
    const [g1, g2] = await Promise.all([p1, p2]);

    expect(api.calls).toHaveLength(1);
    expect(g1.beats).toEqual([1, 2, 3]);
    expect(g2.beats).toEqual([1, 2, 3]);
    expect(beatGridInflightCount()).toBe(0);
  });

  it('不同 URL 各自请求，互不串味', async () => {
    const api = stubApi(async (url) => ({ ok: true, beats: url.endsWith('a.mp3') ? [1, 2] : [5, 6] }));
    const a = await analyzeAudioBeats('/media/a.mp3', { api });
    const b = await analyzeAudioBeats('/media/b.mp3', { api });
    expect(api.calls).toEqual(['/media/a.mp3', '/media/b.mp3']);
    expect(a.beats).toEqual([1, 2]);
    expect(b.beats).toEqual([5, 6]);
  });

  it('readCachedBeatGrid 只读缓存，不触发请求', async () => {
    const api = stubApi(async () => ({ ok: true, beats: [1, 2] }));
    expect(readCachedBeatGrid(AUDIO)).toBeNull();
    await analyzeAudioBeats(AUDIO, { api });
    expect(readCachedBeatGrid(AUDIO)?.beats).toEqual([1, 2]);
    expect(api.calls).toHaveLength(1);
  });

  it('清空全部缓存后所有 URL 都会重新请求', async () => {
    const api = stubApi(async () => ({ ok: true, beats: [1, 2] }));
    await analyzeAudioBeats('/media/a.mp3', { api });
    await analyzeAudioBeats('/media/b.mp3', { api });
    clearBeatGridCache();
    await analyzeAudioBeats('/media/a.mp3', { api });
    await analyzeAudioBeats('/media/b.mp3', { api });
    expect(api.calls).toHaveLength(4);
  });
});

/* ────────────────────────── 引擎：纯函数 ────────────────────────── */

describe('beatGridToMarkers / beatIntervalStats / beatGridTotalDuration', () => {
  it('标记带序号与相邻间隔；首拍无间隔', () => {
    const markers = beatGridToMarkers(gridOf([0.5, 1.5, 2]));
    expect(markers).toHaveLength(3);
    expect(markers[0]).toEqual({ t: 0.5, index: 0 });
    expect(markers[1].intervalSec).toBe(1);
    expect(markers[2].intervalSec).toBe(0.5);
  });

  it('失败网格不产生标记（不编造刻度）', () => {
    expect(beatGridToMarkers({ ok: false, beats: [], message: 'x' })).toEqual([]);
    expect(beatGridToMarkers(null)).toEqual([]);
  });

  it('间隔统计：中位 / 最小 / 最大 / 均值', () => {
    const stats = beatIntervalStats(gridOf([1, 2, 4, 5]));
    expect(stats.count).toBe(3);
    expect(stats.medianSec).toBe(1);
    expect(stats.minSec).toBe(1);
    expect(stats.maxSec).toBe(2);
    expect(stats.meanSec).toBe(1.333);
  });

  it('样本不足时统计值为 null（不用 0 冒充统计结果）', () => {
    const stats = beatIntervalStats(gridOf([1]));
    expect(stats).toEqual({ count: 0, medianSec: null, minSec: null, maxSec: null, meanSec: null });
    expect(beatIntervalStats(null).count).toBe(0);
  });

  it('覆盖末端：优先 durationSec，否则末个节拍；失败网格为 0', () => {
    expect(beatGridTotalDuration(gridOf([1, 2, 3]))).toBe(3);
    expect(beatGridTotalDuration(gridOf([1, 2, 3], { durationSec: 12 }))).toBe(12);
    expect(beatGridTotalDuration(null)).toBe(0);
  });

  it('beatsToBoundaries 失败网格返回 ok:false + 原因（不透传空边界）', () => {
    const failed = beatsToBoundaries({ ok: false, beats: [], message: '未检测到 FFmpeg' }, 4);
    expect(failed.ok).toBe(false);
    expect(failed.boundaries).toEqual([]);
    expect(failed.messageZh).toContain('未检测到 FFmpeg');
  });
});

/* ────────────────────────── 共享纯函数：节拍分段 ────────────────────────── */

describe('distributeSegmentBoundaries：节拍 → N 段边界', () => {
  it('均匀 8 拍分 4 段：边界落在真实拍点，首尾对齐', () => {
    const plan = distributeSegmentBoundaries([1, 2, 3, 4, 5, 6, 7, 8], 4);
    expect(plan.ok).toBe(true);
    expect(plan.boundaries).toEqual([0, 2, 4, 6, 8]);
    expect(plan.durations).toEqual([2, 2, 2, 2]);
    expect(plan.beatsPerSegment).toEqual([2, 2, 2, 2]);
    expect(plan.startSec).toBe(0);
    expect(plan.endSec).toBe(8);
  });

  it('非均匀节拍：边界取自真实拍点，不产生等分假刻度', () => {
    const plan = distributeSegmentBoundaries([0.9, 2.1, 2.8, 4.4], 2);
    expect(plan.ok).toBe(true);
    expect(plan.boundaries).toEqual([0, 2.1, 4.4]);
    expect(plan.durations).toEqual([2.1, 2.3]);
  });

  it('零节拍 → ok:false（禁止伪造节拍）', () => {
    const plan = distributeSegmentBoundaries([], 4);
    expect(plan.ok).toBe(false);
    expect(plan.boundaries).toEqual([]);
    expect(plan.messageZh).toContain('没有可用节拍点');
  });

  it('节拍不足（少于 段数 × 每段最少拍数）→ ok:false 并给出数量对比', () => {
    const plan = distributeSegmentBoundaries([1, 2], 4);
    expect(plan.ok).toBe(false);
    expect(plan.messageZh).toContain('节拍点不足');
    expect(plan.messageZh).toContain('2 拍');

    const strict = distributeSegmentBoundaries([1, 2, 3, 4, 5], 2, { minBeatsPerSegment: 3 });
    expect(strict.ok).toBe(false);
    expect(strict.messageZh).toContain('每段最少 3 拍');
  });

  it('单段：整段覆盖到末个节拍', () => {
    const plan = distributeSegmentBoundaries([1, 2, 3], 1);
    expect(plan.ok).toBe(true);
    expect(plan.boundaries).toEqual([0, 3]);
    expect(plan.durations).toEqual([3]);
    expect(plan.beatsPerSegment).toEqual([3]);
  });

  it('节拍过多 + 每段最多拍数：按可容纳的最小上限放宽并如实说明', () => {
    const many = Array.from({ length: 16 }, (_, i) => i + 1);
    const plan = distributeSegmentBoundaries(many, 2, { maxBeatsPerSegment: 4 });
    expect(plan.ok).toBe(true);
    expect(plan.relaxedMaxBeats).toBe(true);
    expect(plan.beatsPerSegment).toEqual([8, 8]);
    expect(plan.boundaries).toEqual([0, 8, 16]);
    expect(plan.messageZh).toContain('放宽');
  });

  it('每段最多拍数可满足时不放宽', () => {
    const plan = distributeSegmentBoundaries([1, 2, 3, 4, 5, 6, 7, 8], 4, { maxBeatsPerSegment: 3 });
    expect(plan.ok).toBe(true);
    expect(plan.relaxedMaxBeats).toBe(false);
    expect(plan.beatsPerSegment.reduce((a, b) => a + b, 0)).toBe(8);
  });

  it('分段数非法 / 起始秒之后无拍点 → ok:false，不抛异常', () => {
    expect(distributeSegmentBoundaries([1, 2, 3], 0).ok).toBe(false);
    expect(distributeSegmentBoundaries([1, 2, 3], -2).ok).toBe(false);
    expect(distributeSegmentBoundaries([1, 2, 3], Number.NaN).ok).toBe(false);
    const plan = distributeSegmentBoundaries([1, 2], 1, { startSec: 5 });
    expect(plan.ok).toBe(false);
    expect(plan.messageZh).toContain('没有节拍点');
  });

  it('sanitizeBeats：丢弃非有限 / 非正 / 重复点并升序；非数组输入返回空', () => {
    expect(sanitizeBeats([2, 1, 1, Number.NaN, -1, 0, Number.POSITIVE_INFINITY])).toEqual([1, 2]);
    expect(sanitizeBeats(null)).toEqual([]);
    expect(sanitizeBeats(undefined)).toEqual([]);
  });

  it('beatGridEndSec：优先显式 durationSec，否则末个节拍', () => {
    expect(beatGridEndSec({ ok: true, beats: [1, 2, 3] })).toBe(3);
    expect(beatGridEndSec({ ok: true, beats: [1, 2], durationSec: 9 })).toBe(9);
    expect(beatGridEndSec(null)).toBe(0);
  });
});

/* ────────────────────────── 共享纯函数：时间轴贴节拍 ────────────────────────── */

describe('snapTimelineToBeatGrid：均匀网格复用既有 snapMoveTimelineToBeats', () => {
  const uniform = gridOf([1, 2, 3, 4, 5, 6]);

  it('均匀节拍走既有吸附实现，结果与直接调用 snapMoveTimelineToBeats 一致（协同不冲突）', () => {
    const tl = timelineOf([[0, 1.5], [1.5, 3]]);
    const res = snapTimelineToBeatGrid(tl, uniform);

    expect(res.ok).toBe(true);
    expect(res.strategy).toBe('uniform-grid');
    expect(res.timeline.beatAligned).toBe(true);
    expect(res.timeline.segments.map((s) => [s.startT, s.endT])).toEqual([[0, 2], [2, 3]]);

    // 既有实现（secondsPerBeat=中位间隔）+ 回推时长，逐段一致
    const legacy = snapMoveTimelineToBeats(
      normalizeMoveTimeline(tl),
      { secondsPerBeat: 1, durationSec: 6 },
    );
    const legacyNormalized = normalizeMoveTimeline({ ...legacy, durationSec: 0 });
    expect(res.timeline.segments.map((s) => [s.startT, s.endT])).toEqual(
      legacyNormalized.segments.map((s) => [s.startT, s.endT]),
    );
    expect(res.timeline.durationSec).toBe(legacyNormalized.durationSec);
    expect(res.snappedSegments).toBe(2);
    expect(res.droppedSegments).toBe(0);
  });

  it('均匀但相位与真实节拍不符（拍点整体偏移 0.3s）→ 退回节拍点吸附，不假装对齐', () => {
    const tl = timelineOf([[0, 1], [1, 2]]);
    const res = snapTimelineToBeatGrid(tl, gridOf([0.3, 1.3, 2.3, 3.3]));
    expect(res.ok).toBe(true);
    expect(res.strategy).toBe('beat-points');
    // 1s / 2s 不是拍点（拍点在 1.3 / 2.3），改贴到最近的真实拍点上
    expect(res.timeline.segments.map((s) => [s.startT, s.endT])).toEqual([[0, 1.3], [1.3, 2.3]]);
  });
});

describe('snapTimelineToBeatGrid：非均匀网格与边界情形', () => {
  it('非均匀节拍按最近真实拍点吸附，总时长等于末个被用到的拍点', () => {
    const res = snapTimelineToBeatGrid(timelineOf([[0, 2], [2, 4]]), gridOf([0.9, 2.1, 2.8, 4.4]));
    expect(res.ok).toBe(true);
    expect(res.strategy).toBe('beat-points');
    expect(res.timeline.segments.map((s) => [s.startT, s.endT])).toEqual([[0, 2.1], [2.1, 4.4]]);
    expect(res.timeline.durationSec).toBe(4.4);
    expect(res.clippedSec).toBe(0);
  });

  it('网格比时间轴短 → 裁剪到网格末端并如实报告裁掉的秒数', () => {
    const res = snapTimelineToBeatGrid(timelineOf([[0, 2], [2, 4]]), gridOf([1, 2, 3]));
    expect(res.ok).toBe(true);
    expect(res.timeline.segments.map((s) => [s.startT, s.endT])).toEqual([[0, 2], [2, 3]]);
    expect(res.timeline.durationSec).toBe(3);
    expect(res.clippedSec).toBe(1);
    expect(res.messageZh).toContain('裁剪');
  });

  it('相邻边界吸到同一拍 → 零时长段被归一化丢弃并计数', () => {
    const res = snapTimelineToBeatGrid(
      timelineOf([[0, 0.5], [0.5, 1], [1, 3]]),
      gridOf([1, 2, 3]),
    );
    expect(res.ok).toBe(true);
    expect(res.timeline.segments).toHaveLength(2);
    expect(res.droppedSegments).toBe(1);
    expect(res.messageZh).toContain('时长为零');
  });

  it('网格不可用（ok:false）→ 原时间轴 + 透传原因', () => {
    const tl = timelineOf([[0, 2], [2, 4]]);
    const res = snapTimelineToBeatGrid(tl, { ok: false, beats: [], message: '未检测到 FFmpeg，禁止空成功' });
    expect(res.ok).toBe(false);
    expect(res.strategy).toBe('none');
    expect(res.messageZh).toBe('未检测到 FFmpeg，禁止空成功');
    expect(res.timeline.segments.map((s) => [s.startT, s.endT])).toEqual([[0, 2], [2, 4]]);
    expect(res.timeline.beatAligned).toBeFalsy();
  });

  it('ok:true 但网格为空 → 判定不可对齐', () => {
    const res = snapTimelineToBeatGrid(timelineOf([[0, 2]]), gridOf([]));
    expect(res.ok).toBe(false);
    expect(res.messageZh).toContain('节拍网格为空');
  });

  it('空时间轴 / 无节拍网格 → ok:false，不抛异常', () => {
    const res = snapTimelineToBeatGrid(timelineOf([]), gridOf([1, 2]));
    expect(res.ok).toBe(false);
    expect(res.messageZh).toContain('时间轴为空');

    const nullGrid = snapTimelineToBeatGrid(timelineOf([[0, 2]]), null);
    expect(nullGrid.ok).toBe(false);
    expect(nullGrid.messageZh).toContain('没有可用的节拍网格');
  });

  it('不改入参（纯函数）：原时间轴对象保持原样', () => {
    const tl = timelineOf([[0, 1.5], [1.5, 3]]);
    const before = JSON.stringify(tl);
    snapTimelineToBeatGrid(tl, gridOf([1, 2, 3, 4, 5, 6]));
    expect(JSON.stringify(tl)).toBe(before);
  });
});

/* ────────────────────────── 共享纯函数：多格时长 ────────────────────────── */

describe('planCellDurationsFromBeats：多格推演各格时长', () => {
  it('9 格 + 均匀 27 拍 → 每格 3 秒，切点落在拍点上', () => {
    const beats = Array.from({ length: 27 }, (_, i) => i + 1);
    const plan = planCellDurationsFromBeats(9, gridOf(beats));
    expect(plan.ok).toBe(true);
    expect(plan.usedFallback).toBe(false);
    expect(plan.durations).toEqual(Array.from({ length: 9 }, () => 3));
    expect(plan.boundaries).toEqual(Array.from({ length: 10 }, (_, i) => i * 3));
    expect(plan.totalSec).toBe(27);
    expect(plan.beatsPerCell.reduce((a, b) => a + b, 0)).toBe(27);
  });

  it('4 格 + 非均匀 8 拍 → 时长取自真实拍点差，非等分', () => {
    const plan = planCellDurationsFromBeats(4, gridOf([1, 2.5, 4, 5.5, 8, 9.5, 11, 12.5]));
    expect(plan.ok).toBe(true);
    expect(plan.boundaries).toEqual([0, 2.5, 5.5, 9.5, 12.5]);
    expect(plan.durations).toEqual([2.5, 3, 4, 3]);
    expect(plan.boundaries[plan.boundaries.length - 1]).toBe(12.5);
  });

  it('节拍不足 + fallbackSec → 用等长兜底但 ok:false 并说明「不是按节拍算的」', () => {
    const plan = planCellDurationsFromBeats(9, gridOf([1, 2]), { fallbackSec: 3 });
    expect(plan.ok).toBe(false);
    expect(plan.usedFallback).toBe(true);
    expect(plan.durations).toEqual(Array.from({ length: 9 }, () => 3));
    expect(plan.totalSec).toBe(27);
    expect(plan.messageZh).toContain('节拍点不足');
    expect(plan.messageZh).toContain('兜底');
  });

  it('节拍不可用且无兜底 → 返回空时长 + 原因', () => {
    const plan = planCellDurationsFromBeats(4, { ok: false, beats: [], message: '未检测到 FFmpeg' });
    expect(plan.ok).toBe(false);
    expect(plan.usedFallback).toBe(false);
    expect(plan.durations).toEqual([]);
    expect(plan.messageZh).toContain('未检测到 FFmpeg');
  });

  it('网格为 null 且有兜底 → 兜底并说明缺少分析', () => {
    const plan = planCellDurationsFromBeats(3, null, { fallbackSec: 2.5 });
    expect(plan.ok).toBe(false);
    expect(plan.usedFallback).toBe(true);
    expect(plan.durations).toEqual([2.5, 2.5, 2.5]);
    expect(plan.boundaries).toEqual([0, 2.5, 5, 7.5]);
    expect(plan.messageZh).toContain('没有可用的节拍网格');
  });

  it('格数非法 → ok:false，不抛异常', () => {
    const plan = planCellDurationsFromBeats(0, gridOf([1, 2, 3]), { fallbackSec: 3 });
    expect(plan.ok).toBe(false);
    expect(plan.cellCount).toBe(0);
    expect(plan.durations).toEqual([]);
    expect(plan.messageZh).toContain('格数需为正整数');
  });

  it('单格 → 整段到末个节拍', () => {
    const plan = planCellDurationsFromBeats(1, gridOf([1, 2, 3]));
    expect(plan.ok).toBe(true);
    expect(plan.durations).toEqual([3]);
    expect(plan.boundaries).toEqual([0, 3]);
  });
});
