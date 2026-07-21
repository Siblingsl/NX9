import { memo, useCallback } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import {
  EXEC_3D_HANDLES,
  EXEC_PICTURE_HANDLES,
  lookupBlock,
  resolveAccepts,
  resolveEmits,
  resolveVerticalSockets,
} from '@nx9/shared';
import { Loader2 } from 'lucide-react';
import { useStageDeckFlag } from '../../stores/stage-deck-flag';
import { SideSocketRails, VerticalSocketRails } from './NodeSockets';
import '../../styles/node-stage-card.css';

interface BlockShellProps extends NodeProps {
  children: React.ReactNode;
  hideSockets?: boolean;
}

function isVerticalPortEdgeForNode(
  edge: {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  },
  nodeId: string,
  handleIds: Set<string>,
): boolean {
  if (edge.source !== nodeId && edge.target !== nodeId) return false;
  const sh = edge.sourceHandle ?? '';
  const th = edge.targetHandle ?? '';
  const strip = (h: string) => (h.endsWith('-out') ? h.slice(0, -4) : h);
  return (
    handleIds.has(sh) ||
    handleIds.has(th) ||
    handleIds.has(strip(sh)) ||
    handleIds.has(strip(th)) ||
    EXEC_PICTURE_HANDLES.has(sh) ||
    EXEC_PICTURE_HANDLES.has(th) ||
    EXEC_3D_HANDLES.has(sh) ||
    EXEC_3D_HANDLES.has(th) ||
    EXEC_3D_HANDLES.has(strip(sh)) ||
    EXEC_3D_HANDLES.has(strip(th))
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
      } ${execPortsVisible && verticalTop.length > 0 ? 'has-ports-top' : ''} ${
        execPortsVisible && verticalBottom.length > 0 ? 'has-ports-bottom' : ''
      }`}
    >
      <VerticalSocketRails
        top={verticalTop}
        bottom={verticalBottom}
        hidden={!execPortsVisible}
      />
      <SideSocketRails accepts={accepts} emits={emits} hidden={hideSockets} />

      <div className="nx9-stage-card__surface">
        <div className="nx9-stage-card__accent" style={{ background: accent }} aria-hidden />

        <div className="nx9-stage-card__head">
          <span className="nx9-stage-card__title">{meta?.label ?? type}</span>
          {hasExecPorts && (
            <button
              type="button"
              onClick={toggleExecPorts}
              className={`nx9-stage-card__port-toggle nodrag nopan ${showExecPorts ? 'is-on' : ''}`}
              title={showExecPorts ? '关闭上下连接口并切断相关连接' : '打开上下连接口'}
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
          {children}
        </div>
      </div>
    </div>
  );
});
