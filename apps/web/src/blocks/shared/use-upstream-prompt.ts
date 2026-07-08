import { useMemo } from 'react';
import { useEdges, useNodes } from '@xyflow/react';
import { gatherUpstream } from '@nx9/shared';

export function useUpstreamPrompt(nodeId: string) {
  const nodes = useNodes();
  const edges = useEdges();

  return useMemo(() => {
    const flowBlocks = nodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'prompt',
      position: n.position,
      data: (n.data ?? {}) as Record<string, unknown>,
    }));
    const flowLinks = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    }));
    const upstream = gatherUpstream(nodeId, flowBlocks, flowLinks);
    const preview =
      upstream.prompts.filter(Boolean).join(' · ') ||
      upstream.promptBatch?.[0]?.prompt ||
      '';
    const hasUpstream =
      upstream.prompts.some((p) => p.trim()) || (upstream.promptBatch?.length ?? 0) > 0;
    return { hasUpstream, preview };
  }, [nodes, edges, nodeId]);
}
