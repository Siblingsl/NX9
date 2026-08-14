import { flattenScriptBreakdownShots } from '@nx9/shared';
import { api } from '../../api/client';
import { useActivityLog } from '../../stores/activity-log';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { patchUpstreamShot } from '../chain-storyboard-utils';
import { DirectorRunBlockedError } from './errors';
import type { FlowExecuteDeps } from './types';

export async function executeStoryOps(deps: FlowExecuteDeps): Promise<void> {
  const { block, kind, prompt, upstream, updateNodeData, ctx } = deps;
  const d = block.data ?? {};
  if (kind === 'storyboard-desk' || kind === 'storyboard-preview' || kind === 'story-grid') {
    // P0：若有 confirmed package 且无本地表 → 拆镜；不默认全量关键帧批出
    const screenplayPkg = upstream.screenplayPackages?.[0];
    const localBreakdown = d.scriptBreakdown as import('@nx9/shared').ScriptBreakdownPayload | undefined;
    const { isScreenplayPackage } = await import('@nx9/shared');
    const { applyDeskBreakdown } = await import('../storyboard-desk-runner');
    if (isScreenplayPackage(screenplayPkg) && screenplayPkg!.status === 'confirmed' && !localBreakdown) {
      const { runBreakdownFromPackage, assembleScreenplaySourceText } = await import('../storyboard-desk-runner');
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
    // DEEP-04：画布级 Run 无活时不得绿勾；明确 skipped，避免下游误判“分镜已就绪”。
    updateNodeData(block.id, {
      status: 'skipped',
      noop: true,
      content: '分镜台：无活（等待编剧台 confirmed package 拆镜，画布 Run 未产生镜表）',
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
    } = await import('../director-desk-runner');
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
        meta: { noop: true },
        batchSummary: summary,
      });
      return;
    }
    updateNodeData(block.id, {
      status: summary.failed > 0 && summary.done === 0 ? 'error' : 'success',
      // DD-D-06: 节点 previewUrl 不是交接代表帧 SSOT；批出代表帧走链镜表 firstFrameAssetId。
      lastBatchPreviewUrl: summary.lastUrl ?? undefined,
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
      const { resolveUpstreamChainDesk } = await import('../chain-storyboard-utils');
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

  if (kind === 'continuity-check') {
    const images = upstream.pictures ?? [];
    if (images.length < 2) throw new Error('至少需要 2 张上游图像');

    const {
      CONTINUITY_SYSTEM_PROMPT,
      buildContinuityUserText,
      resolveContinuityModel,
      sliceContinuityImages,
      parseContinuityLlmJson,
    } = await import('../continuity-check-runner');
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
    
    // DR-04: 解析 LLM JSON（去围栏）；只对能映射到 shotId/shotIndex 的 issue 写回 review，禁止整表 failed。
    const parsed = parseContinuityLlmJson(raw);
    const issues = parsed.issues;
    if (targetShotIds.length > 0 && ctx?.nodes && ctx?.edges) {
      for (const issue of issues) {
        let matchedShotId: string | undefined;
        if (issue.shotId && targetShotIds.includes(issue.shotId)) {
          matchedShotId = issue.shotId;
        } else if (
          typeof issue.shotIndex === 'number' &&
          issue.shotIndex >= 0 &&
          issue.shotIndex < targetShotIds.length
        ) {
          matchedShotId = targetShotIds[issue.shotIndex];
        }
        if (!matchedShotId) continue;
        patchUpstreamShot(updateNodeData, block.id, ctx.nodes, ctx.edges, matchedShotId, {
          keyframeStatus: 'review',
          keyframeReviewNote: `连续性: ${issue.message}`,
        });
      }
    }

    updateNodeData(block.id, {
      status: 'success',
      continuityReport: raw,
      content: raw,
      continuityIssues: issues.map((issue) => issue.message),
      ...(issues.length > 0 ? { continuityIssueRefs: issues } : { continuityIssueRefs: undefined }),
      ...(parsed.parseFailed ? { continuityParseFailed: true } : { continuityParseFailed: undefined }),
      imagesChecked: images.length,
      imagesOmitted: sliced.omitted,
      ...(sliced.note ? { continuityCapNote: sliced.note } : { continuityCapNote: undefined }),
    });
    if (parsed.parseFailed) {
      useActivityLog.getState().append('连续性检查：LLM 返回无法解析为 JSON，已保留原文报告，未改写镜状态');
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
      meta: {
        bpm,
        durationSec,
        cutPoints,
        beatIntervalSec: interval,
        algorithm: 'bpm-interval',
        listenedToAudio: false,
      },
      message: '按 BPM 估切，未做听音分析',
      clips: upstream.clips?.length ? upstream.clips : undefined,
      content: `按 BPM ${bpm} 估切 · ${cutPoints.length} cuts（未听音分析）`,
    });
    return;
  }
}
