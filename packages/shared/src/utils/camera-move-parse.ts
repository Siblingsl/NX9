/**
 * NX9「运镜提示词反向解析」—— 纯函数层（增量新增，只读不写）。
 *
 * 定位：把 `buildComposedMovePrompt` / `buildCameraMovePrompt` /
 * `withCameraMovePrompt` / `withMoveTimelinePrompt` 写进提示词的**运镜文本**
 * 还原为结构化数据（时间轴 / 运镜 id），供 UI 回显、对账与「两通道合流」使用。
 *
 * 与既有模块的关系（不替换、不修改）：
 * - 正向生成仍是 `utils/camera-move-timeline.ts` 与 `data/camera-move-library.ts`；
 *   本模块**不改**它们的输出格式，解析器必须与既有格式往返一致；
 * - 本模块只读提示词文本，不产生任何持久化字段，也不回写提示词。
 *
 * 诚实边界（务必按此理解）：
 * - 词库短语（`promptEn` / `promptZh`）是解析的唯一锚点，按**最长匹配**逐字符扫描；
 *   短语互不为子串（见单测不变量），因此不存在歧义切分；
 * - 缓动（easing）**不写进提示词**（正向生成时明确排除），解析结果恒为 null，
 *   这不是缺陷而是契约：想保留缓动必须另存时间轴对象；
 * - 时间与幅度在提示词里只保留 **2 位小数**（`formatMoveSeconds`），
 *   因此往返一致性的容差是 ±0.005；
 * - 速度曲线由 `gradually accelerating / gradually decelerating`（中/英）还原，
 *   未出现即视为 `steady`；
 * - 解析失败返回 `null` 或**部分结果 + warnings**，任何情况都不抛异常。
 */

import {
  CAMERA_MOVE_LIBRARY,
  CAMERA_MOVE_PROMPT_PREFIX_EN,
  CAMERA_MOVE_PROMPT_PREFIX_ZH,
  lookupCameraMove,
  type CameraMoveDef,
} from '../data/camera-move-library';
import {
  CAMERA_MOVE_TIMELINE_VERSION,
  type CameraMoveEasing,
  type CameraMoveSegment,
  type CameraMoveSpeedRamp,
  type CameraMoveTimeline,
} from '../types/camera-move-timeline';
import { formatMoveSeconds, validateMoveTimeline } from './camera-move-timeline';

/** 解析级别的告警前缀（与「校验：」前缀区分，便于测试与 UI 分类） */
export const PARSE_WARNING_PREFIX = '解析：';
/** 校验级别的告警前缀（来自 `validateMoveTimeline`） */
export const VALIDATE_WARNING_PREFIX = '校验：';

const CJK_RE = /[\u4e00-\u9fa5]/;
/** 词库短语与词条 id 之外的字符不得粘连（英文按字母数字判界） */
const EN_WORD_CHAR_RE = /[a-z0-9]/;
/** 中英片段的连接符（`buildComposedMovePrompt` 的固定分隔符） */
const ARROW_SPLIT_RE = /\s*(?:→|->)\s*/;
/** `lang: 'both'` 时中英两段的连接符 */
const BOTH_SEP = ' / ';

/* ── 提示词格式（与正向生成器逐字对应） ── */

/** 英文片段前缀：`0-3s ` */
const EN_TIMING_RE = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*s(?![a-z0-9])/i;
/** 中文片段前缀：`0–3 秒 ` */
const ZH_TIMING_RE = /^(\d+(?:\.\d+)?)\s*[–—~-]\s*(\d+(?:\.\d+)?)\s*秒/;
/** 英文幅度后缀：` at 1.2x amplitude` */
const EN_AMPLITUDE_RE = /\s+at\s+(\d+(?:\.\d+)?)\s*x\s+amplitude\s*$/i;
/** 英文速度曲线后缀：` gradually accelerating` */
const EN_RAMP_RE = /\s+gradually\s+(accelerating|decelerating)\s*$/i;
/** 中文幅度后缀：` 幅度 1.2×` */
const ZH_AMPLITUDE_RE = /\s*幅度\s*(\d+(?:\.\d+)?)\s*[×x]\s*$/;
/** 中文速度曲线后缀：` 逐渐加速` */
const ZH_RAMP_RE = /(逐渐加速|逐渐减速)\s*$/;
/** 英文总时长后缀：` (total 6s)` / ` (total 6s, beat-aligned)` */
const EN_TOTAL_RE = /\s*[（(]\s*total\s+(\d+(?:\.\d+)?)\s*s(?:\s*[,，]\s*beat-aligned)?\s*[)）]\s*$/i;
/** 中文总时长后缀：`（共 6 秒）` / `（共 6 秒，按节拍对齐）` */
const ZH_TOTAL_RE = /\s*[（(]\s*共\s*(\d+(?:\.\d+)?)\s*秒(?:\s*[,，]\s*按节拍对齐)?\s*[)）]\s*$/;

/** 行首时间区间标记（无前缀的「裸时间轴」行识别用） */
const LINE_EN_TIMING_RE = /^\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\s*s(?![a-z0-9])/i;
const LINE_ZH_TIMING_RE = /^\d+(?:\.\d+)?\s*[–—~-]\s*\d+(?:\.\d+)?\s*秒/;
/** 纯短语行允许残留的分隔/标点（其余字符出现即视为非运镜行） */
const PURE_LINE_RESIDUE_RE = /^[\s,、;；/|·.。]*$/;

/* ── 短语索引 ── */

function buildPhraseCandidates(): ScannablePhrase[] {
  const out: ScannablePhrase[] = [];
  for (const def of CAMERA_MOVE_LIBRARY) {
    const en = def.promptEn?.trim();
    const zh = def.promptZh?.trim();
    if (en) out.push({ key: def.id, phrase: en, lang: 'en' });
    if (zh) out.push({ key: def.id, phrase: zh, lang: 'zh' });
  }
  return out;
}

/** 词库中所有提示词短语（`key` 为运镜 id），供扫描与外部复用 */
export const CAMERA_MOVE_PROMPT_PHRASES: ScannablePhrase[] = buildPhraseCandidates();

const PHRASE_BY_NORM = new Map<string, CameraMoveDef>();
for (const def of CAMERA_MOVE_LIBRARY) {
  for (const phrase of [def.promptEn, def.promptZh]) {
    const key = phrase?.trim().toLowerCase();
    if (key) PHRASE_BY_NORM.set(key, def);
  }
}

/** 匹配到的运镜短语 */
export interface MovePhraseHit {
  moveId: string;
  /** 命中的短语原文 */
  phrase: string;
  /** 在**归一化文本**中的起点（用于排序与去重叠） */
  index: number;
  /** 在**原始文本**中的起点 */
  sourceIndex: number;
  lang: 'en' | 'zh';
}

interface NormalizedText {
  norm: string;
  /** 归一化下标 → 原始下标 */
  map: number[];
}

/**
 * 折叠连续空白（含换行）为单空格并转小写，同时保留原下标映射，
 * 使「换行 / 多空格」的提示词仍可被精确匹配，且命中位置能换算回原文。
 */
function normalizeWithMap(text: string): NormalizedText {
  let norm = '';
  const map: number[] = [];
  let prevSpace = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (norm.length === 0 || prevSpace) continue;
      norm += ' ';
      map.push(i);
      prevSpace = true;
      continue;
    }
    norm += ch.toLowerCase();
    map.push(i);
    prevSpace = false;
  }
  return { norm, map };
}

function isBoundary(norm: string, start: number, end: number, lang: 'en' | 'zh'): boolean {
  const before = start > 0 ? norm[start - 1] : '';
  const after = end < norm.length ? norm[end] : '';
  if (lang === 'en') {
    if (before && EN_WORD_CHAR_RE.test(before)) return false;
    if (after && EN_WORD_CHAR_RE.test(after)) return false;
    return true;
  }
  // 中文短语：两侧不得直接粘着其它汉字（粘着即不是逐字引用该短语）
  if (before && CJK_RE.test(before)) return false;
  if (after && CJK_RE.test(after)) return false;
  return true;
}

/** 可被扫描的短语条目（供本模块与「运镜通道合流」共用同一套匹配规则） */
export interface ScannablePhrase {
  /** 短语对应的键（本模块里是运镜 id；合流模块里是 3D 导演台机位枚举） */
  key: string;
  /** 短语原文 */
  phrase: string;
  lang: 'en' | 'zh';
}

/** 扫描命中结果 */
export interface PhraseHit {
  key: string;
  phrase: string;
  /** 在归一化文本中的起点（有序、不重叠） */
  index: number;
  /** 在原始文本中的起点 */
  sourceIndex: number;
  lang: 'en' | 'zh';
}

/**
 * 在文本里按**最长匹配**扫描一组短语（不重叠、按出现顺序返回）。
 *
 * 匹配规则（契约）：
 * - 忽略大小写；连续空白（含换行）折叠为单空格后匹配；
 * - 英文短语两侧不得紧邻字母/数字；中文短语两侧不得紧邻其它汉字；
 * - 不拼接、不猜测：只返回逐字命中的短语。
 *
 * 之所以用「扫描」而不是「按分隔符切分」：英文短语内部自带 `, `，
 * 按分隔符切分必然把一个短语切成几段（例如 `locked-off static camera, tripod-fixed, …`）。
 */
export function scanPromptPhrases(
  text: string | null | undefined,
  phrases: readonly ScannablePhrase[],
): PhraseHit[] {
  if (typeof text !== 'string' || !text || phrases.length === 0) return [];
  const { norm, map } = normalizeWithMap(text);
  if (!norm) return [];
  const sorted = phrases
    .map((p) => ({ ...p, norm: p.phrase.trim().toLowerCase() }))
    .filter((p) => p.norm.length > 0)
    // 长短语优先：短语互不为子串时等价于「最长匹配」，且不会被子串提前切断
    .sort((a, b) => b.norm.length - a.norm.length);
  const hits: PhraseHit[] = [];
  let i = 0;
  while (i < norm.length) {
    let matched: (typeof sorted)[number] | null = null;
    for (const cand of sorted) {
      const end = i + cand.norm.length;
      if (end > norm.length) continue;
      if (!norm.startsWith(cand.norm, i)) continue;
      if (!isBoundary(norm, i, end, cand.lang)) continue;
      matched = cand;
      break;
    }
    if (!matched) {
      i += 1;
      continue;
    }
    hits.push({
      key: matched.key,
      phrase: matched.phrase,
      index: i,
      sourceIndex: map[i] ?? 0,
      lang: matched.lang,
    });
    i += matched.norm.length;
  }
  return hits;
}

/**
 * 在文本里扫描**运镜词库**的提示词短语（`promptEn` / `promptZh`）。
 *
 * 只匹配提示词短语，不匹配 id 或可读名：自由文本里出现 `static`、`orbit`
 * 之类短词极易误判，宁可漏报也不误报。
 */
export function findMovePhrases(text: string | null | undefined): MovePhraseHit[] {
  return scanPromptPhrases(text, CAMERA_MOVE_PROMPT_PHRASES).map((hit) => ({
    moveId: hit.key,
    phrase: hit.phrase,
    index: hit.index,
    sourceIndex: hit.sourceIndex,
    lang: hit.lang,
  }));
}

/** 单段短语 → 运镜 id 的解析结果 */
export interface MovePhraseResolution {
  /** 命中词库时为词库 id；未命中时为短语原文（不丢信息） */
  moveId: string;
  /** 是否命中词库 */
  resolved: boolean;
  /** 命中方式 */
  via: 'prompt-phrase' | 'id-or-name' | 'fuzzy' | 'ambiguous' | 'none';
  /** 是否发生了模糊匹配（可能不准，调用方应提示） */
  fuzzy: boolean;
  /** 词库词条（未命中为 null） */
  def: CameraMoveDef | null;
}

function trimPhraseEnds(phrase: string): string {
  return phrase
    .replace(/^[\s,、;；:：]+/, '')
    .replace(/[\s,、;；.。]+$/, '')
    .trim();
}

/**
 * 解析单段短语：
 * 1) 与词库提示词短语**精确**匹配（忽略大小写与首尾标点）→ `prompt-phrase`；
 * 2) 命中 id / 中英可读名（`lookupCameraMove`）→ `id-or-name`；
 * 3) 该片段是**唯一一条**词库短语的前缀（用户手动截掉了尾巴）→ `fuzzy`（会告警）；
 * 4) 有**多条**词库短语以该片段开头 → `ambiguous`（宁可不猜，也不随机挑一条）；
 * 5) 仍未命中 → `moveId` 回落为短语原文（保证往返不丢信息）+ `via: 'none'`。
 *
 * 刻意**不**做「包含」式模糊匹配：`push-slow-custom` 这类自定义 id 含库内 id，
 * 按包含命中会把自定义运镜静默改写成语库运镜。
 */
export function resolveMovePhrase(phrase: string | null | undefined): MovePhraseResolution {
  const raw = typeof phrase === 'string' ? phrase.trim() : '';
  const cleaned = trimPhraseEnds(raw);
  if (!cleaned) return { moveId: '', resolved: false, via: 'none', fuzzy: false, def: null };

  const exact = PHRASE_BY_NORM.get(cleaned.toLowerCase());
  if (exact) {
    return { moveId: exact.id, resolved: true, via: 'prompt-phrase', fuzzy: false, def: exact };
  }

  const byIdOrName = lookupCameraMove(cleaned);
  if (byIdOrName) {
    return { moveId: byIdOrName.id, resolved: true, via: 'id-or-name', fuzzy: false, def: byIdOrName };
  }

  const needle = cleaned.toLowerCase();
  const prefixMatches: CameraMoveDef[] = [];
  for (const def of CAMERA_MOVE_LIBRARY) {
    for (const cand of [def.promptEn, def.promptZh]) {
      const hay = cand?.trim().toLowerCase();
      if (!hay || hay === needle || !hay.startsWith(needle)) continue;
      if (!prefixMatches.includes(def)) prefixMatches.push(def);
    }
  }
  if (prefixMatches.length === 1) {
    const def = prefixMatches[0];
    return { moveId: def.id, resolved: true, via: 'fuzzy', fuzzy: true, def };
  }
  if (prefixMatches.length > 1) {
    return { moveId: cleaned, resolved: false, via: 'ambiguous', fuzzy: false, def: null };
  }

  return { moveId: cleaned, resolved: false, via: 'none', fuzzy: false, def: null };
}

/* ── 前缀 / 中英混排 ── */

export interface StrippedCameraMovePrefix {
  /** 去前缀后的文本（大小写保留，仅去首尾空白） */
  rest: string;
  hadPrefix: boolean;
  lang: 'en' | 'zh' | 'unknown';
}

/** 去掉 `camera movement:` / `运镜：` 前缀（存在才去，不存在原样返回） */
export function stripCameraMovePromptPrefix(text: string | null | undefined): StrippedCameraMovePrefix {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return { rest: '', hadPrefix: false, lang: 'unknown' };
  if (raw.toLowerCase().startsWith(CAMERA_MOVE_PROMPT_PREFIX_EN)) {
    return {
      rest: raw.slice(CAMERA_MOVE_PROMPT_PREFIX_EN.length).trim(),
      hadPrefix: true,
      lang: 'en',
    };
  }
  if (raw.startsWith(CAMERA_MOVE_PROMPT_PREFIX_ZH)) {
    return {
      rest: raw.slice(CAMERA_MOVE_PROMPT_PREFIX_ZH.length).trim(),
      hadPrefix: true,
      lang: 'zh',
    };
  }
  return { rest: raw, hadPrefix: false, lang: 'unknown' };
}

/**
 * 拆 `lang: 'both'` 的 `en / zh` 混排文本：取**第一个**「右侧含汉字、左侧不含汉字」的
 * ` / ` 作为边界。英文短语本身不含 ` / `、中文短语不含 ` / `，故该边界唯一且可靠。
 */
export function splitComposedBoth(text: string | null | undefined): { en: string; zh: string } | null {
  const raw = typeof text === 'string' ? text : '';
  if (!raw.includes(BOTH_SEP)) return null;
  for (let i = raw.indexOf(BOTH_SEP); i >= 0; i = raw.indexOf(BOTH_SEP, i + BOTH_SEP.length)) {
    const left = raw.slice(0, i).trim();
    const right = raw.slice(i + BOTH_SEP.length).trim();
    if (left && right && !CJK_RE.test(left) && CJK_RE.test(right)) return { en: left, zh: right };
  }
  return null;
}

/* ── 组合提示词解析 ── */

/** 解析出的单个片段（含提示词未编码的字段的诚实标记） */
export interface ParsedComposedMovePart {
  /** 命中词库时为词库 id；未命中时为短语原文（`resolved=false`） */
  moveId: string;
  /** 提示词里的短语原文 */
  phrase: string;
  /** 是否命中词库 */
  resolved: boolean;
  /** 命中方式 */
  via: MovePhraseResolution['via'];
  /** 起始秒；提示词未携带时间区间时为 null */
  startT: number | null;
  /** 结束秒；提示词未携带时间区间时为 null */
  endT: number | null;
  /** 幅度倍数；提示词未写 `at Nx amplitude` / `幅度 N×` 时为 1 */
  amplitude: number;
  /** 速度曲线；未写 `gradually …` / `逐渐…` 时为 'steady' */
  speedRamp: CameraMoveSpeedRamp;
  /** 缓动**不写进提示词**，故恒为 null（不是解析失败） */
  easing: CameraMoveEasing | null;
}

/** 组合提示词解析结果（`timeline` 为契约字段，其余为可用的补充信息） */
export interface ParsedComposedMovePrompt {
  /** 还原出的时间轴；提示词不含时间区间时 segments 为空、durationSec 为 0 */
  timeline: CameraMoveTimeline;
  /** 解析 / 校验告警（不抛异常） */
  warnings: string[];
  /** 按时间顺序的片段明细 */
  parts: ParsedComposedMovePart[];
  lang: 'en' | 'zh' | 'both' | 'unknown';
  /** 提示词是否带时间区间（`includeTiming` 的正向产物） */
  hadTiming: boolean;
  /** 提示词是否带总时长后缀（`(total Ns…)` / `（共 N 秒…）`） */
  hadTotal: boolean;
  /** 是否存在未命中词库的短语 */
  hasUnresolved: boolean;
}

interface ParsedComposedBody {
  parts: ParsedComposedMovePart[];
  durationSec: number | null;
  beatAligned: boolean;
  hadTiming: boolean;
  hadTotal: boolean;
  warnings: string[];
}

function rampFromEn(token: string | undefined): CameraMoveSpeedRamp {
  if (token === 'accelerating') return 'accelerate';
  if (token === 'decelerating') return 'decelerate';
  return 'steady';
}

function rampFromZh(token: string | undefined): CameraMoveSpeedRamp {
  if (token === '逐渐加速') return 'accelerate';
  if (token === '逐渐减速') return 'decelerate';
  return 'steady';
}

/** 解析单个片段（`0-3s <phrase> at 1.2x amplitude gradually accelerating`） */
function parsePartChunk(chunk: string): ParsedComposedMovePart {
  let rest = chunk.trim();
  let startT: number | null = null;
  let endT: number | null = null;
  let hadTiming = false;

  const enTiming = EN_TIMING_RE.exec(rest);
  const zhTiming = ZH_TIMING_RE.exec(rest);
  if (enTiming) {
    startT = Number(enTiming[1]);
    endT = Number(enTiming[2]);
    rest = rest.slice(enTiming[0].length).trim();
    hadTiming = true;
  } else if (zhTiming) {
    startT = Number(zhTiming[1]);
    endT = Number(zhTiming[2]);
    rest = rest.slice(zhTiming[0].length).trim();
    hadTiming = true;
  }

  let amplitude = 1;
  let speedRamp: CameraMoveSpeedRamp = 'steady';

  // 幅度与速度曲线的顺序不固定（英文 `at Nx amplitude gradually accelerating`、
  // 中文 `幅度 N× 逐渐加速`），因此逐个剥到尾、循环到不再变化为止。
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    const enAmp = EN_AMPLITUDE_RE.exec(rest);
    if (enAmp) {
      amplitude = Number(enAmp[1]);
      rest = rest.slice(0, enAmp.index).trim();
      changed = true;
    }
    const zhAmp = ZH_AMPLITUDE_RE.exec(rest);
    if (zhAmp) {
      amplitude = Number(zhAmp[1]);
      rest = rest.slice(0, zhAmp.index).trim();
      changed = true;
    }
    const enRamp = EN_RAMP_RE.exec(rest);
    if (enRamp) {
      speedRamp = rampFromEn(enRamp[1].toLowerCase());
      rest = rest.slice(0, enRamp.index).trim();
      changed = true;
    }
    const zhRamp = ZH_RAMP_RE.exec(rest);
    if (zhRamp) {
      speedRamp = rampFromZh(zhRamp[1]);
      rest = rest.slice(0, zhRamp.index).trim();
      changed = true;
    }
    if (!changed) break;
  }

  const resolution = resolveMovePhrase(rest);

  return {
    // 未命中词库时 moveId 回落为短语原文：不丢信息，且重建提示词仍是同一句
    moveId: resolution.moveId,
    phrase: rest,
    resolved: resolution.resolved,
    via: resolution.via,
    startT,
    endT,
    amplitude: Number.isFinite(amplitude) && amplitude > 0 ? amplitude : 1,
    speedRamp,
    easing: null,
  };
}

/** 解析「无前缀、单语言」的组合正文 */
function parseComposedBody(body: string): ParsedComposedBody {
  const warnings: string[] = [];
  let rest = body.trim();
  if (!rest) {
    return { parts: [], durationSec: null, beatAligned: false, hadTiming: false, hadTotal: false, warnings };
  }

  let durationSec: number | null = null;
  let beatAligned = false;
  let hadTotal = false;

  const zhTotal = ZH_TOTAL_RE.exec(rest);
  if (zhTotal) {
    durationSec = Number(zhTotal[1]);
    beatAligned = /按节拍对齐/.test(zhTotal[0]);
    rest = rest.slice(0, zhTotal.index).trim();
    hadTotal = true;
  } else {
    const enTotal = EN_TOTAL_RE.exec(rest);
    if (enTotal) {
      durationSec = Number(enTotal[1]);
      beatAligned = /beat-aligned/i.test(enTotal[0]);
      rest = rest.slice(0, enTotal.index).trim();
      hadTotal = true;
    }
  }
  if (durationSec !== null && !(Number.isFinite(durationSec) && durationSec > 0)) {
    warnings.push(`${PARSE_WARNING_PREFIX}总时长「${formatMoveSeconds(durationSec)}」非法，已忽略该后缀`);
    durationSec = null;
  }

  const chunks = rest
    .split(ARROW_SPLIT_RE)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  if (chunks.length === 0) {
    return { parts: [], durationSec, beatAligned, hadTiming: false, hadTotal, warnings };
  }

  const parts = chunks
    .map((c) => parsePartChunk(c))
    .filter((p) => {
      if (p.phrase) return true;
      warnings.push(`${PARSE_WARNING_PREFIX}片段「${p.startT ?? '?'}-${p.endT ?? '?'}s」只有时间区间、没有运镜短语，已忽略`);
      return false;
    });
  const hadTiming = parts.some((p) => p.startT !== null && p.endT !== null);

  if (parts.some((p) => p.resolved === false)) {
    const names = parts.filter((p) => !p.resolved).map((p) => p.phrase);
    warnings.push(
      `${PARSE_WARNING_PREFIX}未能把短语对应到运镜词库（已按原文回填 moveId）：${names.join(' | ')}`,
    );
  }
  if (parts.some((p) => p.via === 'fuzzy')) {
    const names = parts.filter((p) => p.via === 'fuzzy').map((p) => p.phrase);
    warnings.push(`${PARSE_WARNING_PREFIX}短语为截断片段，按唯一前缀模糊匹配还原（可能不准）：${names.join(' | ')}`);
  }
  if (parts.some((p) => p.via === 'ambiguous')) {
    const names = parts.filter((p) => p.via === 'ambiguous').map((p) => p.phrase);
    warnings.push(
      `${PARSE_WARNING_PREFIX}有多个运镜短语以该片段开头，无法确定唯一运镜（按原文回填）：${names.join(' | ')}`,
    );
  }
  if (parts.some((p) => p.via === 'id-or-name')) {
    warnings.push(`${PARSE_WARNING_PREFIX}短语按 id / 可读名匹配（非提示词原文）`);
  }
  if (hadTiming && parts.some((p) => p.startT === null || p.endT === null)) {
    warnings.push(`${PARSE_WARNING_PREFIX}部分片段缺少时间区间，已从时间轴中略去（明细仍保留在 parts）`);
  }
  if (!hadTiming) {
    warnings.push(
      `${PARSE_WARNING_PREFIX}提示词未包含时间区间（正向生成用 includeTiming: true 才会写入），无法还原时间轴；运镜顺序与幅度见 parts`,
    );
  }
  if (hadTotal && !hadTiming) {
    warnings.push(`${PARSE_WARNING_PREFIX}只有总时长后缀、没有分段区间，无法定位各段起止`);
  }

  return { parts, durationSec, beatAligned, hadTiming, hadTotal, warnings };
}

/** 在多行提示词里挑出「应当被解析」的那一行正文 */
function pickComposedBody(text: string): { body: string } | null {
  const lines = text.split('\n');
  for (const line of lines) {
    const stripped = stripCameraMovePromptPrefix(line);
    if (stripped.hadPrefix && stripped.rest) return { body: stripped.rest };
  }
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (LINE_EN_TIMING_RE.test(t) || LINE_ZH_TIMING_RE.test(t)) return { body: t };
  }
  const nonEmpty = lines.filter((l) => l.trim());
  if (nonEmpty.length === 1) return { body: nonEmpty[0].trim() };
  return null;
}

/**
 * 反向解析 `buildComposedMovePrompt` 的中/英（含 `lang:'both'`）输出。
 *
 * 契约：
 * - 输入可以是**裸片段**、**整条 `camera movement: …` 行**，或多行提示词（自动挑运镜行）；
 * - 还原 段数 / 顺序 / moveId / 起止时间 / 幅度 / 速度曲线 / 总时长 / beatAligned；
 * - `easing` 恒为 null（提示词不编码缓动，见模块头注释）；
 * - 时间与幅度只有 2 位小数，往返一致性的容差 ±0.005；
 * - 无法识别任何运镜短语时返回 `null`；部分识别时返回结果 + warnings；
 * - 任何输入都不抛异常。
 */
export function parseComposedMovePrompt(
  text: string | null | undefined,
): ParsedComposedMovePrompt | null {
  try {
    const raw = typeof text === 'string' ? text.trim() : '';
    if (!raw) return null;
    const picked = pickComposedBody(raw);
    if (!picked) return null;

    const body = picked.body.trim();
    let lang: ParsedComposedMovePrompt['lang'] = 'unknown';
    let core: ParsedComposedBody;

    const both = splitComposedBoth(body);
    if (both) {
      const enCore = parseComposedBody(both.en);
      const zhCore = parseComposedBody(both.zh);
      const primary = enCore.parts.length > 0 ? enCore : zhCore;
      const secondary = primary === enCore ? zhCore : enCore;
      lang = 'both';
      const idsEn = enCore.parts.map((p) => p.moveId).join('|');
      const idsZh = zhCore.parts.map((p) => p.moveId).join('|');
      const mismatch: string[] = idsEn && idsZh && idsEn !== idsZh
        ? [`${PARSE_WARNING_PREFIX}中英两段还原出的运镜不一致（en=${idsEn} / zh=${idsZh}），已采用${primary === enCore ? '英文' : '中文'}段`]
        : [];
      core = {
        ...primary,
        warnings: [...primary.warnings, ...mismatch, ...secondary.warnings.filter((w) => !primary.warnings.includes(w))],
      };
    } else {
      lang = CJK_RE.test(body) ? 'zh' : 'en';
      core = parseComposedBody(body);
    }

    if (core.parts.length === 0) return null;

    const segments: CameraMoveSegment[] = [];
    core.parts.forEach((p, i) => {
      if (p.startT === null || p.endT === null) return;
      segments.push({
        id: `seg-${i + 1}`,
        moveId: p.moveId,
        startT: p.startT,
        endT: p.endT,
        amplitude: p.amplitude,
        speedRamp: p.speedRamp,
      });
    });

    const maxEnd = segments.reduce((acc, s) => Math.max(acc, s.endT), 0);
    const durationSec = core.durationSec !== null ? core.durationSec : (segments.length > 0 ? maxEnd : 0);

    const warnings = [...core.warnings];
    if (segments.length > 0) {
      const validation = validateMoveTimeline({
        version: CAMERA_MOVE_TIMELINE_VERSION,
        durationSec,
        segments,
        beatAligned: core.beatAligned,
      });
      for (const issue of validation.issues) {
        warnings.push(`${VALIDATE_WARNING_PREFIX}${issue.messageZh}`);
      }
    }

    return {
      timeline: {
        version: CAMERA_MOVE_TIMELINE_VERSION,
        durationSec,
        segments,
        beatAligned: core.beatAligned,
      },
      warnings,
      parts: core.parts,
      lang,
      hadTiming: core.hadTiming,
      hadTotal: core.hadTotal,
      hasUnresolved: core.parts.some((p) => !p.resolved),
    };
  } catch (error) {
    // 契约：不抛异常。真出现意外（例如内部缺陷）时返回带告警的空结果而非崩溃。
    return {
      timeline: { version: CAMERA_MOVE_TIMELINE_VERSION, durationSec: 0, segments: [] },
      warnings: [`${PARSE_WARNING_PREFIX}解析内部异常：${String(error)}`],
      parts: [],
      lang: 'unknown',
      hadTiming: false,
      hadTotal: false,
      hasUnresolved: false,
    };
  }
}

/* ── 单/多运镜文本解析 ── */

export interface ParsedCameraMovePrompt {
  moveIds: string[];
  warnings: string[];
}

/**
 * 解析 `camera movement:` / `运镜：` 前缀的单/多运镜文本（`withCameraMovePrompt` /
 * `buildCameraMovePrompt` / 时间轴注入行的共同产物）。
 *
 * - 用**词库短语扫描**而不是按分隔符切分：英文短语内部自带 `, `，
 *   按分隔符切分必然误切（这是本函数存在的理由）；
 * - 去重保持**首次出现顺序**；
 * - 无前缀的文本同样会被扫描（宽容），但只要没扫到短语就给 warning；
 * - 不抛异常。
 */
export function parseCameraMovePrompt(text: string | null | undefined): ParsedCameraMovePrompt {
  const warnings: string[] = [];
  try {
    const raw = typeof text === 'string' ? text : '';
    if (!raw.trim()) return { moveIds: [], warnings };

    const lines = raw.split('\n').filter((l) => l.trim());
    const prefixed = lines.filter((l) => stripCameraMovePromptPrefix(l).hadPrefix);
    if (prefixed.length > 1) {
      warnings.push(
        `${PARSE_WARNING_PREFIX}检测到 ${prefixed.length} 条运镜行（正常注入只会有一条，多行可能来自粘贴或手工编辑）`,
      );
    }
    const hits = findMovePhrases(raw);
    const moveIds: string[] = [];
    for (const hit of hits) {
      if (!moveIds.includes(hit.moveId)) moveIds.push(hit.moveId);
    }
    if (prefixed.length === 0) {
      warnings.push(
        `${PARSE_WARNING_PREFIX}文本没有 camera movement: / 运镜：前缀（仍按词库短语扫描）`,
      );
    }
    if (moveIds.length === 0) {
      warnings.push(
        `${PARSE_WARNING_PREFIX}未识别到运镜词库短语，原文：${raw.trim().slice(0, 60)}${raw.trim().length > 60 ? '…' : ''}`,
      );
    }
    return { moveIds, warnings };
  } catch (error) {
    return { moveIds: [], warnings: [`${PARSE_WARNING_PREFIX}解析内部异常：${String(error)}`] };
  }
}

/* ── 混合自由文本抽取 ── */

/** 一条被识别出的运镜行 */
export interface ExtractedMovePromptLine {
  /** 行号（0 基） */
  lineIndex: number;
  /** 整行原文（未修改） */
  rawLine: string;
  /** 行内运镜片段原文（不含前缀） */
  cameraText: string;
  /** 运镜片段在行内的起点；`rawLine.slice(0, cameraStart)` 为需要保留的前缀文本 */
  cameraStart: number;
  /** 是否带 `camera movement:` / `运镜：` 前缀 */
  hadPrefix: boolean;
  /** 是否带时间区间 */
  hadTiming: boolean;
  /** 该行解析出的运镜 id（仅命中词库者，按出现顺序、去重） */
  moveIds: string[];
  /** 该行里未命中词库的短语原文（不会被丢弃，也不会混进 moveIds） */
  unresolvedPhrases: string[];
  /** 该行若能还原时间轴则给出，否则 null */
  timeline: CameraMoveTimeline | null;
  warnings: string[];
}

/** 混合自由文本抽取结果 */
export interface ExtractedMovePrompt {
  lines: ExtractedMovePromptLine[];
  /** 全部运镜行合并后的 id（按出现顺序、去重） */
  moveIds: string[];
  /** 只有唯一一条可还原的运镜行时才给出时间轴，否则 null（避免拼出假时间轴） */
  timeline: CameraMoveTimeline | null;
  /** 移除运镜片段后的剩余文本（其余行**原样保留**），供「就地替换」 */
  remainingText: string;
  warnings: string[];
}

/** 行内首个运镜片段的位置（前缀优先，其次行首时间区间标记/纯短语行） */
function locateCameraSegment(line: string): { cameraStart: number; cameraText: string; hadPrefix: boolean } | null {
  const lower = line.toLowerCase();
  const enIdx = lower.indexOf(CAMERA_MOVE_PROMPT_PREFIX_EN);
  const zhIdx = line.indexOf(CAMERA_MOVE_PROMPT_PREFIX_ZH);
  let idx = -1;
  let len = 0;
  if (enIdx >= 0 && (zhIdx < 0 || enIdx <= zhIdx)) {
    idx = enIdx;
    len = CAMERA_MOVE_PROMPT_PREFIX_EN.length;
  } else if (zhIdx >= 0) {
    idx = zhIdx;
    len = CAMERA_MOVE_PROMPT_PREFIX_ZH.length;
  }
  if (idx >= 0) {
    return { cameraStart: idx, cameraText: line.slice(idx + len).trim(), hadPrefix: true };
  }

  const trimmed = line.trim();
  if (!trimmed) return null;
  const leading = line.length - line.trimStart().length;
  if (LINE_EN_TIMING_RE.test(trimmed) || LINE_ZH_TIMING_RE.test(trimmed)) {
    return { cameraStart: leading, cameraText: trimmed, hadPrefix: false };
  }
  // 纯短语行：整行只由词库短语 + 分隔标点组成
  const hits = findMovePhrases(trimmed);
  if (hits.length === 0) return null;
  let residue = trimmed;
  for (const hit of [...hits].sort((a, b) => b.sourceIndex - a.sourceIndex)) {
    residue = residue.slice(0, hit.sourceIndex)
      + residue.slice(hit.sourceIndex + hit.phrase.length);
  }
  if (!PURE_LINE_RESIDUE_RE.test(residue)) return null;
  return { cameraStart: leading, cameraText: trimmed, hadPrefix: false };
}

/**
 * 在混合自由文本里识别并抽取运镜片段（前缀行 / 行首时间区间标记行 / 纯短语行）。
 *
 * - 非运镜行**逐字保留**在 `remainingText` 中（含缩进与空行顺序）；
 * - 带前缀的行若前缀前还有正文，前缀前的正文也会保留（前缀后的运镜片段被移除）；
 * - 抽取只是「读 + 给出剩余文本」，**不修改**任何输入（返回值不可变）；
 * - 多条运镜行时 `timeline` 为 null（无法确认它们是同一镜头的时间轴），只在 `lines` 里逐行给出；
 * - 不抛异常。
 */
export function extractMoveTimelineFromPrompt(text: string | null | undefined): ExtractedMovePrompt {
  const warnings: string[] = [];
  try {
    const raw = typeof text === 'string' ? text : '';
    if (!raw.trim()) {
      return { lines: [], moveIds: [], timeline: null, remainingText: '', warnings };
    }
    const lines: ExtractedMovePromptLine[] = [];
    const kept: string[] = [];
    const allIds: string[] = [];

    raw.split('\n').forEach((line, lineIndex) => {
      const located = locateCameraSegment(line);
      if (!located) {
        kept.push(line);
        return;
      }
      const before = located.hadPrefix ? line.slice(0, located.cameraStart) : '';
      if (before.trim()) kept.push(before.trimEnd());

      const parsed = parseComposedMovePrompt(located.cameraText);
      const scanned = parseCameraMovePrompt(located.cameraText);
      // `moveIds` 只放**实实在在命中词库**的 id：未命中片段的原文回落另放
      // `unresolvedPhrases`，避免把「自定义描述」混进「运镜 id」。
      const resolvedParts = parsed ? parsed.parts.filter((p) => p.resolved).map((p) => p.moveId) : [];
      const moveIds: string[] = [];
      for (const id of [...resolvedParts, ...scanned.moveIds]) {
        if (!moveIds.includes(id)) moveIds.push(id);
      }
      // 整行无法按片段切开（例如中/英多短语直接拼在一行）但扫描到了库内短语时，
      // 该「未命中」只是切分失败，不算未识别短语。
      const splitFailedOnly = Boolean(parsed && parsed.parts.length === 1 && scanned.moveIds.length > 0);
      const unresolvedPhrases: string[] = [];
      if (parsed && !splitFailedOnly) {
        for (const part of parsed.parts) {
          if (!part.resolved && part.phrase && !unresolvedPhrases.includes(part.phrase)) {
            unresolvedPhrases.push(part.phrase);
          }
        }
      }
      for (const id of moveIds) {
        if (!allIds.includes(id)) allIds.push(id);
      }
      const lineWarnings = [...scanned.warnings];
      if (parsed) {
        for (const w of parsed.warnings) {
          if (!lineWarnings.includes(w)) lineWarnings.push(w);
        }
      }
      lines.push({
        lineIndex,
        rawLine: line,
        cameraText: located.cameraText,
        cameraStart: located.cameraStart,
        hadPrefix: located.hadPrefix,
        hadTiming: Boolean(parsed?.hadTiming),
        moveIds,
        unresolvedPhrases,
        timeline: parsed && parsed.timeline.segments.length > 0 ? parsed.timeline : null,
        warnings: lineWarnings,
      });
      if (moveIds.length === 0) {
        warnings.push(
          `${PARSE_WARNING_PREFIX}第 ${lineIndex + 1} 行的运镜片段未命中运镜词库（按原样保留在 remainingText 语义之外，未被改写）`,
        );
      }
    });

    const timelines = lines.filter((l) => l.timeline);
    if (timelines.length > 1) {
      warnings.push(
        `${PARSE_WARNING_PREFIX}检测到 ${timelines.length} 条带时间的运镜行，无法确认是否属于同一镜头，故不合并时间轴（见 lines）`,
      );
    }

    // 去掉因移除运镜片段产生的尾部空行，其余行顺序与内容逐字保留
    while (kept.length > 0 && !kept[kept.length - 1].trim()) kept.pop();

    return {
      lines,
      moveIds: allIds,
      timeline: timelines.length === 1 ? timelines[0].timeline : null,
      remainingText: kept.join('\n'),
      warnings,
    };
  } catch (error) {
    return {
      lines: [],
      moveIds: [],
      timeline: null,
      remainingText: typeof text === 'string' ? text : '',
      warnings: [`${PARSE_WARNING_PREFIX}抽取内部异常：${String(error)}`],
    };
  }
}
