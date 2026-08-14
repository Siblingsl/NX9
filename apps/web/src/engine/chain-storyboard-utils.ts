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
  CHAIN_STORYBOARD_HANDOFF_HASH_SCHEMA_VERSION,
  chainStoryboardHash,
  lineArtVersionHash,
  migrateGlobalToChainStoryboard,
  hygieneChainStoryboard,
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
  const visited = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    const incoming = edges.filter((e) => e.target === current);
    for (const edge of incoming) {
      const sourceNode = nodeMap.get(edge.source);
      if (!sourceNode) continue;
      const data = sourceNode.data as Record<string, unknown>;
      const chain = readChainStoryboard(data);
      if (chain) return sourceNode.id;
      if (
        sourceNode.type === 'storyboard-desk'
        || sourceNode.type === 'storyboard-preview'
        || sourceNode.type === 'story-grid'
      ) {
        return sourceNode.id;
      }
      if (sourceNode.type === 'director-desk' || sourceNode.type === 'director-3d') {
        queue.push(sourceNode.id);
      }
    }
  }
  return null;
}

export function resolveConnectedStoryboardDeskId(
  sourceId: string,
  nodes: Node[],
  edges: Array<{ source: string; target: string }>,
): string | null {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const connected = edges
    .filter((edge) => edge.source === sourceId)
    .map((edge) => nodeMap.get(edge.target))
    .filter((node): node is Node => node?.type === 'storyboard-desk');
  const matchingHandoff = connected.find((node) => {
    const handoff = (node.data as Record<string, unknown> | undefined)?.handoff as Record<string, unknown> | undefined;
    return handoff?.sourceScriptBlockId === sourceId;
  });
  return (matchingHandoff ?? connected[0])?.id ?? null;
}

/**
 * 沿出边找到本分镜台下游的导演台节点 id（SB-D-01）。
 * 多链并存时只认「从本节点出发可达」的 director-desk，禁止全画布 find 第一个。
 */
export function resolveDownstreamDirectorDeskId(
  sourceId: string,
  nodes: Node[],
  edges: Array<{ source: string; target: string }>,
): string | null {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const queue = [sourceId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    const outgoing = edges.filter((e) => e.source === current);
    for (const edge of outgoing) {
      const targetNode = nodeMap.get(edge.target);
      if (!targetNode) continue;
      if (targetNode.type === 'director-desk') return targetNode.id;
      if (targetNode.type !== 'storyboard-desk' && targetNode.type !== 'storyboard-preview' && targetNode.type !== 'grid-split') {
        queue.push(targetNode.id);
      }
    }
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
  getLatestNodes?: () => Node[],
  updateNodeDataAtomically?: (id: string, updater: (node: Node) => Record<string, unknown>) => void,
): boolean {
  const currentNodes = getLatestNodes?.() ?? nodes;
  const deskId = resolveUpstreamChainDesk(nodeId, currentNodes, edges);
  if (!deskId) return false;
  const nodeMap = new Map(currentNodes.map((n) => [n.id, n]));
  const deskNode = nodeMap.get(deskId);
  if (!deskNode) return false;
  const chain = readChainStoryboard(deskNode.data as Record<string, unknown>);
  if (!chain) return false;
  if (updateNodeDataAtomically) {
    updateNodeDataAtomically(deskId, (node) => {
      const latestChain = readChainStoryboard(node.data as Record<string, unknown>);
      if (!latestChain) return {};
      return {
        chainStoryboard: {
          ...latestChain,
          shots: latestChain.shots.map((shot) =>
            shot.id === shotId ? { ...shot, ...patch } : shot,
          ),
        },
      };
    });
    return true;
  }
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
 * 首次读取旧 desk 时，将旧全局镜表迁移到该 desk 的链镜表。
 * 迁移后只返回 chainStoryboard，不再让调用方继续消费全局镜表。
 */
export function migrateUpstreamChainStoryboard(
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
  nodeId: string,
  nodes: Node[],
  edges: Array<{ source: string; target: string }>,
  globalStoryboard: {
    title?: string;
    activeEpisodeId?: string | null;
    episodes?: EpisodeMeta[];
    shots: StoryboardShot[];
    exportHistory?: EpisodeExportRecord[];
  },
  now = new Date().toISOString(),
): boolean {
  if (globalStoryboard.shots.length === 0) return false;
  const deskId = resolveUpstreamChainDesk(nodeId, nodes, edges);
  if (!deskId) return false;
  const deskNode = nodes.find((node) => node.id === deskId);
  if (!deskNode) return false;
  const data = deskNode.data as Record<string, unknown>;
  if (readChainStoryboard(data)) return false;
  updateNodeData(deskId, {
    chainStoryboard: migrateDeskFromGlobalStoryboard(globalStoryboard),
    storyboardSchemaVersion: 1,
    migratedFromGlobalStoryboard: true,
    migratedAt: now,
  });
  return true;
}

/**
 * 把读时清洗（线稿污染 / Data URL 3D 截图）写回 chain，避免脏字段一直躺在工作区 JSON。
 */
export function persistChainStoryboardHygiene(
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
  deskId: string,
  nodeData: Record<string, unknown>,
): { migratedCount: number; quarantinedCount: number } {
  const raw = nodeData.chainStoryboard as ChainStoryboardPayload | undefined;
  if (!raw || !Array.isArray(raw.shots)) {
    return { migratedCount: 0, quarantinedCount: 0 };
  }
  const result = hygieneChainStoryboard(raw);
  if (
    result.migratedCount === 0
    && result.quarantinedCount === 0
    && result.chain.mediaRoleSchemaVersion === raw.mediaRoleSchemaVersion
  ) {
    return { migratedCount: 0, quarantinedCount: 0 };
  }
  updateNodeData(deskId, { chainStoryboard: result.chain });
  return {
    migratedCount: result.migratedCount,
    quarantinedCount: result.quarantinedCount,
  };
}

export function persistUpstreamChainHygiene(
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
  nodeId: string,
  nodes: Node[],
  edges: Array<{ source: string; target: string }>,
): boolean {
  const deskId = resolveUpstreamChainDesk(nodeId, nodes, edges);
  if (!deskId) return false;
  const deskNode = nodes.find((node) => node.id === deskId);
  if (!deskNode) return false;
  const result = persistChainStoryboardHygiene(
    updateNodeData,
    deskId,
    deskNode.data as Record<string, unknown>,
  );
  return result.migratedCount > 0 || result.quarantinedCount > 0;
}

export function validateDirectorHandoff(input: {
  handoff: Record<string, unknown> | undefined;
  chain: ChainStoryboardPayload | undefined;
  episodeId: string | undefined;
  scriptHash: string | undefined;
}): { valid: boolean; reason: string } {
  const { handoff, chain, episodeId, scriptHash } = input;
  if (!handoff || !chain || !episodeId) return { valid: false, reason: '缺少交接数据' };
  if (handoff.hashSchemaVersion !== CHAIN_STORYBOARD_HANDOFF_HASH_SCHEMA_VERSION) {
    return { valid: false, reason: '交接哈希版本过旧' };
  }
  if (handoff.episodeId !== episodeId) {
    return { valid: false, reason: '交接集不匹配' };
  }
  const checks = [
    ['scriptHash', handoff.scriptHash, scriptHash],
    ['storyboardHash', handoff.storyboardHash, chainStoryboardHash(chain, episodeId)],
    ['lineartVersion', handoff.lineartVersion, lineArtVersionHash(chain, episodeId)],
  ] as const;
  const mismatch = checks.find(([, expected, actual]) => !expected || !actual || expected !== actual);
  if (mismatch) return { valid: false, reason: `交接${mismatch[0]}不匹配` };
  if (!Number.isInteger(handoff.handoffVersion) || Number(handoff.handoffVersion) < 1) {
    return { valid: false, reason: '交接版本无效' };
  }
  if (typeof handoff.confirmedAt !== 'string' || !handoff.confirmedAt) {
    return { valid: false, reason: '交接确认时间缺失' };
  }
  if (!chain.shots.some((shot) => shot.episodeId === episodeId)) {
    return { valid: false, reason: '交接集不存在' };
  }
  return { valid: true, reason: '' };
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
