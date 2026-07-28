/**
 * chain-storyboard-aggregate — F-003 链镜表聚合工具。
 *
 * 替代全局 `useWorkspaceDocument.getState().storyboard.shots` 的散落读取，
 * 改为从各 storyboard-desk 节点的 data.chainStoryboard 聚合。
 * 默认不回退全局；仅显式 allowGlobalFallback 时用于旧档迁移。
 */
import { readChainStoryboard, type StoryboardShot } from '@nx9/shared';
import { useWorkspaceDocument } from '../stores/workspace-document';

interface ChainNode {
  id: string;
  type?: string | null;
  data?: Record<string, unknown>;
}

export type ChainAggregateOpts = {
  /** 无任何链数据时是否回退全局（默认 false） */
  allowGlobalFallback?: boolean;
};

function hasAnyChainData(nodes: ChainNode[]): boolean {
  return nodes.some(
    (node) =>
      node.type === 'storyboard-desk' && Boolean(readChainStoryboard(node.data ?? {})),
  );
}

/** F-003: 从所有 storyboard-desk 节点聚合链镜表 */
export function getAllChainShots(
  nodes: ChainNode[],
  opts?: ChainAggregateOpts,
): StoryboardShot[] {
  const byId = new Map<string, StoryboardShot>();
  let hasChainData = false;

  for (const node of nodes) {
    if (node.type === 'storyboard-desk') {
      const chain = readChainStoryboard(node.data ?? {});
      if (chain) {
        hasChainData = true;
        for (const shot of chain.shots) {
          if (!byId.has(shot.id)) byId.set(shot.id, shot);
        }
      }
    }
  }

  if (hasChainData) {
    return [...byId.values()].sort((a, b) => a.index - b.index);
  }

  if (opts?.allowGlobalFallback) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[F-003] getAllChainShots 回退全局 storyboard.shots（迁移兼容）');
    }
    return useWorkspaceDocument.getState().storyboard.shots ?? [];
  }
  return [];
}

/** F-003: 按 shotId 跨 desk 查找镜头 */
export function findChainShot(
  shotId: string,
  nodes: ChainNode[],
  opts?: ChainAggregateOpts,
): StoryboardShot | undefined {
  for (const node of nodes) {
    if (node.type === 'storyboard-desk') {
      const chain = readChainStoryboard(node.data ?? {});
      if (chain) {
        const shot = chain.shots.find((s) => s.id === shotId);
        if (shot) return shot;
      }
    }
  }
  if (hasAnyChainData(nodes) && !opts?.allowGlobalFallback) return undefined;
  if (!opts?.allowGlobalFallback) return undefined;
  return useWorkspaceDocument.getState().storyboard.shots?.find((s) => s.id === shotId);
}

/** F-003: 按 linkedBlockId 跨 desk 查找镜头 */
export function findChainShotByBlockId(
  linkedBlockId: string,
  nodes: ChainNode[],
  opts?: ChainAggregateOpts,
): StoryboardShot | undefined {
  for (const node of nodes) {
    if (node.type === 'storyboard-desk') {
      const chain = readChainStoryboard(node.data ?? {});
      if (chain) {
        const shot = chain.shots.find((s) => s.linkedBlockId === linkedBlockId);
        if (shot) return shot;
      }
    }
  }
  if (hasAnyChainData(nodes) && !opts?.allowGlobalFallback) return undefined;
  if (!opts?.allowGlobalFallback) return undefined;
  return useWorkspaceDocument.getState().storyboard.shots?.find(
    (s) => s.linkedBlockId === linkedBlockId,
  );
}

/** F-003: 检查是否有 shot 关联到指定 blockId */
export function someChainShotLinked(
  blockId: string,
  nodes: ChainNode[],
  opts?: ChainAggregateOpts,
): boolean {
  for (const node of nodes) {
    if (node.type === 'storyboard-desk') {
      const chain = readChainStoryboard(node.data ?? {});
      if (chain) {
        if (chain.shots.some((s) => s.linkedBlockId === blockId)) return true;
      }
    }
  }
  if (hasAnyChainData(nodes) && !opts?.allowGlobalFallback) return false;
  if (!opts?.allowGlobalFallback) return false;
  return (
    useWorkspaceDocument.getState().storyboard.shots?.some(
      (s) => s.linkedBlockId === blockId,
    ) ?? false
  );
}

/** 查找持有指定 shotId 的 storyboard-desk id */
export function findDeskIdForShot(shotId: string, nodes: ChainNode[]): string | null {
  for (const node of nodes) {
    if (node.type !== 'storyboard-desk') continue;
    const chain = readChainStoryboard(node.data ?? {});
    if (chain?.shots.some((s) => s.id === shotId)) return node.id;
  }
  return null;
}
