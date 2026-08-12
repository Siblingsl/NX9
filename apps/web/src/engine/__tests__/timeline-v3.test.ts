import { describe, expect, it } from 'vitest';
import {
  applyTimelineOp,
  applyTimelineOps,
  calibrateTimelineWithDurations,
  computeTimelineDuration,
  findTimelineClip,
  migrateTimelinePayload,
  nextTrackId,
  buildTimelineFromShotsV2,
  MIN_CLIP_SEC,
  sampleClipVolume,
  type TimelineClip,
  type TimelinePayload,
  type TimelineTrack,
} from '@nx9/shared';

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
  return { ...tl, durationSec: computeTimelineDuration(tl) };
}

describe('timeline v3 迁移', () => {
  it('遗留三套轨道 ID 统一为 V/A/S/O 规范并修正 kind', () => {
    const legacy: TimelinePayload = {
      version: 2,
      title: '漫剧成片',
      fps: 30,
      durationSec: 0,
      aspect: '9:16',
      width: 1080,
      height: 1920,
      tracks: [
        { id: 'video-1', kind: 'video', clips: [clip({ id: 'v1', durationSec: 5 })] },
        { id: 'video-2', kind: 'video', clips: [clip({ id: 'ov1', type: 'overlay' })] },
        {
          id: 'subtitle-1',
          kind: 'video',
          clips: [clip({ id: 's1', type: 'subtitle', assetUrl: '', text: '你好' })],
        },
        { id: 'A1', kind: 'audio', clips: [clip({ id: 'a1', type: 'audio' })] },
        { id: 'track-bgm', kind: 'audio', clips: [clip({ id: 'bgm', type: 'audio', durationSec: 12 })] },
      ],
    };
    const m = migrateTimelinePayload(legacy);
    expect(m.version).toBe(3);
    expect(m.tracks.map((t) => t.id)).toEqual(['V1', 'O1', 'S1', 'A1', 'A2']);
    expect(m.tracks.map((t) => t.kind)).toEqual(['video', 'overlay', 'subtitle', 'audio', 'audio']);
    expect(m.tracks[4].label).toBe('BGM');
    // durationSec 按内容重算：BGM 12s 最长
    expect(m.durationSec).toBe(12);
  });

  it('爆款链 V1 保持不变且幂等', () => {
    const viral = makeTimeline([
      { id: 'V1', kind: 'video', clips: [clip({ id: 'c1', durationSec: 3 })] },
    ]);
    const once = migrateTimelinePayload({ ...viral, version: 2 });
    expect(once.tracks[0].id).toBe('V1');
    const twice = migrateTimelinePayload(once);
    expect(twice).toBe(once);
  });

  it('buildTimelineFromShotsV2 直接产 v3 规范轨道', () => {
    const tl = buildTimelineFromShotsV2(
      [
        {
          id: 's1',
          index: 1,
          durationSec: 4,
          descriptionZh: '开场',
          videoAssetId: '/media/a.mp4',
          audioAssetId: '/media/a.mp3',
          subtitleText: '开场',
        },
      ],
      '测试',
    );
    expect(tl.version).toBe(3);
    const ids = tl.tracks.map((t) => t.id);
    expect(ids).toContain('V1');
    expect(ids).toContain('A1');
    expect(ids).toContain('S1');
    expect(tl.tracks.find((t) => t.id === 'S1')?.kind).toBe('subtitle');
  });
});

describe('timeline ops', () => {
  const base = () =>
    makeTimeline([
      {
        id: 'V1',
        kind: 'video',
        clips: [
          clip({ id: 'c1', startSec: 0, durationSec: 4, sourceDurationSec: 6 }),
          clip({ id: 'c2', startSec: 4, durationSec: 4 }),
          clip({ id: 'c3', startSec: 8, durationSec: 2 }),
        ],
      },
      { id: 'A1', kind: 'audio', label: 'BGM', clips: [clip({ id: 'bgm', type: 'audio', durationSec: 10 })] },
    ]);

  it('trim 右边缘受素材真实时长约束', () => {
    const tl = applyTimelineOp(base(), { op: 'trim-clip', clipId: 'c1', edge: 'end', deltaSec: 10 });
    // source 6s，trimIn 0 → 上限 6s
    expect(findTimelineClip(tl, 'c1')!.clip.durationSec).toBe(6);
  });

  it('trim 左边缘写 trimInSec 并同步 startSec', () => {
    const tl = applyTimelineOp(base(), { op: 'trim-clip', clipId: 'c2', edge: 'start', deltaSec: 1.5 });
    const c2 = findTimelineClip(tl, 'c2')!.clip;
    expect(c2.startSec).toBe(5.5);
    expect(c2.durationSec).toBe(2.5);
    expect(c2.trimInSec).toBe(1.5);
  });

  it('trim 不能越过最小时长', () => {
    const tl = applyTimelineOp(base(), { op: 'trim-clip', clipId: 'c3', edge: 'end', deltaSec: -10 });
    expect(findTimelineClip(tl, 'c3')!.clip.durationSec).toBe(MIN_CLIP_SEC);
  });

  it('split 在片段内部一分为二并派生 trimIn', () => {
    const tl = applyTimelineOp(base(), { op: 'split-clip', clipId: 'c1', atSec: 1.5 });
    const track = tl.tracks[0];
    expect(track.clips).toHaveLength(4);
    const left = track.clips[0];
    const right = track.clips[1];
    expect(left.id).toBe('c1');
    expect(left.durationSec).toBe(1.5);
    expect(right.startSec).toBe(1.5);
    expect(right.durationSec).toBe(2.5);
    expect(right.trimInSec).toBe(1.5);
  });

  it('split 落在边缘时拒绝', () => {
    const tl = base();
    expect(applyTimelineOp(tl, { op: 'split-clip', clipId: 'c1', atSec: 0 })).toBe(tl);
    expect(applyTimelineOp(tl, { op: 'split-clip', clipId: 'c1', atSec: 4 })).toBe(tl);
  });

  it('remove ripple 后续片段前移，总时长重算', () => {
    const tl = applyTimelineOp(base(), { op: 'remove-clip', clipId: 'c2', ripple: true });
    const track = tl.tracks[0];
    expect(track.clips.map((c) => c.id)).toEqual(['c1', 'c3']);
    expect(findTimelineClip(tl, 'c3')!.clip.startSec).toBe(4);
    expect(tl.durationSec).toBe(10); // BGM 10s 仍是最长
  });

  it('move-clip 跨轨仅允许同 kind', () => {
    const tl0 = applyTimelineOp(base(), {
      op: 'add-track',
      track: { id: 'V2', kind: 'video', clips: [] },
    });
    const moved = applyTimelineOp(tl0, { op: 'move-clip', clipId: 'c3', startSec: 0, toTrackId: 'V2' });
    expect(moved.tracks.find((t) => t.id === 'V2')!.clips.map((c) => c.id)).toEqual(['c3']);
    // 移到 audio 轨被拒绝
    const rejected = applyTimelineOp(tl0, { op: 'move-clip', clipId: 'c3', startSec: 0, toTrackId: 'A1' });
    expect(rejected.tracks.find((t) => t.id === 'A1')!.clips.map((c) => c.id)).toEqual(['bgm']);
  });

  it('set-transition 全局作用于视频轨衔接处（末段除外）', () => {
    const tl = applyTimelineOp(base(), {
      op: 'set-transition',
      transition: { kind: 'fade', durationSec: 0.4 },
    });
    const v = tl.tracks[0].clips;
    expect(v[0].transitionOut?.kind).toBe('fade');
    expect(v[1].transitionOut?.kind).toBe('fade');
    expect(v[2].transitionOut).toBeUndefined();
    // 音频轨不受影响
    expect(tl.tracks[1].clips[0].transitionOut).toBeUndefined();
  });

  it('duck-audio 设整轨音量', () => {
    const tl = applyTimelineOp(base(), { op: 'duck-audio', trackId: 'A1', volume: 0.4 });
    expect(tl.tracks[1].clips[0].volume).toBe(0.4);
  });

  it('set-volume-keyframe 采样线性包络，分割时按相对时间切开', () => {
    const withKeys = applyTimelineOps(base(), [
      { op: 'set-volume-keyframe', clipId: 'c1', atSec: 0, volume: 0.2 },
      { op: 'set-volume-keyframe', clipId: 'c1', atSec: 4, volume: 1 },
    ]);
    const c1 = findTimelineClip(withKeys, 'c1')!.clip;
    expect(c1.volumeKeyframes).toHaveLength(2);
    expect(sampleClipVolume(c1, 0)).toBeCloseTo(0.2);
    expect(sampleClipVolume(c1, 2)).toBeCloseTo(0.6);
    const split = applyTimelineOp(withKeys, { op: 'split-clip', clipId: 'c1', atSec: 2, newClipId: 'c1b' });
    const left = findTimelineClip(split, 'c1')!.clip;
    const right = findTimelineClip(split, 'c1b')!.clip;
    expect(left.volumeKeyframes?.some((kf) => kf.atSec <= 2)).toBe(true);
    expect(right.volumeKeyframes?.[0]?.atSec).toBeCloseTo(0);
    expect(right.volumeKeyframes?.[0]?.volume).toBeCloseTo(0.6);
    expect(sampleClipVolume(left, left.durationSec)).toBeCloseTo(0.6);
    expect(sampleClipVolume(right, 0)).toBeCloseTo(0.6);
  });

  it('replace-clip-asset 记录溯源可回滚', () => {
    const tl = applyTimelineOp(base(), {
      op: 'replace-clip-asset',
      clipId: 'c2',
      assetUrl: '/media/c2-new.mp4',
    });
    const c2 = findTimelineClip(tl, 'c2')!.clip;
    expect(c2.assetUrl).toBe('/media/c2-new.mp4');
    expect(c2.replacedFrom).toBe('/media/c2.mp4');
  });

  it('add-clip atEnd 接到轨尾；set-clip 不允许绕过位置字段', () => {
    const tl = applyTimelineOps(base(), [
      { op: 'add-clip', trackId: 'V1', clip: clip({ id: 'c4', durationSec: 3 }), atEnd: true },
      { op: 'set-clip', clipId: 'c1', patch: { startSec: 99, volume: 0.5 } as never },
    ]);
    expect(findTimelineClip(tl, 'c4')!.clip.startSec).toBe(10);
    const c1 = findTimelineClip(tl, 'c1')!.clip;
    expect(c1.startSec).toBe(0);
    expect(c1.volume).toBe(0.5);
  });

  it('nextTrackId 顺延避开占用', () => {
    expect(nextTrackId([{ id: 'A1' }, { id: 'A2' }], 'audio')).toBe('A3');
    expect(nextTrackId([], 'subtitle')).toBe('S1');
  });
});

describe('probe 时长校准', () => {
  it('超长片段收短并 ripple，回写 sourceDurationSec', () => {
    const tl = makeTimeline([
      {
        id: 'V1',
        kind: 'video',
        clips: [
          clip({ id: 'c1', startSec: 0, durationSec: 4 }),
          clip({ id: 'c2', startSec: 4, durationSec: 4 }),
        ],
      },
    ]);
    const calibrated = calibrateTimelineWithDurations(tl, {
      '/media/c1.mp4': 2.5, // 真实只有 2.5s
      '/media/c2.mp4': 8,
    });
    const c1 = findTimelineClip(calibrated, 'c1')!.clip;
    const c2 = findTimelineClip(calibrated, 'c2')!.clip;
    expect(c1.durationSec).toBe(2.5);
    expect(c1.sourceDurationSec).toBe(2.5);
    expect(c2.startSec).toBe(2.5);
    expect(c2.durationSec).toBe(4);
    expect(c2.sourceDurationSec).toBe(8);
    expect(calibrated.durationSec).toBe(6.5);
  });
});
