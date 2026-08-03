import React from 'react';
import { EpisodeQueueBar } from '../../../components/EpisodeQueueBar';

interface BreakdownPanelProps {
  upstreamPackage: any;
  packageStale: boolean;
  canBreakdownFromPackage: boolean;
  breakdownBlockedReason: string | undefined;
  breakingDown: boolean;
  breakdownBlocked: boolean;
  deskBusy: boolean;
  handoffHighlight: boolean;
  confirmedEpisodeIds: string[];
  queueState: any;
  queueCurrentTitle: string;
  queueProgress: any;
  payload: any;
  incrementalText: string;
  setIncrementalText: React.Dispatch<React.SetStateAction<string>>;
  incrementalBusy: boolean;
  upstream: any;
  diagnostics: Array<{ level: string; message: string; code: string; shotId?: string }>;
  setStudioTab: React.Dispatch<React.SetStateAction<any>>;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  breakdownFromPackage: (epIndex?: number, multiEpisode?: boolean) => Promise<void>;
  breakdownUnconfirmedOnly: () => Promise<void>;
  runIncrementalBreakdown: () => Promise<void>;
  importLegacyBreakdown: () => Promise<void>;
  handleRetryFailed: () => void;
  handleQueuePause: () => void;
  handleQueueResume: () => void;
  handleQueueSkip: () => void;
  handleQueueCancel: () => void;
}

const BreakdownPanel: React.FC<BreakdownPanelProps> = ({
  upstreamPackage,
  packageStale,
  canBreakdownFromPackage,
  breakdownBlockedReason,
  breakingDown,
  breakdownBlocked,
  deskBusy,
  handoffHighlight,
  confirmedEpisodeIds,
  queueState,
  queueCurrentTitle,
  queueProgress,
  payload,
  incrementalText,
  setIncrementalText,
  incrementalBusy,
  upstream,
  diagnostics,
  setStudioTab,
  setSelectedId,
  breakdownFromPackage,
  breakdownUnconfirmedOnly,
  runIncrementalBreakdown,
  importLegacyBreakdown,
  handleRetryFailed,
  handleQueuePause,
  handleQueueResume,
  handleQueueSkip,
  handleQueueCancel,
}) => {
  return (
    <div className="sg3-pane sg3-pane--center">
      <div className="sg3-hero">
        <p className="sg3-hero__eyebrow">步骤 1 · 拆镜</p>
        <h3 className="sg3-hero__title">从编剧台成稿生成镜表</h3>
        <p className="sg3-hero__desc">
          {upstreamPackage
            ? `上游成稿：${upstreamPackage.brief.title || '未命名'} · ${upstreamPackage.status}${packageStale ? ' · 成稿已更新' : ''}`
            : '未连接编剧台 confirmed package'}
        </p>
        {!canBreakdownFromPackage && breakdownBlockedReason ? (
          <p className="sg3-muted" style={{ color: 'var(--nx9-danger, #c45c5c)' }}>
            无法拆镜：{breakdownBlockedReason}
          </p>
        ) : null}
        <div className="sg3-hero__actions">
          <button
            type="button"
            className={`sg3-btn sg3-btn--primary${handoffHighlight ? ' sg3-btn--handoff' : ''}`}
            disabled={!canBreakdownFromPackage || breakingDown || breakdownBlocked || deskBusy}
            title={breakdownBlockedReason || (deskBusy ? '任务进行中' : undefined)}
            onClick={() => void breakdownFromPackage()}
          >
            {breakingDown ? '拆镜中…' : breakdownBlocked ? '设定未就绪（硬模式）' : '从成稿拆镜'}
          </button>
          {upstreamPackage && upstreamPackage.screenplay.episodes.length > 1 && (
            <>
              <button
                type="button"
                className="sg3-btn sg3-btn--ghost"
                disabled={!canBreakdownFromPackage || breakingDown || breakdownBlocked || deskBusy}
                title={breakdownBlockedReason || (deskBusy ? '任务进行中' : undefined)}
                onClick={() => void breakdownFromPackage(undefined, true)}
              >
                {breakingDown ? '拆镜中…' : `全 ${upstreamPackage.screenplay.episodes.length} 集拆镜`}
              </button>
              {upstreamPackage.screenplay.episodes.some((ep: any) => !confirmedEpisodeIds.includes(ep.id)) ? (
                <button
                  type="button"
                  className="sg3-btn sg3-btn--ghost"
                  disabled={!canBreakdownFromPackage || breakingDown || breakdownBlocked || deskBusy}
                  title={breakdownBlockedReason || (deskBusy ? '任务进行中' : undefined)}
                  onClick={() => void breakdownUnconfirmedOnly()}
                >
                  仅重拆未确认
                </button>
              ) : null}
            </>
          )}
          {queueState.status !== 'idle' && (
            <EpisodeQueueBar
              state={queueState}
              currentEpisodeTitle={queueCurrentTitle}
              progress={queueProgress}
              onPause={handleQueuePause}
              onResume={handleQueueResume}
              onSkip={handleQueueSkip}
              onCancel={handleQueueCancel}
              onRetryFailed={handleRetryFailed}
            />
          )}
          {upstream ? (
            <button
              type="button"
              className="sg3-btn sg3-btn--ghost"
              disabled={deskBusy}
              onClick={importLegacyBreakdown}
            >
              导入旧镜表…
            </button>
          ) : null}
        </div>
      </div>

      {payload && (
        <details className="sg3-details">
          <summary>增量补拆</summary>
          <p className="sg3-muted">粘贴部分剧本文本，只对这段补拆并合并进现有镜表（不覆盖）。</p>
          <textarea
            className="sg3-textarea"
            value={incrementalText}
            onChange={(e) => setIncrementalText(e.target.value)}
            placeholder="粘贴需要补拆的剧本文本…"
          />
          <button
            type="button"
            className="sg3-btn sg3-btn--ghost"
            disabled={!incrementalText.trim() || incrementalBusy || !upstreamPackage || breakdownBlocked || deskBusy}
            onClick={() => void runIncrementalBreakdown()}
          >
            {incrementalBusy ? '补拆中…' : '增量补拆'}
          </button>
        </details>
      )}

      {diagnostics.length > 0 ? (
        <div className="sg3-diag-block">
          <h4>诊断</h4>
          <ul>
            {diagnostics.slice(0, 12).map((d, i) => (
              <li
                key={`${d.code}-${i}`}
                style={d.shotId ? { cursor: 'pointer', textDecoration: 'underline' } : undefined}
                onClick={() => {
                  if (!d.shotId) return;
                  setStudioTab('grid');
                  setSelectedId(d.shotId);
                  setTimeout(() => {
                    const cell = document.querySelector(`[data-shot-id="${d.shotId}"]`);
                    cell?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }, 50);
                }}
              >
                [{d.level}] {d.message}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <p className="sg3-muted sg3-muted--center">拆镜成功后进入镜表；结果不写回编剧台。</p>
          {!payload ? (
            <div className="sg3-onboard" style={{ marginTop: 12, padding: 16, background: 'rgba(0,0,0,0.15)', borderRadius: 12, fontSize: 13, lineHeight: 1.8, textAlign: 'left', maxWidth: 400, margin: '12px auto 0' }}>
              <p className="sg3-onboard__hint">三步完成分镜准备：</p>
              <ol style={{ paddingLeft: 20, margin: '8px 0' }}>
                <li><b>拆镜</b>：从编剧台成稿自动生成镜表</li>
                <li><b>出线稿</b>：在构图 Tab 批量生成分镜线稿</li>
                <li><b>确认交接</b>：满足覆盖率后确认，并打开导演台</li>
              </ol>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

export default BreakdownPanel;
