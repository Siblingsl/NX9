import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { Nx9Episode } from '@nx9/remotion-compositions';
import { Hand, Minus, Move, Pause, Play, Plus, RotateCw, SkipBack, SkipForward, ZoomIn, ZoomOut } from 'lucide-react';
import {
  findTimelineClip,
  type TimelineClip,
  type TimelineOp,
  type TimelinePayload,
} from '@nx9/shared';
import type { SmartEditEngine, SmartEditProfile } from '@nx9/shared';

export interface PreviewPlayerProps {
  timeline: TimelinePayload;
  playheadSec: number;
  onSeek: (sec: number) => void;
  /** 播放中由 Player 驱动播放头 */
  onFrameUpdate: (sec: number) => void;
  playerRef: React.MutableRefObject<PlayerRef | null>;
  /** 当前解析后的渲染引擎，用于明示预览与成片是否同引擎 */
  engine: SmartEditEngine;
  profile: SmartEditProfile;
  /** 画布直接操作：选中贴片时显示移动/缩放/旋转手柄 */
  selectedClipIds: string[];
  apply: (ops: TimelineOp | TimelineOp[]) => unknown;
}

function formatTime(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`;
}

/**
 * 帧精确预览：与服务端 Remotion 渲染共用同一份 Nx9Episode 合成，
 * 从机制上保证「预览 = 成片」。
 */
export function PreviewPlayer({
  timeline,
  playheadSec,
  onSeek,
  onFrameUpdate,
  playerRef,
  engine,
  profile,
  selectedClipIds,
  apply,
}: PreviewPlayerProps) {
  const fps = timeline.fps || 30;
  const durationInFrames = Math.max(1, Math.ceil((timeline.durationSec || 1) * fps));
  const [playing, setPlaying] = useState(false);
  const internalSeek = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);
  const panningRef = useRef(false);

  const selectedOverlay = useMemo(() => {
    if (selectedClipIds.length === 0) return null;
    for (const track of timeline.tracks) {
      if (track.kind !== 'overlay') continue;
      for (const id of selectedClipIds) {
        const loc = findTimelineClip(timeline, id);
        if (loc && loc.clip.type === 'overlay') return loc.clip;
      }
    }
    return null;
  }, [timeline, selectedClipIds]);

  const attachRef = useCallback(
    (ref: PlayerRef | null) => {
      playerRef.current = ref;
    },
    [playerRef],
  );

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = (e: { detail: { frame: number } }) => {
      internalSeek.current = true;
      onFrameUpdate(e.detail.frame / fps);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    player.addEventListener('frameupdate', onFrame as never);
    player.addEventListener('play', onPlay);
    player.addEventListener('pause', onPause);
    return () => {
      player.removeEventListener('frameupdate', onFrame as never);
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
    };
  }, [playerRef, fps, onFrameUpdate, durationInFrames]);

  // 外部播放头（时间轴拖动）→ Player seek
  useEffect(() => {
    if (internalSeek.current) {
      internalSeek.current = false;
      return;
    }
    const player = playerRef.current;
    if (!player) return;
    const frame = Math.min(durationInFrames - 1, Math.max(0, Math.round(playheadSec * fps)));
    if (player.getCurrentFrame() !== frame) player.seekTo(frame);
  }, [playheadSec, fps, durationInFrames, playerRef]);

  const togglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isPlaying()) player.pause();
    else player.play();
  }, [playerRef]);

  const zoomBy = useCallback((factor: number) => {
    setZoom((z) => Math.max(0.5, Math.min(2, Math.round(z * factor * 10) / 10)));
  }, []);

  const onZoomPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    panningRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onZoomPointerMove = useCallback((e: React.PointerEvent) => {
    if (!panningRef.current) return;
    setPan((prev) => ({
      x: prev.x + e.movementX,
      y: prev.y + e.movementY,
    }));
  }, []);

  const onZoomPointerUp = useCallback(() => {
    panningRef.current = false;
  }, []);

  return (
    <div className="ed-preview">
      {(engine === 'hyperframes' || engine === 'ffmpeg') && (
        <p className="ed-preview__warn">
          {engine === 'hyperframes'
            ? `预览为 Remotion 合成；HyperFrames 成片（${profile === 'viral' ? '爆款' : '漫剧'}）转场/音量与预览可能不一致，请以「预览渲染」后的成片验收。`
            : '预览为 Remotion 合成；FFmpeg 仅诊断拼接，不能代表成片，正式出片请用 Remotion / HyperFrames。'}
        </p>
      )}
      <div className="ed-preview__stage">
        <div
          className="ed-preview__zoom"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            cursor: panMode ? 'grab' : undefined,
          }}
          onPointerDown={panMode ? onZoomPointerDown : undefined}
          onPointerMove={panMode ? onZoomPointerMove : undefined}
          onPointerUp={panMode ? onZoomPointerUp : undefined}
          onPointerCancel={onZoomPointerUp}
        >
          <Player
            ref={attachRef}
            component={Nx9Episode as never}
            inputProps={{ timeline } as never}
            durationInFrames={durationInFrames}
            compositionWidth={timeline.width || 1080}
            compositionHeight={timeline.height || 1920}
            fps={fps}
            controls={false}
            loop={false}
            style={{ width: '100%', height: '100%' }}
            acknowledgeRemotionLicense
          />
          {selectedOverlay && (
            <CanvasOverlayHandles clip={selectedOverlay} apply={apply} />
          )}
        </div>
      </div>
      <div className="ed-preview__transport">
        <button type="button" className="ed-icon-btn" title="回到开头" onClick={() => onSeek(0)}>
          <SkipBack size={14} />
        </button>
        <button
          type="button"
          className="ed-icon-btn ed-icon-btn--primary"
          title={playing ? '暂停 (空格)' : '播放 (空格)'}
          onClick={togglePlay}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button
          type="button"
          className="ed-icon-btn"
          title="跳到结尾"
          onClick={() => onSeek(Math.max(0, timeline.durationSec - 1 / fps))}
        >
          <SkipForward size={14} />
        </button>
        <span className="ed-preview__time">
          {formatTime(playheadSec)} <i>/</i> {formatTime(timeline.durationSec)}
        </span>
        <span className="ed-preview__meta">
          {timeline.aspect} · {fps}fps
        </span>
        <span className="ed-preview__zoom-ctl">
          <button
            type="button"
            className="ed-icon-btn"
            title="缩小"
            onClick={() => zoomBy(1 / 1.25)}
          >
            <ZoomOut size={13} />
          </button>
          <button
            type="button"
            className="ed-icon-btn"
            title="重置视图"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className="ed-icon-btn"
            title="放大"
            onClick={() => zoomBy(1.25)}
          >
            <ZoomIn size={13} />
          </button>
          <button
            type="button"
            className={`ed-icon-btn ${panMode ? 'is-on' : ''}`}
            title={panMode ? '退出抓手（预览缩放/平移）' : '抓手：拖动平移预览（需先放大）'}
            onClick={() => setPanMode((v) => !v)}
          >
            <Hand size={13} />
          </button>
        </span>
      </div>
    </div>
  );
}

type OverlayPose = NonNullable<TimelineClip['overlay']>;

const clampPose = (p: OverlayPose): OverlayPose => ({
  x: Math.max(0, Math.min(100, Math.round(p.x * 10) / 10)),
  y: Math.max(0, Math.min(100, Math.round(p.y * 10) / 10)),
  scale: Math.max(0.2, Math.min(3, Math.round(p.scale * 100) / 100)),
  rotation: Math.round((p.rotation ?? 0) * 10) / 10,
});

/**
 * 画布直接操作：选中贴片（overlay）时，在预览画布叠加选框，
 * 拖动框内 = 移动（x/y%），右上旋转柄 = 旋转，右下缩放手柄 = 缩放。
 * 拖动期间本地预览，松手一次 apply（进撤销栈）；与 Remotion 成片共用 overlay 位姿字段。
 */
function CanvasOverlayHandles({
  clip,
  apply,
}: {
  clip: TimelineClip;
  apply: (ops: TimelineOp | TimelineOp[]) => unknown;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLImageElement>(null);
  const [, setTick] = useState(0);
  const [drag, setDrag] = useState<{
    kind: 'move' | 'rotate' | 'scale';
    startX: number;
    startY: number;
    startPose: OverlayPose;
  } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const [preview, setPreview] = useState<OverlayPose | null>(null);
  const previewSyncRef = useRef<OverlayPose | null>(null);
  previewSyncRef.current = preview;

  const pose = preview ?? clip.overlay ?? { x: 50, y: 50, scale: 1, rotation: 0 };
  const box = boxRef.current ? { w: boxRef.current.offsetWidth, h: boxRef.current.offsetHeight } : null;

  const stageRect = () => {
    const el = rootRef.current?.offsetParent as HTMLElement | null;
    return el?.getBoundingClientRect() ?? null;
  };

  const beginDrag = useCallback(
    (kind: 'move' | 'rotate' | 'scale') =>
      (e: React.PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const current = preview ?? clip.overlay ?? { x: 50, y: 50, scale: 1, rotation: 0 };
        setDrag({ kind, startX: e.clientX, startY: e.clientY, startPose: current });
      },
    [clip.overlay, preview],
  );

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const rect = stageRect();
      if (!rect) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const next: OverlayPose = { ...d.startPose };
      if (d.kind === 'move') {
        next.x = d.startPose.x + (dx / rect.width) * 100;
        next.y = d.startPose.y + (dy / rect.height) * 100;
      } else if (d.kind === 'scale') {
        next.scale = d.startPose.scale * (1 + dx / Math.max(1, rect.width) * 1.5);
      } else {
        const anchor = {
          x: rect.left + (d.startPose.x / 100) * rect.width,
          y: rect.top + (d.startPose.y / 100) * rect.height,
        };
        const a0 = Math.atan2(d.startY - anchor.y, d.startX - anchor.x);
        const a1 = Math.atan2(e.clientY - anchor.y, e.clientX - anchor.x);
        next.rotation = (d.startPose.rotation ?? 0) + ((a1 - a0) * 180) / Math.PI;
      }
      setPreview(clampPose(next));
    };
    const onUp = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      const finalPose = previewSyncRef.current;
      setPreview(null);
      if (finalPose) {
        apply({ op: 'set-clip', clipId: clip.id, patch: { overlay: finalPose } });
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, clip.id, apply]);

  if (!box) {
    return (
      <div ref={rootRef} className="ed-cv" aria-hidden="true">
        <img
          ref={boxRef}
          src={clip.assetUrl}
          alt=""
          draggable={false}
          onLoad={() => setTick((t) => t + 1)}
        />
      </div>
    );
  }

  const transform = `translate(-50%, -50%) scale(${pose.scale}) rotate(${pose.rotation ?? 0}deg)`;

  return (
    <div ref={rootRef} className="ed-cv">
      <img
        ref={boxRef}
        src={clip.assetUrl}
        alt=""
        draggable={false}
        onLoad={() => setTick((t) => t + 1)}
      />
      <div
        className="ed-cv__box"
        style={{
          left: `${pose.x}%`,
          top: `${pose.y}%`,
          width: box.w,
          height: box.h,
          transform,
        }}
        onPointerDown={beginDrag('move')}
        title="拖动移动（Shift 微调）"
      >
        <span className="ed-cv__tag">
          <Move size={9} /> 移动
        </span>
        <span
          className="ed-cv__handle ed-cv__handle--rotate"
          onPointerDown={beginDrag('rotate')}
          title="旋转"
        >
          <RotateCw size={11} />
        </span>
        <span
          className="ed-cv__handle ed-cv__handle--scale"
          onPointerDown={beginDrag('scale')}
          title="缩放"
        />
      </div>
    </div>
  );
}
