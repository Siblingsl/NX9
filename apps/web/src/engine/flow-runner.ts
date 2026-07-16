import type { Node, Edge } from '@xyflow/react';
import {
  emptyClipChain,
  gatherUpstream,
  mergeUpstreamPrompt,
  shotsToClipChain,
  splitText,
  topologicalLayers,
  enrichPromptWithCharacters,
  parseMentionsFromPrompt,
  buildCharacterContext,
  mergePromptBatchItems,
  promptItemsToBatch,
  resolvePromptBatch,
  buildLightRigPrompt,
  characterSheetFromNodeData,
  syncCharacterSheetNodeOutput,
  resolveVideoGenParams,
  resolveAssetImportItems,
  type ClipChainState,
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
  activeEpisodeShots,
  migrateBlockKind,
} from '@nx9/shared';
import { buildCameraPrompt, normalizeDirectorProject } from '@nx9/director3d';
import { api } from '../api/client';
import { runClipChain } from './clip-chain-runner';
import { pollVideoUntilDone } from './poll-task';
import { useWorkspaceDocument } from '../stores/workspace-document';

function linkedShotForBlock(blockId: string, data: Record<string, unknown>): StoryboardShot | undefined {
  const shots = useWorkspaceDocument.getState().storyboard.shots;
  const linkedShotId = data.linkedShotId as string | undefined;
  return shots.find((s) => s.id === linkedShotId || s.linkedBlockId === blockId);
}

function syncBreakdownToStoryboard(
  payload: import('@nx9/shared').ScriptBreakdownPayload,
): void {
  const doc = useWorkspaceDocument.getState();
  const previousById = new Map(doc.storyboard.shots.map((shot) => [shot.id, shot]));
  const rawShots = storyboardShotsFromScriptBreakdown(payload).map((base) => {
    const previous = previousById.get(base.id);
    if (!previous) return base;
    return {
      ...base,
      ...previous,
      episodeId: base.episodeId,
      episodeIndex: base.episodeIndex,
      episodeTitle: base.episodeTitle,
      index: base.index,
      durationSec: base.durationSec,
      descriptionZh: base.descriptionZh,
      promptEn: base.promptEn,
      videoPromptEn: base.videoPromptEn,
      characterNames: base.characterNames,
      sceneName: base.sceneName,
      sceneId: base.sceneId,
      sceneCode: base.sceneCode,
    };
  });
  const shots = bindStoryboardShotAssets(
    rawShots,
    doc.characters.characters,
    doc.environments?.environments ?? [],
  );
  const episodeIds = new Set(shots.map((shot) => shot.episodeId).filter(Boolean));
  const activeEpisodeId =
    doc.storyboard.activeEpisodeId && episodeIds.has(doc.storyboard.activeEpisodeId)
      ? doc.storyboard.activeEpisodeId
      : shots.find((shot) => shot.episodeId)?.episodeId ?? null;
  doc.setStoryboard({
    ...doc.storyboard,
    version: 3,
    title: payload.title,
    activeEpisodeId,
    shots,
  });
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
  'character-sheet',
  'scene-card',
  'dialogue-sheet',
  'asset-gate',
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
  'review-gate',
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
    super(`审阅关卡：镜头 ${pending.join(', ')} 尚未通过`);
    this.name = 'ReviewGateBlockedError';
    this.pending = pending;
  }
}

async function executeBlock(
  block: FlowBlock,
  upstream: ReturnType<typeof gatherUpstream>,
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
  ctx?: { nodes: Node[]; edges: Edge[] },
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

  if (kind === 'dialogue-sheet') {
    const source = ((d.sourceText as string) || prompt).trim();
    if (!source) throw new Error('剧本拆分缺少文本');
    const { runProductionScriptBreakdown } = await import('./script-breakdown-runner');
    await runProductionScriptBreakdown({
      blockId: block.id,
      sourceText: source,
      config: d.scriptBreakdownConfig as Partial<import('@nx9/shared').ScriptBreakdownConfig> | undefined,
      prompts: d.scriptBreakdownPrompts as Partial<import('@nx9/shared').ScriptBreakdownPromptTemplates> | undefined,
    });
    return;
  }

  if (kind === 'asset-gate') {
    const payload =
      upstream.scriptBreakdowns?.[0] ??
      (d.scriptBreakdown as import('@nx9/shared').ScriptBreakdownPayload | undefined);
    if (!payload) throw new Error('设定检查缺少剧本拆分数据');
    const { syncBreakdownAssets } = await import('./asset-gate-runner');
    const result = syncBreakdownAssets(block.id, payload);
    updateNodeData(block.id, {
      status: 'success',
      scriptBreakdown: payload,
      assetGate: {
        missingCharacters: result.missingCharacters,
        missingScenes: result.missingScenes,
        syncedCharacters: result.syncedCharacters,
        syncedScenes: result.syncedScenes,
        checkedAt: new Date().toISOString(),
      },
      content: `设定检查完成 · 角色 ${result.requiredCharacters.length} / 场景 ${result.requiredScenes.length}`,
      output: payload.episodes.flatMap((episode) => episode.shots.map((shot) => shot.imagePrompt)).join('\n\n'),
      meta: {
        requiredCharacters: result.requiredCharacters.length,
        requiredScenes: result.requiredScenes.length,
        missingCharacters: result.missingCharacters.length,
        missingScenes: result.missingScenes.length,
      },
    });
    return;
  }

  if (kind === 'storyboard-desk' || kind === 'storyboard-preview' || kind === 'story-grid') {
    const rawPayload =
      upstream.scriptBreakdowns?.[0] ??
      (d.scriptBreakdown as import('@nx9/shared').ScriptBreakdownPayload | undefined);
    if (rawPayload) syncBreakdownToStoryboard(rawPayload);
    const activeEpisodeId = useWorkspaceDocument.getState().storyboard.activeEpisodeId;
    const activeBreakdownEpisode = activeEpisodeId
      ? rawPayload?.episodes.find((episode) => episode.id === activeEpisodeId)
      : undefined;
    const payload = rawPayload && activeBreakdownEpisode
      ? { ...rawPayload, episodes: [activeBreakdownEpisode] }
      : rawPayload;
    const current =
      (d.storyboardPreview as import('@nx9/shared').StoryboardPreviewPayload | undefined) ??
      emptyStoryboardPreview();
    const breakdownShots = flattenScriptBreakdownShots(payload);
    const scopedStoryboardShots = activeEpisodeShots(useWorkspaceDocument.getState().storyboard);
    const frames = scopedStoryboardShots.length > 0
      ? buildStoryboardPreviewFrames(scopedStoryboardShots)
      : breakdownShots.length > 0
        ? buildStoryboardPreviewFramesFromBreakdown(breakdownShots)
        : current.frames;
    const totalDurationSec = frames.reduce((sum, f) => sum + Math.max(0, f.endSec - f.startSec), 0);

    const pictureNode =
      ctx?.nodes && ctx?.edges
        ? (await import('./storyboard-preview-runner')).findConnectedPictureGenNode(
            block.id,
            ctx.nodes,
            ctx.edges,
          )
        : undefined;
    const pictureData = (pictureNode?.data ?? {}) as Record<string, unknown>;

    let nextFrames = [...frames];
    if (pictureNode) {
      const { generateStoryboardFrameImage } = await import('./storyboard-preview-runner');
      const { writeBackBreakdownPreviewImage } = await import('@nx9/shared');
      let nextBreakdown = payload;

      for (let i = 0; i < nextFrames.length; i++) {
        const frame = nextFrames[i];
        if (frame.locked || frame.status === 'success' || frame.status === 'locked') continue;
        nextFrames[i] = { ...frame, status: 'generating' };
        updateNodeData(block.id, {
          storyboardPreview: {
            ...current,
            frames: nextFrames,
            computedFrameCount: nextFrames.length,
            totalDurationSec,
            confirmed: false,
          },
        });

        try {
          const imageUrl = await generateStoryboardFrameImage(
            frame,
            pictureData,
            resolveStoryboardPreviewPictureSettings(current),
          );
          nextFrames[i] = { ...frame, imageUrl, status: 'success', errorMessage: null };
          nextBreakdown = writeBackBreakdownPreviewImage(nextBreakdown, frame.sourceShotId, imageUrl) ?? nextBreakdown;
          if (frame.sourceShotId) {
            useWorkspaceDocument.getState().updateShot(frame.sourceShotId, {
              firstFrameAssetId: imageUrl,
              keyframeStatus: 'review',
              status: 'review',
            });
          }
          updateNodeData(pictureNode.id, {
            status: 'success',
            previewUrl: imageUrl,
            previewUrls: [imageUrl],
            batchCount: 1,
            linkedFrameId: frame.id,
            frameJob: { frameId: frame.id, source: block.id },
            lastResult: { count: 1, urls: [imageUrl], frameId: frame.id },
          });
        } catch (e) {
          nextFrames[i] = { ...frame, status: 'error', errorMessage: String(e) };
        }
      }

      const successCount = nextFrames.filter((f) => f.status === 'success' || f.status === 'locked').length;
      updateNodeData(block.id, {
        status: successCount === nextFrames.length && nextFrames.length > 0 ? 'success' : 'idle',
        scriptBreakdown: nextBreakdown,
        storyboardPreview: {
          ...current,
          frames: nextFrames,
          computedFrameCount: nextFrames.length,
          totalDurationSec,
          confirmed: false,
          confirmedAt: null,
        },
        previewUrls: nextFrames.map((f) => f.imageUrl).filter(Boolean),
        batchCount: nextFrames.length,
        content: `Storyboard Preview · ${nextFrames.length} Images · ${successCount}/${nextFrames.length}`,
      });
      return;
    }

    updateNodeData(block.id, {
      status: frames.length ? 'idle' : 'idle',
      scriptBreakdown: payload,
      storyboardPreview: {
        ...current,
        frames,
        computedFrameCount: frames.length,
        totalDurationSec,
        confirmed: false,
        confirmedAt: null,
      },
      previewUrls: frames.map((f) => f.imageUrl).filter(Boolean),
      batchCount: frames.length,
      content: `Storyboard Preview · ${frames.length} Images · 请连接图像生成节点`,
    });
    return;
  }

  if (kind === 'picture-gen') {
    const characters = useWorkspaceDocument.getState().characters.characters;
    const environments = useWorkspaceDocument.getState().environments;
    const scriptPlan = useWorkspaceDocument.getState().scriptPlan;
    const charCtx = characterContextForBlock(block, upstream.pictures);
    const mentionedChars = parseMentionsFromPrompt(prompt || (d.content as string), characters);
    const allChars = [...charCtx.characters];
    for (const mc of mentionedChars) {
      if (!allChars.some((c) => c.id === mc.id)) allChars.push(mc);
    }
    const enhancedCtx = { ...charCtx, characters: allChars, promptSuffix: enrichPromptWithCharacters('', allChars) };

    const linkedShotId = d.linkedShotId as string | undefined;
    let envPromptSuffix = '';
    let envRefUrl: string | undefined;
    if (linkedShotId && environments?.environments) {
      const shot = useWorkspaceDocument.getState().storyboard.shots.find((s) => s.id === linkedShotId);
      if (shot?.sceneCode) {
        const env = environments.environments.find((e) => e.sceneCode === shot.sceneCode);
        if (env) {
          const { enrichPromptWithEnvironment } = require('@nx9/shared') as typeof import('@nx9/shared');
          envPromptSuffix = enrichPromptWithEnvironment('', env);
          envRefUrl = (env.referenceUrls ?? [])[0] ?? env.referenceImageUrl ?? undefined;
        }
      }
    }

    const jobs = resolvePromptBatch(
      upstream.prompts,
      upstream.pictures,
      upstream.promptBatch,
      prompt,
      upstream.promptDispatch,
    );
    const finalJobs = jobs.length > 0 ? jobs : [{ prompt: prompt || 'a scenic landscape' }];
    const composeAction = upstream.promptDispatch?.composeAction ?? 'generate';
    const modelId = (d.model as string) || 'dall-e-3';
    const { resolveImageRequestSize } = await import('@nx9/shared');
    const quality = (d.quality as string) || 'auto';
    const aspectRatio = (d.aspectRatio as string) || '1:1';
    const imageCount = (d.imageCount as number) || 1;
    const pictureGenMode = (d.pictureGenMode as string) || 'text-to-image';
    const customW = (d.width as number) || 1024;
    const customH = (d.height as number) || 1024;
    const snapToStep = (d.snapToStep as boolean) ?? true;
    const imageStrength = (d.imageStrength as number) || 0.85;
    const styleImageUrl = (d.styleImageUrl as string | undefined)?.trim();
    const multiRefs = Array.isArray(d.referenceImageUrls)
      ? (d.referenceImageUrls as string[]).filter((u) => typeof u === 'string' && u.trim())
      : [];
    const excludedRefs = new Set(
      Array.isArray(d.excludedRefUrls) ? (d.excludedRefUrls as string[]) : [],
    );
    const upstreamPics = (upstream.pictures ?? []).filter((u) => !excludedRefs.has(u));
    const resolvedSize = resolveImageRequestSize({
      quality,
      aspectRatio: aspectRatio === 'custom' ? undefined : aspectRatio,
      width: aspectRatio === 'custom' ? customW : undefined,
      height: aspectRatio === 'custom' ? customH : undefined,
      snapToStep,
    });
    const size = resolvedSize.size;
    const shotRef = linkedShotId
      ? useWorkspaceDocument.getState().storyboard.shots.find((s) => s.id === linkedShotId)
          ?.firstFrameAssetId
      : undefined;
    const nodeRef = (d.referenceImageUrl as string | undefined)?.trim();
    const charRef =
      enhancedCtx.referenceImageUrl ?? upstreamPics[0] ?? envRefUrl ?? shotRef;
    const needsRef =
      pictureGenMode === 'image-to-image' ||
      pictureGenMode === 'multi-ref' ||
      pictureGenMode === 'style-ref' ||
      pictureGenMode === 'upscale-hd';

    const { composePictureProPrompt, lookupPictureProAction } = await import(
      './stage-deck/chrome/attached-workspace/generation/picture/picture-pro-actions'
    );
    const proAction = lookupPictureProAction(d.pictureProAction as string | undefined);

    const urls: string[] = [];
    let lastPrompt = '';

    const { runPictureGenJob } = await import('./picture-gen-runner');

    if (pictureGenMode === 'upscale-hd') {
      const refImage = nodeRef || charRef || multiRefs[0] || upstreamPics[0];
      if (!refImage) throw new Error('图片高清需要参考图：请上传或连接上游');
      const batchUrls = await runPictureGenJob({
        prompt: 'upscale',
        referenceImageUrl: refImage,
        mode: 'upscale-hd',
        upscaleScale: (d.resolutionTier as string) === '4k' ? 4 : 2,
      });
      urls.push(...batchUrls);
      lastPrompt = '图片高清';
    } else {
      for (const job of finalJobs) {
        let finalPrompt = enrichPromptWithCharacters(job.prompt, enhancedCtx.characters);
        if (envPromptSuffix) finalPrompt = `${finalPrompt}\n${envPromptSuffix}`;
        finalPrompt = composePictureProPrompt(finalPrompt, proAction);
        const neg = (d.negativePrompt as string | undefined)?.trim();
        if (neg) finalPrompt = `${finalPrompt}\n\nNegative: ${neg}`;
        lastPrompt = finalPrompt;
        let refImage =
          job.imageUrls?.[0] || nodeRef || charRef || multiRefs[0] || styleImageUrl;

        if (job.imageUrls && job.imageUrls.length >= 2) {
          if (composeAction === 'merge' || composeAction === 'merge-then-generate') {
            const merged = await api.mergeImages({
              imageUrls: job.imageUrls,
              direction: 'horizontal',
            });
            if (composeAction === 'merge') {
              urls.push(merged.url);
              continue;
            }
            refImage = merged.url;
            finalPrompt = `${finalPrompt}\n\n[Reference collage attached]`;
          }
        }

        if (
          !job.imageUrls?.length &&
          pictureGenMode === 'multi-ref' &&
          multiRefs.length + (nodeRef ? 1 : 0) >= 2
        ) {
          const collageSrc = [nodeRef, ...multiRefs].filter(Boolean) as string[];
          try {
            const merged = await api.mergeImages({
              imageUrls: collageSrc.slice(0, 4),
              direction: 'horizontal',
            });
            refImage = merged.url;
            finalPrompt = `${finalPrompt}\n\n[Multi-reference collage: ${collageSrc.length} images]`;
          } catch {
            /* keep single ref */
          }
        }

        if (needsRef && !refImage) {
          throw new Error('当前模式需要参考图：请上传主体参考，或连接上游图片');
        }

        const batchUrls = await runPictureGenJob({
          prompt: finalPrompt,
          modelId,
          size,
          referenceImageUrl: refImage,
          referenceImageUrls: multiRefs,
          styleImageUrl,
          strength: imageStrength,
          n: imageCount,
          mode: pictureGenMode === 'panorama-720' ? 'panorama-720' : 'standard',
          negativePrompt: d.negativePrompt as string | undefined,
          seed: d.seed as number | undefined,
        });
        urls.push(...batchUrls);
      }
    }
    if (urls.length === 0) throw new Error('图像生成失败');

    const linkedPicShot = linkedShotForBlock(block.id, d);
    if (linkedPicShot && urls[0]) {
      useWorkspaceDocument.getState().updateShot(linkedPicShot.id, {
        firstFrameAssetId: urls[0],
        keyframeStatus: 'review',
        status: 'review',
      });
    }

    updateNodeData(block.id, {
      status: 'success',
      previewUrls: urls,
      previewUrl: urls[0],
      content: lastPrompt,
      batchCount: urls.length,
      characterInjected: enhancedCtx.characters.map((c) => c.id),
      lastResult: { count: urls.length, urls },
      ...(pictureGenMode === 'panorama-720'
        ? {
            panoramaUrl: urls[0],
            panoramaProjection: 'equirectangular',
            aspectRatio: '2:1',
          }
        : {}),
    });
    return;
  }

  if (kind === 'clip-gen') {
    const videoMode = (d.videoMode as string) ?? 'single';
    const charCtx = characterContextForBlock(block, upstream.pictures);
    const breakdown = upstream.scriptBreakdowns?.[0];
    const breakdownShots = flattenScriptBreakdownShots(breakdown);
    const confirmedPreview =
      (d.storyboardPreview as import('@nx9/shared').StoryboardPreviewPayload | undefined)?.confirmed;

    // Bridge 续拍：抽尾帧再作为图生视频参考
    if (videoMode === 'bridge' && (upstream.clips?.[0] || (d.sourceClipUrl as string))) {
      const clipUrl = (upstream.clips?.[0] || (d.sourceClipUrl as string)) as string;
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
        // 继续走单镜出片，以尾帧为 imageUrl
        const finalPrompt = enrichPromptWithCharacters(continuationPrompt, charCtx.characters);
        const modelId = (d.model as string) || 'veo';
        const videoParams = resolveVideoGenParams({
          resolution: d.resolution as string | undefined,
          orientation: d.orientation as string | undefined,
          aspect: d.aspect as string | undefined,
          durationSec: d.durationSec as number | undefined,
        });
        const res = (await api.proxyVideo({
          prompt: finalPrompt,
          model: modelId,
          imageUrl: endFrameUrl,
          duration: videoParams.durationSec,
          aspect_ratio: videoParams.aspect,
          size: videoParams.size,
          resolution: videoParams.resolution,
          generateAudio: (d.generateAudio as boolean | undefined) ?? false,
        })) as { ok?: boolean; url?: string; status?: string; taskId?: string; message?: string };
        let videoUrl = res.url;
        if (!videoUrl && res.taskId && (res.status === 'processing' || res.status === 'queued')) {
          videoUrl = await pollVideoUntilDone(res.taskId);
        }
        updateNodeData(block.id, {
          status: videoUrl ? 'success' : 'error',
          videoUrl,
          endFrameUrl,
          continuationPrompt,
          content: finalPrompt,
          error: videoUrl ? undefined : (res.message ?? 'Bridge 续拍失败'),
        });
        return;
      }
    }

    // chain/motion 已下线假批出：旧节点回退为单镜逻辑（下方）

    // 多镜 + 多参考图：按镜批量图生视频（真实出片）
    if (breakdownShots.length > 1 && upstream.pictures.length > 1) {
      const videoParams = resolveVideoGenParams({
        resolution: d.resolution as string | undefined,
        orientation: d.orientation as string | undefined,
        aspect: d.aspect as string | undefined,
        durationSec: d.durationSec as number | undefined,
      });
      const clips: string[] = [];
      const count = Math.min(breakdownShots.length, upstream.pictures.length);
      for (let i = 0; i < count; i++) {
        const shot = breakdownShots[i];
        const imageUrl = upstream.pictures[i];
        const modelId = (d.model as string) || 'veo';
        if (modelId.startsWith('grok-imagine-video') && !imageUrl) {
          throw new Error('Grok Imagine 当前需要首图，请先连接图像生成节点或使用分镜预览生成首图');
        }
        const finalPrompt = enrichPromptWithCharacters(
          shot.videoPrompt || shot.imagePrompt || prompt || 'cinematic scene',
          charCtx.characters,
        );
        const res = (await api.proxyVideo({
          prompt: finalPrompt,
          model: modelId,
          imageUrl,
          duration: shot.durationSec || videoParams.durationSec,
          aspect_ratio: videoParams.aspect,
          size: videoParams.size,
          resolution: videoParams.resolution,
          generateAudio: (d.generateAudio as boolean | undefined) ?? false,
        })) as { ok?: boolean; url?: string; status?: string; taskId?: string; message?: string };
        let videoUrl = res.url;
        if (!videoUrl && res.taskId && (res.status === 'processing' || res.status === 'queued')) {
          videoUrl = await pollVideoUntilDone(res.taskId);
        }
        if (!videoUrl) throw new Error(res.message ?? `镜头 ${i + 1} 视频生成失败`);
        clips.push(videoUrl);
        // 写回故事板 SSOT
        const boardShot = useWorkspaceDocument.getState().storyboard.shots.find(
          (s) => s.id === shot.id || s.index === i,
        );
        if (boardShot) {
          useWorkspaceDocument.getState().updateShot(boardShot.id, {
            videoAssetId: videoUrl,
            videoStatus: 'review',
            status: 'review',
          });
        }
      }
      updateNodeData(block.id, {
        status: 'success',
        videoUrl: clips[0],
        videoUrls: clips,
        batchCount: clips.length,
        content: breakdown?.title ?? prompt,
        characterInjected: charCtx.characters.map((c) => c.id),
        lastResult: { count: clips.length, urls: clips, confirmedPreview },
      });
      return;
    }

    const finalPrompt = enrichPromptWithCharacters(
      breakdownShots[0]?.videoPrompt || prompt || 'cinematic scene',
      charCtx.characters,
    );
    const imageUrl = upstream.pictures[0] ?? charCtx.referenceImageUrl;
    const modelId = (d.model as string) || 'veo';
    if (modelId.startsWith('grok-imagine-video') && !imageUrl) {
      throw new Error('Grok Imagine 当前需要首图，请先连接图像生成节点或上传参考图');
    }
    const videoParams = resolveVideoGenParams({
      resolution: d.resolution as string | undefined,
      orientation: d.orientation as string | undefined,
      aspect: d.aspect as string | undefined,
      durationSec: d.durationSec as number | undefined,
    });
    const res = (await api.proxyVideo({
      prompt: finalPrompt,
      model: modelId,
      imageUrl,
      duration: videoParams.durationSec,
      aspect_ratio: videoParams.aspect,
      size: videoParams.size,
      resolution: videoParams.resolution,
      generateAudio: (d.generateAudio as boolean | undefined) ?? false,
    })) as { ok?: boolean; url?: string; status?: string; taskId?: string; message?: string };
    let videoUrl = res.url;
    if (!videoUrl && res.taskId && (res.status === 'processing' || res.status === 'queued')) {
      videoUrl = await pollVideoUntilDone(res.taskId);
    }
    updateNodeData(block.id, {
      status: videoUrl ? 'success' : 'error',
      videoUrl,
      taskId: res.taskId,
      content: finalPrompt,
      characterInjected: charCtx.characters.map((c) => c.id),
      lastResult: res,
      error: videoUrl ? undefined : res.message ?? '视频生成未完成或失败',
    });
    if (!videoUrl) throw new Error(res.message ?? '视频生成失败');
    // 单镜绑定写回
    const linkedClipShot = linkedShotForBlock(block.id, d);
    if (linkedClipShot) {
      useWorkspaceDocument.getState().updateShot(linkedClipShot.id, {
        videoAssetId: videoUrl,
        videoStatus: 'review',
        status: 'review',
      });
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
    const text = prompt || (d.content as string) || '';
    if (!text.trim()) throw new Error('配音文本为空');
    const provider = (d.provider as string) || 'cloud';
    const referenceAudioUrl = (d.referenceAudioUrl as string) || '';
    const res = await api.proxyTts({
      input: text,
      voice:
        provider === 'luxtts' && referenceAudioUrl
          ? `luxtts:${referenceAudioUrl}`
          : (d.voice as string) || 'alloy',
      useLuxTts: provider === 'luxtts',
      referenceAudioUrl: provider === 'luxtts' ? referenceAudioUrl : undefined,
      luxTtsProfileId: (d.characterId as string) || undefined,
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
      syncStyleToPictureGen,
      openReviewAfterDirectorBatch,
    } = await import('./director-desk-runner');
    const pictureNode =
      ctx?.nodes && ctx?.edges
        ? findDirectorPictureGenNode(block.id, ctx.nodes, ctx.edges)
        : undefined;
    const filter = (d.queueFilter as 'missing' | 'failed' | 'selected' | 'all') ?? 'missing';
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
      filter,
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
      openReviewAfterDirectorBatch({
        deskBlockId: block.id,
        nodes: ctx.nodes,
        edges: ctx.edges,
        updateNodeData,
        succeededShotIds: summary.results.filter((r) => r.ok).map((r) => r.shotId),
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
      currentIndex: idx,
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
    const editorMode = (d.editorMode as string) ?? 'concat';
    if (editorMode === 'audio') {
      const tracks = upstream.sounds ?? [];
      if (tracks.length < 2) throw new Error('至少需要 2 条音频');
      const mixRes = await api.mixAudio(tracks, (d.normalize as boolean | undefined) ?? true);
      if (!mixRes.ok || !mixRes.url) throw new Error(mixRes.message ?? '混音失败');
      updateNodeData(block.id, {
        status: 'success',
        outputSound: mixRes.url,
        sounds: [mixRes.url],
        meta: { trackCount: mixRes.trackCount },
      });
      return;
    }
    if (editorMode === 'grade') {
      const source = upstream.clips?.[0] ?? upstream.pictures?.[0];
      if (!source) throw new Error('需要上游图像或视频');
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
      });
      return;
    }
    const clips = [...upstream.clips, ...((d.extraClips as string[]) ?? [])].filter(Boolean);
    if (clips.length === 0) throw new Error('缺少视频片段');
    const transition = (d.transition as string) ?? 'none';
    const res = await api.concatClips(clips, (d.title as string) || '画布剪辑', transition === 'none' ? undefined : transition);
    if (!res.ok || !res.url) throw new Error(res.message ?? '剪辑失败');
    updateNodeData(block.id, {
      status: 'success',
      videoUrl: res.url,
      outputUrl: res.url,
      clipCount: clips.length,
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

  if (kind === 'character-sheet') {
    const sheet = characterSheetFromNodeData(d);
    const out = syncCharacterSheetNodeOutput(sheet);
    updateNodeData(block.id, {
      status: 'success',
      ...out,
      characterId: d.characterId,
    });
    return;
  }

  if (kind === 'inpaint-edit') {
    const img = upstream.pictures?.[0] || (d.imageUrl as string);
    const mask = (d.maskUrl as string) || '';
    const inpaintPrompt = prompt || (d.content as string) || '';
    if (!img) throw new Error('局部重绘：需要上游图片');
    if (!inpaintPrompt.trim()) throw new Error('局部重绘：请输入 prompt');
    const res = (await api.proxyFal({
      model: 'fal-ai/fast-sdxl/inpainting',
      input: { image_url: img, mask_url: mask || undefined, prompt: inpaintPrompt.trim() },
    })) as { ok?: boolean; url?: string };
    if (!res.url) throw new Error('重绘失败');
    updateNodeData(block.id, { status: 'success', previewUrl: res.url, output: res.url });
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

  if (kind === 'seedance-chain') {
    const linkedIds = (d.linkedShotIds as string[]) ?? [];
    const allShots = useWorkspaceDocument.getState().storyboard.shots;
    const targetShots = linkedIds.length > 0
      ? allShots.filter((s) => linkedIds.includes(s.id)).sort((a, b) => a.index - b.index)
      : allShots.filter((s) => s.videoPromptEn).sort((a, b) => a.index - b.index);
    if (targetShots.length === 0) throw new Error('Seedance Chain：无可处理的镜头');
    const projectGoal = (d.projectGoal as string) || '';
    const chain = shotsToClipChain(targetShots, projectGoal);
    updateNodeData(block.id, {
      status: 'success',
      clipChain: chain,
      clipCount: chain.items.length,
      content: chain.items.map((it: { label?: string; prompt?: string }) => `${it.label}: ${it.prompt}`).join('\n'),
      output: chain.items.map((it: { label?: string; prompt?: string }) => `${it.label}: ${it.prompt}`).join('\n'),
    });
    return;
  }

  if (kind === 'caption-asr') {
    const captionMode = (d.captionMode as string) ?? 'asr';
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
    const lines = (d.lines as { speaker: string; text: string; emotion?: string }[]) ?? [];
    const profileMap = (d.profileMap as Record<string, string>) ?? {};
    const results: { speaker: string; text: string; audioUrl?: string; error?: string }[] = [];
    for (const line of lines) {
      try {
        const voiceId = profileMap[line.speaker] ?? 'alloy';
        const res = (await api.proxyTts({ input: line.text, voice: voiceId })) as {
          ok?: boolean; url?: string;
        };
        results.push({ speaker: line.speaker, text: line.text, audioUrl: res.url });
      } catch (e) {
        results.push({ speaker: line.speaker, text: line.text, error: String(e) });
      }
    }
    const audioUrls = results.map((r) => r.audioUrl).filter(Boolean) as string[];
    updateNodeData(block.id, {
      status: audioUrls.length > 0 ? 'success' : 'error',
      results,
      sounds: audioUrls,
      meta: { total: results.length, failed: results.filter((r) => r.error).length },
    });
    return;
  }

  if (kind === 'scene-card') {
    const sceneName = (d.sceneName as string) ?? '';
    const description = (d.description as string) ?? '';
    const era = (d.era as string) ?? '';
    const lighting = (d.lighting as string) ?? '';
    const props = (d.props as string[]) ?? [];
    const referenceUrls = (d.referenceUrls as string[]) ?? [];
    const compiledPrompt = [sceneName, description, era, lighting, ...props, ...referenceUrls]
      .filter(Boolean)
      .join(' | ');
    updateNodeData(block.id, {
      status: 'success',
      content: compiledPrompt,
      output: compiledPrompt,
      meta: { sceneName, description, era, lighting, props, referenceUrls },
      pictures: referenceUrls.length ? referenceUrls : undefined,
    });
    return;
  }

  if (kind === 'continuity-check') {
    const images = upstream.pictures ?? [];
    if (images.length < 2) throw new Error('至少需要 2 张上游图像');
    const res = await api.proxyLlm({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            '你是分镜 continuity supervisor。对比多张镜头静帧，列出服装、光影、轴线不一致之处。输出 JSON: {"summary":"...","issues":["..."]}',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `检查 ${images.length} 个镜头` },
            ...images.slice(0, 4).map((url) => ({ type: 'image_url', image_url: { url } })),
          ],
        },
      ],
    });
    const raw = (res as { content?: string }).content ?? JSON.stringify(res);
    updateNodeData(block.id, {
      status: 'success',
      continuityReport: raw,
      content: raw,
    });
    return;
  }

  if (kind === 'export-pack') {
    const shots = activeEpisodeShots(useWorkspaceDocument.getState().storyboard);
    const { runExportPack } = await import('./export-pack-runner');
    const mode = (d.exportMode as string) || 'zip';
    const prefix = (d.exportPrefix as string) || 'nx9-shot';
    const audioUrl = (d.episodeAudioUrl as string) || '';
    try {
      const res = await runExportPack({
        mode: mode as 'zip' | 'ffmpeg-episode' | 'hyperframes-episode' | 'remotion-bundle',
        prefix,
        audioUrl,
        pictures: upstream.pictures ?? [],
        clips: upstream.clips ?? [],
        sounds: upstream.sounds ?? [],
        prompts: upstream.prompts ?? [],
        shots,
      });
      updateNodeData(block.id, {
        status: 'success',
        exportReady: true,
        episodeUrl: res.url,
        exportCount: res.exportCount ?? 0,
        message: res.message,
      });
    } catch (e) {
      updateNodeData(block.id, { status: 'error', error: String(e), exportReady: false });
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

  if (kind === 'review-gate') {
    const shots = activeEpisodeShots(useWorkspaceDocument.getState().storyboard);
    if (shots.length === 0) throw new Error('故事板无镜头');
    const gateMode = d.gateMode === 'video' ? 'video' : 'keyframe';
    const res = await api.checkReviewGate(shots, gateMode);
    if (!res.ok) {
      updateNodeData(block.id, {
        status: 'blocked',
        gatePassed: false,
        pendingShots: res.pending,
        meta: { pending: res.pending, gateMode },
      });
      throw new ReviewGateBlockedError(res.pending);
    }
    updateNodeData(block.id, {
      status: 'success',
      gatePassed: true,
      pendingShots: [],
      meta: { gatePassed: true, gateMode },
      upstream,
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

  if (kind === 'motion-story') {
    let chain = (d.clipChain as ClipChainState) ?? emptyClipChain();
    const projectGoal =
      (d.projectGoal as string) || useWorkspaceDocument.getState().storyboard.title || '';
    if (chain.items.length === 0) {
      const allShots = useWorkspaceDocument.getState().storyboard.shots;
      if (allShots.length === 0) throw new Error('故事板无镜头');
      const linkedShotId = d.linkedShotId as string | undefined;
      const shots = linkedShotId ? allShots.filter((s) => s.id === linkedShotId) : allShots;
      if (shots.length === 0) throw new Error('未找到绑定的镜头');
      chain = shotsToClipChain(shots, projectGoal);
    }
    const finalChain = await runClipChain(
      chain,
      projectGoal,
      (next) => updateNodeData(block.id, { clipChain: next, projectGoal }),
      (item, url) => {
        if (item.shotId) {
          useWorkspaceDocument.getState().updateShot(item.shotId, {
            videoAssetId: url,
            videoStatus: 'review',
          });
        }
      },
      () => {},
    );
    const lastVideo = [...finalChain.items].reverse().find((i) => i.videoUrl)?.videoUrl;
    updateNodeData(block.id, {
      status: 'success',
      clipChain: finalChain,
      videoUrl: lastVideo,
    });
    return;
  }

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

  if (kind === 'music-gen') {
    throw new Error('BGM 功能开发中，需接入 Suno/Udio 等专用音乐 API 后可用');
  }

  if (kind === 'lipsync-pass') {
    throw new Error('口型同步功能已弃用，需部署 Wav2Lip / LivePortrait 等模型后方可用');
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

async function runLayerConcurrent(
  ids: string[],
  runOne: (id: string) => Promise<void>,
  signal?: { cancelled: boolean },
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
  signal?: { cancelled: boolean },
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
          const upstream = gatherUpstream(id, [...blockMap.values()], links);
          await executeBlock(
            block,
            upstream,
            (nodeId, data) => {
              const b = blockMap.get(nodeId);
              if (b) b.data = { ...b.data, ...data };
              updateNodeData(nodeId, data);
            },
            { nodes, edges },
          );
          completedIds.add(id);
        } catch (e) {
          errors.push({
            id,
            error: e,
            blocked: e instanceof ReviewGateBlockedError,
          });
        }
      },
      signal,
    );

    if (errors.length > 0) {
      const first = errors[0];
      if (first.blocked && first.error instanceof ReviewGateBlockedError) {
        onProgress({
          phase: 'blocked',
          current: completed + 1,
          total,
          currentId: first.id,
          error: first.error.message,
          pendingShots: first.error.pending,
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
