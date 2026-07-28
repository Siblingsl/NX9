import type { Node, Edge } from '@xyflow/react';

interface BatchOptsParams {
  blockId: string;
  skipExisting: boolean;
  skipApproved: boolean;
  concurrency: number;
  maxRetries: number;
  forceCharacterRef: boolean;
  forceSceneRef: boolean;
  styleLock: boolean;
  prefer3dRef: boolean;
  stylePrompt: string;
  styleSeed: number | null;
  pictureNodeData: Record<string, unknown> | undefined;
  blockData: Record<string, unknown>;
  nodes: Node[];
  edges: Edge[];
}

export function buildBatchOpts(params: BatchOptsParams) {
  let enforceComp = false;
  for (const edge of params.edges) {
    if (edge.target !== params.blockId) continue;
    const src = params.nodes.find((n) => n.id === edge.source);
    if (src && (src.data as Record<string, unknown>)?.enforceComposition === true) {
      enforceComp = true;
      break;
    }
  }
  return {
    skipExisting: params.skipExisting,
    skipApproved: params.skipApproved,
    concurrency: params.concurrency,
    maxRetries: params.maxRetries,
    forceCharacterRef: params.forceCharacterRef,
    forceSceneRef: params.forceSceneRef,
    styleLock: params.styleLock,
    prefer3dRef: params.prefer3dRef,
    stylePrompt: params.stylePrompt || undefined,
    styleSeed: params.styleSeed != null && Number.isFinite(params.styleSeed) ? params.styleSeed : null,
    pictureNodeData: (params.pictureNodeData ?? {}) as Record<string, unknown>,
    blockData: params.blockData,
    enforceComposition: enforceComp,
  };
}
