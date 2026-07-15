export type ShotStatus = 'draft' | 'generating' | 'review' | 'approved' | 'failed';

export type ShotType = 'close' | 'medium' | 'wide' | 'extreme-wide' | 'custom';

export type SketchSource = 'ai-grid' | 'ai-single' | 'upload' | 'hand-draw' | 'import';

export type StoryboardReviewStage = 'keyframe' | 'video';
export type StoryboardReviewDecision = 'approved' | 'rejected';

export interface StoryboardReviewEvent {
  id: string;
  stage: StoryboardReviewStage;
  decision: StoryboardReviewDecision;
  comment?: string | null;
  createdAt: string;
}

export interface StoryboardVideoVersion {
  id: string;
  url: string;
  createdAt: string;
  prompt?: string;
  model?: string;
  status: 'candidate' | 'adopted' | 'superseded';
}

export interface StoryboardDirectorCharacterPlacement {
  objectId: string;
  characterId?: string;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  bodyType?: string;
  posePresetId?: string;
}

export interface EpisodeExportRecord {
  id: string;
  episodeId?: string | null;
  episodeTitle?: string | null;
  url: string;
  fileName: string;
  mode: 'ffmpeg-episode';
  shotCount: number;
  durationSec: number;
  createdAt: string;
}

/** 3D 导演台写回 Shot 的持久机位；切换分集后仍可还原到分镜预览。 */
export interface StoryboardDirector3dGuide {
  sourceBlockId: string;
  captureId: string;
  captureUrl: string;
  cameraPrompt?: string;
  cameraPosition?: [number, number, number];
  cameraRotation?: [number, number, number];
  cameraFov?: number;
  panoramaUrl?: string;
  characterPlacements?: StoryboardDirectorCharacterPlacement[];
  appliedAt: string;
}

export interface StoryboardShot {
  id: string;
  /** 所属分集；旧项目无此字段时视为单集。 */
  episodeId?: string | null;
  episodeIndex?: number | null;
  episodeTitle?: string | null;
  index: number;
  durationSec: number;
  shotType: ShotType;
  descriptionZh: string;
  promptEn: string;
  videoPromptEn?: string;
  firstFrameAssetId?: string | null;
  lastFrameAssetId?: string | null;
  videoAssetId?: string | null;
  /** 所有生成版本；videoAssetId 继续投影当前预览/采用版本以兼容既有执行链。 */
  videoVersions?: StoryboardVideoVersion[];
  adoptedVideoVersionId?: string | null;
  audioAssetId?: string | null;
  status: ShotStatus;
  characterIds?: string[];
  characterNames?: string[];
  sceneName?: string | null;
  sceneAssetId?: string | null;
  director3dGuide?: StoryboardDirector3dGuide | null;
  /** 当前退回修改意见；通过后清空，完整记录保留在 reviewHistory。 */
  keyframeReviewNote?: string | null;
  reviewHistory?: StoryboardReviewEvent[];
  linkedBlockId?: string | null;
  notes?: string;
  sketchSource?: SketchSource | null;
  sketchPrompt?: string | null;
  sketchApprovedAt?: string | null;
  videoDesc?: string | null;
  associateAssetIds?: string[];
  tableRowId?: string | null;
  subtitleText?: string | null;
  /** 与 SceneSplitRecord 关联 */
  sceneId?: string | null;
  /** 显示用 "1-3" */
  sceneCode?: string | null;
  /** 双阶段审阅：关键帧状态 */
  keyframeStatus?: 'draft' | 'review' | 'approved' | 'failed';
  /** 双阶段审阅：视频状态 */
  videoStatus?: 'draft' | 'review' | 'approved' | 'failed';
}

export type StoryboardPayloadVersion = 1 | 2 | 3;

export interface StoryboardPayload {
  version: StoryboardPayloadVersion;
  title: string;
  reviewMode: 'manual' | 'auto';
  /** 当前生产作用域；批量出图、批审、视频和导出只处理这一集。 */
  activeEpisodeId?: string | null;
  shots: StoryboardShot[];
}

export type VoiceLineStatus = 'pending' | 'generating' | 'ready' | 'failed';

export interface VoiceProfile {
  id: string;
  name: string;
  provider: 'openai-compatible' | 'luxtts' | 'voicebox';
  voiceId: string;
  referenceAudioAssetId?: string | null;
}

export interface VoiceLine {
  id: string;
  shotId?: string | null;
  speaker: string;
  text: string;
  voiceProfileId?: string | null;
  audioAssetId?: string | null;
  status: VoiceLineStatus;
}

export interface VoicePayload {
  version: 1;
  profiles: VoiceProfile[];
  lines: VoiceLine[];
}

export interface WorkspacePreferences {
  artStylePrompt?: string;
  defaultImageModel?: string;
  defaultVideoModel?: string;
}

export function emptyStoryboard(): StoryboardPayload {
  return { version: 3, title: '', reviewMode: 'manual', activeEpisodeId: null, shots: [] };
}

export function migrateStoryboardPayload(payload: StoryboardPayload): StoryboardPayload {
  let v2: StoryboardPayload & { shots: (StoryboardShot & { status?: string })[] };
  if (payload.version >= 2) {
    v2 = payload as any;
  } else {
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
    const v3 = payload as StoryboardPayload;
    return {
      ...v3,
      activeEpisodeId:
        v3.activeEpisodeId ?? v3.shots.find((shot) => shot.episodeId)?.episodeId ?? null,
    };
  }
  return {
    ...v2,
    version: 3,
    activeEpisodeId: v2.shots.find((shot) => shot.episodeId)?.episodeId ?? null,
    shots: v2.shots.map((s) => ({
      ...s,
      sceneId: (s as any).sceneId ?? null,
      sceneCode: (s as any).sceneCode ?? null,
      keyframeStatus: s.status === 'approved' ? 'approved' : s.status === 'review' ? 'review' : s.status === 'failed' ? 'failed' : 'draft',
      videoStatus: (s as any).videoStatus ?? 'draft',
    })),
  };
}

export function resolveActiveEpisodeId(storyboard: StoryboardPayload): string | null {
  return storyboard.activeEpisodeId ?? storyboard.shots.find((shot) => shot.episodeId)?.episodeId ?? null;
}

/** 旧项目没有 episodeId 时保持单集兼容，返回全部镜头。 */
export function activeEpisodeShots(storyboard: StoryboardPayload): StoryboardShot[] {
  const activeEpisodeId = resolveActiveEpisodeId(storyboard);
  if (!activeEpisodeId) return storyboard.shots;
  const scoped = storyboard.shots.filter((shot) => shot.episodeId === activeEpisodeId);
  if (scoped.length > 0) return scoped;
  const firstEpisodeId = storyboard.shots.find((shot) => shot.episodeId)?.episodeId;
  return firstEpisodeId
    ? storyboard.shots.filter((shot) => shot.episodeId === firstEpisodeId)
    : storyboard.shots;
}

/** 旧镜头只有 videoAssetId 时，按一个可采用的历史版本展示。 */
export function resolveStoryboardVideoVersions(shot: StoryboardShot): StoryboardVideoVersion[] {
  if (shot.videoVersions?.length) return shot.videoVersions;
  if (!shot.videoAssetId) return [];
  return [{
    id: `legacy-${shot.id}`,
    url: shot.videoAssetId,
    createdAt: '1970-01-01T00:00:00.000Z',
    status: shot.videoStatus === 'approved' ? 'adopted' : 'candidate',
  }];
}

export function appendStoryboardVideoVersion(
  shot: StoryboardShot,
  version: StoryboardVideoVersion,
): Pick<StoryboardShot, 'videoVersions' | 'videoAssetId' | 'videoStatus' | 'status'> {
  const existing = resolveStoryboardVideoVersions(shot).filter((item) => item.id !== version.id);
  return {
    videoVersions: [...existing, version],
    videoAssetId: version.url,
    videoStatus: 'review',
    status: 'review',
  };
}

export function adoptStoryboardVideoVersion(
  shot: StoryboardShot,
  versionId: string,
): Partial<StoryboardShot> | null {
  const versions = resolveStoryboardVideoVersions(shot);
  const selected = versions.find((item) => item.id === versionId);
  if (!selected) return null;
  return {
    videoVersions: versions.map((item) => ({
      ...item,
      status: item.id === versionId
        ? 'adopted' as const
        : item.status === 'adopted'
          ? 'superseded' as const
          : item.status,
    })),
    adoptedVideoVersionId: versionId,
    videoAssetId: selected.url,
    videoStatus: 'approved',
    status: 'approved',
  };
}

export function appendStoryboardReviewEvent(
  shot: StoryboardShot,
  event: StoryboardReviewEvent,
): StoryboardReviewEvent[] {
  return [...(shot.reviewHistory ?? []).filter((item) => item.id !== event.id), event];
}

export function appendEpisodeExportRecord(
  history: EpisodeExportRecord[] | undefined,
  record: EpisodeExportRecord,
  max = 30,
): EpisodeExportRecord[] {
  return [record, ...(history ?? []).filter((item) => item.id !== record.id)].slice(0, max);
}

export function emptyVoice(): VoicePayload {
  return { version: 1, profiles: [], lines: [] };
}
