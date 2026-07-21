import { useEffect } from 'react';
import type { Edge } from '@xyflow/react';
import { useKnifeTool } from './interaction/KnifeOverlay';
import { useStageDeckEdgeMenu } from './stores/edge-menu-ui';

interface StageDeckInteractionBridgeProps {
  getEdges: () => Edge[];
  getNodePositions: () => Map<string, { x: number; y: number }>;
  onCutEdges: (ids: string[]) => void;
  onDeleteEdge: (edgeId: string) => void;
}

export function StageDeckInteractionBridge({
  getEdges,
  getNodePositions,
  onCutEdges,
  onDeleteEdge,
}: StageDeckInteractionBridgeProps) {
  const bindHandlers = useStageDeckEdgeMenu((s) => s.bindHandlers);

  useEffect(() => {
    bindHandlers({ onDelete: onDeleteEdge });
  }, [bindHandlers, onDeleteEdge]);

  const { knifeOverlay } = useKnifeTool(true, getEdges, getNodePositions, onCutEdges);

  return knifeOverlay;
}
