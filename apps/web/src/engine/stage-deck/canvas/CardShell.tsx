import { memo, useEffect, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { lookupBlock, resolveAccepts, resolveEmits, SOCKET_COLORS, type SocketKind } from '@nx9/shared';
import { Loader2 } from 'lucide-react';
import { useViewMode } from '../stores/view-mode';
import { shouldCollapseCards } from '../modes/produce-mode';
import { formatPendingElapsed } from '../execution/pending-take';
import '../../../styles/node-stage-card.css';

interface CardShellProps extends NodeProps {
  children: React.ReactNode;
  hideSockets?: boolean;
  alias?: string;
}

function SocketHandle({
  kind,
  type,
  id,
  hidden,
}: {
  kind: SocketKind;
  type: 'source' | 'target';
  id?: string;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <Handle
      type={type}
      position={type === 'target' ? Position.Left : Position.Right}
      id={id ?? kind}
      className="nx9-socket !w-2.5 !h-2.5 !border-2 !border-[#1a1d24]"
      style={{ background: SOCKET_COLORS[kind] }}
    />
  );
}

function thumbFromData(data: Record<string, unknown>): string | undefined {
  const previewUrl = data.previewUrl as string | undefined;
  const previewUrls = data.previewUrls as string[] | undefined;
  const assetUrl = data.assetUrl as string | undefined;
  return previewUrls?.[0] ?? previewUrl ?? assetUrl;
}

export const CardShell = memo(function CardShell({
  type,
  data,
  selected,
  children,
  hideSockets,
  alias,
}: CardShellProps) {
  const mode = useViewMode((s) => s.mode);
  const meta = lookupBlock(type ?? '');
  const emits = resolveEmits(type ?? '', data as Record<string, unknown>);
  const accepts = resolveAccepts(type ?? '');
  const status = (data as { status?: string }).status;
  const expanded = (data as { expanded?: boolean }).expanded;
  const dimmed = Boolean((data as { dimmed?: boolean }).dimmed);
  const pendingSince = (data as { pendingSince?: number }).pendingSince;
  const highlightUntil = (data as { highlightUntil?: number }).highlightUntil;
  const highlighted = Boolean(highlightUntil && Date.now() < highlightUntil);
  const collapsed = shouldCollapseCards(mode, expanded);
  const displayName = alias || meta?.label || type;
  const thumb = thumbFromData(data as Record<string, unknown>);
  const hideSocketInProduce = mode === 'produce';
  const accent = meta?.accent ?? 'var(--nx9-accent, #2dd4bf)';

  const [, setTick] = useState(0);
  useEffect(() => {
    if (status !== 'running' || !pendingSince) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [status, pendingSince]);

  useEffect(() => {
    if (!highlightUntil || Date.now() >= highlightUntil) return;
    const t = setTimeout(() => setTick((n) => n + 1), highlightUntil - Date.now() + 50);
    return () => clearTimeout(t);
  }, [highlightUntil]);

  const shellOpacity = dimmed ? 0.35 : 1;
  const statusClass =
    status === 'running'
      ? 'is-running'
      : status === 'done' || status === 'success'
        ? 'is-done'
        : status === 'error' || status === 'blocked' || status === 'stale'
          ? 'is-error'
          : '';

  if (collapsed) {
    return (
      <div
        className={`nx9-stage-card nowheel ${selected ? 'is-selected' : ''} ${
          status === 'running' ? 'is-running' : ''
        } ${highlighted ? 'nx9-card-highlight' : ''}`}
        style={{ opacity: shellOpacity, width: 200, minWidth: 200 }}
        title="双击展开"
      >
        <div className="nx9-stage-card__accent" style={{ background: accent }} aria-hidden />
        <div className="nx9-stage-card__head">
          <span className="nx9-stage-card__title">{displayName}</span>
          {status === 'running' && pendingSince ? (
            <span className="nx9-stage-card__badge">{formatPendingElapsed(pendingSince)}</span>
          ) : status === 'running' ? (
            <Loader2 size={12} className="animate-spin text-teal-300" />
          ) : (
            <span className={`nx9-stage-card__status ${statusClass}`} />
          )}
        </div>
        <div className="nx9-stage-card__body">
          <div className="nx9-stage-card__media" style={{ marginBottom: 0 }}>
            {thumb ? (
              <img src={thumb} alt="" draggable={false} />
            ) : (
              <div className="nx9-stage-card__media-empty">{meta?.label ?? '模块'}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`nx9-stage-card nowheel ${selected ? 'is-selected' : ''} ${
        highlighted ? 'nx9-card-highlight' : ''
      }`}
      style={{ opacity: shellOpacity, maxWidth: 320, width: 'auto', minWidth: 220 }}
    >
      <div className="nx9-stage-card__accent" style={{ background: accent }} aria-hidden />
      <div className="nx9-stage-card__head">
        <span className="nx9-stage-card__title">{displayName}</span>
        {status === 'running' ? (
          <Loader2 size={13} className="animate-spin text-teal-300" />
        ) : (
          <span className={`nx9-stage-card__status ${statusClass}`} />
        )}
      </div>
      <div className="nx9-stage-card__body nodrag nopan nowheel nx9-stage-card-fallback">
        {accepts.map((kind) => (
          <SocketHandle
            key={`in-${kind}`}
            kind={kind}
            type="target"
            hidden={hideSockets || hideSocketInProduce}
          />
        ))}
        {children}
        {emits.map((kind) => (
          <SocketHandle
            key={`out-${kind}`}
            kind={kind}
            type="source"
            hidden={hideSockets || hideSocketInProduce}
          />
        ))}
      </div>
    </div>
  );
});
