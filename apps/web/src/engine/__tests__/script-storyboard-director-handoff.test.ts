/**
 * 编剧台 → 分镜台 → 导演台 交接契约（无浏览器）。
 * Playwright 主路径见 e2e/e2e-script-storyboard-director.spec.ts。
 */
import { describe, expect, it } from 'vitest';
import {
  CHAIN_STORYBOARD_HANDOFF_HASH_SCHEMA_VERSION,
  chainStoryboardHash,
  emptyStoryboardPreview,
  lineArtVersionHash,
  type ChainStoryboardPayload,
} from '@nx9/shared';
import {
  resolveDownstreamDirectorDeskId,
  resolveUpstreamChainDesk,
  validateDirectorHandoff,
} from '../chain-storyboard-utils';
import {
  buildDirectorHandoff,
  DESK_SESSION_DRAFT_VERSION,
  parseDeskSessionDraft,
  serializeDeskSessionDraft,
} from '../storyboard-desk-runner';

function makeChain(episodeId = 'ep-1'): ChainStoryboardPayload {
  return {
    version: 2,
    activeEpisodeId: episodeId,
    shots: [
      {
        id: 'shot-1',
        episodeId,
        index: 1,
        durationSec: 3,
        shotType: 'medium',
        descriptionZh: '开场',
        promptEn: 'open',
        lineArtUrl: 'https://mock/line-1.png',
        status: 'draft',
      } as ChainStoryboardPayload['shots'][number],
      {
        id: 'shot-2',
        episodeId,
        index: 2,
        durationSec: 3,
        shotType: 'wide',
        descriptionZh: '过场',
        promptEn: 'cut',
        lineArtUrl: 'https://mock/line-2.png',
        status: 'draft',
      } as ChainStoryboardPayload['shots'][number],
    ],
  };
}

describe('三台串联交接契约', () => {
  it('编剧 scriptHash + 分镜确认 handoff → 导演 validate 通过', () => {
    const scriptHash = 'pkg|confirmed|ep-1:body';
    const chain = makeChain('ep-1');
    const handoff = {
      episodeId: 'ep-1',
      scriptHash,
      storyboardHash: chainStoryboardHash(chain, 'ep-1'),
      lineartVersion: lineArtVersionHash(chain, 'ep-1'),
      hashSchemaVersion: CHAIN_STORYBOARD_HANDOFF_HASH_SCHEMA_VERSION,
      handoffVersion: 1,
      confirmedAt: '2026-08-12T00:00:00.000Z',
      confirmed: true,
      compositionCoverage: 1,
      lineArtFrameCount: 2,
    };

    expect(validateDirectorHandoff({
      handoff,
      chain,
      episodeId: 'ep-1',
      scriptHash,
    }).valid).toBe(true);
  });

  it('编剧改稿后 scriptHash 变化 → 旧 handoff 失效', () => {
    const chain = makeChain('ep-1');
    const handoff = {
      episodeId: 'ep-1',
      scriptHash: 'old-script',
      storyboardHash: chainStoryboardHash(chain, 'ep-1'),
      lineartVersion: lineArtVersionHash(chain, 'ep-1'),
      hashSchemaVersion: CHAIN_STORYBOARD_HANDOFF_HASH_SCHEMA_VERSION,
      handoffVersion: 1,
      confirmedAt: '2026-08-12T00:00:00.000Z',
    };
    expect(validateDirectorHandoff({
      handoff,
      chain,
      episodeId: 'ep-1',
      scriptHash: 'new-script',
    })).toEqual({ valid: false, reason: '交接scriptHash不匹配' });
  });

  it('导演关键帧写入不污染线稿版本哈希', () => {
    const chain = makeChain('ep-1');
    const before = lineArtVersionHash(chain, 'ep-1');
    const after = {
      ...chain,
      shots: chain.shots.map((shot) => ({
        ...shot,
        firstFrameAssetId: 'https://mock/color.png',
        keyframeStatus: 'review' as const,
        status: 'review' as const,
      })),
    };
    expect(lineArtVersionHash(after, 'ep-1')).toBe(before);
    expect(validateDirectorHandoff({
      handoff: {
        episodeId: 'ep-1',
        scriptHash: 's1',
        storyboardHash: chainStoryboardHash(after, 'ep-1'),
        lineartVersion: before,
        hashSchemaVersion: CHAIN_STORYBOARD_HANDOFF_HASH_SCHEMA_VERSION,
        handoffVersion: 1,
        confirmedAt: '2026-08-12T00:00:00.000Z',
      },
      chain: after,
      episodeId: 'ep-1',
      scriptHash: 's1',
    }).valid).toBe(true);
  });
});

describe('连贯性检查多链定位', () => {
  it('resolveUpstreamChainDesk 只返回连线上游 desk，不串邻链', () => {
    const nodes: any[] = [
      { id: 'desk-a', type: 'storyboard-desk', data: { chainStoryboard: makeChain('ep-a') } },
      { id: 'desk-b', type: 'storyboard-desk', data: { chainStoryboard: makeChain('ep-b') } },
      { id: 'cont-b', type: 'continuity-check', data: {} },
      { id: 'dir-a', type: 'director-desk', data: {} },
    ];
    const edges = [
      { source: 'desk-a', target: 'dir-a' },
      { source: 'desk-b', target: 'cont-b' },
    ];
    expect(resolveUpstreamChainDesk('cont-b', nodes, edges)).toBe('desk-b');
    expect(resolveUpstreamChainDesk('dir-a', nodes, edges)).toBe('desk-a');
  });
});

describe('分镜台打开导演台多链定位（SB-D-01）', () => {
  it('两套链并存时只返回本台出边可达的导演台', () => {
    const nodes: any[] = [
      { id: 'sb-a', type: 'storyboard-desk', data: {} },
      { id: 'sb-b', type: 'storyboard-desk', data: {} },
      { id: 'dir-a', type: 'director-desk', data: {} },
      { id: 'dir-b', type: 'director-desk', data: {} },
    ];
    const edges = [
      { source: 'sb-a', target: 'dir-a' },
      { source: 'sb-b', target: 'dir-b' },
    ];
    expect(resolveDownstreamDirectorDeskId('sb-a', nodes, edges)).toBe('dir-a');
    expect(resolveDownstreamDirectorDeskId('sb-b', nodes, edges)).toBe('dir-b');
  });

  it('中间经过普通节点时仍按出边可达定位，找不到则返回 null', () => {
    const nodes: any[] = [
      { id: 'sb-a', type: 'storyboard-desk', data: {} },
      { id: 'pass', type: 'picture-gen', data: {} },
      { id: 'dir-a', type: 'director-desk', data: {} },
      { id: 'dir-other', type: 'director-desk', data: {} },
    ];
    const edges = [
      { source: 'sb-a', target: 'pass' },
      { source: 'pass', target: 'dir-a' },
    ];
    expect(resolveDownstreamDirectorDeskId('sb-a', nodes, edges)).toBe('dir-a');
    expect(resolveDownstreamDirectorDeskId('dir-other', nodes, edges)).toBeNull();
  });
});

describe('分镜台确认自动推送交接（SB-D-04）', () => {
  it('buildDirectorHandoff 使用传入确认态与版本，哈希与链一致且可被导演台校验', () => {
    const chain = makeChain('ep-1');
    const confirmedChain = { ...chain, gridConfirmed: true, confirmedEpisodeIds: ['ep-1'] };
    const handoff = buildDirectorHandoff({
      sourceStoryboardBlockId: 'sb-a',
      chain: confirmedChain,
      scriptHash: 'pkg|confirmed|ep-1:body',
      episodeId: 'ep-1',
      episodeTitle: '第1集',
      shotCount: 2,
      shotIds: ['shot-1', 'shot-2'],
      compositionCoverage: 1,
      confirmed: true,
      confirmedEpisodeIds: ['ep-1'],
      handoffVersion: 2,
      confirmedAt: '2026-08-12T02:00:00.000Z',
    });
    expect(handoff.handoffVersion).toBe(2);
    expect(handoff.confirmed).toBe(true);
    expect(handoff.confirmedEpisodeIds).toEqual(['ep-1']);
    expect(handoff.storyboardHash).toBe(chainStoryboardHash(confirmedChain, 'ep-1'));
    expect(handoff.lineartVersion).toBe(lineArtVersionHash(chain, 'ep-1'));
    expect(validateDirectorHandoff({
      handoff: handoff as unknown as Record<string, unknown>,
      chain: confirmedChain,
      episodeId: 'ep-1',
      scriptHash: 'pkg|confirmed|ep-1:body',
    }).valid).toBe(true);
  });
});

describe('会话草稿 v2', () => {
  it('serialize/parse 往返保留预览与确认态，并兼容 v1', () => {
    const payload = {
      version: 1 as const,
      title: 'draft',
      sourceText: '',
      generatedAt: '2026-08-12T00:00:00.000Z',
      episodes: [{
        id: 'ep-1',
        index: 1,
        title: '第1集',
        shots: [{
          id: 'shot-1',
          episodeId: 'ep-1',
          episodeIndex: 0,
          index: 1,
          sceneId: 'sc',
          sceneCode: '1-1',
          title: '镜1',
          durationSec: 3,
          characters: [],
          scene: '',
          scriptText: '',
          dialogue: [],
          imagePrompt: '',
          videoPrompt: '',
          status: 'draft' as const,
        }],
      }],
    };
    const draft = serializeDeskSessionDraft({
      confirmedEpisodeIds: ['ep-1'],
      storyboardPreview: {
        ...emptyStoryboardPreview(),
        frames: [{
          id: 'f1',
          order: 1,
          label: 'f1',
          startSec: 0,
          endSec: 3,
          sourceShotId: 'shot-1',
          promptSummary: '',
          imageUrl: 'https://mock/line.png',
          status: 'success',
          locked: false,
        }],
      },
      contactSheetUrl: null,
      gridConfirmed: true,
      chainStoryboard: makeChain('ep-1'),
    }, payload, '2026-08-12T01:00:00.000Z');

    expect(draft.version).toBe(DESK_SESSION_DRAFT_VERSION);
    const parsed = parseDeskSessionDraft(JSON.stringify(draft));
    expect(parsed?.kind).toBe('v2');
    if (parsed?.kind === 'v2') {
      expect(parsed.draft.snapshot.confirmedEpisodeIds).toEqual(['ep-1']);
      expect(parsed.draft.snapshot.storyboardPreview?.frames[0].imageUrl).toBe('https://mock/line.png');
      expect(parsed.draft.snapshot.payload.episodes[0].shots[0].id).toBe('shot-1');
    }

    const legacy = parseDeskSessionDraft(JSON.stringify(payload));
    expect(legacy?.kind).toBe('v1');
    if (legacy?.kind === 'v1') {
      expect(legacy.payload.episodes[0].id).toBe('ep-1');
    }
  });
});
