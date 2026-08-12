/**
 * P0：失效引用重绑
 */
import { describe, expect, it } from 'vitest';
import type { ScriptBreakdownPayload } from '@nx9/shared';
import { buildChainStoryboardPayload } from '@nx9/shared';
import { rebindInvalidShotRefs, summarizeAssetUsageForDelete } from '../asset-ref-rebind';
import { analyzeAssetLibraryHealth } from '../asset-library-health';

describe('rebindInvalidShotRefs', () => {
  it('重绑角色：同步 chain + breakdown，写入新名与 id', () => {
    const writes: Array<{ id: string; data: Record<string, unknown> }> = [];
    const breakdown: ScriptBreakdownPayload = {
      version: 1,
      title: 't',
      sourceText: '',
      generatedAt: new Date().toISOString(),
      episodes: [
        {
          id: 'ep1',
          index: 0,
          title: 'E1',
          shots: [
            {
              id: 'sh1',
              episodeId: 'ep1',
              episodeIndex: 0,
              index: 0,
              sceneId: 'sc',
              sceneCode: '1-1',
              title: '开场',
              durationSec: 3,
              characters: ['不存在'],
              scene: '茶馆',
              scriptText: '',
              imagePrompt: '',
              videoPrompt: '',
              dialogue: [],
              status: 'draft',
            },
          ],
        },
      ],
    };
    const chain = buildChainStoryboardPayload(undefined, {
      shots: [
        {
          id: 'sh1',
          index: 0,
          durationSec: 3,
          shotType: 'medium',
          descriptionZh: '',
          promptEn: '',
          status: 'draft',
          characterNames: ['不存在'],
          characterIds: [],
          sceneName: '茶馆',
        },
      ],
    });
    const nodes = [
      {
        id: 'desk1',
        type: 'storyboard-desk',
        data: { chainStoryboard: chain, scriptBreakdown: breakdown },
      },
    ];
    const n = rebindInvalidShotRefs(
      nodes,
      (id, data) => writes.push({ id, data }),
      {
        kind: 'character',
        oldName: '不存在',
        newId: 'c-lin',
        newName: '林晓',
        shotId: 'sh1',
      },
    );
    expect(n).toBe(1);
    expect(writes).toHaveLength(1);
    const nextChain = writes[0].data.chainStoryboard as typeof chain;
    expect(nextChain.shots[0].characterNames).toEqual(['林晓']);
    expect(nextChain.shots[0].characterIds).toEqual(['c-lin']);
    const nextBd = writes[0].data.scriptBreakdown as ScriptBreakdownPayload;
    expect(nextBd.episodes[0].shots[0].characters).toEqual(['林晓']);
  });

  it('同名全部重绑场景', () => {
    const writes: Array<{ id: string; data: Record<string, unknown> }> = [];
    const chain = buildChainStoryboardPayload(undefined, {
      shots: [
        {
          id: 'a',
          index: 0,
          durationSec: 3,
          shotType: 'medium',
          descriptionZh: '',
          promptEn: '',
          status: 'draft',
          sceneName: '旧场',
        },
        {
          id: 'b',
          index: 1,
          durationSec: 3,
          shotType: 'medium',
          descriptionZh: '',
          promptEn: '',
          status: 'draft',
          sceneName: '旧场',
        },
      ],
    });
    const n = rebindInvalidShotRefs(
      [{ id: 'd', type: 'storyboard-desk', data: { chainStoryboard: chain } }],
      (id, data) => writes.push({ id, data }),
      { kind: 'scene', oldName: '旧场', newId: 'sc-1', newName: '茶馆' },
    );
    expect(n).toBe(2);
    const shots = (writes[0].data.chainStoryboard as typeof chain).shots;
    expect(shots.every((s) => s.sceneName === '茶馆' && s.sceneAssetId === 'sc-1')).toBe(true);
  });
});

describe('summarizeAssetUsageForDelete', () => {
  it('统计角色上镜次数', () => {
    const analysis = analyzeAssetLibraryHealth({
      characters: [{ id: 'c1', name: '林晓' }],
      workspaceItems: [],
      sounds: [],
      relationShots: [
        { id: '1', characterNames: ['林晓'] },
        { id: '2', characterNames: ['林晓'] },
      ],
    });
    const summary = summarizeAssetUsageForDelete(analysis, {
      kind: 'character',
      id: 'c1',
      label: '林晓',
    });
    expect(summary.shotCount).toBe(2);
    expect(summary.labels[0]).toContain('2');
  });
});
