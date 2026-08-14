import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock, LockOpen, Plus, Volume2, VolumeX } from 'lucide-react';
import {
  MIN_CLIP_SEC,
  nextTrackId,
  type TimelineClip,
  type TimelineOp,
  type TimelinePayload,
  type TimelineTrack,
  type TimelineTrackKind,
  sortVolumeKeyframes,
  type TimelineVolumeKeyframe,
} from '@nx9/shared';

export const HEAD_W = 96;
const RULER_H = 26;
const SNAP_PX = 8;

const TRACK_HEIGHT: Record<TimelineTrackKind, number> = {
  video: 52,
  overlay: 34,
  subtitle: 30,
  audio: 36,
};

const KIND_LABEL: Record<TimelineTrackKind, string> = {
  video: '视频',
  overlay: '贴片',
  subtitle: '字幕',
  audio: '音频',
};

export interface MediaDropPayload {
  url: string;
  mediaType: 'video' | 'audio' | 'image';
  label: string;
  durationSec?: number;
  shotId?: string;
}

export const MEDIA_DRAG_MIME = 'application/x-nx9-media';

interface DragState {
  mode: 'move' | 'trim-l' | 'trim-r';
  clipId: string;
  trackId: string;
  startClientX: number;
  deltaSec: number;
  hoverTrackId: string | null;
  moved: boolean;
}

interface VolumeDragState {
  clipId: string;
  keyframeAtSec: number;
  volume: number;
  durationSec: number;
  clipStartLeft: number;
  startClientX: number;
  currentAtSec: number;
  moved: boolean;
}

export interface TimelinePanelProps {
  timeline: TimelinePayload;
  pxPerSec: number;
  onZoom: (pxPerSec: number) => void;
  playheadSec: number;
  onSeek: (sec: number) => void;
  selectedClipId: string | null;
  onSelect: (clipId: string | null) => void;
  apply: (ops: TimelineOp | TimelineOp[]) => unknown;
  onDropMedia: (trackId: string, startSec: number, payload: MediaDropPayload) => void;
}

function pickRulerStep(pxPerSec: number): number {
  const candidates = [0.2, 0.5, 1, 2, 5, 10, 15, 30, 60];
  for (const c of candidates) {
    if (c * pxPerSec >= 64) return c;
  }
  return 120;
}

function formatTick(sec: number): string {
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec - m * 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return Number.isInteger(sec) ? `${sec}s` : `${sec.toFixed(1)}s`;
}

interface VolumeEnvelopeProps {
  clip: TimelineClip;
  pxPerSec: number;
  drag: VolumeDragState | null;
  onPointerDown: (e: React.PointerEvent, clip: TimelineClip, kf: TimelineVolumeKeyframe) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

/** DR-06: 选中片段时在轨上展示音量包络折线 + 可拖拽菱形关键帧。 */
function VolumeEnvelope({
  clip,
  pxPerSec,
  drag,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: VolumeEnvelopeProps) {
  const keys = useMemo(() => sortVolumeKeyframes(clip.volumeKeyframes), [clip.volumeKeyframes]);
  if (keys.length === 0) return null;
  const width = Math.max(6, clip.durationSec * pxPerSec);
  const xOf = (sec: number) => Math.max(0, Math.min(width, sec * pxPerSec));
  const yOf = (volume: number) => Math.round(100 - (Math.max(0, Math.min(2, volume)) / 2) * 100);
  const points = keys
    .map((kf) => {
      const active = drag?.clipId === clip.id && drag.keyframeAtSec === kf.atSec;
      return `${xOf(active ? drag!.currentAtSec : kf.atSec)},${yOf(kf.volume)}`;
    })
    .join(' ');
  const last = keys[keys.length - 1];
  const linePoints = points + (last ? ` ${width},${yOf(last.volume)}` : '');
  return (
    <div className="ed-clip__volume" aria-hidden="true">
      <svg className="ed-clip__volume-line" viewBox={`0 0 ${width} 100`} preserveAspectRatio="none">
        <polyline points={linePoints} />
      </svg>
      {keys.map((kf) => {
        const active = drag?.clipId === clip.id && drag.keyframeAtSec === kf.atSec;
        const left = xOf(active ? drag!.currentAtSec : kf.atSec);
        return (
          <span
            key={`${kf.atSec}-${kf.volume}`}
            className={`ed-clip__volume-kf ${active ? 'is-dragging' : ''}`}
            style={{ left: `${left}px`, top: `${yOf(kf.volume)}%` }}
            title={`音量 ${Math.round(kf.volume * 100)}% · ${kf.atSec.toFixed(2)}s`}
            onPointerDown={(e) => onPointerDown(e, clip, kf)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        );
      })}
    </div>
  );
}

interface AudioPeakData {
  bars: number[];
}

const audioPeakCache = new Map<string, AudioPeakData>();

/** SE-SPEC-03: 用 WebAudio 解码对白/BGM 并绘制波形；解码失败保持纯色块。 */
function useAudioPeaks(urls: string[]): Map<string, AudioPeakData> {
  const [peaks, setPeaks] = useState<Map<string, AudioPeakData>>(() => {
    const m = new Map<string, AudioPeakData>();
    for (const u of urls) {
      const cached = audioPeakCache.get(u);
      if (cached) m.set(u, cached);
    }
    return m;
  });
  const key = urls.join('|');
  useEffect(() => {
    let cancelled = false;
    const pending = urls.filter((u) => !audioPeakCache.has(u) && !peaks.has(u));
    for (const url of pending) {
      void (async () => {
        try {
          const Ctor = window.AudioContext
            ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!Ctor) return;
          const res = await fetch(url);
          if (!res.ok) return;
          const buf = await res.arrayBuffer();
          const ctx = new Ctor();
          const audio = await ctx.decodeAudioData(buf);
          const channel = audio.getChannelData(0);
          const barCount = 48;
          const block = Math.max(1, Math.floor(channel.length / barCount));
          const bars: number[] = [];
          for (let i = 0; i < barCount; i++) {
            let max = 0;
            const start = i * block;
            const end = Math.min(channel.length, start + block);
            for (let j = start; j < end; j++) max = Math.max(max, Math.abs(channel[j]));
            bars.push(max);
          }
          await ctx.close();
          const data: AudioPeakData = { bars };
          audioPeakCache.set(url, data);
          if (!cancelled) {
            setPeaks((prev) => { const next = new Map(prev); next.set(url, data); return next; });
          }
        } catch {
          /* 解码失败保持纯色块，不阻塞时间轴 */
        }
      })();
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return peaks;
}
export function TimelinePanel({

  timeline,
  pxPerSec,
  onZoom,
  playheadSec,
  onSeek,
  selectedClipId,
  onSelect,
  apply,
  onDropMedia,
}: TimelinePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const [volumeDrag, setVolumeDrag] = useState<VolumeDragState | null>(null);
  const volumeDragRef = useRef<VolumeDragState | null>(null);
  volumeDragRef.current = volumeDrag;

  // Ctrl+滚轮缩放（native 监听，preventDefault 需要非 passive）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      onZoom(Math.min(240, Math.max(8, pxPerSec * factor)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [pxPerSec, onZoom]);

  const contentWidth = Math.max(320, timeline.durationSec * pxPerSec + 240);

  const audioUrls = useMemo(
    () => [
      ...new Set(
        timeline.tracks
          .filter((t) => t.kind === 'audio')
          .flatMap((t) => t.clips.filter((c) => c.type === 'audio').map((c) => c.assetUrl).filter(Boolean)),
      ),
    ],
    [timeline],
  );
  const audioPeaks = useAudioPeaks(audioUrls);

  /** 磁吸目标：其他片段边缘 + 播放头 + 0 点 */
  const snapTargets = useMemo(() => {
    const targets: number[] = [0, playheadSec];
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        if (clip.id === drag?.clipId) continue;
        targets.push(clip.startSec, clip.startSec + clip.durationSec);
      }
    }
    return targets;
  }, [timeline, playheadSec, drag?.clipId]);

  const snap = useCallback(
    (startSec: number, durationSec: number): number => {
      const thr = SNAP_PX / pxPerSec;
      let best = startSec;
      let bestDist = thr;
      for (const t of snapTargets) {
        const dStart = Math.abs(startSec - t);
        if (dStart < bestDist) {
          bestDist = dStart;
          best = t;
        }
        const dEnd = Math.abs(startSec + durationSec - t);
        if (dEnd < bestDist) {
          bestDist = dEnd;
          best = t - durationSec;
        }
      }
      return Math.max(0, best);
    },
    [snapTargets, pxPerSec],
  );

  // ── 片段拖拽 ──
  const onClipPointerDown = useCallback(
    (e: React.PointerEvent, clip: TimelineClip, track: TimelineTrack, mode: DragState['mode']) => {
      if (e.button !== 0) return;
      if (track.locked) return;
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      onSelect(clip.id);
      setDrag({
        mode,
        clipId: clip.id,
        trackId: track.id,
        startClientX: e.clientX,
        deltaSec: 0,
        hoverTrackId: null,
        moved: false,
      });
    },
    [onSelect],
  );

  const onClipPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const deltaSec = (e.clientX - d.startClientX) / pxPerSec;
      let hoverTrackId: string | null = null;
      if (d.mode === 'move') {
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const lane = under?.closest?.('[data-lane-track]') as HTMLElement | null;
        hoverTrackId = lane?.dataset.laneTrack ?? null;
      }
      setDrag({ ...d, deltaSec, hoverTrackId, moved: d.moved || Math.abs(deltaSec * pxPerSec) > 3 });
    },
    [pxPerSec],
  );

  const onClipPointerUp = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    setDrag(null);
    if (!d.moved) return;
    const loc = timeline.tracks
      .flatMap((t) => t.clips.map((c) => ({ t, c })))
      .find(({ c }) => c.id === d.clipId);
    if (!loc) return;
    if (d.mode === 'move') {
      const raw = Math.max(0, loc.c.startSec + d.deltaSec);
      const snapped = snap(raw, loc.c.durationSec);
      const toTrackId =
        d.hoverTrackId && d.hoverTrackId !== d.trackId ? d.hoverTrackId : undefined;
      apply({ op: 'move-clip', clipId: d.clipId, startSec: snapped, toTrackId });
    } else {
      apply({
        op: 'trim-clip',
        clipId: d.clipId,
        edge: d.mode === 'trim-l' ? 'start' : 'end',
        deltaSec: d.deltaSec,
      });
    }
  }, [apply, snap, timeline]);

  // ── 音量包络关键帧（DR-06：拖动只改 atSec，音量保持） ──
  const onVolumeKeyframeDown = useCallback(
    (e: React.PointerEvent, clip: TimelineClip, kf: TimelineVolumeKeyframe) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      onSelect(clip.id);
      setVolumeDrag({
        clipId: clip.id,
        keyframeAtSec: kf.atSec,
        volume: kf.volume,
        durationSec: clip.durationSec,
        clipStartLeft: clip.startSec * pxPerSec,
        startClientX: e.clientX,
        currentAtSec: kf.atSec,
        moved: false,
      });
    },
    [onSelect, pxPerSec],
  );

  const onVolumeKeyframeMove = useCallback(
    (e: React.PointerEvent) => {
      const d = volumeDragRef.current;
      if (!d) return;
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const atSec = Math.max(
        0,
        Math.min(
          d.durationSec,
          (e.clientX - rect.left + el.scrollLeft - HEAD_W - d.clipStartLeft) / pxPerSec,
        ),
      );
      const moved = d.moved || Math.abs(e.clientX - d.startClientX) > 3;
      setVolumeDrag({ ...d, currentAtSec: atSec, moved });
    },
    [pxPerSec],
  );

  const onVolumeKeyframeUp = useCallback(
    (e: React.PointerEvent) => {
      const d = volumeDragRef.current;
      if (!d) return;
      e.stopPropagation();
      setVolumeDrag(null);
      if (!d.moved) return;
      apply({
        op: 'set-volume-keyframe',
        clipId: d.clipId,
        atSec: d.currentAtSec,
        volume: d.volume,
      });
    },
    [apply],
  );

  // ── 标尺 seek ──
  const seekFromEvent = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left + el.scrollLeft - HEAD_W;
      onSeek(Math.max(0, x / pxPerSec));
    },
    [onSeek, pxPerSec],
  );

  const [seeking, setSeeking] = useState(false);

  // ── 视觉位置（拖拽 transient 预览） ──
  const clipVisual = useCallback(
    (clip: TimelineClip): { left: number; width: number; ghost: boolean } => {
      const d = drag;
      if (!d || d.clipId !== clip.id || !d.moved) {
        return { left: clip.startSec * pxPerSec, width: clip.durationSec * pxPerSec, ghost: false };
      }
      const speed = clip.speed ?? 1;
      if (d.mode === 'move') {
        const raw = Math.max(0, clip.startSec + d.deltaSec);
        const snapped = snap(raw, clip.durationSec);
        return { left: snapped * pxPerSec, width: clip.durationSec * pxPerSec, ghost: true };
      }
      if (d.mode === 'trim-l') {
        let delta = Math.min(d.deltaSec, clip.durationSec - MIN_CLIP_SEC);
        delta = Math.max(delta, Math.max(-(clip.trimInSec ?? 0) / speed, -clip.startSec));
        return {
          left: (clip.startSec + delta) * pxPerSec,
          width: (clip.durationSec - delta) * pxPerSec,
          ghost: true,
        };
      }
      const maxDur =
        clip.sourceDurationSec != null && (clip.type === 'video' || clip.type === 'audio')
          ? Math.max(MIN_CLIP_SEC, (clip.sourceDurationSec - (clip.trimInSec ?? 0)) / speed)
          : Number.POSITIVE_INFINITY;
      const newDur = Math.max(MIN_CLIP_SEC, Math.min(clip.durationSec + d.deltaSec, maxDur));
      return { left: clip.startSec * pxPerSec, width: newDur * pxPerSec, ghost: true };
    },
    [drag, pxPerSec, snap],
  );

  // ── 素材拖入 ──
  const onLaneDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(MEDIA_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const onLaneDrop = useCallback(
    (e: React.DragEvent, track: TimelineTrack) => {
      const raw = e.dataTransfer.getData(MEDIA_DRAG_MIME);
      if (!raw) return;
      e.preventDefault();
      try {
        const payload = JSON.parse(raw) as MediaDropPayload;
        const laneRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const sec = Math.max(0, (e.clientX - laneRect.left) / pxPerSec);
        onDropMedia(track.id, sec, payload);
      } catch {
        /* 非法拖拽负载忽略 */
      }
    },
    [onDropMedia, pxPerSec],
  );

  // ── 标尺刻度 ──
  const step = pickRulerStep(pxPerSec);
  const tickCount = Math.ceil(contentWidth / (step * pxPerSec)) + 1;
  const ticks = Array.from({ length: tickCount }, (_, i) => i * step);

  const addTrack = useCallback(
    (kind: TimelineTrackKind) => {
      apply({
        op: 'add-track',
        track: {
          id: nextTrackId(timeline.tracks, kind),
          kind,
          label: KIND_LABEL[kind],
          clips: [],
        },
      });
    },
    [apply, timeline.tracks],
  );

  return (
    <div className="ed-tl" ref={scrollRef}>
      <div className="ed-tl__content" style={{ width: contentWidth + HEAD_W }}>
        {/* 标尺 */}
        <div className="ed-tl__row" style={{ height: RULER_H }}>
          <div className="ed-tl__head ed-tl__head--ruler" style={{ width: HEAD_W }} />
          <div
            className="ed-tl__ruler"
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setSeeking(true);
              seekFromEvent(e);
            }}
            onPointerMove={(e) => seeking && seekFromEvent(e)}
            onPointerUp={() => setSeeking(false)}
          >
            {ticks.map((t) => (
              <span key={t} className="ed-tl__tick" style={{ left: t * pxPerSec }}>
                {formatTick(t)}
              </span>
            ))}
          </div>
        </div>

        {/* 轨道 */}
        {timeline.tracks.map((track) => {
          const h = TRACK_HEIGHT[track.kind] ?? 40;
          return (
            <div key={track.id} className="ed-tl__row" style={{ height: h }}>
              <div
                className={`ed-tl__head ed-tl__head--${track.kind}`}
                style={{ width: HEAD_W }}
                title={`${track.id} · ${KIND_LABEL[track.kind]}`}
              >
                <span className="ed-tl__head-label">
                  {track.label || track.id}
                </span>
                <span className="ed-tl__head-actions">
                  {track.kind !== 'subtitle' && (
                    <button
                      type="button"
                      className={`ed-mini-btn ${track.muted ? 'is-on' : ''}`}
                      title={track.muted ? '取消静音' : '静音'}
                      onClick={() =>
                        apply({ op: 'set-track', trackId: track.id, patch: { muted: !track.muted } })
                      }
                    >
                      {track.muted ? <VolumeX size={11} /> : <Volume2 size={11} />}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`ed-mini-btn ${track.locked ? 'is-on' : ''}`}
                    title={track.locked ? '解锁' : '锁定'}
                    onClick={() =>
                      apply({ op: 'set-track', trackId: track.id, patch: { locked: !track.locked } })
                    }
                  >
                    {track.locked ? <Lock size={11} /> : <LockOpen size={11} />}
                  </button>
                </span>
              </div>
              <div
                className={`ed-tl__lane ${track.locked ? 'is-locked' : ''} ${track.muted ? 'is-muted' : ''} ${
                  drag?.hoverTrackId === track.id && drag.trackId !== track.id ? 'is-drop-hint' : ''
                }`}
                data-lane-track={track.id}
                onDragOver={onLaneDragOver}
                onDrop={(e) => onLaneDrop(e, track)}
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) onSelect(null);
                }}
              >
                {track.clips.map((clip) => {
                  const vis = clipVisual(clip);
                  return (
                    <div
                      key={clip.id}
                      className={`ed-clip ed-clip--${clip.type} ${
                        selectedClipId === clip.id ? 'is-selected' : ''
                      } ${vis.ghost ? 'is-ghost' : ''}`}
                      style={{ left: vis.left, width: Math.max(6, vis.width) }}
                      onPointerDown={(e) => onClipPointerDown(e, clip, track, 'move')}
                      onPointerMove={onClipPointerMove}
                      onPointerUp={onClipPointerUp}
                      title={`${clip.label} · ${clip.durationSec.toFixed(1)}s`}
                    >
                      <span className="ed-clip__label">
                        {clip.type === 'subtitle' ? clip.text || clip.label : clip.label}
                      </span>
                      <span className="ed-clip__dur">{clip.durationSec.toFixed(1)}s</span>
                      {clip.type === 'audio' && audioPeaks.get(clip.assetUrl) && (
                        <span className="ed-clip__wave" aria-hidden="true">
                          {audioPeaks.get(clip.assetUrl)!.bars.map((v, i) => (
                            <i key={i} style={{ height: `${Math.max(10, Math.round(v * 90))}%` }} />
                          ))}
                        </span>
                      )}
                      {clip.transitionOut && clip.transitionOut.kind !== 'cut' && (
                        <span className="ed-clip__transition" title={`转场 ${clip.transitionOut.kind} ${clip.transitionOut.durationSec}s`} />
                      )}
                      {clip.replacedFrom && <span className="ed-clip__replaced" title="已智能替换" />}
                      {selectedClipId === clip.id && (clip.volumeKeyframes?.length ?? 0) > 0 && (
                        <VolumeEnvelope
                          clip={clip}
                          pxPerSec={pxPerSec}
                          drag={volumeDrag}
                          onPointerDown={onVolumeKeyframeDown}
                          onPointerMove={onVolumeKeyframeMove}
                          onPointerUp={onVolumeKeyframeUp}
                        />
                      )}
                      {!track.locked && (
                        <>
                          <span
                            className="ed-clip__handle ed-clip__handle--l"
                            onPointerDown={(e) => onClipPointerDown(e, clip, track, 'trim-l')}
                            onPointerMove={onClipPointerMove}
                            onPointerUp={onClipPointerUp}
                          />
                          <span
                            className="ed-clip__handle ed-clip__handle--r"
                            onPointerDown={(e) => onClipPointerDown(e, clip, track, 'trim-r')}
                            onPointerMove={onClipPointerMove}
                            onPointerUp={onClipPointerUp}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* 加轨 */}
        <div className="ed-tl__row ed-tl__row--add">
          <div className="ed-tl__head" style={{ width: HEAD_W }}>
            <Plus size={11} />
          </div>
          <div className="ed-tl__add-actions">
            <button type="button" className="ed-mini-btn" onClick={() => addTrack('video')}>
              + 视频轨
            </button>
            <button type="button" className="ed-mini-btn" onClick={() => addTrack('audio')}>
              + 音频轨
            </button>
            <button type="button" className="ed-mini-btn" onClick={() => addTrack('subtitle')}>
              + 字幕轨
            </button>
            <button type="button" className="ed-mini-btn" onClick={() => addTrack('overlay')} title="贴片位姿可在检查器编辑（预览与 Remotion 同源）">
              + 贴片轨
            </button>
          </div>
        </div>

        {/* 播放头 */}
        <div
          className="ed-tl__playhead"
          style={{ left: HEAD_W + playheadSec * pxPerSec }}
        >
          <span className="ed-tl__playhead-cap" />
        </div>
      </div>
    </div>
  );
}
