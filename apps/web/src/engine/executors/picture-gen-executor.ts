import {
  enrichPromptWithCharacters,
  buildCharacterContext,
  resolvePromptBatch,
  resolveImageRequestSize,
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
  const resolvedSize = resolveImageRequestSize({
    quality,
    aspectRatio: aspectRatio === 'custom' ? undefined : aspectRatio,
    width: aspectRatio === 'custom' ? customW : undefined,
    height: aspectRatio === 'custom' ? customH : undefined,
    snapToStep,
  });
  const charRef = enhancedCtx.referenceImageUrl ?? upstream.pictures[0];

  const urls: string[] = [];
  let lastPrompt = '';

  for (const job of finalJobs) {
    let finalPrompt = enrichPromptWithCharacters(job.prompt, enhancedCtx.characters);
    lastPrompt = finalPrompt;
    let refImage = job.imageUrls?.[0] || charRef;

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

    const batchUrls = await runPictureGenJob({
      prompt: finalPrompt,
      modelId,
      size: resolvedSize.size,
      referenceImageUrl: refImage,
      n: imageCount,
      mode: pictureGenMode === 'panorama-720' ? 'panorama-720' : 'standard',
    });
    urls.push(...batchUrls);
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
