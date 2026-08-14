import type { Edge, Node, Viewport } from '@xyflow/react';
import {
  migrateV2ToV3,
  migrateBlockKinds,
  stripReviewGateFromGraph,
  stripAssetGateFromGraph,
  normalizeWorkspacePayload,
  normalizeDataEdgeHandlesAwayFromExec,
  type WorkspacePayload,
  type WorkspacePayloadV3,
  type SceneGroupRecord,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { normalizeFlowEdgeType } from './flow-edge-types';
import { autoSplitMixedDirector3dGraph } from './director3d-split';

/** React Flow 要求父节点排在子节点前面，否则拖拽/嵌套会丢 */
export function orderSceneParentsFirst(nodes: Node[]): Node[] {
  if (nodes.length < 2) return nodes;
  const parentIds = new Set(
    nodes.map((n) => n.parentId).filter((id): id is string => Boolean(id)),
  );
  if (parentIds.size === 0 && !nodes.some((n) => n.type === 'scene-group')) return nodes;
  const parents: Node[] = [];
  const rest: Node[] = [];
  for (const n of nodes) {
    if (parentIds.has(n.id) || n.type === 'scene-group') parents.push(n);
    else rest.push(n);
  }
  return [...parents, ...rest];
}

function collectSceneGroups(nodes: Node[]): SceneGroupRecord[] {
  return nodes
    .filter((n) => n.type === 'scene-group')
    .map((n) => {
      const memberIds = nodes.filter((c) => c.parentId === n.id).map((c) => c.id);
      const width =
        (typeof n.data?.width === 'number' ? n.data.width : undefined) ||
        n.width ||
        (typeof n.style?.width === 'number' ? (n.style.width as number) : 400);
      const height =
        (typeof n.data?.height === 'number' ? n.data.height : undefined) ||
        n.height ||
        (typeof n.style?.height === 'number' ? (n.style.height as number) : 280);
      return {
        id: n.id,
        label: typeof n.data?.label === 'string' ? n.data.label : '场景组',
        memberIds,
        position: { ...n.position },
        size: { width, height },
      };
    });
}

export function ensureWorkspaceV3(payload: Partial<WorkspacePayload>): WorkspacePayloadV3 {
  const normalized = normalizeWorkspacePayload(payload);
  if (normalized.version === 3) return normalized;
  return migrateV2ToV3(normalized);
}

export function toPayload(
  nodes: Node[],
  edges: Edge[],
  viewport: Viewport,
  nextBlockIndex: number,
  options?: {
    version?: 2 | 3;
    aliases?: Record<string, string>;
    viewMode?: WorkspacePayloadV3['viewMode'];
    takes?: WorkspacePayloadV3['takes'];
    groups?: WorkspacePayloadV3['groups'];
    lanes?: WorkspacePayloadV3['lanes'];
  },
): WorkspacePayload {
  const extras = useWorkspaceDocument.getState().getSnapshotForSave();
  const ordered = orderSceneParentsFirst(nodes);
  const base = {
    blocks: ordered.map((n) => ({
      id: n.id,
      type: n.type ?? 'prompt',
      position: n.position,
      data: n.data ?? {},
      width: n.width,
      height: n.height,
      parentId: n.parentId,
      extent: n.extent === 'parent' ? ('parent' as const) : undefined,
      hidden: n.hidden || undefined,
      style: n.style as Record<string, unknown> | undefined,
    })),
    links: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      edgeType: normalizeFlowEdgeType(
        e.type === 'channel' ? (e.data?.pathType as string | undefined) : e.type,
      ),
    })),
    viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
    nextBlockIndex,
    ...extras,
  };

  if (options?.version === 3) {
    return {
      ...base,
      version: 3,
      aliases: options.aliases ?? {},
      viewMode: options.viewMode ?? 'produce',
      takes: options.takes ?? [],
      groups: options.groups ?? collectSceneGroups(ordered),
      lanes: options.lanes,
    };
  }

  return { ...base, version: 2 as const };
}

export function fromPayload(
  payload: Awaited<ReturnType<typeof import('../api/client').api.loadWorkspace>>,
  options?: { channelEdges?: boolean },
) {
  const v3 = ensureWorkspaceV3(payload);
  const rawNodes: Node[] = (v3.blocks ?? []).map((b) => ({
    id: b.id,
    type: b.type,
    position: b.position,
    data: b.data ?? {},
    width: b.width,
    height: b.height,
    parentId: b.parentId,
    extent: b.extent === 'parent' ? ('parent' as const) : undefined,
    hidden: b.hidden,
    style: b.style,
  }));
  const rawLinks = (v3.links ?? []).map((l) => ({
    id: l.id,
    source: l.source,
    target: l.target,
    sourceHandle: l.sourceHandle ?? undefined,
    targetHandle: l.targetHandle ?? undefined,
    edgeType: l.edgeType,
  }));
  // F-005: 先拆除 asset-gate 节点并桥接边，再拆 review-gate，最后迁移剩余的旧 kind
  const strippedGate = stripAssetGateFromGraph(rawNodes, rawLinks);
  const stripped = stripReviewGateFromGraph(strippedGate.nodes, strippedGate.links);
  const migrated = migrateBlockKinds(stripped.nodes);
  const nodes: Node[] = orderSceneParentsFirst(migrated.nodes as Node[]);
  // F-006: 加载时把误挂上下口的数据边改回左右 prompt
  const normalizedLinks = normalizeDataEdgeHandlesAwayFromExec(nodes, stripped.links);
  const edges: Edge[] = normalizedLinks.map((l: (typeof normalizedLinks)[number]) => {
    const pathType = l.edgeType && l.edgeType !== 'default' ? l.edgeType : undefined;
    return {
      id: l.id,
      source: l.source,
      target: l.target,
      sourceHandle: l.sourceHandle ?? undefined,
      targetHandle: l.targetHandle ?? undefined,
      type: options?.channelEdges ? 'channel' : pathType,
      data: {
        pathType: pathType ?? 'default',
      },
    };
  });
  // DD-D-11: hydrate 时对 split-required 混装导演台自动拆出独立 3D 节点（非破坏性）。
  const autoSplit = autoSplitMixedDirector3dGraph({ nodes, edges });
  return {
    nodes: orderSceneParentsFirst(autoSplit.nodes),
    edges: autoSplit.edges,
    viewport: v3.viewport ?? { x: 0, y: 0, zoom: 1 },
    nextBlockIndex: v3.nextBlockIndex ?? 1,
    v3,
  };
}
