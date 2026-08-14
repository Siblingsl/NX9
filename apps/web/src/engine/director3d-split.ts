import type { Edge, Node } from '@xyflow/react';
import {
  DIRECTOR3D_NODE_SCHEMA_VERSION,
  DIRECTOR3D_REVERSE_MIGRATION_VERSION,
  hasDirectorDeskProductionState,
  hasPersistedDirector3dState,
  isDirector3dDeskLink,
} from '@nx9/shared';

const DIRECTOR3D_OWNED_KEYS = [
  'sceneByShot',
  'sceneTemplates',
  'standaloneProject',
  'last3dCommit',
  'consumedCommitIds',
  'scene',
  'activeShotId',
] as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickDirector3dOwned(data: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of DIRECTOR3D_OWNED_KEYS) {
    if (data[key] !== undefined) picked[key] = data[key];
  }
  return picked;
}

function stripDirector3dOwned(data: Record<string, unknown>): Record<string, unknown> {
  const next = { ...data };
  for (const key of DIRECTOR3D_OWNED_KEYS) {
    delete next[key];
  }
  return next;
}

function mergeDirector3dOwned(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...base,
    ...overlay,
    sceneByShot: {
      ...record(base.sceneByShot),
      ...record(overlay.sceneByShot),
    },
    sceneTemplates: {
      ...record(base.sceneTemplates),
      ...record(overlay.sceneTemplates),
    },
    consumedCommitIds: [
      ...new Set([
        ...(Array.isArray(base.consumedCommitIds) ? base.consumedCommitIds as string[] : []),
        ...(Array.isArray(overlay.consumedCommitIds) ? overlay.consumedCommitIds as string[] : []),
      ]),
    ].slice(-100),
  };
}

function uniqueNodeId(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let index = 2;
  while (existing.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function findAttachedDirector3dId(
  directorDeskId: string,
  nodes: Array<{ id: string; type?: string | null }>,
  edges: Array<{ source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>,
): string | undefined {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    if (edge.source !== directorDeskId && edge.target !== directorDeskId) continue;
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (
      !source?.type
      || !target?.type
      || !isDirector3dDeskLink(source.type, target.type, edge.sourceHandle, edge.targetHandle)
    ) {
      continue;
    }
    return source.type === 'director-3d' ? source.id : target.id;
  }
  return undefined;
}

export function needsDirector3dSplit(
  nodeType: string | null | undefined,
  data: Record<string, unknown>,
): boolean {
  if (nodeType !== 'director-desk') return false;
  if (data.director3dMigrationDecision === 'split-done') return false;
  const has3d = hasPersistedDirector3dState(data) || hasPersistedDirector3dState(record(data.director3d));
  if (!has3d) return false;
  if (data.director3dMigrationDecision === 'split-required') return true;
  return data.migratedFrom === 'director-3d' && hasDirectorDeskProductionState(data);
}

export interface SplitMixedDirector3dResult {
  ok: boolean;
  reason?: string;
  directorDeskId: string;
  director3dNodeId?: string;
  createdNode?: boolean;
  directorData?: Record<string, unknown>;
  newNode?: {
    id: string;
    type: 'director-3d';
    position: { x: number; y: number };
    data: Record<string, unknown>;
  };
  externalNodeId?: string;
  externalData?: Record<string, unknown>;
  newEdge?: {
    id: string;
    source: string;
    target: string;
    sourceHandle: 'exec-3d';
    targetHandle: 'exec-3d';
  };
}

export function splitMixedDirector3dNode(input: {
  directorDeskId: string;
  nodes: Array<{
    id: string;
    type?: string | null;
    position?: { x: number; y: number };
    data?: Record<string, unknown>;
  }>;
  edges: Array<{
    id?: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }>;
  now?: string;
  newNodeId?: string;
}): SplitMixedDirector3dResult {
  const director = input.nodes.find((node) => node.id === input.directorDeskId);
  if (!director || director.type !== 'director-desk') {
    return { ok: false, reason: '不是导演台节点', directorDeskId: input.directorDeskId };
  }
  const data = record(director.data);
  if (!needsDirector3dSplit(director.type, data)) {
    return { ok: false, reason: '当前节点不需要拆分 3D 状态', directorDeskId: input.directorDeskId };
  }

  const fromTop = pickDirector3dOwned(data);
  const fromNamespace = pickDirector3dOwned(record(data.director3d));
  const extracted = mergeDirector3dOwned(fromTop, fromNamespace);
  const now = input.now ?? new Date().toISOString();
  const attachedId = findAttachedDirector3dId(input.directorDeskId, input.nodes, input.edges);
  const existingIds = new Set(input.nodes.map((node) => node.id));

  if (attachedId) {
    const attached = input.nodes.find((node) => node.id === attachedId);
    const attachedData = record(attached?.data);
    return {
      ok: true,
      directorDeskId: input.directorDeskId,
      director3dNodeId: attachedId,
      createdNode: false,
      externalNodeId: attachedId,
      externalData: {
        ...attachedData,
        ...mergeDirector3dOwned(pickDirector3dOwned(attachedData), extracted),
        schemaVersion: DIRECTOR3D_NODE_SCHEMA_VERSION,
        restoredFrom: attachedData.restoredFrom ?? 'director-3d-split-mixed',
      },
      directorData: {
        ...stripDirector3dOwned(data),
        migratedFrom: undefined,
        director3dMigrationDecision: 'split-done',
        director3dSplitNodeId: attachedId,
        director3dSplitAt: now,
        director3d: {
          copiedToStorageBlockId: attachedId,
          copiedAt: now,
        },
      },
    };
  }

  const newNodeId = uniqueNodeId(
    input.newNodeId ?? `${input.directorDeskId}-director-3d`,
    existingIds,
  );
  return {
    ok: true,
    directorDeskId: input.directorDeskId,
    director3dNodeId: newNodeId,
    createdNode: true,
    directorData: {
      ...stripDirector3dOwned(data),
      migratedFrom: undefined,
      director3dMigrationDecision: 'split-done',
      director3dSplitNodeId: newNodeId,
      director3dSplitAt: now,
      director3d: {
        copiedToStorageBlockId: newNodeId,
        copiedAt: now,
      },
    },
    newNode: {
      id: newNodeId,
      type: 'director-3d',
      position: {
        x: director.position?.x ?? 0,
        y: (director.position?.y ?? 0) - 220,
      },
      data: {
        ...extracted,
        schemaVersion: DIRECTOR3D_NODE_SCHEMA_VERSION,
        director3dReverseMigrationVersion: DIRECTOR3D_REVERSE_MIGRATION_VERSION,
        restoredFrom: 'director-3d-split-mixed',
        status: 'idle',
      },
    },
    newEdge: {
      id: `e-${input.directorDeskId}-${newNodeId}-exec-3d`,
      source: input.directorDeskId,
      target: newNodeId,
      sourceHandle: 'exec-3d',
      targetHandle: 'exec-3d',
    },
  };
}

export function applySplitMixedDirector3dGraph(input: {
  nodes: Node[];
  edges: Edge[];
  result: SplitMixedDirector3dResult;
}): { nodes: Node[]; edges: Edge[] } {
  if (!input.result.ok) return { nodes: input.nodes, edges: input.edges };
  let nodes = input.nodes.map((node) => {
    if (node.id === input.result.directorDeskId && input.result.directorData) {
      return { ...node, data: input.result.directorData };
    }
    if (
      input.result.externalNodeId
      && node.id === input.result.externalNodeId
      && input.result.externalData
    ) {
      return { ...node, data: input.result.externalData };
    }
    return node;
  });
  if (input.result.newNode) {
    nodes = [...nodes, input.result.newNode as Node];
  }
  const edges = input.result.newEdge
    ? [...input.edges, input.result.newEdge as Edge]
    : input.edges;
  return { nodes, edges };
}

/** DD-D-11: 工作区加载时对 split-required 混装导演台做非破坏性自动拆分。 */
export function autoSplitMixedDirector3dGraph(input: {
  nodes: Node[];
  edges: Edge[];
}): { nodes: Node[]; edges: Edge[]; splitCount: number } {
  let nodes = input.nodes;
  let edges = input.edges;
  let splitCount = 0;
  for (let guard = 0; guard < 16; guard += 1) {
    const node = nodes.find(
      (item) => item.type === 'director-desk' && needsDirector3dSplit(item.type, record(item.data)),
    );
    if (!node) break;
    const result = splitMixedDirector3dNode({
      directorDeskId: node.id,
      nodes,
      edges,
    });
    if (!result.ok) break;
    const next = applySplitMixedDirector3dGraph({ nodes, edges, result });
    nodes = next.nodes;
    edges = next.edges;
    splitCount += 1;
  }
  return { nodes, edges, splitCount };
}
