/**
 * PG-25 / PG-27：图像节点结果写回。
 * 不覆盖用户 `content`；警告走 message / lastResult；镜表 firstFrame 可从继续查询复用。
 * 新一轮出图默认追加到现有 previewUrls（新图置顶），不再整表覆盖。
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

/** 节点结果条最多保留的生成图数量（超出从尾部丢弃最旧） */
export const MAX_PICTURE_PREVIEW_URLS = 24;

/**
 * 合并本轮新图与节点已有结果。
 * - prepend（默认）：新图置顶，便于立刻选中最新结果
 * - append：接到末尾（继续查询与历史行为一致）
 * - replace：整表替换（恢复历史轮次）
 */
export function mergePicturePreviewUrls(
  existing: string[],
  incoming: string[],
  mode: 'prepend' | 'append' | 'replace' = 'prepend',
): string[] {
  const next = incoming.map((u) => u?.trim()).filter((u): u is string => Boolean(u));
  if (mode === 'replace') return next.slice(0, MAX_PICTURE_PREVIEW_URLS);
  const prev = existing.map((u) => u?.trim()).filter((u): u is string => Boolean(u));
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (url: string) => {
    if (seen.has(url)) return;
    seen.add(url);
    out.push(url);
  };
  if (mode === 'prepend') {
    next.forEach(push);
    prev.forEach(push);
  } else {
    prev.forEach(push);
    next.forEach(push);
  }
  return out.slice(0, MAX_PICTURE_PREVIEW_URLS);
}

/** 每张生成图对应的编译发送稿（url → prompt），选中操作按图读取 */
export type PictureCompiledPromptMap = Record<string, string>;

export function readPictureCompiledPrompts(
  data: Record<string, unknown> | undefined | null,
): PictureCompiledPromptMap {
  const raw = data?.previewCompiledPrompts;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: PictureCompiledPromptMap = {};
  for (const [url, prompt] of Object.entries(raw as Record<string, unknown>)) {
    const key = url?.trim();
    const text = typeof prompt === 'string' ? prompt.trim() : '';
    if (key && text) out[key] = text;
  }
  return out;
}

/** 给本轮新图写入发送稿，并裁掉已不在结果条里的旧条目 */
export function mergePictureCompiledPrompts(
  existing: PictureCompiledPromptMap | undefined,
  keepUrls: string[],
  incomingUrls: string[],
  compiledPrompt?: string,
): PictureCompiledPromptMap {
  const prompt = (compiledPrompt ?? '').trim();
  const next: PictureCompiledPromptMap = { ...(existing ?? {}) };
  if (prompt) {
    for (const url of incomingUrls) {
      const key = url?.trim();
      if (key) next[key] = prompt;
    }
  }
  return prunePictureCompiledPrompts(next, keepUrls);
}

/**
 * 追加出图前：给尚未建账的旧结果补上「上一轮」发送稿，
 * 避免旧图之后误读 lastCompiledPrompt / 被污染的历史条目。
 */
export function backfillPictureCompiledPrompts(
  existing: PictureCompiledPromptMap | undefined,
  existingUrls: string[],
  previousCompiledPrompt?: string,
): PictureCompiledPromptMap {
  const prev = (previousCompiledPrompt ?? '').trim();
  const next: PictureCompiledPromptMap = { ...(existing ?? {}) };
  if (!prev) return next;
  for (const url of existingUrls) {
    const key = url?.trim();
    if (key && !next[key]) next[key] = prev;
  }
  return next;
}

export function prunePictureCompiledPrompts(
  map: PictureCompiledPromptMap | undefined,
  keepUrls: string[],
): PictureCompiledPromptMap {
  const keep = new Set(keepUrls.map((u) => u?.trim()).filter(Boolean));
  const out: PictureCompiledPromptMap = {};
  for (const [url, prompt] of Object.entries(map ?? {})) {
    if (keep.has(url) && prompt.trim()) out[url] = prompt;
  }
  return out;
}

/**
 * 从历史轮次重建 url→发送稿（从旧到新，已有不覆盖）。
 * 追加模式下较新的「整表快照」不会污染更早单图条目。
 */
export function rebuildPictureCompiledPromptsFromHistory(
  data: Record<string, unknown>,
): PictureCompiledPromptMap {
  const history = readPictureGenerationHistory(data);
  const out: PictureCompiledPromptMap = {};
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    const prompt = (entry.compiledPrompt ?? entry.userPrompt ?? entry.prompt ?? '').trim();
    if (!prompt) continue;
    for (const url of entry.urls) {
      const key = url?.trim();
      if (key && !out[key]) out[key] = prompt;
    }
  }
  return out;
}

/**
 * 解析选中图的发送稿：per-url 映射 → 历史重建 →（仅未建账的最新图）lastCompiledPrompt。
 * 绝不把「最新一轮」套到已有独立账本的旧图上。
 */
export function resolvePictureCompiledPrompt(
  data: Record<string, unknown>,
  url?: string | null,
): string | undefined {
  const key = url?.trim();
  if (!key) return undefined;

  const mapped = readPictureCompiledPrompts(data)[key];
  if (mapped) return mapped;

  const fromHistory = rebuildPictureCompiledPromptsFromHistory(data)[key];
  if (fromHistory) return fromHistory;

  const last =
    typeof data.lastCompiledPrompt === 'string' ? data.lastCompiledPrompt.trim() : '';
  if (!last) return undefined;

  const urls = Array.isArray(data.previewUrls)
    ? (data.previewUrls as string[]).map((u) => String(u ?? '').trim()).filter(Boolean)
    : typeof data.previewUrl === 'string' && data.previewUrl.trim()
      ? [data.previewUrl.trim()]
      : [];
  // 仅当该 url 仍是「当前条上未建过历史账」的最新结果时，才回退 lastCompiledPrompt
  if (urls[0] === key) return last;
  return undefined;
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
  /** PG-38: 实际发送模式写回，UI 不再显示与真实发送不一致的文生图 */
  pictureGenMode?: string;
  /** 本轮新写入的 url（用于绑定 compiledPrompt）；缺省视为全部 urls */
  incomingUrls?: string[];
  /** 追加前已有的 per-url 发送稿 */
  previousCompiledPrompts?: PictureCompiledPromptMap;
  /** 追加前节点上的旧结果 url，用于回填上一轮发送稿 */
  existingUrls?: string[];
  /** 追加前的 lastCompiledPrompt，回填给尚未建账的旧图 */
  previousLastCompiledPrompt?: string;
}): Record<string, unknown> {
  const urls = opts.urls.filter((u) => typeof u === 'string' && u.trim());
  const incoming = (opts.incomingUrls ?? urls)
    .map((u) => u?.trim())
    .filter((u): u is string => Boolean(u));
  const backfilled = backfillPictureCompiledPrompts(
    opts.previousCompiledPrompts,
    opts.existingUrls ?? [],
    opts.previousLastCompiledPrompt,
  );
  const previewCompiledPrompts = mergePictureCompiledPrompts(
    backfilled,
    urls,
    incoming,
    opts.compiledPrompt,
  );
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
    previewCompiledPrompts,
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
    ...(opts.pictureGenMode
      ? {
          pictureGenMode: opts.pictureGenMode,
          useImageReference:
            opts.pictureGenMode === 'image-to-image' ||
            opts.pictureGenMode === 'multi-ref' ||
            opts.pictureGenMode === 'style-ref' ||
            opts.pictureGenMode === 'upscale-hd',
        }
      : {}),
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
  /** 本轮新取回的 url；缺省视为全部 urls（恢复历史整表绑定） */
  incomingUrls?: string[];
  /** 绑定到 incomingUrls 的发送稿；缺省用 data.lastCompiledPrompt */
  compiledPromptForIncoming?: string;
  /** 覆盖已有 per-url 映射（恢复历史时可直接传入） */
  previewCompiledPrompts?: PictureCompiledPromptMap;
}): void {
  const urls = opts.urls.filter((u) => typeof u === 'string' && u.trim());
  const previousUrls = Array.isArray(opts.data.previewUrls)
    ? (opts.data.previewUrls as string[]).filter((u) => typeof u === 'string' && u.trim())
    : typeof opts.data.previewUrl === 'string' && opts.data.previewUrl.trim()
      ? [opts.data.previewUrl.trim()]
      : [];
  const userPrompt = typeof opts.data.content === 'string' ? opts.data.content : '';
  const compiledPrompt =
    typeof opts.data.lastCompiledPrompt === 'string' && opts.data.lastCompiledPrompt.trim()
      ? opts.data.lastCompiledPrompt
      : userPrompt;
  const generationHistory = opts.archiveCurrent
    ? archivePictureGeneration(
        previousUrls,
        userPrompt,
        readPictureGenerationHistory(opts.data),
        undefined,
        { userPrompt, compiledPrompt },
      )
    : readPictureGenerationHistory(opts.data);

  const incoming = (opts.incomingUrls ?? urls)
    .map((u) => u?.trim())
    .filter((u): u is string => Boolean(u));
  const previewCompiledPrompts =
    opts.previewCompiledPrompts ??
    mergePictureCompiledPrompts(
      readPictureCompiledPrompts(opts.data),
      urls,
      incoming,
      opts.compiledPromptForIncoming ?? compiledPrompt,
    );

  opts.updateNodeData(opts.blockId, {
    previewUrls: urls,
    previewUrl: urls[0],
    generationHistory,
    previewCompiledPrompts,
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
        ...(Array.isArray(opts.data.usedAssetIds)
          ? { usedAssetIds: opts.data.usedAssetIds }
          : {}),
        ...(opts.data.characterRevisionPins &&
          typeof opts.data.characterRevisionPins === 'object'
          ? { characterRevisionPins: opts.data.characterRevisionPins as Record<string, number> }
          : {}),
      },
      updateNodeData: opts.updateNodeData,
      nodes: opts.nodes,
      edges: opts.edges,
    });
  }
}
