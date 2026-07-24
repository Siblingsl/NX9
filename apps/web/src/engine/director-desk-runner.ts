/**
 * 导演台 · 关键帧批生产
 * P0 队列批出 · P1 状态机/重试 · P2 强制参考/风格锁 · P3 优先 3D + 送视频
 */
import type { Edge, Node } from '@xyflow/react';
import {
  activeEpisodeShots,
  appendStoryboardReviewEvent,
  enrichPromptWithCharacters,
  enrichPromptWithEnvironment,
  pickReferenceImage,
  resolveBlockCharacters,
  type CharacterProfile,
  type EnvironmentProfile,
  type StoryboardShot,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { resolvePictureGenSettings } from './storyboard-preview-runner';
import { runPictureGenJob } from './picture-gen-runner';
import { batchGenerateKeyframesFromShots } from './core-pipeline-runner';
import {
  collectPendingKeyframeIndices,
  openReviewGateSession,
} from './stage-deck/utils/review-gate-session';

export type DirectorDeskQueueFilter = 'missing' | 'failed' | 'selected' | '3donly' | 'all';

/** 单镜生命周期（写入结果，便于 UI / 日志） */
export type DirectorShotPhase =
  | 'queued'
  | 'generating'
  | 'retrying'
  | 'success'
  | 'review'
  | 'approved'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface DirectorDeskBatchOptions {
  shotIds?: string[];
  filter?: DirectorDeskQueueFilter;
  skipExisting?: boolean;
  skipApproved?: boolean;
  concurrency?: number;
  /** P1：失败自动重试次数（不含首次），默认 1 */
  maxRetries?: number;
  /** P1：重试间隔 ms，默认 800 */
  retryDelayMs?: number;
  /** P2：强制注入角色一致性文案 + 参考图优先 */
  forceCharacterRef?: boolean;
  /** P2：强制注入场景一致性文案 + 场景参考 */
  forceSceneRef?: boolean;
  /** P2：统一风格锁：globalArtDirection + stylePrompt + seed */
  styleLock?: boolean;
  /** P2：全局风格补充文案 */
  stylePrompt?: string;
  /** P2：统一 seed（数字）；空则用 picture-gen 的 seed */
  styleSeed?: number | null;
  /** P3：有 3D 截图时优先作参考（默认 true） */
  prefer3dRef?: boolean;
  /** P3：无 3D 参考时仍允许出图（默认 true）；false 则缺 3D 记失败 */
  allowWithout3d?: boolean;
  pictureNodeData?: Record<string, unknown>;
  upstreamPictures?: string[];
  blockData?: Record<string, unknown>;
  onShotStart?: (shot: StoryboardShot, index: number, total: number) => void;
  onShotPhase?: (shot: StoryboardShot, phase: DirectorShotPhase, detail?: string) => void;
  onShotDone?: (
    shot: StoryboardShot,
    result: DirectorDeskShotResult,
    index: number,
    total: number,
  ) => void;
  shouldAbort?: () => boolean;
}

export interface DirectorDeskShotResult {
  shotId: string;
  index: number;
  ok: boolean;
  url?: string;
  error?: string;
  skipped?: boolean;
  prompt?: string;
  attempts?: number;
  phase?: DirectorShotPhase;
  usedRefs?: string[];
}

export interface DirectorDeskBatchSummary {
  results: DirectorDeskShotResult[];
  done: number;
  failed: number;
  skipped: number;
  total: number;
  lastUrl?: string;
  retried?: number;
}

export function findDirectorPictureGenNode(
  deskBlockId: string,
  nodes: Node[],
  edges: Edge[],
): Node | undefined {
  for (const edge of edges) {
    if (edge.source === deskBlockId) {
      const n = nodes.find((x) => x.id === edge.target && x.type === 'picture-gen');
      if (n) return n;
    }
    if (edge.target === deskBlockId) {
      const n = nodes.find((x) => x.id === edge.source && x.type === 'picture-gen');
      if (n) return n;
    }
  }
  return nodes.find((n) => n.type === 'picture-gen');
}

export function findDirectorClipGenNode(
  deskBlockId: string,
  nodes: Node[],
  edges: Edge[],
): Node | undefined {
  for (const edge of edges) {
    if (edge.source === deskBlockId) {
      const n = nodes.find((x) => x.id === edge.target && x.type === 'clip-gen');
      if (n) return n;
    }
    if (edge.target === deskBlockId) {
      const n = nodes.find((x) => x.id === edge.source && x.type === 'clip-gen');
      if (n) return n;
    }
  }
  // 只认连线；不回落到任意 clip-gen，保证各视频节点独立
  return undefined;
}

/**
 * 把导演台统一风格写回图像生成节点（seed / 风格句 / negative 等）
 * 批出前调用，保证后续单镜出图与批出一致。
 */
export function syncStyleToPictureGen(args: {
  deskBlockId: string;
  nodes: Node[];
  edges: Edge[];
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  styleSeed?: number | null;
  stylePrompt?: string;
  styleLock?: boolean;
  /** 额外从导演台带过去的负向词 */
  negativePrompt?: string;
}): { pictureGenId?: string; synced: boolean; patch: Record<string, unknown> } {
  const picture = findDirectorPictureGenNode(args.deskBlockId, args.nodes, args.edges);
  if (!picture) return { synced: false, patch: {} };

  const patch: Record<string, unknown> = {
    directorStyleSyncedAt: new Date().toISOString(),
    directorStyleFrom: args.deskBlockId,
  };

  if (args.styleSeed != null && Number.isFinite(args.styleSeed)) {
    patch.seed = args.styleSeed;
  }
  if (args.stylePrompt?.trim()) {
    patch.stylePrompt = args.stylePrompt.trim();
    const existing = String(
      (picture.data as Record<string, unknown> | undefined)?.content ?? '',
    ).trim();
    if (!existing) {
      patch.content = args.stylePrompt.trim();
    }
  }
  if (args.styleLock != null) {
    patch.styleLock = args.styleLock;
  }
  if (args.negativePrompt?.trim()) {
    patch.negativePrompt = args.negativePrompt.trim();
  }

  args.updateNodeData(picture.id, patch);
  return { pictureGenId: picture.id, synced: true, patch };
}

/**
 * 批出成功后：打开审片会话（宫格批审）；门禁以镜头 keyframeStatus 为准
 */
export function openReviewAfterDirectorBatch(args: {
  deskBlockId: string;
  nodes: Node[];
  edges: Edge[];
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  /** 本次成功出帧的 shot id（保留参数，兼容调用方） */
  succeededShotIds?: string[];
  openSession?: boolean;
}): {
  pendingIndices: number[];
  opened: boolean;
  gatePassed: boolean;
} {
  void args.nodes;
  void args.edges;
  void args.updateNodeData;
  void args.succeededShotIds;
  const synced = summarizePendingKeyframeGate();

  let opened = false;
  if (args.openSession !== false) {
    openReviewGateSession({
      pendingIndices: synced.pendingIndices.length
        ? synced.pendingIndices
        : collectPendingKeyframeIndices(),
      stage: 'keyframe',
      source: 'director-desk',
    });
    opened = true;
  }

  return {
    pendingIndices: synced.pendingIndices,
    opened,
    gatePassed: synced.gatePassed,
  };
}


export function shotKeyframePrompt(shot: StoryboardShot): string {
  return (
    shot.imagePromptPro?.trim() ||
    shot.promptEn?.trim() ||
    shot.descriptionZh?.trim() ||
    shot.videoPromptEn?.trim() ||
    shot.videoPromptPro?.trim() ||
    `cinematic ${shot.shotType || 'medium'} shot`
  );
}

export function isShotMissingKeyframe(shot: StoryboardShot): boolean {
  return !shot.firstFrameAssetId;
}

export function isShotKeyframeFailed(shot: StoryboardShot): boolean {
  return shot.keyframeStatus === 'failed' || shot.status === 'failed';
}

export function isShotKeyframeApproved(shot: StoryboardShot): boolean {
  return shot.keyframeStatus === 'approved' || shot.status === 'approved';
}

export function summarizeDirectorQueue(shots: StoryboardShot[]) {
  let missing = 0;
  let done = 0;
  let failed = 0;
  let review = 0;
  let approved = 0;
  let with3d = 0;
  for (const s of shots) {
    if (s.director3dGuide?.captureUrl) with3d += 1;
    if (isShotKeyframeFailed(s)) failed += 1;
    else if (isShotKeyframeApproved(s) && s.firstFrameAssetId) approved += 1;
    else if (s.firstFrameAssetId && (s.keyframeStatus === 'review' || s.status === 'review')) review += 1;
    else if (s.firstFrameAssetId) done += 1;
    else missing += 1;
  }
  return {
    total: shots.length,
    missing,
    done: done + approved + review,
    withFrame: shots.filter((s) => s.firstFrameAssetId).length,
    failed,
    review,
    approved,
    with3d,
  };
}

/** 关键帧批审统计（与审阅关卡 keyframe 门禁口径一致） */
export function summarizeDirectorKeyframeReview(shots: StoryboardShot[]) {
  let missing = 0;
  let pending = 0;
  let approved = 0;
  let failed = 0;
  for (const s of shots) {
    if (!s.firstFrameAssetId) missing += 1;
    else if (isShotKeyframeApproved(s)) approved += 1;
    else if (isShotKeyframeFailed(s)) failed += 1;
    else pending += 1;
  }
  return { total: shots.length, missing, pending, approved, failed };
}

/**
 * 关键帧门禁是否放行：本集每镜均为 approved（缺图 / 待审 / 打回均不算通过）。
 * 与服务端 `validateReviewGate(..., 'keyframe')` 对齐。
 */
export function isDirectorKeyframeGatePassed(shots: StoryboardShot[]): boolean {
  return shots.length > 0 && shots.every((s) => isShotKeyframeApproved(s));
}

/** 当前集关键帧待审 index + 是否放行（替代原审阅关卡节点同步） */
export function summarizePendingKeyframeGate(): {
  pendingIndices: number[];
  gatePassed: boolean;
} {
  const shots = activeEpisodeShots(useWorkspaceDocument.getState().storyboard);
  const pending = shots
    .filter((s) => !isShotKeyframeApproved(s))
    .map((s) => s.index)
    .sort((a, b) => a - b);
  return {
    pendingIndices: pending,
    gatePassed: shots.length > 0 && pending.length === 0,
  };
}

/** @deprecated 审阅关卡已拆除；保留别名以免外部调用方瞬时断裂 */
export function syncDirectorReviewGateFromShots(_args?: {
  deskBlockId?: string;
  nodes?: Node[];
  edges?: Edge[];
  updateNodeData?: (id: string, patch: Record<string, unknown>) => void;
}): { reviewGateId?: string; pendingIndices: number[]; gatePassed: boolean } {
  const synced = summarizePendingKeyframeGate();
  return { pendingIndices: synced.pendingIndices, gatePassed: synced.gatePassed };
}

export function approveDirectorKeyframe(shotId: string): boolean {
  const doc = useWorkspaceDocument.getState();
  const shot = doc.storyboard.shots.find((s) => s.id === shotId);
  if (!shot?.firstFrameAssetId) return false;
  const event = {
    id: `review-${shot.id}-${Date.now()}`,
    stage: 'keyframe' as const,
    decision: 'approved' as const,
    createdAt: new Date().toISOString(),
  };
  doc.updateShot(shot.id, {
    status: 'approved',
    keyframeStatus: 'approved',
    keyframeReviewNote: null,
    reviewHistory: appendStoryboardReviewEvent(shot, event),
  });
  return true;
}

/** 有图且未批准的镜头全部通过；缺图时返回 0（与审阅关卡「全部通过」一致） */
export function approveAllDirectorKeyframes(): number {
  const doc = useWorkspaceDocument.getState();
  const shots = activeEpisodeShots(doc.storyboard);
  if (shots.some((s) => !s.firstFrameAssetId)) return 0;
  let n = 0;
  for (const shot of shots) {
    if (isShotKeyframeApproved(shot)) continue;
    if (!shot.firstFrameAssetId) continue;
    const event = {
      id: `review-${shot.id}-${Date.now()}-${n}`,
      stage: 'keyframe' as const,
      decision: 'approved' as const,
      createdAt: new Date().toISOString(),
    };
    doc.updateShot(shot.id, {
      keyframeStatus: 'approved',
      status: 'approved',
      keyframeReviewNote: null,
      reviewHistory: appendStoryboardReviewEvent(shot, event),
    });
    n += 1;
  }
  return n;
}

export async function rejectDirectorKeyframe(args: {
  shotId: string;
  comment: string;
  regenerate?: boolean;
}): Promise<{ ok: boolean; regenerated?: boolean }> {
  const comment = args.comment.trim();
  if (!comment) return { ok: false };
  const doc = useWorkspaceDocument.getState();
  const shot = doc.storyboard.shots.find((s) => s.id === args.shotId);
  if (!shot) return { ok: false };
  const event = {
    id: `review-${shot.id}-${Date.now()}`,
    stage: 'keyframe' as const,
    decision: 'rejected' as const,
    comment,
    createdAt: new Date().toISOString(),
  };
  doc.updateShot(shot.id, {
    status: 'failed',
    keyframeStatus: 'failed',
    keyframeReviewNote: comment,
    reviewHistory: appendStoryboardReviewEvent(shot, event),
  });
  if (!args.regenerate) return { ok: true, regenerated: false };
  await batchGenerateKeyframesFromShots([shot.id], true);
  return { ok: true, regenerated: true };
}

export function resolveDirectorQueueShots(
  allActive: StoryboardShot[],
  opts: {
    filter?: DirectorDeskQueueFilter;
    selectedIds?: string[];
    skipExisting?: boolean;
    skipApproved?: boolean;
  },
): StoryboardShot[] {
  const filter = opts.filter ?? 'missing';
  const skipExisting = opts.skipExisting ?? true;
  const skipApproved = opts.skipApproved ?? true;
  let list: StoryboardShot[];

  if (filter === 'selected') {
    const set = new Set(opts.selectedIds ?? []);
    list = allActive.filter((s) => set.has(s.id));
  } else if (filter === 'failed') {
    list = allActive.filter(isShotKeyframeFailed);
  } else if (filter === '3donly') {
    list = allActive.filter((s) => s.director3dGuide?.captureUrl);
  } else if (filter === 'all') {
    list = [...allActive];
  } else {
    list = allActive.filter((s) => isShotMissingKeyframe(s) || isShotKeyframeFailed(s));
  }

  return list.filter((s) => {
    if (skipApproved && isShotKeyframeApproved(s) && s.firstFrameAssetId) return false;
    if (
      skipExisting &&
      filter !== 'failed' &&
      filter !== 'selected' &&
      s.firstFrameAssetId &&
      !isShotKeyframeFailed(s)
    ) {
      return false;
    }
    if (skipExisting && filter === 'all' && s.firstFrameAssetId && !isShotKeyframeFailed(s)) {
      return false;
    }
    return true;
  });
}

function resolveShotEnvironment(
  shot: StoryboardShot,
  environments: EnvironmentProfile[],
): EnvironmentProfile | undefined {
  if (shot.sceneCode) {
    const byCode = environments.find((e) => e.sceneCode === shot.sceneCode);
    if (byCode) return byCode;
  }
  if (shot.sceneName) {
    const name = shot.sceneName.trim().toLowerCase();
    return environments.find((e) => e.name.trim().toLowerCase() === name);
  }
  return undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface BuiltShotPrompt {
  prompt: string;
  referenceImageUrl?: string;
  referenceImageUrls: string[];
  styleImageUrl?: string;
  usedRefs: string[];
  missingForced: string[];
}

function buildShotPrompt(
  shot: StoryboardShot,
  characters: CharacterProfile[],
  opts: DirectorDeskBatchOptions,
): BuiltShotPrompt {
  const doc = useWorkspaceDocument.getState();
  const environments = doc.environments?.environments ?? [];
  const env = resolveShotEnvironment(shot, environments);
  const forceChar = opts.forceCharacterRef ?? true;
  const forceScene = opts.forceSceneRef ?? true;
  const styleLock = opts.styleLock ?? true;
  const prefer3d = opts.prefer3dRef ?? true;

  let prompt = shotKeyframePrompt(shot);
  const missingForced: string[] = [];
  const usedRefs: string[] = [];
  const referenceImageUrls: string[] = [];

  // 角色
  if (characters.length > 0) {
    prompt = enrichPromptWithCharacters(prompt, characters);
  } else if (forceChar && (shot.characterIds?.length || shot.characterNames?.length)) {
    missingForced.push('角色参考未入库');
  }

  // 场景
  if (env) {
    const envSuffix = enrichPromptWithEnvironment('', env);
    if (envSuffix) prompt = `${prompt}\n${envSuffix}`;
  } else if (forceScene && (shot.sceneCode || shot.sceneName)) {
    missingForced.push('场景未入库');
  }

  // 镜级 craft
  const craft: string[] = [];
  if (shot.lighting?.trim()) craft.push(`lighting: ${shot.lighting.trim()}`);
  if (shot.colorGrade?.trim()) craft.push(`color grade: ${shot.colorGrade.trim()}`);
  if (shot.cameraMove?.trim()) craft.push(`camera move: ${shot.cameraMove.trim()}`);
  if (craft.length) prompt = `${prompt}\n${craft.join(', ')}`;

  // P2 风格锁
  if (styleLock) {
    const globalStyle = doc.storyboard.globalArtDirection?.trim();
    const ep = doc.storyboard.episodes?.find((e) => e.id === shot.episodeId);
    const epStyle = ep?.artDirection?.trim();
    const custom = opts.stylePrompt?.trim() || (opts.blockData?.stylePrompt as string | undefined)?.trim();
    const styleBits = [globalStyle, epStyle, custom].filter(Boolean);
    if (styleBits.length) {
      prompt = `${prompt}\n\n[Style lock — keep consistent across shots]\n${styleBits.join('\n')}`;
    }
  }

  // 参考图优先级：3D → 角色 → 场景 → 上游
  const d3 = shot.director3dGuide?.captureUrl?.trim();
  const charRef = pickReferenceImage(characters, []);
  const envRef = env?.referenceImageUrl?.trim() || env?.referenceUrls?.[0]?.trim();
  const upstream = opts.upstreamPictures?.find((u) => u?.trim());

  if (prefer3d && d3) {
    referenceImageUrls.push(d3);
    usedRefs.push('3d');
  }
  if (charRef) {
    if (!referenceImageUrls.includes(charRef)) referenceImageUrls.push(charRef);
    usedRefs.push('character');
  } else if (forceChar && characters.length > 0) {
    // 有角色档案但无图
    missingForced.push('角色缺参考图');
  }
  if (envRef) {
    if (!referenceImageUrls.includes(envRef)) referenceImageUrls.push(envRef);
    usedRefs.push('scene');
  } else if (forceScene && env) {
    missingForced.push('场景缺参考图');
  }
  if (upstream && !referenceImageUrls.includes(upstream)) {
    referenceImageUrls.push(upstream);
    usedRefs.push('upstream');
  }

  // 风格图：picture-gen 的 style 或第一张场景图
  const pictureStyle = (opts.pictureNodeData?.styleImageUrl as string | undefined)?.trim();
  const styleImageUrl = pictureStyle || (styleLock ? envRef : undefined);

  const primaryRef = referenceImageUrls[0];

  // 强提示：有参考时写进 prompt
  if (primaryRef && forceChar && characters.length) {
    prompt = `${prompt}\n\n[Use character reference likeness; keep face/costume consistent]`;
  }
  if (prefer3d && d3) {
    prompt = `${prompt}\n\n[Match 3D blocking camera composition and staging]`;
  }

  return {
    prompt,
    referenceImageUrl: primaryRef,
    referenceImageUrls,
    styleImageUrl,
    usedRefs,
    missingForced,
  };
}

async function attemptGenerate(
  shot: StoryboardShot,
  opts: DirectorDeskBatchOptions,
  attempt: number,
): Promise<DirectorDeskShotResult> {
  const doc = useWorkspaceDocument.getState();
  const characters = resolveBlockCharacters(
    opts.blockData,
    shot,
    doc.characters.characters,
  );
  const built = buildShotPrompt(shot, characters, opts);

  if (opts.allowWithout3d === false && !shot.director3dGuide?.captureUrl) {
    doc.updateShot(shot.id, { status: 'failed', keyframeStatus: 'failed' });
    return {
      shotId: shot.id,
      index: shot.index,
      ok: false,
      error: '需要 3D 机位截图',
      prompt: built.prompt,
      attempts: attempt,
      phase: 'failed',
      usedRefs: built.usedRefs,
    };
  }

  const pictureData = opts.pictureNodeData ?? {};
  const { modelId, size } = resolvePictureGenSettings(pictureData);
  const seedFromPicture =
    typeof pictureData.seed === 'number' && Number.isFinite(pictureData.seed)
      ? (pictureData.seed as number)
      : undefined;
  const seed =
    opts.styleSeed != null && Number.isFinite(opts.styleSeed)
      ? opts.styleSeed
      : seedFromPicture;
  const negativePrompt =
    (pictureData.negativePrompt as string | undefined) ||
    (opts.blockData?.negativePrompt as string | undefined);

  doc.updateShot(shot.id, {
    status: 'generating',
    keyframeStatus: 'draft',
  });
  opts.onShotPhase?.(shot, attempt > 1 ? 'retrying' : 'generating', `attempt ${attempt}`);

  try {
    const urls = await runPictureGenJob({
      prompt: built.prompt,
      modelId,
      size,
      referenceImageUrl: built.referenceImageUrl,
      referenceImageUrls: built.referenceImageUrls,
      styleImageUrl: built.styleImageUrl,
      seed,
      negativePrompt,
      n: 1,
    });
    const url = urls[0];
    if (!url) throw new Error('图像生成未返回 URL');

    const reviewMode = doc.storyboard.reviewMode;
    const nextStatus = reviewMode === 'manual' ? 'review' : 'approved';
    doc.updateShot(shot.id, {
      status: nextStatus,
      keyframeStatus: nextStatus,
      firstFrameAssetId: url,
    });

    const phase: DirectorShotPhase = nextStatus === 'approved' ? 'approved' : 'review';
    opts.onShotPhase?.(shot, phase);

    return {
      shotId: shot.id,
      index: shot.index,
      ok: true,
      url,
      prompt: built.prompt,
      attempts: attempt,
      phase,
      usedRefs: built.usedRefs,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const warn =
      built.missingForced.length > 0
        ? `${message}（提示: ${built.missingForced.join('、')}）`
        : message;
    doc.updateShot(shot.id, {
      status: 'failed',
      keyframeStatus: 'failed',
    });
    opts.onShotPhase?.(shot, 'failed', warn);
    return {
      shotId: shot.id,
      index: shot.index,
      ok: false,
      error: warn,
      prompt: built.prompt,
      attempts: attempt,
      phase: 'failed',
      usedRefs: built.usedRefs,
    };
  }
}

async function generateOneShotWithRetry(
  shot: StoryboardShot,
  opts: DirectorDeskBatchOptions,
): Promise<DirectorDeskShotResult> {
  const maxRetries = Math.min(3, Math.max(0, opts.maxRetries ?? 1));
  const delay = Math.max(0, opts.retryDelayMs ?? 800);
  let last: DirectorDeskShotResult | undefined;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    if (opts.shouldAbort?.()) {
      return {
        shotId: shot.id,
        index: shot.index,
        ok: false,
        skipped: true,
        error: '已取消',
        attempts: attempt - 1,
        phase: 'cancelled',
      };
    }
    last = await attemptGenerate(shot, opts, attempt);
    if (last.ok) return last;
    if (attempt <= maxRetries) {
      opts.onShotPhase?.(shot, 'retrying', `等待重试 ${attempt}/${maxRetries}`);
      if (delay > 0) await sleep(delay);
    }
  }

  return last ?? {
    shotId: shot.id,
    index: shot.index,
    ok: false,
    error: '未知失败',
    phase: 'failed',
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  shouldAbort?: () => boolean,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      if (shouldAbort?.()) break;
      const i = cursor;
      cursor += 1;
      results[i] = await worker(items[i], i);
    }
  }

  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => runWorker()));
  return results.filter((r) => r !== undefined);
}

function buildQueue(opts: DirectorDeskBatchOptions): StoryboardShot[] {
  const storyboard = useWorkspaceDocument.getState().storyboard;
  const active = activeEpisodeShots(storyboard);
  const filter = opts.filter ?? (opts.shotIds?.length ? 'selected' : 'missing');

  if (opts.shotIds && opts.shotIds.length > 0 && filter === 'selected') {
    return resolveDirectorQueueShots(active, {
      filter: 'selected',
      selectedIds: opts.shotIds,
      skipExisting: opts.skipExisting,
      skipApproved: opts.skipApproved,
    });
  }
  if (opts.shotIds && opts.shotIds.length > 0) {
    return active.filter((s) => opts.shotIds!.includes(s.id)).filter((s) => {
      if ((opts.skipApproved ?? true) && isShotKeyframeApproved(s) && s.firstFrameAssetId) {
        return false;
      }
      if ((opts.skipExisting ?? true) && s.firstFrameAssetId && !isShotKeyframeFailed(s)) {
        return false;
      }
      return true;
    });
  }
  return resolveDirectorQueueShots(active, {
    filter,
    selectedIds: opts.shotIds,
    skipExisting: opts.skipExisting,
    skipApproved: opts.skipApproved,
  });
}

export async function runDirectorDeskBatch(
  opts: DirectorDeskBatchOptions = {},
): Promise<DirectorDeskBatchSummary> {
  const queue = buildQueue(opts);

  if (queue.length === 0) {
    return { results: [], done: 0, failed: 0, skipped: 0, total: 0, retried: 0 };
  }

  const concurrency = Math.min(3, Math.max(1, opts.concurrency ?? 2));
  let completed = 0;
  let retried = 0;

  for (const shot of queue) {
    opts.onShotPhase?.(shot, 'queued');
  }

  const results = await mapPool(
    queue,
    concurrency,
    async (shot, index) => {
      if (opts.shouldAbort?.()) {
        return {
          shotId: shot.id,
          index: shot.index,
          ok: false,
          skipped: true,
          error: '已取消',
          phase: 'cancelled' as const,
        } satisfies DirectorDeskShotResult;
      }
      opts.onShotStart?.(shot, index, queue.length);
      const result = await generateOneShotWithRetry(shot, opts);
      if ((result.attempts ?? 1) > 1) retried += 1;
      completed += 1;
      opts.onShotDone?.(shot, result, completed - 1, queue.length);
      return result;
    },
    opts.shouldAbort,
  );

  const done = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const lastUrl = [...results].reverse().find((r) => r.url)?.url;

  return {
    results,
    done,
    failed,
    skipped,
    total: queue.length,
    lastUrl,
    retried,
  };
}

export function getActiveEpisodeShots(): StoryboardShot[] {
  return activeEpisodeShots(useWorkspaceDocument.getState().storyboard);
}

/**
 * P3：把已有关键帧的镜头写到视频生成节点（linkedShotId + 参考图提示）
 * 返回更新的 clip-gen 节点 id 数量
 */
export function pushKeyframesToClipGen(args: {
  deskBlockId: string;
  nodes: Node[];
  edges: Edge[];
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  shotIds?: string[];
  /** 强制推送时跳过 clip-gen 关键帧门禁 */
  bypassKeyframeGate?: boolean;
}): { clipGenId?: string; shotCount: number; firstShotId?: string } {
  const clip = findDirectorClipGenNode(args.deskBlockId, args.nodes, args.edges);
  if (!clip) return { shotCount: 0 };

  const active = activeEpisodeShots(useWorkspaceDocument.getState().storyboard);
  const targets = (args.shotIds?.length
    ? active.filter((s) => args.shotIds!.includes(s.id))
    : active
  ).filter((s) => s.firstFrameAssetId);

  if (targets.length === 0) return { clipGenId: clip.id, shotCount: 0 };

  const first = targets[0];
  const pictures = targets.map((s) => s.firstFrameAssetId!).filter(Boolean);
  args.updateNodeData(clip.id, {
    linkedShotId: first.id,
    linkedShotIds: targets.map((s) => s.id),
    content:
      first.videoPromptPro ||
      first.videoPromptEn ||
      first.promptEn ||
      first.descriptionZh ||
      '',
    previewUrl: first.firstFrameAssetId,
    directorDeskRefs: pictures,
    message: `已从导演台写入 ${targets.length} 镜关键帧参考`,
    bypassKeyframeGate: args.bypassKeyframeGate === true,
  });

  return { clipGenId: clip.id, shotCount: targets.length, firstShotId: first.id };
}

/** O-6: 根据镜头描述生成 3D 摆位文本建议（无自动桥，仅供提示） */
export function suggestCameraPosition(shot: {
  index?: number;
  descriptionZh?: string;
  promptEn?: string;
  shotSize?: string;
  cameraMove?: string;
  cameraAngle?: string;
  scene?: string;
  characters?: string[];
}): { shotIndex: number; suggestedCamera: string; suggestedAngle: string; suggestedDistance: string; notes: string } {
  const size = shot.shotSize || 'MS';
  const move = shot.cameraMove || '固定';
  const angle = shot.cameraAngle || '平拍';
  const distMap: Record<string, string> = { ECU: '0.3m', CU: '1m', MS: '2m', FS: '3m', WS: '6m' };
  const angleMap: Record<string, string> = { '平拍': 'eye-level', '俯拍': 'overhead', '仰拍': 'low-angle' };
  const desc = shot.descriptionZh || shot.promptEn || '';
  const chars = shot.characters?.join('/') || '主体';
  const scene = shot.scene || '场景';
  return {
    shotIndex: shot.index ?? 0,
    suggestedCamera: `${scene} · ${move}机位，焦段 ${distMap[size] || '2m'}`,
    suggestedAngle: angleMap[angle] || 'eye-level',
    suggestedDistance: distMap[size] || '2m',
    notes: `角色 ${chars} · ${size}景别 · ${angle}${desc ? ` · ${desc.slice(0, 40)}` : ''}`,
  };
}
