/**
 * NX9「运镜时间轴编排」—— 纯函数层。
 *
 * 把 `data/camera-move-library.ts` 的运镜词条按时间串成一条运动轨，并提供：
 * 归一化 / 校验 / 采样 / 组合提示词 / 提示词注入 / 按时长自动铺开 / 幅度曲线。
 *
 * 约束与约定：
 * - 全部纯函数：无 IO、无副作用、不改入参（返回新对象），输入输出均可 JSON 序列化；
 * - 与既有 `buildCameraMovePrompt` / `withCameraMovePrompt` **协同不冲突**：
 *   组合描述是**一个**提示词片段，注入时复用同一行槽位（`camera movement:` / `运镜：`），
 *   不会在提示词里堆出第二条运镜行；
 * - 未知 moveId 不抛异常、不静默丢弃：短语回落为该 moveId 文本，并在 validate 中报错；
 * - 时间单位秒；`durationHintSec` 仅作为相对权重的兜底参考，不当事实数值引用。
 */

import {
  CAMERA_MOVE_PROMPT_PREFIX_EN,
  CAMERA_MOVE_PROMPT_PREFIX_ZH,
  lookupCameraMove,
  type CameraMoveDef,
} from '../data/camera-move-library';
import type { PromptPreset } from '../data/prompt-presets';
import {
  CAMERA_MOVE_AMPLITUDE_DEFAULT,
  CAMERA_MOVE_AMPLITUDE_MAX,
  CAMERA_MOVE_AMPLITUDE_MIN,
  CAMERA_MOVE_EASINGS,
  CAMERA_MOVE_SPEED_RAMPS,
  CAMERA_MOVE_TIMELINE_VERSION,
  type CameraMoveEasing,
  type CameraMoveSegment,
  type CameraMoveSpeedRamp,
  type CameraMoveTimeline,
  type CameraMoveTimelineIssue,
  type CameraMoveTimelineIssueCode,
  type CameraMoveTimelineIssueSeverity,
  type CameraMoveTimelineSample,
  type CameraMoveTimelineValidation,
  type ComposedMovePrompt,
  type ComposedMovePromptPart,
} from '../types/camera-move-timeline';

/** 判定「零时长」的阈值（秒）；小于等于它视为空片段 */
export const CAMERA_MOVE_SEGMENT_MIN_SEC = 0.001;
/** 浮点比较容差 */
const EPS = 1e-6;

/* ── 基础工具 ── */

function clampNum(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 秒数格式化：最多两位小数，去掉多余的 0（1.5 → '1.5'，2 → '2'） */
export function formatMoveSeconds(v: number): string {
  if (!finite(v)) return '0';
  const rounded = Math.round(v * 100) / 100;
  return String(rounded);
}

export function isCameraMoveEasing(v: unknown): v is CameraMoveEasing {
  return typeof v === 'string' && (CAMERA_MOVE_EASINGS as string[]).includes(v);
}

export function isCameraMoveSpeedRamp(v: unknown): v is CameraMoveSpeedRamp {
  return typeof v === 'string' && (CAMERA_MOVE_SPEED_RAMPS as string[]).includes(v);
}

/** 缓动曲线：线性 / 渐入 / 渐出 / 缓入缓出；非法值按线性处理 */
export function applyMoveEasing(t: number, easing?: CameraMoveEasing): number {
  const x = clampNum(finite(t) ? t : 0, 0, 1);
  switch (easing ?? 'linear') {
    case 'ease-in':
      return x * x;
    case 'ease-out':
      return 1 - (1 - x) * (1 - x);
    case 'ease-in-out':
      return x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x);
    default:
      return x;
  }
}

/**
 * 速度曲线整形：作用在缓动结果之上。
 * accelerate = 起步慢后段快（幂 2 前段）；decelerate = 起步快后段缓（幂 2 后段）；steady = 不变。
 */
export function applyMoveSpeedRamp(t: number, ramp?: CameraMoveSpeedRamp): number {
  const x = clampNum(finite(t) ? t : 0, 0, 1);
  switch (ramp ?? 'steady') {
    case 'accelerate':
      return x * x;
    case 'decelerate':
      return 1 - (1 - x) * (1 - x);
    default:
      return x;
  }
}

/** 段内进度：线性进度 → 缓动 → 速度曲线，输出 0..1 */
export function moveSegmentProgress(
  linear: number,
  easing?: CameraMoveEasing,
  ramp?: CameraMoveSpeedRamp,
): number {
  return applyMoveSpeedRamp(applyMoveEasing(linear, easing), ramp);
}

/** 解析片段对应的词库词条；未知 moveId 返回 undefined */
export function lookupSegmentMove(seg: CameraMoveSegment): CameraMoveDef | undefined {
  return lookupCameraMove(seg?.moveId);
}

/** 片段可读中文名（未知 id 回落为 id 本身） */
export function segmentLabelZh(seg: CameraMoveSegment): string {
  return lookupSegmentMove(seg)?.labelZh ?? String(seg?.moveId ?? '');
}

/** 片段可读英文名（未知 id 回落为 id 本身） */
export function segmentLabelEn(seg: CameraMoveSegment): string {
  return lookupSegmentMove(seg)?.labelEn ?? String(seg?.moveId ?? '');
}

function segmentAmplitude(seg: CameraMoveSegment): number {
  return finite(seg?.amplitude) ? seg.amplitude : CAMERA_MOVE_AMPLITUDE_DEFAULT;
}

function segmentDuration(seg: CameraMoveSegment): number {
  return Math.max(0, seg.endT - seg.startT);
}

/* ── 归一化 ── */

export interface NormalizeMoveTimelineOptions {
  /** 目标总时长（秒）；给定则覆盖输入 durationSec */
  durationSec?: number;
  /** 输入没有合法 durationSec 时是否按片段最大 endT 推断（默认 true） */
  inferDurationFromSegments?: boolean;
  /** 是否解决重叠：保留先出现者、把后者的 startT 裁到前一段 endT（默认 true） */
  resolveOverlaps?: boolean;
  /** 是否丢弃零时长片段（默认 true） */
  dropEmpty?: boolean;
  /** 是否把片段裁剪进 [0, durationSec]（默认 true） */
  clipToDuration?: boolean;
}

/**
 * 归一化时间轴：补齐缺失 id/幅度/缓动 → 裁剪越界 → 丢弃空片段 → 按 startT 排序 → 消除重叠。
 *
 * 明确行为（不臆测）：
 * - startT / endT 任一非有限数 → **丢弃**该片段（无法可靠修复）；
 * - endT <= startT（或不足 1ms）→ **丢弃**（拖到零长度视为删除，不编造时长）；
 * - amplitude 非有限或 <= 0 → 用默认 1；超出 [0.05, 4] → 钳制到区间端点；
 * - 非法 easing / speedRamp → 回落 'linear' / 'steady'；
 * - id 缺失或同一时间轴内重复 → 重编为 `seg-1..n`（保持时间顺序）。
 * - durationSec 取值优先级：opts.durationSec → 输入 durationSec（有限且 > 0）→ 片段最大 endT → 0。
 */
export function normalizeMoveTimeline(
  input: CameraMoveTimeline | CameraMoveSegment[] | null | undefined,
  opts: NormalizeMoveTimelineOptions = {},
): CameraMoveTimeline {
  const infer = opts.inferDurationFromSegments ?? true;
  const resolveOverlaps = opts.resolveOverlaps ?? true;
  const dropEmpty = opts.dropEmpty ?? true;
  const clip = opts.clipToDuration ?? true;

  const rawSegments: CameraMoveSegment[] = Array.isArray(input)
    ? input
    : Array.isArray(input?.segments)
      ? input.segments
      : [];
  const beatAligned = Array.isArray(input) ? undefined : Boolean(input?.beatAligned);
  const rawDuration = Array.isArray(input) ? undefined : input?.durationSec;

  // 1) 逐条清洗（先算 durationSec，再裁剪，故此处只做字段级补齐）
  const cleaned: CameraMoveSegment[] = [];
  for (const seg of rawSegments) {
    if (!seg || typeof seg !== 'object') continue;
    if (!finite(seg.startT) || !finite(seg.endT)) continue;
    if (seg.endT - seg.startT <= CAMERA_MOVE_SEGMENT_MIN_SEC) {
      if (dropEmpty) continue;
    }
    const moveId = typeof seg.moveId === 'string' && seg.moveId.trim() ? seg.moveId.trim() : '';
    if (!moveId) continue;
    const ampRaw = segmentAmplitude(seg);
    const amplitude = clampNum(
      ampRaw > 0 ? ampRaw : CAMERA_MOVE_AMPLITUDE_DEFAULT,
      CAMERA_MOVE_AMPLITUDE_MIN,
      CAMERA_MOVE_AMPLITUDE_MAX,
    );
    cleaned.push({
      id: typeof seg.id === 'string' ? seg.id.trim() : '',
      moveId,
      startT: seg.startT,
      endT: seg.endT,
      amplitude,
      easing: isCameraMoveEasing(seg.easing) ? seg.easing : 'linear',
      speedRamp: isCameraMoveSpeedRamp(seg.speedRamp) ? seg.speedRamp : 'steady',
      ...(typeof seg.noteZh === 'string' && seg.noteZh.trim() ? { noteZh: seg.noteZh.trim() } : {}),
    });
  }

  // 2) 决定 durationSec
  const maxEnd = cleaned.reduce((acc, s) => Math.max(acc, s.endT), 0);
  let durationSec = 0;
  if (finite(opts.durationSec)) durationSec = Math.max(0, opts.durationSec);
  else if (finite(rawDuration) && rawDuration > 0) durationSec = rawDuration;
  else if (infer) durationSec = Math.max(0, maxEnd);

  // 3) 裁剪到 [0, durationSec] + 二次丢弃空片段
  const withinRange = clip
    ? cleaned
        .map((s) => ({ ...s, startT: clampNum(s.startT, 0, durationSec), endT: clampNum(s.endT, 0, durationSec) }))
        .filter((s) => (dropEmpty ? s.endT - s.startT > CAMERA_MOVE_SEGMENT_MIN_SEC : true))
    : [...cleaned];

  // 4) 按时间排序（相同起点时长者在前，保证确定性）
  withinRange.sort((a, b) => a.startT - b.startT || a.endT - b.endT);

  // 5) 消除重叠：保留先出现者，后者起点裁到前一段终点；裁空则丢弃
  const laidOut: CameraMoveSegment[] = [];
  for (const seg of withinRange) {
    const prev = laidOut[laidOut.length - 1];
    let next = seg;
    if (prev && seg.startT < prev.endT - EPS) {
      if (!resolveOverlaps) {
        laidOut.push(seg);
        continue;
      }
      if (prev.endT >= seg.endT - EPS) continue;
      next = { ...seg, startT: prev.endT };
    }
    laidOut.push(next);
  }

  // 6) 重编 id（缺失或重复一律重编，保持可复现）
  const seen = new Set<string>();
  let hasDup = false;
  for (const seg of laidOut) {
    if (!seg.id) continue;
    if (seen.has(seg.id)) hasDup = true;
    seen.add(seg.id);
  }
  const needsReindex = hasDup || laidOut.some((s) => !s.id);
  const segments = needsReindex
    ? laidOut.map((s, i) => ({ ...s, id: `seg-${i + 1}` }))
    : laidOut;

  return {
    version: CAMERA_MOVE_TIMELINE_VERSION,
    durationSec,
    segments,
    ...(beatAligned !== undefined ? { beatAligned } : {}),
  };
}

/* ── 校验 ── */

function issue(
  code: CameraMoveTimelineIssueCode,
  severity: CameraMoveTimelineIssueSeverity,
  segmentId: string | null,
  messageZh: string,
): CameraMoveTimelineIssue {
  return { code, severity, segmentId, messageZh };
}

/**
 * 结构化校验：返回问题列表，**不抛异常**。
 * error 级：结构致命（时长非法 / 空轨 / 未知运镜 / 时间非法 / 越界 / 零时长 / id 重复 / 重叠）；
 * warning 级：可用但可疑（未排序 / 幅度超出建议 / 空隙 / 未覆盖满时长）。
 */
export function validateMoveTimeline(
  tl: CameraMoveTimeline | null | undefined,
): CameraMoveTimelineValidation {
  const issues: CameraMoveTimelineIssue[] = [];
  const duration = tl?.durationSec;
  const durationOk = finite(duration) && duration > 0;
  if (!durationOk) {
    issues.push(issue('invalid-duration', 'error', null, '时间轴总时长必须是大于 0 的有限秒数'));
  }
  const rawSegments = tl?.segments;
  if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
    issues.push(issue('empty', 'error', null, '时间轴没有任何运镜片段'));
    return finish(issues);
  }

  const ids = new Map<string, number>();
  rawSegments.forEach((seg, index) => {
    const sid = seg?.id ? String(seg.id) : null;
    const where = sid ?? `第 ${index + 1} 段`;
    if (!seg || typeof seg !== 'object') {
      issues.push(issue('invalid-time', 'error', sid, `${where}：片段数据非法`));
      return;
    }
    if (!lookupCameraMove(seg.moveId)) {
      issues.push(
        issue('unknown-move', 'error', sid, `${where}：运镜 id「${String(seg.moveId)}」不在运镜词库`),
      );
    }
    if (!finite(seg.startT) || !finite(seg.endT)) {
      issues.push(issue('invalid-time', 'error', sid, `${where}：起止时间为非有限数`));
      return;
    }
    if (seg.startT < -EPS) {
      issues.push(issue('negative-start', 'error', sid, `${where}：起点 ${seg.startT}s 为负`));
    }
    if (durationOk && seg.endT > duration + EPS) {
      issues.push(
        issue(
          'out-of-range',
          'error',
          sid,
          `${where}：终点 ${formatMoveSeconds(seg.endT)}s 超出总时长 ${formatMoveSeconds(duration)}s`,
        ),
      );
    }
    if (seg.endT - seg.startT <= CAMERA_MOVE_SEGMENT_MIN_SEC) {
      issues.push(issue('zero-duration', 'error', sid, `${where}：持续时间为 0，无法编排`));
    }
    if (seg.amplitude !== undefined && seg.amplitude !== null) {
      if (!finite(seg.amplitude) || seg.amplitude <= 0) {
        issues.push(issue('invalid-amplitude', 'error', sid, `${where}：幅度必须是正数`));
      } else if (
        seg.amplitude < CAMERA_MOVE_AMPLITUDE_MIN - EPS ||
        seg.amplitude > CAMERA_MOVE_AMPLITUDE_MAX + EPS
      ) {
        issues.push(
          issue(
            'invalid-amplitude',
            'warning',
            sid,
            `${where}：幅度 ${formatMoveSeconds(seg.amplitude)} 超出建议区间 ${CAMERA_MOVE_AMPLITUDE_MIN}~${CAMERA_MOVE_AMPLITUDE_MAX}`,
          ),
        );
      }
    }
    if (seg.id) {
      const n = (ids.get(seg.id) ?? 0) + 1;
      ids.set(seg.id, n);
      if (n === 2) {
        issues.push(issue('duplicate-id', 'error', seg.id, `片段 id「${seg.id}」重复`));
      }
    }
  });

  // 原始顺序是否升序
  for (let i = 1; i < rawSegments.length; i += 1) {
    const a = rawSegments[i - 1];
    const b = rawSegments[i];
    if (!finite(a?.startT) || !finite(b?.startT)) continue;
    if (b.startT < a.startT - EPS) {
      issues.push(issue('unsorted', 'warning', null, '片段未按起点升序排列（归一化会重排）'));
      break;
    }
  }

  // 重叠 / 空隙 / 覆盖（按时间顺序检查，与输入顺序无关）
  const byTime = rawSegments
    .filter((s) => finite(s?.startT) && finite(s?.endT))
    .slice()
    .sort((a, b) => a.startT - b.startT);
  for (let i = 1; i < byTime.length; i += 1) {
    const prev = byTime[i - 1];
    const cur = byTime[i];
    if (cur.startT < prev.endT - EPS) {
      issues.push(
        issue(
          'overlap',
          'error',
          cur.id ?? null,
          `「${segmentLabelZh(cur)}」与「${segmentLabelZh(prev)}」时间重叠（${formatMoveSeconds(cur.startT)}s < ${formatMoveSeconds(prev.endT)}s）`,
        ),
      );
    } else if (cur.startT - prev.endT > EPS) {
      issues.push(
        issue(
          'gap',
          'warning',
          cur.id ?? null,
          `「${segmentLabelZh(prev)}」与「${segmentLabelZh(cur)}」之间有 ${formatMoveSeconds(cur.startT - prev.endT)}s 空隙（镜头将静止）`,
        ),
      );
    }
  }
  if (byTime.length > 0 && durationOk) {
    const first = byTime[0];
    const last = byTime[byTime.length - 1];
    if (first.startT > EPS) {
      issues.push(
        issue('uncovered', 'warning', first.id ?? null, `开头 ${formatMoveSeconds(first.startT)}s 没有运镜（静止）`),
      );
    }
    if (last.endT < duration - EPS) {
      issues.push(
        issue(
          'uncovered',
          'warning',
          last.id ?? null,
          `结尾 ${formatMoveSeconds(duration - last.endT)}s 没有运镜（静止）`,
        ),
      );
    }
  }

  return finish(issues);
}

function finish(issues: CameraMoveTimelineIssue[]): CameraMoveTimelineValidation {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return { ok: errors.length === 0, errors, warnings, issues: [...errors, ...warnings] };
}

/* ── 采样 ── */

interface SegmentHit {
  segment: CameraMoveSegment | null;
  atEnd: boolean;
  linear: number;
}

function hitSegment(segments: CameraMoveSegment[], t: number, duration: number): SegmentHit {
  for (const seg of segments) {
    if (t >= seg.startT - EPS && t < seg.endT - EPS) {
      const span = seg.endT - seg.startT;
      return { segment: seg, atEnd: false, linear: span > 0 ? (t - seg.startT) / span : 0 };
    }
  }
  const last = segments[segments.length - 1];
  if (last && t >= duration - EPS && Math.abs(last.endT - duration) <= EPS) {
    return { segment: last, atEnd: true, linear: 1 };
  }
  return { segment: null, atEnd: false, linear: 0 };
}

/**
 * 采样：返回 t 时刻命中的片段、段内进度与组合运动描述。
 *
 * 边界口径：
 * - t 越界会被钳制到 [0, durationSec]，`clamped=true`；
 * - t 落在片段之间的空隙 → `segment=null, inGap=true`，进度与幅度为 0；
 * - t 恰好等于末段终点且末段覆盖到 durationSec → 命中末段，`progress=1`；
 * - 空时间轴 / 时长非法 → 返回空采样（不抛异常）。
 * - 入参会被内部归一化（排序 / 裁剪），因此对乱序输入也给出确定结果。
 */
export function sampleMoveTimelineAt(
  tl: CameraMoveTimeline | null | undefined,
  t: number,
): CameraMoveTimelineSample {
  const norm = normalizeMoveTimeline(tl);
  const duration = norm.durationSec;
  const requested = finite(t) ? t : 0;
  const clampedT = clampNum(requested, 0, Math.max(0, duration));
  const clamped = clampedT !== requested;

  if (norm.segments.length === 0) {
    return {
      t: clampedT,
      clamped,
      segment: null,
      moveId: null,
      linearProgress: 0,
      progress: 0,
      overallProgress: duration > 0 ? clampedT / duration : 0,
      amplitude: 0,
      inGap: true,
      composedZh: '',
      composedEn: '',
    };
  }

  const hit = hitSegment(norm.segments, clampedT, duration);
  const progress = hit.segment
    ? moveSegmentProgress(hit.linear, hit.segment.easing, hit.segment.speedRamp)
    : 0;

  return {
    t: clampedT,
    clamped,
    segment: hit.segment,
    moveId: hit.segment?.moveId ?? null,
    linearProgress: hit.segment ? clampNum(hit.linear, 0, 1) : 0,
    progress,
    overallProgress: duration > 0 ? clampNum(clampedT / duration, 0, 1) : 0,
    amplitude: hit.segment ? segmentAmplitude(hit.segment) : 0,
    inGap: hit.segment === null,
    composedZh: describeSequence(norm.segments, hit, clampedT, 'zh'),
    composedEn: describeSequence(norm.segments, hit, clampedT, 'en'),
  };
}

/** 组合运动描述：已执行段 → 当前段(进度%) → 待执行段 */
function describeSequence(
  segments: CameraMoveSegment[],
  hit: SegmentHit,
  t: number,
  lang: 'zh' | 'en',
): string {
  const pct = Math.round(clampNum(hit.segment ? (hit.atEnd ? 1 : hit.linear) : 0, 0, 1) * 100);
  return segments
    .map((seg) => {
      const label = lang === 'zh' ? segmentLabelZh(seg) : segmentLabelEn(seg);
      const isHit = hit.segment !== null && seg.id === hit.segment.id;
      if (isHit) return lang === 'zh' ? `【${label} ${pct}%】` : `[${label} ${pct}%]`;
      // 未命中的段：已结束的标 ✓，未开始的标 ·
      return t >= seg.endT - EPS ? `${label}✓` : `·${label}`;
    })
    .join(' → ');
}

/* ── 组合提示词 ── */

export interface BuildComposedMovePromptOptions {
  /** 片段语言（默认 'en'） */
  lang?: 'en' | 'zh' | 'both';
  /** 是否带上每段起止秒数与总时长（默认 true） */
  includeTiming?: boolean;
}

/**
 * 按时间顺序生成组合运镜提示词。
 *
 * - 未归一化输入会先归一化（排序 / 裁剪 / 去重叠），保证描述顺序与时间一致；
 * - 未知 moveId 不丢弃：短语回落为 moveId 文本，避免提示词与编排不一致；
 * - easing 只在采样与 3D 交接中使用，不写进提示词；speedRamp 会以英文短语形式进入提示词；
 * - 返回的 `text` 是**不带前缀**的片段，注入时由 `withMoveTimelinePrompt` 加
 *   `camera movement: ` / `运镜：` 前缀（与 `buildCameraMovePrompt` 同一约定）。
 */
export function buildComposedMovePrompt(
  tl: CameraMoveTimeline | null | undefined,
  opts: BuildComposedMovePromptOptions = {},
): ComposedMovePrompt {
  const lang = opts.lang ?? 'en';
  const includeTiming = opts.includeTiming ?? true;
  const norm = normalizeMoveTimeline(tl);

  const parts: ComposedMovePromptPart[] = norm.segments.map((seg) => {
    const def = lookupSegmentMove(seg);
    return {
      segmentId: seg.id,
      moveId: seg.moveId,
      labelZh: def?.labelZh ?? seg.moveId,
      labelEn: def?.labelEn ?? seg.moveId,
      startT: seg.startT,
      endT: seg.endT,
      durationSec: segmentDuration(seg),
      amplitude: segmentAmplitude(seg),
      easing: seg.easing ?? 'linear',
      speedRamp: seg.speedRamp ?? 'steady',
      phraseZh: def?.promptZh ?? seg.moveId,
      phraseEn: def?.promptEn ?? seg.moveId,
    };
  });

  const enParts = parts.map((p) => {
    const bits: string[] = [];
    if (includeTiming) bits.push(`${formatMoveSeconds(p.startT)}-${formatMoveSeconds(p.endT)}s`);
    bits.push(p.phraseEn);
    if (Math.abs(p.amplitude - CAMERA_MOVE_AMPLITUDE_DEFAULT) > EPS) {
      bits.push(`at ${formatMoveSeconds(p.amplitude)}x amplitude`);
    }
    if (p.speedRamp === 'accelerate') bits.push('gradually accelerating');
    if (p.speedRamp === 'decelerate') bits.push('gradually decelerating');
    return bits.join(' ');
  });

  const zhParts = parts.map((p) => {
    const bits: string[] = [];
    if (includeTiming) bits.push(`${formatMoveSeconds(p.startT)}–${formatMoveSeconds(p.endT)} 秒`);
    bits.push(p.phraseZh);
    if (Math.abs(p.amplitude - CAMERA_MOVE_AMPLITUDE_DEFAULT) > EPS) {
      bits.push(`幅度 ${formatMoveSeconds(p.amplitude)}×`);
    }
    if (p.speedRamp === 'accelerate') bits.push('逐渐加速');
    if (p.speedRamp === 'decelerate') bits.push('逐渐减速');
    return bits.join(' ');
  });

  const beatAligned = Boolean(norm.beatAligned);
  let en = enParts.join(' → ');
  let zh = zhParts.join(' → ');
  if (includeTiming && parts.length > 0) {
    en += ` (total ${formatMoveSeconds(norm.durationSec)}s${beatAligned ? ', beat-aligned' : ''})`;
    zh += `（共 ${formatMoveSeconds(norm.durationSec)} 秒${beatAligned ? '，按节拍对齐' : ''}）`;
  }

  const text = lang === 'zh' ? zh : lang === 'both' ? `${en} / ${zh}` : en;

  return {
    zh,
    en,
    text,
    parts,
    segmentCount: parts.length,
    durationSec: norm.durationSec,
    beatAligned,
  };
}

/** 把时间轴映射为既有 `PromptPreset` 形状，供既有消费方复用 */
export function moveTimelineToPromptPreset(
  tl: CameraMoveTimeline | null | undefined,
  opts: BuildComposedMovePromptOptions & { id?: string; group?: string; label?: string } = {},
): PromptPreset {
  const composed = buildComposedMovePrompt(tl, opts);
  return {
    id: opts.id ?? 'camera-move-timeline',
    label: opts.label ?? `运镜时间轴（${composed.segmentCount} 段 / ${formatMoveSeconds(composed.durationSec)} 秒）`,
    text: composed.en,
    group: opts.group ?? '运镜时间轴',
  };
}

/* ── 提示词注入 ── */

export interface WithMoveTimelinePromptOptions extends BuildComposedMovePromptOptions {
  /** 注入行语言；'both' 时按英文槽位写入（前缀只能是其一） */
  lang?: 'en' | 'zh' | 'both';
}

/**
 * 把组合运镜描述注入既有提示词文本。
 *
 * 与 `withCameraMovePrompt` 完全同一套槽位语义（同一行前缀）：
 * - 追加为独立一行；已存在运镜行（英文 `camera movement:` / 中文 `运镜：`）则**替换**；
 * - 时间轴没有片段时移除已注入的运镜行，其余内容原样保留；
 * - 因此「运镜时间轴」与「大师运镜多选」共用同一条运镜行，不会互相堆叠。
 */
export function withMoveTimelinePrompt(
  existing: string | undefined | null,
  tl: CameraMoveTimeline | null | undefined,
  opts: WithMoveTimelinePromptOptions = {},
): string {
  const lang = opts.lang ?? 'en';
  const enPrefix = CAMERA_MOVE_PROMPT_PREFIX_EN.toLowerCase();
  const lines = (existing ?? '').split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.toLowerCase().startsWith(enPrefix) || t.startsWith(CAMERA_MOVE_PROMPT_PREFIX_ZH)) continue;
    kept.push(line);
  }
  while (kept.length > 0 && !kept[kept.length - 1].trim()) kept.pop();

  const composed = buildComposedMovePrompt(tl, opts);
  if (!composed.text) return kept.join('\n');
  const prefix = lang === 'zh' ? CAMERA_MOVE_PROMPT_PREFIX_ZH : CAMERA_MOVE_PROMPT_PREFIX_EN;
  kept.push(lang === 'zh' ? `${prefix}${composed.text}` : `${prefix} ${composed.text}`);
  return kept.join('\n');
}

/* ── 幅度与曲线 ── */

/**
 * 总幅度：时间加权平均幅度 = Σ(段时长 × 幅度) / 总时长；片段之间空隙按 0 计。
 * 全时段覆盖且幅度均为 1 时结果为 1。总时长非法时返回 0。
 */
export function moveTimelineTotalAmplitude(tl: CameraMoveTimeline | null | undefined): number {
  const norm = normalizeMoveTimeline(tl);
  if (!(norm.durationSec > 0) || norm.segments.length === 0) return 0;
  const weighted = norm.segments.reduce(
    (acc, seg) => acc + segmentDuration(seg) * segmentAmplitude(seg),
    0,
  );
  return weighted / norm.durationSec;
}

export interface MoveTimelineCurvePoint {
  t: number;
  /** 该时刻的有效幅度（空隙 0） */
  amplitude: number;
  /** 该时刻段内进度（已应用缓动/速度曲线；空隙 0） */
  progress: number;
}

export interface MoveTimelineCurve {
  points: MoveTimelineCurvePoint[];
  /** 节拍刻度（秒）；未传 secondsPerBeat 时为空 */
  beatMarks: number[];
  /** 曲线里的最大幅度（用于 UI 归一化纵轴；至少为 1） */
  maxAmplitude: number;
}

/**
 * 幅度/进度曲线采样，供 UI 画轻量可视化（纯计算，无渲染依赖）。
 * `samples` 会被钳制到 2..512；`capSeconds` 可用于只画前 N 秒。
 */
export function moveTimelineAmplitudeCurve(
  tl: CameraMoveTimeline | null | undefined,
  opts: { samples?: number; secondsPerBeat?: number; capSeconds?: number } = {},
): MoveTimelineCurve {
  const norm = normalizeMoveTimeline(tl);
  const total = opts.capSeconds && opts.capSeconds > 0 ? Math.min(opts.capSeconds, norm.durationSec) : norm.durationSec;
  const samples = Math.round(clampNum(finite(opts.samples) ? opts.samples : 48, 2, 512));
  const points: MoveTimelineCurvePoint[] = [];
  for (let i = 0; i < samples; i += 1) {
    const t = samples === 1 ? 0 : (total * i) / (samples - 1);
    const hit = hitSegment(norm.segments, t, norm.durationSec);
    points.push({
      t,
      amplitude: hit.segment ? segmentAmplitude(hit.segment) : 0,
      progress: hit.segment ? moveSegmentProgress(hit.linear, hit.segment.easing, hit.segment.speedRamp) : 0,
    });
  }
  const beatMarks: number[] = [];
  const per = opts.secondsPerBeat;
  if (finite(per) && per > 0) {
    for (let t = per; t <= norm.durationSec + EPS; t += per) {
      beatMarks.push(Math.round(t * 1000) / 1000);
      if (beatMarks.length > 512) break;
    }
  }
  return {
    points,
    beatMarks,
    maxAmplitude: Math.max(1, ...points.map((p) => p.amplitude)),
  };
}

/* ── 按时长铺开 / 节拍对齐 ── */

/** 铺开时的片段来源：运镜 id，或带覆盖参数的完整描述 */
export type MoveTimelineSeed =
  | string
  | {
      moveId: string;
      amplitude?: number;
      easing?: CameraMoveEasing;
      speedRamp?: CameraMoveSpeedRamp;
      noteZh?: string;
      /** 自定义相对权重；给定时优先于词库 durationHintSec */
      weight?: number;
    };

export interface MoveTimelineFromShotDurationOptions {
  /** 节拍数：给定时按节拍网格吸附并把 beatAligned 置 true */
  beatCount?: number;
  /** 起始偏移秒（默认 0，即首段从 0 开始） */
  startAt?: number;
  /** 是否用词库 `durationHintSec` 中值做相对权重（默认 true） */
  useDurationHints?: boolean;
  /** 权重兜底值（默认 1） */
  defaultWeight?: number;
}

function seedWeight(seed: MoveTimelineSeed, opts: Required<Pick<MoveTimelineFromShotDurationOptions, 'useDurationHints' | 'defaultWeight'>>): number {
  if (typeof seed !== 'string' && finite(seed?.weight) && (seed.weight as number) > 0) {
    return seed.weight as number;
  }
  if (!opts.useDurationHints) return opts.defaultWeight;
  const def = lookupCameraMove(typeof seed === 'string' ? seed : seed?.moveId);
  const hint = def?.durationHintSec;
  if (hint && finite(hint[0]) && finite(hint[1]) && hint[1] > 0) {
    const mid = (Math.max(0, hint[0]) + Math.max(0, hint[1])) / 2;
    if (mid > 0) return mid;
  }
  return opts.defaultWeight;
}

/**
 * 按时长自动铺开：把一串运镜按相对权重顺序铺满镜头时长。
 *
 * 权重优先级：显式 `weight` → 词库 `durationHintSec` 中值（`useDurationHints` 时）
 * → `defaultWeight`。铺开结果整体归一化（排序 / 去重叠 / 裁剪到时长），
 * 因此返回的末段终点恰好等于 `shotDurationSec`（权重均为正时）。
 * `shotDurationSec` 非法（非有限数或 <= 0）→ 返回空时间轴（不编造时长）。
 */
export function moveTimelineFromShotDuration(
  shotDurationSec: number,
  moves: MoveTimelineSeed[] | null | undefined,
  opts: MoveTimelineFromShotDurationOptions = {},
): CameraMoveTimeline {
  const duration = finite(shotDurationSec) && shotDurationSec > 0 ? shotDurationSec : 0;
  const seeds = Array.isArray(moves) ? moves.filter((m) => m != null) : [];
  if (duration <= 0 || seeds.length === 0) {
    return {
      version: CAMERA_MOVE_TIMELINE_VERSION,
      durationSec: duration,
      segments: [],
      ...(opts.beatCount ? { beatAligned: true } : {}),
    };
  }
  const weightOpts = {
    useDurationHints: opts.useDurationHints ?? true,
    defaultWeight: opts.defaultWeight ?? 1,
  };
  const weights = seeds.map((s) => seedWeight(s, weightOpts));
  const total = weights.reduce((a, b) => a + b, 0) || seeds.length;
  const startAt = finite(opts.startAt) && opts.startAt > 0 ? Math.min(opts.startAt, duration) : 0;
  const usable = duration - startAt;

  let cursor = startAt;
  const segments: CameraMoveSegment[] = [];
  seeds.forEach((seed, i) => {
    const w = weights[i] / total;
    const isLast = i === seeds.length - 1;
    const end = isLast ? duration : cursor + usable * w;
    const obj = typeof seed === 'string' ? undefined : seed;
    segments.push({
      id: `seg-${i + 1}`,
      moveId: typeof seed === 'string' ? seed : String(seed?.moveId ?? ''),
      startT: cursor,
      endT: end,
      amplitude: obj?.amplitude ?? CAMERA_MOVE_AMPLITUDE_DEFAULT,
      easing: obj?.easing ?? 'linear',
      speedRamp: obj?.speedRamp ?? 'steady',
      ...(obj?.noteZh ? { noteZh: obj.noteZh } : {}),
    });
    cursor = end;
  });

  const laid = normalizeMoveTimeline(
    {
      version: CAMERA_MOVE_TIMELINE_VERSION,
      durationSec: duration,
      segments,
      ...(opts.beatCount ? { beatAligned: true } : {}),
    },
    { durationSec: duration },
  );

  if (opts.beatCount && opts.beatCount > 0) {
    return snapMoveTimelineToBeats(laid, opts.beatCount, { durationSec: duration });
  }
  return laid;
}

export interface SnapMoveTimelineToBeatsOptions {
  /** 节拍数（与 secondsPerBeat 二选一，优先 secondsPerBeat） */
  beatCount?: number;
  /** 每拍秒数 */
  secondsPerBeat?: number;
  /** 覆盖总时长（默认用时间轴自身时长） */
  durationSec?: number;
}

/**
 * 按节拍网格吸附：把每段的起点/终点吸附到最近的节拍刻度，再归一化。
 * 吸附后可产生零时长片段（相邻边界吸到同一刻度），按归一化规则丢弃。
 * 缺少合法节拍信息时原样返回归一化结果（不假装对齐）。
 */
export function snapMoveTimelineToBeats(
  tl: CameraMoveTimeline | null | undefined,
  beatCountOrOpts?: number | SnapMoveTimelineToBeatsOptions,
  opts: SnapMoveTimelineToBeatsOptions = {},
): CameraMoveTimeline {
  const norm = normalizeMoveTimeline(tl);
  const merged: SnapMoveTimelineToBeatsOptions =
    typeof beatCountOrOpts === 'number' ? { ...opts, beatCount: beatCountOrOpts } : { ...(beatCountOrOpts ?? {}) };
  const duration = merged.durationSec && merged.durationSec > 0 ? merged.durationSec : norm.durationSec;
  let per = merged.secondsPerBeat;
  if (!(finite(per) && per > 0)) {
    if (finite(merged.beatCount) && (merged.beatCount as number) > 0 && duration > 0) {
      per = duration / (merged.beatCount as number);
    }
  }
  if (!finite(per) || per <= 0 || duration <= 0) {
    return { ...norm, beatAligned: false };
  }
  const snap = (v: number) => clampNum(Math.round(v / per) * per, 0, duration);
  const snapped: CameraMoveSegment[] = norm.segments.map((seg) => ({
    ...seg,
    startT: snap(seg.startT),
    endT: snap(seg.endT),
  }));
  return {
    ...normalizeMoveTimeline({ ...norm, durationSec: duration, segments: snapped }),
    beatAligned: true,
  };
}

/** 判断一条时间轴是否真的按节拍对齐（边界都落在节拍刻度上） */
export function isMoveTimelineBeatAligned(
  tl: CameraMoveTimeline | null | undefined,
  beatCountOrOpts?: number | SnapMoveTimelineToBeatsOptions,
): boolean {
  const norm = normalizeMoveTimeline(tl);
  if (!norm.beatAligned || norm.segments.length === 0) return false;
  const merged: SnapMoveTimelineToBeatsOptions =
    typeof beatCountOrOpts === 'number' ? { beatCount: beatCountOrOpts } : { ...(beatCountOrOpts ?? {}) };
  const duration = merged.durationSec && merged.durationSec > 0 ? merged.durationSec : norm.durationSec;
  let per = merged.secondsPerBeat;
  if (!(finite(per) && per > 0)) {
    if (finite(merged.beatCount) && (merged.beatCount as number) > 0 && duration > 0) {
      per = duration / (merged.beatCount as number);
    }
  }
  if (!finite(per) || per <= 0) return false;
  return norm.segments.every((seg) => {
    const a = Math.round(seg.startT / per) * per;
    const b = Math.round(seg.endT / per) * per;
    return Math.abs(a - seg.startT) <= 1e-3 && Math.abs(b - seg.endT) <= 1e-3;
  });
}
