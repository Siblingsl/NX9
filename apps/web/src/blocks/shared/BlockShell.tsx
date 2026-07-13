import { memo, useCallback } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import {
  lookupBlock,
  resolveAccepts,
  resolveEmits,
  resolveVerticalSockets,
  SOCKET_COLORS,
  type SocketKind,
  type VerticalSocketSpec,
} from '@nx9/shared';
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

function VerticalSocketHandle({
  spec,
  hidden,
}: {
  spec: VerticalSocketSpec;
  hidden?: boolean;
}) {
  if (hidden) return null;
  const position = spec.position === 'top' ? Position.Top : Position.Bottom;
  return (
    <Handle
      type={spec.type}
      position={position}
      id={spec.id}
      className="nx9-socket nx9-socket-exec !w-3 !h-3 !border-2 !border-white"
      style={{ background: SOCKET_COLORS[spec.kind], left: '50%' }}
    />
  );
}

export const BlockShell = memo(function BlockShell({
  id,
  type,
  data,
  selected,
  children,
  hideSockets,
}: BlockShellProps) {
  const { updateNodeData } = useReactFlow();
  const meta = lookupBlock(type ?? '');
  const emits = resolveEmits(type ?? '', data as Record<string, unknown>);
  const accepts = resolveAccepts(type ?? '');
  const verticalSockets = resolveVerticalSockets(type ?? '');
  const verticalTop = verticalSockets.filter((s) => s.position === 'top');
  const verticalBottom = verticalSockets.filter((s) => s.position === 'bottom');
  const hasExecPorts = verticalSockets.length > 0;
  const configuredShowExecPorts = (data as { showExecPorts?: boolean }).showExecPorts;
  const showExecPorts =
    configuredShowExecPorts ?? hasExecPorts;
  const status = (data as { status?: string }).status;
  const blockIndex = (data as { blockIndex?: number }).blockIndex;
  const hideBlockIndex = useStageDeckFlag((s) => s.isEnabled());
  const studioEmbed = Boolean((data as { studioEmbed?: boolean }).studioEmbed);

  const toggleExecPorts = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!id) return;
      updateNodeData(id, { showExecPorts: !showExecPorts });
    },
    [id, showExecPorts, updateNodeData],
  );

  if (studioEmbed) {
    return <div className="nodrag nopan">{children}</div>;
  }

  const execPortsVisible = hasExecPorts && showExecPorts && !hideSockets;

  return (
    <div
      className={`relative min-w-[220px] max-w-[360px] rounded-2xl border bg-white dark:bg-[#222222] shadow-panel transition-shadow nowheel ${
        selected ? 'border-brand ring-2 ring-brand/20' : 'border-line dark:border-[#333]'
      } ${execPortsVisible && verticalTop.length > 0 ? 'mt-3' : ''} ${
        execPortsVisible && verticalBottom.length > 0 ? 'mb-3' : ''
      }`}
    >
      {execPortsVisible && verticalTop.length > 0 && (
        <div className="absolute inset-x-0 top-0 h-0 z-10">
          {verticalTop.map((spec) => (
            <VerticalSocketHandle key={spec.id} spec={spec} />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2 border-b border-line dark:border-[#333] bg-surface/80 dark:bg-[#2a2a2a] rounded-t-2xl cursor-grab active:cursor-grabbing">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: meta?.accent ?? '#5E4D8A' }}
        />
        <span className="text-sm font-semibold text-ink truncate flex-1">
          {meta?.label ?? type}
        </span>
        {hasExecPorts && (
          <button
            type="button"
            onClick={toggleExecPorts}
            className={`nodrag nopan shrink-0 text-[9px] px-1.5 py-0.5 rounded-md border transition-colors ${
              showExecPorts
                ? 'border-brand/50 bg-brand/10 text-brand font-medium'
                : 'border-line/60 text-ink/40 hover:text-ink/60 hover:border-line'
            }`}
            title="显示/隐藏能力连接口（图像生成 / 3D 导演台 → 分镜预览）"
          >
            执行口
          </button>
        )}
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

      {execPortsVisible && verticalBottom.length > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-0 z-10">
          {verticalBottom.map((spec) => (
            <VerticalSocketHandle key={spec.id} spec={spec} />
          ))}
        </div>
      )}
    </div>
  );
});
