import type { Edge, Node } from '@xyflow/react';

/** BFS collect all upstream node ids feeding into blockId */
export function collectUpstreamIds(blockId: string, edges: Edge[]): Set<string> {
  const upstream = new Set<string>();
  const queue: string[] = [blockId];
  const seen = new Set<string>([blockId]);

  while (queue.length > 0) {
    const targetId = queue.shift()!;
    for (const edge of edges) {
      if (edge.target !== targetId || seen.has(edge.source)) continue;
      seen.add(edge.source);
      upstream.add(edge.source);
      queue.push(edge.source);
    }
  }

  return upstream;
}

/** Selected node + all upstream dependencies (for cascade run) */
export function collectCascadeChain(blockId: string, edges: Edge[]): Set<string> {
  const chain = collectUpstreamIds(blockId, edges);
  chain.add(blockId);
  return chain;
}

export function applyUpstreamHighlight(
  selectedId: string | null,
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  if (!selectedId) {
    return {
      nodes: nodes.map((n) => {
        if (!n.data?.dimmed && !n.data?.upstreamLit) return n;
        const next = { ...(n.data as Record<string, unknown>) };
        delete next.dimmed;
        delete next.upstreamLit;
        return { ...n, data: next };
      }),
      edges: edges.map((e) => {
        if (!e.data?.highlighted && !e.data?.dimmed) return e;
        const next = { ...((e.data ?? {}) as Record<string, unknown>) };
        delete next.highlighted;
        delete next.dimmed;
        return { ...e, data: next };
      }),
    };
  }

  const upstream = collectUpstreamIds(selectedId, edges);
  const lit = new Set([selectedId, ...upstream]);

  return {
    nodes: nodes.map((n) => {
      const dimmed = !lit.has(n.id);
      const upstreamLit = lit.has(n.id) && n.id !== selectedId;
      const data = (n.data ?? {}) as Record<string, unknown>;
      if (data.dimmed === dimmed && data.upstreamLit === upstreamLit) return n;
      return {
        ...n,
        data: {
          ...n.data,
          dimmed,
          upstreamLit,
        },
      };
    }),
    edges: edges.map((e) => {
      const onPath = lit.has(e.source) && lit.has(e.target);
      const data = (e.data ?? {}) as Record<string, unknown>;
      const highlighted = onPath;
      const dimmed = !lit.has(e.source);
      if (data.highlighted === highlighted && data.dimmed === dimmed) return e;
      return {
        ...e,
        data: {
          ...(e.data ?? {}),
          highlighted,
          dimmed,
        },
      };
    }),
  };
}

export function markCascadeEdge(
  edges: Edge[],
  activeTargetId: string | null,
  chain: Set<string>,
): Edge[] {
  return edges.map((e) => ({
    ...e,
    data: {
      ...(e.data ?? {}),
      cascadeActive: Boolean(
        activeTargetId && e.target === activeTargetId && chain.has(e.source),
      ),
    },
  }));
}

export function clearCascadeEdges(edges: Edge[]): Edge[] {
  return edges.map((e) => ({
    ...e,
    data: { ...(e.data ?? {}), cascadeActive: false },
  }));
}
