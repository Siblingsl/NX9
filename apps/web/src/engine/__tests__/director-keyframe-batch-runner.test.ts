import { describe, expect, it, vi } from 'vitest';
import type {
  ChainStoryboardPayload,
  DirectorKeyframeBatch,
  StoryboardShot,
} from '@nx9/shared';
import {
  consumeDirectorKeyframeBatch,
  describeDirectorKeyframeBatchStatus,
  validateDirectorKeyframeBatch,
} from '../director-keyframe-batch-runner';

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

function makeFixture() {
  const shots = [makeShot('s1', 1), makeShot('s2', 2)];
  const chain: ChainStoryboardPayload = {
    version: 2,
    activeEpisodeId: 'ep-1',
    shots,
  };
  const batch: DirectorKeyframeBatch = {
    version: 1,
    batchId: 'batch-1',
    sourceDirectorDeskId: 'director',
    sourceChainDeskId: 'storyboard',
    episodeId: 'ep-1',
    createdAt: '2026-08-12T00:00:00.000Z',
    bypassKeyframeGate: false,
    status: 'ready',
    shots: shots.map((shot) => ({
      shotId: shot.id,
      index: shot.index,
      imageUrl: shot.firstFrameAssetId!,
      prompt: shot.videoPromptEn ?? shot.promptEn,
      durationSec: shot.durationSec,
      keyframeRevision: shot.keyframeRevision!,
    })),
  };
  return { chain, batch };
}

describe('director keyframe batch', () => {
  it('rejects an unapproved, replaced, or revised keyframe', () => {
    const { chain, batch } = makeFixture();
    const changed: ChainStoryboardPayload = {
      ...chain,
      shots: chain.shots.map((shot) => shot.id === 's2'
        ? {
            ...shot,
            firstFrameAssetId: 'replacement',
            keyframeRevision: 3,
            keyframeStatus: 'review',
            status: 'review',
          }
        : shot),
    };

    const validation = validateDirectorKeyframeBatch(batch, changed);

    expect(validation.valid).toBe(false);
    expect(validation.issues).toEqual([
      { shotId: 's2', index: 2, reason: '关键帧当前未批准' },
    ]);
  });

  it('consumes each shot, writes video results, and is idempotent after success', async () => {
    const { chain, batch } = makeFixture();
    const generateVideo = vi.fn(async (item: DirectorKeyframeBatch['shots'][number]) => ({
      videoUrl: `video-${item.shotId}`,
    }));

    const first = await consumeDirectorKeyframeBatch({
      batch,
      chain,
      generateVideo,
      now: () => '2026-08-12T01:00:00.000Z',
    });

    expect(generateVideo).toHaveBeenCalledTimes(2);
    expect(first.batch.status).toBe('consumed');
    expect(first.receipt.succeededShotIds).toEqual(['s1', 's2']);
    expect(first.chain.shots.map((shot) => shot.videoAssetId)).toEqual(['video-s1', 'video-s2']);
    // DD-D-01: 视频写回不得覆盖关键帧批准语义。
    expect(first.chain.shots.map((shot) => shot.keyframeStatus)).toEqual(['approved', 'approved']);
    expect(first.chain.shots.map((shot) => shot.status)).toEqual(['approved', 'approved']);
    expect(first.chain.shots.map((shot) => shot.videoStatus)).toEqual(['review', 'review']);
    // VG-36: 导演批次成片与批量同口径建 videoVersions
    expect(first.chain.shots.map((shot) => shot.videoVersions?.length)).toEqual([1, 1]);
    expect(first.chain.shots.map((shot) => shot.videoVersions?.[0]?.url)).toEqual(['video-s1', 'video-s2']);
    expect(first.chain.shots.map((shot) => shot.videoVersions?.[0]?.model)).toEqual(['veo', 'veo']);

    const reopened = await consumeDirectorKeyframeBatch({
      batch: first.batch,
      chain: first.chain,
      generateVideo,
    });
    expect(generateVideo).toHaveBeenCalledTimes(2);
    expect(reopened.receipt).toEqual(first.receipt);
  });

  it('describes consume status instead of only written', () => {
    const batch: DirectorKeyframeBatch = {
      version: 1,
      batchId: 'batch-1',
      sourceDirectorDeskId: 'director',
      sourceChainDeskId: 'storyboard',
      episodeId: 'ep-1',
      createdAt: '2026-08-12T00:00:00.000Z',
      bypassKeyframeGate: false,
      status: 'ready',
      shots: [],
    };
    expect(describeDirectorKeyframeBatchStatus(batch)).toBe('已写入 clip-gen · 0 镜 · 待消费');
    expect(describeDirectorKeyframeBatchStatus({
      ...batch,
      status: 'consumed',
      shots: [{ shotId: 's1', index: 1, imageUrl: 'a', prompt: '', durationSec: 4, keyframeRevision: 1 }],
      receipt: {
        batchId: 'batch-1',
        status: 'consumed',
        consumedAt: '2026-08-12T01:00:00.000Z',
        succeededShotIds: ['s1'],
        failed: [],
        videoUrlsByShotId: { s1: 'v1' },
      },
    })).toBe('已消费 · 1/1 镜');
    expect(describeDirectorKeyframeBatchStatus({ ...batch, status: 'stale' })).toBe('批次已过期，请重新推送关键帧');
  });
});
