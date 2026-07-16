export const DEFAULT_STORYBOARD_PREVIEW_PICTURE_SETTINGS = {
    model: 'dall-e-3',
    pictureGenMode: 'text-to-image',
    quality: 'auto',
    aspectRatio: '16:9',
};
export function emptyStoryboardPreview() {
    return {
        version: 1,
        viewMode: 'grid',
        gridColumns: 3,
        frames: [],
        computedFrameCount: 0,
        totalDurationSec: 0,
        confirmed: false,
        selectedFrameId: null,
        lastConsistencyReport: null,
        pictureSettings: { ...DEFAULT_STORYBOARD_PREVIEW_PICTURE_SETTINGS },
        panorama720: null,
        panorama720ByScope: {},
    };
}
export function resolveStoryboardPreviewPictureSettings(payload) {
    return payload?.pictureSettings ?? { ...DEFAULT_STORYBOARD_PREVIEW_PICTURE_SETTINGS };
}
/**
 * 自动计算分镜预览帧数（启发式，后续可替换为 LLM）。
 * 15s≈4 · 30s≈8 · 60s≈15 — 非固定公式，随镜头/场景/切换密度浮动。
 */
export function computeStoryboardPreviewFrameCount(input) {
    const { totalDurationSec, shotCount, sceneCount, cutCount, actionComplexity } = input;
    if (shotCount <= 0 || totalDurationSec <= 0)
        return 0;
    const secPerFrame = actionComplexity > 0.65 ? 3.2 : actionComplexity > 0.35 ? 3.75 : 4.2;
    const byDuration = Math.max(1, Math.round(totalDurationSec / secPerFrame));
    const sceneBoost = Math.max(0, Math.floor((sceneCount - 1) * 0.35));
    const cutBoost = Math.floor(cutCount * 0.12 * (0.5 + actionComplexity));
    const raw = byDuration + sceneBoost + cutBoost;
    return Math.max(1, Math.min(shotCount, raw));
}
/** 估算动作复杂度：镜头类型 + 时长波动 */
export function estimateActionComplexity(shots) {
    if (shots.length === 0)
        return 0;
    const closeRatio = shots.filter((s) => s.shotType === 'close' || s.shotType === 'extreme-wide').length / shots.length;
    const durVar = shots.reduce((acc, s, _, arr) => {
        const avg = arr.reduce((a, x) => a + x.durationSec, 0) / arr.length;
        return acc + Math.abs(s.durationSec - avg);
    }, 0) / shots.length;
    const durFactor = Math.min(1, durVar / 4);
    return Math.min(1, Math.max(0.15, closeRatio * 0.45 + durFactor * 0.35 + (shots.length > 12 ? 0.2 : 0)));
}
/**
 * 从 Storyboard 构建预览帧计划（每帧绑定主 Shot + 时间轴）。
 * 默认 **全部镜头**（核心路径「分镜图全出」要求）；opts.keyOnly 才采样关键镜。
 */
export function buildStoryboardPreviewFrames(shots, opts) {
    if (shots.length === 0)
        return [];
    const sorted = [...shots].sort((a, b) => a.index - b.index);
    let picked = sorted;
    if (opts?.keyOnly) {
        const totalDurationSec = sorted.reduce((sum, s) => sum + s.durationSec, 0);
        const sceneIds = new Set(sorted.map((s) => s.sceneId).filter(Boolean));
        const cutCount = Math.max(0, sorted.length - 1);
        const actionComplexity = estimateActionComplexity(sorted);
        const targetCount = computeStoryboardPreviewFrameCount({
            totalDurationSec,
            shotCount: sorted.length,
            sceneCount: sceneIds.size || 1,
            cutCount,
            actionComplexity,
        });
        picked =
            targetCount >= sorted.length ? sorted : pickKeyShots(sorted, targetCount);
    }
    let cursor = 0;
    return picked.map((shot, i) => {
        const startSec = cursor;
        const endSec = cursor + shot.durationSec;
        cursor = endSec;
        const locked = shot.keyframeStatus === 'approved';
        return {
            id: `spf-${shot.id}`,
            order: i + 1,
            label: `Shot${String(i + 1).padStart(2, '0')}`,
            startSec,
            endSec,
            sourceShotId: shot.id,
            sceneCode: shot.sceneCode ?? null,
            sceneId: shot.sceneId ?? null,
            promptSummary: shot.descriptionZh || shot.promptEn || '',
            characterIds: shot.characterIds ?? [],
            characterNames: shot.characterNames ?? [],
            imageUrl: shot.firstFrameAssetId ?? null,
            director3dGuide: shot.director3dGuide ?? null,
            reviewNote: shot.keyframeReviewNote ?? null,
            status: shot.firstFrameAssetId ? 'success' : 'idle',
            locked,
            userModified: false,
        };
    });
}
/** 从剧本拆分分镜构建预览时间轴帧 */
export function buildStoryboardPreviewFramesFromBreakdown(shots) {
    let cursor = 0;
    return shots.map((shot, i) => {
        const duration = Math.max(1, shot.durationSec || 5);
        const startSec = cursor;
        const endSec = cursor + duration;
        cursor = endSec;
        return {
            id: `spf-${shot.id}`,
            order: i + 1,
            label: `Shot${String(i + 1).padStart(2, '0')}`,
            startSec,
            endSec,
            sourceShotId: shot.id,
            sceneCode: shot.sceneCode,
            sceneId: shot.sceneId,
            promptSummary: shot.imagePrompt || shot.scriptText,
            characterIds: shot.characters,
            sceneAssetRef: shot.scene || null,
            imageUrl: shot.previewImageUrl ?? null,
            referenceImageUrl: shot.referenceImageUrl ?? null,
            status: shot.previewImageUrl ? 'success' : 'idle',
            locked: shot.status === 'approved',
            userModified: false,
        };
    });
}
/** 均匀采样关键镜头（保留首尾 + 中间分布） */
function pickKeyShots(shots, count) {
    if (count <= 1)
        return [shots[0]];
    if (count >= shots.length)
        return shots;
    const indices = new Set([0, shots.length - 1]);
    const step = (shots.length - 1) / (count - 1);
    for (let i = 1; i < count - 1; i++) {
        indices.add(Math.round(i * step));
    }
    return [...indices].sort((a, b) => a - b).map((i) => shots[i]);
}
export function storyboardPreviewSummary(payload) {
    const frames = payload?.frames ?? [];
    const total = frames.length;
    const success = frames.filter((f) => f.status === 'success' || f.status === 'locked').length;
    const locked = frames.filter((f) => f.locked).length;
    const ready = total > 0 && success === total && Boolean(payload?.confirmed);
    return { total, success, locked, ready };
}
export function canRegenerateFrame(frame) {
    return !frame.locked && frame.status !== 'generating';
}
export function canConfirmStoryboardPreview(payload) {
    if (payload.frames.length === 0)
        return false;
    return payload.frames.every((f) => f.status === 'success' || f.status === 'locked');
}
