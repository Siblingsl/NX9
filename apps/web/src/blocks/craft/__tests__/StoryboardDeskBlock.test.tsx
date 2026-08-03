/**
 * StoryboardDeskBlock test suite.
 *
 * Coverage: Q-02 关键行为测 — runner pure functions.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { removeShotFromBreakdown, stripEpisodeConfirmation, reorderShotsInBreakdown, mergeIncrementalBreakdown } from '../../../engine/storyboard-desk-runner';
import { getEpisodeContactSheet, emptyStoryboardPreview, type ScriptBreakdownPayload, type StoryboardPreviewPayload } from '@nx9/shared';

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

  it('falls back to global contactSheetUrl when per-episode is missing', () => {
    const preview: StoryboardPreviewPayload = {
      ...emptyStoryboardPreview(),
      contactSheetUrl: 'https://a.com/sheet-global.png',
      contactSheetSignature: 'sig-global',
    };
    const ep1 = getEpisodeContactSheet(preview, 'ep-1');
    expect(ep1.url).toBe('https://a.com/sheet-global.png');
    expect(ep1.signature).toBe('sig-global');
  });

  it('returns null when no preview', () => {
    const result = getEpisodeContactSheet(undefined, 'ep-1');
    expect(result.url).toBe(null);
    expect(result.signature).toBe(null);
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
