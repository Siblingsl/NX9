/**
 * PG-25 / PG-27：图像节点结果写回。
 * 不覆盖用户 `content`；警告走 message / lastResult；镜表 firstFrame 可从继续查询复用。
 */
import {
  buildChainStoryboardPayload,
  patchChainShot,
  readChainStoryboard,
  type StoryboardShot,
} from '@nx9/shared';
import type { Node } from '@xyflow/react';
import { patchUpstreamShot } from './chain-storyboard-utils';
import {
  archivePictureGeneration,
  readPictureGenerationHistory,
  type PictureGenerationHistoryEntry,
} from './picture-gen-history';
import type { PictureInjectedRef } from './picture-gen-refs';
import type { PendingImageTask } from './picture-gen-runner';
import { useFlowRuntime } from '../stores/flow-runtime';

export interface PictureGenFailure {
  index: number;
  error: string;
}

export function buildPictureWarningParts(opts: {
  urls: number;
  failures?: PictureGenFailure[];
  truncatedRefs?: number;
  modelFallbackNote?: string;
  pendingCount?: number;
}): string[] {
  const parts: string[] = [];
  if (opts.failures?.length) {
    parts.push(`${opts.urls} 成功 / ${opts.failures.length} 失败`);
  }
  if (opts.truncatedRefs && opts.truncatedRefs > 0) {
    parts.push(`已按模型上限裁掉 ${opts.truncatedRefs} 张参考图`);
  }
  if (opts.modelFallbackNote) parts.push(opts.modelFallbackNote);
  if (opts.pendingCount) parts.push(`${opts.pendingCount} 个任务仍在后台，可继续查询`);
  return parts;
}

/** 成功写回节点 data：绝不写 content，避免 enrich/警告污染用户原文 */
export function buildPictureGenSuccessPatch(opts: {
  urls: string[];
  compiledPrompt?: string;
  userPrompt?: string;
  failures?: PictureGenFailure[];
  truncatedRefs?: number;
  usedAssetIds?: string[];
  generationHistory?: PictureGenerationHistoryEntry[];
  pendingImageTasks?: PendingImageTask[];
  warningParts?: string[];
  panorama?: boolean;
  batchTotal?: number;
  characterInjected?: string[];
  injectedRefs?: PictureInjectedRef[];
  modelFallbackNote?: string;
}): Record<string, unknown> {
  const urls = opts.urls.filter((u) => typeof u === 'string' && u.trim());
  const warningParts =
    opts.warningParts ??
    buildPictureWarningParts({
      urls: urls.length,
      failures: opts.failures,
      truncatedRefs: opts.truncatedRefs,
      modelFallbackNote: opts.modelFallbackNote,
      pendingCount: opts.pendingImageTasks?.length,
    });
  return {
    status: 'success',
    previewUrls: urls,
    previewUrl: urls[0],
    lastCompiledPrompt: opts.compiledPrompt,
    batchCount: urls.length,
    batchProgress: {
      done: opts.batchTotal ?? urls.length,
      total: opts.batchTotal ?? urls.length,
    },
    characterInjected: opts.characterInjected,
    injectedRefs: opts.injectedRefs?.length ? opts.injectedRefs : undefined,
    usedAssetIds: opts.usedAssetIds,
    generationHistory: opts.generationHistory,
    pendingImageTasks: opts.pendingImageTasks?.length ? opts.pendingImageTasks : undefined,
    pendingImageTaskId: opts.pendingImageTasks?.[0]?.taskId,
    lastResult: {
      count: urls.length,
      urls,
      usedAssetIds: opts.usedAssetIds,
      failures: opts.failures?.length ? opts.failures : undefined,
      truncatedRefs: opts.truncatedRefs || undefined,
    },
    message: warningParts.length ? warningParts.join(' · ') : undefined,
    error: undefined,
    ...(opts.panorama
      ? {
          panoramaUrl: urls[0],
          panoramaProjection: 'equirectangular',
          aspectRatio: '2:1',
        }
      : {}),
  };
}

export function writePictureShotPatch(opts: {
  blockId: string;
  shotId: string;
  patch: Partial<StoryboardShot>;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  nodes?: Array<{ id: string; type?: string | null; data?: Record<string, unknown> }>;
  edges?: Array<{ source: string; target: string }>;
}): boolean {
  let patched = false;
  if (opts.nodes && opts.edges) {
    patched = patchUpstreamShot(
      opts.updateNodeData,
      opts.blockId,
      opts.nodes as unknown as Node[],
      opts.edges,
      opts.shotId,
      opts.patch,
    );
  }
  if (patched) return true;
  const runtime = useFlowRuntime.getState().runtime;
  const graph =
    (runtime?.getNodes() as Array<{
      id: string;
      type?: string | null;
      data?: Record<string, unknown>;
    }> | undefined) ?? [];
  for (const node of graph) {
    if (node.type !== 'storyboard-desk') continue;
    const chain = readChainStoryboard((node.data ?? {}) as Record<string, unknown>);
    if (!chain?.shots.some((s) => s.id === opts.shotId)) continue;
    const shots = patchChainShot(chain, opts.shotId, opts.patch);
    runtime?.updateNodeData(node.id, {
      chainStoryboard: buildChainStoryboardPayload(chain, { shots }),
    });
    patched = true;
  }
  return patched;
}

/**
 * PG-27：继续查询 / 恢复历史后把预览写回节点，并在已绑定镜头时更新 firstFrame。
 */
export function commitPicturePreviewUrls(opts: {
  blockId: string;
  data: Record<string, unknown>;
  urls: string[];
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  nodes?: Array<{ id: string; type?: string | null; data?: Record<string, unknown> }>;
  edges?: Array<{ source: string; target: string }>;
  extraPatch?: Record<string, unknown>;
  archiveCurrent?: boolean;
}): void {
  const urls = opts.urls.filter((u) => typeof u === 'string' && u.trim());
  const previousUrls = Array.isArray(opts.data.previewUrls)
    ? (opts.data.previewUrls as string[]).filter((u) => typeof u === 'string' && u.trim())
    : typeof opts.data.previewUrl === 'string' && opts.data.previewUrl.trim()
      ? [opts.data.previewUrl.trim()]
      : [];
  const userPrompt = typeof opts.data.content === 'string' ? opts.data.content : '';
  const generationHistory = opts.archiveCurrent
    ? archivePictureGeneration(
        previousUrls,
        userPrompt,
        readPictureGenerationHistory(opts.data),
      )
    : readPictureGenerationHistory(opts.data);

  opts.updateNodeData(opts.blockId, {
    previewUrls: urls,
    previewUrl: urls[0],
    generationHistory,
    ...(opts.extraPatch ?? {}),
  });

  const linkedShotId = (opts.data.linkedShotId as string | undefined)?.trim();
  const panorama = (opts.data.pictureGenMode as string) === 'panorama-720';
  if (linkedShotId && urls[0] && !panorama) {
    writePictureShotPatch({
      blockId: opts.blockId,
      shotId: linkedShotId,
      patch: {
        firstFrameAssetId: urls[0],
        keyframeStatus: 'review',
        status: 'review',
      },
      updateNodeData: opts.updateNodeData,
      nodes: opts.nodes,
      edges: opts.edges,
    });
  }
}
