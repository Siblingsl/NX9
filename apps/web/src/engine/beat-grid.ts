/**
 * beat-grid.ts — 客户端「音频节拍网格」接入层（增量新增）。
 *
 * 数据流（全部既有能力，本模块只做接线与缓存）：
 *   `POST /api/montage/beat-analyze`（apps/server 的 montage.service.beatAnalyze）
 *     → ffmpeg 解码单声道 PCM → beat-detection.detectBeats（能量 onset + 中位间隔 BPM）
 *     → `{ ok, beats, tempo, message }`
 *   → 本模块规范化成 `BeatGrid`（带缓存 / 并发去重 / 超时）
 *   → UI：运镜时间轴的「从 BGM 分析节拍」「对齐到真实节拍」、
 *     多格推演的「按 BGM 节拍分配各格时长」。
 *
 * 诚实口径（与仓库既有「禁止空成功」一致）：
 * - `ok:false` 一律**如实透传**服务端原因（未检测到 FFmpeg / 读不到文件 / 解码失败 /
 *   节拍不明显 / 超时 / 网络失败），此时 `beats` 必为空数组；
 * - **绝不伪造节拍**：不拿 BPM 等分当节拍点、不在失败时编造网格；
 * - 服务端未返回音频真实总时长，故 `durationSec` 是「被分析到的末端秒数」
 *   （末个节拍），仅作为对齐边界使用，不得当作音频时长对外声明。
 *
 * 无第三方依赖：不在前端解码音频，全部走服务端既有 ffmpeg 链路。
 */
import { api } from '../api/client';
import {
  distributeSegmentBoundaries,
  sanitizeBeats,
  type BeatGridLike,
  type BeatSegmentBoundaryPlan,
  type DistributeSegmentBoundariesOptions,
} from '@nx9/shared';

/** 服务端 `/api/montage/beat-analyze` 的响应形状（与 api/client.ts 同源） */
export interface BeatAnalyzeResponse {
  ok: boolean;
  beats?: number[];
  tempo?: number;
  message?: string;
}

/** 可注入的分析客户端（单测用 mock，生产用真实 api） */
export interface BeatAnalyzeApi {
  beatAnalyze(audioUrl: string): Promise<BeatAnalyzeResponse>;
}

/**
 * 结构化节拍网格。结构与 shared 的 `BeatGridLike` 兼容，
 * 可直接喂给 `snapTimelineToBeatGrid` / `planCellDurationsFromBeats`。
 */
export interface BeatGrid extends BeatGridLike {
  /** 分析是否成功；false 时 `beats` 必为空数组、`message` 为真实原因 */
  ok: boolean;
  /** 被分析的音频地址（缓存键，原样保留便于回显） */
  audioUrl: string;
  /** 节拍点（秒，升序，已清洗去重）；失败时为空数组 */
  beats: number[];
  /** 估计 BPM（服务端中位间隔估计，样本不足时缺省） */
  tempo?: number;
  /** 分析覆盖到的末端秒数（= 末个节拍）；**不是**音频真实总时长 */
  durationSec?: number;
  message?: string;
  /** 本结果产出时间（ms）；复用缓存时保留首次产出时间 */
  analyzedAt: number;
  /** 是否来自缓存（仅供 UI 提示，不参与业务判断） */
  cached?: boolean;
}

export interface AnalyzeAudioBeatsOptions {
  /** 注入分析客户端（单测）；缺省用真实 `api.beatAnalyze` */
  api?: BeatAnalyzeApi;
  /** 跳过缓存强制重新分析 */
  force?: boolean;
  /** 超时（毫秒），默认 20000；<= 0 关闭超时 */
  timeoutMs?: number;
  /** 成功结果的最大缓存时长（毫秒），默认 30 分钟；<= 0 表示会话内不限时长 */
  maxAgeMs?: number;
}

/** 默认超时：服务端要跑一次 ffmpeg 全程解码，给足但不无限等 */
export const BEAT_ANALYZE_TIMEOUT_MS = 20000;
/** 成功结果的默认缓存时长 */
export const BEAT_GRID_CACHE_MS = 30 * 60 * 1000;
/** 失败结果的缓存时长：短缓存，避免反复打服务端，同时让用户装好 ffmpeg 后能重试 */
export const BEAT_GRID_FAILURE_CACHE_MS = 30 * 1000;

interface CacheEntry {
  grid: BeatGrid;
  at: number;
}

/** 同 URL 结果缓存（成功长缓存 / 失败短缓存） */
const gridCache = new Map<string, CacheEntry>();
/** 同 URL 并发去重：同一时刻只发一个请求 */
const inflight = new Map<string, Promise<BeatGrid>>();

class BeatAnalyzeTimeoutError extends Error {}

function cloneGrid(grid: BeatGrid): BeatGrid {
  return { ...grid, beats: [...grid.beats] };
}

function failureGrid(audioUrl: string, message: string): BeatGrid {
  return { ok: false, audioUrl, beats: [], message, analyzedAt: Date.now() };
}

function readCache(url: string, maxAgeMs: number): BeatGrid | null {
  const hit = gridCache.get(url);
  if (!hit) return null;
  const age = Date.now() - hit.at;
  const ttl = hit.grid.ok
    ? maxAgeMs
    : Math.min(BEAT_GRID_FAILURE_CACHE_MS, maxAgeMs > 0 ? maxAgeMs : BEAT_GRID_FAILURE_CACHE_MS);
  if (maxAgeMs > 0 && age > ttl) return null;
  return hit.grid;
}

function writeCache(url: string, grid: BeatGrid): void {
  gridCache.set(url, { grid, at: Date.now() });
}

/** 清空节拍缓存：不传 URL 清全部，传 URL 只清该条 */
export function clearBeatGridCache(audioUrl?: string): void {
  if (audioUrl === undefined) gridCache.clear();
  else gridCache.delete(audioUrl.trim());
}

/** 只读缓存（不触发请求）：给 UI 首屏回显用 */
export function readCachedBeatGrid(audioUrl: string): BeatGrid | null {
  const url = (audioUrl ?? '').trim();
  if (!url) return null;
  const hit = gridCache.get(url);
  return hit ? cloneGrid(hit.grid) : null;
}

/** 仅供测试：观察并发去重是否生效 */
export function beatGridInflightCount(): number {
  return inflight.size;
}

function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  if (!(timeoutMs > 0)) return task;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new BeatAnalyzeTimeoutError(`节拍分析超时（超过 ${Math.round(timeoutMs / 1000)} 秒），未取到节拍`));
    }, timeoutMs);
    task.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function runAnalyze(
  url: string,
  client: BeatAnalyzeApi,
  timeoutMs: number,
): Promise<BeatGrid> {
  let res: BeatAnalyzeResponse;
  try {
    res = await withTimeout(client.beatAnalyze(url), timeoutMs);
  } catch (e) {
    const reason = e instanceof BeatAnalyzeTimeoutError
      ? e.message
      : `节拍分析请求失败：${e instanceof Error ? e.message : String(e)}`;
    return failureGrid(url, reason);
  }

  const beats = sanitizeBeats(res?.beats);
  if (res?.ok !== true) {
    return failureGrid(url, res?.message?.trim() || '节拍分析失败：服务端未给出原因（禁止空成功）');
  }
  if (beats.length === 0) {
    return failureGrid(url, res?.message?.trim() || '未检测到节拍（禁止空成功）');
  }
  const tempo = typeof res.tempo === 'number' && Number.isFinite(res.tempo) && res.tempo > 0
    ? Math.round(res.tempo)
    : undefined;
  return {
    ok: true,
    audioUrl: url,
    beats,
    ...(tempo !== undefined ? { tempo } : {}),
    durationSec: beats[beats.length - 1]!,
    ...(res.message?.trim() ? { message: res.message.trim() } : {}),
    analyzedAt: Date.now(),
  };
}

/**
 * 分析音频节拍（带缓存 + 并发去重 + 超时）。
 *
 * 同 URL 不重复请求；同一时刻的并发调用共用同一次请求。
 * 失败结果**同样返回**（`ok:false` + 真实原因），由调用方决定如何展示 / 兜底。
 */
export async function analyzeAudioBeats(
  audioUrl: string,
  opts: AnalyzeAudioBeatsOptions = {},
): Promise<BeatGrid> {
  const url = (audioUrl ?? '').trim();
  if (!url) return failureGrid('', '音频地址为空：请先选择或输入 BGM 地址（禁止空成功）');

  const client = opts.api ?? api;
  const timeoutMs = opts.timeoutMs === undefined ? BEAT_ANALYZE_TIMEOUT_MS : opts.timeoutMs;
  const maxAgeMs = opts.maxAgeMs === undefined ? BEAT_GRID_CACHE_MS : opts.maxAgeMs;

  if (!opts.force) {
    const hit = readCache(url, maxAgeMs);
    if (hit) return { ...cloneGrid(hit), cached: true };
    const pending = inflight.get(url);
    if (pending) return cloneGrid(await pending);
  }

  const task = runAnalyze(url, client, timeoutMs);
  inflight.set(url, task);
  try {
    const grid = await task;
    writeCache(url, grid);
    return cloneGrid(grid);
  } finally {
    inflight.delete(url);
  }
}

/* ────────────────────────── 纯函数：网格 → UI / 规划可用结构 ────────────────────────── */

/** 时间轴上的一个节拍标记 */
export interface BeatMarker {
  /** 节拍点（秒） */
  t: number;
  /** 序号（0 起） */
  index: number;
  /** 与前一拍的间隔（秒）；首拍缺省 */
  intervalSec?: number;
}

/** 节拍点 → 标记数组（失败网格返回空数组，不编造刻度） */
export function beatGridToMarkers(grid: BeatGridLike | null | undefined): BeatMarker[] {
  if (!grid || grid.ok !== true) return [];
  const pool = sanitizeBeats(grid.beats);
  return pool.map((t, index) => ({
    t,
    index,
    ...(index > 0 ? { intervalSec: Math.round((t - pool[index - 1]!) * 1000) / 1000 } : {}),
  }));
}

/** 节拍间隔统计；样本不足时各值均为 null（不返回 0 冒充统计结果） */
export interface BeatIntervalStats {
  /** 间隔数（= 节拍数 - 1） */
  count: number;
  medianSec: number | null;
  minSec: number | null;
  maxSec: number | null;
  meanSec: number | null;
}

export function beatIntervalStats(grid: BeatGridLike | null | undefined): BeatIntervalStats {
  const pool = grid && grid.ok === true ? sanitizeBeats(grid.beats) : [];
  const intervals: number[] = [];
  for (let i = 1; i < pool.length; i += 1) intervals.push(pool[i]! - pool[i - 1]!);
  if (intervals.length === 0) {
    return { count: 0, medianSec: null, minSec: null, maxSec: null, meanSec: null };
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  const sum = intervals.reduce((acc, v) => acc + v, 0);
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return {
    count: intervals.length,
    medianSec: r3(sorted[Math.floor(sorted.length / 2)]!),
    minSec: r3(sorted[0]!),
    maxSec: r3(sorted[sorted.length - 1]!),
    meanSec: r3(sum / intervals.length),
  };
}

/** 网格覆盖的末端秒数（= durationSec 或末个节拍）；无节拍返回 0 */
export function beatGridTotalDuration(grid: BeatGridLike | null | undefined): number {
  if (!grid || grid.ok !== true) return 0;
  const declared = grid.durationSec;
  if (typeof declared === 'number' && Number.isFinite(declared) && declared > 0) return declared;
  const pool = sanitizeBeats(grid.beats);
  return pool.length > 0 ? pool[pool.length - 1]! : 0;
}

/**
 * 按节拍给 N 段边界：转调 shared 纯函数 `distributeSegmentBoundaries`，不改语义。
 * 失败时返回 `ok:false` + 中文原因（不返回等分边界冒充节拍边界）。
 */
export function beatsToBoundaries(
  grid: BeatGridLike | null | undefined,
  count: number,
  opts: DistributeSegmentBoundariesOptions = {},
): BeatSegmentBoundaryPlan {
  if (!grid || grid.ok !== true) {
    return {
      ok: false,
      boundaries: [],
      durations: [],
      beatsPerSegment: [],
      startSec: 0,
      endSec: 0,
      relaxedMaxBeats: false,
      messageZh: grid?.message ?? '没有可用的节拍网格：请先对 BGM 做节拍分析（禁止伪造节拍）',
    };
  }
  return distributeSegmentBoundaries(grid.beats, count, opts);
}
