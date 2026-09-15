import { describe, expect, it } from 'vitest';
import {
  applyTimelineOp,
  findTimelineClip,
  removeAnimKeyframe,
  sampleAnimKeyframes,
  sampleClipAnimation,
  sortAnimKeyframes,
  splitAnimKeyframes,
  upsertAnimKeyframe,
  type TimelineClip,
  type TimelinePayload,
  type TimelineTrack,
} from '@nx9/shared';
import { parseSrt } from '../srt-parse';

function clip(partial: Partial<TimelineClip> & { id: string }): TimelineClip {
  return {
    label: partial.id,
    startSec: 0,
    durationSec: 4,
    assetUrl: `/media/${partial.id}.mp4`,
    type: 'video',
    ...partial,
  };
}

function makeTimeline(tracks: TimelineTrack[]): TimelinePayload {
  const tl: TimelinePayload = {
    version: 3,
    title: 't',
    fps: 30,
    durationSec: 0,
    aspect: '9:16',
    width: 1080,
    height: 1920,
    tracks,
  };
  return tl;
}

describe('SE-EDIT-05: 关键帧动画采样', () => {
  it('线性插值 + 两端 clamp', () => {
    const kfs = [
      { atSec: 1, value: 0 },
      { atSec: 3, value: 100 },
    ];
    expect(sampleAnimKeyframes(kfs, 0, 0)).toBe(0); // 起点前 clamp
    expect(sampleAnimKeyframes(kfs, 2, 0)).toBe(50);
    expect(sampleAnimKeyframes(kfs, 5, 0)).toBe(100); // 终点后 clamp
  });

  it('缓动 ease-in 生效', () => {
    const kfs = [
      { atSec: 0, value: 0 },
      { atSec: 2, value: 10, ease: 'ease-in' as const },
    ];
    // ease-in: t=0.5 → 0.25 → value 2.5
    expect(sampleAnimKeyframes(kfs, 1, 0)).toBeCloseTo(2.5);
    // 线性对照：t=0.5 → 5
    const linear = [
      { atSec: 0, value: 0 },
      { atSec: 2, value: 10 },
    ];
    expect(sampleAnimKeyframes(linear, 1, 0)).toBeCloseTo(5);
  });

  it('打点去重与排序；删除后空数组归一为 undefined', () => {
    const kfs = upsertAnimKeyframe(undefined, 3, 0.5);
    const both = upsertAnimKeyframe(kfs, 1, 0.2);
    expect(sortAnimKeyframes(both).map((k) => k.atSec)).toEqual([1, 3]);
    const dup = upsertAnimKeyframe(both, 3, 0.8);
    expect(dup).toHaveLength(2);
    const removed = removeAnimKeyframe(dup, 1);
    expect(removed).toHaveLength(1);
    expect(removeAnimKeyframe(removed, 3)).toBeUndefined();
  });

  it('sampleClipAnimation 换算片段起点', () => {
    const c = clip({
      id: 'c1',
      startSec: 5,
      animations: {
        opacity: [
          { atSec: 0, value: 0 },
          { atSec: 2, value: 1 },
        ],
      },
    });
    expect(sampleClipAnimation(c, 'opacity', 5)).toBe(0);
    expect(sampleClipAnimation(c, 'opacity', 6)).toBe(0.5);
    expect(sampleClipAnimation(c, 'opacity', 7)).toBe(1);
    expect(sampleClipAnimation(c, 'scale', 6)).toBe(1); // 默认值
  });

  it('splitAnimKeyframes 按相对时间切开并补延续点', () => {
    const anims = {
      opacity: [
        { atSec: 0, value: 0 },
        { atSec: 2, value: 1 },
        { atSec: 4, value: 0.5 },
      ],
    };
    const { left, right } = splitAnimKeyframes(anims, 2);
    expect(left!.opacity!.map((k) => k.atSec)).toEqual([0, 2]);
    expect(right!.opacity!.map((k) => k.atSec)).toEqual([0, 2]); // 延续点 + 2s 处 0.5
    expect(right!.opacity![0].value).toBe(1);
    expect(right!.opacity![1].value).toBe(0.5);
  });

  it('split-clip 把动画一并切开', () => {
    const tl = makeTimeline([
      {
        id: 'V1',
        kind: 'video',
        clips: [
          clip({
            id: 'c1',
            durationSec: 4,
            animations: {
              opacity: [
                { atSec: 0, value: 0 },
                { atSec: 4, value: 1 },
              ],
            },
          }),
        ],
      },
    ]);
    const split = applyTimelineOp(tl, { op: 'split-clip', clipId: 'c1', atSec: 2, newClipId: 'c1b' });
    const left = findTimelineClip(split, 'c1')!.clip;
    const right = findTimelineClip(split, 'c1b')!.clip;
    expect(left.animations?.opacity?.map((k) => k.atSec)).toEqual([0, 2]);
    expect(right.animations?.opacity?.[0].atSec).toBe(0);
    expect(right.animations?.opacity?.[0].value).toBe(0.5); // 中点延续
    expect(right.animations?.opacity?.[1].value).toBe(1);
  });
});

describe('SE-EDIT-06: SRT 解析', () => {
  it('标准 SRT 解析出时间与文本', () => {
    const srt = `1
00:00:01,000 --> 00:00:03,500
你好世界

2
00:00:04,000 --> 00:00:06,250
第二行

3
00:00:07,000 --> 00:00:07,000
零时长（应丢弃）`;
    const cues = parseSrt(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 1, end: 3.5, text: '你好世界' });
    expect(cues[1].start).toBe(4);
    expect(cues[1].end).toBe(6.25);
  });

  it('容忍点号毫秒分隔与多余换行', () => {
    const cues = parseSrt('1\n00:00:00.500 --> 00:00:01.000\nA\n\n\n2\n00:00:02,000 --> 00:00:03,000\nB');
    expect(cues).toHaveLength(2);
    expect(cues[0].start).toBe(0.5);
  });

  it('空文本与非法块忽略', () => {
    expect(parseSrt('1\n00:00:01,000 --> 00:00:02,000\n   ')).toHaveLength(0);
    expect(parseSrt('垃圾内容')).toHaveLength(0);
    expect(parseSrt('')).toHaveLength(0);
  });
});
