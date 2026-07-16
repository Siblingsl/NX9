import {
  emptyStoryboardPreview,
  resolveConnectedStoryboardPreviewForDirector3dId,
  type StoryboardPreviewPayload,
} from '@nx9/shared';
import { normalizeDirectorProject, type DirectorProject } from '@nx9/director3d';
import { useDirector3dUi } from '../stores/director3d-ui';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { prepareDirectorProjectForShot } from './director3d-character-sync';

type FlowNode = { id: string; type?: string | null; data?: Record<string, unknown> | unknown };
type FlowEdge = { source: string; target: string };

export interface Director3dOpenContext {
  blockId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** 若提供，打开前写入节点 data（绑定分镜等） */
  updateNodeData?: (id: string, patch: Record<string, unknown>) => void;
  /** 覆盖当前绑定帧（节点内切换后打开） */
  frameIdOverride?: string | null;
}

/** 解析导演台当前绑定的分镜预览与帧，并打开全屏 3D 舞台。 */
export function openDirector3dStage(ctx: Director3dOpenContext): void {
  const node = ctx.nodes.find((item) => item.id === ctx.blockId);
  const data = (node?.data ?? {}) as Record<string, unknown>;
  const project = normalizeDirectorProject(data.scene);
  const characters = useWorkspaceDocument.getState().characters.characters;

  const previewBlockId = resolveConnectedStoryboardPreviewForDirector3dId(
    ctx.blockId,
    ctx.nodes,
    ctx.edges,
  );
  const previewNode = previewBlockId
    ? ctx.nodes.find((item) => item.id === previewBlockId)
    : undefined;
  const previewRaw = (previewNode?.data as Record<string, unknown> | undefined)
    ?.storyboardPreview as StoryboardPreviewPayload | undefined;
  const previewPayload =
    previewRaw?.version === 1 && Array.isArray(previewRaw.frames)
      ? { ...emptyStoryboardPreview(), ...previewRaw }
      : emptyStoryboardPreview();

  const linkedFrameId =
    ctx.frameIdOverride !== undefined
      ? ctx.frameIdOverride
      : ((data.linkedStoryboardPreviewFrameId as string | undefined) ??
        previewPayload.selectedFrameId ??
        null);
  const linkedFrame = previewPayload.frames.find((frame) => frame.id === linkedFrameId);

  const referenceUrl = linkedFrame?.imageUrl ?? linkedFrame?.referenceImageUrl ?? undefined;
  const panoramaUrl = previewPayload.panorama720?.imageUrl;
  const lineArtUrl =
    (data.linkedShotId as string | undefined) &&
    useWorkspaceDocument
      .getState()
      .storyboard.shots.find((s) => s.id === data.linkedShotId)?.firstFrameAssetId;

  const environmentProject: DirectorProject = panoramaUrl
    ? { ...project, panorama: { url: panoramaUrl, yaw: 0, exposure: 1 } }
    : referenceUrl && !project.panorama
      ? { ...project, panorama: { url: referenceUrl, yaw: 0, exposure: 1 } }
      : lineArtUrl && !project.panorama
        ? { ...project, panorama: { url: lineArtUrl, yaw: 0, exposure: 1 } }
        : project;

  const nextProject = prepareDirectorProjectForShot(
    environmentProject,
    linkedFrame?.characterIds,
    characters,
    linkedFrame?.director3dGuide?.characterPlacements,
    linkedFrame?.characterNames,
  );

  ctx.updateNodeData?.(ctx.blockId, {
    linkedStoryboardPreviewId: previewBlockId ?? null,
    linkedStoryboardPreviewFrameId: linkedFrame?.id ?? null,
    linkedShotId: linkedFrame?.sourceShotId ?? (data.linkedShotId as string | null) ?? null,
  });
  if (previewBlockId && linkedFrame && ctx.updateNodeData) {
    ctx.updateNodeData(previewBlockId, {
      storyboardPreview: { ...previewPayload, selectedFrameId: linkedFrame.id },
    });
  }

  useDirector3dUi.getState().openForBlock(
    ctx.blockId,
    nextProject,
    linkedFrame?.sourceShotId ?? (data.linkedShotId as string | undefined),
    previewBlockId && linkedFrame
      ? { previewBlockId, frameId: linkedFrame.id }
      : undefined,
  );
  useDirector3dUi
    .getState()
    .setHostBridge(panoramaUrl ?? referenceUrl ?? lineArtUrl ?? null);
}
