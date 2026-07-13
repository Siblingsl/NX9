import type { FlowBlock, FlowLink } from '../types/workspace';
import type { PromptBatchItem, PromptBatchJob, PromptDispatchMeta } from '../types/prompt-batch';
import type { ScriptBreakdownPayload } from '../types/script-breakdown';
import { promptItemsToBatch } from '../types/prompt-batch';
import { resolveAssetImportItems } from '../utils/asset-import';

export interface UpstreamOutputs {
  prompts: string[];
  pictures: string[];
  clips: string[];
  sounds: string[];
  /** 成对 prompt + 参考图，用于批量生成 */
  promptBatch?: PromptBatchJob[];
  /** 提示词节点的分发策略 */
  promptDispatch?: PromptDispatchMeta;
  /** 剧本拆分后的集数/分镜结构 */
  scriptBreakdowns?: ScriptBreakdownPayload[];
}

/** Kahn topological sort — returns block ids in execution order. */
export function topologicalSort(blocks: FlowBlock[], links: FlowLink[]): string[] {
  return topologicalLayers(blocks, links).flat();
}

/** 按依赖分层 — 同层节点互不依赖，可并行执行 */
export function topologicalLayers(blocks: FlowBlock[], links: FlowLink[]): string[][] {
  const ids = new Set(blocks.map((b) => b.id));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of ids) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }

  for (const link of links) {
    if (!ids.has(link.source) || !ids.has(link.target)) continue;
    adj.get(link.source)!.push(link.target);
    inDegree.set(link.target, (inDegree.get(link.target) ?? 0) + 1);
  }

  const layers: string[][] = [];
  let queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  while (queue.length > 0) {
    queue.sort();
    layers.push([...queue]);
    const nextQueue: string[] = [];
    for (const id of queue) {
      for (const next of adj.get(id) ?? []) {
        const d = (inDegree.get(next) ?? 1) - 1;
        inDegree.set(next, d);
        if (d === 0) nextQueue.push(next);
      }
    }
    queue = nextQueue;
  }

  const placed = new Set(layers.flat());
  const remaining = [...ids].filter((id) => !placed.has(id));
  if (remaining.length > 0) layers.push(remaining.sort());

  return layers;
}

export function gatherUpstream(
  blockId: string,
  blocks: FlowBlock[],
  links: FlowLink[],
): UpstreamOutputs {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const incoming = links.filter((l) => l.target === blockId).map((l) => l.source);
  const out: UpstreamOutputs = { prompts: [], pictures: [], clips: [], sounds: [] };

  for (const srcId of incoming) {
    const block = byId.get(srcId);
    if (!block) continue;
    const d = block.data ?? {};
    const kind = block.type;

    if (kind === 'prompt') {
      const items = (d.promptItems as PromptBatchItem[]) ?? [];
      const mode = (d.promptMode as PromptDispatchMeta['mode']) ?? 'batch';
      const globalPrompt = (d.globalPrompt as string) ?? '';
      const composeAction = d.composeAction as PromptDispatchMeta['composeAction'];
      const { jobs, dispatch } = promptItemsToBatch(
        items,
        mode,
        globalPrompt,
        composeAction ?? 'generate',
      );
      if (jobs.length > 0) {
        out.promptBatch = [...(out.promptBatch ?? []), ...jobs];
        out.promptDispatch = dispatch;
        out.prompts.push(...jobs.map((b) => b.prompt));
        for (const job of jobs) {
          if (job.imageUrl) out.pictures.push(job.imageUrl);
          if (job.imageUrls?.length) out.pictures.push(...job.imageUrls);
        }
      } else {
        const text = globalPrompt.trim() || (d.content as string) || (d.output as string);
        if (text?.trim()) out.prompts.push(text.trim());
      }
      continue;
    }

    if (kind === 'chat-model' || kind === 'memo' || kind === 'cinema-prompt' || kind === 'camera-prompt' || kind === 'link-parser' || kind === 'style-atelier' || kind === 'tag-atelier' || kind === 'angle-visual') {
      const text = (d.content as string) || (d.output as string) || (d.lastReply as string);
      if (text?.trim()) out.prompts.push(text.trim());
    }
    if (kind === 'dialogue-sheet' || kind === 'story-grid') {
      const payload = d.scriptBreakdown as ScriptBreakdownPayload | undefined;
      if (payload?.version === 1) {
        out.scriptBreakdowns = [...(out.scriptBreakdowns ?? []), payload];
        const prompts = payload.episodes.flatMap((ep) => ep.shots.map((shot) => shot.imagePrompt));
        out.prompts.push(...prompts.filter(Boolean));
      }
      continue;
    }
    if (kind === 'storyboard-preview') {
      const preview = d.storyboardPreview as import('../types/storyboard-preview').StoryboardPreviewPayload | undefined;
      if (preview?.version === 1) {
        const frames = preview.confirmed
          ? preview.frames.filter(
              (f) => f.imageUrl && (f.status === 'success' || f.status === 'locked'),
            )
          : preview.frames.filter((f) => f.imageUrl);
        for (const frame of frames) {
          out.pictures.push(frame.imageUrl!);
          if (frame.promptSummary) out.prompts.push(frame.promptSummary);
        }
      }
      const breakdown = d.scriptBreakdown as ScriptBreakdownPayload | undefined;
      if (breakdown?.version === 1) {
        out.scriptBreakdowns = [...(out.scriptBreakdowns ?? []), breakdown];
        const videoPrompts = breakdown.episodes.flatMap((ep) =>
          ep.shots.map((shot) => shot.videoPrompt).filter(Boolean),
        );
        out.prompts.push(...videoPrompts);
      }
      continue;
    }
    if (kind === 'picture-gen') {
      const urls = (d.previewUrls as string[]) ?? [];
      if (urls.length) out.pictures.push(...urls);
      else {
        const url = (d.previewUrl as string) || (d.assetUrl as string) || (d.filledUrl as string);
        if (url) out.pictures.push(url);
      }
      continue;
    }
    if (kind === 'asset-import' || kind === 'render-slot') {
      if (kind === 'asset-import') {
        for (const item of resolveAssetImportItems(d)) {
          if (item.mediaKind === 'picture') out.pictures.push(item.url);
          else if (item.mediaKind === 'clip') out.clips.push(item.url);
          else if (item.mediaKind === 'sound') out.sounds.push(item.url);
        }
      } else {
        const url = (d.previewUrl as string) || (d.assetUrl as string) || (d.filledUrl as string);
        if (url) out.pictures.push(url);
      }
      continue;
    }
    if (kind === 'preview-sink') {
      const pics = (d.previewPictures as string[]) ?? [];
      if (pics.length) out.pictures.push(...pics);
      else {
        const url = (d.previewUrl as string) || (d.assetUrl as string);
        if (url) out.pictures.push(url);
      }
      const text = (d.outputText as string) || (d.previewPrompt as string);
      if (text?.trim()) out.prompts.push(text.trim());
    }
    if (kind === 'asset-bundle') {
      const items = (d.bundleItems as { kind: string; url: string }[]) ?? [];
      for (const item of items) {
        if (item.kind === 'picture' && item.url) out.pictures.push(item.url);
        if (item.kind === 'clip' && item.url) out.clips.push(item.url);
        if (item.kind === 'sound' && item.url) out.sounds.push(item.url);
        if (item.kind === 'text' && item.url) out.prompts.push(item.url);
      }
    }
    if (kind === 'text-chunker') {
      const chunks = (d.chunks as string[]) ?? [];
      if (chunks.length) out.prompts.push(...chunks.filter(Boolean));
    }
    if (kind === 'iterator' || kind === 'picker') {
      const items = (d.iterItems as string[]) ?? (d.chunks as string[]) ?? [];
      const idx = (d.currentIndex as number) ?? (d.pickIndex as number) ?? 0;
      const picked = items[idx];
      if (typeof picked === 'string' && picked.trim()) out.prompts.push(picked.trim());
    }
    if (kind === 'director-desk' || kind === 'story-grid' || kind === 'motion-story') {
      const url = (d.previewUrl as string) || (d.lastFrameUrl as string);
      if (url) out.pictures.push(url);
      const clip = d.videoUrl as string;
      if (clip) out.clips.push(clip);
    }
    if (kind === 'director-3d') {
      const url = (d.lastCaptureUrl as string) || (d.previewUrl as string);
      if (url) out.pictures.push(url);
      const cam =
        (d.lastCameraPrompt as string) || (d.content as string) || (d.outputPrompt as string);
      if (cam?.trim()) out.prompts.push(cam.trim());
    }
    if (kind === 'mesh-viewer' || kind === 'mesh-import') {
      const url = (d.previewUrl as string) || (d.lastCaptureUrl as string);
      if (url) out.pictures.push(url);
    }
    if (kind === 'panorama-sphere') {
      const url = (d.panoramaUrl as string) || (d.previewUrl as string);
      if (url) out.pictures.push(url);
    }
    if (kind === 'grid-split') {
      const urls = (d.splitUrls as string[]) ?? (d.pictures as string[]);
      if (urls?.length) out.pictures.push(...urls);
      else {
        const url = d.previewUrl as string;
        if (url) out.pictures.push(url);
      }
    }
    if (kind === 'grid-compose') {
      const url = (d.composedUrl as string) || (d.previewUrl as string);
      if (url) out.pictures.push(url);
    }
    if (kind === 'scale-fit' || kind === 'sketch-pad') {
      const url = (d.previewUrl as string) || (d.outputUrl as string) || (d.assetUrl as string);
      if (url) out.pictures.push(url);
    }
    if (kind === 'picture-merge') {
      const url = (d.composedUrl as string) || (d.previewUrl as string);
      if (url) out.pictures.push(url);
    }
    if (kind === 'frame-sampler') {
      const urls = (d.frameUrls as string[]) ?? (d.pictures as string[]);
      if (urls?.length) out.pictures.push(...urls);
    }
    if (kind === 'clip-gen' || kind === 'clip-editor' || kind === 'frame-endpoints' || kind === 'clip-sink') {
      const url = (d.videoUrl as string) || (d.outputUrl as string) || (d.previewUrl as string);
      if (url) out.clips.push(url);
      const frames = (d.frameUrls as string[]) ?? [];
      if (frames.length) out.pictures.push(...frames);
    }
    if (kind === 'sound-gen') {
      const url = (d.audioUrl as string);
      if (url) out.sounds.push(url);
    }
    if (kind === 'batch-runner') {
      const urls = (d.batchResults as string[]) ?? (d.pictures as string[]);
      if (urls?.length) {
        if (d.mode === 'reverse-prompt') out.prompts.push(...urls.filter((x) => typeof x === 'string'));
        else out.pictures.push(...urls.filter((x) => x.startsWith('/')));
      }
    }
    if (kind === 'grid-prompt-reverse') {
      const cells = (d.gridCells as { videoPrompt?: string; imagePrompt?: string }[]) ?? [];
      if (cells.length) {
        out.prompts.push(...cells.map((c) => c.videoPrompt || c.imagePrompt || '').filter(Boolean));
      }
      const urls = (d.splitUrls as string[]) ?? (d.pictures as string[]);
      if (urls?.length) out.pictures.push(...urls);
    }
    if (kind === 'photo-speak') {
      const url = (d.videoUrl as string) || (d.outputUrl as string);
      if (url) out.clips.push(url);
      const audio = d.audioUrl as string;
      if (audio) out.sounds.push(audio);
      const text = (d.content as string) || (d.script as string);
      if (text?.trim()) out.prompts.push(text.trim());
    }
    if (kind === 'topaz-picture') {
      const url = (d.previewUrl as string) || (d.outputUrl as string);
      if (url) out.pictures.push(url);
    }
    if (kind === 'topaz-clip') {
      const url = (d.videoUrl as string) || (d.outputUrl as string);
      if (url) out.clips.push(url);
    }
    if (kind === 'passthrough') {
      const up = d.upstream as UpstreamOutputs | undefined;
      if (up) {
        out.prompts.push(...(up.prompts ?? []));
        out.pictures.push(...(up.pictures ?? []));
        out.clips.push(...(up.clips ?? []));
        out.sounds.push(...(up.sounds ?? []));
        out.scriptBreakdowns = [...(out.scriptBreakdowns ?? []), ...(up.scriptBreakdowns ?? [])];
      }
    }
  }

  return out;
}

export function mergeUpstreamPrompt(up: UpstreamOutputs, local?: string): string {
  const parts = [...up.prompts];
  if (local?.trim()) parts.push(local.trim());
  return parts.join('\n\n');
}
