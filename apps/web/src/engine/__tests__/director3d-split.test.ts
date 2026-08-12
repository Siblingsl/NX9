import { describe, expect, it } from 'vitest';
import {
  applySplitMixedDirector3dGraph,
  needsDirector3dSplit,
  splitMixedDirector3dNode,
} from '../director3d-split';

describe('director3d-split', () => {
  it('detects mixed production + 3d state that needs a split', () => {
    expect(needsDirector3dSplit('director-desk', {
      migratedFrom: 'director-3d',
      sceneByShot: { shotA: { version: 2, shotId: 'shotA', candidates: [] } },
      batchSummary: { done: 1 },
    })).toBe(true);

    expect(needsDirector3dSplit('director-desk', {
      director3dMigrationDecision: 'split-required',
      director3d: {
        sceneByShot: { shotA: { version: 2, shotId: 'shotA', candidates: [] } },
      },
      lastResults: [{ shotId: 'shotA', ok: true }],
    })).toBe(true);

    expect(needsDirector3dSplit('director-desk', {
      director3dMigrationDecision: 'split-done',
      sceneByShot: { shotA: { version: 2, shotId: 'shotA', candidates: [] } },
      batchSummary: { done: 1 },
    })).toBe(false);
  });

  it('creates an independent director-3d node and strips 3d ownership from desk', () => {
    const result = splitMixedDirector3dNode({
      directorDeskId: 'desk',
      now: '2026-08-12T00:00:00.000Z',
      nodes: [
        {
          id: 'desk',
          type: 'director-desk',
          position: { x: 100, y: 200 },
          data: {
            migratedFrom: 'director-3d',
            batchSummary: { done: 2 },
            lastResults: [{ shotId: 'shotA', ok: true }],
            sceneByShot: {
              shotA: { version: 2, shotId: 'shotA', candidates: [{ id: 'c1' }] },
            },
            sceneTemplates: { room: { id: 'room', name: '房间' } },
            stylePrompt: 'keep me',
          },
        },
      ],
      edges: [],
    });

    expect(result.ok).toBe(true);
    expect(result.createdNode).toBe(true);
    expect(result.newNode?.type).toBe('director-3d');
    expect(result.newNode?.data).toMatchObject({
      sceneByShot: {
        shotA: { version: 2, shotId: 'shotA' },
      },
      sceneTemplates: { room: { id: 'room', name: '房间' } },
      restoredFrom: 'director-3d-split-mixed',
    });
    expect(result.directorData).toMatchObject({
      stylePrompt: 'keep me',
      batchSummary: { done: 2 },
      director3dMigrationDecision: 'split-done',
      director3dSplitNodeId: result.director3dNodeId,
    });
    expect(result.directorData?.sceneByShot).toBeUndefined();
    expect(result.directorData?.migratedFrom).toBeUndefined();
    expect(result.newEdge).toMatchObject({
      source: 'desk',
      target: result.director3dNodeId,
      sourceHandle: 'exec-3d',
      targetHandle: 'exec-3d',
    });

    const graph = applySplitMixedDirector3dGraph({
      nodes: [
        {
          id: 'desk',
          type: 'director-desk',
          position: { x: 100, y: 200 },
          data: {
            migratedFrom: 'director-3d',
            batchSummary: { done: 2 },
            sceneByShot: { shotA: { version: 2, shotId: 'shotA', candidates: [] } },
          },
        } as any,
      ],
      edges: [],
      result,
    });
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes.find((node) => node.type === 'director-3d')?.id).toBe(result.director3dNodeId);
    expect(graph.edges).toHaveLength(1);
  });

  it('merges into an already attached director-3d node instead of spawning another', () => {
    const result = splitMixedDirector3dNode({
      directorDeskId: 'desk',
      now: '2026-08-12T00:00:00.000Z',
      nodes: [
        {
          id: 'desk',
          type: 'director-desk',
          position: { x: 0, y: 0 },
          data: {
            director3dMigrationDecision: 'split-required',
            lastResults: [{ shotId: 'shotA', ok: true }],
            sceneByShot: {
              shotA: { version: 2, shotId: 'shotA', candidates: [{ id: 'from-desk' }] },
            },
          },
        },
        {
          id: 'd3',
          type: 'director-3d',
          position: { x: 0, y: -200 },
          data: {
            sceneByShot: {
              shotB: { version: 2, shotId: 'shotB', candidates: [{ id: 'existing' }] },
            },
          },
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'desk',
          target: 'd3',
          sourceHandle: 'exec-3d',
          targetHandle: 'exec-3d',
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.createdNode).toBe(false);
    expect(result.externalNodeId).toBe('d3');
    expect(result.externalData?.sceneByShot).toMatchObject({
      shotA: { shotId: 'shotA' },
      shotB: { shotId: 'shotB' },
    });
    expect(result.newNode).toBeUndefined();
    expect(result.newEdge).toBeUndefined();
  });
});
