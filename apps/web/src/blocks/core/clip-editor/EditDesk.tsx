import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerRef } from '@remotion/player';
import {
  Check,
  ChevronDown,
  Loader2,
  Redo2,
  Scissors,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react';
import {
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
import { planAcceptAllSuggestions } from '../../../engine/suggestion-conflict';
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
}

export interface EditDeskProps {
  initialTimeline: TimelinePayload | null;
  onPersist: (tl: TimelinePayload) => void;

  profile: SmartEditProfile;
  onProfileChange: (p: SmartEditProfile) => void;
  arrangeHint: string;
  onOrchestrate: () => Promise<OrchestrateOutcome>;

  suggestions: SmartSuggestion[];
  pendingIds: string[];
  onSuggestionResolved: (id: string, accepted: boolean) => void;

  shots: MediaBinShot[];
  upstreamClips: string[];
  upstreamSounds: string[];

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
    arrangeHint,
    onOrchestrate,
    suggestions,
    pendingIds,
    onSuggestionResolved,
    shots,
    upstreamClips,
    upstreamSounds,
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
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'clip' | 'export'>('clip');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [orchestrating, setOrchestrating] = useState(false);
  const [deskTip, setDeskTip] = useState('');
  const [replaceClipId, setReplaceClipId] = useState<string | null>(null);
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
    setDeskTip('AI 编排中…');
    try {
      const result = await onOrchestrate();
      editor.reset(result.timeline, { keepHistory: !!timeline && clipCount > 0 });
      setSelectedClipId(null);
      setPlayheadSec(0);
      setDeskTip(
        result.suggestions.length > 0
          ? `时间线已生成 · ${result.suggestions.length} 条建议待确认`
          : '时间线已生成',
      );
    } catch (e) {
      setDeskTip(`编排失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOrchestrating(false);
    }
  }, [onOrchestrate, editor, timeline, clipCount]);

  // ── 建议采纳 ──
  const acceptSuggestion = useCallback(
    (sg: SmartSuggestion) => {
      if (sg.ops && sg.ops.length > 0) {
        editor.apply(sg.ops);
        onLog(`已采纳建议：${sg.message}`);
      } else {
        onLog(`建议已确认（提示型，无时间线变更）：${sg.message}`);
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
      const wantKind: TimelineTrackKind = payload.mediaType === 'audio' ? 'audio' : 'video';
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
            track: { id: targetTrackId, kind: wantKind, label: wantKind === 'audio' ? '音频' : '视频', clips: [] },
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
        type: payload.mediaType === 'audio' ? 'audio' : payload.mediaType === 'image' ? 'image' : 'video',
        ...(payload.shotId ? { shotId: payload.shotId } : {}),
        ...(sourceDurationSec ? { sourceDurationSec } : {}),
      };
      ops.push({ op: 'add-clip', trackId: targetTrackId, clip, atEnd: startSec == null });
      editor.apply(ops);
      setSelectedClipId(clip.id);
      onLog(`已加入素材：${payload.label}`);
    },
    [timeline, editor, onLog],
  );

  // ── 智能替换回写 ──
  const replaceLoc = replaceClipId && timeline ? findTimelineClip(timeline, replaceClipId) : null;
  const handleReplaced = useCallback(
    (newUrl: string, sourceDurationSec?: number) => {
      if (!replaceClipId) return;
      const shotId = replaceLoc?.clip.shotId;
      const takeId = shotId && onWritebackShotVersion
        ? onWritebackShotVersion(shotId, newUrl, { prompt: '智能替换' })
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
      onLog(takeId ? `智能替换已采纳并写回镜 take（${takeId}）` : '智能替换已采纳（检查器可回滚）');
      setReplaceClipId(null);
    },
    [replaceClipId, replaceLoc?.clip.shotId, onWritebackShotVersion, editor, onLog],
  );

  // ── 快捷键 ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        const p = playerRef.current;
        if (p) (p.isPlaying() ? p.pause() : p.play());
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClipId) {
        e.preventDefault();
        editor.apply({ op: 'remove-clip', clipId: selectedClipId, ripple: e.shiftKey });
        setSelectedClipId(null);
        return;
      }
      if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && selectedClipId) {
        e.preventDefault();
        editor.apply({ op: 'split-clip', clipId: selectedClipId, atSec: playheadSec });
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
  }, [editor, selectedClipId, playheadSec]);

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
            disabled={orchestrating}
            title={arrangeHint}
            onClick={() => void runOrchestrate()}
          >
            {orchestrating ? <Loader2 size={13} className="ed-spin" /> : <Sparkles size={13} />}
            AI 编排
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
            className="ed-icon-btn"
            disabled={!selectedClipId}
            title="播放头处分割 (S)"
            onClick={() =>
              selectedClipId &&
              editor.apply({ op: 'split-clip', clipId: selectedClipId, atSec: playheadSec })
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
            />
          ) : (
            <div className="ed-empty ed-empty--stage">
              <p>{arrangeHint}</p>
              <button
                type="button"
                className="ed-btn ed-btn--primary"
                disabled={orchestrating}
                onClick={() => void runOrchestrate()}
              >
                {orchestrating ? <Loader2 size={13} className="ed-spin" /> : <Sparkles size={13} />}
                AI 编排生成时间线
              </button>
              <p className="ed-hint">或从左侧素材箱把素材拖入 / 加入时间轴，手动开始剪辑。</p>
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
              selectedClipId={selectedClipId}
              playheadSec={playheadSec}
              apply={editor.apply}
              onSelect={setSelectedClipId}
              onSmartReplace={(id) => setReplaceClipId(id)}
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
              <h4>交付</h4>
              <button
                type="button"
                className="ed-btn ed-btn--primary ed-btn--block"
                disabled={!hasContent || pendingItems.length > 0}
                title={pendingItems.length > 0 ? '请先处理待确认建议' : '确认时间线并送交已连接的交付打包'}
                onClick={() => timeline && onConfirm(timeline)}
              >
                {pendingItems.length > 0
                  ? `${pendingItems.length} 条建议待处理`
                  : '确认时间线并送交导出'}
              </button>
              <button
                type="button"
                className="ed-btn ed-btn--block"
                disabled={!hasContent}
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
          selectedClipId={selectedClipId}
          onSelect={(id) => {
            setSelectedClipId(id);
            if (id) setRightTab('clip');
          }}
          apply={editor.apply}
          onDropMedia={(trackId, sec, payload) => void addMedia(trackId, sec, payload)}
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
