import type { Node } from '@xyflow/react';
import type { FlowBlock, StoryboardShot } from '@nx9/shared';
import { buildCharacterContext } from '@nx9/shared';
import { patchUpstreamShot } from '../chain-storyboard-utils';
import { useWorkspaceDocument } from '../../stores/workspace-document';

/** F-003/F-004: 双写——先写上游链，再写全局 store */
export function patchFlowShot(
  blockId: string,
  shotId: string,
  patch: Partial<StoryboardShot>,
  updateNodeData?: (id: string, data: Record<string, unknown>) => void,
  nodes?: Node[],
  edges?: Array<{ source: string; target: string }>,
): void {
  // F-003: 仅写链镜表，禁止回退全局
  if (updateNodeData && nodes && edges) {
    patchUpstreamShot(updateNodeData, blockId, nodes, edges, shotId, patch);
  }
}

export function linkedShotForBlock(
  blockId: string,
  data: Record<string, unknown>,
  nodes?: Node[],
  edges?: Array<{ source: string; target: string }>,
): StoryboardShot | undefined {
  // F-004: 优先从上游 chainStoryboard 读取
  if (nodes && edges) {
    const incoming = edges.filter((e) => e.target === blockId);
    for (const edge of incoming) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (!sourceNode) continue;
      const chain = (sourceNode.data as Record<string, unknown>)?.chainStoryboard as { shots?: StoryboardShot[] } | undefined;
      if (chain?.shots) {
        const linkedShotId = data.linkedShotId as string | undefined;
        return chain.shots.find((s) => s.id === linkedShotId || (s as any).linkedBlockId === blockId);
      }
    }
  }
  // F-003: 无上游链时不降级全局
  return undefined;
}

export function characterContextForBlock(
  block: FlowBlock,
  upstreamPictures: string[] = [],
) {
  const d = block.data ?? {};
  const shot = linkedShotForBlock(block.id, d);
  const library = useWorkspaceDocument.getState().characters.characters;
  return buildCharacterContext(d, shot, library, upstreamPictures);
}
