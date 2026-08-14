import type { DirectorKeyframeBatch } from '@nx9/shared';
import {
  activeChainEpisodeShots,
  appendStoryboardVideoVersion,
  buildCharacterContext,
  buildVideoGuidePromptSuffix,
  enrichPromptWithCharacters,
  filterStoryboardGuideOverlay,
  flattenScriptBreakdownShots,
  readChainStoryboard,
  resolveStoryboardGuideOverlay,
} from '@nx9/shared';
import { api } from '../../api/client';
import { awaitProxyVideo, VideoPollTimeoutError } from '../poll-task';
import { buildClipGenVideoRequest, findUpstreamReferencePack } from '../clip-gen-request';
import { collectClipUsedAssets } from '../clip-used-assets';
import { getGenPack } from '../gen-skill-runtime';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { readUpstreamChainStoryboard } from '../chain-storyboard-utils';
import {
  enabledGuideKinds,
  readStoryboardGuidePrefs,
} from '../../stores/storyboard-guide-prefs';
import { composeStoryboardGuideFrameDataUrl } from '../storyboard-guide-compose';
import { DirectorRunBlockedError, ReviewGateBlockedError } from './errors';
import {
  characterContextForBlock,
  linkedShotForBlock,
  patchFlowShot,
} from './helpers';
import type { FlowExecuteDeps } from './types';

export async function executeClipGenOps(deps: FlowExecuteDeps): Promise<void> {
  const { block, kind, prompt, upstream, updateNodeData, ctx } = deps;
  const d = block.data ?? {};

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
            ctx.nodes as unknown as import('../clip-gen-request').ClipGenGraphNode[],
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
      const sourceChainNodeRef = sourceChainNode!;

      const {
        consumeDirectorKeyframeBatch,
        validateDirectorKeyframeBatch,
      } = await import('../director-keyframe-batch-runner');
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
      let liveReceipt = directorBatch.receipt;
      const result = await consumeDirectorKeyframeBatch({
        batch: directorBatch,
        chain: sourceChain,
        model: modelId,
        // DD-D-09: 每镜成功立即写回链镜表，中断后不丢已成功镜头。
        onShotProgress: (shotId, shotPatch) => {
          const latest = readChainStoryboard(sourceChainNodeRef.data as Record<string, unknown>);
          if (!latest) return;
          updateNodeData(directorBatch.sourceChainDeskId, {
            chainStoryboard: {
              ...latest,
              shots: latest.shots.map((s) => s.id === shotId ? { ...s, ...shotPatch } : s),
            },
          });
          const videoUrl = typeof shotPatch.videoAssetId === 'string'
            ? shotPatch.videoAssetId
            : liveReceipt?.videoUrlsByShotId?.[shotId];
          if (videoUrl) {
            const prev = liveReceipt ?? {
              batchId: directorBatch.batchId,
              status: 'partial' as const,
              consumedAt: new Date().toISOString(),
              succeededShotIds: [],
              failed: [],
              videoUrlsByShotId: {},
            };
            liveReceipt = {
              ...prev,
              status: 'partial',
              succeededShotIds: [...new Set([...(prev.succeededShotIds ?? []), shotId])],
              videoUrlsByShotId: { ...(prev.videoUrlsByShotId ?? {}), [shotId]: videoUrl },
              failed: (prev.failed ?? []).filter((f) => f.shotId !== shotId),
            };
            updateNodeData(block.id, {
              directorKeyframeBatch: { ...directorBatch, status: 'consuming', receipt: liveReceipt },
              directorBatchReceipt: liveReceipt,
            });
          }
        },
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
        batchSummary: `导演关键帧批次 ${result.receipt.succeededShotIds.length}/${result.batch.shots.length}`,
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
          lastCompiledPrompt: continuationPrompt,
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
            lastCompiledPrompt: finalPrompt,
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
              lastCompiledPrompt: finalPrompt,
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

    // VG-35: 级联与工作台同口径——有链镜表时按链镜逐镜出片，不再依赖 breakdown×preview 启发式
    const upstreamChain = ctx?.nodes && ctx?.edges
      ? readUpstreamChainStoryboard(block.id, ctx.nodes, ctx.edges)
      : undefined;
    const chainCascadeShots = upstreamChain ? activeChainEpisodeShots(upstreamChain) : [];
    const cascadeShots = chainCascadeShots.length > 0 ? chainCascadeShots : breakdownShots;
    if (cascadeShots.length > 1 && upstream.pictures.length > 1) {
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
      const cascadeShotFrameUrls = new Set(
        cascadeShots.map((s) => (s as any).firstFrameAssetId).filter((u): u is string => Boolean(u)),
      );
      // VG-39: 每镜参考数组排除本批首帧，避免「别人的首帧」当风格参考
      const upstreamPicturesForRefs = upstream.pictures.filter(
        (url) => !cascadeShotFrameUrls.has(url),
      );
      const count = chainCascadeShots.length > 0
        ? cascadeShots.length
        : Math.min(cascadeShots.length, upstream.pictures.length);
      let lastCompiledPrompt = prompt;
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
        const shot = cascadeShots[i];
        let imageUrl = (shot as any).firstFrameAssetId || upstream.pictures[i];
        // F-003: 链优先，不再回退全局镜表
        const boardShot = chainCascadeShots.length > 0 ? shot : (
          ctx?.nodes && ctx?.edges
            ? (() => {
                const inc = ctx!.edges.filter((e) => e.target === block.id);
                for (const e of inc) {
                  const src = ctx!.nodes.find((n) => n.id === e.source);
                  if (!src) continue;
                  const ch = (src.data as Record<string, unknown>)?.chainStoryboard as { shots?: any[] } | undefined;
                  if (ch?.shots) return ch.shots.find((s) => s.id === shot.id || s.index === i);
                }
                return undefined;
              })()
            : undefined
        );
        // F-024: 解析 @mention 引用
        const clipMentionRefs: import('@nx9/shared').MentionRef[] = [];
        upstreamPicturesForRefs.forEach((url, idx) => clipMentionRefs.push({ id: `pic-${idx}`, kind: 'picture', url, label: `图 ${idx + 1}` }));
        upstream.clips.forEach((url, idx) => clipMentionRefs.push({ id: `clip-${idx}`, kind: 'clip', url, label: `视频 ${idx + 1}` }));
        const rawClipPrompt =
          (shot as any).videoPrompt
          || (shot as any).videoPromptPro
          || (shot as any).videoPromptEn
          || (shot as any).promptEn
          || (shot as any).imagePrompt
          || (shot as any).descriptionZh
          || prompt
          || 'cinematic scene';
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
          upstreamPictures: upstreamPicturesForRefs,
          upstreamClips: upstream.clips,
          upstreamReferencePack: upstreamRefPack,
          resolveGenPack: getGenPack,
        });
        if (shotReq.blocked) blockClipRun(shotReq.blocked);
        lastCompiledPrompt = shotReq.prompt;
        const pendingKey = boardShot?.id ?? shot.id ?? `idx-${i}`;
        try {
          const awaited = await awaitProxyVideo(shotReq.body, { signal: ctx?.abortSignal });
          delete multiPendingTasks[pendingKey];
          clips.push(awaited.url);
          // VG-36: 级联多镜与批量同口径建 videoVersions + usedAssetIds
          if (boardShot) {
            const usage = collectClipUsedAssets(shotReq.prompt, charCtx, boardShot);
            const version = {
              id: `video-${boardShot.id}-${Date.now()}`,
              url: awaited.url,
              createdAt: new Date().toISOString(),
              prompt: shotReq.prompt,
              model: modelId,
              status: 'candidate' as const,
            };
            patchFlowShot(block.id, boardShot.id, {
              ...appendStoryboardVideoVersion(boardShot, version),
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
        // VG-37: 禁止出片路径覆盖用户 content
        lastCompiledPrompt,
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
    const linkedSingleShot = linkedShotForBlock(block.id, d);
    const rawSinglePrompt =
      linkedSingleShot?.videoPromptPro
      || linkedSingleShot?.videoPromptEn
      || linkedSingleShot?.promptEn
      || linkedSingleShot?.descriptionZh
      || breakdownShots[0]?.videoPrompt
      || prompt
      || 'cinematic scene';
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
    const modelId = (d.model as string) || 'veo';
    try {
      const awaited = await awaitProxyVideo(singleReq.body, { signal: ctx?.abortSignal });
      const linkedClipShot = linkedShotForBlock(block.id, d);
      const singleUsage = collectClipUsedAssets(singleReq.prompt, charCtx, linkedClipShot);
      updateNodeData(block.id, {
        status: 'success',
        videoUrl: awaited.url,
        taskId: awaited.taskId,
        providerBaseUrl: awaited.providerBaseUrl,
        // VG-37: 成功路径禁止覆盖用户 content
        lastCompiledPrompt: singleReq.prompt,
        referencePackUsed: singleReq.playbookId,
        characterInjected: charCtx.characters.map((c) => c.id),
        usedAssetIds: singleUsage.usedAssetIds,
        lastResult: { url: awaited.url, taskId: awaited.taskId, usedAssetIds: singleUsage.usedAssetIds },
        error: undefined,
        message: undefined,
      });
      // 单镜绑定写回（VG-36: 与批量同口径建 videoVersions）
      if (linkedClipShot) {
        const version = {
          id: `video-${linkedClipShot.id}-${Date.now()}`,
          url: awaited.url,
          createdAt: new Date().toISOString(),
          prompt: singleReq.prompt,
          model: modelId,
          status: 'candidate' as const,
        };
        patchFlowShot(block.id, linkedClipShot.id, {
          ...appendStoryboardVideoVersion(linkedClipShot, version),
          ...singleUsage,
        }, updateNodeData, ctx?.nodes, ctx?.edges);
      }
    } catch (error) {
      if (error instanceof VideoPollTimeoutError) {
        updateNodeData(block.id, {
          status: 'running',
          taskId: error.taskId,
          providerBaseUrl: error.providerBaseUrl,
          lastCompiledPrompt: singleReq.prompt,
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
}
