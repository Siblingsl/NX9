/**
 * R3 3.2: 全局改名必须同步未应用 pending，避免 Apply 后旧名写回。
 */
import { describe, expect, it } from 'vitest';
import type { ScriptDeskAgentSession } from '@nx9/shared';
import { renameCharacterInPendingSession } from '../bible-library-sync';

function pendingMessage(id: string, bodyMd: string, extras: { applied?: boolean; discarded?: boolean } = {}): ScriptDeskAgentSession['messages'][number] {
  return {
    id,
    role: 'assistant',
    content: `重写 ${id}`,
    createdAt: '2026-08-12T00:00:00.000Z',
    pendingPatch: {
      episodesMergeMode: 'upsert',
      screenplay: {
        episodes: [
          {
            id: 'ep-1',
            index: 1,
            title: '林小满的夜晚',
            bodyMd,
            updatedAt: '2026-08-12T00:01:00.000Z',
          },
        ],
      },
    },
    applied: extras.applied ?? false,
    discarded: extras.discarded ?? false,
  };
}

function makeSession(messages: ScriptDeskAgentSession['messages']): ScriptDeskAgentSession {
  return { messages, updatedAt: '2026-08-12T00:01:00.000Z' };
}

describe('renameCharacterInPendingSession', () => {
  it('只改未应用 pending 的正文与标题，不动已应用/已丢弃消息', () => {
    const session = makeSession([
      pendingMessage('m-pending', '林小满：你好'),
      pendingMessage('m-applied', '林小满：已应用', { applied: true }),
      pendingMessage('m-discarded', '林小满：已丢弃', { discarded: true }),
    ]);

    const next = renameCharacterInPendingSession(session, '林小满', '林小满·新');
    expect(next).not.toBeNull();
    const pending = next!.messages.find((m) => m.id === 'm-pending');
    const episodes = (pending!.pendingPatch as { screenplay: { episodes: Array<{ title: string; bodyMd: string }> } }).screenplay.episodes;
    expect(episodes[0].bodyMd).toBe('林小满·新：你好');
    expect(episodes[0].title).toBe('林小满·新的夜晚');

    const applied = next!.messages.find((m) => m.id === 'm-applied');
    const appliedEpisodes = (applied!.pendingPatch as { screenplay: { episodes: Array<{ bodyMd: string }> } }).screenplay.episodes;
    expect(appliedEpisodes[0].bodyMd).toBe('林小满：已应用');

    const discarded = next!.messages.find((m) => m.id === 'm-discarded');
    const discardedEpisodes = (discarded!.pendingPatch as { screenplay: { episodes: Array<{ bodyMd: string }> } }).screenplay.episodes;
    expect(discardedEpisodes[0].bodyMd).toBe('林小满：已丢弃');
  });

  it('只有已应用/已丢弃 pending 时返回 null', () => {
    const session = makeSession([
      pendingMessage('m-applied', '林小满：已应用', { applied: true }),
      pendingMessage('m-discarded', '林小满：已丢弃', { discarded: true }),
    ]);
    expect(renameCharacterInPendingSession(session, '林小满', '林小满·新')).toBeNull();
  });
});
