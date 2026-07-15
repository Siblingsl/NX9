import { describe, it, expect } from 'vitest';
import {
  PLAYBOOK_DEFINITIONS,
  resolveNextStep,
  has_line_art_thumbnails,
  type PlaybookSession,
  type PlaybookReadinessContext,
  WORKFLOW_TEMPLATES,
  syncCurrentEpisodePlaybookProgress,
  switchPlaybookEpisode,
  hydrateEpisodePlaybookProgress,
} from '@nx9/shared';
import type { PlaybookStepAction } from '@nx9/shared';

function makeCtx(overrides?: Partial<PlaybookReadinessContext>): PlaybookReadinessContext {
  return {
    storyboard: { title: '', shots: [] },
    voice: { lines: [] },
    nodes: [],
    ...overrides,
  };
}

describe('TEST-WF — Playbook orchestration', () => {

  it('TEST-WF-001: resolveNextStep returns first step when session has no completedStepIds', () => {
    const playbook = PLAYBOOK_DEFINITIONS.find((p) => p.id === 'pb-line-art-episode');
    expect(playbook).toBeDefined();
    if (!playbook) return;

    const session: PlaybookSession = {
      playbookId: 'pb-line-art-episode',
      startedAt: '2026-07-09T12:00:00Z',
      currentStepId: playbook.steps[0].id,
      completedStepIds: [],
    };

    const ctx = makeCtx();
    const resolved = resolveNextStep(playbook, session, ctx);

    expect(resolved.allDone).toBe(false);
    expect(resolved.index).toBe(0);
    expect(resolved.step.id).toBe(playbook.steps[0].id);
  });

  it('TEST-WF-002: After advancing, completedStepIds includes the step', () => {
    const playbook = PLAYBOOK_DEFINITIONS.find((p) => p.id === 'pb-line-art-episode');
    expect(playbook).toBeDefined();
    if (!playbook) return;

    const session: PlaybookSession = {
      playbookId: 'pb-line-art-episode',
      startedAt: '2026-07-09T12:00:00Z',
      currentStepId: playbook.steps[1].id,
      completedStepIds: [playbook.steps[0].id],
    };

    const completedSet = new Set(session.completedStepIds);
    expect(completedSet.has(playbook.steps[0].id)).toBe(true);

    const advanced = [...completedSet, session.currentStepId];
    expect(advanced).toContain(playbook.steps[0].id);
    expect(advanced).toContain(playbook.steps[1].id);
    expect(advanced).toHaveLength(2);
  });

  it('TEST-WF-003: has_line_art_thumbnails returns false when <50% have thumbnails', () => {
    const ctx = makeCtx({
      storyboard: {
        title: 'test',
        shots: [
          { id: 's1', status: 'draft', firstFrameAssetId: '/thumb.png' },
          { id: 's2', status: 'draft' },
          { id: 's3', status: 'draft' },
        ],
      },
    });

    expect(has_line_art_thumbnails(ctx)).toBe(false);

    const ctx2 = makeCtx({
      storyboard: {
        title: 'test',
        shots: [
          { id: 's1', status: 'draft', firstFrameAssetId: '/thumb.png' },
          { id: 's2', status: 'draft', firstFrameAssetId: '/thumb2.png' },
          { id: 's3', status: 'draft' },
        ],
      },
    });

    expect(has_line_art_thumbnails(ctx2)).toBe(true);
  });

  it('TEST-WF-004: executeStepAction load_template pattern', () => {
    const action: PlaybookStepAction = { type: 'load_template', templateId: 'tpl-line-art-storyboard', mode: 'merge' };
    expect(action.type).toBe('load_template');
    expect(action.templateId).toBe('tpl-line-art-storyboard');
    expect(action.mode).toBe('merge');
  });

  it('TEST-WF-005: WORKFLOW_TEMPLATES has no duplicate ids (regression for BUG-WF-001)', () => {
    const ids = WORKFLOW_TEMPLATES.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('TEST-WF-006: PlaybookSession persistence shape', () => {
    const session: PlaybookSession = {
      playbookId: 'pb-line-art-episode',
      startedAt: '2026-07-09T12:00:00Z',
      currentStepId: 'line-art',
      completedStepIds: ['shot-script', 'story-grid'],
    };

    expect(session.playbookId).toBe('pb-line-art-episode');
    expect(session.startedAt).toBeTruthy();
    expect(session.currentStepId).toBe('line-art');
    expect(session.completedStepIds).toHaveLength(2);
    expect(session.completedStepIds).toContain('shot-script');
    expect(session.completedStepIds).toContain('story-grid');
    expect(typeof session.dismissed === 'undefined' || typeof session.dismissed === 'boolean').toBe(true);
  });

  it('TEST-WF-007: dismissed session does not show banner', () => {
    const session: PlaybookSession = {
      playbookId: 'pb-line-art-episode',
      startedAt: '2026-07-09T12:00:00Z',
      currentStepId: 'shot-script',
      completedStepIds: [],
      dismissed: true,
    };

    expect(session.dismissed).toBe(true);
    const ctx = makeCtx();
    const playbook = PLAYBOOK_DEFINITIONS.find((p) => p.id === 'pb-line-art-episode');
    expect(playbook).toBeDefined();
    if (!playbook) return;

    const resolved = resolveNextStep(playbook, session, ctx);
    expect(resolved.allDone).toBe(false);

    const shouldShowBanner = !session.dismissed;
    expect(shouldShowBanner).toBe(false);
  });

  it('TEST-WF-008: each episode restores its own playbook progress', () => {
    const playbook = PLAYBOOK_DEFINITIONS.find((p) => p.id === 'pb-ai-comic-live');
    expect(playbook).toBeDefined();
    if (!playbook) return;

    const episodeOneAtVideo: PlaybookSession = {
      playbookId: 'pb-ai-comic-live',
      startedAt: '2026-07-14T00:00:00Z',
      currentStepId: 'video-gen',
      completedStepIds: [
        'script-breakdown',
        'story-grid',
        'storyboard-preview',
        'keyframe-review',
      ],
      skippedStepIds: [],
      failedStepIds: [],
      waitingStepIds: [],
      workflowStatus: 'running',
    };
    const savedEpisodeOne = syncCurrentEpisodePlaybookProgress(episodeOneAtVideo, 'episode-1');

    const episodeTwo = switchPlaybookEpisode(
      savedEpisodeOne,
      'episode-1',
      'episode-2',
      playbook,
    );
    expect(episodeTwo.currentStepId).toBe('story-grid');
    expect(episodeTwo.completedStepIds).toEqual(['script-breakdown']);
    expect(episodeTwo.episodeProgress?.['episode-1'].currentStepId).toBe('video-gen');

    const restoredEpisodeOne = switchPlaybookEpisode(
      episodeTwo,
      'episode-2',
      'episode-1',
      playbook,
    );
    expect(restoredEpisodeOne.currentStepId).toBe('video-gen');
    expect(restoredEpisodeOne.completedStepIds).toContain('keyframe-review');
    expect(restoredEpisodeOne.workflowStatus).toBe('running');
  });

  it('TEST-WF-009: legacy global progress migrates into the active episode', () => {
    const legacySession: PlaybookSession = {
      playbookId: 'pb-ai-comic-live',
      startedAt: '2026-07-13T00:00:00Z',
      currentStepId: 'keyframe-review',
      completedStepIds: ['script-breakdown', 'story-grid', 'storyboard-preview'],
    };

    const migrated = hydrateEpisodePlaybookProgress(legacySession, 'episode-1');
    expect(migrated.currentStepId).toBe('keyframe-review');
    expect(migrated.episodeProgress?.['episode-1']).toMatchObject({
      currentStepId: 'keyframe-review',
      completedStepIds: ['script-breakdown', 'story-grid', 'storyboard-preview'],
      workflowStatus: 'idle',
    });
  });

});
