import type { Edge, Node } from '@xyflow/react';
import { WORKFLOW_TEMPLATES, normalizeDataEdgeHandlesAwayFromExec } from '@nx9/shared';

/**
 * 核心成片节点（含导演台批出关键帧与台内审阅）
 * 编剧台 → 分镜台 ←出图(能力口) → 导演台 → 视频 → 智能剪辑 → 导出
 */
export const CORE_PIPELINE_KINDS = [
  'script-desk',
  'storyboard-desk',
  'picture-gen',
  'director-desk',
  'clip-gen',
  'clip-editor',
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
    { source: 'script-desk', target: 'storyboard-desk', sourceHandle: 'prompt', targetHandle: 'prompt' },
    { source: 'picture-gen', target: 'storyboard-desk', sourceHandle: 'exec-picture', targetHandle: 'exec-picture' },
    { source: 'storyboard-desk', target: 'director-desk', sourceHandle: 'prompt', targetHandle: 'prompt' },
    { source: 'director-desk', target: 'clip-gen', sourceHandle: 'picture', targetHandle: 'picture' },
    { source: 'clip-gen', target: 'clip-editor', sourceHandle: 'clip', targetHandle: 'clip' },
    { source: 'clip-editor', target: 'export-pack', sourceHandle: 'clip', targetHandle: 'clip' },
  ];
  const missingLinkCount = requiredLinks.filter(
    (link) =>
      !linkExists(edges, byKind.get(link.source)?.id, byKind.get(link.target)?.id, link),
  ).length;
  const deskId =
    byKind.get('storyboard-desk')?.id
    ?? byKind.get('storyboard-preview')?.id
    ?? byKind.get('story-grid')?.id;
  // 分镜台直连视频 = 绕过导演台审阅
  const hasBypass = linkExists(edges, deskId, byKind.get('clip-gen')?.id);
  return {
    resemblesCore: presentCount >= 4 && Boolean(deskId),
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
  const previewPosition =
    byKind.get('storyboard-desk')?.position
    ?? byKind.get('storyboard-preview')?.position
    ?? byKind.get('story-grid')?.position
    ?? { x: 700, y: 340 };
  const offsets: Partial<Record<CoreKind, { x: number; y: number }>> = {
    'script-desk': { x: -700, y: 0 },
    'storyboard-desk': { x: 0, y: 0 },
    'picture-gen': { x: -150, y: -240 },
    'director-desk': { x: 320, y: 0 },
    'clip-gen': { x: 620, y: 0 },
    'clip-editor': { x: 920, y: 0 },
    'export-pack': { x: 1220, y: 0 },
  };

  let addedNodeCount = 0;
  for (const kind of CORE_PIPELINE_KINDS) {
    if (byKind.has(kind)) continue;
    const source =
      templateByKind.get(kind)
      ?? (kind === 'storyboard-desk'
        ? templateByKind.get('storyboard-preview') ?? templateByKind.get('story-grid')
        : undefined);
    if (!source) continue;
    const offset = offsets[kind];
    if (!offset) continue;
    const node: Node = {
      id: kind === 'storyboard-desk' ? `desk-${source.id}` : source.id,
      type: kind,
      position: { x: previewPosition.x + offset.x, y: previewPosition.y + offset.y },
      // F-006: 尊重模板的 showExecPorts 设置（默认由 BlockShell ?? false 控制）
      data: { ...source.data },
    };
    nextNodes.push(node);
    byKind.set(kind, node);
    addedNodeCount++;
  }

  const deskId =
    byKind.get('storyboard-desk')?.id
    ?? byKind.get('storyboard-preview')?.id
    ?? byKind.get('story-grid')?.id;
  const videoId = byKind.get('clip-gen')?.id;
  let removedBypassCount = 0;
  const nextEdges = edges.filter((edge) => {
    const bypassVideo = edge.source === deskId && edge.target === videoId;
    if (bypassVideo) {
      removedBypassCount++;
      return false;
    }
    return true;
  });

  const definitions: CoreLinkSpec[] = [
    { source: 'script-desk', target: 'storyboard-desk', sourceHandle: 'prompt', targetHandle: 'prompt' },
    { source: 'picture-gen', target: 'storyboard-desk', sourceHandle: 'exec-picture', targetHandle: 'exec-picture' },
    { source: 'storyboard-desk', target: 'director-desk', sourceHandle: 'prompt', targetHandle: 'prompt' },
    { source: 'director-desk', target: 'clip-gen', sourceHandle: 'picture', targetHandle: 'picture' },
    { source: 'clip-gen', target: 'clip-editor', sourceHandle: 'clip', targetHandle: 'clip' },
    { source: 'clip-editor', target: 'export-pack', sourceHandle: 'clip', targetHandle: 'clip' },
  ];
  let addedLinkCount = 0;
  // F-006: 数据边改回左右口；拆除出图→导演旁路
  const beforeCount = nextEdges.length;
  const repairedEdges = normalizeDataEdgeHandlesAwayFromExec(nextNodes, nextEdges);
  removedBypassCount += Math.max(0, beforeCount - repairedEdges.length);
  nextEdges.length = 0;
  nextEdges.push(...repairedEdges);
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
