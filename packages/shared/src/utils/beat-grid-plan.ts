/**
 * beat-grid-plan.ts — 「真实音频节拍网格 → 时间轴 / 多格时长」纯函数层（增量新增）。
 *
 * 上游链路（全部既有能力，本模块只消费其输出）：
 *   ffmpeg 解码 → `apps/server/.../beat-detection.ts` 的 detectBeats（能量 onset + 中位间隔 BPM）
 *   → `POST /api/montage/beat-analyze` → 客户端 `engine/beat-grid.ts` 的 BeatGrid。
 *
 * 本模块把真实节拍点收敛成可用的**结构**（分段边界 / 时长分配），并负责把运镜时间轴的
 * 各段边界吸附到真实节拍点上。约定：
 *
 * - 全部纯函数：无 IO、无副作用、不改入参（返回新对象）、输入输出可 JSON 序列化、不抛异常；
 * - **禁止伪造节拍**：节拍点不够 / 网格不可用 / 时间轴为空时返回 `ok:false` + 中文原因，
 *   绝不退化成「等分」却标记为已对齐；
 * - 与既有 `snapMoveTimelineToBeats` **协同不冲突**：均匀节拍网格直接复用它的
 *   `secondsPerBeat` 吸附（吸附后再校验边界确实落在真实节拍上），非均匀网格才走
 *   显式节拍点吸附；两者都不会改写既有函数的行为；
 * - `minBeatsPerSegment` / `maxBeatsPerSegment` 是**约束**：下限无法满足时判定不可用；
 *   上限无法满足时按可容纳的最小值放宽，并在 `messageZh` 里如实说明（节拍点依旧是真实的）。
 */

import {
  normalizeMoveTimeline,
  snapMoveTimelineToBeats,
} from './camera-move-timeline';
import {
  CAMERA_MOVE_TIMELINE_VERSION,
  type CameraMoveSegment,
  type CameraMoveTimeline,
} from '../types/camera-move-timeline';

const EPS = 1e-6;

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clampNum(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * 节拍网格的最小形状（与客户端 `engine/beat-grid.ts` 的 `BeatGrid` 结构兼容）。
 * 只声明消费端真正读到的字段，便于单测直接传裸对象。
 */
export interface BeatGridLike {
  /** 分析是否成功；非 true 一律视为「没有可用节拍」 */
  ok: boolean;
  /** 节拍点（秒，升序）；失败时为空数组 */
  beats: number[];
  /** 估计 BPM（服务端中位间隔估计，可能缺省） */
  tempo?: number;
  /**
   * 被分析到的末端秒数（服务端未返回音频总时长时缺省为末个节拍）。
   * 注意：**不是**音频真实总时长，不得当作事实数值对外声明。
   */
  durationSec?: number;
  message?: string;
}

/* ────────────────────────── 基础清洗 ────────────────────────── */

/**
 * 清洗节拍点：丢弃非有限 / 非正的点，升序排列后去掉 1ms 内的重复点。
 * 不抛异常；入参非数组时返回空数组。
 */
export function sanitizeBeats(beats: readonly number[] | null | undefined): number[] {
  if (!Array.isArray(beats)) return [];
  const sorted = beats
    .filter((raw): raw is number => finite(raw) && raw > 0)
    .map((raw) => round3(raw))
    .sort((a, b) => a - b);
  const pool: number[] = [];
  for (const t of sorted) {
    const last = pool[pool.length - 1];
    if (last !== undefined && t - last <= 1e-3) continue;
    pool.push(t);
  }
  return pool;
}

/** 网格里可用的节拍点（点间隔统计的输入） */
function intervalsOf(pool: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < pool.length; i += 1) out.push(round3(pool[i]! - pool[i - 1]!));
  return out;
}

/** 节拍网格的末端秒数：优先 grid.durationSec，否则末个节拍 */
export function beatGridEndSec(grid: BeatGridLike | null | undefined, fallback = 0): number {
  const pool = sanitizeBeats(grid?.beats);
  const declared = grid?.durationSec;
  if (finite(declared) && declared > 0) {
    return pool.length > 0 ? Math.max(declared, pool[pool.length - 1]!) : declared;
  }
  return pool.length > 0 ? pool[pool.length - 1]! : fallback;
}

/* ────────────────────────── ① 节拍 → N 段边界 ────────────────────────── */

export interface DistributeSegmentBoundariesOptions {
  /** 起始边界（秒），默认 0（时间轴从 0 开始） */
  startSec?: number;
  /** 每段最少覆盖的节拍数，默认 1 */
  minBeatsPerSegment?: number;
  /** 每段最多覆盖的节拍数，默认不限 */
  maxBeatsPerSegment?: number;
}

/** 分段边界计划（`boundaries` 长 count+1，含首尾） */
export interface BeatSegmentBoundaryPlan {
  ok: boolean;
  /** N+1 个边界（秒，升序）；失败时为空数组 */
  boundaries: number[];
  /** 每段时长（秒）；失败时为空数组 */
  durations: number[];
  /** 每段覆盖的节拍数（和 = 可用节拍点总数） */
  beatsPerSegment: number[];
  /** 首边界（秒） */
  startSec: number;
  /** 末边界（秒）= 末个可用节拍 */
  endSec: number;
  /** 是否因节拍过多而放宽了 `maxBeatsPerSegment`（节拍点本身仍是真实的） */
  relaxedMaxBeats: boolean;
  messageZh?: string;
}

function failedBoundaryPlan(messageZh: string): BeatSegmentBoundaryPlan {
  return {
    ok: false,
    boundaries: [],
    durations: [],
    beatsPerSegment: [],
    startSec: 0,
    endSec: 0,
    relaxedMaxBeats: false,
    messageZh,
  };
}

/**
 * 把节拍点收敛成 N 段边界：首边界 = `startSec`（默认 0），末边界 = 末个可用节拍，
 * 中间边界一律取自**真实节拍点**（按段分配节拍数后取每段末拍）。
 *
 * 节拍不足（可用拍数 < 段数 × `minBeatsPerSegment`）时返回 `ok:false`，
 * **不做等分兜底**——调用方需要兜底请显式传 `fallbackSec`（见 planCellDurationsFromBeats）。
 */
export function distributeSegmentBoundaries(
  beats: readonly number[] | null | undefined,
  segmentCount: number,
  opts: DistributeSegmentBoundariesOptions = {},
): BeatSegmentBoundaryPlan {
  const count = finite(segmentCount) ? Math.trunc(segmentCount) : 0;
  if (count <= 0) {
    return failedBoundaryPlan(`分段数需为正整数，收到 ${String(segmentCount)}`);
  }
  const pool = sanitizeBeats(beats);
  if (pool.length === 0) {
    return failedBoundaryPlan('没有可用节拍点：无法按节拍分段（禁止伪造节拍）');
  }
  const startSec = finite(opts.startSec) && opts.startSec > 0 ? round3(opts.startSec) : 0;
  const usable = pool.filter((t) => t > startSec + EPS);
  if (usable.length === 0) {
    return failedBoundaryPlan(`起始秒 ${startSec} 之后没有节拍点`);
  }

  const minB = Math.max(
    1,
    Math.trunc(finite(opts.minBeatsPerSegment) ? (opts.minBeatsPerSegment as number) : 1),
  );
  if (usable.length < count * minB) {
    return failedBoundaryPlan(
      `节拍点不足：${usable.length} 拍 < ${count} 段 × 每段最少 ${minB} 拍（禁止伪造节拍）`,
    );
  }

  let relaxedMaxBeats = false;
  let maxB = finite(opts.maxBeatsPerSegment)
    ? Math.max(minB, Math.trunc(opts.maxBeatsPerSegment as number))
    : usable.length;
  if (usable.length > count * maxB) {
    // 上限装不下全部节拍 → 放宽到刚好能均分的最小值（节拍点仍是真实的，不会凭空造拍）
    maxB = Math.ceil(usable.length / count);
    relaxedMaxBeats = true;
  }

  // 贪心均分：每段取「剩余拍数 / 剩余段数」的四舍五入，并保证后续每段仍有 minB 拍
  const beatsPerSegment: number[] = [];
  let remaining = usable.length;
  for (let i = 0; i < count; i += 1) {
    const slots = count - i;
    if (slots === 1) {
      beatsPerSegment.push(remaining);
      remaining = 0;
      break;
    }
    const ideal = Math.round(remaining / slots);
    const cap = Math.min(maxB, remaining - (slots - 1) * minB);
    beatsPerSegment.push(Math.max(minB, Math.min(ideal, cap)));
    remaining -= beatsPerSegment[beatsPerSegment.length - 1]!;
  }

  const boundaries: number[] = [startSec];
  const durations: number[] = [];
  let cursor = startSec;
  let cum = 0;
  for (const n of beatsPerSegment) {
    cum += n;
    const end = usable[Math.min(cum, usable.length) - 1]!;
    boundaries.push(end);
    durations.push(round3(end - cursor));
    cursor = end;
  }

  const endSec = boundaries[boundaries.length - 1]!;
  return {
    ok: true,
    boundaries,
    durations,
    beatsPerSegment,
    startSec,
    endSec,
    relaxedMaxBeats,
    ...(relaxedMaxBeats
      ? {
          messageZh:
            `节拍数 ${usable.length} 超过 ${count} 段 × 每段最多 ${Math.trunc(opts.maxBeatsPerSegment as number)} 拍，` +
            `已放宽为每段最多 ${maxB} 拍（边界仍取自真实节拍点）`,
        }
      : {}),
  };
}

/* ────────────────────────── ② 时间轴 → 贴到真实节拍 ────────────────────────── */

/** 吸附策略：均匀网格复用既有 snapMoveTimelineToBeats，非均匀网格用显式节拍点 */
export type BeatSnapStrategy = 'uniform-grid' | 'beat-points' | 'none';

export interface BeatSnapResult {
  ok: boolean;
  /** 吸附结果；失败时是**原时间轴的归一化结果**（不改语义、不假装对齐） */
  timeline: CameraMoveTimeline;
  /** 边界确实发生变化的段数 */
  snappedSegments: number;
  /** 吸附后被归一化丢弃的段数（相邻边界吸到同一节拍 → 零时长） */
  droppedSegments: number;
  /** 因节拍网格比时间轴短而被裁掉的秒数（0 = 没裁） */
  clippedSec: number;
  strategy: BeatSnapStrategy;
  messageZh?: string;
}

export interface SnapTimelineToBeatGridOptions {
  /** 均匀判定容差（相对中位间隔的比例），默认 0.05 */
  uniformTolerance?: number;
}

/**
 * 把 `CameraMoveTimeline` 的各段边界贴到**真实节拍点**上。
 *
 * - 均匀网格（相邻间隔相对偏差 ≤ `uniformTolerance`）→ 复用既有
 *   `snapMoveTimelineToBeats({ secondsPerBeat })`，随后逐边界校验确实落在真实节拍上，
 *   校验不过则退回显式节拍点吸附；
 * - 任何情况下都不会凭空生成节拍刻度：吸附候选集 = {0} ∪ 真实节拍点（≤ 网格末端）；
 * - 网格比自己短时按网格末端裁剪并在 `clippedSec` / `messageZh` 里如实报告；
 * - 网格不可用 / 无节拍 / 时间轴为空 → `ok:false` + 原时间轴 + 中文原因。
 */
export function snapTimelineToBeatGrid(
  timeline: CameraMoveTimeline | null | undefined,
  grid: BeatGridLike | null | undefined,
  opts: SnapTimelineToBeatGridOptions = {},
): BeatSnapResult {
  const norm = normalizeMoveTimeline(timeline);
  const base: BeatSnapResult = {
    ok: false,
    timeline: norm,
    snappedSegments: 0,
    droppedSegments: 0,
    clippedSec: 0,
    strategy: 'none',
  };

  if (!grid || grid.ok !== true) {
    return {
      ...base,
      messageZh: grid?.message ?? '没有可用的节拍网格：请先对 BGM 做节拍分析（禁止伪造节拍）',
    };
  }
  const pool = sanitizeBeats(grid.beats);
  if (pool.length === 0) {
    return { ...base, messageZh: '节拍网格为空：不进行吸附（禁止伪造节拍）' };
  }
  if (norm.durationSec <= 0 || norm.segments.length === 0) {
    return { ...base, messageZh: '时间轴为空：先添加运镜片段再对齐节拍' };
  }

  const endSec = beatGridEndSec(grid);
  const tol = finite(opts.uniformTolerance) && opts.uniformTolerance > 0 ? opts.uniformTolerance : 0.05;
  const intervals = intervalsOf(pool);
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)]! : 0;
  const uniform =
    intervals.length >= 1 &&
    median > 0 &&
    sorted[sorted.length - 1]! - sorted[0]! <= median * tol;

  // 候选吸附点：0（时间轴起点）∪ 真实节拍点；末端独立参与「网格末拍」对齐
  const candidates = [0, ...pool];

  /** 边界是否落在真实节拍点（或 0）上 */
  const onBeatPoint = (t: number): boolean =>
    candidates.some((c) => Math.abs(c - t) <= Math.max(1e-3, tol * Math.max(1, median)));

  let strategy: BeatSnapStrategy;
  let snapped: CameraMoveTimeline;

  if (uniform) {
    // 协同既有实现：均匀网格直接走 shared 的 secondsPerBeat 吸附
    const viaGrid = withInferredDuration(
      snapMoveTimelineToBeats(norm, { secondsPerBeat: median, durationSec: endSec }),
    );
    const gridBoundaries = [0, ...viaGrid.segments.flatMap((s) => [s.startT, s.endT])];
    if (gridBoundaries.every(onBeatPoint)) {
      strategy = 'uniform-grid';
      snapped = viaGrid;
    } else {
      // 网格相位与真实节拍不符：退回显式节拍点吸附，不假装对齐
      strategy = 'beat-points';
      snapped = snapToPoints(norm, candidates, endSec);
    }
  } else {
    strategy = 'beat-points';
    snapped = snapToPoints(norm, candidates, endSec);
  }

  const dropped = norm.segments.length - snapped.segments.length;
  const clippedSec = round3(Math.max(0, norm.durationSec - snapped.durationSec));
  const snappedSegments = countChangedSegments(norm.segments, snapped.segments);

  const notes: string[] = [];
  if (dropped > 0) notes.push(`${dropped} 段吸附后时长为零，已按归一化规则并入相邻节拍`);
  if (clippedSec > 0) {
    notes.push(`节拍网格末端 ${round3(endSec)}s 早于时间轴 ${round3(norm.durationSec)}s，已裁剪到网格末端`);
  }

  return {
    ok: true,
    timeline: {
      version: CAMERA_MOVE_TIMELINE_VERSION,
      durationSec: snapped.durationSec,
      segments: snapped.segments,
      beatAligned: true,
    },
    snappedSegments,
    droppedSegments: Math.max(0, dropped),
    clippedSec,
    strategy,
    ...(notes.length > 0
      ? {
          messageZh:
            `已按真实节拍对齐（${strategy === 'uniform-grid' ? '均匀网格' : '节拍点'}）` +
            `：${notes.join('；')}`,
        }
      : {
          messageZh:
            `已按真实节拍对齐（${strategy === 'uniform-grid' ? '均匀网格' : '节拍点'}）：` +
            `${pool.length} 个节拍点，${snapped.segments.length} 段`,
        }),
  };
}

/**
 * 吸附结果的总时长必须是**末段终点**，不能等于节拍网格末端
 * （网格可能比时间轴长，直接沿用它会把时间轴拉长，见 normalizeMoveTimeline 的时长优先级）。
 */
function withInferredDuration(tl: CameraMoveTimeline): CameraMoveTimeline {
  return normalizeMoveTimeline({ ...tl, durationSec: 0 });
}

/** 把边界吸附到候选点（{0} ∪ 真实节拍点），并裁剪到网格末端 */
function snapToPoints(
  norm: CameraMoveTimeline,
  candidates: readonly number[],
  endSec: number,
): CameraMoveTimeline {
  const usable = candidates.filter((c) => c <= endSec + EPS).sort((a, b) => a - b);
  const snap = (v: number): number => {
    const clamped = clampNum(v, 0, endSec);
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const c of usable) {
      const d = Math.abs(c - clamped);
      if (d < bestDist) {
        best = c;
        bestDist = d;
      }
    }
    return Number.isFinite(bestDist) ? best : clamped;
  };
  const segments: CameraMoveSegment[] = norm.segments.map((seg) => ({
    ...seg,
    startT: snap(seg.startT),
    endT: snap(seg.endT),
  }));
  return withInferredDuration(
    normalizeMoveTimeline({ ...norm, durationSec: 0, segments }),
  );
}

/** 统计吸附后边界发生变化的段数（按顺序对齐比较） */
function countChangedSegments(
  before: readonly CameraMoveSegment[],
  after: readonly CameraMoveSegment[],
): number {
  let n = 0;
  for (let i = 0; i < Math.min(before.length, after.length); i += 1) {
    const a = before[i]!;
    const b = after[i]!;
    if (a.moveId !== b.moveId) continue;
    if (Math.abs(a.startT - b.startT) > 1e-3 || Math.abs(a.endT - b.endT) > 1e-3) n += 1;
  }
  return n;
}

/* ────────────────────────── ③ 节拍 → 多格推演各格时长 ────────────────────────── */

export interface PlanCellDurationsOptions {
  /** 节拍不可用时使用的兜底单格时长（秒）；不传则返回空时长 + 原因 */
  fallbackSec?: number;
  /** 单格最少覆盖节拍数，默认 1 */
  minBeatsPerCell?: number;
  /** 单格最多覆盖节拍数，默认不限 */
  maxBeatsPerCell?: number;
  /** 起始秒，默认 0 */
  startSec?: number;
}

export interface CellDurationPlan {
  ok: boolean;
  cellCount: number;
  /** 每格时长（秒）；`ok:false` 且无兜底时为空数组 */
  durations: number[];
  /** 每格起止边界（长 cellCount+1）；失败时为空数组 */
  boundaries: number[];
  /** 每格覆盖的节拍数；失败时为空数组 */
  beatsPerCell: number[];
  /** 总时长（秒）= 末边界 */
  totalSec: number;
  /** 是否使用了兜底时长（此时 `ok:false`，时长**不是**按节拍算出来的） */
  usedFallback: boolean;
  messageZh?: string;
}

/**
 * 按真实节拍给多格推演分配各格时长。
 *
 * 语义：第 1 格从 `startSec`（默认 0）开始，逐格推进到各自的节拍边界，
 * 末格结束在网格末个节拍上 —— 格与格之间的切点就是音乐的拍点。
 *
 * 节拍不可用（未分析 / 失败 / 拍数不足）时：给了 `fallbackSec` 就返回等长兜底时长
 * 并把 `ok` 置 false、原因写进 `messageZh`（**不谎称**是按节拍算的）；没给就返回空时长。
 */
export function planCellDurationsFromBeats(
  cellCount: number,
  grid: BeatGridLike | null | undefined,
  opts: PlanCellDurationsOptions = {},
): CellDurationPlan {
  const count = finite(cellCount) ? Math.trunc(cellCount) : 0;
  if (count <= 0) {
    return {
      ok: false,
      cellCount: 0,
      durations: [],
      boundaries: [],
      beatsPerCell: [],
      totalSec: 0,
      usedFallback: false,
      messageZh: `格数需为正整数，收到 ${String(cellCount)}`,
    };
  }

  const fallbackSec = finite(opts.fallbackSec) && (opts.fallbackSec as number) > 0
    ? round3(opts.fallbackSec as number)
    : 0;
  const withFallback = (messageZh: string): CellDurationPlan => {
    if (fallbackSec <= 0) {
      return {
        ok: false,
        cellCount: count,
        durations: [],
        boundaries: [],
        beatsPerCell: [],
        totalSec: 0,
        usedFallback: false,
        messageZh,
      };
    }
    const durations = Array.from({ length: count }, () => fallbackSec);
    const boundaries = [0];
    for (let i = 0; i < count; i += 1) boundaries.push(round3(boundaries[i]! + fallbackSec));
    return {
      ok: false,
      cellCount: count,
      durations,
      boundaries,
      beatsPerCell: Array.from({ length: count }, () => 0),
      totalSec: boundaries[boundaries.length - 1]!,
      usedFallback: true,
      messageZh: `${messageZh}；已改用每格 ${fallbackSec}s 兜底（这些时长不是按节拍算出来的）`,
    };
  };

  if (!grid || grid.ok !== true) {
    return withFallback(grid?.message ?? '没有可用的节拍网格：请先对 BGM 做节拍分析');
  }

  const plan = distributeSegmentBoundaries(grid.beats, count, {
    startSec: opts.startSec,
    minBeatsPerSegment: opts.minBeatsPerCell,
    maxBeatsPerSegment: opts.maxBeatsPerCell,
  });
  if (!plan.ok) return withFallback(plan.messageZh ?? '节拍分段失败');

  return {
    ok: true,
    cellCount: count,
    durations: plan.durations,
    boundaries: plan.boundaries,
    beatsPerCell: plan.beatsPerSegment,
    totalSec: plan.endSec,
    usedFallback: false,
    ...(plan.messageZh ? { messageZh: plan.messageZh } : {}),
  };
}
