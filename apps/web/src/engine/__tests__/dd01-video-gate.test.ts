import { describe, expect, it } from 'vitest';
import { orchestrateDramaTimeline } from '../smart-edit-orchestrator';

describe('DD-D-01/02 成片编排门禁', () => {
  const shots = [
    {
      id: 'a',
      index: 0,
      status: 'approved',
      keyframeStatus: 'approved',
      videoStatus: 'review',
      videoAssetId: '/media/a.mp4',
    },
    {
      id: 'b',
      index: 1,
      status: 'approved',
      keyframeStatus: 'approved',
      videoStatus: 'approved',
      videoAssetId: '/media/b.mp4',
    },
  ];

  it('approvedOnly 只纳入已批准视频，不再吃关键帧 status', async () => {
    const result = await orchestrateDramaTimeline({
      approvedOnly: true,
      shots,
    });
    expect(result.timeline).not.toBeNull();
    const videoClips = result.timeline!.tracks
      .filter((t) => t.kind === 'video' || t.kind === 'overlay')
      .flatMap((t) => t.clips);
    expect(videoClips.map((c) => c.assetUrl)).toEqual(['/media/b.mp4']);
  });

  it('非 approvedOnly 时 review 视频也可编排（显式关闭门禁）', async () => {
    const result = await orchestrateDramaTimeline({
      approvedOnly: false,
      shots,
    });
    const videoClips = result.timeline!.tracks
      .filter((t) => t.kind === 'video' || t.kind === 'overlay')
      .flatMap((t) => t.clips);
    expect(videoClips.map((c) => c.assetUrl).sort()).toEqual(['/media/a.mp4', '/media/b.mp4']);
  });

  it('approvedOnly 滤空时诚实失败，禁止空时间线假成功', async () => {
    await expect(
      orchestrateDramaTimeline({
        approvedOnly: true,
        shots: [
          {
            id: 'a',
            index: 0,
            videoStatus: 'review',
            videoAssetId: '/media/a.mp4',
          },
          {
            id: 'c',
            index: 1,
            videoStatus: 'review',
            videoAssetId: '/media/c.mp4',
          },
        ],
      }),
    ).rejects.toThrow(/尚未批准/);
  });

  it('空镜头输入诚实失败', async () => {
    await expect(orchestrateDramaTimeline({ approvedOnly: true, shots: [] })).rejects.toThrow(
      /无可编排镜头/,
    );
  });
});
