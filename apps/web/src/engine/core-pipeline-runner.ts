/**
 * 核心 6 步生产路径（Shot-first）：
 * 剧本 → 分镜列表 → 分镜图全出 → 批审 → 视频全出 → 简单拼接导出
 *
 * F-003/F-004: 视频批出以 chainShots / 链镜表为 SSOT，禁止回退全局 storyboard.shots。
 */
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useFlowRuntime } from '../stores/flow-runtime';
import { useFlowCommands } from '../stores/flow-commands';
import { useActivityLog } from '../stores/activity-log';
import { getAllChainShots, findDeskIdForShot } from './chain-storyboard-aggregate';
import { getMirroredFlowGraph, useFlowGraphMirror } from '../stores/flow-graph-mirror';
import { api } from '../api/client';
import { runExportPack } from './export-pack-runner';
import { awaitProxyVideo, VideoPollTimeoutError } from './poll-task';
import { buildClipGenVideoRequest, collectClipGenUpstream, resolveClipGenPromptMentions } from './clip-gen-request';
import { collectClipUsedAssets } from './clip-used-assets';
import { getGenPack } from './gen-skill-runtime';
import { runPictureGenExecutor } from './executors';
import type { ExecutorGraphEdge, ExecutorGraphNode } from './executors/types';
import {
  appendStoryboardVideoVersion,
  appendEpisodeExportRecord,
  appendStoryboardReviewEvent,
  buildDirectorCharacterPlacementPrompt,
  buildVideoGuidePromptSuffix,
  resolveActiveEpisodeId,
  filterStoryboardGuideOverlay,
  resolveStoryboardGuideOverlay,
  resolveStoryboardVideoVersions,
  buildCharacterContext,
  readChainStoryboard,
  type StoryboardPreviewPayload,
  type StoryboardShot,
} from '@nx9/shared';
import { useExecutionQueue } from '../stores/execution-queue';
import {
  enabledGuideKinds,
  readStoryboardGuidePrefs,
} from '../stores/storyboard-guide-prefs';
import { composeStoryboardGuideFrameDataUrl } from './storyboard-guide-compose';

function log(msg: string) {
  useActivityLog.getState().append(msg);
}

/** 核心模板缺节点时提示并补第一个缺失项；正常入口会一次加载完整模板。 */
export function ensureCorePipelineNodes(): void {
  const runtime = useFlowRuntime.getState().runtime;
  if (!runtime) return;
  const nodes = runtime.getNodes();
  const kinds = new Set(nodes.map((n) => n.type));
  const spawn = useFlowCommands.getState().requestSpawn;
  for (const kind of [
    'script-desk',
    'storyboard-desk',
    'picture-gen',
    'director-desk',
    'clip-gen',
    'export-pack',
  ] as const) {
    if (!kinds.has(kind) && !(kind === 'storyboard-desk' && (kinds.has('story-grid') || kinds.has('storyboard-preview')))) {
      spawn(kind);
      log(`核心流程缺少“${kind}”，已补充节点；建议重新加载核心流程模板以恢复完整连线`);
      break;
    }
  }
}

/** 把故事板镜头同步进分镜台 / 预览节点（若存在） */
export function syncPreviewFromStoryboard(): void {
  const runtime = useFlowRuntime.getState().runtime;
  if (!runtime) {
    log('画布未就绪；请打开分镜台后同步');
    return;
  }
  const nodes = runtime.getNodes();
  const preview = nodes.find(
    (n) => n.type === 'storyboard-desk' || n.type === 'storyboard-preview' || n.type === 'story-grid',
  );
  if (preview) {
    runtime.focusBlock(preview.id);
    log('已聚焦分镜台 · 请在「关键帧」Tab 同步并批量出图');
  } else {
    useFlowCommands.getState().requestSpawn('storyboard-desk');
    log('已创建分镜台节点');
  }
}

/** PG-12: 解析镜头应使用的 picture-gen 节点（绑定 → 下游连接 → 显式 id → 画布第一个） */
export function resolvePictureGenNodeForShot(
  shot: StoryboardShot,
  nodes: Array<{ id: string; type?: string | null; data?: Record<string, unknown> | unknown }>,
  edges: Array<{ source: string; target: string }>,
  preferredId?: string,
): { id: string; data: Record<string, unknown> } | undefined {
  const pics = nodes.filter((n) => n.type === 'picture-gen');
  if (pics.length === 0) return undefined;
  const asRecord = (node: (typeof pics)[number]) => ({
    id: node.id,
    data: ((node.data ?? {}) as Record<string, unknown>),
  });
  if (preferredId) {
    const hit = pics.find((n) => n.id === preferredId);
    if (hit) return asRecord(hit);
  }
  const bound = pics.find((n) => (n.data as Record<string, unknown> | undefined)?.linkedShotId === shot.id);
  if (bound) return asRecord(bound);
  const deskId = findDeskIdForShot(shot.id, nodes as never);
  if (deskId) {
    const outgoing = new Set(edges.filter((e) => e.source === deskId).map((e) => e.target));
    const connected = pics.find((n) => outgoing.has(n.id));
    if (connected) return asRecord(connected);
  }
  return asRecord(pics[0]);
}

/**
 * 为缺失关键帧的镜头逐镜出图，写回 firstFrameAssetId。
 * PG-12: 走 picture-gen 唯一 executor（约束 / 记账 / 链镜表 / AbortSignal）。
 */
export async function batchGenerateKeyframesFromShots(
  shotIds?: string[],
  force = false,
  pictureGenBlockId?: string,
): Promise<{ ok: number; fail: number }> {
  const doc = useWorkspaceDocument.getState();
  ensureCorePipelineNodes();

  const runtime = useFlowRuntime.getState().runtime;
  const mirrored = getMirroredFlowGraph();
  const graphNodes = runtime?.getNodes()?.length ? runtime.getNodes() : mirrored.nodes;
  const graphEdges = runtime?.getEdges()?.length ? runtime.getEdges() : mirrored.edges;

  const chainShots = getAllChainShots(graphNodes);
  if (chainShots.length === 0) {
    log('无上游链镜表，已禁止回退全局批出关键帧（F-003）。请连接分镜台后再试');
    return { ok: 0, fail: 0 };
  }

  const episodeId = resolveActiveEpisodeId(doc.storyboard);
  const scoped = episodeId
    ? chainShots.filter((s) => !s.episodeId || s.episodeId === episodeId)
    : chainShots;
  const shots = scoped.length > 0 ? scoped : chainShots;

  const requested = shotIds?.length ? new Set(shotIds) : null;
  const targets = shots.filter(
    (shot) => (!requested || requested.has(shot.id)) && (force || !shot.firstFrameAssetId),
  );
  if (targets.length === 0) {
    log(`全部 ${shots.length} 镜已有分镜图`);
    return { ok: shots.length, fail: 0 };
  }

  log(`开始批量出图 · ${targets.length}/${shots.length} 镜待生成`);

  const abort = new AbortController();
  const unsub = useExecutionQueue.subscribe((state) => {
    if (state.phase === 'cancelled') abort.abort();
  });

  const queue = useExecutionQueue.getState();
  queue.startBatch(targets.map((shot) => shot.id), 'core-keyframes');

  const updateFn = (id: string, data: Record<string, unknown>) => {
    if (runtime?.updateNodeData) runtime.updateNodeData(id, data);
    else useFlowGraphMirror.getState().updateNodeData(id, data);
  };

  let ok = 0;
  let fail = 0;
  try {
    for (let index = 0; index < targets.length; index++) {
      if (useExecutionQueue.getState().phase === 'cancelled' || abort.signal.aborted) {
        log('批量出图已停止');
        break;
      }
      const shot = targets[index];
      queue.reportProgress({
        done: index,
        total: targets.length,
        currentBlockId: shot.id,
        currentLabel: `分镜图 #${shot.index + 1}`,
      });
      const latestNodes = runtime?.getNodes()?.length ? runtime.getNodes() : graphNodes;
      const pictureNode = resolvePictureGenNodeForShot(
        shot,
        latestNodes,
        graphEdges,
        pictureGenBlockId,
      );
      if (!pictureNode) {
        fail++;
        log(`分镜图失败 · #${shot.index + 1}: 画布上没有图像生成节点`);
        continue;
      }
      const basePrompt =
        (shot.promptEn || '').trim() ||
        (shot.descriptionZh || '').trim() ||
        `cinematic storyboard frame, shot ${shot.index + 1}`;
      patchShotOnChainGraph(shot.id, { status: 'generating', keyframeStatus: 'draft' }, latestNodes);
      try {
        await runPictureGenExecutor({
          block: {
            id: pictureNode.id,
            type: 'picture-gen',
            position: { x: 0, y: 0 },
            data: {
              ...pictureNode.data,
              linkedShotId: shot.id,
              // PG-25: 批量关键帧用 prompt 入参，不覆盖节点 content
              imageCount: 1,
            },
          },
          prompt: basePrompt,
          upstream: {
            pictures: [],
            clips: [],
          },
          updateNodeData: updateFn,
          nodes: latestNodes as unknown as ExecutorGraphNode[],
          edges: graphEdges as ExecutorGraphEdge[],
          abortSignal: abort.signal,
        });
        const afterNodes = runtime?.getNodes()?.length ? runtime.getNodes() : latestNodes;
        const latestShot = getAllChainShots(afterNodes).find((s) => s.id === shot.id);
        const url = latestShot?.firstFrameAssetId;
        const gotNewFrame = Boolean(url) && url !== shot.firstFrameAssetId;
        if (!gotNewFrame) {
          fail++;
          log(`分镜图未写回 · #${shot.index + 1}（可能仍在后台，请在图像节点继续查询）`);
          continue;
        }
        const previewNode = afterNodes.find((node) => node.type === 'storyboard-preview');
        const rawPreview = previewNode?.data?.storyboardPreview as StoryboardPreviewPayload | undefined;
        if (previewNode && rawPreview?.version === 1 && Array.isArray(rawPreview.frames) && url) {
          updateFn(previewNode.id, {
            storyboardPreview: {
              ...rawPreview,
              confirmed: false,
              confirmedAt: null,
              frames: rawPreview.frames.map((frame) =>
                frame.sourceShotId === shot.id
                  ? {
                      ...frame,
                      imageUrl: url,
                      reviewNote: shot.keyframeReviewNote ?? null,
                      status: 'success' as const,
                      locked: false,
                      errorMessage: null,
                    }
                  : frame,
              ),
            },
          });
        }
        ok++;
        log(`分镜图完成 · #${shot.index + 1}`);
      } catch (e) {
        if (abort.signal.aborted) {
          log('批量出图已停止');
          break;
        }
        fail++;
        patchShotOnChainGraph(shot.id, { status: 'failed', keyframeStatus: 'failed' }, latestNodes);
        log(`分镜图失败 · #${shot.index + 1}: ${String(e)}`);
      }
    }
  } finally {
    unsub();
  }

  const keyframeCancelled = useExecutionQueue.getState().phase === 'cancelled' || abort.signal.aborted;
  queue.reportProgress({ done: ok + fail, total: targets.length, currentBlockId: null });
  queue.finish();
  const resultNodes = runtime?.getNodes()?.length ? runtime.getNodes() : graphNodes;
  const pictureNode = pictureGenBlockId
    ? resultNodes.find((node) => node.id === pictureGenBlockId)
    : resultNodes.find((node) => node.type === 'picture-gen');
  if (pictureNode) {
    const completed = getAllChainShots(resultNodes)
      .map((shot) => shot.firstFrameAssetId)
      .filter((url): url is string => Boolean(url));
    updateFn(pictureNode.id, {
      status: keyframeCancelled ? 'idle' : fail > 0 && ok === 0 ? 'error' : 'success',
      previewUrls: completed,
      previewUrl: completed[0],
      batchCount: completed.length,
    });
  }
  doc.setProjectStatus('draft');
  log(`批量出图结束 · 成功 ${ok} · 失败 ${fail}`);
  return { ok, fail };
}

/** DR-01: 批审全部有图的链镜头 → keyframeStatus=approved（只写链镜表）。 */
export interface ApproveAllKeyframesResult {
  ok: number;
  /** DR-01: 无链镜表时禁止回退全局批审（F-003）。 */
  blocked?: 'no-chain';
}

/** DR-01: 批审只写链镜表（画布 runtime / 镜像），禁止写全局 storyboard。 */
export function approveAllKeyframes(): ApproveAllKeyframesResult {
  const runtime = useFlowRuntime.getState().runtime;
  const mirrored = getMirroredFlowGraph();
  const graphNodes = runtime?.getNodes()?.length ? runtime.getNodes() : mirrored.nodes;
  const chainShots = getAllChainShots(graphNodes);
  if (chainShots.length === 0) {
    log('无上游链镜表，已禁止全局批审（F-003）。请连接分镜台后再批');
    return { ok: 0, blocked: 'no-chain' };
  }
  const episodeId = resolveActiveEpisodeId(useWorkspaceDocument.getState().storyboard);
  const scoped = episodeId
    ? chainShots.filter((s) => !s.episodeId || s.episodeId === episodeId)
    : chainShots;
  const shots = scoped.length > 0 ? scoped : chainShots;
  let n = 0;
  for (const shot of shots) {
    if (!shot.firstFrameAssetId) continue;
    const event = {
      id: `review-${shot.id}-${Date.now()}-${n}`,
      stage: 'keyframe' as const,
      decision: 'approved' as const,
      createdAt: new Date().toISOString(),
    };
    const latestNodes = runtime?.getNodes()?.length ? runtime.getNodes() : graphNodes;
    patchShotOnChainGraph(
      shot.id,
      {
        keyframeStatus: 'approved',
        status: 'approved',
        keyframeReviewNote: null,
        reviewHistory: appendStoryboardReviewEvent(shot, event),
      },
      latestNodes,
    );
    n++;
  }
  log(`批审完成 · ${n} 镜关键帧已批准（链镜表）`);
  return { ok: n };
}

/** VG-10: 写回链镜表（画布挂载走 runtime，未挂载走镜像） */
function patchShotOnChainGraph(
  shotId: string,
  patch: Partial<StoryboardShot>,
  graphNodes: Array<{ id: string; type?: string; data?: Record<string, unknown> | unknown }>,
): void {
  const runtime = useFlowRuntime.getState().runtime;
  const deskId = findDeskIdForShot(shotId, graphNodes as never);
  if (!deskId) return;
  const applyPatch = (
    desk: { data?: unknown } | undefined,
    update: (id: string, data: Record<string, unknown>) => void,
  ): boolean => {
    const chain = desk
      ? readChainStoryboard((desk.data ?? {}) as Record<string, unknown>)
      : undefined;
    if (!chain) return false;
    const newShots = chain.shots.map((s) => (s.id === shotId ? { ...s, ...patch } : s));
    update(deskId, { chainStoryboard: { ...chain, shots: newShots } });
    return true;
  };
  if (runtime?.updateNodeData) {
    const desk = graphNodes.find((n) => n.id === deskId);
    if (applyPatch(desk as { data?: unknown }, runtime.updateNodeData)) return;
  }
  const mirrorDesk = useFlowGraphMirror.getState().nodes.find((n) => n.id === deskId);
  applyPatch(mirrorDesk, useFlowGraphMirror.getState().updateNodeData);
}

/** VG-10: 批量出片超时任务的待恢复表（存 clip-gen 节点 data.pendingVideoTasks） */
export interface PendingVideoTask {
  taskId: string;
  prompt?: string;
  model?: string;
  /** VG-30: 提交时的视频通道 Base URL */
  providerBaseUrl?: string;
  /** VG-34: 记入 pending 的时间，用于判断恢复时是否已有更新成片 */
  submittedAt?: string;
}

/**
 * VG-10: 恢复批量出片中轮询超时的任务。
 * 对每个待恢复 taskId 查询一次：成功 → 追加镜头视频版本并清除；失败 → 标 failed 并清除；
 * 仍在生成 → 保留待下次查询。
 */
export async function resumePendingVideoTasks(
  clipGenBlockId: string,
): Promise<{ done: number; failed: number; pending: number }> {
  const runtime = useFlowRuntime.getState().runtime;
  const graphNodes = runtime?.getNodes()?.length
    ? runtime.getNodes()
    : getMirroredFlowGraph().nodes;
  const clipNode = graphNodes.find((n) => n.id === clipGenBlockId);
  const pendingMap = {
    ...(((clipNode?.data as Record<string, unknown>)?.pendingVideoTasks ?? {}) as Record<
      string,
      PendingVideoTask
    >),
  };
  const entries = Object.entries(pendingMap);
  if (!entries.length) {
    log('没有待恢复的视频任务');
    return { done: 0, failed: 0, pending: 0 };
  }
  const allShots = getAllChainShots(graphNodes);
  let done = 0;
  let failed = 0;
  for (const [shotId, task] of entries) {
    try {
      const res = await api.pollVideo(task.taskId, task.providerBaseUrl);
      if (res.status === 'success' && res.url) {
        const shot = allShots.find((s) => s.id === shotId);
        if (shot) {
          const version = {
            id: `video-${shotId}-${Date.now()}`,
            url: res.url,
            createdAt: new Date().toISOString(),
            prompt: task.prompt ?? '',
            model: task.model ?? 'veo',
            status: 'candidate' as const,
          };
          // VG-34: 若 pending 之后用户已重试出更新成片，只归档 candidate，不自动 adopt
          const versions = resolveStoryboardVideoVersions(shot);
          const hasNewer =
            Boolean(task.submittedAt)
            && versions.some((v) => v.createdAt > (task.submittedAt as string) && Boolean(v.url));
          const alreadyHasFresh =
            !task.submittedAt
            && Boolean(shot.videoAssetId)
            && shot.videoAssetId !== res.url
            && (shot.videoStatus === 'review' || shot.videoStatus === 'approved');
          if (hasNewer || alreadyHasFresh) {
            const existing = versions.filter((item) => item.id !== version.id);
            patchShotOnChainGraph(shotId, {
              videoVersions: [...existing, version],
            }, graphNodes);
            log(`视频任务归档为候选 · ${shotId}（镜上已有更新成片，未覆盖）`);
          } else {
            patchShotOnChainGraph(shotId, appendStoryboardVideoVersion(shot, version), graphNodes);
          }
        }
        delete pendingMap[shotId];
        done++;
      } else if (res.status === 'failed') {
        patchShotOnChainGraph(shotId, { videoStatus: 'failed', status: 'failed' }, graphNodes);
        delete pendingMap[shotId];
        failed++;
      }
    } catch (e) {
      log(`任务查询失败 · ${task.taskId}: ${String(e)}`);
    }
  }
  const stillPending = Object.keys(pendingMap).length;
  const updateFn = runtime?.updateNodeData
    ? runtime.updateNodeData
    : useFlowGraphMirror.getState().updateNodeData;
  updateFn(clipGenBlockId, { pendingVideoTasks: pendingMap });
  log(`视频任务恢复 · 完成 ${done} · 失败 ${failed} · 仍在生成 ${stillPending}`);
  return { done, failed, pending: stillPending };
}

/**
 * 为已批审且缺视频的镜头逐镜出视频，写回 videoAssetId。
 * 使用 firstFrame 作为参考图 + videoPrompt/prompt。
 * @param shotIds 限定镜头；视频生成工作区必须传入本节点上游镜，避免吃整集
 * @param clipGenBlockId 使用该节点的模型/画幅参数，保证多 clip-gen 彼此独立
 */
/**
 * 批量生成视频（F-004：强制链镜表；无 chain 时不批出全局）
 * @param chainShots - 链镜表；缺省时从 runtime/镜像聚合，绝不回退全局 store
 */
export async function batchGenerateVideosFromShots(
  shotIds?: string[],
  force = false,
  clipGenBlockId?: string,
  chainShots?: StoryboardShot[],
  opts?: { signal?: AbortSignal },
): Promise<{ ok: number; fail: number; skipped: number }> {
  const doc = useWorkspaceDocument.getState();
  const runtime = useFlowRuntime.getState().runtime;
  const mirrored = getMirroredFlowGraph();
  const graphNodes = runtime?.getNodes()?.length ? runtime.getNodes() : mirrored.nodes;
  const graphEdges = runtime?.getEdges()?.length ? runtime.getEdges() : mirrored.edges;

  const resolvedChain: StoryboardShot[] =
    chainShots && chainShots.length > 0
      ? chainShots
      : getAllChainShots(graphNodes);

  if (!resolvedChain.length) {
    log('无上游链镜表，已禁止回退全局批出（F-004）。请连接分镜台/导演台后再试');
    return { ok: 0, fail: 0, skipped: 0 };
  }

  const sourceShots = resolvedChain;
  const requested = shotIds?.length ? new Set(shotIds) : null;
  const shots = requested
    ? sourceShots.filter((s) => requested.has(s.id)).sort((a, b) => a.index - b.index)
    : sourceShots;
  if (shots.length === 0) {
    log(requested ? '上游镜头列表为空' : '分镜列表为空');
    return { ok: 0, fail: 0, skipped: 0 };
  }

  const patchShotOnChain = (shotId: string, patch: Partial<StoryboardShot>) => {
    const deskId = findDeskIdForShot(shotId, graphNodes);
    if (deskId && runtime?.updateNodeData) {
      const desk = graphNodes.find((n) => n.id === deskId);
      const chain = desk ? readChainStoryboard((desk.data ?? {}) as Record<string, unknown>) : undefined;
      if (chain) {
        const newShots = chain.shots.map((s) => (s.id === shotId ? { ...s, ...patch } : s));
        runtime.updateNodeData(deskId, { chainStoryboard: { ...chain, shots: newShots } } as Record<string, unknown>);
        return;
      }
    }
    // 画布未挂载时写镜像
    if (deskId) {
      const desk = useFlowGraphMirror.getState().nodes.find((n) => n.id === deskId);
      const chain = desk ? readChainStoryboard((desk.data ?? {}) as Record<string, unknown>) : undefined;
      if (chain) {
        const newShots = chain.shots.map((s) => (s.id === shotId ? { ...s, ...patch } : s));
        useFlowGraphMirror.getState().updateNodeData(deskId, {
          chainStoryboard: { ...chain, shots: newShots },
        } as Record<string, unknown>);
      }
    }
  };

  const unapproved = shots.filter((s) => s.keyframeStatus !== 'approved');
  if (unapproved.length > 0) {
    log(`还有 ${unapproved.length} 镜未批审关键帧，请先完成批审`);
  }
  // VG-43: 未批审 / 无分镜图镜头计为 skipped，随返回值与节点 message 上浮
  const skipped = shots.filter(
    (s) => !s.firstFrameAssetId || s.keyframeStatus !== 'approved',
  ).length;

  const targets = shots.filter(
    (s) =>
      s.firstFrameAssetId &&
      s.keyframeStatus === 'approved' &&
      (force || !s.videoAssetId),
  );
  if (targets.length === 0) {
    const allHave = shots.every((s) => s.videoAssetId);
    if (allHave) {
      log(`全部 ${shots.length} 镜已有视频`);
      return { ok: shots.length, fail: 0, skipped: 0 };
    }
    log('没有可生成视频的镜头（需要已批审 + 有分镜图）');
    return { ok: 0, fail: 0, skipped };
  }

  log(`开始批量视频 · ${targets.length} 镜`);
  let ok = 0;
  let fail = 0;
  const nodes = graphNodes;
  const edges = graphEdges;
  const clipNode = clipGenBlockId
    ? nodes.find((node) => node.id === clipGenBlockId)
    : nodes.find((node) => node.type === 'clip-gen');
  const clipData = (clipNode?.data ?? {}) as Record<string, unknown>;
  const previewNode =
    (clipGenBlockId
      ? edges
          .filter((edge) => edge.target === clipGenBlockId)
          .map((edge) => nodes.find((node) => node.id === edge.source))
          .find(
            (node) =>
              node &&
              (node.type === 'storyboard-desk' ||
                node.type === 'storyboard-preview' ||
                node.type === 'director-desk'),
          )
      : undefined) ??
    nodes.find((node) => node.type === 'storyboard-desk' || node.type === 'storyboard-preview');
  const previewPayload = (previewNode?.data?.storyboardPreview ?? null) as StoryboardPreviewPayload | null;
  const updateFn = (id: string, data: Record<string, unknown>) => {
    if (runtime?.updateNodeData) runtime.updateNodeData(id, data);
    else useFlowGraphMirror.getState().updateNodeData(id, data);
  };

  // VG-16: 批量与级联同口径收集上游参考板 / 图 / 视频
  const collectedUpstream = clipNode
    ? collectClipGenUpstream(
        clipNode.id,
        nodes as { id: string; type?: string; data?: Record<string, unknown> }[],
        edges as { source: string; target: string }[],
        clipData,
      )
    : { pack: null, pictures: [] as string[], clips: [] as string[] };
  const shotFrameUrls = new Set(
    targets.map((s) => s.firstFrameAssetId).filter((u): u is string => Boolean(u)),
  );
  const upstreamPictures = collectedUpstream.pictures.filter((u) => !shotFrameUrls.has(u));
  const upstreamClips = collectedUpstream.clips;
  const upstreamReferencePack = collectedUpstream.pack;

  // VG-01 预检：玩法 enforce / 模式前置不就绪 → 整批阻断，不空跑
  const preflight = await buildClipGenVideoRequest({
    data: clipData,
    prompt: 'preflight',
    imageUrl: targets[0].firstFrameAssetId ?? undefined,
    lastFrameUrl: targets[0].lastFrameAssetId ?? undefined,
    keyframeSource: 'shot',
    upstreamPictures,
    upstreamClips,
    upstreamReferencePack,
    resolveGenPack: getGenPack,
  });
  if (preflight.blocked) {
    if (clipNode) updateFn(clipNode.id, { status: 'error', error: preflight.blocked });
    log(`批量视频已阻断 · ${preflight.blocked}`);
    return { ok: 0, fail: 0, skipped: 0 };
  }

  // VG-06: 并发/重试单轨（兼容旧 maxRetry 字段名）
  const concurrency = Math.max(1, Math.min(8, Number(clipData.concurrency ?? 2) || 2));
  const maxRetries = Math.max(
    0,
    Math.min(5, Number(clipData.maxRetries ?? clipData.maxRetry ?? 1) || 0),
  );
  const modelId = (clipData.model as string | undefined) || 'veo';
  // VG-11: 工作台输入的补句作为全局附加句拼入每镜
  const userExtra = ((clipData.content as string) ?? '').trim();
  // VG-10: 轮询超时任务待恢复表（保留既有未恢复项）
  const pendingTasks: Record<string, PendingVideoTask> = {
    ...(((clipNode?.data as Record<string, unknown>)?.pendingVideoTasks ?? {}) as Record<
      string,
      PendingVideoTask
    >),
  };

  // VG-22: 队列取消 + 外部 signal 中断在途 proxyVideo/轮询
  const abort = new AbortController();
  const unsubQueue = useExecutionQueue.subscribe((state) => {
    if (state.phase === 'cancelled') abort.abort();
  });
  if (opts?.signal) {
    if (opts.signal.aborted) abort.abort();
    else opts.signal.addEventListener('abort', () => abort.abort(), { once: true });
  }
  if (clipNode) updateFn(clipNode.id, { status: 'running', error: undefined });

  const queue = useExecutionQueue.getState();
  queue.startBatch(targets.map((shot) => shot.id), 'core-videos');

  /** 单镜出片；轮询超时 → 记待恢复表并返回 pending */
  const runShot = async (shot: StoryboardShot): Promise<'ok' | 'pending'> => {
    const basePrompt =
      (shot.videoPromptPro || '').trim() ||
      (shot.videoPromptEn || '').trim() ||
      (shot.promptEn || '').trim() ||
      (shot.descriptionZh || '').trim() ||
      'cinematic motion, subtle camera move';
    const cameraPrompt = previewPayload?.frames.find(
      (frame) => frame.sourceShotId === shot.id,
    )?.director3dGuide?.cameraPrompt?.trim() || shot.director3dGuide?.cameraPrompt?.trim();
    const frameGuide = previewPayload?.frames.find(
      (frame) => frame.sourceShotId === shot.id,
    )?.director3dGuide ?? shot.director3dGuide;
    const placementPrompt = buildDirectorCharacterPlacementPrompt(frameGuide);
    const characterContext = buildCharacterContext({}, shot, doc.characters.characters);
    const environment = doc.environments?.environments.find(
      (item) => item.id === shot.sceneAssetId,
    );
    const scenePrompt = environment?.consistencyPrompt || environment?.descriptionZh;
    const guidePrefs = readStoryboardGuidePrefs();
    const guideOverlay = filterStoryboardGuideOverlay(resolveStoryboardGuideOverlay(shot), {
      enabled: guidePrefs.useForVideo,
      kinds: enabledGuideKinds(guidePrefs),
    });
    const guideSuffix = guidePrefs.useForVideo
      ? buildVideoGuidePromptSuffix(guideOverlay)
      : '';
    const rawPrompt = [
      basePrompt,
      userExtra,
      cameraPrompt,
      placementPrompt,
      characterContext.promptSuffix,
      scenePrompt,
      guideSuffix,
    ]
      .filter(Boolean)
      .join('\n\n');
    // VG-26: 与级联同口径解析 @角色/@场景 及上游媒体 mention
    const prompt = resolveClipGenPromptMentions(rawPrompt, {
      pictures: upstreamPictures,
      clips: upstreamClips,
      characters: [
        ...characterContext.characters,
        ...doc.characters.characters,
      ],
      environments: doc.environments?.environments ?? [],
    });
    patchShotOnChain(shot.id, { videoStatus: 'draft' });
    // 出片参考用「带箭头引导图」加强意图；提示词强制成片不画出箭头
    let guideImageUrl = shot.firstFrameAssetId ?? undefined;
    if (
      guidePrefs.useForVideo
      && shot.firstFrameAssetId
      && (guideOverlay.arrows.length || guideOverlay.marks.length)
    ) {
      try {
        const composed = await composeStoryboardGuideFrameDataUrl(
          shot.firstFrameAssetId,
          guideOverlay,
        );
        if (composed) guideImageUrl = composed;
      } catch {
        /* 合成失败则回退干净首帧 + 文案引导 */
      }
    }
    // VG-01/02/03/15/16: 统一经组装器；批量按镜首帧 + 上游参考
    const req = await buildClipGenVideoRequest({
      data: clipData,
      prompt,
      imageUrl: guideImageUrl,
      lastFrameUrl: shot.lastFrameAssetId ?? undefined,
      keyframeSource: 'shot',
      durationSec: shot.durationSec || (clipData.durationSec as number) || 5,
      upstreamPictures,
      upstreamClips,
      upstreamReferencePack,
      resolveGenPack: getGenPack,
    });
    if (req.blocked) throw new Error(req.blocked);
    let videoUrl: string | undefined;
    try {
      const awaited = await awaitProxyVideo(req.body, { signal: abort.signal });
      videoUrl = awaited.url;
    } catch (e) {
      if (e instanceof VideoPollTimeoutError) {
        pendingTasks[shot.id] = {
          taskId: e.taskId,
          prompt: req.prompt,
          model: modelId,
          providerBaseUrl: e.providerBaseUrl,
          submittedAt: new Date().toISOString(),
        };
        patchShotOnChain(shot.id, { videoStatus: 'draft' });
        return 'pending';
      }
      throw e;
    }
    if (!videoUrl) throw new Error('视频生成失败');

    // 本轮出片成功：清掉该镜历史待恢复任务，避免旧任务结果日后覆盖新版本
    delete pendingTasks[shot.id];
    const version = {
      id: `video-${shot.id}-${Date.now()}`,
      url: videoUrl,
      createdAt: new Date().toISOString(),
      prompt: req.prompt,
      model: modelId,
      status: 'candidate' as const,
    };
    // VG-09: 批量路径与级联路径同口径回流 usedAssetIds + revision pin
    const usage = collectClipUsedAssets(req.prompt, characterContext, shot);
    patchShotOnChain(shot.id, {
      ...appendStoryboardVideoVersion(shot as StoryboardShot, version),
      ...usage,
    });
    return 'ok';
  };

  // VG-06: 并发池 + 重试
  let pendingCount = 0;
  let nextIndex = 0;
  let doneCount = 0;
  const workerCount = Math.max(1, Math.min(concurrency, targets.length));
  log(`批量视频配置 · 并发 ${workerCount} · 重试 ${maxRetries}`);
  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      if (useExecutionQueue.getState().phase === 'cancelled' || abort.signal.aborted) return;
      const index = nextIndex;
      nextIndex += 1;
      if (index >= targets.length) return;
      const shot = targets[index];
      queue.reportProgress({
        done: doneCount,
        total: targets.length,
        currentBlockId: shot.id,
        currentLabel: `视频 #${shot.index + 1}`,
      });
      let attempt = 0;
      for (;;) {
        try {
          const outcome = await runShot(shot);
          if (outcome === 'pending') {
            pendingCount++;
            log(`视频任务转后台 · #${shot.index + 1}（可在工作台继续查询）`);
          } else {
            ok++;
            log(`视频完成 · #${shot.index + 1}`);
          }
          break;
        } catch (e) {
          if (attempt < maxRetries && useExecutionQueue.getState().phase !== 'cancelled') {
            attempt++;
            log(`视频重试 ${attempt}/${maxRetries} · #${shot.index + 1}: ${String(e)}`);
            continue;
          }
          fail++;
          delete pendingTasks[shot.id];
          patchShotOnChain(shot.id, { videoStatus: 'failed', status: 'failed' });
          log(`视频失败 · #${shot.index + 1}: ${String(e)}`);
          break;
        }
      }
      doneCount++;
      queue.reportProgress({ done: doneCount, total: targets.length, currentBlockId: null });
    }
  });
  await Promise.all(workers);
  unsubQueue();
  if (useExecutionQueue.getState().phase === 'cancelled' || abort.signal.aborted) {
    log('批量视频已停止');
  }

  const videoCancelled = useExecutionQueue.getState().phase === 'cancelled' || abort.signal.aborted;
  queue.reportProgress({ done: doneCount, total: targets.length, currentBlockId: null });
  queue.finish();
  const resultClipNode = clipGenBlockId
    ? (runtime?.getNodes() ?? graphNodes).find((node) => node.id === clipGenBlockId)
    : (runtime?.getNodes() ?? graphNodes).find((node) => node.type === 'clip-gen');
  if (resultClipNode) {
    const latestNodes = runtime?.getNodes() ?? getMirroredFlowGraph().nodes;
    const latestShots = getAllChainShots(latestNodes);
    const scoped = requested
      ? latestShots.filter((shot) => requested.has(shot.id))
      : latestShots;
    const completed = scoped
      .map((shot) => shot.videoAssetId)
      .filter((url): url is string => Boolean(url));
    updateFn(resultClipNode.id, {
      status: pendingCount > 0
        ? 'running'
        : videoCancelled
          ? 'idle'
          : fail > 0
            ? 'error'
            : 'success',
      videoUrls: completed,
      videoUrl: completed[0],
      batchCount: completed.length,
      pendingVideoTasks: pendingTasks,
      ...(pendingCount > 0
        ? { message: `${pendingCount} 个任务仍在后台生成，可在工作台继续查询` }
        : skipped > 0
          ? { message: `跳过 ${skipped} 镜（关键帧未批审或无分镜图）` }
          : { message: undefined }),
    });
  }
  doc.setProjectStatus('draft');
  log(`批量视频结束 · 成功 ${ok} · 失败 ${fail} · 跳过 ${skipped}${pendingCount ? ` · 后台 ${pendingCount}` : ''}`);
  return { ok, fail, skipped };
}

/**
 * 简单拼接导出：优先 FFmpeg concat 故事板视频；
 * 成功后标记 export-pack 节点 done + projectStatus。
 */
/** DR-03: 简单拼接导出只消费链镜表（runtime / 镜像），禁止回退全局 storyboard.shots。 */
export async function simpleConcatExport(): Promise<{ ok: boolean; url?: string; message?: string }> {
  const runtime = useFlowRuntime.getState().runtime;
  const mirrored = getMirroredFlowGraph();
  const graphNodes = runtime?.getNodes()?.length ? runtime.getNodes() : mirrored.nodes;
  const chainShots = getAllChainShots(graphNodes);
  const doc = useWorkspaceDocument.getState();
  const episodeId = resolveActiveEpisodeId(doc.storyboard);
  const scoped = episodeId
    ? chainShots.filter((s) => !s.episodeId || s.episodeId === episodeId)
    : chainShots;
  const shots = scoped.length > 0 ? scoped : chainShots;
  const exportNode = runtime?.getNodes().find((node) => node.type === 'export-pack');
  const exportData = (exportNode?.data ?? {}) as Record<string, unknown>;
  const reject = (message: string) => {
    if (exportNode) runtime?.updateNodeData(exportNode.id, { status: 'error', message });
    log(message);
    return { ok: false as const, message };
  };
  if (chainShots.length === 0) {
    return reject('未连接上游链镜表，已禁止回退全局导出（F-003）。请连接分镜台后再导出');
  }
  const missingVideoCount = shots.filter((shot) => !shot.videoAssetId).length;
  if (missingVideoCount > 0) {
    const message = `还有 ${missingVideoCount} 镜未生成视频，请补齐后再导出`;
    return reject(message);
  }
  const unapprovedVideoCount = shots.filter((shot) => shot.videoStatus !== 'approved').length;
  if (unapprovedVideoCount > 0) {
    const message = `还有 ${unapprovedVideoCount} 镜视频未采用，请在视频生成工作区确认`;
    return reject(message);
  }
  const withVideo = shots.filter((s) => s.videoAssetId);
  if (withVideo.length === 0) {
    return reject('没有可导出的视频镜头');
  }

  // 视频采用在视频生成工作区内完成，导出只处理当前集的已采用镜头。
  const exportShots = withVideo.map((s) => ({
    ...s,
    status: 'approved' as const,
    videoStatus: 'approved' as const,
  }));
  if (exportNode) runtime?.updateNodeData(exportNode.id, { status: 'running', message: undefined });

  log(`开始简单拼接导出 · ${exportShots.length} 段`);
  try {
    const res = await runExportPack({
      mode: 'ffmpeg-episode',
      prefix: (exportData.exportPrefix as string | undefined) || doc.storyboard.title || 'nx9-episode',
      audioUrl: (exportData.episodeAudioUrl as string | undefined)?.trim() || undefined,
      pictures: [],
      clips: exportShots.map((s) => s.videoAssetId!).filter(Boolean),
      sounds: [],
      prompts: [],
      shots: exportShots,
    });

    if (!res.ok) {
      return reject(`导出失败：${res.message ?? '未知错误'}`);
    }

    // 标记 export-pack 节点完成
    if (runtime) {
      const pack = exportNode ?? runtime.getNodes().find((n) => n.type === 'export-pack');
      if (pack) {
        const now = new Date().toISOString();
        const episodeId = resolveActiveEpisodeId(doc.storyboard);
        const episodeTitle = shots.find((shot) => shot.episodeId === episodeId)?.episodeTitle ?? null;
        const exportName = (exportData.exportPrefix as string | undefined) || doc.storyboard.title || 'nx9-episode';
        const fileName = exportName.toLowerCase().endsWith('.mp4') ? exportName : `${exportName}.mp4`;
        const exportRecord = res.url ? {
          id: `export-${Date.now()}`,
          episodeId,
          episodeTitle,
          url: res.url,
          fileName,
          mode: 'ffmpeg-episode' as const,
          shotCount: exportShots.length,
          durationSec: exportShots.reduce((sum, shot) => sum + Math.max(0, shot.durationSec), 0),
          createdAt: now,
        } : undefined;
        runtime.updateNodeData?.(pack.id, {
          status: 'success',
          episodeUrl: res.url,
          lastExportAt: now,
          exportMode: 'ffmpeg-episode',
          exportHistory: exportRecord
            ? appendEpisodeExportRecord(
                exportData.exportHistory as import('@nx9/shared').EpisodeExportRecord[] | undefined,
                exportRecord,
              )
            : exportData.exportHistory,
        });
      }
    }

    doc.setProjectStatus('exported');
    log(`导出完成 · ${res.url ?? 'ok'}`);
    return { ok: true, url: res.url };
  } catch (e) {
    return reject(`导出异常：${String(e)}`);
  }
}
