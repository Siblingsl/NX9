import type { Dispatch, SetStateAction } from 'react';
import type { ScriptBreakdownPayload } from '@nx9/shared';
import type { StudioTab } from './helpers';

interface PipelineBarProps {
  studioTab: StudioTab;
  setStudioTab: Dispatch<SetStateAction<StudioTab>>;
  payload: ScriptBreakdownPayload | undefined;
  hasLineArt: boolean;
  coveragePct: number;
  currentEpisodeConfirmed: boolean;
  confirmedEpisodeIds: string[];
  activeEpisodeId: string | null;
  blockId: string;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  breakdownBusy: boolean;
  queueProgress: { total: number; current: number };
}

const STEPS = [
  ['breakdown', '1', '拆镜'],
  ['grid', '2', '镜表'],
  ['compose', '3', '构图'],
  ['handoff', '4', '交接'],
] as const;

export function PipelineBar({
  studioTab,
  setStudioTab,
  payload,
  hasLineArt,
  coveragePct,
  currentEpisodeConfirmed,
  confirmedEpisodeIds,
  activeEpisodeId,
  blockId,
  updateNodeData,
  setSelectedId,
  breakdownBusy,
  queueProgress,
}: PipelineBarProps) {
  const hasBreakdown = Boolean(payload?.episodes?.length);
  const episodeCount = payload?.episodes?.length ?? 0;
  const confirmedCount = (payload?.episodes ?? []).filter((ep) => confirmedEpisodeIds.includes(ep.id)).length;
  const stepDone: Record<string, boolean> = {
    breakdown: hasBreakdown,
    grid: hasBreakdown,
    compose: hasLineArt,
    handoff: currentEpisodeConfirmed,
  };

  return (
    <div className="sg3-pipeline" aria-label="分镜流程">
      <div className="sg3-pipeline__steps">
        {STEPS.map(([id, num, label], i) => (
          <span key={id} className="sg3-pipeline__item">
            {i > 0 ? <span className="sg3-pipeline__sep" aria-hidden /> : null}
            <button
              type="button"
              className={`sg3-pipeline__step ${studioTab === id ? 'is-on' : ''} ${stepDone[id] ? 'is-done' : ''}`}
              onClick={() => setStudioTab(id)}
            >
              <b>{num}</b> {label}
            </button>
          </span>
        ))}
      </div>
      <div className="sg3-pipeline__episode">
        {episodeCount > 0 ? (
          <select
            className="sg3-episode-select sg3-episode-select--pipeline"
            value={activeEpisodeId ?? payload!.episodes[0]?.id ?? ''}
            onChange={(event) => {
              updateNodeData(blockId, { activeEpisodeId: event.target.value || null });
              setSelectedId(null);
            }}
            aria-labelledby="sg3-episode-label"
            title="选择要编辑的剧集；左侧镜表与中间构图会跟随切换"
          >
            {payload!.episodes.map((episode) => {
              const done = confirmedEpisodeIds.includes(episode.id);
              return (
                <option key={episode.id} value={episode.id}>
                  {episode.title}
                  {done ? ' · 已确认' : ''}
                  {` · ${episode.shots.length} 镜`}
                </option>
              );
            })}
          </select>
        ) : breakdownBusy ? (
          <span className="sg3-episode-select sg3-episode-select--pipeline sg3-episode-select--busy" aria-live="polite">
            {queueProgress.total > 0
              ? `拆镜中 ${Math.min(queueProgress.current + 1, queueProgress.total)}/${queueProgress.total} 集`
              : '拆镜中…'}
          </span>
        ) : (
          <span className="sg3-episode-select sg3-episode-select--pipeline sg3-episode-select--empty">暂无剧集</span>
        )}
        <span
          className={`sg3-pipeline__episode-meta ${currentEpisodeConfirmed ? 'is-ok' : ''}`}
          title={
            breakdownBusy
              ? '拆镜进行中'
              : episodeCount > 1
                ? `全片已确认 ${confirmedCount}/${episodeCount} 集 · 本集构图 ${coveragePct}%`
                : currentEpisodeConfirmed
                  ? '本集已确认，可交导演台'
                  : '本集尚未确认交接'
          }
        >
          {breakdownBusy
            ? (queueProgress.total > 0
              ? `拆镜 ${Math.min(queueProgress.current + 1, queueProgress.total)}/${queueProgress.total}`
              : '拆镜中')
            : episodeCount > 1
              ? `已确认 ${confirmedCount}/${episodeCount} 集`
              : currentEpisodeConfirmed ? '本集已确认' : '本集未确认'}
        </span>
      </div>
    </div>
  );
}
