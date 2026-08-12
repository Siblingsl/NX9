/**
 * picture-gen 唯一执行实现（PG-01 收敛）。
 *
 * flow-runner 的 `kind === 'picture-gen'` 分支委托到这里；
 * 本文件同时承担：
 * - F-017 构图强约束 / F-024 @block 引用 / F-032 参考板约束
 * - 角色 / 环境 / 素材 @Mention prompt enrich
 * - OL-01/OL-03 出图 `usedAssetIds` + 角色 revision pin 回流
 * - PG-05 Negative 按 provider 注入（fal 走参数，其余拼文本，不重复）
 * - PG-07 多参考策略（gemini/openai 原生多图；fal 拼贴）
 * - PG-08 全景不写镜头 firstFrame
 * - PG-04 AbortSignal 透传
 * - PG-13 批量部分成功保留 / PG-14 参考图限额 / PG-15 style-ref 模型校验
 * - PG-17 异步超时可恢复 / PG-19 生成历史 / PG-21 逐条进度 / PG-22 风格-only 注记
 * - PG-25 content 不被 enrich 覆盖 / PG-26 发送参考与模式同源 / PG-28 taskId 即时落盘
 */
import {
  enrichPromptWithCharacters,
  enrichPromptWithAssetMentions,
  enrichPromptWithEnvironment,
  buildCharacterContext,
  buildDirectorCharacterPlacementPrompt,
  parseMentionsFromPrompt,
  resolvePromptBatch,
  resolveImageRequestSize,
  resolvePictureModelForRequest,
  extractReferenceConstraints,
  buildConstrainedPrompt,
  BUILTIN_COMPOSITION_TEMPLATES,
  resolveCompositionTemplate,
  resolveMentionsForPrompt,
  characterToItem,
  workspaceItemToAsset,
  soundToItem,
  templateToAsset,
  BUILTIN_BACKLOT_TEMPLATES,
  collectUsedAssetIds,
  readChainStoryboard,
  type MentionRef,
  type StoryboardShot,
} from '@nx9/shared';
import { api } from '../../api/client';
import { runPictureGenJob } from '../picture-gen-runner';
import { VideoPollTimeoutError } from '../poll-task';
import { packPictureRefs, resolvePictureSendRefs } from '../picture-gen-refs';
import {
  archivePictureGeneration,
  readPictureGenerationHistory,
} from '../picture-gen-history';
import {
  buildPictureGenSuccessPatch,
  writePictureShotPatch,
} from '../picture-gen-commit';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { useFlowRuntime } from '../../stores/flow-runtime';
import { findChainShot, findChainShotByBlockId } from '../chain-storyboard-aggregate';
import {
  composePictureProPrompt,
  lookupPictureProAction,
  isPictureMultiPromptAction,
  filledMultiPrompts,
} from '../stage-deck/chrome/attached-workspace/generation/picture/picture-pro-actions';
import { MAX_PICTURE_UPLOAD_REFS } from '../stage-deck/chrome/attached-workspace/generation/picture/picture-gen-modes';
import {
  resolveLocalMediaMentionUrls,
  rewriteLocalMediaMentionsForApi,
} from '../stage-deck/chrome/asset-mention/local-media-mention';
import type {
  BlockExecutorContext,
  ExecutorGraphEdge,
  ExecutorGraphNode,
} from './types';

function runtimeGraphNodes(): ExecutorGraphNode[] {
  return (
    (useFlowRuntime.getState().runtime?.getNodes() as ExecutorGraphNode[] | undefined) ?? []
  );
}

/** F-003/F-004: 链优先查找绑定镜头（上游入边链 → 全图聚合，不回退全局） */
function linkedShotForBlock(
  blockId: string,
  data: Record<string, unknown>,
  nodes?: ExecutorGraphNode[],
  edges?: ExecutorGraphEdge[],
): StoryboardShot | undefined {
  const linkedShotId = data.linkedShotId as string | undefined;
  if (nodes && edges) {
    const incoming = edges.filter((e) => e.target === blockId);
    for (const edge of incoming) {
      const src = nodes.find((n) => n.id === edge.source);
      if (!src) continue;
      const chain = readChainStoryboard((src.data ?? {}) as Record<string, unknown>);
      if (chain?.shots) {
        const hit = chain.shots.find(
          (s) => s.id === linkedShotId || s.linkedBlockId === blockId,
        );
        if (hit) return hit;
      }
    }
  }
  const graph = nodes && nodes.length > 0 ? nodes : runtimeGraphNodes();
  if (linkedShotId) return findChainShot(linkedShotId, graph) ?? undefined;
  return findChainShotByBlockId(blockId, graph) ?? undefined;
}

/**
 * F-017: 查找上游分镜台是否开启构图强约束（可隔节点递归）。
 */
function upstreamDeskEnforcesComposition(
  blockId: string,
  nodes?: ExecutorGraphNode[],
  edges?: ExecutorGraphEdge[],
  seen = new Set<string>(),
): boolean {
  if (!nodes || !edges || seen.has(blockId)) return false;
  seen.add(blockId);
  const incoming = edges.filter((e) => e.target === blockId);
  for (const edge of incoming) {
    const src = nodes.find((n) => n.id === edge.source);
    if (!src) continue;
    if ((src.data as Record<string, unknown>)?.enforceComposition === true) return true;
    if (upstreamDeskEnforcesComposition(src.id, nodes, edges, seen)) return true;
  }
  return false;
}

function assetLibraryItemsForPrompt() {
  const doc = useWorkspaceDocument.getState();
  const privateItems = [
    ...doc.characters.characters.map((c) => characterToItem(c, 'private')),
    ...doc.soundLibrary.sounds.map((s) => soundToItem(s, 'private')),
    ...doc.backlotWorkspace.items.map((i) => workspaceItemToAsset(i, 'private')),
  ];
  const publicItems = BUILTIN_BACKLOT_TEMPLATES.map((tpl) =>
    templateToAsset(tpl as never, 'public', true),
  );
  return { privateItems, publicItems };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('已取消');
}

function isPictureAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'AbortError') return true;
  if (!(e instanceof Error)) return false;
  return (
    e.message === '已取消' ||
    e.message === '任务已取消' ||
    e.message === '轮询已中止' ||
    e.name === 'AbortError'
  );
}

export async function runPictureGenExecutor(ctx: BlockExecutorContext): Promise<void> {
  const { block, prompt, upstream, updateNodeData, nodes, edges, abortSignal } = ctx;
  const d = block.data ?? {};
  const doc = useWorkspaceDocument.getState();
  const characters = doc.characters.characters;
  const environments = doc.environments;

  // ── 角色上下文：绑定镜头 + @提及角色合并 ──
  const linkedShot = linkedShotForBlock(block.id, d, nodes, edges);
  const charCtx = buildCharacterContext(d, linkedShot, characters, upstream.pictures);
  const mentionedChars = parseMentionsFromPrompt(prompt || (d.content as string), characters);
  const allChars = [...charCtx.characters];
  for (const mc of mentionedChars) {
    if (!allChars.some((c) => c.id === mc.id)) allChars.push(mc);
  }
  const enhancedCtx = { ...charCtx, characters: allChars };

  // ── 环境（场景圣经）注入 ──
  let envPromptSuffix = '';
  let envRefUrl: string | undefined;
  if (linkedShot && environments?.environments) {
    const env = environments.environments.find(
      (e) =>
        (linkedShot.sceneCode && e.sceneCode === linkedShot.sceneCode) ||
        (linkedShot.sceneAssetId && e.id === linkedShot.sceneAssetId),
    );
    if (env) {
      envPromptSuffix = enrichPromptWithEnvironment('', env);
      envRefUrl = (env.referenceUrls ?? [])[0] ?? env.referenceImageUrl ?? undefined;
    }
  }
  const cameraSuffix = linkedShot?.director3dGuide?.cameraPrompt?.trim()
    ? `3D camera direction: ${linkedShot.director3dGuide.cameraPrompt.trim()}`
    : '';
  const placementSuffix = buildDirectorCharacterPlacementPrompt(linkedShot?.director3dGuide);
  const reviewSuffix = linkedShot?.keyframeReviewNote?.trim()
    ? `Revision request from storyboard review: ${linkedShot.keyframeReviewNote.trim()}`
    : '';

  // ── F-024: @block-id 引用解析 ──
  const blockMentionRefs: MentionRef[] = [];
  upstream.pictures.forEach((url, i) =>
    blockMentionRefs.push({ id: `pic-${i}`, kind: 'picture', url, label: `图 ${i + 1}` }),
  );
  upstream.clips.forEach((url, i) =>
    blockMentionRefs.push({ id: `clip-${i}`, kind: 'clip', url, label: `视频 ${i + 1}` }),
  );
  (upstream.sounds ?? []).forEach((url, i) =>
    blockMentionRefs.push({ id: `sound-${i}`, kind: 'sound', url, label: `音频 ${i + 1}` }),
  );

  const jobs = resolvePromptBatch(
    upstream.prompts ?? [],
    upstream.pictures,
    upstream.promptBatch ?? [],
    prompt,
    upstream.promptDispatch,
  );
  for (const job of jobs) {
    const resolved = resolveMentionsForPrompt(job.prompt, blockMentionRefs);
    job.prompt = resolved.resolved;
  }
  let finalJobs = jobs.length > 0 ? jobs : [{ prompt: prompt || 'a scenic landscape' }];
  const multiPromptRun = isPictureMultiPromptAction(d.pictureProAction as string | undefined);
  if (multiPromptRun) {
    const filled = filledMultiPrompts(d.multiPrompts);
    if (filled.length === 0) throw new Error('请至少填写一条多图提示词');
    finalJobs = filled.map((p) => ({ prompt: p }));
  }
  const composeAction = upstream.promptDispatch?.composeAction ?? 'generate';

  // ── F-017/F-032: 参考板约束 ──
  const referenceConstraint = (() => {
    if (!nodes || !edges) return extractReferenceConstraints(d);
    const incoming = edges.filter((e) => e.target === block.id);
    for (const edge of incoming) {
      const src = nodes.find((n) => n.id === edge.source && n.type === 'reference-board');
      if (!src) continue;
      const c = extractReferenceConstraints((src.data ?? {}) as Record<string, unknown>);
      if (c) return c;
    }
    return extractReferenceConstraints(d);
  })();

  // ── 参数解析 ──
  let modelId = (d.model as string) || 'gemini-2.5-flash-image';
  const quality = (d.quality as string) || 'auto';
  const aspectRatio = (d.aspectRatio as string) || '1:1';
  const imageCount = (d.imageCount as number) || 1;
  const customW = (d.width as number) || 1024;
  const customH = (d.height as number) || 1024;
  const snapToStep = (d.snapToStep as boolean) ?? true;
  const imageStrength = (d.imageStrength as number) || 0.85;
  const resolutionTier = ((d.resolutionTier as string) || '').trim() || undefined;
  const styleImageUrl = (d.styleImageUrl as string | undefined)?.trim();
  const multiRefs = Array.isArray(d.referenceImageUrls)
    ? (d.referenceImageUrls as string[]).filter((u) => typeof u === 'string' && u.trim())
    : [];
  const excludedRefs = new Set(
    Array.isArray(d.excludedRefUrls) ? (d.excludedRefUrls as string[]) : [],
  );
  const upstreamPics = (upstream.pictures ?? []).filter((u) => !excludedRefs.has(u));
  const nodeRef = (d.referenceImageUrl as string | undefined)?.trim();
  const existingGenerated = Array.isArray(d.previewUrls)
    ? (d.previewUrls as string[]).filter((u) => typeof u === 'string' && u.trim())
    : d.previewUrl
      ? [String(d.previewUrl)]
      : [];
  const mentionedMediaUrls = resolveLocalMediaMentionUrls(
    prompt,
    existingGenerated,
    upstreamPics,
  );
  // PG-26：角色定妆 / 场景图可注入并升模式；镜头已有 firstFrame 永不静默当主参考
  const characterRefUrl = enhancedCtx.referenceImageUrl?.trim() || undefined;
  const baseSend = resolvePictureSendRefs({
    data: d,
    nodeRef,
    multiRefs,
    styleImageUrl,
    upstreamPics,
    mentionRefs: mentionedMediaUrls,
    characterRef: characterRefUrl,
    envRef: envRefUrl,
  });
  let pictureGenMode = baseSend.mode;

  // 纯文生图 / 全景时，图生图专用 fal 模型自动换成可文生的模型
  if (pictureGenMode === 'text-to-image' || pictureGenMode === 'panorama-720') {
    const def = resolvePictureModelForRequest(modelId);
    if (def.provider === 'fal' && def.supportsReference) {
      modelId = 'flux-dev';
    }
  }
  // PG-15: style-ref 需要同时吃主体+风格，fal 单图端点不够 → 切 Gemini
  // 图生图 / 多参考：fal 文生图端点吃不到参考图时同样切换
  const needsImageModel =
    pictureGenMode === 'style-ref' ||
    pictureGenMode === 'image-to-image' ||
    pictureGenMode === 'multi-ref';
  if (needsImageModel) {
    const def = resolvePictureModelForRequest(modelId);
    if (def.provider === 'fal' && (pictureGenMode === 'style-ref' || !def.supportsReference)) {
      modelId = 'gemini-2.5-flash-image';
    }
  }
  const modelDef = resolvePictureModelForRequest(modelId);
  // PG-05: fal 走 negative_prompt 参数；其余 provider 拼文本，二者不重复
  const negativeViaParam = modelDef.provider === 'fal';
  // PG-07: gemini/openai 原生支持多参考，fal 需拼贴成单图
  const nativeMultiRef = modelDef.provider === 'gemini' || modelDef.provider === 'openai';

  const resolvedSize = resolveImageRequestSize({
    quality,
    aspectRatio: aspectRatio === 'custom' ? undefined : aspectRatio,
    width: aspectRatio === 'custom' ? customW : undefined,
    height: aspectRatio === 'custom' ? customH : undefined,
    snapToStep,
  });
  const size = resolvedSize.size;

  const proAction = lookupPictureProAction(d.pictureProAction as string | undefined);

  // ── F-017/F-032: 约束注入 + enforce 检查 ──
  if (referenceConstraint) {
    for (let i = 0; i < finalJobs.length; i++) {
      const job = finalJobs[i];
      const checked = buildConstrainedPrompt(job.prompt, referenceConstraint, undefined);
      if (checked.blocked) {
        throw new Error(`参考板约束阻塞：${checked.reason ?? '未通过约束检查'}`);
      }
      if (checked.prompt !== job.prompt) {
        finalJobs[i] = { ...job, prompt: checked.prompt };
      }
    }
  }

  const compositionTemplate = linkedShot
    ? resolveCompositionTemplate(linkedShot, BUILTIN_COMPOSITION_TEMPLATES)
    : undefined;

  // F-017: 上游分镜台开启强约束且无构图模板 → 阻断
  if (upstreamDeskEnforcesComposition(block.id, nodes, edges) && !compositionTemplate) {
    throw new Error(
      '构图强约束：上游分镜台已开启强约束，但未指定构图模板，出图被阻断。请在分镜台为当前镜头选择构图模板。',
    );
  }

  const urls: string[] = [];
  const failures: { index: number; error: string }[] = [];
  const pendingImageTasks: { taskId: string; prompt?: string }[] = [];
  let lastPrompt = '';
  let truncatedRefsTotal = 0;
  let lastInjectedRefs = baseSend.injected;
  let modelFallbackNote: string | undefined;
  if (needsImageModel && (d.model as string | undefined) && (d.model as string) !== modelId) {
    modelFallbackNote = `当前模型不支持参考图，已切换为 ${modelId}`;
  }

  const reportBatchProgress = (done: number, total: number) => {
    updateNodeData(block.id, {
      status: 'running',
      batchProgress: { done, total },
    });
  };

  if (pictureGenMode === 'upscale-hd') {
    const refImage =
      mentionedMediaUrls[0] || nodeRef || multiRefs[0] || upstreamPics[0] || characterRefUrl;
    if (!refImage) throw new Error('图片放大需要参考图：请上传或连接上游');
    try {
      const batchUrls = await runPictureGenJob({
        prompt: 'upscale',
        referenceImageUrl: refImage,
        mode: 'upscale-hd',
        upscaleScale: resolutionTier === '4k' ? 4 : 2,
        signal: abortSignal,
      });
      urls.push(...batchUrls);
    } catch (e) {
      if (isPictureAbortError(e) || abortSignal?.aborted) throw e;
      throw e;
    }
    lastPrompt = '图片放大';
  } else {
    const { privateItems, publicItems } = assetLibraryItemsForPrompt();
    const totalJobs = finalJobs.length;
    for (let jobIndex = 0; jobIndex < finalJobs.length; jobIndex++) {
      const job = finalJobs[jobIndex];
      throwIfAborted(abortSignal);
      if (totalJobs > 1) reportBatchProgress(jobIndex, totalJobs);
      try {
        let finalPrompt = enrichPromptWithCharacters(job.prompt, enhancedCtx.characters);
        finalPrompt = enrichPromptWithAssetMentions(finalPrompt, privateItems, publicItems);
        if (envPromptSuffix) finalPrompt = `${finalPrompt}\n${envPromptSuffix}`;
        if (cameraSuffix) finalPrompt = `${finalPrompt}\n\n${cameraSuffix}`;
        if (placementSuffix) finalPrompt = `${finalPrompt}\n\n${placementSuffix}`;
        if (reviewSuffix) finalPrompt = `${finalPrompt}\n\n${reviewSuffix}`;
        if (compositionTemplate) {
          finalPrompt = `${finalPrompt}\n\n[Composition: ${compositionTemplate.name}]\n${compositionTemplate.promptSuffix}`;
        }
        finalPrompt = composePictureProPrompt(finalPrompt, proAction);
        const neg = (d.negativePrompt as string | undefined)?.trim();
        if (neg && !negativeViaParam) {
          finalPrompt = `${finalPrompt}\n\nNegative: ${neg}`;
        }
        lastPrompt = finalPrompt;

        const jobMentioned = resolveLocalMediaMentionUrls(
          job.prompt,
          existingGenerated,
          upstreamPics,
        );
        const mentionRefs = jobMentioned.length > 0 ? jobMentioned : mentionedMediaUrls;

        // PG-26：发送参考与模式判定同源（不含 shot.firstFrame）
        const send = resolvePictureSendRefs({
          data: d,
          nodeRef,
          multiRefs,
          styleImageUrl,
          upstreamPics,
          mentionRefs,
          jobImageUrls: job.imageUrls,
          characterRef: characterRefUrl,
          envRef: envRefUrl,
        });
        lastInjectedRefs = send.injected;
        pictureGenMode = send.mode;

        let refImage = send.primary;
        let effectiveMultiRefs = [...send.extras];

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

        // PG-07: 多参考策略按 provider 分流。
        // gemini/openai 原生吃 referenceImageUrls，不拼贴（避免拼贴 + 原图重复注入）；
        // fal 端点只吃单图，把全部参考（≤9）拼成网格。
        if (
          !job.imageUrls?.length &&
          send.mode === 'multi-ref' &&
          !nativeMultiRef &&
          effectiveMultiRefs.length + (refImage ? 1 : 0) >= 2
        ) {
          const collageSrc = [refImage, ...effectiveMultiRefs]
            .filter(Boolean)
            .slice(0, MAX_PICTURE_UPLOAD_REFS) as string[];
          try {
            const merged = await api.mergeImages({
              imageUrls: collageSrc,
              direction: collageSrc.length <= 3 ? 'horizontal' : 'grid',
              cols: collageSrc.length <= 4 ? 2 : 3,
            });
            refImage = merged.url;
            effectiveMultiRefs = [];
            finalPrompt = `${finalPrompt}\n\n[Multi-reference collage: ${collageSrc.length} images]`;
          } catch {
            /* 拼贴失败则退回单参考 + 额外 refs（由 runner 按限额裁剪） */
          }
        }

        const jobNeedsRef =
          send.mode === 'image-to-image' ||
          send.mode === 'multi-ref' ||
          send.mode === 'style-ref' ||
          mentionRefs.length > 0;
        if (jobNeedsRef && !refImage && !styleImageUrl) {
          throw new Error(
            '当前模式需要参考图：请上传主体参考，或连接上游图片，或 @生成/@上游 图片',
          );
        }

        if (mentionRefs.length > 0) {
          finalPrompt = rewriteLocalMediaMentionsForApi(finalPrompt);
          finalPrompt = `${finalPrompt}\n\n（已附上 ${mentionRefs.length} 张参考图，请按参考图编辑）`;
        }

        // PG-14: 客户端按 provider 限额裁剪，风格图占安全位
        const packed = packPictureRefs({
          provider: modelDef.provider,
          primary: refImage,
          extras: effectiveMultiRefs,
          style: styleImageUrl,
        });
        if (packed.truncatedCount > 0) truncatedRefsTotal += packed.truncatedCount;
        // PG-31: 注记只在此处拼一次；下方不再把 styleImageUrl 传给 runner 二次 pack
        if (packed.styleNote) {
          finalPrompt = `${finalPrompt}\n\n${packed.styleNote}`;
        }
        lastPrompt = finalPrompt;

        const batchUrls = await runPictureGenJob({
          prompt: finalPrompt,
          modelId,
          size,
          referenceImageUrl: packed.primary,
          referenceImageUrls: packed.extras,
          strength: imageStrength,
          n: multiPromptRun ? 1 : imageCount,
          resolutionTier,
          mode: send.mode === 'panorama-720' ? 'panorama-720' : 'standard',
          negativePrompt: d.negativePrompt as string | undefined,
          seed: d.seed as number | undefined,
          signal: abortSignal,
          onMeta: (meta) => {
            if (meta.truncatedRefs && meta.truncatedRefs > packed.truncatedCount) {
              truncatedRefsTotal += meta.truncatedRefs - packed.truncatedCount;
            }
            // PG-28: taskId 一拿到就落盘，不等超时
            if (meta.taskId) {
              if (!pendingImageTasks.some((t) => t.taskId === meta.taskId)) {
                pendingImageTasks.push({
                  taskId: meta.taskId,
                  prompt: job.prompt.slice(0, 80),
                });
              }
              updateNodeData(block.id, {
                status: 'running',
                pendingImageTasks: [...pendingImageTasks],
                pendingImageTaskId: meta.taskId,
              });
            }
          },
        });
        urls.push(...batchUrls);
      } catch (e) {
        if (isPictureAbortError(e) || abortSignal?.aborted) throw e;
        if (e instanceof VideoPollTimeoutError) {
          if (!pendingImageTasks.some((t) => t.taskId === e.taskId)) {
            pendingImageTasks.push({ taskId: e.taskId, prompt: job.prompt.slice(0, 80) });
          }
          failures.push({ index: jobIndex, error: e.message });
          updateNodeData(block.id, {
            status: 'running',
            pendingImageTasks: [...pendingImageTasks],
            pendingImageTaskId: pendingImageTasks[0]?.taskId,
          });
          continue;
        }
        failures.push({ index: jobIndex, error: e instanceof Error ? e.message : String(e) });
      }
    }
    if (totalJobs > 1) reportBatchProgress(urls.length > 0 ? totalJobs : finalJobs.length, totalJobs);
  }

  if (urls.length === 0 && pendingImageTasks.length > 0) {
    updateNodeData(block.id, {
      status: 'running',
      pendingImageTasks,
      pendingImageTaskId: pendingImageTasks[0]?.taskId,
      message: '图片任务仍在后台生成，可点击「继续查询」',
      batchProgress: { done: 0, total: finalJobs.length },
      error: undefined,
    });
    return;
  }
  if (urls.length === 0) {
    throw new Error(failures[0]?.error ?? '图像生成失败');
  }

  // ── OL-01/OL-03: 出图 usedAssetIds + 角色 revision pin ──
  const { privateItems, publicItems } = assetLibraryItemsForPrompt();
  const characterRevisions: Record<string, number> = {};
  for (const c of enhancedCtx.characters) {
    characterRevisions[c.id] = c.revision ?? 1;
  }
  const usedAssetIds = collectUsedAssetIds({
    prompt: lastPrompt,
    characterIds: enhancedCtx.characters.map((c) => c.id),
    sceneAssetId: linkedShot?.sceneAssetId,
    propIds: linkedShot?.propIds,
    costumeIds: (linkedShot?.costumeOverrides ?? [])
      .map((o) => o.costumeId)
      .filter(Boolean),
    shotAssetId: linkedShot?.shotAssetId,
    libraryItems: [...privateItems, ...publicItems],
    characterRevisions,
    pinCharacterRevisions: true,
  });
  const characterRevisionPins: Record<string, number> = {
    ...(linkedShot?.characterRevisionPins ?? {}),
    ...characterRevisions,
  };

  // ── 绑定镜头写回 firstFrame（PG-08: 全景不覆盖首帧）──
  if (linkedShot && urls[0] && pictureGenMode !== 'panorama-720') {
    writePictureShotPatch({
      blockId: block.id,
      shotId: linkedShot.id,
      patch: {
        firstFrameAssetId: urls[0],
        keyframeStatus: 'review',
        status: 'review',
        usedAssetIds,
        characterRevisionPins,
      },
      updateNodeData,
      nodes,
      edges,
    });
  }

  const previousUrls = existingGenerated;
  const previousPrompt = typeof d.content === 'string' ? d.content : '';
  const generationHistory = archivePictureGeneration(
    previousUrls,
    previousPrompt,
    readPictureGenerationHistory(d),
  );

  // PG-25: 绝不覆盖用户 content；警告走 message / lastResult
  updateNodeData(
    block.id,
    buildPictureGenSuccessPatch({
      urls,
      compiledPrompt: lastPrompt,
      failures,
      truncatedRefs: truncatedRefsTotal,
      usedAssetIds,
      generationHistory,
      pendingImageTasks,
      panorama: pictureGenMode === 'panorama-720',
      batchTotal: finalJobs.length,
      characterInjected: enhancedCtx.characters.map((c) => c.id),
      injectedRefs: lastInjectedRefs,
      modelFallbackNote,
    }),
  );
}
