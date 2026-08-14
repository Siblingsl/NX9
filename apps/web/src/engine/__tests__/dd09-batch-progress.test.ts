import { describe, expect, it, vi } from 'vitest';
import type {
  ChainStoryboardPayload,
  DirectorKeyframeBatch,
  StoryboardShot,
} from '@nx9/shared';
import { consumeDirectorKeyframeBatch } from '../director-keyframe-batch-runner';

function makeShot(id: string, index: number): StoryboardShot {
  return {
    id,
    episodeId: 'ep-1',
    index,
    durationSec: 4,
    shotType: 'medium',
    descriptionZh: `镜头 ${index}`,
    promptEn: `shot ${index}`,
    status: 'approved',
    keyframeStatus: 'approved',
    firstFrameAssetId: `frame-${index}`,
    keyframeRevision: 2,
  };
}

describe('DD-D-09 逐镜即时回执', () => {
  it('每镜成功后立即回调 patch，中断不丢已成功镜头', async () => {
    const chain: ChainStoryboardPayload = {
      version: 2,
      activeEpisodeId: 'ep-1',
      shots: [makeShot('s1', 1), makeShot('s2', 2)],
    };
    const batch: DirectorKeyframeBatch = {
      version: 1,
      batchId: 'batch-progress',
      sourceDirectorDeskId: 'director',
      sourceChainDeskId: 'storyboard',
      episodeId: 'ep-1',
      createdAt: '2026-08-12T00:00:00.000Z',
      bypassKeyframeGate: false,
      status: 'ready',
      shots: chain.shots.map((shot) => ({
        shotId: shot.id,
        index: shot.index,
        imageUrl: shot.firstFrameAssetId!,
        prompt: shot.promptEn,
        durationSec: shot.durationSec,
        keyframeRevision: shot.keyframeRevision!,
      })),
    };
    const progress = vi.fn();
    const first = await consumeDirectorKeyframeBatch({
      batch,
      chain,
      onShotProgress: progress,
      generateVideo: async (item) => ({ videoUrl: `video-${item.shotId}` }),
    });
    expect(progress).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenNthCalledWith(1, 's1', expect.objectContaining({
      videoAssetId: 'video-s1',
      videoStatus: 'review',
    }));
    expect(progress).toHaveBeenNthCalledWith(2, 's2', expect.objectContaining({
      videoAssetId: 'video-s2',
      videoStatus: 'review',
    }));
    expect(first.chain.shots.every((s) => s.keyframeStatus === 'approved')).toBe(true);
  });

  it('partial receipt 续跑只重试失败镜，不整批重打', async () => {
    const chain: ChainStoryboardPayload = {
      version: 2,
      activeEpisodeId: 'ep-1',
      shots: [makeShot('s1', 1), makeShot('s2', 2)],
    };
    const batch: DirectorKeyframeBatch = {
      version: 1,
      batchId: 'batch-partial',
      sourceDirectorDeskId: 'director',
      sourceChainDeskId: 'storyboard',
      episodeId: 'ep-1',
      createdAt: '2026-08-12T00:00:00.000Z',
      bypassKeyframeGate: false,
      status: 'ready',
      shots: chain.shots.map((shot) => ({
        shotId: shot.id,
        index: shot.index,
        imageUrl: shot.firstFrameAssetId!,
        prompt: shot.promptEn,
        durationSec: shot.durationSec,
        keyframeRevision: shot.keyframeRevision!,
      })),
    };
    const first = await consumeDirectorKeyframeBatch({
      batch,
      chain,
      generateVideo: async (item) => {
        if (item.shotId === 's2') throw new Error('temporary provider failure');
        return { videoUrl: 'video-s1' };
      },
    });
    expect(first.batch.status).toBe('partial');
    expect(first.receipt.succeededShotIds).toEqual(['s1']);

    const generateVideo = vi.fn(async (item: DirectorKeyframeBatch['shots'][number]) => ({
      videoUrl: `video-${item.shotId}`,
    }));
    const resumed = await consumeDirectorKeyframeBatch({
      batch: first.batch,
      chain: first.chain,
      generateVideo,
    });
    expect(generateVideo).toHaveBeenCalledTimes(1);
    expect(generateVideo).toHaveBeenCalledWith(expect.objectContaining({ shotId: 's2' }), expect.anything());
    expect(resumed.batch.status).toBe('consumed');
    expect(resumed.receipt.succeededShotIds).toEqual(['s1', 's2']);
  });
});
