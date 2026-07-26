import type { PlaybookDefinition } from '../data/playbook-definitions';
import type {
  EpisodePlaybookProgress,
  PlaybookSession,
  PlaybookWorkflowStatus,
} from '../types/workspace';

function unique(values: string[] | undefined): string[] {
  return [...new Set(values ?? [])];
}

/** 旧核心步骤 id → 新主链 id（加载会话时迁移） */
const LEGACY_CORE_STEP_IDS: Record<string, string> = {
  'script-breakdown': 'script-desk',
  'story-grid': 'storyboard-desk',
  'storyboard-preview': 'director-desk',
  'keyframe-review': 'director-desk',
};

/** 单步 id 迁移；未知 id 原样返回。 */
export function migratePlaybookStepId(stepId: string): string {
  return LEGACY_CORE_STEP_IDS[stepId] ?? stepId;
}

/**
 * 已完成步骤迁移：
 * - 旧「分镜预览」单独完成不算导演台完成（关键帧审阅才算）
 * - 旧「批审」完成 → 导演台完成
 */
export function migratePlaybookCompletedStepIds(ids: string[] | undefined): string[] {
  const out = new Set<string>();
  for (const id of ids ?? []) {
    if (id === 'storyboard-preview') continue;
    out.add(migratePlaybookStepId(id));
  }
  return [...out];
}

function migrateEpisodeProgress(progress: EpisodePlaybookProgress): EpisodePlaybookProgress {
  return {
    ...progress,
    currentStepId: migratePlaybookStepId(progress.currentStepId),
    completedStepIds: migratePlaybookCompletedStepIds(progress.completedStepIds),
    skippedStepIds: migratePlaybookCompletedStepIds(progress.skippedStepIds),
    failedStepIds: migratePlaybookCompletedStepIds(progress.failedStepIds),
    waitingStepIds: migratePlaybookCompletedStepIds(progress.waitingStepIds),
  };
}

/** 将顶层会话字段与按集进度中的旧步骤 id 迁移到新主链。 */
export function migratePlaybookSessionSteps(session: PlaybookSession): PlaybookSession {
  const episodeProgress = session.episodeProgress
    ? Object.fromEntries(
        Object.entries(session.episodeProgress).map(([episodeId, progress]) => [
          episodeId,
          migrateEpisodeProgress(progress),
        ]),
      )
    : session.episodeProgress;

  return {
    ...session,
    currentStepId: migratePlaybookStepId(session.currentStepId),
    completedStepIds: migratePlaybookCompletedStepIds(session.completedStepIds),
    skippedStepIds: migratePlaybookCompletedStepIds(session.skippedStepIds),
    failedStepIds: migratePlaybookCompletedStepIds(session.failedStepIds),
    waitingStepIds: migratePlaybookCompletedStepIds(session.waitingStepIds),
    episodeProgress,
  };
}

/** 将 PlaybookSession 顶层兼容字段固化为一集的完整进度。 */
export function snapshotPlaybookProgress(session: PlaybookSession): EpisodePlaybookProgress {
  return {
    currentStepId: session.currentStepId,
    completedStepIds: unique(session.completedStepIds),
    skippedStepIds: unique(session.skippedStepIds),
    failedStepIds: unique(session.failedStepIds),
    waitingStepIds: unique(session.waitingStepIds),
    workflowStatus: (session.workflowStatus ?? 'idle') as PlaybookWorkflowStatus,
  };
}

/** 把指定集进度投影到旧字段，现有 UI 无需维护第二套状态。 */
export function projectPlaybookProgress(
  session: PlaybookSession,
  progress: EpisodePlaybookProgress,
): PlaybookSession {
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

/** 新集从分镜台开始；编剧台是全剧级完成态，不要求每集重复执行。 */
export function createInitialEpisodePlaybookProgress(
  playbook: PlaybookDefinition,
): EpisodePlaybookProgress {
  const storyboardIndex = playbook.steps.findIndex(
    (step) => step.id === 'storyboard-desk' || step.id === 'story-grid',
  );
  const currentIndex = storyboardIndex >= 0 ? storyboardIndex : 0;
  return {
    currentStepId: playbook.steps[currentIndex]?.id ?? '',
    completedStepIds: storyboardIndex > 0
      ? playbook.steps.slice(0, storyboardIndex).map((step) => step.id)
      : [],
    skippedStepIds: [],
    failedStepIds: [],
    waitingStepIds: [],
    workflowStatus: 'idle',
  };
}

/** 每次当前集流程变化后调用，保证保存到磁盘的按集进度也是最新的。 */
export function syncCurrentEpisodePlaybookProgress(
  session: PlaybookSession,
  episodeId: string | null | undefined,
): PlaybookSession {
  if (!episodeId) return session;
  return {
    ...session,
    episodeProgress: {
      ...(session.episodeProgress ?? {}),
      [episodeId]: snapshotPlaybookProgress(session),
    },
  };
}

/** 载入工作区时把当前集记录恢复到顶层；旧项目则就地迁移。 */
export function hydrateEpisodePlaybookProgress(
  session: PlaybookSession,
  episodeId: string | null | undefined,
): PlaybookSession {
  const migrated = migratePlaybookSessionSteps(session);
  if (!episodeId) return migrated;
  const stored = migrated.episodeProgress?.[episodeId];
  if (!stored) return syncCurrentEpisodePlaybookProgress(migrated, episodeId);
  return projectPlaybookProgress(migrated, stored);
}

/** 切集前保存旧集，切集后恢复目标集；第一次进入目标集时创建独立初始进度。 */
export function switchPlaybookEpisode(
  session: PlaybookSession,
  currentEpisodeId: string | null | undefined,
  targetEpisodeId: string | null | undefined,
  playbook: PlaybookDefinition,
): PlaybookSession {
  const savedSession = syncCurrentEpisodePlaybookProgress(
    migratePlaybookSessionSteps(session),
    currentEpisodeId,
  );
  if (!targetEpisodeId) return savedSession;
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
