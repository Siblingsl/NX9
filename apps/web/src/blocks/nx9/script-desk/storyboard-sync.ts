/**
 * H-02: 编剧台 → 分镜台 交接回程状态（只读派生，不回写）。
 *
 * 编剧台侧比对「相连分镜台已拆镜的成稿 hash」与「当前成稿 hash」，
 * 在画布卡与送分镜 checklist 上如实显示下游同步状态。
 */

export type StoryboardSyncStatus =
  /** 未连分镜台 */
  | 'none'
  /** 已连分镜台但尚未拆镜 */
  | 'unbroken'
  /** 分镜已按当前成稿拆镜 */
  | 'synced'
  /** 分镜拆过，但成稿之后又改过（或旧数据无 hash 无法核对） */
  | 'stale';

export function deriveStoryboardSyncStatus(
  storyboardData: Record<string, unknown> | undefined,
  scriptHash: string,
): StoryboardSyncStatus {
  if (!storyboardData) return 'none';
  const job = storyboardData.breakdownJob as { sourcePackageHash?: string } | undefined;
  const hasBreakdown = Boolean(storyboardData.scriptBreakdown) || Boolean(job?.sourcePackageHash);
  if (!hasBreakdown) return 'unbroken';
  if (job?.sourcePackageHash && scriptHash && job.sourcePackageHash === scriptHash) return 'synced';
  return 'stale';
}

export function storyboardSyncLabel(status: StoryboardSyncStatus): string | null {
  switch (status) {
    case 'synced':
      return '分镜已同步';
    case 'stale':
      return '分镜落后于成稿';
    case 'unbroken':
      return '分镜未拆';
    default:
      return null;
  }
}
