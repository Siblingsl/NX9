/**
 * 运镜时间轴编排（增量新增能力）回归。
 *
 * 注意：本文件 import 走**相对路径直取源码**，而不是 '@nx9/shared'。
 * 原因：`packages/shared/src/index.ts` 目前引用了若干尚不存在的 data/* 模块（既有缺陷），
 * 走 barrel 会解析失败；相对路径只依赖运镜库 / prompt-presets / 时间轴两个新模块，与缺陷解耦。
 */
import { describe, expect, it } from 'vitest';
import {
  CAMERA_MOVE_SEGMENT_MIN_SEC,
  applyMoveEasing,
  applyMoveSpeedRamp,
  buildComposedMovePrompt,
  formatMoveSeconds,
  isMoveTimelineBeatAligned,
  lookupSegmentMove,
  moveSegmentProgress,
  moveTimelineAmplitudeCurve,
  moveTimelineFromShotDuration,
  moveTimelineToPromptPreset,
  moveTimelineTotalAmplitude,
  normalizeMoveTimeline,
  sampleMoveTimelineAt,
  segmentLabelZh,
  snapMoveTimelineToBeats,
  validateMoveTimeline,
  withMoveTimelinePrompt,
} from '../../../../../packages/shared/src/utils/camera-move-timeline';
import {
  buildCameraMovePrompt,
  lookupCameraMove,
  withCameraMovePrompt,
  CAMERA_MOVE_PROMPT_PREFIX_EN,
} from '../../../../../packages/shared/src/data/camera-move-library';
import {
  CAMERA_MOVE_EASINGS,
  CAMERA_MOVE_TIMELINE_VERSION,
} from '../../../../../packages/shared/src/types/camera-move-timeline';
import type {
  CameraMoveSegment,
  CameraMoveTimeline,
} from '../../../../../packages/shared/src/types/camera-move-timeline';

/** 词库实体的中英短语（避免把提示词文案硬编码进测试，断言与词库保持一致） */
function def(id: string) {
  const d = lookupCameraMove(id);
  if (!d) throw new Error('测试前置失败：运镜词库缺少 ' + id);
  return d;
}

/** 找出子串在文本中的位置（找不到返回 -1，便于做顺序断言） */
function at(text: string, needle: string): number {
  return text.indexOf(needle);
}

const CJK = /[\u4e00-\u9fa5]/;

function tl(durationSec: number, segments: CameraMoveSegment[]): CameraMoveTimeline {
  return { version: CAMERA_MOVE_TIMELINE_VERSION, durationSec, segments };
}

function seg(
  id: string,
  moveId: string,
  startT: number,
  endT: number,
  extra: Partial<CameraMoveSegment> = {},
): CameraMoveSegment {
  return { id, moveId, startT, endT, ...extra };
}

/** 提示词里运镜行的条数（英文/中文前缀都算） */
function moveLineCount(text: string): number {
  return text
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return t.toLowerCase().startsWith('camera movement:') || t.startsWith('运镜：');
    }).length;
}

describe('normalizeMoveTimeline：裁剪 / 排序 / 补齐', () => {
  it('按 startT 升序重排，并保持原对象不被修改', () => {
    const input = tl(6, [seg('b', 'pan-slow', 3, 6), seg('a', 'push-slow', 0, 3)]);
    const snapshot = JSON.stringify(input);
    const out = normalizeMoveTimeline(input);
    expect(out.segments.map((s) => s.id)).toEqual(['a', 'b']);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('把越界片段裁剪进 [0, durationSec]，并丢弃裁空的片段', () => {
    const out = normalizeMoveTimeline(
      tl(5, [
        seg('early', 'push-slow', -2, 1),
        seg('late', 'pan-slow', 3, 9),
        seg('outside', 'orbit-180', 7, 9),
      ]),
    );
    expect(out.segments.map((s) => s.id)).toEqual(['early', 'late']);
    expect(out.segments[0].startT).toBe(0);
    expect(out.segments[1].endT).toBe(5);
    expect(out.durationSec).toBe(5);
  });

  it('补齐缺失的 id / 幅度 / 缓动 / 速度曲线，并钳制合法范围内的非法幅度', () => {
    const out = normalizeMoveTimeline(
      tl(4, [
        { id: '', moveId: 'push-slow', startT: 0, endT: 1.5, amplitude: -3 },
        { id: 'x', moveId: 'pan-slow', startT: 1.5, endT: 2.5, amplitude: 99 },
        { id: 'y', moveId: 'pull-slow', startT: 2.5, endT: 4, amplitude: 0.001 },
      ]) as CameraMoveTimeline,
    );
    expect(out.segments.map((s) => s.id)).toEqual(['seg-1', 'seg-2', 'seg-3']);
    // 非正数视为非法 → 回落默认 1；超上限 → 钳到 4；低于下限 → 钳到 0.05
    expect(out.segments[0].amplitude).toBe(1);
    expect(out.segments[1].amplitude).toBe(4);
    expect(out.segments[2].amplitude).toBe(0.05);
    expect(out.segments[0].easing).toBe('linear');
    expect(out.segments[0].speedRamp).toBe('steady');
  });

  it('id 重复时整体重编为 seg-1..n，保持时间顺序', () => {
    const out = normalizeMoveTimeline(
      tl(4, [seg('dup', 'push-slow', 0, 2), seg('dup', 'pan-slow', 2, 4)]),
    );
    expect(out.segments.map((s) => s.id)).toEqual(['seg-1', 'seg-2']);
  });

  it('重叠片段保留先出现者、裁剪后者的起点；完全被覆盖的片段丢弃', () => {
    const out = normalizeMoveTimeline(
      tl(6, [
        seg('a', 'push-slow', 0, 4),
        seg('b', 'pan-slow', 2, 5),
        seg('c', 'orbit-180', 3, 4),
      ]),
    );
    expect(out.segments.map((s) => s.id)).toEqual(['a', 'b']);
    expect(out.segments[1].startT).toBe(4);
    expect(out.segments[1].endT).toBe(5);
  });

  it('非有限时间与零时长片段被丢弃（不编造时长）', () => {
    const out = normalizeMoveTimeline(
      tl(5, [
        seg('nan', 'push-slow', Number.NaN, 2),
        seg('inf', 'pan-slow', 1, Number.POSITIVE_INFINITY),
        seg('zero', 'orbit-180', 2, 2),
        seg('ok', 'pull-slow', 0, 2),
      ]),
    );
    expect(out.segments.map((s) => s.id)).toEqual(['ok']);
  });

  it('durationSec 优先级：opts 覆盖 > 输入合法值 > 片段最大 endT', () => {
    expect(normalizeMoveTimeline(tl(9, [seg('a', 'push-slow', 0, 2)]), { durationSec: 3 }).durationSec).toBe(3);
    expect(normalizeMoveTimeline(tl(9, [seg('a', 'push-slow', 0, 2)])).durationSec).toBe(9);
    expect(normalizeMoveTimeline(tl(0, [seg('a', 'push-slow', 0, 2)])).durationSec).toBe(2);
  });

  it('接受裸片段数组与空输入，均返回可序列化结果', () => {
    const out = normalizeMoveTimeline([seg('a', 'push-slow', 0, 2)], { durationSec: 2 });
    expect(out.version).toBe(CAMERA_MOVE_TIMELINE_VERSION);
    expect(out.durationSec).toBe(2);
    const empty = normalizeMoveTimeline(null);
    expect(empty.segments).toEqual([]);
    expect(JSON.parse(JSON.stringify(empty))).toEqual(empty);
  });
});

describe('validateMoveTimeline：结构化问题，不抛异常', () => {
  it('合法时间轴 ok=true 且无问题', () => {
    const v = validateMoveTimeline(tl(6, [seg('a', 'push-slow', 0, 3), seg('b', 'orbit-180', 3, 6)]));
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
  });

  it('空轨 / 非法时长 → error，且不抛异常', () => {
    expect(validateMoveTimeline(null).errors.map((e) => e.code)).toContain('invalid-duration');
    expect(validateMoveTimeline(tl(0, [])).errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(['invalid-duration', 'empty']),
    );
    expect(() => validateMoveTimeline({} as CameraMoveTimeline)).not.toThrow();
  });

  it('未知运镜 id / 零时长 / 越界 / 负起点 / 非有限时间 → 各自 error 码', () => {
    const v = validateMoveTimeline(
      tl(5, [
        seg('unknown', 'not-a-real-move', 0, 1),
        seg('zero', 'push-slow', 1, 1),
        seg('over', 'pan-slow', 4, 8),
        seg('neg', 'orbit-180', -1, 0.5),
        seg('nan', 'pull-slow', Number.NaN, 2),
      ]),
    );
    const codes = v.errors.map((e) => e.code);
    expect(codes).toContain('unknown-move');
    expect(codes).toContain('zero-duration');
    expect(codes).toContain('out-of-range');
    expect(codes).toContain('negative-start');
    expect(codes).toContain('invalid-time');
    expect(v.ok).toBe(false);
    // 每条问题都带中文说明，可直接展示
    for (const e of v.errors) expect(CJK.test(e.messageZh)).toBe(true);
  });

  it('重叠 → error；未排序 / 空隙 / 未覆盖 → warning', () => {
    const overlap = validateMoveTimeline(tl(6, [seg('a', 'push-slow', 0, 4), seg('b', 'pan-slow', 2, 6)]));
    expect(overlap.errors.map((e) => e.code)).toContain('overlap');

    const unsorted = validateMoveTimeline(tl(6, [seg('b', 'pan-slow', 3, 6), seg('a', 'push-slow', 0, 3)]));
    expect(unsorted.warnings.map((w) => w.code)).toContain('unsorted');
    expect(unsorted.ok).toBe(true);

    const gap = validateMoveTimeline(tl(6, [seg('a', 'push-slow', 1, 2), seg('b', 'pan-slow', 3, 6)]));
    expect(gap.warnings.map((w) => w.code)).toContain('gap');
    expect(gap.warnings.map((w) => w.code)).toContain('uncovered');
  });

  it('重复 id → error；幅度非法 → error，幅度超建议区间 → warning', () => {
    const dup = validateMoveTimeline(tl(4, [seg('same', 'push-slow', 0, 2), seg('same', 'pan-slow', 2, 4)]));
    expect(dup.errors.map((e) => e.code)).toContain('duplicate-id');

    const amp = validateMoveTimeline(
      tl(4, [
        seg('bad', 'push-slow', 0, 2, { amplitude: 0 }),
        seg('wide', 'pan-slow', 2, 4, { amplitude: 20 }),
      ]),
    );
    expect(amp.errors.filter((e) => e.code === 'invalid-amplitude')).toHaveLength(1);
    expect(amp.warnings.filter((e) => e.code === 'invalid-amplitude')).toHaveLength(1);
  });

  it('issues 汇总顺序为 errors 在前，且与 errors/warnings 内容一致', () => {
    const v = validateMoveTimeline(tl(6, [seg('a', 'push-slow', 1, 2), seg('b', 'pan-slow', 3, 9)]));
    expect(v.issues).toEqual([...v.errors, ...v.warnings]);
    expect(v.ok).toBe(false);
  });
});

describe('sampleMoveTimelineAt：边界与进度', () => {
  const timeline = tl(6, [
    seg('a', 'push-slow', 0, 3),
    seg('b', 'orbit-180', 4, 6, { easing: 'linear' }),
  ]);

  it('t=0 命中首段，进度 0', () => {
    const s = sampleMoveTimelineAt(timeline, 0);
    expect(s.segment?.id).toBe('a');
    expect(s.linearProgress).toBe(0);
    expect(s.progress).toBe(0);
    expect(s.inGap).toBe(false);
    expect(s.clamped).toBe(false);
  });

  it('段中点 → 进度 0.5（线性）', () => {
    const s = sampleMoveTimelineAt(timeline, 1.5);
    expect(s.segment?.id).toBe('a');
    expect(s.linearProgress).toBeCloseTo(0.5, 6);
    expect(s.progress).toBeCloseTo(0.5, 6);
    expect(s.overallProgress).toBeCloseTo(0.25, 6);
  });

  it('末点 t=durationSec 命中末段且进度 1（末段覆盖到时长）', () => {
    const s = sampleMoveTimelineAt(timeline, 6);
    expect(s.segment?.id).toBe('b');
    expect(s.linearProgress).toBe(1);
    expect(s.progress).toBe(1);
    expect(s.overallProgress).toBe(1);
  });

  it('越界：负数钳到 0，超过时长钳到时长，并标记 clamped', () => {
    const low = sampleMoveTimelineAt(timeline, -5);
    expect(low.t).toBe(0);
    expect(low.clamped).toBe(true);
    expect(low.segment?.id).toBe('a');

    const high = sampleMoveTimelineAt(timeline, 99);
    expect(high.t).toBe(6);
    expect(high.clamped).toBe(true);
    expect(high.segment?.id).toBe('b');
    expect(high.progress).toBe(1);
  });

  it('落在空隙：segment=null、inGap=true、幅度 0，但整体进度仍按时间给', () => {
    const s = sampleMoveTimelineAt(timeline, 3.5);
    expect(s.segment).toBeNull();
    expect(s.inGap).toBe(true);
    expect(s.amplitude).toBe(0);
    expect(s.progress).toBe(0);
    expect(s.overallProgress).toBeCloseTo(3.5 / 6, 6);
  });

  it('组合运动描述按时间顺序、中英齐备，并标注当前段进度', () => {
    const s = sampleMoveTimelineAt(timeline, 1.5);
    expect(CJK.test(s.composedZh)).toBe(true);
    expect(s.composedZh).toContain(def('push-slow').labelZh);
    expect(s.composedZh).toContain('50%');
    expect(s.composedZh).toContain(def('orbit-180').labelZh);
    expect(s.composedEn).toContain(def('push-slow').labelEn);
    expect(s.composedEn).toContain('50%');
    expect(at(s.composedEn, def('push-slow').labelEn)).toBeLessThan(
      at(s.composedEn, def('orbit-180').labelEn),
    );
    // 已执行段打 ✓、未开始段打 ·，当前段用括号 + 进度
    expect(s.composedEn).toContain('[');
    expect(s.composedEn).toContain('·' + def('orbit-180').labelEn);
    const done = sampleMoveTimelineAt(timeline, 5);
    expect(done.composedEn).toContain(def('push-slow').labelEn + '✓');
    expect(done.composedEn).toContain('[' + def('orbit-180').labelEn);
  });

  it('空时间轴 / durationSec=0 不抛异常，返回空采样', () => {
    const s = sampleMoveTimelineAt(null, 1);
    expect(s.segment).toBeNull();
    expect(s.composedZh).toBe('');
    expect(s.overallProgress).toBe(0);
    const zero = sampleMoveTimelineAt(tl(0, []), 1);
    expect(zero.segment).toBeNull();
  });

  it('乱序输入会被内部归一化，采样结果与正序一致', () => {
    const a = sampleMoveTimelineAt(timeline, 1.5);
    const b = sampleMoveTimelineAt(tl(6, [seg('b', 'orbit-180', 4, 6), seg('a', 'push-slow', 0, 3)]), 1.5);
    expect(b.segment?.id).toBe(a.segment?.id);
    expect(b.progress).toBeCloseTo(a.progress, 6);
  });

  it('缓动与速度曲线确实改变段内进度（单调不减）', () => {
    const easeIn = sampleMoveTimelineAt(tl(4, [seg('a', 'push-slow', 0, 4, { easing: 'ease-in' })]), 2);
    expect(easeIn.progress).toBeCloseTo(0.25, 6);
    const ramp = sampleMoveTimelineAt(
      tl(4, [seg('a', 'push-slow', 0, 4, { easing: 'linear', speedRamp: 'decelerate' })]),
      2,
    );
    expect(ramp.progress).toBeCloseTo(0.75, 6);

    let prev = -1;
    for (let i = 0; i <= 40; i += 1) {
      const t = i / 10;
      const p = sampleMoveTimelineAt(
        tl(4, [seg('a', 'push-slow', 0, 4, { easing: 'ease-in-out', speedRamp: 'accelerate' })]),
        t,
      ).progress;
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    expect(prev).toBe(1);
  });

  it('幅度取当前段的 amplitude（默认 1），未知 moveId 不丢段', () => {
    const s = sampleMoveTimelineAt(tl(4, [seg('a', 'push-slow', 0, 4, { amplitude: 2 })]), 1);
    expect(s.amplitude).toBe(2);
    const unknown = sampleMoveTimelineAt(tl(4, [seg('a', 'ghost-move', 0, 4)]), 1);
    expect(unknown.segment?.moveId).toBe('ghost-move');
    expect(unknown.composedZh).toContain('ghost-move');
  });
});

describe('缓动 / 速度曲线基础函数', () => {
  it('四个缓动值都单调不减且端点固定', () => {
    for (const easing of CAMERA_MOVE_EASINGS) {
      expect(applyMoveEasing(0, easing)).toBe(0);
      expect(applyMoveEasing(1, easing)).toBe(1);
      let prev = -1;
      for (let i = 0; i <= 20; i += 1) {
        const v = applyMoveEasing(i / 20, easing);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        prev = v;
      }
      expect(prev).toBe(1);
    }
    expect(applyMoveEasing(0.5, 'ease-in')).toBeCloseTo(0.25, 6);
    expect(applyMoveEasing(0.5, 'ease-out')).toBeCloseTo(0.75, 6);
    expect(applyMoveEasing(0.5, 'ease-in-out')).toBeCloseTo(0.5, 6);
  });

  it('速度曲线：加速前段更慢、减速前段更快、匀速等价', () => {
    expect(applyMoveSpeedRamp(0.5, 'accelerate')).toBeCloseTo(0.25, 6);
    expect(applyMoveSpeedRamp(0.5, 'decelerate')).toBeCloseTo(0.75, 6);
    expect(applyMoveSpeedRamp(0.5, 'steady')).toBeCloseTo(0.5, 6);
    expect(moveSegmentProgress(0.5, 'ease-in', 'accelerate')).toBeCloseTo(0.0625, 6);
  });

  it('越界与非法输入被钳制而不是返回 NaN', () => {
    expect(applyMoveEasing(-3, 'ease-in-out')).toBe(0);
    expect(applyMoveEasing(9, 'ease-in-out')).toBe(1);
    expect(moveSegmentProgress(Number.NaN, 'linear', 'steady')).toBe(0);
  });
});

describe('组合提示词：顺序 / 中英 / 时长节拍', () => {
  const timeline = tl(
    6,
    [
      seg('a', 'push-slow', 0, 2),
      seg('b', 'orbit-180', 2, 4, { amplitude: 1.5, speedRamp: 'decelerate' }),
      seg('c', 'pull-reveal', 4, 6),
    ],
  );
  const beat = { ...timeline, beatAligned: true };

  it('按时间顺序输出中英组合描述，含每段起止与总时长', () => {
    const c = buildComposedMovePrompt(timeline);
    expect(c.segmentCount).toBe(3);
    expect(c.durationSec).toBe(6);
    // 短语直接取词库，避免把提示词文案硬编码进断言
    expect(at(c.en, def('push-slow').promptEn)).toBeGreaterThanOrEqual(0);
    expect(at(c.en, def('push-slow').promptEn)).toBeLessThan(at(c.en, def('orbit-180').promptEn));
    expect(at(c.en, def('orbit-180').promptEn)).toBeLessThan(at(c.en, def('pull-reveal').promptEn));
    expect(c.en).toContain('0-2s');
    expect(c.en).toContain('total 6s');
    expect(c.en).toContain('1.5x amplitude');
    expect(c.en).toContain('gradually decelerating');
    expect(CJK.test(c.zh)).toBe(true);
    expect(c.zh).toContain(def('push-slow').promptZh);
    expect(c.zh).toContain('共 6 秒');
    expect(c.text).toBe(c.en);
    expect(buildComposedMovePrompt(timeline, { lang: 'zh' }).text).toBe(c.zh);
    expect(buildComposedMovePrompt(timeline, { lang: 'both' }).text).toContain(c.en);
  });

  it('parts 保留词库名、短语、缓动与速度曲线，供 UI 复用', () => {
    const c = buildComposedMovePrompt(timeline);
    expect(c.parts.map((p) => p.moveId)).toEqual(['push-slow', 'orbit-180', 'pull-reveal']);
    expect(c.parts[0].labelZh).toBe('缓推');
    expect(CJK.test(c.parts[0].phraseZh)).toBe(true);
    expect(c.parts[1].speedRamp).toBe('decelerate');
    expect(c.parts[1].amplitude).toBe(1.5);
    expect(c.parts.map((p) => p.startT)).toEqual([0, 2, 4]);
  });

  it('节拍对齐会写入描述；includeTiming=false 时只留运镜短语', () => {
    expect(buildComposedMovePrompt(beat).en).toContain('beat-aligned');
    const bare = buildComposedMovePrompt(timeline, { includeTiming: false });
    expect(bare.en).not.toContain('total');
    expect(bare.en).not.toContain('0-2s');
    expect(bare.en).toContain(def('push-slow').promptEn);
  });

  it('乱序 / 越界输入先归一化，顺序仍与时间一致', () => {
    const c = buildComposedMovePrompt(
      tl(6, [seg('c', 'pull-reveal', 4, 9), seg('a', 'push-slow', -1, 2), seg('b', 'orbit-180', 2, 4)]),
    );
    expect(c.parts.map((p) => p.moveId)).toEqual(['push-slow', 'orbit-180', 'pull-reveal']);
    expect(c.parts[2].endT).toBe(6);
  });

  it('未知 moveId 不被丢弃（提示词与编排保持一致）', () => {
    const c = buildComposedMovePrompt(tl(4, [seg('a', 'ghost-move', 0, 2), seg('b', 'push-slow', 2, 4)]));
    expect(c.segmentCount).toBe(2);
    expect(c.en).toContain('ghost-move');
    expect(c.zh).toContain('ghost-move');
  });

  it('空时间轴 → 空描述（注入时可据此清空运镜行）', () => {
    const c = buildComposedMovePrompt(null);
    expect(c.text).toBe('');
    expect(c.segmentCount).toBe(0);
  });

  it('moveTimelineToPromptPreset 产出既有 PromptPreset 形状', () => {
    const preset = moveTimelineToPromptPreset(timeline);
    expect(preset.id).toBe('camera-move-timeline');
    expect(preset.group).toBe('运镜时间轴');
    expect(preset.label).toContain('3 段');
    expect(preset.text).toBe(buildComposedMovePrompt(timeline).en);
  });
});

describe('与既有 buildCameraMovePrompt / withCameraMovePrompt 协同不冲突', () => {
  const timeline = tl(4, [seg('a', 'push-slow', 0, 2), seg('b', 'orbit-180', 2, 4)]);

  it('时间轴注入只占一条运镜行，替换既有行而不是叠加', () => {
    const seeded = `${withCameraMovePrompt('主体描述', ['pan-slow'], { lang: 'en' })}`;
    expect(moveLineCount(seeded)).toBe(1);
    const injected = withMoveTimelinePrompt(seeded, timeline, { lang: 'en' });
    expect(moveLineCount(injected)).toBe(1);
    expect(injected).toContain(CAMERA_MOVE_PROMPT_PREFIX_EN);
    expect(injected).toContain('主体描述');
    expect(injected).not.toContain(def('pan-slow').promptEn);
    // 多行主体内容原样保留
    expect(withMoveTimelinePrompt('A\n\nB\n', timeline).startsWith('A\n\nB')).toBe(true);
  });

  it('大师运镜多选可以反过来替换时间轴行（同一槽位），不残留第二条', () => {
    const injected = withMoveTimelinePrompt('主体描述', timeline, { lang: 'en' });
    const afterPicker = withCameraMovePrompt(injected, ['pan-slow'], { lang: 'en' });
    expect(moveLineCount(afterPicker)).toBe(1);
    expect(afterPicker).toContain(def('pan-slow').promptEn);
    expect(afterPicker).not.toContain(def('orbit-180').promptEn);
    expect(afterPicker).toBe(withCameraMovePrompt('主体描述', ['pan-slow'], { lang: 'en' }));
  });

  it('清空时间轴 / 空运镜选择都会移走运镜行', () => {
    const injected = withMoveTimelinePrompt('主体描述', timeline, { lang: 'zh' });
    expect(moveLineCount(injected)).toBe(1);
    expect(injected).toContain('运镜：');
    const cleared = withMoveTimelinePrompt(injected, null, { lang: 'zh' });
    expect(moveLineCount(cleared)).toBe(0);
    expect(cleared.trim()).toBe('主体描述');
    expect(buildCameraMovePrompt([])).toBe('');
  });

  it('两者生成的片段本身都是「无前缀短语」，不会被误判成运镜行', () => {
    const fragment = buildComposedMovePrompt(timeline).text;
    expect(fragment.toLowerCase().startsWith('camera movement:')).toBe(false);
    expect(fragment.startsWith('运镜：')).toBe(false);
  });
});

describe('按时长铺开 / 节拍对齐', () => {
  it('moveTimelineFromShotDuration 铺满镜头时长且顺序不变', () => {
    const out = moveTimelineFromShotDuration(8, ['push-slow', 'orbit-180', 'pull-reveal']);
    expect(out.durationSec).toBe(8);
    expect(out.segments.map((s) => s.moveId)).toEqual(['push-slow', 'orbit-180', 'pull-reveal']);
    expect(out.segments[0].startT).toBe(0);
    expect(out.segments[out.segments.length - 1].endT).toBeCloseTo(8, 9);
    expect(validateMoveTimeline(out).ok).toBe(true);
    // 权重来自 durationHintSec 中值：快推(推镜)与全环绕时长不同 → 段长不同
    const durations = out.segments.map((s) => s.endT - s.startT);
    expect(durations.reduce((a, b) => a + b, 0)).toBeCloseTo(8, 9);
  });

  it('显式 weight 覆盖词库提示权重，且保持连续无空隙', () => {
    const out = moveTimelineFromShotDuration(10, [
      { moveId: 'push-slow', weight: 1 },
      { moveId: 'orbit-180', weight: 3 },
    ]);
    const [a, b] = out.segments;
    expect(a.endT - a.startT).toBeCloseTo(2.5, 9);
    expect(b.endT - b.startT).toBeCloseTo(7.5, 9);
    expect(a.endT).toBe(b.startT);
    expect(b.endT).toBeCloseTo(10, 9);
  });

  it('非法时长 / 空运镜列表 → 空时间轴（不编造时长）', () => {
    expect(moveTimelineFromShotDuration(0, ['push-slow']).segments).toEqual([]);
    expect(moveTimelineFromShotDuration(Number.NaN, ['push-slow']).segments).toEqual([]);
    expect(moveTimelineFromShotDuration(6, []).segments).toEqual([]);
  });

  it('startAt 偏移会把首段推到指定秒数之后', () => {
    const out = moveTimelineFromShotDuration(6, ['push-slow', 'orbit-180'], { startAt: 1 });
    expect(out.segments[0].startT).toBe(1);
    expect(out.segments[out.segments.length - 1].endT).toBeCloseTo(6, 9);
  });

  it('beatCount 铺开后边界吸附到节拍网格并标记 beatAligned', () => {
    const out = moveTimelineFromShotDuration(8, ['push-slow', 'orbit-180', 'pull-reveal'], {
      beatCount: 4,
      useDurationHints: false,
    });
    expect(out.beatAligned).toBe(true);
    for (const s of out.segments) {
      expect(Number.isInteger(Math.round(s.startT / 2))).toBe(true);
      expect(Math.abs(s.startT / 2 - Math.round(s.startT / 2))).toBeLessThan(1e-9);
      expect(Math.abs(s.endT / 2 - Math.round(s.endT / 2))).toBeLessThan(1e-9);
    }
    expect(isMoveTimelineBeatAligned(out, { beatCount: 4 })).toBe(true);
  });

  it('snapMoveTimelineToBeats：吸附后仍合法，缺节拍信息时不假装对齐', () => {
    const snapped = snapMoveTimelineToBeats(tl(8, [seg('a', 'push-slow', 0, 3), seg('b', 'orbit-180', 3, 8)]), 4);
    expect(snapped.beatAligned).toBe(true);
    expect(snapped.segments.map((s) => [s.startT, s.endT])).toEqual([
      [0, 4],
      [4, 8],
    ]);
    expect(validateMoveTimeline(snapped).ok).toBe(true);

    const noBeat = snapMoveTimelineToBeats(tl(8, [seg('a', 'push-slow', 0, 4)]));
    expect(noBeat.beatAligned).toBe(false);
    expect(isMoveTimelineBeatAligned(noBeat)).toBe(false);
  });

  it('吸附产生的零时长片段被丢弃（不留下 0 秒段）', () => {
    const snapped = snapMoveTimelineToBeats(
      tl(4, [seg('a', 'push-slow', 0, 0.4), seg('b', 'orbit-180', 0.5, 4)]),
      2,
    );
    expect(snapped.segments.every((s) => s.endT - s.startT >= CAMERA_MOVE_SEGMENT_MIN_SEC)).toBe(true);
  });
});

describe('总幅度 / 曲线 / 其它纯函数', () => {
  it('moveTimelineTotalAmplitude 是时间加权平均，空隙按 0 计', () => {
    expect(moveTimelineTotalAmplitude(tl(4, [seg('a', 'push-slow', 0, 4)]))).toBeCloseTo(1, 9);
    expect(moveTimelineTotalAmplitude(tl(4, [seg('a', 'push-slow', 0, 4, { amplitude: 2 })]))).toBeCloseTo(2, 9);
    // 只覆盖一半时长 → 平均幅度减半
    expect(moveTimelineTotalAmplitude(tl(4, [seg('a', 'push-slow', 0, 2)]))).toBeCloseTo(0.5, 9);
    expect(moveTimelineTotalAmplitude(null)).toBe(0);
    expect(moveTimelineTotalAmplitude(tl(0, [seg('a', 'push-slow', 0, 0)]))).toBe(0);
  });

  it('moveTimelineAmplitudeCurve 给 UI 提供幅度包络 + 节拍刻度', () => {
    const curve = moveTimelineAmplitudeCurve(tl(4, [seg('a', 'push-slow', 0, 4, { amplitude: 2 })]), {
      samples: 9,
      secondsPerBeat: 1,
    });
    expect(curve.points).toHaveLength(9);
    expect(curve.points[0].t).toBe(0);
    expect(curve.points[8].t).toBe(4);
    expect(curve.maxAmplitude).toBe(2);
    expect(curve.points.every((p) => p.amplitude === 2)).toBe(true);
    expect(curve.beatMarks).toEqual([1, 2, 3, 4]);
    // 进度曲线单调不减
    for (let i = 1; i < curve.points.length; i += 1) {
      expect(curve.points[i].progress).toBeGreaterThanOrEqual(curve.points[i - 1].progress);
    }
    expect(moveTimelineAmplitudeCurve(null).points.every((p) => p.amplitude === 0)).toBe(true);
  });

  it('lookupSegmentMove / segmentLabelZh 对未知 id 回落到 id 本身', () => {
    expect(lookupSegmentMove(seg('a', 'push-slow', 0, 1))?.labelZh).toBe('缓推');
    expect(lookupSegmentMove(seg('a', 'ghost', 0, 1))).toBeUndefined();
    expect(segmentLabelZh(seg('a', 'ghost', 0, 1))).toBe('ghost');
  });

  it('formatMoveSeconds 去掉多余小数 0', () => {
    expect(formatMoveSeconds(2)).toBe('2');
    expect(formatMoveSeconds(1.5)).toBe('1.5');
    expect(formatMoveSeconds(1.234)).toBe('1.23');
    expect(formatMoveSeconds(Number.NaN)).toBe('0');
  });
});
