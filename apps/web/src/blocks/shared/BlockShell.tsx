import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { lookupBlock, resolveAccepts, resolveEmits, SOCKET_COLORS, type SocketKind } from '@nx9/shared';
import { Loader2 } from 'lucide-react';
import { useStageDeckFlag } from '../../stores/stage-deck-flag';

interface BlockShellProps extends NodeProps {
  children: React.ReactNode;
  hideSockets?: boolean;
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

export const BlockShell = memo(function BlockShell({
  type,
  data,
  selected,
  children,
  hideSockets,
}: BlockShellProps) {
  const meta = lookupBlock(type ?? '');
  const emits = resolveEmits(type ?? '', data as Record<string, unknown>);
  const accepts = resolveAccepts(type ?? '');
  const status = (data as { status?: string }).status;
  const blockIndex = (data as { blockIndex?: number }).blockIndex;
  const hideBlockIndex = useStageDeckFlag((s) => s.isEnabled());
  const studioEmbed = Boolean((data as { studioEmbed?: boolean }).studioEmbed);

  if (studioEmbed) {
    return <div className="nodrag nopan">{children}</div>;
  }

  return (
    <div
      className={`min-w-[220px] max-w-[360px] rounded-2xl border bg-white dark:bg-[#222222] shadow-panel transition-shadow nowheel ${
        selected ? 'border-brand ring-2 ring-brand/20' : 'border-line dark:border-[#333]'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line dark:border-[#333] bg-surface/80 dark:bg-[#2a2a2a] rounded-t-2xl cursor-grab active:cursor-grabbing">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: meta?.accent ?? '#5E4D8A' }}
        />
        <span className="text-sm font-semibold text-ink truncate flex-1">
          {meta?.label ?? type}
        </span>
        {blockIndex != null && !hideBlockIndex && (
          <span className="text-[10px] font-mono text-accent/70 bg-accent/5 px-1.5 py-0.5 rounded">
            #{blockIndex}
          </span>
        )}
        {status === 'running' && <Loader2 size={14} className="animate-spin text-brand" />}
        {status === 'done' && <span className="w-2 h-2 rounded-full bg-ok" />}
        {status === 'error' && <span className="w-2 h-2 rounded-full bg-warn" />}
      </div>

      <div className="relative px-3 py-3 nodrag nopan nowheel">
        {accepts.map((kind) => (
          <SocketHandle key={`in-${kind}`} kind={kind} type="target" hidden={hideSockets} />
        ))}
        {children}
        {emits.map((kind) => (
          <SocketHandle key={`out-${kind}`} kind={kind} type="source" hidden={hideSockets} />
        ))}
      </div>
    </div>
  );
});
