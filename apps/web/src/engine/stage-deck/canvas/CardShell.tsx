import { memo, useEffect, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { lookupBlock, resolveAccepts, resolveEmits, SOCKET_COLORS, type SocketKind } from '@nx9/shared';
import { Loader2 } from 'lucide-react';
import { useViewMode } from '../stores/view-mode';
import { shouldCollapseCards } from '../modes/produce-mode';
import { formatPendingElapsed } from '../execution/pending-take';

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
      className="nx9-socket !w-2.5 !h-2.5 !border-2 !border-white"
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

  if (collapsed) {
    return (
      <div
        className={`w-[180px] rounded-2xl border bg-white shadow-panel transition-all nowheel ${
          selected ? 'border-brand ring-2 ring-brand/20' : 'border-line'
        } ${status === 'running' ? 'nx9-card-pending' : ''} ${status === 'stale' ? 'nx9-card-stale' : ''} ${highlighted ? 'nx9-card-highlight' : ''}`}
        style={{ opacity: shellOpacity }}
        title="双击展开完整表单"
      >
        <div className="p-2 space-y-2">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: meta?.accent ?? '#5E4D8A' }}
            />
            <span className="text-xs font-semibold text-ink truncate flex-1">{displayName}</span>
            {status === 'running' && pendingSince && (
              <span className="text-[9px] font-mono text-brand bg-brand/10 px-1 rounded">
                {formatPendingElapsed(pendingSince)}
              </span>
            )}
            {status === 'running' && !pendingSince && (
              <Loader2 size={12} className="animate-spin text-brand" />
            )}
            {status === 'done' && <span className="w-2 h-2 rounded-full bg-ok" />}
            {status === 'blocked' && <span className="w-2 h-2 rounded-full bg-warn" title="审阅关卡阻塞" />}
            {status === 'stale' && <span className="w-2 h-2 rounded-full bg-warn" title="上游已变更" />}
            {status === 'error' && <span className="w-2 h-2 rounded-full bg-warn" />}
          </div>
          <div className="aspect-video rounded-xl bg-surface overflow-hidden border border-line/60">
            {thumb ? (
              <img src={thumb} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-ink/30">
                {meta?.label ?? '模块'}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-w-[220px] max-w-[360px] rounded-2xl border bg-white shadow-panel transition-shadow nowheel ${
        selected ? 'border-brand ring-2 ring-brand/20' : 'border-line'
      } ${status === 'stale' ? 'nx9-card-stale' : ''} ${highlighted ? 'nx9-card-highlight' : ''}`}
      style={{ opacity: shellOpacity }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line bg-surface/80 rounded-t-2xl cursor-grab active:cursor-grabbing">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: meta?.accent ?? '#5E4D8A' }}
        />
        <span className="text-sm font-semibold text-ink truncate flex-1">{displayName}</span>
        {status === 'running' && <Loader2 size={14} className="animate-spin text-brand" />}
        {status === 'done' && <span className="w-2 h-2 rounded-full bg-ok" />}
        {status === 'blocked' && <span className="w-2 h-2 rounded-full bg-warn" title="审阅关卡阻塞" />}
        {status === 'stale' && <span className="w-2 h-2 rounded-full bg-warn" title="上游已变更" />}
        {status === 'error' && <span className="w-2 h-2 rounded-full bg-warn" />}
      </div>

      <div className="relative px-3 py-3 nodrag nopan nowheel">
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
