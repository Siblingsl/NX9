import { describe, expect, it } from 'vitest';
import {
  confirmScreenplayPackage,
  emptyScreenplayPackage,
  episodesFromIngestText,
  ingestTextToPackage,
  migrateBlockKinds,
  migrateDialogueSheetDataToPackage,
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
