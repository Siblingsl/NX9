import React from 'react';
import { AbsoluteFill, Sequence, Audio } from 'remotion';
import type { TimelinePayload } from '@nx9/shared';
import { VideoClip } from './clips/VideoClip';
import { SubtitleClip } from './clips/SubtitleClip';
import { ImageClip } from './clips/ImageClip';

interface Nx9EpisodeProps {
  timeline: TimelinePayload;
}

export const Nx9Episode: React.FC<Nx9EpisodeProps> = ({ timeline }) => {
  const fps = timeline.fps || 30;

  const videoTrack = timeline.tracks.find((t) => t.id === 'video-1');
  const overlayTrack = timeline.tracks.find((t) => t.id === 'video-2');
  const audioTrack = timeline.tracks.find((t) => t.id === 'audio-1');
  const subtitleTrack = timeline.tracks.find((t) => t.id === 'subtitle-1');

  const renderClip = (clip: TimelinePayload['tracks'][0]['clips'][0]) => {
    if (clip.type === 'subtitle') {
      return <SubtitleClip clip={clip} />;
    }
    if (clip.type === 'image') {
      return <ImageClip clip={clip} />;
    }
    return <VideoClip clip={clip} />;
  };

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* V1 视频/图片 Sequence */}
      {videoTrack?.clips.map((clip) => {
        const startFrame = Math.round(clip.startSec * fps);
        const durationFrames = Math.max(1, Math.round(clip.durationSec * fps));
        return (
          <Sequence key={clip.id} from={startFrame} durationInFrames={durationFrames}>
            {renderClip(clip)}
          </Sequence>
        );
      })}

      {/* V2 overlay（logo、lower-third 等） */}
      {overlayTrack?.clips.map((clip) => {
        const startFrame = Math.round(clip.startSec * fps);
        const durationFrames = Math.max(1, Math.round(clip.durationSec * fps));
        return (
          <Sequence key={clip.id} from={startFrame} durationInFrames={durationFrames}>
            <VideoClip clip={clip} />
          </Sequence>
        );
      })}

      {/* S1 字幕 */}
      {subtitleTrack?.clips.map((clip) => {
        const startFrame = Math.round(clip.startSec * fps);
        const durationFrames = Math.max(1, Math.round(clip.durationSec * fps));
        return (
          <Sequence key={clip.id} from={startFrame} durationInFrames={durationFrames}>
            <SubtitleClip clip={clip} />
          </Sequence>
        );
      })}

      {/* A1 音频 */}
      {audioTrack?.clips.map((clip) => {
        const startFrame = Math.round(clip.startSec * fps);
        const durationFrames = Math.max(1, Math.round(clip.durationSec * fps));
        return (
          <Sequence key={clip.id} from={startFrame} durationInFrames={durationFrames}>
            <AbsoluteFill>
              <Audio src={clip.assetUrl} />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
