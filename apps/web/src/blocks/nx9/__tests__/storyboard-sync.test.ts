/**
 * H-02: 编剧台交接回程状态派生（纯函数）。
 */
import { describe, expect, it } from 'vitest';
import { deriveStoryboardSyncStatus, storyboardSyncLabel } from '../script-desk/storyboard-sync';

describe('deriveStoryboardSyncStatus', () => {
  it('未连分镜台 → none（画布卡不显示）', () => {
    expect(deriveStoryboardSyncStatus(undefined, 'hash-a')).toBe('none');
    expect(storyboardSyncLabel('none')).toBeNull();
  });

  it('已连分镜台但未拆镜 → unbroken', () => {
    expect(deriveStoryboardSyncStatus({}, 'hash-a')).toBe('unbroken');
    expect(storyboardSyncLabel('unbroken')).toBe('分镜未拆');
  });

  it('拆镜 hash 与当前成稿一致 → synced', () => {
    const data = { scriptBreakdown: { episodes: [] }, breakdownJob: { sourcePackageHash: 'hash-a' } };
    expect(deriveStoryboardSyncStatus(data, 'hash-a')).toBe('synced');
    expect(storyboardSyncLabel('synced')).toBe('分镜已同步');
  });

  it('成稿改过（hash 不一致）→ stale', () => {
    const data = { scriptBreakdown: { episodes: [] }, breakdownJob: { sourcePackageHash: 'hash-old' } };
    expect(deriveStoryboardSyncStatus(data, 'hash-new')).toBe('stale');
    expect(storyboardSyncLabel('stale')).toBe('分镜落后于成稿');
  });

  it('拆过但旧数据无 hash（无法核对）→ stale（提示同步而非假绿）', () => {
    const data = { scriptBreakdown: { episodes: [] } };
    expect(deriveStoryboardSyncStatus(data, 'hash-a')).toBe('stale');
  });

  it('取消的拆镜任务只留 phase/error（无 hash 无镜表）→ unbroken', () => {
    const data = { breakdownJob: { phase: 'cancelled', error: '用户取消' } };
    expect(deriveStoryboardSyncStatus(data, 'hash-a')).toBe('unbroken');
  });
});
