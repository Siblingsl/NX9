import React from 'react';
import { AbsoluteFill, OffthreadVideo, Img, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { TimelineClip } from '@nx9/shared';
import { sampleClipVolume } from '@nx9/shared';

interface VideoClipProps {
  clip: TimelineClip;
}

/**
 * 视频 / 图片片段：trim（startFrom）、变速（playbackRate）、
 * 音量、淡入淡出与 transitionOut fade（wipe/shader 暂降级为 fade）。
 */
export const VideoClip: React.FC<VideoClipProps> = ({ clip }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const durationFrames = Math.max(1, Math.round(clip.durationSec * fps));

  let opacity = 1;
  const fadeInFrames = Math.round((clip.fadeInSec ?? 0) * fps);
  if (fadeInFrames > 0) {
    opacity *= interpolate(frame, [0, fadeInFrames], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }
  const tailFadeSec =
    clip.transitionOut && clip.transitionOut.kind !== 'cut'
      ? clip.transitionOut.durationSec
      : clip.fadeOutSec ?? 0;
  const tailFadeFrames = Math.round(tailFadeSec * fps);
  if (tailFadeFrames > 0) {
    opacity *= interpolate(
      frame,
      [durationFrames - tailFadeFrames, durationFrames],
      [1, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
    );
  }

  if (clip.type === 'image' || clip.type === 'overlay') {
    const overlay = clip.overlay ?? { x: 50, y: 50, scale: 1, rotation: 0 };
    const transform = `translate(-50%, -50%) scale(${overlay.scale})${overlay.rotation ? ` rotate(${overlay.rotation}deg)` : ''}`;
    return (
      <AbsoluteFill style={{ opacity }}>
        <Img
          src={clip.assetUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            ...(clip.type === 'overlay'
              ? {
                  position: 'absolute',
                  left: `${overlay.x}%`,
                  top: `${overlay.y}%`,
                  transform,
                }
              : {}),
          }}
        />
      </AbsoluteFill>
    );
  }

  if (clip.type === 'video') {
    const volume = (f: number) => sampleClipVolume(clip, f / fps);
    return (
      <AbsoluteFill style={{ opacity }}>
        <OffthreadVideo
          src={clip.assetUrl}
          startFrom={Math.round((clip.trimInSec ?? 0) * fps)}
          playbackRate={clip.speed ?? 1}
          volume={volume}
          muted={(clip.volume ?? 1) === 0 && !(clip.volumeKeyframes?.length)}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </AbsoluteFill>
    );
  }

  return null;
};
