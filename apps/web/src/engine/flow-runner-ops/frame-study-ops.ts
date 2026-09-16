/**
 * frame-study 执行器 —— 「逐帧拉片」唯一实现（节点级运行入口）。
 *
 * 链路（全部复用既有通道，不新增服务端接口、不改既有契约）：
 * ① 取上游视频（`gatherUpstream(...).clips` 首条，或节点指定的 `frameStudyVideoUrl`）；
 * ② 真实探测时长 `POST /api/montage/probe-duration`（失败即 unknown，不编造时长）；
 * ③ `buildFrameStudyPlan` 组装抽帧计划（策略 → 服务端 count / 间隔 / 时间码）；
 * ④ `POST /api/montage/extract-frames` 抽帧（既有 `extractFrames`，调用契约不变）；
 * ⑤ 逐帧反推：复用既有 `POST /api/grid/reverse-prompts`（rows=1/cols=1 即整帧画面），
 *    走 `run-with-concurrency` 有界并发（上限沿用节点 `data.concurrency` 口径）；
 * ⑥ `mergeFrameStudyReversals` 归位成拉片表并落盘。
 *
 * 口径（与「多格推演」同族）：
 * - 一帧都没抽到 → 抛错，禁止空成功；
 * - 部分帧反推失败 → 成功帧保留、失败原因如实写进该帧备注，节点仍为 success 并带 message；
 * - 视频缺失 / 地址不可解析 → 明确中文提示，不静默；
 * - AbortSignal 透传到抽取与反推；取消时**已完成结果先落盘**再抛「已取消」。
 */
import {
  buildFrameStudyPlan,
  frameStudyToStoryboardShots,
  mergeFrameStudyReversals,
  readFrameStudyMode,
  type FrameStudyItem,
  type FrameStudyPlan,
  type FrameStudyResult,
  type FrameStudyReverseInput,
} from '@nx9/shared';
import { api } from '../../api/client';
import { resolveRunConcurrency, runWithConcurrency } from '../run-with-concurrency';import { resolveCellGenConcurrency } from './cell-gen-batch';
import type { FlowExecuteDeps } from './types';

/** 单帧反推的结果（含失败原因，不抛错） */
export interface FrameStudyReverseOutcome {
  index: number;
  thumbnailUrl: string;
  reversePromptZh?: string;
  reversePromptEn?: string;
  error?: string;
}

/** 上游视频解析：上游 clip 优先，其次节点里钉住的地址 */
export function resolveFrameStudyVideoUrl(
  d: Record<string, unknown>,
  upstreamClips: readonly string[],
): string {
  const upstream = (upstreamClips ?? [])
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .find((u) => u.length > 0);
  if (upstream) return upstream;
  for (const key of ['frameStudyVideoUrl', 'clipUrl', 'sourceUrl', 'videoUrl'] as const) {
    const value = typeof d[key] === 'string' ? (d[key] as string).trim() : '';
    if (value) return value;
  }
  return '';
}

/**
 * 真实时长探测：失败 / 非正数一律返回 `null`（由计划层给 duration-unknown 告警，不编造）。
 *
 * 失败原因口径：`ok:false` 时**优先带上服务端返回的 `message` 原文**（服务端说得出原因就照说），
 * 服务端没给原因才回落固定文案；请求抛异常时用异常信息。三种情形都带「（时间码将留空）」后缀，
 * 与「时间码留空」这一真实后果对齐。
 */
export async function probeFrameStudyDuration(
  videoUrl: string,
  signal?: AbortSignal,
): Promise<{ durationSec: number | null; message?: string }> {
  if (!videoUrl) {
    return { durationSec: null, message: '没有视频地址：无法探测时长' };
  }
  if (signal?.aborted) return { durationSec: null, message: '已取消' };
  try {
    const res = (await api.probeMediaDuration(videoUrl)) as
      | { ok?: boolean; durationSec?: unknown; message?: unknown }
      | null
      | undefined;
    const n = Number(res?.durationSec);
    if (!res?.ok || !Number.isFinite(n) || n <= 0) {
      const serverMessage = typeof res?.message === 'string' ? res.message.trim() : '';
      return {
        durationSec: null,
        message: serverMessage
          ? `时长探测失败：${serverMessage}（时间码将留空）`
          : '时长探测失败：服务端未能解析该视频（时间码将留空）',
      };
    }
    return { durationSec: n };
  } catch (e) {
    return {
      durationSec: null,
      message: `时长探测失败：${e instanceof Error ? e.message : String(e)}（时间码将留空）`,
    };
  }
}

/** 帧图排序：服务端文件名 `frame-%03d.jpg` 零填充，字典序即时间序（帧数 < 1000 恒成立） */
export function sortFrameStudyFrames(frames: readonly string[]): string[] {
  return [...(frames ?? [])]
    .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
    .map((f) => f.trim())
    .sort();
}

/**
 * 单帧反推：复用既有宫格反推通道（`rows=1/cols=1` 即整帧），
 * 把 `imagePrompt` 为空视为失败（服务端解析失败时正是空串）——不假装成功。
 *
 * 注：`POST /api/grid/reverse-prompts` 既有契约不接受 AbortSignal，故 `signal` 仅用于
 * **在途检查**（已取消时直接返回，不发请求）；已发出的请求由并发池等它跑完记账。
 */
export async function reverseFrameStudyFrame(options: {
  frameUrl: string;
  index: number;
  storyPrompt?: string;
  signal?: AbortSignal;
}): Promise<FrameStudyReverseOutcome> {
  const { frameUrl, index } = options;
  if (options.signal?.aborted) {
    return { index, thumbnailUrl: frameUrl, error: '已取消：该帧未反推' };
  }
  try {
    const res = await api.gridReversePrompts({
      sourceUrl: frameUrl,
      rows: 1,
      cols: 1,
      ...(options.storyPrompt ? { storyPrompt: options.storyPrompt } : {}),
    });
    const cell = res?.cells?.[0];
    const reversePromptEn = (cell?.imagePrompt ?? '').trim();
    const reversePromptZh = (cell?.imagePromptZh ?? '').trim();
    if (!res?.ok || !cell || !reversePromptEn) {
      return {
        index,
        thumbnailUrl: frameUrl,
        error: reversePromptZh || res?.message || '反推未返回可用提示词（禁止空成功）',
      };
    }
    return { index, thumbnailUrl: frameUrl, reversePromptZh, reversePromptEn };
  } catch (e) {
    return {
      index,
      thumbnailUrl: frameUrl,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** 逐帧反推（有界并发）；函数本身不抛「单项失败」，只在取消时提前收场 */
export async function reverseFrameStudyFrames(options: {
  frameUrls: readonly string[];
  storyPrompt?: string;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ outcomes: FrameStudyReverseOutcome[]; cancelled: boolean }> {
  const frames = [...(options.frameUrls ?? [])];
  const outcome = await runWithConcurrency(
    frames,
    (frameUrl, index) =>
      reverseFrameStudyFrame({
        frameUrl,
        index,
        storyPrompt: options.storyPrompt,
        signal: options.signal,
      }),
    {
      limit: resolveRunConcurrency(options.concurrency, frames.length),
      signal: options.signal,
      onProgress: options.onProgress,
    },
  );
  const outcomes: FrameStudyReverseOutcome[] = [];
  outcome.results.forEach((res, index) => {
    if (res) outcomes.push(res);
    else {
      const err = outcome.errors[index];
      outcomes.push({
        index,
        thumbnailUrl: frames[index] ?? '',
        error:
          err instanceof Error
            ? err.message
            : err === undefined
              ? '已取消：该帧未反推'
              : String(err),
      });
    }
  });
  outcomes.sort((a, b) => a.index - b.index);
  return { outcomes, cancelled: outcome.cancelled || outcome.failed > 0 };
}

/** 拉片结果落盘的节点 data 补丁（与下游 gatherUpstream 契约一致） */
export function buildFrameStudyResultPatch(input: {
  plan: FrameStudyPlan;
  result: FrameStudyResult;
  model?: string;
}): Record<string, unknown> {
  const { plan, result } = input;
  const frameUrls = result.items
    .map((i) => (i.thumbnailUrl ?? '').trim())
    .filter((u) => u.length > 0);
  return {
    frameStudyPlan: plan,
    frameStudyItems: result.items,
    frameStudyResult: result,
    frameStudyFrameUrls: frameUrls,
    frameStudyFrameCount: result.frameCount,
    frameStudyReversedCount: result.reversedCount,
    // 下游消费口径：逐帧图 + 逐帧提示词（与多格推演同族）
    pictures: frameUrls,
    previewUrls: frameUrls,
    previewUrl: frameUrls[0],
    splitUrls: frameUrls,
    imageCount: frameUrls.length,
    batchProgress: { done: result.items.length, total: plan.timeSec.length },
    lastResult: {
      count: result.frameCount,
      total: plan.timeSec.length,
      // 逐帧失败账单：与多格推演 lastResult.failures 同形状（{ index, role, error }）
      failures: result.items
        .filter((i) => (i.notes ?? '').trim().length > 0)
        .map((i) => ({ index: i.index, role: `第 ${i.index + 1} 帧`, error: i.notes })),
    },
    message: result.messageZh,
  };
}

/** 反向：从节点 data 还原拉片结果（工作区/重推共用，避免两处口径漂移） */
export function readFrameStudyItems(d: Record<string, unknown>): FrameStudyItem[] {
  return Array.isArray(d.frameStudyItems) ? (d.frameStudyItems as FrameStudyItem[]) : [];
}

export function readFrameStudyResult(d: Record<string, unknown>): FrameStudyResult | undefined {
  return d.frameStudyResult && typeof d.frameStudyResult === 'object'
    ? (d.frameStudyResult as FrameStudyResult)
    : undefined;
}

/* ────────────────────────── 节点级运行 ────────────────────────── */

export async function executeFrameStudyOps(deps: FlowExecuteDeps): Promise<void> {
  const { block, upstream, updateNodeData, ctx } = deps;
  const d = (block.data ?? {}) as Record<string, unknown>;
  const signal = ctx?.abortSignal;

  const videoUrl = resolveFrameStudyVideoUrl(d, upstream.clips ?? []);
  if (!videoUrl) {
    throw new Error(
      '逐帧拉片缺少上游视频：请把「视频生成 / 素材导入」等节点的视频连到本节点左侧，' +
        '或在面板中指定视频地址（禁止空成功）',
    );
  }

  const mode = readFrameStudyMode(d.frameStudyMode);
  const value = Number(d.frameStudyValue);

  updateNodeData(block.id, { status: 'running', error: undefined, message: undefined });
  const probe = await probeFrameStudyDuration(videoUrl, signal);
  if (signal?.aborted) throw new Error('已取消');

  const plan = buildFrameStudyPlan({
    mode,
    value: Number.isFinite(value) && value > 0 ? value : undefined,
    durationSec: probe.durationSec,
    sourceUrl: videoUrl,
    aspectRatio: (d.aspectRatio as string) || undefined,
  });

  updateNodeData(block.id, {
    status: 'running',
    frameStudyVideoUrl: videoUrl,
    frameStudyPlan: plan,
    frameStudyDurationSec: plan.durationSec,
    frameStudyDurationNote: probe.message,
    batchProgress: { done: 0, total: plan.timeSec.length },
  });

  const extract = await api.extractFrames(videoUrl, plan.requestedCount);
  if (signal?.aborted) throw new Error('已取消');
  const frames = sortFrameStudyFrames(extract?.frames ?? []);
  if (frames.length === 0) {
    updateNodeData(block.id, {
      status: 'error',
      error: extract?.message || '抽帧未返回任何帧',
      message:
        extract?.message ||
        '抽帧未返回任何帧：请确认视频地址可访问、服务端 ffmpeg 可用（禁止空成功）',
    });
    throw new Error(
      extract?.message ||
        '抽帧未返回任何帧：请确认视频地址可访问、服务端 ffmpeg 可用（禁止空成功）',
    );
  }

  const storyPrompt = typeof d.frameStudyContext === 'string' ? d.frameStudyContext.trim() : '';
  const concurrency = resolveCellGenConcurrency(d);
  const { outcomes, cancelled } = await reverseFrameStudyFrames({
    frameUrls: frames,
    storyPrompt,
    concurrency,
    signal,
    onProgress: (done, total) =>
      updateNodeData(block.id, { status: 'running', batchProgress: { done, total } }),
  });

  // 反推完成的帧先归位落盘（取消也保留已完成结果，不丢账）
  const reversals: FrameStudyReverseInput[] = outcomes.map((o) => ({
    index: o.index,
    timeSec: plan.timeSec[o.index],
    thumbnailUrl: o.thumbnailUrl,
    reversePromptZh: o.reversePromptZh,
    reversePromptEn: o.reversePromptEn,
    ...(o.error ? { error: o.error } : {}),
  }));
  const result = mergeFrameStudyReversals(plan, reversals);
  const patch = buildFrameStudyResultPatch({ plan, result });

  if (cancelled) {
    updateNodeData(block.id, {
      ...patch,
      status: 'idle',
      error: undefined,
      message: `已取消本轮拉片：${result.frameCount}/${plan.timeSec.length} 帧已归位落盘（已完成结果保留，可单帧重推补全）`,
    } as Record<string, unknown>);
    throw new Error('已取消');
  }

  updateNodeData(block.id, {
    ...patch,
    status: 'success',
    error: undefined,
  } as Record<string, unknown>);
}

/* ────────────────────────── 单帧重推 / 单帧清空 ────────────────────────── */

/**
 * 单帧重推：只重跑指定帧的反推，其余帧原样保留（成功帧不被覆盖）。
 * 视频地址与计划沿用已落盘内容，源视频断开也能重推。
 */
export async function rerunFrameStudyFrame(options: {
  blockId: string;
  data: Record<string, unknown>;
  index: number;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  signal?: AbortSignal;
}): Promise<{ ok: boolean; reason?: string }> {
  const { blockId, data, index, updateNodeData } = options;
  const plan = data.frameStudyPlan as FrameStudyPlan | undefined;
  if (!plan || !Array.isArray(plan.timeSec)) {
    return { ok: false, reason: '尚无抽帧计划：请先运行一次拉片' };
  }
  const items = readFrameStudyItems(data);
  const item = items[index];
  const frameUrl = (item?.thumbnailUrl ?? '').trim();
  if (!item || !frameUrl) {
    return { ok: false, reason: `第 ${index + 1} 帧没有帧图：无法重推（请重新抽帧）` };
  }

  const storyPrompt = typeof data.frameStudyContext === 'string' ? data.frameStudyContext.trim() : '';
  const outcome = await reverseFrameStudyFrame({ frameUrl, index, storyPrompt, signal: options.signal });
  if (options.signal?.aborted) throw new Error('已取消');

  const reversals: FrameStudyReverseInput[] = items.map((it, i) =>
    i === index
      ? {
          index,
          timeSec: it.timeSec,
          thumbnailUrl: frameUrl,
          reversePromptZh: outcome.reversePromptZh,
          reversePromptEn: outcome.reversePromptEn,
          ...(outcome.error ? { error: outcome.error } : {}),
        }
      : {
          index: i,
          timeSec: it.timeSec,
          thumbnailUrl: it.thumbnailUrl,
          reversePromptZh: it.reversePromptZh,
          reversePromptEn: it.reversePromptEn,
        },
  );
  const result = mergeFrameStudyReversals(plan, reversals);
  updateNodeData(blockId, {
    ...buildFrameStudyResultPatch({ plan, result }),
    status: 'success',
    error: undefined,
  } as Record<string, unknown>);
  return outcome.error ? { ok: false, reason: outcome.error } : { ok: true };
}

/** 单帧清空：清掉该帧的反推结论与帧图（其余帧不受影响），并给出新结果 */
export function clearFrameStudyFrame(options: {
  blockId: string;
  data: Record<string, unknown>;
  index: number;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
}): boolean {
  const { blockId, data, index, updateNodeData } = options;
  const plan = data.frameStudyPlan as FrameStudyPlan | undefined;
  const items = readFrameStudyItems(data);
  if (!plan || !items[index]) return false;
  const reversals: FrameStudyReverseInput[] = items.map((it, i) => ({
    index: i,
    timeSec: it.timeSec,
    ...(i === index
      ? {}
      : {
          thumbnailUrl: it.thumbnailUrl,
          reversePromptZh: it.reversePromptZh,
          reversePromptEn: it.reversePromptEn,
        }),
  }));
  const result = mergeFrameStudyReversals(plan, reversals);
  updateNodeData(blockId, {
    ...buildFrameStudyResultPatch({ plan, result }),
    status: result.ok ? 'success' : 'idle',
  } as Record<string, unknown>);
  return true;
}

/* ────────────────────────── 送分镜 ────────────────────────── */

/** 拉片表 → 分镜镜头数据（纯函数入口再导出，供工作区写回链镜表时统一口径） */
export function buildFrameStudyShots(
  plan: FrameStudyPlan,
  result: FrameStudyResult,
  options: Parameters<typeof frameStudyToStoryboardShots>[2] = {},
) {
  return frameStudyToStoryboardShots(plan, result, options);
}
