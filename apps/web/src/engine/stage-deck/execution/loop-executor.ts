import type { Edge, Node } from '@xyflow/react';
import { runFlowBatch, RUNNABLE_BLOCKS, type RunProgress } from '../../flow-runner';
import { collectCascadeChain } from '../utils/upstream-graph';
import {
  clearCascadeEdges,
  markCascadeEdge,
} from '../utils/upstream-graph';

export type LoopMode = 'serial' | 'parallel';

export interface LoopConfig {
  loopMode: LoopMode;
  loopCount: number;
  loopVariants: string[];
  effectiveRounds: number;
}

export function parseLoopVariants(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function getLoopConfig(node: Node): LoopConfig {
  const d = node.data ?? {};
  const loopMode: LoopMode = d.loopMode === 'parallel' ? 'parallel' : 'serial';
  const loopCount = Math.max(1, Math.min(99, Number(d.loopCount) || 1));
  const loopVariants = parseLoopVariants(d.loopVariants);
  const effectiveRounds = Math.max(loopCount, loopVariants.length > 0 ? loopVariants.length : 1);
  return { loopMode, loopCount, loopVariants, effectiveRounds };
}

/** Downstream nodes within scope, not including root */
export function collectDownstreamWithin(
  rootId: string,
  scope: Set<string>,
  edges: Edge[],
): Set<string> {
  const out = new Set<string>();
  const queue = [rootId];
  const seen = new Set<string>([rootId]);

  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const edge of edges) {
      if (edge.source !== id || !scope.has(edge.target) || seen.has(edge.target)) continue;
      seen.add(edge.target);
      out.add(edge.target);
      queue.push(edge.target);
    }
  }

  return out;
}

function downstreamReachable(fromId: string, toId: string, edges: Edge[]): boolean {
  const queue = [fromId];
  const seen = new Set<string>([fromId]);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (id === toId) return true;
    for (const edge of edges) {
      if (edge.source !== id || seen.has(edge.target)) continue;
      seen.add(edge.target);
      queue.push(edge.target);
    }
  }
  return false;
}

/** Closest iterator upstream of blockId inside cascade chain */
export function findLoopIteratorInChain(
  blockId: string,
  nodes: Node[],
  edges: Edge[],
): Node | null {
  const chain = collectCascadeChain(blockId, edges);
  const iterators = nodes.filter((n) => n.type === 'iterator' && chain.has(n.id));
  if (iterators.length === 0) return null;

  let best: Node | null = null;
  let bestScore = -1;
  for (const it of iterators) {
    if (!downstreamReachable(it.id, blockId, edges) && it.id !== blockId) continue;
    const cfg = getLoopConfig(it);
    if (cfg.effectiveRounds <= 1 && cfg.loopVariants.length === 0) continue;
    const score = downstreamDistance(it.id, blockId, edges);
    if (score > bestScore) {
      bestScore = score;
      best = it;
    }
  }
  return best;
}

function downstreamDistance(fromId: string, toId: string, edges: Edge[]): number {
  const queue: Array<{ id: string; dist: number }> = [{ id: fromId, dist: 0 }];
  const seen = new Set<string>([fromId]);

  while (queue.length > 0) {
    const { id, dist } = queue.shift()!;
    if (id === toId) return dist;
    for (const edge of edges) {
      if (edge.source !== id || seen.has(edge.target)) continue;
      seen.add(edge.target);
      queue.push({ id: edge.target, dist: dist + 1 });
    }
  }
  return fromId === toId ? 0 : -1;
}

function iteratorPool(node: Node): string[] {
  const d = node.data ?? {};
  const pool = (d.iterItems as string[]) ?? [];
  if (pool.length > 0) return pool;
  const single = (d.content as string) || (d.output as string) || '';
  return single ? [single] : [];
}

function applyLoopVariant(
  downstreamIds: Set<string>,
  nodes: Node[],
  variant: string,
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
): () => void {
  const trimmed = variant.trim();
  if (!trimmed) return () => {};

  const backups = new Map<string, Record<string, unknown>>();
  for (const id of downstreamIds) {
    const node = nodes.find((n) => n.id === id);
    if (!node?.type || !RUNNABLE_BLOCKS.has(node.type)) continue;
    const d = node.data ?? {};
    const isSound = node.type === 'sound-gen';
    const key = isSound ? 'text' : 'content';
    const prev = (d[key] as string) ?? '';
    backups.set(id, { [key]: prev });
    updateNodeData(id, { [key]: prev ? `${prev}\n\n${trimmed}` : trimmed });
  }

  return () => {
    for (const [id, patch] of backups) {
      updateNodeData(id, patch);
    }
  };
}

export interface LoopCascadeOptions {
  blockId: string;
  iteratorId: string;
  nodes: Node[];
  edges: Edge[];
  getNodes?: () => Node[];
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  onProgress?: (p: RunProgress) => void;
  signal?: { cancelled: boolean };
}

async function runPostLoopRound(
  options: LoopCascadeOptions & {
    round: number;
    downstream: Set<string>;
    chain: Set<string>;
    config: LoopConfig;
    iteratorNode: Node;
    nodesSnapshot: Node[];
  },
): Promise<void> {
  const {
    round,
    downstream,
    chain,
    config,
    iteratorNode,
    nodesSnapshot,
    edges,
    setEdges,
    updateNodeData,
    onProgress,
    signal,
  } = options;

  const pool = iteratorPool(iteratorNode);
  const idx = pool.length > 0 ? round % pool.length : 0;
  const item = pool[idx] ?? '';
  const variant = config.loopVariants[round] ?? '';

  updateNodeData(iteratorNode.id, {
    currentIndex: idx,
    iterItems: pool,
    content: item,
    output: item,
    loopRound: round + 1,
    status: 'success',
  });

  const nodesAfterIter = nodesSnapshot.map((n) =>
    n.id === iteratorNode.id
      ? {
          ...n,
          data: {
            ...n.data,
            currentIndex: idx,
            iterItems: pool,
            content: item,
            output: item,
            loopRound: round + 1,
            status: 'success',
          },
        }
      : n,
  );

  const restoreVariant = applyLoopVariant(downstream, nodesAfterIter, variant, updateNodeData);

  const wrappedUpdate = (id: string, data: Record<string, unknown>) => {
    if (data.status === 'running') {
      setEdges((prev) => markCascadeEdge(prev, id, chain));
    }
    updateNodeData(id, data);
  };

  try {
    await runFlowBatch(
      nodesAfterIter,
      edges,
      wrappedUpdate,
      onProgress ?? (() => {}),
      signal,
      downstream,
    );
  } finally {
    restoreVariant();
    setEdges((prev) => clearCascadeEdges(prev));
  }
}

/** Run cascade chain with iterator loop rounds on downstream subgraph */
export async function runCascadeWithLoop(options: LoopCascadeOptions): Promise<void> {
  const {
    blockId,
    iteratorId,
    nodes,
    edges,
    getNodes,
    setEdges,
    updateNodeData,
    onProgress,
    signal,
  } = options;

  const readNodes = getNodes ?? (() => nodes);
  const iteratorNode = readNodes().find((n) => n.id === iteratorId);
  if (!iteratorNode) return;

  const config = getLoopConfig(iteratorNode);
  const chain = collectCascadeChain(blockId, edges);
  const downstream = collectDownstreamWithin(iteratorId, chain, edges);
  if (downstream.size === 0) return;

  const preChain = new Set([...chain].filter((id) => !downstream.has(id)));

  const wrappedPreUpdate = (id: string, data: Record<string, unknown>) => {
    if (data.status === 'running') {
      setEdges((prev) => markCascadeEdge(prev, id, chain));
    }
    updateNodeData(id, data);
  };

  await runFlowBatch(
    readNodes(),
    edges,
    wrappedPreUpdate,
    onProgress ?? (() => {}),
    signal,
    preChain,
  );
  setEdges((prev) => clearCascadeEdges(prev));

  if (signal?.cancelled) return;

  const runRound = async (round: number) => {
    const iterNode = readNodes().find((n) => n.id === iteratorId);
    if (!iterNode) return;
    await runPostLoopRound({
      ...options,
      round,
      downstream,
      chain,
      config,
      iteratorNode: iterNode,
      nodesSnapshot: readNodes(),
    });
  };

  if (config.loopMode === 'parallel' && config.effectiveRounds > 1) {
    for (let round = 0; round < config.effectiveRounds; round++) {
      if (signal?.cancelled) return;
      await runRound(round);
    }
  } else {
    for (let round = 0; round < config.effectiveRounds; round++) {
      if (signal?.cancelled) return;
      await runRound(round);
    }
  }
}
