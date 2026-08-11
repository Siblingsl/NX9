/**
 * StoryboardDeskBlock test suite.
 *
 * Coverage: Q-02 关键行为测 — runner pure functions.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { removeShotFromBreakdown, resolveDeskActiveEpisodeId, stripEpisodeConfirmation, reorderShotsInBreakdown, mergeIncrementalBreakdown } from '../../../engine/storyboard-desk-runner';
import { migrateUpstreamChainStoryboard, resolveConnectedStoryboardDeskId, validateDirectorHandoff } from '../../../engine/chain-storyboard-utils';
import { activeChainEpisodeShots, buildLineArtShotPatch, chainStoryboardHash, getEpisodeContactSheet, emptyStoryboardPreview, lineArtVersionHash, patchChainShot, scopeStoryboardPreviewFrames, type ScriptBreakdownPayload, type StoryboardPreviewPayload } from '@nx9/shared';

// Mock dependencies for component smoke test
vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual('@xyflow/react');
  return {
    ...actual,
    useReactFlow: () => ({
      updateNodeData: vi.fn(),
      fitView: vi.fn(),
      getNodes: () => [],
      getEdges: () => [],
    }),
    useNodes: () => [],
    useEdges: () => [],
    useNodesData: () => ({}),
  };
});

vi.mock('../../../stores/workspace-document', () => {
  const state = {
    storyboard: {
      title: '\u6D4B\u8BD5\u9879\u76EE',
      activeEpisodeId: 'ep-1',
      episodes: [{ id: 'ep-1', index: 1, title: '\u7B2C1\u96C6' }],
      shots: [],
      version: 3,
    },
    characters: { characters: [] },
    environments: { environments: [] },
    backlotWorkspace: { items: [] },
    scriptPlan: null,
    setStoryboard: vi.fn(),
    updateShot: vi.fn(),
    addShots: vi.fn(),
  };
  const fn = (selector?: any) => (selector ? selector(state) : state);
  fn.getState = () => state;
  return {
    useWorkspaceDocument: fn,
  };
});

vi.mock('../../shared/BlockShell', () => ({
  BlockShell: ({ children }: any) => <div data-testid="block-shell">{children}</div>,
}));

vi.mock('../../../hooks/use-connected-picture-models', () => ({
  useConnectedPictureModels: () => ({
    embed: vi.fn(),
    isEmbedding: false,
    embedError: null,
  }),
}));

function makeBasePayload(shotCount = 3): ScriptBreakdownPayload {
  return {
    version: 1,
    title: 'test',
    sourceText: 'test source',
    generatedAt: new Date().toISOString(),
    episodes: [
      {
        id: 'ep-1',
        index: 1,
        title: '第1集',
        logline: '',
        shots: Array.from({ length: shotCount }, (_, i) => ({
          id: `shot-${i + 1}`,
          episodeId: 'ep-1',
          episodeIndex: 0,
          index: i + 1,
          sceneId: `scene-${i + 1}`,
          sceneCode: `SC${String(i + 1).padStart(2, '0')}`,
          scene: '走廊',
          title: `镜${i + 1}`,
          durationSec: 3,
          shotSize: 'CU' as const,
          characters: [],
          imagePrompt: 'test prompt',
          videoPrompt: '',
          scriptText: 'test',
          dialogue: [],
          status: 'draft',
        })),
      },
    ],
  };
}

describe('removeShotFromBreakdown', () => {
  it('removes a shot and renumbers indices', () => {
    const payload = makeBasePayload(3);
    const result = removeShotFromBreakdown(payload, 'shot-2');
    const shots = result.episodes[0].shots;
    expect(shots.length).toBe(2);
    expect(shots[0].id).toBe('shot-1');
    expect(shots[0].index).toBe(1);
    expect(shots[1].id).toBe('shot-3');
    expect(shots[1].index).toBe(2);
  });

  it('returns original payload when shot not found', () => {
    const payload = makeBasePayload(3);
    const result = removeShotFromBreakdown(payload, 'nonexistent');
    expect(result.episodes[0].shots.length).toBe(3);
  });

  it('refuses to delete the last shot in an episode', () => {
    const payload = makeBasePayload(1);
    const result = removeShotFromBreakdown(payload, 'shot-1');
    expect(result.episodes[0].shots.length).toBe(1);
  });
});

describe('stripEpisodeConfirmation', () => {
  it('removes the specified episode from confirmedEpisodeIds', () => {
    const result = stripEpisodeConfirmation(
      { confirmedEpisodeIds: ['ep-1', 'ep-2'], gridConfirmed: true },
      'ep-1',
    );
    expect(result.gridConfirmed).toBe(false);
    expect(result.confirmedEpisodeIds).toEqual(['ep-2']);
  });

  it('returns empty array when confirmedEpisodeIds is not an array', () => {
    const result = stripEpisodeConfirmation({}, 'ep-1');
    expect(result.gridConfirmed).toBe(false);
    expect(result.confirmedEpisodeIds).toEqual([]);
  });

  it('returns empty array when data is null/undefined', () => {
    const result = stripEpisodeConfirmation(null, 'ep-1');
    expect(result.gridConfirmed).toBe(false);
    expect(result.confirmedEpisodeIds).toEqual([]);
  });
});

describe('getEpisodeContactSheet', () => {
  it('returns per-episode contact sheet', () => {
    const preview: StoryboardPreviewPayload = {
      ...emptyStoryboardPreview(),
      contactSheetsByEpisode: {
        'ep-1': { url: 'https://a.com/sheet-ep1.png', signature: 'sig1' },
        'ep-2': { url: 'https://a.com/sheet-ep2.png', signature: 'sig2' },
      },
    };
    const ep1 = getEpisodeContactSheet(preview, 'ep-1');
    expect(ep1.url).toBe('https://a.com/sheet-ep1.png');
    expect(ep1.signature).toBe('sig1');

    const ep2 = getEpisodeContactSheet(preview, 'ep-2');
    expect(ep2.url).toBe('https://a.com/sheet-ep2.png');
    expect(ep2.signature).toBe('sig2');
  });

  it('does not fall back to another scope when per-episode is missing', () => {
    const preview: StoryboardPreviewPayload = {
      ...emptyStoryboardPreview(),
      contactSheetUrl: 'https://a.com/sheet-global.png',
      contactSheetSignature: 'sig-global',
    };
    const ep1 = getEpisodeContactSheet(preview, 'ep-1');
    expect(ep1.url).toBe(null);
    expect(ep1.signature).toBe(null);
  });

  it('returns null when no preview', () => {
    const result = getEpisodeContactSheet(undefined, 'ep-1');
    expect(result.url).toBe(null);
    expect(result.signature).toBe(null);
  });
});

describe('line-art/keyframe contract', () => {
  it('stores line art separately without changing director keyframe fields', () => {
    const shot = {
      id: 'shot-1',
      index: 1,
      durationSec: 4,
      shotType: 'medium',
      descriptionZh: '测试镜头',
      promptEn: 'test',
      status: 'review',
      firstFrameAssetId: 'color-keyframe-url',
      keyframeStatus: 'approved',
    } as any;
    const [patched] = patchChainShot(
      { version: 2, shots: [shot] },
      'shot-1',
      buildLineArtShotPatch('line-art-url', 'line prompt'),
    );

    expect(patched.lineArtUrl).toBe('line-art-url');
    expect(patched.sketchPrompt).toBe('line prompt');
    expect(patched.firstFrameAssetId).toBe('color-keyframe-url');
    expect(patched.keyframeStatus).toBe('approved');
  });
});

describe('global storyboard migration boundary', () => {
  it('migrates an old desk once and records migration metadata', () => {
    const nodes: any[] = [
      { id: 'director', type: 'director-desk', data: {} },
      { id: 'storyboard', type: 'storyboard-desk', data: {} },
    ];
    const globalShot = {
      id: 'shot-1',
      index: 1,
      durationSec: 4,
      shotType: 'medium',
      descriptionZh: '测试镜头',
      promptEn: 'test',
      status: 'draft',
    };
    const writes: Array<{ id: string; data: Record<string, unknown> }> = [];
    const migrated = migrateUpstreamChainStoryboard(
      (id, data) => writes.push({ id, data }),
      'director',
      nodes,
      [{ source: 'storyboard', target: 'director' }],
      { title: '旧项目', activeEpisodeId: 'ep-1', shots: [globalShot as any] },
      '2026-08-04T00:00:00.000Z',
    );

    expect(migrated).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      id: 'storyboard',
      data: {
        storyboardSchemaVersion: 1,
        migratedFromGlobalStoryboard: true,
        migratedAt: '2026-08-04T00:00:00.000Z',
      },
    });
    expect((writes[0].data.chainStoryboard as any).shots).toEqual([globalShot]);

    nodes[1].data = writes[0].data;
    expect(migrateUpstreamChainStoryboard(
      (id, data) => writes.push({ id, data }),
      'director',
      nodes,
      [{ source: 'storyboard', target: 'director' }],
      { title: '新全局数据不应覆盖', shots: [{ ...globalShot, id: 'wrong' } as any] },
      '2026-08-04T00:00:01.000Z',
    )).toBe(false);
    expect(writes).toHaveLength(1);
  });
});

describe('episode scope boundary', () => {
  it('returns no shots instead of falling back to the full chain', () => {
    const shots = activeChainEpisodeShots({
      version: 2,
      activeEpisodeId: 'ep-missing',
      shots: [{ id: 'shot-1', episodeId: 'ep-1' } as any],
    });
    expect(shots).toEqual([]);
  });
});

describe('handoff hash contract', () => {
  it('hashes chain content stably and scopes line-art version to the episode', () => {
    const chain = {
      version: 2 as const,
      activeEpisodeId: 'ep-1',
      shots: [
        { id: 'shot-2', episodeId: 'ep-2', lineArtUrl: 'line-2' },
        { id: 'shot-1', episodeId: 'ep-1', lineArtUrl: 'line-1' },
      ] as any,
    };
    const reordered = { ...chain, shots: [...chain.shots].reverse() };
    expect(chainStoryboardHash(chain)).not.toBe(chainStoryboardHash(reordered));
    expect(lineArtVersionHash(chain, 'ep-1')).toBe(lineArtVersionHash(reordered, 'ep-1'));
    expect(lineArtVersionHash(chain, 'ep-1')).not.toBe(lineArtVersionHash(chain, 'ep-2'));

    const handoff = {
      scriptHash: 'script-1',
      storyboardHash: chainStoryboardHash(chain),
      lineartVersion: lineArtVersionHash(chain, 'ep-1'),
      handoffVersion: 1,
      confirmedAt: '2026-08-04T00:00:00.000Z',
    };
    expect(validateDirectorHandoff({ handoff, chain, episodeId: 'ep-1', scriptHash: 'script-1' }).valid).toBe(true);
    expect(validateDirectorHandoff({ handoff: { ...handoff, scriptHash: 'old' }, chain, episodeId: 'ep-1', scriptHash: 'script-1' }).valid).toBe(false);
  });
});

describe('preview episode scope', () => {
  it('uses the displayed episode frames as the action scope', () => {
    const frames = [
      { id: 'f1', sourceShotId: 's1' },
      { id: 'f2', sourceShotId: 's2' },
    ] as any;
    expect(scopeStoryboardPreviewFrames(frames, new Set(['s2']))).toEqual([frames[1]]);
  });
});

describe('connected handoff target', () => {
  it('selects a connected storyboard desk instead of the first canvas desk', () => {
    const nodes: any[] = [
      { id: 'script', type: 'script-desk', data: {} },
      { id: 'unrelated', type: 'storyboard-desk', data: {} },
      { id: 'connected', type: 'storyboard-desk', data: {} },
    ];
    expect(resolveConnectedStoryboardDeskId(
      'script',
      nodes,
      [{ source: 'script', target: 'connected' }],
    )).toBe('connected');
  });
});

describe('desk episode scope', () => {
  it('reads the active episode from node data, not the global workspace', () => {
    const payload = makeBasePayload(1);
    payload.episodes.push({ id: 'ep-2', index: 2, title: '第2集', shots: [] });
    expect(resolveDeskActiveEpisodeId({ activeEpisodeId: 'ep-2' }, payload)).toBe('ep-2');
    expect(resolveDeskActiveEpisodeId({ activeEpisodeId: 'ep-old' }, payload)).toBe('ep-1');
  });
});

describe('reorderShotsInBreakdown', () => {
  it('reorders shots within an episode and reindexes', () => {
    const payload = makeBasePayload(3);
    const result = reorderShotsInBreakdown(payload, 'ep-1', ['shot-3', 'shot-1', 'shot-2']);
    const shots = result.episodes[0].shots;
    expect(shots.map((s) => s.id)).toEqual(['shot-3', 'shot-1', 'shot-2']);
    expect(shots[0].index).toBe(1);
    expect(shots[1].index).toBe(2);
    expect(shots[2].index).toBe(3);
  });

  it('returns unchanged payload when episode not found', () => {
    const payload = makeBasePayload(3);
    const result = reorderShotsInBreakdown(payload, 'ep-fake', ['shot-3', 'shot-2', 'shot-1']);
    expect(result.episodes[0].shots.map((s) => s.id)).toEqual(['shot-1', 'shot-2', 'shot-3']);
  });

  it('returns unchanged payload when ordered list is incomplete', () => {
    const payload = makeBasePayload(4);
    const result = reorderShotsInBreakdown(payload, 'ep-1', ['shot-4', 'shot-2', 'fake']);
    const shots = result.episodes[0].shots;
    expect(shots.length).toBe(4);
    expect(shots.map((s) => s.id)).toEqual(['shot-1', 'shot-2', 'shot-3', 'shot-4']);
  });
});

describe('mergeIncrementalBreakdown', () => {
  it('appends new shots to existing episode', () => {
    const existing = makeBasePayload(2);
    const incremental: ScriptBreakdownPayload = {
      version: 1,
      title: 'inc',
      sourceText: 'inc source',
      generatedAt: new Date().toISOString(),
      episodes: [
        {
          id: 'ep-1',
          index: 1,
          title: '第1集',
          logline: '',
          shots: [
            { ...existing.episodes[0].shots[0]!, id: 'shot-new-1', index: 99 },
          ],
        },
      ],
    };
    const result = mergeIncrementalBreakdown(existing, incremental);
    expect(result.episodes[0].shots.length).toBe(3);
    expect(result.episodes[0].shots.map((s) => s.id)).toContain('shot-new-1');
  });

  it('does not duplicate existing shots', () => {
    const existing = makeBasePayload(2);
    const incremental: ScriptBreakdownPayload = {
      version: 1,
      title: 'inc',
      sourceText: 'inc source',
      generatedAt: new Date().toISOString(),
      episodes: [
        {
          id: 'ep-1',
          index: 1,
          title: '第1集',
          logline: '',
          shots: [
            { ...existing.episodes[0].shots[0]!, id: 'shot-1', index: 99 },
            { ...existing.episodes[0].shots[0]!, id: 'shot-new-1', index: 98 },
          ],
        },
      ],
    };
    const result = mergeIncrementalBreakdown(existing, incremental);
    expect(result.episodes[0].shots.length).toBe(3);
  });

  it('adds new episode when episode id is novel', () => {
    const existing = makeBasePayload(2);
    const incremental: ScriptBreakdownPayload = {
      version: 1,
      title: 'inc',
      sourceText: 'inc source',
      generatedAt: new Date().toISOString(),
      episodes: [
        {
          id: 'ep-new',
          index: 2,
          title: '新集',
          logline: '',
          shots: [
            { ...existing.episodes[0].shots[0]!, id: 'shot-ep2-1', index: 1 },
          ],
        },
      ],
    };
    const result = mergeIncrementalBreakdown(existing, incremental);
    expect(result.episodes.length).toBe(2);
    expect(result.episodes[1].id).toBe('ep-new');
    expect(result.episodes[1].shots.length).toBe(1);
  });
});

describe('StoryboardDeskBlock', () => {
  it('renders without crashing', async () => {
    const StoryboardDeskBlock = (await import('../StoryboardDeskBlock')).default;
    const props = {
      id: 'test-desk-1',
      type: 'storyboard-desk',
      data: {},
      position: { x: 0, y: 0 },
      selected: false,
      dragging: false,
      zIndex: 0,
    } as any;

    expect(() => {
      render(
        <ReactFlowProvider>
          <StoryboardDeskBlock {...props} />
        </ReactFlowProvider>
      );
    }).not.toThrow();
  });
});
