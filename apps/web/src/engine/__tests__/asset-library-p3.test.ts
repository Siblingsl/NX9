import { describe, expect, it } from 'vitest';
import {
  emptyScreenplayPackage,
  preferPrivateAssetByLabel,
  type AssetLibraryItem,
  type CharacterProfile,
  type ScriptBreakdownShot,
} from '@nx9/shared';
import { applyAssetDragToShot } from '../asset-library-drag';
import { analyzeAssetLibraryHealth } from '../asset-library-health';
import { diffCharacterBiblePush } from '../bible-library-sync';

function baseShot(partial: Partial<ScriptBreakdownShot> = {}): ScriptBreakdownShot {
  return {
    id: 'sh1',
    episodeId: 'ep1',
    episodeIndex: 0,
    index: 1,
    sceneId: 'sc',
    sceneCode: 'S1',
    title: '镜1',
    durationSec: 3,
    characters: [],
    scene: '',
    scriptText: '',
    dialogue: [],
    imagePrompt: '',
    videoPrompt: '',
    status: 'draft',
    ...partial,
  };
}

describe('OL-16 applyAssetDragToShot', () => {
  it('绑定角色 / 场景 / 道具', () => {
    let shot = baseShot();
    const char = applyAssetDragToShot(shot, {
      id: 'c1',
      kind: 'character',
      scope: 'private',
      label: '林晓',
    });
    expect(char?.shot.characters).toEqual(['林晓']);
    shot = char!.shot;

    const scene = applyAssetDragToShot(shot, {
      id: 'sc1',
      kind: 'scene',
      scope: 'private',
      label: '茶馆',
    });
    expect(scene?.shot.scene).toBe('茶馆');

    const prop = applyAssetDragToShot(scene!.shot, {
      id: 'p1',
      kind: 'prop',
      scope: 'private',
      label: '茶杯',
    });
    expect(prop?.shot.propIds).toEqual(['p1']);
  });

  it('服装需已有角色；重复绑定返回 null', () => {
    const empty = applyAssetDragToShot(baseShot(), {
      id: 'cos1',
      kind: 'costume',
      scope: 'private',
      label: '青衫',
    });
    expect(empty).toBeNull();

    const withChar = baseShot({ characters: ['林晓'] });
    const once = applyAssetDragToShot(withChar, {
      id: 'c1',
      kind: 'character',
      scope: 'private',
      label: '林晓',
    });
    expect(once).toBeNull();
  });
});

describe('OL-22 preferPrivateAssetByLabel', () => {
  const privateItems: AssetLibraryItem[] = [
    { id: 'p1', kind: 'character', scope: 'private', label: '林晓', prompt: 'priv' },
  ];
  const publicItems: AssetLibraryItem[] = [
    { id: 'u1', kind: 'character', scope: 'public', label: '林晓', prompt: 'pub' },
    { id: 'u2', kind: 'character', scope: 'public', label: '空陈', prompt: 'pub2' },
  ];

  it('公私同名时优先私有并标冲突', () => {
    const hit = preferPrivateAssetByLabel('character', '林晓', privateItems, publicItems);
    expect(hit.item?.id).toBe('p1');
    expect(hit.scope).toBe('private');
    expect(hit.nameConflict).toBe(true);
  });

  it('仅公共时命中公共', () => {
    const hit = preferPrivateAssetByLabel('character', '空陈', privateItems, publicItems);
    expect(hit.item?.id).toBe('u2');
    expect(hit.scope).toBe('public');
    expect(hit.nameConflict).toBe(false);
  });
});

describe('OL-15 pollution', () => {
  it('同图 URL 被 ≥2 角色共用计入污染', () => {
    const shared = 'https://cdn.example/same.png';
    const analysis = analyzeAssetLibraryHealth({
      characters: [
        {
          id: 'c1',
          name: 'A',
          consistencyPrompt: 'a',
          referenceImageUrl: shared,
        },
        {
          id: 'c2',
          name: 'B',
          consistencyPrompt: 'b',
          referenceImageUrl: shared,
        },
        {
          id: 'c3',
          name: 'C',
          consistencyPrompt: 'c',
          referenceImageUrl: 'https://cdn.example/other.png',
        },
      ],
      workspaceItems: [],
      sounds: [],
      relationShots: [],
    });
    const pollution = analysis.byTab.character.find((m) => m.key === 'pollution');
    expect(pollution?.count).toBe(2);
    expect(pollution?.itemIds).toEqual(expect.arrayContaining(['c1', 'c2']));
  });
});

describe('OL-07 bible field diff', () => {
  it('覆盖推送前列出变更字段', () => {
    const pkg = emptyScreenplayPackage();
    pkg.bible.characters = [
      {
        id: 'd1',
        name: '林晓',
        identity: '旧身份',
        appearance: '旧外貌',
      },
    ];

    const profile: CharacterProfile = {
      id: 'c1',
      name: '林晓',
      consistencyPrompt: 'face',
      bible: {
        identity: '新身份',
        appearance: '新外貌',
      },
    };

    const diffs = diffCharacterBiblePush(pkg, profile);
    expect(diffs.some((d) => d.field === 'identity' && d.after === '新身份')).toBe(true);
    expect(diffs.some((d) => d.field === 'appearance' && d.after === '新外貌')).toBe(true);
  });
});
