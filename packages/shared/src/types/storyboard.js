export function emptyStoryboard() {
    return {
        version: 3,
        title: '',
        reviewMode: 'manual',
        activeEpisodeId: null,
        episodes: [],
        exportHistory: [],
        shots: [],
    };
}
/** 从镜头归属 + 显式剧集元数据合并出剧集列表 */
export function listEpisodeMetas(storyboard) {
    const byId = new Map();
    for (const ep of storyboard.episodes ?? []) {
        byId.set(ep.id, { ...ep });
    }
    for (const shot of storyboard.shots) {
        const id = shot.episodeId;
        if (!id)
            continue;
        const existing = byId.get(id);
        if (existing) {
            if (!existing.title && shot.episodeTitle)
                existing.title = shot.episodeTitle;
            if (existing.index <= 0 && shot.episodeIndex)
                existing.index = shot.episodeIndex;
            continue;
        }
        byId.set(id, {
            id,
            index: shot.episodeIndex ?? byId.size + 1,
            title: shot.episodeTitle || `第 ${shot.episodeIndex ?? byId.size + 1} 集`,
            status: 'in_progress',
        });
    }
    // 无 episodeId 的旧单集：合成默认集
    const orphan = storyboard.shots.filter((s) => !s.episodeId);
    if (orphan.length > 0 && byId.size === 0) {
        const id = 'ep-default';
        byId.set(id, {
            id,
            index: 1,
            title: storyboard.title || '第 1 集',
            status: 'in_progress',
        });
    }
    return [...byId.values()].sort((a, b) => a.index - b.index || a.title.localeCompare(b.title));
}
export function createEpisodeMeta(index, title) {
    return {
        id: `ep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        index,
        title: title?.trim() || `第 ${index} 集`,
        status: 'draft',
    };
}
export function migrateStoryboardPayload(payload) {
    let v2;
    if (payload.version >= 2) {
        v2 = payload;
    }
    else {
        v2 = {
            ...payload,
            version: 2,
            shots: payload.shots.map((s) => ({
                ...s,
                sketchSource: null,
                sketchPrompt: null,
                sketchApprovedAt: null,
            })),
        };
    }
    if (payload.version >= 3) {
        const v3 = payload;
        return {
            ...v3,
            activeEpisodeId: v3.activeEpisodeId ?? v3.shots.find((shot) => shot.episodeId)?.episodeId ?? null,
        };
    }
    return {
        ...v2,
        version: 3,
        activeEpisodeId: v2.shots.find((shot) => shot.episodeId)?.episodeId ?? null,
        shots: v2.shots.map((s) => ({
            ...s,
            sceneId: s.sceneId ?? null,
            sceneCode: s.sceneCode ?? null,
            keyframeStatus: s.status === 'approved' ? 'approved' : s.status === 'review' ? 'review' : s.status === 'failed' ? 'failed' : 'draft',
            videoStatus: s.videoStatus ?? 'draft',
        })),
    };
}
export function resolveActiveEpisodeId(storyboard) {
    return storyboard.activeEpisodeId ?? storyboard.shots.find((shot) => shot.episodeId)?.episodeId ?? null;
}
/** 旧项目没有 episodeId 时保持单集兼容，返回全部镜头。 */
export function activeEpisodeShots(storyboard) {
    const activeEpisodeId = resolveActiveEpisodeId(storyboard);
    if (!activeEpisodeId)
        return storyboard.shots;
    const scoped = storyboard.shots.filter((shot) => shot.episodeId === activeEpisodeId);
    if (scoped.length > 0)
        return scoped;
    const firstEpisodeId = storyboard.shots.find((shot) => shot.episodeId)?.episodeId;
    return firstEpisodeId
        ? storyboard.shots.filter((shot) => shot.episodeId === firstEpisodeId)
        : storyboard.shots;
}
/** 旧镜头只有 videoAssetId 时，按一个可采用的历史版本展示。 */
export function resolveStoryboardVideoVersions(shot) {
    if (shot.videoVersions?.length)
        return shot.videoVersions;
    if (!shot.videoAssetId)
        return [];
    return [{
            id: `legacy-${shot.id}`,
            url: shot.videoAssetId,
            createdAt: '1970-01-01T00:00:00.000Z',
            status: shot.videoStatus === 'approved' ? 'adopted' : 'candidate',
        }];
}
export function appendStoryboardVideoVersion(shot, version) {
    const existing = resolveStoryboardVideoVersions(shot).filter((item) => item.id !== version.id);
    return {
        videoVersions: [...existing, version],
        videoAssetId: version.url,
        videoStatus: 'review',
        status: 'review',
    };
}
export function adoptStoryboardVideoVersion(shot, versionId) {
    const versions = resolveStoryboardVideoVersions(shot);
    const selected = versions.find((item) => item.id === versionId);
    if (!selected)
        return null;
    return {
        videoVersions: versions.map((item) => ({
            ...item,
            status: item.id === versionId
                ? 'adopted'
                : item.status === 'adopted'
                    ? 'superseded'
                    : item.status,
        })),
        adoptedVideoVersionId: versionId,
        videoAssetId: selected.url,
        videoStatus: 'approved',
        status: 'approved',
    };
}
export function appendStoryboardReviewEvent(shot, event) {
    return [...(shot.reviewHistory ?? []).filter((item) => item.id !== event.id), event];
}
export function appendEpisodeExportRecord(history, record, max = 30) {
    return [record, ...(history ?? []).filter((item) => item.id !== record.id)].slice(0, max);
}
export function emptyVoice() {
    return { version: 1, profiles: [], lines: [] };
}
