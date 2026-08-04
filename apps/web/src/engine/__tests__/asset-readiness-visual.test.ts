/**
 * asset-readiness 视觉门槛：主角三视图 / 配角定妆
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterProfile, ScreenplayPackage } from '@nx9/shared';
import { emptyScreenplayPackage } from '@nx9/shared';

const libraryState = vi.hoisted(() => ({
  characters: [] as CharacterProfile[],
}));

vi.mock('../../stores/workspace-document', () => ({
  useWorkspaceDocument: Object.assign(
    (selector?: (s: unknown) => unknown) => {
      const state = {
        characters: { characters: libraryState.characters },
        environments: { environments: [] },
        backlotWorkspace: { items: [] },
        upsertCharacter: vi.fn((profile: CharacterProfile) => {
          libraryState.characters = [...libraryState.characters.filter((c) => c.id !== profile.id), profile];
        }),
        upsertBacklotWorkspace: vi.fn(),
      };
      return selector ? selector(state) : state;
    },
    {
      getState: () => ({
        characters: { characters: libraryState.characters },
        environments: { environments: [] },
        backlotWorkspace: { items: [] },
        upsertCharacter: (profile: CharacterProfile) => {
          libraryState.characters = [...libraryState.characters.filter((c) => c.id !== profile.id), profile];
        },
        upsertBacklotWorkspace: vi.fn(),
      }),
    },
  ),
}));

import {
  classifyBibleCharacterRoles,
  characterProfileFromBibleDraft,
  hasCharacterReferenceImage,
  hasCharacterTurnaround,
  inspectBibleAssets,
  mergeCharacterProfileFillEmpty,
  syncBibleAssets,
} from '../asset-readiness';

function pkgWithChars(
  characters: Array<{ name: string; identity?: string }>,
  episodeBodies: string[] = [],
): ScreenplayPackage {
  const base = emptyScreenplayPackage();
  return {
    ...base,
    status: 'confirmed',
    bible: {
      ...base.bible,
      characters: characters.map((c, i) => ({
        id: `c-${i}`,
        name: c.name,
        identity: c.identity,
      })),
      scenes: [{ id: 's-1', name: '客厅' }],
    },
    screenplay: {
      ...base.screenplay,
      episodes: episodeBodies.map((bodyMd, i) => ({
        id: `ep-${i + 1}`,
        index: i + 1,
        title: `第${i + 1}集`,
        bodyMd,
      })),
    },
  };
}

describe('asset-readiness character visuals', () => {
  beforeEach(() => {
    libraryState.characters = [];
  });

  it('identity 标明主角 → main', () => {
    const pkg = pkgWithChars([
      { name: '林晓', identity: '女主' },
      { name: '路人甲' },
    ]);
    const roles = classifyBibleCharacterRoles(pkg);
    expect(roles.get('林晓')).toBe('main');
    expect(roles.get('路人甲')).toBe('support');
  });

  it('跨多集出场但不标身份 → 仍为 support（不看出场集数）', () => {
    const pkg = pkgWithChars(
      [{ name: '林晓' }, { name: '路人甲' }],
      ['林晓走进教室', '林晓回头'],
    );
    const roles = classifyBibleCharacterRoles(pkg);
    expect(roles.get('林晓')).toBe('support');
    expect(roles.get('路人甲')).toBe('support');
  });

  it('明确配角优先于主角词；无人标明时不兜底抬主角', () => {
    const pkg = pkgWithChars([
      { name: '红姨', identity: '配角 · 媒人' },
      { name: '刀疤', identity: '反派打手' },
      { name: '林晓', identity: '女主兼配角视角' },
    ]);
    const roles = classifyBibleCharacterRoles(pkg);
    expect(roles.get('红姨')).toBe('support');
    expect(roles.get('刀疤')).toBe('support');
    // 同时含「女主」与「配角」→ 配角优先
    expect(roles.get('林晓')).toBe('support');
  });

  it('主视角/leading 也算 main（但不看出场集数兜底）', () => {
    const pkg = pkgWithChars([
      { name: '李稳', identity: '主角 · 假男友' },
      { name: '旁白', identity: '主视角叙述' },
      { name: '客串', identity: 'leading man in episode' },
    ]);
    const roles = classifyBibleCharacterRoles(pkg);
    expect(roles.get('李稳')).toBe('main');
    expect(roles.get('旁白')).toBe('main');
    expect(roles.get('客串')).toBe('main');
  });

  it('配角缺定妆 → missingCharacterRefs；主角缺三视图 → missingCharacterTurnarounds', () => {
    libraryState.characters = [
      {
        id: 'char-1',
        name: '林晓',
        consistencyPrompt: 'young woman',
        // 无图
      },
      {
        id: 'char-2',
        name: '路人甲',
        consistencyPrompt: 'extra',
        // 无图
      },
    ];
    const pkg = pkgWithChars([
      { name: '林晓', identity: '女主' },
      { name: '路人甲' },
    ]);
    const state = inspectBibleAssets(pkg);
    expect(state.ready).toBe(false);
    expect(state.missingCharacters).toEqual([]);
    expect(state.missingCharacterRefs).toEqual(expect.arrayContaining(['林晓', '路人甲']));
    expect(state.missingCharacterTurnarounds).toEqual(['林晓']);
  });

  it('配角有定妆即可；主角有完整设定板即可过关', () => {
    libraryState.characters = [
      {
        id: 'char-1',
        name: '林晓',
        referenceImageUrl: 'https://x/ref.png',
        creative: { fullSheetUrl: 'https://x/sheet.png' },
      },
      {
        id: 'char-2',
        name: '路人甲',
        referenceImageUrl: 'https://x/extra.png',
      },
    ];
    const pkg = pkgWithChars([
      { name: '林晓', identity: '女主' },
      { name: '路人甲' },
    ]);
    // 场景也要入库，否则 ready 仍 false
    // inspect 用 environments / backlot — 这里 scenes 会进 missingScenes
    // 简化：不要求场景过关时只断言视觉字段
    const state = inspectBibleAssets(pkg);
    expect(state.missingCharacterRefs ?? []).toEqual([]);
    expect(state.missingCharacterTurnarounds ?? []).toEqual([]);
    expect(hasCharacterTurnaround(libraryState.characters[0])).toBe(true);
    expect(hasCharacterReferenceImage(libraryState.characters[1])).toBe(true);
  });

  it('主角正侧背齐全也过关', () => {
    const profile: CharacterProfile = {
      id: 'char-1',
      name: '林晓',
      referenceImageUrl: 'https://x/front.png',
      creative: {
        frontViewUrl: 'https://x/front.png',
        sideViewUrl: 'https://x/side.png',
        backViewUrl: 'https://x/back.png',
      },
    };
    expect(hasCharacterTurnaround(profile)).toBe(true);
  });
});

describe('characterProfileFromBibleDraft / sync fill-empty', () => {
  beforeEach(() => {
    libraryState.characters = [];
  });

  it('draft → 档案填满文本字段并生成 consistencyPrompt', () => {
    const profile = characterProfileFromBibleDraft({
      id: 'd-1',
      name: '林晓',
      aliases: ['老林', '林侦探'],
      identity: '女主 · 刑警',
      appearance: '短发黑瞳',
      personality: '冷静',
      background: '孤儿院长大',
      voiceNotes: '低沉',
      relationships: '搭档苏曼',
      fixedVisualKeywords: '黑色风衣',
    });
    expect(profile.name).toBe('林晓');
    expect(profile.tags).toContain('主角');
    expect(profile.bible?.identity).toContain('女主');
    expect(profile.bible?.appearance).toContain('短发黑瞳');
    expect(profile.bible?.appearance).toContain('黑色风衣');
    expect(profile.bible?.background).toBe('孤儿院长大');
    expect(profile.creative?.aliases).toEqual(['老林', '林侦探']);
    expect(profile.creative?.nickname).toBe('老林');
    expect(profile.creative?.identityRole).toContain('女主');
    expect(profile.consistencyPrompt?.trim()).toBeTruthy();
  });

  it('姓名含「化名」时拆到 aliases，并清洗 name', () => {
    const profile = characterProfileFromBibleDraft({
      id: 'd-1',
      name: '苏黛 (化名苏曼)',
      identity: '配角 · 黑帮女大佬',
      appearance: '黑长卷发',
    });
    expect(profile.name).toBe('苏黛');
    expect(profile.creative?.aliases).toEqual(['苏曼']);
    expect(profile.creative?.nickname).toBe('苏曼');
    expect(profile.tags).toContain('配角');
  });

  it('已有脏名角色同步时补 aliases 并清洗 name', () => {
    libraryState.characters = [
      {
        id: 'char-su',
        name: '苏黛 (化名苏曼)',
        bible: { appearance: '已有外貌' },
      },
    ];
    const base = emptyScreenplayPackage();
    const pkg: ScreenplayPackage = {
      ...base,
      status: 'confirmed',
      bible: {
        ...base.bible,
        characters: [
          {
            id: 'c-1',
            name: '苏黛 (化名苏曼)',
            identity: '配角',
            personality: '冷静强势',
          },
        ],
        scenes: [{ id: 's-1', name: '咖啡厅' }],
      },
    };
    const result = syncBibleAssets(pkg);
    expect(result.filledCharacters).toBe(1);
    const su = libraryState.characters.find((c) => c.id === 'char-su');
    expect(su?.name).toBe('苏黛');
    expect(su?.creative?.aliases).toEqual(['苏曼']);
    expect(su?.creative?.nickname).toBe('苏曼');
    expect(su?.tags).toContain('配角');
    expect(su?.bible?.appearance).toBe('已有外貌');
  });

  it('identity = support → tags 应含「配角」', () => {
    const profile = characterProfileFromBibleDraft({
      id: 'd-1',
      name: '路人甲',
      identity: 'support',
      appearance: '白衬衫',
      personality: '热心',
    });
    expect(profile.tags).toContain('配角');
  });

  it('mergeCharacterProfileFillEmpty 只补空，不覆盖已有与图片', () => {
    const existing: CharacterProfile = {
      id: 'char-1',
      name: '林晓',
      consistencyPrompt: 'LOCKED PROMPT',
      referenceImageUrl: 'https://x/ref.png',
      bible: { appearance: '已有外貌' },
      creative: {
        frontViewUrl: 'https://x/front.png',
        costumeId: 'cos-1',
        costumeLabel: '风衣',
        viewsLocked: true,
      },
    };
    const incoming = characterProfileFromBibleDraft({
      id: 'd-1',
      name: '林晓',
      identity: '女主',
      appearance: '新外貌应被忽略',
      personality: '应补性格',
      background: '应补背景',
    });
    const merged = mergeCharacterProfileFillEmpty(existing, incoming);
    expect(merged.consistencyPrompt).toBe('LOCKED PROMPT');
    expect(merged.bible?.appearance).toBe('已有外貌');
    expect(merged.bible?.personality).toBe('应补性格');
    expect(merged.bible?.background).toBe('应补背景');
    expect(merged.referenceImageUrl).toBe('https://x/ref.png');
    expect(merged.creative?.frontViewUrl).toBe('https://x/front.png');
    expect(merged.creative?.costumeId).toBe('cos-1');
    expect(merged.creative?.viewsLocked).toBe(true);
  });

  it('syncBibleAssets 新建缺失并补全已有空字段', () => {
    libraryState.characters = [
      {
        id: 'char-exist',
        name: '苏曼',
        bible: { appearance: '已有' },
      },
    ];
    const base = emptyScreenplayPackage();
    const pkg: ScreenplayPackage = {
      ...base,
      status: 'confirmed',
      bible: {
        ...base.bible,
        characters: [
          {
            id: 'c-1',
            name: '林晓',
            identity: '女主',
            appearance: '短发',
            personality: '冷静',
            background: '刑警',
            aliases: ['老林'],
          },
          {
            id: 'c-2',
            name: '苏曼',
            identity: '配角',
            personality: '应补',
            background: '应补背景',
          },
        ],
        scenes: [{ id: 's-1', name: '客厅' }],
      },
    };
    const result = syncBibleAssets(pkg);
    expect(result.syncedCharacters).toBe(1);
    expect(result.filledCharacters).toBe(1);
    const lin = libraryState.characters.find((c) => c.name === '林晓');
    const su = libraryState.characters.find((c) => c.name === '苏曼');
    expect(lin?.bible?.appearance).toContain('短发');
    expect(lin?.creative?.aliases).toEqual(['老林']);
    expect(lin?.consistencyPrompt?.trim()).toBeTruthy();
    expect(lin?.creative?.prompts?.negative?.text?.trim()).toBeTruthy();
    expect(su?.bible?.appearance).toBe('已有');
    expect(su?.bible?.personality).toBe('应补');
    expect(su?.bible?.background).toBe('应补背景');
    expect(su?.referenceImageUrl).toBeUndefined();
    expect(su?.creative?.prompts?.negative?.text?.trim()).toBeTruthy();
  });
});
