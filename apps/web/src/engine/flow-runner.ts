import type { Node, Edge } from '@xyflow/react';
import {
  gatherUpstream,
  mergeUpstreamPrompt,
  migrateBlockKind,
  topologicalLayers,
  type FlowBlock,
  type FlowLink,
} from '@nx9/shared';
import { resolvePictureGenRunPrompt } from './stage-deck/chrome/attached-workspace/generation/picture/picture-gen-modes';
import { executeBaseOps } from './flow-runner-ops/base-ops';
import { executeClipGenOps } from './flow-runner-ops/clip-gen-ops';
import { executeMediaOps } from './flow-runner-ops/media-ops';
import { executeStoryOps } from './flow-runner-ops/story-ops';
import { executeToolOps } from './flow-runner-ops/tool-ops';
import { executeLegacyOps } from './flow-runner-ops/legacy-honesty-ops';
import type { FlowExecuteDeps } from './flow-runner-ops/types';
import { DirectorRunBlockedError, ReviewGateBlockedError } from './flow-runner-ops/errors';
export { DirectorRunBlockedError, ReviewGateBlockedError };

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

async function executeBlock(
  block: FlowBlock,
  upstream: ReturnType<typeof gatherUpstream>,
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
  ctx?: { nodes: Node[]; edges: Edge[]; abortSignal?: AbortSignal },
): Promise<void> {
  /** 旧 kind 在未迁移工作区中仍可按合并目标执行 */
  const kind = migrateBlockKind(block.type);
  const d = block.data ?? {};
  // PG-37: 工作区运行只写 runPrompt，不污染用户 content
  const runPromptSource =
    kind === 'picture-gen' ? resolvePictureGenRunPrompt(d) : d.content;
  const prompt = mergeUpstreamPrompt(upstream, runPromptSource as string | undefined);

  updateNodeData(block.id, {
    upstream,
    upstreamPrompt: prompt,
    status: 'running',
  });

  const deps: FlowExecuteDeps = { block, kind, prompt, upstream, updateNodeData, ctx };

  if (
    kind === 'passthrough' || kind === 'memo' || kind === 'prompt' ||
    kind === 'script-desk' || kind === 'dialogue-sheet' || kind === 'picture-gen'
  ) {
    await executeBaseOps(deps);
    return;
  }

  if (kind === 'clip-gen') {
    await executeClipGenOps(deps);
    return;
  }

  if (
    kind === 'chat-model' || kind === 'sound-gen' || kind === 'grid-split' ||
    kind === 'grid-compose' || kind === 'asset-import' || kind === 'text-chunker' ||
    kind === 'iterator' || kind === 'picker' || kind === 'clip-editor' ||
    kind === 'asset-bundle' || kind === 'render-slot' || kind === 'frame-endpoints' ||
    kind === 'frame-sampler' || kind === 'scale-fit' || kind === 'picture-merge' ||
    kind === 'inpaint-edit' || kind === 'thumbnail-maker' || kind === 'caption-asr' ||
    kind === 'voice-cast' || kind === 'photo-speak' || kind === 'bg-remove' ||
    kind === 'upscale-lite' || kind === 'watermark-clean'
  ) {
    await executeMediaOps(deps);
    return;
  }

  if (
    kind === 'storyboard-desk' || kind === 'storyboard-preview' || kind === 'story-grid' ||
    kind === 'director-desk' || kind === 'continuity-check' || kind === 'beat-sync'
  ) {
    await executeStoryOps(deps);
    return;
  }

  if (
    kind === 'cinema-prompt' || kind === 'camera-prompt' || kind === 'prompt-studio' ||
    kind === 'angle-visual' || kind === 'style-lab' || kind === 'local-enhance' ||
    kind === 'model-market' || kind === 'shot-script' || kind === 'reference-board' ||
    kind === 'comfy-workflow' || kind === 'subtitle-burn' || kind === 'link-parser' ||
    kind === 'clip-sink' || kind === 'style-atelier' || kind === 'tag-atelier' ||
    kind === 'batch-runner' || kind === 'grid-prompt-reverse' || kind === 'fal-market' ||
    kind === 'topaz-picture' || kind === 'topaz-clip' || kind === 'control-preprocess' ||
    kind === 'reference-analyze' || kind === 'depth-pass' || kind === 'light-rig' ||
    kind === 'blocking-stage' || kind === 'picture-diff' || kind === 'director-3d'
  ) {
    await executeToolOps(deps);
    return;
  }

  if (
    kind === 'export-pack' || kind === 'audio-mix' || kind === 'color-grade' ||
    kind === 'variant-fork' || kind === 'prompt-diff' || kind === 'music-gen' ||
    kind === 'lipsync-pass'
  ) {
    await executeLegacyOps(deps);
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
