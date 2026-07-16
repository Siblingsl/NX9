import { memo } from 'react';
import { Loader2 } from 'lucide-react';
import '../../styles/node-stage-card.css';

export type SummaryStat = {
  value: string | number;
  label: string;
  tone?: 'default' | 'ok' | 'warn';
};

export type SummaryAction = {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  /** 仅图标时仍显示 title */
  iconOnly?: boolean;
};

export interface NodeSummaryBodyProps {
  media?: React.ReactNode;
  mediaUrl?: string;
  mediaVideoUrl?: string;
  emptyLabel?: string;
  onMediaDoubleClick?: (e: React.MouseEvent) => void;
  stats?: SummaryStat[];
  summary?: string;
  summaryClickable?: boolean;
  onSummaryClick?: (e: React.MouseEvent) => void;
  tags?: string[];
  statusLabel?: string;
  primary?: SummaryAction;
  secondary?: SummaryAction[];
}

/**
 * L1 摘要卡内容区 — 画布上所有节点的统一骨架。
 * 标题/状态点由 BlockShell 负责。
 */
export const NodeSummaryBody = memo(function NodeSummaryBody({
  media,
  mediaUrl,
  mediaVideoUrl,
  emptyLabel = '暂无预览',
  onMediaDoubleClick,
  stats,
  summary,
  summaryClickable,
  onSummaryClick,
  tags,
  statusLabel,
  primary,
  secondary = [],
}: NodeSummaryBodyProps) {
  const statCols = stats && stats.length === 2 ? 'is-2' : '';

  return (
    <div className="nodrag nopan">
      <div
        className="nx9-stage-card__media"
        onDoubleClick={onMediaDoubleClick}
        title={onMediaDoubleClick ? '双击打开' : undefined}
      >
        {media != null ? (
          media
        ) : mediaVideoUrl ? (
          <video src={mediaVideoUrl} muted playsInline preload="metadata" />
        ) : mediaUrl ? (
          <img src={mediaUrl} alt="" draggable={false} />
        ) : (
          <div className="nx9-stage-card__media-empty">{emptyLabel}</div>
        )}
      </div>

      {stats && stats.length > 0 && (
        <div className={`nx9-stage-card__stats ${statCols}`}>
          {stats.slice(0, 3).map((s) => (
            <div
              key={s.label}
              className={`nx9-stage-card__stat ${
                s.tone === 'ok' ? 'is-ok' : s.tone === 'warn' ? 'is-warn' : ''
              }`}
            >
              <b>{s.value}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {tags && tags.length > 0 && (
        <div className="nx9-stage-card__tags">
          {tags.slice(0, 3).map((t) => (
            <span key={t} className="nx9-stage-card__tag">
              {t}
            </span>
          ))}
        </div>
      )}

      {summary ? (
        summaryClickable && onSummaryClick ? (
          <button
            type="button"
            className="nx9-stage-card__prompt"
            onClick={onSummaryClick}
            title="打开编辑"
          >
            {summary}
          </button>
        ) : (
          <p className="nx9-stage-card__summary">{summary}</p>
        )
      ) : null}

      <div className="nx9-stage-card__foot">
        <span className="nx9-stage-card__foot-label">{statusLabel ?? ''}</span>
        {secondary.slice(0, 2).map((a) => (
          <button
            key={a.label}
            type="button"
            className="nx9-stage-card__btn is-ghost"
            disabled={a.disabled || a.loading}
            onClick={a.onClick}
            title={a.label}
          >
            {a.loading ? <Loader2 size={12} className="animate-spin" /> : a.icon}
            {!a.iconOnly && a.label}
          </button>
        ))}
        {primary && (
          <button
            type="button"
            className="nx9-stage-card__btn is-primary"
            disabled={primary.disabled || primary.loading}
            onClick={primary.onClick}
            title={primary.label}
          >
            {primary.loading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              primary.icon
            )}
            {primary.label}
          </button>
        )}
      </div>
    </div>
  );
});
