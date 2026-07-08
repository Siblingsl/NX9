import { useEffect } from 'react';
import type { Edge } from '@xyflow/react';
import type { FlowEdgeTypeId } from '../flow-edge-types';
import { useKnifeTool } from './interaction/KnifeOverlay';
import { useStageDeckEdgeMenu } from './stores/edge-menu-ui';

interface StageDeckInteractionBridgeProps {
  getEdges: () => Edge[];
  getNodePositions: () => Map<string, { x: number; y: number }>;
  onCutEdges: (ids: string[]) => void;
  onChangeEdgeType: (edgeId: string, edgeType: FlowEdgeTypeId) => void;
  onDeleteEdge: (edgeId: string) => void;
}

export function StageDeckInteractionBridge({
  getEdges,
  getNodePositions,
  onCutEdges,
  onChangeEdgeType,
  onDeleteEdge,
}: StageDeckInteractionBridgeProps) {
  const bindHandlers = useStageDeckEdgeMenu((s) => s.bindHandlers);

  useEffect(() => {
    bindHandlers({ onChangeType: onChangeEdgeType, onDelete: onDeleteEdge });
  }, [bindHandlers, onChangeEdgeType, onDeleteEdge]);

  const { knifeOverlay } = useKnifeTool(true, getEdges, getNodePositions, onCutEdges);

  return knifeOverlay;
}
