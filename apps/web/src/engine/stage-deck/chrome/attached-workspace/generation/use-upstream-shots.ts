import { useMemo } from 'react';
import { useEdges, useNodes } from '@xyflow/react';
import {
  activeEpisodeShots,
  gatherUpstream,
  type StoryboardShot,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../../../../../stores/workspace-document';

function isDirectorSourceKind(kind?: string | null): boolean {
  return kind === 'director-desk';
}

/**
 * 视频生成等节点：只消费「有连线」的上游镜头。
 * - 无入边 → 不展示本集镜表
 * - 有入边 → 仅解析连入节点上的镜头 id / 关键帧图匹配 / 导演台本集有关键帧镜
 */
export function useUpstreamShots(blockId: string) {
  const nodes = useNodes();
  const edges = useEdges();
  const storyboard = useWorkspaceDocument((state) => state.storyboard);

  return useMemo(() => {
    const incoming = edges.filter(
      (edge) => edge.target === blockId && nodes.some((node) => node.id === edge.source),
    );
    if (incoming.length === 0) {
      return {
        hasUpstream: false,
        shots: [] as StoryboardShot[],
        shotIds: [] as string[],
      };
    }

    const flowBlocks = nodes.map((node) => ({
      id: node.id,
      type: node.type ?? 'prompt',
      position: node.position,
      data: (node.data ?? {}) as Record<string, unknown>,
    }));
    const flowLinks = incoming.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined,
    }));
    const upstream = gatherUpstream(blockId, flowBlocks, flowLinks);
    const idSet = new Set<string>(upstream.shotIds ?? []);

    const sourceNodes = incoming
      .map((edge) => nodes.find((node) => node.id === edge.source))
      .filter((node): node is (typeof nodes)[number] => Boolean(node));

    const hasDirector = sourceNodes.some((node) => isDirectorSourceKind(node.type));
    if (hasDirector && idSet.size === 0) {
      for (const shot of activeEpisodeShots(storyboard)) {
        if (shot.firstFrameAssetId) idSet.add(shot.id);
      }
    }

    const pictureUrls = new Set((upstream.pictures ?? []).filter(Boolean));
    if (pictureUrls.size > 0) {
      for (const shot of storyboard.shots) {
        if (
          (shot.firstFrameAssetId && pictureUrls.has(shot.firstFrameAssetId)) ||
          (shot.lastFrameAssetId && pictureUrls.has(shot.lastFrameAssetId))
        ) {
          idSet.add(shot.id);
        }
      }
    }

    const byId = new Map(storyboard.shots.map((shot) => [shot.id, shot]));
    const shots = [...idSet]
      .map((id) => byId.get(id))
      .filter((shot): shot is StoryboardShot => Boolean(shot))
      .sort((a, b) => a.index - b.index);

    return {
      hasUpstream: true,
      shots,
      shotIds: shots.map((shot) => shot.id),
    };
  }, [nodes, edges, blockId, storyboard]);
}
