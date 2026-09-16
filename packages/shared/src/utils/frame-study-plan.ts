/**
 * frame-study-plan.ts —— 「逐帧拉片」抽帧计划 / 反推合并 / 拉片表导出（纯函数层）。
 *
 * 职责：
 * 1. `buildFrameStudyPlan`：把「用户抽帧策略」翻译成**可执行**的抽帧计划，
 *    并如实披露抽帧管线的真实落点时间码；
 * 2. `mergeFrameStudyReversals`：把逐帧反推结果按帧号归位成拉片表（缺帧留空、多余帧告警）；
 * 3. `describeFrameStudyPlan`：计划可读摘要；
 * 4. `frameStudyToStoryboardShots` / `planFrameStudyShots`：拉片表 → 分镜镜头（复用既有 StoryboardShot 形状）；
 * 5. `serializeFrameStudyJson` / `serializeFrameStudyCsv`：拉片表导出。
 *
 * ── 为什么时间码有两份（口径来源：apps/server/src/modules/montage/analyze.service.ts）──
 * 既有抽帧端点 `POST /api/montage/extract-frames` 的 ffmpeg 参数是
 * `-vf fps=1/${max(1, floor(30 / count))}` + `-frames:v count`。即：
 * - 服务端**只认 count**，不认间隔；
 * - 实际间隔被量化成 `max(1, floor(30 / count))`，可得间隔集合为
 *   {30,15,10,7,6,5,4,3,2,1} 秒（count = 1..30），**不是任意秒数**；
 * - 输出帧数上限 = count，因此**覆盖时长 = count × 间隔**，大约 30 秒
 *   （count ≤ 30 时），count > 30 时按 1 秒/帧线性延长。
 * 所以：
 * - `plan.idealTimeSec` = **策略口径**的等距时间码（count 模式含首尾等分；interval 模式自 0 等距
 *   + 末点距片尾 ≥ 半格时补片尾边界帧）——表达用户「想怎么抽」；
 * - `plan.timeSec` = **管线口径**的时间码，即帧图**实际会落点**的位置
 *   （`k × serverIntervalSec`，受时长与帧数上限裁剪）——拉片表 / 导出 / 送分镜一律以它为准。
 * 两者不一致时给 `sampling-not-even` 告警；覆盖不到片尾时给 `coverage-partial` 告警。
 * **不把理想等分时间码冒充实际帧位置**，也不为拿不到的帧编造时间码。
 *
 * ── 约束 ──
 * - 纯函数：无 IO、无副作用、不改入参、输入输出可 JSON 序列化、**不抛异常**；
 * - 不依赖 packages/shared 的 barrel（index.ts）导出；
 * - 不编造：时长未知 / 为 0 / 超长 / 抽帧策略越界时给结构化告警并把字段留空。
 */
import type {
  FrameStudyExportFormat,
  FrameStudyItem,
  FrameStudyMode,
  FrameStudyPlan,
  FrameStudyPlanInput,
  FrameStudyResult,
  FrameStudyReverseInput,
  FrameStudyStrategyDef,
  FrameStudyWarning,
  FrameStudyWarningCode,
} from '../types/frame-study';
import type { StoryboardShot } from '../types/storyboard';
import {
  MULTI_GRID_SHOT_MAX_DURATION_SEC,
  buildMultiGridShotPreviewRows,
  describeMultiGridShotPlan,
  resolveMultiGridTargetEpisode,
  shotTypeFromShotSizeLabel,
  type MultiGridTargetEpisode,
} from './multi-grid-to-shots';

/* ────────────────────────── 常量 ────────────────────────── */

/** 单次拉片的帧数上限（抽帧 × 反推都按它封顶，避免打爆 ffmpeg 与视觉通道） */
export const FRAME_STUDY_MAX_COUNT = 60;

/**
 * 服务端抽帧间隔的可达集合（秒），由 `-vf fps=1/max(1, floor(30/count))` 反推：
 * count=1→30, 2→15, 3→10, 4→7, 5→6, 6→5, 7→4, 8..10→3, 11..15→2, 16..30→1。
 */
export const FRAME_STUDY_SERVER_INTERVALS: readonly number[] = Object.freeze([
  30, 15, 10, 7, 6, 5, 4, 3, 2, 1,
]);

/** 服务端抽帧间隔上限（秒）：count=1 时 fps=1/30，再粗就拿不到了 */
export const FRAME_STUDY_MAX_INTERVAL_SEC = 30;

/** 时长「超长」阈值（秒）：超过只告警不裁剪（等距时间码仍然成立） */
export const FRAME_STUDY_MAX_DURATION_SEC = 3600;

/** 默认抽帧策略值 */
export const FRAME_STUDY_DEFAULT_COUNT = 8;
export const FRAME_STUDY_DEFAULT_INTERVAL_SEC = 3;

/** 拉片表默认出图宽高比 */
export const FRAME_STUDY_DEFAULT_ASPECT = '16:9';

/** 分镜镜头 id 前缀（与 `shot-*` / `shot-mgrid-*` / `shot-grid-*` 等既有前缀不冲突） */
export const FRAME_STUDY_SHOT_ID_PREFIX = 'shot-fstudy';

/** 防重键前缀（与 multi-grid 的 `mgw-` 命名空间分离） */
export const FRAME_STUDY_SHOT_WRITEBACK_KEY_PREFIX = 'fsw';

/** 抽帧策略元数据（UI 芯片与执行器共用同一份，避免两处口径漂移） */
export const FRAME_STUDY_STRATEGIES: readonly FrameStudyStrategyDef[] = Object.freeze([
  {
    id: 'count',
    label: '按张数',
    hint: '指定抽多少帧，等分整段时长（含首尾两帧）',
    valueLabel: '帧数',
    defaultValue: FRAME_STUDY_DEFAULT_COUNT,
    minValue: 1,
    maxValue: FRAME_STUDY_MAX_COUNT,
    unit: '帧',
  },
  {
    id: 'interval',
    label: '按间隔',
    hint: '指定每隔几秒抽一帧（服务端间隔被量化到 1/2/3/4/5/6/7/10/15/30 秒）',
    valueLabel: '间隔',
    defaultValue: FRAME_STUDY_DEFAULT_INTERVAL_SEC,
    minValue: 1,
    maxValue: FRAME_STUDY_MAX_INTERVAL_SEC,
    unit: '秒',
  },
]);

/** 时间码浮点误差容差（秒） */
const EPS = 1e-6;

/* ────────────────────────── 基础工具 ────────────────────────── */

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = finiteNumber(value);
  if (n === null) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = finiteNumber(value);
  if (n === null) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** 与 chain-storyboard / multi-grid-to-shots 同族的稳定短哈希（本模块不依赖其运行时，就地实现一份） */
function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function warning(code: FrameStudyWarningCode, messageZh: string): FrameStudyWarning {
  return { code, messageZh };
}

/** 时间码显示：`mm:ss.mmm`（超过 1 小时显示 `hh:mm:ss.mmm`） */
export function formatFrameStudyTimecode(timeSec: number | undefined | null): string {
  const n = finiteNumber(timeSec);
  if (n === null || n < 0) return '未知时间码';
  const ms = Math.round(n * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const rest = ms % 1000;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  const mmm = String(rest).padStart(3, '0');
  return h > 0 ? `${String(h).padStart(2, '0')}:${mm}:${ss}.${mmm}` : `${mm}:${ss}.${mmm}`;
}

/* ────────────────────────── 策略读取 ────────────────────────── */

export function isFrameStudyMode(value: unknown): value is FrameStudyMode {
  return value === 'count' || value === 'interval';
}

/** 从节点 data 读策略（非法值回落按张数） */
export function readFrameStudyMode(value: unknown): FrameStudyMode {
  return isFrameStudyMode(value) ? value : 'count';
}

export function lookupFrameStudyStrategy(mode: string | undefined): FrameStudyStrategyDef {
  return FRAME_STUDY_STRATEGIES.find((s) => s.id === mode) ?? FRAME_STUDY_STRATEGIES[0]!;
}

/* ────────────────────────── 抽帧管线口径 ────────────────────────── */

/** 服务端 count → 实际抽帧间隔（秒）；与 `fps=1/max(1, floor(30/count))` 一致 */
export function frameStudyServerIntervalSec(count: number): number {
  const n = clampInt(count, 1, FRAME_STUDY_MAX_COUNT, 1);
  return Math.max(1, Math.floor(30 / n));
}

/** 服务端实际抽帧间隔 → 应请求的 count（取该间隔在可达集合里的最大 count = 最密采样） */
export function frameStudyCountForServerInterval(intervalSec: number): number {
  const target = clampNumber(intervalSec, 1, FRAME_STUDY_MAX_INTERVAL_SEC, 1);
  let best = 1;
  for (let count = 1; count <= FRAME_STUDY_MAX_COUNT; count += 1) {
    if (frameStudyServerIntervalSec(count) === target) best = count;
  }
  return best;
}

/**
 * 把用户期望间隔量化到服务端可达间隔（集合见 FRAME_STUDY_SERVER_INTERVALS）。
 * 规则：取「不超过期望值」的可达间隔里最大者（即采样密度不低于用户要求）；
 * 都不满足（期望 < 1 秒）时取 1 秒。`quantized` 表示发生了量化 ——
 * 比较基准是**用户原始期望值**（越界如 120s 也算量化，调用方据此给 interval-clamped 告警）。
 */
export function quantizeFrameStudyInterval(intervalSec: number): {
  intervalSec: number;
  count: number;
  quantized: boolean;
} {
  const rawWant = finiteNumber(intervalSec) ?? FRAME_STUDY_DEFAULT_INTERVAL_SEC;
  const want = clampNumber(rawWant, 0, FRAME_STUDY_MAX_INTERVAL_SEC, FRAME_STUDY_DEFAULT_INTERVAL_SEC);
  const candidates = FRAME_STUDY_SERVER_INTERVALS.filter((v) => v <= want + EPS);
  const picked = candidates.length > 0 ? Math.max(...candidates) : 1;
  return {
    intervalSec: picked,
    count: frameStudyCountForServerInterval(picked),
    quantized: Math.abs(picked - rawWant) > EPS,
  };
}

/**
 * 策略 → 交给 `POST /api/montage/extract-frames` 的 count。
 * - count 模式：就是用户要的张数；
 * - interval 模式：先把间隔量化到服务端可达间隔，再换算 count。
 */
export function frameStudyRequestCount(mode: FrameStudyMode, value: number): number {
  if (mode === 'count') {
    return clampInt(value, 1, FRAME_STUDY_MAX_COUNT, FRAME_STUDY_DEFAULT_COUNT);
  }
  return quantizeFrameStudyInterval(value).count;
}

/** 管线口径时间码：`k × serverIntervalSec`（k 从 0 起），受 duration 与帧数上限裁剪 */
export function frameStudyPipelineTimecodes(
  requestedCount: number,
  durationSec: number | null,
): number[] {
  const count = clampInt(requestedCount, 1, FRAME_STUDY_MAX_COUNT, 1);
  const step = frameStudyServerIntervalSec(count);
  const out: number[] = [];
  for (let k = 0; k < count; k += 1) {
    const t = round3(k * step);
    if (durationSec !== null && t > durationSec + EPS) break;
    out.push(t);
  }
  return out.length > 0 ? out : [0];
}

/* ────────────────────────── ① 抽帧计划 ────────────────────────── */

/** 时长归一：无效 / 0 / 负数 → null（不编造），超长只告警 */
function normalizeDuration(raw: unknown): {
  durationSec: number | null;
  warning?: FrameStudyWarning;
} {
  if (raw === null || raw === undefined || raw === '') {
    return {
      durationSec: null,
      warning: warning(
        'duration-unknown',
        '未探到视频时长：按张数等分与片尾边界帧无法计算，时间码留空（不编造时长）。可点「探测时长」重试。',
      ),
    };
  }
  const n = finiteNumber(raw);
  if (n === null) {
    return {
      durationSec: null,
      warning: warning(
        'duration-unknown',
        `视频时长不是有效数字（收到 ${String(raw)}）：时间码留空，不编造时长。`,
      ),
    };
  }
  if (n <= 0) {
    return {
      durationSec: null,
      warning: warning('duration-zero', `视频时长为 ${n}s（零或负数）：无法据此排时间码，时间码留空。`),
    };
  }
  if (n > FRAME_STUDY_MAX_DURATION_SEC) {
    return {
      durationSec: round3(n),
      warning: warning(
        'duration-too-long',
        `视频时长 ${round3(n)}s 超过 ${FRAME_STUDY_MAX_DURATION_SEC}s：仍按时长排时间码，但请确认这是长片而不是时长解析错误。`,
      ),
    };
  }
  return { durationSec: round3(n) };
}

/**
 * 策略口径的等距时间码。
 * - count 模式（需时长）：`i × duration / (n-1)`，i 从 0 到 n-1 → **含首尾**；n=1 时只有 `0`。
 * - interval 模式：自 `0` 起按间隔等距；末点距片尾 ≥ 半格且帧数未超上限时补一个片尾边界帧。
 * 时长未知时 count 模式返回空数组（不编造）；interval 模式按帧数上限截断。
 */
export function frameStudyIdealTimecodes(
  mode: FrameStudyMode,
  value: number,
  durationSec: number | null,
  frameLimit: number,
): number[] {
  const limit = clampInt(frameLimit, 1, FRAME_STUDY_MAX_COUNT, 1);
  if (mode === 'count') {
    const n = clampInt(value, 1, FRAME_STUDY_MAX_COUNT, FRAME_STUDY_DEFAULT_COUNT);
    if (durationSec === null) return [];
    if (n === 1) return [0];
    const out: number[] = [];
    for (let i = 0; i < n; i += 1) out.push(round3((i * durationSec) / (n - 1)));
    return out;
  }
  const step = clampNumber(value, 1, FRAME_STUDY_MAX_INTERVAL_SEC, FRAME_STUDY_DEFAULT_INTERVAL_SEC);
  if (durationSec === null) {
    // 时长未知：只能按帧数上限铺等距点（如实由告警说明，不假装覆盖到片尾）
    return Array.from({ length: limit }, (_, i) => round3(i * step));
  }
  const out: number[] = [];
  for (let t = 0; t < durationSec - EPS && out.length < limit; t += step) {
    out.push(round3(t));
  }
  if (out.length === 0) out.push(0);
  const last = out[out.length - 1]!;
  // 片尾边界：剩余不足半格不补（避免与前一帧几乎重合）
  if (durationSec - last >= step / 2 - EPS && out.length < limit) out.push(round3(durationSec));
  return out;
}

/**
 * 生成抽帧计划。**不抛异常**：非法输入一律降级为结构化告警 + 留空字段。
 */
export function buildFrameStudyPlan(input: FrameStudyPlanInput): FrameStudyPlan {
  const mode = readFrameStudyMode(input?.mode);
  const strategy = lookupFrameStudyStrategy(mode);
  const sourceUrl = trimmed(input?.sourceUrl);
  const aspectRatio = trimmed(input?.aspectRatio) || FRAME_STUDY_DEFAULT_ASPECT;
  const warnings: FrameStudyWarning[] = [];

  const rawValue = finiteNumber(input?.value) ?? strategy.defaultValue;

  const { durationSec, warning: durationWarning } = normalizeDuration(input?.durationSec);
  if (durationWarning) warnings.push(durationWarning);

  // ── 策略值裁剪 + count 换算 ──
  let value: number;
  let requestedCount: number;
  if (mode === 'count') {
    const n = clampInt(rawValue, 1, FRAME_STUDY_MAX_COUNT, strategy.defaultValue);
    if (n !== Math.trunc(rawValue)) {
      warnings.push(
        warning(
          'count-clamped',
          `抽帧张数已从 ${rawValue} 收敛到 ${n}（允许范围 1–${FRAME_STUDY_MAX_COUNT} 帧）。`,
        ),
      );
    }
    value = n;
    requestedCount = n;
  } else {
    const quantized = quantizeFrameStudyInterval(rawValue);
    if (Math.abs(rawValue - quantized.intervalSec) > EPS) {
      warnings.push(
        warning(
          'interval-clamped',
          `抽帧间隔已从 ${round3(rawValue)}s 调整为 ${quantized.intervalSec}s：` +
            `抽帧管线按 fps=1/N 采样，可达间隔只有 ${FRAME_STUDY_SERVER_INTERVALS.join('/')} 秒。`,
        ),
      );
    }
    value = quantized.intervalSec;
    requestedCount = quantized.count;
  }

  const serverIntervalSec = frameStudyServerIntervalSec(requestedCount);
  const pipelineTimecodes = frameStudyPipelineTimecodes(requestedCount, durationSec);
  const idealTimecodes = frameStudyIdealTimecodes(mode, value, durationSec, requestedCount);
  const timeSecKnown = durationSec !== null;
  const timeSec = pipelineTimecodes;
  const coverageSec = timeSec.length > 0 ? timeSec[timeSec.length - 1]! : 0;

  // ── 策略口径需要更多帧、但管线一次只给 requestedCount 帧 ──
  const idealWithinLimit = frameStudyIdealTimecodes(mode, value, durationSec, FRAME_STUDY_MAX_COUNT);
  if (durationSec !== null && idealWithinLimit.length > requestedCount) {
    warnings.push(
      warning(
        'frame-count-clamped',
        `按当前策略整段排帧需要 ${idealWithinLimit.length} 帧，本次最多请求 ${requestedCount} 帧：` +
          `只能抽到前 ${round3(coverageSec)}s（抽帧端点每帧最多覆盖约 30s，count > 30 时按 1s/帧延长）。` +
          `需要整段覆盖请分段拉片。`,
      ),
    );
  }

  // ── 管线口径 vs 策略口径：时间码不是等分的，必须说清楚 ──
  const idealMatchesPipeline =
    idealTimecodes.length === timeSec.length &&
    idealTimecodes.every((t, i) => Math.abs(t - (timeSec[i] ?? -1)) < 0.05);
  if (timeSecKnown && !idealMatchesPipeline && idealTimecodes.length > 0) {
    warnings.push(
      warning(
        'sampling-not-even',
        `拉片表时间码按**抽帧管线实际落点**标注（${requestedCount} 帧 × ${serverIntervalSec}s 间隔），` +
          `不是按整段时长等分。等分口径见「策略时间码」，导出与送分镜一律用实际落点。`,
      ),
    );
  }

  // ── 覆盖不全 / 间隔大于时长 / 排不出帧 ──
  if (durationSec !== null && serverIntervalSec > durationSec + EPS) {
    warnings.push(
      warning(
        'interval-exceeds-duration',
        `抽帧间隔 ${serverIntervalSec}s 大于视频时长 ${round3(durationSec)}s：只能取到 t=0 的一帧。` +
          `请改用「按张数」或减小间隔。`,
      ),
    );
  }
  if (durationSec !== null && coverageSec + serverIntervalSec / 2 < durationSec) {
    warnings.push(
      warning(
        'coverage-partial',
        `本次抽帧最多覆盖 0–${round3(coverageSec)}s，视频总长 ${round3(durationSec)}s，` +
          `片尾约 ${round3(durationSec - coverageSec)}s 未被抽到（抽帧管线按 count × 间隔 取帧）。` +
          `需要覆盖更长片段时请提高张数（上限 ${FRAME_STUDY_MAX_COUNT}）或分段拉片。`,
      ),
    );
  }
  if (timeSec.length === 0) {
    // 兜底：frameStudyPipelineTimecodes 正常至少给出 t=0；仅当入参被外部伪造时才会走到这里
    warnings.push(
      warning('invalid-plan', '当前策略与时长排不出任何帧：请检查抽帧张数 / 间隔与视频时长。'),
    );
  }

  return {
    sourceUrl,
    durationSec,
    mode,
    value,
    rawValue,
    requestedCount,
    serverIntervalSec,
    timeSec,
    idealTimeSec: idealTimecodes,
    timeSecKnown,
    coverageSec: round3(coverageSec),
    aspectRatio,
    notesZh: describeFrameStudyPlanBody({
      mode,
      value,
      requestedCount,
      serverIntervalSec,
      timeSec,
      durationSec,
      coverageSec,
      timeSecKnown,
    }),
    warnings,
  };
}

/** 计划正文（notesZh 用；与 describeFrameStudyPlan 同源，避免两处文案漂移） */
function describeFrameStudyPlanBody(input: {
  mode: FrameStudyMode;
  value: number;
  requestedCount: number;
  serverIntervalSec: number;
  timeSec: number[];
  durationSec: number | null;
  coverageSec: number;
  timeSecKnown: boolean;
}): string {
  const strategy = lookupFrameStudyStrategy(input.mode);
  const head =
    input.mode === 'count'
      ? `按张数：请求抽 ${input.value} 帧`
      : `按间隔：每 ${input.value} 秒一帧（请求 count=${input.requestedCount}）`;
  const durationNote =
    input.durationSec === null
      ? '视频时长未知'
      : `视频时长 ${round3(input.durationSec)}s`;
  const timeNote = input.timeSecKnown
    ? `时间码 ${formatFrameStudyTimecode(input.timeSec[0] ?? 0)} → ${formatFrameStudyTimecode(input.coverageSec)}（共 ${input.timeSec.length} 帧）`
    : '时间码未知（时长未探到，按管线帧序推进）';
  return (
    `逐帧拉片 · ${strategy.label} —— ${head}；${durationNote}；` +
    `抽帧管线实际间隔 ${input.serverIntervalSec}s，${timeNote}。` +
    `时间码按抽帧管线实际落点标注，不是整段等分。`
  );
}

/** 可读摘要（首行 + 时间码清单 + 告警），供面板与日志直接用 */
export function describeFrameStudyPlan(plan: FrameStudyPlan | undefined | null): string {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.timeSec)) {
    return '抽帧计划不可用：请先连接上游视频并探测时长。';
  }
  const lines = [plan.notesZh];
  if (plan.timeSec.length > 0) {
    const list = plan.timeSec
      .map((t, i) => `#${i + 1} ${formatFrameStudyTimecode(t)}`)
      .join(' · ');
    lines.push(list);
  }
  if (plan.warnings.length > 0) {
    for (const w of plan.warnings) lines.push(`⚠ ${w.messageZh}`);
  }
  return lines.join('\n');
}

/* ────────────────────────── ② 从反推文本里字面提取标签 ────────────────────────── */

/** 归一化匹配文本：小写、`-` 视为空格、压缩空白（保留中文原样） */
function normalizeMatchText(text: string): string {
  return text.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

interface LabelTerm {
  /** 归一化后的检索词（ASCII 词要求整词命中） */
  term: string;
  label: string;
}

/** 景别词表：只认**完整景别词**（bare 形容词如 wide / close 不算命中，避免误标） */
const SHOT_SIZE_TERMS: readonly LabelTerm[] = Object.freeze(
  ([
    { term: 'extreme wide shot', label: '大远景' },
    { term: 'extreme long shot', label: '大远景' },
    { term: 'extreme close up', label: '特写' },
    { term: 'medium close up', label: '近景' },
    { term: 'medium shot', label: '中景' },
    { term: 'full shot', label: '全景' },
    { term: 'long shot', label: '远景' },
    { term: 'wide shot', label: '全景' },
    { term: 'close up', label: '特写' },
    { term: '大远景', label: '大远景' },
    { term: '中近景', label: '近景' },
    { term: '远景', label: '远景' },
    { term: '全景', label: '全景' },
    { term: '中景', label: '中景' },
    { term: '近景', label: '近景' },
    { term: '特写', label: '特写' },
  ] as LabelTerm[]).slice().sort((a, b) => b.term.length - a.term.length),
);

/**
 * 运镜词表：命中值一律落在分镜台拆镜枚举 `固定/推/拉/摇/移/跟/手持` 上，
 * 保证写入拆镜结构时不会被既有映射丢弃（口径见 multi-grid-to-shots）。
 * 词条写成**显式变体**（含 -ing / 三单等形式），不做词干还原 ——
 * 反推文本是英文短句，显式变体比正则还原更可控、更可测。
 */
const CAMERA_MOVE_TERMS: readonly LabelTerm[] = Object.freeze(
  ([
    { term: 'tracking shot', label: '移' },
    { term: 'following shot', label: '跟' },
    { term: 'locked off', label: '固定' },
    { term: 'static shot', label: '固定' },
    { term: 'dolly shot', label: '移' },
    { term: 'follow shot', label: '跟' },
    { term: 'handheld', label: '手持' },
    { term: 'tracking', label: '移' },
    { term: 'trucking', label: '移' },
    { term: 'pushing in', label: '推' },
    { term: 'dollying in', label: '推' },
    { term: 'zooming in', label: '推' },
    { term: 'pulling out', label: '拉' },
    { term: 'dollying out', label: '拉' },
    { term: 'zooming out', label: '拉' },
    { term: 'push in', label: '推' },
    { term: 'dolly in', label: '推' },
    { term: 'zoom in', label: '推' },
    { term: 'pull out', label: '拉' },
    { term: 'dolly out', label: '拉' },
    { term: 'zoom out', label: '拉' },
    { term: 'panning', label: '摇' },
    { term: 'pans', label: '摇' },
    { term: 'pan', label: '摇' },
    { term: 'truck', label: '移' },
    { term: '固定机位', label: '固定' },
    { term: '机位固定', label: '固定' },
    { term: '固定镜头', label: '固定' },
    { term: '移动镜头', label: '移' },
    { term: '手持', label: '手持' },
    { term: '跟随', label: '跟' },
    { term: '跟拍', label: '跟' },
    { term: '摇镜', label: '摇' },
    { term: '摇摄', label: '摇' },
    { term: '推镜', label: '推' },
    { term: '推近', label: '推' },
    { term: '前推', label: '推' },
    { term: '拉镜', label: '拉' },
    { term: '拉远', label: '拉' },
    { term: '后拉', label: '拉' },
    { term: '平移', label: '移' },
    { term: '横移', label: '移' },
  ] as LabelTerm[]).slice().sort((a, b) => b.term.length - a.term.length),
);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 词表命中：ASCII 词按整词匹配（`\bpan\b` 不会命中 panorama），中文词按包含匹配 */
function matchLabelTerm(text: string, terms: readonly LabelTerm[]): string | undefined {
  const haystack = normalizeMatchText(text);
  if (!haystack) return undefined;
  for (const item of terms) {
    const isAscii = /^[\x20-\x7e]+$/.test(item.term);
    if (isAscii) {
      if (new RegExp(`\\b${escapeRegExp(item.term)}\\b`).test(haystack)) return item.label;
    } else if (haystack.includes(item.term)) {
      return item.label;
    }
  }
  return undefined;
}

/**
 * 从反推文本里**字面**提取景别标签（大远景/远景/全景/中景/近景/特写）。
 * 只认完整景别词，未出现即返回 undefined —— **不做语义推断、不猜**。
 */
export function extractFrameStudyShotSizeLabel(
  ...texts: (string | undefined | null)[]
): string | undefined {
  for (const t of texts) {
    const hit = matchLabelTerm(trimmed(t), SHOT_SIZE_TERMS);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * 从反推文本里**字面**提取运镜标签（固定/推/拉/摇/移/跟/手持）。
 * 未出现即返回 undefined —— 不做语义推断。
 */
export function extractFrameStudyCameraMoveLabel(
  ...texts: (string | undefined | null)[]
): string | undefined {
  for (const t of texts) {
    const hit = matchLabelTerm(trimmed(t), CAMERA_MOVE_TERMS);
    if (hit) return hit;
  }
  return undefined;
}

/* ────────────────────────── ③ 反推合并（拉片表） ────────────────────────── */

/** 计划槽位数：有确切时间码时 = 时间码数；时长未知时按请求帧数（管线仍会返回帧图） */
function planSlotCount(plan: FrameStudyPlan): number {
  if (plan.timeSec.length > 0) return plan.timeSec.length;
  return clampInt(plan.requestedCount, 1, FRAME_STUDY_MAX_COUNT, 1);
}

function failedResult(messageZh: string): FrameStudyResult {
  const plan = buildFrameStudyPlan({ mode: 'count', value: 1 });
  return {
    ok: false,
    plan,
    items: [],
    frameCount: 0,
    reversedCount: 0,
    warnings: [warning('invalid-plan', messageZh)],
    messageZh,
  };
}

/**
 * 把逐帧反推结果按帧号合并成拉片表。
 *
 * 归位规则（后到不覆盖先到，保证纯函数确定性）：
 * - 按 `index` 归位，与 results 的先后顺序无关（乱序输入结果一致）；
 * - 同一 index 出现多次：**首次出现者生效**，其余丢弃并给 `duplicate-result` 告警；
 * - index 非整数 / 负数 / ≥ 计划槽位数：丢弃并给 `out-of-range-result` 告警（不塞进别的帧）；
 * - 缺帧（无帧图）：条目保留、字段留空，计入 `missing-frame`（不编造图，也不假装成功）；
 * - 有帧图但没反推文本且无失败原因：计入 `missing-reversal`，提示词留空；
 * - 带 `error` 的条目：原因写进 `notes`，计入 `reverse-failed`。
 *
 * `ok` 仅当至少一条拿到可用帧图；`timeSec` 优先取结果自带值（执行器按管线落点给出），
 * 缺省才回落计划时间码。
 */
export function mergeFrameStudyReversals(
  plan: FrameStudyPlan | undefined | null,
  results: readonly FrameStudyReverseInput[] | undefined | null,
): FrameStudyResult {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.timeSec)) {
    return failedResult('抽帧计划不可用（缺少 timeSec）：未生成拉片表（不编造）');
  }
  const slots = planSlotCount(plan);
  const list = Array.isArray(results) ? (results as readonly FrameStudyReverseInput[]) : [];
  const warnings: FrameStudyWarning[] = [];

  const taken: (FrameStudyReverseInput | undefined)[] = new Array(slots).fill(undefined);
  let outOfRange = 0;
  let duplicates = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') {
      outOfRange += 1;
      continue;
    }
    const index = Number(raw.index);
    if (!Number.isInteger(index) || index < 0 || index >= slots) {
      outOfRange += 1;
      continue;
    }
    if (taken[index]) {
      duplicates += 1;
      continue;
    }
    taken[index] = raw;
  }

  let missingFrame = 0;
  let missingReversal = 0;
  let reverseFailed = 0;
  const items: FrameStudyItem[] = [];

  for (let index = 0; index < slots; index += 1) {
    const src = taken[index];
    const thumbnailUrl = trimmed(src?.thumbnailUrl);
    const reversePromptZh = trimmed(src?.reversePromptZh);
    const reversePromptEn = trimmed(src?.reversePromptEn);
    const rawTime = finiteNumber(src?.timeSec);
    const planTime = finiteNumber(plan.timeSec[index]);
    const timeSec =
      rawTime !== null && rawTime >= 0 ? round3(rawTime) : planTime !== null ? round3(planTime) : undefined;
    const error = trimmed(src?.error);

    if (!thumbnailUrl) missingFrame += 1;
    if (thumbnailUrl && !reversePromptZh && !reversePromptEn && !error) missingReversal += 1;
    if (error) reverseFailed += 1;

    const notes = error
      ? `第 ${index + 1} 帧反推失败：${error}`
      : thumbnailUrl
        ? undefined
        : '该帧没有帧图（抽帧未返回或与计划帧号未对上）';

    // 景别 / 运镜：结果自带值优先，缺省时从反推文本里**字面**提取（提取不到即不写字段）
    const shotSizeLabel =
      trimmed(src?.shotSizeLabel) ||
      extractFrameStudyShotSizeLabel(reversePromptZh, reversePromptEn);
    const cameraMoveLabel =
      trimmed(src?.cameraMoveLabel) ||
      extractFrameStudyCameraMoveLabel(reversePromptZh, reversePromptEn);

    items.push({
      index,
      ...(timeSec !== undefined ? { timeSec } : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      ...(reversePromptZh ? { reversePromptZh } : {}),
      ...(reversePromptEn ? { reversePromptEn } : {}),
      ...(shotSizeLabel ? { shotSizeLabel } : {}),
      ...(cameraMoveLabel ? { cameraMoveLabel } : {}),
      ...(notes ? { notes } : {}),
    });
  }

  const frameCount = items.filter((i) => (i.thumbnailUrl ?? '').length > 0).length;
  const reversedCount = items.filter((i) =>
    Boolean((i.reversePromptZh ?? '').length > 0 || (i.reversePromptEn ?? '').length > 0),
  ).length;

  if (missingFrame > 0) {
    warnings.push(
      warning(
        'missing-frame',
        `有 ${missingFrame}/${slots} 帧没有帧图：对应条目的图与提示词留空（不编造）。` +
          `请确认视频地址可访问、ffmpeg 可用，或重跑抽帧。`,
      ),
    );
  }
  if (missingReversal > 0) {
    warnings.push(
      warning(
        'missing-reversal',
        `有 ${missingReversal} 帧有图但没拿到反推提示词：该帧提示词留空，可单帧重推。`,
      ),
    );
  }
  if (reverseFailed > 0) {
    warnings.push(
      warning('reverse-failed', `有 ${reverseFailed} 帧反推失败：失败原因已如实写在对应帧的备注里。`),
    );
  }
  if (duplicates > 0) {
    warnings.push(
      warning('duplicate-result', `有 ${duplicates} 条重复帧号的反推结果：只取首次出现的一条，其余丢弃。`),
    );
  }
  if (outOfRange > 0) {
    warnings.push(
      warning(
        'out-of-range-result',
        `有 ${outOfRange} 条反推结果的帧号不在计划范围内（0–${slots - 1}）：已丢弃，未写进别的帧。`,
      ),
    );
  }
  if (!plan.timeSecKnown) {
    warnings.push(
      warning(
        'duration-unknown',
        '视频时长未知：计划帧数与时间码按抽帧网格给出，实际返回帧数可能更少；' +
          '缺失的帧其图与提示词如实留空（不补造帧）。',
      ),
    );
  }

  const ok = frameCount > 0;
  const allFrames = frameCount === slots;
  const allReversed = reversedCount === frameCount;
  const messageZh = !ok
    ? list.length === 0
      ? '抽帧未返回任何帧：未生成拉片表（请检查视频地址 / ffmpeg 是否可用，禁止空成功）'
      : '抽帧返回的帧与计划帧号未对上：拉片表为空（禁止空成功）'
    : allFrames && allReversed
      ? `拉片表完成：${frameCount} 帧全部有帧图且全部拿到反推提示词`
      : `拉片表完成：${frameCount}/${slots} 帧有帧图，其中 ${reversedCount} 帧拿到反推提示词，其余如实留空`;

  return { ok, plan, items, frameCount, reversedCount, warnings, messageZh };
}

/* ────────────────────────── ④ 拉片表 → 分镜镜头 ────────────────────────── */

export interface FrameStudyShotIdInput {
  plan: FrameStudyPlan;
  item: FrameStudyItem;
  order: number;
}

export interface FrameStudyShotsOptions {
  /** 上游链镜表镜头：用于序号续接、分集继承（缺省按 1 起序号并告警） */
  upstreamShots?: readonly StoryboardShot[];
  episodeId?: string | null;
  episodeIndex?: number | null;
  episodeTitle?: string | null;
  startIndex?: number;
  /** 统一单镜时长覆盖（秒）；缺省按抽帧间隔（受 1–120s 收敛） */
  defaultDurationSec?: number;
  /** id 生成器注入（缺省 `buildFrameStudyShotId`，同输入必同输出） */
  idFactory?: (input: FrameStudyShotIdInput) => string;
}

export interface FrameStudyShotPlanResult {
  ok: boolean;
  shots: StoryboardShot[];
  startIndex: number;
  nextIndex: number;
  targetEpisode: MultiGridTargetEpisode;
  warnings: FrameStudyWarning[];
  /** 防重键：同一拉片表 + 同一批镜头必得同一个键 */
  key: string;
  summaryZh: string;
}

function emptyTargetEpisode(): MultiGridTargetEpisode {
  return { episodeId: null, episodeIndex: null, episodeTitle: null, scopedShots: [], startIndex: 1 };
}

/** 单镜时长：相邻帧时间差；只有一帧时取视频时长或抽帧间隔，并收敛到 1–120s */
function frameStudyStepSec(plan: FrameStudyPlan): number {
  const times = plan.timeSec;
  if (times.length >= 2) {
    const diff = round3((times[1] as number) - (times[0] as number));
    if (diff > 0) return Math.min(diff, MULTI_GRID_SHOT_MAX_DURATION_SEC);
  }
  const duration = plan.durationSec;
  if (duration !== null && duration > 0) {
    return Math.min(round3(duration), MULTI_GRID_SHOT_MAX_DURATION_SEC);
  }
  return Math.min(Math.max(plan.serverIntervalSec, 1), MULTI_GRID_SHOT_MAX_DURATION_SEC);
}

function frameStudyDurationSec(
  item: FrameStudyItem,
  next: FrameStudyItem | undefined,
  step: number,
): number {
  const a = finiteNumber(item.timeSec);
  const b = finiteNumber(next?.timeSec);
  if (a !== null && b !== null && b > a) {
    return Math.min(Math.max(round3(b - a), 1), MULTI_GRID_SHOT_MAX_DURATION_SEC);
  }
  return Math.min(Math.max(step, 1), MULTI_GRID_SHOT_MAX_DURATION_SEC);
}

/** 默认 id：`shot-fstudy-<帧号>-<hash8>`；改写提示词后 id 随之改变（可写回为新镜） */
export function buildFrameStudyShotId(input: FrameStudyShotIdInput): string {
  const { plan, item, order } = input;
  const seed = [
    trimmed(plan?.sourceUrl),
    plan?.mode ?? '',
    String(order),
    String(finiteNumber(item?.timeSec) ?? 'unknown'),
    trimmed(item?.reversePromptEn),
    trimmed(item?.reversePromptZh),
  ].join('|');
  return `${FRAME_STUDY_SHOT_ID_PREFIX}-${order}-${stableHash(seed)}`;
}

function describeFrameStudyShotItem(input: {
  item: FrameStudyItem;
  order: number;
  total: number;
  step: number;
}): string {
  const { item, order, total, step } = input;
  const head = `【逐帧拉片 · 第 ${order + 1}/${total} 帧】`;
  const when =
    item.timeSec === undefined
      ? '时间码未知（未探到视频时长）'
      : `时间码 ${formatFrameStudyTimecode(item.timeSec)}（第 ${round3(item.timeSec)} 秒）`;
  const measure = [trimmed(item.shotSizeLabel), trimmed(item.cameraMoveLabel)]
    .filter(Boolean)
    .join(' · ');
  const body = trimmed(item.reversePromptZh) || trimmed(item.reversePromptEn);
  return (
    `${head}${when}${measure ? `；${measure}` : ''}；` +
    (body ? `画面：${body}` : '该帧尚无反推提示词（可在拉片表中单帧重推）') +
    `；单镜参考时长约 ${step}s。`
  );
}

function describeFrameStudyShotNotes(item: FrameStudyItem, order: number, total: number): string {
  const parts = [`逐帧拉片第 ${order + 1}/${total} 帧`];
  parts.push(
    item.timeSec === undefined
      ? '时间码未知'
      : `时间码 ${formatFrameStudyTimecode(item.timeSec)}`,
  );
  parts.push('时间码按抽帧管线实际落点标注（非整段等分）');
  if (item.notes) parts.push(item.notes);
  return parts.join(' · ');
}

function frameStudyVideoPromptEn(item: FrameStudyItem): string {
  const base = trimmed(item.reversePromptEn);
  if (!base) return '';
  return `Hold this frame as the first frame and continue the action: ${base}`;
}

function failedShotPlan(messageZh: string): FrameStudyShotPlanResult {
  return {
    ok: false,
    shots: [],
    startIndex: 1,
    nextIndex: 1,
    targetEpisode: emptyTargetEpisode(),
    warnings: [warning('invalid-plan', messageZh)],
    key: '',
    summaryZh: messageZh,
  };
}

/**
 * 拉片表 → 分镜镜头（含告警 / 防重键 / 分集与序号解析）。
 * 复用既有 `StoryboardShot` 形状与 multi-grid-to-shots 的景别映射、序号续接口径，
 * 不新造字段：抽帧时间码只写进既有 `descriptionZh` / `notes`。
 */
export function planFrameStudyShots(
  plan: FrameStudyPlan | undefined | null,
  result: FrameStudyResult | undefined | null,
  options: FrameStudyShotsOptions = {},
): FrameStudyShotPlanResult {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.timeSec)) {
    return failedShotPlan('抽帧计划不可用：未生成镜头（请先生成拉片表）');
  }
  const items = Array.isArray(result?.items) ? (result!.items as FrameStudyItem[]) : [];
  const frameItems = items.filter((i) => trimmed(i.thumbnailUrl).length > 0);
  if (items.length === 0) {
    return failedShotPlan('拉片表没有可用的帧：请先抽帧并反推（不生成空镜头）');
  }
  if (frameItems.length === 0) {
    return failedShotPlan('拉片表里没有任何帧图：未生成镜头（没有首帧的拉片镜头没有意义，禁止空成功）');
  }

  const warnings: FrameStudyWarning[] = [];
  const sourceUrl = trimmed(plan.sourceUrl);
  if (!sourceUrl) {
    warnings.push(
      warning('invalid-plan', '计划缺少源视频地址：镜头备注里的来源信息会留空（不编造素材）。'),
    );
  }
  const missingThumb = items.filter((i) => !trimmed(i.thumbnailUrl)).length;
  if (missingThumb > 0) {
    warnings.push(
      warning(
        'missing-frame',
        `有 ${missingThumb} 帧没有帧图：对应镜头 firstFrameAssetId 留空（draft），可在补齐后重写首帧。`,
      ),
    );
  }

  const targetEpisode = resolveMultiGridTargetEpisode(options.upstreamShots, {
    episodeId: options.episodeId,
    episodeIndex: options.episodeIndex,
    episodeTitle: options.episodeTitle,
    startIndex: options.startIndex,
  });
  if (targetEpisode.scopedShots.length === 0) {
    warnings.push(
      warning(
        'invalid-plan',
        '未取得上游链镜表（chainStoryboard）：本批序号从 1 开始，可能与该集既有镜头重号，请在分镜台核对后再写回。',
      ),
    );
  }

  const step = frameStudyStepSec(plan);
  const overrideDuration = finiteNumber(options.defaultDurationSec);
  const idFactory = options.idFactory ?? buildFrameStudyShotId;
  const total = items.length;
  const shots: StoryboardShot[] = items.map((item, order) => {
    const next = items[order + 1];
    const durationSec =
      overrideDuration !== null && overrideDuration > 0
        ? Math.min(Math.max(round3(overrideDuration), 1), MULTI_GRID_SHOT_MAX_DURATION_SEC)
        : frameStudyDurationSec(item, next, step);
    const mapped = shotTypeFromShotSizeLabel(trimmed(item.shotSizeLabel));
    const thumb = trimmed(item.thumbnailUrl);
    const move = trimmed(item.cameraMoveLabel);
    return {
      id: idFactory({ plan, item, order }),
      episodeId: targetEpisode.episodeId,
      episodeIndex: targetEpisode.episodeIndex,
      episodeTitle: targetEpisode.episodeTitle,
      index: targetEpisode.startIndex + order,
      durationSec,
      shotType: mapped.shotType,
      descriptionZh: describeFrameStudyShotItem({ item, order, total, step: durationSec }),
      promptEn: trimmed(item.reversePromptEn),
      videoPromptEn: frameStudyVideoPromptEn(item),
      firstFrameAssetId: thumb || null,
      keyframeStatus: thumb ? 'review' : 'draft',
      status: thumb ? 'review' : 'draft',
      videoStatus: 'draft',
      ...(move ? { cameraMove: move } : {}),
      notes: describeFrameStudyShotNotes(item, order, total),
      characterIds: [],
      characterNames: [],
    };
  });

  return {
    ok: shots.length > 0,
    shots,
    startIndex: targetEpisode.startIndex,
    nextIndex: targetEpisode.startIndex + shots.length,
    targetEpisode,
    warnings,
    key: buildFrameStudyShotWritebackKey(plan, shots),
    summaryZh: describeMultiGridShotPlan(shots),
  };
}

/** 拉片表 → 分镜镜头（不落库的纯数据；需要告警 / 防重键时用 `planFrameStudyShots`） */
export function frameStudyToStoryboardShots(
  plan: FrameStudyPlan | undefined | null,
  result: FrameStudyResult | undefined | null,
  options: FrameStudyShotsOptions = {},
): StoryboardShot[] {
  return planFrameStudyShots(plan, result, options).shots;
}

/** 防重键：同一拉片计划 + 同一批镜头（id / 序号 / 景别 / 时长）必得同一个键 */
export function buildFrameStudyShotWritebackKey(
  plan: FrameStudyPlan | undefined | null,
  shots: readonly StoryboardShot[],
): string {
  const seed = [
    plan?.mode ?? '',
    trimmed(plan?.sourceUrl),
    String(finiteNumber(plan?.requestedCount) ?? ''),
    shots
      .map((shot) => `${trimmed(shot.id)}:${shot.index}:${shot.shotType}:${shot.durationSec}`)
      .join('|'),
  ].join('#');
  return `${FRAME_STUDY_SHOT_WRITEBACK_KEY_PREFIX}-${stableHash(seed)}`;
}

/** 预览行（序号 / 景别 / 时长 / 描述）—— 直接复用既有宫格预览行口径，避免两套渲染 */
export function buildFrameStudyShotPreviewRows(shots: readonly StoryboardShot[]) {
  return buildMultiGridShotPreviewRows(shots);
}

/* ────────────────────────── ⑤ 导出 ────────────────────────── */

/** 拉片表 JSON（确定性输出：不含时间戳，便于比对与测例） */
export function serializeFrameStudyJson(
  plan: FrameStudyPlan | undefined | null,
  result: FrameStudyResult | undefined | null,
): string {
  return JSON.stringify(
    {
      sourceUrl: trimmed(plan?.sourceUrl),
      durationSec: plan?.durationSec ?? null,
      mode: plan?.mode ?? null,
      requestedCount: plan?.requestedCount ?? null,
      serverIntervalSec: plan?.serverIntervalSec ?? null,
      coverageSec: plan?.coverageSec ?? null,
      frameCount: result?.frameCount ?? 0,
      reversedCount: result?.reversedCount ?? 0,
      messageZh: result?.messageZh ?? '',
      items: (result?.items ?? []).map((item) => ({
        index: item.index,
        timeSec: item.timeSec ?? null,
        timecode: item.timeSec === undefined ? null : formatFrameStudyTimecode(item.timeSec),
        thumbnailUrl: item.thumbnailUrl ?? null,
        reversePromptZh: item.reversePromptZh ?? null,
        reversePromptEn: item.reversePromptEn ?? null,
        shotSizeLabel: item.shotSizeLabel ?? null,
        cameraMoveLabel: item.cameraMoveLabel ?? null,
        notes: item.notes ?? null,
      })),
    },
    null,
    2,
  );
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * 拉片表 CSV（UTF-8，前置 BOM 便于 Excel 正确识别中文）。
 * 列：帧号 / 时间码 / 秒 / 帧图地址 / 中文提示词 / 英文提示词 / 景别 / 运镜 / 备注
 */
export function serializeFrameStudyCsv(
  plan: FrameStudyPlan | undefined | null,
  result: FrameStudyResult | undefined | null,
  options: { includeBom?: boolean } = {},
): string {
  const header = [
    '帧号',
    '时间码',
    '秒',
    '帧图地址',
    '中文提示词',
    '英文提示词',
    '景别',
    '运镜',
    '备注',
  ];
  const rows = (result?.items ?? []).map((item) =>
    [
      item.index + 1,
      item.timeSec === undefined ? '' : formatFrameStudyTimecode(item.timeSec),
      item.timeSec ?? '',
      item.thumbnailUrl ?? '',
      item.reversePromptZh ?? '',
      item.reversePromptEn ?? '',
      item.shotSizeLabel ?? '',
      item.cameraMoveLabel ?? '',
      item.notes ?? '',
    ]
      .map(csvCell)
      .join(','),
  );
  const sourceNote = `# 逐帧拉片 · 源视频 ${trimmed(plan?.sourceUrl) || '未知'} · 间隔 ${plan?.serverIntervalSec ?? ''}s`;
  const body = [header.map(csvCell).join(','), ...rows].join('\r\n');
  const bom = options.includeBom === false ? '' : '\uFEFF';
  return `${bom}${sourceNote}\r\n${body}\r\n`;
}

/** 导出入口（按格式分发） */
export function serializeFrameStudy(
  format: FrameStudyExportFormat,
  plan: FrameStudyPlan | undefined | null,
  result: FrameStudyResult | undefined | null,
): string {
  return format === 'csv'
    ? serializeFrameStudyCsv(plan, result)
    : serializeFrameStudyJson(plan, result);
}

/** 导出文件名（与既有接触表命名口径一致：带日期戳） */
export function buildFrameStudyExportFileName(
  format: FrameStudyExportFormat,
  stamp: string,
): string {
  const safe = (trimmed(stamp) || 'frame-study').replace(/[^\w.-]+/g, '-');
  return `nx9-frame-study-${safe}.${format}`;
}
