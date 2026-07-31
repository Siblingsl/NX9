import { describe, expect, it } from 'vitest';
import {
  confirmScreenplayPackage,
  emptyScreenplayPackage,
  enrichBibleScenesFromPackage,
  episodesFromIngestText,
  ingestTextToPackage,
  migrateBlockKinds,
  migrateDialogueSheetDataToPackage,
  normalizeScreenplayEpisode,
  sceneDraftsFromScreenplayText,
  screenplayFullText,
  screenplayWordCount,
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
});
