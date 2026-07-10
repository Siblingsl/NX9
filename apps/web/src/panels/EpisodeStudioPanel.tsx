import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense, Component, type ReactNode, type ErrorInfo } from 'react';

class RemotionLoadErrorCatcher extends Component<{ children: ReactNode; onError: () => void }> {
  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError();
  }
  render() {
    return this.props.children;
  }
}
import { Pause, Play, X, Download, Film, AlertTriangle, ExternalLink, ChevronLeft, Zap, Sparkles, Archive, Volume2, CheckCircle, Loader } from 'lucide-react';
import {
  buildTimelineFromShotsV2,
  timelineToRemotionInputProps,
  timelineToRemotionStudioBundle,
  timelineToFcpxml,
  validateRemotionTimeline,
  clipAtTime,
  type TimelinePayload,
  type TimelineAspect,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useActivityLog } from '../stores/activity-log';
import { useStoryboardUi } from '../stores/flow-runtime';
import { api } from '../api/client';
import { useTaskPoll } from '../hooks/use-task-poll';
import JSZip from 'jszip';

const RemotionPlayer = lazy(() =>
  import('@remotion/player').then((m) => ({ default: m.Player })),
);

const Nx9Episode = lazy(() =>
  import('@nx9/remotion-compositions').then((m) => ({ default: m.Nx9Episode })),
);

interface EpisodeStudioPanelProps {
  open: boolean;
  onClose: () => void;
}

export function EpisodeStudioPanel({ open, onClose }: EpisodeStudioPanelProps) {
  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const appendLog = useActivityLog((s) => s.append);
  const setStoryboardOpen = useStoryboardUi((s) => s.setOpen);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [useFallback, setUseFallback] = useState(false);
  const [useHfPreview, setUseHfPreview] = useState(false);
  const [remotionLoadError, setRemotionLoadError] = useState(false);
  const [looping, setLooping] = useState(false);
  const [muted, setMuted] = useState(false);

  const { task: hfTask, startPolling: startHfPolling } = useTaskPoll();

  // 若 Remotion 加载失败自动降级
  useEffect(() => {
    if (remotionLoadError && !useFallback) {
      setUseFallback(true);
    }
  }, [remotionLoadError]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef(0);
  const baseTimeRef = useRef(0);

  const timelineDraft = useWorkspaceDocument((s) => s.timelineDraft);
  const setTimelineDraft = useWorkspaceDocument((s) => s.setTimelineDraft);

  const timeline: TimelinePayload = useMemo(
    () => timelineDraft || buildTimelineFromShotsV2(storyboard.shots, storyboard.title || 'NX9 Episode', {
      aspect: '9:16',
      subtitleEnabled: true,
    }),
    [storyboard.shots, storyboard.title, timelineDraft],
  );

  const validation = useMemo(() => validateRemotionTimeline(timeline), [timeline]);

  const active = useMemo(() => clipAtTime(timeline, time), [timeline, time]);

  useEffect(() => {
    if (!playing) return;
    const tick = (now: number) => {
      if (!startRef.current) startRef.current = now;
      const elapsed = (now - startRef.current) / 1000;
      const next = baseTimeRef.current + elapsed;
      if (next >= timeline.durationSec) {
        if (looping) {
          baseTimeRef.current = 0;
          setTime(0);
          startRef.current = 0;
        } else {
          setTime(timeline.durationSec);
          setPlaying(false);
        }
        return;
      }
      setTime(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, timeline.durationSec, looping]);

  useEffect(() => {
    if (useFallback) {
      if (active.video && videoRef.current) {
        videoRef.current.muted = muted;
        videoRef.current.src = active.video;
        void videoRef.current.play().catch(() => undefined);
      }
      if (active.audio && audioRef.current && !muted) {
        audioRef.current.src = active.audio;
        void audioRef.current.play().catch(() => undefined);
      }
    }
  }, [active.video, active.audio, time, useFallback, muted]);

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

  const handleExportInputProps = useCallback(() => {
    const inputProps = timelineToRemotionInputProps(timeline);
    const blob = new Blob([JSON.stringify(inputProps, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nx9-episode-inputProps.json';
    a.click();
    URL.revokeObjectURL(url);
    appendLog('Remotion inputProps 已导出');
  }, [timeline, appendLog]);

  const handleExportFcpxml = useCallback(() => {
    const xml = timelineToFcpxml(timeline);
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nx9-episode-${timeline.title}.fcpxml`;
    a.click();
    URL.revokeObjectURL(url);
    appendLog('FCPXML 已导出，可在 Final Cut Pro 中导入');
  }, [timeline, appendLog]);

  const handleFfmpegExport = useCallback(async () => {
    if (!storyboard.shots.length) {
      appendLog('快速成片：故事板无镜头');
      return;
    }
    try {
      const res = await api.concatEpisode({
        shots: storyboard.shots,
        requireApproved: false,
        title: storyboard.title || 'episode',
        audioUrl: undefined,
      });
      if (res.ok && res.url) {
        appendLog('快速成片完成: ' + res.url);
      } else {
        appendLog('快速成片失败: ' + (res.message || 'unknown'));
      }
    } catch (e) {
      appendLog('快速成片异常: ' + String(e));
    }
  }, [storyboard, appendLog]);

  const handleHfExport = useCallback(async () => {
    if (hfTask.status !== 'idle') return;
    try {
      const res = await api.renderHyperframes({ timeline });
      if (res.ok && res.taskId) {
        startHfPolling(res.taskId);
        appendLog('HF 渲染已提交，任务 ID: ' + res.taskId);
      } else {
        appendLog('HF 渲染提交失败');
      }
    } catch (e) {
      appendLog('HF 渲染提交异常: ' + String(e));
    }
  }, [timeline, hfTask.status, startHfPolling, appendLog]);

  const handleRemotionExport = useCallback(async () => {
    try {
      const bundle = timelineToRemotionStudioBundle(timeline);
      const zip = new JSZip();
      for (const file of bundle.files) {
        zip.file(file.name, file.content);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = bundle.zipFilename;
      a.click();
      URL.revokeObjectURL(a.href);
      appendLog('Remotion 工程包已下载: ' + bundle.zipFilename);
    } catch (e) {
      appendLog('Remotion 工程包导出失败: ' + String(e));
    }
  }, [timeline, appendLog]);

  if (!open) return null;

  const hasMedia = timeline.durationSec > 0 && timeline.tracks.some((t) => t.clips.length > 0);

  const trackLabels: Record<string, string> = {
    'video-1': 'V1',
    'video-2': 'V2',
    'audio-1': 'A1',
    'audio-2': 'A2',
    'subtitle-1': 'S1',
  };

  const trackColors: Record<string, string> = {
    'video-1': 'bg-blue-100 border-blue-300',
    'video-2': 'bg-purple-100 border-purple-300',
    'audio-1': 'bg-green-100 border-green-300',
    'audio-2': 'bg-emerald-100 border-emerald-300',
    'subtitle-1': 'bg-amber-100 border-amber-300',
  };

  return (
    <aside className="w-[440px] shrink-0 border-l border-line bg-white flex flex-col h-full absolute right-0 top-0 z-30 shadow-panel">
      {/* Header: [◀ 故事板] 标题 + 元信息  [导出按钮组] */}
      <div className="h-14 shrink-0 border-b border-line flex items-center px-3 gap-2 min-w-0">
        <button
          type="button"
          onClick={() => { onClose(); setStoryboardOpen(true); }}
          className="flex items-center gap-0.5 text-xs text-ink/50 hover:text-brand shrink-0 whitespace-nowrap"
          title="回到故事板"
        >
          <ChevronLeft size={14} />
          故事板
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink truncate leading-tight">
            {storyboard.title || 'EP01'}
          </p>
          <p className="text-[9px] text-ink/40 truncate leading-tight">
            {timeline.fps}fps · {timeline.durationSec.toFixed(1)}s · {timeline.aspect}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleFfmpegExport}
            disabled={!hasMedia}
            className="flex items-center gap-1 rounded-lg bg-ok/10 text-ok border border-ok/20 px-2 py-1 text-[10px] font-medium hover:bg-ok/20 disabled:opacity-40 whitespace-nowrap"
            title="FFmpeg 快速成片"
          >
            <Zap size={10} className="shrink-0" />
            快速
          </button>
          <button
            type="button"
            onClick={handleHfExport}
            disabled={!hasMedia}
            className="flex items-center gap-1 rounded-lg bg-accent/10 text-accent border border-accent/20 px-2 py-1 text-[10px] font-medium hover:bg-accent/20 disabled:opacity-40 whitespace-nowrap"
            title="HyperFrames 精美渲染 (P1)"
          >
            <Sparkles size={10} className="shrink-0" />
            HF
          </button>
          <button
            type="button"
            onClick={handleRemotionExport}
            disabled={!hasMedia}
            className="flex items-center gap-1 rounded-lg bg-brand/10 text-brand border border-brand/20 px-2 py-1 text-[10px] font-medium hover:bg-brand/20 disabled:opacity-40 whitespace-nowrap"
            title="Remotion 工程包 (P2)"
          >
            <Archive size={10} className="shrink-0" />
            工程
          </button>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-surface text-ink/50 shrink-0">
          <X size={16} />
        </button>
      </div>

      {/* HF 渲染任务状态 */}
      {hfTask.status !== 'idle' && (
        <div className="px-3 py-1.5 border-b border-line text-[10px] flex items-center gap-2">
          {hfTask.status === 'queued' && <Loader size={10} className="animate-spin text-accent" />}
          {hfTask.status === 'rendering' && <Loader size={10} className="animate-spin text-accent" />}
          {hfTask.status === 'done' && <CheckCircle size={10} className="text-ok" />}
          {hfTask.status === 'error' && <AlertTriangle size={10} className="text-warn" />}
          <span className="text-ink/60">
            {hfTask.status === 'queued' && 'HF 渲染排队中…'}
            {hfTask.status === 'rendering' && 'HF 渲染中…'}
            {hfTask.status === 'done' && '渲染完成'}
            {hfTask.status === 'error' && '渲染失败: ' + (hfTask.message || '')}
          </span>
          {hfTask.status === 'done' && hfTask.url && (
            <a
              href={hfTask.url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-brand hover:underline"
            >
              下载
            </a>
          )}
          {hfTask.status === 'error' && (
            <button type="button" onClick={() => handleHfExport()} className="ml-auto text-brand hover:underline">
              重试
            </button>
          )}
        </div>
      )}

      {!hasMedia ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
          <Film size={32} className="text-ink/20" />
          <p className="text-sm font-medium text-ink">暂无成片素材</p>
          <p className="text-[11px] text-ink/50 leading-relaxed max-w-[240px]">
            请先在故事板中生成视频或首帧截图，审阅通过后可在此预览并导出成片。
          </p>
          <button
            type="button"
            onClick={() => { onClose(); setStoryboardOpen(true); }}
            className="flex items-center gap-1.5 rounded-xl bg-brand text-white px-4 py-2 text-sm hover:bg-brand/90"
          >
            <ExternalLink size={14} />
            回到步骤⑨ 生成视频
          </button>
        </div>
      ) : (
        <>
          {/* 帧级预览区 */}
          <div className="aspect-video bg-ink/5 border-b border-line flex items-center justify-center relative overflow-hidden">
            {useHfPreview ? (
              <iframe
                src={`/api/montage/hyperframes-preview?workspaceId=${storyboard.title || 'default'}`}
                className="w-full h-full border-0"
                title="HF Preview"
              />
            ) : !useFallback && !remotionLoadError ? (
              <Suspense fallback={<div className="text-xs text-ink/40">加载 Remotion Player…</div>}>
                <RemotionLoadErrorCatcher onError={() => setRemotionLoadError(true)}>
                  <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                    <RemotionPlayer
                      component={Nx9Episode}
                      inputProps={{ timeline }}
                      durationInFrames={Math.max(1, Math.ceil(timeline.durationSec * timeline.fps))}
                      fps={timeline.fps}
                      compositionWidth={timeline.width}
                      compositionHeight={timeline.height}
                      controls
                      style={{ width: '100%', height: '100%' }}
                    />
                  </div>
                </RemotionLoadErrorCatcher>
              </Suspense>
            ) : (
              <>
                {active.video ? (
                  <video ref={videoRef} className="w-full h-full object-contain" muted={muted} playsInline />
                ) : active.image ? (
                  <img src={active.image} alt="" className="w-full h-full object-contain" />
                ) : (
                  <p className="text-xs text-ink/40">无视频素材</p>
                )}
                {active.label && (
                  <span className="absolute bottom-2 left-2 text-[10px] bg-ink/70 text-white px-2 py-0.5 rounded">
                    {active.label}
                  </span>
                )}
                <audio ref={audioRef} className="hidden" />
                {remotionLoadError && (
                  <div className="absolute top-2 right-2 text-[9px] px-2 py-1 rounded bg-amber-100 text-amber-800 border border-amber-200">
                    Remotion 不可用，已降级
                  </div>
                )}
              </>
            )}
            <div className="absolute top-2 right-2 flex gap-1">
              <button
                type="button"
                onClick={() => setUseHfPreview((v) => !v)}
                className="text-[9px] px-2 py-1 rounded bg-white/80 border border-line text-ink/50 hover:text-ink"
                title={useHfPreview ? '切换到 Remotion Player' : '切换到 HF iframe 预览'}
              >
                HF
              </button>
              {!useHfPreview && (
                <button
                  type="button"
                  onClick={() => setUseFallback((v) => !v)}
                  className="text-[9px] px-2 py-1 rounded bg-white/80 border border-line text-ink/50 hover:text-ink"
                  title={useFallback ? '切换到 Remotion Player' : '切换到 HTML5 降级预览'}
                >
                  {useFallback ? 'Remotion' : '降级'}
                </button>
              )}
            </div>
          </div>

          {/* 验证警告区 */}
          {validation.warnings.length > 0 && (
            <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 flex flex-wrap gap-x-3 gap-y-0.5">
              {validation.warnings.map((w, i) => (
                <span key={i} className="flex items-center gap-1">
                  <AlertTriangle size={10} />
                  {w}
                </span>
              ))}
              {validation.ok && (
                <span className="flex items-center gap-1 text-ok font-medium">
                  <CheckCircle size={10} /> 审阅已通过
                </span>
              )}
            </div>
          )}

          {/* 进度条 */}
          <div className="px-3 pt-2 pb-1 border-b border-line">
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
            <div className="flex items-center gap-2 mt-0.5">
              <button type="button" onClick={togglePlay} className="p-1.5 rounded-lg bg-brand text-white hover:bg-brand/90">
                {playing ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <span className="text-xs font-mono text-ink/60">
                {time.toFixed(1)}s / {timeline.durationSec.toFixed(1)}s
              </span>
              <button
                type="button"
                onClick={() => setLooping((v) => !v)}
                className={`text-[10px] px-2 py-0.5 rounded ${looping ? 'bg-brand/10 text-brand' : 'text-ink/40'}`}
              >
                循环
              </button>
              <button
                type="button"
                onClick={() => setMuted((v) => !v)}
                className={`p-1 rounded ${muted ? 'text-ink/40' : 'text-ink/60'}`}
              >
                <Volume2 size={12} />
              </button>
              <button
                type="button"
                onClick={handleExportInputProps}
                className="flex items-center gap-1 text-[10px] text-brand hover:underline"
              >
                <Download size={12} />
                inputProps
              </button>
              <button
                type="button"
                onClick={handleExportFcpxml}
                className="flex items-center gap-1 text-[10px] text-brand hover:underline"
              >
                <Download size={12} />
                FCPXML
              </button>
            </div>
          </div>

          {/* Scene 轨 */}
          <div className="px-2 pt-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold text-ink/60">场景轨</span>
            </div>
            {(() => {
              const sceneMap = new Map<string, { label: string; startSec: number; durationSec: number }>();
              for (const shot of storyboard.shots) {
                const code = shot.sceneCode ?? 'default';
                if (!sceneMap.has(code)) {
                  sceneMap.set(code, { label: `S${code}`, startSec: (shot.index - 1) * (shot.durationSec || 4), durationSec: 0 });
                }
                const s = sceneMap.get(code)!;
                s.durationSec += shot.durationSec || 4;
              }
              const sorted = [...sceneMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
              return (
                <div className="flex items-start gap-1.5 mb-2">
                  <span className="w-5 shrink-0 font-mono font-bold text-ink/40 mt-1">S</span>
                  <div className="flex-1 flex gap-0.5">
                    {sorted.map(([code, scene]) => {
                      const widthPct = timeline.durationSec > 0 ? (scene.durationSec / timeline.durationSec) * 100 : 0;
                      const leftPct = timeline.durationSec > 0 ? (scene.startSec / timeline.durationSec) * 100 : 0;
                      return (
                        <div
                          key={code}
                          className="h-4 rounded border border-brand/20 bg-brand/5 flex items-center px-1 text-[8px] text-brand/60 font-medium truncate"
                          style={{ width: `${widthPct}%`, marginLeft: `${leftPct}%` }}
                          title={`${scene.label} · ${scene.durationSec.toFixed(1)}s`}
                        >
                          {scene.label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* 多轨时间线 */}
          <div className="flex-1 overflow-y-auto p-2 min-h-0 text-[10px] space-y-1">
            {timeline.tracks.map((track) => {
              const label = trackLabels[track.id] || track.id;
              const color = trackColors[track.id] || 'bg-surface border-line';
              return (
                <div key={track.id} className="flex items-start gap-1.5">
                  <span className="w-5 shrink-0 font-mono font-bold text-ink/40 mt-1">{label}</span>
                  <div className="flex-1 space-y-0.5">
                    {track.clips.map((c) => {
                      const widthPct = timeline.durationSec > 0 ? (c.durationSec / timeline.durationSec) * 100 : 0;
                      const leftPct = timeline.durationSec > 0 ? (c.startSec / timeline.durationSec) * 100 : 0;
                      const isActive = time >= c.startSec && time < c.startSec + c.durationSec;
                      return (
                        <div
                          key={c.id}
                          className={`relative h-5 rounded border ${color} ${isActive ? 'ring-2 ring-brand/40' : ''}`}
                          style={{ width: `${widthPct}%`, marginLeft: `${leftPct}%` }}
                          title={`${c.label} · ${c.startSec.toFixed(1)}s +${c.durationSec.toFixed(1)}s`}
                        >
                          <span className="absolute inset-0 flex items-center px-1 truncate text-[9px] font-medium">
                            {c.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}
