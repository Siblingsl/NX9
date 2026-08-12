import { describe, expect, it } from 'vitest';
import { emptyScreenplayPackage } from '@nx9/shared';
import {
  confirmedLatchForSnapshot,
  countCharacterRenameHits,
  isBibleCardHighlighted,
  shouldPushUndo,
  shouldShowUnconfirmBanner,
} from '../script-desk/desk-helpers';

describe('shouldPushUndo', () => {
  it('结构性操作每次入栈', () => {
    expect(shouldPushUndo('struct', { mode: 'struct', at: 1000 }, 1001)).toBe(true);
    expect(shouldPushUndo('struct', { mode: 'typing', at: 1000 }, 1001)).toBe(true);
  });

  it('键入 2s 窗口内合并', () => {
    expect(shouldPushUndo('typing', null, 1000)).toBe(true);
    expect(shouldPushUndo('typing', { mode: 'typing', at: 1000 }, 2500)).toBe(false);
    expect(shouldPushUndo('typing', { mode: 'typing', at: 1000 }, 3001)).toBe(true);
  });

  it('结构性之后的键入重新入栈', () => {
    expect(shouldPushUndo('typing', { mode: 'struct', at: 1000 }, 1100)).toBe(true);
  });

  it('undo:false 永不入栈', () => {
    expect(shouldPushUndo(false, null, 1000)).toBe(false);
  });
});

describe('确认失效 banner latch', () => {
  it('仅在本稿曾确认且当前非 confirmed 时显示', () => {
    expect(shouldShowUnconfirmBanner('drafting', true, 2)).toBe(true);
    expect(shouldShowUnconfirmBanner('confirmed', true, 2)).toBe(false);
    expect(shouldShowUnconfirmBanner('drafting', false, 2)).toBe(false);
    expect(shouldShowUnconfirmBanner('drafting', true, 0)).toBe(false);
  });

  it('换稿/重置按快照 status 复位，不沿用旧 latch', () => {
    expect(confirmedLatchForSnapshot('drafting')).toBe(false);
    expect(confirmedLatchForSnapshot('empty')).toBe(false);
    expect(confirmedLatchForSnapshot('confirmed')).toBe(true);
  });
});

describe('countCharacterRenameHits', () => {
  it('正文与设定卡分别计数', () => {
    const pkg = emptyScreenplayPackage();
    pkg.screenplay.episodes = [
      { id: 'ep-1', index: 1, title: '林晓归来', bodyMd: '林晓走进大厅。林晓抬头。', updatedAt: new Date().toISOString() },
    ];
    pkg.bible.characters = [
      { id: 'c1', name: '林晓', identity: '林晓是女主', personality: '冷静' },
    ];
    expect(countCharacterRenameHits(pkg, '林晓')).toEqual({ bodyHits: 3, bibleHits: 2 });
  });
});

describe('isBibleCardHighlighted', () => {
  it('id / name / code 任一命中即高亮', () => {
    const char = { id: 'c1', name: '林晓' };
    expect(isBibleCardHighlighted('c1', char)).toBe(true);
    expect(isBibleCardHighlighted('林晓', char)).toBe(true);
    expect(isBibleCardHighlighted('other', char)).toBe(false);
    expect(isBibleCardHighlighted('S01', { id: 's1', name: '客厅', code: 'S01' })).toBe(true);
  });
});
