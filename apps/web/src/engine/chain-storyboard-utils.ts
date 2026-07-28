/**
 * chain-storyboard-utils.ts — 按链/按节点隔离的镜表读写门面（F-003）。
 *
 * SSOT：每个 storyboard-desk 节点的 data.chainStoryboard 持有本链镜头。
 * 所有写操作通过 updateNodeData 写入节点 data；所有读操作从上游 desk 节点 data 读取。
 * 禁止直接读写全局 useWorkspaceDocument.storyboard.shots（仅迁移缓冲）。
 */
import {
  readChainStoryboard,
  buildChainStoryboardPayload,
  patchChainShot as patchChainShotShared,
  activeChainEpisodeShots,
  migrateGlobalToChainStoryboard,
  type ChainStoryboardPayload,
  type StoryboardShot,
  type EpisodeMeta,
  type EpisodeExportRecord,
} from '@nx9/shared';
import type { Node } from '@xyflow/react';

/**
 * 从节点 data 中安全读取链镜表。
 */
export function readDeskChainStoryboard(
  nodeData: Record<string, unknown>,
): ChainStoryboardPayload | undefined {
  return readChainStoryboard(nodeData);
}

/**
 * 获取当前块可消费的上游链镜表。
 * 遍历入边，找到第一个 storyboard-desk 节点并读取其 chainStoryboard。
 */
export function resolveUpstreamChainDesk(
  nodeId: string,
  nodes: Node[],
  edges: Array<{ source: string; target: string }>,
): string | null {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const incoming = edges.filter((e) => e.target === nodeId);
  for (const edge of incoming) {
    const sourceNode = nodeMap.get(edge.source);
    if (!sourceNode) continue;
    const data = sourceNode.data as Record<string, unknown>;
    const chain = readChainStoryboard(data);
    if (chain) return sourceNode.id;
  }
  return null;
}

/**
 * 从上游 desk 读取链镜表。
 */
export function readUpstreamChainStoryboard(
  nodeId: string,
  nodes: Node[],
  edges: Array<{ source: string; target: string }>,
): ChainStoryboardPayload | undefined {
  const deskId = resolveUpstreamChainDesk(nodeId, nodes, edges);
  if (!deskId) return undefined;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const deskNode = nodeMap.get(deskId);
  if (!deskNode) return undefined;
  return readChainStoryboard(deskNode.data as Record<string, unknown>);
}

/**
 * 写入链镜表到 desk 节点 data。
 * @param updateNodeData - React Flow 的 updateNodeData 函数
 * @param deskId - storyboard-desk 节点 id
 * @param chain - 要写入的 ChainStoryboardPayload
 */
export function writeChainStoryboard(
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
  deskId: string,
  chain: ChainStoryboardPayload,
): void {
  updateNodeData(deskId, { chainStoryboard: chain } as Record<string, unknown>);
}

/**
 * 从下游节点向上游 desk 写入 shot patch。
 * 用于 DirectorDesk / ClipGenBlock / VideoWorkspace 等消费者节点。
 * 自动解析上游 desk → 读链 → patch shot → 写回。
 */
export function patchUpstreamShot(
  updateNodeDataFn: (id: string, data: Record<string, unknown>) => void,
  nodeId: string,
  nodes: Node[],
  edges: Array<{ source: string; target: string }>,
  shotId: string,
  patch: Partial<import('@nx9/shared').StoryboardShot>,
): boolean {
  const deskId = resolveUpstreamChainDesk(nodeId, nodes, edges);
  if (!deskId) return false;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const deskNode = nodeMap.get(deskId);
  if (!deskNode) return false;
  const chain = readChainStoryboard(deskNode.data as Record<string, unknown>);
  if (!chain) return false;
  const newShots = (chain.shots ?? []).map((s) =>
    s.id === shotId ? { ...s, ...patch } : s,
  );
  writeChainStoryboard(updateNodeDataFn, deskId, { ...chain, shots: newShots });
  return true;
}

/**
 * 在 desk 节点 data 中更新单个镜头。
 * @param updateNodeData - React Flow 的 updateNodeData 函数
 * @param deskId - storyboard-desk 节点 id
 * @param shotId - 镜头 id
 * @param patch - 要更新的 shot 字段
 */
export function patchChainShot(
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
  deskId: string,
  shotId: string,
  patch: Partial<StoryboardShot>,
): void {
  const getNode = (id: string) => {
    // 通过 React Flow 的 internal API 读取节点最新 data
    // 实际调用时外部应提供 nodes getter
    return undefined as Node | undefined;
  };
  // 此函数需要外部提供 nodes getter，推荐使用 useCallback 封装
  // 见 useChainStoryboardWrite hook
}

/**
 * Hook-friendly 的链镜表写入封装（在组件内使用）。
 * 返回 (deskId, shotId, patch) => void 的函数。
 */
export function createPatchChainShot(
  getNodes: () => Node[],
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
): (deskId: string, shotId: string, patch: Partial<StoryboardShot>) => void {
  return (deskId: string, shotId: string, patch: Partial<StoryboardShot>) => {
    const nodes = getNodes();
    const deskNode = nodes.find((n) => n.id === deskId);
    if (!deskNode) return;
    const existingChain = readChainStoryboard(deskNode.data as Record<string, unknown>);
    if (!existingChain) return;
    const newShots = patchChainShotShared(existingChain, shotId, patch);
    const updatedChain = buildChainStoryboardPayload(existingChain, { shots: newShots });
    updateNodeData(deskId, { chainStoryboard: updatedChain } as Record<string, unknown>);
  };
}

/**
 * 迁移全局 storyboard 到指定 desk 的 chainStoryboard。
 * 返回更新后的节点 data。
 */
export function migrateDeskFromGlobalStoryboard(
  globalStoryboard: {
    title?: string;
    activeEpisodeId?: string | null;
    episodes?: EpisodeMeta[];
    shots: StoryboardShot[];
    exportHistory?: EpisodeExportRecord[];
  },
  existingChain?: ChainStoryboardPayload,
): ChainStoryboardPayload {
  if (existingChain && existingChain.shots.length > 0) {
    return existingChain; // 已有链镜表，不覆盖
  }
  return migrateGlobalToChainStoryboard(globalStoryboard);
}

/**
 * 判断是否需要进行迁移：存在全局 storyboard.shots 但 desk 尚无 chainStoryboard。
 */
export function needsChainMigration(
  globalShotsCount: number,
  chain?: ChainStoryboardPayload,
): boolean {
  return globalShotsCount > 0 && (!chain || chain.shots.length === 0);
}

/**
 * F-003/F-004: 链优先的镜头读取函数。
 * 先从上游 chainStoryboard 读取；若无可读链，
 * 根据 allowGlobalFallback 决定是否回退全局 storyboard.shots。
 *
 * @param nodeId 当前块 id
 * @param nodes React Flow nodes
 * @param edges React Flow edges
 * @param allowGlobalFallback 是否允许回退全局镜表（缺省 false）
 * @returns 镜头数组（链优先）
 */
export function resolveShotsForBlock(
  nodeId: string,
  nodes: Node[],
  edges: Array<{ source: string; target: string }>,
  allowGlobalFallback = false,
): import('@nx9/shared').StoryboardShot[] {
  const chain = readUpstreamChainStoryboard(nodeId, nodes, edges);
  if (chain && chain.shots.length > 0) {
    return chain.shots;
  }
  if (allowGlobalFallback) {
    const { useWorkspaceDocument } = require('../stores/workspace-document');
    const globalShots = useWorkspaceDocument.getState().storyboard.shots;
    if (globalShots.length > 0) {
      console.warn(
        `[F-003] ${nodeId} 回退全局 storyboard.shots（${globalShots.length} 镜）。` +
        '建议迁移到链式读取。',
      );
    }
    return globalShots;
  }
  return [];
}
