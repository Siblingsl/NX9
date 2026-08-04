import { describe, expect, it } from 'vitest';
import {
  confirmScreenplayPackage,
  emptyScreenplayPackage,
  enrichBibleScenesFromPackage,
  episodesFromIngestText,
  bibleDraftsFromExtract,
  calibrateCharacterRolesByScreenplay,
  characterDraftFromPartial,
  ingestTextToPackage,
  migrateBlockKinds,
  migrateDialogueSheetDataToPackage,
  normalizeScreenplayEpisode,
  sceneDraftsFromScreenplayText,
  screenplayFullText,
  screenplayWordCount,
  removeScreenplayEpisode,
  summarizePackagePatch,
  findMatchingWorkingDraft,
  upsertScriptDeskWorkingDraft,
  touchScreenplayPackage,
  insertEmptyEpisodeAfter,
  lintScreenplayFormat,
  findReplaceInEpisode,
  renameCharacterInPackage,
} from '@nx9/shared';

describe('ScreenplayPackage / script-desk migration', () => {
  it('ingest 识别第N集', () => {
    const text = '第1集\n开场。\n\n第2集\n高潮。';
    const eps = episodesFromIngestText(text);
    expect(eps).toHaveLength(2);
    expect(eps[0].bodyMd).toContain('开场');
  });

  it('ingest 优先解析模型返回的 JSON episodes', () => {
    const text = JSON.stringify({
      screenplay: {
        sourceType: 'generated',
        episodes: [
          { index: 1, title: '第1集 开场', bodyMd: '【场景：雨夜】甲走进来。' },
          { index: 2, title: '第2集 假男友的自我修养', bodyMd: '【场景：餐厅】乙坐下。' },
        ],
      },
    });
    const eps = episodesFromIngestText(text);
    expect(eps).toHaveLength(2);
    expect(eps[0].title).toBe('第1集 开场');
    expect(eps[0].bodyMd).toContain('雨夜');
    expect(eps[1].title).toBe('第2集 假男友的自我修养');
    expect(eps[1].bodyMd).not.toContain('bodyMd');
  });

  it('从标准场头与遗留场头解析场景 draft', () => {
    const standard = sceneDraftsFromScreenplayText(
      '## S01 | 内景 · 咖啡厅 | 白天\n\n李稳坐下。\n\n## S02 | 外景 · 青水路 | 傍晚\n\n上车。',
    );
    expect(standard.map((s) => s.name)).toEqual(['咖啡厅', '青水路']);
    expect(standard[0].code).toBe('S01');
    expect(standard[0].summary).toContain('内景');

    const legacy = sceneDraftsFromScreenplayText(
      '【场景：出租屋外，下午】\n司机来了。\n\n咖啡厅。白天。\n李稳坐着。',
    );
    expect(legacy.map((s) => s.name)).toEqual(expect.arrayContaining(['出租屋外', '咖啡厅']));

    let pkg = emptyScreenplayPackage();
    pkg = {
      ...pkg,
      screenplay: {
        episodes: [{
          id: 'ep-1',
          index: 1,
          title: '第1集',
          bodyMd: '## S01 | 内景 · 福满楼 | 夜晚\n\n开饭。',
          updatedAt: new Date().toISOString(),
        }],
      },
    };
    pkg = enrichBibleScenesFromPackage(pkg);
    expect(pkg.bible.scenes.map((s) => s.name)).toContain('福满楼');
  });

  it('normalize 修复 title 泄漏 bodyMd 的脏数据', () => {
    const fixed = normalizeScreenplayEpisode({
      id: 'ep-3',
      index: 3,
      title: '第3集 鸿门宴上的男朋友","bodyMd":"【场景：清晨】宴会开始。"',
      bodyMd: '第3集 鸿门宴上的男朋友","bodyMd":"【场景：清晨】宴会开始。"',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(fixed.title).toBe('第3集 鸿门宴上的男朋友');
    expect(fixed.bodyMd).toContain('清晨');
    expect(fixed.bodyMd).not.toContain('bodyMd');
  });

  it('confirm 空稿失败、有正文成功', () => {
    const empty = confirmScreenplayPackage(emptyScreenplayPackage());
    expect(empty.status).not.toBe('confirmed');

    let pkg = ingestTextToPackage(emptyScreenplayPackage(), '第1集\n角色甲走进雨夜。', {
      sourceType: 'pasted',
      title: '雨夜',
    });
    pkg = confirmScreenplayPackage(pkg);
    expect(pkg.status).toBe('confirmed');
    expect(screenplayWordCount(pkg)).toBeGreaterThan(0);
    expect(screenplayFullText(pkg)).toContain('雨夜');
  });

  it('旧 dialogue-sheet data 迁移为 package', () => {
    const data = {
      sourceEpisodes: [
        { id: 'e1', title: '第1集', text: '对白内容甲乙丙', updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
      directorBrief: '偏文艺',
      scriptBreakdown: {
        version: 1 as const,
        title: '旧剧',
        episodes: [{ id: 'ep1', index: 1, title: '第1集', shots: [] }],
        characters: [{ name: '林晓', identity: '主角' }],
      },
    };
    const pkg = migrateDialogueSheetDataToPackage(data);
    expect(pkg.schema).toBe('nx9-screenplay-package');
    expect(pkg.screenplay.episodes).toHaveLength(1);
    expect(pkg.bible.characters.some((c) => c.name === '林晓')).toBe(true);
    expect(pkg.brief.notes).toBe('偏文艺');
  });

  it('migrateBlockKinds: dialogue-sheet → script-desk + package', () => {
    const { nodes, migratedCount } = migrateBlockKinds([
      {
        id: 'n1',
        type: 'dialogue-sheet',
        data: {
          sourceEpisodes: [{ id: 'e1', title: '第1集', text: '正文A', updatedAt: '2026-01-01T00:00:00.000Z' }],
          scriptBreakdown: {
            version: 1,
            title: '旧',
            episodes: [{ id: 'ep1', index: 1, title: '第1集', shots: [] }],
          },
        },
      },
    ]);
    expect(migratedCount).toBeGreaterThan(0);
    expect(nodes[0].type).toBe('script-desk');
    expect((nodes[0].data as { package?: { schema?: string } }).package?.schema).toBe('nx9-screenplay-package');
    expect((nodes[0].data as { legacyScriptBreakdown?: { version?: number } }).legacyScriptBreakdown?.version).toBe(1);
  });

  // Q-02: E-01 removeScreenplayEpisode
  it('removeScreenplayEpisode 删除后重排 index 1..n', () => {
    const pkg = ingestTextToPackage(emptyScreenplayPackage(), '第1集\na\n\n第2集\nb\n\n第3集\nc');
    expect(pkg.screenplay.episodes).toHaveLength(3);
    const ep2 = pkg.screenplay.episodes.find((ep) => ep.index === 2)!;
    const next = removeScreenplayEpisode(pkg, ep2.id);
    expect(next.screenplay.episodes).toHaveLength(2);
    expect(next.screenplay.episodes[0].index).toBe(1);
    expect(next.screenplay.episodes[1].index).toBe(2);
    expect(next.screenplay.episodes[1].bodyMd).toContain('c');
  });

  // Q-02: F-03 summarizePackagePatch
  it('summarizePackagePatch 包含 title 变动行', () => {
    const pkg = touchScreenplayPackage(emptyScreenplayPackage(), { brief: { title: '旧名' } });
    const lines = summarizePackagePatch(pkg, { brief: { title: '新名' } });
    expect(lines.some((l) => l.includes('brief.title') && l.includes('新名'))).toBe(true);
  });

  // Q-02: S-06 upsert working draft
  it('upsertScriptDeskWorkingDraft 同 workingKey 第二次 id 不变', () => {
    const pkg = emptyScreenplayPackage();
    const key = 'block-1';
    const r1 = upsertScriptDeskWorkingDraft([], { package: pkg, sourceBlockId: key });
    expect(r1.isNew).toBe(true);
    const r2 = upsertScriptDeskWorkingDraft(r1.drafts, { package: pkg, sourceBlockId: key });
    expect(r2.isNew).toBe(false);
    expect(r2.folder.id).toBe(r1.folder.id);
  });

  it('findMatchingWorkingDraft 查找 autosave 草稿', () => {
    const pkg = emptyScreenplayPackage();
    const r = upsertScriptDeskWorkingDraft([], { package: pkg, sourceBlockId: 'b1', kind: 'autosave' });
    const { index } = findMatchingWorkingDraft(r.drafts, 'b1');
    expect(index).toBeGreaterThanOrEqual(0);
    const { index: idx2 } = findMatchingWorkingDraft(r.drafts, 'nonexistent');
    expect(idx2).toBe(-1);
  });

  // Q-02: E-02 insertEmptyEpisodeAfter
  it('insertEmptyEpisodeAfter 在第二集后插入空集并重排 index', () => {
    let pkg = ingestTextToPackage(emptyScreenplayPackage(), '第1集\na\n\n第2集\nb\n\n第3集\nc');
    const ep2 = pkg.screenplay.episodes.find((ep) => ep.index === 2)!;
    pkg = insertEmptyEpisodeAfter(pkg, ep2.id);
    expect(pkg.screenplay.episodes).toHaveLength(4);
    expect(pkg.screenplay.episodes[0].index).toBe(1);
    expect(pkg.screenplay.episodes[1].index).toBe(2);
    expect(pkg.screenplay.episodes[2].index).toBe(3);
    expect(pkg.screenplay.episodes[2].bodyMd).toBe('');
    expect(pkg.screenplay.episodes[3].index).toBe(4);
    expect(pkg.screenplay.episodes[3].bodyMd).toContain('c');
  });

  it('insertEmptyEpisodeAfter null 空包返回一个空集', () => {
    let pkg = emptyScreenplayPackage();
    pkg = insertEmptyEpisodeAfter(pkg, null);
    expect(pkg.screenplay.episodes).toHaveLength(1);
    expect(pkg.screenplay.episodes[0].index).toBe(1);
    expect(pkg.screenplay.episodes[0].bodyMd).toBe('');
  });

  // Q-02: D-04 lintScreenplayFormat
  it('lintScreenplayFormat 捕获遗留【场景】标记', () => {
    let pkg = ingestTextToPackage(emptyScreenplayPackage(), '第1集\n【场景：咖啡厅】\n');
    const diag = lintScreenplayFormat(pkg);
    expect(diag.some((d) => d.code === 'legacy-scene-bracket')).toBe(true);
  });

  it('lintScreenplayFormat 捕获引导引号对白', () => {
    let pkg = ingestTextToPackage(emptyScreenplayPackage(), '第1集\n"林晓：你好"');
    const diag = lintScreenplayFormat(pkg);
    expect(diag.some((d) => d.code === 'quoted-dialogue')).toBe(true);
  });

  it('lintScreenplayFormat 捕获非末集（完）标记', () => {
    let pkg = ingestTextToPackage(emptyScreenplayPackage(), '第1集\na\n\n第2集\nb（完）\n\n第3集\nc');
    const diag = lintScreenplayFormat(pkg);
    expect(diag.some((d) => d.code === 'premature-end-marker')).toBe(true);
  });

  it('lintScreenplayFormat 末集（完）不报警', () => {
    let pkg = ingestTextToPackage(emptyScreenplayPackage(), '第1集\n开头\n\n第2集\n结尾\n（完）');
    const diag = lintScreenplayFormat(pkg);
    expect(diag.some((d) => d.code === 'premature-end-marker')).toBe(false);
  });

  // Q-02: X-02 findReplaceInEpisode
  it('findReplaceInEpisode 单集查找替换并计数', () => {
    const { bodyMd, count } = findReplaceInEpisode('林晓走进来。林晓坐下。', '林晓', '李稳');
    expect(bodyMd).toBe('李稳走进来。李稳坐下。');
    expect(count).toBe(2);
  });

  it('findReplaceInEpisode 空查找原样返回', () => {
    const { bodyMd, count } = findReplaceInEpisode('原文', '', '新');
    expect(bodyMd).toBe('原文');
    expect(count).toBe(0);
  });

  // Q-02: B-08 renameCharacterInPackage
  it('renameCharacterInPackage 整词替换成稿正文 + Bible', () => {
    let pkg = ingestTextToPackage(emptyScreenplayPackage(), '第1集\n林晓走进来。');
    pkg = touchScreenplayPackage(pkg, {
      bible: {
        characters: [{
          id: 'c1',
          name: '林晓',
          identity: '主角林晓',
          personality: '林晓很勇敢',
        }],
        scenes: [],
      },
    });
    pkg = renameCharacterInPackage(pkg, '林晓', '李稳');
    expect(pkg.screenplay.episodes[0].bodyMd).toContain('李稳');
    expect(pkg.screenplay.episodes[0].bodyMd).not.toContain('林晓');
    expect(pkg.bible.characters[0].name).toBe('李稳');
    expect(pkg.bible.characters[0].identity).toContain('李稳');
    expect(pkg.bible.characters[0].personality).toContain('李稳');
  });

  it('renameCharacterInPackage 仅改匹配角色不碰其他', () => {
    let pkg = touchScreenplayPackage(emptyScreenplayPackage(), {
      bible: {
        characters: [
          { id: 'c1', name: '林晓' },
          { id: 'c2', name: '阿强' },
        ],
        scenes: [],
      },
    });
    pkg = renameCharacterInPackage(pkg, '林晓', '李稳');
    expect(pkg.bible.characters[0].name).toBe('李稳');
    expect(pkg.bible.characters[1].name).toBe('阿强');
  });

  it('bibleDraftsFromExtract 映射 aliases / background / archetype', () => {
    const drafts = bibleDraftsFromExtract({
      characters: [
        {
          name: '林晓',
          aliases: ['老林', '林侦探'],
          archetype: '女主',
          description: '短发黑瞳',
          traits: '冷静',
          fixedVisualKeywords: '黑色风衣',
          goal: '查清真相',
          bible: {
            identity: '女主 · 刑警',
            appearance: '短发',
            personality: '冷静克制',
            background: '孤儿院长大',
            voice: '低沉',
            relationships: '搭档苏曼',
          },
        },
      ],
      locations: ['咖啡厅'],
    });
    expect(drafts.characters).toHaveLength(1);
    const c = drafts.characters[0];
    expect(c.name).toBe('林晓');
    expect(c.aliases).toEqual(['老林', '林侦探']);
    expect(c.identity).toContain('女主');
    expect(c.background).toBe('孤儿院长大');
    expect(c.appearance).toBeTruthy();
    expect(c.personality).toBeTruthy();
    expect(c.voiceNotes).toBe('低沉');
    expect(c.fixedVisualKeywords).toBe('黑色风衣');
    expect(c.goal).toBe('查清真相');
  });

  it('bibleDraftsFromExtract 兼容 alias(单数) 字段', () => {
    const drafts = bibleDraftsFromExtract({
      characters: [
        {
          name: '林晓',
          alias: '老林、林侦探',
          archetype: 'support',
          bible: {
            background: '孤儿院长大',
          },
        },
      ],
      locations: [],
    });
    const c = drafts.characters[0];
    expect(c.aliases).toEqual(['老林', '林侦探']);
    expect(c.identity).toContain('support');
    expect(c.background).toBe('孤儿院长大');
  });

  it('characterDraftFromPartial 从「化名」括号拆别名', () => {
    const c = characterDraftFromPartial({
      name: '苏黛 (化名苏曼)',
      identity: '配角',
    });
    expect(c.name).toBe('苏黛');
    expect(c.aliases).toEqual(['苏曼']);
  });

  it('bibleDraftsFromExtract 合并同人：脏名 + 干净名', () => {
    const drafts = bibleDraftsFromExtract({
      characters: [
        { name: '李稳 (化名陈默)', identity: '配角' },
        { name: '李稳', identity: '主角', aliases: ['陈默'] },
        { name: '苏盈', identity: '女主' },
      ],
    });
    expect(drafts.characters).toHaveLength(2);
    const li = drafts.characters.find((c) => c.name === '李稳');
    expect(li).toBeTruthy();
    expect(li?.aliases).toEqual(expect.arrayContaining(['陈默']));
    expect(li?.identity).toMatch(/主角/);
    expect(drafts.characters.some((c) => c.name.includes('化名'))).toBe(false);
  });

  it('bibleDraftsFromExtract 合并同人：真名条目 + 别名条目', () => {
    const drafts = bibleDraftsFromExtract({
      characters: [
        { name: '李稳', aliases: ['陈默'], identity: '主角' },
        { name: '陈默', identity: '配角 · 化名出场' },
      ],
    });
    expect(drafts.characters).toHaveLength(1);
    expect(drafts.characters[0].name).toBe('李稳');
    expect(drafts.characters[0].aliases).toEqual(expect.arrayContaining(['陈默']));
    expect(drafts.characters[0].identity).toMatch(/主角/);
  });

  it('calibrateCharacterRolesByScreenplay 根据正文命中自动收敛主/配角', () => {
    const drafts = bibleDraftsFromExtract({
      characters: [
        { name: '李稳', identity: '刑警' },
        { name: '苏曼', identity: '记者' },
        { name: '红姨', identity: '房东' },
        { name: '刀疤', identity: '反派打手' },
      ],
    }).characters;
    const text = [
      '第1集',
      '李稳：我来查案。',
      '苏曼：我跟你一起。',
      '李稳：先去仓库。',
      '苏曼：收到。',
      '红姨：房租别忘了。',
      '第2集',
      '李稳：目标出现。',
      '苏曼：我在门口接应。',
      '刀疤：上。',
    ].join('\n');
    const calibrated = calibrateCharacterRolesByScreenplay(drafts, text);
    const byName = new Map(calibrated.map((c) => [c.name, c.identity ?? '']));
    expect(byName.get('李稳')).toMatch(/^主角/);
    expect(byName.get('苏曼')).toMatch(/^主角/);
    expect(byName.get('红姨')).toMatch(/^配角/);
    expect(byName.get('刀疤')).toMatch(/^配角/);
  });
});
