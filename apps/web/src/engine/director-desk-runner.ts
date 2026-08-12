/**
 * 导演台 · 关键帧批生产
 * P0 队列批出 · P1 状态机/重试 · P2 强制参考/风格锁 · P3 优先 3D + 送视频
 */
import type { Edge, Node } from '@xyflow/react';
import { findChainShot } from './chain-storyboard-aggregate';
import {
  appendStoryboardReviewEvent,
  enrichPromptWithEnvironment,
  enrichPromptWithShotAssets,
  costumeSourcesFromWorkspace,
  propSourcesFromWorkspace,
  shotLexiconSourcesFromWorkspace,
  pickReferenceImage,
  resolveBlockCharacters,
  buildConstrainedPrompt,
  resolveCompositionTemplate,
  extractReferenceConstraints,
  BUILTIN_COMPOSITION_TEMPLATES,
  BUILTIN_BACKLOT_TEMPLATES,
  templateToWorkspaceItem,
  type CharacterProfile,
  type DirectorKeyframeBatch,
  type EnvironmentProfile,
  type ReferenceConstraint,
  type CompositionTemplate,
  type ChainStoryboardPayload,
  type StoryboardShot,
  type GenPromptPack,
  type KeyframeColorCheck,
  readChainStoryboard,
  emptyKeyframeColorCheck,
  normalizeKeyframeColorCheck,
} from '@nx9/shared';
import { usePublicAssetLibrary } from '../stores/public-asset-library';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { resolvePictureGenSettings } from './storyboard-preview-runner';
import { runPictureGenJob } from './picture-gen-runner';
import { getGenPack } from './gen-skill-runtime';
import {
  openReviewGateSession,
} from './stage-deck/utils/review-gate-session';
import {
  resolveUpstreamChainDesk,
  validateDirectorHandoff,
} from './chain-storyboard-utils';

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
  /** 关键帧 provenance 的唯一生产者节点。 */
  sourceDirectorDeskId?: string;
  /** 本批批出 id（写入 keyframeProvenance.batchId） */
  keyframeBatchId?: string;
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
  /** P2：统一风格锁：显式 global/episode direction + stylePrompt + seed */
  styleLock?: boolean;
  globalArtDirection?: string;
  episodeArtDirection?: string;
  /** P2：全局风格补充文案 */
  stylePrompt?: string;
  /** P2：统一 seed（数字）；空则用 picture-gen 的 seed */
  styleSeed?: number | null;
  /** P3：有 3D 截图时优先作参考（默认 true） */
  prefer3dRef?: boolean;
  /** P3：无 3D 参考时仍允许出图（默认 true）；false 则缺 3D 记失败 */
  allowWithout3d?: boolean;
  /** 线稿构图参考（默认 true，从导演台 data 传入） */
  preferLineArtRef?: boolean;
  /** 线稿帧映射 shotId → url */
  lineArtByShotId?: Record<string, string>;
  /** 台内审阅模式，节点 data 优先；未提供时默认手动 */
  reviewMode?: 'manual' | 'auto';
  /** 打回重出时注入当前生成提示词 */
  revisionNote?: string;
  pictureNodeData?: Record<string, unknown>;
  upstreamPictures?: string[];
  /** 显式注入资产库；未提供时仅回退读取资产库，不读取全局镜表。 */
  characters?: CharacterProfile[];
  environments?: EnvironmentProfile[];
  blockData?: Record<string, unknown>;
  /** F-017/F-032: 参考板约束（从上游 reference-board 节点提取） */
  referenceConstraint?: ReferenceConstraint | null;
  /** F-017/F-032: 构图模板 */
  compositionTemplate?: CompositionTemplate;
  /** F-017: 构图强约束 — 启用后无模板阻发 */
  enforceComposition?: boolean;
  /** D-01: 预计算的镜头队列（必须从 chain 传入） */
  shots?: StoryboardShot[];
  /** D-02: 写回 shot patch 到上游 chain */
  patchShot?: (shotId: string, patch: Partial<StoryboardShot>) => void;
  onShotStart?: (shot: StoryboardShot, index: number, total: number) => void;
  onShotPhase?: (shot: StoryboardShot, phase: DirectorShotPhase, detail?: string) => void;
  onShotDone?: (
    shot: StoryboardShot,
    result: DirectorDeskShotResult,
    index: number,
    total: number,
  ) => void;
  shouldAbort?: () => boolean;
  signal?: AbortSignal;
  /**
   * 像素级彩色质检。默认走 image-ops；失败时记 unknown。
   * 疑似黑白只警告并强制进审阅，禁止标 failed。
   */
  inspectKeyframeColor?: (url: string) => Promise<KeyframeColorCheck>;
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
  colorCheck?: KeyframeColorCheck;
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

export type DirectorRunContextBlockCode =
  | 'missing-upstream'
  | 'missing-chain'
  | 'missing-handoff'
  | 'stale-handoff'
  | 'missing-episode'
  | 'empty-episode';

export interface DirectorRunContext {
  status: 'ready' | 'blocked';
  blockCode?: DirectorRunContextBlockCode;
  reason?: string;
  sourceDeskId?: string;
  sourceDeskData?: Record<string, unknown>;
  chain?: ChainStoryboardPayload;
  episodeId?: string;
  shots: StoryboardShot[];
  lineArtByShotId: Record<string, string>;
  handoffValidation: { valid: boolean; reason: string };
  episodeConfirmed: boolean;
  patchShot?: (shotId: string, patch: Partial<StoryboardShot>) => boolean;
}

export interface ResolveDirectorRunContextOptions {
  deskBlockId: string;
  nodes: Node[];
  edges: Edge[];
  blockData?: Record<string, unknown>;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  getLatestNodes?: () => Node[];
  updateNodeDataAtomically?: (
    id: string,
    updater: (node: Node) => Record<string, unknown>,
  ) => void;
}

function blockedDirectorRunContext(
  blockCode: DirectorRunContextBlockCode,
  reason: string,
  partial: Partial<DirectorRunContext> = {},
): DirectorRunContext {
  return {
    status: 'blocked',
    blockCode,
    reason,
    shots: [],
    lineArtByShotId: {},
    handoffValidation: { valid: false, reason },
    episodeConfirmed: false,
    ...partial,
  };
}

/**
 * 导演台 UI、画布 Run 与 Cascade 的唯一运行上下文。
 * 解析 chain / handoff / episode / line art，并提供并发安全的 chain 写回适配器。
 */
export function resolveDirectorRunContext(
  options: ResolveDirectorRunContextOptions,
): DirectorRunContext {
  const sourceDeskId = resolveUpstreamChainDesk(
    options.deskBlockId,
    options.nodes,
    options.edges,
  );
  if (!sourceDeskId) {
    return blockedDirectorRunContext('missing-upstream', '未连接上游分镜台');
  }
  const sourceNode = options.nodes.find((node) => node.id === sourceDeskId);
  const sourceDeskData = (sourceNode?.data ?? {}) as Record<string, unknown>;
  const chain = readChainStoryboard(sourceDeskData);
  if (!chain) {
    return blockedDirectorRunContext('missing-chain', '上游分镜台没有可用镜表', {
      sourceDeskId,
      sourceDeskData,
    });
  }

  const directorNode = options.nodes.find((node) => node.id === options.deskBlockId);
  const blockData = options.blockData
    ?? ((directorNode?.data ?? {}) as Record<string, unknown>);
  const handoff = (
    blockData.lastHandoff
    ?? blockData.handoff
  ) as Record<string, unknown> | undefined;
  if (!handoff) {
    return blockedDirectorRunContext('missing-handoff', '缺少分镜台交接数据', {
      sourceDeskId,
      sourceDeskData,
      chain,
    });
  }
  const episodeId = typeof handoff.episodeId === 'string'
    ? handoff.episodeId
    : chain.activeEpisodeId ?? undefined;
  if (!episodeId) {
    return blockedDirectorRunContext('missing-episode', '交接未指定有效剧集', {
      sourceDeskId,
      sourceDeskData,
      chain,
    });
  }
  const currentScriptHash = (
    (sourceDeskData.breakdownJob as Record<string, unknown> | undefined)?.sourcePackageHash
    ?? (sourceDeskData.handoff as Record<string, unknown> | undefined)?.scriptHash
  ) as string | undefined;
  const handoffValidation = validateDirectorHandoff({
    handoff,
    chain,
    episodeId,
    scriptHash: currentScriptHash,
  });
  if (!handoffValidation.valid) {
    return blockedDirectorRunContext('stale-handoff', handoffValidation.reason, {
      sourceDeskId,
      sourceDeskData,
      chain,
      episodeId,
      handoffValidation,
    });
  }

  const shots = chain.shots.filter((shot) => shot.episodeId === episodeId);
  if (shots.length === 0) {
    return blockedDirectorRunContext('empty-episode', '交接剧集在上游镜表中不存在或没有镜头', {
      sourceDeskId,
      sourceDeskData,
      chain,
      episodeId,
      handoffValidation,
    });
  }

  const scopedShotIds = new Set(shots.map((shot) => shot.id));
  const lineArtByShotId: Record<string, string> = {};
  for (const shot of shots) {
    if (shot.lineArtUrl) lineArtByShotId[shot.id] = shot.lineArtUrl;
  }
  const handoffFrames = handoff.lineArtFrames as
    | Array<{ shotId?: string; sourceShotId?: string; imageUrl?: string }>
    | undefined;
  for (const frame of handoffFrames ?? []) {
    const shotId = frame.shotId ?? frame.sourceShotId;
    if (shotId && scopedShotIds.has(shotId) && frame.imageUrl && !lineArtByShotId[shotId]) {
      lineArtByShotId[shotId] = frame.imageUrl;
    }
  }
  const preview = sourceDeskData.storyboardPreview as
    | { frames?: Array<{ sourceShotId?: string; id?: string; imageUrl?: string; lineArtUrl?: string }> }
    | undefined;
  for (const frame of preview?.frames ?? []) {
    const shotId = frame.sourceShotId ?? frame.id;
    const url = frame.lineArtUrl ?? frame.imageUrl;
    if (shotId && scopedShotIds.has(shotId) && url && !lineArtByShotId[shotId]) {
      lineArtByShotId[shotId] = url;
    }
  }

  const accumulatedPatches = new Map<string, Partial<StoryboardShot>>();
  let fallbackChain = chain;
  const patchShot = (shotId: string, patch: Partial<StoryboardShot>): boolean => {
    if (!scopedShotIds.has(shotId)) return false;
    if (options.updateNodeDataAtomically) {
      options.updateNodeDataAtomically(sourceDeskId, (node) => {
        const latestChain = readChainStoryboard(node.data as Record<string, unknown>);
        if (!latestChain) return {};
        return {
          chainStoryboard: {
            ...latestChain,
            shots: latestChain.shots.map((shot) =>
              shot.id === shotId ? { ...shot, ...patch } : shot,
            ),
          },
        };
      });
      return true;
    }

    accumulatedPatches.set(shotId, {
      ...(accumulatedPatches.get(shotId) ?? {}),
      ...patch,
    });
    const latestSourceNode = options.getLatestNodes?.()
      .find((node) => node.id === sourceDeskId);
    const latestChain = latestSourceNode
      ? readChainStoryboard(latestSourceNode.data as Record<string, unknown>)
      : undefined;
    const baseChain = latestChain ?? fallbackChain;
    fallbackChain = {
      ...baseChain,
      shots: baseChain.shots.map((shot) => {
        const accumulated = accumulatedPatches.get(shot.id);
        return accumulated ? { ...shot, ...accumulated } : shot;
      }),
    };
    options.updateNodeData(sourceDeskId, { chainStoryboard: fallbackChain });
    return true;
  };

  const confirmedIds = Array.isArray(handoff.confirmedEpisodeIds)
    ? handoff.confirmedEpisodeIds as string[]
    : [];
  const episodeConfirmed = handoff.confirmed === true
    || confirmedIds.includes(episodeId)
    || (chain.confirmedEpisodeIds?.includes(episodeId) ?? false);

  return {
    status: 'ready',
    sourceDeskId,
    sourceDeskData,
    chain,
    episodeId,
    shots,
    lineArtByShotId,
    handoffValidation,
    episodeConfirmed,
    patchShot,
  };
}

function buildDirectorReviewPatch(
  shot: StoryboardShot,
  event: Parameters<typeof appendStoryboardReviewEvent>[1],
  status: 'approved' | 'failed',
): Partial<StoryboardShot> {
  return {
    status,
    keyframeStatus: status,
    keyframeReviewNote: event.decision === 'rejected' ? event.comment ?? null : null,
    reviewHistory: appendStoryboardReviewEvent(shot, event),
  };
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
  // D-06/X-35: 禁止画布级回落；只认连线（含经分镜间接）
  // F-006: 出图挂在上游分镜台能力口时，经分镜间接定位
  for (const edge of edges) {
    if (edge.target !== deskBlockId) continue;
    const upstream = nodes.find((x) => x.id === edge.source);
    if (
      upstream?.type !== 'storyboard-desk' &&
      upstream?.type !== 'storyboard-preview' &&
      upstream?.type !== 'story-grid'
    ) {
      continue;
    }
    for (const e2 of edges) {
      if (e2.target === upstream.id) {
        const n = nodes.find((x) => x.id === e2.source && x.type === 'picture-gen');
        if (n) return n;
      }
      if (e2.source === upstream.id) {
        const n = nodes.find((x) => x.id === e2.target && x.type === 'picture-gen');
        if (n) return n;
      }
    }
  }
  return undefined;
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

function shortPromptHash(prompt: string): string {
  let h = 2166136261;
  for (let i = 0; i < prompt.length; i++) {
    h ^= prompt.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * 批出成功后：打开审片会话（宫格批审）；门禁以镜头 keyframeStatus 为准
 */
export function openReviewAfterDirectorBatch(args: {
  deskBlockId: string;
  nodes: Node[];
  edges: Edge[];
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  /** 本次成功出帧的 shot id */
  succeededShotIds?: string[];
  /** 显式本集镜头（禁止回退猜全局 active episode） */
  shots?: StoryboardShot[];
  episodeId?: string | null;
  sourceChainDeskId?: string;
  openSession?: boolean;
}): {
  pendingIndices: number[];
  opened: boolean;
  gatePassed: boolean;
} {
  const shots = args.shots ?? [];
  const pendingFromShots = shots
    .filter(
      (s) =>
        Boolean(s.firstFrameAssetId)
        && s.keyframeStatus !== 'approved'
        && s.status !== 'approved'
        && s.keyframeStatus !== 'failed'
        && s.status !== 'failed',
    )
    .map((s) => s.index)
    .sort((a, b) => a - b);

  const succeededPendingIds = (args.succeededShotIds ?? []).filter((id) => {
    const shot = shots.find((s) => s.id === id);
    if (!shot?.firstFrameAssetId) return false;
    return shot.keyframeStatus !== 'approved' && shot.status !== 'approved';
  });

  const synced = summarizePendingKeyframeGate(undefined, shots);
  const pendingIndices = pendingFromShots.length
    ? pendingFromShots
    : synced.pendingIndices;

  let opened = false;
  if (args.openSession !== false) {
    openReviewGateSession({
      pendingIndices,
      pendingShotIds: succeededPendingIds.length ? succeededPendingIds : undefined,
      stage: 'keyframe',
      source: 'director-desk',
      episodeId: args.episodeId ?? undefined,
      sourceChainDeskId: args.sourceChainDeskId,
      shots,
    });
    opened = true;
  }

  return {
    pendingIndices,
    opened,
    gatePassed: shots.length > 0 && pendingIndices.length === 0,
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
export function summarizePendingKeyframeGate(
  chainShots?: Array<{ id: string; index: number; keyframeStatus?: string; status?: string }>,
  /** D-01: 显式提供镜头列表替代全局 */
  explicitShots?: Array<{ id: string; index: number; keyframeStatus?: string; status?: string }>,
): {
  pendingIndices: number[];
  gatePassed: boolean;
} {
  // F-003: 优先使用链镜表
  const shots = chainShots?.length
    ? chainShots
    : explicitShots?.length
      ? explicitShots
      : [];
  const pending = shots
    .filter((s) => s.keyframeStatus !== 'approved' && s.status !== 'approved')
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

export function approveDirectorKeyframe(
  shotId: string,
  nodes?: Array<{ id: string; type?: string | null; data?: Record<string, unknown> }>,
  patchShot?: (shotId: string, patch: Partial<StoryboardShot>) => void,
): boolean {
  if (!patchShot || !nodes) return false;
  // F-003: 只从显式上游链镜表查找；写回由调用方显式提供上游适配器。
  const shot = findChainShot(shotId, nodes);
  if (!shot?.firstFrameAssetId) return false;
  const event = {
    id: `review-${shot.id}-${Date.now()}`,
    stage: 'keyframe' as const,
    decision: 'approved' as const,
    createdAt: new Date().toISOString(),
  };
  const patch = buildDirectorReviewPatch(shot, event, 'approved');
  patchShot(shot.id, patch);
  return true;
}

/** 有图且未批准的镜头全部通过；缺图时返回 0（与审阅关卡「全部通过」一致） */
export function approveAllDirectorKeyframes(
  patchShot?: (shotId: string, patch: Partial<StoryboardShot>) => void,
  shots?: StoryboardShot[],
): number {
  if (!patchShot || !shots) return 0;
  const active = shots;
  if (active.some((s) => !s.firstFrameAssetId)) return 0;
  let n = 0;
  for (const shot of active) {
    if (isShotKeyframeApproved(shot)) continue;
    if (!shot.firstFrameAssetId) continue;
    const event = {
      id: `review-${shot.id}-${Date.now()}-${n}`,
      stage: 'keyframe' as const,
      decision: 'approved' as const,
      createdAt: new Date().toISOString(),
    };
    const patch = buildDirectorReviewPatch(shot, event, 'approved');
    patchShot(shot.id, patch);
    n += 1;
  }
  return n;
}

export async function rejectDirectorKeyframe(args: {
  shotId: string;
  comment: string;
  regenerate?: boolean;
  nodes?: Array<{ id: string; type?: string | null; data?: Record<string, unknown> }>;
  patchShot?: (shotId: string, patch: Partial<StoryboardShot>) => void;
  batchOptions?: Partial<DirectorDeskBatchOptions>;
}): Promise<{ ok: boolean; regenerated?: boolean }> {
  const comment = args.comment.trim();
  if (!comment || !args.patchShot || !args.nodes) return { ok: false };
  // F-003: 只从显式上游链镜表查找；写回由调用方显式提供上游适配器。
  const shot = findChainShot(args.shotId, args.nodes);
  if (!shot) return { ok: false };
  const event = {
    id: `review-${shot.id}-${Date.now()}`,
    stage: 'keyframe' as const,
    decision: 'rejected' as const,
    comment,
    createdAt: new Date().toISOString(),
  };
  const patch = buildDirectorReviewPatch(shot, event, 'failed');
  args.patchShot(shot.id, patch);
  if (!args.regenerate) return { ok: true, regenerated: false };
  await runDirectorDeskBatch({
    ...args.batchOptions,
    shots: [shot],
    shotIds: [shot.id],
    filter: 'selected',
    skipExisting: false,
    skipApproved: false,
    patchShot: args.patchShot,
    revisionNote: comment,
  });
  return { ok: true, regenerated: true };
}

/** 撤回单镜批准，恢复为待审状态。 */
export function unapproveDirectorKeyframe(
  shotId: string,
  nodes?: Array<{ id: string; type?: string | null; data?: Record<string, unknown> }>,
  patchShot?: (shotId: string, patch: Partial<StoryboardShot>) => void,
): boolean {
  if (!patchShot || !nodes) return false;
  const shot = findChainShot(shotId, nodes);
  if (!shot || !isShotKeyframeApproved(shot) || !shot.firstFrameAssetId) return false;
  const patch = { status: 'review' as const, keyframeStatus: 'review' as const };
  patchShot(shot.id, patch);
  return true;
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

/** 批出前同步预检每镜强制参考缺失项。 */
export function previewDirectorReferenceGaps(
  shots: StoryboardShot[],
  opts: DirectorDeskBatchOptions,
): Array<{ shotId: string; index: number; missingForced: string[] }> {
  const doc = useWorkspaceDocument.getState();
  const characterLibrary = opts.characters ?? doc.characters.characters;
  return shots.flatMap((shot) => {
    const characters = resolveBlockCharacters(opts.blockData, shot, characterLibrary);
    const built = buildShotPrompt(shot, characters, opts);
    return built.missingForced.length > 0
      ? [{ shotId: shot.id, index: shot.index, missingForced: built.missingForced }]
      : [];
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

export function buildShotPrompt(
  shot: StoryboardShot,
  characters: CharacterProfile[],
  opts: DirectorDeskBatchOptions,
  pack?: GenPromptPack | null,
): BuiltShotPrompt {
  const doc = useWorkspaceDocument.getState();
  const environments = opts.environments ?? doc.environments?.environments ?? [];
  const env = resolveShotEnvironment(shot, environments);
  const forceChar = opts.forceCharacterRef ?? true;
  const forceScene = opts.forceSceneRef ?? true;
  const styleLock = opts.styleLock ?? true;
  const prefer3d = opts.prefer3dRef ?? true;

  let prompt = shotKeyframePrompt(shot);
  if (opts.revisionNote?.trim()) {
    prompt = `${prompt}\n\n[Revision note from director: ${opts.revisionNote.trim()}]`;
  }
  const missingForced: string[] = [];
  const usedRefs: string[] = [];
  const referenceImageUrls: string[] = [];

  // 角色 + 镜级服装/道具/镜头库（OL-18）
  const workspaceItems = doc.backlotWorkspace?.items ?? [];
  const costumes = costumeSourcesFromWorkspace(workspaceItems);
  const props = propSourcesFromWorkspace(workspaceItems);
  const publicTemplates = usePublicAssetLibrary.getState().payload.templates ?? [];
  const shotLexiconPool = [
    ...BUILTIN_BACKLOT_TEMPLATES.filter((t) => t.kind === 'shot').map((t) => templateToWorkspaceItem(t)),
    ...publicTemplates.filter((t) => t.kind === 'shot' && !t.deletedAt).map((t) => templateToWorkspaceItem(t)),
    ...workspaceItems.filter((i) => i.kind === 'shot'),
  ].filter((x): x is NonNullable<typeof x> => Boolean(x));
  const shotLexicon = shotLexiconSourcesFromWorkspace(shotLexiconPool);

  if (characters.length > 0 || shot.costumeOverrides?.length || shot.propIds?.length || shot.shotAssetId) {
    prompt = enrichPromptWithShotAssets(
      prompt,
      {
        characterNames: shot.characterNames,
        costumeOverrides: shot.costumeOverrides,
        propIds: shot.propIds,
        shotAssetId: shot.shotAssetId,
      },
      characters,
      costumes,
      props,
      shotLexicon,
    );
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
  // F-018: 3D 机位预设的相机方向提示词
  const cameraPromptText = shot.director3dGuide?.cameraPrompt?.trim();
  if (cameraPromptText) craft.push(`3D camera direction: ${cameraPromptText}`);
  if (craft.length) prompt = `${prompt}\n${craft.join(', ')}`;

  // P2 风格锁
  if (styleLock) {
    const globalStyle = opts.globalArtDirection?.trim();
    const epStyle = opts.episodeArtDirection?.trim();
    const custom = opts.stylePrompt?.trim() || (opts.blockData?.stylePrompt as string | undefined)?.trim();
    const styleBits = [globalStyle, epStyle, custom].filter(Boolean);
    if (styleBits.length) {
      const stylePrefix = pack?.styleLockPrefix?.trim() || '[Style lock — keep consistent across shots]';
      prompt = `${prompt}\n\n${stylePrefix}\n${styleBits.join('\n')}`;
    }
  }

  // 参考图优先级：默认 3D → 线稿 → 角色 → 场景；关闭 3D 时线稿优先。
  // D-03/R-01: 线稿构图参考（preferLineArtRef 默认 true）
  const preferLineArt = opts.preferLineArtRef ?? true;
  const lineArtUrl = opts.lineArtByShotId?.[shot.id]?.trim();
  const d3 = shot.director3dGuide?.captureUrl?.trim();
  const charRef = pickReferenceImage(characters, []);
  const envRef = env?.referenceImageUrl?.trim() || env?.referenceUrls?.[0]?.trim();
  const upstream = opts.upstreamPictures?.find((u) => u?.trim());

  // §5 优先级：若 prefer3dRef && 有3D截图 → 3D > 线稿 > 角色 > 场景
  // 否则 → 线稿 > 角色 > 场景（3D 有则仍可附带）
  if (prefer3d && d3) {
    referenceImageUrls.push(d3);
    usedRefs.push('3d');
  }
  if (preferLineArt && lineArtUrl) {
    if (!referenceImageUrls.includes(lineArtUrl)) referenceImageUrls.push(lineArtUrl);
    usedRefs.push('line-art');
  }
  if (!prefer3d && d3) {
    if (!referenceImageUrls.includes(d3)) referenceImageUrls.push(d3);
    usedRefs.push('3d-secondary');
  }
  if (charRef) {
    if (!referenceImageUrls.includes(charRef)) referenceImageUrls.push(charRef);
    usedRefs.push('character');
  } else if (forceChar && characters.length > 0) {
    // 有角色档案但无图
    missingForced.push('角色缺参考图');
  }

  // C-09 / OL-21：使用 3D 机位时强制要求对应角色有 2D 定妆/设定板（与「锁角色参考」解耦）
  if (prefer3d && d3 && characters.length > 0) {
    const lacking = characters.filter((c) => {
      const url =
        c.referenceImageUrl?.trim()
        || c.creative?.fullSheetUrl?.trim()
        || c.creative?.frontViewUrl?.trim();
      return !url;
    });
    if (lacking.length > 0) {
      missingForced.push(
        `不可拍·3D机位缺定妆：${lacking.map((c) => c.name).join('、')}`,
      );
    }
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
    const charHint =
      pack?.characterRefHint?.trim() ||
      '[Use character reference likeness; keep face/costume consistent]';
    prompt = `${prompt}\n\n${charHint}`;
  }
  if (prefer3d && d3) {
    const camHint =
      pack?.camera3dHint?.trim() || '[Match 3D blocking camera composition and staging]';
    prompt = `${prompt}\n\n${camHint}`;
  }
  // D-03/R-01: 线稿构图提示 → 强制彩色关键帧契约（DD-P1-01）
  if (preferLineArt && lineArtUrl) {
    const lineArtHint =
      pack?.lineArtHint?.trim() ||
      '[Match the line-art composition and camera framing; produce a full-color cinematic keyframe, not a sketch or line drawing]';
    prompt = `${prompt}\n\n${lineArtHint}`;
  } else {
    prompt = `${prompt}\n\n[Produce a full-color cinematic production keyframe; do not output monochrome line art]`;
  }
  if (pack?.overlay?.trim()) {
    prompt = `${prompt}\n\n${pack.overlay.trim()}`;
  }

  // F-017/F-032: 参考板约束注入 + 构图模板
  const constraint = opts.referenceConstraint ?? undefined;
  const template =
    opts.compositionTemplate ??
    (shot ? resolveCompositionTemplate(shot, BUILTIN_COMPOSITION_TEMPLATES) : undefined);
  if (constraint) {
    const checked = buildConstrainedPrompt(prompt, constraint, template);
    if (checked.blocked) {
      return {
        prompt,
        referenceImageUrl: primaryRef,
        referenceImageUrls,
        styleImageUrl,
        usedRefs,
        missingForced: [
          ...missingForced,
          `参考板约束阻塞：${checked.reason ?? '约束检查未通过'}`,
        ],
      };
    }
    prompt = checked.prompt;
  } else if (template) {
    prompt = `${prompt}\n\n[Composition: ${template.name}]\n${template.promptSuffix}`;
  } else if (opts.enforceComposition) {
    // F-017: 强约束开启且无模板时记入缺失强制项
    missingForced.push('构图强约束已开启，但未指定构图模板。请在分镜台为当前镜头选择构图模板。');
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

async function inspectDirectorKeyframeColor(
  url: string,
  inspect?: (url: string) => Promise<KeyframeColorCheck>,
): Promise<KeyframeColorCheck> {
  try {
    if (inspect) return normalizeKeyframeColorCheck(await inspect(url));
    const { api } = await import('../api/client');
    return normalizeKeyframeColorCheck(await api.assessKeyframeColor({ sourceUrl: url }));
  } catch {
    return emptyKeyframeColorCheck('unknown');
  }
}

async function attemptGenerate(
  shot: StoryboardShot,
  opts: DirectorDeskBatchOptions,
  attempt: number,
): Promise<DirectorDeskShotResult> {
  const doc = useWorkspaceDocument.getState();
  const characterLibrary = opts.characters ?? doc.characters.characters;
  const characters = resolveBlockCharacters(
    opts.blockData,
    shot,
    characterLibrary,
  );
  const built = buildShotPrompt(
    shot,
    characters,
    opts,
    await getGenPack('gen-director-batch-shot'),
  );

  if (!opts.patchShot) {
    return {
      shotId: shot.id,
      index: shot.index,
      ok: false,
      error: '缺少上游链镜表写回适配器',
      prompt: built.prompt,
      attempts: attempt,
      phase: 'failed',
      usedRefs: built.usedRefs,
    };
  }

  if (opts.allowWithout3d === false && !shot.director3dGuide?.captureUrl) {
    opts.patchShot(shot.id, { status: 'failed', keyframeStatus: 'failed' });
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
  const resolvedPictureSettings = resolvePictureGenSettings(pictureData);
  const modelId = resolvedPictureSettings.modelId;
  const size = typeof pictureData.size === 'string' && pictureData.size.trim()
    ? pictureData.size
    : resolvedPictureSettings.size;
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

  opts.patchShot(shot.id, {
    status: 'generating',
    keyframeStatus: 'draft',
    ...(shot.firstFrameAssetId ? { keyframePreviousUrl: shot.firstFrameAssetId } : {}),
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
      signal: opts.signal,
    });
    const url = urls[0];
    if (!url) throw new Error('图像生成未返回 URL');

    const colorCheck = await inspectDirectorKeyframeColor(url, opts.inspectKeyframeColor);
    const reviewMode = opts.reviewMode ?? (opts.blockData?.reviewMode as 'manual' | 'auto' | undefined) ?? 'manual';
    // 疑似黑白强制进审阅；未知/彩色才允许 auto 直接批准。禁止因质检标失败。
    const nextStatus =
      colorCheck.verdict === 'suspect-monochrome'
        ? 'review'
        : reviewMode === 'manual'
          ? 'review'
          : 'approved';
    const keyframeRevision = Math.max(
      0,
      shot.keyframeRevision ?? (shot.firstFrameAssetId ? 1 : 0),
    ) + 1;
    opts.patchShot(shot.id, {
      status: nextStatus,
      keyframeStatus: nextStatus,
      firstFrameAssetId: url,
      keyframeRevision,
      keyframeProvenance: {
        role: 'director-color-keyframe',
        generator: 'picture-gen',
        sourceDirectorDeskId: opts.sourceDirectorDeskId,
        sourceLineArtUrl: opts.lineArtByShotId?.[shot.id] ?? shot.lineArtUrl ?? null,
        sourceDirector3dCaptureId: shot.director3dGuide?.captureId ?? null,
        generatedAt: new Date().toISOString(),
        model: modelId ?? null,
        promptHash: shortPromptHash(built.prompt),
        batchId: opts.keyframeBatchId ?? null,
        usedRefs: built.usedRefs,
        negativePromptApplied: Boolean(negativePrompt?.trim()),
        colorCheck,
      },
    });

    const phase: DirectorShotPhase = nextStatus === 'approved' ? 'approved' : 'review';
    opts.onShotPhase?.(
      shot,
      phase,
      colorCheck.verdict === 'suspect-monochrome'
        ? '结果疑似线稿/黑白，已保留关键帧，请人工确认'
        : undefined,
    );

    return {
      shotId: shot.id,
      index: shot.index,
      ok: true,
      url,
      prompt: built.prompt,
      attempts: attempt,
      phase,
      usedRefs: built.usedRefs,
      colorCheck,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const warn =
      built.missingForced.length > 0
        ? `${message}（提示: ${built.missingForced.join('、')}）`
        : message;
    opts.patchShot(shot.id, {
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

function resolveActiveShots(opts: DirectorDeskBatchOptions): StoryboardShot[] {
  return opts.shots ?? [];
}

function buildQueue(opts: DirectorDeskBatchOptions): StoryboardShot[] {
  const active = resolveActiveShots(opts);
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
  const keyframeBatchId = opts.keyframeBatchId ?? `kf-batch-${Date.now().toString(36)}`;
  const batchOpts: DirectorDeskBatchOptions = { ...opts, keyframeBatchId };
  const queue = buildQueue(batchOpts);

  if (queue.length === 0) {
    return { results: [], done: 0, failed: 0, skipped: 0, total: 0, retried: 0 };
  }

  const concurrency = Math.min(3, Math.max(1, batchOpts.concurrency ?? 2));
  let completed = 0;
  let retried = 0;

  for (const shot of queue) {
    batchOpts.onShotPhase?.(shot, 'queued');
  }

  const results = await mapPool(
    queue,
    concurrency,
    async (shot, index) => {
      if (batchOpts.shouldAbort?.()) {
        return {
          shotId: shot.id,
          index: shot.index,
          ok: false,
          skipped: true,
          error: '已取消',
          phase: 'cancelled' as const,
        } satisfies DirectorDeskShotResult;
      }
      batchOpts.onShotStart?.(shot, index, queue.length);
      const result = await generateOneShotWithRetry(shot, batchOpts);
      if ((result.attempts ?? 1) > 1) retried += 1;
      completed += 1;
      batchOpts.onShotDone?.(shot, result, completed - 1, queue.length);
      return result;
    },
    batchOpts.shouldAbort,
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

export function getActiveEpisodeShots(shots?: StoryboardShot[]): StoryboardShot[] {
  return shots ?? [];
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
  /** D-01: 预计算的镜头队列（从 chain 传入） */
  shots?: StoryboardShot[];
  episodeId?: string;
  /** 强制推送时跳过 clip-gen 关键帧门禁 */
  bypassKeyframeGate?: boolean;
}): { clipGenId?: string; shotCount: number; firstShotId?: string; batchId?: string } {
  const clip = findDirectorClipGenNode(args.deskBlockId, args.nodes, args.edges);
  if (!clip) return { shotCount: 0 };
  const sourceChainDeskId = resolveUpstreamChainDesk(
    args.deskBlockId,
    args.nodes,
    args.edges,
  );
  if (!sourceChainDeskId) return { clipGenId: clip.id, shotCount: 0 };

  const active = args.shots ?? [];
  const targets = (args.shotIds?.length
    ? active.filter((s) => args.shotIds!.includes(s.id))
    : active
  )
    .filter((s) => s.firstFrameAssetId)
    .filter((s) => args.bypassKeyframeGate === true || isShotKeyframeApproved(s))
    .sort((a, b) => a.index - b.index);

  if (targets.length === 0) return { clipGenId: clip.id, shotCount: 0 };

  const first = targets[0];
  const episodeId = args.episodeId ?? first.episodeId ?? undefined;
  if (!episodeId) return { clipGenId: clip.id, shotCount: 0 };
  const createdAt = new Date().toISOString();
  const batchId = `director-keyframes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const pictures = targets.map((s) => s.firstFrameAssetId!).filter(Boolean);
  const batch: DirectorKeyframeBatch = {
    version: 1,
    batchId,
    sourceDirectorDeskId: args.deskBlockId,
    sourceChainDeskId,
    episodeId,
    createdAt,
    bypassKeyframeGate: args.bypassKeyframeGate === true,
    status: 'ready',
    shots: targets.map((shot) => ({
      shotId: shot.id,
      index: shot.index,
      imageUrl: shot.firstFrameAssetId!,
      prompt:
        shot.videoPromptPro
        || shot.videoPromptEn
        || shot.promptEn
        || shot.descriptionZh
        || '',
      durationSec: Math.max(1, shot.durationSec || 3),
      keyframeRevision: Math.max(1, shot.keyframeRevision ?? 1),
    })),
  };
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
    directorKeyframeBatch: batch,
    requireKeyframeGate: true,
    message: `已从导演台写入 ${targets.length} 镜关键帧参考`,
    bypassKeyframeGate: args.bypassKeyframeGate === true,
  });
  args.updateNodeData(args.deskBlockId, {
    lastPushReceipt: {
      at: createdAt,
      batchId,
      shotCount: targets.length,
      clipGenId: clip.id,
    },
  });

  return {
    clipGenId: clip.id,
    shotCount: targets.length,
    firstShotId: first.id,
    batchId,
  };
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
  /** OL-18：若绑定镜头库，优先用库条景别/运镜 */
  shotAssetId?: string | null;
  shotLexiconSize?: string | null;
  shotLexiconMove?: string | null;
}): { shotIndex: number; suggestedCamera: string; suggestedAngle: string; suggestedDistance: string; notes: string } {
  const size = shot.shotLexiconSize || shot.shotSize || 'MS';
  const move = shot.shotLexiconMove || shot.cameraMove || '固定';
  const angle = shot.cameraAngle || '平拍';
  const distMap: Record<string, string> = { ECU: '0.3m', CU: '1m', MS: '2m', FS: '3m', WS: '6m' };
  const angleMap: Record<string, string> = { '平拍': 'eye-level', '俯拍': 'overhead', '仰拍': 'low-angle' };
  const desc = shot.descriptionZh || shot.promptEn || '';
  const chars = shot.characters?.join('/') || '主体';
  const scene = shot.scene || '场景';
  const lexNote = shot.shotAssetId ? ' · 镜头库绑定' : '';
  return {
    shotIndex: shot.index ?? 0,
    suggestedCamera: `${scene} · ${move}机位，焦段 ${distMap[size] || '2m'}`,
    suggestedAngle: angleMap[angle] || 'eye-level',
    suggestedDistance: distMap[size] || '2m',
    notes: `角色 ${chars} · ${size}景别 · ${angle}${lexNote}${desc ? ` · ${desc.slice(0, 40)}` : ''}`,
  };
}
