# -*- coding: utf-8 -*-
"""NX9 VG-R3 源码精确替换（自动保持 CRLF/LF）。"""
import io


def patch_file(path, pairs):
    s = io.open(path, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in s else '\n'

    def norm(x):
        return x.replace('\n', nl)

    for old, new in pairs:
        o = norm(old)
        n = norm(new)
        assert s.count(o) == 1, (path, o[:90], s.count(o))
        s = s.replace(o, n, 1)
    io.open(path, 'w', encoding='utf-8', newline='').write(s)
    print('patched', path)


# ---------- flow-runner.ts ----------
FLOW_PAIRS = [
    # 导入 appendStoryboardVideoVersion
    (
        """  readChainStoryboard,
  type DirectorKeyframeBatch,
} from '@nx9/shared';""",
        """  readChainStoryboard,
  appendStoryboardVideoVersion,
  type DirectorKeyframeBatch,
} from '@nx9/shared';""",
    ),
    # VG-37: 导演批次摘要不再写 content
    (
        """        directorKeyframeBatch: result.batch,
        directorBatchReceipt: result.receipt,
        content: `导演关键帧批次 ${result.receipt.succeededShotIds.length}/${result.batch.shots.length}`,
        lastResult: result.receipt,""",
        """        directorKeyframeBatch: result.batch,
        directorBatchReceipt: result.receipt,
        batchSummary: `导演关键帧批次 ${result.receipt.succeededShotIds.length}/${result.batch.shots.length}`,
        lastResult: result.receipt,""",
    ),
    # VG-37: Bridge 中间态不覆盖用户草稿
    (
        """        updateNodeData(block.id, {
          endFrameUrl,
          continuationPrompt,
          content: continuationPrompt,
          pictures: [endFrameUrl],
        });""",
        """        updateNodeData(block.id, {
          endFrameUrl,
          continuationPrompt,
          lastCompiledPrompt: continuationPrompt,
          pictures: [endFrameUrl],
        });""",
    ),
    # VG-37: Bridge 出片成功
    (
        """            endFrameUrl,
            continuationPrompt,
            content: finalPrompt,
            error: undefined,""",
        """            endFrameUrl,
            continuationPrompt,
            lastCompiledPrompt: finalPrompt,
            error: undefined,""",
    ),
    # VG-37: Bridge 超时恢复
    (
        """              endFrameUrl,
              continuationPrompt,
              content: finalPrompt,
              error: undefined,""",
        """              endFrameUrl,
              continuationPrompt,
              lastCompiledPrompt: finalPrompt,
              error: undefined,""",
    ),
    # VG-35/36/37/39: 级联多镜改为链镜优先 + 参考过滤 + videoVersions
    (
        """    // 多镜 + 多参考图：按镜批量图生视频（真实出片）
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
            finalPrompt = `${finalPrompt}\\n\\n${buildVideoGuidePromptSuffix(guide)}`.trim();
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
    }""",
        """    // VG-35: 级联与工作台同口径——有链镜表时按链镜逐镜出片，不再依赖 breakdown×preview 启发式
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
        cascadeShots.map((s) => s.firstFrameAssetId).filter((u): u is string => Boolean(u)),
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
        let imageUrl = shot.firstFrameAssetId || upstream.pictures[i];
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
            finalPrompt = `${finalPrompt}\\n\\n${buildVideoGuidePromptSuffix(guide)}`.trim();
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
    }""",
    ),
    # VG-35/36/37: 单镜链 prompt 优先 + videoVersions + 不写 content
    (
        """    // F-024: 解析 @mention 引用
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
    return;""",
        """    // F-024: 解析 @mention 引用
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
    return;""",
    ),
    # VG-46: 删除 bridge-clip 假成功僵尸分支
    (
        """  if (kind === 'bridge-clip') {
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

""",
        "",
    ),
]

# ---------- flow-graph.ts ----------
GRAPH_PAIRS = [
    (
        """      if (chain?.shots) {
        out.shotIds = [...new Set([...(out.shotIds ?? []), ...chain.shots.map((s) => s.id)])];
        const prompts = chain.shots.map((s) => s.imagePrompt).filter(Boolean) as string[];
        out.prompts.push(...prompts);
      }""",
        """      if (chain?.shots) {
        out.shotIds = [...new Set([...(out.shotIds ?? []), ...chain.shots.map((s) => s.id)])];
        const prompts = chain.shots.map((s) => s.imagePrompt).filter(Boolean) as string[];
        out.prompts.push(...prompts);
        // VG-35/45: 链镜首帧与已生成成片直接进上游媒体，级联/导演不再坍缩成单镜
        for (const chainShot of chain.shots as Array<{ firstFrameAssetId?: string; videoAssetId?: string }>) {
          if (chainShot.firstFrameAssetId) out.pictures.push(chainShot.firstFrameAssetId);
          if (chainShot.videoAssetId) out.clips.push(chainShot.videoAssetId);
        }
      }""",
    ),
    (
        """    if (kind === 'director-desk' || kind === 'story-grid' || kind === 'motion-story') {
      const url = (d.previewUrl as string) || (d.lastFrameUrl as string);""",
        """    if (kind === 'director-desk' || kind === 'story-grid' || kind === 'motion-story') {
      // VG-35/45: 导演台同样展开链镜首帧/成片，直连 clip-gen 时参考可达
      const deskChain = d.chainStoryboard as
        | { shots?: Array<{ firstFrameAssetId?: string; videoAssetId?: string }> }
        | undefined;
      if (deskChain?.shots) {
        for (const deskShot of deskChain.shots) {
          if (deskShot.firstFrameAssetId) out.pictures.push(deskShot.firstFrameAssetId);
          if (deskShot.videoAssetId) out.clips.push(deskShot.videoAssetId);
        }
      }
      const url = (d.previewUrl as string) || (d.lastFrameUrl as string);""",
    ),
]

# ---------- clip-gen-request.ts ----------
CLIP_REQUEST_PAIRS = [
    (
        """  type ReferencePack,
  type UpstreamPolicy,
} from '@nx9/shared';""",
        """  validateVideoModelParams,
  type ReferencePack,
  type UpstreamPolicy,
} from '@nx9/shared';""",
    ),
    (
        """  const extraRefImages: string[] = [];
  if (applyModeDispatch) {
    if (mode === 'keyframe') {""",
        """  const extraRefImages: string[] = [];
  if (applyModeDispatch) {
    if (mode === 'text-to-video') {
      // VG-40: 文生视频模式不带首帧；上游图只进参考数组
      imageUrl = undefined;
    } else if (mode === 'keyframe') {""",
    ),
    (
        """      if (!imageUrl) {
        return {
          body: {},
          prompt,
          blocked: '首尾帧模式需要先上传首图',
          playbookId: activePack?.playbookId,
          referenceImages: [],
          referenceVideos: [],
        };
      }
    } else if (mode === 'image-to-video') {""",
        """      if (!imageUrl) {
        return {
          body: {},
          prompt,
          blocked: '首尾帧模式需要先上传首图',
          playbookId: activePack?.playbookId,
          referenceImages: [],
          referenceVideos: [],
        };
      }
      // VG-41: 首尾帧模式缺尾帧禁止静默退化成图生视频
      if (!lastFrameUrl) {
        return {
          body: {},
          prompt,
          blocked: '首尾帧模式需要上传尾图',
          playbookId: activePack?.playbookId,
          referenceImages: [],
          referenceVideos: [],
        };
      }
    } else if (mode === 'image-to-video') {""",
    ),
    (
        """  const referenceVideosAll = dedupe([
    ...(activePack?.videoUrls ?? []),
    activePack?.depthVideoUrl,
    ...(input.upstreamClips ?? []),
  ]);
  if (model === 'seedance') {""",
        """  const referenceVideosAll = dedupe([
    ...(activePack?.videoUrls ?? []),
    activePack?.depthVideoUrl,
    ...(input.upstreamClips ?? []),
  ]);
  // VG-41: 图片参考无图、全能参考无图无视频时阻断，禁止伪装成文生/图生
  if (mode === 'image-ref' && referenceImagesAll.length === 0) {
    return {
      body: {},
      prompt,
      blocked: '图片参考模式需要至少一张参考图',
      playbookId: activePack?.playbookId,
      referenceImages: [],
      referenceVideos: [],
    };
  }
  if (mode === 'omni-ref' && referenceImagesAll.length === 0 && referenceVideosAll.length === 0) {
    return {
      body: {},
      prompt,
      blocked: '全能参考模式需要至少一张参考图或一段参考视频',
      playbookId: activePack?.playbookId,
      referenceImages: [],
      referenceVideos: [],
    };
  }
  if (model === 'seedance') {""",
    ),
    (
        """  const negativePrompt = ((d.negativePrompt as string) ?? '').trim() || undefined;
  const modelParams = ((d.modelParams as string) ?? '').trim() || undefined;

  const body: Record<string, unknown> = {""",
        """  const negativePrompt = ((d.negativePrompt as string) ?? '').trim() || undefined;
  const modelParams = ((d.modelParams as string) ?? '').trim() || undefined;
  if (modelParams) {
    const modelParamsError = validateVideoModelParams(modelParams);
    if (modelParamsError) {
      return {
        body: {},
        prompt,
        blocked: modelParamsError,
        playbookId: activePack?.playbookId,
        referenceImages,
        referenceVideos,
      };
    }
  }

  const body: Record<string, unknown> = {""",
    ),
]

# ---------- director-keyframe-batch-runner.ts ----------
DIRECTOR_BATCH_PAIRS = [
    (
        """import type {
  ChainStoryboardPayload,
  DirectorKeyframeBatch,
  DirectorKeyframeBatchReceipt,
  DirectorKeyframeBatchShot,
  StoryboardShot,
} from '@nx9/shared';""",
        """import {
  appendStoryboardVideoVersion,
  type ChainStoryboardPayload,
  type DirectorKeyframeBatch,
  type DirectorKeyframeBatchReceipt,
  type DirectorKeyframeBatchShot,
  type StoryboardShot,
} from '@nx9/shared';""",
    ),
    (
        """  now?: () => string;
  /** DD-D-09: 每镜成功即时回执，中断后已成功镜头不丢。 */
  onShotProgress?: (shotId: string, patch: Partial<StoryboardShot>) => void;""",
        """  now?: () => string;
  /** VG-36: 成片 version 写入用的模型名（与 clip-gen 节点一致） */
  model?: string;
  /** DD-D-09: 每镜成功即时回执，中断后已成功镜头不丢。 */
  onShotProgress?: (shotId: string, patch: Partial<StoryboardShot>) => void;""",
    ),
    (
        """      const shotPatch: Partial<StoryboardShot> = {
        videoAssetId: generated.videoUrl,
        videoStatus: 'review',
        // DD-D-01: 只写视频阶段字段，保留 keyframeStatus/status 不被覆盖。
        ...(generated.shotPatch ?? {}),
      };""",
        """      const version = {
        id: `video-${item.shotId}-${item.keyframeRevision}-${Date.now()}`,
        url: generated.videoUrl,
        createdAt: options.now?.() ?? new Date().toISOString(),
        prompt: item.prompt ?? '',
        model: options.model ?? 'veo',
        status: 'candidate' as const,
      };
      const versionPatch = appendStoryboardVideoVersion(currentShot, version);
      const shotPatch: Partial<StoryboardShot> = {
        // VG-36: 导演批次与批量同口径建 videoVersions
        videoVersions: versionPatch.videoVersions,
        videoAssetId: versionPatch.videoAssetId,
        videoStatus: versionPatch.videoStatus,
        // DD-D-01: 只写视频阶段字段，保留 keyframeStatus/status 不被覆盖。
        ...(generated.shotPatch ?? {}),
      };""",
    ),
]

# ---------- core-pipeline-runner.ts ----------
CORE_PAIRS = [
    (
        """  opts?: { signal?: AbortSignal },
): Promise<{ ok: number; fail: number }> {""",
        """  opts?: { signal?: AbortSignal },
): Promise<{ ok: number; fail: number; skipped: number }> {""",
    ),
    (
        """  if (!resolvedChain.length) {
    log('无上游链镜表，已禁止回退全局批出（F-004）。请连接分镜台/导演台后再试');
    return { ok: 0, fail: 0 };
  }""",
        """  if (!resolvedChain.length) {
    log('无上游链镜表，已禁止回退全局批出（F-004）。请连接分镜台/导演台后再试');
    return { ok: 0, fail: 0, skipped: 0 };
  }""",
    ),
    (
        """  if (shots.length === 0) {
    log(requested ? '上游镜头列表为空' : '分镜列表为空');
    return { ok: 0, fail: 0 };
  }""",
        """  if (shots.length === 0) {
    log(requested ? '上游镜头列表为空' : '分镜列表为空');
    return { ok: 0, fail: 0, skipped: 0 };
  }""",
    ),
    (
        """  const unapproved = shots.filter((s) => s.keyframeStatus !== 'approved');
  if (unapproved.length > 0) {
    log(`还有 ${unapproved.length} 镜未批审关键帧，请先完成批审`);
  }""",
        """  const unapproved = shots.filter((s) => s.keyframeStatus !== 'approved');
  if (unapproved.length > 0) {
    log(`还有 ${unapproved.length} 镜未批审关键帧，请先完成批审`);
  }
  // VG-43: 未批审 / 无分镜图镜头计为 skipped，随返回值与节点 message 上浮
  const skipped = shots.filter(
    (s) => !s.firstFrameAssetId || s.keyframeStatus !== 'approved',
  ).length;""",
    ),
    (
        """  if (targets.length === 0) {
    const allHave = shots.every((s) => s.videoAssetId);
    if (allHave) {
      log(`全部 ${shots.length} 镜已有视频`);
      return { ok: shots.length, fail: 0 };
    }
    log('没有可生成视频的镜头（需要已批审 + 有分镜图）');
    return { ok: 0, fail: 0 };
  }""",
        """  if (targets.length === 0) {
    const allHave = shots.every((s) => s.videoAssetId);
    if (allHave) {
      log(`全部 ${shots.length} 镜已有视频`);
      return { ok: shots.length, fail: 0, skipped: 0 };
    }
    log('没有可生成视频的镜头（需要已批审 + 有分镜图）');
    return { ok: 0, fail: 0, skipped };
  }""",
    ),
    (
        """  if (preflight.blocked) {
    if (clipNode) updateFn(clipNode.id, { status: 'error', error: preflight.blocked });
    log(`批量视频已阻断 · ${preflight.blocked}`);
    return { ok: 0, fail: 0 };
  }""",
        """  if (preflight.blocked) {
    if (clipNode) updateFn(clipNode.id, { status: 'error', error: preflight.blocked });
    log(`批量视频已阻断 · ${preflight.blocked}`);
    return { ok: 0, fail: 0, skipped: 0 };
  }""",
    ),
    (
        """      pendingVideoTasks: pendingTasks,
      ...(pendingCount > 0
        ? { message: `${pendingCount} 个任务仍在后台生成，可在工作台继续查询` }
        : { message: undefined }),""",
        """      pendingVideoTasks: pendingTasks,
      ...(pendingCount > 0
        ? { message: `${pendingCount} 个任务仍在后台生成，可在工作台继续查询` }
        : skipped > 0
          ? { message: `跳过 ${skipped} 镜（关键帧未批审或无分镜图）` }
          : { message: undefined }),""",
    ),
    (
        """  log(`批量视频结束 · 成功 ${ok} · 失败 ${fail}${pendingCount ? ` · 后台 ${pendingCount}` : ''}`);
  return { ok, fail };""",
        """  log(`批量视频结束 · 成功 ${ok} · 失败 ${fail} · 跳过 ${skipped}${pendingCount ? ` · 后台 ${pendingCount}` : ''}`);
  return { ok, fail, skipped };""",
    ),
]

# ---------- video-gen-params.ts ----------
PARAMS_PAIRS = [
    (
        """  return {
    size: preset,
    aspect: data.aspect || aspectMap[orient] || '16:9',
    durationSec: data.durationSec || 5,
    resolution: res,
  };
}""",
        """  return {
    size: preset,
    aspect: data.aspect || aspectMap[orient] || '16:9',
    durationSec: data.durationSec || 5,
    resolution: res,
  };
}

/**
 * VG-42: 校验 Provider 参数文本（JSON 对象或 key=value 列表）。
 * 与网关 parseModelParams 同口径：无法解析的输入会被静默丢弃，这里提前报错。
 */
export function validateVideoModelParams(raw: string): string | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? null
        : 'Provider 参数需为 JSON 对象或 key=value 列表';
    } catch {
      return 'Provider 参数 JSON 解析失败';
    }
  }
  for (const pair of text.split(/[,;\\n]+/)) {
    const idx = pair.indexOf('=');
    if (idx > 0 && pair.slice(0, idx).trim()) return null;
  }
  return 'Provider 参数需为 JSON 对象或 key=value 列表';
}""",
    ),
]

# ---------- index.ts ----------
INDEX_PAIRS = [
    (
        """  orientationFromAspect,
  resolveVideoGenParams,
} from './utils/video-gen-params';""",
        """  orientationFromAspect,
  resolveVideoGenParams,
  validateVideoModelParams,
} from './utils/video-gen-params';""",
    ),
]

# ---------- migrate-block-kinds.ts ----------
MIGRATE_PAIRS = [
    (
        """  'motion-story': { videoMode: 'motion' },
  'seedance-chain': { videoMode: 'chain', model: 'seedance' },
  'bridge-clip': { videoMode: 'bridge' },
  'lipsync-pass': { videoMode: 'lipsync' },
  'photo-speak': { videoMode: 'photo-speak' },
  'frame-endpoints': { videoMode: 'frame-endpoints' },
  'frame-sampler': { videoMode: 'frame-endpoints' },""",
        """  'motion-story': { videoMode: 'single', videoGenMode: 'image-to-video' },
  'seedance-chain': { videoMode: 'single', videoGenMode: 'image-to-video', model: 'seedance' },
  'bridge-clip': { videoMode: 'bridge', videoGenMode: 'bridge' },
  'lipsync-pass': { videoMode: 'single', videoGenMode: 'text-to-video' },
  'photo-speak': { videoMode: 'single', videoGenMode: 'image-to-video' },
  'frame-endpoints': { videoMode: 'single', videoGenMode: 'keyframe', useKeyframePair: true },
  'frame-sampler': { videoMode: 'single', videoGenMode: 'keyframe', useKeyframePair: true },""",
    ),
    (
        """export function migrateBlockKinds<T extends MigratableNode>(""",
        """/** VG-47: 旧迁移补丁遗留的孤儿 videoMode（chain/motion/lipsync…）在加载时归一为 single/bridge。 */
const LEGACY_CLIP_GEN_VIDEO_MODE_NORMALIZE: Record<string, Record<string, unknown>> = {
  'motion': { videoMode: 'single', videoGenMode: 'image-to-video' },
  'chain': { videoMode: 'single', videoGenMode: 'image-to-video' },
  'lipsync': { videoMode: 'single', videoGenMode: 'text-to-video' },
  'photo-speak': { videoMode: 'single', videoGenMode: 'image-to-video' },
  'frame-endpoints': { videoMode: 'single', videoGenMode: 'keyframe', useKeyframePair: true },
};

function normalizeLegacyClipGenVideoMode(data: Record<string, unknown>): Record<string, unknown> {
  const videoMode = data.videoMode as string | undefined;
  if (!videoMode || videoMode === 'single' || videoMode === 'bridge') return data;
  const patch = LEGACY_CLIP_GEN_VIDEO_MODE_NORMALIZE[videoMode];
  if (!patch || data.videoGenMode) return data;
  return { ...data, ...patch };
}

export function migrateBlockKinds<T extends MigratableNode>(""",
    ),
    (
        """    // 审阅关卡：由 stripReviewGateFromGraph 物理拆除并改线，此处不改成第二个导演台
    if (kind === 'review-gate') {
      return node;
    }""",
        """    // VG-47: 已迁移为 clip-gen 的旧节点，清扫孤儿 videoMode
    if (kind === 'clip-gen') {
      const nextData = normalizeLegacyClipGenVideoMode(data);
      if (nextData !== data) {
        migratedCount += 1;
        return { ...node, data: nextData } as T;
      }
      return node;
    }

    // 审阅关卡：由 stripReviewGateFromGraph 物理拆除并改线，此处不改成第二个导演台
    if (kind === 'review-gate') {
      return node;
    }""",
    ),
]

# ---------- VideoWorkspace.tsx ----------
WORKSPACE_PAIRS = [
    (
        """import {
  adoptStoryboardVideoVersion,
  approveStoryboardVideoShot,
  CLIP_GEN_MODELS,
  lookupBlock,
  rejectStoryboardVideoShot,
} from '@nx9/shared';""",
        """import {
  adoptStoryboardVideoVersion,
  appendStoryboardVideoVersion,
  approveStoryboardVideoShot,
  CLIP_GEN_MODELS,
  lookupBlock,
  rejectStoryboardVideoShot,
  validateVideoModelParams,
} from '@nx9/shared';""",
    ),
    (
        """    const prev = Array.isArray(data.linkedShotIds) ? (data.linkedShotIds as string[]) : [];
    if (prev.length === shotIds.length && prev.every((id, i) => id === shotIds[i])) return;
    updateNodeData(blockId, {
      linkedShotIds: shotIds,
      linkedShotId: shotIds[0] ?? undefined,
    });""",
        """    const prev = Array.isArray(data.linkedShotIds) ? (data.linkedShotIds as string[]) : [];
    // VG-44: 仅在空/未定义时默认全选，保留导演台推送或用户编辑的子集
    if (prev.length > 0) return;
    updateNodeData(blockId, {
      linkedShotIds: shotIds,
      linkedShotId: shotIds[0] ?? undefined,
    });""",
    ),
    (
        """      if (hasUpstream && shotIds.length > 0 && videoGenMode !== 'bridge') {
        await batchGenerateVideosFromShots(shotIds, false, blockId, shots as any, {
          signal: controller.signal,
        });
        appendLog(`上游镜头视频生成完成 · ${shotIds.length} 镜`);
        return;
      }""",
        """      if (hasUpstream && shotIds.length > 0 && videoGenMode !== 'bridge') {
        const res = await batchGenerateVideosFromShots(shotIds, false, blockId, shots as any, {
          signal: controller.signal,
        });
        // VG-43: 未批审 / 无分镜图镜头上报跳过，不再静默
        appendLog(
          res.skipped > 0
            ? `上游镜头视频生成完成 · 成功 ${res.ok} · 失败 ${res.fail} · 跳过 ${res.skipped}（关键帧未批审或无分镜图）`
            : `上游镜头视频生成完成 · ${res.ok}/${shotIds.length} 镜`,
        );
        return;
      }""",
    ),
    (
        """  const retryShot = useCallback(async (shotId: string) => {
    setRetryingShotId(shotId);
    try {
      // F-004: 传入链镜表避免回退全局
      await batchGenerateVideosFromShots([shotId], true, blockId, shots as any);
    } finally {
      setRetryingShotId(null);
    }
  }, [blockId, shots]);""",
        """  const retryShot = useCallback(async (shotId: string) => {
    // VG-44: 单镜重试纳入 runAbortRef，可被工作台「停止」打断
    runAbortRef.current?.abort();
    const controller = new AbortController();
    runAbortRef.current = controller;
    setRetryingShotId(shotId);
    try {
      // F-004: 传入链镜表避免回退全局
      await batchGenerateVideosFromShots([shotId], true, blockId, shots as any, {
        signal: controller.signal,
      });
    } finally {
      if (runAbortRef.current === controller) runAbortRef.current = null;
      setRetryingShotId(null);
    }
  }, [blockId, shots]);""",
    ),
    (
        """      if (hasSinglePending && singleTaskId) {
        const providerBaseUrl = data.providerBaseUrl as string | undefined;
        const res = await api.pollVideo(singleTaskId, providerBaseUrl);
        if (res.status === 'success' && res.url) {
          updateNodeData(blockId, { status: 'success', videoUrl: res.url, error: undefined });
          appendLog('视频任务已完成');
        } else if (res.status === 'failed') {""",
        """      if (hasSinglePending && singleTaskId) {
        const providerBaseUrl = data.providerBaseUrl as string | undefined;
        const res = await api.pollVideo(singleTaskId, providerBaseUrl);
        if (res.status === 'success' && res.url) {
          // VG-38: 单镜恢复成功也写回链镜表 + videoVersions，并清脏字段
          const linkedShotId = data.linkedShotId as string | undefined;
          const shot = linkedShotId
            ? shots.find((s) => s.id === linkedShotId)
            : shots.length === 1
              ? shots[0]
              : undefined;
          if (shot) {
            const version = {
              id: `video-${shot.id}-${Date.now()}`,
              url: res.url,
              createdAt: new Date().toISOString(),
              prompt: (data.lastCompiledPrompt as string | undefined) ?? '',
              model,
              status: 'candidate' as const,
            };
            patchChainShotLocal(shot.id, appendStoryboardVideoVersion(shot, version));
          }
          updateNodeData(blockId, {
            status: 'success',
            videoUrl: res.url,
            error: undefined,
            taskId: undefined,
            providerBaseUrl: undefined,
            message: undefined,
          });
          appendLog('视频任务已完成');
        } else if (res.status === 'failed') {""",
    ),
    (
        """  }, [blockId, pendingTaskCount, hasSinglePending, singleTaskId, data.providerBaseUrl, updateNodeData, appendLog]);""",
        """  }, [blockId, pendingTaskCount, hasSinglePending, singleTaskId, data, shots, model, patchChainShotLocal, updateNodeData, appendLog]);""",
    ),
    (
        """  const sourceClipUrl = (data.sourceClipUrl as string | undefined) || undefined;""",
        """  const sourceClipUrl = (data.sourceClipUrl as string | undefined) || undefined;
  const modelParamsError = validateVideoModelParams((data.modelParams as string) ?? '');""",
    ),
    (
        """        <input
          type="text"
          value={(data.modelParams as string) ?? ''}
          onChange={(e) => handlePatch({ modelParams: e.target.value || undefined })}
          onMouseDown={stop}
          placeholder="JSON 或 key=value"
          className="w-full rounded-lg border border-line/50 px-2 py-1 text-[11px] focus:outline-none focus:border-brand/40"
        />
      </label>""",
        """        <input
          type="text"
          value={(data.modelParams as string) ?? ''}
          onChange={(e) => handlePatch({ modelParams: e.target.value || undefined })}
          onMouseDown={stop}
          placeholder="JSON 或 key=value"
          className={`w-full rounded-lg border px-2 py-1 text-[11px] focus:outline-none ${
            modelParamsError
              ? 'border-error/60 focus:border-error/60'
              : 'border-line/50 focus:border-brand/40'
          }`}
        />
        {modelParamsError && (
          <span className="text-[9px] text-error">{modelParamsError}</span>
        )}
      </label>""",
    ),
    (
        """      topSlot={
        <>
          {playbookTop}""",
        """      topSlot={
        <>
          {playbookTop}
          {videoGenMode === 'text-to-video' && hasUpstream && (
            <div
              className="shrink-0 px-3 py-1.5 border-b border-line/25 nodrag nopan"
              onMouseDown={stop}
            >
              <p className="text-[9px] text-warn/75">
                文生视频模式不会携带分镜首帧；需要首帧约束请切换「图生视频」。
              </p>
            </div>
          )}""",
    ),
]

# ---------- useStudioDesk.ts ----------
STUDIO_PAIRS = [
    (
        """      toastSuccess(`镜头视频 · 成功 ${res.ok} · 失败 ${res.fail}`);""",
        """      toastSuccess(
        `镜头视频 · 成功 ${res.ok} · 失败 ${res.fail}${res.skipped ? ` · 跳过 ${res.skipped}` : ''}`,
      );""",
    ),
]

patch_file(r'F:\code\project\NX9\apps\web\src\engine\flow-runner.ts', FLOW_PAIRS)
patch_file(r'F:\code\project\NX9\packages\shared\src\engine\flow-graph.ts', GRAPH_PAIRS)
patch_file(r'F:\code\project\NX9\apps\web\src\engine\clip-gen-request.ts', CLIP_REQUEST_PAIRS)
patch_file(r'F:\code\project\NX9\apps\web\src\engine\director-keyframe-batch-runner.ts', DIRECTOR_BATCH_PAIRS)
patch_file(r'F:\code\project\NX9\apps\web\src\engine\core-pipeline-runner.ts', CORE_PAIRS)
patch_file(r'F:\code\project\NX9\packages\shared\src\utils\video-gen-params.ts', PARAMS_PAIRS)
patch_file(r'F:\code\project\NX9\packages\shared\src\index.ts', INDEX_PAIRS)
patch_file(r'F:\code\project\NX9\packages\shared\src\catalog\migrate-block-kinds.ts', MIGRATE_PAIRS)
patch_file(
    r'F:\code\project\NX9\apps\web\src\engine\stage-deck\chrome\attached-workspace\generation\video\VideoWorkspace.tsx',
    WORKSPACE_PAIRS,
)
patch_file(r'F:\code\project\NX9\apps\web\src\pages\studio\useStudioDesk.ts', STUDIO_PAIRS)
print('all source patches applied')
