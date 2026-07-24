import {
  enrichPromptWithCharacters,
  enrichPromptWithAssetMentions,
  buildCharacterContext,
  resolvePromptBatch,
  resolveImageRequestSize,
  characterToItem,
  workspaceItemToAsset,
  soundToItem,
  templateToAsset,
  BUILTIN_BACKLOT_TEMPLATES,
  type FlowBlock,
  type PromptBatchJob,
} from '@nx9/shared';
import { api } from '../../api/client';
import { runPictureGenJob } from '../picture-gen-runner';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import type { BlockExecutorContext } from './types';

function linkedShotForBlock(blockId: string, data: Record<string, unknown>) {
  const shots = useWorkspaceDocument.getState().storyboard.shots;
  const linkedShotId = data.linkedShotId as string | undefined;
  return shots.find((s) => s.id === linkedShotId || s.linkedBlockId === blockId);
}

function characterContextForBlock(block: FlowBlock, upstreamPictures: string[] = []) {
  const d = block.data ?? {};
  const shot = linkedShotForBlock(block.id, d);
  const library = useWorkspaceDocument.getState().characters.characters;
  return buildCharacterContext(d, shot, library, upstreamPictures);
}

function assetLibraryItemsForPrompt() {
  const doc = useWorkspaceDocument.getState();
  const privateItems = [
    ...doc.characters.characters.map((c) => characterToItem(c, 'private')),
    ...doc.soundLibrary.sounds.map((s) => soundToItem(s, 'private')),
    ...doc.backlotWorkspace.items.map((i) => workspaceItemToAsset(i, 'private')),
  ];
  const publicItems = BUILTIN_BACKLOT_TEMPLATES.map((tpl) => templateToAsset(tpl as any, 'public', true));
  return { privateItems, publicItems };
}

export async function runPictureGenExecutor(ctx: BlockExecutorContext): Promise<void> {
  const { block, prompt, upstream, updateNodeData } = ctx;
  const d = block.data ?? {};

  const enhancedCtx = characterContextForBlock(block, upstream.pictures);

  const jobs = resolvePromptBatch(
    upstream.promptBatch?.map((j: any) => j.prompt || '') ?? [prompt],
    upstream.pictures,
    upstream.promptBatch ?? [],
    prompt,
    upstream.promptDispatch,
  );
  const finalJobs = jobs.length > 0 ? jobs : [{ prompt: prompt || 'a scenic landscape' }];
  const composeAction = upstream.promptDispatch?.composeAction ?? 'generate';
  const modelId = (d.model as string) || 'dall-e-3';
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
    Array.isArray(d.excludedRefUrls)
      ? (d.excludedRefUrls as string[])
      : [],
  );
  const upstreamPics = (upstream.pictures ?? []).filter((u) => !excludedRefs.has(u));
  const resolvedSize = resolveImageRequestSize({
    quality,
    aspectRatio: aspectRatio === 'custom' ? undefined : aspectRatio,
    width: aspectRatio === 'custom' ? customW : undefined,
    height: aspectRatio === 'custom' ? customH : undefined,
    snapToStep,
  });
  const nodeRef = (d.referenceImageUrl as string | undefined)?.trim();
  const existingGenerated = Array.isArray(d.previewUrls)
    ? (d.previewUrls as string[]).filter((u) => typeof u === 'string' && u.trim())
    : d.previewUrl
      ? [String(d.previewUrl)]
      : [];
  const { resolveLocalMediaMentionUrls } = await import(
    '../stage-deck/chrome/asset-mention/local-media-mention'
  );
  const mentionedMediaUrls = resolveLocalMediaMentionUrls(
    prompt,
    existingGenerated,
    upstreamPics,
  );
  const charRef = enhancedCtx.referenceImageUrl ?? upstreamPics[0];
  const needsRef =
    pictureGenMode === 'image-to-image' ||
    pictureGenMode === 'multi-ref' ||
    pictureGenMode === 'style-ref' ||
    pictureGenMode === 'upscale-hd' ||
    mentionedMediaUrls.length > 0;

  // 专业动作模板（LibTV 对齐）
  const { composePictureProPrompt, lookupPictureProAction } = await import(
    '../stage-deck/chrome/attached-workspace/generation/picture/picture-pro-actions'
  );
  const proAction = lookupPictureProAction(d.pictureProAction as string | undefined);

  const urls: string[] = [];
  let lastPrompt = '';

  // 高清：直接放大，不走多 job 生成
  if (pictureGenMode === 'upscale-hd') {
    const refImage =
      mentionedMediaUrls[0] || nodeRef || charRef || multiRefs[0] || upstreamPics[0];
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
      const { privateItems, publicItems } = assetLibraryItemsForPrompt();
      let finalPrompt = enrichPromptWithCharacters(job.prompt, enhancedCtx.characters);
      finalPrompt = enrichPromptWithAssetMentions(finalPrompt, privateItems, publicItems);
      finalPrompt = composePictureProPrompt(finalPrompt, proAction);
      const neg = (d.negativePrompt as string | undefined)?.trim();
      if (neg) {
        finalPrompt = `${finalPrompt}\n\nNegative: ${neg}`;
      }
      lastPrompt = finalPrompt;

      const jobMentioned = resolveLocalMediaMentionUrls(
        job.prompt,
        existingGenerated,
        upstreamPics,
      );
      const mentionRefs =
        jobMentioned.length > 0 ? jobMentioned : mentionedMediaUrls;

      let refImage =
        job.imageUrls?.[0] ||
        mentionRefs[0] ||
        nodeRef ||
        charRef ||
        multiRefs[0] ||
        styleImageUrl;

      const effectiveMultiRefs = [
        ...multiRefs,
        ...mentionRefs.filter((u) => u !== refImage && !multiRefs.includes(u)),
      ];

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
        effectiveMultiRefs.length + (nodeRef || mentionRefs[0] ? 1 : 0) >= 2
      ) {
        const collageSrc = [nodeRef || mentionRefs[0], ...effectiveMultiRefs].filter(
          Boolean,
        ) as string[];
        try {
          const merged = await api.mergeImages({
            imageUrls: collageSrc.slice(0, 4),
            direction: 'horizontal',
          });
          refImage = merged.url;
          finalPrompt = `${finalPrompt}\n\n[Multi-reference collage: ${collageSrc.length} images]`;
        } catch {
          /* 拼贴失败则退回单参考 */
        }
      }

      if (needsRef && !refImage) {
        throw new Error('当前模式需要参考图：请上传主体参考，或连接上游图片，或 @生成/@上游 图片');
      }

      if (mentionRefs.length > 0) {
        finalPrompt = `${finalPrompt}\n\n[Local media refs: ${mentionRefs.length}]`;
      }

      const batchUrls = await runPictureGenJob({
        prompt: finalPrompt,
        modelId,
        size: resolvedSize.size,
        referenceImageUrl: refImage,
        referenceImageUrls: effectiveMultiRefs,
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

  // 绑定镜头时写回故事板 firstFrame（核心路径 SSOT）
  const linked = linkedShotForBlock(block.id, d);
  if (linked && urls[0] && pictureGenMode !== 'panorama-720') {
    useWorkspaceDocument.getState().updateShot(linked.id, {
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
}
