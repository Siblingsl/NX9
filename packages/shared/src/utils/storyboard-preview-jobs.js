import { EXEC_PICTURE_HANDLES } from '../catalog/socket-registry';
export function buildDirectorCharacterPlacementPrompt(guide) {
    const placements = guide?.characterPlacements ?? [];
    if (placements.length === 0)
        return '';
    return `3D character blocking: ${placements.map((item) => {
        const [x, y, z] = item.position;
        const yaw = item.rotation[1];
        return `${item.name} at (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}), yaw ${yaw.toFixed(2)}, pose ${item.posePresetId || 'stand'}`;
    }).join('; ')}`;
}
/** 将分镜预览出图参数同步到图像生成节点 data */
export function buildPictureGenDelegatePatch(settings) {
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
export function buildStoryboardFramePrompt(frame) {
    return [
        frame.promptSummary,
        frame.director3dGuide?.cameraPrompt
            ? `3D camera direction: ${frame.director3dGuide.cameraPrompt}`
            : '',
        buildDirectorCharacterPlacementPrompt(frame.director3dGuide),
        frame.reviewNote ? `Revision request from storyboard review: ${frame.reviewNote}` : '',
        frame.stylePreset ? `Style preset: ${frame.stylePreset}` : '',
        frame.sceneAssetRef ? `Scene: ${frame.sceneAssetRef}` : '',
    ]
        .filter(Boolean)
        .join('\n');
}
function resolveConnectedNodeIdByType(blockId, expectedType, nodes, edges) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const edge of edges) {
        if (edge.source !== blockId && edge.target !== blockId)
            continue;
        const otherId = edge.source === blockId ? edge.target : edge.source;
        if (byId.get(otherId)?.type === expectedType)
            return otherId;
    }
    return undefined;
}
/** 从分镜预览解析已连接的 3D 导演台。 */
export function resolveConnectedDirector3dId(previewBlockId, nodes, edges) {
    return resolveConnectedNodeIdByType(previewBlockId, 'director-3d', nodes, edges);
}
/** 从 3D 导演台解析已连接的分镜预览。 */
export function resolveConnectedStoryboardPreviewForDirector3dId(directorBlockId, nodes, edges) {
    return resolveConnectedNodeIdByType(directorBlockId, 'storyboard-preview', nodes, edges);
}
/** 将预览图写回剧本拆分结构 */
export function writeBackBreakdownPreviewImage(payload, sourceShotId, imageUrl) {
    if (!payload?.episodes?.length)
        return payload;
    return {
        ...payload,
        episodes: payload.episodes.map((episode) => ({
            ...episode,
            shots: episode.shots.map((shot) => shot.id === sourceShotId
                ? { ...shot, previewImageUrl: imageUrl, status: 'previewing' }
                : shot),
        })),
    };
}
/** 从节点 data 解析已连接的图像生成节点 id（支持双向连线） */
export function resolveConnectedPictureGenId(previewBlockId, nodes, edges) {
    const edge = findStoryboardExecEdge(previewBlockId, nodes, edges);
    if (!edge)
        return undefined;
    return edge.source === previewBlockId ? edge.target : edge.source;
}
function findStoryboardExecEdge(blockId, nodes, edges) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const related = edges.filter((e) => {
        const source = byId.get(e.source);
        const target = byId.get(e.target);
        const isPair = (source?.type === 'picture-gen' && target?.type === 'storyboard-preview') ||
            (source?.type === 'storyboard-preview' && target?.type === 'picture-gen');
        if (!isPair)
            return false;
        return e.source === blockId || e.target === blockId;
    });
    return related.find((e) => EXEC_PICTURE_HANDLES.has(e.sourceHandle ?? '') ||
        EXEC_PICTURE_HANDLES.has(e.targetHandle ?? ''));
}
/** 从图像生成节点解析已连接的分镜预览节点 id */
export function resolveConnectedStoryboardPreviewId(pictureGenBlockId, nodes, edges) {
    const edge = findStoryboardExecEdge(pictureGenBlockId, nodes, edges);
    if (!edge)
        return undefined;
    return edge.source === pictureGenBlockId ? edge.target : edge.source;
}
/** 图像生成节点是否已通过执行口交由分镜预览调度 */
export function isPictureGenDelegatedToPreview(pictureGenBlockId, nodes, edges) {
    return Boolean(resolveConnectedStoryboardPreviewId(pictureGenBlockId, nodes, edges));
}
/** 3D 导演台是否已通过能力口交由分镜预览统一操作。 */
export function isDirector3dDelegatedToPreview(directorBlockId, nodes, edges) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return edges.some((edge) => {
        if (edge.source !== directorBlockId && edge.target !== directorBlockId)
            return false;
        const source = byId.get(edge.source);
        const target = byId.get(edge.target);
        const isPair = (source?.type === 'director-3d' && target?.type === 'storyboard-preview') ||
            (source?.type === 'storyboard-preview' && target?.type === 'director-3d');
        if (!isPair)
            return false;
        return (EXEC_PICTURE_HANDLES.has(edge.sourceHandle ?? '') ||
            EXEC_PICTURE_HANDLES.has(edge.targetHandle ?? ''));
    });
}
