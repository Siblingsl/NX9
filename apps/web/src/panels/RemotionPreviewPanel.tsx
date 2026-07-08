import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, X, Download } from 'lucide-react';
import {
  buildTimelineFromShots,
  clipAtTime,
  shotsToRemotion,
  type TimelinePayload,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useActivityLog } from '../stores/activity-log';

export function RemotionPreviewPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const appendLog = useActivityLog((s) => s.append);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef(0);
  const baseTimeRef = useRef(0);

  const timeline: TimelinePayload = useMemo(
    () => buildTimelineFromShots(storyboard.shots, storyboard.title || 'NX9 Preview'),
    [storyboard.shots, storyboard.title],
  );

  const remotion = useMemo(
    () => shotsToRemotion(storyboard.shots, storyboard.title),
    [storyboard.shots, storyboard.title],
  );

  const active = useMemo(() => clipAtTime(timeline, time), [timeline, time]);

  useEffect(() => {
    if (!playing) return;
    const tick = (now: number) => {
      if (!startRef.current) startRef.current = now;
      const elapsed = (now - startRef.current) / 1000;
      const next = baseTimeRef.current + elapsed;
      if (next >= timeline.durationSec) {
        setTime(timeline.durationSec);
        setPlaying(false);
        return;
      }
      setTime(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, timeline.durationSec]);

  useEffect(() => {
    if (active.video && videoRef.current) {
      videoRef.current.src = active.video;
      void videoRef.current.play().catch(() => undefined);
    }
    if (active.audio && audioRef.current) {
      audioRef.current.src = active.audio;
      void audioRef.current.play().catch(() => undefined);
    }
  }, [active.video, active.audio, time]);

  const togglePlay = useCallback(() => {
    if (playing) {
      setPlaying(false);
      baseTimeRef.current = time;
      startRef.current = 0;
    } else {
      if (time >= timeline.durationSec) {
        baseTimeRef.current = 0;
        setTime(0);
      } else {
        baseTimeRef.current = time;
      }
      startRef.current = 0;
      setPlaying(true);
    }
  }, [playing, time, timeline.durationSec]);

  const handleExportRemotion = useCallback(() => {
    const blob = new Blob([JSON.stringify(remotion, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nx9-remotion-composition.json';
    a.click();
    URL.revokeObjectURL(url);
    appendLog('Remotion 合成描述已导出');
  }, [remotion, appendLog]);

  if (!open) return null;

  return (
    <aside className="w-[400px] shrink-0 border-l border-line bg-white flex flex-col h-full absolute right-0 top-0 z-30 shadow-panel">
      <div className="h-12 shrink-0 border-b border-line flex items-center px-3 gap-2">
        <span className="font-semibold text-sm flex-1">Remotion 预览</span>
        <span className="text-[10px] text-ink/50">{remotion.fps}fps · {timeline.durationSec}s</span>
        <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-surface text-ink/50">
          <X size={16} />
        </button>
      </div>

      <div className="aspect-video bg-ink/5 border-b border-line flex items-center justify-center relative overflow-hidden">
        {active.video ? (
          <video ref={videoRef} className="w-full h-full object-contain" muted playsInline />
        ) : active.image ? (
          <img src={active.image} alt="" className="w-full h-full object-contain" />
        ) : (
          <p className="text-xs text-ink/40">无视频素材 · 请为镜头生成视频或首帧</p>
        )}
        {active.label && (
          <span className="absolute bottom-2 left-2 text-[10px] bg-ink/70 text-white px-2 py-0.5 rounded">
            {active.label}
          </span>
        )}
        <audio ref={audioRef} className="hidden" />
      </div>

      <div className="p-3 space-y-2 border-b border-line">
        <input
          type="range"
          min={0}
          max={timeline.durationSec}
          step={0.05}
          value={time}
          onChange={(e) => {
            setPlaying(false);
            baseTimeRef.current = Number(e.target.value);
            setTime(Number(e.target.value));
          }}
          className="w-full accent-brand"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            className="p-2 rounded-xl bg-brand text-white hover:bg-brand/90"
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <span className="text-xs font-mono text-ink/60">
            {time.toFixed(1)}s / {timeline.durationSec.toFixed(1)}s
          </span>
          <button
            type="button"
            onClick={handleExportRemotion}
            className="ml-auto flex items-center gap-1 text-xs text-brand hover:underline"
          >
            <Download size={14} />
            导出 Remotion JSON
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 min-h-0 text-xs space-y-1">
        {remotion.props.tracks.map((track) => (
          <div key={track.id} className="rounded-lg border border-line p-2">
            <p className="font-medium text-ink/70 mb-1">{track.kind} track</p>
            {track.clips.map((c) => (
              <div
                key={c.id}
                className={`py-0.5 truncate ${time * remotion.fps >= c.from && time * remotion.fps < c.from + c.durationInFrames ? 'text-brand font-medium' : 'text-ink/50'}`}
              >
                f{c.from} +{c.durationInFrames} · {c.label}
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
