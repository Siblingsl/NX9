import { describe, expect, it } from 'vitest';
import {
  DIRECTOR3D_NODE_SCHEMA_VERSION,
  DIRECTOR3D_REVERSE_MIGRATION_VERSION,
  getSpawnableBlocks,
  migrateBlockKind,
  migrateBlockKinds,
} from '@nx9/shared';
import { blockTypes } from '../../blocks/registry';
import {
  copyEmbeddedDirector3dStateToExternal,
  resolveDirector3dHostContext,
  resolveEmbeddedDirector3dMigration,
} from '../director3d-host-controller';

describe('independent director-3d node identity', () => {
  it('is spawnable, registered, and stable across workspace migration', () => {
    expect(getSpawnableBlocks().some((block) => block.kind === 'director-3d')).toBe(true);
    expect(blockTypes['director-3d']).toBeDefined();
    expect(migrateBlockKind('director-3d')).toBe('director-3d');

    const result = migrateBlockKinds([
      {
        id: '3d-live',
        type: 'director-3d',
        data: {
          schemaVersion: DIRECTOR3D_NODE_SCHEMA_VERSION,
          sceneByShot: {},
        },
      },
    ]);
    expect(result.migratedCount).toBe(0);
    expect(result.nodes[0]?.type).toBe('director-3d');
  });

  it('restores a historical pure 3D node that was merged into director-desk', () => {
    const result = migrateBlockKinds([
      {
        id: 'legacy-3d',
        type: 'director-desk',
        data: {
          migratedFrom: 'director-3d',
          migrationNote: '已从「director-3d」合并/迁移至「director-desk」',
          sceneByShot: {
            shotA: { version: 2, shotId: 'shotA', candidates: [] },
          },
        },
      },
    ]);

    expect(result.migratedCount).toBe(1);
    expect(result.nodes[0]?.type).toBe('director-3d');
    expect(result.nodes[0]?.data).toMatchObject({
      schemaVersion: DIRECTOR3D_NODE_SCHEMA_VERSION,
      director3dReverseMigrationVersion: DIRECTOR3D_REVERSE_MIGRATION_VERSION,
      restoredFrom: 'director-3d-merge-v1',
    });
    expect(result.nodes[0]?.data?.migratedFrom).toBeUndefined();
  });

  it('does not silently change a merged node that already produced keyframes', () => {
    const result = migrateBlockKinds([
      {
        id: 'mixed-production-node',
        type: 'director-desk',
        data: {
          migratedFrom: 'director-3d',
          scene: { version: 1 },
          batchSummary: { done: 2 },
          lastResults: [{ shotId: 'shotA', ok: true }],
        },
      },
    ]);

    expect(result.nodes[0]?.type).toBe('director-desk');
    expect(result.nodes[0]?.data).toMatchObject({
      director3dReverseMigrationVersion: DIRECTOR3D_REVERSE_MIGRATION_VERSION,
      director3dMigrationDecision: 'split-required',
    });
  });

  it('resolves one storage and one shot context for external and embedded hosts', () => {
    const nodes = [
      {
        id: 'storyboard',
        type: 'storyboard-desk',
        position: { x: 0, y: 0 },
        data: {
          chainStoryboard: {
            version: 2,
            activeEpisodeId: 'ep-1',
            confirmedEpisodeIds: ['ep-1'],
            episodes: [{ id: 'ep-1', index: 1, title: '第一集' }],
            shots: [
              {
                id: 'shot-1',
                episodeId: 'ep-1',
                index: 1,
                durationSec: 3,
                shotType: 'medium',
                descriptionZh: '人物进入房间',
                promptEn: 'character enters room',
                lineArtUrl: '/line/shot-1.png',
                status: 'draft',
              },
            ],
          },
        },
      },
      {
        id: 'director',
        type: 'director-desk',
        position: { x: 200, y: 0 },
        data: {
          linkedShotId: 'shot-1',
          lastHandoff: { episodeId: 'ep-1', confirmed: true },
        },
      },
      {
        id: 'director3d',
        type: 'director-3d',
        position: { x: 200, y: -200 },
        data: {
          schemaVersion: DIRECTOR3D_NODE_SCHEMA_VERSION,
          activeShotId: 'shot-1',
          sceneByShot: {},
        },
      },
    ] as never[];
    const edges = [
      { source: 'storyboard', target: 'director' },
      {
        source: 'director',
        target: 'director3d',
        sourceHandle: 'exec-3d',
        targetHandle: 'exec-3d',
      },
    ];

    const external = resolveDirector3dHostContext({
      contextBlockId: 'director3d',
      nodes,
      edges,
    });
    const embedded = resolveDirector3dHostContext({
      contextBlockId: 'director',
      nodes,
      edges,
    });

    expect(external.storageBlockId).toBe('director3d');
    expect(embedded.storageBlockId).toBe('director3d');
    expect(external.sourceChainDeskId).toBe('storyboard');
    expect(embedded.sourceChainDeskId).toBe('storyboard');
    expect(external.activeShotId).toBe('shot-1');
    expect(embedded.activeShotId).toBe('shot-1');
    expect(external.lineArtByShotId).toEqual({
      'shot-1': '/line/shot-1.png',
    });
    expect(embedded.lineArtByShotId).toEqual(
      external.lineArtByShotId,
    );
  });

  it('never merges embedded drafts silently and supports an explicit copy', () => {
    const nodes = [
      {
        id: 'director',
        type: 'director-desk',
        position: { x: 0, y: 0 },
        data: {
          director3d: {
            schemaVersion: DIRECTOR3D_NODE_SCHEMA_VERSION,
            sceneByShot: {
              'shot-1': {
                version: 2,
                stateVersion: 1,
                shotId: 'shot-1',
                candidates: [],
              },
            },
          },
        },
      },
      {
        id: 'director3d',
        type: 'director-3d',
        position: { x: 0, y: -200 },
        data: {
          schemaVersion: DIRECTOR3D_NODE_SCHEMA_VERSION,
          sceneByShot: {},
        },
      },
    ] as Array<{
      id: string;
      type: string;
      position: { x: number; y: number };
      data: Record<string, unknown>;
    }>;
    const edges = [
      {
        source: 'director',
        target: 'director3d',
        sourceHandle: 'exec-3d',
        targetHandle: 'exec-3d',
      },
    ];
    const before = resolveDirector3dHostContext({
      contextBlockId: 'director',
      nodes: nodes as never[],
      edges,
    });
    expect(before.storageBlockId).toBe('director3d');
    expect(
      (nodes[1].data.sceneByShot as Record<string, unknown>)['shot-1'],
    ).toBeUndefined();
    expect(
      resolveEmbeddedDirector3dMigration({
        contextBlockId: 'director',
        nodes: nodes as never[],
        edges,
      }),
    ).toMatchObject({ available: true, shotCount: 1 });

    const copied = copyEmbeddedDirector3dStateToExternal({
      contextBlockId: 'director',
      nodes: nodes as never[],
      edges,
      updateNodeData: (id, patch) => {
        const node = nodes.find((item) => item.id === id);
        if (node) node.data = { ...node.data, ...patch };
      },
    });

    expect(copied).toBe(true);
    expect(
      (nodes[1].data.sceneByShot as Record<string, unknown>)['shot-1'],
    ).toMatchObject({ shotId: 'shot-1' });
    expect(nodes[0].data.director3d).toMatchObject({
      copiedToStorageBlockId: 'director3d',
    });
  });
});
