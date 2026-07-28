/**
 * use-chain-storyboard — 链镜表读写 Hook（F-003）。
 *
 * 替代 StoryboardDeskBlock 中的 useWorkspaceDocument 全局写路径。
 * 所有写操作通过 updateNodeData 写入节点 data.chainStoryboard。
 */
import { useCallback, useMemo } from 'react';
import { useEdges, useNodes, useReactFlow } from '@xyflow/react';
import {
  readChainStoryboard,
  buildChainStoryboardPayload,
  activeChainEpisodeShots,
  type ChainStoryboardPayload,
  type StoryboardShot,
  type EpisodeMeta,
  type EpisodeExportRecord,
} from '@nx9/shared';

export function useChainStoryboard(blockId: string) {
  const { updateNodeData, getNodes } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();

  const chain = useMemo(() => {
    const node = nodes.find((n) => n.id === blockId);
    if (!node) return undefined;
    return readChainStoryboard(node.data as Record<string, unknown>);
  }, [nodes, blockId]);

  const writeChain = useCallback(
    (updater: (prev: ChainStoryboardPayload) => ChainStoryboardPayload) => {
      const currentNode = getNodes().find((n) => n.id === blockId);
      if (!currentNode) return;
      const existing = readChainStoryboard(currentNode.data as Record<string, unknown>);
      const next = updater(existing ?? buildChainStoryboardPayload(undefined, { shots: [] }));
      updateNodeData(blockId, { chainStoryboard: next } as Record<string, unknown>);
    },
    [blockId, updateNodeData, getNodes],
  );

  const patchShot = useCallback(
    (shotId: string, patch: Partial<StoryboardShot>) => {
      writeChain((prev) => ({
        ...prev,
        shots: prev.shots.map((s) => (s.id === shotId ? { ...s, ...patch } : s)),
      }));
    },
    [writeChain],
  );

  const addShots = useCallback(
    (shots: StoryboardShot[], mode: 'append' | 'replace' = 'append') => {
      writeChain((prev) => ({
        ...prev,
        shots: mode === 'replace'
          ? shots
          : [...prev.shots, ...shots].sort((a, b) => a.index - b.index),
      }));
    },
    [writeChain],
  );

  const removeShot = useCallback(
    (shotId: string) => {
      writeChain((prev) => ({
        ...prev,
        shots: prev.shots.filter((s) => s.id !== shotId),
      }));
    },
    [writeChain],
  );

  const activeShots = useMemo(
    () => (chain ? activeChainEpisodeShots(chain) : []),
    [chain],
  );

  return {
    chain,
    shots: chain?.shots ?? [],
    activeShots,
    writeChain,
    patchShot,
    addShots,
    removeShot,
  };
}
