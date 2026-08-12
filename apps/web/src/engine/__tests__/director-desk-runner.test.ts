/**
 * 导演台 runner 关键测例 (Q-02)
 */
import { describe, it, expect, vi } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import {
  buildShotPrompt,
  findDirectorPictureGenNode,
  pushKeyframesToClipGen,
  runDirectorDeskBatch,
  resolveDirectorRunContext,
  resolveDirectorQueueShots,
  isDirectorKeyframeGatePassed,
  isShotKeyframeApproved,
  isShotKeyframeFailed,
  isShotMissingKeyframe,
  getActiveEpisodeShots,
  summarizePendingKeyframeGate,
  approveAllDirectorKeyframes,
  openReviewAfterDirectorBatch,
} from '../director-desk-runner';
import { patchUpstreamShot } from '../chain-storyboard-utils';
import { runFlowBatch } from '../flow-runner';
import { api } from '../../api/client';
import { buildDirectorBatchLabel } from '../../blocks/core/director-desk/director-batch-opts';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import {
  CHAIN_STORYBOARD_HANDOFF_HASH_SCHEMA_VERSION,
  chainStoryboardHash,
  lineArtVersionHash,
  type StoryboardShot,
} from '@nx9/shared';

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

describe('resolveDirectorRunContext', () => {
  function makeContextGraph() {
    const shots = [
      makeShot({ id: 's1', index: 1, episodeId: 'ep-1', lineArtUrl: 'line-1' }),
      makeShot({ id: 's2', index: 2, episodeId: 'ep-1', lineArtUrl: 'line-2' }),
    ];
    const chain = {
      version: 2 as const,
      activeEpisodeId: 'ep-1',
      confirmedEpisodeIds: ['ep-1'],
      episodes: [{ id: 'ep-1', index: 1, title: '第一集', status: 'in_progress' as const }],
      shots,
    };
    const handoff = {
      episodeId: 'ep-1',
      scriptHash: 'script-1',
      storyboardHash: chainStoryboardHash(chain, 'ep-1'),
      lineartVersion: lineArtVersionHash(chain, 'ep-1'),
      hashSchemaVersion: CHAIN_STORYBOARD_HANDOFF_HASH_SCHEMA_VERSION,
      handoffVersion: 1,
      confirmedAt: '2026-08-12T00:00:00.000Z',
      confirmed: true,
    };
    const nodes: Node[] = [
      { id: 'director', type: 'director-desk', position: { x: 0, y: 0 }, data: { lastHandoff: handoff } },
      {
        id: 'storyboard',
        type: 'storyboard-desk',
        position: { x: -200, y: 0 },
        data: {
          chainStoryboard: chain,
          breakdownJob: { sourcePackageHash: 'script-1' },
        },
      },
    ];
    const edges: Edge[] = [{ id: 'e1', source: 'storyboard', target: 'director' }];
    const updateNodeData = (id: string, patch: Record<string, unknown>) => {
      const node = nodes.find((item) => item.id === id);
      if (node) node.data = { ...node.data, ...patch };
    };
    return { nodes, edges, updateNodeData, chain };
  }

  it('builds the same episode queue, line-art map, and chain patcher for every host', () => {
    const graph = makeContextGraph();
    const context = resolveDirectorRunContext({
      deskBlockId: 'director',
      nodes: graph.nodes,
      edges: graph.edges,
      updateNodeData: graph.updateNodeData,
    });

    expect(context.status).toBe('ready');
    expect(context.shots.map((shot) => shot.id)).toEqual(['s1', 's2']);
    expect(context.lineArtByShotId).toEqual({ s1: 'line-1', s2: 'line-2' });
    expect(context.episodeConfirmed).toBe(true);
    expect(context.patchShot?.('s1', { firstFrameAssetId: 'frame-1', keyframeStatus: 'review' })).toBe(true);
    expect(context.patchShot?.('s2', { firstFrameAssetId: 'frame-2', keyframeStatus: 'review' })).toBe(true);

    const written = (graph.nodes[1].data.chainStoryboard as typeof graph.chain).shots;
    expect(written.find((shot) => shot.id === 's1')?.firstFrameAssetId).toBe('frame-1');
    expect(written.find((shot) => shot.id === 's2')?.firstFrameAssetId).toBe('frame-2');

    const reopened = resolveDirectorRunContext({
      deskBlockId: 'director',
      nodes: graph.nodes,
      edges: graph.edges,
      updateNodeData: graph.updateNodeData,
    });
    expect(reopened.status).toBe('ready');
  });

  it('blocks canvas execution when handoff is missing instead of returning an empty queue', () => {
    const graph = makeContextGraph();
    graph.nodes[0].data = {};
    const context = resolveDirectorRunContext({
      deskBlockId: 'director',
      nodes: graph.nodes,
      edges: graph.edges,
      updateNodeData: graph.updateNodeData,
    });

    expect(context.status).toBe('blocked');
    expect(context.blockCode).toBe('missing-handoff');
    expect(context.shots).toEqual([]);
  });

  it('marks canvas Run as blocked when its director context is invalid', async () => {
    const node: Node = {
      id: 'director',
      type: 'director-desk',
      position: { x: 0, y: 0 },
      data: {},
    };
    const writes: Record<string, unknown>[] = [];
    const progress: Array<{ phase: string; error?: string }> = [];

    await runFlowBatch(
      [node],
      [],
      (_id, patch) => writes.push(patch),
      (state) => progress.push(state),
      undefined,
      new Set(['director']),
    );

    expect(progress.at(-1)?.phase).toBe('blocked');
    expect(progress.at(-1)?.error).toContain('未连接上游分镜台');
    expect(writes.some((patch) => patch.status === 'blocked')).toBe(true);
    expect(writes.some((patch) => patch.status === 'success')).toBe(false);
  });

  it('runs the resolved episode queue from canvas and writes every generated frame', async () => {
    const graph = makeContextGraph();
    const progress: Array<{ phase: string; error?: string }> = [];

    await runFlowBatch(
      graph.nodes,
      graph.edges,
      graph.updateNodeData,
      (state) => progress.push(state),
      undefined,
      new Set(['director']),
    );

    expect(progress.at(-1)?.phase).toBe('done');
    const shots = (graph.nodes[1].data.chainStoryboard as typeof graph.chain).shots;
    expect(shots.every((shot) => shot.firstFrameAssetId === 'generated-keyframe-url')).toBe(true);
    expect(graph.nodes[0].data.status).toBe('success');
    expect((graph.nodes[0].data.batchSummary as { total: number }).total).toBe(2);
  });

  it('pushes a structured batch that clip-gen consumes per shot and writes back', async () => {
    const graph = makeContextGraph();
    const approvedShots = graph.chain.shots.map((shot, index) => ({
      ...shot,
      firstFrameAssetId: `approved-frame-${index + 1}`,
      keyframeRevision: 3,
      keyframeStatus: 'approved' as const,
      status: 'approved' as const,
    }));
    graph.chain.shots = approvedShots;
    graph.nodes[1].data = {
      ...graph.nodes[1].data,
      chainStoryboard: graph.chain,
    };
    graph.nodes.push({
      id: 'clip',
      type: 'clip-gen',
      position: { x: 240, y: 0 },
      data: { videoGenMode: 'image-to-video' },
    });
    graph.edges.push({ id: 'e2', source: 'director', target: 'clip' });

    const pushed = pushKeyframesToClipGen({
      deskBlockId: 'director',
      nodes: graph.nodes,
      edges: graph.edges,
      updateNodeData: graph.updateNodeData,
      shots: approvedShots,
      episodeId: 'ep-1',
    });
    expect(pushed.shotCount).toBe(2);
    expect((graph.nodes[2].data.directorKeyframeBatch as { version: number }).version).toBe(1);

    const proxyVideo = vi.spyOn(api, 'proxyVideo').mockImplementation(async (body) => ({
      ok: true,
      status: 'success',
      url: `video-for-${String(body.imageUrl).replace('approved-frame-', '')}`,
    } as any));
    localStorage.setItem('nx9.storyboardGuidePrefs.v1', JSON.stringify({
      showOverlay: true,
      showOnExport: true,
      useForVideo: false,
      kinds: {},
    }));
    try {
      const progress: Array<{ phase: string }> = [];
      await runFlowBatch(
        graph.nodes,
        graph.edges,
        graph.updateNodeData,
        (state) => progress.push(state),
        undefined,
        new Set(['clip']),
      );

      expect(progress.at(-1)?.phase).toBe('done');
      expect(proxyVideo).toHaveBeenCalledTimes(2);
      expect(proxyVideo.mock.calls.map(([body]) => body.imageUrl)).toEqual([
        'approved-frame-1',
        'approved-frame-2',
      ]);
      const written = (graph.nodes[1].data.chainStoryboard as typeof graph.chain).shots;
      expect(written.map((shot) => shot.videoAssetId)).toEqual(['video-for-1', 'video-for-2']);
      const batch = graph.nodes[2].data.directorKeyframeBatch as { status: string };
      expect(batch.status).toBe('consumed');
      expect(graph.nodes[2].data.directorBatchReceipt).toMatchObject({
        status: 'consumed',
        succeededShotIds: ['s1', 's2'],
      });
    } finally {
      localStorage.removeItem('nx9.storyboardGuidePrefs.v1');
      proxyVideo.mockRestore();
    }
  });

  it('blocks a stale keyframe batch against its source chain before video requests', async () => {
    const graph = makeContextGraph();
    const approvedShots = graph.chain.shots.map((shot, index) => ({
      ...shot,
      firstFrameAssetId: `approved-frame-${index + 1}`,
      keyframeRevision: 1,
      keyframeStatus: 'approved' as const,
      status: 'approved' as const,
    }));
    graph.chain.shots = approvedShots;
    graph.nodes[1].data = { ...graph.nodes[1].data, chainStoryboard: graph.chain };
    graph.nodes.push({
      id: 'clip',
      type: 'clip-gen',
      position: { x: 240, y: 0 },
      data: { videoGenMode: 'image-to-video' },
    });
    graph.edges.push({ id: 'e2', source: 'director', target: 'clip' });
    pushKeyframesToClipGen({
      deskBlockId: 'director',
      nodes: graph.nodes,
      edges: graph.edges,
      updateNodeData: graph.updateNodeData,
      shots: approvedShots,
      episodeId: 'ep-1',
    });
    graph.chain.shots = graph.chain.shots.map((shot) => shot.id === 's2'
      ? {
          ...shot,
          firstFrameAssetId: 'newer-frame',
          keyframeRevision: 2,
        }
      : shot);
    graph.nodes[1].data = { ...graph.nodes[1].data, chainStoryboard: graph.chain };
    const proxyVideo = vi.spyOn(api, 'proxyVideo');
    try {
      const progress: Array<{ phase: string }> = [];
      await runFlowBatch(
        graph.nodes,
        graph.edges,
        graph.updateNodeData,
        (state) => progress.push(state),
        undefined,
        new Set(['clip']),
      );

      expect(progress.at(-1)?.phase).toBe('blocked');
      expect(proxyVideo).not.toHaveBeenCalled();
      expect((graph.nodes[2].data.directorKeyframeBatch as { status: string }).status).toBe('stale');
    } finally {
      proxyVideo.mockRestore();
    }
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
    const shot = makeShot({
      id: 's1',
      index: 1,
      firstFrameAssetId: null,
      lineArtUrl: 'line-art-url',
    });
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
    const generated = (nodes[1].data.chainStoryboard as typeof chain).shots[0];
    expect(generated.firstFrameAssetId).toBe('generated-keyframe-url');
    expect(generated.firstFrameAssetId).not.toBe(generated.lineArtUrl);
    expect(generated.keyframeRevision).toBe(1);
    expect(generated.keyframeProvenance).toMatchObject({
      role: 'director-color-keyframe',
      generator: 'picture-gen',
      sourceLineArtUrl: 'line-art-url',
      batchId: expect.any(String),
      promptHash: expect.any(String),
      usedRefs: expect.any(Array),
      colorCheck: expect.objectContaining({ verdict: expect.stringMatching(/color|unknown|suspect-monochrome/) }),
    });
    expect(generated.keyframeStatus).not.toBe('failed');
  });

  it('suspect-monochrome keeps the URL and forces review, never failed', async () => {
    const shot = makeShot({ id: 's1', index: 1, firstFrameAssetId: null });
    const chain = { version: 2 as const, activeEpisodeId: 'ep-1', shots: [shot] };
    const nodes: Node[] = [
      { id: 'desk', type: 'director-desk', position: { x: 0, y: 0 }, data: {} },
      { id: 'sb', type: 'storyboard-desk', position: { x: 100, y: 0 }, data: { chainStoryboard: chain } },
    ];
    const edges: Edge[] = [{ id: 'e1', source: 'sb', target: 'desk' }];
    const summary = await runDirectorDeskBatch({
      shots: [shot],
      shotIds: ['s1'],
      filter: 'selected',
      skipExisting: false,
      skipApproved: false,
      forceCharacterRef: false,
      forceSceneRef: false,
      reviewMode: 'auto',
      maxRetries: 0,
      inspectKeyframeColor: async () => ({ verdict: 'suspect-monochrome', chromaMean: 0 }),
      patchShot: (id, patch) => {
        patchUpstreamShot((nodeId, nodePatch) => {
          const node = nodes.find((item) => item.id === nodeId);
          if (node) node.data = { ...node.data, ...nodePatch };
        }, 'desk', nodes, edges, id, patch);
      },
    });
    expect(summary.done).toBe(1);
    expect(summary.failed).toBe(0);
    const generated = (nodes[1].data.chainStoryboard as typeof chain).shots[0];
    expect(generated.firstFrameAssetId).toBe('generated-keyframe-url');
    expect(generated.keyframeStatus).toBe('review');
    expect(generated.status).toBe('review');
    expect(generated.keyframeProvenance?.colorCheck?.verdict).toBe('suspect-monochrome');
  });

  it('unknown color check does not block auto-approve', async () => {
    const shot = makeShot({ id: 's1', index: 1, firstFrameAssetId: null });
    const chain = { version: 2 as const, activeEpisodeId: 'ep-1', shots: [shot] };
    const nodes: Node[] = [
      { id: 'desk', type: 'director-desk', position: { x: 0, y: 0 }, data: {} },
      { id: 'sb', type: 'storyboard-desk', position: { x: 100, y: 0 }, data: { chainStoryboard: chain } },
    ];
    const edges: Edge[] = [{ id: 'e1', source: 'sb', target: 'desk' }];
    await runDirectorDeskBatch({
      shots: [shot],
      shotIds: ['s1'],
      filter: 'selected',
      skipExisting: false,
      skipApproved: false,
      forceCharacterRef: false,
      forceSceneRef: false,
      reviewMode: 'auto',
      maxRetries: 0,
      inspectKeyframeColor: async () => { throw new Error('inspect down'); },
      patchShot: (id, patch) => {
        patchUpstreamShot((nodeId, nodePatch) => {
          const node = nodes.find((item) => item.id === nodeId);
          if (node) node.data = { ...node.data, ...nodePatch };
        }, 'desk', nodes, edges, id, patch);
      },
    });
    const generated = (nodes[1].data.chainStoryboard as typeof chain).shots[0];
    expect(generated.keyframeStatus).toBe('approved');
    expect(generated.keyframeProvenance?.colorCheck?.verdict).toBe('unknown');
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

  it('requires full-color cinematic keyframe wording', () => {
    const shot = makeShot({ id: 's1', index: 1, lineArtUrl: 'line.png' });
    const built = buildShotPrompt(shot, [], {
      forceCharacterRef: false,
      forceSceneRef: false,
      preferLineArtRef: true,
      lineArtByShotId: { s1: 'line.png' },
    });
    expect(built.prompt.toLowerCase()).toMatch(/full-color/);
    expect(built.prompt.toLowerCase()).toMatch(/keyframe|cinematic/);
  });
});

describe('openReviewAfterDirectorBatch scope', () => {
  it('uses explicit shots and does not invent pending from empty scope', () => {
    const shots = [
      makeShot({
        id: 's1',
        index: 1,
        episodeId: 'ep-a',
        firstFrameAssetId: 'https://cdn.example/a.png',
        keyframeStatus: 'review',
        status: 'review',
      }),
      makeShot({
        id: 's2',
        index: 2,
        episodeId: 'ep-b',
        firstFrameAssetId: 'https://cdn.example/b.png',
        keyframeStatus: 'review',
        status: 'review',
      }),
    ];
    const result = openReviewAfterDirectorBatch({
      deskBlockId: 'desk',
      nodes: [],
      edges: [],
      updateNodeData: () => undefined,
      shots: shots.filter((s) => s.episodeId === 'ep-a'),
      episodeId: 'ep-a',
      sourceChainDeskId: 'sb-1',
      succeededShotIds: ['s1'],
      openSession: false,
    });
    expect(result.pendingIndices).toEqual([1]);
    expect(result.gatePassed).toBe(false);
  });
});

describe('双集 / 多链 / 刷新持久化', () => {
  it('run context only queues the handoff episode', () => {
    const shots = [
      makeShot({ id: 'a1', index: 1, episodeId: 'ep-a', lineArtUrl: 'a-line' }),
      makeShot({ id: 'b1', index: 1, episodeId: 'ep-b', lineArtUrl: 'b-line' }),
    ];
    const chain = {
      version: 2 as const,
      activeEpisodeId: 'ep-b',
      confirmedEpisodeIds: ['ep-a', 'ep-b'],
      episodes: [
        { id: 'ep-a', index: 1, title: 'A', status: 'in_progress' as const },
        { id: 'ep-b', index: 2, title: 'B', status: 'in_progress' as const },
      ],
      shots,
    };
    const handoff = {
      episodeId: 'ep-a',
      scriptHash: 'script-1',
      storyboardHash: chainStoryboardHash(chain, 'ep-a'),
      lineartVersion: lineArtVersionHash(chain, 'ep-a'),
      hashSchemaVersion: CHAIN_STORYBOARD_HANDOFF_HASH_SCHEMA_VERSION,
      handoffVersion: 1,
      confirmedAt: '2026-08-12T00:00:00.000Z',
      confirmed: true,
    };
    const nodes: Node[] = [
      { id: 'director', type: 'director-desk', position: { x: 0, y: 0 }, data: { lastHandoff: handoff } },
      {
        id: 'storyboard',
        type: 'storyboard-desk',
        position: { x: -200, y: 0 },
        data: { chainStoryboard: chain, breakdownJob: { sourcePackageHash: 'script-1' } },
      },
    ];
    const edges: Edge[] = [{ id: 'e1', source: 'storyboard', target: 'director' }];
    const context = resolveDirectorRunContext({
      deskBlockId: 'director',
      nodes,
      edges,
      updateNodeData: () => undefined,
    });
    expect(context.status).toBe('ready');
    expect(context.shots.map((s) => s.id)).toEqual(['a1']);
    expect(context.lineArtByShotId).toEqual({ a1: 'a-line' });
    expect(context.patchShot?.('b1', { firstFrameAssetId: 'leak' })).toBe(false);
  });

  it('patching chain A does not mutate chain B', () => {
    const chainA = {
      version: 2 as const,
      activeEpisodeId: 'ep-1',
      shots: [makeShot({ id: 'a1', index: 1, episodeId: 'ep-1' })],
    };
    const chainB = {
      version: 2 as const,
      activeEpisodeId: 'ep-1',
      shots: [makeShot({ id: 'b1', index: 1, episodeId: 'ep-1', firstFrameAssetId: 'keep-me' })],
    };
    const nodes: Node[] = [
      { id: 'desk-a', type: 'director-desk', position: { x: 0, y: 0 }, data: {} },
      { id: 'sb-a', type: 'storyboard-desk', position: { x: 100, y: 0 }, data: { chainStoryboard: chainA } },
      { id: 'desk-b', type: 'director-desk', position: { x: 0, y: 200 }, data: {} },
      { id: 'sb-b', type: 'storyboard-desk', position: { x: 100, y: 200 }, data: { chainStoryboard: chainB } },
    ];
    const edges: Edge[] = [
      { id: 'ea', source: 'sb-a', target: 'desk-a' },
      { id: 'eb', source: 'sb-b', target: 'desk-b' },
    ];
    const updateNodeData = (id: string, patch: Record<string, unknown>) => {
      const node = nodes.find((item) => item.id === id);
      if (node) node.data = { ...node.data, ...patch };
    };
    expect(patchUpstreamShot(updateNodeData, 'desk-a', nodes, edges, 'a1', {
      firstFrameAssetId: 'a-frame',
    })).toBe(true);
    const a = (nodes.find((n) => n.id === 'sb-a')!.data as { chainStoryboard: typeof chainA }).chainStoryboard;
    const b = (nodes.find((n) => n.id === 'sb-b')!.data as { chainStoryboard: typeof chainB }).chainStoryboard;
    expect(a.shots[0].firstFrameAssetId).toBe('a-frame');
    expect(b.shots[0].firstFrameAssetId).toBe('keep-me');
  });

  it('chainStoryboard JSON round-trip keeps director keyframe fields', () => {
    const chain = {
      version: 2 as const,
      activeEpisodeId: 'ep-1',
      shots: [
        makeShot({
          id: 's1',
          index: 1,
          episodeId: 'ep-1',
          firstFrameAssetId: 'https://cdn.example/k.png',
          keyframeRevision: 3,
          keyframeStatus: 'approved',
          keyframeProvenance: {
            role: 'director-color-keyframe',
            generator: 'picture-gen',
            generatedAt: '2026-08-12T00:00:00.000Z',
            colorCheck: { verdict: 'color', chromaMean: 40 },
          },
        }),
      ],
    };
    const restored = JSON.parse(JSON.stringify(chain)) as typeof chain;
    expect(restored.shots[0].firstFrameAssetId).toBe('https://cdn.example/k.png');
    expect(restored.shots[0].keyframeRevision).toBe(3);
    expect(restored.shots[0].keyframeProvenance?.colorCheck?.verdict).toBe('color');
  });
});
