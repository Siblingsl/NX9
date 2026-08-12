/**
 * StoryboardDeskBlock test suite.
 *
 * Coverage: Q-02 关键行为测 — runner pure functions.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { computeCompositionStats, captureDeskUndoSnapshot, deskLineArtUrl, mergeShotsInBreakdown, removeShotFromBreakdown, resolveDeskActiveEpisodeId, retiredShotIds, stripEpisodeConfirmation, reorderShotsInBreakdown, mergeIncrementalBreakdown, isShotComposed } from '../../../engine/storyboard-desk-runner';
import { migrateUpstreamChainStoryboard, resolveConnectedStoryboardDeskId, validateDirectorHandoff } from '../../../engine/chain-storyboard-utils';
import { activeChainEpisodeShots, buildLineArtShotPatch, CHAIN_STORYBOARD_HANDOFF_HASH_SCHEMA_VERSION, chainStoryboardHash, getEpisodeContactSheet, emptyStoryboardPreview, lineArtVersionHash, mergeStoryboardShotFromBreakdown, migrateLegacyLineArtShot, patchChainShot, scopeStoryboardPreviewFrames, storyboardShotsFromScriptBreakdown, type ScriptBreakdownPayload, type StoryboardPreviewPayload } from '@nx9/shared';

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
      {
        confirmedEpisodeIds: ['ep-1', 'ep-2'],
        gridConfirmed: true,
        chainStoryboard: {
          version: 2,
          confirmedEpisodeIds: ['ep-1', 'ep-2'],
          gridConfirmed: true,
          shots: [],
        },
      },
      'ep-1',
    );
    expect(result.gridConfirmed).toBe(false);
    expect(result.confirmedEpisodeIds).toEqual(['ep-2']);
    expect(result.chainStoryboard?.gridConfirmed).toBe(false);
    expect(result.chainStoryboard?.confirmedEpisodeIds).toEqual(['ep-2']);
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
  it('projects storyboard previews into lineArtUrl only', () => {
    const payload = makeBasePayload(1);
    payload.episodes[0].shots[0].previewImageUrl = 'line-art-url';
    payload.episodes[0].shots[0].status = 'approved';

    const [shot] = storyboardShotsFromScriptBreakdown(payload);

    expect(shot.lineArtUrl).toBe('line-art-url');
    expect(shot.firstFrameAssetId).toBeNull();
    expect(shot.keyframeStatus).toBe('draft');
    expect(shot.status).toBe('draft');
  });

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
    expect(patched.sourceRevision).toBe(1);
  });

  it('bumps sourceRevision only for upstream-owned shot content', () => {
    const shot = {
      id: 'shot-1',
      index: 1,
      durationSec: 4,
      shotType: 'medium',
      descriptionZh: '测试镜头',
      promptEn: 'test',
      status: 'review',
      sourceRevision: 3,
      lineArtUrl: 'line-art-url',
      firstFrameAssetId: 'color-keyframe-url',
    } as any;
    const chain = { version: 2 as const, shots: [shot] };
    const [keyframePatched] = patchChainShot(chain, 'shot-1', {
      firstFrameAssetId: 'new-keyframe',
      keyframeRevision: 4,
      director3dGuide: {
        sourceBlockId: 'director-3d',
        captureId: 'c1',
        captureUrl: 'guide',
        appliedAt: '2026-08-12T00:00:00.000Z',
      },
      videoAssetId: 'video-url',
    });
    expect(keyframePatched.sourceRevision).toBe(3);
    expect(keyframePatched.firstFrameAssetId).toBe('new-keyframe');

    const [descPatched] = patchChainShot(chain, 'shot-1', {
      descriptionZh: '改了描述',
    });
    expect(descPatched.sourceRevision).toBe(4);
  });

  it('keeps director production state when upstream line art changes', () => {
    const payload = makeBasePayload(1);
    payload.episodes[0].shots[0].previewImageUrl = 'new-line-art';
    const [base] = storyboardShotsFromScriptBreakdown(payload);
    const merged = mergeStoryboardShotFromBreakdown(base, {
      ...base,
      lineArtUrl: 'old-line-art',
      firstFrameAssetId: 'color-keyframe',
      keyframeStatus: 'approved',
      status: 'approved',
      videoAssetId: 'video-url',
      director3dGuide: {
        sourceBlockId: 'director-3d',
        captureId: 'capture-1',
        captureUrl: 'guide-url',
        appliedAt: '2026-08-12T00:00:00.000Z',
      },
      sketchApprovedAt: '2026-08-11T00:00:00.000Z',
    });

    expect(merged.lineArtUrl).toBe('new-line-art');
    expect(merged.sketchApprovedAt).toBeNull();
    expect(merged.firstFrameAssetId).toBe('color-keyframe');
    expect(merged.keyframeStatus).toBe('approved');
    expect(merged.videoAssetId).toBe('video-url');
    expect(merged.director3dGuide?.captureUrl).toBe('guide-url');
    expect(merged.sourceRevision).toBe(2);
  });

  it('migrates only high-confidence legacy line-art pollution', () => {
    const polluted = migrateLegacyLineArtShot({
      id: 'shot-1',
      index: 1,
      durationSec: 3,
      shotType: 'medium',
      descriptionZh: '测试',
      promptEn: 'test',
      status: 'approved',
      lineArtUrl: 'same-url',
      firstFrameAssetId: 'same-url',
      keyframeStatus: 'approved',
    });
    expect(polluted.migrated).toBe(true);
    expect(polluted.shot.lineArtUrl).toBe('same-url');
    expect(polluted.shot.firstFrameAssetId).toBeNull();
    expect(polluted.shot.keyframeStatus).toBe('draft');

    const reviewed = migrateLegacyLineArtShot({
      ...polluted.shot,
      firstFrameAssetId: 'same-url',
      reviewHistory: [{
        id: 'review-1',
        stage: 'keyframe',
        decision: 'approved',
        createdAt: '2026-08-12T00:00:00.000Z',
      }],
    });
    expect(reviewed.migrated).toBe(false);
    expect(reviewed.shot.firstFrameAssetId).toBe('same-url');
  });

  it('deskLineArtUrl ignores director keyframe URLs', () => {
    expect(deskLineArtUrl({ lineArtUrl: 'line.png' })).toBe('line.png');
    expect(deskLineArtUrl({ lineArtUrl: '  line.png  ' })).toBe('line.png');
    expect(deskLineArtUrl({ lineArtUrl: null })).toBeUndefined();
    expect(deskLineArtUrl({ lineArtUrl: '   ' })).toBeUndefined();
    expect(deskLineArtUrl({ lineArtUrl: undefined })).toBeUndefined();
    expect(deskLineArtUrl(null)).toBeUndefined();
  });

  it('composition coverage does not count firstFrameAssetId as line art', () => {
    const payload = makeBasePayload(2);
    const shots = payload.episodes[0].shots;
    const urlMap = new Map<string, string | undefined>();
    urlMap.set('shot-1', deskLineArtUrl({ lineArtUrl: 'line.png' }));
    urlMap.set('shot-2', deskLineArtUrl({
      lineArtUrl: null,
      firstFrameAssetId: 'color-keyframe.png',
    } as { lineArtUrl?: string | null }));

    expect(isShotComposed(shots[0], undefined, urlMap.get('shot-1'))).toBe(true);
    expect(isShotComposed(shots[1], undefined, urlMap.get('shot-2'))).toBe(false);

    const stats = computeCompositionStats(shots, undefined, urlMap, new Set(), new Set());
    expect(stats.composed).toBe(1);
    expect(stats.coverage).toBe(0.5);
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
  it('scopes upstream ownership and ignores downstream production writes', () => {
    const chain = {
      version: 2 as const,
      activeEpisodeId: 'ep-1',
      shots: [
        {
          id: 'shot-1',
          episodeId: 'ep-1',
          index: 1,
          durationSec: 3,
          shotType: 'medium',
          descriptionZh: '镜头一',
          promptEn: 'shot one',
          lineArtUrl: 'line-1',
          status: 'draft',
        },
        {
          id: 'shot-2',
          episodeId: 'ep-2',
          index: 1,
          durationSec: 3,
          shotType: 'wide',
          descriptionZh: '镜头二',
          promptEn: 'shot two',
          lineArtUrl: 'line-2',
          status: 'draft',
        },
      ] as any,
    };
    const reordered = { ...chain, shots: [...chain.shots].reverse() };
    expect(chainStoryboardHash(chain)).not.toBe(chainStoryboardHash(reordered));
    expect(lineArtVersionHash(chain, 'ep-1')).toBe(lineArtVersionHash(reordered, 'ep-1'));
    expect(lineArtVersionHash(chain, 'ep-1')).not.toBe(lineArtVersionHash(chain, 'ep-2'));

    const handoff = {
      scriptHash: 'script-1',
      storyboardHash: chainStoryboardHash(chain, 'ep-1'),
      lineartVersion: lineArtVersionHash(chain, 'ep-1'),
      hashSchemaVersion: CHAIN_STORYBOARD_HANDOFF_HASH_SCHEMA_VERSION,
      handoffVersion: 1,
      confirmedAt: '2026-08-04T00:00:00.000Z',
      episodeId: 'ep-1',
    };
    expect(validateDirectorHandoff({ handoff, chain, episodeId: 'ep-1', scriptHash: 'script-1' }).valid).toBe(true);
    expect(validateDirectorHandoff({ handoff: { ...handoff, scriptHash: 'old' }, chain, episodeId: 'ep-1', scriptHash: 'script-1' }).valid).toBe(false);

    const downstreamPatched = {
      ...chain,
      shots: chain.shots.map((shot: any) => shot.id === 'shot-1'
        ? {
            ...shot,
            firstFrameAssetId: 'color-keyframe',
            keyframePreviousUrl: 'old-color-keyframe',
            keyframeStatus: 'approved',
            status: 'approved',
            director3dGuide: {
              sourceBlockId: 'director-3d',
              captureId: 'capture-1',
              captureUrl: 'guide-url',
              appliedAt: '2026-08-12T00:00:00.000Z',
            },
            videoAssetId: 'video-url',
            videoStatus: 'approved',
            reviewHistory: [{
              id: 'review-1',
              stage: 'keyframe',
              decision: 'approved',
              createdAt: '2026-08-12T00:00:00.000Z',
            }],
          }
        : shot),
    };
    expect(chainStoryboardHash(downstreamPatched, 'ep-1')).toBe(handoff.storyboardHash);
    expect(validateDirectorHandoff({
      handoff,
      chain: downstreamPatched,
      episodeId: 'ep-1',
      scriptHash: 'script-1',
    }).valid).toBe(true);

    const upstreamPatched = {
      ...downstreamPatched,
      shots: downstreamPatched.shots.map((shot: any) => shot.id === 'shot-1'
        ? { ...shot, descriptionZh: '已修改的分镜描述' }
        : shot),
    };
    expect(validateDirectorHandoff({
      handoff,
      chain: upstreamPatched,
      episodeId: 'ep-1',
      scriptHash: 'script-1',
    }).valid).toBe(false);
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

describe('mergeShotsInBreakdown', () => {
  it('retires both source ids and creates a new merged shot', () => {
    const payload = makeBasePayload(3);
    const next = mergeShotsInBreakdown(payload, ['shot-1', 'shot-2']);
    expect(next).not.toBe(payload);
    const ids = next.episodes[0].shots.map((s) => s.id);
    expect(ids).not.toContain('shot-1');
    expect(ids).not.toContain('shot-2');
    expect(ids.some((id) => id.startsWith('shot-merged-'))).toBe(true);
    expect(next.episodes[0].shots).toHaveLength(2);
    expect(retiredShotIds(payload, next).sort()).toEqual(['shot-1', 'shot-2']);
  });

  it('returns the same payload when merging a single shot', () => {
    const payload = makeBasePayload(2);
    expect(mergeShotsInBreakdown(payload, ['shot-1'])).toBe(payload);
  });
});

describe('captureDeskUndoSnapshot', () => {
  it('clones payload, preview frames and confirmation for undo', () => {
    const payload = makeBasePayload(2);
    const preview = {
      ...emptyStoryboardPreview(),
      frames: [{
        id: 'f1',
        order: 1,
        label: 'f1',
        startSec: 0,
        endSec: 3,
        sourceShotId: 'shot-1',
        promptSummary: '',
        imageUrl: 'https://x/a.png',
        status: 'success' as const,
        locked: false,
      }],
    };
    const snap = captureDeskUndoSnapshot({
      confirmedEpisodeIds: ['ep-1'],
      storyboardPreview: preview,
      contactSheetUrl: 'https://x/sheet.png',
      gridConfirmed: true,
      chainStoryboard: { version: 2, shots: [{ id: 'shot-1', lineArtUrl: 'line.png' }] },
    }, payload);

    payload.episodes[0].shots[0].title = 'mutated';
    preview.frames[0].imageUrl = 'https://x/mutated.png';

    expect(snap.payload.episodes[0].shots[0].title).not.toBe('mutated');
    expect(snap.storyboardPreview?.frames[0].imageUrl).toBe('https://x/a.png');
    expect(snap.confirmedEpisodeIds).toEqual(['ep-1']);
    expect(snap.contactSheetUrl).toBe('https://x/sheet.png');
    expect(snap.gridConfirmed).toBe(true);
    expect((snap.chainStoryboard as { shots: Array<{ lineArtUrl?: string }> }).shots[0].lineArtUrl).toBe('line.png');
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
