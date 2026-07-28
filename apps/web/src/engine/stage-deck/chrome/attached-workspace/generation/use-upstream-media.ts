import { useMemo } from 'react';
import { useEdges, useNodes } from '@xyflow/react';
import { gatherUpstream, type UpstreamPolicy } from '@nx9/shared';

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
    const nodeData = nodes.find((n) => n.id === blockId)?.data as Record<string, unknown> | undefined;
    const policy = nodeData?.upstreamPolicy as UpstreamPolicy | undefined;
    const primarySourceId = nodeData?.primarySourceId as string | null | undefined;
    const upstream = gatherUpstream(blockId, flowBlocks, flowLinks, policy, primarySourceId);
    return {
      pictures: upstream.pictures ?? [],
      clips: upstream.clips ?? [],
      sounds: upstream.sounds ?? [],
      hasMedia: (upstream.pictures?.length ?? 0) > 0 || (upstream.clips?.length ?? 0) > 0 || (upstream.sounds?.length ?? 0) > 0,
    };
  }, [nodes, edges, blockId]);
}
