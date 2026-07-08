import type { Node, Edge } from '@xyflow/react';
import {
  emptyClipChain,
  gatherUpstream,
  mergeUpstreamPrompt,
  shotsToClipChain,
  splitText,
  topologicalLayers,
  enrichPromptWithCharacters,
  buildCharacterContext,
  mergePromptBatchItems,
  promptItemsToBatch,
  resolvePromptBatch,
  buildLightRigPrompt,
  characterSheetFromNodeData,
  syncCharacterSheetNodeOutput,
  type ClipChainState,
  type FlowBlock,
  type FlowLink,
  type TextSplitMode,
  type StoryboardShot,
} from '@nx9/shared';
import { buildCameraPrompt, normalizeDirectorProject } from '@nx9/director3d';
import { api } from '../api/client';
import { runClipChain } from './clip-chain-runner';
import { useWorkspaceDocument } from '../stores/workspace-document';

function linkedShotForBlock(blockId: string, data: Record<string, unknown>): StoryboardShot | undefined {
  const shots = useWorkspaceDocument.getState().storyboard.shots;
  const linkedShotId = data.linkedShotId as string | undefined;
  return shots.find((s) => s.id === linkedShotId || s.linkedBlockId === blockId);
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
  'grid-prompt-reverse',
  'photo-speak',
  'bg-remove',
  'upscale-lite',
  'watermark-clean',
  'motion-story',
  'shot-script',
  'reference-board',
  'character-sheet',
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
  phase: 'idle' | 'running' | 'done' | 'error' | 'blocked';
  current: number;
  total: number;
  currentId?: string;
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

async function waitForVideoUrl(
  taskId: string,
  attempts = 24,
  intervalMs = 5000,
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const res = await api.pollVideo(taskId);
    if (res.status === 'success' && res.url) return res.url;
    if (res.status === 'failed') return null;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

async function executeBlock(
  block: FlowBlock,
  upstream: ReturnType<typeof gatherUpstream>,
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
): Promise<void> {
  const kind = block.type;
  const d = block.data ?? {};
  const prompt = mergeUpstreamPrompt(upstream, d.content as string | undefined);

  updateNodeData(block.id, {
    upstream,
    upstreamPrompt: prompt,
    status: 'running',
  });

  if (kind === 'passthrough') {
    updateNodeData(block.id, { upstream, status: 'success' });
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

  if (kind === 'memo') {
    updateNodeData(block.id, { status: 'success', output: d.content });
    return;
  }

  if (kind === 'preview-sink') {
    updateNodeData(block.id, {
      status: 'success',
      previewPrompt: prompt,
      previewPictures: upstream.pictures,
      previewClips: upstream.clips,
    });
    return;
  }

  if (kind === 'picture-gen') {
    const charCtx = characterContextForBlock(block, upstream.pictures);
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
    const size = (d.size as string) || '1024x1024';
    const charRef = charCtx.referenceImageUrl ?? upstream.pictures[0];

    const urls: string[] = [];
    let lastPrompt = '';

    for (const job of finalJobs) {
      let finalPrompt = enrichPromptWithCharacters(job.prompt, charCtx.characters);
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

      const { runPictureGenJob } = await import('./picture-gen-runner');
      const url = await runPictureGenJob({
        prompt: finalPrompt,
        modelId,
        size,
        referenceImageUrl: refImage,
      });
      urls.push(url);
    }
    if (urls.length === 0) throw new Error('图像生成失败');

    updateNodeData(block.id, {
      status: 'success',
      previewUrls: urls,
      previewUrl: urls[0],
      content: lastPrompt,
      batchCount: urls.length,
      characterInjected: charCtx.characters.map((c) => c.id),
      lastResult: { count: urls.length, urls },
    });
    return;
  }

  if (kind === 'clip-gen') {
    const charCtx = characterContextForBlock(block, upstream.pictures);
    const finalPrompt = enrichPromptWithCharacters(prompt || 'cinematic scene', charCtx.characters);
    const imageUrl = upstream.pictures[0] ?? charCtx.referenceImageUrl;
    const res = (await api.proxyVideo({
      prompt: finalPrompt,
      model: (d.model as string) || 'veo',
      imageUrl,
    })) as { ok?: boolean; url?: string; status?: string; taskId?: string };
    let videoUrl = res.url;
    if (!videoUrl && res.taskId && res.status === 'processing') {
      videoUrl = (await waitForVideoUrl(res.taskId)) ?? undefined;
    }
    updateNodeData(block.id, {
      status: videoUrl ? 'success' : res.status === 'processing' ? 'running' : 'error',
      videoUrl,
      taskId: res.taskId,
      content: finalPrompt,
      characterInjected: charCtx.characters.map((c) => c.id),
      lastResult: res,
      error: videoUrl ? undefined : '视频生成未完成或失败',
    });
    if (!videoUrl && res.status !== 'processing') throw new Error('视频生成失败');
    return;
  }

  if (kind === 'chat-model') {
    const messages = [
      ...(d.systemPrompt ? [{ role: 'system', content: d.systemPrompt as string }] : []),
      { role: 'user', content: prompt || (d.content as string) || 'Hello' },
    ];
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
    const charCtx = characterContextForBlock(block, upstream.pictures);
    const shotPrompt = enrichPromptWithCharacters(
      (d.content as string) || prompt || 'cinematic medium shot',
      charCtx.characters,
    );
    const res = (await api.proxyImage({ prompt: shotPrompt, model: 'dall-e-3' })) as {
      ok?: boolean;
      url?: string;
    };
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      content: shotPrompt,
      characterInjected: charCtx.characters.map((c) => c.id),
      lastResult: res,
    });
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

  if (kind === 'story-grid') {
    const gridPrompt = prompt || (d.content as string) || 'storyboard 9-panel grid';
    const rows = (d.rows as number) ?? 3;
    const cols = (d.cols as number) ?? 3;
    const res = await api.gridGenerate({ prompt: gridPrompt, rows, cols });
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      content: gridPrompt,
    });
    return;
  }

  if (kind === 'asset-import') {
    updateNodeData(block.id, {
      status: 'success',
      output: d.assetUrl,
      previewUrl: d.mediaKind === 'picture' ? d.assetUrl : undefined,
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
    const clips = [...upstream.clips, ...((d.extraClips as string[]) ?? [])].filter(Boolean);
    if (clips.length === 0) throw new Error('缺少视频片段');
    const res = await api.concatClips(clips, (d.title as string) || '画布剪辑');
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
    updateNodeData(block.id, {
      status: 'success',
      exportReady: true,
      exportCount:
        (upstream.pictures?.length ?? 0) +
        (upstream.clips?.length ?? 0) +
        (upstream.sounds?.length ?? 0),
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

  if (kind === 'audio-mix') {
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

  if (kind === 'color-grade') {
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
    const shots = useWorkspaceDocument.getState().storyboard.shots;
    if (shots.length === 0) throw new Error('故事板无镜头');
    const res = await api.checkReviewGate(shots);
    if (!res.ok) {
      updateNodeData(block.id, {
        status: 'blocked',
        gatePassed: false,
        pendingShots: res.pending,
        meta: { pending: res.pending },
      });
      throw new ReviewGateBlockedError(res.pending);
    }
    updateNodeData(block.id, {
      status: 'success',
      gatePassed: true,
      pendingShots: [],
      meta: { gatePassed: true },
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
      const shots = useWorkspaceDocument.getState().storyboard.shots;
      if (shots.length === 0) throw new Error('故事板无镜头');
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
            status: 'review',
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
): Promise<void> {
  const blockMap = new Map(toBlocks(nodes).map((b) => [b.id, { ...b, data: { ...b.data } }]));
  const links = toLinks(edges);
  const runnable = (id: string) => {
    const b = blockMap.get(id);
    if (!b || !RUNNABLE_BLOCKS.has(b.type)) return false;
    if (onlyBlockIds && !onlyBlockIds.has(id)) return false;
    return true;
  };

  const layers = topologicalLayers([...blockMap.values()], links)
    .map((layer) => layer.filter(runnable))
    .filter((layer) => layer.length > 0);

  const total = layers.reduce((n, layer) => n + layer.length, 0);
  onProgress({ phase: 'running', current: 0, total });

  let completed = 0;

  for (const layer of layers) {
    if (signal?.cancelled) {
      onProgress({ phase: 'error', current: completed, total, error: '已取消' });
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
          await executeBlock(block, upstream, (nodeId, data) => {
            const b = blockMap.get(nodeId);
            if (b) b.data = { ...b.data, ...data };
            updateNodeData(nodeId, data);
          });
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

    completed += layer.length;
    onProgress({ phase: 'running', current: completed, total });
  }

  onProgress({ phase: 'done', current: total, total });
}
