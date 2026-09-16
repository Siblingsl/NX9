/**
 * 逐帧拉片：抽帧计划 / 反推合并 / 导出 纯函数回归。
 *
 * 与 multi-grid-plan.test.ts 相同：走相对路径直取 shared 源码，绕开 barrel 缺陷
 * （packages/shared/src/index.ts 指向的数据文件在本仓库存在既有缺陷，不能经 barrel 取源码）。
 */
import { describe, expect, it } from 'vitest';
import {
  FRAME_STUDY_MAX_COUNT,
  FRAME_STUDY_MAX_DURATION_SEC,
  FRAME_STUDY_MAX_INTERVAL_SEC,
  FRAME_STUDY_SERVER_INTERVALS,
  FRAME_STUDY_STRATEGIES,
  buildFrameStudyPlan,
  buildFrameStudyShotWritebackKey,
  describeFrameStudyPlan,
  extractFrameStudyCameraMoveLabel,
  extractFrameStudyShotSizeLabel,
  formatFrameStudyTimecode,
  frameStudyCountForServerInterval,
  frameStudyIdealTimecodes,
  frameStudyPipelineTimecodes,
  frameStudyRequestCount,
  frameStudyServerIntervalSec,
  frameStudyToStoryboardShots,
  isFrameStudyMode,
  lookupFrameStudyStrategy,
  mergeFrameStudyReversals,
  planFrameStudyShots,
  quantizeFrameStudyInterval,
  readFrameStudyMode,
  serializeFrameStudy,
  serializeFrameStudyCsv,
  serializeFrameStudyJson,
} from '../../../../../packages/shared/src/utils/frame-study-plan';
import type {
  FrameStudyMode,
  FrameStudyPlan,
  FrameStudyPlanInput,
  FrameStudyResult,
  FrameStudyReverseInput,
  FrameStudyWarningCode,
} from '../../../../../packages/shared/src/types/frame-study';

/* ────────────────────────── 工具 ────────────────────────── */

const plan = (input: Partial<FrameStudyPlanInput> & { mode: FrameStudyMode }) =>
  buildFrameStudyPlan({ durationSec: 10, value: 4, sourceUrl: '/media/videos/a.mp4', ...input });

const codes = (warnings: { code: FrameStudyWarningCode }[]): FrameStudyWarningCode[] =>
  warnings.map((w) => w.code);

const item = (
  index: number,
  extra: Partial<FrameStudyReverseInput> = {},
): FrameStudyReverseInput => ({
  index,
  thumbnailUrl: `/media/exports/frames-x/frame-${String(index + 1).padStart(3, '0')}.jpg`,
  reversePromptZh: `第 ${index + 1} 帧画面`,
  reversePromptEn: `frame ${index + 1}`,
  ...extra,
});

/* ────────────────────────── ① 抽帧管线口径（查档求证，不臆猜） ────────────────────────── */

describe('逐帧拉片：抽帧管线口径', () => {
  it('服务端间隔 = max(1, floor(30 / count))，与 fps=1/N 口径一致', () => {
    expect(frameStudyServerIntervalSec(1)).toBe(30);
    expect(frameStudyServerIntervalSec(2)).toBe(15);
    expect(frameStudyServerIntervalSec(3)).toBe(10);
    expect(frameStudyServerIntervalSec(4)).toBe(7);
    expect(frameStudyServerIntervalSec(8)).toBe(3);
    expect(frameStudyServerIntervalSec(10)).toBe(3);
    expect(frameStudyServerIntervalSec(15)).toBe(2);
    expect(frameStudyServerIntervalSec(30)).toBe(1);
    // count > 30 → floor(30/count) = 0 → 收敛到 1 秒/帧
    expect(frameStudyServerIntervalSec(60)).toBe(1);
  });

  it('可达间隔集合与 count 反查自洽', () => {
    for (const interval of FRAME_STUDY_SERVER_INTERVALS) {
      const count = frameStudyCountForServerInterval(interval);
      expect(frameStudyServerIntervalSec(count)).toBe(interval);
    }
    expect(FRAME_STUDY_SERVER_INTERVALS).toEqual([30, 15, 10, 7, 6, 5, 4, 3, 2, 1]);
    expect(Object.isFrozen(FRAME_STUDY_SERVER_INTERVALS)).toBe(true);
  });

  it('量化间隔取「不超过期望值」的可达间隔（采样密度不低于用户要求）', () => {
    expect(quantizeFrameStudyInterval(3)).toEqual({ intervalSec: 3, count: 10, quantized: false });
    expect(quantizeFrameStudyInterval(2)).toEqual({ intervalSec: 2, count: 15, quantized: false });
    // 1s 间隔在 count=16..60 都成立，取最大 count → 同间隔下覆盖更长
    expect(quantizeFrameStudyInterval(1)).toEqual({ intervalSec: 1, count: 60, quantized: false });
    expect(quantizeFrameStudyInterval(8)).toEqual({ intervalSec: 7, count: 4, quantized: true });
    expect(quantizeFrameStudyInterval(12)).toEqual({ intervalSec: 10, count: 3, quantized: true });
    // 小于 1 秒不可达 → 收敛到 1 秒（最密）
    expect(quantizeFrameStudyInterval(0.5)).toEqual({ intervalSec: 1, count: 60, quantized: true });
    // 超过上限 → 收敛到 30 秒（最粗）
    expect(quantizeFrameStudyInterval(120)).toEqual({ intervalSec: 30, count: 1, quantized: true });
  });

  it('frameStudyRequestCount：按张数取张数，按间隔先量化再换算', () => {
    expect(frameStudyRequestCount('count', 8)).toBe(8);
    expect(frameStudyRequestCount('count', 999)).toBe(FRAME_STUDY_MAX_COUNT);
    expect(frameStudyRequestCount('count', 0)).toBe(1);
    expect(frameStudyRequestCount('interval', 3)).toBe(10);
    expect(frameStudyRequestCount('interval', 8)).toBe(4);
  });

  it('管线时间码 = k × 间隔，并按视频时长裁掉超出片尾的网格点', () => {
    expect(frameStudyPipelineTimecodes(8, 40)).toEqual([0, 3, 6, 9, 12, 15, 18, 21]);
    // 时长 20s：网格第 8 点 t=21 超过片尾 → 只到 18
    expect(frameStudyPipelineTimecodes(8, 20)).toEqual([0, 3, 6, 9, 12, 15, 18]);
    // 时长 10s / count=4 → 间隔 7 → 只剩 t=0 与 7
    expect(frameStudyPipelineTimecodes(4, 10)).toEqual([0, 7]);
    // 时长已知但比首个网格点还短 → 仍给 t=0（不返回空数组）
    expect(frameStudyPipelineTimecodes(4, 0.5)).toEqual([0]);
    // 时长未知：整条网格都保留
    expect(frameStudyPipelineTimecodes(4, null)).toEqual([0, 7, 14, 21]);
  });
});

/* ────────────────────────── ② 策略口径：等距 + 首尾边界 ────────────────────────── */

describe('逐帧拉片：等距时间码与首尾边界', () => {
  it('按张数：等分整段且含首尾两帧（t=0 与 t=duration）', () => {
    expect(frameStudyIdealTimecodes('count', 4, 10, 4)).toEqual([0, 3.333, 6.667, 10]);
    expect(frameStudyIdealTimecodes('count', 2, 10, 2)).toEqual([0, 10]);
    // n=1 只有一帧，落在 0（不编造中间点）
    expect(frameStudyIdealTimecodes('count', 1, 10, 1)).toEqual([0]);
  });

  it('按张数：时长未知时排不出时间码（返回空，而不是猜）', () => {
    expect(frameStudyIdealTimecodes('count', 4, null, 4)).toEqual([]);
  });

  it('按间隔：自 0 等距；末点距片尾 ≥ 半格时补片尾边界帧', () => {
    // 10s / 3s → 0,3,6,9；片尾余 1s < 1.5s → 不补
    expect(frameStudyIdealTimecodes('interval', 3, 10, 10)).toEqual([0, 3, 6, 9]);
    // 10s / 4s → 0,4,8；片尾余 2s ≥ 2s → 补 10
    expect(frameStudyIdealTimecodes('interval', 4, 10, 10)).toEqual([0, 4, 8, 10]);
    // 时长未知：按帧数上限铺点（由告警说明不保证覆盖片尾）
    expect(frameStudyIdealTimecodes('interval', 3, null, 4)).toEqual([0, 3, 6, 9]);
  });

  it('按间隔：帧数受上限截断', () => {
    const long = frameStudyIdealTimecodes('interval', 1, 600, FRAME_STUDY_MAX_COUNT);
    expect(long).toHaveLength(FRAME_STUDY_MAX_COUNT);
    expect(long[0]).toBe(0);
    expect(long[long.length - 1]).toBe(FRAME_STUDY_MAX_COUNT - 1);
  });
});

/* ────────────────────────── ③ 计划：边界与告警 ────────────────────────── */

describe('逐帧拉片：计划边界与结构化告警', () => {
  it('按张数：计划带上真实管线口径（请求张数 / 间隔 / 时间码 / 覆盖）', () => {
    const p = plan({ mode: 'count', value: 8, durationSec: 40 });
    expect(p.requestedCount).toBe(8);
    expect(p.serverIntervalSec).toBe(3);
    expect(p.timeSec).toEqual([0, 3, 6, 9, 12, 15, 18, 21]);
    expect(p.idealTimeSec).toEqual([0, 5.714, 11.429, 17.143, 22.857, 28.571, 34.286, 40]);
    expect(p.coverageSec).toBe(21);
    expect(p.timeSecKnown).toBe(true);
    expect(p.durationSec).toBe(40);
    expect(p.aspectRatio).toBe('16:9');
    expect(codes(p.warnings)).toContain('sampling-not-even');
    // 片尾 40s 只覆盖到 21s，缺口 19s ≥ 一个间隔 3s
    expect(codes(p.warnings)).toContain('coverage-partial');
  });

  it('count=1：单帧落在 t=0，且如实告警「间隔大于时长」', () => {
    const p = plan({ mode: 'count', value: 1, durationSec: 10 });
    expect(p.requestedCount).toBe(1);
    expect(p.serverIntervalSec).toBe(FRAME_STUDY_MAX_INTERVAL_SEC);
    expect(p.timeSec).toEqual([0]);
    expect(p.idealTimeSec).toEqual([0]);
    // 10s 视频只能抽到 1 帧（请求 1 帧，不算短缺）
    expect(codes(p.warnings)).toContain('interval-exceeds-duration');
    expect(codes(p.warnings)).not.toContain('sampling-not-even');
  });

  it('超长张数 / 超长间隔 → 收敛并告警，不抛异常', () => {
    const p1 = plan({ mode: 'count', value: 9999, durationSec: 30 });
    expect(p1.requestedCount).toBe(FRAME_STUDY_MAX_COUNT);
    expect(p1.value).toBe(FRAME_STUDY_MAX_COUNT);
    expect(p1.rawValue).toBe(9999);
    expect(codes(p1.warnings)).toContain('count-clamped');

    const p2 = plan({ mode: 'interval', value: 999, durationSec: 30 });
    expect(p2.value).toBe(FRAME_STUDY_MAX_INTERVAL_SEC);
    expect(p2.rawValue).toBe(999);
    expect(codes(p2.warnings)).toContain('interval-clamped');
  });

  it('间隔大于时长 → 只剩 t=0 一帧，并同时告警片尾未覆盖', () => {
    const p = plan({ mode: 'interval', value: 15, durationSec: 10 });
    expect(p.value).toBe(15);
    expect(p.requestedCount).toBe(2);
    expect(p.timeSec).toEqual([0]);
    expect(p.idealTimeSec).toEqual([0, 10]);
    expect(codes(p.warnings)).toContain('interval-exceeds-duration');
    expect(codes(p.warnings)).toContain('coverage-partial');
    expect(codes(p.warnings)).toContain('sampling-not-even');
  });

  it('时长 0 / 负数 / 非数字 → 结构化告警，时间码不编造', () => {
    const zero = plan({ mode: 'count', value: 4, durationSec: 0 });
    expect(zero.durationSec).toBeNull();
    expect(zero.timeSecKnown).toBe(false);
    expect(zero.idealTimeSec).toEqual([]);
    expect(codes(zero.warnings)).toContain('duration-zero');

    const negative = plan({ mode: 'count', value: 4, durationSec: -3 });
    expect(negative.durationSec).toBeNull();
    expect(codes(negative.warnings)).toContain('duration-zero');

    const nan = plan({ mode: 'count', value: 4, durationSec: Number.NaN });
    expect(nan.durationSec).toBeNull();
    expect(codes(nan.warnings)).toContain('duration-unknown');
  });

  it('时长未知 → 网格时间码仍给出，但明确告警帧数可能少于计划', () => {
    const p = plan({ mode: 'interval', value: 3, durationSec: undefined });
    expect(p.durationSec).toBeNull();
    expect(p.timeSecKnown).toBe(false);
    expect(p.timeSec).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 24, 27]);
    expect(p.requestedCount).toBe(10);
    expect(codes(p.warnings)).toContain('duration-unknown');
    // 时长未知时不谎称「等分口径与实际落点不一致」
    expect(codes(p.warnings)).not.toContain('sampling-not-even');
  });

  it('时长超长 → 只告警不裁剪（等距时间码仍成立）', () => {
    const p = plan({ mode: 'count', value: 3, durationSec: FRAME_STUDY_MAX_DURATION_SEC + 600 });
    expect(p.durationSec).toBe(FRAME_STUDY_MAX_DURATION_SEC + 600);
    expect(codes(p.warnings)).toContain('duration-too-long');
    expect(p.idealTimeSec).toEqual([0, (FRAME_STUDY_MAX_DURATION_SEC + 600) / 2, FRAME_STUDY_MAX_DURATION_SEC + 600]);
  });

  it('间隔型：整段需要更多帧但一次请求给不满 → frame-count-clamped', () => {
    const p = plan({ mode: 'interval', value: 3, durationSec: 120 });
    // 量化后间隔 3s → count 10；整段 120s 每 3s 需要 41 帧
    expect(p.requestedCount).toBe(10);
    expect(codes(p.warnings)).toContain('frame-count-clamped');
    expect(p.coverageSec).toBe(27);
  });

  it('非法 / 空输入不抛异常，回落到默认策略并告警', () => {
    const junk = buildFrameStudyPlan(undefined as unknown as FrameStudyPlanInput);
    expect(junk.mode).toBe('count');
    expect(junk.value).toBe(FRAME_STUDY_STRATEGIES[0]!.defaultValue);
    expect(junk.durationSec).toBeNull();
    expect(codes(junk.warnings)).toContain('duration-unknown');

    const weird = buildFrameStudyPlan({
      mode: 'nope' as unknown as FrameStudyMode,
      value: Number.POSITIVE_INFINITY,
      durationSec: Number.POSITIVE_INFINITY,
    } as FrameStudyPlanInput);
    expect(weird.mode).toBe('count');
    expect(Number.isFinite(weird.requestedCount)).toBe(true);
    expect(weird.durationSec).toBeNull();
  });

  it('策略读取：非法值回落按张数', () => {
    expect(isFrameStudyMode('interval')).toBe(true);
    expect(isFrameStudyMode('count')).toBe(true);
    expect(isFrameStudyMode('x')).toBe(false);
    expect(readFrameStudyMode(undefined)).toBe('count');
    expect(readFrameStudyMode('interval')).toBe('interval');
    expect(lookupFrameStudyStrategy('interval').label).toBe('按间隔');
  });

  it('计划摘要：含时间码清单与告警，空计划有明确文案', () => {
    const p = plan({ mode: 'count', value: 8, durationSec: 40 });
    const text = describeFrameStudyPlan(p);
    expect(text).toContain('逐帧拉片');
    expect(text).toContain('#1 00:00.000');
    expect(text).toContain('00:21.000');
    expect(text).toContain('⚠');
    expect(describeFrameStudyPlan(null)).toContain('抽帧计划不可用');
  });

  it('时间码格式化：mm:ss.mmm / hh:mm:ss.mmm / 未知', () => {
    expect(formatFrameStudyTimecode(0)).toBe('00:00.000');
    expect(formatFrameStudyTimecode(6)).toBe('00:06.000');
    expect(formatFrameStudyTimecode(65.5)).toBe('01:05.500');
    expect(formatFrameStudyTimecode(3725.25)).toBe('01:02:05.250');
    expect(formatFrameStudyTimecode(undefined)).toBe('未知时间码');
    expect(formatFrameStudyTimecode(-1)).toBe('未知时间码');
  });
});

/* ────────────────────────── ④ 反推合并 ────────────────────────── */

describe('逐帧拉片：反推合并', () => {
  const p = plan({ mode: 'count', value: 4, durationSec: 40 });
  // 间隔 7s → 计划时间码 [0, 7, 14, 21]

  it('正常合并：按帧号归位，时间码取管线落点', () => {
    const merged = mergeFrameStudyReversals(p, [item(0), item(1), item(2), item(3)]);
    expect(merged.ok).toBe(true);
    expect(merged.frameCount).toBe(4);
    expect(merged.reversedCount).toBe(4);
    expect(merged.items.map((i) => i.timeSec)).toEqual([0, 7, 14, 21]);
    expect(merged.items[2]!.reversePromptZh).toBe('第 3 帧画面');
    expect(merged.warnings).toEqual([]);
    expect(merged.messageZh).toContain('全部拿到反推提示词');
  });

  it('乱序输入结果一致（按帧号归位，不按数组顺序）', () => {
    const shuffled = [item(3), item(0), item(2), item(1)];
    const merged = mergeFrameStudyReversals(p, shuffled);
    expect(merged.items.map((i) => i.reversePromptZh)).toEqual([
      '第 1 帧画面',
      '第 2 帧画面',
      '第 3 帧画面',
      '第 4 帧画面',
    ]);
    expect(merged.warnings).toEqual([]);
  });

  it('缺帧：条目保留、字段留空并告警，不编造图与提示词', () => {
    const merged = mergeFrameStudyReversals(p, [item(0), item(2)]);
    expect(merged.items).toHaveLength(4);
    expect(merged.frameCount).toBe(2);
    expect(merged.items[1]!.thumbnailUrl).toBeUndefined();
    expect(merged.items[1]!.reversePromptZh).toBeUndefined();
    expect(merged.items[1]!.notes).toContain('没有帧图');
    expect(codes(merged.warnings)).toContain('missing-frame');
    expect(merged.messageZh).toContain('2/4 帧有帧图');
    expect(merged.messageZh).toContain('2 帧拿到反推提示词');
  });

  it('多余帧 / 非法帧号：丢弃并告警，不塞进别的帧', () => {
    const merged = mergeFrameStudyReversals(p, [
      item(0),
      item(4),
      item(99),
      { index: -1, thumbnailUrl: '/x.jpg' },
      { index: 1.5, thumbnailUrl: '/y.jpg' },
      { thumbnailUrl: '/z.jpg' } as unknown as FrameStudyReverseInput,
    ]);
    expect(merged.items).toHaveLength(4);
    expect(merged.frameCount).toBe(1);
    expect(codes(merged.warnings)).toContain('out-of-range-result');
    expect(codes(merged.warnings)).toContain('missing-frame');
  });

  it('重复帧号：首次出现者生效，其余丢弃并告警', () => {
    const merged = mergeFrameStudyReversals(p, [
      item(1, { reversePromptZh: '先到' }),
      item(1, { reversePromptZh: '后到' }),
    ]);
    expect(merged.items[1]!.reversePromptZh).toBe('先到');
    expect(codes(merged.warnings)).toContain('duplicate-result');
  });

  it('有图但没反推文本 → 留空并告警；带 error → 写进备注并计失败', () => {
    const merged = mergeFrameStudyReversals(p, [
      { index: 0, thumbnailUrl: '/media/a.jpg' },
      { index: 1, thumbnailUrl: '/media/b.jpg', error: '视觉通道超时' },
    ]);
    expect(merged.items[0]!.reversePromptZh).toBeUndefined();
    expect(merged.items[0]!.notes).toBeUndefined();
    expect(merged.items[1]!.notes).toContain('视觉通道超时');
    expect(codes(merged.warnings)).toContain('missing-reversal');
    expect(codes(merged.warnings)).toContain('reverse-failed');
    // 有图就算拿到帧，ok=true（反推失败不冒充成功，但帧是真的）
    expect(merged.ok).toBe(true);
    expect(merged.frameCount).toBe(2);
    expect(merged.reversedCount).toBe(0);
  });

  it('一帧都没有 → ok=false 且给真实原因（禁止空成功）', () => {
    const empty = mergeFrameStudyReversals(p, []);
    expect(empty.ok).toBe(false);
    expect(empty.frameCount).toBe(0);
    expect(empty.items).toHaveLength(4);
    expect(empty.messageZh).toContain('未返回任何帧');

    const noUrl = mergeFrameStudyReversals(p, [
      { index: 0, reversePromptZh: '有提示词但没图' },
    ]);
    expect(noUrl.ok).toBe(false);
    expect(noUrl.frameCount).toBe(0);
    // 提示词来自调用方（不是编造的），照实保留并计数；但没有任何帧图 → ok 仍为 false
    expect(noUrl.reversedCount).toBe(1);
    expect(noUrl.items[0]!.thumbnailUrl).toBeUndefined();
    expect(noUrl.messageZh).toContain('未对上');
  });

  it('计划不可用 → 不抛异常，返回 invalid-plan', () => {
    const bad = mergeFrameStudyReversals(null, [item(0)]);
    expect(bad.ok).toBe(false);
    expect(codes(bad.warnings)).toContain('invalid-plan');
    expect(mergeFrameStudyReversals({} as FrameStudyPlan, [item(0)]).ok).toBe(false);
  });

  it('时长未知：合并层补告警说明帧数可能少于计划', () => {
    const unknown = plan({ mode: 'interval', value: 3, durationSec: undefined });
    const merged = mergeFrameStudyReversals(unknown, [item(0), item(1)]);
    expect(codes(merged.warnings)).toContain('duration-unknown');
    expect(merged.frameCount).toBe(2);
  });

  it('景别 / 运镜：结果自带值优先，缺省时从反推文本字面提取', () => {
    const merged = mergeFrameStudyReversals(p, [
      item(0, { reversePromptZh: '中景，人物居中', cameraMoveLabel: '推' }),
      item(1, { reversePromptZh: 'close-up shot of a hand', reversePromptEn: 'close-up shot' }),
      item(2, { reversePromptZh: '全景，城市夜景', reversePromptEn: 'wide shot, panning right' }),
      item(3, { reversePromptZh: '没有任何景别词的画面' }),
    ]);
    expect(merged.items[0]!.shotSizeLabel).toBe('中景');
    expect(merged.items[0]!.cameraMoveLabel).toBe('推');
    expect(merged.items[1]!.shotSizeLabel).toBe('特写');
    expect(merged.items[2]!.shotSizeLabel).toBe('全景');
    expect(merged.items[2]!.cameraMoveLabel).toBe('摇');
    expect(merged.items[3]!.shotSizeLabel).toBeUndefined();
    expect(merged.items[3]!.cameraMoveLabel).toBeUndefined();
  });
});

/* ────────────────────────── ⑤ 字面标签提取（不推断） ────────────────────────── */

describe('逐帧拉片：景别 / 运镜字面提取', () => {
  it('景别：只认完整景别词', () => {
    expect(extractFrameStudyShotSizeLabel('中景')).toBe('中景');
    expect(extractFrameStudyShotSizeLabel('medium shot of a man')).toBe('中景');
    expect(extractFrameStudyShotSizeLabel('extreme close-up')).toBe('特写');
    expect(extractFrameStudyShotSizeLabel('大远景，天地开阔')).toBe('大远景');
    // bare 形容词不算命中
    expect(extractFrameStudyShotSizeLabel('a wide-angle lens')).toBeUndefined();
    expect(extractFrameStudyShotSizeLabel('close to the window')).toBeUndefined();
    expect(extractFrameStudyShotSizeLabel('')).toBeUndefined();
    expect(extractFrameStudyShotSizeLabel(undefined, null)).toBeUndefined();
  });

  it('运镜：命中值一律落在拆镜枚举 固定/推/拉/摇/移/跟/手持', () => {
    const allowed = ['固定', '推', '拉', '摇', '移', '跟', '手持'];
    for (const text of [
      'camera pans across the room',
      'slow push in on the face',
      'dolly out to reveal the street',
      'handheld, shaky',
      'locked off static shot',
      '跟拍人物穿过走廊',
      '固定机位，人物走动',
      '横移镜头',
    ]) {
      const hit = extractFrameStudyCameraMoveLabel(text);
      expect(hit).toBeDefined();
      expect(allowed).toContain(hit!);
    }
  });

  it('运镜：整词匹配，不让 pan 命中 panorama（避免误标）', () => {
    expect(extractFrameStudyCameraMoveLabel('a 360-degree panorama of the bay')).toBeUndefined();
    expect(extractFrameStudyCameraMoveLabel('Japanese interior')).toBeUndefined();
    expect(extractFrameStudyCameraMoveLabel('没有运镜词')).toBeUndefined();
  });
});

/* ────────────────────────── ⑥ 拉片表 → 分镜镜头 ────────────────────────── */

describe('逐帧拉片：送分镜', () => {
  const p = plan({ mode: 'count', value: 4, durationSec: 40 });
  const merged = mergeFrameStudyReversals(p, [
    item(0, { reversePromptZh: '中景，人物居中', reversePromptEn: 'medium shot, character centered' }),
    item(1, { reversePromptEn: 'close-up shot of a hand' }),
    item(2, { reversePromptZh: '全景，城市夜景' }),
    item(3, { reversePromptZh: '特写，眼睛' }),
  ]);

  it('逐帧生成镜头：序号续接、时长按相邻帧时间差、首帧与景别按字面口径', () => {
    const shots = frameStudyToStoryboardShots(p, merged);
    expect(shots).toHaveLength(4);
    expect(shots.map((s) => s.index)).toEqual([1, 2, 3, 4]);
    // 相邻帧时间差 = 7s（最后一条没有下一帧 → 回落抽帧间隔 7s）
    expect(shots.map((s) => s.durationSec)).toEqual([7, 7, 7, 7]);
    expect(shots[0]!.shotType).toBe('medium');
    expect(shots[1]!.shotType).toBe('close');
    expect(shots[2]!.shotType).toBe('wide');
    expect(shots[3]!.shotType).toBe('close');
    expect(shots[0]!.firstFrameAssetId).toBe('/media/exports/frames-x/frame-001.jpg');
    expect(shots[0]!.status).toBe('review');
    expect(shots[0]!.keyframeStatus).toBe('review');
    expect(shots[0]!.descriptionZh).toContain('00:00.000');
    expect(shots[2]!.descriptionZh).toContain('00:14.000');
    expect(shots[0]!.notes).toContain('时间码按抽帧管线实际落点标注');
    expect(shots[0]!.notes).toContain('第 1/4 帧');
    expect(shots[1]!.videoPromptEn).toContain('close-up shot of a hand');
    expect(shots[1]!.cameraMove).toBeUndefined();
  });

  it('缺帧图 → firstFrameAssetId 留空 + draft，并告警', () => {
    const partial = mergeFrameStudyReversals(p, [item(0)]);
    const res = planFrameStudyShots(p, partial);
    expect(res.ok).toBe(true);
    expect(res.shots[1]!.firstFrameAssetId).toBeNull();
    expect(res.shots[1]!.status).toBe('draft');
    expect(codes(res.warnings)).toContain('missing-frame');
  });

  it('上游无镜表 → 序号从 1 起并如实告警（不假装续号成功）', () => {
    const res = planFrameStudyShots(p, merged);
    expect(res.startIndex).toBe(1);
    expect(res.nextIndex).toBe(5);
    expect(codes(res.warnings)).toContain('invalid-plan');
  });

  it('上游有镜表 → 序号与分集续接', () => {
    const res = planFrameStudyShots(p, merged, {
      upstreamShots: [
        {
          id: 's1',
          episodeId: 'ep1',
          episodeIndex: 1,
          episodeTitle: '第一集',
          index: 3,
          durationSec: 3,
          shotType: 'medium',
          descriptionZh: '',
          promptEn: '',
          status: 'draft',
        },
      ],
      episodeId: 'ep1',
    });
    expect(res.startIndex).toBe(4);
    expect(res.nextIndex).toBe(8);
    expect(res.shots[0]!.episodeId).toBe('ep1');
    expect(res.shots[0]!.episodeTitle).toBe('第一集');
    expect(codes(res.warnings)).not.toContain('invalid-plan');
  });

  it('镜头时长覆盖：统一时长与 1–120s 收敛', () => {
    const shots = frameStudyToStoryboardShots(p, merged, { defaultDurationSec: 999 });
    expect(shots.every((s) => s.durationSec === 120)).toBe(true);
    const short = frameStudyToStoryboardShots(p, merged, { defaultDurationSec: 2 });
    expect(short.every((s) => s.durationSec === 2)).toBe(true);
  });

  it('防重键：同计划同批镜头必同键；镜头变化则换键', () => {
    const res1 = planFrameStudyShots(p, merged);
    const res2 = planFrameStudyShots(p, merged);
    expect(res1.key).toBeTruthy();
    expect(res1.key).toBe(res2.key);
    expect(res1.key.startsWith('fsw-')).toBe(true);
    const edited = mergeFrameStudyReversals(p, [item(0, { reversePromptZh: '改写过的第 1 帧' }), item(1), item(2), item(3)]);
    expect(planFrameStudyShots(p, edited).key).not.toBe(res1.key);
    expect(buildFrameStudyShotWritebackKey(p, res1.shots)).toBe(res1.key);
  });

  it('空拉片表 / 坏计划 → 不生成空镜头并给中文原因', () => {
    const empty = planFrameStudyShots(p, mergeFrameStudyReversals(p, []));
    expect(empty.ok).toBe(false);
    expect(empty.shots).toEqual([]);
    expect(empty.summaryZh).toContain('没有任何帧图');
    const bad = planFrameStudyShots(null, merged);
    expect(bad.ok).toBe(false);
    expect(bad.shots).toEqual([]);
  });

  it('摘要与预览行复用既有宫格口径', () => {
    const res = planFrameStudyShots(p, merged);
    expect(res.summaryZh).toContain('将新增 4 个镜头');
    expect(res.summaryZh).toContain('#1');
  });
});

/* ────────────────────────── ⑦ 导出 ────────────────────────── */

describe('逐帧拉片：导出', () => {
  const p = plan({ mode: 'count', value: 3, durationSec: 30 });
  const merged = mergeFrameStudyReversals(p, [
    item(0, { reversePromptZh: '中景，"引号"，逗号', reversePromptEn: 'medium shot, "quoted"' }),
    { index: 1, thumbnailUrl: '/media/exports/x/frame-002.jpg', error: '视觉通道超时' },
  ]);

  it('JSON 导出：字段完整、可被解析、时间码为字符串', () => {
    const text = serializeFrameStudyJson(p, merged);
    const parsed = JSON.parse(text) as {
      sourceUrl: string;
      frameCount: number;
      items: { index: number; timeSec: number | null; timecode: string | null }[];
    };
    expect(parsed.sourceUrl).toBe('/media/videos/a.mp4');
    expect(parsed.frameCount).toBe(2);
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items[0]!.timeSec).toBe(0);
    expect(parsed.items[0]!.timecode).toBe('00:00.000');
    // 按张数 3 帧 → 服务端间隔 10s → 网格 [0, 10, 20]
    expect(parsed.items[1]!.timeSec).toBe(10);
    expect(parsed.items[2]!.timeSec).toBe(20);
  });

  it('CSV 导出：带 BOM、表头完整、引号与逗号正确转义', () => {
    const text = serializeFrameStudyCsv(p, merged);
    expect(text.startsWith('\uFEFF')).toBe(true);
    const lines = text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean);
    expect(lines[0]).toContain('源视频');
    expect(lines[1]).toBe('帧号,时间码,秒,帧图地址,中文提示词,英文提示词,景别,运镜,备注');
    expect(lines[2]).toContain('"中景，""引号""，逗号"');
    expect(lines[2]).toContain('"medium shot, ""quoted"""');
    // 失败帧的备注在 CSV 里可见
    expect(lines[3]).toContain('视觉通道超时');
    expect(serializeFrameStudyCsv(p, merged, { includeBom: false }).startsWith('\uFEFF')).toBe(false);
  });

  it('导出入口按格式分发；空结果也不抛异常', () => {
    expect(serializeFrameStudy('csv', p, merged).startsWith('\uFEFF')).toBe(true);
    expect(serializeFrameStudy('json', p, merged).startsWith('{')).toBe(true);
    expect(() => serializeFrameStudy('csv', null, null)).not.toThrow();
    expect(() => serializeFrameStudy('json', null, null)).not.toThrow();
    expect(serializeFrameStudy('json', null, null)).toContain('"items"');
  });
});

/* ────────────────────────── ⑧ 结果对象可序列化 ────────────────────────── */

describe('逐帧拉片：纯数据可序列化', () => {
  it('计划与拉片表均可 JSON 往返', () => {
    const p = plan({ mode: 'interval', value: 3, durationSec: 33, aspectRatio: '9:16' });
    const merged: FrameStudyResult = mergeFrameStudyReversals(p, [item(0), item(1)]);
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
    expect(JSON.parse(JSON.stringify(merged))).toEqual(merged);
    expect(merged.plan.aspectRatio).toBe('9:16');
  });

  it('同输入必同输出（确定性，无时间戳 / 无随机）', () => {
    const a = plan({ mode: 'count', value: 5, durationSec: 17 });
    const b = plan({ mode: 'count', value: 5, durationSec: 17 });
    expect(a).toEqual(b);
    const ra = planFrameStudyShots(a, mergeFrameStudyReversals(a, [item(0)]));
    const rb = planFrameStudyShots(b, mergeFrameStudyReversals(b, [item(0)]));
    expect(ra.shots).toEqual(rb.shots);
    expect(ra.key).toBe(rb.key);
  });
});
