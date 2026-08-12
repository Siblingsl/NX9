import React from 'react';
import { AbsoluteFill, Sequence, Audio } from 'remotion';
import type { TimelineClip, TimelinePayload, TimelineTrack } from '@nx9/shared';
import { sampleClipVolume } from '@nx9/shared';
import { VideoClip } from './clips/VideoClip';
import { SubtitleClip } from './clips/SubtitleClip';

interface Nx9EpisodeProps {
  timeline: TimelinePayload;
}

/**
 * 按轨道 kind 遍历渲染（v3 时间线）。
 * 不再按固定轨道 ID（video-1 等）查找——历史三套 ID 并存会静默丢轨。
 * 渲染层序：video → overlay → subtitle；audio 无视觉层。
 */
export const Nx9Episode: React.FC<Nx9EpisodeProps> = ({ timeline }) => {
  const fps = timeline.fps || 30;
  const tracks = timeline.tracks ?? [];

  const byKind = (kind: TimelineTrack['kind']) =>
    tracks.filter((t) => t.kind === kind && !t.muted);

  const renderSequences = (
    track: TimelineTrack,
    render: (clip: TimelineClip) => React.ReactNode,
  ) =>
    track.clips.map((clip) => {
      const startFrame = Math.round(clip.startSec * fps);
      const durationFrames = Math.max(1, Math.round(clip.durationSec * fps));
      return (
        <Sequence key={clip.id} from={startFrame} durationInFrames={durationFrames}>
          {render(clip)}
        </Sequence>
      );
    });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {byKind('video').map((track) => (
        <React.Fragment key={track.id}>
          {renderSequences(track, (clip) =>
            clip.type === 'subtitle' ? <SubtitleClip clip={clip} /> : <VideoClip clip={clip} />,
          )}
        </React.Fragment>
      ))}

      {byKind('overlay').map((track) => (
        <React.Fragment key={track.id}>
          {renderSequences(track, (clip) => (
            <VideoClip clip={clip} />
          ))}
        </React.Fragment>
      ))}

      {byKind('subtitle').map((track) => (
        <React.Fragment key={track.id}>
          {renderSequences(track, (clip) => (
            <SubtitleClip clip={clip} />
          ))}
        </React.Fragment>
      ))}

      {byKind('audio').map((track) => (
        <React.Fragment key={track.id}>
          {renderSequences(track, (clip) =>
            clip.assetUrl ? <TimelineAudio clip={clip} fps={fps} /> : null,
          )}
        </React.Fragment>
      ))}
    </AbsoluteFill>
  );
};

/** 音频片段：音量 / 淡入淡出 / 关键帧包络 / trim / 变速 */
const TimelineAudio: React.FC<{ clip: TimelineClip; fps: number }> = ({ clip, fps }) => {
  const volume = (frame: number) => sampleClipVolume(clip, frame / fps);

  return (
    <Audio
      src={clip.assetUrl}
      volume={volume}
      startFrom={Math.round((clip.trimInSec ?? 0) * fps)}
      playbackRate={clip.speed ?? 1}
    />
  );
};
