import type { Edge, Node } from '@xyflow/react';
import { gatherUpstream } from '@nx9/shared';
import { RUNNABLE_BLOCKS } from '../../flow-runner';

function simpleHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

function toFlowGraph(nodes: Node[], edges: Edge[]) {
  return {
    blocks: nodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'prompt',
      position: n.position,
      data: (n.data ?? {}) as Record<string, unknown>,
    })),
    links: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    })),
  };
}

/** P3-04: 上游 prompt + asset 指纹 */
export function computeUpstreamInputHash(nodeId: string, nodes: Node[], edges: Edge[]): string {
  const { blocks, links } = toFlowGraph(nodes, edges);
  const upstream = gatherUpstream(nodeId, blocks, links);
  const parts = [
    ...upstream.prompts,
    ...upstream.pictures,
    ...(upstream.promptBatch?.map((item) => item.prompt) ?? []),
    upstream.promptDispatch?.composeAction ?? '',
  ];
  return simpleHash(parts.join('\u001f'));
}

function nodeHasOutput(data: Record<string, unknown>): boolean {
  return Boolean(
    data.previewUrl ||
      data.videoUrl ||
      data.audioUrl ||
      (Array.isArray(data.previewUrls) && data.previewUrls.length > 0),
  );
}

/** 上游变更后标记下游 stale；指纹一致时清除 stale */
export function propagateStaleFlags(nodes: Node[], edges: Edge[]): Node[] {
  let changed = false;
  const next = nodes.map((node) => {
    const type = node.type ?? '';
    if (!RUNNABLE_BLOCKS.has(type)) return node;
    const data = { ...(node.data ?? {}) } as Record<string, unknown>;
    if (!nodeHasOutput(data)) return node;

    const expected = computeUpstreamInputHash(node.id, nodes, edges);
    const stored = data.inputHash as string | undefined;
    const status = data.status as string | undefined;

    if (!stored) return node;

    if (stored === expected) {
      if (status === 'stale') {
        changed = true;
        return { ...node, data: { ...data, status: 'done' } };
      }
      return node;
    }

    if (status !== 'stale' && status !== 'running') {
      changed = true;
      return { ...node, data: { ...data, status: 'stale' } };
    }
    return node;
  });
  return changed ? next : nodes;
}

export function stampInputHashOnSuccess(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const status = patch.status ?? nodes.find((n) => n.id === nodeId)?.data?.status;
  if (status !== 'done' && status !== 'success') return patch;
  return {
    ...patch,
    inputHash: computeUpstreamInputHash(nodeId, nodes, edges),
  };
}
