/**
 * 导演台 runner 关键测例 (Q-02)
 */
import { describe, it, expect, vi } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import {
  buildShotPrompt,
  findDirectorPictureGenNode,
  runDirectorDeskBatch,
  resolveDirectorQueueShots,
  isDirectorKeyframeGatePassed,
  isShotKeyframeApproved,
  isShotKeyframeFailed,
  isShotMissingKeyframe,
  getActiveEpisodeShots,
  summarizePendingKeyframeGate,
  approveAllDirectorKeyframes,
} from '../director-desk-runner';
import { patchUpstreamShot } from '../chain-storyboard-utils';
import { buildDirectorBatchLabel } from '../../blocks/core/director-desk/director-batch-opts';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import type { StoryboardShot } from '@nx9/shared';

vi.mock('../picture-gen-runner', () => ({
  runPictureGenJob: vi.fn(async () => ['generated-keyframe-url']),
}));

function makeShot(overrides: Partial<StoryboardShot> = {}): StoryboardShot {
  return {
    id: `s-${overrides.index ?? 1}`,
    index: overrides.index ?? 1,
    durationSec: 4,
    shotType: 'medium',
    descriptionZh: '测试镜',
    promptEn: 'test shot',
    status: 'draft',
    keyframeStatus: 'draft',
    ...overrides,
  } as StoryboardShot;
}

// ── findDirectorPictureGenNode: 只认连线，不回落画布 ──

describe('findDirectorPictureGenNode (D-06/X-35)', () => {
  it('通过直连返回 picture-gen', () => {
    const nodes: Node[] = [
      { id: 'desk', type: 'director-desk', position: { x: 0, y: 0 }, data: {} },
      { id: 'pg1', type: 'picture-gen', position: { x: 100, y: 0 }, data: {} },
    ];
    const edges: Edge[] = [{ id: 'e1', source: 'desk', target: 'pg1' }];
    const result = findDirectorPictureGenNode('desk', nodes, edges);
    expect(result?.id).toBe('pg1');
  });

  it('经分镜间接定位 picture-gen', () => {
    const nodes: Node[] = [
      { id: 'desk', type: 'director-desk', position: { x: 0, y: 0 }, data: {} },
      { id: 'sb', type: 'storyboard-desk', position: { x: 100, y: 0 }, data: {} },
      { id: 'pg1', type: 'picture-gen', position: { x: 200, y: 0 }, data: {} },
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'sb', target: 'desk' },
      { id: 'e2', source: 'pg1', target: 'sb' },
    ];
    const result = findDirectorPictureGenNode('desk', nodes, edges);
    expect(result?.id).toBe('pg1');
  });

  it('无连线不回落画布级 picture-gen', () => {
    const nodes: Node[] = [
      { id: 'desk', type: 'director-desk', position: { x: 0, y: 0 }, data: {} },
      { id: 'pg1', type: 'picture-gen', position: { x: 200, y: 0 }, data: {} },
    ];
    const edges: Edge[] = [];
    const result = findDirectorPictureGenNode('desk', nodes, edges);
    expect(result).toBeUndefined();
  });
});

// ── 队列过滤 ──

describe('resolveDirectorQueueShots', () => {
  it('missing filter: 只含缺帧 + 失败', () => {
    const shots = [
      makeShot({ id: 's1', index: 1, firstFrameAssetId: null, keyframeStatus: 'draft' }),
      makeShot({ id: 's2', index: 2, firstFrameAssetId: 'url', keyframeStatus: 'approved', status: 'approved' }),
      makeShot({ id: 's3', index: 3, firstFrameAssetId: null, keyframeStatus: 'failed', status: 'failed' }),
    ];
    const result = resolveDirectorQueueShots(shots, { filter: 'missing' });
    expect(result.map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('selected filter: 只含指定 id', () => {
    const shots = [
      makeShot({ id: 's1', index: 1 }),
      makeShot({ id: 's2', index: 2 }),
      makeShot({ id: 's3', index: 3 }),
    ];
    const result = resolveDirectorQueueShots(shots, {
      filter: 'selected',
      selectedIds: ['s1', 's3'],
    });
    expect(result.map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('failed filter: 只含失败镜头', () => {
    const shots = [
      makeShot({ id: 's1', index: 1, firstFrameAssetId: 'url', keyframeStatus: 'approved', status: 'approved' }),
      makeShot({ id: 's2', index: 2, keyframeStatus: 'failed', status: 'failed' }),
      makeShot({ id: 's3', index: 3, firstFrameAssetId: null, keyframeStatus: 'draft' }),
    ];
    const result = resolveDirectorQueueShots(shots, { filter: 'failed' });
    expect(result.map((s) => s.id)).toEqual(['s2']);
  });
});

describe('buildDirectorBatchLabel (B-06)', () => {
  it('明示全量重出和跳过已批准策略', () => {
    expect(buildDirectorBatchLabel({
      filter: 'all',
      selectedCount: 0,
      failedCount: 0,
      missingCount: 0,
      skipExisting: false,
      skipApproved: true,
    })).toBe('批出本集（将重出已有关键帧，跳过已批准）');
  });

  it('当前筛选为未完成时不虚报会重出已有关键帧', () => {
    expect(buildDirectorBatchLabel({
      filter: 'missing',
      selectedCount: 0,
      failedCount: 0,
      missingCount: 2,
      skipExisting: false,
      skipApproved: false,
    })).toBe('批出未完成（2）（当前筛选不含已有关键帧，包含已批准）');
  });
});

// ── 门禁 ──

describe('isDirectorKeyframeGatePassed', () => {
  it('全批准才放行', () => {
    const shots = [
      makeShot({ id: 's1', index: 1, firstFrameAssetId: 'url', keyframeStatus: 'approved', status: 'approved' }),
      makeShot({ id: 's2', index: 2, firstFrameAssetId: 'url', keyframeStatus: 'approved', status: 'approved' }),
    ];
    expect(isDirectorKeyframeGatePassed(shots)).toBe(true);
  });

  it('缺批准不通过', () => {
    const shots = [
      makeShot({ id: 's1', index: 1, firstFrameAssetId: 'url', keyframeStatus: 'approved', status: 'approved' }),
      makeShot({ id: 's2', index: 2, firstFrameAssetId: 'url', keyframeStatus: 'review', status: 'review' }),
    ];
    expect(isDirectorKeyframeGatePassed(shots)).toBe(false);
  });

  it('空镜表不通过', () => {
    expect(isDirectorKeyframeGatePassed([])).toBe(false);
  });
});

// ── 镜头状态判定 ──

describe('shot status helpers', () => {
  it('isShotMissingKeyframe: 无 firstFrameAssetId', () => {
    expect(isShotMissingKeyframe(makeShot({ firstFrameAssetId: null }))).toBe(true);
    expect(isShotMissingKeyframe(makeShot({ firstFrameAssetId: 'url' }))).toBe(false);
  });

  it('isShotKeyframeFailed: keyframeStatus 或 status 为 failed', () => {
    expect(isShotKeyframeFailed(makeShot({ keyframeStatus: 'failed', status: 'failed' }))).toBe(true);
    expect(isShotKeyframeFailed(makeShot({ keyframeStatus: 'approved', status: 'approved' }))).toBe(false);
  });

  it('isShotKeyframeApproved', () => {
    expect(isShotKeyframeApproved(makeShot({ keyframeStatus: 'approved', status: 'approved' }))).toBe(true);
    expect(isShotKeyframeApproved(makeShot({ keyframeStatus: 'review', status: 'review' }))).toBe(false);
  });
});

describe('patchUpstreamShot integration', () => {
  it('writes a patch into the connected storyboard chain', () => {
    const shot = makeShot({ id: 's1', index: 1 });
    const chain = { version: 2 as const, activeEpisodeId: 'ep-1', shots: [shot] };
    const nodes: Node[] = [
      { id: 'desk', type: 'director-desk', position: { x: 0, y: 0 }, data: {} },
      { id: 'sb', type: 'storyboard-desk', position: { x: 100, y: 0 }, data: { chainStoryboard: chain } },
    ];
    const edges: Edge[] = [{ id: 'e1', source: 'sb', target: 'desk' }];
    let written: Record<string, unknown> | undefined;
    const ok = patchUpstreamShot(
      (_id, patch) => { written = patch; },
      'desk',
      nodes,
      edges,
      's1',
      { keyframeStatus: 'approved' },
    );
    expect(ok).toBe(true);
    expect((written?.chainStoryboard as typeof chain).shots[0].keyframeStatus).toBe('approved');
  });

  it('batch generation writes success through patchShot, not global shots', async () => {
    const shot = makeShot({ id: 's1', index: 1, firstFrameAssetId: null });
    const chain = { version: 2 as const, activeEpisodeId: 'ep-1', shots: [shot] };
    const nodes: Node[] = [
      { id: 'desk', type: 'director-desk', position: { x: 0, y: 0 }, data: {} },
      { id: 'sb', type: 'storyboard-desk', position: { x: 100, y: 0 }, data: { chainStoryboard: chain } },
    ];
    const edges: Edge[] = [{ id: 'e1', source: 'sb', target: 'desk' }];
    const updateNodeData = (id: string, patch: Record<string, unknown>) => {
      const node = nodes.find((item) => item.id === id);
      if (node) node.data = { ...node.data, ...patch };
    };
    const summary = await runDirectorDeskBatch({
      shots: [shot],
      shotIds: ['s1'],
      filter: 'selected',
      skipExisting: false,
      skipApproved: false,
      forceCharacterRef: false,
      forceSceneRef: false,
      patchShot: (id, patch) => {
        expect(patchUpstreamShot(updateNodeData, 'desk', nodes, edges, id, patch)).toBe(true);
      },
      maxRetries: 0,
    });
    expect(summary.done).toBe(1);
    expect((nodes[1].data.chainStoryboard as typeof chain).shots[0].firstFrameAssetId).toBe('generated-keyframe-url');
  });

  it('concurrent-style upstream patches read the latest chain and preserve both updates', () => {
    const first = makeShot({ id: 's1', index: 1 });
    const second = makeShot({ id: 's2', index: 2 });
    const chain = { version: 2 as const, activeEpisodeId: 'ep-1', shots: [first, second] };
    const nodes: Node[] = [
      { id: 'desk', type: 'director-desk', position: { x: 0, y: 0 }, data: {} },
      { id: 'sb', type: 'storyboard-desk', position: { x: 100, y: 0 }, data: { chainStoryboard: chain } },
    ];
    const edges: Edge[] = [{ id: 'e1', source: 'sb', target: 'desk' }];
    const updateNodeData = (id: string, patch: Record<string, unknown>) => {
      const node = nodes.find((item) => item.id === id);
      if (node) node.data = { ...node.data, ...patch };
    };
    const latestNodes = () => nodes;

    expect(patchUpstreamShot(updateNodeData, 'desk', nodes, edges, 's1', {
      firstFrameAssetId: 'frame-1',
      keyframeStatus: 'review',
    }, latestNodes)).toBe(true);
    expect(patchUpstreamShot(updateNodeData, 'desk', nodes, edges, 's2', {
      firstFrameAssetId: 'frame-2',
      keyframeStatus: 'review',
    }, latestNodes)).toBe(true);

    const shots = (nodes[1].data.chainStoryboard as typeof chain).shots;
    expect(shots.find((shot) => shot.id === 's1')?.firstFrameAssetId).toBe('frame-1');
    expect(shots.find((shot) => shot.id === 's2')?.firstFrameAssetId).toBe('frame-2');
  });

  it('batch generation fails explicitly when patchShot is absent', async () => {
    const summary = await runDirectorDeskBatch({
      shots: [makeShot({ id: 's1', index: 1, firstFrameAssetId: null })],
      shotIds: ['s1'],
      filter: 'selected',
      skipExisting: false,
      skipApproved: false,
      forceCharacterRef: false,
      forceSceneRef: false,
      maxRetries: 0,
    });
    expect(summary.done).toBe(0);
    expect(summary.failed).toBe(1);
    expect(summary.results[0]?.error).toBe('缺少上游链镜表写回适配器');
  });

  it('未传 shots 时不读取全局镜表作为批出队列', async () => {
    const shot = makeShot({ id: 'global-shot', index: 1, firstFrameAssetId: null });
    const originalStoryboard = useWorkspaceDocument.getState().storyboard;
    const updateShot = vi.spyOn(useWorkspaceDocument.getState(), 'updateShot');
    useWorkspaceDocument.setState({ storyboard: { ...originalStoryboard, shots: [shot] } });

    try {
      const summary = await runDirectorDeskBatch({
        filter: 'missing',
        forceCharacterRef: false,
        forceSceneRef: false,
        maxRetries: 0,
      });
      expect(summary.total).toBe(0);
      expect(updateShot).not.toHaveBeenCalled();
      expect(getActiveEpisodeShots()).toEqual([]);
      expect(summarizePendingKeyframeGate()).toEqual({ pendingIndices: [], gatePassed: false });
      expect(approveAllDirectorKeyframes(() => undefined)).toBe(0);
    } finally {
      useWorkspaceDocument.setState({ storyboard: originalStoryboard });
      updateShot.mockRestore();
    }
  });

  it('批出审阅模式只使用显式 reviewMode，不读取全局 storyboard 设置', async () => {
    const shot = makeShot({ id: 's1', index: 1, firstFrameAssetId: null });
    const chain = { version: 2 as const, activeEpisodeId: 'ep-1', shots: [shot] };
    const nodes: Node[] = [
      { id: 'desk', type: 'director-desk', position: { x: 0, y: 0 }, data: {} },
      { id: 'sb', type: 'storyboard-desk', position: { x: 100, y: 0 }, data: { chainStoryboard: chain } },
    ];
    const edges: Edge[] = [{ id: 'e1', source: 'sb', target: 'desk' }];
    const originalStoryboard = useWorkspaceDocument.getState().storyboard;
    useWorkspaceDocument.setState({ storyboard: { ...originalStoryboard, reviewMode: 'auto' } });

    try {
      const summary = await runDirectorDeskBatch({
        shots: [shot],
        shotIds: ['s1'],
        filter: 'selected',
        skipExisting: false,
        skipApproved: false,
        forceCharacterRef: false,
        forceSceneRef: false,
        reviewMode: 'manual',
        maxRetries: 0,
        patchShot: (id, patch) => {
          expect(patchUpstreamShot((nodeId, nodePatch) => {
            const node = nodes.find((item) => item.id === nodeId);
            if (node) node.data = { ...node.data, ...nodePatch };
          }, 'desk', nodes, edges, id, patch)).toBe(true);
        },
      });
      expect(summary.done).toBe(1);
      expect((nodes[1].data.chainStoryboard as typeof chain).shots[0].keyframeStatus).toBe('review');
    } finally {
      useWorkspaceDocument.setState({ storyboard: originalStoryboard });
    }
  });
});

describe('buildShotPrompt line-art integration', () => {
  it('adds line-art to usedRefs and reference URLs', () => {
    const shot = makeShot({ id: 's1', index: 1 });
    const built = buildShotPrompt(shot, [], {
      forceCharacterRef: false,
      forceSceneRef: false,
      preferLineArtRef: true,
      lineArtByShotId: { s1: 'line-art-url' },
    });
    expect(built.usedRefs).toContain('line-art');
    expect(built.referenceImageUrls).toContain('line-art-url');
  });

  it('uses explicit style and environment inputs without global storyboard context', () => {
    const shot = makeShot({ id: 's1', index: 1, sceneName: '测试场景', episodeId: 'ep-1' });
    const originalStoryboard = useWorkspaceDocument.getState().storyboard;
    useWorkspaceDocument.setState({
      storyboard: {
        ...originalStoryboard,
        globalArtDirection: 'global-store-style-must-not-win',
        episodes: [{ id: 'ep-1', index: 1, title: '全局集', status: 'draft', artDirection: 'global-episode-style-must-not-win' }],
      },
    });

    try {
      const built = buildShotPrompt(shot, [], {
        forceCharacterRef: false,
        forceSceneRef: true,
        styleLock: true,
        globalArtDirection: 'injected-global-style',
        episodeArtDirection: 'injected-episode-style',
        environments: [{ id: 'env-1', name: '测试场景', descriptionZh: '注入场景描述' }],
      });
      expect(built.prompt).toContain('injected-global-style');
      expect(built.prompt).toContain('injected-episode-style');
      expect(built.prompt).toContain('注入场景描述');
      expect(built.prompt).not.toContain('global-store-style-must-not-win');
      expect(built.prompt).not.toContain('global-episode-style-must-not-win');
    } finally {
      useWorkspaceDocument.setState({ storyboard: originalStoryboard });
    }
  });
});
