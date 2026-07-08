import { memo, useState } from 'react';
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
import type { FlowEdgeTypeId } from '../../flow-edge-types';
import { normalizeFlowEdgeType } from '../../flow-edge-types';
import { EdgeMidpointMenu } from './EdgeMidpointMenu';
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
  const pathType = (props.data?.pathType as FlowEdgeTypeId | undefined) ?? 'default';
  const cascadeActive = Boolean(props.data?.cascadeActive);
  const highlighted = Boolean(props.data?.highlighted);
  const dimmed = Boolean(props.data?.dimmed);
  const handleKind = (props.sourceHandleId ?? 'prompt') as SocketKind;
  const stroke = SOCKET_COLORS[handleKind] ?? SOCKET_COLORS.prompt;
  const [edgePath, labelX, labelY] = resolvePath(pathType, props);
  const [midHover, setMidHover] = useState(false);
  const menu = useStageDeckEdgeMenu((s) => s.menu);
  const setMenu = useStageDeckEdgeMenu((s) => s.setMenu);
  const onChangeType = useStageDeckEdgeMenu((s) => s.onChangeType);
  const onDelete = useStageDeckEdgeMenu((s) => s.onDelete);

  const strokeWidth = props.selected || highlighted ? 3 : 2;
  const opacity = dimmed ? 0.25 : 1;
  const edgeType = normalizeFlowEdgeType(
    props.type === 'channel' ? pathType : props.type,
  );

  return (
    <>
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
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          onMouseEnter={() => setMidHover(true)}
          onMouseLeave={() => setMidHover(false)}
        >
          <button
            type="button"
            className={`w-3 h-3 rounded-full border-2 border-white shadow transition-transform ${
              midHover || menu?.edgeId === props.id ? 'scale-125 bg-brand' : 'bg-ink/30'
            }`}
            aria-label="连接线操作"
            onClick={(e) => {
              e.stopPropagation();
              setMenu({
                x: e.clientX,
                y: e.clientY,
                edgeId: props.id,
                edgeType,
              });
            }}
          />
        </div>
      </EdgeLabelRenderer>
      {menu?.edgeId === props.id && onChangeType && onDelete && (
        <EdgeMidpointMenu
          x={menu.x}
          y={menu.y}
          edgeId={menu.edgeId}
          edgeType={menu.edgeType}
          onChangeType={(type) => onChangeType(menu.edgeId, type)}
          onDelete={() => onDelete(menu.edgeId)}
          onClose={() => setMenu(null)}
        />
      )}
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
