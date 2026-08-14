/**
 * DEEP-12：技能轨降级结果也要携带结构化错误码，消息 hint 才能渲染。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyScreenplayPackage } from '@nx9/shared';
import { api } from '../../api/client';
import { runScriptDeskSkill } from '../script-desk-runner';

vi.mock('../../api/client', () => ({
  api: { scriptDeskChatStream: vi.fn() },
}));

describe('DEEP-12 编剧台技能轨错误码', () => {
  beforeEach(() => {
    vi.mocked(api.scriptDeskChatStream).mockReset();
  });

  it('SSE error 降级为本地草稿时仍返回结构化 errorCode', async () => {
    vi.mocked(api.scriptDeskChatStream).mockRejectedValueOnce(new Error('429 rate limit'));
    const result = await runScriptDeskSkill('topic', emptyScreenplayPackage(), '都市成长', undefined, () => {});
    expect(result.errorCode).toBe('rate_limit');
    expect(result.assistantText).toContain('429 rate limit');
    expect(result.patch?.brief?.topic).toBe('都市成长');
  });
});
