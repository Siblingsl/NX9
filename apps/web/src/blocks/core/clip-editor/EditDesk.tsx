import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerRef } from '@remotion/player';
import {
  Captions,
  Check,
  ChevronDown,
  Loader2,
  Music,
  Redo2,
  Scissors,
  Sparkles,
  Undo2,
  Waves,
  X,
} from 'lucide-react';
import {
  buildSubtitleClipsFromCues,
  findTimelineClip,
  nextTrackId,
  type SmartEditEngine,
  type SmartEditProfile,
  type SmartSuggestion,
  type TimelineClip,
  type TimelineOp,
  type TimelinePayload,
  type TimelineTrackKind,
  engineLabel,
} from '@nx9/shared';
import { api } from '../../../api/client';
import { toastError } from '../../../stores/toast';
import { planAcceptAllSuggestions } from '../../../engine/suggestion-conflict';
import { parseSrt } from '../../../engine/srt-parse';
import { useTimelineEditor } from './use-timeline-editor';
import { PreviewPlayer } from './PreviewPlayer';
import { TimelinePanel, type MediaDropPayload } from './TimelinePanel';
import { InspectorPanel } from './InspectorPanel';
import { MediaBinPanel, type MediaBinShot } from './MediaBinPanel';
import { SmartReplacePanel } from './SmartReplacePanel';
import './edit-desk.css';

const ENGINES: SmartEditEngine[] = ['auto', 'remotion', 'hyperframes', 'ffmpeg'];

export interface OrchestrateOutcome {
  timeline: TimelinePayload;
  suggestions: SmartSuggestion[];
  notes: string[];
}

export interface EditDeskProps {
  initialTimeline: TimelinePayload | null;
  onPersist: (tl: TimelinePayload) => void;

  profile: SmartEditProfile;
  onProfileChange: (p: SmartEditProfile) => void;
  /** 深度编排：LLM 理解镜头内容决定顺序/时长（默认开） */
  deepArrange: boolean;
  onDeepArrangeChange: (v: boolean) => void;
  arrangeHint: string;
  /** 漫剧编排前置未满足时的阻断原因（如视频未批准）；有值则禁用 AI 编排主按钮 */
  orchestrateBlockedReason?: string;
  onOrchestrate: (deepArrange: boolean) => Promise<OrchestrateOutcome>;

  suggestions: SmartSuggestion[];
  pendingIds: string[];
  onSuggestionResolved: (id: string, accepted: boolean) => void;

  shots: MediaBinShot[];
  upstreamClips: string[];
  /** 上游全部音频 URL（素材箱展示；含对白，勿当 BGM） */
  upstreamSounds: string[];
  /** SF-15：仅 music 模式配乐 URL，踩点/编排认此字段 */
  upstreamBgmUrls?: string[];

  engine: SmartEditEngine;
  onEngineChange: (e: SmartEditEngine) => void;
  rendering: boolean;
  renderTip: string;
  outputUrl?: string;
  onRender: (tl: TimelinePayload) => void;
  onConfirm: (tl: TimelinePayload) => void;
  onSyncOnly: (tl: TimelinePayload) => void;
  /** F-034/F-014: 注入对白音轨；返回 null = 无可注入 */
  onInjectVoice?: (tl: TimelinePayload) => TimelinePayload | null;

  /**
   * 智能替换采纳后：若片段绑定 shotId，写回上游链的 videoVersions（take）。
   * 返回新 takeId；无上游镜或写失败时返回 undefined。
   */
  onWritebackShotVersion?: (
    shotId: string,
    url: string,
    meta?: { prompt?: string; model?: string },
    adopt?: boolean,
  ) => string | undefined;

  onLog: (msg: string) => void;
}

function makeEmptyTimeline(): TimelinePayload {
  return {
    version: 3,
    title: '智能剪辑',
    fps: 30,
    durationSec: 0,
    aspect: '9:16',
    width: 1080,
    height: 1920,
    tracks: [
      { id: 'V1', kind: 'video', label: '视频', clips: [] },
      { id: 'A1', kind: 'audio', label: '音频', clips: [] },
      { id: 'S1', kind: 'subtitle', label: '字幕', clips: [] },
    ],
  };
}

function makeClipId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const isEditableTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

const ASPECT_PRESETS: Array<{ id: TimelinePayload['aspect']; label: string; width: number; height: number }> = [
  { id: '9:16', label: '竖屏 9:16', width: 1080, height: 1920 },
  { id: '16:9', label: '横屏 16:9', width: 1920, height: 1080 },
  { id: '1:1', label: '方形 1:1', width: 1080, height: 1080 },
];

const BG_SWATCHES = ['#000000', '#ffffff', '#1e293b', '#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444'];

export interface CanvasMetaPatch {
  aspect?: TimelinePayload['aspect'];
  width?: number;
  height?: number;
  background?: TimelinePayload['background'] | null;
}

/** 画布设置：画幅预设/自定义尺寸 + 背景（纯色/渐变）——预览与 Remotion 成片共用时间线字段 */
function CanvasSettings({
  timeline,
  onChange,
}: {
  timeline: TimelinePayload;
  onChange: (patch: CanvasMetaPatch) => void;
}) {
  const isPreset = ASPECT_PRESETS.some((p) => p.id === timeline.aspect);
  const bg = timeline.background;
  return (
    <div className="ed-canvas">
      <div className="ed-chip-row">
        {ASPECT_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`ed-chip ${isPreset && timeline.aspect === p.id ? 'is-on' : ''}`}
            onClick={() => onChange({ aspect: p.id, width: p.width, height: p.height })}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className={`ed-chip ${!isPreset ? 'is-on' : ''}`}
          title="输入任意宽高"
          onClick={() => onChange({})}
        >
          自定义
        </button>
      </div>
      {!isPreset && (
        <div className="ed-field-row">
          <label className="ed-field">
            <span>宽</span>
            <input
              type="number"
              min={16}
              max={7680}
              value={timeline.width}
              onChange={(e) => onChange({ width: Number(e.target.value) })}
            />
          </label>
          <label className="ed-field">
            <span>高</span>
            <input
              type="number"
              min={16}
              max={7680}
              value={timeline.height}
              onChange={(e) => onChange({ height: Number(e.target.value) })}
            />
          </label>
        </div>
      )}
      <p className="ed-field-hint">
        当前 {timeline.width}×{timeline.height} · 预览与 Remotion 成片同源
      </p>
      <h5>背景</h5>
      <div className="ed-chip-row">
        <button
          type="button"
          className={`ed-chip ${!bg ? 'is-on' : ''}`}
          onClick={() => onChange({ background: null })}
        >
          无
        </button>
        <button
          type="button"
          className={`ed-chip ${bg?.kind === 'color' ? 'is-on' : ''}`}
          onClick={() =>
            onChange({ background: { kind: 'color', color: bg?.kind === 'color' ? bg.color : '#000000' } })
          }
        >
          纯色
        </button>
        <button
          type="button"
          className={`ed-chip ${bg?.kind === 'gradient' ? 'is-on' : ''}`}
          onClick={() =>
            onChange({
              background: {
                kind: 'gradient',
                gradientFrom: bg?.kind === 'gradient' ? bg.gradientFrom : '#0f172a',
                gradientTo: bg?.kind === 'gradient' ? bg.gradientTo : '#7c3aed',
              },
            })
          }
        >
          渐变
        </button>
      </div>
      {bg?.kind === 'color' && (
        <div className="ed-bg-row">
          {BG_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              className={`ed-bg-swatch ${bg.color === c ? 'is-on' : ''}`}
              style={{ background: c }}
              title={c}
              onClick={() => onChange({ background: { kind: 'color', color: c } })}
            />
          ))}
          <input
            type="color"
            className="ed-bg-custom"
            value={bg.color ?? '#000000'}
            onChange={(e) => onChange({ background: { kind: 'color', color: e.target.value } })}
          />
        </div>
      )}
      {bg?.kind === 'gradient' && (
        <div className="ed-field-row">
          <label className="ed-field">
            <span>起色</span>
            <input
              type="color"
              value={bg.gradientFrom ?? '#0f172a'}
              onChange={(e) =>
                onChange({ background: { kind: 'gradient', gradientFrom: e.target.value, gradientTo: bg.gradientTo ?? '#7c3aed' } })
              }
            />
          </label>
          <label className="ed-field">
            <span>止色</span>
            <input
              type="color"
              value={bg.gradientTo ?? '#7c3aed'}
              onChange={(e) =>
                onChange({ background: { kind: 'gradient', gradientFrom: bg.gradientFrom ?? '#0f172a', gradientTo: e.target.value } })
              }
            />
          </label>
        </div>
      )}
    </div>
  );
}

/**
 * 智能剪辑台：素材箱 + 帧精确预览 + 可编辑多轨时间轴 + 检查器 + AI 助剪。
 * 时间线编辑期间以 editor 为 SSOT，每次提交回写节点 timelineDraft。
 */
export function EditDesk(props: EditDeskProps) {
  const {
    initialTimeline,
    onPersist,
    profile,
    onProfileChange,
    deepArrange,
    onDeepArrangeChange,
    arrangeHint,
    orchestrateBlockedReason,
    onOrchestrate,
    suggestions,
    pendingIds,
    onSuggestionResolved,
    shots,
    upstreamClips,
    upstreamSounds,
    upstreamBgmUrls = [],
    engine,
    onEngineChange,
    rendering,
    renderTip,
    outputUrl,
    onRender,
    onConfirm,
    onSyncOnly,
    onInjectVoice,
    onWritebackShotVersion,
    onLog,
  } = props;

  const editor = useTimelineEditor(initialTimeline, onPersist);
  const timeline = editor.timeline;

  const [playheadSec, setPlayheadSec] = useState(0);
  const [pxPerSec, setPxPerSec] = useState(40);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [rippleMode, setRippleMode] = useState(false);
  const [rightTab, setRightTab] = useState<'clip' | 'export'>('clip');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [orchestrating, setOrchestrating] = useState(false);
  const [deskTip, setDeskTip] = useState('');
  const [replaceClipId, setReplaceClipId] = useState<string | null>(null);
  const [subtitleBusyClipId, setSubtitleBusyClipId] = useState<string | null>(null);
  const [beatBusy, setBeatBusy] = useState(false);
  const playerRef = useRef<PlayerRef | null>(null);

  const pendingItems = useMemo(
    () => suggestions.filter((s) => pendingIds.includes(s.id)),
    [suggestions, pendingIds],
  );

  const clipCount = useMemo(
    () => (timeline ? timeline.tracks.reduce((n, t) => n + t.clips.length, 0) : 0),
    [timeline],
  );

  const seek = useCallback((sec: number) => {
    setPlayheadSec(Math.max(0, sec));
  }, []);

  // ── AI 编排 ──
  const runOrchestrate = useCallback(async () => {
    setOrchestrating(true);
    setDeskTip(deepArrange ? 'AI 深度编排中（LLM 分析镜头）…' : 'AI 编排中…');
    try {
      const result = await onOrchestrate(deepArrange);
      editor.reset(result.timeline, { keepHistory: !!timeline && clipCount > 0 });
      setSelectedClipIds([]);
      setPlayheadSec(0);
      const noteText = (result.notes ?? []).length > 0 ? ` · ${result.notes.join(' · ')}` : '';
      setDeskTip(
        result.suggestions.length > 0
          ? `时间线已生成 · ${result.suggestions.length} 条建议待确认${noteText}`
          : `时间线已生成${noteText}`,
      );
    } catch (e) {
      setDeskTip(`编排失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOrchestrating(false);
    }
  }, [onOrchestrate, editor, timeline, clipCount, deepArrange]);

  // ── 建议采纳 ──
  const acceptSuggestion = useCallback(
    (sg: SmartSuggestion) => {
      if (sg.ops && sg.ops.length > 0) {
        editor.apply(sg.ops);
        onLog(`已采纳建议：${sg.message}`);
      } else {
        onLog(
          sg.kind === 'template-patch'
            ? `旧版 template-patch 已停用：HyperFrames 直接消费时间线，无需采纳模板变量（${sg.message}）`
            : `建议已确认（提示型，无时间线变更）：${sg.message}`,
        );
      }
      onSuggestionResolved(sg.id, true);
    },
    [editor, onLog, onSuggestionResolved],
  );

  const acceptAllSuggestions = useCallback(() => {
    // SE-03: 逐条 apply（撤销可分步）；目标重叠时明示后采纳可能覆盖先前改动
    const plan = planAcceptAllSuggestions(pendingItems);
    for (const sg of pendingItems) {
      if (sg.ops && sg.ops.length > 0) editor.apply(sg.ops);
      onSuggestionResolved(sg.id, true);
    }
    if (plan.conflictNote) onLog(plan.conflictNote);
    if (pendingItems.some((s) => s.kind === 'template-patch')) {
      onLog('旧版 template-patch 已停用：HyperFrames 直接消费时间线，无需采纳模板变量');
    }
    onLog(`已全部采纳 ${pendingItems.length} 条建议`);
    setSuggestOpen(false);
  }, [pendingItems, editor, onSuggestionResolved, onLog]);

  // ── 素材加入 ──
  const addMedia = useCallback(
    async (trackId: string | null, startSec: number | null, payload: MediaDropPayload) => {
      let tl = timeline;
      const ops: TimelineOp[] = [];
      if (!tl) {
        editor.reset(makeEmptyTimeline());
        tl = makeEmptyTimeline();
      }
      let wantKind: TimelineTrackKind =
        payload.mediaType === 'audio' ? 'audio' : payload.mediaType === 'image' ? 'overlay' : 'video';
      let targetTrackId = trackId;
      if (targetTrackId) {
        const t = tl.tracks.find((x) => x.id === targetTrackId);
        if (!t || t.kind !== wantKind || t.locked) targetTrackId = null;
      }
      if (!targetTrackId) {
        const t = tl.tracks.find((x) => x.kind === wantKind && !x.locked);
        if (t) {
          targetTrackId = t.id;
        } else {
          targetTrackId = nextTrackId(tl.tracks, wantKind);
          ops.push({
            op: 'add-track',
            track: { id: targetTrackId, kind: wantKind, label: wantKind === 'audio' ? '音频' : wantKind === 'overlay' ? '贴片' : '视频', clips: [] },
          });
        }
      }

      let sourceDurationSec: number | undefined;
      let durationSec = payload.durationSec ?? 4;
      try {
        const probe = await api.probeMediaDuration(payload.url);
        if (probe.ok && probe.durationSec > 0) {
          sourceDurationSec = probe.durationSec;
          durationSec = payload.durationSec
            ? Math.min(payload.durationSec, probe.durationSec)
            : probe.durationSec;
        }
      } catch {
        /* probe 不可用则用估算时长 */
      }

      const clip: TimelineClip = {
        id: makeClipId(),
        label: payload.label,
        startSec: startSec ?? 0,
        durationSec,
        assetUrl: payload.url,
        type:
          payload.mediaType === 'audio'
            ? 'audio'
            : payload.mediaType === 'image'
              ? wantKind === 'overlay'
                ? 'overlay'
                : 'image'
              : 'video',
        ...(payload.shotId ? { shotId: payload.shotId } : {}),
        ...(sourceDurationSec ? { sourceDurationSec } : {}),
      };
      ops.push({ op: 'add-clip', trackId: targetTrackId, clip, atEnd: startSec == null });
      editor.apply(ops);
      setSelectedClipIds([clip.id]);
      onLog(`已加入素材：${payload.label}`);
    },
    [timeline, editor, onLog],
  );

  // ── 智能替换回写 ──
  const replaceLoc = replaceClipId && timeline ? findTimelineClip(timeline, replaceClipId) : null;
  const handleReplaced = useCallback(
    (newUrl: string, sourceDurationSec?: number, opts?: { adopt?: boolean }) => {
      if (!replaceClipId) return;
      const shotId = replaceLoc?.clip.shotId;
      const takeId = shotId && onWritebackShotVersion
        ? onWritebackShotVersion(shotId, newUrl, { prompt: '智能替换' }, opts?.adopt)
        : undefined;
      const ops: TimelineOp[] = [
        {
          op: 'replace-clip-asset',
          clipId: replaceClipId,
          assetUrl: newUrl,
          ...(takeId ? { takeId } : {}),
        },
      ];
      if (sourceDurationSec) {
        ops.push({
          op: 'set-clip',
          clipId: replaceClipId,
          patch: { sourceDurationSec, trimInSec: undefined },
        });
      }
      editor.apply(ops);
      onLog(
        takeId
          ? opts?.adopt
            ? `智能替换已采用为镜头正式版（${takeId}）`
            : `智能替换已采纳并写回镜 take（${takeId}）`
          : '智能替换已采纳（检查器可回滚）',
      );
      setReplaceClipId(null);
    },
    [replaceClipId, replaceLoc?.clip.shotId, onWritebackShotVersion, editor, onLog],
  );

  // ── 快捷键（多选批量删除/分割；Escape 取消选择） ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        const p = playerRef.current;
        if (p) (p.isPlaying() ? p.pause() : p.play());
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClipIds.length > 0) {
        e.preventDefault();
        const ripple = rippleMode || e.shiftKey;
        editor.apply(
          selectedClipIds.map((id) => ({ op: 'remove-clip' as const, clipId: id, ripple })),
        );
        setSelectedClipIds([]);
        return;
      }
      if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && selectedClipIds.length > 0) {
        e.preventDefault();
        editor.apply(
          selectedClipIds.map((id) => ({ op: 'split-clip' as const, clipId: id, atSec: playheadSec })),
        );
        return;
      }
      if (e.key === 'Escape') {
        setSelectedClipIds([]);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        editor.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, selectedClipIds, playheadSec, rippleMode]);

  // ── 剪贴板粘贴素材（图片/视频/音频 → 上传 → 入轨） ──
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length === 0) return;
      const media = files.filter((f) =>
        f.type.startsWith('image/') || f.type.startsWith('video/') || f.type.startsWith('audio/'),
      );
      if (media.length === 0) return;
      e.preventDefault();
      for (const f of media) {
        void (async () => {
          try {
            const up = await api.uploadAsset(f);
            if (!up.url?.trim()) {
              const msg = '粘贴素材上传失败或未返回 URL，禁止空成功';
              toastError(msg);
              onLog(msg);
              return;
            }
            const type = f.type.startsWith('image/') ? 'image' : f.type.startsWith('audio/') ? 'audio' : 'video';
            await addMedia(null, null, { url: up.url, mediaType: type, label: f.name });
          } catch (err) {
            const msg = `粘贴素材失败：${err instanceof Error ? err.message : String(err)}`;
            toastError(msg);
            onLog(msg);
          }
        })();
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addMedia, onLog]);

  // ── AI 字幕：选中音视频片段 → 转写 → 生成字幕轨（时间线自治） ──
  const appendSubtitleClips = useCallback(
    (
      clip: TimelineClip,
      cues: Array<{ startSec: number; endSec: number; text: string }>,
      sourceLabel: string,
    ) => {
      if (!timeline) return 0;
      const { clips: subClips, dropped } = buildSubtitleClipsFromCues(clip, cues);
      if (subClips.length === 0) {
        onLog(`${sourceLabel}：生成的字幕片段为空`);
        return 0;
      }
      const ops: TimelineOp[] = [];
      let subTrack = timeline.tracks.find((t) => t.kind === 'subtitle' && !t.locked);
      if (!subTrack) {
        const id = nextTrackId(timeline.tracks, 'subtitle');
        ops.push({ op: 'add-track', track: { id, kind: 'subtitle', label: '字幕', clips: [] } });
        subTrack = { id, kind: 'subtitle', label: '字幕', clips: [] };
      }
      for (const sc of subClips) {
        ops.push({ op: 'add-clip', trackId: subTrack!.id, clip: sc });
      }
      editor.apply(ops);
      onLog(
        `${sourceLabel}：${subClips.length} 条字幕已加入字幕轨${dropped > 0 ? `（跳过 ${dropped} 条无效/入点前）` : ''}，可拖拽微调`,
      );
      return subClips.length;
    },
    [timeline, editor, onLog],
  );

  const handleGenerateSubtitles = useCallback(
    async (clipId: string) => {
      if (!timeline) return;
      const loc = findTimelineClip(timeline, clipId);
      if (!loc) return;
      const clip = loc.clip;
      if (clip.type !== 'video' && clip.type !== 'audio') return;
      setSubtitleBusyClipId(clipId);
      try {
        const res = await api.transcribeAudio(clip.assetUrl);
        if (!res.ok || !res.cues || res.cues.length === 0) {
          onLog('AI 字幕：未识别到语音内容');
          return;
        }
        appendSubtitleClips(
          clip,
          res.cues.map((c) => ({ startSec: c.start, endSec: c.end, text: c.text })),
          'AI 字幕',
        );
      } catch (e) {
        onLog(`AI 字幕失败：${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setSubtitleBusyClipId(null);
      }
    },
    [timeline, appendSubtitleClips, onLog],
  );

  // ── 导入 SRT 转录文件生成字幕轨 ──
  const handleImportSrt = useCallback(
    async (clipId: string, file: File) => {
      if (!timeline) return;
      const loc = findTimelineClip(timeline, clipId);
      if (!loc) return;
      const clip = loc.clip;
      if (clip.type !== 'video' && clip.type !== 'audio') return;
      try {
        const text = await file.text();
        const cues = parseSrt(text);
        if (cues.length === 0) {
          onLog('导入 SRT：未解析到有效字幕条目');
          return;
        }
        appendSubtitleClips(
          clip,
          cues.map((c) => ({ startSec: c.start, endSec: c.end, text: c.text })),
          `导入 SRT（${file.name}）`,
        );
      } catch (e) {
        onLog(`导入 SRT 失败：${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [timeline, appendSubtitleClips, onLog],
  );

  // ── 踩点对齐：BGM 真·听感节拍 → 视频片段边界吸附到节拍点 ──
  const applyBeatAlign = useCallback(async () => {
    if (!timeline) return;
    const bgm = timeline.tracks
      .filter((t) => t.kind === 'audio')
      .flatMap((t) => t.clips)
      .find((c) => c.label === 'BGM' || (upstreamBgmUrls[0] && c.assetUrl === upstreamBgmUrls[0]));
    const vTrack = timeline.tracks.find((t) => t.kind === 'video');
    if (!bgm || !vTrack || vTrack.clips.length < 2) {
      onLog('踩点对齐需要 BGM 音轨与至少 2 个视频片段（可先「AI 编排」注入 BGM）');
      return;
    }
    setBeatBusy(true);
    try {
      const beat = await api.beatAnalyze(bgm.assetUrl);
      if (!beat.ok || !beat.beats || beat.beats.length === 0) {
        onLog(`踩点分析失败：${beat.message ?? '未检测到节拍'}`);
        return;
      }
      const ops: TimelineOp[] = [];
      const sorted = [...vTrack.clips].sort((a, b) => a.startSec - b.startSec);
      for (let i = 0; i < sorted.length; i++) {
        const c = sorted[i];
        const start = Math.max(0, beat.beats[i] ?? 0);
        const end = beat.beats[i + 1] ?? start + 3;
        const dur = Math.max(0.3, Math.round((end - start) * 10) / 10);
        ops.push({ op: 'move-clip', clipId: c.id, startSec: start });
        ops.push({ op: 'trim-clip', clipId: c.id, edge: 'end', deltaSec: dur - c.durationSec });
      }
      editor.apply(ops);
      onLog(
        `已按 BGM 节拍对齐 ${sorted.length} 个片段（${beat.tempo ? `约 ${beat.tempo} BPM` : `${beat.beats.length} 个节拍点`} · audioAnalyzed: true），可撤销`,
      );
    } catch (e) {
      onLog(`踩点对齐失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBeatBusy(false);
    }
  }, [timeline, editor, onLog, upstreamBgmUrls]);

  // ── 画幅/画布背景变更（预览与 Remotion 成片同源） ──
  const setCanvasMeta = useCallback(
    (patch: CanvasMetaPatch) => {
      if (!timeline) return;
      editor.apply({ op: 'set-timeline-meta', patch });
    },
    [timeline, editor],
  );

  const hasContent = !!timeline && clipCount > 0;

  return (
    <div className="ed-desk">
      {/* 顶栏 */}
      <div className="ed-toolbar">
        <div className="ed-toolbar__group">
          <button
            type="button"
            className={`ed-chip ${profile === 'drama' ? 'is-on' : ''}`}
            onClick={() => onProfileChange('drama')}
          >
            漫剧成片
          </button>
          <button
            type="button"
            className={`ed-chip ${profile === 'viral' ? 'is-on' : ''}`}
            onClick={() => onProfileChange('viral')}
          >
            爆款模板
          </button>
          <button
            type="button"
            className="ed-btn ed-btn--primary"
            disabled={orchestrating || Boolean(orchestrateBlockedReason)}
            title={orchestrateBlockedReason || arrangeHint}
            onClick={() => void runOrchestrate()}
          >
            {orchestrating ? <Loader2 size={13} className="ed-spin" /> : <Sparkles size={13} />}
            AI 编排
          </button>
          <button
            type="button"
            className={`ed-chip ${deepArrange ? 'is-on' : ''}`}
            title="深度编排：LLM 分析每个镜头的内容描述/台词后决定播放顺序与时长；关闭则按规则编排。失败自动回退规则编排"
            onClick={() => onDeepArrangeChange(!deepArrange)}
          >
            深度编排
          </button>
          <button
            type="button"
            className="ed-btn"
            disabled={beatBusy || !hasContent}
            title="对 BGM 做真·音频节拍分析，把视频片段边界吸附到节拍点（能量 onset 听感，可撤销）"
            onClick={() => void applyBeatAlign()}
          >
            {beatBusy ? <Loader2 size={13} className="ed-spin" /> : <Music size={13} />}
            踩点对齐
          </button>
          <div className="ed-suggest">
            <button
              type="button"
              className={`ed-btn ${pendingItems.length > 0 ? 'ed-btn--attention' : ''}`}
              onClick={() => setSuggestOpen((v) => !v)}
            >
              建议 {pendingItems.length > 0 ? `(${pendingItems.length})` : ''}
              <ChevronDown size={12} />
            </button>
            {suggestOpen && (
              <div className="ed-suggest__pop">
                {pendingItems.length === 0 ? (
                  <div className="ed-empty">暂无待确认建议</div>
                ) : (
                  <>
                    <div className="ed-suggest__head">
                      <span>{pendingItems.length} 条待确认</span>
                      <button type="button" className="ed-mini-btn" onClick={acceptAllSuggestions}>
                        全部采纳
                      </button>
                    </div>
                    {pendingItems.map((sg) => (
                      <div key={sg.id} className="ed-suggest__row">
                        <span className="ed-suggest__kind">{sg.kind}</span>
                        <span className="ed-suggest__msg" title={sg.message}>
                          {sg.message}
                        </span>
                        <span className="ed-suggest__conf">{Math.round(sg.confidence * 100)}%</span>
                        <button
                          type="button"
                          className="ed-mini-btn"
                          title="采纳"
                          onClick={() => acceptSuggestion(sg)}
                        >
                          <Check size={11} />
                        </button>
                        <button
                          type="button"
                          className="ed-mini-btn"
                          title="忽略"
                          onClick={() => {
                            onSuggestionResolved(sg.id, false);
                            onLog(`已忽略建议:${sg.message}`);
                          }}
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="ed-toolbar__group">
          <button
            type="button"
            className="ed-icon-btn"
            disabled={!editor.canUndo}
            title="撤销 (Ctrl+Z)"
            onClick={editor.undo}
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            className="ed-icon-btn"
            disabled={!editor.canRedo}
            title="重做 (Ctrl+Shift+Z)"
            onClick={editor.redo}
          >
            <Redo2 size={14} />
          </button>
          <button
            type="button"
            className={`ed-chip ${rippleMode ? 'is-on' : ''}`}
            title="波纹编辑模式：删除/裁剪后同轨后续片段自动前移补洞（Shift+Delete 单次波纹删除）"
            onClick={() => setRippleMode((v) => !v)}
          >
            <Waves size={12} /> 波纹
          </button>
          <button
            type="button"
            className="ed-icon-btn"
            disabled={selectedClipIds.length === 0}
            title="播放头处分割 (S)"
            onClick={() =>
              editor.apply(
                selectedClipIds.map((id) => ({ op: 'split-clip' as const, clipId: id, atSec: playheadSec })),
              )
            }
          >
            <Scissors size={14} />
          </button>
          <label className="ed-zoom" title="时间轴缩放 (Ctrl+滚轮)">
            <input
              type="range"
              min={8}
              max={240}
              value={pxPerSec}
              onChange={(e) => setPxPerSec(Number(e.target.value))}
            />
          </label>
        </div>
      </div>

      {deskTip && <p className="ed-desk__tip">{deskTip}</p>}

      {/* 三栏 */}
      <div className="ed-main">
        <aside className="ed-main__left">
          <h3 className="ed-panel-title">素材箱</h3>
          <MediaBinPanel
            shots={shots}
            clips={upstreamClips}
            sounds={upstreamSounds}
            bgmUrls={upstreamBgmUrls}
            onAdd={(p) => void addMedia(null, null, p)}
          />
        </aside>

        <section className="ed-main__center">
          {hasContent && timeline ? (
            <PreviewPlayer
              timeline={timeline}
              playheadSec={playheadSec}
              onSeek={seek}
              onFrameUpdate={setPlayheadSec}
              playerRef={playerRef}
              engine={engine}
              profile={profile}
              selectedClipIds={selectedClipIds}
              apply={editor.apply}
            />
          ) : (
            <div className="ed-empty ed-empty--stage">
              <p>{orchestrateBlockedReason || arrangeHint}</p>
              <button
                type="button"
                className="ed-btn ed-btn--primary"
                disabled={orchestrating || Boolean(orchestrateBlockedReason)}
                title={orchestrateBlockedReason || arrangeHint}
                onClick={() => void runOrchestrate()}
              >
                {orchestrating ? <Loader2 size={13} className="ed-spin" /> : <Sparkles size={13} />}
                AI 编排生成时间线
              </button>
              <p className="ed-hint">
                {orchestrateBlockedReason
                  ? '先在上游视频工作区批准镜头，再回来编排；也可从左侧素材箱手动加片。'
                  : '或从左侧素材箱把素材拖入 / 加入时间轴，手动开始剪辑。'}
              </p>
            </div>
          )}
        </section>

        <aside className="ed-main__right">
          <div className="ed-tabs">
            <button
              type="button"
              className={`ed-tab ${rightTab === 'clip' ? 'is-on' : ''}`}
              onClick={() => setRightTab('clip')}
            >
              片段
            </button>
            <button
              type="button"
              className={`ed-tab ${rightTab === 'export' ? 'is-on' : ''}`}
              onClick={() => setRightTab('export')}
            >
              导出
            </button>
          </div>
          {rightTab === 'clip' && timeline ? (
            <InspectorPanel
              timeline={timeline}
              selectedClipIds={selectedClipIds}
              playheadSec={playheadSec}
              apply={editor.apply}
              onSelect={setSelectedClipIds}
              onSmartReplace={(id) => setReplaceClipId(id)}
              onGenerateSubtitles={handleGenerateSubtitles}
              onImportSrt={handleImportSrt}
              subtitleBusyClipId={subtitleBusyClipId}
            />
          ) : rightTab === 'clip' ? (
            <div className="ed-empty">先编排或加入素材</div>
          ) : (
            <div className="ed-export">
              <h4>预览渲染（非最终出片）</h4>
              <div className="ed-chip-row">
                {ENGINES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className={`ed-chip ${engine === e ? 'is-on' : ''}`}
                    onClick={() => onEngineChange(e)}
                  >
                    {engineLabel(e)}
                  </button>
                ))}
              </div>
              {/* SE-02: FFmpeg 预览只 concat 视频轨 URL，不含裁剪/转场/多轨 */}
              {(engine === 'ffmpeg' || engine === 'auto') && (
                <p className="ed-hint">
                  {engine === 'ffmpeg'
                    ? 'FFmpeg 预览仅拼接视频轨素材地址，不含裁剪、转场与多轨混音；与时间轴所见可能不一致。正式出片请用 Remotion / HyperFrames。'
                    : '自动引擎下漫剧走 Remotion、爆款走 HyperFrames；若手动切到 FFmpeg，预览不含裁剪与转场。'}
                </p>
              )}
              <button
                type="button"
                className="ed-btn ed-btn--block"
                disabled={rendering || !hasContent}
                onClick={() => timeline && onRender(timeline)}
                title={
                  engine === 'ffmpeg'
                    ? 'FFmpeg 预览不含裁剪与转场，仅拼接视频轨'
                    : undefined
                }
              >
                {rendering ? <Loader2 size={12} className="ed-spin" /> : null}
                {rendering ? '渲染中…' : engine === 'ffmpeg' ? 'FFmpeg 粗预览' : '预览渲染'}
              </button>
              {renderTip && <p className="ed-hint">{renderTip}</p>}
              {outputUrl && <video src={outputUrl} controls className="ed-export__video" />}
              {onInjectVoice && (
                <button
                  type="button"
                  className="ed-btn ed-btn--block"
                  disabled={!hasContent}
                  title="把工作区对白配音注入为独立音轨（可撤销）"
                  onClick={() => {
                    if (!timeline) return;
                    const next = onInjectVoice(timeline);
                    if (next) editor.reset(next, { keepHistory: true });
                  }}
                >
                  注入对白音轨
                </button>
              )}
              <h4>画布</h4>
              {timeline && (
                <CanvasSettings
                  timeline={timeline}
                  onChange={(patch) => setCanvasMeta(patch)}
                />
              )}
              <h4>交付</h4>
              <button
                type="button"
                className="ed-btn ed-btn--primary ed-btn--block"
                disabled={!hasContent || pendingItems.length > 0 || engine === 'ffmpeg'}
                title={
                  engine === 'ffmpeg'
                    ? 'FFmpeg 仅诊断拼接，不包含裁剪/转场/音轨，禁止送交导出；请改用 Remotion 或 HyperFrames'
                    : pendingItems.length > 0
                      ? '请先处理待确认建议'
                      : '确认时间线并送交已连接的交付打包'
                }
                onClick={() => timeline && onConfirm(timeline)}
              >
                {pendingItems.length > 0
                  ? `${pendingItems.length} 条建议待处理`
                  : '确认时间线并送交导出'}
              </button>
              <button
                type="button"
                className="ed-btn ed-btn--block"
                disabled={!hasContent || engine === 'ffmpeg'}
                title={engine === 'ffmpeg' ? 'FFmpeg 仅诊断拼接，禁止同步到交付打包' : undefined}
                onClick={() => timeline && onSyncOnly(timeline)}
              >
                仅同步时间线
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* 时间轴 */}
      {timeline && (
        <TimelinePanel
          timeline={timeline}
          pxPerSec={pxPerSec}
          onZoom={setPxPerSec}
          playheadSec={playheadSec}
          onSeek={seek}
          selectedClipIds={selectedClipIds}
          onSelect={(ids) => {
            setSelectedClipIds(ids);
            if (ids.length > 0) setRightTab('clip');
          }}
          apply={editor.apply}
          onDropMedia={(trackId, sec, payload) => void addMedia(trackId, sec, payload)}
          suggestions={pendingItems}
          onSuggestionResolved={onSuggestionResolved}
        />
      )}

      {/* 智能替换工作台 */}
      {replaceLoc && (
        <SmartReplacePanel
          clip={replaceLoc.clip}
          onClose={() => setReplaceClipId(null)}
          onReplaced={handleReplaced}
        />
      )}
    </div>
  );
}
