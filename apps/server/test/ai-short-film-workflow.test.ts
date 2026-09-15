import { describe, expect, it } from 'vitest';
import {
  PLAYBOOK_DEFINITIONS,
  WORKFLOW_TEMPLATES,
  buildVoiceDramaTimeline,
  estimateVoiceDurationSec,
  extractDialogueLinesFromBreakdown,
  evaluatePlaybookStep,
  gatherUpstream,
  has_sound_assets,
  has_timeline_confirmed,
  has_timeline_draft,
  readinessRegistry,
  type FlowBlock,
  type FlowLink,
  type PlaybookReadinessContext,
  type ScriptBreakdownPayload,
  type TimelinePayload,
} from '@nx9/shared';

function emptyCtx(partial: Partial<PlaybookReadinessContext> = {}): PlaybookReadinessContext {
  return {
    storyboard: { shots: [] },
    voice: { lines: [] },
    nodes: [],
    scriptPlan: { sourceText: '' },
    ...partial,
  };
}

function baseTimeline(): TimelinePayload {
  return {
    version: 3,
    title: 't',
    fps: 30,
    durationSec: 8,
    aspect: '9:16',
    width: 1080,
    height: 1920,
    tracks: [
      {
        id: 'V1',
        kind: 'video',
        label: '视频',
        clips: [
          {
            id: 'v-sh1',
            shotId: 'sh1',
            type: 'video',
            assetUrl: '/v1.mp4',
            startSec: 0,
            durationSec: 4,
          },
          {
            id: 'v-sh2',
            shotId: 'sh2',
            type: 'video',
            assetUrl: '/v2.mp4',
            startSec: 4,
            durationSec: 4,
          },
        ],
      },
    ],
  };
}

describe('AI 短片工作流 SF-01～SF-20', () => {
  it('SF-01/14/18: pb + tpl 含双声音+音效，导出 remotion-episode', () => {
    const pb = PLAYBOOK_DEFINITIONS.find((p) => p.id === 'pb-ai-short-film');
    expect(pb).toBeDefined();
    expect(pb!.featured).toBe(true);
    expect(pb!.steps.map((s) => s.id)).toEqual([
      'script-desk',
      'storyboard-desk',
      'director-desk',
      'video-gen',
      'sound-gen',
      'smart-edit',
      'export',
    ]);
    expect(pb!.bootstrapTemplates[0]?.templateId).toBe('tpl-ai-short-film');

    const tpl = WORKFLOW_TEMPLATES.find((t) => t.id === 'tpl-ai-short-film');
    expect(tpl).toBeDefined();
    const flow = tpl!.build();
    const kinds = flow.blocks.map((b) => b.type);
    expect(kinds.filter((k) => k === 'sound-gen')).toHaveLength(3);
    const modes = flow.blocks
      .filter((b) => b.type === 'sound-gen')
      .map((b) => (b.data as { soundMode?: string }).soundMode)
      .sort();
    expect(modes).toEqual(['cast', 'music', 'sfx']);
    const pack = flow.blocks.find((b) => b.type === 'export-pack')!;
    expect((pack.data as { exportMode?: string }).exportMode).toBe('remotion-episode');
    const editor = flow.blocks.find((b) => b.type === 'clip-editor')!;
    const soundIds = flow.blocks.filter((b) => b.type === 'sound-gen').map((b) => b.id);
    for (const sid of soundIds) {
      expect(
        flow.links.some(
          (l) =>
            l.source === sid &&
            l.target === editor.id &&
            l.sourceHandle === 'sound' &&
            l.targetHandle === 'sound',
        ),
      ).toBe(true);
    }
  });

  it('SF-06/07: has_sound_assets + has_timeline_confirmed 已注册', () => {
    expect(readinessRegistry.has_sound_assets).toBeTypeOf('function');
    expect(readinessRegistry.has_timeline_confirmed).toBeTypeOf('function');

    expect(
      has_sound_assets(
        emptyCtx({
          nodes: [{ id: 's', type: 'sound-gen', data: { status: 'success', audioUrl: '/a.mp3' } }],
        }),
      ),
    ).toBe(true);
    expect(
      has_sound_assets(
        emptyCtx({
          nodes: [{ id: 's', type: 'sound-gen', data: { status: 'success' } }],
        }),
      ),
    ).toBe(false);

    const draftOnly = emptyCtx({
      nodes: [
        {
          id: 'ed',
          type: 'clip-editor',
          data: { timelineDraft: { tracks: [{ kind: 'video', clips: [{ id: 'c1' }] }] } },
        },
      ],
    });
    expect(has_timeline_draft(draftOnly)).toBe(true);
    expect(has_timeline_confirmed(draftOnly)).toBe(false);

    const confirmed = emptyCtx({
      nodes: [
        {
          id: 'ed',
          type: 'clip-editor',
          data: {
            timelineDraft: { tracks: [{ kind: 'video', clips: [{ id: 'c1' }] }] },
            confirmedAt: '2026-09-11T00:00:00.000Z',
          },
        },
      ],
    });
    expect(has_timeline_confirmed(confirmed)).toBe(true);

    const pb = PLAYBOOK_DEFINITIONS.find((p) => p.id === 'pb-ai-short-film')!;
    const soundStep = pb.steps.find((s) => s.id === 'sound-gen')!;
    const editStep = pb.steps.find((s) => s.id === 'smart-edit')!;
    expect(soundStep.readinessKey).toBe('has_sound_assets');
    expect(editStep.readinessKey).toBe('has_timeline_confirmed');
    expect(
      evaluatePlaybookStep(
        soundStep,
        emptyCtx({
          nodes: [{ id: 's', type: 'sound-gen', data: { status: 'success', audioUrl: '/a.mp3' } }],
        }),
      ).ready,
    ).toBe(true);
    expect(evaluatePlaybookStep(editStep, confirmed).ready).toBe(true);
  });

  it('SF-04/16: VO 起点对齐镜头；时长优先 durationSec', () => {
    const next = buildVoiceDramaTimeline(baseTimeline(), [
      {
        id: 'l2',
        shotId: 'sh2',
        speaker: '林晓',
        text: '第二镜',
        audioAssetId: '/vo2.mp3',
        durationSec: 2.5,
        status: 'ready',
      },
      {
        id: 'l1',
        shotId: 'sh1',
        speaker: '林晓',
        text: '第一镜',
        audioAssetId: '/vo1.mp3',
        durationSec: 1.5,
        status: 'ready',
      },
    ]);
    const vo = next.tracks.find((t) => t.label === '对白')!;
    const byShot = Object.fromEntries(vo.clips.map((c) => [c.shotId, c]));
    expect(byShot.sh1?.startSec).toBe(0);
    expect(byShot.sh1?.durationSec).toBe(1.5);
    expect(byShot.sh2?.startSec).toBe(4);
    expect(byShot.sh2?.durationSec).toBe(2.5);
  });

  it('SF-17: 同镜多句顺序偏移不叠放', () => {
    const next = buildVoiceDramaTimeline(baseTimeline(), [
      {
        id: 'a',
        shotId: 'sh1',
        speaker: '甲',
        text: '第一句',
        audioAssetId: '/a.mp3',
        durationSec: 1,
        status: 'ready',
      },
      {
        id: 'b',
        shotId: 'sh1',
        speaker: '乙',
        text: '第二句',
        audioAssetId: '/b.mp3',
        durationSec: 1.2,
        status: 'ready',
      },
    ]);
    const vo = next.tracks.find((t) => t.label === '对白')!;
    expect(vo.clips).toHaveLength(2);
    expect(vo.clips[0]!.startSec).toBe(0);
    expect(vo.clips[1]!.startSec).toBe(1);
    expect(vo.clips[1]!.durationSec).toBe(1.2);
  });

  it('SF-19/20: 音效轨 + 对白同源字幕', () => {
    const next = buildVoiceDramaTimeline(
      baseTimeline(),
      [
        {
          id: 'l1',
          shotId: 'sh1',
          speaker: '甲',
          text: '你好世界',
          audioAssetId: '/vo.mp3',
          durationSec: 2,
          status: 'ready',
        },
      ],
      { sfxUrls: ['/sfx.mp3'], bgmUrl: '/bgm.mp3' },
    );
    expect(next.tracks.some((t) => t.label === '音效' && t.clips[0]?.assetUrl === '/sfx.mp3')).toBe(
      true,
    );
    expect(next.tracks.some((t) => t.label === 'BGM')).toBe(true);
    const sub = next.tracks.find((t) => t.kind === 'subtitle')!;
    expect(sub.clips[0]?.text).toBe('你好世界');
    expect(sub.clips[0]?.startSec).toBe(0);
    expect(sub.clips[0]?.durationSec).toBe(2);
  });

  it('SF-15: cast 不进 bgmUrls，music 才进', () => {
    const blocks: FlowBlock[] = [
      {
        id: 'cast',
        type: 'sound-gen',
        position: { x: 0, y: 0 },
        data: { soundMode: 'cast', audioUrl: '/vo.mp3', sounds: ['/vo.mp3'] },
      },
      {
        id: 'bgm',
        type: 'sound-gen',
        position: { x: 0, y: 0 },
        data: { soundMode: 'music', audioUrl: '/bgm.mp3' },
      },
      {
        id: 'sfx',
        type: 'sound-gen',
        position: { x: 0, y: 0 },
        data: { soundMode: 'sfx', audioUrl: '/sfx.mp3' },
      },
      {
        id: 'ed',
        type: 'clip-editor',
        position: { x: 0, y: 0 },
        data: {},
      },
    ];
    const links: FlowLink[] = [
      { id: 'e1', source: 'cast', target: 'ed', sourceHandle: 'sound', targetHandle: 'sound' },
      { id: 'e2', source: 'bgm', target: 'ed', sourceHandle: 'sound', targetHandle: 'sound' },
      { id: 'e3', source: 'sfx', target: 'ed', sourceHandle: 'sound', targetHandle: 'sound' },
    ];
    const up = gatherUpstream('ed', blocks, links);
    expect(up.bgmUrls).toEqual(['/bgm.mp3']);
    expect(up.sfxUrls).toEqual(['/sfx.mp3']);
    expect(up.sounds).toContain('/vo.mp3');
    expect(up.sounds).toContain('/bgm.mp3');
    expect(up.bgmUrls).not.toContain('/vo.mp3');
  });

  it('SF-16 estimateVoiceDurationSec 有下界', () => {
    expect(estimateVoiceDurationSec('你好')).toBeGreaterThanOrEqual(0.8);
    expect(estimateVoiceDurationSec('这是一段稍长一点的对白文本用来估算')).toBeGreaterThan(2);
  });

  it('SF-09: 拆镜对白抽取带 shotId', () => {
    const payload = {
      episodes: [
        {
          shots: [
            {
              id: 'shot-a',
              dialogue: [{ speaker: '甲', text: '你好' }],
            },
          ],
        },
      ],
    } as unknown as ScriptBreakdownPayload;
    const lines = extractDialogueLinesFromBreakdown(payload);
    expect(lines).toEqual([{ speaker: '甲', text: '你好', shotId: 'shot-a' }]);
  });
});
