import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSimpleBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type EdgeProps,
} from '@xyflow/react';
import { SOCKET_COLORS, type SocketKind } from '@nx9/shared';
import { X } from 'lucide-react';
import type { FlowEdgeTypeId } from '../../flow-edge-types';
import { normalizeFlowEdgeType } from '../../flow-edge-types';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { useStageDeckEdgeMenu } from '../stores/edge-menu-ui';

function resolvePath(
  edgeType: FlowEdgeTypeId,
  props: EdgeProps,
): [path: string, labelX: number, labelY: number] {
  const params = {
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
  };
  switch (edgeType) {
    case 'straight': {
      const [path, x, y] = getStraightPath(params);
      return [path, x, y];
    }
    case 'step': {
      const [path, x, y] = getSmoothStepPath({ ...params, borderRadius: 0 });
      return [path, x, y];
    }
    case 'smoothstep': {
      const [path, x, y] = getSmoothStepPath(params);
      return [path, x, y];
    }
    case 'simplebezier': {
      const [path, x, y] = getSimpleBezierPath(params);
      return [path, x, y];
    }
    default: {
      const [path, x, y] = getBezierPath(params);
      return [path, x, y];
    }
  }
}

export const ChannelEdge = memo(function ChannelEdge(props: EdgeProps) {
  const cascadeActive = Boolean(props.data?.cascadeActive);
  const highlighted = Boolean(props.data?.highlighted);
  const dimmed = Boolean(props.data?.dimmed);
  const handleKind = (props.sourceHandleId ?? 'prompt') as SocketKind;
  const execLink = Boolean(props.data?.execLink);
  const stroke = execLink ? SOCKET_COLORS.picture : (SOCKET_COLORS[handleKind] ?? SOCKET_COLORS.prompt);
  const settingsPath = useWorkspaceDocument((s) => s.canvasAppearance.edgePathType ?? 'default');
  const pathType = normalizeFlowEdgeType(execLink ? 'straight' : settingsPath);
  const [edgePath, labelX, labelY] = resolvePath(pathType, props);
  const [lineHover, setLineHover] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDelete = useStageDeckEdgeMenu((s) => s.onDelete);

  const enterLine = useCallback(() => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    setLineHover(true);
  }, []);

  const leaveLine = useCallback(() => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      setLineHover(false);
      leaveTimer.current = null;
    }, 100);
  }, []);

  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    },
    [],
  );

  const strokeWidth = execLink ? 3 : props.selected || highlighted ? 3 : 2;
  const opacity = dimmed ? 0.25 : 1;
  const showCut = lineHover || props.selected;

  return (
    <>
      <g onMouseEnter={enterLine} onMouseLeave={leaveLine}>
        <path
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={18}
          className="react-flow__edge-interaction"
        />
        <BaseEdge
          path={edgePath}
          markerEnd={props.markerEnd}
          style={{
            stroke,
            strokeWidth,
            opacity,
            strokeDasharray: cascadeActive ? '8 6' : undefined,
            animation: cascadeActive ? 'nx9-cascade-flow 0.8s linear infinite' : undefined,
          }}
          className={props.selected ? 'selected' : undefined}
        />
      </g>
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            opacity: showCut ? 1 : 0.55,
          }}
          onMouseEnter={enterLine}
          onMouseLeave={leaveLine}
        >
          <button
            type="button"
            className={`flex items-center justify-center rounded-full border-2 border-white shadow transition-all ${
              showCut
                ? 'h-5 w-5 bg-rose-500 text-white scale-110'
                : 'h-3 w-3 bg-ink/30'
            }`}
            aria-label="断开连接线"
            title="断开连接线"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(props.id);
            }}
          >
            {showCut ? <X size={11} strokeWidth={2.5} /> : null}
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

export const channelEdgeTypes = { channel: ChannelEdge };

export function mapEdgesToChannel(edges: import('@xyflow/react').Edge[]): import('@xyflow/react').Edge[] {
  return edges.map((e) => ({
    ...e,
    type: 'channel',
    data: {
      ...(e.data ?? {}),
      pathType: e.data?.pathType ?? (e.type && e.type !== 'channel' ? e.type : 'default'),
    },
  }));
}
