/**
 * F-016 分镜多集批量拆镜队列验收
 * - createEpisodeQueue 初始化（含 skipped 数组）
 * - 状态机：idle→running→paused→resumed→done
 * - queueNextEpisode / queueMarkSuccess / queueMarkError
 * - queueSkipEpisode 记录 skipped
 * - queuePause / queueResume / queueCancel
 * - queueAdvance / queueSummary
 * - 错误不中断队列（单集失败后继续）
 * - EpisodeQueueBar 组件存在且含控件按钮
 * - StoryboardDeskBlock 接入 runQueueForEpisodes + EpisodeQueueBar
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createEpisodeQueue,
  queueNextEpisode,
  queueMarkSuccess,
  queueMarkError,
  queueSkipEpisode,
  queueAdvance,
  queuePause,
  queueResume,
  queueCancel,
  queueSummary,
} from '@nx9/shared';

const root = resolve(__dirname, '../../..');
const webSrc = resolve(root, 'apps/web/src');

function readWeb(rel: string): string {
  return readFileSync(resolve(webSrc, rel), 'utf8');
}

describe('F-016 分镜多集批量拆镜队列', () => {

  // ─── createEpisodeQueue ───
  it('createEpisodeQueue 创建初始 idle 状态', () => {
    const q = createEpisodeQueue(['ep1', 'ep2', 'ep3']);
    expect(q.status).toBe('idle');
    expect(q.index).toBe(0);
    expect(q.episodeIds).toEqual(['ep1', 'ep2', 'ep3']);
    expect(q.skipped).toEqual([]);
    expect(q.errors).toEqual({});
    expect(q.results).toEqual({});
  });

  // ─── queueNextEpisode ───
  it('queueNextEpisode idle 时返回第一个 episode', () => {
    const q = createEpisodeQueue(['ep1', 'ep2']);
    const next = queueNextEpisode(q);
    expect(next.episodeId).toBe('ep1');
    expect(next.done).toBe(false);
  });

  it('queueNextEpisode done 时返回 done=true', () => {
    const q = createEpisodeQueue(['ep1']);
    const advanced = queueMarkSuccess(q);
    const next = queueNextEpisode(advanced);
    expect(next.done).toBe(true);
    expect(next.episodeId).toBeNull();
  });

  it('queueNextEpisode paused 时返回 null', () => {
    const q = queuePause({ ...createEpisodeQueue(['ep1', 'ep2']), status: 'running' });
    const next = queueNextEpisode(q);
    expect(next.episodeId).toBeNull();
  });

  it('queueNextEpisode cancelled 时返回 done=true', () => {
    const q = queueCancel({ ...createEpisodeQueue(['ep1']), status: 'running' });
    const next = queueNextEpisode(q);
    expect(next.done).toBe(true);
  });

  // ─── queueMarkSuccess ───
  it('queueMarkSuccess 标记成功并前进 index', () => {
    const q = { ...createEpisodeQueue(['ep1', 'ep2']), status: 'running' as const };
    const next = queueMarkSuccess(q);
    expect(next.index).toBe(1);
    expect(next.results['ep1']).toBe(true);
    expect(next.status).toBe('running');
  });

  it('queueMarkSuccess 最后一集时将 status 置为 done', () => {
    const q = { ...createEpisodeQueue(['ep1']), status: 'running' as const };
    const next = queueMarkSuccess(q);
    expect(next.status).toBe('done');
    expect(next.results['ep1']).toBe(true);
  });

  // ─── queueMarkError ───
  it('queueMarkError 记录错误且不前进 index', () => {
    const q = { ...createEpisodeQueue(['ep1', 'ep2']), status: 'running' as const };
    const next = queueMarkError(q, '拆镜超时');
    expect(next.index).toBe(0); // 不前进
    expect(next.errors['ep1']).toBe('拆镜超时');
    expect(next.results['ep1']).toBe(false);
  });

  it('错误不中断队列 — 失败后可 advance 继续', () => {
    const q = { ...createEpisodeQueue(['ep1', 'ep2']), status: 'running' as const };
    const withError = queueMarkError(q, '失败');
    // advance 前进到下一集
    const advanced = queueAdvance({ ...withError, status: 'running' });
    expect(advanced.index).toBe(1);
    expect(advanced.errors['ep1']).toBe('失败');
    // 下一集仍可处理
    const next = queueNextEpisode(advanced);
    expect(next.episodeId).toBe('ep2');
  });

  // ─── queueSkipEpisode ───
  it('queueSkipEpisode 跳过当前集并记录到 skipped', () => {
    const q = { ...createEpisodeQueue(['ep1', 'ep2', 'ep3']), status: 'running' as const };
    const next = queueSkipEpisode(q);
    expect(next.index).toBe(1);
    expect(next.skipped).toContain('ep1');
    expect(next.status).toBe('running');
  });

  it('queueSkipEpisode 最后一集后状态为 done', () => {
    const q = { ...createEpisodeQueue(['ep1']), status: 'running' as const };
    const next = queueSkipEpisode(q);
    expect(next.status).toBe('done');
    expect(next.skipped).toContain('ep1');
  });

  // ─── queuePause / queueResume ───
  it('queuePause 将 running 改为 paused', () => {
    const q = { ...createEpisodeQueue(['ep1', 'ep2']), status: 'running' as const };
    const paused = queuePause(q);
    expect(paused.status).toBe('paused');
  });

  it('queueResume 将 paused 改为 running', () => {
    const q = { ...createEpisodeQueue(['ep1']), status: 'paused' as const };
    const resumed = queueResume(q);
    expect(resumed.status).toBe('running');
  });

  it('queuePause 对非 running 无变化', () => {
    const q = { ...createEpisodeQueue(['ep1']), status: 'done' as const };
    expect(queuePause(q).status).toBe('done');
  });

  // ─── queueCancel ───
  it('queueCancel 将状态设为 cancelled', () => {
    const q = { ...createEpisodeQueue(['ep1', 'ep2']), status: 'running' as const };
    const cancelled = queueCancel(q);
    expect(cancelled.status).toBe('cancelled');
  });

  // ─── queueAdvance ───
  it('queueAdvance 只前进 index 不改 results', () => {
    const q = { ...createEpisodeQueue(['ep1', 'ep2', 'ep3']), status: 'running' as const };
    const next = queueAdvance(q);
    expect(next.index).toBe(1);
    expect(Object.keys(next.results).length).toBe(0); // 不标记成功
  });

  it('queueAdvance 到末尾时 status 为 done', () => {
    const q = { ...createEpisodeQueue(['ep1']), status: 'running' as const };
    const next = queueAdvance(q);
    expect(next.status).toBe('done');
    expect(next.index).toBe(1);
  });

  // ─── queueSummary ───
  it('queueSummary 摘要包含成功/失败/跳过计数', () => {
    const q = createEpisodeQueue(['ep1', 'ep2', 'ep3', 'ep4']);
    q.status = 'done';
    q.results = { ep1: true, ep2: false, ep3: true };
    q.errors = { ep2: 'timeout' };
    q.skipped = ['ep4'];

    const summary = queueSummary(q);
    expect(summary).toContain('共 4 集');
    expect(summary).toContain('成功 2');
    expect(summary).toContain('失败 1');
    expect(summary).toContain('跳过 1');
  });

  // ─── 完整生命周期 ───
  it('完整队列生命周期：idle→running→pause→resume→done', () => {
    const q = createEpisodeQueue(['ep1', 'ep2']);
    expect(q.status).toBe('idle');

    // start
    const running = { ...q, status: 'running' as const };
    expect(queueNextEpisode(running).episodeId).toBe('ep1');

    // ep1 success
    const afterEp1 = queueMarkSuccess(running);
    expect(afterEp1.index).toBe(1);
    expect(afterEp1.results['ep1']).toBe(true);

    // pause
    const paused = queuePause(afterEp1);
    expect(paused.status).toBe('paused');
    expect(queueNextEpisode(paused).episodeId).toBeNull();

    // resume
    const resumed = queueResume(paused);
    expect(resumed.status).toBe('running');

    // ep2 success
    const done = queueMarkSuccess({ ...resumed, index: 1 });
    expect(done.status).toBe('done');
    expect(done.results['ep2']).toBe(true);
  });

  // ─── EpisodeQueueBar 组件源码守卫 ───
  it('EpisodeQueueBar 组件存在且含暂停/继续/跳过/取消控件', () => {
    const src = readWeb('components/EpisodeQueueBar.tsx');

    expect(src).toContain('export function EpisodeQueueBar');
    expect(src).toContain('onPause');
    expect(src).toContain('onResume');
    expect(src).toContain('onSkip');
    expect(src).toContain('onCancel');
    expect(src).toContain('暂停');
    expect(src).toContain('继续');
    expect(src).toContain('跳过本集');
    expect(src).toContain('取消');
    expect(src).toContain('分集拆镜队列');
  });

  // ─── StoryboardDeskBlock 集成源码守卫 ───
  it('StoryboardDeskBlock 接入 runQueueForEpisodes', () => {
    const hook = readWeb('blocks/craft/storyboard-desk/use-storyboard-desk.tsx');
    const ops = readWeb('blocks/craft/storyboard-desk/breakdown-queue-ops.ts');

    expect(ops).toContain('runQueueForEpisodes');
    expect(hook).toContain('createEpisodeQueue');
    expect(hook).toContain('EpisodeQueueBar');
    expect(ops).toContain('handleQueuePause');
    expect(ops).toContain('handleQueueResume');
    expect(ops).toContain('handleQueueSkip');
    expect(ops).toContain('handleQueueCancel');
  });

  it('StoryboardDeskBlock 多处拆镜按钮全量拆镜走队列', () => {
    const hook = readWeb('blocks/craft/storyboard-desk/use-storyboard-desk.tsx');
    const panel = readWeb('blocks/craft/storyboard-desk/breakdown-panel.tsx');
    expect(panel).toContain('全 ${upstreamPackage.screenplay.episodes.length} 集重拆');
    expect(hook).toContain('queueState.status');
    expect(panel).toContain('breakdownFromPackage(undefined, true)');
  });
});
