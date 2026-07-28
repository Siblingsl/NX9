import { useMemo } from 'react';
import { useEdges, useNodes } from '@xyflow/react';
import { gatherUpstream, type UpstreamPolicy } from '@nx9/shared';

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
    // F-027: 从当前节点 data 读取策略
    const node = nodes.find((n) => n.id === nodeId);
    const nodeData = node?.data as Record<string, unknown> | undefined;
    const policy = nodeData?.upstreamPolicy as UpstreamPolicy | undefined;
    const primarySourceId = nodeData?.primarySourceId as string | null | undefined;
    const upstream = gatherUpstream(nodeId, flowBlocks, flowLinks, policy, primarySourceId);
    const preview =
      upstream.prompts.filter(Boolean).join(' · ') ||
      upstream.promptBatch?.[0]?.prompt ||
      '';
    const hasUpstream =
      upstream.prompts.some((p) => p.trim()) || (upstream.promptBatch?.length ?? 0) > 0;
    return { hasUpstream, preview };
  }, [nodes, edges, nodeId]);
}
