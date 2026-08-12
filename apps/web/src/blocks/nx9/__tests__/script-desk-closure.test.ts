/**
 * 编剧台本轮收口：helpers / runner 错误码 / 素材库改名 / pending 瘦身。
 */
import { describe, expect, it } from 'vitest';
import { emptyScreenplayPackage, type ScriptDeskAgentSession } from '@nx9/shared';
import type { CharacterProfile } from '@nx9/shared';
import {
  classifyScriptDeskError,
  compactAgentSession,
  discardPendingMessagePatch,
  formatScriptDeskError,
} from '../../../engine/script-desk-runner';
import {
  findLibraryCharacterForRename,
  libraryCharacterRenameConflict,
  renameLibraryCharacterProfile,
} from '../../../engine/bible-library-sync';
import {
  initialOpenEpisodeIds,
  resolveLibraryItemId,
  textLooksLikeEpisodicScreenplay,
  shouldPushUndo,
} from '../script-desk/desk-helpers';

function char(partial: Partial<CharacterProfile> & { id: string; name: string }): CharacterProfile {
  const { id, name, creative, ...rest } = partial;
  return {
    ...rest,
    id,
    name,
    creative: { aliases: creative?.aliases ?? [], ...creative },
  } as CharacterProfile;
}

describe('desk-helpers 展开 / 剪贴板 / 撤销粒度', () => {
  it('initialOpenEpisodeIds 默认只开第 1 集', () => {
    const pkg = emptyScreenplayPackage();
    pkg.screenplay.episodes = [
      { id: 'ep-2', index: 2, title: '二', bodyMd: '', updatedAt: '' },
      { id: 'ep-1', index: 1, title: '一', bodyMd: '', updatedAt: '' },
    ];
    expect(initialOpenEpisodeIds(pkg)).toEqual(['ep-1']);
  });

  it('textLooksLikeEpisodicScreenplay 识别「第N集」', () => {
    expect(textLooksLikeEpisodicScreenplay('第1集\n正文')).toBe(true);
    expect(textLooksLikeEpisodicScreenplay('随便一段话')).toBe(false);
  });

  it('resolveLibraryItemId 优先认 id，否则按 name', () => {
    const items = [{ id: 'c-1', name: '林小满', label: '林小满' }];
    expect(resolveLibraryItemId('c-1', items)).toBe('c-1');
    expect(resolveLibraryItemId('林小满', items)).toBe('c-1');
    expect(resolveLibraryItemId('未知', items)).toBe('未知');
  });

  it('shouldPushUndo：struct 每次入栈，typing 2s 内合并', () => {
    expect(shouldPushUndo('struct', null, 1000)).toBe(true);
    expect(shouldPushUndo('typing', { mode: 'typing', at: 900 }, 1000)).toBe(false);
    expect(shouldPushUndo('typing', { mode: 'typing', at: 100 }, 3000)).toBe(true);
    expect(shouldPushUndo(false, null, 1000)).toBe(false);
  });
});

describe('素材库改名同步 helpers', () => {
  it('findLibraryCharacterForRename 按 id / 名 / 别名命中', () => {
    const list = [
      char({ id: 'c1', name: '林小满', creative: { aliases: ['小满'] } }),
      char({ id: 'c2', name: '苏晚' }),
    ];
    expect(findLibraryCharacterForRename(list, { oldName: '林小满' })?.id).toBe('c1');
    expect(findLibraryCharacterForRename(list, { oldName: '小满' })?.id).toBe('c1');
    expect(findLibraryCharacterForRename(list, { oldName: 'x', libraryCharacterId: 'c2' })?.id).toBe('c2');
  });

  it('renameLibraryCharacterProfile 写旧名到 aliases', () => {
    const next = renameLibraryCharacterProfile(char({ id: 'c1', name: '林小满' }), '林小满', '苏晚');
    expect(next.name).toBe('苏晚');
    expect(next.creative?.aliases).toContain('林小满');
  });

  it('libraryCharacterRenameConflict 检出同名冲突', () => {
    const list = [char({ id: 'c1', name: '林小满' }), char({ id: 'c2', name: '苏晚' })];
    expect(libraryCharacterRenameConflict(list, 'c1', '苏晚')?.id).toBe('c2');
    expect(libraryCharacterRenameConflict(list, 'c1', '新名')).toBeUndefined();
  });
});

describe('runner 错误码与 pending 瘦身', () => {
  it('classifyScriptDeskError 识别限流/超时/中止', () => {
    expect(classifyScriptDeskError(new DOMException('x', 'AbortError')).code).toBe('abort');
    expect(classifyScriptDeskError(new Error('429 rate limit')).code).toBe('rate_limit');
    expect(classifyScriptDeskError(new Error('timeout')).code).toBe('timeout');
    expect(formatScriptDeskError(new Error('429 too many'))).toContain('稍后再试');
  });

  it('compactAgentSession / discardPendingMessagePatch 去掉 pendingPatch 全文', () => {
    const session: ScriptDeskAgentSession = {
      messages: [
        {
          id: 'm1',
          role: 'assistant',
          content: 'ok',
          createdAt: new Date().toISOString(),
          applied: true,
          pendingPatch: { screenplay: { episodes: [{ id: 'e', index: 1, title: 't', bodyMd: '很长'.repeat(50), updatedAt: '' }] } } as never,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    const compacted = compactAgentSession(session);
    expect(compacted.messages[0].pendingPatch).toBeUndefined();
    const discarded = discardPendingMessagePatch({
      ...session,
      messages: [{ ...session.messages[0], applied: false, discarded: false }],
    }, 'm1');
    expect(discarded.messages[0].discarded).toBe(true);
    expect(discarded.messages[0].pendingPatch).toBeUndefined();
  });
});
