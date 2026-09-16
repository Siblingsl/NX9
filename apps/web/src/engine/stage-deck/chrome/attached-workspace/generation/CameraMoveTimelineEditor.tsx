/**
 * 运镜时间轴编排器（增量新增）。
 *
 * 词库：`@nx9/shared` 的 `CAMERA_MOVE_LIBRARY`（56 条运镜）
 * 数据模型 / 纯函数：`@nx9/shared` 的 `types|utils/camera-move-timeline`
 *
 * 能力：
 * - 从运镜库添加片段 → 横向时间轴（拖动改时长 / ←→ 排序 / 删除）；
 * - 总时长可与镜头时长绑定（等比铺开），或按节拍网格对齐；
 * - **真实节拍**：对 BGM 调服务端 `POST /api/montage/beat-analyze`（ffmpeg 解码 +
 *   能量 onset 检测），在时间轴上标出真实节拍点，并可把各段边界贴到真实节拍上；
 * - 预览：片段条 + 幅度/进度曲线 + 按时间推进的游标 + 组合运动描述；
 * - 注入：把 `buildComposedMovePrompt` 的结果写入**既有**提示词字段
 *   （复用 `camera/movement` 同一行槽位，不新增持久化字段名）；
 * - 交接：把 `CameraMoveTimeline` 推送到 3D 导演台的交接中转站，
 *   在 3D 舞台的「运镜时间轴」轨里一键套用为多段关键帧机位。
 *
 * 诚实边界：编辑器状态是**会话级**的（切换节点/镜头或刷新即重置）；
 * 节拍网格同样只存在会话内（同 URL 走缓存，不写节点字段，不新增字段名）；
 * 真正落库的只有注入后的提示词文本，详见 `docs/NX9-CAMERA-MOVE-TIMELINE.md`
 * 与 `docs/NX9-BEAT-GRID-IMPORT.md`。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Film, Loader2, Music, Play, Plus, Search, Square, Trash2 } from 'lucide-react';
import {
  CAMERA_MOVE_EASING_LABELS,
  CAMERA_MOVE_EASINGS,
  CAMERA_MOVE_SPEED_RAMP_LABELS,
  CAMERA_MOVE_SPEED_RAMPS,
  CAMERA_MOVE_FAMILY_LABELS,
  CAMERA_MOVE_FAMILY_ORDER,
  CAMERA_MOVE_TIMELINE_VERSION,
  buildComposedMovePrompt,
  lookupCameraMove,
  moveTimelineAmplitudeCurve,
  moveTimelineFromShotDuration,
  moveTimelineTotalAmplitude,
  sampleMoveTimelineAt,
  searchCameraMoves,
  snapMoveTimelineToBeats,
  snapTimelineToBeatGrid,
  validateMoveTimeline,
  withMoveTimelinePrompt,
  type CameraMoveDef,
  type CameraMoveEasing,
  type CameraMoveFamily,
  type CameraMoveSegment,
  type CameraMoveSpeedRamp,
  type CameraMoveTimeline,
} from '@nx9/shared';
import { useMoveTimelineStore } from '@nx9/director3d';
import { ComposerPopover } from '../composer/ComposerPopover';
import {
  analyzeAudioBeats,
  beatGridToMarkers,
  beatGridTotalDuration,
  beatIntervalStats,
  type BeatGrid,
} from '../../../../beat-grid';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

/** 单段最短时长（秒）：再短在时间轴上已无意义，且校验会报零时长 */
const MIN_SEG_SEC = 0.2;
/** 添加片段时的默认时长（秒）；词库无 durationHintSec 时使用 */
const DEFAULT_SEG_SEC = 1.5;

const EMPTY_ITEMS: EditorItem[] = [];
const EMPTY_URLS: string[] = [];

interface EditorItem {
  key: string;
  moveId: string;
  durSec: number;
  amplitude: number;
  easing: CameraMoveEasing;
  speedRamp: CameraMoveSpeedRamp;
  noteZh?: string;
}

export type CameraMoveTimelineEditorVariant = 'toolbar' | 'header' | 'inline';

export interface CameraMoveTimelineEditorProps {
  /** 既有提示词文本（注入基准） */
  value: string;
  /** 注入结果回调：把完整新文本写回既有提示词字段 */
  onApply: (next: string) => void;
  /** 切换节点 / 镜头时重置会话内编排 */
  resetKey?: string;
  variant?: CameraMoveTimelineEditorVariant;
  disabled?: boolean;
  /** 默认注入语言 */
  defaultLang?: 'en' | 'zh';
  /** 上游镜头时长（秒）：提供后可按镜头时长等比铺开 */
  shotDurationSec?: number;
  /** 上游没有时长时的默认总时长 */
  defaultDurationSec?: number;
  /** 交接来源标注（显示在 3D 舞台的运镜时间轴轨上） */
  handoffSourceLabel?: string;
  /** 是否提供「交接 3D 导演台」入口（默认 true） */
  enableDirectorHandoff?: boolean;
  /** 可选：上游音频候选地址（BGM / 音效 / 素材库），用于「从 BGM 分析节拍」的选择与预填 */
  audioCandidates?: string[];
}

const TRIGGER_CLASS: Record<CameraMoveTimelineEditorVariant, string> = {
  toolbar: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] transition-colors',
  header: 'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors',
  inline: 'sg-btn sg-btn--ghost inline-flex items-center gap-1',
};

let itemSeq = 0;
function newKey(moveId: string): string {
  itemSeq += 1;
  return `${moveId}-${itemSeq}`;
}

function clampSec(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_SEG_SEC;
  return Math.min(600, Math.max(MIN_SEG_SEC, Math.round(v * 100) / 100));
}

/** 词库时长提示中值 → 默认片段时长（仅作起点建议，不是硬约束） */
function defaultDurationFor(def: CameraMoveDef | undefined): number {
  const hint = def?.durationHintSec;
  if (hint && Number.isFinite(hint[0]) && Number.isFinite(hint[1]) && hint[1] > 0) {
    const mid = (Math.max(MIN_SEG_SEC, hint[0]) + Math.max(MIN_SEG_SEC, hint[1])) / 2;
    return clampSec(mid);
  }
  return DEFAULT_SEG_SEC;
}

/**
 * 编排条目 → 时间轴：条目按顺序**连续铺满**，首段从 0 开始、无空隙。
 * （碎片化输入 / 有空隙的时间轴仍由 `normalizeMoveTimeline` 支持，见 shared 纯函数。）
 */
function itemsToTimeline(items: EditorItem[], beatAligned: boolean): CameraMoveTimeline {
  let cursor = 0;
  const segments: CameraMoveSegment[] = items.map((it, i) => {
    const startT = cursor;
    cursor = Math.round((cursor + clampSec(it.durSec)) * 1000) / 1000;
    return {
      id: `seg-${i + 1}`,
      moveId: it.moveId,
      startT,
      endT: cursor,
      amplitude: it.amplitude,
      easing: it.easing,
      speedRamp: it.speedRamp,
      ...(it.noteZh ? { noteZh: it.noteZh } : {}),
    };
  });
  return {
    version: CAMERA_MOVE_TIMELINE_VERSION,
    durationSec: cursor,
    segments,
    ...(beatAligned ? { beatAligned } : {}),
  };
}

/** 时长格式化：保留 2 位有效小数 */
function fmt(sec: number): string {
  return String(Math.round(sec * 100) / 100);
}

/** 音频地址短标签（下拉里显示末段文件名；完整地址走 option 的 title） */
function shortUrl(url: string): string {
  const clean = (url.split('?')[0] ?? url).replace(/\/+$/, '');
  const parts = clean.split('/');
  return parts[parts.length - 1] || url;
}

/** 按目标总时长等比重铺（保持各段相对权重） */
function rescaleItems(items: EditorItem[], targetSec: number): EditorItem[] {
  if (items.length === 0 || !(targetSec > 0)) return items;
  const sum = items.reduce((acc, it) => acc + it.durSec, 0) || items.length;
  return items.map((it) => ({ ...it, durSec: clampSec((targetSec * it.durSec) / sum) }));
}

export function CameraMoveTimelineEditor({
  value,
  onApply,
  resetKey,
  variant = 'toolbar',
  disabled,
  defaultLang = 'en',
  shotDurationSec,
  defaultDurationSec = 6,
  handoffSourceLabel = '视频 / 图片工作台',
  enableDirectorHandoff = true,
  audioCandidates = EMPTY_URLS,
}: CameraMoveTimelineEditorProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const dragPxPerSecRef = useRef(1);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<EditorItem[]>(EMPTY_ITEMS);
  const [lang, setLang] = useState<'en' | 'zh'>(defaultLang);
  const [bindShotDuration, setBindShotDuration] = useState(false);
  const [boundSec, setBoundSec] = useState(0);
  const [beatOn, setBeatOn] = useState(false);
  const [beatCount, setBeatCount] = useState(4);
  const [tSec, setTSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [handoffAt, setHandoffAt] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ key: string; startX: number; startDur: number } | null>(null);

  // 真实节拍（会话级）：BGM 地址 + 分析结果 + 是否按真实节拍对齐
  const [bgmUrl, setBgmUrl] = useState('');
  const [grid, setGrid] = useState<BeatGrid | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [beatNote, setBeatNote] = useState<string | null>(null);
  const [realBeatsOn, setRealBeatsOn] = useState(false);

  const pushTimeline = useMoveTimelineStore((s) => s.pushTimeline);

  const upstreamSec = Number.isFinite(shotDurationSec) && (shotDurationSec as number) > 0
    ? (shotDurationSec as number)
    : null;

  // 切换节点 / 镜头：重置会话内编排
  useEffect(() => {
    setItems(EMPTY_ITEMS);
    setTSec(0);
    setPlaying(false);
    setQuery('');
    setAddOpen(false);
    setSelectedKey(null);
    setHandoffAt(null);
    setBindShotDuration(false);
    // 节拍网格是**会话级**的（同一条 BGM 贯穿多镜时不必重分析），
    // 但「按真实节拍对齐」是逐镜头的显式选择，切镜后回到未对齐。
    setRealBeatsOn(false);
    setBeatNote(null);
  }, [resetKey]);

  const rawTimeline = useMemo(() => itemsToTimeline(items, false), [items]);
  const totalSec = rawTimeline.durationSec;

  /** 真实节拍吸附结果（仅在分析成功且用户开启「对齐到真实节拍」时计算） */
  const realBeatSnap = useMemo(
    () => (realBeatsOn && grid?.ok ? snapTimelineToBeatGrid(rawTimeline, grid) : null),
    [realBeatsOn, grid, rawTimeline],
  );

  const alignedTimeline = useMemo(() => {
    // 真实节拍优先：吸附失败时如实回落，绝不假装已对齐
    if (realBeatSnap?.ok) return realBeatSnap.timeline;
    if (!beatOn || totalSec <= 0) return rawTimeline;
    return snapMoveTimelineToBeats(rawTimeline, { beatCount, durationSec: totalSec });
  }, [realBeatSnap, beatOn, rawTimeline, beatCount, totalSec]);

  const timeline = alignedTimeline;
  const effectiveSec = timeline.durationSec;
  const validation = useMemo(() => validateMoveTimeline(timeline), [timeline]);
  const composed = useMemo(() => buildComposedMovePrompt(timeline, { lang }), [timeline, lang]);
  const curve = useMemo(
    () =>
      moveTimelineAmplitudeCurve(timeline, {
        samples: 64,
        // 真实节拍对齐时由真实节拍标记画线（间隔不均匀，不能用单一 secondsPerBeat 表示）
        secondsPerBeat:
          beatOn && !realBeatsOn && effectiveSec > 0 ? effectiveSec / Math.max(1, beatCount) : undefined,
      }),
    [timeline, beatOn, realBeatsOn, beatCount, effectiveSec],
  );
  const sample = useMemo(() => sampleMoveTimelineAt(timeline, tSec), [timeline, tSec]);
  const totalAmplitude = useMemo(() => moveTimelineTotalAmplitude(timeline), [timeline]);

  // 片段条上的边界与条目对不齐（节拍吸附丢弃了过短片段）时给出提示
  const beatDropWarning = (beatOn || realBeatsOn) && timeline.segments.length !== items.length
    ? `节拍对齐后有 ${items.length - timeline.segments.length} 个过短片段被并入相邻节拍（未丢弃运镜意图，仅合并时长）`
    : null;

  /* ── 真实节拍：BGM 分析 → 时间轴标点 → 各段贴拍 ── */

  /** 时间轴上的真实节拍标记（分析失败时为空数组，不画假刻度） */
  const beatMarkers = useMemo(() => beatGridToMarkers(grid), [grid]);
  /** 间隔统计：BPM 之外的节拍疏密参考（样本不足时为 null） */
  const beatStats = useMemo(() => beatIntervalStats(grid), [grid]);
  /** 网格覆盖末端（供「对齐范围」提示） */
  const gridEnd = useMemo(() => beatGridTotalDuration(grid), [grid]);

  /** 从 BGM 分析节拍：地址取输入框，空则用第一个上游音频候选 */
  const runBeatAnalyze = useCallback(async () => {
    const url = (bgmUrl.trim() || audioCandidates[0] || '').trim();
    if (!url) {
      setGrid(null);
      setRealBeatsOn(false);
      setBeatNote('请先选择或输入 BGM 音频地址（如上游音频 / 素材库 / sound-gen 产物）');
      return;
    }
    setBgmUrl(url);
    setAnalyzing(true);
    setBeatNote(null);
    try {
      const next = await analyzeAudioBeats(url);
      setGrid(next);
      // 分析成功也不自动改编排：是否贴拍由「对齐到真实节拍」显式决定
      setRealBeatsOn(false);
      setBeatNote(
        next.ok
          ? `节拍分析完成${next.cached ? '（缓存）' : ''}：${next.tempo ? `约 ${next.tempo} BPM · ` : ''}` +
            `${next.beats.length} 个节拍点`
          : `节拍分析失败：${next.message ?? '未检测到节拍（禁止空成功）'}`,
      );
    } finally {
      setAnalyzing(false);
    }
  }, [audioCandidates, bgmUrl]);

  /** 把各段边界贴到真实节拍上（失败时如实回落 + 展示原因，不假装已对齐） */
  const alignToRealBeats = useCallback(() => {
    if (!grid?.ok) {
      setRealBeatsOn(false);
      setBeatNote(grid?.message ?? '没有可用的节拍网格：请先对 BGM 做节拍分析');
      return;
    }
    if (items.length === 0) {
      setBeatNote('还没有运镜片段：先添加片段，再对齐到真实节拍');
      return;
    }
    const res = snapTimelineToBeatGrid(rawTimeline, grid);
    if (!res.ok) {
      setRealBeatsOn(false);
      setBeatNote(res.messageZh ?? '按真实节拍对齐失败');
      return;
    }
    setRealBeatsOn(true);
    setBeatOn(false); // 手工节拍网格与真实节拍二者互斥，避免两套刻度打架
    const spans = res.timeline.segments.map((s) => Math.round((s.endT - s.startT) * 100) / 100);
    // 逐段时长回写：吸附结果连续铺满，回写后由条目重建的时间轴与吸附结果一致（幂等）。
    // 段数不一致，或时长会被最短片段阈值抬高时**不回写**，避免显示值与对齐结果自相矛盾。
    const canWriteBack =
      res.timeline.segments.length === items.length &&
      spans.every((v) => v >= MIN_SEG_SEC && clampSec(v) === v);
    if (canWriteBack) {
      setItems((cur) => cur.map((it, i) => ({ ...it, durSec: spans[i]! })));
    }
    setBeatNote(
      `${res.messageZh ?? '已按真实节拍对齐'}` +
        (canWriteBack ? '；已回写各段时长' : '（未回写条目时长：段数变化或受最短片段限制）'),
    );
  }, [grid, items.length, rawTimeline]);

  const cancelRealBeats = useCallback(() => {
    setRealBeatsOn(false);
    setBeatNote('已取消真实节拍对齐：各段时长保持当前值');
  }, []);

  // 播放：按时间推进游标（真实秒）
  useEffect(() => {
    if (!playing || effectiveSec <= 0) return;
    let raf = 0;
    let last = performance.now();
    let cur = tSec;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      cur += dt;
      if (cur >= effectiveSec) {
        setTSec(effectiveSec);
        setPlaying(false);
        return;
      }
      setTSec(cur);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 播放期间只按 rAF 推进，不跟随 tSec
  }, [playing, effectiveSec]);

  // 绑定镜头时长：上游时长变化时等比重铺
  useEffect(() => {
    if (!bindShotDuration || !upstreamSec) return;
    setBoundSec(upstreamSec);
    setItems((cur) => rescaleItems(cur, upstreamSec));
  }, [bindShotDuration, upstreamSec]);

  const updateItem = useCallback((key: string, patch: Partial<EditorItem>) => {
    setItems((cur) => cur.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((cur) => cur.filter((it) => it.key !== key));
    setSelectedKey((cur) => (cur === key ? null : cur));
  }, []);

  const moveItem = useCallback((key: string, dir: -1 | 1) => {
    setItems((cur) => {
      const i = cur.findIndex((it) => it.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      const tmp = next[i];
      next[i] = next[j];
      next[j] = tmp;
      return next;
    });
  }, []);

  /**
   * 改某段时长：
   * - 绑定镜头时长时，其余片段按比例补偿，保证总时长恒等于绑定值；
   * - 未绑定时总时长随之变化。
   */
  const setItemDuration = useCallback(
    (key: string, seconds: number) => {
      const next = clampSec(seconds);
      setItems((cur) => {
        const i = cur.findIndex((it) => it.key === key);
        if (i < 0) return cur;
        if (!bindShotDuration || !(boundSec > 0) || cur.length === 1) {
          const copy = [...cur];
          copy[i] = { ...copy[i], durSec: next };
          return copy;
        }
        const others = cur.filter((_, idx) => idx !== i);
        const otherSum = others.reduce((acc, it) => acc + it.durSec, 0);
        const budget = Math.max(MIN_SEG_SEC * others.length, boundSec - next);
        const scale = otherSum > 0 ? budget / otherSum : 1;
        return cur.map((it, idx) => {
          if (idx === i) return { ...it, durSec: next };
          const scaled = otherSum > 0 && scale !== 1 ? it.durSec * scale : budget / Math.max(1, others.length);
          return { ...it, durSec: clampSec(scaled) };
        });
      });
    },
    [bindShotDuration, boundSec],
  );

  // 拖动改时长（pointer 事件，pointerup 结束）
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const delta = (e.clientX - drag.startX) / Math.max(0.0001, dragPxPerSecRef.current);
      setItemDuration(drag.key, drag.startDur + delta);
    };
    const onUp = () => setDrag(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, setItemDuration]);

  const addMove = useCallback(
    (def: CameraMoveDef) => {
      const dur = defaultDurationFor(def);
      setItems((cur) => [
        ...cur,
        {
          key: newKey(def.id),
          moveId: def.id,
          durSec: dur,
          amplitude: 1,
          easing: 'linear',
          speedRamp: 'steady',
        },
      ]);
    },
    [],
  );

  /**
   * 按目标总时长等比铺开：复用 shared 的 `moveTimelineFromShotDuration`
   * （以各段当前时长为相对权重），再把结果时长写回条目。
   * 段数不一致（权重过小被合并）时回落为本地等比缩放。
   */
  const layoutForDuration = useCallback((targetSec: number) => {
    const seed = Math.max(0.1, targetSec);
    setItems((cur) => {
      if (cur.length === 0) return cur;
      const laid = moveTimelineFromShotDuration(
        seed,
        cur.map((it) => ({ moveId: it.moveId, weight: it.durSec })),
      );
      if (laid.segments.length !== cur.length) return rescaleItems(cur, seed);
      return cur.map((it, i) => ({
        ...it,
        durSec: clampSec(laid.segments[i].endT - laid.segments[i].startT),
      }));
    });
    setTSec(0);
  }, []);

  const applyToPrompt = useCallback(
    (next: CameraMoveTimeline | null) => {
      onApply(withMoveTimelinePrompt(value, next, { lang }));
    },
    [onApply, value, lang],
  );

  const handoff = useCallback(() => {
    if (timeline.segments.length === 0) return;
    pushTimeline(timeline, handoffSourceLabel);
    setHandoffAt(Date.now());
  }, [pushTimeline, timeline, handoffSourceLabel]);

  const results = useMemo(() => searchCameraMoves(query), [query]);
  const grouped = useMemo(
    () =>
      CAMERA_MOVE_FAMILY_ORDER.map((family) => ({
        family,
        moves: results.filter((m) => m.family === family),
      })).filter((g) => g.moves.length > 0),
    [results],
  );

  const triggerLabel = items.length > 0 ? `运镜轨 ${items.length}` : '运镜时间轴';
  const active = items.length > 0;
  const playheadPct = effectiveSec > 0 ? Math.min(100, (tSec / effectiveSec) * 100) : 0;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onMouseDown={stop}
        onClick={() => setOpen((v) => !v)}
        title="运镜时间轴：把多条运镜按时间串成一条运动轨（可绑定镜头时长 / 节拍对齐 / 预览 / 交接 3D 导演台）"
        className={`${TRIGGER_CLASS[variant]} ${
          open || active ? 'bg-brand/10 text-brand' : 'text-ink/55 hover:text-ink hover:bg-surface/90'
        } ${disabled ? 'opacity-45 cursor-not-allowed' : ''}`}
      >
        <Film size={variant === 'header' ? 13 : 12} />
        <span className="max-w-[96px] truncate">{triggerLabel}</span>
      </button>

      <ComposerPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        placement="above"
        align="start"
        width={520}
        tone="desk"
      >
        <div className="px-3 pt-2.5 pb-2.5 space-y-2" onMouseDown={stop}>
          {/* 头部：标题 + 语言 */}
          <div className="flex items-center gap-2 px-0.5">
            <p className="text-[11px] font-medium text-ink/70">运镜时间轴</p>
            <span className="text-[9px] text-ink/35">
              共 {items.length} 段 · {fmt(effectiveSec)} 秒 · 平均幅度 {fmt(totalAmplitude)}
            </span>
            <div className="ml-auto flex items-center gap-0.5">
              {(['en', 'zh'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={`px-1.5 py-0.5 rounded-md text-[9px] transition-colors ${
                    lang === l ? 'bg-brand/10 text-brand' : 'text-ink/45 hover:text-ink'
                  }`}
                >
                  {l === 'en' ? '英文' : '中文'}
                </button>
              ))}
            </div>
          </div>

          {/* 时间轴条 + 游标 */}
          <div
            ref={stripRef}
            className="relative h-7 rounded-lg border border-line/50 bg-ink/[0.03] overflow-hidden select-none"
            onMouseDown={(e) => {
              if (effectiveSec <= 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width)));
              setPlaying(false);
              setTSec(ratio * effectiveSec);
            }}
          >
            {timeline.segments.map((seg) => {
              const left = effectiveSec > 0 ? (seg.startT / effectiveSec) * 100 : 0;
              const width = effectiveSec > 0 ? ((seg.endT - seg.startT) / effectiveSec) * 100 : 0;
              const def = lookupCameraMove(seg.moveId);
              const label = def?.labelZh ?? seg.moveId;
              const amp = seg.amplitude ?? 1;
              const isOn = sample.segment?.id === seg.id;
              const itemIndex = timeline.segments.indexOf(seg);
              const owner = items[itemIndex];
              return (
                <div
                  key={seg.id}
                  className={`absolute top-0 bottom-0 border-r border-surface/70 ${
                    isOn ? 'bg-brand/35' : owner && owner.key === selectedKey ? 'bg-brand/20' : 'bg-ink/10'
                  }`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${label} ${fmt(seg.startT)}–${fmt(seg.endT)}s · 幅度 ${amp} · ${CAMERA_MOVE_EASING_LABELS[seg.easing ?? 'linear']}`}
                >
                  {/* 幅度条：高度按幅度占比 */}
                  <span
                    className="absolute left-0 right-0 bottom-0 bg-brand/25 pointer-events-none"
                    style={{ height: `${Math.min(100, (amp / Math.max(1, curve.maxAmplitude)) * 100)}%` }}
                  />
                  <span className="absolute left-0.5 top-0.5 text-[8px] text-ink/70 truncate max-w-full pr-1 pointer-events-none">
                    {label}
                  </span>
                  {owner && (
                    <span
                      role="separator"
                      aria-label={`调整「${label}」时长`}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize bg-ink/20 hover:bg-brand/50"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        dragPxPerSecRef.current =
                          (stripRef.current?.clientWidth || 320) / Math.max(0.001, effectiveSec);
                        setSelectedKey(owner.key);
                        setDrag({ key: owner.key, startX: e.clientX, startDur: owner.durSec });
                      }}
                    />
                  )}
                </div>
              );
            })}
            {beatMarkers.map((m) =>
              m.t <= effectiveSec + 1e-6 ? (
                <span
                  key={`beat-${m.index}`}
                  aria-hidden
                  data-beat-index={m.index}
                  className={`absolute top-0 bottom-0 w-px pointer-events-none ${
                    m.t === 0 ? 'bg-ink/25' : 'bg-brand/35'
                  }`}
                  style={{ left: `${effectiveSec > 0 ? (m.t / effectiveSec) * 100 : 0}%` }}
                  title={`真实节拍 #${m.index + 1} · ${fmt(m.t)}s${
                    m.intervalSec !== undefined ? `（距上一拍 ${fmt(m.intervalSec)}s）` : ''
                  }`}
                />
              ) : null,
            )}
            {playing || tSec > 0 ? (
              <span
                className="absolute top-0 bottom-0 w-px bg-brand pointer-events-none"
                style={{ left: `${playheadPct}%` }}
              />
            ) : null}
          </div>

          {/* 播放控制 + 绑定控制 */}
          <div className="flex items-center flex-wrap gap-1.5">
            <button
              type="button"
              disabled={effectiveSec <= 0}
              onClick={() => {
                if (tSec >= effectiveSec) setTSec(0);
                setPlaying((p) => !p);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-line/50 px-2 py-0.5 text-[10px] text-ink/70 hover:text-ink disabled:opacity-40"
            >
              {playing ? <Square size={10} /> : <Play size={10} />}
              {playing ? '暂停' : '播放'}
            </button>
            <span className="text-[10px] text-ink/45">
              {fmt(tSec)}s / {fmt(effectiveSec)}s
            </span>
            <span className="w-px h-3 bg-line/50" />
            <label className="inline-flex items-center gap-1 text-[10px] text-ink/55">
              <input
                type="checkbox"
                checked={bindShotDuration}
                onChange={(e) => {
                  const on = e.target.checked;
                  setBindShotDuration(on);
                  if (on) {
                    setBoundSec(upstreamSec ?? defaultDurationSec);
                    layoutForDuration(upstreamSec ?? defaultDurationSec);
                  }
                }}
              />
              绑定镜头时长
            </label>
            <span className="text-[10px] text-ink/35">
              {upstreamSec ? `镜头 ${fmt(upstreamSec)}s` : `无镜头时长（用 ${fmt(defaultDurationSec)}s）`}
            </span>
            <button
              type="button"
              disabled={items.length === 0}
              onClick={() => {
                setBindShotDuration(true);
                setBoundSec(upstreamSec ?? defaultDurationSec);
                layoutForDuration(upstreamSec ?? defaultDurationSec);
              }}
              className="rounded-md border border-line/40 px-2 py-0.5 text-[10px] text-ink/60 hover:text-ink disabled:opacity-40"
              title="按镜头时长（缺省用默认时长）等比铺开，末段终点恰好落在时长上"
            >
              等比铺开
            </button>
            <label className="inline-flex items-center gap-1 text-[10px] text-ink/55">
              <input
                type="checkbox"
                checked={beatOn}
                disabled={items.length === 0}
                onChange={(e) => {
                  setBeatOn(e.target.checked);
                  if (e.target.checked) setRealBeatsOn(false); // 手工网格与真实节拍互斥
                }}
              />
              节拍对齐
            </label>
            <input
              type="number"
              min={1}
              max={32}
              value={beatCount}
              disabled={!beatOn}
              onChange={(e) => setBeatCount(Math.min(32, Math.max(1, Number(e.target.value) || 1)))}
              className="w-12 rounded-md border border-line/50 px-1 py-0.5 text-[10px] disabled:opacity-40"
              title="节拍数"
            />
            <span className="text-[10px] text-ink/35">拍</span>
            <span className="text-[9px] text-ink/30">（手工等分网格；真实节拍见下方）</span>
          </div>

          {/* 真实节拍：服务端 ffmpeg + 能量 onset 分析 → 时间轴标点 → 各段贴拍 */}
          <div className="rounded-lg border border-line/40 px-2 py-1.5 space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-ink/55 shrink-0">BGM 节拍</span>
              {audioCandidates.length > 0 && (
                <select
                  value={audioCandidates.includes(bgmUrl) ? bgmUrl : ''}
                  onChange={(e) => {
                    setBgmUrl(e.target.value);
                    setGrid(null);
                    setRealBeatsOn(false);
                    setBeatNote(null);
                  }}
                  className="max-w-[140px] rounded-md border border-line/50 px-1 py-0.5 text-[10px]"
                  title="从上游音频（BGM / 音效 / 素材库）里选一条"
                >
                  <option value="">上游音频…</option>
                  {audioCandidates.map((u) => (
                    <option key={u} value={u} title={u}>
                      {shortUrl(u)}
                    </option>
                  ))}
                </select>
              )}
              <input
                type="text"
                value={bgmUrl}
                aria-label="BGM 音频地址"
                onMouseDown={stop}
                onChange={(e) => setBgmUrl(e.target.value)}
                placeholder="/media/… 音频地址"
                className="flex-1 min-w-0 rounded-md border border-line/50 px-1.5 py-0.5 text-[10px]"
              />
              <button
                type="button"
                disabled={analyzing}
                onClick={() => void runBeatAnalyze()}
                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-line/50 px-2 py-0.5 text-[10px] text-ink/70 hover:text-brand hover:border-brand/40 disabled:opacity-40"
                title="调用服务端 POST /api/montage/beat-analyze（ffmpeg 解码 + 能量 onset）听音分析真实节拍；失败会显示真实原因，不会伪造节拍"
              >
                {analyzing ? <Loader2 size={10} className="animate-spin" /> : <Music size={10} />}
                {analyzing ? '分析中…' : '从 BGM 分析节拍'}
              </button>
            </div>

            {grid && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {grid.ok ? (
                  <>
                    <span className="text-[10px] text-brand">
                      {grid.tempo ? `约 ${grid.tempo} BPM` : '未估计出 BPM'} · {grid.beats.length} 拍
                    </span>
                    {beatStats.medianSec !== null && (
                      <span className="text-[9px] text-ink/40">
                        间隔中位 {fmt(beatStats.medianSec)}s · 最小 {fmt(beatStats.minSec ?? 0)}s · 最大{' '}
                        {fmt(beatStats.maxSec ?? 0)}s
                      </span>
                    )}
                    <span className="text-[9px] text-ink/35">覆盖到 {fmt(gridEnd)}s</span>
                  </>
                ) : (
                  <span className="text-[10px] text-alert">
                    {grid.message ?? '节拍分析失败（禁止空成功）'}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!grid.ok || items.length === 0}
                    onClick={alignToRealBeats}
                    className="rounded-md border border-brand/40 bg-brand/10 px-2 py-0.5 text-[10px] text-brand disabled:opacity-40"
                    title="把各段边界贴到真实节拍点上；无有效节拍 / 时间轴为空时如实报错，不假装已对齐"
                  >
                    对齐到真实节拍
                  </button>
                  {realBeatsOn && (
                    <button
                      type="button"
                      onClick={cancelRealBeats}
                      className="rounded-md border border-line/40 px-2 py-0.5 text-[10px] text-ink/55 hover:text-ink"
                      title="取消真实节拍对齐（各段时长保持当前值）"
                    >
                      取消对齐
                    </button>
                  )}
                </div>
              </div>
            )}

            {beatNote && (
              <p className={`text-[9px] leading-snug ${grid && !grid.ok ? 'text-alert' : 'text-ink/50'}`}>
                {beatNote}
              </p>
            )}
            {realBeatsOn && realBeatSnap && !realBeatSnap.ok && (
              <p className="text-[9px] text-alert leading-snug">{realBeatSnap.messageZh}</p>
            )}
            <p className="text-[9px] text-ink/30 leading-snug">
              节拍网格只在会话内保存（不新增持久化字段名）；同址音频走内存缓存，不重复请求。
            </p>
          </div>

          {/* 添加运镜 */}
          <div className="rounded-lg border border-line/40">
            <button
              type="button"
              onClick={() => setAddOpen((v) => !v)}
              className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] text-ink/70"
            >
              <Plus size={11} />
              添加运镜（词库 {searchCameraMoves('').length} 条）
              <span className="ml-auto text-ink/35">{addOpen ? '收起' : '展开'}</span>
            </button>
            {addOpen && (
              <div className="border-t border-line/30 p-1.5">
                <div className="relative mb-1.5">
                  <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink/30" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索运镜：缓推 / 环绕 / 希区柯克 / whip…"
                    className="w-full rounded-lg border border-line/50 pl-7 pr-2 py-1 text-[11px] focus:outline-none focus:border-brand/40"
                  />
                </div>
                <div className="max-h-[190px] overflow-y-auto nx9-scroll pr-0.5">
                  {grouped.length === 0 && (
                    <p className="px-2 py-2 text-[10px] text-ink/35">没有匹配的运镜</p>
                  )}
                  {grouped.map(({ family, moves }) => (
                    <div key={family} className="mb-1">
                      <p className="px-1 text-[9px] font-medium text-ink/40">
                        {CAMERA_MOVE_FAMILY_LABELS[family as CameraMoveFamily] ?? family}
                      </p>
                      <div className="flex flex-wrap gap-1 px-1">
                        {moves.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => addMove(m)}
                            title={m.descZh}
                            className="rounded-md border border-line/40 px-1.5 py-0.5 text-[10px] text-ink/70 hover:border-brand/40 hover:text-ink"
                          >
                            {m.labelZh}
                            <span className="ml-1 text-[8px] text-ink/35">
                              {fmt(defaultDurationFor(m))}s
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 片段列表 */}
          <div className="max-h-[210px] overflow-y-auto nx9-scroll space-y-1">
            {items.length === 0 && (
              <p className="px-1 py-2 text-[10px] text-ink/35">
                还没有运镜片段。展开「添加运镜」按顺序加入，再从下往上读就是镜头里的运动顺序。
              </p>
            )}
            {items.map((it, i) => {
              const def = lookupCameraMove(it.moveId);
              const seg = timeline.segments[i];
              const snappedNote =
                beatOn && seg && Math.abs(seg.endT - seg.startT - it.durSec) > 0.001
                  ? `对齐后 ${fmt(seg.endT - seg.startT)}s`
                  : null;
              return (
                <div
                  key={it.key}
                  onClick={() => setSelectedKey(it.key)}
                  className={`rounded-lg border px-1.5 py-1 space-y-1 cursor-pointer ${
                    selectedKey === it.key ? 'border-brand/40 bg-brand/[0.06]' : 'border-line/35'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-ink/35 w-4">{i + 1}</span>
                    <span className="text-[11px] font-medium text-ink/80 truncate">
                      {def?.labelZh ?? it.moveId}
                    </span>
                    <span className="text-[9px] text-ink/35 truncate">{def?.labelEn ?? ''}</span>
                    <div className="ml-auto flex items-center gap-0.5">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveItem(it.key, -1);
                        }}
                        className="px-1 text-[10px] text-ink/45 hover:text-ink disabled:opacity-30"
                        title="上移（更早）"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={i === items.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveItem(it.key, 1);
                        }}
                        className="px-1 text-[10px] text-ink/45 hover:text-ink disabled:opacity-30"
                        title="下移（更晚）"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeItem(it.key);
                        }}
                        className="px-1 text-ink/45 hover:text-alert"
                        title="删除该段"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <label className="inline-flex items-center gap-1 text-[9px] text-ink/45">
                      时长
                      <input
                        type="number"
                        min={MIN_SEG_SEC}
                        step={0.1}
                        value={it.durSec}
                        aria-label="片段时长"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setItemDuration(it.key, Number(e.target.value))}
                        className="w-14 rounded-md border border-line/50 px-1 py-0.5 text-[10px]"
                      />
                      s{snappedNote ? <span className="text-warn/80"> · {snappedNote}</span> : null}
                    </label>
                    <label className="inline-flex items-center gap-1 text-[9px] text-ink/45">
                      幅度
                      <input
                        type="number"
                        min={0.05}
                        max={4}
                        step={0.05}
                        value={it.amplitude}
                        aria-label="片段幅度"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateItem(it.key, { amplitude: Number(e.target.value) || 1 })}
                        className="w-14 rounded-md border border-line/50 px-1 py-0.5 text-[10px]"
                      />
                    </label>
                    <select
                      value={it.easing}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateItem(it.key, { easing: e.target.value as CameraMoveEasing })}
                      className="rounded-md border border-line/50 px-1 py-0.5 text-[10px]"
                      title="缓动曲线"
                    >
                      {CAMERA_MOVE_EASINGS.map((es) => (
                        <option key={es} value={es}>
                          {CAMERA_MOVE_EASING_LABELS[es]}
                        </option>
                      ))}
                    </select>
                    <select
                      value={it.speedRamp}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateItem(it.key, { speedRamp: e.target.value as CameraMoveSpeedRamp })}
                      className="rounded-md border border-line/50 px-1 py-0.5 text-[10px]"
                      title="速度曲线（会写入提示词）"
                    >
                      {CAMERA_MOVE_SPEED_RAMPS.map((r) => (
                        <option key={r} value={r}>
                          {CAMERA_MOVE_SPEED_RAMP_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    {seg && (
                      <span className="text-[9px] text-ink/35">
                        {fmt(seg.startT)}–{fmt(seg.endT)}s
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 预览：顺序描述 + 曲线 + 校验 */}
          {items.length > 0 && (
            <div className="rounded-lg bg-surface/60 px-2 py-1.5 space-y-1">
              <p className="text-[9px] text-ink/40">组合运动（当前 {fmt(sample.t)}s）</p>
              <p className="text-[10px] text-ink/70 leading-snug break-words min-h-[12px]">
                {sample.composedZh || '—'}
              </p>
              <svg viewBox="0 0 320 40" className="w-full h-10" role="img" aria-label="运镜幅度与进度曲线">
                <line x1="0" y1="39" x2="320" y2="39" stroke="currentColor" strokeOpacity="0.15" />
                {curve.beatMarks.map((bt, i) => (
                  <line
                    key={`b${i}`}
                    x1={(bt / Math.max(0.001, effectiveSec)) * 320}
                    y1="0"
                    x2={(bt / Math.max(0.001, effectiveSec)) * 320}
                    y2="39"
                    stroke="currentColor"
                    strokeOpacity="0.12"
                    strokeDasharray="2 2"
                  />
                ))}
                {curve.points
                  .map((p, i) => {
                    const x = (p.t / Math.max(0.001, effectiveSec)) * 320;
                    const h = (p.amplitude / Math.max(1, curve.maxAmplitude)) * 26;
                    const w = 320 / Math.max(1, curve.points.length - 1);
                    return <rect key={`a${i}`} x={x} y={32 - h} width={w} height={h} fill="currentColor" fillOpacity="0.18" />;
                  })}
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.75"
                  strokeWidth="1.5"
                  points={curve.points
                    .map((p, i) => `${(p.t / Math.max(0.001, effectiveSec)) * 320},${38 - p.progress * 34}`)
                    .join(' ')}
                />
                <line
                  x1={(Math.min(effectiveSec, tSec) / Math.max(0.001, effectiveSec)) * 320}
                  y1="0"
                  x2={(Math.min(effectiveSec, tSec) / Math.max(0.001, effectiveSec)) * 320}
                  y2="39"
                  stroke="currentColor"
                  strokeOpacity="0.9"
                />
              </svg>
              <p className="text-[9px] text-ink/35">
                柱＝各段幅度包络，折线＝段内推进进度（含缓动 / 速度曲线），竖线＝游标
              </p>
              {beatDropWarning && <p className="text-[9px] text-warn/80">{beatDropWarning}</p>}
              {validation.errors.length > 0 && (
                <p className="text-[9px] text-alert">
                  校验未通过：{validation.errors[0].messageZh}
                  {validation.errors.length > 1 ? `（共 ${validation.errors.length} 项）` : ''}
                </p>
              )}
              {validation.errors.length === 0 && validation.warnings.length > 0 && (
                <p className="text-[9px] text-ink/45">提示：{validation.warnings[0].messageZh}</p>
              )}
            </div>
          )}

          {/* 注入预览 */}
          {items.length > 0 && (
            <div className="border-t border-line/25 pt-1.5 space-y-1">
              <p className="text-[9px] text-ink/40">注入预览（写入既有提示词同一行槽位）</p>
              <p className="text-[9px] text-ink/60 leading-snug break-words">
                {lang === 'zh' ? `运镜：${composed.zh}` : `camera movement: ${composed.en}`}
              </p>
            </div>
          )}

          {/* 底部动作 */}
          <div className="flex items-center flex-wrap gap-1.5 border-t border-line/25 pt-1.5">
            <button
              type="button"
              disabled={items.length === 0 || !validation.ok}
              onClick={() => applyToPrompt(timeline)}
              className="rounded-md border border-brand/40 bg-brand/10 px-2 py-0.5 text-[10px] text-brand disabled:opacity-40"
              title={validation.ok ? '写入既有提示词字段' : '先修正校验错误'}
            >
              写入提示词
            </button>
            <button
              type="button"
              onClick={() => applyToPrompt(null)}
              className="rounded-md border border-line/40 px-2 py-0.5 text-[10px] text-ink/55 hover:text-ink"
              title="移除提示词里的运镜行（时间轴编排保留在会话里）"
            >
              清除运镜行
            </button>
            <button
              type="button"
              disabled={items.length === 0}
              onClick={() => {
                setItems(EMPTY_ITEMS);
                setTSec(0);
                setPlaying(false);
              }}
              className="rounded-md border border-line/40 px-2 py-0.5 text-[10px] text-ink/55 hover:text-ink disabled:opacity-40"
            >
              清空编排
            </button>
            {enableDirectorHandoff && (
              <button
                type="button"
                disabled={items.length === 0 || !validation.ok}
                onClick={handoff}
                className={`rounded-md border px-2 py-0.5 text-[10px] ${
                  handoffAt ? 'border-brand/40 text-brand' : 'border-line/40 text-ink/55 hover:text-ink'
                } disabled:opacity-40`}
                title="把时间轴推送到 3D 导演台的「运镜时间轴」轨，在那边一键套用为关键帧机位"
              >
                交接 3D 导演台
              </button>
            )}
            {handoffAt && (
              <span className="text-[9px] text-brand">
                已交接 {items.length} 段到 3D 舞台的「运镜时间轴」轨
              </span>
            )}
            <span className="text-[9px] text-ink/30 ml-auto">只写提示词字段，不新增字段</span>
          </div>
        </div>
      </ComposerPopover>
    </>
  );
}
