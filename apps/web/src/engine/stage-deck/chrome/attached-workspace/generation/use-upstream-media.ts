import { useMemo } from 'react';
import { useEdges, useNodes } from '@xyflow/react';
import { gatherUpstream } from '@nx9/shared';

export function useUpstreamMedia(blockId: string) {
  const nodes = useNodes();
  const edges = useEdges();

  return useMemo(() => {
    const flowBlocks = nodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'prompt',
      position: n.position,
      data: (n.data ?? {}) as Record<string, unknown>,
    }));
    const flowLinks = edges
      .filter((e) => e.target === blockId && nodes.some((n) => n.id === e.source))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      }));
    const upstream = gatherUpstream(blockId, flowBlocks, flowLinks);
    return {
      pictures: upstream.pictures ?? [],
      clips: upstream.clips ?? [],
      hasMedia: (upstream.pictures?.length ?? 0) > 0 || (upstream.clips?.length ?? 0) > 0,
    };
  }, [nodes, edges, blockId]);
}
