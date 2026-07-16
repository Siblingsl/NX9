import { memo, useCallback } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import {
  EXEC_PICTURE_HANDLES,
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
import '../../styles/node-stage-card.css';

interface BlockShellProps extends NodeProps {
  children: React.ReactNode;
  hideSockets?: boolean;
}

function isVerticalPortEdgeForNode(
  edge: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null },
  nodeId: string,
  handleIds: Set<string>,
): boolean {
  if (edge.source !== nodeId && edge.target !== nodeId) return false;
  return (
    handleIds.has(edge.sourceHandle ?? '') ||
    handleIds.has(edge.targetHandle ?? '') ||
    EXEC_PICTURE_HANDLES.has(edge.sourceHandle ?? '') ||
    EXEC_PICTURE_HANDLES.has(edge.targetHandle ?? '')
  );
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
  const isDualPurposePort = spec.type === 'both';
  const commonClass = `nx9-socket nx9-socket-exec ${
    isDualPurposePort ? '!w-2.5 !h-2.5' : '!w-3 !h-3'
  } !border-2 !border-white`;
  const commonStyle = { background: SOCKET_COLORS[spec.kind], left: `${spec.offsetPct ?? 50}%` };
  if (isDualPurposePort) {
    return (
      <>
        <Handle type="target" position={position} id={spec.id} className={commonClass} style={commonStyle} />
        <Handle type="source" position={position} id={spec.id} className={commonClass} style={commonStyle} />
      </>
    );
  }
  return (
    <Handle
      type={spec.type === 'both' ? 'target' : spec.type}
      position={position}
      id={spec.id}
      className={commonClass}
      style={commonStyle}
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
  const { setEdges, updateNodeData } = useReactFlow();
  const meta = lookupBlock(type ?? '');
  const emits = resolveEmits(type ?? '', data as Record<string, unknown>);
  const accepts = resolveAccepts(type ?? '');
  const verticalSockets = resolveVerticalSockets(type ?? '');
  const verticalTop = verticalSockets.filter((s) => s.position === 'top');
  const verticalBottom = verticalSockets.filter((s) => s.position === 'bottom');
  const hasExecPorts = verticalSockets.length > 0;
  const configuredShowExecPorts = (data as { showExecPorts?: boolean }).showExecPorts;
  const showExecPorts = configuredShowExecPorts ?? hasExecPorts;
  const status = (data as { status?: string }).status;
  const blockIndex = (data as { blockIndex?: number }).blockIndex;
  const hideBlockIndex = useStageDeckFlag((s) => s.isEnabled());
  const studioEmbed = Boolean((data as { studioEmbed?: boolean }).studioEmbed);

  const toggleExecPorts = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!id) return;
      const nextShowExecPorts = !showExecPorts;
      if (!nextShowExecPorts) {
        const handleIds = new Set(verticalSockets.map((spec) => spec.id));
        setEdges((edges) => edges.filter((edge) => !isVerticalPortEdgeForNode(edge, id, handleIds)));
      }
      updateNodeData(id, { showExecPorts: nextShowExecPorts });
    },
    [id, setEdges, showExecPorts, updateNodeData, verticalSockets],
  );

  if (studioEmbed) {
    return <div className="nodrag nopan">{children}</div>;
  }

  const execPortsVisible = hasExecPorts && showExecPorts && !hideSockets;
  const accent = meta?.accent ?? 'var(--nx9-accent, #2dd4bf)';
  const statusClass =
    status === 'running'
      ? 'is-running'
      : status === 'done' || status === 'success'
        ? 'is-done'
        : status === 'error'
          ? 'is-error'
          : status === 'ready'
            ? 'is-ready'
            : '';

  return (
    <div
      className={`nx9-stage-card nowheel ${selected ? 'is-selected' : ''} ${
        status === 'running' ? 'is-running' : ''
      } ${execPortsVisible && verticalTop.length > 0 ? 'mt-3' : ''} ${
        execPortsVisible && verticalBottom.length > 0 ? 'mb-3' : ''
      }`}
    >
      <div className="nx9-stage-card__accent" style={{ background: accent }} aria-hidden />

      {execPortsVisible && verticalTop.length > 0 && (
        <div className="absolute inset-x-0 top-0 h-0 z-10">
          {verticalTop.map((spec) => (
            <VerticalSocketHandle key={spec.id} spec={spec} />
          ))}
        </div>
      )}

      <div className="nx9-stage-card__head">
        <span className="nx9-stage-card__title">{meta?.label ?? type}</span>
        {hasExecPorts && (
          <button
            type="button"
            onClick={toggleExecPorts}
            className={`nx9-stage-card__port-toggle nodrag nopan ${showExecPorts ? 'is-on' : ''}`}
            title={showExecPorts ? '关闭顶部连接口并切断相关连接' : '打开顶部连接口'}
          >
            口
          </button>
        )}
        {blockIndex != null && !hideBlockIndex && (
          <span className="nx9-stage-card__badge">#{blockIndex}</span>
        )}
        {status === 'running' ? (
          <Loader2 size={13} className="animate-spin text-teal-300 shrink-0" />
        ) : (
          <span className={`nx9-stage-card__status ${statusClass}`} title={status ?? 'idle'} />
        )}
      </div>

      <div className="nx9-stage-card__body nodrag nopan nowheel nx9-stage-card-fallback">
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
