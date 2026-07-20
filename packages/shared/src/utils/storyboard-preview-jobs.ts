import type { ScriptBreakdownPayload } from '../types/script-breakdown';
import type {
  StoryboardPreviewFrame,
  StoryboardPreviewPictureSettings,
} from '../types/storyboard-preview';
import { EXEC_PICTURE_HANDLES, isStoryboardPreviewHostKind } from '../catalog/socket-registry';
import type { StoryboardDirector3dGuide } from '../types/storyboard';

export function buildDirectorCharacterPlacementPrompt(
  guide: StoryboardDirector3dGuide | null | undefined,
): string {
  const placements = guide?.characterPlacements ?? [];
  if (placements.length === 0) return '';
  return `3D character blocking: ${placements.map((item) => {
    const [x, y, z] = item.position;
    const yaw = item.rotation[1];
    return `${item.name} at (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}), yaw ${yaw.toFixed(2)}, pose ${item.posePresetId || 'stand'}`;
  }).join('; ')}`;
}

/** 将分镜预览出图参数同步到图像生成节点 data */
export function buildPictureGenDelegatePatch(
  settings: StoryboardPreviewPictureSettings,
): Record<string, unknown> {
  return {
    model: settings.model,
    quality: settings.quality,
    aspectRatio: settings.aspectRatio,
    imageCount: 1,
    pictureGenMode: settings.pictureGenMode,
    useImageReference: settings.pictureGenMode === 'image-to-image',
    delegatedToStoryboardPreview: true,
  };
}

/** 构建单帧图像生成 Prompt */
export function buildStoryboardFramePrompt(frame: StoryboardPreviewFrame): string {
  const isLineArt = (frame.stylePreset || '').toLowerCase().includes('line');
  return [
    frame.promptSummary,
    frame.director3dGuide?.cameraPrompt
      ? `3D camera direction: ${frame.director3dGuide.cameraPrompt}`
      : '',
    buildDirectorCharacterPlacementPrompt(frame.director3dGuide),
    frame.reviewNote ? `Revision request from storyboard review: ${frame.reviewNote}` : '',
    isLineArt
      ? 'Render mode: black and white storyboard line art, clean pencil contours, no color, no shading fill, composition draft only, white background'
      : frame.stylePreset
        ? `Style preset: ${frame.stylePreset}`
        : '',
    frame.sceneAssetRef ? `Scene: ${frame.sceneAssetRef}` : '',
    frame.characterNames?.length ? `Characters on frame: ${frame.characterNames.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function resolveConnectedNodeIdByType(
  blockId: string,
  expectedType: string,
  nodes: Array<{ id: string; type?: string | null }>,
  edges: Array<{ source: string; target: string }>,
): string | undefined {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    if (edge.source !== blockId && edge.target !== blockId) continue;
    const otherId = edge.source === blockId ? edge.target : edge.source;
    if (byId.get(otherId)?.type === expectedType) return otherId;
  }
  return undefined;
}

/** 从分镜预览解析已连接的 3D 导演台。 */
export function resolveConnectedDirector3dId(
  previewBlockId: string,
  nodes: Array<{ id: string; type?: string | null }>,
  edges: Array<{ source: string; target: string }>,
): string | undefined {
  return resolveConnectedNodeIdByType(previewBlockId, 'director-3d', nodes, edges);
}

/** 从 3D 导演台解析已连接的分镜台/预览。 */
export function resolveConnectedStoryboardPreviewForDirector3dId(
  directorBlockId: string,
  nodes: Array<{ id: string; type?: string | null }>,
  edges: Array<{ source: string; target: string }>,
): string | undefined {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    if (edge.source !== directorBlockId && edge.target !== directorBlockId) continue;
    const otherId = edge.source === directorBlockId ? edge.target : edge.source;
    if (isStoryboardPreviewHostKind(byId.get(otherId)?.type)) return otherId;
  }
  return undefined;
}

/** 将预览图写回剧本拆分结构 */
export function writeBackBreakdownPreviewImage(
  payload: ScriptBreakdownPayload | undefined,
  sourceShotId: string,
  imageUrl: string,
): ScriptBreakdownPayload | undefined {
  if (!payload?.episodes?.length) return payload;
  return {
    ...payload,
    episodes: payload.episodes.map((episode) => ({
      ...episode,
      shots: episode.shots.map((shot) =>
        shot.id === sourceShotId
          ? { ...shot, previewImageUrl: imageUrl, status: 'previewing' as const }
          : shot,
      ),
    })),
  };
}

/** 从节点 data 解析已连接的图像生成节点 id（支持双向连线） */
export function resolveConnectedPictureGenId(
  previewBlockId: string,
  nodes: Array<{ id: string; type?: string | null }>,
  edges: Array<{ source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>,
): string | undefined {
  const edge = findStoryboardExecEdge(previewBlockId, nodes, edges);
  if (!edge) return undefined;
  return edge.source === previewBlockId ? edge.target : edge.source;
}

function isAssetSheetPictureHostKind(kind?: string | null): boolean {
  return kind === 'character-sheet' || kind === 'scene-card' || kind === 'costume-sheet';
}

function isPictureExecHostKind(kind?: string | null): boolean {
  return isStoryboardPreviewHostKind(kind) || isAssetSheetPictureHostKind(kind);
}

function findStoryboardExecEdge(
  blockId: string,
  nodes: Array<{ id: string; type?: string | null }>,
  edges: Array<{ source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>,
) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const related = edges.filter((e) => {
    const source = byId.get(e.source);
    const target = byId.get(e.target);
    const isPair =
      (source?.type === 'picture-gen' && isPictureExecHostKind(target?.type)) ||
      (isPictureExecHostKind(source?.type) && target?.type === 'picture-gen') ||
      (source?.type === 'director-3d' && isStoryboardPreviewHostKind(target?.type)) ||
      (isStoryboardPreviewHostKind(source?.type) && target?.type === 'director-3d');
    if (!isPair) return false;
    return e.source === blockId || e.target === blockId;
  });
  // 能力口优先；若节点只做普通 picture 连线（角色设定/场景设定），也允许匹配
  return (
    related.find(
      (e) =>
        EXEC_PICTURE_HANDLES.has(e.sourceHandle ?? '') ||
        EXEC_PICTURE_HANDLES.has(e.targetHandle ?? ''),
    )
    ?? related[0]
  );
}

/** 从图像生成节点解析已连接的分镜预览节点 id */
export function resolveConnectedStoryboardPreviewId(
  pictureGenBlockId: string,
  nodes: Array<{ id: string; type?: string | null }>,
  edges: Array<{ source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>,
): string | undefined {
  const edge = findStoryboardExecEdge(pictureGenBlockId, nodes, edges);
  if (!edge) return undefined;
  return edge.source === pictureGenBlockId ? edge.target : edge.source;
}

/** 图像生成节点是否已通过执行口交由分镜预览调度 */
export function isPictureGenDelegatedToPreview(
  pictureGenBlockId: string,
  nodes: Array<{ id: string; type?: string | null }>,
  edges: Array<{ source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>,
): boolean {
  return Boolean(resolveConnectedStoryboardPreviewId(pictureGenBlockId, nodes, edges));
}

/** 3D 导演台是否已通过能力口交由分镜预览统一操作。 */
export function isDirector3dDelegatedToPreview(
  directorBlockId: string,
  nodes: Array<{ id: string; type?: string | null }>,
  edges: Array<{ source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>,
): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return edges.some((edge) => {
    if (edge.source !== directorBlockId && edge.target !== directorBlockId) return false;
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    const isPair =
      (source?.type === 'director-3d' && isStoryboardPreviewHostKind(target?.type)) ||
      (isStoryboardPreviewHostKind(source?.type) && target?.type === 'director-3d');
    if (!isPair) return false;
    return (
      EXEC_PICTURE_HANDLES.has(edge.sourceHandle ?? '') ||
      EXEC_PICTURE_HANDLES.has(edge.targetHandle ?? '')
    );
  });
}
