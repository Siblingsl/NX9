import type { Node, Edge } from '@xyflow/react';
import {
  gatherUpstream,
  mergeUpstreamPrompt,
  splitText,
  topologicalLayers,
  enrichPromptWithCharacters,
  buildCharacterContext,
  mergePromptBatchItems,
  promptItemsToBatch,
  buildLightRigPrompt,
  resolveAssetImportItems,
  type FlowBlock,
  type FlowLink,
  type TextSplitMode,
  type StoryboardShot,
  flattenScriptBreakdownShots,
  storyboardShotsFromScriptBreakdown,
  bindStoryboardShotAssets,
  buildStoryboardPreviewFramesFromBreakdown,
  buildStoryboardPreviewFrames,
  emptyStoryboardPreview,
  resolveStoryboardPreviewPictureSettings,
  activeChainEpisodeShots,
  migrateBlockKind,
  resolveVoiceCastLines,
  resolveEngine,
  resolveUpstreamShotsFromGraph,
  parseTimelineDraft,
  migrateTimelinePayload,
  filterStoryboardGuideOverlay,
  resolveStoryboardGuideOverlay,
  buildVideoGuidePromptSuffix,
  readChainStoryboard,
  type DirectorKeyframeBatch,
} from '@nx9/shared';
import { buildCameraPrompt, normalizeDirectorProject } from '@nx9/director3d';
import { api } from '../api/client';
import { awaitProxyVideo, VideoPollTimeoutError } from './poll-task';
import { buildClipGenVideoRequest, findUpstreamReferencePack } from './clip-gen-request';
import { collectClipUsedAssets } from './clip-used-assets';
import { getGenPack } from './gen-skill-runtime';
import { useWorkspaceDocument } from '../stores/workspace-document';
import {
  patchUpstreamShot,
  readUpstreamChainStoryboard,
  resolveShotsForBlock,
} from './chain-storyboard-utils';
import { pollMontageTaskUntilDone, renderClipEditorTimeline } from './clip-editor-render';
import { runSoundGenBgm, runSoundGenCast, synthesizeTts } from './sound-gen-runner';
import {
  enabledGuideKinds,
  readStoryboardGuidePrefs,
} from '../stores/storyboard-guide-prefs';
import { composeStoryboardGuideFrameDataUrl } from './storyboard-guide-compose';
import { advanceIteratorIndex } from './stage-deck/execution/iterator-index';

/** F-003/F-004: 双写——先写上游链，再写全局 store */
function patchFlowShot(
  blockId: string,
  shotId: string,
  patch: Partial<StoryboardShot>,
  updateNodeData?: (id: string, data: Record<string, unknown>) => void,
  nodes?: import('@xyflow/react').Node[],
  edges?: Array<{ source: string; target: string }>,
): void {
  // F-003: 仅写链镜表，禁止回退全局
  if (updateNodeData && nodes && edges) {
    patchUpstreamShot(updateNodeData, blockId, nodes, edges, shotId, patch);
  }
}

function linkedShotForBlock(blockId: string, data: Record<string, unknown>, nodes?: import('@xyflow/react').Node[], edges?: Array<{ source: string; target: string }>): StoryboardShot | undefined {
  // F-004: 优先从上游 chainStoryboard 读取
  if (nodes && edges) {
    const incoming = edges.filter((e) => e.target === blockId);
    for (const edge of incoming) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (!sourceNode) continue;
      const chain = (sourceNode.data as Record<string, unknown>)?.chainStoryboard as { shots?: StoryboardShot[] } | undefined;
      if (chain?.shots) {
        const linkedShotId = data.linkedShotId as string | undefined;
        return chain.shots.find((s) => s.id === linkedShotId || (s as any).linkedBlockId === blockId);
      }
    }
  }
  // F-003: 无上游链时不降级全局
  return undefined;
}

function characterContextForBlock(
  block: FlowBlock,
  upstreamPictures: string[] = [],
) {
  const d = block.data ?? {};
  const shot = linkedShotForBlock(block.id, d);
  const library = useWorkspaceDocument.getState().characters.characters;
  return buildCharacterContext(d, shot, library, upstreamPictures);
}

// OL-01 / OL-03 / VG-09：collectClipUsedAssets 移至 clip-used-assets.ts 与批量路径共用

export const RUNNABLE_BLOCKS = new Set([
  'prompt',
  'picture-gen',
  'clip-gen',
  'chat-model',
  'sound-gen',
  'passthrough',
  'preview-sink',
  'director-desk',
  'director-3d',
  'grid-split',
  'grid-compose',
  'story-grid',
  'memo',
  'asset-import',
  'text-chunker',
  'iterator',
  'picker',
  'clip-editor',
  'frame-endpoints',
  'scale-fit',
  'picture-merge',
  'link-parser',
  'prompt-studio',
  'style-lab',
  'local-enhance',
  'model-market',
  'batch-runner',
  'comfy-workflow',
  'grid-prompt-reverse',
  'photo-speak',
  'bg-remove',
  'upscale-lite',
  'watermark-clean',
  'motion-story',
  'shot-script',
  'reference-board',
  'script-desk',
  'dialogue-sheet',
  'voice-cast',
  'bridge-clip',
  'caption-asr',
  'seedance-chain',
  'thumbnail-maker',
  'inpaint-edit',
  'control-preprocess',
  'reference-analyze',
  'music-gen',
  'lipsync-pass',
  'continuity-check',
  'export-pack',
  'subtitle-burn',
  'audio-mix',
  'color-grade',
  'beat-sync',
  'variant-fork',
  'prompt-diff',
  'blocking-stage',
  'light-rig',
  'depth-pass',
  'picture-diff',
  'storyboard-preview',
]);

function toBlocks(nodes: Node[]): FlowBlock[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type ?? 'prompt',
    position: n.position,
    data: (n.data ?? {}) as Record<string, unknown>,
    width: n.width,
    height: n.height,
  }));
}

function toLinks(edges: Edge[]): FlowLink[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
  }));
}

export type RunProgress = {
  phase: 'idle' | 'running' | 'paused' | 'done' | 'error' | 'blocked';
  current: number;
  total: number;
  currentId?: string;
  completedIds?: string[];
  error?: string;
  pendingShots?: number[];
};

export class ReviewGateBlockedError extends Error {
  readonly pending: number[];

  constructor(pending: number[]) {
    super(`关键帧审阅未通过：镜头 ${pending.join(', ')} 尚未批准`);
    this.name = 'ReviewGateBlockedError';
    this.pending = pending;
  }
}

export class DirectorRunBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirectorRunBlockedError';
  }
}

async function executeBlock(
  block: FlowBlock,
  upstream: ReturnType<typeof gatherUpstream>,
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
  ctx?: { nodes: Node[]; edges: Edge[]; abortSignal?: AbortSignal },
): Promise<void> {
  /** 旧 kind 在未迁移工作区中仍可按合并目标执行 */
  const kind = migrateBlockKind(block.type);
  const d = block.data ?? {};
  const prompt = mergeUpstreamPrompt(upstream, d.content as string | undefined);

  updateNodeData(block.id, {
    upstream,
    upstreamPrompt: prompt,
    status: 'running',
  });

  if (kind === 'passthrough' || kind === 'memo') {
    updateNodeData(block.id, {
      upstream,
      status: 'success',
      content: (d.content as string) ?? prompt,
    });
    return;
  }

  if (kind === 'prompt') {
    const existing = (d.promptItems as { id: string; text: string; imageUrl?: string; note?: string }[]) ?? [];
    const merged = mergePromptBatchItems(existing, upstream.pictures, upstream.prompts);
    const mode = (d.promptMode as 'batch' | 'single' | 'broadcast') ?? 'batch';
    const globalPrompt = (d.globalPrompt as string) ?? '';
    const composeAction = (d.composeAction as 'generate' | 'merge' | 'merge-then-generate') ?? 'generate';
    const { jobs, dispatch } = promptItemsToBatch(merged, mode, globalPrompt, composeAction);
    updateNodeData(block.id, {
      status: 'success',
      promptItems: merged,
      promptBatch: jobs,
      promptDispatch: dispatch,
      content:
        globalPrompt.trim() ||
        merged.map((i) => i.text).filter(Boolean).join('\n\n') ||
        merged[0]?.text ||
        '',
      output: jobs.map((b) => b.prompt).join('\n\n'),
      batchCount: jobs.length,
    });
    return;
  }

  if (kind === 'script-desk' || kind === 'dialogue-sheet') {
    const {
      readScriptDeskPackage,
      extractBibleFromPackage,
      ingestScreenplayText,
      persistScriptDeskPackage,
      packageSummaryLine,
    } = await import('./script-desk-runner');
    const {
      isScreenplayPackage,
      screenplayFullText,
    } = await import('@nx9/shared');
    let pkg = isScreenplayPackage(d.package)
      ? d.package as import('@nx9/shared').ScreenplayPackage
      : readScriptDeskPackage(d);
    const source = screenplayFullText(pkg).trim() || ((d.sourceText as string) || prompt).trim();
    if (!source) throw new Error('编剧台缺少成稿文本');
    if (!screenplayFullText(pkg).trim()) {
      pkg = ingestScreenplayText(pkg, source, 'pasted');
    }
    // 主路径：抽取 Bible；不再调用 productionScriptBreakdown
    pkg = await extractBibleFromPackage(pkg);
    persistScriptDeskPackage(updateNodeData, block.id, pkg, {
      status: 'success',
      content: packageSummaryLine(pkg),
      output: screenplayFullText(pkg),
      legacyScriptBreakdown:
        d.legacyScriptBreakdown
        ?? (d.scriptBreakdown as import('@nx9/shared').ScriptBreakdownPayload | undefined),
    });
    return;
  }

  if (kind === 'storyboard-desk' || kind === 'storyboard-preview' || kind === 'story-grid') {
    // P0：若有 confirmed package 且无本地表 → 拆镜；不默认全量关键帧批出
    const screenplayPkg = upstream.screenplayPackages?.[0];
    const localBreakdown = d.scriptBreakdown as import('@nx9/shared').ScriptBreakdownPayload | undefined;
    const { isScreenplayPackage } = await import('@nx9/shared');
    const { applyDeskBreakdown } = await import('./storyboard-desk-runner');
    if (isScreenplayPackage(screenplayPkg) && screenplayPkg!.status === 'confirmed' && !localBreakdown) {
      const { runBreakdownFromPackage, assembleScreenplaySourceText } = await import('./storyboard-desk-runner');
      const sourceText = assembleScreenplaySourceText(screenplayPkg!);
      if (sourceText.trim()) {
        await runBreakdownFromPackage({
          blockId: block.id,
          pkg: screenplayPkg!,
          updateNodeData,
          getLiveBreakdown: () => (d.scriptBreakdown as import('@nx9/shared').ScriptBreakdownPayload | undefined),
        });
        return;
      }
    }
    // Fallback: 有旧上游镜表则导入
    const rawPayload =
      upstream.scriptBreakdowns?.[0] ??
      (d.scriptBreakdown as import('@nx9/shared').ScriptBreakdownPayload | undefined);
    if (rawPayload) {
      applyDeskBreakdown(block.id, rawPayload, updateNodeData, {
        content: `${rawPayload.title} · ${rawPayload.episodes.length} 集 · ${flattenScriptBreakdownShots(rawPayload).length} 镜`,
      });
      updateNodeData(block.id, { status: 'success' });
      return;
    }
    updateNodeData(block.id, { status: 'success', content: '分镜台：等待编剧台 confirmed package 拆镜' });
    return;
  }

  if (kind === 'picture-gen') {
    // PG-01: 唯一实现收敛到 executors/picture-gen-executor（含 F-017/F-024/F-032、
    // 环境注入、usedAssetIds 回流、全景守卫、AbortSignal）
    const { runPictureGenExecutor } = await import('./executors');
    await runPictureGenExecutor({
      block,
      prompt,
      upstream: {
        prompts: upstream.prompts,
        pictures: upstream.pictures,
        clips: upstream.clips,
        sounds: upstream.sounds,
        promptBatch: upstream.promptBatch,
        promptDispatch: upstream.promptDispatch,
      },
      updateNodeData,
      nodes: ctx?.nodes as unknown as import('./executors/types').ExecutorGraphNode[],
      edges: ctx?.edges,
      abortSignal: ctx?.abortSignal,
    });
    return;
  }

  if (kind === 'clip-gen') {
    const videoMode = (d.videoMode as string) ?? 'single';
    const directorBatch = d.directorKeyframeBatch as DirectorKeyframeBatch | undefined;
    const hasDirectorBatch = directorBatch?.version === 1 && Array.isArray(directorBatch.shots);
    // 仅当导演台写入参考 / 显式要求门禁时拦截；独立图生视频不受影响
    const fromDirector =
      !hasDirectorBatch
      && (
        (Array.isArray(d.directorDeskRefs) && d.directorDeskRefs.length > 0)
        || d.requireKeyframeGate === true
      );
    if (d.bypassKeyframeGate !== true && fromDirector) {
      if (!ctx?.nodes || !ctx.edges) {
        updateNodeData(block.id, {
          status: 'blocked',
          error: '关键帧门禁缺少画布上下文，拒绝回退全局镜表',
          meta: { gate: 'keyframe', from: 'director-desk' },
        });
        throw new ReviewGateBlockedError([]);
      }
      const linkedIds = (d.linkedShotIds as string[] | undefined) ?? [];
      const singleId = d.linkedShotId as string | undefined;
      const scopeIds =
        linkedIds.length > 0 ? linkedIds : singleId ? [singleId] : null;
      // DD-R-01: 按连接链投影，禁止读全局 storyboard。无链则不放行、不回退。
      const chain = readUpstreamChainStoryboard(block.id, ctx.nodes, ctx.edges);
      if (!chain) {
        updateNodeData(block.id, {
          status: 'blocked',
          error: '关键帧门禁未找到上游链镜表',
          meta: { gate: 'keyframe', from: 'director-desk' },
        });
        throw new ReviewGateBlockedError([]);
      }
      const episodeShots = activeChainEpisodeShots(chain);
      const shots = scopeIds
        ? episodeShots.filter((s) => scopeIds.includes(s.id))
        : episodeShots;
      if (shots.length > 0) {
        const pending = shots
          .filter((s) => s.keyframeStatus !== 'approved' && s.status !== 'approved')
          .map((s) => s.index)
          .sort((a, b) => a - b);
        if (pending.length > 0) {
          updateNodeData(block.id, {
            status: 'blocked',
            pendingShots: pending,
            meta: { pending, gate: 'keyframe', from: 'director-desk' },
          });
          throw new ReviewGateBlockedError(pending);
        }
      }
    }
    const charCtx = characterContextForBlock(block, upstream.pictures);
    const breakdown = upstream.scriptBreakdowns?.[0];
    const breakdownShots = flattenScriptBreakdownShots(breakdown);
    const confirmedPreview =
      (d.storyboardPreview as import('@nx9/shared').StoryboardPreviewPayload | undefined)?.confirmed;
    // VG-01: 上游参考板引用包（无本地玩法时兜底）
    const upstreamRefPack =
      ctx?.nodes && ctx?.edges
        ? findUpstreamReferencePack(
            block.id,
            ctx.nodes as unknown as import('./clip-gen-request').ClipGenGraphNode[],
            ctx.edges,
          )
        : null;
    /** VG-01: 组装失败即阻断（enforce 未就绪 / 模式缺前置） */
    const blockClipRun = (reason: string): never => {
      updateNodeData(block.id, { status: 'error', error: reason });
      throw new Error(reason);
    };

    if (hasDirectorBatch && directorBatch) {
      if (!ctx?.nodes || !ctx.edges) {
        updateNodeData(block.id, { status: 'blocked', error: '导演关键帧批次缺少画布上下文' });
        throw new DirectorRunBlockedError('导演关键帧批次缺少画布上下文');
      }
      const sourceChainNode = ctx.nodes.find((node) => node.id === directorBatch.sourceChainDeskId);
      const sourceChain = sourceChainNode
        ? readChainStoryboard(sourceChainNode.data as Record<string, unknown>)
        : undefined;
      if (!sourceChain) {
        updateNodeData(block.id, {
          status: 'blocked',
          error: '导演关键帧批次的 source chain 已断开',
        });
        throw new DirectorRunBlockedError('导演关键帧批次的 source chain 已断开');
      }

      const {
        consumeDirectorKeyframeBatch,
        validateDirectorKeyframeBatch,
      } = await import('./director-keyframe-batch-runner');
      if (directorBatch.status !== 'consumed') {
        const validation = validateDirectorKeyframeBatch(directorBatch, sourceChain);
        if (!validation.valid) {
          const consumedAt = new Date().toISOString();
          const staleReceipt = {
            batchId: directorBatch.batchId,
            status: 'stale' as const,
            consumedAt,
            succeededShotIds: directorBatch.receipt?.succeededShotIds ?? [],
            failed: validation.issues.map((issue) => ({
              shotId: issue.shotId,
              index: issue.index,
              error: issue.reason,
            })),
            videoUrlsByShotId: directorBatch.receipt?.videoUrlsByShotId ?? {},
          };
          const staleBatch: DirectorKeyframeBatch = {
            ...directorBatch,
            status: 'stale',
            receipt: staleReceipt,
          };
          const pending = [...new Set(validation.issues.map((issue) => issue.index))]
            .sort((a, b) => a - b);
          updateNodeData(block.id, {
            status: 'blocked',
            error: validation.issues.map((issue) => `#${issue.index} ${issue.reason}`).join('；'),
            pendingShots: pending,
            directorKeyframeBatch: staleBatch,
            directorBatchReceipt: staleReceipt,
          });
          throw new ReviewGateBlockedError(pending);
        }
      }

      updateNodeData(block.id, {
        directorKeyframeBatch: {
          ...directorBatch,
          status: 'consuming',
        },
        status: 'running',
        error: undefined,
      });
      const batchImageUrls = new Set(directorBatch.shots.map((item) => item.imageUrl));
      const externalPictures = upstream.pictures.filter((url) => !batchImageUrls.has(url));
      const directorPendingTasks: Record<string, {
        taskId: string;
        prompt?: string;
        model?: string;
        providerBaseUrl?: string;
        submittedAt?: string;
      }> = {
        ...(((d.pendingVideoTasks ?? {}) as Record<string, {
          taskId: string;
          prompt?: string;
          model?: string;
          providerBaseUrl?: string;
          submittedAt?: string;
        }>) ?? {}),
      };
      const modelId = (d.model as string) || 'veo';
      const result = await consumeDirectorKeyframeBatch({
        batch: directorBatch,
        chain: sourceChain,
        generateVideo: async (item, currentShot) => {
          const shotCharacterContext = buildCharacterContext(
            d,
            currentShot,
            useWorkspaceDocument.getState().characters.characters,
            [item.imageUrl, ...externalPictures],
          );
          const mentionRefs: import('@nx9/shared').MentionRef[] = [
            { id: `keyframe-${item.shotId}`, kind: 'picture', url: item.imageUrl, label: `镜头 #${item.index} 关键帧` },
          ];
          externalPictures.forEach((url, index) => {
            mentionRefs.push({ id: `pic-${index}`, kind: 'picture', url, label: `参考图 ${index + 1}` });
          });
          upstream.clips.forEach((url, index) => {
            mentionRefs.push({ id: `clip-${index}`, kind: 'clip', url, label: `参考视频 ${index + 1}` });
          });
          const resolved = (await import('@nx9/shared')).resolveMentionsForPrompt(
            item.prompt || 'cinematic scene',
            mentionRefs,
          );
          let finalPrompt = enrichPromptWithCharacters(
            resolved.resolved,
            shotCharacterContext.characters,
          );
          let imageUrl = item.imageUrl;
          const guidePrefs = readStoryboardGuidePrefs();
          if (guidePrefs.useForVideo) {
            const guide = filterStoryboardGuideOverlay(
              resolveStoryboardGuideOverlay(currentShot),
              { enabled: true, kinds: enabledGuideKinds(guidePrefs) },
            );
            finalPrompt = `${finalPrompt}\n\n${buildVideoGuidePromptSuffix(guide)}`.trim();
            if (guide.arrows.length || guide.marks.length) {
              try {
                const composed = await composeStoryboardGuideFrameDataUrl(imageUrl, guide);
                if (composed) imageUrl = composed;
              } catch {
                /* 保持干净关键帧 */
              }
            }
          }
          const request = await buildClipGenVideoRequest({
            data: d,
            prompt: finalPrompt,
            imageUrl,
            durationSec: item.durationSec,
            keyframeSource: 'shot',
            upstreamPictures: externalPictures,
            upstreamClips: upstream.clips,
            upstreamReferencePack: upstreamRefPack,
            resolveGenPack: getGenPack,
          });
          if (request.blocked) throw new Error(request.blocked);
          try {
            // VG-22/25: 透传取消信号；超时进恢复表而非硬失败
            const awaited = await awaitProxyVideo(request.body, { signal: ctx?.abortSignal });
            delete directorPendingTasks[item.shotId];
            const usage = collectClipUsedAssets(finalPrompt, shotCharacterContext, currentShot);
            return { videoUrl: awaited.url, shotPatch: usage };
          } catch (error) {
            if (error instanceof VideoPollTimeoutError) {
              directorPendingTasks[item.shotId] = {
                taskId: error.taskId,
                prompt: finalPrompt,
                model: modelId,
                providerBaseUrl: error.providerBaseUrl,
                submittedAt: new Date().toISOString(),
              };
            }
            throw error;
          }
        },
      });

      updateNodeData(directorBatch.sourceChainDeskId, {
        chainStoryboard: result.chain,
      });
      const videoUrls = result.batch.shots
        .map((item) => result.receipt.videoUrlsByShotId[item.shotId])
        .filter((url): url is string => Boolean(url));
      const pendingShotIds = new Set(Object.keys(directorPendingTasks));
      const hardFailed = result.receipt.failed.filter((f) => !pendingShotIds.has(f.shotId));
      const pendingCount = pendingShotIds.size;
      updateNodeData(block.id, {
        status: hardFailed.length > 0 ? 'error' : pendingCount > 0 ? 'running' : 'success',
        error: hardFailed.length > 0 ? `${hardFailed.length} 镜视频生成失败` : undefined,
        message: pendingCount > 0
          ? `${pendingCount} 个任务仍在后台生成，可继续查询`
          : undefined,
        pendingVideoTasks: directorPendingTasks,
        videoUrl: videoUrls[0],
        videoUrls,
        batchCount: videoUrls.length,
        directorKeyframeBatch: result.batch,
        directorBatchReceipt: result.receipt,
        content: `导演关键帧批次 ${result.receipt.succeededShotIds.length}/${result.batch.shots.length}`,
        lastResult: result.receipt,
      });
      updateNodeData(directorBatch.sourceDirectorDeskId, {
        lastVideoConsumptionReceipt: result.receipt,
      });
      if (hardFailed.length > 0) {
        throw new Error(`${hardFailed.length} 镜视频生成失败，已保留批次回执供重试`);
      }
      return;
    }

    // VG-21: Bridge 无源视频禁止静默回落单镜
    if (videoMode === 'bridge') {
      const clipUrl = (upstream.clips?.[0] || (d.sourceClipUrl as string) || '').trim();
      if (!clipUrl) {
        blockClipRun('Bridge 续拍需要源视频：请连接上游视频节点或上传源片');
      }
      const framesRes = await api.extractFrames(clipUrl, 1);
      const endFrameUrl = framesRes.frames?.[0];
      const nextPrompt = prompt || (d.content as string) || '';
      const continuationPrompt = (await import('@nx9/shared')).buildBridgeContinuationPrompt({
        sourcePrompt: upstream.prompts?.[0] ?? (d.content as string) ?? '',
        nextPrompt,
      });
      if (endFrameUrl) {
        // 写入 endFrame 供后续图生视频使用
        updateNodeData(block.id, {
          endFrameUrl,
          continuationPrompt,
          content: continuationPrompt,
          pictures: [endFrameUrl],
        });
        // 继续走单镜出片，以尾帧为 imageUrl（Bridge 自带首帧语义，跳过模式分发）
        const finalPrompt = enrichPromptWithCharacters(continuationPrompt, charCtx.characters);
        const bridgeReq = await buildClipGenVideoRequest({
          data: d,
          prompt: finalPrompt,
          imageUrl: endFrameUrl,
          resolveGenPack: getGenPack,
          applyModeDispatch: false,
        });
        if (bridgeReq.blocked) blockClipRun(bridgeReq.blocked);
        try {
          const awaited = await awaitProxyVideo(bridgeReq.body, { signal: ctx?.abortSignal });
          updateNodeData(block.id, {
            status: 'success',
            videoUrl: awaited.url,
            taskId: awaited.taskId,
            providerBaseUrl: awaited.providerBaseUrl,
            endFrameUrl,
            continuationPrompt,
            content: finalPrompt,
            error: undefined,
            message: undefined,
          });
        } catch (error) {
          if (error instanceof VideoPollTimeoutError) {
            updateNodeData(block.id, {
              status: 'running',
              taskId: error.taskId,
              providerBaseUrl: error.providerBaseUrl,
              endFrameUrl,
              continuationPrompt,
              content: finalPrompt,
              error: undefined,
              message: error.message,
            });
            return;
          }
          throw error;
        }
        return;
      }
      blockClipRun('Bridge 续拍抽尾帧失败：请检查源视频是否可访问');
    }

    // chain/motion 已下线假批出：旧节点回退为单镜逻辑（下方）

    // 多镜 + 多参考图：按镜批量图生视频（真实出片）
    if (breakdownShots.length > 1 && upstream.pictures.length > 1) {
      const clips: string[] = [];
      const multiPendingTasks: Record<string, {
        taskId: string;
        prompt?: string;
        model?: string;
        providerBaseUrl?: string;
        submittedAt?: string;
      }> = {
        ...(((d.pendingVideoTasks ?? {}) as Record<string, {
          taskId: string;
          prompt?: string;
          model?: string;
          providerBaseUrl?: string;
          submittedAt?: string;
        }>) ?? {}),
      };
      const modelId = (d.model as string) || 'veo';
      const count = Math.min(breakdownShots.length, upstream.pictures.length);
      for (let i = 0; i < count; i++) {
        if (ctx?.abortSignal?.aborted) {
          updateNodeData(block.id, {
            status: 'running',
            pendingVideoTasks: multiPendingTasks,
            message: Object.keys(multiPendingTasks).length > 0
              ? '已停止；已提交的任务可继续查询'
              : '已停止',
            videoUrl: clips[0],
            videoUrls: clips,
            batchCount: clips.length,
          });
          return;
        }
        const shot = breakdownShots[i];
        let imageUrl = upstream.pictures[i];
        // F-003: 链优先读取上游镜表
        const chainShots = ctx?.nodes && ctx?.edges
          ? (() => {
              const upstreamPolicy = (block.data as Record<string, unknown>)?.upstreamPolicy as import('@nx9/shared').UpstreamPolicy | undefined;
              const primarySourceId = (block.data as Record<string, unknown>)?.primarySourceId as string | null | undefined;
              const upstream = gatherUpstream(block.id, ctx!.nodes as any, ctx!.edges as any, upstreamPolicy, primarySourceId);
              const upstreamChain = upstream.shotIds;
               if ((upstreamChain?.length ?? 0) > 0) {
                const inc = ctx!.edges.filter((e) => e.target === block.id);
                for (const e of inc) {
                  const src = ctx!.nodes.find((n) => n.id === e.source);
                  if (!src) continue;
                  const ch = (src.data as Record<string, unknown>)?.chainStoryboard as { shots?: any[] } | undefined;
                  if (ch?.shots) return ch.shots.find((s) => s.id === shot.id || s.index === i);
                }
              }
              return undefined;
            })()
          : undefined;
        // F-003: 链优先，不再回退全局镜表
        const boardShot = chainShots;
        // F-024: 解析 @mention 引用
        const clipMentionRefs: import('@nx9/shared').MentionRef[] = [];
        upstream.pictures.forEach((url, i) => clipMentionRefs.push({ id: `pic-${i}`, kind: 'picture', url, label: `图 ${i+1}` }));
        upstream.clips.forEach((url, i) => clipMentionRefs.push({ id: `clip-${i}`, kind: 'clip', url, label: `视频 ${i+1}` }));
        const rawClipPrompt = shot.videoPrompt || shot.imagePrompt || prompt || 'cinematic scene';
        const resolvedClip = (await import('@nx9/shared')).resolveMentionsForPrompt(rawClipPrompt, clipMentionRefs);
        let finalPrompt = enrichPromptWithCharacters(
          resolvedClip.resolved,
          charCtx.characters,
        );
        if (boardShot && imageUrl) {
          const guidePrefs = readStoryboardGuidePrefs();
          if (guidePrefs.useForVideo) {
            const guide = filterStoryboardGuideOverlay(
              resolveStoryboardGuideOverlay(boardShot),
              { enabled: true, kinds: enabledGuideKinds(guidePrefs) },
            );
            finalPrompt = `${finalPrompt}\n\n${buildVideoGuidePromptSuffix(guide)}`.trim();
            if (guide.arrows.length || guide.marks.length) {
              try {
                const composed = await composeStoryboardGuideFrameDataUrl(imageUrl, guide);
                if (composed) imageUrl = composed;
              } catch {
                /* keep clean */
              }
            }
          }
        }
        // VG-01/02/03: 统一经组装器（玩法装配 / 参考数组 / 模式分发 / 高级参数）
        const shotReq = await buildClipGenVideoRequest({
          data: d,
          prompt: finalPrompt,
          imageUrl,
          durationSec: shot.durationSec || undefined,
          keyframeSource: 'shot',
          upstreamPictures: upstream.pictures,
          upstreamClips: upstream.clips,
          upstreamReferencePack: upstreamRefPack,
          resolveGenPack: getGenPack,
        });
        if (shotReq.blocked) blockClipRun(shotReq.blocked);
        const pendingKey = boardShot?.id ?? shot.id ?? `idx-${i}`;
        try {
          const awaited = await awaitProxyVideo(shotReq.body, { signal: ctx?.abortSignal });
          delete multiPendingTasks[pendingKey];
          clips.push(awaited.url);
          // 写回故事板 SSOT + usedAssetIds
          if (boardShot) {
            const usage = collectClipUsedAssets(shotReq.prompt, charCtx, boardShot);
            patchFlowShot(block.id, boardShot.id, {
              videoAssetId: awaited.url,
              videoStatus: 'review',
              status: 'review',
              ...usage,
            }, updateNodeData, ctx?.nodes, ctx?.edges);
          }
        } catch (error) {
          if (error instanceof VideoPollTimeoutError) {
            multiPendingTasks[pendingKey] = {
              taskId: error.taskId,
              prompt: shotReq.prompt,
              model: modelId,
              providerBaseUrl: error.providerBaseUrl,
              submittedAt: new Date().toISOString(),
            };
            continue;
          }
          throw error;
        }
      }
      const pendingCount = Object.keys(multiPendingTasks).length;
      const batchUsage = collectClipUsedAssets(
        breakdown?.title ?? prompt,
        charCtx,
        undefined,
      );
      updateNodeData(block.id, {
        status: pendingCount > 0 ? 'running' : 'success',
        videoUrl: clips[0],
        videoUrls: clips,
        batchCount: clips.length,
        content: breakdown?.title ?? prompt,
        characterInjected: charCtx.characters.map((c) => c.id),
        usedAssetIds: batchUsage.usedAssetIds,
        pendingVideoTasks: multiPendingTasks,
        message: pendingCount > 0
          ? `${pendingCount} 个任务仍在后台生成，可继续查询`
          : undefined,
        lastResult: { count: clips.length, urls: clips, confirmedPreview, usedAssetIds: batchUsage.usedAssetIds },
      });
      return;
    }

    // F-024: 解析 @mention 引用
    const rawSinglePrompt = breakdownShots[0]?.videoPrompt || prompt || 'cinematic scene';
    const singleMentionRefs: import('@nx9/shared').MentionRef[] = [];
    upstream.pictures.forEach((url, i) => singleMentionRefs.push({ id: `pic-${i}`, kind: 'picture', url, label: `图 ${i+1}` }));
    upstream.clips.forEach((url, i) => singleMentionRefs.push({ id: `clip-${i}`, kind: 'clip', url, label: `视频 ${i+1}` }));
    const resolvedSingle = (await import('@nx9/shared')).resolveMentionsForPrompt(rawSinglePrompt, singleMentionRefs);
    const finalPrompt = enrichPromptWithCharacters(
      resolvedSingle.resolved,
      charCtx.characters,
    );
    const imageUrl = upstream.pictures[0] ?? charCtx.referenceImageUrl;
    // VG-01/02/03: 统一经组装器（玩法装配 / 参考数组 / 模式分发 / 高级参数）
    const singleReq = await buildClipGenVideoRequest({
      data: d,
      prompt: finalPrompt,
      imageUrl,
      upstreamPictures: upstream.pictures,
      upstreamClips: upstream.clips,
      upstreamReferencePack: upstreamRefPack,
      resolveGenPack: getGenPack,
    });
    if (singleReq.blocked) blockClipRun(singleReq.blocked);
    try {
      const awaited = await awaitProxyVideo(singleReq.body, { signal: ctx?.abortSignal });
      const linkedClipShot = linkedShotForBlock(block.id, d);
      const singleUsage = collectClipUsedAssets(singleReq.prompt, charCtx, linkedClipShot);
      updateNodeData(block.id, {
        status: 'success',
        videoUrl: awaited.url,
        taskId: awaited.taskId,
        providerBaseUrl: awaited.providerBaseUrl,
        content: singleReq.prompt,
        referencePackUsed: singleReq.playbookId,
        characterInjected: charCtx.characters.map((c) => c.id),
        usedAssetIds: singleUsage.usedAssetIds,
        lastResult: { url: awaited.url, taskId: awaited.taskId, usedAssetIds: singleUsage.usedAssetIds },
        error: undefined,
        message: undefined,
      });
      // 单镜绑定写回
      if (linkedClipShot) {
        patchFlowShot(block.id, linkedClipShot.id, {
          videoAssetId: awaited.url,
          videoStatus: 'review',
          status: 'review',
          ...singleUsage,
        }, updateNodeData, ctx?.nodes, ctx?.edges);
      }
    } catch (error) {
      if (error instanceof VideoPollTimeoutError) {
        updateNodeData(block.id, {
          status: 'running',
          taskId: error.taskId,
          providerBaseUrl: error.providerBaseUrl,
          content: singleReq.prompt,
          referencePackUsed: singleReq.playbookId,
          error: undefined,
          message: error.message,
        });
        return;
      }
      throw error;
    }
    return;
  }

  if (kind === 'chat-model') {
    const messages = [
      ...(d.systemPrompt ? [{ role: 'system', content: d.systemPrompt as string }] : []),
      { role: 'user', content: prompt || (d.content as string) || 'Hello' },
    ];
    try {
      const res = (await api.proxyLlm({
        messages,
        model: (d.model as string) || 'gpt-4o-mini',
      })) as { choices?: { message?: { content?: string } }[] };
      const reply = res.choices?.[0]?.message?.content ?? '';
      updateNodeData(block.id, {
        status: 'success',
        lastReply: reply,
        output: reply,
        content: reply,
      });
    } catch (e) {
      updateNodeData(block.id, { status: 'error', error: String(e) });
    } finally {
      const s = block.data?.status as string | undefined;
      if (s === 'running') {
        updateNodeData(block.id, { status: 'idle' });
      }
    }
    return;
  }

  if (kind === 'sound-gen') {
    const soundMode = (d.soundMode as string) || 'tts';
    if (soundMode === 'music') {
      const bgmPrompt = (d.content as string) || prompt || '';
      const url = await runSoundGenBgm(bgmPrompt, 30);
      updateNodeData(block.id, { status: 'success', audioUrl: url, content: bgmPrompt });
      return;
    }
    if (soundMode === 'cast') {
      const { lines, source } = resolveVoiceCastLines(
        d.lines as { speaker: string; text: string; emotion?: string }[] | undefined,
        upstream.lines,
      );
      const profileMap = (d.profileMap as Record<string, string>) ?? {};
      if (lines.length === 0) {
        throw new Error('无可解析的对白（请连接编剧台或已拆镜的分镜台）');
      }
      const { results, audioUrls } = await runSoundGenCast(lines, profileMap);
      updateNodeData(block.id, {
        status: audioUrls.length > 0 ? 'success' : 'error',
        results,
        sounds: audioUrls,
        audioUrl: audioUrls[0],
        lines,
        lineSource: source,
        profileMap,
        meta: { total: results.length, failed: results.filter((r) => r.error).length, lineSource: source },
      });
      if (audioUrls.length === 0) throw new Error('多角色配音全部失败');
      return;
    }
    const text = prompt || (d.content as string) || (d.text as string) || '';
    if (!text.trim()) throw new Error('配音文本为空');
    const provider = (d.provider as string) || 'cloud';
    const referenceAudioUrl = (d.referenceAudioUrl as string) || '';
    const res = await synthesizeTts({
      input: text,
      voice: (d.voice as string) || 'alloy',
      provider,
      referenceAudioUrl,
      characterId: (d.characterId as string) || undefined,
      audioFormat: (d.audioFormat as string) || undefined,
      speechRate: typeof d.speechRate === 'number' ? d.speechRate : undefined,
      instructions: (d.instructions as string) || undefined,
    });
    updateNodeData(block.id, {
      status: 'success',
      audioUrl: res.url,
      content: text,
      providerUsed: res.provider,
    });
    return;
  }

  if (kind === 'director-desk') {
    const {
      runDirectorDeskBatch,
      findDirectorPictureGenNode,
      resolveDirectorRunContext,
      syncStyleToPictureGen,
      openReviewAfterDirectorBatch,
    } = await import('./director-desk-runner');
    const directorContext = ctx
      ? resolveDirectorRunContext({
          deskBlockId: block.id,
          nodes: ctx.nodes,
          edges: ctx.edges,
          blockData: d as Record<string, unknown>,
          updateNodeData,
        })
      : undefined;
    if (!directorContext || directorContext.status !== 'ready' || !directorContext.patchShot) {
      const reason = directorContext?.reason ?? '画布运行缺少节点图上下文';
      updateNodeData(block.id, {
        status: 'blocked',
        error: reason,
        content: `导演台已阻断：${reason}`,
        ...(directorContext?.blockCode === 'stale-handoff'
          ? {
              lastHandoffStatus: 'stale',
              lastHandoffInvalidReason: reason,
            }
          : {}),
      });
      throw new DirectorRunBlockedError(reason);
    }
    const pictureNode =
      ctx?.nodes && ctx?.edges
        ? findDirectorPictureGenNode(block.id, ctx.nodes, ctx.edges)
        : undefined;
    const filter = (d.queueFilter as 'missing' | 'failed' | 'selected' | '3donly' | 'all') ?? 'missing';
    const selectedShotIds = (Array.isArray(d.selectedShotIds) ? d.selectedShotIds : [])
      .filter((id): id is string => typeof id === 'string');
    if (filter === 'selected' && selectedShotIds.length === 0) {
      const reason = '导演台筛选为“选中镜头”，但没有选中任何镜头';
      updateNodeData(block.id, { status: 'blocked', error: reason, content: `导演台已阻断：${reason}` });
      throw new DirectorRunBlockedError(reason);
    }
    const styleSeedRaw = d.styleSeed;
    const styleSeed =
      styleSeedRaw === null || styleSeedRaw === undefined || styleSeedRaw === ''
        ? null
        : Number(styleSeedRaw);
    const syncStyle = (d.syncStyleToPicture as boolean | undefined) ?? true;
    if (syncStyle && pictureNode) {
      syncStyleToPictureGen({
        deskBlockId: block.id,
        nodes: ctx?.nodes ?? [],
        edges: ctx?.edges ?? [],
        updateNodeData,
        styleSeed: styleSeed != null && Number.isFinite(styleSeed) ? styleSeed : null,
        stylePrompt: (d.stylePrompt as string | undefined) || undefined,
        styleLock: (d.styleLock as boolean | undefined) ?? true,
        negativePrompt: (d.negativePrompt as string | undefined) || undefined,
      });
    }
    const pictureData = {
      ...((pictureNode?.data ?? {}) as Record<string, unknown>),
      ...(styleSeed != null && Number.isFinite(styleSeed) ? { seed: styleSeed } : {}),
    };
    const summary = await runDirectorDeskBatch({
      sourceDirectorDeskId: block.id,
      filter,
      shotIds: filter === 'selected' ? selectedShotIds : undefined,
      skipExisting: (d.skipExisting as boolean | undefined) ?? true,
      skipApproved: (d.skipApproved as boolean | undefined) ?? true,
      concurrency: (d.concurrency as number | undefined) ?? 2,
      maxRetries: (d.maxRetries as number | undefined) ?? 1,
      forceCharacterRef: (d.forceCharacterRef as boolean | undefined) ?? true,
      forceSceneRef: (d.forceSceneRef as boolean | undefined) ?? true,
      styleLock: (d.styleLock as boolean | undefined) ?? true,
      prefer3dRef: (d.prefer3dRef as boolean | undefined) ?? true,
      stylePrompt: (d.stylePrompt as string | undefined) || undefined,
      styleSeed: styleSeed != null && Number.isFinite(styleSeed) ? styleSeed : null,
      pictureNodeData: pictureData,
      upstreamPictures: upstream.pictures,
      blockData: d as Record<string, unknown>,
      shots: directorContext.shots,
      patchShot: directorContext.patchShot,
      lineArtByShotId: directorContext.lineArtByShotId,
      preferLineArtRef: (d.preferLineArtRef as boolean | undefined) ?? true,
      reviewMode: (d.reviewMode as 'manual' | 'auto' | undefined) ?? 'manual',
      globalArtDirection: useWorkspaceDocument.getState().storyboard.globalArtDirection,
      episodeArtDirection: directorContext.chain?.episodes
        ?.find((episode) => episode.id === directorContext.episodeId)
        ?.artDirection,
      characters: useWorkspaceDocument.getState().characters.characters,
      environments: useWorkspaceDocument.getState().environments?.environments ?? [],
    });
    if (summary.total === 0) {
      updateNodeData(block.id, {
        status: 'success',
        content: '队列为空（无待出关键帧）',
        batchSummary: summary,
      });
      return;
    }
    updateNodeData(block.id, {
      status: summary.failed > 0 && summary.done === 0 ? 'error' : 'success',
      previewUrl: summary.lastUrl,
      content: `批出 ${summary.done}/${summary.total} · 失败 ${summary.failed}` +
        (summary.retried ? ` · 重试 ${summary.retried}` : ''),
      batchSummary: {
        total: summary.total,
        done: summary.done,
        failed: summary.failed,
        skipped: summary.skipped,
        retried: summary.retried ?? 0,
        at: new Date().toISOString(),
      },
      lastResults: summary.results.map((r) => ({
        shotId: r.shotId,
        ok: r.ok,
        url: r.url,
        error: r.error,
        attempts: r.attempts,
        phase: r.phase,
        usedRefs: r.usedRefs,
      })),
      error: summary.failed > 0 ? `${summary.failed} 镜失败` : undefined,
    });
    const autoOpenReview = (d.autoOpenReview as boolean | undefined) ?? true;
    if (autoOpenReview && summary.done > 0 && ctx?.nodes && ctx?.edges) {
      const { resolveUpstreamChainDesk } = await import('./chain-storyboard-utils');
      openReviewAfterDirectorBatch({
        deskBlockId: block.id,
        nodes: ctx.nodes,
        edges: ctx.edges,
        updateNodeData,
        succeededShotIds: summary.results.filter((r) => r.ok).map((r) => r.shotId),
        shots: directorContext.shots,
        episodeId: directorContext.episodeId,
        sourceChainDeskId: resolveUpstreamChainDesk(block.id, ctx.nodes, ctx.edges) ?? undefined,
        openSession: true,
      });
    }
    return;
  }

  if (kind === 'grid-split') {
    const sourceUrl = upstream.pictures[0];
    if (!sourceUrl) throw new Error('缺少 picture 输入');
    const rows = (d.rows as number) ?? 3;
    const cols = (d.cols as number) ?? 3;
    const res = await api.gridSplit({ sourceUrl, rows, cols });
    updateNodeData(block.id, {
      status: 'success',
      splitUrls: res.urls,
      pictures: res.urls,
    });
    return;
  }

  if (kind === 'grid-compose') {
    const imageUrls = upstream.pictures;
    if (imageUrls.length === 0) throw new Error('缺少 picture 输入');
    const rows = (d.rows as number) ?? 3;
    const cols = (d.cols as number) ?? 3;
    const res = await api.gridCompose({ imageUrls, rows, cols });
    updateNodeData(block.id, {
      status: 'success',
      composedUrl: res.url,
      previewUrl: res.url,
    });
    return;
  }

  if (kind === 'asset-import') {
    const items = resolveAssetImportItems(d as Record<string, unknown>);
    const pictures = items.filter((i) => i.mediaKind === 'picture').map((i) => i.url);
    updateNodeData(block.id, {
      status: 'success',
      output: items[0]?.url,
      previewUrl: pictures[0] ?? (items[0]?.mediaKind === 'picture' ? items[0].url : undefined),
      previewUrls: pictures,
    });
    return;
  }

  if (kind === 'text-chunker') {
    const source =
      upstream.prompts.join('\n\n') || (d.content as string) || '';
    const mode = ((d.mode as string) || 'paragraph') as TextSplitMode;
    const chunks = splitText(source, mode, d.regex as string | undefined);
    updateNodeData(block.id, {
      status: 'success',
      chunks,
      content: chunks.join('\n\n'),
      chunkCount: chunks.length,
    });
    return;
  }

  if (kind === 'iterator') {
    const pool = [
      ...upstream.prompts,
      ...upstream.pictures,
      ...upstream.clips,
      ...((d.pool as string[]) ?? []),
    ];
    const idx = ((d.currentIndex as number) ?? 0) % Math.max(pool.length, 1);
    const next = pool.length ? pool[idx] : '';
    updateNodeData(block.id, {
      status: 'success',
      currentIndex: advanceIteratorIndex(idx, pool.length),
      lastEmittedIndex: idx,
      iterItems: pool,
      content: next,
      output: next,
    });
    return;
  }

  if (kind === 'picker') {
    const pool = upstream.pictures.length
      ? upstream.pictures
      : upstream.clips.length
        ? upstream.clips
        : upstream.prompts;
    const pickIndex = Math.min(
      Math.max(0, (d.pickIndex as number) ?? 0),
      Math.max(0, pool.length - 1),
    );
    const picked = pool[pickIndex] ?? '';
    updateNodeData(block.id, {
      status: 'success',
      pickIndex,
      iterItems: pool,
      content: picked,
      output: picked,
      previewUrl: upstream.pictures.length ? picked : undefined,
      videoUrl: upstream.clips.length ? picked : undefined,
    });
    return;
  }

  if (kind === 'clip-editor') {
    const editorMode = (d.editorMode as string) ?? '';
    // SE-04: audio/grade 为显式工具模式（无新剪辑台 UI 入口）；仅当节点数据显式设置 editorMode 时进入。
    // 智能剪辑主路径走下方 timeline + renderClipEditorTimeline，勿与此混用。
    if (editorMode === 'audio') {
      const tracks = upstream.sounds ?? [];
      if (tracks.length < 2) throw new Error('至少需要 2 条音频（editorMode=audio 混音工具）');
      const mixRes = await api.mixAudio(tracks, (d.normalize as boolean | undefined) ?? true);
      if (!mixRes.ok || !mixRes.url) throw new Error(mixRes.message ?? '混音失败');
      updateNodeData(block.id, {
        status: 'success',
        outputSound: mixRes.url,
        sounds: [mixRes.url],
        meta: { trackCount: mixRes.trackCount, legacyTool: 'audio-mix' },
      });
      return;
    }
    if (editorMode === 'grade') {
      const source = upstream.clips?.[0] ?? upstream.pictures?.[0];
      if (!source) throw new Error('需要上游图像或视频（editorMode=grade 调色工具）');
      const gradeRes = await api.colorGrade({
        sourceUrl: source,
        brightness: (d.brightness as number) ?? 0,
        contrast: (d.contrast as number) ?? 1,
        saturation: (d.saturation as number) ?? 1,
      });
      if (!gradeRes.ok || !gradeRes.url) throw new Error(gradeRes.message ?? '调色失败');
      updateNodeData(block.id, {
        status: 'success',
        outputUrl: gradeRes.url,
        previewUrl: gradeRes.url,
        videoUrl: upstream.clips?.[0] ? gradeRes.url : undefined,
        meta: { legacyTool: 'color-grade' },
      });
      return;
    }
    // Smart edit: 节点本地时间线 + 连接链镜表，禁止读全局 storyboard
    const parsed = parseTimelineDraft(d.timelineDraft as import('@nx9/shared').TimelineDraftRaw);
    let timelineDraft = parsed ? migrateTimelinePayload(parsed) : null;
    const profile = ((d.profile as string) ?? 'drama') as import('@nx9/shared').SmartEditProfile;
    if (!timelineDraft) {
      const { orchestrateDramaTimeline, orchestrateViralTimeline } = await import('./smart-edit-orchestrator');
      if (profile === 'drama') {
        if (!ctx) throw new Error('智能剪辑缺少画布上下文');
        const linkedIds = (d.linkedShotIds as string[] | undefined) ?? [];
        const upstreamShots = resolveUpstreamShotsFromGraph(block.id, ctx.nodes, ctx.edges);
        const shots =
          linkedIds.length > 0
            ? upstreamShots.shots.filter((s) => linkedIds.includes(s.id))
            : upstreamShots.shots;
        if (shots.length === 0) {
          throw new Error('智能剪辑未连接镜头上游，无法漫剧编排');
        }
        const result = await orchestrateDramaTimeline({
          approvedOnly: true,
          shots,
          bgmUrl: upstream.sounds[0],
        });
        if (result.timeline) {
          timelineDraft = migrateTimelinePayload(result.timeline);
          updateNodeData(block.id, {
            timelineDraft: result.timeline,
            suggestions: result.suggestions,
            pendingSuggestionIds: result.suggestions.map((s) => s.id),
          });
        }
      } else if (upstream.clips.length > 0) {
        const result = await orchestrateViralTimeline({
          clips: upstream.clips,
          bgmUrl: upstream.sounds[0],
        });
        if (result.timeline) {
          timelineDraft = migrateTimelinePayload(result.timeline);
          updateNodeData(block.id, {
            timelineDraft: result.timeline,
            suggestions: result.suggestions,
            pendingSuggestionIds: result.suggestions.map((s) => s.id),
          });
        }
      }
    }
    const freshTimeline = timelineDraft;
    if (!freshTimeline) throw new Error('编排未生成时间线');
    const engine = resolveEngine(
      profile,
      ((d.engine as string) ?? 'auto') as import('@nx9/shared').SmartEditEngine,
    );
    updateNodeData(block.id, { status: 'running' });
    const rendered = await renderClipEditorTimeline(freshTimeline, engine, {
      profile,
      title: (d.title as string) || '智能剪辑',
      templateId: (d.templateId as string) || 'nx9-vertical-episode',
    });
    updateNodeData(block.id, {
      status: 'success',
      videoUrl: rendered.url,
      outputUrl: rendered.url,
      renderTaskId: rendered.taskId,
      renderBackend: rendered.engine,
    });
    return;
  }

  if (kind === 'asset-bundle') {
    const items: { kind: string; url: string; label?: string }[] = [];
    upstream.pictures.forEach((url, i) => items.push({ kind: 'picture', url, label: `图 ${i + 1}` }));
    upstream.clips.forEach((url, i) => items.push({ kind: 'clip', url, label: `视频 ${i + 1}` }));
    upstream.sounds.forEach((url, i) => items.push({ kind: 'sound', url, label: `音频 ${i + 1}` }));
    upstream.prompts.forEach((url, i) => items.push({ kind: 'text', url, label: `文本 ${i + 1}` }));
    updateNodeData(block.id, {
      status: 'success',
      bundleItems: items,
      bundleCount: items.length,
    });
    return;
  }

  if (kind === 'render-slot') {
    const fillUrl = upstream.pictures[0] || upstream.clips[0];
    updateNodeData(block.id, {
      status: 'success',
      filledUrl: fillUrl,
      previewUrl: upstream.pictures[0],
      videoUrl: upstream.clips[0],
      slotPrompt: (d.slotPrompt as string) || prompt,
    });
    return;
  }

  if (kind === 'frame-endpoints') {
    const videoUrl = upstream.clips[0] || (d.videoUrl as string);
    if (!videoUrl) throw new Error('缺少视频输入');
    const res = await api.extractFrames(videoUrl, (d.frameCount as number) ?? 2);
    if (!res.ok || !res.frames?.length) throw new Error(res.message ?? '抽帧失败');
    updateNodeData(block.id, {
      status: 'success',
      frameUrls: res.frames,
      firstFrameUrl: res.frames[0],
      lastFrameUrl: res.frames[res.frames.length - 1],
      pictures: res.frames,
      previewUrl: res.frames[0],
    });
    return;
  }

  if (kind === 'frame-sampler') {
    const videoUrl = upstream.clips[0] || (d.videoUrl as string);
    if (!videoUrl) throw new Error('缺少视频输入');
    const res = await api.extractFrames(videoUrl, (d.frameCount as number) ?? 6);
    if (!res.ok || !res.frames?.length) throw new Error(res.message ?? '抽帧失败');
    updateNodeData(block.id, {
      status: 'success',
      frameUrls: res.frames,
      pictures: res.frames,
      previewUrl: res.frames[0],
    });
    return;
  }

  if (kind === 'scale-fit') {
    const sourceUrl = upstream.pictures[0];
    if (!sourceUrl) throw new Error('缺少 picture 输入');
    const res = await api.resizeImage({
      sourceUrl,
      width: (d.width as number) ?? 1024,
      height: (d.height as number) ?? 1024,
      fit: ((d.fit as string) ?? 'cover') as 'cover' | 'contain' | 'fill' | 'inside' | 'outside',
    });
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      outputUrl: res.url,
    });
    return;
  }

  if (kind === 'picture-merge') {
    const imageUrls = upstream.pictures;
    if (imageUrls.length < 2) throw new Error('至少需要 2 张图片');
    const res = await api.mergeImages({
      imageUrls,
      direction: ((d.direction as string) ?? 'horizontal') as 'horizontal' | 'vertical' | 'grid',
      cols: (d.cols as number) ?? 2,
    });
    updateNodeData(block.id, {
      status: 'success',
      composedUrl: res.url,
      previewUrl: res.url,
    });
    return;
  }

  if (kind === 'cinema-prompt' || kind === 'camera-prompt' || kind === 'prompt-studio') {
    const text = (d.content as string) || prompt;
    updateNodeData(block.id, { status: 'success', output: text, content: text });
    return;
  }

  if (kind === 'angle-visual') {
    const text = (d.content as string) || prompt;
    updateNodeData(block.id, { status: 'success', output: text, content: text });
    return;
  }

  if (kind === 'style-lab') {
    const tab = (d.styleLabTab as string) ?? 'style';
    if (tab === 'style') {
      const sourceUrl = upstream.pictures[0] || (d.sourceUrl as string);
      if (!sourceUrl) throw new Error('缺少参考图');
      const styleRes = await api.extractStyle(sourceUrl);
      updateNodeData(block.id, {
        status: 'success',
        styleResult: styleRes,
        content: styleRes.combinedPrompt,
        styleTokens: styleRes.styleTokens,
        negativePrompt: styleRes.negativePrompt,
      });
      return;
    }
    const text = (d.content as string) || prompt;
    updateNodeData(block.id, { status: 'success', output: text, content: text });
    return;
  }

  if (kind === 'local-enhance') {
    const mode = (d.enhanceMode as string) ?? 'picture';
    if (mode === 'clip') {
      const sourceUrl = upstream.clips[0] || (d.videoUrl as string);
      if (!sourceUrl) throw new Error('缺少视频');
      const res = await api.topazVideo({
        sourceUrl,
        upscaleModel: (d.upscaleModel as string) ?? 'iris-3',
        upscaleFactor: (d.upscaleFactor as number) ?? 2,
        enableInterpolation: Boolean(d.enableInterpolation),
        topazVideoPath: (d.topazVideoPath as string) || undefined,
      });
      updateNodeData(block.id, { status: 'success', videoUrl: res.url, outputUrl: res.url });
      return;
    }
    const sourceUrl = upstream.pictures[0];
    if (!sourceUrl) throw new Error('缺少图片');
    const res = await api.topazGigapixel({
      sourceUrl,
      scale: (d.scale as number) ?? 2,
      model: (d.model as string) ?? 'std',
      executablePath: (d.executablePath as string) || undefined,
    });
    updateNodeData(block.id, { status: 'success', previewUrl: res.url, outputUrl: res.url });
    return;
  }

  if (kind === 'model-market') {
    const source = (d.marketSource as string) ?? 'fal';
    if (source === 'comfy') {
      const workflowJson = (d.workflowJson as string) ?? '';
      if (!workflowJson.trim()) throw new Error('Workflow JSON 为空');
      const workflow = JSON.parse(workflowJson) as Record<string, unknown>;
      const p = mergeUpstreamPrompt(upstream, (d.content as string) ?? '');
      const res = await api.proxyComfy({
        workflow,
        baseUrl: ((d.comfyBaseUrl as string) ?? '').trim() || undefined,
        prompt: p.trim() || undefined,
      });
      if (!res.ok || !res.url) throw new Error(res.message ?? 'ComfyUI 未返回图片');
      updateNodeData(block.id, {
        status: 'success',
        previewUrl: res.url,
        outputUrl: res.url,
        comfyPromptId: res.promptId,
      });
      return;
    }
    const modelId = (d.falModel as string) || 'fal-ai/birefnet/v2';
    const p = mergeUpstreamPrompt(upstream, (d.content as string) ?? '');
    const input: Record<string, unknown> = {};
    if (p.trim()) input.prompt = p.trim();
    if (upstream.pictures[0]) input.image_url = upstream.pictures[0];
    const res = await api.proxyFal({ model: modelId, input });
    if (!res.url) throw new Error('Fal 未返回图片');
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      outputUrl: res.url,
      falOutput: res.output,
    });
    return;
  }

  if (kind === 'shot-script' || kind === 'reference-board') {
    const text = (d.content as string) || prompt;
    updateNodeData(block.id, {
      status: 'success',
      output: text,
      content: text,
      meta: d.meta,
    });
    return;
  }

  if (kind === 'inpaint-edit') {
    const img = upstream.pictures?.[0] || (d.imageUrl as string);
    const mask = (d.maskUrl as string) || '';
    const inpaintPrompt = prompt || (d.content as string) || '';
    const { runInpaintEdit, resolveInpaintModel, writeBackInpaintShot } = await import(
      './inpaint-edit-runner'
    );
    const rendered = await runInpaintEdit({
      imageUrl: img as string,
      maskUrl: mask,
      prompt: inpaintPrompt,
      model: resolveInpaintModel(d),
    });
    if (ctx?.nodes && ctx?.edges) {
      writeBackInpaintShot({
        updateNodeData,
        nodeId: block.id,
        nodes: ctx.nodes,
        edges: ctx.edges,
        linkedShotId: d.linkedShotId as string | undefined,
        imageUrl: rendered.url,
      });
    }
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: rendered.url,
      output: rendered.url,
      inpaintModel: rendered.model,
    });
    return;
  }

  if (kind === 'thumbnail-maker') {
    const src = upstream.pictures?.[0] || (d.imageUrl as string);
    if (!src) throw new Error('封面制作：需要上游图片');
    const title = (d.title as string) || '';
    const res = await api.thumbnailCompose({ imageUrl: src, title });
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      output: res.url,
      content: title,
      pictures: [res.url],
    });
    return;
  }

  // VG-19/31: seedance-chain / motion-story 已由 migrateBlockKind → clip-gen，无独立执行分支

  if (kind === 'caption-asr') {
    const captionMode = (d.captionMode as string) ?? 'asr';
    const shotIds = (upstream.shotIds ?? []) as string[];

    // F-036: 写回 subtitle 到 shot
    const writeBackSubtitle = (subtitle: string) => {
      if (shotIds.length > 0 && ctx?.nodes && ctx?.edges) {
        for (const shotId of shotIds) {
          patchUpstreamShot(updateNodeData, block.id, ctx.nodes, ctx.edges, shotId, {
            subtitleText: subtitle.trim(),
          });
        }
      }
    };

    if (captionMode === 'burn') {
      const clip = upstream.clips?.[0];
      const subtitle = (d.subtitle as string) || (d.srtContent as string) || prompt || upstream.prompts?.[0] || '';
      if (!clip) throw new Error('字幕烧录：需要上游视频');
      if (!subtitle.trim()) throw new Error('字幕烧录：字幕为空');
      const res = await api.renderShotMp4({
        videoUrl: clip,
        subtitle: subtitle.trim(),
        durationSec: (d.durationSec as number) ?? 4,
        skipReview: true,
      });
      if (!res.ok || !res.url) throw new Error(res.message ?? '字幕烧录失败');
      writeBackSubtitle(subtitle);
      updateNodeData(block.id, {
        status: 'success',
        outputClip: res.url,
        clips: [res.url],
        content: subtitle,
      });
      return;
    }
    const src = upstream.clips?.[0] || upstream.sounds?.[0] || (d.sourceUrl as string);
    if (!src) throw new Error('语音转字幕：需要上游音频或视频');
    const language = (d.language as string) || 'zh';
    const res = await api.transcribeAudio(src, language);
    if (res.srtContent) writeBackSubtitle(res.srtContent);
    updateNodeData(block.id, {
      status: 'success',
      srtContent: res.srtContent,
      cues: res.cues,
      language,
      subtitle: res.srtContent,
      output: res.srtContent,
    });
    return;
  }

  if (kind === 'bridge-clip') {
    const clipUrl = upstream.clips?.[0] || (d.sourceClipUrl as string);
    if (!clipUrl) throw new Error('Bridge 续拍：需要上游视频');
    const framesRes = await api.extractFrames(clipUrl as string, 1);
    const endFrameUrl = framesRes.frames?.[0];
    const nextPrompt = prompt || (d.content as string) || '';
    const continuationPrompt = (await import('@nx9/shared')).buildBridgeContinuationPrompt({
      sourcePrompt: (upstream.prompts?.[0] ?? d.content as string ?? ''),
      nextPrompt,
    });
    updateNodeData(block.id, {
      status: 'success',
      sourceClipUrl: clipUrl,
      endFrameUrl,
      continuationPrompt,
      output: continuationPrompt,
      content: continuationPrompt,
      previewUrl: endFrameUrl,
      pictures: endFrameUrl ? [endFrameUrl] : undefined,
    });
    return;
  }

  if (kind === 'voice-cast') {
    const { lines, source } = resolveVoiceCastLines(d.lines, upstream.lines);
    const profileMap = (d.profileMap as Record<string, string>) ?? {};
    if (lines.length === 0) {
      updateNodeData(block.id, {
        status: 'error',
        error: '无可解析的对白（请连接编剧台或已拆镜的分镜台）',
        lineSource: source,
        meta: { total: 0, failed: 0, lineSource: source },
      });
      throw new Error('无可解析的对白（请连接编剧台或已拆镜的分镜台）');
    }
    const { results, audioUrls } = await runSoundGenCast(lines, profileMap);
    updateNodeData(block.id, {
      status: audioUrls.length > 0 ? 'success' : 'error',
      results,
      sounds: audioUrls,
      audioUrl: audioUrls[0],
      lines,
      lineSource: source,
      meta: { total: results.length, failed: results.filter((r) => r.error).length, lineSource: source },
    });
    if (audioUrls.length === 0) throw new Error('多角色配音全部失败');
    return;
  }

  if (kind === 'continuity-check') {
    const images = upstream.pictures ?? [];
    if (images.length < 2) throw new Error('至少需要 2 张上游图像');

    const {
      CONTINUITY_SYSTEM_PROMPT,
      buildContinuityUserText,
      resolveContinuityModel,
      sliceContinuityImages,
    } = await import('./continuity-check-runner');
    const sliced = sliceContinuityImages(images);
    const targetShotIds = (upstream.shotIds ?? []) as string[];
    const llmBody: Record<string, unknown> = {
      messages: [
        { role: 'system', content: CONTINUITY_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: buildContinuityUserText({
                imageCount: images.length,
                omitted: sliced.omitted,
              }),
            },
            ...sliced.sent.map((url) => ({ type: 'image_url', image_url: { url } })),
          ],
        },
      ],
    };
    const continuityModel = resolveContinuityModel(d);
    if (continuityModel) llmBody.model = continuityModel;
    const res = await api.proxyLlm(llmBody);
    const raw = (res as { content?: string }).content ?? JSON.stringify(res);
    
    // F-036: 将连续性检查结果写回 shot 状态（链隔离 patch，不用全局 applyShotReviewFromReport）
    if (targetShotIds.length > 0 && ctx?.nodes && ctx?.edges) {
      try {
        const parsed = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
        const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
        if (issues.length > 0) {
          for (const shotId of targetShotIds) {
            patchUpstreamShot(updateNodeData, block.id, ctx.nodes, ctx.edges, shotId, {
              keyframeStatus: 'failed',
              keyframeReviewNote: `连续性: ${issues.slice(0, 3).join('; ')}`,
              status: 'failed',
            });
          }
        }
      } catch {
        // JSON 解析失败不阻碍主流程
      }
    }

    updateNodeData(block.id, {
      status: 'success',
      continuityReport: raw,
      content: raw,
      continuityIssues: targetShotIds.length > 0 ? targetShotIds : undefined,
      imagesChecked: images.length,
      imagesOmitted: sliced.omitted,
      ...(sliced.note ? { continuityCapNote: sliced.note } : { continuityCapNote: undefined }),
    });
    return;
  }

  if (kind === 'export-pack') {
    if (!ctx) throw new Error('export-pack 缺少画布上下文');
    const shots = resolveShotsForBlock(block.id, ctx.nodes, ctx.edges, false);
    const { runExportPack } = await import('./export-pack-runner');
    const { hasEffectiveTimeline } = await import('@nx9/shared');
    const mode = (d.exportMode as string) || 'zip';
    const prefix = (d.exportPrefix as string) || 'nx9-shot';
    const audioUrl = (d.episodeAudioUrl as string) || '';
    let timeline = parseTimelineDraft(d.timelineDraft as import('@nx9/shared').TimelineDraftRaw);
    if (!hasEffectiveTimeline(timeline)) {
      const incoming = ctx.edges.filter((e) => e.target === block.id);
      for (const edge of incoming) {
        const src = ctx.nodes.find((n) => n.id === edge.source);
        if (src?.type !== 'clip-editor') continue;
        const parsed = parseTimelineDraft(
            (src.data as Record<string, unknown> | undefined)?.timelineDraft as import('@nx9/shared').TimelineDraftRaw,
        );
        if (hasEffectiveTimeline(parsed)) {
          timeline = parsed;
          break;
        }
      }
    }
    try {
      const res = await runExportPack({
        mode: mode as 'zip' | 'ffmpeg-episode' | 'hyperframes-episode' | 'remotion-bundle' | 'ecom-pack',
        prefix,
        audioUrl,
        pictures: upstream.pictures ?? [],
        clips: upstream.clips ?? [],
        sounds: upstream.sounds ?? [],
        prompts: upstream.prompts ?? [],
        shots,
        timeline,
        selectedSpecs: (d.selectedSpecs as string[] | undefined) ?? [],
      });
      if (!res.ok) {
        updateNodeData(block.id, {
          status: 'error',
          exportReady: false,
          message: res.message,
          error: res.message,
        });
        throw new Error(res.message ?? '导出未通过');
      }
      if (res.taskId && !res.exportReady) {
        updateNodeData(block.id, {
          status: 'running',
          exportReady: false,
          hfTaskId: res.taskId,
          message: res.message ?? 'submitted',
        });
        const url = await pollMontageTaskUntilDone(res.taskId, 'hyperframes');
        updateNodeData(block.id, {
          status: 'success',
          exportReady: true,
          episodeUrl: url,
          hfTaskId: res.taskId,
          exportCount: 1,
        });
        return;
      }
      updateNodeData(block.id, {
        status: 'success',
        exportReady: res.exportReady === true,
        episodeUrl: res.url,
        exportCount: res.exportCount ?? 0,
        message: res.message,
        hfTaskId: res.taskId,
      });
    } catch (e) {
      updateNodeData(block.id, { status: 'error', error: String(e), exportReady: false });
      throw e;
    }
    return;
  }

  if (kind === 'comfy-workflow') {
    const workflowText = (d.workflowText as string) ?? '';
    if (!workflowText.trim()) throw new Error('Comfy 工作流：未填写 Workflow JSON');
    let workflow: Record<string, unknown>;
    try {
      workflow = JSON.parse(workflowText);
    } catch {
      throw new Error('Comfy 工作流：Workflow JSON 解析失败');
    }
    const res = (await api.proxyComfy({
      workflow,
      baseUrl: (d.baseUrl as string) || undefined,
      prompt: (prompt || (d.content as string)) || undefined,
    })) as { ok: boolean; url?: string; message?: string };
    if (!res.ok || !res.url) throw new Error(res.message ?? 'Comfy 工作流运行失败');
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      content: prompt || (d.content as string) || '',
    });
    return;
  }

  if (kind === 'subtitle-burn') {
    const clip = upstream.clips?.[0];
    const subtitle = (d.subtitle as string) || prompt || upstream.prompts?.[0] || '';
    if (!clip) throw new Error('需要上游视频');
    if (!subtitle.trim()) throw new Error('字幕为空');
    const res = await api.renderShotMp4({
      videoUrl: clip,
      subtitle: subtitle.trim(),
      durationSec: (d.durationSec as number) ?? 4,
      skipReview: true,
    });
    if (!res.ok || !res.url) throw new Error(res.message ?? '字幕烧录失败');
    updateNodeData(block.id, {
      status: 'success',
      outputClip: res.url,
      clips: [res.url],
      content: subtitle,
    });
    return;
  }

  if (kind === 'audio-mix' || (kind === 'clip-editor' && (d.editorMode as string) === 'audio')) {
    const tracks = upstream.sounds ?? [];
    if (tracks.length < 2) throw new Error('至少需要 2 条音频');
    const res = await api.mixAudio(tracks, (d.normalize as boolean | undefined) ?? true);
    if (!res.ok || !res.url) throw new Error(res.message ?? '混音失败');
    updateNodeData(block.id, {
      status: 'success',
      outputSound: res.url,
      sounds: [res.url],
      meta: { trackCount: res.trackCount },
    });
    return;
  }

  if (kind === 'color-grade' || (kind === 'clip-editor' && (d.editorMode as string) === 'grade')) {
    const source = upstream.clips?.[0] ?? upstream.pictures?.[0];
    if (!source) throw new Error('需要上游图像或视频');
    const res = await api.colorGrade({
      sourceUrl: source,
      brightness: (d.brightness as number) ?? 0,
      contrast: (d.contrast as number) ?? 1,
      saturation: (d.saturation as number) ?? 1,
    });
    if (!res.ok || !res.url) throw new Error(res.message ?? '调色失败');
    if (res.mediaKind === 'clip') {
      updateNodeData(block.id, { status: 'success', clips: [res.url], outputUrl: res.url });
    } else {
      updateNodeData(block.id, { status: 'success', pictures: [res.url], outputUrl: res.url });
    }
    return;
  }

  if (kind === 'beat-sync') {
    const sound = upstream.sounds?.[0];
    if (!sound) throw new Error('需要上游音频');
    const bpm = (d.bpm as number) ?? 120;
    const probe = await api.probeMediaDuration(sound);
    const durationSec = probe.durationSec > 0 ? probe.durationSec : 30;
    const interval = 60 / Math.max(bpm, 30);
    const cutPoints: number[] = [];
    for (let t = interval; t < durationSec; t += interval) cutPoints.push(Number(t.toFixed(3)));
    updateNodeData(block.id, {
      status: 'success',
      cutPoints,
      meta: { bpm, durationSec, cutPoints, beatIntervalSec: interval },
      clips: upstream.clips?.length ? upstream.clips : undefined,
      content: `BPM ${bpm} · ${cutPoints.length} cuts`,
    });
    return;
  }

  if (kind === 'variant-fork') {
    const label = (d.variantLabel as string) || 'A';
    updateNodeData(block.id, {
      status: 'success',
      meta: { variant: label, forkNotes: d.forkNotes },
      content: upstream.prompts?.[0] ?? prompt,
      output: upstream.prompts?.[0],
      pictures: upstream.pictures,
      clips: upstream.clips,
      sounds: upstream.sounds,
    });
    return;
  }

  if (kind === 'prompt-diff') {
    const prompts = upstream.prompts ?? [];
    if (prompts.length < 2) throw new Error('至少需要 2 路 prompt');
    const res = await api.proxyLlm({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: '合并两版 prompt，保留优点，输出一段简洁英文 prompt。' },
        { role: 'user', content: `A:\n${prompts[0]}\n\nB:\n${prompts[1]}` },
      ],
    });
    const merged = (res as { content?: string }).content?.trim() ?? '';
    updateNodeData(block.id, {
      status: 'success',
      mergeSuggestion: merged,
      content: merged,
      output: merged,
      meta: { sourceCount: prompts.length },
    });
    return;
  }

  if (kind === 'blocking-stage') {
    const scene = normalizeDirectorProject(d.scene);
    const cameraSequence = scene.cameras.map((c) => ({
      name: c.name,
      prompt: buildCameraPrompt(c),
    }));
    const text = cameraSequence.map((c) => c.prompt).join('\n');
    updateNodeData(block.id, {
      status: 'success',
      cameraSequence,
      content: text,
      output: text,
      meta: { cameraSequence, actorCount: scene.objects.filter((o) => o.kind === 'character').length },
    });
    return;
  }

  if (kind === 'light-rig') {
    const presetId = (d.lightPresetId as string) ?? 'three-point-soft';
    const content = buildLightRigPrompt(presetId, (d.extra as string) || upstream.prompts?.[0] || prompt);
    updateNodeData(block.id, {
      status: 'success',
      content,
      output: content,
      outputPrompt: content,
      meta: { lightPresetId: presetId },
      pictures: upstream.pictures?.length ? upstream.pictures : undefined,
    });
    return;
  }

  if (kind === 'depth-pass') {
    const source = upstream.pictures?.[0];
    if (!source) throw new Error('需要上游图像');
    const res = await api.generateDepthPass({ sourceUrl: source });
    if (!res.ok || !res.depthUrl) throw new Error(res.message ?? '深度通道失败');
    updateNodeData(block.id, {
      status: 'success',
      depthUrl: res.depthUrl,
      normalUrl: res.normalUrl,
      pictures: [res.depthUrl, res.normalUrl].filter(Boolean) as string[],
      meta: { sourceUrl: source, method: res.method },
    });
    return;
  }

  if (kind === 'picture-diff') {
    const imageA = upstream.pictures?.[0] || (d.imageA as string) || '';
    const imageB = upstream.pictures?.[1] || (d.imageB as string) || '';
    if (!imageA || !imageB) throw new Error('picture-diff 需要 2 张上游图片');
    updateNodeData(block.id, {
      status: 'success',
      imageA,
      imageB,
    });
    return;
  }

  if (kind === 'director-3d') {
    const cam =
      (d.lastCameraPrompt as string) || (d.content as string) || upstream.prompts.join(', ');
    updateNodeData(block.id, {
      status: 'success',
      upstream,
      content: cam,
      outputPrompt: cam,
      previewUrl: (d.lastCaptureUrl as string) || upstream.pictures[0],
    });
    return;
  }

  if (kind === 'link-parser') {
    const url = (d.url as string) || upstream.prompts[0] || '';
    if (!url.trim()) throw new Error('链接为空');
    const res = await api.parseLink(url.trim(), (d.hint as string) || prompt || undefined);
    updateNodeData(block.id, {
      status: 'success',
      parseResult: res,
      content: res.prompt,
      output: res.prompt,
      title: res.title,
      summary: res.summary,
    });
    return;
  }

  if (kind === 'clip-sink') {
    const videoUrl = upstream.clips[0] || (d.videoUrl as string);
    updateNodeData(block.id, {
      status: 'success',
      videoUrl,
      previewUrl: videoUrl,
    });
    return;
  }

  if (kind === 'style-atelier') {
    const sourceUrl = upstream.pictures[0] || (d.sourceUrl as string);
    if (!sourceUrl) throw new Error('缺少参考图');
    const styleRes = await api.extractStyle(sourceUrl);
    updateNodeData(block.id, {
      status: 'success',
      styleResult: styleRes,
      content: styleRes.combinedPrompt,
      styleTokens: styleRes.styleTokens,
      negativePrompt: styleRes.negativePrompt,
    });
    return;
  }

  if (kind === 'tag-atelier') {
    const text = (d.content as string) || prompt;
    updateNodeData(block.id, { status: 'success', output: text, content: text });
    return;
  }

  if (kind === 'batch-runner') {
    const pictures = upstream.pictures;
    if (pictures.length === 0) throw new Error('无上游图片');
    const mode = (d.mode as string) ?? 'resize';
    const out: string[] = [];
    for (const url of pictures) {
      if (mode === 'resize') {
        const res = await api.resizeImage({ sourceUrl: url, width: 1024, height: 1024 });
        out.push(res.url);
      } else if (mode === 'grid-split') {
        const res = await api.gridSplit({ sourceUrl: url, rows: 2, cols: 2 });
        out.push(...res.urls);
      } else {
        const res = await api.reversePrompt(url);
        out.push(res.prompt);
      }
    }
    updateNodeData(block.id, {
      status: 'success',
      batchResults: out,
      pictures: mode === 'reverse-prompt' ? undefined : out,
      content: mode === 'reverse-prompt' ? out.join('\n\n') : undefined,
      mode,
    });
    return;
  }

  if (kind === 'grid-prompt-reverse') {
    const sourceUrl = upstream.pictures[0] || (d.sourceUrl as string) || (d.previewUrl as string);
    if (!sourceUrl) throw new Error('缺少宫格/分镜图');
    const res = await api.gridReversePrompts({
      sourceUrl,
      rows: (d.rows as number) ?? 3,
      cols: (d.cols as number) ?? 3,
      storyPrompt: mergeUpstreamPrompt(upstream, d.storyPrompt as string | undefined) || undefined,
    });
    updateNodeData(block.id, {
      status: 'success',
      gridCells: res.cells,
      splitUrls: res.splitUrls,
      pictures: res.splitUrls,
      content: res.cells.map((c) => c.videoPrompt).join('\n\n'),
    });
    return;
  }

  if (kind === 'photo-speak') {
    const imageUrl = upstream.pictures[0] || (d.imageUrl as string);
    const text = mergeUpstreamPrompt(upstream, (d.content as string) || (d.script as string));
    if (!imageUrl) throw new Error('缺少图片');
    if (!text.trim()) throw new Error('口播文本为空');
    const voiceMode = (d.voiceMode as string) || 'cloud';
    const referenceAudioUrl = (d.referenceAudioUrl as string) || '';
    const res = await api.photoSpeak({
      imageUrl,
      text: text.trim(),
      voice:
        voiceMode === 'luxtts' && referenceAudioUrl
          ? `luxtts:${referenceAudioUrl}`
          : (d.voice as string) || 'alloy',
      useLuxTts: voiceMode === 'luxtts',
      referenceAudioUrl: voiceMode === 'luxtts' ? referenceAudioUrl : undefined,
      characterId: (d.characterId as string) || undefined,
    });
    if (!res.ok || !res.url) throw new Error(res.message ?? '照片说话失败');
    updateNodeData(block.id, {
      status: 'success',
      videoUrl: res.url,
      audioUrl: res.audioUrl,
      content: text,
    });
    return;
  }

  if (kind === 'bg-remove') {
    const sourceUrl = upstream.pictures[0];
    if (!sourceUrl) throw new Error('缺少图片');
    const res = await api.proxyFal({
      model: 'fal-ai/birefnet/v2',
      input: { image_url: sourceUrl },
    });
    if (!res.url) throw new Error('抠图未返回图片');
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      outputUrl: res.url,
    });
    return;
  }

  if (kind === 'upscale-lite') {
    const sourceUrl = upstream.pictures[0];
    if (!sourceUrl) throw new Error('缺少图片');
    const res = await api.upscaleImage({
      sourceUrl,
      scale: (d.scale as number) ?? 2,
    });
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      outputUrl: res.url,
    });
    return;
  }

  if (kind === 'watermark-clean') {
    const sourceUrl = upstream.pictures[0] || upstream.clips[0];
    if (!sourceUrl) throw new Error('缺少媒体');
    const res = await api.stripMetadata({ sourceUrl });
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      outputUrl: res.url,
    });
    return;
  }

  if (kind === 'fal-market') {
    const modelId = (d.falModel as string) || 'fal-ai/birefnet/v2';
    const prompt = mergeUpstreamPrompt(upstream, (d.content as string) ?? '');
    const input: Record<string, unknown> = {};
    if (prompt.trim()) input.prompt = prompt.trim();
    if (upstream.pictures[0]) input.image_url = upstream.pictures[0];
    const res = await api.proxyFal({ model: modelId, input });
    if (!res.url) throw new Error('Fal 未返回图片');
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      outputUrl: res.url,
      falOutput: res.output,
    });
    return;
  }

  // VG-19: motion-story 已迁移为 clip-gen（见 migrateBlockKind），勿再旁路组装器

  if (kind === 'topaz-picture') {
    const sourceUrl = upstream.pictures[0];
    if (!sourceUrl) throw new Error('缺少图片');
    const res = await api.topazGigapixel({
      sourceUrl,
      scale: (d.scale as number) ?? 2,
      model: (d.model as string) ?? 'std',
      executablePath: (d.executablePath as string) || undefined,
    });
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      outputUrl: res.url,
    });
    return;
  }

  if (kind === 'topaz-clip') {
    const sourceUrl = upstream.clips[0] || (d.videoUrl as string);
    if (!sourceUrl) throw new Error('缺少视频');
    const res = await api.topazVideo({
      sourceUrl,
      upscaleModel: (d.upscaleModel as string) ?? 'iris-3',
      upscaleFactor: (d.upscaleFactor as number) ?? 2,
      enableInterpolation: Boolean(d.enableInterpolation),
      topazVideoPath: (d.topazVideoPath as string) || undefined,
    });
    updateNodeData(block.id, {
      status: 'success',
      videoUrl: res.url,
      outputUrl: res.url,
    });
    return;
  }

  if (kind === 'control-preprocess') {
    const src = upstream.pictures[0] || (d.imageUrl as string);
    if (!src) throw new Error('ControlNet 缺少上游图片');
    const mode = (d.mode as string) ?? 'depth';
    if (mode === 'depth') {
      const r = await api.generateDepthPass({ sourceUrl: src });
      updateNodeData(block.id, { status: 'success', previewUrl: r.depthUrl, output: r.depthUrl, meta: { mode } });
    } else if (mode === 'canny') {
      const r = await api.proxyFal({ model: 'fal-ai/image-to-canny', input: { image_url: src } });
      updateNodeData(block.id, { status: 'success', previewUrl: r.url, output: r.url, meta: { mode } });
    } else throw new Error(`未知 ControlNet 模式: ${mode}`);
    return;
  }

  // NODE-02: 遗留 kind 明示不可用；迁移表已将 music-gen→sound-gen、lipsync-pass→clip-gen，
  // 此处仅兜底未迁移的旧图，禁止假成功。
  if (kind === 'music-gen') {
    throw new Error(
      'music-gen 已弃用：请改用「声音生成」节点并将模式设为 BGM（soundMode=music）。旧画布打开时应自动迁移。',
    );
  }

  if (kind === 'lipsync-pass') {
    throw new Error(
      'lipsync-pass 已弃用：口型同步未接真实模型，请改用「视频生成」节点。旧画布打开时应自动迁移为 clip-gen。',
    );
  }

  if (kind === 'reference-analyze') {
    const url = upstream.clips[0] || (d.videoUrl as string);
    if (!url) throw new Error('参考反推缺少上游视频');
    const notes = (d.notes as string) ?? '';
    const res = await api.analyzeReferenceVideo({ videoUrl: url, notes: notes || undefined, targetShotCount: 5 });
    updateNodeData(block.id, { status: 'success', analyzeResult: res.markdown, output: res.markdown, content: res.markdown });
    return;
  }

  updateNodeData(block.id, { status: 'skipped' });
}

const PARALLEL_LIMIT = 3;

/** PG-04: 取消信号 — cancelled 为块间检查；abortSignal 透传到在途请求 */
export type FlowRunSignal = { cancelled: boolean; abortSignal?: AbortSignal };

async function runLayerConcurrent(
  ids: string[],
  runOne: (id: string) => Promise<void>,
  signal?: FlowRunSignal,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(PARALLEL_LIMIT, ids.length) }, async () => {
    while (cursor < ids.length) {
      if (signal?.cancelled) return;
      const i = cursor++;
      await runOne(ids[i]);
    }
  });
  await Promise.all(workers);
}

export async function runFlowBatch(
  nodes: Node[],
  edges: Edge[],
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
  onProgress: (p: RunProgress) => void,
  signal?: FlowRunSignal,
  onlyBlockIds?: Set<string>,
  skipBlockIds: Set<string> = new Set(),
): Promise<void> {
  const blockMap = new Map(toBlocks(nodes).map((b) => [b.id, { ...b, data: { ...b.data } }]));
  const links = toLinks(edges);
  const runnable = (id: string) => {
    const b = blockMap.get(id);
    if (!b || !RUNNABLE_BLOCKS.has(b.type)) return false;
    if (onlyBlockIds && !onlyBlockIds.has(id)) return false;
    return true;
  };

  const allLayers = topologicalLayers([...blockMap.values()], links)
    .map((layer) => layer.filter(runnable));
  const allRunnableIds = allLayers.flat();
  const skippedIds = allRunnableIds.filter((id) => skipBlockIds.has(id));
  const layers = allLayers
    .map((layer) => layer.filter((id) => !skipBlockIds.has(id)))
    .filter((layer) => layer.length > 0);

  const total = allRunnableIds.length;
  const completedIds = new Set(skippedIds);
  onProgress({ phase: 'running', current: completedIds.size, total, completedIds: [...completedIds] });

  let completed = completedIds.size;

  for (const layer of layers) {
    if (signal?.cancelled) {
      onProgress({ phase: 'paused', current: completed, total, completedIds: [...completedIds] });
      return;
    }

    const errors: { id: string; error: unknown; blocked?: boolean }[] = [];

    await runLayerConcurrent(
      layer,
      async (id) => {
        if (errors.length > 0 || signal?.cancelled) return;
        const block = blockMap.get(id)!;
        onProgress({ phase: 'running', current: completed, total, currentId: id });
        try {
          const blockData = blockMap.get(id)?.data ?? {};
          const upstreamPolicy = blockData.upstreamPolicy as import('@nx9/shared').UpstreamPolicy | undefined;
          const primarySourceId = blockData.primarySourceId as string | null | undefined;
          const upstream = gatherUpstream(id, [...blockMap.values()], links, upstreamPolicy, primarySourceId);
          await executeBlock(
            block,
            upstream,
            (nodeId, data) => {
              const b = blockMap.get(nodeId);
              if (b) b.data = { ...b.data, ...data };
              updateNodeData(nodeId, data);
            },
            { nodes, edges, abortSignal: signal?.abortSignal },
          );
          completedIds.add(id);
        } catch (e) {
          errors.push({
            id,
            error: e,
            blocked: e instanceof ReviewGateBlockedError || e instanceof DirectorRunBlockedError,
          });
        }
      },
      signal,
    );

    if (errors.length > 0) {
      const first = errors[0];
      // PG-04: 用户主动取消 — 不落 error 态，收回 idle
      if (signal?.cancelled || signal?.abortSignal?.aborted) {
        updateNodeData(first.id, { status: 'idle', error: undefined });
        onProgress({ phase: 'paused', current: completed, total, completedIds: [...completedIds] });
        return;
      }
      if (first.blocked && first.error instanceof Error) {
        onProgress({
          phase: 'blocked',
          current: completed + 1,
          total,
          currentId: first.id,
          error: first.error.message,
          ...(first.error instanceof ReviewGateBlockedError
            ? { pendingShots: first.error.pending }
            : {}),
        });
      } else {
        updateNodeData(first.id, { status: 'error', error: String(first.error) });
        onProgress({
          phase: 'error',
          current: completed + 1,
          total,
          currentId: first.id,
          error: String(first.error),
        });
      }
      return;
    }

    completed = completedIds.size;
    if (signal?.cancelled) {
      onProgress({ phase: 'paused', current: completed, total, completedIds: [...completedIds] });
      return;
    }
    onProgress({ phase: 'running', current: completed, total, completedIds: [...completedIds] });
  }

  onProgress({ phase: 'done', current: total, total, completedIds: [...completedIds] });
}
