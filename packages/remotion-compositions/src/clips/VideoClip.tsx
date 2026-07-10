import React from 'react';
import { AbsoluteFill, OffthreadVideo, Img, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { TimelineClip } from '@nx9/shared';

interface VideoClipProps {
  clip: TimelineClip;
}

export const VideoClip: React.FC<VideoClipProps> = ({ clip }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (clip.type === 'image') {
    return (
      <AbsoluteFill>
        <Img
          src={clip.assetUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
        />
      </AbsoluteFill>
    );
  }

  if (clip.type === 'video') {
    const trimInFrames = (clip.trimInSec ?? 0) * fps;
    return (
      <AbsoluteFill>
        <OffthreadVideo
          src={clip.assetUrl}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </AbsoluteFill>
    );
  }

  return null;
};
