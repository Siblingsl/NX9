import { describe, expect, it, vi } from 'vitest';
import {
  hygieneChainStoryboard,
  quarantineDirector3dDataUrls,
  type ChainStoryboardPayload,
} from '@nx9/shared';
import {
  persistChainStoryboardHygiene,
  persistUpstreamChainHygiene,
} from '../chain-storyboard-utils';

function makeChain(overrides: Partial<ChainStoryboardPayload> = {}): ChainStoryboardPayload {
  return {
    version: 2,
    activeEpisodeId: 'ep-1',
    episodes: [{ id: 'ep-1', index: 1, title: '第一集', status: 'draft' }],
    shots: [
      {
        id: 'shot-1',
        episodeId: 'ep-1',
        index: 1,
        durationSec: 3,
        shotType: 'medium',
        descriptionZh: '线稿污染样例',
        promptEn: 'polluted',
        lineArtUrl: '/line/shot-1.png',
        firstFrameAssetId: '/line/shot-1.png',
        status: 'draft',
        director3dGuide: {
          sourceBlockId: 'd3',
          captureId: 'cap-1',
          captureUrl: 'data:image/png;base64,abc',
          commitId: 'commit-1',
          appliedAt: '2026-08-12T00:00:00.000Z',
        },
      },
    ],
    ...overrides,
  };
}

describe('chain storyboard hygiene', () => {
  it('quarantines data: 3d capture urls and migrates high-confidence line-art pollution', () => {
    const result = hygieneChainStoryboard(makeChain());
    expect(result.migratedCount).toBe(1);
    expect(result.quarantinedCount).toBe(1);
    expect(result.chain.shots[0]?.firstFrameAssetId).toBeNull();
    expect(result.chain.shots[0]?.lineArtUrl).toBe('/line/shot-1.png');
    expect(result.chain.shots[0]?.director3dGuide).toMatchObject({
      captureUrl: '',
      captureUrlPendingRepair: true,
      commitId: 'commit-1',
    });
    expect(result.chain.mediaRoleSchemaVersion).toBe(1);
  });

  it('persists hygiene back onto the upstream desk node', () => {
    const updateNodeData = vi.fn();
    const chain = makeChain();
    const result = persistChainStoryboardHygiene(
      updateNodeData,
      'sb',
      { chainStoryboard: chain },
    );
    expect(result.migratedCount).toBe(1);
    expect(result.quarantinedCount).toBe(1);
    expect(updateNodeData).toHaveBeenCalledTimes(1);
    const written = updateNodeData.mock.calls[0]?.[1]?.chainStoryboard as ChainStoryboardPayload;
    expect(written.shots[0]?.firstFrameAssetId).toBeNull();
    expect(written.shots[0]?.director3dGuide?.captureUrlPendingRepair).toBe(true);

    const again = persistChainStoryboardHygiene(
      updateNodeData,
      'sb',
      { chainStoryboard: written },
    );
    expect(again.migratedCount).toBe(0);
    expect(again.quarantinedCount).toBe(0);
    expect(updateNodeData).toHaveBeenCalledTimes(1);
  });

  it('resolves upstream desk through director-desk when persisting hygiene', () => {
    const updateNodeData = vi.fn();
    const chain = makeChain();
    const wrote = persistUpstreamChainHygiene(
      updateNodeData,
      'desk',
      [
        {
          id: 'sb',
          type: 'storyboard-desk',
          position: { x: 0, y: 0 },
          data: { chainStoryboard: chain },
        },
        {
          id: 'desk',
          type: 'director-desk',
          position: { x: 200, y: 0 },
          data: {},
        },
      ] as any,
      [{ source: 'sb', target: 'desk' }],
    );
    expect(wrote).toBe(true);
    expect(updateNodeData).toHaveBeenCalledWith(
      'sb',
      expect.objectContaining({
        chainStoryboard: expect.objectContaining({
          mediaRoleSchemaVersion: 1,
        }),
      }),
    );
  });

  it('keeps non-pixel guide fields when only captureUrl is a data url', () => {
    const { chain, quarantinedCount } = quarantineDirector3dDataUrls(makeChain({
      shots: [
        {
          id: 'shot-2',
          episodeId: 'ep-1',
          index: 2,
          durationSec: 2,
          shotType: 'close',
          descriptionZh: '机位保留',
          promptEn: 'keep camera',
          status: 'draft',
          director3dGuide: {
            sourceBlockId: 'd3',
            captureId: 'cap-2',
            captureUrl: 'data:image/jpeg;base64,xyz',
            cameraPosition: [1, 2, 3],
            appliedAt: '2026-08-12T00:00:00.000Z',
          },
        },
      ],
    }));
    expect(quarantinedCount).toBe(1);
    expect(chain.shots[0]?.director3dGuide).toMatchObject({
      captureUrl: '',
      captureUrlPendingRepair: true,
      cameraPosition: [1, 2, 3],
    });
  });
});
