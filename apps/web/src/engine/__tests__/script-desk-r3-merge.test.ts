/**
 * R3: pending 成稿补丁必须按集增量合并，不能整表回滚并发编辑。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  applyPackagePatch,
  emptyScreenplayPackage,
  touchScreenplayPackage,
  type ScreenplayPackage,
  type ScriptDeskAgentSession,
} from '@nx9/shared';
import { api } from '../../api/client';
import {
  applyPendingMessagePatch,
  runAppendEpisodeSkill,
  runGenerateScreenplaySkill,
  runRewriteEpisodeSkill,
} from '../script-desk-runner';

vi.mock('../../api/client', () => ({
  api: {
    scriptScreenplay: vi.fn(),
    scriptScreenplayStream: vi.fn(),
  },
}));

function basePkg(): ScreenplayPackage {
  const pkg = emptyScreenplayPackage();
  pkg.brief = { ...pkg.brief, title: '测试剧', episodeWordTarget: 300 };
  pkg.bible.world = { visualStyleNotes: '明亮干净' };
  pkg.screenplay.episodes = [
    { id: 'ep-1', index: 1, title: '第1集', bodyMd: '第一集旧文', updatedAt: '2026-08-12T00:00:00.000Z' },
    { id: 'ep-2', index: 2, title: '第2集', bodyMd: '第二集旧文', updatedAt: '2026-08-12T00:00:00.000Z' },
    { id: 'ep-3', index: 3, title: '第3集', bodyMd: '第三集旧文', updatedAt: '2026-08-12T00:00:00.000Z' },
  ];
  return touchScreenplayPackage(pkg);
}

function epPatch(episodeId: string, bodyMd: string): Record<string, unknown> {
  const index = Number(episodeId.slice(-1));
  return {
    episodesMergeMode: 'upsert',
    screenplay: {
      episodes: [{ id: episodeId, index, title: `第${index}集`, bodyMd, updatedAt: '2026-08-12T01:00:00.000Z' }],
    },
  };
}

describe('编剧台 R3 pending 增量合并', () => {
  it('applyPackagePatch 应用第 1 集重写时保留第 2 集并发手改', () => {
    const base = basePkg();
    const edited = touchScreenplayPackage(base, {
      screenplay: {
        ...base.screenplay,
        episodes: base.screenplay.episodes.map((ep) =>
          ep.id === 'ep-2' ? { ...ep, bodyMd: '第二集手改', updatedAt: '2026-08-12T00:30:00.000Z' } : ep,
        ),
      },
    });
    const next = applyPackagePatch(edited, epPatch('ep-1', '第一集新稿'));
    expect(next.screenplay.episodes.find((ep) => ep.id === 'ep-1')?.bodyMd).toBe('第一集新稿');
    expect(next.screenplay.episodes.find((ep) => ep.id === 'ep-2')?.bodyMd).toBe('第二集手改');
    expect(next.screenplay.episodes.find((ep) => ep.id === 'ep-3')?.bodyMd).toBe('第三集旧文');
  });

  it('先后应用两条重写 pending，两集新文都在且不互相覆盖', () => {
    const session: ScriptDeskAgentSession = {
      messages: [
        {
          id: 'm1',
          role: 'assistant',
          content: '第一集新稿',
          createdAt: '2026-08-12T00:00:00.000Z',
          pendingPatch: epPatch('ep-1', '第一集新稿'),
          applied: false,
        },
        {
          id: 'm2',
          role: 'assistant',
          content: '第二集新稿',
          createdAt: '2026-08-12T00:01:00.000Z',
          pendingPatch: epPatch('ep-2', '第二集新稿'),
          applied: false,
        },
      ],
      updatedAt: '2026-08-12T00:01:00.000Z',
    };
    const first = applyPendingMessagePatch(basePkg(), session, 'm1');
    const second = applyPendingMessagePatch(first.package, first.session, 'm2');
    expect(second.package.screenplay.episodes.find((ep) => ep.id === 'ep-1')?.bodyMd).toBe('第一集新稿');
    expect(second.package.screenplay.episodes.find((ep) => ep.id === 'ep-2')?.bodyMd).toBe('第二集新稿');
    expect(second.package.screenplay.episodes.find((ep) => ep.id === 'ep-3')?.bodyMd).toBe('第三集旧文');
  });
});

describe('编剧台 R3 runner 增量 patch 构造', () => {
  it('重写只产出目标集增量且保留 id', async () => {
    vi.mocked(api.scriptScreenplay).mockResolvedValueOnce({
      screenplay: '第1集 新稿\n\n## S01 | 内景 · 咖啡厅 | 白天\n\n林小满：你好',
    } as never);
    const result = await runRewriteEpisodeSkill(basePkg(), { episodeIndex: 1 });
    const patch = result.patch as Record<string, unknown>;
    expect(patch.episodesMergeMode).toBe('upsert');
    const episodes = (patch.screenplay as { episodes: Array<{ id: string; title: string; bodyMd: string }> }).episodes;
    expect(episodes).toHaveLength(1);
    expect(episodes[0].id).toBe('ep-1');
    expect(episodes[0].title).toContain('新稿');
    expect(episodes[0].bodyMd).toContain('林小满：你好');
  });

  it('续写只产出目标集增量', async () => {
    vi.mocked(api.scriptScreenplay).mockResolvedValueOnce({
      screenplay: '第4集 新集\n\n## S01 | 外景 · 街角 | 夜晚\n\n林小满：再见',
    } as never);
    const result = await runAppendEpisodeSkill(basePkg(), { nextEpisodeIndex: 4 });
    const patch = result.patch as Record<string, unknown>;
    expect(patch.episodesMergeMode).toBe('upsert');
    const episodes = (patch.screenplay as { episodes: Array<{ id: string }> }).episodes;
    expect(episodes).toHaveLength(1);
    expect(episodes[0].id).toMatch(/^ep-/);
  });

  it('Agent 续写单集只产出目标集增量；整包生成保持整表替换语义', async () => {
    vi.mocked(api.scriptScreenplay).mockResolvedValueOnce({
      screenplay: '第2集 重写\n\n## S01 | 内景 · 会议室 | 白天\n\n苏晚：开会',
    } as never);
    const single = await runGenerateScreenplaySkill(basePkg(), '续写第2集', 2);
    const singlePatch = single.patch as Record<string, unknown>;
    expect(singlePatch.episodesMergeMode).toBe('upsert');
    expect((singlePatch.screenplay as { episodes: Array<{ id: string }> }).episodes).toHaveLength(1);

    vi.mocked(api.scriptScreenplay).mockResolvedValueOnce({
      screenplay: '第1集 甲\n\n正文甲\n\n第2集 乙\n\n正文乙',
    } as never);
    const whole = await runGenerateScreenplaySkill(emptyScreenplayPackage(), '重新生成', undefined);
    const wholePatch = whole.patch as Record<string, unknown>;
    expect(wholePatch.episodesMergeMode).toBeUndefined();
    expect((wholePatch.screenplay as { episodes: unknown[] }).episodes).toHaveLength(2);
  });
});
