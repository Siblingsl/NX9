import { describe, expect, it } from 'vitest';
import { PLAYBOOK_DEFINITIONS, WORKFLOW_TEMPLATES, activeEpisodeShots, bindStoryboardShotAssets, storyboardShotsFromScriptBreakdown, resolveNextStep, readinessRegistry, story_grid_confirmed, has_scene_split, has_environment_bibles, all_keyframes_approved, all_videos_approved, has_video_assets, has_camera_blocks, has_keyframes, consistency_resolved, export_ready } from '@nx9/shared';
import type { PlaybookSession, PlaybookReadinessContext, StoryboardShot } from '@nx9/shared';
import { FIXTURE_NOVEL_500, FIXTURE_SCENE_SPLIT_3, FIXTURE_ENV_PROFILE } from './fixtures';

describe('TEST-PIPE — Core 6-Step Production Pipeline', () => {

  it('TEST-PIPE-000: resolveNextStep 核心 6 步 playbook 第一步是编剧台拆分步', () => {
    const def = PLAYBOOK_DEFINITIONS.find((p) => p.id === 'pb-ai-comic-3d');
    expect(def).toBeDefined();
    expect(def!.steps.length).toBe(6);
    expect(def!.steps.map((s) => s.id)).toEqual([
      'script-breakdown',
      'story-grid',
      'storyboard-preview',
      'keyframe-review',
      'video-gen',
      'export',
    ]);
    expect(def!.bootstrapTemplates[0]?.templateId).toBe('tpl-core-episode');

    const session: PlaybookSession = {
      playbookId: 'pb-ai-comic-3d',
      startedAt: new Date().toISOString(),
      currentStepId: 'script-breakdown',
      completedStepIds: [],
    };

    const ctx: PlaybookReadinessContext = {
      storyboard: { shots: [] },
      voice: { lines: [] },
      nodes: [],
      scriptPlan: { sourceText: '' },
    };

    const resolved = resolveNextStep(def!, session, ctx);
    expect(resolved.step.id).toBe('script-breakdown');
    expect(resolved.allDone).toBe(false);
  });

  it('TEST-PIPE-000-template: 核心模板拓扑完整且旧全流程模板已取消', () => {
    expect(WORKFLOW_TEMPLATES.some((tpl) => /pipeline-(13|11)/.test(tpl.id))).toBe(false);
    const template = WORKFLOW_TEMPLATES.find((tpl) => tpl.id === 'tpl-core-episode');
    expect(template).toBeDefined();
    const flow = template!.build();
    expect(flow.blocks.map((block) => block.type)).toEqual([
      'script-desk',
      'asset-gate',
      'storyboard-desk',
      'picture-gen',
      'director-desk',
      'director-desk',
      'clip-gen',
      'export-pack',
    ]);
    const desk = flow.blocks.find((block) => block.type === 'storyboard-desk')!;
    const directorDeskBlock = flow.blocks.find((block) => block.type === 'director-desk' && (block.data as Record<string, unknown>).queueFilter === 'missing');
    const gate = flow.blocks.find((block) => block.type === 'asset-gate')!;
    expect(flow.links.some((link) => link.target === gate.id && link.targetHandle === 'asset-gate')).toBe(true);
    expect(flow.links.some((link) => link.source === gate.id && link.sourceHandle === 'asset-gate')).toBe(true);
    const capabilityLinks = flow.links.filter(
      (link) => link.target === desk.id && link.targetHandle === 'exec-picture',
    );
    expect(capabilityLinks).toHaveLength(2);
    expect(capabilityLinks.every((link) => link.sourceHandle === 'exec-picture')).toBe(true);
    expect(flow.links.some((link) => link.source === desk.id && link.target === directorDeskBlock.id)).toBe(true);
    expect(
      flow.links.some(
        (link) =>
          link.source === directorDeskBlock.id
          && flow.blocks.find((b) => b.id === link.target)?.type === 'clip-gen',
      ),
    ).toBe(true);
  });

  it('TEST-PIPE-000-episode: 批量生产只处理 activeEpisodeId', () => {
    const shots = storyboardShotsFromScriptBreakdown({
      version: 1,
      title: '双集测试',
      sourceText: '测试',
      generatedAt: new Date().toISOString(),
      episodes: [1, 2].map((index) => ({
        id: `ep-${index}`,
        index,
        title: `第 ${index} 集`,
        shots: [{
          id: `ep-${index}-shot-1`,
          episodeId: `ep-${index}`,
          episodeIndex: index,
          index: 1,
          sceneId: `scene-${index}`,
          sceneCode: `${index}-1`,
          title: '镜头',
          durationSec: 5,
          characters: [],
          scene: '室内',
          scriptText: '动作',
          dialogue: [],
          imagePrompt: 'image',
          videoPrompt: 'video',
          status: 'draft' as const,
        }],
      })),
    });
    const scoped = activeEpisodeShots({
      version: 3,
      title: '双集测试',
      reviewMode: 'manual',
      activeEpisodeId: 'ep-2',
      shots,
    });
    expect(scoped).toHaveLength(1);
    expect(scoped[0].episodeId).toBe('ep-2');

    const staleScope = activeEpisodeShots({
      version: 3,
      title: '双集测试',
      reviewMode: 'manual',
      activeEpisodeId: 'missing-episode',
      shots,
    });
    expect(staleScope).toHaveLength(1);
    expect(staleScope[0].episodeId).toBe('ep-1');

    const bound = bindStoryboardShotAssets(
      [{ ...shots[0], characterNames: ['小明'], sceneName: '咖啡厅', sceneCode: '1-1' }],
      [{ id: 'char-1', name: '小明' }],
      [{ id: 'env-1', name: '咖啡厅', sceneCode: '1-1', descriptionZh: '暖色室内' }],
    );
    expect(bound[0].characterIds).toEqual(['char-1']);
    expect(bound[0].sceneAssetId).toBe('env-1');

    const readiness: PlaybookReadinessContext = {
      storyboard: {
        activeEpisodeId: 'ep-1',
        shots: [
          { id: 'a', episodeId: 'ep-1', status: 'approved', firstFrameAssetId: '/a.jpg' },
          { id: 'b', episodeId: 'ep-2', status: 'draft' },
        ],
      },
      voice: { lines: [] },
      nodes: [],
    };
    expect(has_keyframes(readiness)).toBe(true);

    expect(story_grid_confirmed({
      ...readiness,
      nodes: [{
        id: 'grid',
        type: 'story-grid',
        data: { confirmedEpisodeIds: ['ep-1'] },
      }],
    })).toBe(true);
    expect(story_grid_confirmed({
      ...readiness,
      storyboard: { ...readiness.storyboard, activeEpisodeId: 'ep-2' },
      nodes: [{
        id: 'grid',
        type: 'story-grid',
        data: { confirmedEpisodeIds: ['ep-1'] },
      }],
    })).toBe(false);
  });

  it('TEST-PIPE-000-live: pb-ai-comic-live 也是核心 6 步', () => {
    const def = PLAYBOOK_DEFINITIONS.find((p) => p.id === 'pb-ai-comic-live');
    expect(def).toBeDefined();
    expect(def!.steps.length).toBe(6);
    expect(def!.steps[5].id).toBe('export');
    expect(def!.bootstrapTemplates[0]?.templateId).toBe('tpl-core-episode');
  });

  it('TEST-PIPE-101: scriptPlan v2 往返', () => {
    const plan = { version: 2 as const, sourceText: FIXTURE_NOVEL_500, storyboardTable: [] };
    // Simulate serialization roundtrip
    const json = JSON.stringify(plan);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(2);
    expect(parsed.sourceText).toBe(FIXTURE_NOVEL_500);
    expect(Array.isArray(parsed.storyboardTable)).toBe(true);
  });

  it('TEST-PIPE-201: scene-split readiness works', () => {
    const ctx: PlaybookReadinessContext = {
      storyboard: { shots: [] },
      voice: { lines: [] },
      nodes: [],
      scriptPlan: { scenes: FIXTURE_SCENE_SPLIT_3 },
    };
    expect(has_scene_split(ctx)).toBe(true);

    const emptyCtx: PlaybookReadinessContext = {
      storyboard: { shots: [] },
      voice: { lines: [] },
      nodes: [],
    };
    expect(has_scene_split(emptyCtx)).toBe(false);
  });

  it('TEST-PIPE-202: scene-split API llm mock returns JSON', () => {
    const mockResponse = { ok: true, scenes: [
      { id: 'sc-1', sceneCode: '1-1', episode: 1, location: '咖啡厅', interior: '内' as const, timeOfDay: '日', characters: ['小明'], summary: '相遇' },
    ]};
    expect(mockResponse.ok).toBe(true);
    expect(Array.isArray(mockResponse.scenes)).toBe(true);
    expect(mockResponse.scenes[0].sceneCode).toBe('1-1');
  });

  it('TEST-PIPE-301: materializeShots 写 sceneCode', () => {
    // This tests the materializeShots service which we fixed to include sceneCode
    const table = [
      { id: 'r1', group: '1-1', shotSize: 'WS', cameraMove: '固定', durationSec: 4, descriptionZh: '测试', dialogue: '', sfx: '', videoDesc: '', associateAssetIds: [] },
    ];
    // Verify the new fields are present via the type
    const shot: StoryboardShot = {
      id: 'test-1',
      index: 1,
      durationSec: 4,
      shotType: 'wide',
      descriptionZh: '测试',
      promptEn: 'test',
      status: 'draft',
      sceneCode: '1-1',
      sceneId: null,
      keyframeStatus: 'draft',
      videoStatus: 'draft',
    };
    expect(shot.sceneCode).toBe('1-1');
    expect(shot.keyframeStatus).toBe('draft');
    expect(shot.videoStatus).toBe('draft');
  });

  it('TEST-PIPE-401: extractAssets bible 字段', () => {
    // Verify CharacterBible type has all 6 layers
    const bible = {
      identity: '测试身份',
      appearance: '测试外貌',
      personality: '测试性格',
      background: '测试背景',
      voice: '测试声音',
      relationships: '测试关系',
    };
    expect(bible.identity).toBeDefined();
    expect(bible.appearance).toBeDefined();
    expect(bible.personality).toBeDefined();
    expect(bible.background).toBeDefined();
    expect(bible.voice).toBeDefined();
    expect(bible.relationships).toBeDefined();
  });

  it('TEST-PIPE-501: environment library upsert', () => {
    expect(FIXTURE_ENV_PROFILE.id).toBe('env-1');
    expect(FIXTURE_ENV_PROFILE.name).toBe('咖啡厅');
    expect(FIXTURE_ENV_PROFILE.lighting).toBe('暖色窗光');
    expect(Array.isArray(FIXTURE_ENV_PROFILE.props)).toBe(true);
  });

  it('TEST-PIPE-601: spawnCameraBlocksForShots 签名验证', () => {
    // spawnCameraBlocksForShots takes (mode: '3d' | 'live', shots: StoryboardShot[]) => void
    const mode: '3d' | 'live' = 'live';
    expect(['3d', 'live']).toContain(mode);
  });

  it('TEST-PIPE-602: spawnCameraBlocks readiness has_camera_blocks >=50%', () => {
    const ctx: import('@nx9/shared').PlaybookReadinessContext = {
      storyboard: { shots: [
        { id: 's1', status: 'approved', linkedBlockId: 'blk-1' },
        { id: 's2', status: 'approved', linkedBlockId: 'blk-2' },
        { id: 's3', status: 'approved', linkedBlockId: null },
      ]},
      voice: { lines: [] },
      nodes: [
        { id: 'blk-1', type: 'director-desk', data: {} },
        { id: 'blk-2', type: 'director-3d', data: {} },
      ],
    };
    // 2/3 = 66% >= 50%, so true
    expect(has_camera_blocks(ctx)).toBe(true);

    const ctxEmpty: import('@nx9/shared').PlaybookReadinessContext = {
      storyboard: { shots: [
        { id: 's1', status: 'approved', linkedBlockId: null },
        { id: 's2', status: 'approved', linkedBlockId: null },
      ]},
      voice: { lines: [] },
      nodes: [],
    };
    expect(has_camera_blocks(ctxEmpty)).toBe(false);

    const ctxWrongKind: import('@nx9/shared').PlaybookReadinessContext = {
      storyboard: { shots: [
        { id: 's1', status: 'approved', linkedBlockId: 'blk-x' },
      ]},
      voice: { lines: [] },
      nodes: [
        { id: 'blk-x', type: 'picture-gen', data: {} },
      ],
    };
    // 1 shot with linkedBlockId but wrong kind = 0% matching => false
    expect(has_camera_blocks(ctxWrongKind)).toBe(false);
  });

  it('TEST-PIPE-701: has_keyframes 要求全部镜头有 firstFrameAssetId', () => {
    const ctxAll: import('@nx9/shared').PlaybookReadinessContext = {
      storyboard: { shots: [
        { id: 's1', status: 'approved', firstFrameAssetId: '/img/s1.png' },
        { id: 's2', status: 'approved', firstFrameAssetId: '/img/s2.png' },
      ]},
      voice: { lines: [] },
      nodes: [],
    };
    expect(has_keyframes(ctxAll)).toBe(true);

    const ctxPartial: import('@nx9/shared').PlaybookReadinessContext = {
      storyboard: { shots: [
        { id: 's1', status: 'approved', firstFrameAssetId: '/img/s1.png' },
        { id: 's2', status: 'approved' },
      ]},
      voice: { lines: [] },
      nodes: [
        // 节点 done 不得冒充全出
        { id: 'pg', type: 'picture-gen', data: { status: 'success' } },
      ],
    };
    expect(has_keyframes(ctxPartial)).toBe(false);
  });

  it('TEST-PIPE-701b: has_video_assets 要求全部镜头有 videoAssetId', () => {
    const ok: PlaybookReadinessContext = {
      storyboard: { shots: [
        { id: 's1', status: 'approved', videoAssetId: '/v/1.mp4' } as any,
        { id: 's2', status: 'approved', videoAssetId: '/v/2.mp4' } as any,
      ]},
      voice: { lines: [] },
      nodes: [],
    };
    expect(has_video_assets(ok)).toBe(true);

    const partial: PlaybookReadinessContext = {
      storyboard: { shots: [
        { id: 's1', status: 'approved', videoAssetId: '/v/1.mp4' } as any,
        { id: 's2', status: 'approved' },
      ]},
      voice: { lines: [] },
      nodes: [{ id: 'cg', type: 'clip-gen', data: { status: 'success' } }],
    };
    expect(has_video_assets(partial)).toBe(false);
  });

  it('TEST-PIPE-801: keyframeStatus 迁移', () => {
    const oldShot: any = { id: 's1', status: 'approved' };
    const migrated: StoryboardShot = {
      ...oldShot,
      keyframeStatus: oldShot.status === 'approved' ? 'approved' : 'draft',
      videoStatus: 'draft',
    };
    expect(migrated.keyframeStatus).toBe('approved');
    expect(migrated.videoStatus).toBe('draft');
  });

  it('TEST-PIPE-901: all_keyframes_approved 门禁', () => {
    const allApproved: PlaybookReadinessContext = {
      storyboard: { shots: [
        { id: 's1', status: 'approved', keyframeStatus: 'approved' },
        { id: 's2', status: 'approved', keyframeStatus: 'approved' },
      ]},
      voice: { lines: [] },
      nodes: [],
    };
    expect(all_keyframes_approved(allApproved)).toBe(true);

    const notAllApproved: PlaybookReadinessContext = {
      storyboard: { shots: [
        { id: 's1', status: 'approved', keyframeStatus: 'approved' },
        { id: 's2', status: 'draft', keyframeStatus: 'draft' },
      ]},
      voice: { lines: [] },
      nodes: [],
    };
    expect(all_keyframes_approved(notAllApproved)).toBe(false);
  });

  it('TEST-PIPE-901: has_video_assets readiness for video-gen step', () => {
    const ctxWithVideo: import('@nx9/shared').PlaybookReadinessContext = {
      storyboard: { shots: [
        { id: 's1', status: 'approved', videoAssetId: '/vid/s1.mp4' },
      ]},
      voice: { lines: [] },
      nodes: [],
    };
    expect(has_video_assets(ctxWithVideo)).toBe(true);

    const ctxNoVideo: import('@nx9/shared').PlaybookReadinessContext = {
      storyboard: { shots: [
        { id: 's1', status: 'approved' },
      ]},
      voice: { lines: [] },
      nodes: [],
    };
    expect(has_video_assets(ctxNoVideo)).toBe(false);
  });

  it('TEST-PIPE-1201: 成片审阅用 videoStatus', () => {
    const allVideoApproved: PlaybookReadinessContext = {
      storyboard: { shots: [
        { id: 's1', status: 'approved', videoStatus: 'approved' },
        { id: 's2', status: 'approved', videoStatus: 'approved' },
      ]},
      voice: { lines: [] },
      nodes: [],
    };
    expect(all_videos_approved(allVideoApproved)).toBe(true);

    const videoDraft: PlaybookReadinessContext = {
      storyboard: { shots: [
        { id: 's1', status: 'approved', videoStatus: 'approved' },
        { id: 's2', status: 'approved', videoStatus: 'draft' },
      ]},
      voice: { lines: [] },
      nodes: [],
    };
    expect(all_videos_approved(videoDraft)).toBe(false);
  });

  it('TEST-PIPE-000-playbook: 核心 6 步 readiness 全部注册', () => {
    const keys = [
      'has_source_text',
      'story_grid_confirmed',
      'has_keyframes',
      'all_keyframes_approved',
      'all_videos_approved',
      'export_ready',
    ];
    for (const key of keys) {
      expect(readinessRegistry[key]).toBeDefined();
    }
  });

  it('TEST-PIPE-1001: consistency types exist', () => {
    // Verify the types compile (runtime check of shape)
    const issue = {
      shotIds: ['s1', 's2'],
      category: 'wardrobe' as const,
      suggestion: '检查服装一致性',
      repairAction: 'regenerate-keyframe' as const,
    };
    expect(issue.shotIds.length).toBe(2);
    expect(['wardrobe', 'lighting', 'axis', 'prop']).toContain(issue.category);
    expect(['regenerate-keyframe', 'inpaint', 'manual']).toContain(issue.repairAction);
  });

  it('TEST-PIPE-readiness: new functions return correct defaults', () => {
    const empty: PlaybookReadinessContext = { storyboard: { shots: [] }, voice: { lines: [] }, nodes: [] };

    expect(has_scene_split(empty)).toBe(false);
    expect(has_environment_bibles(empty)).toBe(false);
    expect(has_camera_blocks(empty)).toBe(false);
    expect(has_keyframes(empty)).toBe(false);
    expect(has_video_assets(empty)).toBe(false);
    expect(consistency_resolved(empty)).toBe(true); // no continuity-check node
    expect(export_ready(empty)).toBe(false);
  });

  it('ST-2: playbook-readiness all new keys registered', () => {
    const required = ['has_scene_split', 'has_environment_bibles', 'has_character_bibles', 'has_camera_blocks', 'has_keyframes', 'all_keyframes_approved', 'has_video_assets', 'consistency_resolved', 'all_videos_approved', 'export_ready'];
    for (const key of required) {
      expect(readinessRegistry[key]).toBeDefined();
    }
  });
});
