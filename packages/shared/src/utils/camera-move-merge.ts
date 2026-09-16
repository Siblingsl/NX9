/**
 * NX9「分镜运镜通道合流」—— 纯函数层（增量新增，只读不写）。
 *
 * 背景：一个分镜里的运镜信息存在**两条互不相识的通道**：
 * 1. 镜表通道 —— `videoPrompt` 里的 `camera movement: …` / `运镜：…` 行，
 *    由大师运镜库（多选）与运镜时间轴（多段编排）注入，
 *    写的是 `data/camera-move-library.ts` 的 `promptEn` / `promptZh` 短语；
 * 2. 3D 导演台通道 —— `director3dGuide.cameraPrompt`，
 *    由 3D 舞台提交时写入，写的是导演台机位短语
 *    （`slow dolly in` / `orbit around subject` / `camera movement: slowly dollies in` …）。
 *
 * 本模块把两条通道合流成**一条可读摘要 + 冲突提示**，规则：
 * - 只读：不修改、不回写任何字段，也不选择「以谁为准」；
 * - 两条通道都描述同一镜头的运动却**不一致**时必须显式报出，绝不静默覆盖；
 * - 无法判定为冲突的观察（某通道缺失、短语未命中词库）进 `notes`，不冒充冲突；
 * - 任何输入都不抛异常（最坏情况返回带说明的空摘要）。
 *
 * 诚实边界：
 * - 3D 导演台短语表按 `packages/director3d` 的 `schema/cameraGeometry.ts`（基础机位短语）
 *   与 `schema/promptSkin.ts`（平台皮肤短语）里**已存在**的取值整理，
 *   经既有 `cameraMoveFromDirectorMoveId` 映射回运镜库 id，不新增映射口径；
 * - 3D 通道的 `cameraPrompt` 通常是整段场景描述，短语命中是**启发式**的；
 *   未命中即视为「该通道没有可识别的运镜」，报 note 而不是猜一个运镜。
 */

import {
  cameraMoveFromDirectorMoveId,
  lookupCameraMove,
  type CameraMoveDef,
} from '../data/camera-move-library';
import {
  extractMoveTimelineFromPrompt,
  parseCameraMovePrompt,
  scanPromptPhrases,
} from './camera-move-parse';
import { formatMoveSeconds, validateMoveTimeline } from './camera-move-timeline';
import type { CameraMoveTimeline } from '../types/camera-move-timeline';

/* ── 3D 导演台机位短语表 ── */

/** 3D 导演台 `CameraMoveId` → 其可能出现在 cameraPrompt 里的英文短语 */
const DIRECTOR3D_PHRASE_TABLE: Array<{ cameraMoveId: string; phrases: string[] }> = [
  { cameraMoveId: 'static', phrases: ['locked-off camera', 'holds static', 'camera static'] },
  { cameraMoveId: 'dolly-in', phrases: ['slow dolly in', 'slowly dollies in', 'camera push in', '[push in]'] },
  { cameraMoveId: 'dolly-out', phrases: ['slow dolly out', 'slowly dollies out', 'camera pull out', '[pull out]'] },
  { cameraMoveId: 'truck-left', phrases: ['truck left', 'trucks left', 'camera truck left', '[truck left]'] },
  { cameraMoveId: 'truck-right', phrases: ['truck right', 'trucks right', 'camera truck right', '[truck right]'] },
  { cameraMoveId: 'pedestal-up', phrases: ['pedestal up', 'pedestals up', 'camera pedestal up', '[pedestal up]'] },
  { cameraMoveId: 'pedestal-down', phrases: ['pedestal down', 'pedestals down', 'camera pedestal down', '[pedestal down]'] },
  { cameraMoveId: 'pan-left', phrases: ['pan left', 'pans left', 'camera pan left', '[pan left]'] },
  { cameraMoveId: 'pan-right', phrases: ['pan right', 'pans right', 'camera pan right', '[pan right]'] },
  { cameraMoveId: 'tilt-up', phrases: ['tilt up', 'tilts up', 'camera tilt up', '[tilt up]'] },
  { cameraMoveId: 'tilt-down', phrases: ['tilt down', 'tilts down', 'camera tilt down', '[tilt down]'] },
  { cameraMoveId: 'orbit', phrases: ['orbit around subject', 'orbits around the subject', 'camera orbit left', '[orbit left]'] },
  { cameraMoveId: 'crane-up', phrases: ['crane up', 'cranes up', 'camera crane up', '[crane up]'] },
  { cameraMoveId: 'crane-down', phrases: ['crane down', 'cranes down', 'camera crane down', '[crane down]'] },
  { cameraMoveId: 'handheld', phrases: ['handheld move', 'moves handheld', 'camera handheld', '[shake]'] },
];

/** 拍平后的可扫描短语（`key` 为导演台 `CameraMoveId`） */
export const DIRECTOR3D_CAMERA_MOVE_PHRASES: Array<{ key: string; phrase: string; lang: 'en' }> =
  DIRECTOR3D_PHRASE_TABLE.flatMap((entry) =>
    entry.phrases.map((phrase) => ({ key: entry.cameraMoveId, phrase, lang: 'en' as const })),
  );

/** 3D 导演台 cameraPrompt 里的机位短语命中 */
export interface Director3dMoveHit {
  /** 导演台机位枚举（`CameraMoveId`） */
  cameraMoveId: string;
  /** 命中的短语原文 */
  phrase: string;
  sourceIndex: number;
  /** 映射到的运镜库 id（映射失败为 null） */
  moveId: string | null;
  def: CameraMoveDef | null;
}

/**
 * 扫描 3D 导演台 cameraPrompt 里的机位短语（最长匹配、不重叠、按出现顺序）。
 * 用**3D 词汇表**而不是运镜库词汇表：两边短语不同名（`slow dolly in` vs
 * `slow dolly push-in toward the subject…`），必须各自匹配后再按既有映射合流。
 */
export function findDirector3dMovePhrases(text: string | null | undefined): Director3dMoveHit[] {
  return scanPromptPhrases(text, DIRECTOR3D_CAMERA_MOVE_PHRASES).map((hit) => {
    const def = cameraMoveFromDirectorMoveId(hit.key) ?? null;
    return {
      cameraMoveId: hit.key,
      phrase: hit.phrase,
      sourceIndex: hit.sourceIndex,
      moveId: def?.id ?? null,
      def,
    };
  });
}

/* ── 通道信息 ── */

/** 合流采纳的通道 */
export type CameraMoveChannelSource = 'video' | 'director3d' | 'both';

/** 单条通道的解析结果 */
export interface CameraMoveChannelInfo {
  /** 该通道文本是否非空 */
  hasText: boolean;
  /** 该通道实际用到的词表 */
  vocab: 'library' | 'director3d' | 'none';
  /** 解析出的运镜 id（已映射到运镜库，去重、按出现顺序） */
  moveIds: string[];
  /** 未命中运镜词库的短语原文（该通道独有信息，不会被丢弃） */
  unresolvedPhrases: string[];
  /** 该通道文本里的运镜行条数 */
  cameraLineCount: number;
  /** 该通道能给出的带时间区间时间轴；无法还原时为 null */
  timeline: CameraMoveTimeline | null;
  /** 通道级说明（内容级事实，不是格式唠叨） */
  warnings: string[];
}

/** 合流结果 */
export interface CameraMoveMergeResult {
  /** 中文摘要（可直接展示） */
  summaryZh: string;
  /** 英文摘要 */
  summaryEn: string;
  /** 显式冲突（两通道都描述了同一镜头的运动且不一致）；无冲突为空数组 */
  conflicts: string[];
  /** 摘要实际采纳来源 */
  source: CameraMoveChannelSource;
  /** 非冲突观察（通道缺失、短语未命中词库、时间轴校验提示） */
  notes: string[];
  video: CameraMoveChannelInfo;
  director3d: CameraMoveChannelInfo;
  /** 镜表通道文本实际取自哪个字段（多为 `videoPrompt`；`StoryboardShot` 用 `videoPromptEn`） */
  videoField: string | null;
}

function emptyChannel(): CameraMoveChannelInfo {
  return {
    hasText: false,
    vocab: 'none',
    moveIds: [],
    unresolvedPhrases: [],
    cameraLineCount: 0,
    timeline: null,
    warnings: [],
  };
}

function labelZhOf(id: string): string {
  return lookupCameraMove(id)?.labelZh ?? id;
}

function labelEnOf(id: string): string {
  return lookupCameraMove(id)?.labelEn ?? id;
}

/** 不重复地追加 */
function pushUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value);
}

/** 解析镜表通道（`videoPrompt`） */
function resolveVideoChannel(text: string | null | undefined): CameraMoveChannelInfo {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return emptyChannel();

  const extract = extractMoveTimelineFromPrompt(raw);
  const scanned = parseCameraMovePrompt(raw);

  const info = emptyChannel();
  info.hasText = true;
  info.moveIds = [...scanned.moveIds];
  info.vocab = info.moveIds.length > 0 ? 'library' : 'none';
  info.cameraLineCount = extract.lines.length;
  info.timeline = extract.timeline;

  // 未命中词库的短语只认「运镜行内的文本」：整段自由文本不该被当成运镜短语来报错
  const unresolved: string[] = [];
  for (const line of extract.lines) {
    for (const phrase of line.unresolvedPhrases) {
      if (!unresolved.includes(phrase)) unresolved.push(phrase);
    }
    if (!info.timeline && line.timeline) info.timeline = line.timeline;
  }
  info.unresolvedPhrases = unresolved;

  if (extract.lines.length > 1) {
    info.warnings.push(`镜表 videoPrompt 含 ${extract.lines.length} 条运镜行（正常注入只会有一条）`);
  }
  if (info.unresolvedPhrases.length > 0) {
    info.warnings.push(
      `镜表 videoPrompt 有未命中运镜词库的短语：${info.unresolvedPhrases.join(' | ')}`,
    );
  }
  if (extract.lines.length === 0 && info.moveIds.length > 0) {
    info.warnings.push('镜表 videoPrompt 的运镜短语不在运镜行内（无 camera movement: / 运镜：前缀）');
  }
  return info;
}

/** 解析 3D 导演台通道（`director3dGuide.cameraPrompt`） */
function resolveDirector3dChannel(text: string | null | undefined): CameraMoveChannelInfo {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return emptyChannel();

  const extract = extractMoveTimelineFromPrompt(raw);
  const libraryHits = parseCameraMovePrompt(raw);
  const nativeHits = findDirector3dMovePhrases(raw);

  const info = emptyChannel();
  info.hasText = true;
  info.cameraLineCount = extract.lines.length;
  info.timeline = extract.timeline;

  if (libraryHits.moveIds.length > 0) {
    info.vocab = 'library';
    info.moveIds = [...libraryHits.moveIds];
    if (nativeHits.length > 0) {
      info.warnings.push(
        `3D 导演台 cameraPrompt 同时含运镜库短语与导演台机位短语（已按运镜库短语为准，导演台命中：${nativeHits.map((h) => h.phrase).join(' | ')}）`,
      );
    }
  } else if (nativeHits.length > 0) {
    info.vocab = 'director3d';
    for (const hit of nativeHits) {
      if (hit.moveId) pushUnique(info.moveIds, hit.moveId);
    }
    if (info.moveIds.length === 0) {
      info.warnings.push('3D 导演台机位短语未能映射到运镜库（映射表未覆盖）');
    }
  }

  // 运镜行内、且两种词表都没认出来的短语才报「未命中」
  const nativeNorms = nativeHits.map((h) => h.phrase.trim().toLowerCase());
  const unresolved: string[] = [];
  for (const line of extract.lines) {
    for (const phrase of line.unresolvedPhrases) {
      const norm = phrase.trim().toLowerCase();
      if (!norm) continue;
      const coveredByNative = nativeNorms.some((n) => n.includes(norm) || norm.includes(n));
      if (!coveredByNative && !unresolved.includes(phrase)) unresolved.push(phrase);
    }
  }
  info.unresolvedPhrases = unresolved;

  if (info.vocab === 'none' && extract.lines.length > 0) {
    info.warnings.push('3D 导演台 cameraPrompt 的运镜行未命中任何已知机位/运镜短语');
  }
  if (info.vocab === 'none' && extract.lines.length === 0) {
    info.warnings.push(
      `3D 导演台 cameraPrompt 未命中任何已知机位/运镜短语（按自由文本机位描述处理）：${raw.slice(0, 80)}${raw.length > 80 ? '…' : ''}`,
    );
  }
  return info;
}

/* ── 摘要渲染 ── */

interface Descriptor {
  key: string;
  labelZh: string;
  labelEn: string;
  startT: number | null;
  endT: number | null;
}

function descriptorsOf(channel: CameraMoveChannelInfo): Descriptor[] {
  const times = new Map<string, { startT: number; endT: number }>();
  if (channel.timeline) {
    for (const seg of channel.timeline.segments) {
      if (!times.has(seg.moveId)) times.set(seg.moveId, { startT: seg.startT, endT: seg.endT });
    }
  }
  return channel.moveIds.map((id) => {
    const t = times.get(id);
    return {
      key: id,
      labelZh: labelZhOf(id),
      labelEn: labelEnOf(id),
      startT: t ? t.startT : null,
      endT: t ? t.endT : null,
    };
  });
}

function renderDescriptors(items: Descriptor[], lang: 'zh' | 'en'): string {
  if (items.length === 0) return lang === 'zh' ? '（无可识别运镜）' : '(no recognizable camera move)';
  return items
    .map((d) => {
      const label = lang === 'zh' ? d.labelZh : d.labelEn;
      if (d.startT === null || d.endT === null) return label;
      const range = `${formatMoveSeconds(d.startT)}${lang === 'zh' ? '–' : '-'}${formatMoveSeconds(d.endT)}${lang === 'zh' ? ' 秒' : 's'}`;
      return lang === 'zh' ? `${label}（${range}）` : `${label} (${range})`;
    })
    .join(' → ');
}

function totalSuffix(channel: CameraMoveChannelInfo, lang: 'zh' | 'en'): string {
  if (!channel.timeline) return '';
  const d = formatMoveSeconds(channel.timeline.durationSec);
  return lang === 'zh' ? `｜总 ${d} 秒` : ` | total ${d}s`;
}

/* ── 合流 ── */

export interface CameraMoveMergeInput {
  /** 镜表通道文本（分镜 `videoPrompt`） */
  videoPrompt?: string | null;
  /** 3D 导演台通道文本（`director3dGuide.cameraPrompt`） */
  director3dCameraPrompt?: string | null;
  /** 本镜时长（秒）；给了才校验「运镜轨总时长 vs 本镜时长」 */
  shotDurationSec?: number | null;
}

/**
 * 把 `videoPrompt` 的运镜与 `director3dGuide.cameraPrompt` 合流为
 * 「一条可读摘要 + 冲突提示」。**只读**：不修改也不回写任何字段。
 *
 * 冲突判定（全部显式报出，不做静默覆盖）：
 * 1. `[运镜不一致]` 两通道都识别到运镜，但 id 集合不同；
 * 2. `[顺序不一致]` id 集合相同，但先后顺序不同（多段运镜的叙事顺序会变）；
 * 3. `[通道重复]` 某通道内出现多条运镜行（无法判断哪条是该镜头的权威运镜）。
 *
 * 时长校验（不算两通道冲突，进 notes）：
 * - 只给「镜表运镜轨总时长 ≠ 本镜时长」时以 `[时长风险]` 进 conflicts ——
 *   因为它会直接导致成片运动被截断或留白，属于必须显式报出的不一致。
 */
export function mergeCameraMoveChannels(input: CameraMoveMergeInput): CameraMoveMergeResult {
  const video = resolveVideoChannel(input.videoPrompt);
  const director3d = resolveDirector3dChannel(input.director3dCameraPrompt);

  const notes: string[] = [];
  const conflicts: string[] = [];

  for (const w of video.warnings) notes.push(`[镜表] ${w}`);
  for (const w of director3d.warnings) notes.push(`[3D 导演台] ${w}`);

  const hasVideo = video.moveIds.length > 0;
  const hasDirector = director3d.moveIds.length > 0;

  if (!video.hasText && director3d.hasText) {
    notes.push('[缺失] 镜表 videoPrompt 未提供运镜描述');
  }
  if (video.hasText && !director3d.hasText) {
    notes.push('[缺失] 3D 导演台未提交机位（director3dGuide.cameraPrompt 为空）');
  }

  // 冲突 1 / 2：两通道都识别到运镜时的口径比对
  if (hasVideo && hasDirector) {
    const vSet = [...new Set(video.moveIds)];
    const dSet = [...new Set(director3d.moveIds)];
    const sameSet = vSet.length === dSet.length && vSet.every((id) => dSet.includes(id));
    if (!sameSet) {
      conflicts.push(
        `[运镜不一致] 镜表：${vSet.map(labelZhOf).join('、')} ／ 3D 导演台：${dSet.map(labelZhOf).join('、')}`,
      );
    } else if (vSet.join('|') !== dSet.join('|')) {
      conflicts.push(
        `[顺序不一致] 镜表顺序：${vSet.map(labelZhOf).join(' → ')} ／ 3D 导演台顺序：${dSet.map(labelZhOf).join(' → ')}`,
      );
    }
  }

  // 冲突 3：通道内多条运镜行
  if (video.cameraLineCount > 1) {
    conflicts.push(`[通道重复] 镜表 videoPrompt 有 ${video.cameraLineCount} 条运镜行，无法判断哪条是该镜权威运镜`);
  }
  if (director3d.cameraLineCount > 1) {
    conflicts.push(`[通道重复] 3D 导演台 cameraPrompt 有 ${director3d.cameraLineCount} 条运镜行`);
  }

  // 时长风险：只在镜表通道能给出时间轴、且调用方给了本镜时长时校验
  const shotDur = input.shotDurationSec;
  if (video.timeline && Number.isFinite(shotDur as number) && (shotDur as number) > 0) {
    const delta = Math.abs(video.timeline.durationSec - (shotDur as number));
    if (delta > 0.05) {
      conflicts.push(
        `[时长不一致] 镜表运镜轨总时长 ${formatMoveSeconds(video.timeline.durationSec)}s ≠ 本镜时长 ${formatMoveSeconds(shotDur as number)}s（差 ${formatMoveSeconds(delta)}s）`,
      );
    }
  }

  // 时间轴自身校验（空隙 / 未覆盖 / 重叠）→ notes，不冒充通道冲突
  if (video.timeline) {
    const validation = validateMoveTimeline(video.timeline);
    for (const issue of validation.issues) {
      notes.push(`[时间轴] ${issue.messageZh}`);
    }
  }

  // 摘要
  const source: CameraMoveChannelSource = hasVideo && hasDirector ? 'both' : hasDirector ? 'director3d' : 'video';
  let summaryZh: string;
  let summaryEn: string;

  if (!hasVideo && !hasDirector) {
    summaryZh = '两通道都没有可识别的运镜描述';
    summaryEn = 'Neither channel carries a recognizable camera move';
    if (video.hasText) {
      summaryZh += '（镜表 videoPrompt 有文本但未命中运镜词库）';
      summaryEn += ' (videoPrompt has text but no library phrase matched)';
    }
    if (director3d.hasText) {
      summaryZh += '（3D 导演台 cameraPrompt 有文本但未命中机位短语）';
      summaryEn += ' (3D cameraPrompt has text but no director move phrase matched)';
    }
  } else {
    const primary = hasVideo ? video : director3d;
    const items = descriptorsOf(primary);
    if (source === 'both') {
      summaryZh = `两通道一致：${renderDescriptors(items, 'zh')}${totalSuffix(primary, 'zh')}`;
      summaryEn = `Both channels agree: ${renderDescriptors(items, 'en')}${totalSuffix(primary, 'en')}`;
    } else if (source === 'video') {
      summaryZh = `仅镜表有运镜：${renderDescriptors(items, 'zh')}${totalSuffix(primary, 'zh')}`;
      summaryEn = `Video prompt only: ${renderDescriptors(items, 'en')}${totalSuffix(primary, 'en')}`;
      summaryZh += director3d.hasText ? '；3D 导演台未识别到运镜' : '；3D 导演台未提供机位描述';
      summaryEn += director3d.hasText
        ? '; 3D director channel has no recognizable camera move'
        : '; 3D director channel has no camera prompt';
    } else {
      const native = director3d.vocab === 'director3d' ? '（由 3D 机位短语映射）' : '';
      summaryZh = `仅 3D 导演台有运镜：${renderDescriptors(items, 'zh')}${native}`;
      summaryEn = `3D director channel only: ${renderDescriptors(items, 'en')}${director3d.vocab === 'director3d' ? ' (mapped from 3D camera phrase)' : ''}`;
      summaryZh += video.hasText ? '；镜表 videoPrompt 未识别到运镜' : '；镜表 videoPrompt 未注入运镜';
      summaryEn += video.hasText
        ? '; videoPrompt has no recognizable camera move'
        : '; videoPrompt has no camera move line';
    }
    if (conflicts.length > 0) {
      summaryZh += `｜⚠ ${conflicts.length} 项冲突（见冲突清单，未自动改写任何字段）`;
      summaryEn += ` | ${conflicts.length} conflict(s) — nothing was rewritten`;
    }
  }

  return {
    summaryZh,
    summaryEn,
    conflicts,
    source,
    notes,
    video,
    director3d,
    videoField: null,
  };
}

/** 分镜镜头形态（结构子集，`ScriptBreakdownShot` 与 `StoryboardShot` 都满足） */
export interface CameraMoveShotLike {
  /** 剧本拆分的镜表字段 */
  videoPrompt?: string | null;
  /** 链分镜镜表字段 */
  videoPromptEn?: string | null;
  /** 分镜台专业视频提示词字段 */
  videoPromptPro?: string | null;
  durationSec?: number | null;
  director3dGuide?: { cameraPrompt?: string | null } | null;
}

/**
 * 从「分镜镜头对象」直接合流两条通道（免去调用方自己挑字段）。
 *
 * 镜表文本取值顺序：`videoPrompt` → `videoPromptEn` → `videoPromptPro`（取首个非空），
 * 实际取自哪个字段记录在 `videoField`，便于对账。
 */
export function mergeShotCameraMoveChannels(
  shot: CameraMoveShotLike | null | undefined,
  opts: { shotDurationSec?: number | null } = {},
): CameraMoveMergeResult {
  const candidates: Array<[string, string | null | undefined]> = [
    ['videoPrompt', shot?.videoPrompt],
    ['videoPromptEn', shot?.videoPromptEn],
    ['videoPromptPro', shot?.videoPromptPro],
  ];
  const picked = candidates.find(([, value]) => typeof value === 'string' && value.trim());
  const shotDur = opts.shotDurationSec ?? shot?.durationSec ?? null;

  const result = mergeCameraMoveChannels({
    videoPrompt: picked ? (picked[1] as string) : null,
    director3dCameraPrompt: shot?.director3dGuide?.cameraPrompt ?? null,
    shotDurationSec: shotDur,
  });
  return { ...result, videoField: picked ? picked[0] : null };
}
