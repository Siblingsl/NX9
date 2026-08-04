import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import type { Director3dCommitPayload, Director3dShotState } from '@nx9/director3d';
import { createDirector3dCommitAdapter } from '../director3d-commit-adapter';

function state(shotId: string): Director3dShotState {
  return {
    version: 2,
    stateVersion: 3,
    shotId,
    episodeId: 'ep-1',
    sourceShotRevision: 7,
    environment: { backgroundColor: '#111', groundVisible: true, groundOpacity: 0.7 },
    objects: [],
    camera: {
      position: [0, 1, 5],
      target: [0, 1, 0],
      rotation: [0, 0, 0],
      fov: 50,
      aspectRatio: '16:9',
    },
    candidates: [],
    selectedCandidateId: 'candidate-1',
    committedCandidateId: null,
    dirty: false,
    updatedAt: new Date().toISOString(),
  };
}

function payload(shotId = 'shot-1', commitId = 'commit-1'): Director3dCommitPayload {
  const sceneState = state(shotId);
  return {
    version: 1,
    commitId,
    blockId: 'director-1',
    shotId,
    episodeId: 'ep-1',
    sourceShotRevision: 7,
    candidate: {
      id: 'candidate-1',
      shotId,
      stateVersion: 3,
      localDataUrl: 'data:image/png;base64,frame',
      camera: sceneState.camera,
      characterPlacements: [],
      prompt: 'camera prompt',
      status: 'ready',
      createdAt: new Date().toISOString(),
    },
    sceneState,
    committedAt: new Date().toISOString(),
  };
}

function harness(withUpstream = true) {
  const upstreamData: Record<string, unknown> = withUpstream
    ? { chainStoryboard: { version: 2, shots: [{ id: 'shot-1', index: 1, status: 'draft' }] } }
    : {};
  const nodes = [
    { id: 'storyboard-1', type: 'storyboard-desk', data: upstreamData },
    { id: 'director-1', type: 'director-desk', data: {} },
  ] as Node[];
  const edges = [{ source: 'storyboard-1', target: 'director-1' }];
  const writes: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const updateNodeData = (id: string, patch: Record<string, unknown>) => {
    const node = nodes.find((item) => item.id === id);
    if (node) node.data = { ...node.data, ...patch };
    writes.push({ id, patch });
  };
  return { nodes, edges, writes, updateNodeData };
}

describe('director3d commit adapter', () => {
  it('writes only the current chain shot and never firstFrameAssetId', () => {
    const h = harness();
    const commit = createDirector3dCommitAdapter({
      blockId: 'director-1',
      nodes: h.nodes,
      edges: h.edges,
      updateNodeData: h.updateNodeData,
      currentSourceShotRevision: 7,
    });
    expect(commit(payload())).toMatchObject({ ok: true });
    const chain = h.nodes[0]?.data.chainStoryboard as { shots: Array<Record<string, unknown>> };
    expect(chain.shots[0]?.director3dGuide).toMatchObject({ shotId: 'shot-1', commitId: 'commit-1' });
    expect(chain.shots[0]).not.toHaveProperty('firstFrameAssetId');
  });

  it('rejects missing upstream, wrong revision, and wrong shot context', () => {
    const noUpstream = harness(false);
    expect(createDirector3dCommitAdapter({
      blockId: 'director-1', nodes: noUpstream.nodes, edges: noUpstream.edges,
      updateNodeData: noUpstream.updateNodeData,
    })(payload())).toMatchObject({ ok: false });

    const h = harness();
    expect(createDirector3dCommitAdapter({
      blockId: 'director-1', nodes: h.nodes, edges: h.edges, updateNodeData: h.updateNodeData,
      currentSourceShotRevision: 8,
    })(payload())).toMatchObject({ ok: false, error: '上游镜头版本已变化，请重新载入当前镜头' });
    expect(createDirector3dCommitAdapter({
      blockId: 'director-1', nodes: h.nodes, edges: h.edges, updateNodeData: h.updateNodeData,
    })(payload('shot-2'))).toMatchObject({ ok: false });
  });

  it('is idempotent for a repeated commit id', () => {
    const h = harness();
    const commit = createDirector3dCommitAdapter({
      blockId: 'director-1', nodes: h.nodes, edges: h.edges, updateNodeData: h.updateNodeData,
      currentSourceShotRevision: 7,
    });
    expect(commit(payload())).toMatchObject({ ok: true });
    const writesAfterFirst = h.writes.length;
    expect(commit(payload())).toMatchObject({ ok: true, idempotent: true });
    expect(h.writes.length).toBe(writesAfterFirst);
  });
});
