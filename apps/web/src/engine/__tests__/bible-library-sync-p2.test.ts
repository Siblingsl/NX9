/**
 * C-02 Bible ← 库回写 · H-03 Prompt 漂移 · Sty 解析
 */
import { describe, expect, it } from 'vitest';
import type { BacklotWorkspaceItem, CharacterProfile, ScreenplayPackage } from '@nx9/shared';
import { emptyScreenplayPackage, findStylePresetByName, parseAssetMentions } from '@nx9/shared';
import {
  characterDraftFromProfile,
  pushCharacterToBiblePackage,
  pushSceneToBiblePackage,
} from '../bible-library-sync';
import { analyzeAssetLibraryHealth } from '../asset-library-health';

describe('bible-library-sync C-02', () => {
  it('characterDraftFromProfile 映射库字段到 Bible draft', () => {
    const profile: CharacterProfile = {
      id: 'c1',
      name: '林晓',
      bible: { identity: '警探', appearance: '短发', personality: '冷静' },
      creative: { aliases: ['老林'] },
      consistencyPrompt: 'face lock',
    };
    const draft = characterDraftFromProfile(profile);
    expect(draft.name).toBe('林晓');
    expect(draft.identity).toBe('警探');
    expect(draft.appearance).toBe('短发');
    expect(draft.libraryCharacterId).toBe('c1');
    expect(draft.libraryStatus).toBe('in_library');
  });

  it('pushCharacterToBiblePackage fill-empty 不覆盖已有', () => {
    let pkg: ScreenplayPackage = emptyScreenplayPackage();
    pkg = {
      ...pkg,
      bible: {
        ...pkg.bible,
        characters: [
          {
            id: 'd1',
            name: '林晓',
            identity: '旧身份',
            appearance: '',
          },
        ],
      },
    };
    const profile: CharacterProfile = {
      id: 'c1',
      name: '林晓',
      bible: { identity: '新身份', appearance: '短发' },
      consistencyPrompt: 'x',
    };
    const filled = pushCharacterToBiblePackage(pkg, profile, 'fill-empty');
    expect(filled.action).toBe('filled');
    expect(filled.package.bible.characters[0].identity).toBe('旧身份');
    expect(filled.package.bible.characters[0].appearance).toBe('短发');

    const overwritten = pushCharacterToBiblePackage(pkg, profile, 'overwrite');
    expect(overwritten.action).toBe('overwritten');
    expect(overwritten.package.bible.characters[0].identity).toBe('新身份');
  });

  it('pushSceneToBiblePackage 可新建场景 draft', () => {
    const pkg = emptyScreenplayPackage();
    const item: BacklotWorkspaceItem = {
      id: 'sc1',
      kind: 'scene',
      label: '茶馆',
      promptEn: 'teahouse',
      creative: { description: '木桌', lighting: '侧光' },
    };
    const result = pushSceneToBiblePackage(pkg, item, 'fill-empty');
    expect(result.action).toBe('created');
    expect(result.package.bible.scenes[0].name).toBe('茶馆');
  });
});

describe('H-03 prompt drift', () => {
  it('锁定后 Prompt 变更计入 promptDrift', () => {
    const characters: CharacterProfile[] = [
      {
        id: 'c1',
        name: '林晓',
        consistencyPrompt: 'new prompt',
        creative: {
          consistency: {
            locked: true,
            lockedPromptSnapshot: 'old prompt',
          },
        },
      },
    ];
    const analysis = analyzeAssetLibraryHealth({
      characters,
      workspaceItems: [
        {
          id: 'sh1',
          kind: 'shot',
          label: '推镜',
          promptEn: 'dolly in now',
          creative: {
            locked: true,
            lockedPromptSnapshot: 'dolly in',
          },
        },
      ],
      sounds: [],
      relationShots: [],
    });
    expect(analysis.byTab.character.find((m) => m.key === 'promptDrift')?.count).toBe(1);
    expect(analysis.byTab.shot.find((m) => m.key === 'promptDrift')?.count).toBe(1);
    expect(analysis.byTab.shot.find((m) => m.key === 'unlocked')?.count).toBe(0);
  });
});

describe('Sty-02 @风格 mention', () => {
  it('parseAssetMentions 识别风格', () => {
    const hits = parseAssetMentions('画面用 @风格:电影感 与 @角色:林晓');
    expect(hits.some((h) => h.kind === 'style' && h.label === '电影感')).toBe(true);
  });

  it('findStylePresetByName 命中内置', () => {
    const hit = findStylePresetByName('线稿');
    expect(hit?.builtinKey).toBe('line-art');
  });
});
