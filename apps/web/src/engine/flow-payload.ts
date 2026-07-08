import type { Edge, Node, Viewport } from '@xyflow/react';
import {
  migrateV2ToV3,
  migrateBlockKinds,
  normalizeWorkspacePayload,
  type WorkspacePayload,
  type WorkspacePayloadV3,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { normalizeFlowEdgeType } from './flow-edge-types';

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
  const base = {
    blocks: nodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'prompt',
      position: n.position,
      data: n.data ?? {},
      width: n.width,
      height: n.height,
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
      viewMode: options.viewMode ?? 'explore',
      takes: options.takes ?? [],
      groups: options.groups ?? [],
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
  }));
  const { nodes } = migrateBlockKinds(rawNodes);
  const edges: Edge[] = (v3.links ?? []).map((l) => {
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
  return {
    nodes,
    edges,
    viewport: v3.viewport ?? { x: 0, y: 0, zoom: 1 },
    nextBlockIndex: v3.nextBlockIndex ?? 1,
    v3,
  };
}
