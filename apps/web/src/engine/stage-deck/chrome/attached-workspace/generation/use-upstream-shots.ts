/**
 * use-upstream-shots — 视频生成等节点的上游镜头消费 hook。
 *
 * F-003 SSOT：只消费有连线的上游 storyboard-desk 的 chainStoryboard。
 * F-004：无入边 → 空列表；禁止回退全局 storyboard.shots。
 */
import { useMemo } from 'react';
import { useEdges, useNodes } from '@xyflow/react';
import { resolveUpstreamShotsFromGraph } from '@nx9/shared';

/**
 * 视频生成等节点：只消费「有连线」的上游镜头。
 * - 无入边 → 不展示本集镜表
 * - 有入边 → 仅解析连入节点的 chainStoryboard 中的镜头
 */
export function useUpstreamShots(blockId: string) {
  const nodes = useNodes();
  const edges = useEdges();

  return useMemo(
    () =>
      resolveUpstreamShotsFromGraph(
        blockId,
        nodes.map((n) => ({
          id: n.id,
          type: n.type,
          data: (n.data ?? {}) as Record<string, unknown>,
        })),
        edges.map((e) => ({ source: e.source, target: e.target })),
      ),
    [nodes, edges, blockId],
  );
}
