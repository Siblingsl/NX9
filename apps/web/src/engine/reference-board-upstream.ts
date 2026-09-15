import type { Edge, Node } from '@xyflow/react';
import { extractReferenceConstraints, type ReferenceConstraint } from '@nx9/shared';

/** Collect first upstream reference-board constraint for a target block (F-032). */
export function collectUpstreamReferenceConstraint(
  blockId: string,
  nodes: Node[],
  edges: Edge[],
): ReferenceConstraint | null {
  const incoming = edges.filter((e) => e.target === blockId);
  for (const edge of incoming) {
    const src = nodes.find((n) => n.id === edge.source && n.type === 'reference-board');
    if (!src) continue;
    const c = extractReferenceConstraints((src.data ?? {}) as Record<string, unknown>);
    if (c) return c;
  }
  return null;
}
