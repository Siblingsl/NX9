import type { Edge, Node } from '@xyflow/react';
import { getSpawnableBlocks, resolveAccepts, resolveEmits, lookupBlock } from '@nx9/shared';
import { runFlowBatch, RUNNABLE_BLOCKS, type RunProgress } from '../../flow-runner';
import {
  clearCascadeEdges,
  collectCascadeChain,
  markCascadeEdge,
} from '../utils/upstream-graph';
import {
  findLoopIteratorInChain,
  runCascadeWithLoop,
} from './loop-executor';

export interface CascadeRunOptions {
  blockId: string;
  nodes: Node[];
  edges: Edge[];
  getNodes?: () => Node[];
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  onProgress?: (p: RunProgress) => void;
  signal?: { cancelled: boolean };
}

/** Run upstream topological chain ending at blockId (inclusive) */
export async function runCascadeFromBlock(options: CascadeRunOptions): Promise<void> {
  const {
    blockId,
    nodes,
    edges,
    getNodes,
    setEdges,
    updateNodeData,
    onProgress,
    signal,
  } = options;

  const loopIterator = findLoopIteratorInChain(blockId, nodes, edges);
  if (loopIterator) {
    await runCascadeWithLoop({
      blockId,
      iteratorId: loopIterator.id,
      nodes,
      edges,
      getNodes,
      setEdges,
      updateNodeData,
      onProgress,
      signal,
    });
    return;
  }

  const chain = collectCascadeChain(blockId, edges);
  const runnableChain = new Set(
    [...chain].filter((id) => {
      const n = nodes.find((node) => node.id === id);
      return n?.type && RUNNABLE_BLOCKS.has(n.type);
    }),
  );

  if (runnableChain.size === 0) return;

  const wrappedUpdate = (id: string, data: Record<string, unknown>) => {
    if (data.status === 'running') {
      setEdges((prev) => markCascadeEdge(prev, id, chain));
    }
    updateNodeData(id, data);
  };

  try {
    await runFlowBatch(
      nodes,
      edges,
      wrappedUpdate,
      (p) => {
        if (p.currentId) {
          setEdges((prev) => markCascadeEdge(prev, p.currentId!, chain));
        }
        onProgress?.(p);
      },
      signal,
      runnableChain,
    );
  } finally {
    setEdges((prev) => clearCascadeEdges(prev));
  }
}

/**
 * EPIC-W01: 仅重跑某节点及其下游链（不含上游），用于上游变更后刷新 stale 下游。
 */
export async function runDownstreamFromBlock(options: CascadeRunOptions): Promise<void> {
  const { blockId, nodes, edges, setEdges, updateNodeData, onProgress, signal } = options;

  const scope = new Set<string>([blockId]);
  const queue = [blockId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const e of edges) {
      if (e.source === id && !scope.has(e.target)) {
        scope.add(e.target);
        queue.push(e.target);
      }
    }
  }

  const runnable = new Set(
    [...scope].filter((id) => {
      const n = nodes.find((node) => node.id === id);
      return n?.type && RUNNABLE_BLOCKS.has(n.type);
    }),
  );
  if (runnable.size === 0) return;

  const wrappedUpdate = (id: string, data: Record<string, unknown>) => {
    if (data.status === 'running') {
      setEdges((prev) => markCascadeEdge(prev, id, scope));
    }
    updateNodeData(id, data);
  };

  try {
    await runFlowBatch(
      nodes,
      edges,
      wrappedUpdate,
      (p) => {
        if (p.currentId) {
          setEdges((prev) => markCascadeEdge(prev, p.currentId!, scope));
        }
        onProgress?.(p);
      },
      signal,
      runnable,
    );
  } finally {
    setEdges((prev) => clearCascadeEdges(prev));
  }
}

/** @deprecated use filterBlocksForWireDrop from wire-drop.ts */
export function filterBlockKindsForHandle(
  sourceHandle: string | null | undefined,
  sourceType: string,
  sourceData?: Record<string, unknown>,
): string[] {
  const handleKind = (sourceHandle ??
    resolveEmits(sourceType, sourceData)[0] ??
    'prompt') as import('@nx9/shared').SocketKind;
  return getSpawnableBlocks()
    .filter((def) => {
      if (sourceType === def.kind && sourceType !== 'passthrough') return false;
      const accepts = resolveAccepts(def.kind);
      return accepts.includes('wildcard') || accepts.includes(handleKind);
    })
    .map((d) => d.kind);
}

export function blockLabel(kind: string): string {
  return lookupBlock(kind)?.label ?? kind;
}
