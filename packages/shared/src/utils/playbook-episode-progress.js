function unique(values) {
    return [...new Set(values ?? [])];
}
/** 将 PlaybookSession 顶层兼容字段固化为一集的完整进度。 */
export function snapshotPlaybookProgress(session) {
    return {
        currentStepId: session.currentStepId,
        completedStepIds: unique(session.completedStepIds),
        skippedStepIds: unique(session.skippedStepIds),
        failedStepIds: unique(session.failedStepIds),
        waitingStepIds: unique(session.waitingStepIds),
        workflowStatus: (session.workflowStatus ?? 'idle'),
    };
}
/** 把指定集进度投影到旧字段，现有 UI 无需维护第二套状态。 */
export function projectPlaybookProgress(session, progress) {
    return {
        ...session,
        currentStepId: progress.currentStepId,
        completedStepIds: unique(progress.completedStepIds),
        skippedStepIds: unique(progress.skippedStepIds),
        failedStepIds: unique(progress.failedStepIds),
        waitingStepIds: unique(progress.waitingStepIds),
        workflowStatus: progress.workflowStatus ?? 'idle',
    };
}
/** 新集从分镜网格开始；剧本拆分是全剧级完成态，不要求每集重复执行。 */
export function createInitialEpisodePlaybookProgress(playbook) {
    const storyGridIndex = playbook.steps.findIndex((step) => step.id === 'story-grid');
    const currentIndex = storyGridIndex >= 0 ? storyGridIndex : 0;
    return {
        currentStepId: playbook.steps[currentIndex]?.id ?? '',
        completedStepIds: storyGridIndex > 0
            ? playbook.steps.slice(0, storyGridIndex).map((step) => step.id)
            : [],
        skippedStepIds: [],
        failedStepIds: [],
        waitingStepIds: [],
        workflowStatus: 'idle',
    };
}
/** 每次当前集流程变化后调用，保证保存到磁盘的按集进度也是最新的。 */
export function syncCurrentEpisodePlaybookProgress(session, episodeId) {
    if (!episodeId)
        return session;
    return {
        ...session,
        episodeProgress: {
            ...(session.episodeProgress ?? {}),
            [episodeId]: snapshotPlaybookProgress(session),
        },
    };
}
/** 载入工作区时把当前集记录恢复到顶层；旧项目则就地迁移。 */
export function hydrateEpisodePlaybookProgress(session, episodeId) {
    if (!episodeId)
        return session;
    const stored = session.episodeProgress?.[episodeId];
    if (!stored)
        return syncCurrentEpisodePlaybookProgress(session, episodeId);
    return projectPlaybookProgress(session, stored);
}
/** 切集前保存旧集，切集后恢复目标集；第一次进入目标集时创建独立初始进度。 */
export function switchPlaybookEpisode(session, currentEpisodeId, targetEpisodeId, playbook) {
    const savedSession = syncCurrentEpisodePlaybookProgress(session, currentEpisodeId);
    if (!targetEpisodeId)
        return savedSession;
    if (targetEpisodeId === currentEpisodeId) {
        return hydrateEpisodePlaybookProgress(savedSession, targetEpisodeId);
    }
    const targetProgress = savedSession.episodeProgress?.[targetEpisodeId]
        ?? createInitialEpisodePlaybookProgress(playbook);
    const projected = projectPlaybookProgress(savedSession, targetProgress);
    return {
        ...projected,
        episodeProgress: {
            ...(projected.episodeProgress ?? {}),
            [targetEpisodeId]: targetProgress,
        },
    };
}
