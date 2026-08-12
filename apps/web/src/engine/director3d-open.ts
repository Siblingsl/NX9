import { normalizeDirectorProject } from '@nx9/director3d';
import { useDirector3dUi } from '../stores/director3d-ui';
import {
  resolveDirector3dHostContext,
  type Director3dHostEdge,
} from './director3d-host-controller';

type FlowNode = {
  id: string;
  type?: string | null;
  data?: Record<string, unknown> | unknown;
};

export interface Director3dOpenContext {
  blockId: string;
  nodes: FlowNode[];
  edges: Director3dHostEdge[];
  updateNodeData?: (id: string, patch: Record<string, unknown>) => void;
  frameIdOverride?: string | null;
}

/**
 * 打开全屏容器。上下游、episode、shot、线稿和存储节点均由唯一 host resolver 决定。
 */
export function openDirector3dStage(ctx: Director3dOpenContext): void {
  const nodes = ctx.nodes as import('@xyflow/react').Node[];
  const resolved = resolveDirector3dHostContext({
    contextBlockId: ctx.blockId,
    requestedPreviewFrameId: ctx.frameIdOverride,
    nodes,
    edges: ctx.edges,
  });
  const storageNode = nodes.find(
    (node) => node.id === resolved.storageBlockId,
  );
  const storageData = (storageNode?.data ?? {}) as Record<string, unknown>;
  const embeddedData =
    resolved.storageMode === 'embedded-director'
      ? ((storageData.director3d as Record<string, unknown> | undefined) ?? {})
      : storageData;
  const project = normalizeDirectorProject(
    embeddedData.standaloneProject ??
      embeddedData.scene ??
      storageData.scene,
  );

  ctx.updateNodeData?.(resolved.storageBlockId, {
    activeShotId: resolved.activeShotId,
    linkedShotId: resolved.activeShotId,
    linkedStoryboardPreviewId: resolved.sourceChainDeskId ?? null,
    linkedStoryboardPreviewFrameId: resolved.previewFrameId ?? null,
  });

  useDirector3dUi.getState().openForBlock(
    ctx.blockId,
    project,
    resolved.activeShotId ?? undefined,
    resolved.sourceChainDeskId && resolved.previewFrameId
      ? {
          previewBlockId: resolved.sourceChainDeskId,
          frameId: resolved.previewFrameId,
        }
      : undefined,
  );
  useDirector3dUi
    .getState()
    .setHostBridge(
      resolved.panoramaUrl ??
        (resolved.activeShotId
          ? resolved.lineArtByShotId[resolved.activeShotId]
          : null) ??
        null,
    );
}
