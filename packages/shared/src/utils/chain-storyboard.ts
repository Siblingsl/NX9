import type { StoryboardShot, EpisodeMeta, EpisodeExportRecord } from '../types/storyboard';

/**
 * ChainStoryboardPayload — 按链/按节点隔离的镜表数据。
 * 每个 storyboard-desk 节点的 data.chainStoryboard 持有本链镜头。
 * SSOT 原则：消费范围 = 本节点 data ∪ 上游连入产物。
 */
export interface ChainStoryboardPayload {
  version: 2;
  /** 1 = 分镜线稿与导演关键帧已按媒体角色分离。 */
  mediaRoleSchemaVersion?: 1;
  title?: string;
  activeEpisodeId?: string | null;
  episodes?: EpisodeMeta[];
  shots: StoryboardShot[];
  confirmedEpisodeIds?: string[];
  gridConfirmed?: boolean;
  exportHistory?: EpisodeExportRecord[];
}

export const CHAIN_STORYBOARD_HANDOFF_HASH_SCHEMA_VERSION = 2;

function stableSerializeValue(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerializeValue).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerializeValue(record[key])}`).join(',')}}`;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function projectHandoffShot(shot: StoryboardShot) {
  return {
    id: shot.id,
    episodeId: shot.episodeId ?? null,
    episodeIndex: shot.episodeIndex ?? null,
    episodeTitle: shot.episodeTitle ?? null,
    index: shot.index,
    durationSec: shot.durationSec,
    shotType: shot.shotType,
    descriptionZh: shot.descriptionZh,
    promptEn: shot.promptEn,
    videoPromptEn: shot.videoPromptEn ?? null,
    characterIds: shot.characterIds ?? [],
    characterNames: shot.characterNames ?? [],
    sceneName: shot.sceneName ?? null,
    sceneAssetId: shot.sceneAssetId ?? null,
    costumeOverrides: shot.costumeOverrides ?? [],
    propIds: shot.propIds ?? [],
    shotAssetId: shot.shotAssetId ?? null,
    notes: shot.notes ?? null,
    sketchSource: shot.sketchSource ?? null,
    sketchPrompt: shot.sketchPrompt ?? null,
    lineArtUrl: shot.lineArtUrl ?? null,
    sketchApprovedAt: shot.sketchApprovedAt ?? null,
    videoDesc: shot.videoDesc ?? null,
    associateAssetIds: shot.associateAssetIds ?? [],
    tableRowId: shot.tableRowId ?? null,
    subtitleText: shot.subtitleText ?? null,
    sceneId: shot.sceneId ?? null,
    sceneCode: shot.sceneCode ?? null,
    cameraMove: shot.cameraMove ?? null,
    colorGrade: shot.colorGrade ?? null,
    lighting: shot.lighting ?? null,
    guideOverlay: shot.guideOverlay ?? null,
    compositionTemplateId: shot.compositionTemplateId ?? null,
    audioDirection: shot.audioDirection ?? null,
    imagePromptPro: shot.imagePromptPro ?? null,
    videoPromptPro: shot.videoPromptPro ?? null,
  };
}

/**
 * Handoff hash 只覆盖分镜台拥有的结构；导演、3D、审阅和视频写回不得改变它。
 */
export function chainStoryboardHash(
  chain: ChainStoryboardPayload,
  episodeId?: string | null,
): string {
  const scopedShots = episodeId
    ? chain.shots.filter((shot) => shot.episodeId === episodeId)
    : chain.shots;
  const scopedEpisodes = episodeId
    ? (chain.episodes ?? []).filter((episode) => episode.id === episodeId)
    : (chain.episodes ?? []);
  return stableHash(stableSerializeValue({
    hashSchemaVersion: CHAIN_STORYBOARD_HANDOFF_HASH_SCHEMA_VERSION,
    title: chain.title ?? null,
    episodeId: episodeId ?? null,
    episodes: scopedEpisodes.map((episode) => ({
      id: episode.id,
      index: episode.index,
      title: episode.title,
      logline: episode.logline ?? null,
      artDirection: episode.artDirection ?? null,
      cameraStyle: episode.cameraStyle ?? null,
    })),
    confirmed: episodeId
      ? (chain.confirmedEpisodeIds?.includes(episodeId) ?? chain.gridConfirmed ?? false)
      : (chain.gridConfirmed ?? false),
    shots: scopedShots.map(projectHandoffShot),
  }));
}

export function lineArtVersionHash(
  chain: ChainStoryboardPayload,
  episodeId: string | null | undefined,
): string {
  const shots = chain.shots
    .filter((shot) => !episodeId || shot.episodeId === episodeId)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((shot) => ({ shotId: shot.id, lineArtUrl: shot.lineArtUrl ?? null }));
  return stableHash(stableSerializeValue(shots));
}

function hasKeyframeReviewHistory(shot: StoryboardShot): boolean {
  return shot.reviewHistory?.some((event) => event.stage === 'keyframe') ?? false;
}

/**
 * 迁移高置信旧数据：历史分镜 preview 曾被写入 firstFrameAssetId。
 * 有导演审阅历史或上一版关键帧时保持原样，避免误删真实导演产物。
 */
export function migrateLegacyLineArtShot(
  shot: StoryboardShot,
  lineArtCandidate?: string | null,
): { shot: StoryboardShot; migrated: boolean } {
  const firstFrame = shot.firstFrameAssetId?.trim();
  const lineArtUrl = shot.lineArtUrl?.trim() || lineArtCandidate?.trim() || null;
  const isHighConfidencePollution = Boolean(
    firstFrame
    && lineArtUrl
    && firstFrame === lineArtUrl
    && !shot.keyframeProvenance
    && !shot.keyframePreviousUrl
    && !hasKeyframeReviewHistory(shot),
  );
  if (!isHighConfidencePollution) return { shot, migrated: false };
  return {
    shot: {
      ...shot,
      lineArtUrl,
      firstFrameAssetId: null,
      keyframeStatus: 'draft',
      keyframeReviewNote: null,
      status: 'draft',
    },
    migrated: true,
  };
}

/**
 * 合并新拆镜语义与旧链生产状态。
 * 上游镜头/线稿以 base 为准；导演关键帧、3D、审阅和视频产物由 previous 保留。
 */
export function mergeStoryboardShotFromBreakdown(
  base: StoryboardShot,
  previous?: StoryboardShot,
): StoryboardShot {
  if (!previous) {
    return { ...base, sourceRevision: base.sourceRevision ?? 1 };
  }
  const normalized = migrateLegacyLineArtShot(previous, base.lineArtUrl).shot;
  const lineArtUrl = base.lineArtUrl ?? normalized.lineArtUrl ?? null;
  const lineArtChanged = Boolean(
    base.lineArtUrl
    && base.lineArtUrl !== normalized.lineArtUrl,
  );
  const hasKeyframeState = Boolean(
    normalized.firstFrameAssetId
    || (normalized.keyframeStatus && normalized.keyframeStatus !== 'draft'),
  );
  const hasProductionState = Boolean(
    hasKeyframeState
    || normalized.videoAssetId
    || normalized.audioAssetId,
  );
  const merged: StoryboardShot = {
    ...normalized,
    ...base,
    lineArtUrl,
    sketchPrompt: base.sketchPrompt ?? normalized.sketchPrompt ?? null,
    sketchSource: base.sketchSource ?? normalized.sketchSource ?? null,
    sketchApprovedAt: lineArtChanged
      ? null
      : (base.sketchApprovedAt ?? normalized.sketchApprovedAt ?? null),
    firstFrameAssetId: normalized.firstFrameAssetId ?? null,
    keyframePreviousUrl: normalized.keyframePreviousUrl ?? null,
    lastFrameAssetId: normalized.lastFrameAssetId ?? null,
    keyframeStatus: hasKeyframeState
      ? (normalized.keyframeStatus ?? 'draft')
      : 'draft',
    keyframeReviewNote: normalized.keyframeReviewNote ?? null,
    reviewHistory: normalized.reviewHistory,
    director3dGuide: normalized.director3dGuide ?? null,
    videoAssetId: normalized.videoAssetId ?? null,
    videoVersions: normalized.videoVersions,
    adoptedVideoVersionId: normalized.adoptedVideoVersionId ?? null,
    videoStatus: normalized.videoStatus ?? base.videoStatus ?? 'draft',
    audioAssetId: normalized.audioAssetId ?? null,
    usedAssetIds: normalized.usedAssetIds,
    characterRevisionPins: normalized.characterRevisionPins,
    linkedBlockId: normalized.linkedBlockId ?? base.linkedBlockId ?? null,
    status: hasProductionState ? normalized.status : base.status,
  };
  merged.sourceRevision = nextSourceRevision(normalized, merged);
  return merged;
}

export function migrateChainStoryboardMediaRoles(
  chain: ChainStoryboardPayload,
): { chain: ChainStoryboardPayload; migratedCount: number } {
  let migratedCount = 0;
  const shots = chain.shots.map((shot) => {
    const result = migrateLegacyLineArtShot(shot);
    if (result.migrated) migratedCount += 1;
    return result.shot;
  });
  if (migratedCount === 0 && chain.mediaRoleSchemaVersion === 1) {
    return { chain, migratedCount };
  }
  return {
    chain: {
      ...chain,
      mediaRoleSchemaVersion: 1,
      shots,
    },
    migratedCount,
  };
}

export function isDataMediaUrl(url: string | null | undefined): boolean {
  return Boolean(url?.trim().toLowerCase().startsWith('data:'));
}

export function isPersistentMediaUrl(url: string | null | undefined): boolean {
  const value = url?.trim();
  return Boolean(value) && !isDataMediaUrl(value);
}

export function hasDirector3dGuide(shot: Pick<StoryboardShot, 'director3dGuide'>): boolean {
  const guide = shot.director3dGuide;
  if (!guide) return false;
  return Boolean(
    guide.captureUrl
    || guide.captureUrlPendingRepair
    || guide.commitId
    || guide.cameraPosition,
  );
}

/**
 * 把 chain 交付字段里的 Data URL 3D 截图隔离掉，保留机位等非像素字段。
 */
export function quarantineDirector3dDataUrls(
  chain: ChainStoryboardPayload,
): { chain: ChainStoryboardPayload; quarantinedCount: number } {
  let quarantinedCount = 0;
  const shots = chain.shots.map((shot) => {
    const guide = shot.director3dGuide;
    if (!guide || !isDataMediaUrl(guide.captureUrl)) return shot;
    quarantinedCount += 1;
    return {
      ...shot,
      director3dGuide: {
        ...guide,
        captureUrl: '',
        captureUrlPendingRepair: true,
      },
    };
  });
  if (quarantinedCount === 0) return { chain, quarantinedCount };
  return { chain: { ...chain, shots }, quarantinedCount };
}

export function hygieneChainStoryboard(chain: ChainStoryboardPayload): {
  chain: ChainStoryboardPayload;
  migratedCount: number;
  quarantinedCount: number;
} {
  const media = migrateChainStoryboardMediaRoles(chain);
  const quarantined = quarantineDirector3dDataUrls(media.chain);
  return {
    chain: quarantined.chain,
    migratedCount: media.migratedCount,
    quarantinedCount: quarantined.quarantinedCount,
  };
}

/**
 * 从 storyboard-desk 节点 data 中安全读取 ChainStoryboardPayload。
 */
export function readChainStoryboard(nodeData: Record<string, unknown>): ChainStoryboardPayload | undefined {
  const raw = nodeData.chainStoryboard as ChainStoryboardPayload | undefined;
  if (!raw || !Array.isArray(raw.shots)) return undefined;
  return hygieneChainStoryboard(raw).chain;
}

/**
 * 构造写入 storyboard-desk data 的 chainStoryboard 负载。
 */
export function buildChainStoryboardPayload(
  existing: ChainStoryboardPayload | undefined,
  overrides: Partial<ChainStoryboardPayload>,
): ChainStoryboardPayload {
  return {
    version: 2,
    mediaRoleSchemaVersion: 1,
    title: existing?.title,
    activeEpisodeId: existing?.activeEpisodeId ?? null,
    episodes: existing?.episodes ?? [],
    shots: existing?.shots ?? [],
    confirmedEpisodeIds: existing?.confirmedEpisodeIds ?? [],
    gridConfirmed: existing?.gridConfirmed ?? false,
    exportHistory: existing?.exportHistory ?? [],
    ...overrides,
  };
}

/**
 * 上游拥有的镜头内容是否变化。与 handoff hash 投影同一组字段，
 * 导演关键帧 / 3D / 视频写回不会命中。
 */
export function upstreamShotContentChanged(
  previous: StoryboardShot,
  next: StoryboardShot,
): boolean {
  return stableSerializeValue(projectHandoffShot(previous))
    !== stableSerializeValue(projectHandoffShot(next));
}

export function nextSourceRevision(
  previous: StoryboardShot,
  next: StoryboardShot,
): number | undefined {
  if (!upstreamShotContentChanged(previous, next)) return previous.sourceRevision;
  return (previous.sourceRevision ?? 0) + 1;
}

/**
 * 在 chainStoryboard 中按 id 查找并更新单个 shot。
 * 上游内容变化时递增 sourceRevision；显式传入 sourceRevision 时以调用方为准。
 */
export function patchChainShot(
  chain: ChainStoryboardPayload,
  shotId: string,
  patch: Partial<StoryboardShot>,
): StoryboardShot[] {
  return chain.shots.map((shot) => {
    if (shot.id !== shotId) return shot;
    const next = { ...shot, ...patch };
    if (patch.sourceRevision === undefined) {
      next.sourceRevision = nextSourceRevision(shot, next);
    }
    return next;
  });
}

/**
 * 构造分镜台线稿写回字段，避免复用导演台关键帧字段。
 */
export function buildLineArtShotPatch(
  imageUrl: string,
  sketchPrompt?: string,
): Pick<StoryboardShot, 'lineArtUrl' | 'sketchPrompt'> {
  return {
    lineArtUrl: imageUrl,
    ...(sketchPrompt === undefined ? {} : { sketchPrompt }),
  };
}

/**
 * 从 chainStoryboard 解析当前活动的剧集镜头。
 */
export function activeChainEpisodeShots(chain: ChainStoryboardPayload): StoryboardShot[] {
  const activeEpisodeId = chain.activeEpisodeId;
  if (!activeEpisodeId) return chain.shots;
  const scoped = chain.shots.filter((shot) => shot.episodeId === activeEpisodeId);
  return scoped;
}

/**
 * 判断 chain storyboard 是否有镜头。
 */
export function chainHasShots(chain: ChainStoryboardPayload): boolean {
  return chain.shots.length > 0;
}

/**
 * 把全局 StoryboardPayload 迁移到指定 desk 的 chainStoryboard。
 * 按照 activeEpisodeId 或全量 shots 灌入。
 */
export function migrateGlobalToChainStoryboard(
  globalStoryboard: { title?: string; activeEpisodeId?: string | null; episodes?: EpisodeMeta[]; shots: StoryboardShot[]; exportHistory?: EpisodeExportRecord[] },
): ChainStoryboardPayload {
  return {
    version: 2,
    mediaRoleSchemaVersion: 1,
    title: globalStoryboard.title,
    episodes: globalStoryboard.episodes ?? [],
    activeEpisodeId: globalStoryboard.activeEpisodeId ?? null,
    shots: globalStoryboard.shots,
    exportHistory: globalStoryboard.exportHistory ?? [],
    gridConfirmed: false,
    confirmedEpisodeIds: [],
  };
}
