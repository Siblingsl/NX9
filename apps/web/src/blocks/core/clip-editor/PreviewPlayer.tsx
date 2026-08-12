import { useCallback, useEffect, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { Nx9Episode } from '@nx9/remotion-compositions';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { TimelinePayload } from '@nx9/shared';

export interface PreviewPlayerProps {
  timeline: TimelinePayload;
  playheadSec: number;
  onSeek: (sec: number) => void;
  /** 播放中由 Player 驱动播放头 */
  onFrameUpdate: (sec: number) => void;
  playerRef: React.MutableRefObject<PlayerRef | null>;
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
}: PreviewPlayerProps) {
  const fps = timeline.fps || 30;
  const durationInFrames = Math.max(1, Math.ceil((timeline.durationSec || 1) * fps));
  const [playing, setPlaying] = useState(false);
  const internalSeek = useRef(false);

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

  return (
    <div className="ed-preview">
      <div className="ed-preview__stage">
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
      </div>
    </div>
  );
}
