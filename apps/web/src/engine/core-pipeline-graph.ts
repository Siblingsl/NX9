import type { Edge, Node } from '@xyflow/react';
import { WORKFLOW_TEMPLATES } from '@nx9/shared';

export const CORE_PIPELINE_KINDS = [
  'dialogue-sheet',
  'asset-gate',
  'story-grid',
  'storyboard-preview',
  'picture-gen',
  'director-3d',
  'review-gate',
  'clip-gen',
  'export-pack',
] as const;

type CoreKind = (typeof CORE_PIPELINE_KINDS)[number];
type CoreLinkSpec = {
  source: CoreKind;
  target: CoreKind;
  sourceHandle?: string;
  targetHandle?: string;
};

export interface CorePipelineAudit {
  resemblesCore: boolean;
  valid: boolean;
  missingKinds: CoreKind[];
  missingLinkCount: number;
  hasBypass: boolean;
}

function firstByKind(nodes: Node[]): Map<string, Node> {
  const result = new Map<string, Node>();
  for (const node of nodes) {
    if (node.type && !result.has(node.type)) result.set(node.type, node);
  }
  return result;
}

function linkExists(
  edges: Edge[],
  sourceId: string | undefined,
  targetId: string | undefined,
  handles?: { sourceHandle?: string; targetHandle?: string },
): boolean {
  if (!sourceId || !targetId) return false;
  return edges.some(
    (edge) =>
      edge.source === sourceId &&
      edge.target === targetId &&
      (handles?.sourceHandle == null || edge.sourceHandle === handles.sourceHandle) &&
      (handles?.targetHandle == null || edge.targetHandle === handles.targetHandle),
  );
}

export function auditCorePipeline(nodes: Node[], edges: Edge[]): CorePipelineAudit {
  const byKind = firstByKind(nodes);
  const presentCount = CORE_PIPELINE_KINDS.filter((kind) => byKind.has(kind)).length;
  const missingKinds = CORE_PIPELINE_KINDS.filter((kind) => !byKind.has(kind));
  const requiredLinks: CoreLinkSpec[] = [
    { source: 'dialogue-sheet', target: 'asset-gate', targetHandle: 'asset-gate' },
    { source: 'asset-gate', target: 'story-grid', sourceHandle: 'asset-gate' },
    { source: 'story-grid', target: 'storyboard-preview' },
    { source: 'picture-gen', target: 'storyboard-preview', sourceHandle: 'exec-picture', targetHandle: 'exec-picture' },
    { source: 'director-3d', target: 'storyboard-preview', sourceHandle: 'exec-picture', targetHandle: 'exec-picture' },
    { source: 'storyboard-preview', target: 'review-gate' },
    { source: 'review-gate', target: 'clip-gen' },
    { source: 'clip-gen', target: 'export-pack' },
  ];
  const missingLinkCount = requiredLinks.filter(
    (link) =>
      !linkExists(edges, byKind.get(link.source)?.id, byKind.get(link.target)?.id, link),
  ).length;
  const hasBypass = linkExists(
    edges,
    byKind.get('storyboard-preview')?.id,
    byKind.get('clip-gen')?.id,
  );
  return {
    resemblesCore: presentCount >= 4 && byKind.has('storyboard-preview'),
    valid: missingKinds.length === 0 && missingLinkCount === 0 && !hasBypass,
    missingKinds: [...missingKinds],
    missingLinkCount,
    hasBypass,
  };
}

export function repairCorePipeline(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[]; addedNodeCount: number; addedLinkCount: number; removedBypassCount: number } {
  const template = WORKFLOW_TEMPLATES.find((item) => item.id === 'tpl-core-episode');
  if (!template) return { nodes, edges, addedNodeCount: 0, addedLinkCount: 0, removedBypassCount: 0 };

  const built = template.build();
  const templateByKind = new Map(built.blocks.map((block) => [block.type, block]));
  const nextNodes = [...nodes];
  const byKind = firstByKind(nextNodes);
  const previewPosition = byKind.get('storyboard-preview')?.position ?? { x: 700, y: 340 };
  const offsets: Record<CoreKind, { x: number; y: number }> = {
    'dialogue-sheet': { x: -750, y: 0 },
    'asset-gate': { x: -500, y: 0 },
    'story-grid': { x: -250, y: 0 },
    'storyboard-preview': { x: 0, y: 0 },
    'picture-gen': { x: -135, y: -240 },
    'director-3d': { x: 135, y: -240 },
    'review-gate': { x: 300, y: 0 },
    'clip-gen': { x: 600, y: 0 },
    'export-pack': { x: 900, y: 0 },
  };

  let addedNodeCount = 0;
  for (const kind of CORE_PIPELINE_KINDS) {
    if (byKind.has(kind)) continue;
    const source = templateByKind.get(kind);
    if (!source) continue;
    const offset = offsets[kind];
    const node: Node = {
      id: source.id,
      type: source.type,
      position: { x: previewPosition.x + offset.x, y: previewPosition.y + offset.y },
      data: source.data,
    };
    nextNodes.push(node);
    byKind.set(kind, node);
    addedNodeCount++;
  }

  const previewId = byKind.get('storyboard-preview')?.id;
  const videoId = byKind.get('clip-gen')?.id;
  let removedBypassCount = 0;
  const nextEdges = edges.filter((edge) => {
    const bypass = edge.source === previewId && edge.target === videoId;
    if (bypass) removedBypassCount++;
    return !bypass;
  });

  const definitions: CoreLinkSpec[] = [
    { source: 'dialogue-sheet', target: 'asset-gate', targetHandle: 'asset-gate' },
    { source: 'asset-gate', target: 'story-grid', sourceHandle: 'asset-gate' },
    { source: 'story-grid', target: 'storyboard-preview' },
    { source: 'picture-gen', target: 'storyboard-preview', sourceHandle: 'exec-picture', targetHandle: 'exec-picture' },
    { source: 'director-3d', target: 'storyboard-preview', sourceHandle: 'exec-picture', targetHandle: 'exec-picture' },
    { source: 'storyboard-preview', target: 'review-gate' },
    { source: 'review-gate', target: 'clip-gen' },
    { source: 'clip-gen', target: 'export-pack' },
  ];
  let addedLinkCount = 0;
  for (const link of definitions) {
    const source = byKind.get(link.source);
    const target = byKind.get(link.target);
    if (!source || !target || linkExists(nextEdges, source.id, target.id, link)) continue;
    nextEdges.push({
      id: `core-repair-${link.source}-${link.target}-${Date.now()}-${addedLinkCount}`,
      source: source.id,
      target: target.id,
      sourceHandle: link.sourceHandle,
      targetHandle: link.targetHandle,
    });
    addedLinkCount++;
  }

  return {
    nodes: nextNodes,
    edges: nextEdges,
    addedNodeCount,
    addedLinkCount,
    removedBypassCount,
  };
}
