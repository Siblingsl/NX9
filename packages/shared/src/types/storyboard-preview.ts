import type { StoryboardDirector3dGuide, StoryboardShot } from './storyboard';
import type { ScriptBreakdownShot } from './script-breakdown';

/** 分镜预览帧状态 — Video Proof 专用，区别于 StoryboardShot.status */
export type StoryboardPreviewFrameStatus =
  | 'idle'
  | 'generating'
  | 'success'
  | 'error'
  | 'modified'
  | 'locked';

export type StoryboardPreviewViewMode = 'grid' | 'timeline' | 'storyboard';

export type StoryboardPreviewGridColumns = 2 | 3 | 4;

/** 分镜预览调度图像生成时的出图参数（每帧固定 1 张） */
export type StoryboardPreviewPictureSettings = {
  model: string;
  pictureGenMode: 'text-to-image' | 'image-to-image';
  quality: string;
  aspectRatio: string;
};

/** 3D 导演台写入分镜帧的机位参考；正式成图仍由 picture-gen 执行。 */
export interface StoryboardPreviewDirector3dGuide extends StoryboardDirector3dGuide {}

/** 分镜预览统一管理的 720°（360×180）2:1 等距柱状场景环境。 */
export interface StoryboardPreviewPanorama720 {
  imageUrl: string;
  prompt: string;
  sourcePictureNodeId: string;
  /** episodeId::sceneId；旧数据可为空。 */
  scopeKey?: string;
  updatedAt: string;
}

export const DEFAULT_STORYBOARD_PREVIEW_PICTURE_SETTINGS: StoryboardPreviewPictureSettings = {
  model: 'dall-e-3',
  pictureGenMode: 'text-to-image',
  quality: 'auto',
  aspectRatio: '16:9',
};

/** 单张分镜预览帧 */
export interface StoryboardPreviewFrame {
  id: string;
  /** 排序序号，支持 3.5 等插入序号 */
  order: number;
  label: string;
  startSec: number;
  endSec: number;
  /** 关联 Storyboard Shot（主镜头） */
  sourceShotId: string;
  /** 可选关联多个 Shot（合成/过渡） */
  relatedShotIds?: string[];
  sceneCode?: string | null;
  sceneId?: string | null;
  promptSummary: string;
  characterIds?: string[];
  characterNames?: string[];
  sceneAssetRef?: string | null;
  imageUrl?: string | null;
  referenceImageUrl?: string | null;
  /** 3D 构图与机位数据，作为图像生成参考，不等同于最终分镜图。 */
  director3dGuide?: StoryboardPreviewDirector3dGuide | null;
  /** 批审退回意见，重新出图时进入 Prompt。 */
  reviewNote?: string | null;
  stylePreset?: string | null;
  status: StoryboardPreviewFrameStatus;
  /** 🔒 锁定后禁止任何批量/全量/修复触发的重新生成 */
  locked: boolean;
  errorMessage?: string | null;
  /** 用户手动修改标记 */
  userModified?: boolean;
}

/** 节点 data.storyboardPreview 载荷 */
export interface StoryboardPreviewPayload {
  version: 1;
  viewMode: StoryboardPreviewViewMode;
  gridColumns: StoryboardPreviewGridColumns;
  frames: StoryboardPreviewFrame[];
  /** AI 计算的目标帧数（展示用） */
  computedFrameCount: number;
  totalDurationSec: number;
  /** 全部 Success 且用户确认 */
  confirmed: boolean;
  confirmedAt?: string | null;
  /** 当前选中帧（单张编辑） */
  selectedFrameId?: string | null;
  /** 一致性检查最近一次结果 */
  lastConsistencyReport?: StoryboardPreviewConsistencyReport | null;
  /** 出图参数 — 由分镜预览统一调度并同步至图像生成节点 */
  pictureSettings: StoryboardPreviewPictureSettings;
  /** 可加载至 3D 导演台的全景环境。 */
  panorama720?: StoryboardPreviewPanorama720 | null;
  /** 不同分集/场景独立保存，panorama720 是当前所选场景投影。 */
  panorama720ByScope?: Record<string, StoryboardPreviewPanorama720>;
}

export interface StoryboardPreviewConsistencyDimension {
  id: 'character' | 'costume' | 'scene' | 'camera' | 'lighting' | 'timeline';
  label: string;
  score: number;
  issues: Array<{ frameId: string; message: string }>;
}

export interface StoryboardPreviewConsistencyReport {
  checkedAt: string;
  overallScore: number;
  dimensions: StoryboardPreviewConsistencyDimension[];
}

/** AI 自动计算帧数输入 */
export interface StoryboardPreviewComputeInput {
  totalDurationSec: number;
  shotCount: number;
  sceneCount: number;
  /** 镜头切换次数 */
  cutCount: number;
  /** 动作复杂度 0~1 */
  actionComplexity: number;
}

/** 预留扩展接口 — 本期不实现 */
export interface StoryboardPreviewAiExtensions {
  suggestInbetweenFrames?: (frames: StoryboardPreviewFrame[]) => Promise<unknown>;
  optimizeShotRhythm?: (shots: StoryboardShot[]) => Promise<unknown>;
  adjustShotDuration?: (shotId: string, nextSec: number) => Promise<unknown>;
  pruneDuplicateShots?: (shots: StoryboardShot[]) => Promise<unknown>;
  recommendTransition?: (fromFrameId: string, toFrameId: string) => Promise<unknown>;
  recommendCameraMove?: (frameId: string) => Promise<unknown>;
  recommendBgm?: (frames: StoryboardPreviewFrame[]) => Promise<unknown>;
  generateShotNotes?: (frameId: string) => Promise<unknown>;
  generateDirectorNotes?: (sceneId: string) => Promise<unknown>;
  generateSubtitleHints?: (frameId: string) => Promise<unknown>;
}

export function emptyStoryboardPreview(): StoryboardPreviewPayload {
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

export function resolveStoryboardPreviewPictureSettings(
  payload: StoryboardPreviewPayload | undefined,
): StoryboardPreviewPictureSettings {
  return payload?.pictureSettings ?? { ...DEFAULT_STORYBOARD_PREVIEW_PICTURE_SETTINGS };
}

/**
 * 自动计算分镜预览帧数（启发式，后续可替换为 LLM）。
 * 15s≈4 · 30s≈8 · 60s≈15 — 非固定公式，随镜头/场景/切换密度浮动。
 */
export function computeStoryboardPreviewFrameCount(input: StoryboardPreviewComputeInput): number {
  const { totalDurationSec, shotCount, sceneCount, cutCount, actionComplexity } = input;
  if (shotCount <= 0 || totalDurationSec <= 0) return 0;

  const secPerFrame =
    actionComplexity > 0.65 ? 3.2 : actionComplexity > 0.35 ? 3.75 : 4.2;
  const byDuration = Math.max(1, Math.round(totalDurationSec / secPerFrame));
  const sceneBoost = Math.max(0, Math.floor((sceneCount - 1) * 0.35));
  const cutBoost = Math.floor(cutCount * 0.12 * (0.5 + actionComplexity));
  const raw = byDuration + sceneBoost + cutBoost;

  return Math.max(1, Math.min(shotCount, raw));
}

/** 估算动作复杂度：镜头类型 + 时长波动 */
export function estimateActionComplexity(shots: StoryboardShot[]): number {
  if (shots.length === 0) return 0;
  const closeRatio = shots.filter((s) => s.shotType === 'close' || s.shotType === 'extreme-wide').length / shots.length;
  const durVar =
    shots.reduce((acc, s, _, arr) => {
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
export function buildStoryboardPreviewFrames(
  shots: StoryboardShot[],
  opts?: { keyOnly?: boolean },
): StoryboardPreviewFrame[] {
  if (shots.length === 0) return [];

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
    } satisfies StoryboardPreviewFrame;
  });
}

/** 从剧本拆分分镜构建预览时间轴帧 */
export function buildStoryboardPreviewFramesFromBreakdown(
  shots: ScriptBreakdownShot[],
): StoryboardPreviewFrame[] {
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
    } satisfies StoryboardPreviewFrame;
  });
}

/** 均匀采样关键镜头（保留首尾 + 中间分布） */
function pickKeyShots(shots: StoryboardShot[], count: number): StoryboardShot[] {
  if (count <= 1) return [shots[0]];
  if (count >= shots.length) return shots;
  const indices = new Set<number>([0, shots.length - 1]);
  const step = (shots.length - 1) / (count - 1);
  for (let i = 1; i < count - 1; i++) {
    indices.add(Math.round(i * step));
  }
  return [...indices].sort((a, b) => a - b).map((i) => shots[i]);
}

export function storyboardPreviewSummary(payload: StoryboardPreviewPayload | undefined): {
  total: number;
  success: number;
  locked: number;
  ready: boolean;
} {
  const frames = payload?.frames ?? [];
  const total = frames.length;
  const success = frames.filter((f) => f.status === 'success' || f.status === 'locked').length;
  const locked = frames.filter((f) => f.locked).length;
  const ready = total > 0 && success === total && Boolean(payload?.confirmed);
  return { total, success, locked, ready };
}

export function canRegenerateFrame(frame: StoryboardPreviewFrame): boolean {
  return !frame.locked && frame.status !== 'generating';
}

export function canConfirmStoryboardPreview(payload: StoryboardPreviewPayload): boolean {
  if (payload.frames.length === 0) return false;
  return payload.frames.every((f) => f.status === 'success' || f.status === 'locked');
}
