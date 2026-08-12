/**
 * stale-banner.tsx — 成稿不同步 Banner（X-01，SB-OL-11 自主文件拆出）。
 *
 * 展示上游成稿与本地镜表不同步的差异摘要与处理动作；
 * 是否显示由父级（packageStale && upstreamPackage && !dismissed）决定。
 */
import type { ScreenplayPackage } from '@nx9/shared';
import { packageSourceHash } from '../../../engine/storyboard-desk-runner';

export interface StoryboardStaleBannerProps {
  upstreamPackage: ScreenplayPackage;
  upstreamNeedsConfirm: boolean;
  upstreamTitleShort: string;
  incrementalNewEpisodeCount: number;
  deskBusy: boolean;
  breakingDown: boolean;
  breakdownBlocked: boolean;
  confirmedEpisodeIds: string[];
  localPackageHash: string;
  showDiff: boolean;
  onToggleDiff: () => void;
  onDismiss: () => void;
  onOpenUpstreamConfirm: () => void;
  onBreakdownNewOnly: () => void;
  onSyncLatest: () => void;
  onRebreakAll: () => void;
  onRebreakUnconfirmed: () => void;
}

export default function StoryboardStaleBanner({
  upstreamPackage,
  upstreamNeedsConfirm,
  upstreamTitleShort,
  incrementalNewEpisodeCount,
  deskBusy,
  breakingDown,
  breakdownBlocked,
  confirmedEpisodeIds,
  localPackageHash,
  showDiff,
  onToggleDiff,
  onDismiss,
  onOpenUpstreamConfirm,
  onBreakdownNewOnly,
  onSyncLatest,
  onRebreakAll,
  onRebreakUnconfirmed,
}: StoryboardStaleBannerProps) {
  return (
    <div className="sg3-stale-banner">
      <span className="sg3-stale-banner__icon">&#x26A0;&#xFE0F;</span>
      <span className="sg3-stale-banner__msg">
        {upstreamNeedsConfirm
          ? `上游「${upstreamTitleShort}」已更新，但尚未确认成稿 · 先确认再同步`
          : incrementalNewEpisodeCount > 0
            ? `上游新增 ${incrementalNewEpisodeCount} 集（可只拆新增，保留现有 1…集镜表）`
            : '上游成稿已更新（与当前镜表不同步）'}
      </span>
      <div className="sg3-stale-banner__acts">
        <button type="button" className="sg3-btn sg3-btn--ghost" onClick={onToggleDiff}>
          {showDiff ? '收起差异' : '查看差异摘要'}
        </button>
        {upstreamNeedsConfirm ? (
          <button
            type="button"
            className="sg3-btn sg3-btn--primary"
            disabled={deskBusy}
            onClick={onOpenUpstreamConfirm}
          >
            打开上游编剧台 · 确认成稿
          </button>
        ) : (
          <>
            {incrementalNewEpisodeCount > 0 ? (
              <button
                type="button"
                className="sg3-btn sg3-btn--primary"
                disabled={breakingDown || breakdownBlocked || deskBusy}
                onClick={onBreakdownNewOnly}
              >
                只拆新增 {incrementalNewEpisodeCount} 集
              </button>
            ) : (
              <button
                type="button"
                className="sg3-btn sg3-btn--ghost"
                disabled={breakingDown || breakdownBlocked || deskBusy}
                onClick={onSyncLatest}
              >
                同步最新成稿
              </button>
            )}
            {upstreamPackage.screenplay.episodes.length > 1 ? (
              <>
                <button
                  type="button"
                  className="sg3-btn sg3-btn--ghost"
                  disabled={breakingDown || breakdownBlocked || deskBusy}
                  onClick={onRebreakAll}
                >
                  重拆全部
                </button>
                {upstreamPackage.screenplay.episodes.some((ep) => !confirmedEpisodeIds.includes(ep.id)) ? (
                  <button
                    type="button"
                    className="sg3-btn sg3-btn--ghost"
                    disabled={breakingDown || breakdownBlocked || deskBusy}
                    onClick={onRebreakUnconfirmed}
                  >
                    重拆仅未确认
                  </button>
                ) : null}
              </>
            ) : null}
          </>
        )}
        <button type="button" className="sg3-btn sg3-btn--ghost" onClick={onDismiss}>
          稍后
        </button>
      </div>
      {showDiff ? (
        <div className="sg3-stale-banner__diff" style={{ width: '100%', marginTop: 6, padding: 8, background: 'rgba(0,0,0,0.25)', borderRadius: 8, fontSize: 11, lineHeight: 1.6 }}>
          <div>上游集数: {upstreamPackage.screenplay.episodes.length}</div>
          <div>上游标题: {upstreamPackage.brief.title || '-'}</div>
          <div>上游状态: {upstreamPackage.status}</div>
          <div>上游 hash: {packageSourceHash(upstreamPackage).slice(0, 16)}...</div>
          <div>本地 hash: {localPackageHash.slice(0, 16)}...</div>
        </div>
      ) : null}
    </div>
  );
}
