import { useNodesData } from '@xyflow/react';

const EMPTY: Record<string, unknown> = {};

/** 订阅节点 data 变更，避免 getNode() 不触发重渲染 */
export function useAttachedNodeData(blockId: string): Record<string, unknown> {
  const node = useNodesData(blockId);
  return (node?.data ?? EMPTY) as Record<string, unknown>;
}
